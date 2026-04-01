import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Fetch the OpenAPI spec to see available endpoints
    const specResponse = await fetch("https://api.gatcg.com/openapi.json");
    
    if (!specResponse.ok) {
      return res.status(500).json({
        error: "Failed to fetch OpenAPI spec",
        status: specResponse.status,
      });
    }

    const spec = await specResponse.json();
    
    // Extract just the paths and their methods
    const endpoints = Object.keys(spec.paths || {}).map(path => ({
      path,
      methods: Object.keys(spec.paths[path]),
    }));

    return res.status(200).json({
      apiTitle: spec.info?.title,
      apiVersion: spec.info?.version,
      baseUrl: spec.servers?.[0]?.url,
      endpoints,
      fullSpec: spec, // Include full spec for reference
    });
  } catch (error) {
    return res.status(500).json({
      error: "Test failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}