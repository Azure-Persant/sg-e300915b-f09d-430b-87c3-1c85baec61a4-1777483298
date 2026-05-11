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

export default function CollectionPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [sets, setSets] = useState<Map<string, SetType>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ totalCards: 0, totalQuantity: 0, uniqueCards: 0 });
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editLocation, setEditLocation] = useState("");
  
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [selectedPrintingId, setSelectedPrintingId] = useState<string>("");
  const [cardPrintings, setCardPrintings] = useState<CardType[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    } else if (user) {
      loadCollection();
      loadSets();
    }
  }, [user, authLoading]);

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
      
      setCollection(collectionData);
      setStats(statsData);
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

  const handleEditCard = (item: CollectionItem) => {
    setSelectedItem(item);
    setEditQuantity(item.quantity);
    setEditLocation(item.location || "");
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!user || !selectedItem) return;

    try {
      await collectionService.updateCard(
        user.id,
        selectedItem.card_id,
        editQuantity,
        editLocation
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

  const handleRemoveCard = async (cardId: string) => {
    if (!user) return;

    try {
      await collectionService.removeCard(user.id, cardId);
      toast({
        title: "Removed",
        description: "Card removed from collection",
      });
      loadCollection();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to remove card",
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

  const getSetName = (card: CardType): string => {
    const set = sets.get(card.set_id);
    return set?.name || "Unknown";
  };

  const filteredCollection = searchQuery
    ? collection.filter(item =>
        item.card?.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : collection;

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
              {filteredCollection.map((item) => (
                <Card
                  key={item.id}
                  className="bg-slate-800 border-slate-700 overflow-hidden"
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div 
                        className="flex-shrink-0 w-24 cursor-pointer"
                        onClick={() => item.card && handleCardClick(item.card)}
                      >
                        {item.card?.image_url && (
                          <img
                            src={item.card.image_url}
                            alt={item.card.name}
                            className="w-full rounded hover:scale-105 transition-transform"
                          />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 
                            className="text-white font-semibold cursor-pointer hover:text-cyan-400 transition-colors"
                            onClick={() => item.card && handleCardClick(item.card)}
                          >
                            {item.card?.name}
                          </h3>
                          {item.card?.is_restricted && (
                            <Badge className="bg-red-600 text-white text-xs flex-shrink-0">
                              Restricted
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-1 text-sm">
                          <div className="text-slate-400">
                            Quantity: <span className="text-white font-medium">{item.quantity}</span>
                          </div>
                          {item.location && (
                            <div className="text-slate-400">
                              Location: <span className="text-white">{item.location}</span>
                            </div>
                          )}
                          {item.card?.rarity && (
                            <div className="text-slate-400">
                              Rarity: <span className="text-white">{item.card.rarity}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditCard(item)}
                            className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveCard(item.card_id)}
                            className="border-red-500 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
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
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">Edit Card</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="quantity" className="text-white">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(parseInt(e.target.value) || 0)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label htmlFor="location" className="text-white">Location (optional)</Label>
                <Input
                  id="location"
                  type="text"
                  placeholder="e.g., Binder 1, Deck Box, Storage"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
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
                              {getSetName(printing)} - {printing.rarity}
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