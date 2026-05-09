import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = "https://api.gatcg.com";

// All known Grand Archive set prefixes (from https://api.gatcg.com)
const SET_PREFIXES = [
  "ReC-AUR", "RDOP", "RDOA", "RDOPD", "RDO+1st", "RDOEVP", "RDO",
  "PP1", "AMB+Alter", "ReC-BRV", "PTMLGS", "PTM+1st", "PTMEVP", "PTM",
  "DTRSD", "DTR+1st", "DTR", "SP3", "MRC+Alter", "ReC-IDY", "ReC-HVF",
  "HVN+1st", "HVN", "P25", "ALC+Alter", "AMBDP", "AMBSD", "AMB+1st", "AMB",
  "SP2", "ReC-SLM", "ReC-SHD", "MRC+1st", "MRC", "SLC", "ALCSD",
  "ALC+1st", "ALC", "P24", "FTCA", "FTC", "DEMO23", "P23", "SP1",
  "DOASD", "DOA+Alter", "PRXY", "EVP", "GSC", "KSP", "DOAp",
  "DOA+1st", "P22", "DEMO22", "P26"
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

  console.log("=== SYNC STARTED (PREFIX-BASED) ===");
  
  try {
    // Build URL with ALL set prefixes to get complete card data
    const prefixParams = SET_PREFIXES.map(p => `prefix=${encodeURIComponent(p)}`).join("&");
    const url = `${API_BASE_URL}/cards/search?${prefixParams}&limit=10000`;
    
    console.log(`Fetching all cards with ${SET_PREFIXES.length} set prefixes...`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✓ Received ${data.data?.length || 0} cards from API`);

    console.log(`\n[STEP 2] Processing ${data.data.length} cards...`);
    
    // Extract unique sets from ALL editions
    const uniqueSets = new Map<string, any>();
    data.data.forEach((card: any) => {
      card.editions?.forEach((edition: any) => {
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

    console.log(`  Found ${uniqueSets.size} unique sets in this batch`);

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

    // Step 2c: Process cards with set_id references - handle ALL editions
    const cardsToInsert: any[] = [];
    
    data.data.forEach((card: any) => {
      // Process EACH edition as a separate database entry
      card.editions?.forEach((edition: any) => {
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

        // Create a card entry for this specific edition/printing
        cardsToInsert.push({
          set_id: setId,
          name: card.name || "Unknown",
          card_number: edition.collector_number || "UNKNOWN",
          element: card.element || null,
          card_type: Array.isArray(card.types) && card.types.length > 0 
            ? card.types.join(", ") 
            : "Unknown",
          class: Array.isArray(card.classes) && card.classes.length > 0 
            ? card.classes.join(", ") 
            : null,
          rarity: typeof edition.rarity === 'number' 
            ? mapRarityNumber(edition.rarity)
            : "UNKNOWN",
          cost: card.cost?.memory !== undefined ? card.cost.memory : null,
          power: card.stats?.ATK !== undefined ? card.stats.ATK : null,
          life: card.stats?.HP !== undefined ? card.stats.HP : null,
          effect_text: card.effect || null,
          flavor_text: card.flavor || null,
          image_url: imageUrl,
          illustrator: edition.illustrator || null,
        });
      });
    });

    console.log(`  Prepared ${cardsToInsert.length} card printings for insertion`);

    console.log(`Inserting ${cardsToInsert.length} cards...`);
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

    console.log(`✅ Sync complete: ${insertedCount} cards inserted/updated, ${errorCount} errors`);

    return res.status(200).json({
      success: true,
      totalCards: data.total_cards,
      processedInBatch: insertedCount,
      errors: errorCount,
      setsProcessed: uniqueSets.size,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}