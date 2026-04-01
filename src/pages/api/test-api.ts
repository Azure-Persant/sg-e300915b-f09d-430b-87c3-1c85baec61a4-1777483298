import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const baseUrl = "https://api.gatcg.com";
  
  // Try common endpoint patterns
  const endpoints = [
    "/api/cards",
    "/api/sets",
    "/api/v1/cards",
    "/api/v1/sets",
    "/card",
    "/set",
    "/cards/search",
    "/sets/all",
    "/public/cards",
    "/public/sets",
    "/data/cards",
    "/data/sets",
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("json")) {
          const data = await response.json();
          results.push({
            endpoint,
            status: response.status,
            preview: JSON.stringify(data).substring(0, 200),
          });
        }
      }
    } catch (error) {
      // Skip errors
    }
  }

  return res.status(200).json({ 
    working_endpoints: results,
    message: "These endpoints returned successful JSON responses"
  });
}