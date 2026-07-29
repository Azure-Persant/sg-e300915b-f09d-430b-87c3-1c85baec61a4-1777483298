import { useEffect, useState } from "react";
import { Check, Copy, Link2, Mail, Share2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  EXPIRY_PRESETS,
  collectionShareService,
  expiryFromHours,
  isShareLive,
  shareUrl,
  type CollectionShare,
} from "@/services/collectionService";

type Props = { userId: string };

const bucketSummary = (share: CollectionShare): string => {
  const parts = [
    share.include_personal && "personal",
    share.include_sale && "for sale",
    share.include_loaned && "lent out",
  ].filter(Boolean);
  return parts.join(" + ");
};

const expiryLabel = (share: CollectionShare): string => {
  if (share.revoked_at) return "revoked";
  if (!share.expires_at) return "no expiry";
  const when = new Date(share.expires_at);
  return when > new Date()
    ? `expires ${when.toLocaleDateString()}`
    : `expired ${when.toLocaleDateString()}`;
};

export function CollectionShares({ userId }: Props) {
  const { toast } = useToast();
  const [shares, setShares] = useState<CollectionShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [personal, setPersonal] = useState(false);
  const [sale, setSale] = useState(true);
  const [loaned, setLoaned] = useState(false);
  const [expiryHours, setExpiryHours] = useState<string>("168");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const load = async () => {
    try {
      setShares(await collectionShareService.list(userId));
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not load your shares" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    // The database rejects a share with no buckets; say so in plain terms first.
    if (!personal && !sale && !loaned) {
      toast({
        variant: "destructive",
        title: "Nothing to share",
        description: "Pick at least one of personal, for sale, or lent out.",
      });
      return;
    }

    try {
      const hours = expiryHours === "never" ? null : Number(expiryHours);
      const created = await collectionShareService.create(userId, {
        label,
        invitedEmail: email,
        includePersonal: personal,
        includeSale: sale,
        includeLoaned: loaned,
        expiresAt: expiryFromHours(hours),
      });

      setLabel("");
      setEmail("");
      await load();
      await copy(created);
      toast({
        title: email.trim() ? "Invite created" : "Link created",
        description: "Copied to your clipboard.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not create the share",
      });
    }
  };

  const copy = async (share: CollectionShare) => {
    const url = shareUrl(share.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(share.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard is blocked in some browsers without a user gesture; show the
      // URL so it can still be copied by hand rather than failing silently.
      toast({ title: "Copy this link", description: url });
    }
  };

  const handleRevoke = async (share: CollectionShare) => {
    try {
      await collectionShareService.revoke(share.id);
      await load();
      toast({ title: "Revoked", description: "That link no longer works." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not revoke" });
    }
  };

  const handleDelete = async (share: CollectionShare) => {
    try {
      await collectionShareService.remove(share.id);
      await load();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete" });
    }
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Sharing</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-slate-300 text-sm">Name (optional)</Label>
            <Input
              placeholder="Sale list, Playgroup..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="bg-slate-900 border-slate-700 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-sm">Invite an email (optional)</Label>
            <Input
              type="email"
              placeholder="Leave blank for an open link"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-900 border-slate-700 text-white mt-1"
            />
          </div>
        </div>

        {/* An open link is only as private as the URL, so say that plainly rather
            than restricting what the owner is allowed to share. */}
        <p className="text-xs text-slate-400">
          {email.trim()
            ? "Only that address, once signed in, can open the link."
            : "Anyone with the link can open it, no account needed."}
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-3">
            {[
              { on: personal, set: setPersonal, text: "Personal" },
              { on: sale, set: setSale, text: "For sale" },
              { on: loaned, set: setLoaned, text: "Lent out" },
            ].map(({ on, set, text }) => (
              <button
                key={text}
                type="button"
                onClick={() => set(!on)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                {on ? <Check className="mr-1 inline h-3 w-3" /> : null}
                {text}
              </button>
            ))}
          </div>

          <div className="min-w-[10rem]">
            <Label className="text-slate-300 text-sm">Expires</Label>
            <Select value={expiryHours} onValueChange={setExpiryHours}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {EXPIRY_PRESETS.map((preset) => (
                  <SelectItem
                    key={preset.label}
                    value={preset.hours === null ? "never" : String(preset.hours)}
                    className="text-white"
                  >
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleCreate} className="bg-cyan-500 hover:bg-cyan-600 text-white">
            Create link
          </Button>
        </div>

        {!loading && shares.length > 0 && (
          <div className="space-y-2 pt-2">
            {shares.map((share) => {
              const live = isShareLive(share);
              return (
                <div
                  key={share.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 p-2 text-sm"
                >
                  {share.invited_email ? (
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="text-white">{share.label || "Untitled"}</span>
                  {share.invited_email && (
                    <span className="text-slate-400">{share.invited_email}</span>
                  )}
                  <Badge variant="outline" className="border-slate-600 text-slate-300">
                    {bucketSummary(share)}
                  </Badge>
                  <span className={live ? "text-slate-400" : "text-red-400"}>
                    {expiryLabel(share)}
                  </span>

                  <div className="ml-auto flex items-center gap-1">
                    {live && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copy(share)}
                          className="text-slate-300 hover:text-white"
                        >
                          {copiedId === share.id ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevoke(share)}
                          className="text-amber-400 hover:text-amber-300"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(share)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
