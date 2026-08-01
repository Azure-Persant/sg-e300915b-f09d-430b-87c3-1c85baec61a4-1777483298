import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  FileDown,
  Globe,
  Loader2,
  Lock,
  Pencil,
  Share2,
  Sparkles,
} from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { DeckExportDialog } from "@/components/DeckListTransfer";
import { DeckSummaryBar } from "@/components/DeckSummaryBar";
import { DeckVisibility } from "@/components/DeckVisibility";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SECTION_LABELS, formatDeckList } from "@/lib/deckList";
import { deckTokens, groupSections, onHandFor, summariseDeck } from "@/lib/deckSummary";
import { collectionService, type CardOwnership } from "@/services/collectionService";
import {
  deckService,
  type ArtOption,
  type DeckCardWithCard,
  type DeckWithCards,
} from "@/services/deckService";

/** Eight across on a wide desktop, matching the editor's grid. */
const DECK_GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8";

/**
 * A deck, read-only.
 *
 * This is what clicking a deck opens, because looking at a deck is the common
 * case and editing is the deliberate one. It shows the same counts, rule problems
 * and inventory shortfalls as the editor — both derive them from summariseDeck —
 * but nothing here can change the deck.
 */
export default function DeckViewPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [deck, setDeck] = useState<DeckWithCards | null>(null);
  const [ownership, setOwnership] = useState<Map<string, CardOwnership>>(new Map());
  const [tokenCards, setTokenCards] = useState<ArtOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);

  const reload = async () => {
    if (!id || typeof id !== "string") return;
    try {
      setDeck(await deckService.getDeckById(id));
    } catch {
      setDeck(null);
    }
  };

  useEffect(() => {
    if (!id || typeof id !== "string" || authLoading) return;
    let active = true;

    (async () => {
      setLoading(true);
      try {
        // The deck and the tokens are readable signed out for a public deck; only
        // the missing-cards figures need an account, so they are fetched
        // separately rather than making the whole page require one.
        const [deckData, tokens] = await Promise.all([
          deckService.getDeckById(id),
          deckService.tokenPrintings(),
        ]);
        if (!active) return;
        setDeck(deckData);
        setTokenCards(tokens);

        if (user) {
          const ownershipMap = await collectionService.getOwnershipMap(user.id);
          if (active) setOwnership(ownershipMap);
        }
      } catch {
        // A deck that is private, deleted, or never existed all look the same
        // from here, which is deliberate.
        if (active) setDeck(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, id, authLoading]);

  const isOwner = !!user && !!deck && deck.user_id === user.id;

  const handleDuplicate = async () => {
    if (!deck) return;
    setDuplicating(true);
    try {
      const newId = await deckService.duplicate(deck.id);
      toast({
        title: "Copied to your decks",
        description: `"${deck.name}" is now in My Decks as a private deck.`,
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

  const summary = useMemo(
    () => summariseDeck(deck?.deck_cards ?? [], ownership),
    [deck, ownership]
  );
  const sections = useMemo(() => groupSections(deck?.deck_cards ?? []), [deck]);
  const tokens = useMemo(() => deckTokens(deck?.deck_cards ?? [], tokenCards), [deck, tokenCards]);

  const exportText = useMemo(
    () =>
      formatDeckList(
        (deck?.deck_cards ?? []).map((row) => ({
          quantity: row.quantity,
          name: row.cards.name,
          section: row.section,
        }))
      ),
    [deck]
  );

  if (authLoading || loading) {
    return (
      <>
        <Navigation />
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        </div>
      </>
    );
  }

  if (!deck) {
    return (
      <>
        <SEO title="Deck not available" description="This deck is not available" />
        <Navigation />
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <main className="container mx-auto px-4 py-20 text-center">
            <Lock className="mx-auto h-10 w-10 text-slate-600" />
            <h1 className="mt-4 text-2xl font-bold text-white">This deck isn&apos;t available</h1>
            <p className="mx-auto mt-2 max-w-md text-slate-400">
              It may be private, or it may have been deleted. If someone sent you a
              link to it, use that link — it carries the permission.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button asChild variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white">
                <Link href="/decks/showcase">Browse the Showcase</Link>
              </Button>
              {!user && (
                <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
                  <Link href="/auth/login">Sign in</Link>
                </Button>
              )}
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title={deck.name} description={deck.description ?? "A Grand Archive deck"} />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />

        <main className="container mx-auto px-4 py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                asChild
                title="Back to decks"
                className="text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <Link href="/decks">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-bold text-white">{deck.name}</h1>
                {deck.description && (
                  <p className="truncate text-sm text-slate-400">{deck.description}</p>
                )}
                {!isOwner && (
                  <p className="text-sm text-slate-500">Someone else&apos;s deck, read only.</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <DeckExportDialog text={exportText} deckName={deck.name}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deck.deck_cards.length === 0}
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DeckExportDialog>

              {/* The owner gets the controls that change the deck; everyone else
                  gets the one that copies it. */}
              {isOwner ? (
                <>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                      >
                        {deck.is_public ? (
                          <Globe className="mr-2 h-4 w-4 text-cyan-400" />
                        ) : (
                          <Share2 className="mr-2 h-4 w-4" />
                        )}
                        {deck.is_public ? "Public" : "Share"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-700 bg-slate-900 text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">Who can see this deck</DialogTitle>
                        <DialogDescription className="text-slate-400">
                          Public decks appear on the Deck Showcase. Links work whatever
                          the setting, and can be revoked at any time.
                        </DialogDescription>
                      </DialogHeader>
                      <DeckVisibility
                        deckId={deck.id}
                        isPublic={!!deck.is_public}
                        onChange={reload}
                      />
                    </DialogContent>
                  </Dialog>

                  <Button asChild size="sm" className="bg-cyan-600 text-white hover:bg-cyan-700">
                    <Link href={`/decks/${deck.id}/edit`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit deck
                    </Link>
                  </Button>
                </>
              ) : user ? (
                <Button
                  size="sm"
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
                <Button asChild size="sm" className="bg-cyan-600 text-white hover:bg-cyan-700">
                  <Link href="/auth/login">Sign in to copy</Link>
                </Button>
              )}
            </div>
          </div>

          <DeckSummaryBar summary={summary} />

          {deck.deck_cards.length === 0 ? (
            <Card className="border-slate-700 bg-slate-800/50">
              <CardContent className="py-16 text-center">
                <p className="mb-4 text-slate-400">This deck is empty.</p>
                {isOwner && (
                  <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
                    <Link href={`/decks/${deck.id}/edit`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Add some cards
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sections.map(({ section, rows, copies }) => {
                if (rows.length === 0) return null;
                const points = summary.counts.find((count) => count.section === section);

                return (
                  <Card key={section} className="border-slate-700 bg-slate-800/50">
                    <CardContent className="p-3">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <h2 className="text-lg font-bold text-white">
                          {SECTION_LABELS[section]}
                        </h2>
                        <span className="text-sm text-slate-400">
                          {copies} card{copies === 1 ? "" : "s"}
                          {section === "sideboard" && points && ` · ${points.value} points`}
                        </span>
                      </div>

                      <div className={DECK_GRID}>
                        {rows.map((row) => (
                          <ViewCard
                            key={row.id}
                            row={row}
                            held={ownership.get(row.card_id)}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {tokens.length > 0 && (
                <Card className="border-slate-700 bg-slate-800/50">
                  <CardContent className="p-3">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h2 className="text-lg font-bold text-white">Tokens</h2>
                      <span className="text-sm text-slate-400">
                        created by this deck · not part of any count
                      </span>
                    </div>

                    <div className={DECK_GRID}>
                      {tokens.map((token) => (
                        <div
                          key={token.id}
                          className="overflow-hidden rounded border border-slate-700/70 bg-slate-900/40"
                        >
                          <CardImage
                            src={token.image_url}
                            alt={token.name}
                            variant="tile"
                            className="h-auto w-full object-contain"
                          />
                          <p
                            className="truncate px-1 py-1 text-center text-[11px] text-slate-400"
                            title={token.name}
                          >
                            {token.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

/**
 * A card as the view shows it: the art, the count, and a marker when the
 * collection cannot cover it. No controls — that is what the editor is for.
 */
function ViewCard({
  row,
  held,
}: {
  row: DeckCardWithCard;
  held: CardOwnership | undefined;
}) {
  const card = row.cards;
  const onHand = onHandFor(held, row.foil);
  const short = Math.max(0, row.quantity - onHand);

  return (
    <div className="overflow-hidden rounded border border-slate-700/70 bg-slate-900/40">
      <div className="relative">
        <CardImage
          src={card.image_url}
          alt={card.name}
          variant="tile"
          className="h-auto w-full object-contain"
        />

        {row.foil && (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute inset-0 animate-foil-shift bg-[linear-gradient(115deg,rgba(255,64,160,0.55),rgba(255,196,64,0.55),rgba(120,255,180,0.55),rgba(64,176,255,0.55),rgba(190,110,255,0.55),rgba(255,64,160,0.55))] bg-[length:300%_300%] mix-blend-overlay motion-reduce:animate-none" />
            <span className="absolute inset-y-0 left-0 w-1/2 animate-foil-sweep bg-[linear-gradient(100deg,transparent_0%,rgba(255,80,80,0.65)_18%,rgba(255,225,90,0.65)_34%,rgba(90,255,190,0.65)_50%,rgba(90,190,255,0.65)_66%,rgba(210,90,255,0.65)_82%,transparent_100%)] mix-blend-overlay motion-reduce:animate-none" />
          </span>
        )}

        <span className="absolute bottom-1 right-1 rounded bg-slate-950/85 px-1.5 py-0.5 text-xs font-semibold text-white">
          {row.quantity}
        </span>

        {short > 0 && (
          <HoverCard openDelay={100}>
            <HoverCardTrigger asChild>
              <span
                tabIndex={0}
                role="button"
                aria-label={`${card.name}: ${short} more needed`}
                className="absolute right-1 top-1 cursor-help rounded bg-amber-500 p-0.5 text-slate-900 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 border-slate-700 bg-slate-900 text-sm text-slate-200">
              <p className="font-medium text-white">{card.name}</p>
              <p className="mt-1 text-amber-300">{short} more needed</p>
              <p className="mt-1">
                This deck asks for {row.quantity} and you have {onHand} on hand
                {(held?.loaned ?? 0) > 0 && `, with ${held?.loaned} lent out`}.
              </p>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>

      <div className="px-1 py-1">
        <p className="truncate text-center text-xs font-medium text-white" title={card.name}>
          {card.name}
        </p>
        {(row.foil || card.is_restricted) && (
          <div className="mt-0.5 flex items-center justify-center gap-1">
            {row.foil && (
              <Badge className="gap-0.5 bg-cyan-500/20 px-1 py-0 text-[10px] text-cyan-200">
                <Sparkles className="h-2.5 w-2.5" />
                Foil
              </Badge>
            )}
            {card.is_restricted && (
              <Badge className="bg-amber-500/20 px-1 py-0 text-[10px] text-amber-300">
                Restricted
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
