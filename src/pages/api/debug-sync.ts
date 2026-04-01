import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Fetch first page
    const response = await fetch("https://api.gatcg.com/cards/search?page=1&limit=5");
    const data = await response.json();
    
    // Show detailed structure
    res.status(200).json({
      status: response.status,
      dataCount: data.data?.length || 0,
      totalCount: data.totalCount,
      hasNext: data.hasNext,
      sampleCards: data.data?.slice(0, 2).map((card: any) => ({
        name: card.name,
        slug: card.slug,
        editions: card.editions,
        classes: card.classes,
        types: card.types,
        rarity: card.rarity,
        image: card.image,
        cost_memory: card.cost_memory,
        effect_text: card.effect_text,
        illustrator: card.illustrator,
      })),
      rawFirstCard: data.data?.[0],
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}