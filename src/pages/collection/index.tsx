import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Search, Loader2, Plus, Pencil, Trash2, Package } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { collectionService, type CollectionItem } from "@/services/collectionService";
import { cardService, type Card as CardType, type Set as SetType } from "@/services/cardService";

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

  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [sets, setSets] = useState<Map<string, SetType>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ totalCards: 0, totalQuantity: 0, uniqueCards: 0 });
  
  // Grouped collection by card name with printing details
  interface GroupedCard {
    cardName: string;
    printings: Array<{
      item: CollectionItem;
      setCode: string;
      setName: string;
    }>;
    totalQuantity: number;
    representativeCard: CardType;
  }
  const [groupedCollection, setGroupedCollection] = useState<GroupedCard[]>([]);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedGroupedCard, setSelectedGroupedCard] = useState<GroupedCard | null>(null);
  const [editPrintings, setEditPrintings] = useState<Array<{ cardId: string; setCode: string; quantity: number; location: string }>>([]);
  
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [selectedPrintingId, setSelectedPrintingId] = useState<string>("");
  const [cardPrintings, setCardPrintings] = useState<CardType[]>([]);

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
      const [collectionData, statsData] = await Promise.all([
        collectionService.getCollection(user.id),
        collectionService.getCollectionStats(user.id),
      ]);
      
      console.log("Sets Map size:", sets.size);
      console.log("Sets Map:", Array.from(sets.entries()).map(([id, set]) => ({ id, code: set.code, name: set.name })));
      console.log("Collection data sample:", collectionData[0]);
      
      setCollection(collectionData);
      setStats(statsData);
      
      // Group by card name
      const grouped = new Map<string, GroupedCard>();
      
      collectionData.forEach(item => {
        if (!item.card) return;
        
        const cardName = item.card.name;
        const set = sets.get(item.card.set_id);

        const setName = set?.name || "Unknown";
        const setCode = set?.code || "???";
        
        if (!grouped.has(cardName)) {
          grouped.set(cardName, {
            cardName,
            printings: [],
            totalQuantity: 0,
            representativeCard: item.card,
          });
        }
        
        const group = grouped.get(cardName)!;
        group.printings.push({
          item,
          setCode,
          setName,
        });
        group.totalQuantity += item.quantity;
      });
      
      setGroupedCollection(Array.from(grouped.values()).sort((a, b) => 
        a.cardName.localeCompare(b.cardName)
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

  const handleEditCard = (groupedCard: GroupedCard) => {
    setSelectedGroupedCard(groupedCard);
    setEditPrintings(groupedCard.printings.map(p => ({
      cardId: p.item.card_id,
      setCode: p.setCode,
      quantity: p.item.quantity,
      location: p.item.location || "",
    })));
    setEditDialogOpen(true);
  };

  const handleUpdatePrinting = (cardId: string, field: 'quantity' | 'location', value: string | number) => {
    setEditPrintings(prev => prev.map(p => 
      p.cardId === cardId ? { ...p, [field]: value } : p
    ));
  };

  const handleSaveEdit = async () => {
    if (!user || !selectedGroupedCard) return;

    try {
      // Update each printing
      await Promise.all(
        editPrintings.map(printing => 
          collectionService.updateCard(
            user.id,
            printing.cardId,
            printing.quantity,
            printing.location
          )
        )
      );
      
      toast({
        title: "Updated",
        description: "Card updated successfully",
      });
      
      setEditDialogOpen(false);
      loadCollection();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update card",
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
      
      // Reload or update local state
      const updatedPrintings = editPrintings.filter(p => p.cardId !== cardId);
      
      if (updatedPrintings.length === 0) {
        // All printings removed, close dialog and reload
        setEditDialogOpen(false);
        loadCollection();
      } else {
        // Update local state
        setEditPrintings(updatedPrintings);
        loadCollection();
      }
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
      // Get all printings of this card
      const allCards = await cardService.getCards();
      const printings = allCards.filter(c => c.name === card.name);
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

  const currentCard = cardPrintings.find(p => p.id === selectedPrintingId) || selectedCard;

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
              </div>
            </div>
            
            <Button
              onClick={() => router.push("/cards")}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Cards
            </Button>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCollection.map((group) => (
                <Card
                  key={group.cardName}
                  className="bg-slate-800 border-slate-700 overflow-hidden"
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div 
                        className="flex-shrink-0 w-24 cursor-pointer"
                        onClick={() => handleCardClick(group.representativeCard)}
                      >
                        {group.representativeCard.image_url && (
                          <img
                            src={group.representativeCard.image_url}
                            alt={group.cardName}
                            className="w-full rounded hover:scale-105 transition-transform"
                          />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 
                            className="text-white font-semibold cursor-pointer hover:text-cyan-400 transition-colors"
                            onClick={() => handleCardClick(group.representativeCard)}
                          >
                            {group.cardName}
                          </h3>
                          {group.representativeCard.is_restricted && (
                            <Badge className="bg-red-600 text-white text-xs flex-shrink-0">
                              Restricted
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="text-slate-400">
                            Total: <span className="text-white font-medium">{group.totalQuantity}</span>
                          </div>
                          
                          {/* Quantity per set */}
                          <div className="space-y-1">
                            {group.printings.map((printing, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="border-cyan-500 text-cyan-400 font-mono">
                                  {printing.setCode}
                                </Badge>
                                <span className="text-white">{printing.item.quantity}x</span>
                                {printing.item.location && (
                                  <span className="text-slate-400 text-xs">
                                    ({printing.item.location})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditCard(group)}
                            className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
              {editPrintings.map((printing, idx) => (
                <div key={printing.cardId} className="p-4 bg-slate-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-cyan-500 text-cyan-400 font-mono text-sm">
                      {printing.setCode}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemovePrinting(printing.cardId)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`quantity-${idx}`} className="text-white text-sm">Quantity</Label>
                      <Input
                        id={`quantity-${idx}`}
                        type="number"
                        min="0"
                        value={printing.quantity}
                        onChange={(e) => handleUpdatePrinting(printing.cardId, 'quantity', parseInt(e.target.value) || 0)}
                        className="bg-slate-700 border-slate-600 text-white mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`location-${idx}`} className="text-white text-sm">Location</Label>
                      <Input
                        id={`location-${idx}`}
                        type="text"
                        placeholder="Optional"
                        value={printing.location}
                        onChange={(e) => handleUpdatePrinting(printing.cardId, 'location', e.target.value)}
                        className="bg-slate-700 border-slate-600 text-white mt-1"
                      />
                    </div>
                  </div>
                </div>
              ))}
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
                    <img
                      src={currentCard.image_url}
                      alt={currentCard.name}
                      className="w-[95%] max-w-[380px] rounded-lg shadow-2xl"
                    />
                  )}
                  {cardPrintings.length > 1 && (
                    <div className="w-full max-w-md">
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
                              {getSetCode(printing)} - {printing.rarity}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-4 text-white">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Name</h3>
                    <p className="text-lg">{currentCard.name}</p>
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
