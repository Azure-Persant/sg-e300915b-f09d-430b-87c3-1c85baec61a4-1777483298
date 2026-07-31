import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Database, Plus, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CardFilterBar } from "@/components/CardFilterBar";
import type {
  CardFilters,
  CardWithSet,
  CatalogCard,
  FilterOptions,
  Set as SetRow,
} from "@/services/cardService";
import { EMPTY_FILTERS, cardService, countActiveFilters } from "@/services/cardService";
import { collectionService } from "@/services/collectionService";

// Helper function to convert text to Title Case
const toTitleCase = (text: string | null | undefined): string => {
  if (!text) return "";
  return text
    .split(" ")
    .map(word => {
      // Handle special characters like em dash
      if (word === "—") return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

// Set codes come from sets.code, which holds the real acronym the API publishes
// as set.prefix ("MRC", "ALCSD"). This used to build initials from the set name
// instead, which produced "MH" for Mercurial Heart and "ARSD" for Alchemical
// Revolution Starter Decks.

export default function CardsPage() {
  const { user } = useAuth();
  const [displayCards, setDisplayCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<CardFilters>(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    elements: [],
    types: [],
    subtypes: [],
    classes: [],
  });
  const [sets, setSets] = useState<SetRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // The page box is edited as text and only acted on when committed. Bound
  // straight to currentPage it navigated on every keystroke, so typing "12"
  // jumped to page 1 on the first digit and scrolled away mid-entry.
  const [pageInput, setPageInput] = useState("1");
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [selectedCardPrintings, setSelectedCardPrintings] = useState<CardWithSet[]>([]);
  const [selectedPrintingId, setSelectedPrintingId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false);
  const [addQuantity, setAddQuantity] = useState(1);
  const [addLocation, setAddLocation] = useState("");
  const [addFoil, setAddFoil] = useState(false);
  const cardsPerPage = 120;
  const { toast } = useToast();
  const router = useRouter();

  // Keystrokes update the inputs immediately but only settle into a query after
  // a pause. Without this, every character triggered a fresh fetch.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    loadCards();
  }, [currentPage, debouncedFilters]);

  useEffect(() => {
    loadDbStatus();
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    try {
      const [options, allSets] = await Promise.all([
        cardService.getFilterOptions(),
        cardService.getAllSets(),
      ]);
      setFilterOptions(options);
      // Base expansions first, then alphabetically — same precedence the grid uses.
      setSets(
        allSets
          .slice()
          .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      );
    } catch (error) {
      console.error("Failed to load filter options:", error);
    }
  };

  const loadDbStatus = async () => {
    try {
      const response = await fetch("/api/sync-status");
      const status = await response.json();
      setDbStatus(status);
    } catch (error) {
      console.error("Failed to load DB status:", error);
    }
  };

  const loadCards = async () => {
    try {
      setLoading(true);

      // Postgres does the de-duplication, ranking, filtering and paging; this
      // fetches one page rather than the whole catalog.
      const { rows, total } = await cardService.getCatalogPage({
        page: currentPage,
        pageSize: cardsPerPage,
        filters: debouncedFilters,
      });

      setDisplayCards(rows);
      setTotalPages(Math.max(1, Math.ceil(total / cardsPerPage)));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load cards",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keeps the box honest when the page changes by other means — the arrows, or a
  // filter change resetting to page 1.
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  /** Applied on Enter or on leaving the field, never mid-typing. */
  const commitPageInput = () => {
    const typed = pageInput.trim();

    // Empty or unparseable means "never mind", so put the real page back rather
    // than treating it as page 0 and jumping to the first page.
    if (typed === "") {
      setPageInput(String(currentPage));
      return;
    }

    const parsed = Number.parseInt(typed, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }

    const clamped = Math.min(Math.max(parsed, 1), totalPages);
    setPageInput(String(clamped));
    if (clamped !== currentPage) handlePageChange(clamped);
  };

  const handleCardClick = async (card: CatalogCard) => {
    if (!card.name) return;

    // Printings are fetched on demand now. Previously they came from a
    // client-side map that only existed because the whole catalog was in memory.
    setDialogOpen(true);
    setSelectedCardPrintings([]);
    setSelectedPrintingId("");

    try {
      const printings = await cardService.getPrintingsForName(card.name);
      setSelectedCardPrintings(printings);
      setSelectedPrintingId(printings[0]?.id ?? "");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load printings for this card",
      });
    }
  };

  const handleAddToCollection = async () => {
    if (!user || !currentCard) return;

    try {
      // addCopies rather than addCard, which cannot say what finish it is.
      await collectionService.addCopies(
        user.id,
        currentCard.id,
        "personal",
        addLocation,
        addQuantity,
        addFoil
      );
      toast({
        title: "Added to collection!",
        description: `${addQuantity} ${addFoil ? "foil " : ""}${currentCard.name} added${
          addLocation.trim() ? ` to ${addLocation.trim()}` : ""
        }.`,
      });
      setAddToCollectionOpen(false);
      setAddQuantity(1);
      setAddLocation("");
      // Cleared so the next card is not silently added as foil too.
      setAddFoil(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add card to collection",
      });
    }
  };

  const printingIndex = Math.max(
    0,
    selectedCardPrintings.findIndex((p) => p.id === selectedPrintingId)
  );
  const currentCard = selectedCardPrintings[printingIndex];
  const hasMultiplePrintings = selectedCardPrintings.length > 1;

  /** Wraps at both ends, so the arrows never dead-end on the first or last printing. */
  const stepPrinting = (delta: number) => {
    const count = selectedCardPrintings.length;
    if (count === 0) return;
    const next = (printingIndex + delta + count) % count;
    setSelectedPrintingId(selectedCardPrintings[next].id);
  };
  const hasAnyFilter =
    countActiveFilters(debouncedFilters) > 0 || Boolean(debouncedFilters.search?.trim());

  return (
    <>
      <SEO
        title="Grand Archive Card Database"
        description="Browse and search the complete Grand Archive TCG card database"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />
        
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Card Database</h1>
              <p className="text-slate-300">Browse all Grand Archive TCG cards</p>
              {dbStatus && (
                <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                  <Database className="h-4 w-4" />
                  <span>{dbStatus.totalCards} cards from {dbStatus.totalSets} sets</span>
                  {dbStatus.lastSync && (
                    <span className="text-cyan-400">
                      • Last sync: {new Date(dbStatus.lastSync).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <RefreshCw className="h-4 w-4 text-cyan-400" />
              Card data updates automatically
            </div>
          </div>

          <div className="mb-6">
            <CardFilterBar
              filters={filters}
              onChange={setFilters}
              options={filterOptions}
              sets={sets}
            />
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : displayCards.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-400 text-lg">
                {hasAnyFilter
                  ? "No cards match these filters."
                  : "No cards yet \u2014 the catalog syncs automatically each day."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {displayCards.map((card) => {
                  // The sync flags every printing of a restricted name, so the
                  // representative row's flag covers the whole card.
                  const hasRestricted = card.is_restricted ?? false;

                  return (
                    <Card
                      key={card.id}
                      className="bg-slate-800 border-slate-700 hover:border-cyan-500 transition-all cursor-pointer overflow-hidden group"
                      onClick={() => handleCardClick(card)}
                    >
                      <CardContent className="p-0">
                        <div className="relative">
                          {card.image_url && (
                            <CardImage
                              src={card.image_url}
                              alt={card.name ?? "Card"}
                              variant="tile"
                              className="w-full h-auto group-hover:scale-105 transition-transform duration-200"
                            />
                          )}
                          {hasRestricted && (
                            <Badge className="absolute top-2 right-2 bg-red-600 text-white text-xs shadow-lg">
                              Restricted
                            </Badge>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-white text-sm font-medium line-clamp-2 leading-tight">
                            {card.name}
                          </p>
                          {(card.printing_count ?? 0) > 1 && (
                            <p className="text-xs text-slate-400 mt-1">
                              {card.printing_count} printings
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              
              {/* Pagination Controls */}
              <div className="flex flex-col items-center gap-4 mt-8">
                <div className="flex items-center gap-4">
                  <Button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    variant="outline"
                    className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                  >
                    Previous
                  </Button>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-white">Page</span>
                    {/* text + inputMode rather than type=number: a number input
                        fights a controlled value while typing, and this still
                        offers a numeric keypad on mobile. */}
                    <Input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Page number, 1 to ${totalPages}`}
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitPageInput();
                        }
                      }}
                      onBlur={commitPageInput}
                      className="w-20 text-center bg-slate-800 border-slate-700 text-white"
                    />
                    <span className="text-white">of {totalPages}</span>
                  </div>
                  
                  <Button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    variant="outline"
                    className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                  >
                    Next
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Jump to:</span>
                  <Button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    variant="ghost"
                    size="sm"
                    className="text-cyan-400 hover:text-cyan-300 hover:bg-slate-800"
                  >
                    First
                  </Button>
                  <Button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    variant="ghost"
                    size="sm"
                    className="text-cyan-400 hover:text-cyan-300 hover:bg-slate-800"
                  >
                    Last
                  </Button>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Card Detail Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-2xl text-white flex items-center justify-between">
                <span>{currentCard?.name}</span>
                {currentCard?.is_restricted && (
                  <Badge className="bg-red-600 text-white">Restricted</Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {currentCard && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                  {/* Left: Card Image with Printing Selector Below */}
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
                    {hasMultiplePrintings && (
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
                              {selectedCardPrintings.map((printing) => (
                                <SelectItem
                                  key={printing.id}
                                  value={printing.id}
                                  className="text-white hover:bg-slate-700 focus:bg-slate-700"
                                >
                                  {printing.sets?.code ?? "???"} - {printing.rarity}
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
                          Printing {printingIndex + 1} of {selectedCardPrintings.length}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right: Card Details */}
                  <div className="space-y-4 text-white">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Name</h3>
                      <p className="text-lg">{currentCard.name}</p>
                    </div>

                    {currentCard.sets && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Set</h3>
                        <p className="text-lg">
                          {currentCard.sets.name}
                          <span className="ml-2 text-sm text-slate-400">({currentCard.sets.code})</span>
                        </p>
                      </div>
                    )}

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
                
                {user && (
                  <DialogFooter className="mt-6">
                    <Button
                      onClick={() => setAddToCollectionOpen(true)}
                      className="bg-cyan-500 hover:bg-cyan-600 text-white"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add to Collection
                    </Button>
                  </DialogFooter>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Add to Collection Dialog */}
        <Dialog open={addToCollectionOpen} onOpenChange={setAddToCollectionOpen}>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">Add to Collection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="add-quantity" className="text-white">Quantity</Label>
                <Input
                  id="add-quantity"
                  type="number"
                  min="1"
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(parseInt(e.target.value) || 1)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label htmlFor="add-location" className="text-white">Location (optional)</Label>
                <Input
                  id="add-location"
                  type="text"
                  placeholder="e.g., Binder 1, Deck Box, Storage"
                  value={addLocation}
                  onChange={(e) => setAddLocation(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              {/* Foil is recorded per place, so foil and plain copies of the same
                  card can sit in the same box as separate rows. */}
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={addFoil}
                  onCheckedChange={(checked) => setAddFoil(checked === true)}
                  aria-label="These copies are foil"
                  className="border-slate-500 data-[state=checked]:border-cyan-500 data-[state=checked]:bg-cyan-500"
                />
                <span className="flex items-center gap-1.5 text-white">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  Foil
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddToCollectionOpen(false)}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddToCollection}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Add to Collection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
