import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cardService, type CollectionCard, type Set } from "@/services/cardService";
import { useAuth } from "@/hooks/useAuth";
import { Search, Filter, Plus, Minus, MapPin, BookOpen, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function CollectionPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [sets, setSets] = useState<Set[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalCards: 0, uniqueCards: 0 });
  const [search, setSearch] = useState("");
  const [selectedSet, setSelectedSet] = useState<string>("all");
  const [selectedRarity, setSelectedRarity] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedElement, setSelectedElement] = useState<string>("all");
  const [editingCard, setEditingCard] = useState<CollectionCard | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [location, setLocation] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      filterCards();
    }
  }, [search, selectedSet, selectedRarity, selectedType, selectedElement, user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [setsData, statsData] = await Promise.all([
        cardService.getAllSets(),
        cardService.getCollectionStats(user.id),
      ]);
      setSets(setsData);
      setStats(statsData);
      await filterCards();
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterCards = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const filters: any = {};
      if (selectedSet !== "all") filters.setId = selectedSet;
      if (selectedRarity !== "all") filters.rarity = selectedRarity;
      if (selectedType !== "all") filters.cardType = selectedType;
      if (selectedElement !== "all") filters.element = selectedElement;
      if (search) filters.search = search;

      const data = await cardService.getUserCollection(user.id, filters);
      setCards(data);
    } catch (error) {
      console.error("Error filtering cards:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (card: CollectionCard) => {
    setEditingCard(card);
    const collection = Array.isArray(card.user_collections) ? card.user_collections[0] : card.user_collections;
    setQuantity(collection?.quantity || 0);
    setLocation(collection?.location || "");
  };

  const handleSave = async () => {
    if (!user || !editingCard) return;
    try {
      await cardService.updateCollection(user.id, editingCard.id, quantity, location);
      setEditingCard(null);
      await loadData();
    } catch (error) {
      console.error("Error updating collection:", error);
    }
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

  if (authLoading || !user) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
        <div className="container py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-heading font-bold mb-2">My Collection</h1>
            <p className="text-muted-foreground">
              Track and organize your Grand Archive cards
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Cards</CardTitle>
                <BookOpen className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-heading font-bold">{stats.totalCards}</div>
              </CardContent>
            </Card>

            <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-accent/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Unique Cards</CardTitle>
                <BarChart3 className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-heading font-bold">{stats.uniqueCards}</div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Collection Value</CardTitle>
                <span className="text-2xl">💎</span>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-heading font-bold">Coming Soon</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Card name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Set</label>
                    <Select value={selectedSet} onValueChange={setSelectedSet}>
                      <SelectTrigger>
                        <SelectValue />
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
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Rarity</label>
                    <Select value={selectedRarity} onValueChange={setSelectedRarity}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Rarities</SelectItem>
                        <SelectItem value="Common">Common</SelectItem>
                        <SelectItem value="Uncommon">Uncommon</SelectItem>
                        <SelectItem value="Rare">Rare</SelectItem>
                        <SelectItem value="Super Rare">Super Rare</SelectItem>
                        <SelectItem value="Ultra Rare">Ultra Rare</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Type</label>
                    <Select value={selectedType} onValueChange={setSelectedType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Champion">Champion</SelectItem>
                        <SelectItem value="Regalia">Regalia</SelectItem>
                        <SelectItem value="Action">Action</SelectItem>
                        <SelectItem value="Attack">Attack</SelectItem>
                        <SelectItem value="Ally">Ally</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Element</label>
                    <Select value={selectedElement} onValueChange={setSelectedElement}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Elements</SelectItem>
                        <SelectItem value="Fire">Fire</SelectItem>
                        <SelectItem value="Water">Water</SelectItem>
                        <SelectItem value="Wind">Wind</SelectItem>
                        <SelectItem value="Arcane">Arcane</SelectItem>
                        <SelectItem value="Luxem">Luxem</SelectItem>
                        <SelectItem value="Crux">Crux</SelectItem>
                        <SelectItem value="Tera">Tera</SelectItem>
                        <SelectItem value="Neos">Neos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSearch("");
                      setSelectedSet("all");
                      setSelectedRarity("all");
                      setSelectedType("all");
                      setSelectedElement("all");
                    }}
                  >
                    Clear Filters
                  </Button>

                  <Button
                    className="w-full"
                    asChild
                  >
                    <Link href="/cards">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Cards
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="mt-4 text-muted-foreground">Loading collection...</p>
                </div>
              ) : cards.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium mb-2">Your collection is empty</p>
                  <p className="text-muted-foreground mb-6">Start adding cards to track your Grand Archive collection</p>
                  <Button asChild>
                    <Link href="/cards">
                      <Plus className="mr-2 h-4 w-4" />
                      Browse Cards
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cards.map((card) => {
                    const collection = Array.isArray(card.user_collections) ? card.user_collections[0] : card.user_collections;
                    return (
                      <Dialog key={card.id}>
                        <DialogTrigger asChild>
                          <Card 
                            className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer border-border/50 overflow-hidden"
                            onClick={() => handleEdit(card)}
                          >
                            <div className="aspect-[2.5/3.5] bg-secondary/20 relative overflow-hidden">
                              <img
                                src={card.image_url}
                                alt={card.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-semibold">
                                ×{collection?.quantity || 0}
                              </div>
                            </div>
                            <CardContent className="p-4">
                              <h3 className="font-heading font-semibold mb-2 line-clamp-1">
                                {card.name}
                              </h3>
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <Badge className={`${getRarityColor(card.rarity)} text-white`}>
                                  {card.rarity}
                                </Badge>
                                {card.element && (
                                  <Badge variant="outline">{card.element}</Badge>
                                )}
                              </div>
                              {collection?.location && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {collection.location}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle className="font-heading">Edit Collection</DialogTitle>
                          </DialogHeader>
                          {editingCard && (
                            <div className="space-y-4">
                              <div>
                                <h3 className="font-heading font-semibold mb-2">{editingCard.name}</h3>
                                <div className="flex gap-2">
                                  <Badge className={`${getRarityColor(editingCard.rarity)} text-white`}>
                                    {editingCard.rarity}
                                  </Badge>
                                  {editingCard.element && (
                                    <Badge variant="outline">{editingCard.element}</Badge>
                                  )}
                                  <Badge variant="secondary">{editingCard.card_type}</Badge>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Quantity</Label>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setQuantity(Math.max(0, quantity - 1))}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={quantity}
                                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                                    className="text-center"
                                  />
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setQuantity(quantity + 1)}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label>Location (Optional)</Label>
                                <Input
                                  placeholder="e.g., Binder 1, Deck Box, Storage..."
                                  value={location}
                                  onChange={(e) => setLocation(e.target.value)}
                                />
                              </div>

                              <Button onClick={handleSave} className="w-full">
                                Save Changes
                              </Button>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}