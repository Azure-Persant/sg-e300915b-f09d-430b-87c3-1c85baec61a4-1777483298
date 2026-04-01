import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Test different endpoints to find the correct API structure
    const endpoints = [
      "https://api.gatcg.com/",
      "https://api.gatcg.com/cards",
      "https://api.gatcg.com/cards/sets",
      "https://api.gatcg.com/sets",
      "https://api.gatcg.com/v1/cards",
      "https://api.gatcg.com/v1/sets",
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        console.log(`Testing: ${endpoint}`);
        const response = await fetch(endpoint);
        const contentType = response.headers.get("content-type");
        
        let data;
        if (contentType?.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        results.push({
          endpoint,
          status: response.status,
          contentType,
          data: typeof data === "string" ? data.substring(0, 200) : data,
        });
      } catch (error) {
        results.push({
          endpoint,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: "Test failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}