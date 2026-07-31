import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { CollectionShares } from "@/components/CollectionShares";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Plus, Pencil, Share2, Trash2, Package, ChevronLeft, ChevronRight, Image as ImageIcon, FolderInput, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  BUCKETS,
  BUCKET_LABELS,
  collectionService,
  type CollectionBucket,
  type CollectionStats,
  type Holding,
  type PlaceInput,
} from "@/services/collectionService";
import {
  cardService,
  type Card as CardType,
  type CardWithSet,
  type Set as SetType,
} from "@/services/cardService";

// Helper function to convert text to Title Case
const toTitleCase = (text: string | null | undefined): string => {
  if (!text) return "";
  return text
    .split(" ")
    .map(word => {
      if (word === "—") return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

// Set codes come from sets.code, which holds the real acronym the API publishes
// as set.prefix ("MRC", "ALCSD"). This used to build initials from the set name
// instead, which produced "MH" for Mercurial Heart and "ARSD" for Alchemical
// Revolution Starter Decks.

export default function CollectionPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [collection, setCollection] = useState<Holding[]>([]);
  const [sets, setSets] = useState<Map<string, SetType>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<CollectionStats>({
    uniqueCards: 0,
    totalQuantity: 0,
    personalQuantity: 0,
    forSaleQuantity: 0,
    forSaleCards: 0,
    loanedQuantity: 0,
    loanedCards: 0,
    foilQuantity: 0,
    foilCards: 0,
    locations: [],
  });
  
  // Grouped collection by card name with printing details
  interface GroupedCard {
    /** Grid key: one tile per card name per finish. */
    key: string;
    cardName: string;
    /** True for the foil tile of a card owned in both finishes. */
    foil: boolean;
    printings: Array<{
      item: Holding;
      setCode: string;
      setName: string;
    }>;
    totalQuantity: number;
    representativeCard: CardType;
  }
  const [groupedCollection, setGroupedCollection] = useState<GroupedCard[]>([]);
  /** Chosen preview printing per card name — see collection_previews. */
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  /** Tiles ticked for a bulk move, by grid key. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLocation, setBulkLocation] = useState("");
  const [moving, setMoving] = useState(false);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedGroupedCard, setSelectedGroupedCard] = useState<GroupedCard | null>(null);
  // One entry per place, not per printing: a printing can sit in several places.
  const [editPlaces, setEditPlaces] = useState<
    Array<{
      cardId: string;
      setCode: string;
      bucket: CollectionBucket;
      location: string;
      quantity: number;
      foil: boolean;
    }>
  >([]);
  const [editCardIds, setEditCardIds] = useState<Array<{ cardId: string; setCode: string }>>([]);
  
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [selectedPrintingId, setSelectedPrintingId] = useState<string>("");
  const [cardPrintings, setCardPrintings] = useState<CardWithSet[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    } else if (user) {
      loadSets();
    }
  }, [user, authLoading]);

  // Load collection after sets are loaded
  useEffect(() => {
    if (user && sets.size > 0) {
      loadCollection();
    }
  }, [user, sets]);

  const loadSets = async () => {
    try {
      const data = await cardService.getAllSets();
      const setsMap = new Map<string, SetType>();
      data.forEach(set => setsMap.set(set.id, set));
      setSets(setsMap);
    } catch (error) {
      console.error("Failed to load sets:", error);
    }
  };

  const loadCollection = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const [collectionData, statsData, previewChoices] = await Promise.all([
        collectionService.getCollection(user.id),
        collectionService.getCollectionStats(user.id),
        collectionService.getPreviewChoices(user.id),
      ]);

      setCollection(collectionData);
      setStats(statsData);
      setPreviews(previewChoices);
      
      // Group by card name
      const grouped = new Map<string, GroupedCard>();
      
      collectionData.forEach(item => {
        if (!item.card) return;
        
        const cardName = item.card.name;
        const set = sets.get(item.card.set_id);

        const setName = set?.name || "Unknown";
        const setCode = set?.code || "???";
        // Foil copies are their own tile: the point of recording the finish is
        // being able to see it, and a shimmering duplicate is how it shows.
        const key = `${cardName}|${item.foil ? "foil" : "plain"}`;

        if (!grouped.has(key)) {
          grouped.set(key, {
            key,
            cardName,
            foil: item.foil,
            printings: [],
            totalQuantity: 0,
            representativeCard: item.card,
          });
        }

        const group = grouped.get(key)!;
        group.printings.push({
          item,
          setCode,
          setName,
        });
        if (item.bucket === 'personal') group.totalQuantity += item.quantity;
      });

      // Apply the owner's chosen art. Done after grouping rather than during it,
      // because the chosen printing is not necessarily the first one seen. A
      // choice for a printing they no longer hold is ignored rather than
      // deleted — giving a card away should not throw the preference away.
      for (const group of grouped.values()) {
        const chosenId = previewChoices.get(group.cardName);
        if (!chosenId) continue;
        const chosen = group.printings.find((p) => p.item.card_id === chosenId);
        if (chosen?.item.card) group.representativeCard = chosen.item.card;
      }

      // Name first, then plain before foil, so the two tiles of one card sit
      // next to each other.
      setGroupedCollection(Array.from(grouped.values()).sort((a, b) =>
        a.cardName.localeCompare(b.cardName) || Number(a.foil) - Number(b.foil)
      ));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load collection",
      });
    } finally {
      setLoading(false);
    }
  };

  /** Whether this printing is the one the grid shows for the open card. */
  const isPreviewChoice = (cardId: string): boolean =>
    !!selectedGroupedCard && previews.get(selectedGroupedCard.cardName) === cardId;

  /**
   * Pick the art for the open card, or clear the choice if this printing is
   * already it. Written straight away rather than on Save, because it is a
   * display preference and nothing else in this dialog depends on it.
   */
  const handleChoosePreview = async (cardId: string) => {
    if (!user || !selectedGroupedCard) return;
    const cardName = selectedGroupedCard.cardName;
    const clearing = isPreviewChoice(cardId);

    try {
      if (clearing) {
        await collectionService.clearPreviewChoice(user.id, cardName);
      } else {
        await collectionService.setPreviewChoice(user.id, cardName, cardId);
      }

      setPreviews((current) => {
        const next = new Map(current);
        if (clearing) next.delete(cardName);
        else next.set(cardName, cardId);
        return next;
      });

      await loadCollection();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not change the preview",
      });
    }
  };

  const toggleSelected = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * Move every place behind the ticked tiles to one location.
   *
   * Loans are left alone by the service — their location names the person
   * holding the cards, so sweeping them into "Box 3" would be a lie — and it
   * says how many it skipped so the count adding up is explicable.
   */
  const handleBulkMove = async () => {
    const place = bulkLocation.trim();
    if (!place || selected.size === 0) return;

    const ids = filteredCollection
      .filter((group) => selected.has(group.key))
      .flatMap((group) => group.printings.map((printing) => printing.item.id));

    setMoving(true);
    try {
      const result = await collectionService.moveHoldings(ids, place);
      const skipped = result.skippedLoans
        ? ` ${result.skippedLoans} lent-out ${result.skippedLoans === 1 ? "place" : "places"} left alone.`
        : "";
      const mergedNote = result.merged
        ? ` ${result.merged} merged with copies already there.`
        : "";

      toast({
        title: result.moved ? `Moved to ${place}` : "Nothing to move",
        description: result.moved
          ? `${result.moved} ${result.moved === 1 ? "place" : "places"} moved.${mergedNote}${skipped}`
          : `Everything selected was already there or lent out.${skipped}`,
      });

      setSelected(new Set());
      setBulkLocation("");
      await loadCollection();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not move those cards",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setMoving(false);
    }
  };

  /**
   * Open the editor for a card, covering every place it sits in — both finishes,
   * not just the tile that was clicked.
   *
   * This has to be the whole card. Saving calls setCardHoldings, which replaces
   * every place for a printing with exactly what the dialog submits, so a dialog
   * showing only the foil places would have deleted the plain ones on save. The
   * same applies to the trash icon, which removes a printing outright. The finish
   * is editable per row instead, which is where it belongs.
   */
  const handleEditCard = (groupedCard: GroupedCard) => {
    setSelectedGroupedCard(groupedCard);

    const held = collection.filter((item) => item.card?.name === groupedCard.cardName);

    const setCodeOf = (item: Holding) =>
      (item.card && sets.get(item.card.set_id)?.code) || "???";

    // One block per printing, however many places it has.
    const printings = new Map<string, string>();
    for (const item of held) printings.set(item.card_id, setCodeOf(item));

    setEditCardIds([...printings].map(([cardId, setCode]) => ({ cardId, setCode })));
    setEditPlaces(
      held.map((item) => ({
        cardId: item.card_id,
        setCode: setCodeOf(item),
        bucket: item.bucket,
        location: item.location,
        quantity: item.quantity,
        foil: item.foil,
      }))
    );
    setEditDialogOpen(true);
  };

  const updatePlace = (index: number, patch: Partial<(typeof editPlaces)[number]>) => {
    setEditPlaces((prev) => prev.map((place, i) => (i === index ? { ...place, ...patch } : place)));
  };

  const addPlace = (cardId: string, setCode: string, bucket: CollectionBucket) => {
    setEditPlaces((prev) => [
      ...prev,
      { cardId, setCode, bucket, location: "", quantity: 1, foil: false },
    ]);
  };

  const dropPlace = (index: number) => {
    setEditPlaces((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!user || !selectedGroupedCard) return;

    // The database rejects a loan with no holder; name the field rather than
    // surfacing a constraint violation.
    const unnamed = editPlaces.find(
      (p) => p.bucket === "loaned" && p.quantity > 0 && !p.location.trim()
    );
    if (unnamed) {
      toast({
        variant: "destructive",
        title: "Who has it?",
        description: `Say who is holding the lent ${unnamed.setCode} copies, or remove that row.`,
      });
      return;
    }

    try {
      // Per printing, because each is its own card_id in the database. A printing
      // with no places left is removed entirely.
      await Promise.all(
        editCardIds.map(({ cardId }) => {
          const places: PlaceInput[] = editPlaces
            .filter((p) => p.cardId === cardId && p.quantity > 0)
            .map((p) => ({
              bucket: p.bucket,
              location: p.location,
              quantity: p.quantity,
              foil: p.foil,
            }));
          return collectionService.setCardHoldings(user.id, cardId, places);
        })
      );

      toast({ title: "Updated", description: "Collection updated successfully" });
      setEditDialogOpen(false);
      loadCollection();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update card",
      });
    }
  };

  const handleRemovePrinting = async (cardId: string) => {
    if (!user) return;

    try {
      await collectionService.removeCard(user.id, cardId);
      toast({
        title: "Removed",
        description: "Printing removed from collection",
      });
      
      const remaining = editCardIds.filter((p) => p.cardId !== cardId);
      setEditCardIds(remaining);
      setEditPlaces((prev) => prev.filter((p) => p.cardId !== cardId));

      if (remaining.length === 0) setEditDialogOpen(false);
      loadCollection();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to remove printing",
      });
    }
  };

  const handleCardClick = async (card: CardType) => {
    try {
      // Ask for this card's printings rather than downloading the catalog and
      // filtering by name in the browser, which cost ~3.6 MB to find two rows.
      const printings = await cardService.getPrintingsForName(card.name);
      setCardPrintings(printings);
      setSelectedCard(card);
      setSelectedPrintingId(card.id);
      setCardDetailOpen(true);
    } catch (error) {
      console.error("Error loading card printings:", error);
    }
  };

  const getSetCode = (card: CardType): string => {
    const set = sets.get(card.set_id);
    return set?.code || "???";
  };

  const filteredCollection = searchQuery
    ? groupedCollection.filter(group =>
        group.cardName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : groupedCollection;

  const printingIndex = Math.max(
    0,
    cardPrintings.findIndex((p) => p.id === selectedPrintingId)
  );
  const currentCard = cardPrintings[printingIndex] ?? selectedCard;

  /** Wraps at both ends, so the arrows never dead-end on the first or last printing. */
  const stepPrinting = (delta: number) => {
    const count = cardPrintings.length;
    if (count === 0) return;
    const next = (printingIndex + delta + count) % count;
    setSelectedPrintingId(cardPrintings[next].id);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <>
      <SEO
        title="My Collection - Grand Archive TCG"
        description="Manage your Grand Archive TCG card collection"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />
        
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">My Collection</h1>
              <div className="flex items-center gap-6 mt-3">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-cyan-400" />
                  <span className="text-slate-300">
                    <span className="font-semibold text-white">{stats.uniqueCards}</span> unique cards
                  </span>
                </div>
                <div className="text-slate-300">
                  <span className="font-semibold text-white">{stats.totalQuantity}</span> total cards
                </div>
                {stats.loanedQuantity > 0 && (
                  <div className="text-violet-400">
                    <span className="font-semibold">{stats.loanedQuantity}</span> lent out
                    <span className="text-slate-400">
                      {" "}across {stats.loanedCards}{" "}
                      {stats.loanedCards === 1 ? "printing" : "printings"}
                    </span>
                  </div>
                )}
                {stats.forSaleQuantity > 0 && (
                  <div className="text-amber-400">
                    <span className="font-semibold">{stats.forSaleQuantity}</span> for sale
                    <span className="text-slate-400">
                      {" "}across {stats.forSaleCards}{" "}
                      {stats.forSaleCards === 1 ? "printing" : "printings"}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Sharing is occasional, so it opens rather than occupying the
                  top of the page. The panel itself is unchanged — it keeps its
                  own card and heading and the dialog only positions it, which
                  is why DialogContent is a bare frame. The title is present but
                  visually hidden: the panel already shows "Sharing", and a
                  dialog with no title at all is unlabelled for screen readers. */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Sharing
                  </Button>
                </DialogTrigger>
                {/* Opaque: the panel's own card is bg-slate-800/50, which read
                    as solid over the page background but not over a see-through
                    dialog. This gives that 50% something to sit on. */}
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-0 bg-slate-900 p-0 shadow-none">
                  <DialogTitle className="sr-only">Sharing</DialogTitle>
                  <CollectionShares userId={user.id} />
                </DialogContent>
              </Dialog>

              <Button
                onClick={() => router.push("/cards")}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Cards
              </Button>
            </div>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
              <Input
                type="text"
                placeholder="Search your collection..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Only present once something is ticked, so it costs nothing the rest
              of the time. Sticky, because the tiles being selected are usually
              further down the page than the button that acts on them. */}
          {selected.size > 0 && (
            <div className="sticky top-16 z-40 mb-6 rounded-lg border border-cyan-500/60 bg-slate-900/95 p-3 shadow-lg backdrop-blur">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-white">
                  {selected.size} card{selected.size === 1 ? "" : "s"} selected
                </span>

                <div className="flex min-w-[220px] flex-1 items-center gap-2">
                  <Input
                    value={bulkLocation}
                    onChange={(event) => setBulkLocation(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && bulkLocation.trim()) handleBulkMove();
                    }}
                    placeholder="Move to... e.g. Box 3"
                    aria-label="Location to move the selected cards to"
                    className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
                  />
                  <Button
                    onClick={handleBulkMove}
                    disabled={!bulkLocation.trim() || moving}
                    className="bg-cyan-600 text-white hover:bg-cyan-700"
                  >
                    {moving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FolderInput className="mr-2 h-4 w-4" />
                    )}
                    Move
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                  className="text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>

              {/* The places already in use, so a bulk move does not need the
                  name typed exactly right from memory. */}
              {stats.locations.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500">Existing:</span>
                  {stats.locations.map((place) => (
                    <button
                      key={place}
                      type="button"
                      onClick={() => setBulkLocation(place)}
                      className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:border-cyan-500 hover:text-white"
                    >
                      {place}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : filteredCollection.length === 0 ? (
            <div className="text-center py-20">
              <Package className="h-16 w-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 text-lg mb-4">
                {searchQuery ? "No cards found in your collection" : "Your collection is empty"}
              </p>
              <Button
                onClick={() => router.push("/cards")}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Cards
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {filteredCollection.map((group) => {
                const picked = selected.has(group.key);
                return (
                  <Card
                    key={group.key}
                    className={`overflow-hidden border-slate-700 bg-slate-800 ${
                      picked ? "ring-2 ring-cyan-400" : ""
                    }`}
                  >
                    {/* Art first: the name, set code, per-printing counts and
                        locations that used to sit beside it are reached through
                        Edit, which is where they are acted on anyway. */}
                    <CardContent className="p-2">
                      <button
                        type="button"
                        onClick={() => handleCardClick(group.representativeCard)}
                        title={group.cardName}
                        aria-label={`View ${group.cardName}${group.foil ? " (foil)" : ""}`}
                        className="group relative block aspect-[2.5/3.5] w-full overflow-hidden rounded bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                      >
                        {group.representativeCard.image_url ? (
                          <CardImage
                            src={group.representativeCard.image_url}
                            alt={group.cardName}
                            variant="tile"
                            className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          /* Keeps every tile the same height when a printing has
                             no art, and is the one place the name still shows —
                             there would otherwise be nothing to identify it by. */
                          <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-slate-500">
                            {group.cardName}
                          </span>
                        )}

                        {/* The foil treatment: a rainbow wash over the art plus a
                            highlight that sweeps across, as a foil does when it
                            catches the light. Purely decorative, so it is hidden
                            from screen readers and the "Foil" badge below carries
                            the meaning instead — colour and motion should not be
                            the only way to tell. The sweep stops for anyone who
                            asked for reduced motion. */}
                        {group.foil && (
                          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                            {/* The rainbow mask. Overlay rather than color-dodge:
                                dodge is base / (1 - blend), which clips to white
                                wherever the art is bright, so the tint survived
                                only in the darkest corner and the rest went hazy.
                                Overlay keeps the art's lights and darks and tints
                                them instead. The gradient is oversized so its
                                hues can drift across without showing an edge. */}
                            <span className="absolute inset-0 animate-foil-shift bg-[linear-gradient(115deg,rgba(255,64,160,0.55),rgba(255,196,64,0.55),rgba(120,255,180,0.55),rgba(64,176,255,0.55),rgba(190,110,255,0.55),rgba(255,64,160,0.55))] bg-[length:300%_300%] mix-blend-overlay motion-reduce:animate-none" />

                            {/* The travelling band, rainbow rather than white so
                                the movement carries colour too. A white specular
                                streak used to ride on top of this, but it was
                                indistinguishable from the original white sweep
                                and read as a second effect running alongside the
                                rainbow, so it is gone. */}
                            <span className="absolute inset-y-0 left-0 w-1/2 animate-foil-sweep bg-[linear-gradient(100deg,transparent_0%,rgba(255,80,80,0.65)_18%,rgba(255,225,90,0.65)_34%,rgba(90,255,190,0.65)_50%,rgba(90,190,255,0.65)_66%,rgba(210,90,255,0.65)_82%,transparent_100%)] mix-blend-overlay motion-reduce:animate-none" />
                          </span>
                        )}

                        <div className="absolute left-1 top-1 flex flex-col items-start gap-1">
                          {group.foil && (
                            <span className="rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                              Foil
                            </span>
                          )}
                        </div>

                        {group.representativeCard.is_restricted && (
                          <span className="absolute right-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Restricted
                          </span>
                        )}
                      </button>

                      <div className="mt-2 flex items-center gap-1.5">
                        {/* Selecting a tile selects every place its copies sit
                            in, which is what the bulk move acts on. Its own
                            control rather than part of the art button, so
                            clicking the card still opens it. */}
                        <label
                          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-600 hover:bg-slate-700"
                          title={`Select ${group.cardName} for a bulk move`}
                        >
                          <Checkbox
                            checked={picked}
                            onCheckedChange={() => toggleSelected(group.key)}
                            aria-label={`Select ${group.cardName}${group.foil ? " (foil)" : ""}`}
                            className="border-slate-500 data-[state=checked]:border-cyan-500 data-[state=checked]:bg-cyan-500"
                          />
                        </label>

                        {/* Reports a count rather than doing anything, so it is
                            not a button — but it is sized to the sm button
                            variant (h-8, text-xs) so it reads as Edit's sibling. */}
                        <span className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-cyan-500 px-2 text-xs font-medium text-cyan-400">
                          Total: {group.totalQuantity}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditCard(group)}
                          aria-label={`Edit ${group.cardName}${group.foil ? " (foil)" : ""}`}
                          className="flex-1 border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>

        {/* Edit Card Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Edit {selectedGroupedCard?.cardName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {editCardIds.map(({ cardId, setCode }) => (
                <div key={cardId} className="p-4 bg-slate-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="border-cyan-500 text-cyan-400 font-mono text-sm">
                      {setCode}
                    </Badge>

                    <div className="flex items-center gap-1">
                      {/* Which of the printings you own is the one shown on the
                          grid. Offered here because this list is already exactly
                          the printings you hold — the choice cannot name a card
                          you do not own. Choosing the current one clears it back
                          to automatic. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleChoosePreview(cardId)}
                        title={
                          isPreviewChoice(cardId)
                            ? "Shown on the collection grid — click to go back to automatic"
                            : "Show this printing on the collection grid"
                        }
                        aria-pressed={isPreviewChoice(cardId)}
                        className={
                          isPreviewChoice(cardId)
                            ? "h-7 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                            : "h-7 text-slate-400 hover:bg-slate-700 hover:text-white"
                        }
                      >
                        <ImageIcon className="mr-1 h-3.5 w-3.5" />
                        {isPreviewChoice(cardId) ? "Preview" : "Use as preview"}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemovePrinting(cardId)}
                        title="Remove this printing from your collection"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {BUCKETS.map((bucket) => {
                    // Indices into editPlaces, so edits address the right row even
                    // though the list is filtered per printing and bucket.
                    const rows = editPlaces
                      .map((place, index) => ({ place, index }))
                      .filter(({ place }) => place.cardId === cardId && place.bucket === bucket);

                    return (
                      <div key={bucket} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p
                            className={`text-xs font-semibold uppercase tracking-wide ${
                              bucket === "sale"
                                ? "text-amber-400/80"
                                : bucket === "loaned"
                                  ? "text-violet-400/80"
                                  : "text-slate-400"
                            }`}
                          >
                            {BUCKET_LABELS[bucket]}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addPlace(cardId, setCode, bucket)}
                            className="h-7 text-slate-300 hover:text-white"
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Add place
                          </Button>
                        </div>

                        {rows.length === 0 ? (
                          <p className="text-xs text-slate-500">None</p>
                        ) : (
                          rows.map(({ place, index }) => (
                            <div key={index} className="flex items-end gap-2">
                              <div className="w-24">
                                <Label className="text-white text-xs">Qty</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={place.quantity}
                                  onChange={(e) =>
                                    updatePlace(index, { quantity: parseInt(e.target.value) || 0 })
                                  }
                                  className="bg-slate-700 border-slate-600 text-white mt-1"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-white text-xs">
                                  {bucket === "loaned" ? "Lent to" : "Location"}
                                  {bucket === "loaned" && <span className="text-violet-400"> *</span>}
                                </Label>
                                <Input
                                  type="text"
                                  list="collection-locations"
                                  placeholder={
                                    bucket === "loaned" ? "Who has it" : "Box 1, Binder A..."
                                  }
                                  value={place.location}
                                  onChange={(e) => updatePlace(index, { location: e.target.value })}
                                  className="bg-slate-700 border-slate-600 text-white mt-1"
                                />
                              </div>
                              {/* Foil is per place, not per card: two copies in
                                  Box 3 and one foil in the same box are separate
                                  rows, which is what the place key now allows. */}
                              <label
                                className={`mb-1 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs ${
                                  place.foil
                                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                                    : "border-slate-600 text-slate-400 hover:text-white"
                                }`}
                                title="Are these copies foil?"
                              >
                                <Checkbox
                                  checked={place.foil}
                                  onCheckedChange={(checked) =>
                                    updatePlace(index, { foil: checked === true })
                                  }
                                  aria-label="Foil copies"
                                  className="h-3.5 w-3.5 border-slate-500 data-[state=checked]:border-cyan-500 data-[state=checked]:bg-cyan-500"
                                />
                                <Sparkles className="h-3 w-3" />
                                Foil
                              </label>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => dropPlace(index)}
                                className="text-slate-400 hover:text-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Place names already in use, so the same box is spelled the same
                  way each time rather than becoming two places. */}
              <datalist id="collection-locations">
                {stats.locations.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Card Detail Dialog */}
        <Dialog open={cardDetailOpen} onOpenChange={setCardDetailOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-2xl text-white flex items-center justify-between">
                <span>{currentCard?.name}</span>
                <div className="flex items-center gap-2">
                  {currentCard?.is_restricted && (
                    <Badge className="bg-red-600 text-white">Restricted</Badge>
                  )}
                  {cardPrintings.length > 1 && (
                    <Badge variant="outline" className="border-cyan-500 text-cyan-400">
                      {cardPrintings.length} printings
                    </Badge>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            {currentCard && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col items-center justify-start gap-4">
                  {currentCard.image_url && (
                    <CardImage
                      src={currentCard.image_url}
                      alt={currentCard.name}
                      variant="detail"
                      priority
                      className="w-[95%] max-w-[380px] h-auto rounded-lg shadow-2xl"
                    />
                  )}
                  {cardPrintings.length > 1 && (
                    <div className="w-full max-w-md space-y-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Previous printing"
                          onClick={() => stepPrinting(-1)}
                          className="shrink-0 bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <Select value={selectedPrintingId} onValueChange={setSelectedPrintingId}>
                          <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {cardPrintings.map((printing) => (
                              <SelectItem
                                key={printing.id}
                                value={printing.id}
                                className="text-white hover:bg-slate-700 focus:bg-slate-700"
                              >
                                {printing.sets?.code ?? getSetCode(printing)} - {printing.rarity}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Next printing"
                          onClick={() => stepPrinting(1)}
                          className="shrink-0 bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>

                      <p className="text-center text-xs text-slate-400">
                        Printing {printingIndex + 1} of {cardPrintings.length}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4 text-white">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Name</h3>
                    <p className="text-lg">{currentCard.name}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Set</h3>
                    <p className="text-lg">
                      {sets.get(currentCard.set_id ?? "")?.name ?? "Unknown"}
                      <span className="ml-2 text-sm text-slate-400">
                        ({getSetCode(currentCard)})
                      </span>
                    </p>
                  </div>

                  {currentCard.rarity && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Rarity</h3>
                      <p className="text-lg">{currentCard.rarity}</p>
                    </div>
                  )}

                  {currentCard.card_type && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Type</h3>
                      <p className="text-lg">{toTitleCase(currentCard.card_type)}</p>
                    </div>
                  )}

                  {currentCard.element && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Element</h3>
                      <p className="text-lg">{toTitleCase(currentCard.element)}</p>
                    </div>
                  )}

                  {currentCard.cost !== null && currentCard.cost !== undefined && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Cost</h3>
                      <p className="text-lg">{currentCard.cost}</p>
                    </div>
                  )}

                  {currentCard.effect_text && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Effect</h3>
                      <p className="text-base leading-relaxed">{currentCard.effect_text}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    {currentCard.power !== null && currentCard.power !== undefined && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Power</h3>
                        <p className="text-lg">{currentCard.power}</p>
                      </div>
                    )}

                    {currentCard.life !== null && currentCard.life !== undefined && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Life</h3>
                        <p className="text-lg">{currentCard.life}</p>
                      </div>
                    )}

                    {currentCard.speed !== null && currentCard.speed !== undefined && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Speed</h3>
                        <p className="text-lg">{currentCard.speed}</p>
                      </div>
                    )}
                  </div>

                  {currentCard.class && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Class</h3>
                      <p className="text-lg">{currentCard.class}</p>
                    </div>
                  )}

                  {currentCard.illustrator && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Illustrator</h3>
                      <p className="text-base italic text-slate-300">{currentCard.illustrator}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
