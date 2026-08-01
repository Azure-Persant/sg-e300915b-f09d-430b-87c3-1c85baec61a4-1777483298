import { useEffect, useState } from "react";
import { Check, Copy, Globe, Link2, Lock, Mail, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { EXPIRY_PRESETS, expiryFromHours } from "@/services/collectionService";
import { deckService, type DeckShare } from "@/services/deckService";

/** The three states an owner picks between, as they read to a person. */
type Visibility = "private" | "shared" | "public";

const shareUrl = (token: string): string =>
  typeof window === "undefined" ? "" : `${window.location.origin}/decks/shared/${token}`;

const isLive = (share: DeckShare): boolean =>
  !share.revoked_at && (!share.expires_at || new Date(share.expires_at) > new Date());

/**
 * Who can see this deck.
 *
 * Three states, but only two mechanisms behind them, which is why "shared" is
 * not a column: a deck is public or not, and separately it has links or not.
 * Shared simply means private with at least one live link — the same shape the
 * collection uses, so there is one idea here rather than two.
 */
export function DeckVisibility({
  deckId,
  isPublic,
  onChange,
}: {
  deckId: string;
  isPublic: boolean;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [shares, setShares] = useState<DeckShare[]>([]);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [expiryHours, setExpiryHours] = useState("168");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    try {
      setShares(await deckService.listShares(deckId));
    } catch (error) {
      console.error("Could not load deck links:", error);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const liveShares = shares.filter(isLive);
  const current: Visibility = isPublic ? "public" : liveShares.length > 0 ? "shared" : "private";

  const setPublic = async (next: boolean) => {
    setBusy(true);
    try {
      await deckService.setDeckPublic(deckId, next);
      onChange();
      toast({
        title: next ? "Deck is public" : "Deck is no longer public",
        description: next
          ? "It now appears on the Deck Showcase."
          : "It has been removed from the Showcase. Any links you made still work.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not change that",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const createLink = async () => {
    setBusy(true);
    try {
      const hours = Number(expiryHours);
      await deckService.createShare(deckId, {
        label,
        email,
        expiresAt: expiryFromHours(Number.isFinite(hours) ? hours : null),
      });
      setLabel("");
      setEmail("");
      await load();
      toast({ title: "Link created" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not create that link",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (share: DeckShare) => {
    try {
      await navigator.clipboard.writeText(shareUrl(share.token));
      setCopiedId(share.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast({ variant: "destructive", title: "Could not copy", description: shareUrl(share.token) });
    }
  };

  const option = (value: Visibility, icon: React.ReactNode, title: string, blurb: string) => {
    const active = current === value;
    return (
      <button
        key={value}
        type="button"
        disabled={busy || (value === "shared" && current !== "shared")}
        onClick={() => {
          if (value === "public") setPublic(true);
          if (value === "private") setPublic(false);
        }}
        aria-pressed={active}
        className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
          active
            ? "border-cyan-500 bg-cyan-500/10"
            : "border-slate-700 hover:border-slate-600 disabled:opacity-60"
        }`}
      >
        <span className="flex items-center gap-2 font-medium text-white">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-xs text-slate-400">{blurb}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        {option("private", <Lock className="h-4 w-4" />, "Private", "Only you can open it.")}
        {option(
          "shared",
          <Link2 className="h-4 w-4" />,
          "Shared",
          "Private, but anyone holding a link below can open it."
        )}
        {option(
          "public",
          <Globe className="h-4 w-4" />,
          "Public",
          "Listed on the Deck Showcase for anyone to find."
        )}
      </div>

      {/* Links stay available whatever the state: a public deck may still want a
          direct link, and turning public off must not silently break one. */}
      <div className="space-y-3 rounded-lg border border-slate-700 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-slate-300">Name (optional)</Label>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="For the playgroup..."
              className="mt-1 border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-300">Invite an email (optional)</Label>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Leave blank for an open link"
              className="mt-1 border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-slate-300">Expires</Label>
            <Select value={expiryHours} onValueChange={setExpiryHours}>
              <SelectTrigger className="mt-1 w-[160px] border-slate-700 bg-slate-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_PRESETS.map((preset) => (
                  <SelectItem key={preset.label} value={String(preset.hours ?? 0)}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={createLink}
            disabled={busy}
            className="bg-cyan-600 text-white hover:bg-cyan-700"
          >
            Create link
          </Button>
        </div>

        {shares.length > 0 && (
          <ul className="space-y-2">
            {shares.map((share) => {
              const live = isLive(share);
              return (
                <li
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
                    {share.revoked_at
                      ? "revoked"
                      : !share.expires_at
                        ? "no expiry"
                        : new Date(share.expires_at) > new Date()
                          ? `expires ${new Date(share.expires_at).toLocaleDateString()}`
                          : `expired ${new Date(share.expires_at).toLocaleDateString()}`}
                  </Badge>

                  <div className="ml-auto flex items-center gap-1">
                    {live && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(share)}
                        title="Copy link"
                        className="text-slate-300 hover:text-white"
                      >
                        {copiedId === share.id ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {live && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await deckService.revokeShare(share.id);
                          await load();
                        }}
                        title="Stop this link working"
                        className="text-amber-400 hover:text-amber-300"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await deckService.removeShare(share.id);
                        await load();
                      }}
                      title="Delete this link"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
