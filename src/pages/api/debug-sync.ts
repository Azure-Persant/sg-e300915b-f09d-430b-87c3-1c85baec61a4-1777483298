import type { NextApiRequest, NextApiResponse } from "next";

const API_BASE_URL = "https://api.gatcg.com";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    console.log("=== DEBUGGING ARISANNA SYNC ===");
    
    // Fetch ALL cards with separate_editions=true
    let allArisannaCards: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      const url = `${API_BASE_URL}/cards/search?separate_editions=true&page=${page}&limit=100`;
      const response = await fetch(url);
      const data = await response.json();
      
      // Filter for Arisanna
      const arisannas = (data.data || []).filter((c: any) => 
        c.name && c.name.includes("Arisanna") && c.name.includes("Astral")
      );
      
      allArisannaCards = allArisannaCards.concat(arisannas);
      hasMore = data.has_more || false;
      page++;
    }

    console.log(`Found ${allArisannaCards.length} Arisanna cards from API`);

    // Detailed breakdown
    const breakdown = allArisannaCards.map(card => ({
      name: card.name,
      set_code: card.set?.id,
      set_name: card.set?.name,
      collector_number: card.collector_number,
      rarity: card.rarity,
      rarity_mapped: mapRarity(card.rarity),
      image: card.image?.substring(0, 50),
    }));

    console.log("Arisanna breakdown:", JSON.stringify(breakdown, null, 2));

    // Check for duplicates by set_id + card_number
    const dedupMap = new Map<string, any>();
    const duplicates: any[] = [];

    allArisannaCards.forEach(card => {
      const key = `${card.set?.id}_${card.collector_number}`;
      if (dedupMap.has(key)) {
        duplicates.push({
          key,
          existing: dedupMap.get(key),
          duplicate: card,
        });
      } else {
        dedupMap.set(key, card);
      }
    });

    console.log(`Deduplication: ${allArisannaCards.length} → ${dedupMap.size}`);
    console.log(`Duplicates found: ${duplicates.length}`);

    return res.status(200).json({
      total_from_api: allArisannaCards.length,
      after_dedup: dedupMap.size,
      duplicates_removed: duplicates.length,
      breakdown,
      duplicates,
      unique_keys: Array.from(dedupMap.keys()),
    });
  } catch (error) {
    console.error("Debug error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function mapRarity(rarityNum: number): string {
  const map: Record<number, string> = {
    1: "C", 2: "U", 3: "R", 4: "SR", 5: "UR", 6: "ScR", 7: "CSR", 9: "P",
  };
  return map[rarityNum] || "UNKNOWN";
}