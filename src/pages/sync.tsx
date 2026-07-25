import { FormEvent, useState } from "react";
import { Database, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { SEO } from "@/components/SEO";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SyncResponse {
  success?: boolean;
  error?: string;
  message?: string;
  processedInBatch?: number;
  setsProcessed?: number;
  pagesProcessed?: number;
}

export default function AdminSyncPage() {
  const [cronSecret, setCronSecret] = useState("");
  const [forceFullSync, setForceFullSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);

  const handleSync = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cronSecret) return;

    setSyncing(true);
    setResult(null);

    try {
      const response = await fetch("/api/sync-cards", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ forceFullSync }),
      });
      const data = (await response.json()) as SyncResponse;

      if (!response.ok) {
        throw new Error(data.error || "The card sync failed.");
      }

      setResult(data);
      setCronSecret("");
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "The card sync failed.",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <SEO
        title="Card Sync Administration"
        description="Run a protected Grand Archive card database synchronization"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
        <Navigation />
        <main className="container mx-auto max-w-2xl px-4 py-12">
          <Card className="border-cyan-500/20 bg-slate-900/80 text-slate-100 shadow-2xl backdrop-blur">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10">
                <Database className="h-6 w-6 text-cyan-400" />
              </div>
              <CardTitle className="text-2xl">Card Database Sync</CardTitle>
              <CardDescription className="text-slate-400">
                Start the same protected synchronization that Vercel runs automatically each day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-6 border-cyan-500/20 bg-cyan-500/5 text-slate-200">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <AlertTitle>Secret handling</AlertTitle>
                <AlertDescription className="text-slate-400">
                  Enter your Vercel CRON_SECRET—not the Supabase service-role key. The value is sent
                  only to this site over HTTPS, is not saved by this page, and is cleared after a
                  successful sync.
                </AlertDescription>
              </Alert>

              <form onSubmit={handleSync} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="cron-secret">CRON_SECRET</Label>
                  <Input
                    id="cron-secret"
                    type="password"
                    value={cronSecret}
                    onChange={(event) => setCronSecret(event.target.value)}
                    placeholder="Enter the secret configured in Vercel"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={syncing}
                    className="border-slate-700 bg-slate-950"
                  />
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                  <Checkbox
                    id="force-full-sync"
                    checked={forceFullSync}
                    onCheckedChange={(checked) => setForceFullSync(checked === true)}
                    disabled={syncing}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="force-full-sync">Force a full sync</Label>
                    <p className="text-sm text-slate-400">
                      Leave this off for normal updates. An empty database is populated fully even
                      when this option is off.
                    </p>
                  </div>
                </div>

                <Button type="submit" disabled={!cronSecret || syncing} className="w-full">
                  {syncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing cards—keep this page open…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Start card sync
                    </>
                  )}
                </Button>
              </form>

              {result && (
                <Alert
                  className={`mt-6 ${
                    result.success
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                      : "border-red-500/30 bg-red-500/10 text-red-100"
                  }`}
                >
                  <AlertTitle>{result.success ? "Sync complete" : "Sync failed"}</AlertTitle>
                  <AlertDescription>
                    {result.success
                      ? result.message ||
                        `Processed ${result.processedInBatch || 0} cards across ${
                          result.setsProcessed || 0
                        } sets and ${result.pagesProcessed || 0} pages.`
                      : result.error}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
}
