import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import { updateProgress, resetProgress } from "./sync-progress";

const API_BASE_URL = "https://api.gatcg.com";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if force full sync is requested
  const forceFullSync = req.body?.forceFullSync === true;

  // Helper function to map rarity numbers to names
  const mapRarityNumber = (rarityNum: number): string => {
    const rarityMap: Record<number, string> = {
      1: "C",      // Common
      2: "U",      // Uncommon
      3: "R",      // Rare
      4: "SR",     // Super Rare
      5: "UR",     // Ultra Rare
      6: "ScR",    // Secret Rare
      7: "CSR",    // Collector's Super Rare
      9: "P",      // Promo
    };
    return rarityMap[rarityNum] || "UNKNOWN";
  };

  console.log("=== SYNC STARTED (SEPARATE EDITIONS MODE) ===");
  
  // Create sync history record
  const { data: syncRecord, error: syncCreateError } = await supabase
    .from("sync_history")
    .insert({
      started_at: new Date().toISOString(),
      status: "running",
    })
    .select()
    .single();

  if (syncCreateError) {
    console.error("Failed to create sync record:", syncCreateError);
  }

  const syncId = syncRecord?.id;

  // Reset progress tracking
  resetProgress();
  updateProgress({ isRunning: true, message: "Starting sync..." });
  
  try {
    // Check if we should do incremental sync
    let shouldDoIncrementalSync = false;
    let existingSetCodes: string[] = [];

    if (!forceFullSync) {
      const { count: cardCount } = await supabase
        .from("cards")
        .select("*", { count: "exact", head: true });

      // If we have cards already, do incremental sync
      if (cardCount && cardCount > 100) {
        shouldDoIncrementalSync = true;
        
        const { data: existingSets } = await supabase
          .from("sets")
          .select("code");
        
        existingSetCodes = existingSets?.map(s => s.code) || [];
        console.log(`Incremental sync mode: ${existingSetCodes.length} sets already in database`);
        updateProgress({ message: `Incremental sync: checking for new sets (${existingSetCodes.length} existing)` });
      }
    }

    let allCardsData: any[] = [];
    let hasMore = true;
    let page = 1;
    const pageSize = 100;

    // Estimate total pages (API typically has ~40-60 pages)
    updateProgress({ totalPages: 60, message: "Fetching cards from API..." });

    // Fetch all cards using pagination with separate_editions=true
    while (hasMore) {
      const url = `${API_BASE_URL}/cards/search?separate_editions=true&page=${page}&limit=${pageSize}&sort=collector_number`;
      
      console.log(`Fetching page ${page}...`);
      updateProgress({ 
        currentPage: page, 
        message: `Fetching page ${page}...` 
      });
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API request failed with status ${response.status}:`, errorText);
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const cards = data.data || [];
      
      allCardsData = allCardsData.concat(cards);
      console.log(`  ✓ Page ${page}: ${cards.length} cards (total: ${allCardsData.length})`);
      updateProgress({ 
        processedCards: allCardsData.length,
        message: `Fetched ${allCardsData.length} cards from ${page} pages` 
      });
      
      hasMore = data.has_more || false;
      
      // Update total pages estimate based on actual pagination
      if (hasMore && page === 1) {
        const estimatedTotal = Math.ceil((data.total_cards || 5000) / pageSize);
        updateProgress({ totalPages: estimatedTotal });
      }
      
      page++;
      
      // Small delay to respect API rate limits
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`\n[STEP 1 COMPLETE] Fetched ${allCardsData.length} card editions from ${page - 1} pages`);
    updateProgress({ 
      message: `Processing ${allCardsData.length} cards...`,
      totalPages: page - 1 
    });

    console.log(`\n[STEP 2] Processing ${allCardsData.length} card objects...`);
    
    // Extract unique sets - with separate_editions=true, set info is INSIDE editions array
    const uniqueSets = new Map<string, any>();
    allCardsData.forEach((card: any) => {
      // Loop through editions array to find all sets
      const editions = card.result_editions || card.editions || [];
      editions.forEach((edition: any) => {
        if (edition?.set) {
          const setCode = edition.set.id;
          if (!uniqueSets.has(setCode)) {
            uniqueSets.set(setCode, {
              code: setCode,
              name: edition.set.name,
              release_date: edition.set.release_date || null,
            });
          }
        }
      });
    });

    console.log(`  Found ${uniqueSets.size} unique sets in API`);

    // Check for new sets (if incremental sync)
    let newSetCodes: string[] = [];
    if (shouldDoIncrementalSync) {
      const allSetCodes = Array.from(uniqueSets.keys());
      newSetCodes = allSetCodes.filter(code => !existingSetCodes.includes(code));
      
      if (newSetCodes.length === 0) {
        console.log("  ✓ No new sets found - database is up to date!");
        updateProgress({ 
          isRunning: false,
          message: "Database is up to date - no new sets to sync" 
        });

        // Update sync history
        if (syncId) {
          await supabase
            .from("sync_history")
            .update({
              completed_at: new Date().toISOString(),
              status: "completed",
              total_cards_processed: 0,
              total_sets_processed: 0,
              pages_fetched: page - 1,
            })
            .eq("id", syncId);
        }

        return res.status(200).json({
          success: true,
          message: "Database is up to date",
          totalCards: allCardsData.length,
          processedInBatch: 0,
          newSets: 0,
          setsProcessed: 0,
          pagesProcessed: page - 1,
        });
      }

      console.log(`  Found ${newSetCodes.length} NEW sets to sync:`, newSetCodes);
      updateProgress({ message: `Found ${newSetCodes.length} new sets to sync` });
    }

    // Insert/update sets
    if (uniqueSets.size > 0) {
      const setsArray = Array.from(uniqueSets.values());
      console.log(`  Upserting ${setsArray.length} sets...`);
      updateProgress({ message: `Upserting ${setsArray.length} sets...` });
      
      const { data: insertedSets, error: setsError } = await supabase
        .from("sets")
        .upsert(setsArray, { onConflict: "code" })
        .select("id, code");

      if (setsError) {
        console.error("  ❌ Error upserting sets:", setsError);
        throw new Error(`Failed to upsert sets: ${setsError.message}`);
      }

      console.log(`  ✓ Upserted ${insertedSets?.length || 0} sets`);
    }

    // Fetch set IDs
    const { data: allSets, error: fetchSetsError } = await supabase
      .from("sets")
      .select("id, code");

    if (fetchSetsError) {
      throw new Error(`Failed to fetch sets: ${fetchSetsError.message}`);
    }

    const setCodeToId = new Map<string, string>();
    allSets?.forEach(set => {
      setCodeToId.set(set.code, set.id);
    });

    console.log(`  Mapped ${setCodeToId.size} set codes to IDs`);

    // Process cards - with separate_editions=true, each card object has ALL its editions in the editions[] array
    updateProgress({ message: "Processing card data..." });
    const cardsToInsert: any[] = [];
    
    allCardsData.forEach((card: any) => {
      // Get all editions for this card (result_editions and editions are the same)
      const editions = card.result_editions || card.editions || [];
      
      // Loop through EACH edition and create a separate database entry
      editions.forEach((edition: any) => {
        const setCode = edition.set?.id;
        const setId = setCode ? setCodeToId.get(setCode) : null;

        if (!setId) {
          console.warn(`  ⚠️ No set_id found for: ${card.name} (${setCode})`);
          return;
        }

        // If incremental sync, only process cards from new sets
        if (shouldDoIncrementalSync && !newSetCodes.includes(setCode)) {
          return;
        }

        const imageUrl = edition.image ? `https://api.gatcg.com${edition.image}` : null;
        const effect = edition.effect_raw || edition.effect || card.effect_raw || card.effect || null;

        const types = card.types || [];
        const subtypes = card.subtypes || [];
        let typeString = '';
        if (types.length > 0) typeString += types.join(' ').toUpperCase();
        if (subtypes.length > 0) {
          if (typeString) typeString += ' — ';
          typeString += subtypes.join(' ').toUpperCase();
        }

        cardsToInsert.push({
          set_id: setId,
          name: card.name || "Unknown",
          card_number: edition.collector_number || "UNKNOWN",
          element: card.element || null,
          card_type: typeString || "Unknown",
          class: Array.isArray(card.classes) && card.classes.length > 0 
            ? card.classes.join(", ") 
            : null,
          rarity: typeof edition.rarity === 'number' 
            ? mapRarityNumber(edition.rarity)
            : "UNKNOWN",
          cost: card.cost_reserve !== null && card.cost_reserve !== undefined 
            ? card.cost_reserve 
            : (card.cost_memory || 0),
          power: card.stats?.ATK !== undefined ? card.stats.ATK : null,
          life: card.stats?.HP !== undefined ? card.stats.HP : null,
          speed: card.speed !== null && card.speed !== undefined ? card.speed : null,
          effect_text: effect,
          flavor_text: edition.flavor || card.flavor || null,
          image_url: imageUrl,
          illustrator: edition.illustrator || null,
        });
      });
    });

    console.log(`  Prepared ${cardsToInsert.length} card printings`);
    updateProgress({ message: `Inserting ${cardsToInsert.length} cards into database...` });

    let insertedCount = 0;

    if (cardsToInsert.length > 0) {
      // Deduplicate - use (set_id, card_number, rarity, image_url) to allow extended art variants
      // Extended art cards have same set/number/rarity but different images
      const uniqueCards = new Map<string, any>();
      cardsToInsert.forEach(card => {
        const key = `${card.set_id}_${card.card_number}_${card.rarity}_${card.image_url || 'no-image'}`;
        if (!uniqueCards.has(key)) {
          uniqueCards.set(key, card);
        }
      });
      
      const deduplicatedCards = Array.from(uniqueCards.values());

      const { error: cardsError } = await supabase
        .from("cards")
        .upsert(deduplicatedCards, { onConflict: "set_id,card_number,rarity,image_url" });

      if (cardsError) {
        console.error("Error inserting cards:", cardsError);
        throw cardsError;
      }

      insertedCount = deduplicatedCards.length;
    }

    console.log(`\n✅ SYNC COMPLETE:`);
    console.log(`   - Pages: ${page - 1}`);
    console.log(`   - Cards synced: ${insertedCount}`);
    console.log(`   - Sets: ${shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size}`);

    // Fetch restricted cards separately (legality data not available with separate_editions=true)
    console.log(`\n[STEP 3] Fetching restricted cards...`);
    updateProgress({ message: "Updating restricted card status..." });
    
    try {
      const restrictedUrl = `${API_BASE_URL}/cards/search?legality_format=STANDARD&legality_state=RESTRICTED&limit=1000`;
      const restrictedResponse = await fetch(restrictedUrl);
      
      const restrictedNames: string[] = [];
      
      if (restrictedResponse.ok) {
        const restrictedData = await restrictedResponse.json();
        const restrictedCards = restrictedData.data || [];
        
        console.log(`  Found ${restrictedCards.length} restricted cards from API`);
        restrictedNames.push(...restrictedCards.map((card: any) => card.name));
      } else {
        console.warn("  ⚠️ Failed to fetch restricted cards from API (non-critical)");
      }

      // Add known restricted cards that the API doesn't return or to supplement the API list
      const knownRestrictedCards = [
        // Cards returned by the API
        "Amorphous Missile",
        "Animal Encounter",
        "Beckon Attention",
        "Bellona's Runestone",
        "Cheap Sword",
        "Cheerful Slime",
        "Clandestine Chart",
        "Cowl of the Wild",
        "Crowd's Favor",
        "Duxal Proclamation",
        "Etherealys' Promise",
        "Fauna Friend",
        "Greater Boon of Astraeus",
        "Greater Boon of Detachment",
        "Greater Boon of Dux",
        "Nameless Champion",
        // Additional known restricted cards (from index.gatcg.com)
        "Arisanna, Gloriana's Blade",
        "Baby Green Slime",
        "Blazing Throw",
        "Blazing Vortex",
        "Brutal Cleave",
        "Brutal Reprisal",
        "Cerulean Decree",
        "Crux Sight",
        "Dark Halo",
        "Decimating Tendrils",
        "Destructive Shockwave",
        "Drastic Measure",
        "Dreaming Seraph",
        "Erupting Flare Shot",
        "Fracturize",
        "Frosted Summit",
        "Gleaming Thrust",
        "Grand Archive",
        "Heinous Smash",
        "Ignite the Soul",
        "Kol, Reborn of Adamant",
        "Savage Swing",
        "Seance",
        "Second Chance",
        "Slash the Limbs",
        "Slicing Gale",
        "Sudden Steel",
        "Surprise Maneuver",
        "Umbral Sight",
        "Violent Flare Shot",
      ];
      
      knownRestrictedCards.forEach(name => {
        if (!restrictedNames.includes(name)) {
          restrictedNames.push(name);
          console.log(`  + Added manually: ${name}`);
        }
      });
      
      console.log(`  Total restricted cards to mark: ${restrictedNames.length}`);
      
      if (restrictedNames.length > 0) {
        // Update all cards with matching names to set is_restricted = true
        const { error: updateError } = await supabase
          .from("cards")
          .update({ is_restricted: true })
          .in("name", restrictedNames);
        
        if (updateError) {
          console.error("  ⚠️ Error updating restricted status:", updateError);
        } else {
          console.log(`  ✓ Updated ${restrictedNames.length} card names as restricted`);
        }
      }
    } catch (restrictedError) {
      console.warn("  ⚠️ Error fetching restricted cards (non-critical):", restrictedError);
    }

    updateProgress({ 
      isRunning: false,
      message: `Sync complete! Processed ${insertedCount} cards from ${shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size} sets`
    });

    // Update sync history
    if (syncId) {
      await supabase
        .from("sync_history")
        .update({
          completed_at: new Date().toISOString(),
          status: "completed",
          total_cards_processed: insertedCount,
          total_sets_processed: shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size,
          pages_fetched: page - 1,
        })
        .eq("id", syncId);
    }

    return res.status(200).json({
      success: true,
      totalCards: allCardsData.length,
      processedInBatch: insertedCount,
      newSets: shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size,
      setsProcessed: uniqueSets.size,
      pagesProcessed: page - 1,
      incrementalSync: shouldDoIncrementalSync,
    });
  } catch (error) {
    console.error("Sync error:", error);
    
    updateProgress({ 
      isRunning: false,
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Sync failed"
    });

    // Update sync history with error
    if (syncId) {
      await supabase
        .from("sync_history")
        .update({
          completed_at: new Date().toISOString(),
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", syncId);
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}