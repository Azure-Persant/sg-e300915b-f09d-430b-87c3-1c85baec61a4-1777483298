import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Github,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { SEO } from "@/components/SEO";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SyncRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  total_cards_processed: number;
  total_sets_processed: number;
  pages_fetched: number;
  error_message: string | null;
}

interface SyncStatus {
  totalCards: number;
  totalSets: number;
  recentRuns: SyncRun[];
}

const formatTimestamp = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

const formatDuration = (run: SyncRun) => {
  if (!run.completed_at) return "—";
  const seconds = Math.round(
    (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const StatusBadge = ({ status }: { status: SyncRun["status"] }) => {
  const styles: Record<SyncRun["status"], string> = {
    completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    failed: "border-red-500/40 bg-red-500/10 text-red-300",
    running: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  };
  return (
    <Badge variant="outline" className={styles[status]}>
      {status}
    </Badge>
  );
};

export default function SyncStatusPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sync-status");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not load sync status.");
      }
      setStatus(data as SyncStatus);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load sync status."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const lastRun = status?.recentRuns?.[0] ?? null;

  return (
    <>
      <SEO
        title="Card Sync Status"
        description="Grand Archive catalog synchronization status and recent run history"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
        <Navigation />
        <main className="container mx-auto max-w-4xl px-4 py-12">
          <Card className="border-cyan-500/20 bg-slate-900/80 text-slate-100 shadow-2xl backdrop-blur">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10">
                <Database className="h-6 w-6 text-cyan-400" />
              </div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl">Card Sync Status</CardTitle>
                  <CardDescription className="text-slate-400">
                    The catalog sync runs in GitHub Actions, daily at 06:00 UTC.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadStatus}
                  disabled={loading}
                  className="border-slate-700"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <Alert className="border-cyan-500/20 bg-cyan-500/5 text-slate-200">
                <Github className="h-4 w-4 text-cyan-400" />
                <AlertTitle>This page is read-only</AlertTitle>
                <AlertDescription className="text-slate-400">
                  The full catalog is ~4,500 printings across ~151 API pages, which takes
                  longer than a serverless function is allowed to run. Syncing is handled by
                  the <span className="font-mono text-slate-300">Sync card catalog</span>{" "}
                  workflow — run it from the repository&apos;s Actions tab to sync on demand.
                </AlertDescription>
              </Alert>

              {error && (
                <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Could not load status</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {status && (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-sm text-slate-400">Card printings</p>
                      <p className="text-2xl font-semibold">
                        {status.totalCards.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-sm text-slate-400">Sets</p>
                      <p className="text-2xl font-semibold">
                        {status.totalSets.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-sm text-slate-400">Last run</p>
                      <p className="flex h-8 items-center">
                        {lastRun ? (
                          <StatusBadge status={lastRun.status} />
                        ) : (
                          <span className="text-slate-500">never</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {status.totalCards === 0 && (
                    <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>The catalog is empty</AlertTitle>
                      <AlertDescription>
                        No card printings have been synced yet. Run the{" "}
                        <span className="font-mono">Sync card catalog</span> workflow to
                        populate the database.
                      </AlertDescription>
                    </Alert>
                  )}

                  {lastRun?.status === "failed" && lastRun.error_message && (
                    <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Last sync failed</AlertTitle>
                      <AlertDescription className="break-words font-mono text-xs">
                        {lastRun.error_message}
                      </AlertDescription>
                    </Alert>
                  )}

                  {lastRun?.status === "completed" && (
                    <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-100">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertTitle>Last sync completed</AlertTitle>
                      <AlertDescription>
                        Processed {lastRun.total_cards_processed.toLocaleString()} printings
                        across {lastRun.total_sets_processed} sets and{" "}
                        {lastRun.pages_fetched} pages in {formatDuration(lastRun)}.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div>
                    <h2 className="mb-3 text-sm font-medium text-slate-300">Recent runs</h2>
                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="text-slate-400">Started</TableHead>
                            <TableHead className="text-slate-400">Status</TableHead>
                            <TableHead className="text-right text-slate-400">Pages</TableHead>
                            <TableHead className="text-right text-slate-400">Cards</TableHead>
                            <TableHead className="text-right text-slate-400">Duration</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {status.recentRuns.length === 0 && (
                            <TableRow className="border-slate-800">
                              <TableCell colSpan={5} className="text-center text-slate-500">
                                No sync runs recorded yet.
                              </TableCell>
                            </TableRow>
                          )}
                          {status.recentRuns.map((run) => (
                            <TableRow key={run.id} className="border-slate-800">
                              <TableCell className="whitespace-nowrap">
                                {formatTimestamp(run.started_at)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={run.status} />
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {run.pages_fetched}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {run.total_cards_processed.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatDuration(run)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
}
