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

  console.log("=== SYNC STARTED ===");
  const { page = 1, limit = 100 } = req.body || {};
  
  try {
    // Fetch ONE page of cards at a time to avoid timeouts
    console.log(`Fetching page ${page}...`);
    const url = `${API_BASE_URL}/cards/search?page=${page}&limit=${limit}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✓ Page ${page}: Received ${data.data?.length || 0} cards`);

    console.log(`\n[STEP 2] Processing ${data.data.length} cards from page ${page}...`);
    
    // Extract unique sets from this batch
    const uniqueSets = new Map<string, any>();
    data.data.forEach((card: any) => {
      const edition = card.editions?.[0];
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

    // Step 2c: Process cards with set_id references
    const cardsToInsert = data.data.map((card: any) => {
      const firstEdition = card.editions?.[0];
      if (!firstEdition) return null;

      const setCode = firstEdition.set?.id;
      const setId = setCode ? setCodeToId.get(setCode) : null;

      if (!setId) {
        console.warn(`  ⚠️ No set_id found for card: ${card.name} (set code: ${setCode})`);
        return null;
      }

      // Build full image URL
      const imageUrl = firstEdition.image
        ? `https://api.gatcg.com${firstEdition.image}`
        : null;

      return {
        set_id: setId,
        name: card.name,
        card_number: firstEdition.collector_number || "UNKNOWN",
        element: card.element || null,
        card_type: card.type || "Unknown",
        class: card.class || null,
        rarity: firstEdition.rarity || "UNKNOWN",
        cost: card.cost?.memory !== undefined ? card.cost.memory : null,
        power: card.stats?.ATK !== undefined ? card.stats.ATK : null,
        life: card.stats?.HP !== undefined ? card.stats.HP : null,
        effect_text: card.effect?.description || null,
        flavor_text: card.flavor_text || null,
        image_url: imageUrl,
        illustrator: firstEdition.artist || null,
      };
    }).filter(Boolean); // Remove null entries

    console.log(`  Prepared ${cardsToInsert.length} cards for insertion`);

    console.log(`Inserting ${cardsToInsert.length} cards...`);
    let insertedCount = 0;
    let errorCount = 0;

    if (cardsToInsert.length > 0) {
      const { error: cardsError } = await supabase
        .from("cards")
        .upsert(cardsToInsert);

      if (cardsError) {
        console.error("Error inserting cards:", cardsError);
        errorCount = cardsToInsert.length;
      } else {
        insertedCount = cardsToInsert.length;
      }
    }

    console.log(`✅ Page ${page} complete: ${insertedCount} cards inserted, ${errorCount} errors`);

    return res.status(200).json({
      success: true,
      page: data.page,
      totalPages: data.total_pages,
      totalCards: data.total_cards,
      hasMore: data.has_more,
      processedInBatch: insertedCount,
      errors: errorCount,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}