import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errorMessage";

const RECENT_RUN_LIMIT = 5;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { count: cardCount, error: cardError } = await supabase
      .from("cards")
      .select("*", { count: "exact", head: true });

    const { count: setCount, error: setError } = await supabase
      .from("sets")
      .select("*", { count: "exact", head: true });

    // The catalog sync runs in GitHub Actions and records each attempt here.
    const { data: recentRuns, error: syncHistoryError } = await supabase
      .from("sync_history")
      .select(
        "id, started_at, completed_at, status, total_cards_processed, total_sets_processed, pages_fetched, error_message"
      )
      .order("started_at", { ascending: false })
      .limit(RECENT_RUN_LIMIT);

    const queryError = cardError || setError || syncHistoryError;
    if (queryError) {
      throw queryError;
    }

    const runs = recentRuns ?? [];

    return res.status(200).json({
      totalCards: cardCount || 0,
      totalSets: setCount || 0,
      lastSync: runs[0]?.started_at || null,
      lastSyncStats: runs[0] || null,
      recentRuns: runs,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return res.status(500).json({
      error: getErrorMessage(error),
    });
  }
}
