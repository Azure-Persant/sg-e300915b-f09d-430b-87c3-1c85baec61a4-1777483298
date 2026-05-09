import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = "https://api.gatcg.com";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Helper function to map rarity numbers to names (from Python script)
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
  
  try {
    let allCardsData: any[] = [];
    let hasMore = true;
    let page = 1;
    const pageSize = 100;

    // Fetch all cards using pagination with separate_editions=true
    // This returns ALL variants including extended art (-ext) and multiple rarities per set
    while (hasMore) {
      const url = `${API_BASE_URL}/cards/search?separate_editions=true&page=${page}&limit=${pageSize}&sort=collector_number`;
      
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API request failed with status ${response.status}:`, errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      const cards = data.data || [];
      
      allCardsData = allCardsData.concat(cards);
      console.log(`  ✓ Page ${page}: ${cards.length} cards`);
      
      hasMore = data.has_more || false;
      page++;
      
      // Small delay to respect API rate limits
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n[STEP 1 COMPLETE] Fetched ${allCardsData.length} card editions from ${page - 1} pages`);

    console.log(`\n[STEP 2] Processing ${allCardsData.length} card editions...`);
    
    // Extract unique sets from ALL editions (using result_editions or editions)
    const uniqueSets = new Map<string, any>();
    allCardsData.forEach((card: any) => {
      // Get editions array (API uses result_editions when separate_editions=true)
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

    console.log(`  Found ${uniqueSets.size} unique sets`);

    // Step 2a: Insert sets first (upsert to avoid duplicates)
    if (uniqueSets.size > 0) {
      const setsArray = Array.from(uniqueSets.values());
      console.log(`  Upserting ${setsArray.length} sets...`);
      
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

    // Step 2b: Fetch set IDs for card insertion
    const { data: allSets, error: fetchSetsError } = await supabase
      .from("sets")
      .select("id, code");

    if (fetchSetsError) {
      console.error("  ❌ Error fetching sets:", fetchSetsError);
      throw new Error(`Failed to fetch sets: ${fetchSetsError.message}`);
    }

    // Create a map of set code to set ID
    const setCodeToId = new Map<string, string>();
    allSets?.forEach(set => {
      setCodeToId.set(set.code, set.id);
    });

    console.log(`  Mapped ${setCodeToId.size} set codes to IDs`);

    // Step 2c: Process cards - when separate_editions=true, each card IS a specific edition
    const cardsToInsert: any[] = [];
    
    allCardsData.forEach((card: any) => {
      // When separate_editions=true, result_editions contains THIS card's edition info
      const editions = card.result_editions || card.editions || [];
      
      // Usually there's just 1 edition per card when separate_editions=true
      const edition = editions[0];
      if (!edition) return;

      const setCode = edition.set?.id;
      const setId = setCode ? setCodeToId.get(setCode) : null;

      if (!setId) {
        console.warn(`  ⚠️ No set_id found for card: ${card.name} (set code: ${setCode})`);
        return;
      }

      // Build full image URL
      const imageUrl = edition.image
        ? `https://api.gatcg.com${edition.image}`
        : null;

      // Extract effect from edition or card level
      const effect = edition.effect_raw || edition.effect || card.effect || null;

      // Build Type string: "TYPES — SUBTYPES" (matching Python script format)
      const types = card.types || [];
      const subtypes = card.subtypes || [];
      let typeString = '';
      if (types.length > 0) {
        typeString += types.join(' ').toUpperCase();
      }
      if (subtypes.length > 0) {
        if (typeString) typeString += ' — ';
        typeString += subtypes.join(' ').toUpperCase();
      }

      // Create a card entry for this specific edition/printing
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
        effect_text: effect,
        flavor_text: card.flavor || null,
        image_url: imageUrl,
        illustrator: edition.illustrator || null,
      });
    });

    console.log(`  Prepared ${cardsToInsert.length} card printings for insertion`);

    console.log(`\n[STEP 3] Inserting ${cardsToInsert.length} cards...`);
    let insertedCount = 0;
    let errorCount = 0;

    if (cardsToInsert.length > 0) {
      // Deduplicate based on set_id + card_number to avoid "cannot affect row a second time" error
      const uniqueCards = new Map<string, any>();
      cardsToInsert.forEach(card => {
        const key = `${card.set_id}_${card.card_number}`;
        if (!uniqueCards.has(key)) {
          uniqueCards.set(key, card);
        }
      });
      
      const deduplicatedCards = Array.from(uniqueCards.values());
      console.log(`  Deduplicated ${cardsToInsert.length} → ${deduplicatedCards.length} cards`);

      const { error: cardsError } = await supabase
        .from("cards")
        .upsert(deduplicatedCards, { onConflict: "set_id,card_number" });

      if (cardsError) {
        console.error("Error inserting cards:", cardsError);
        console.error("Error details:", {
          message: cardsError.message,
          code: cardsError.code,
          details: cardsError.details,
          hint: cardsError.hint,
        });
        errorCount = deduplicatedCards.length;
      } else {
        insertedCount = deduplicatedCards.length;
      }
    }

    console.log(`\n✅ SYNC COMPLETE:`);
    console.log(`   - Pages fetched: ${page - 1}`);
    console.log(`   - Total editions fetched: ${allCardsData.length}`);
    console.log(`   - Cards inserted/updated: ${insertedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Sets processed: ${uniqueSets.size}`);

    return res.status(200).json({
      success: true,
      totalCards: allCardsData.length,
      processedInBatch: insertedCount,
      errors: errorCount,
      setsProcessed: uniqueSets.size,
      pagesProcessed: page - 1,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}