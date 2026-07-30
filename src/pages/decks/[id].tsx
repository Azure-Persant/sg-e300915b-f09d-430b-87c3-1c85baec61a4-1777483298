import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deckService, type DeckWithCards } from "@/services/deckService";
import {
  RARITY_LABELS,
  cardService,
  type CardWithSet,
  type FilterOption,
  type Set,
} from "@/services/cardService";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Plus, Minus, Search, Check, X, MapPin } from "lucide-react";
import Link from "next/link";

/** "LESSER BOON" -> "Lesser Boon", for the type dropdown labels. */
const toTitleCase = (text: string): string =>
  text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

export default function DeckDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();
  const [deck, setDeck] = useState<DeckWithCards | null>(null);
  const [allCards, setAllCards] = useState<CardWithSet[]>([]);
  const [sets, setSets] = useState<Set[]>([]);
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
  const [userCollection, setUserCollection] = useState<Map<string, { quantity: number; location?: string }>>(new Map());
  const cardsPerPage = 60;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && id) {
      loadDeck();
      loadUserCollection();
    }
  }, [user, id]);

  const loadDeck = async () => {
    if (!id || typeof id !== "string") return;
    try {
      const data = await deckService.getDeckById(id);
      setDeck(data);
    } catch (error) {
      console.error("Error loading deck:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserCollection = async () => {
    if (!user) return;
    try {
      const [setsData, collectionData, filterOptions] = await Promise.all([
        cardService.getAllSets(),
        cardService.getUserCollection(user.id),
        cardService.getFilterOptions(),
      ]);
      // Base expansions first, matching the precedence the card grid uses.
      setSets(
        setsData.slice().sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      );
      setTypeOptions(filterOptions.types);
      
      const collectionMap = new Map();
      collectionData.forEach(card => {
        const collection = Array.isArray(card.user_collections) ? card.user_collections[0] : card.user_collections;
        if (collection) {
          collectionMap.set(card.id, {
            quantity: collection.quantity,
            location: collection.location,
          });
        }
      });
      setUserCollection(collectionMap);
    } catch (error) {
      console.error("Error loading user collection:", error);
    }
  };

  const loadAllCards = async () => {
    try {
      // One page from Postgres. This used to call getCards(), which loops until
      // it has every matching printing — the entire catalog when no filter is
      // set — and re-ran on every keystroke.
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
    if (addCardDialogOpen) {
      loadAllCards();
    }
  }, [addCardDialogOpen, cardPage, debouncedSearch, selectedSet, selectedRarity, selectedType]);

  const handleAddCard = async (cardId: string, quantity: number = 1) => {
    if (!deck) return;
    try {
      await deckService.addCardToDeck(deck.id, cardId, quantity);
      await loadDeck();
    } catch (error) {
      console.error("Error adding card:", error);
    }
  };

  const handleUpdateQuantity = async (cardId: string, quantity: number) => {
    if (!deck) return;
    try {
      await deckService.updateDeckCard(deck.id, cardId, quantity);
      await loadDeck();
    } catch (error) {
      console.error("Error updating card:", error);
    }
  };

  const getDeckStats = () => {
    if (!deck) return { total: 0, owned: 0, needed: 0 };
    let total = 0;
    let owned = 0;
    
    deck.deck_cards.forEach(deckCard => {
      const needed = deckCard.quantity;
      const inCollection = userCollection.get(deckCard.card_id)?.quantity || 0;
      total += needed;
      owned += Math.min(needed, inCollection);
    });
    
    return { total, owned, needed: total - owned };
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case "common": return "bg-slate-500";
      case "uncommon": return "bg-green-500";
      case "rare": return "bg-blue-500";
      case "super rare": return "bg-purple-500";
      case "ultra rare": return "bg-amber-500";
      default: return "bg-gray-500";
    }
  };

  if (authLoading || loading || !user || !deck) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </>
    );
  }

  const stats = getDeckStats();

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
        <div className="container py-8">
          <div className="mb-6">
            <Button variant="ghost" asChild className="mb-4">
              <Link href="/decks">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Decks
              </Link>
            </Button>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-4xl font-heading font-bold mb-2">{deck.name}</h1>
                {deck.description && (
                  <p className="text-muted-foreground">{deck.description}</p>
                )}
              </div>
              <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Cards
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-heading">Add Cards to Deck</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <Select value={selectedSet} onValueChange={setSelectedSet}>
                        <SelectTrigger>
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
                        <SelectTrigger>
                          <SelectValue placeholder="All Rarities" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Rarities</SelectItem>
                          {/* Values are the codes stored in cards.rarity. The
                              display names that used to be here could never
                              match, so every rarity filter returned nothing. */}
                          {Object.entries(RARITY_LABELS).map(([code, label]) => (
                            <SelectItem key={code} value={code}>
                              {label} ({code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={selectedType} onValueChange={setSelectedType}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          {/* Driven by public.card_filter_options, so all 15
                              types appear rather than a hardcoded 5, and the
                              values match cards.types exactly. */}
                          {typeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {toTitleCase(option.value)} ({option.count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
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
                            onClick={() => setCardPage((p) => Math.max(1, p - 1))}
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
                            onClick={() => setCardPage((p) => Math.min(cardPageCount, p + 1))}
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                      {allCards.map((card) => {
                        const inCollection = userCollection.get(card.id);
                        return (
                          <Card 
                            key={card.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => {
                              handleAddCard(card.id);
                              setAddCardDialogOpen(false);
                            }}
                          >
                            <div className="aspect-[2.5/3.5] bg-secondary/20 relative overflow-hidden">
                              <CardImage
                                src={card.image_url}
                                alt={card.name}
                                variant="tile"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                              {inCollection && (
                                <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                                  <Check className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                            <CardContent className="p-3">
                              <p className="font-semibold text-sm line-clamp-1">{card.name}</p>
                              {inCollection && (
                                <p className="text-xs text-green-600">Owned: {inCollection.quantity}</p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Cards</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-heading font-bold">{stats.total}</div>
              </CardContent>
            </Card>

            <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-green-500/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Cards Owned</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-heading font-bold text-green-600">{stats.owned}</div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Cards Needed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-heading font-bold text-amber-600">{stats.needed}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Deck List</CardTitle>
            </CardHeader>
            <CardContent>
              {deck.deck_cards.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No cards in deck yet. Click "Add Cards" to start building.
                </div>
              ) : (
                <div className="space-y-4">
                  {deck.deck_cards.map((deckCard) => {
                    const card = deckCard.cards;
                    const inCollection = userCollection.get(card.id);
                    const needed = deckCard.quantity;
                    const owned = inCollection?.quantity || 0;
                    const missing = Math.max(0, needed - owned);
                    
                    return (
                      <div key={deckCard.id} className="flex items-center gap-4 p-4 rounded-lg border border-border/50 hover:bg-secondary/20 transition-colors">
                        <CardImage
                          src={card.image_url}
                          alt={card.name}
                          variant="row"
                          className="h-20 w-16 rounded object-cover"
                        />
                        <div className="flex-1">
                          <h3 className="font-heading font-semibold">{card.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`${getRarityColor(card.rarity)} text-white text-xs`}>
                              {card.rarity}
                            </Badge>
                            {card.element && (
                              <Badge variant="outline" className="text-xs">{card.element}</Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">{card.card_type}</Badge>
                          </div>
                          {inCollection?.location && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <MapPin className="h-3 w-3" />
                              {inCollection.location}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Need: {needed}</div>
                            <div className={`text-sm font-medium ${owned >= needed ? 'text-green-600' : 'text-amber-600'}`}>
                              {owned >= needed ? (
                                <span className="flex items-center gap-1">
                                  <Check className="h-4 w-4" />
                                  Have all
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <X className="h-4 w-4" />
                                  Need {missing}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleUpdateQuantity(card.id, Math.max(0, needed - 1))}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-semibold">{needed}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleUpdateQuantity(card.id, needed + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
