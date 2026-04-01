import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const baseUrl = "https://api.gatcg.com";
  
  try {
    // Test the working /cards/search endpoint with different parameters
    const tests = [
      { url: `${baseUrl}/cards/search`, label: "Basic search" },
      { url: `${baseUrl}/cards/search?page=1`, label: "Page 1" },
      { url: `${baseUrl}/cards/search?limit=5`, label: "Limit 5" },
      { url: `${baseUrl}/cards/search?page=1&limit=5`, label: "Page 1, Limit 5" },
    ];

    const results = [];

    for (const test of tests) {
      try {
        const response = await fetch(test.url);
        if (response.ok) {
          const data = await response.json();
          results.push({
            label: test.label,
            url: test.url,
            dataCount: data.data?.length || 0,
            totalCount: data.total || data.meta?.total || "unknown",
            hasNext: data.next || data.meta?.next || false,
            sampleCard: data.data?.[0] || null,
          });
        }
      } catch (error) {
        // Skip errors
      }
    }

    return res.status(200).json({ 
      results,
      message: "Grand Archive API endpoint analysis"
    });
  } catch (error) {
    return res.status(500).json({
      error: "Test failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}