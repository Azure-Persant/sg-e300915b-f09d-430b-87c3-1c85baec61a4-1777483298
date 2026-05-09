import type { NextApiRequest, NextApiResponse } from "next";

// In-memory progress tracking (for demo - use Redis/database in production)
let syncProgress = {
  isRunning: false,
  currentPage: 0,
  totalPages: 0,
  processedCards: 0,
  message: "",
  error: null as string | null,
};

export function updateProgress(update: Partial<typeof syncProgress>) {
  syncProgress = { ...syncProgress, ...update };
}

export function resetProgress() {
  syncProgress = {
    isRunning: false,
    currentPage: 0,
    totalPages: 0,
    processedCards: 0,
    message: "",
    error: null,
  };
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json(syncProgress);
}