import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get total cards and sets
    const { count: cardCount, error: cardError } = await supabase
      .from("cards")
      .select("*", { count: "exact", head: true });

    const { count: setCount, error: setError } = await supabase
      .from("sets")
      .select("*", { count: "exact", head: true });

    // Get last sync time (we'll track this in a new table)
    const { data: syncHistory, error: syncHistoryError } = await supabase
      .from("sync_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const queryError = cardError || setError || syncHistoryError;
    if (queryError) {
      throw queryError;
    }

    return res.status(200).json({
      totalCards: cardCount || 0,
      totalSets: setCount || 0,
      lastSync: syncHistory?.created_at || null,
      lastSyncStats: syncHistory || null,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
