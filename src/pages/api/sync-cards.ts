import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = "https://api.gatcg.com";

// Rarity mapping from numeric to string values
const RARITY_MAP: Record<number, string> = {
  1: "common",
  2: "uncommon",
  3: "rare",
  4: "super_rare",
  5: "ultra_rare",
  9: "champion_rare",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("=== SYNC STARTED ===");
  console.log("Timestamp:", new Date().toISOString());

  try {
    // Step 1: Fetch all cards from API
    console.log("\n[STEP 1] Fetching cards from Grand Archive API...");
    const allCards: any[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      console.log(`  Fetching page ${page}...`);
      const url = `${API_BASE_URL}/cards/search?page=${page}&limit=100`;
      console.log(`  URL: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`  ❌ API request failed with status ${response.status}`);
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`  ✓ Page ${page}: Received ${data.data?.length || 0} cards`);
      console.log(`  API Response metadata:`, {
        hasNext: data.hasNext,
        page: data.page,
        total: data.total,
        totalPages: data.totalPages,
        dataLength: data.data?.length
      });
      
      allCards.push(...(data.data || []));
      hasNext = data.hasNext || false;
      console.log(`  Will continue? hasNext=${hasNext}`);
      page++;
    }

    console.log(`\n[STEP 1 COMPLETE] Total cards fetched: ${allCards.length}`);

    if (allCards.length === 0) {
      console.error("❌ No cards fetched from API!");
      return res.status(500).json({ 
        error: "No cards fetched from API",
        totalCards: 0,
        totalSets: 0
      });
    }

    // Step 2: Extract unique sets
    console.log("\n[STEP 2] Extracting unique sets from cards...");
    const uniqueSets = new Map<string, { code: string; name: string }>();

    allCards.forEach((card, index) => {
      if (card.editions && card.editions.length > 0) {
        const edition = card.editions[0];
        if (edition.set && edition.set.prefix) {
          const setCode = edition.set.prefix;
          const setName = edition.set.name || setCode;
          
          if (!uniqueSets.has(setCode)) {
            uniqueSets.set(setCode, { code: setCode, name: setName });
            console.log(`  Found new set: ${setCode} - ${setName}`);
          }
        } else {
          console.log(`  ⚠️ Card ${index} "${card.name}" has edition but no set.prefix`);
        }
      } else {
        console.log(`  ⚠️ Card ${index} "${card.name}" has no editions`);
      }
    });

    console.log(`\n[STEP 2 COMPLETE] Found ${uniqueSets.size} unique sets`);

    // Step 3: Insert/update sets
    console.log("\n[STEP 3] Inserting sets into database...");
    const setIdMap = new Map<string, string>();

    for (const [setCode, setData] of uniqueSets.entries()) {
      console.log(`  Upserting set: ${setCode} - ${setData.name}`);
      
      const { data: setResult, error: setError } = await supabase
        .from("sets")
        .upsert(
          {
            code: setData.code,
            name: setData.name,
          },
          { onConflict: "code" }
        )
        .select("id, code")
        .single();

      if (setError) {
        console.error(`  ❌ Error upserting set ${setCode}:`, setError);
        throw new Error(`Failed to upsert set ${setCode}: ${setError.message}`);
      }

      if (setResult) {
        setIdMap.set(setCode, setResult.id);
        console.log(`  ✓ Set ${setCode} saved with ID: ${setResult.id}`);
      } else {
        console.error(`  ❌ No result returned for set ${setCode}`);
      }
    }

    console.log(`\n[STEP 3 COMPLETE] ${setIdMap.size} sets saved to database`);

    // Step 4: Insert cards
    console.log("\n[STEP 4] Inserting cards into database...");
    let successCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    for (let i = 0; i < allCards.length; i++) {
      const card = allCards[i];
      
      try {
        // Get first edition
        const firstEdition = card.editions?.[0];
        if (!firstEdition || !firstEdition.set) {
          console.log(`  ⚠️ Card ${i + 1}/${allCards.length}: "${card.name}" - No edition/set, skipping`);
          errorCount++;
          continue;
        }

        const setCode = firstEdition.set.prefix;
        const setId = setIdMap.get(setCode);

        if (!setId) {
          console.error(`  ❌ Card ${i + 1}/${allCards.length}: "${card.name}" - Set ${setCode} not found in map`);
          errorCount++;
          errors.push({ card: card.name, reason: `Set ${setCode} not in map` });
          continue;
        }

        // Map rarity
        const rarityNum = firstEdition.rarity || 1;
        const rarity = RARITY_MAP[rarityNum] || "common";

        // Build full image URL
        const imageUrl = firstEdition.image
          ? `https://api.gatcg.com${firstEdition.image}`
          : null;

        // Get card data
        const cardClass = card.classes?.[0] || null;
        const cardType = card.types?.[0] || "Unknown";

        const cardData = {
          name: card.name,
          set_id: setId,
          card_number: firstEdition.collector_number || "0",
          rarity: rarity,
          card_type: cardType,
          class: cardClass,
          element: null,
          cost: card.cost_memory || 0,
          power: card.power || null,
          life: card.life || null,
          effect_text: card.effect || card.effect_raw || "",
          flavor_text: card.flavor || null,
          image_url: imageUrl,
          illustrator: firstEdition.illustrator || null,
        };

        if ((i + 1) % 10 === 0) {
          console.log(`  Progress: ${i + 1}/${allCards.length} cards processed...`);
        }

        const { error: cardError } = await supabase
          .from("cards")
          .upsert(cardData, {
            onConflict: "set_id,card_number",
          });

        if (cardError) {
          console.error(`  ❌ Card ${i + 1}: "${card.name}" - Error:`, cardError.message);
          errorCount++;
          errors.push({ card: card.name, error: cardError.message });
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`  ❌ Card ${i + 1}: "${card.name}" - Exception:`, err);
        errorCount++;
        errors.push({ 
          card: card.name, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    console.log(`\n[STEP 4 COMPLETE] Cards inserted: ${successCount} successful, ${errorCount} errors`);
    
    if (errors.length > 0) {
      console.log("\n=== FIRST 10 ERRORS ===");
      errors.slice(0, 10).forEach((err, idx) => {
        console.log(`${idx + 1}. Card: ${err.card}`);
        console.log(`   Error: ${err.error || err.reason}`);
      });
    }

    console.log("\n=== SYNC COMPLETED ===");
    console.log(`Total cards: ${successCount}`);
    console.log(`Total sets: ${setIdMap.size}`);
    console.log(`Errors: ${errorCount}`);

    return res.status(200).json({
      success: true,
      totalCards: successCount,
      totalSets: setIdMap.size,
      errors: errorCount,
      errorDetails: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("\n=== SYNC FAILED WITH EXCEPTION ===");
    console.error("Error:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "No stack trace");
    
    return res.status(500).json({
      error: "Failed to sync cards",
      details: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}