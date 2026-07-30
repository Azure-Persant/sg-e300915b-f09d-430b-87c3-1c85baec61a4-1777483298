import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Loader2, User } from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/authService";

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
      return;
    }
    if (!user) return;

    let active = true;
    (async () => {
      try {
        const name = await authService.getDisplayName(user.id);
        if (!active) return;
        setDisplayName(name);
        setSavedName(name);
      } catch {
        if (active) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load your profile",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, authLoading, router, toast]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await authService.setDisplayName(user.id, displayName);
      setSavedName(displayName.trim());
      toast({ title: "Saved", description: "Your display name has been updated." });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not save your display name",
      });
    } finally {
      setSaving(false);
    }
  };

  const dirty = displayName.trim() !== savedName;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <>
      <SEO title="Profile" description="Your Grand Archive profile" />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />

        <main className="container mx-auto max-w-xl px-4 py-8">
          <h1 className="mb-6 text-3xl font-bold text-white">Profile</h1>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-cyan-400" />
                <CardTitle className="text-white">Display name</CardTitle>
              </div>
              <CardDescription className="text-slate-400">
                What anyone you share your collection with will see. Leave it
                blank and shared links show &quot;A collector&quot; instead —
                never your email address.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-cyan-500" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="displayName" className="text-slate-300">
                      Name or nickname
                    </Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="A collector"
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Email</Label>
                    <Input
                      value={user.email ?? ""}
                      readOnly
                      disabled
                      className="bg-slate-900/60 border-slate-700 text-slate-400"
                    />
                    <p className="text-xs text-slate-500">
                      Your email is never shown on a shared collection.
                    </p>
                  </div>

                  <Button
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white"
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
}
