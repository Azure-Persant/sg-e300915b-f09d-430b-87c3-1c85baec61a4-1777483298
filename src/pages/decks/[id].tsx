import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Check,
  FileDown,
  FileUp,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { DeckArtPicker } from "@/components/DeckArtPicker";
import { DeckExportDialog, DeckImportDialog, type ImportMode } from "@/components/DeckListTransfer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  DECK_SECTIONS,
  SECTION_LABELS,
  formatDeckList,
  type DeckListEntry,
  type DeckSection,
} from "@/lib/deckList";
import {
  RARITY_LABELS,
  cardService,
  type CardWithSet,
  type FilterOption,
  type Set as SetRow,
} from "@/services/cardService";
import { collectionService, type CardOwnership } from "@/services/collectionService";
import { deckService, type DeckCardWithCard, type DeckWithCards } from "@/services/deckService";

/** "LESSER BOON" -> "Lesser Boon", for the type dropdown labels. */
const toTitleCase = (text: string): string =>
  text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const EMPTY_OWNERSHIP: CardOwnership = {
  personal: 0,
  sale: 0,
  loaned: 0,
  total: 0,
  locations: [],
};

export default function DeckDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [deck, setDeck] = useState<DeckWithCards | null>(null);
  const [allCards, setAllCards] = useState<CardWithSet[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedSet, setSelectedSet] = useState<string>("all");
  const [selectedRarity, setSelectedRarity] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cardPage, setCardPage] = useState(1);
  const [cardPageCount, setCardPageCount] = useState(1);
  const [cardTotal, setCardTotal] = useState(0);
  const [typeOptions, setTypeOptions] = useState<FilterOption[]>([]);
  const [ownership, setOwnership] = useState<Map<string, CardOwnership>>(new Map());
  /** Which list the add dialog puts cards into. */
  const [addSection, setAddSection] = useState<DeckSection>("main");
  const cardsPerPage = 60;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && id) {
      loadDeck();
      loadReferenceData();
    }
  }, [user, id]);

  const loadDeck = async () => {
    if (!id || typeof id !== "string") return;
    try {
      setDeck(await deckService.getDeckById(id));
    } catch (error) {
      toast({
        title: "Could not load that deck",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadReferenceData = async () => {
    if (!user) return;
    try {
      const [setsData, ownershipMap, filterOptions] = await Promise.all([
        cardService.getAllSets(),
        // Summed across buckets and locations. This used to read the first
        // holding row only, so a card split between two boxes counted as
        // whatever happened to come back first.
        collectionService.getOwnershipMap(user.id),
        cardService.getFilterOptions(),
      ]);

      // Base expansions first, matching the precedence the card grid uses.
      setSets(setsData.slice().sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)));
      setTypeOptions(filterOptions.types);
      setOwnership(ownershipMap);
    } catch (error) {
      console.error("Error loading reference data:", error);
    }
  };

  const loadAllCards = async () => {
    try {
      // One page from Postgres, rather than looping the whole catalog on every
      // keystroke.
      const { rows, total } = await cardService.getCardsPage({
        page: cardPage,
        pageSize: cardsPerPage,
        search: debouncedSearch,
        setId: selectedSet === "all" ? undefined : selectedSet,
        rarity: selectedRarity === "all" ? undefined : selectedRarity,
        type: selectedType === "all" ? undefined : selectedType,
      });
      setAllCards(rows);
      setCardTotal(total);
      setCardPageCount(Math.max(1, Math.ceil(total / cardsPerPage)));
    } catch (error) {
      console.error("Error loading cards:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setCardPage(1);
  }, [debouncedSearch, selectedSet, selectedRarity, selectedType]);

  useEffect(() => {
    if (addCardDialogOpen) loadAllCards();
  }, [addCardDialogOpen, cardPage, debouncedSearch, selectedSet, selectedRarity, selectedType]);

  const withDeck = async (work: () => Promise<unknown>, failure: string) => {
    try {
      await work();
      await loadDeck();
    } catch (error) {
      toast({
        title: failure,
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddCard = (cardId: string, section: DeckSection) =>
    withDeck(
      () => deckService.addCardToDeck(deck!.id, cardId, 1, section),
      "Could not add that card"
    );

  const handleUpdateQuantity = (cardId: string, quantity: number, section: DeckSection) =>
    withDeck(
      () => deckService.updateDeckCard(deck!.id, cardId, quantity, section),
      "Could not change that quantity"
    );

  const handleMoveSection = (
    cardId: string,
    from: DeckSection,
    to: DeckSection,
    quantity: number
  ) =>
    withDeck(
      () => deckService.moveCardSection(deck!.id, cardId, from, to, quantity),
      "Could not move that card"
    );

  const handleImport = async (entries: DeckListEntry[], mode: ImportMode) => {
    const result = await deckService.importDeckList(deck!.id, user!.id, entries, {
      replace: mode === "replace",
    });
    await loadDeck();
    return result;
  };

  /** Rows grouped into the three lists, each sorted by name. */
  const sections = useMemo(() => {
    const cards = deck?.deck_cards ?? [];
    return DECK_SECTIONS.map((section) => ({
      section,
      rows: cards
        .filter((row) => row.section === section)
        .sort((a, b) => a.cards.name.localeCompare(b.cards.name)),
      copies: cards
        .filter((row) => row.section === section)
        .reduce((total, row) => total + row.quantity, 0),
    }));
  }, [deck]);

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

  /**
   * Copies the deck asks for against copies on hand.
   *
   * Cards lent out are counted as owned but not as available — they are
   * someone else's problem until they come back, and a deck you cannot
   * physically build is the thing this number exists to show.
   */
  const stats = useMemo(() => {
    let needed = 0;
    let available = 0;
    let lentOut = 0;

    for (const row of deck?.deck_cards ?? []) {
      const held = ownership.get(row.card_id) ?? EMPTY_OWNERSHIP;
      const onHand = held.personal + held.sale;
      needed += row.quantity;
      available += Math.min(row.quantity, onHand);
      if (held.loaned > 0 && onHand < row.quantity) {
        lentOut += Math.min(row.quantity - onHand, held.loaned);
      }
    }

    return { needed, available, missing: needed - available, lentOut };
  }, [deck, ownership]);

  if (authLoading || loading || !user || !deck) {
    return (
      <>
        <Navigation />
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title={deck.name} description={deck.description ?? "A Grand Archive deck"} />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />

        <main className="container mx-auto px-4 py-8">
          <Button
            variant="ghost"
            asChild
            className="mb-4 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Link href="/decks">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Decks
            </Link>
          </Button>

          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 text-4xl font-bold text-white">{deck.name}</h1>
              {deck.description && <p className="text-slate-400">{deck.description}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <DeckImportDialog onImport={handleImport} canReplace={deck.deck_cards.length > 0}>
                <Button
                  variant="outline"
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </DeckImportDialog>

              <DeckExportDialog text={exportText} deckName={deck.name}>
                <Button
                  variant="outline"
                  disabled={deck.deck_cards.length === 0}
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DeckExportDialog>

              <DeckArtPicker
                deckId={deck.id}
                currentCardId={deck.cover_card_id}
                onChange={loadDeck}
              >
                <Button
                  variant="outline"
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Deck art
                </Button>
              </DeckArtPicker>

              <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-cyan-600 text-white hover:bg-cyan-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Cards
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto border-slate-700 bg-slate-900 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white">Add cards to deck</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search..."
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          className="border-slate-700 bg-slate-800 pl-9 text-white placeholder:text-slate-500"
                        />
                      </div>

                      <Select value={selectedSet} onValueChange={setSelectedSet}>
                        <SelectTrigger className="border-slate-700 bg-slate-800 text-white">
                          <SelectValue placeholder="All Sets" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sets</SelectItem>
                          {sets.map((set) => (
                            <SelectItem key={set.id} value={set.id}>
                              {set.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={selectedRarity} onValueChange={setSelectedRarity}>
                        <SelectTrigger className="border-slate-700 bg-slate-800 text-white">
                          <SelectValue placeholder="All Rarities" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Rarities</SelectItem>
                          {/* Values are the codes stored in cards.rarity. */}
                          {Object.entries(RARITY_LABELS).map(([code, label]) => (
                            <SelectItem key={code} value={code}>
                              {label} ({code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={selectedType} onValueChange={setSelectedType}>
                        <SelectTrigger className="border-slate-700 bg-slate-800 text-white">
                          <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          {/* Driven by public.card_filter_options. */}
                          {typeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {toTitleCase(option.value)} ({option.count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={addSection}
                        onValueChange={(value) => setAddSection(value as DeckSection)}
                      >
                        <SelectTrigger className="border-cyan-700 bg-slate-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DECK_SECTIONS.map((section) => (
                            <SelectItem key={section} value={section}>
                              Add to {SECTION_LABELS[section]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-400">
                      <span>
                        {cardTotal === 0
                          ? "No printings match these filters"
                          : `${cardTotal} printing${cardTotal === 1 ? "" : "s"} match`}
                      </span>
                      {cardPageCount > 1 && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={cardPage <= 1}
                            onClick={() => setCardPage((page) => Math.max(1, page - 1))}
                            className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                          >
                            Previous
                          </Button>
                          <span>
                            Page {cardPage} of {cardPageCount}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={cardPage >= cardPageCount}
                            onClick={() =>
                              setCardPage((page) => Math.min(cardPageCount, page + 1))
                            }
                            className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="grid max-h-96 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                      {allCards.map((card) => {
                        const held = ownership.get(card.id);
                        return (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => {
                              handleAddCard(card.id, addSection);
                              setAddCardDialogOpen(false);
                            }}
                            className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50 text-left transition-colors hover:border-cyan-500/60"
                          >
                            <div className="relative aspect-[2.5/3.5] overflow-hidden bg-slate-900">
                              <CardImage
                                src={card.image_url}
                                alt={card.name}
                                variant="tile"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                              {held && held.total > 0 && (
                                <span className="absolute right-2 top-2 rounded-full bg-green-500 p-1 text-white">
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                            <div className="p-3">
                              <p className="line-clamp-1 text-sm font-semibold text-white">
                                {card.name}
                              </p>
                              {held && held.total > 0 && (
                                <p className="text-xs text-green-400">Own {held.total}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sections.map(({ section, copies }) => (
              <StatCard key={section} label={SECTION_LABELS[section]} value={copies} />
            ))}
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard label="Copies needed" value={stats.needed} />
            <StatCard label="On hand" value={stats.available} tone="green" />
            <StatCard
              label="Still missing"
              value={stats.missing}
              tone={stats.missing > 0 ? "amber" : "green"}
              note={stats.lentOut > 0 ? `${stats.lentOut} of them are lent out` : undefined}
            />
          </div>

          <div className="space-y-6">
            {sections.map(({ section, rows, copies }) => (
              <Card key={section} className="border-slate-700 bg-slate-800/50">
                <CardContent className="p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">
                      {SECTION_LABELS[section]}
                    </h2>
                    <span className="text-sm text-slate-400">
                      {copies} card{copies === 1 ? "" : "s"}
                    </span>
                  </div>

                  {rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">
                      Nothing here yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {rows.map((row) => (
                        <DeckRow
                          key={row.id}
                          row={row}
                          held={ownership.get(row.card_id) ?? EMPTY_OWNERSHIP}
                          onQuantity={(quantity) =>
                            handleUpdateQuantity(row.card_id, quantity, row.section)
                          }
                          onMove={(to) =>
                            handleMoveSection(row.card_id, row.section, to, row.quantity)
                          }
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  tone = "plain",
  note,
}: {
  label: string;
  value: number;
  tone?: "plain" | "green" | "amber";
  note?: string;
}) {
  const valueColor =
    tone === "green" ? "text-green-400" : tone === "amber" ? "text-amber-400" : "text-white";

  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardContent className="p-4">
        <p className="text-sm text-slate-400">{label}</p>
        <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </CardContent>
    </Card>
  );
}

function DeckRow({
  row,
  held,
  onQuantity,
  onMove,
}: {
  row: DeckCardWithCard;
  held: CardOwnership;
  onQuantity: (quantity: number) => void;
  onMove: (to: DeckSection) => void;
}) {
  const card = row.cards;
  const onHand = held.personal + held.sale;
  const missing = Math.max(0, row.quantity - onHand);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3 transition-colors hover:border-slate-600">
      <CardImage
        src={card.image_url}
        alt={card.name}
        variant="row"
        className="h-20 w-auto rounded"
      />

      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-white">{card.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="border-cyan-500 font-mono text-cyan-400">
            {card.sets?.code ?? "???"}
          </Badge>
          <span className="text-slate-400">{card.rarity}</span>
          {card.element && <span className="text-slate-400">{card.element}</span>}
          {card.sets?.name && <span className="text-slate-500">{card.sets.name}</span>}
        </div>
        {held.locations.length > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3" />
            {held.locations.join(", ")}
          </div>
        )}
      </div>

      <div className="text-right text-sm">
        {missing === 0 ? (
          <span className="flex items-center gap-1 text-green-400">
            <Check className="h-4 w-4" />
            Have all {row.quantity}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-400">
            <X className="h-4 w-4" />
            Need {missing} more
          </span>
        )}
        <p className="text-slate-500">
          {onHand} on hand
          {held.loaned > 0 && `, ${held.loaned} lent out`}
        </p>
      </div>

      <Select value={row.section} onValueChange={(value) => onMove(value as DeckSection)}>
        <SelectTrigger className="w-[150px] border-slate-700 bg-slate-800 text-xs text-slate-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DECK_SECTIONS.map((section) => (
            <SelectItem key={section} value={section}>
              {SECTION_LABELS[section]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          title={row.quantity === 1 ? "Remove from deck" : "One fewer"}
          onClick={() => onQuantity(row.quantity - 1)}
          className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center font-semibold text-white">{row.quantity}</span>
        <Button
          variant="outline"
          size="icon"
          title="One more"
          onClick={() => onQuantity(row.quantity + 1)}
          className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
