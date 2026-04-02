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

    // Extract unique sets from this batch
    const setsMap = new Map<string, any>();
    
    for (const card of data.data || []) {
      if (card.editions && Array.isArray(card.editions)) {
        for (const edition of card.editions) {
          if (edition.set) {
            const setData = edition.set;
            if (!setsMap.has(setData.slug)) {
              setsMap.set(setData.slug, {
                slug: setData.slug,
                name: setData.name,
                release_date: setData.release_date || null,
              });
            }
          }
        }
      }
    }

    // Insert sets
    console.log(`Inserting ${setsMap.size} sets...`);
    const setsToInsert = Array.from(setsMap.values());
    
    if (setsToInsert.length > 0) {
      const { error: setsError } = await supabase
        .from("sets")
        .upsert(setsToInsert, { onConflict: "slug" });

      if (setsError) {
        console.error("Error inserting sets:", setsError);
      }
    }

    // Process and insert cards from this batch
    const cardsToInsert: any[] = [];

    for (const card of data.data || []) {
      const firstEdition = card.editions?.[0];
      if (!firstEdition) continue;

      const imageUrl = firstEdition.image
        ? `https://api.gatcg.com${firstEdition.image}`
        : null;

      cardsToInsert.push({
        slug: card.slug,
        name: card.name,
        card_number: firstEdition.collector_number || null,
        type: firstEdition.card_type || "Unknown",
        class: firstEdition.card_class?.[0] || null,
        rarity: firstEdition.rarity || "Common",
        effect_text: firstEdition.effect_text || "",
        flavor_text: firstEdition.flavor_text || null,
        image_url: imageUrl,
        set_id: firstEdition.set?.slug || null,
        cost: firstEdition.cost || null,
        power: firstEdition.power || null,
        defense: firstEdition.defense || null,
        life: firstEdition.life || null,
      });
    }

    console.log(`Inserting ${cardsToInsert.length} cards...`);
    let insertedCount = 0;
    let errorCount = 0;

    if (cardsToInsert.length > 0) {
      const { error: cardsError } = await supabase
        .from("cards")
        .upsert(cardsToInsert, { onConflict: "slug" });

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