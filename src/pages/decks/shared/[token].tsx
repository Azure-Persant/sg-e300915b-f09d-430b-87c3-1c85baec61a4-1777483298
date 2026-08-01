import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Copy, Link2, Loader2, Sparkles } from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SECTION_LABELS, asDeckSection, type DeckSection } from "@/lib/deckList";
import { sortRows } from "@/lib/deckOrder";
import { deckService, type SharedDeckCard, type SharedDeckMeta } from "@/services/deckService";

const DECK_GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8";

/** The shape sortRows wants, built from the flat rows the function returns. */
interface SharedRow {
  cards: {
    name: string;
    element: string | null;
    types: string[];
    cost_memory: number | null;
  };
  foil: boolean;
  card: SharedDeckCard;
}

/**
 * A deck opened by link.
 *
 * Deliberately does not distinguish "no such token" from expired, revoked or
 * not-for-you: the database returns nothing for all four, so a visitor cannot
 * probe for which links exist. Read only, with no inventory figures — the link
 * is about the deck, not about the reader's collection.
 */
export default function SharedDeckPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  const [meta, setMeta] = useState<SharedDeckMeta | null>(null);
  const [cards, setCards] = useState<SharedDeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const result = await deckService.readShared(token);
        if (!active) return;
        setMeta(result?.meta ?? null);
        setCards(result?.cards ?? []);
      } catch {
        if (active) setMeta(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const sections = useMemo(() => {
    const rows: SharedRow[] = cards.map((card) => ({
      cards: {
        name: card.name,
        element: card.element,
        types: card.types ?? [],
        cost_memory: card.cost_memory,
      },
      foil: card.foil,
      card,
    }));

    return (["material", "main", "sideboard"] as DeckSection[]).map((section) => {
      const inSection = rows.filter((row) => asDeckSection(row.card.section) === section);
      return {
        section,
        rows: sortRows(inSection, section),
        copies: inSection.reduce((total, row) => total + row.card.quantity, 0),
      };
    });
  }, [cards]);

  const handleDuplicate = async () => {
    if (!meta || !token) return;
    setDuplicating(true);
    try {
      const newId = await deckService.duplicate(meta.deck_id, token);
      toast({
        title: "Copied to your decks",
        description: `"${meta.name}" is now in My Decks as a private deck.`,
      });
      router.push(`/decks/${newId}/edit`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not copy that deck",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <>
      <SEO
        title={meta ? meta.name : "Shared deck"}
        description={meta?.description ?? "A shared Grand Archive deck"}
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />

        <main className="container mx-auto px-4 py-8">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : !meta ? (
            <div className="mx-auto max-w-md py-20 text-center">
              <Link2 className="mx-auto h-10 w-10 text-slate-500" />
              <h1 className="mt-4 text-2xl font-bold text-white">This link isn&apos;t available</h1>
              <p className="mt-2 text-slate-400">
                It may have expired, been revoked, or be limited to a specific
                account. If it was shared with your email address, sign in with that
                address and try again.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-6 border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
              >
                <Link href="/decks/showcase">Browse the Showcase</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-bold text-white">{meta.name}</h1>
                  <p className="text-sm text-slate-400">
                    Shared by {meta.owner_name}
                    {meta.label && ` · ${meta.label}`}
                    {meta.expires_at &&
                      ` · link expires ${new Date(meta.expires_at).toLocaleDateString()}`}
                  </p>
                  {meta.description && (
                    <p className="mt-1 max-w-2xl text-sm text-slate-400">{meta.description}</p>
                  )}
                </div>

                {user ? (
                  <Button
                    onClick={handleDuplicate}
                    disabled={duplicating}
                    className="bg-cyan-600 text-white hover:bg-cyan-700"
                  >
                    {duplicating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    Duplicate
                  </Button>
                ) : (
                  <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
                    <Link href="/auth/login">Sign in to copy</Link>
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {sections.map(({ section, rows, copies }) => {
                  if (rows.length === 0) return null;
                  return (
                    <Card key={section} className="border-slate-700 bg-slate-800/50">
                      <CardContent className="p-3">
                        <div className="mb-2 flex items-center justify-between px-1">
                          <h2 className="text-lg font-bold text-white">
                            {SECTION_LABELS[section]}
                          </h2>
                          <span className="text-sm text-slate-400">
                            {copies} card{copies === 1 ? "" : "s"}
                          </span>
                        </div>

                        <div className={DECK_GRID}>
                          {rows.map((row) => (
                            <div
                              key={`${row.card.card_id}-${row.card.section}-${row.card.foil}`}
                              className="overflow-hidden rounded border border-slate-700/70 bg-slate-900/40"
                            >
                              <div className="relative">
                                <CardImage
                                  src={row.card.image_url}
                                  alt={row.card.name}
                                  variant="tile"
                                  className="h-auto w-full object-contain"
                                />
                                {row.card.foil && (
                                  <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 overflow-hidden"
                                  >
                                    <span className="absolute inset-0 animate-foil-shift bg-[linear-gradient(115deg,rgba(255,64,160,0.55),rgba(255,196,64,0.55),rgba(120,255,180,0.55),rgba(64,176,255,0.55),rgba(190,110,255,0.55),rgba(255,64,160,0.55))] bg-[length:300%_300%] mix-blend-overlay motion-reduce:animate-none" />
                                    <span className="absolute inset-y-0 left-0 w-1/2 animate-foil-sweep bg-[linear-gradient(100deg,transparent_0%,rgba(255,80,80,0.65)_18%,rgba(255,225,90,0.65)_34%,rgba(90,255,190,0.65)_50%,rgba(90,190,255,0.65)_66%,rgba(210,90,255,0.65)_82%,transparent_100%)] mix-blend-overlay motion-reduce:animate-none" />
                                  </span>
                                )}
                                <span className="absolute bottom-1 right-1 rounded bg-slate-950/85 px-1.5 py-0.5 text-xs font-semibold text-white">
                                  {row.card.quantity}
                                </span>
                              </div>

                              <div className="px-1 py-1">
                                <p
                                  className="truncate text-center text-xs font-medium text-white"
                                  title={row.card.name}
                                >
                                  {row.card.name}
                                </p>
                                {(row.card.foil || row.card.is_restricted) && (
                                  <div className="mt-0.5 flex items-center justify-center gap-1">
                                    {row.card.foil && (
                                      <Badge className="gap-0.5 bg-cyan-500/20 px-1 py-0 text-[10px] text-cyan-200">
                                        <Sparkles className="h-2.5 w-2.5" />
                                        Foil
                                      </Badge>
                                    )}
                                    {row.card.is_restricted && (
                                      <Badge className="bg-amber-500/20 px-1 py-0 text-[10px] text-amber-300">
                                        Restricted
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
