import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

// Map numeric rarity values to string names
const RARITY_MAP: Record<number, string> = {
  1: "common",
  2: "uncommon",
  3: "rare",
  4: "super_rare",
  5: "ultra_rare",
  9: "champion_rare",
};

interface GATCGEdition {
  set: {
    prefix: string;
    name: string;
  };
  collector_number: string;
  illustrator: string;
  image: string;
  rarity: number;
}

interface GATCGCard {
  name: string;
  slug: string;
  classes: string[];
  types: string[];
  cost_memory: number | null;
  cost_reserve: number | null;
  power: number | null;
  life: number | null;
  durability: number | null;
  effect: string | null;
  effect_raw: string | null;
  flavor: string | null;
  editions: GATCGEdition[];
}

interface APIResponse {
  data: GATCGCard[];
  dataCount: number;
  totalCount: number;
  hasNext: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Starting card sync from Grand Archive API...");
    
    // Step 1: Fetch all cards from API with pagination
    const allCards: GATCGCard[] = [];
    let page = 1;
    let hasNext = true;
    const limit = 100;

    while (hasNext && page <= 50) {
      console.log(`Fetching page ${page} from /cards/search...`);
      const response = await fetch(
        `https://api.gatcg.com/cards/search?page=${page}&limit=${limit}`
      );
      
      if (!response.ok) {
        console.error(`Failed to fetch page ${page}: ${response.status}`);
        break;
      }

      const data: APIResponse = await response.json();
      console.log(`Page ${page}: ${data.dataCount} cards, hasNext: ${data.hasNext}`);
      
      if (data.data && data.data.length > 0) {
        allCards.push(...data.data);
      }
      
      hasNext = data.hasNext;
      page++;
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Total cards fetched: ${allCards.length}`);

    // Step 2: Extract unique sets from card editions
    const setsMap = new Map<string, { code: string; name: string }>();
    
    for (const card of allCards) {
      if (card.editions && card.editions.length > 0) {
        for (const edition of card.editions) {
          if (edition.set && edition.set.prefix) {
            const setCode = edition.set.prefix;
            if (!setsMap.has(setCode)) {
              setsMap.set(setCode, {
                code: setCode,
                name: edition.set.name,
              });
            }
          }
        }
      }
    }

    console.log(`Found ${setsMap.size} unique sets`);

    // Step 3: Upsert sets into database
    const sets = Array.from(setsMap.values());
    if (sets.length > 0) {
      const { error: setsError } = await supabase
        .from("sets")
        .upsert(sets, { onConflict: "code" });

      if (setsError) {
        console.error("Error inserting sets:", setsError);
        return res.status(500).json({ 
          error: "Failed to insert sets",
          details: setsError.message 
        });
      }
      console.log(`Inserted/updated ${sets.length} sets`);
    }

    // Step 4: Get set IDs for mapping
    const { data: setRecords, error: setFetchError } = await supabase
      .from("sets")
      .select("id, code");

    if (setFetchError) {
      console.error("Error fetching sets:", setFetchError);
      return res.status(500).json({ 
        error: "Failed to fetch sets",
        details: setFetchError.message 
      });
    }

    const setIdMap = new Map<string, string>();
    setRecords?.forEach(set => {
      setIdMap.set(set.code, set.id);
    });

    // Step 5: Insert cards into database
    let successCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    console.log(`Starting to insert ${allCards.length} cards...`);

    for (const card of allCards) {
      try {
        // Get the first edition for primary card data
        const firstEdition = card.editions?.[0];
        if (!firstEdition || !firstEdition.set) {
          console.log(`Card ${card.name} has no valid editions, skipping`);
          errorCount++;
          continue;
        }

        const setCode = firstEdition.set.prefix;
        const setId = setIdMap.get(setCode);
        
        if (!setId) {
          console.error(`Set not found for card: ${card.name} (${setCode})`);
          errorCount++;
          errors.push({ card: card.name, reason: `Set ${setCode} not found` });
          continue;
        }

        // Convert numeric rarity to string
        const rarityNum = firstEdition.rarity;
        const rarity = RARITY_MAP[rarityNum] || "common";
        
        // Get the first class and type
        const cardClass = card.classes && card.classes.length > 0 ? card.classes[0] : null;
        const cardType = card.types && card.types.length > 0 ? card.types[0] : "Unknown";

        // Convert relative image path to full URL
        const imageUrl = firstEdition.image.startsWith("http")
          ? firstEdition.image
          : `https://index.gatcg.com${firstEdition.image}`;

        const cardData = {
          name: card.name,
          set_id: setId,
          card_number: firstEdition.collector_number || "0",
          rarity: rarity,
          card_type: cardType,
          class: cardClass,
          element: null,
          cost: card.cost_memory || 0,
          power: card.power,
          life: card.life,
          effect_text: card.effect || card.effect_raw || "",
          flavor_text: card.flavor || null,
          image_url: imageUrl,
          illustrator: firstEdition.illustrator,
        };

        const { error } = await supabase
          .from("cards")
          .upsert(cardData, {
            onConflict: "set_id,card_number",
          });

        if (error) {
          console.error(`Error inserting card ${card.name}:`, error);
          errorCount++;
          errors.push({ card: card.name, error: error.message });
        } else {
          successCount++;
          if (successCount % 100 === 0) {
            console.log(`Inserted ${successCount} cards so far...`);
          }
        }
      } catch (err) {
        console.error(`Exception inserting card ${card.name}:`, err);
        errorCount++;
        errors.push({ 
          card: card.name, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    console.log(`Sync complete: ${successCount} cards inserted, ${errorCount} errors`);
    if (errors.length > 0) {
      console.log("First 10 errors:", errors.slice(0, 10));
    }

    res.status(200).json({
      message: "Card sync completed",
      cardsInserted: successCount,
      errors: errorCount,
      setsCreated: sets.length,
      errorDetails: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Fatal error during sync:", error);
    res.status(500).json({
      error: "Failed to sync cards",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}