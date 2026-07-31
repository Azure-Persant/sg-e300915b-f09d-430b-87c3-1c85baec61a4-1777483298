import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  FileDown,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { DeckArtPicker } from "@/components/DeckArtPicker";
import { DeckExportDialog, DeckImportDialog, type ImportMode } from "@/components/DeckListTransfer";
import { PrintingPicker } from "@/components/PrintingPicker";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  MATERIAL_SIDEBOARD_POINTS,
  checkDeck,
  costFamily,
  homeSection,
  pointsFor,
  sectionCounts,
  sectionForCard,
  swapTarget,
  type RuleCard,
} from "@/lib/deckRules";
import { referencesToken } from "@/lib/deckImport";
import {
  RARITY_LABELS,
  cardService,
  type CardWithSet,
  type FilterOption,
  type Set as SetRow,
} from "@/services/cardService";
import { collectionService, type CardOwnership } from "@/services/collectionService";
import {
  deckService,
  type ArtOption,
  type DeckCardWithCard,
  type DeckWithCards,
} from "@/services/deckService";

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

/** Copies on hand — lent-out cards are owned but cannot be put in a deck. */
const onHandOf = (held: CardOwnership): number => held.personal + held.sale;

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
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  /** Every token printing in the catalog — a few dozen rows, fetched once. */
  const [tokenCards, setTokenCards] = useState<ArtOption[]>([]);
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
      const [setsData, ownershipMap, filterOptions, tokens] = await Promise.all([
        cardService.getAllSets(),
        // Summed across buckets and locations, rather than reading whichever
        // holding row came back first.
        collectionService.getOwnershipMap(user.id),
        cardService.getFilterOptions(),
        // The catalog's token cards, so the Tokens section can be worked out
        // from the deck's card text without a query per deck card.
        deckService.tokenPrintings(),
      ]);

      setSets(setsData.slice().sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)));
      setTypeOptions(filterOptions.types);
      setOwnership(ownershipMap);
      setTokenCards(tokens);
    } catch (error) {
      console.error("Error loading reference data:", error);
    }
  };

  const loadAllCards = async () => {
    try {
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

  /**
   * Where a card goes is decided by what it is, not by asking. Champions and
   * regalia are material deck cards; everything else starts in the main deck and
   * can be moved to the sideboard afterwards.
   */
  const handleAddCard = (card: CardWithSet) =>
    withDeck(
      () => deckService.addCardToDeck(deck!.id, card.id, 1, sectionForCard(card, "main")),
      "Could not add that card"
    );

  const handleUpdateQuantity = (cardId: string, quantity: number, section: DeckSection) =>
    withDeck(
      () => deckService.updateDeckCard(deck!.id, cardId, quantity, section),
      "Could not change that quantity"
    );

  const handleMoveCopies = (
    cardId: string,
    from: DeckSection,
    to: DeckSection,
    copies: number,
    heldInFrom: number
  ) =>
    withDeck(
      () => deckService.moveCopies(deck!.id, cardId, from, to, copies, heldInFrom),
      "Could not move those copies"
    );

  const handleSwapPrinting = (section: DeckSection, fromCardId: string, toCardId: string) =>
    withDeck(
      () => deckService.swapPrinting(deck!.id, section, fromCardId, toCardId),
      "Could not change the printing"
    );

  const handleImport = async (entries: DeckListEntry[], mode: ImportMode) => {
    const result = await deckService.importDeckList(deck!.id, user!.id, entries, {
      replace: mode === "replace",
    });
    await loadDeck();
    return result;
  };

  const handleRename = async () => {
    const name = draftName.trim();
    if (!deck || !name || name === deck.name) {
      setRenaming(false);
      return;
    }
    await withDeck(() => deckService.updateDeck(deck.id, { name }), "Could not rename the deck");
    setRenaming(false);
  };

  /** What the rules need, derived once from the loaded deck. */
  const ruleCards = useMemo<RuleCard[]>(
    () =>
      (deck?.deck_cards ?? []).map((row) => ({
        cardId: row.card_id,
        name: row.cards.name,
        types: row.cards.types,
        costMemory: row.cards.cost_memory,
        costReserve: row.cards.cost_reserve,
        isRestricted: row.cards.is_restricted,
        quantity: row.quantity,
        section: row.section,
      })),
    [deck]
  );

  const problems = useMemo(() => checkDeck(ruleCards), [ruleCards]);
  const counts = useMemo(() => sectionCounts(ruleCards), [ruleCards]);
  const errors = problems.filter((problem) => problem.severity === "error");

  /**
   * Tokens the deck creates, one preview each.
   *
   * Read from the deck's own card text against the catalog's token cards, which
   * is the relationship this app already has — no card names are hardcoded.
   * Informational only: nothing here reaches the rules, the counts, the
   * sideboard points or the inventory check.
   */
  const tokens = useMemo(() => {
    const effectText = (deck?.deck_cards ?? [])
      .map((row) => row.cards.effect_text ?? "")
      .join("\n");
    if (!effectText.trim()) return [];

    const byName = new Map<string, (typeof tokenCards)[number]>();
    for (const token of tokenCards) {
      if (byName.has(token.name)) continue;
      if (referencesToken(effectText, token.name)) byName.set(token.name, token);
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [deck, tokenCards]);

  const sections = useMemo(() => {
    const cards = deck?.deck_cards ?? [];
    return DECK_SECTIONS.map((section) => {
      const rows = cards
        .filter((row) => row.section === section)
        .sort((a, b) => a.cards.name.localeCompare(b.cards.name));
      return {
        section,
        rows,
        copies: rows.reduce((total, row) => total + row.quantity, 0),
      };
    });
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
   * Which cards the deck asks for more of than the collection holds, and by how
   * many. Aggregated by name, because "I need two more Cinder Geyser" is the
   * useful statement even when the deck lists two printings of it.
   */
  const missing = useMemo(() => {
    const byName = new Map<string, number>();

    for (const row of deck?.deck_cards ?? []) {
      const held = ownership.get(row.card_id) ?? EMPTY_OWNERSHIP;
      const short = row.quantity - onHandOf(held);
      if (short > 0) byName.set(row.cards.name, (byName.get(row.cards.name) ?? 0) + short);
    }

    const entries = [...byName.entries()]
      .map(([name, copies]) => ({ name, copies }))
      .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));

    return {
      entries,
      copies: entries.reduce((total, entry) => total + entry.copies, 0),
    };
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

              {renaming ? (
                <Input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleRename();
                    if (event.key === "Escape") setRenaming(false);
                  }}
                  className="h-10 max-w-md border-slate-600 bg-slate-800 text-2xl font-bold text-white"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(deck.name);
                    setRenaming(true);
                  }}
                  title="Rename this deck"
                  className="group flex min-w-0 items-center gap-2 text-left"
                >
                  <h1 className="truncate text-3xl font-bold text-white">{deck.name}</h1>
                  <Pencil className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-cyan-400" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <DeckImportDialog onImport={handleImport} canReplace={deck.deck_cards.length > 0}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </DeckImportDialog>

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

              <DeckArtPicker
                deckId={deck.id}
                currentCardId={deck.cover_card_id}
                onChange={loadDeck}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Deck art
                </Button>
              </DeckArtPicker>

              <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-cyan-600 text-white hover:bg-cyan-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Cards
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto border-slate-700 bg-slate-900 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white">Add cards to deck</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
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
                          {typeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {toTitleCase(option.value)} ({option.count})
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
                              handleAddCard(card);
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
                            <div className="p-2">
                              <p className="line-clamp-1 text-sm font-semibold text-white">
                                {card.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {homeSection(card) === "material"
                                  ? "→ Material Deck"
                                  : homeSection(card) === "main"
                                    ? "→ Main Deck"
                                    : "→ no cost, section unknown"}
                              </p>
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

          {/* One compact strip in place of seven stat cards. */}
          <Card className="mb-6 border-slate-700 bg-slate-800/50">
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
              {counts.map((count) => (
                <div key={count.section}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{count.label}</p>
                  {/* The sideboard is measured in points, so it shows points and
                      keeps the card count as the smaller line beneath. */}
                  <p className={`text-xl font-bold ${count.ok ? "text-white" : "text-amber-400"}`}>
                    {count.value}
                    {count.target !== null && (
                      <span className="text-sm font-normal text-slate-500">
                        {count.section === "main" ? " / min " : " / "}
                        {count.target}
                        {count.unit === "points" && " pts"}
                      </span>
                    )}
                  </p>
                  {count.unit === "points" && (
                    <p className="text-xs text-slate-500">
                      {count.copies} card{count.copies === 1 ? "" : "s"}
                      {" · material cards cost "}
                      {MATERIAL_SIDEBOARD_POINTS}
                    </p>
                  )}
                </div>
              ))}

              <div className="hidden h-10 w-px bg-slate-700 sm:block" />

              <HoverCard openDelay={100}>
                <HoverCardTrigger asChild>
                  <div className="cursor-help">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Cards Missing from Inventory
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        missing.copies > 0
                          ? "text-amber-400 underline decoration-dotted underline-offset-4"
                          : "text-green-400"
                      }`}
                    >
                      {missing.copies}
                    </p>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="max-h-80 w-80 overflow-y-auto border-slate-700 bg-slate-900 text-slate-200">
                  {missing.entries.length === 0 ? (
                    <p className="text-sm">
                      Every card in this deck is in your collection and on hand.
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 text-sm font-medium text-white">
                        Missing {missing.copies} card{missing.copies === 1 ? "" : "s"}
                      </p>
                      <ul className="space-y-1 text-sm">
                        {missing.entries.map((entry) => (
                          <li key={entry.name} className="flex justify-between gap-3">
                            <span className="truncate">{entry.name}</span>
                            <span className="shrink-0 text-amber-400">{entry.copies}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-slate-500">
                        Copies lent out are not counted as on hand.
                      </p>
                    </>
                  )}
                </HoverCardContent>
              </HoverCard>

              <div className="ml-auto">
                <HoverCard openDelay={100}>
                  <HoverCardTrigger asChild>
                    {errors.length === 0 ? (
                      <Badge className="cursor-help gap-1 bg-green-600/20 text-green-300 hover:bg-green-600/30">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Deck is legal
                      </Badge>
                    ) : (
                      <Badge className="cursor-help gap-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {errors.length} rule issue{errors.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </HoverCardTrigger>
                  <HoverCardContent className="w-96 border-slate-700 bg-slate-900 text-slate-200">
                    {problems.length === 0 ? (
                      <p className="text-sm">
                        Nothing to flag: sizes, copy limits and the restricted list all check
                        out.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {problems.map((problem) => (
                          <li key={problem.message} className="flex gap-2">
                            <AlertTriangle
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                problem.severity === "error"
                                  ? "text-amber-400"
                                  : "text-slate-500"
                              }`}
                            />
                            <span>{problem.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 border-t border-slate-700 pt-2 text-xs text-slate-500">
                      Champion levels and element or class matching are not checked — the
                      catalog does not carry that yet.
                    </p>
                  </HoverCardContent>
                </HoverCard>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {sections.map(({ section, rows, copies }) => {
              const points = counts.find((count) => count.section === section);
              return (
                <Card key={section} className="border-slate-700 bg-slate-800/50">
                  <CardContent className="p-3">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h2 className="text-lg font-bold text-white">{SECTION_LABELS[section]}</h2>
                      <span className="text-sm text-slate-400">
                        {copies} card{copies === 1 ? "" : "s"}
                        {section === "sideboard" && points && ` · ${points.value} points`}
                      </span>
                    </div>

                    {rows.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-500">Nothing here yet.</p>
                    ) : (
                      <div className={DECK_GRID}>
                        {rows.map((row) => (
                          <DeckCard
                            key={row.id}
                            row={row}
                            held={ownership.get(row.card_id) ?? EMPTY_OWNERSHIP}
                            onQuantity={(quantity) =>
                              handleUpdateQuantity(row.card_id, quantity, row.section)
                            }
                            onMove={(to, copiesToMove) =>
                              handleMoveCopies(
                                row.card_id,
                                row.section,
                                to,
                                copiesToMove,
                                row.quantity
                              )
                            }
                            onSwapPrinting={(toCardId) =>
                              handleSwapPrinting(row.section, row.card_id, toCardId)
                            }
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Tokens the deck creates. Shown only when there are any, and never
                counted: no deck size, no sideboard points, no inventory, no copy
                limit. There is nothing to adjust, so no controls. */}
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
        </main>
      </div>
    </>
  );
}

/**
 * Twelve tiles across on a wide desktop, down to two on a phone. The count is
 * per breakpoint rather than auto-fit because the row of controls under each card
 * has a floor below which it stops being usable, and auto-fit would happily go
 * past it.
 */
const DECK_GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-12";

/**
 * One card in a deck: its art, then the controls.
 *
 * The image is width-driven with an automatic height and object-contain, so the
 * whole card is visible at every column count — no fixed height, nothing cropped.
 */
function DeckCard({
  row,
  held,
  onQuantity,
  onMove,
  onSwapPrinting,
}: {
  row: DeckCardWithCard;
  held: CardOwnership;
  onQuantity: (quantity: number) => void;
  onMove: (to: DeckSection, copies: number) => void;
  onSwapPrinting: (toCardId: string) => Promise<void>;
}) {
  const card = row.cards;
  const onHand = onHandOf(held);
  const short = Math.max(0, row.quantity - onHand);

  /**
   * Where the swap sends it, from the card's cost rather than the list it is in.
   * A sideboarded regalia goes back to the material deck; it used to go to the
   * main deck, because the old rule was "sideboard means main".
   */
  const target = swapTarget(card, row.section);
  const family = costFamily(card);
  const sideboardCost = pointsFor({ ...toRuleCard(row), quantity: 1 });

  return (
    <div className="overflow-hidden rounded border border-slate-700/70 bg-slate-900/40 transition-colors hover:border-slate-600">
      <div className="relative">
        <PrintingPicker
          cardName={card.name}
          currentCardId={row.card_id}
          onSelect={onSwapPrinting}
        >
          <button
            type="button"
            title={`${card.name} — click to change the art`}
            aria-label={`Change the printing of ${card.name}`}
            className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <CardImage
              src={card.image_url}
              alt={card.name}
              variant="tile"
              className="h-auto w-full object-contain"
            />
          </button>
        </PrintingPicker>

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
                {held.loaned > 0 && `, with ${held.loaned} lent out`}.
              </p>
              {held.locations.length > 0 && (
                <p className="mt-1 text-slate-400">In: {held.locations.join(", ")}</p>
              )}
            </HoverCardContent>
          </HoverCard>
        )}
      </div>

      <div className="flex items-center justify-center gap-0.5 px-1 py-1">
        {/* Every section gets a swap, the material deck included — a spare
            regalia is a normal sideboard card. Disabled only when the catalog
            gives no cost to derive a destination from. */}
        {target ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title={`Move copies to the ${SECTION_LABELS[target].toLowerCase()}`}
                aria-label={`Move copies of ${card.name} to the ${SECTION_LABELS[target]}`}
                className="h-6 w-6 shrink-0 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto border-slate-700 bg-slate-900 p-3 text-slate-200">
              <p className="mb-2 text-sm">
                Move to <span className="font-medium text-white">{SECTION_LABELS[target]}</span>
              </p>
              {target === "sideboard" && (
                <p className="mb-2 text-xs text-slate-400">
                  {sideboardCost} sideboard point{sideboardCost === 1 ? "" : "s"} per copy
                </p>
              )}
              <div className="flex gap-1">
                {Array.from({ length: row.quantity }, (_, index) => index + 1).map((copies) => (
                  <Button
                    key={copies}
                    size="sm"
                    variant="outline"
                    onClick={() => onMove(target, copies)}
                    className="h-8 w-8 border-slate-600 p-0 text-slate-200 hover:bg-cyan-600 hover:text-white"
                  >
                    {copies}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <HoverCard openDelay={100}>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled
                aria-label={`${card.name} cannot be moved: no cost in the catalog`}
                className="h-6 w-6 shrink-0 text-slate-600"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 border-slate-700 bg-slate-900 text-sm text-slate-200">
              {card.name} has neither a memory nor a reserve cost in the catalog, so
              there is no way to tell which deck it belongs to. Moving it is disabled
              rather than guessing.
            </HoverCardContent>
          </HoverCard>
        )}

        <Button
          variant="ghost"
          size="icon"
          title={row.quantity === 1 ? "Remove from deck" : "One fewer"}
          aria-label={`One fewer ${card.name}`}
          onClick={() => onQuantity(row.quantity - 1)}
          className="h-6 w-6 shrink-0 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <span className="w-4 text-center text-xs font-semibold text-white">{row.quantity}</span>

        <Button
          variant="ghost"
          size="icon"
          title="One more"
          aria-label={`One more ${card.name}`}
          onClick={() => onQuantity(row.quantity + 1)}
          className="h-6 w-6 shrink-0 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Kept for the restricted marker only; the set code and rarity moved out
          when the tiles became art-first. */}
      {(card.is_restricted || family === "unknown") && (
        <p className="px-1 pb-1 text-center text-[10px] leading-tight text-amber-300">
          {card.is_restricted ? "Restricted" : "No cost"}
        </p>
      )}
    </div>
  );
}

/** The rules-shaped view of a deck row, for the per-copy point cost. */
function toRuleCard(row: DeckCardWithCard): RuleCard {
  return {
    cardId: row.card_id,
    name: row.cards.name,
    types: row.cards.types,
    costMemory: row.cards.cost_memory,
    costReserve: row.cards.cost_reserve,
    isRestricted: row.cards.is_restricted,
    quantity: row.quantity,
    section: row.section,
  };
}
