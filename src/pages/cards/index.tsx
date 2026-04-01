import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cardService, type CardWithSet, type Set } from "@/services/cardService";
import { Search, Filter, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

export default function CardsPage() {
  const [cards, setCards] = useState<CardWithSet[]>([]);
  const [sets, setSets] = useState<Set[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedSet, setSelectedSet] = useState<string>("all");
  const [selectedRarity, setSelectedRarity] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedElement, setSelectedElement] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterCards();
  }, [search, selectedSet, selectedRarity, selectedType, selectedElement]);

  const loadData = async () => {
    try {
      const [setsData, cardsData] = await Promise.all([
        cardService.getAllSets(),
        cardService.getCards(),
      ]);
      setSets(setsData);
      setCards(cardsData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load card data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    console.log("=== SYNC BUTTON CLICKED ===");
    setSyncing(true);
    try {
      console.log("Calling /api/sync-cards...");
      const response = await fetch("/api/sync-cards", {
        method: "POST",
      });

      console.log("Response status:", response.status);
      const data = await response.json();
      console.log("Response data:", data);
      console.log("totalCards:", data.totalCards);
      console.log("totalSets:", data.totalSets);

      if (!response.ok) {
        throw new Error(data.error || data.details || "Sync failed");
      }

      toast({
        title: "Sync Complete!",
        description: `Synced ${data.totalCards} cards from ${data.totalSets} sets.`,
      });

      // Reload data
      await loadData();
    } catch (error) {
      console.error("=== SYNC ERROR ===", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Sync failed",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const filterCards = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (selectedSet !== "all") filters.setId = selectedSet;
      if (selectedRarity !== "all") filters.rarity = selectedRarity;
      if (selectedType !== "all") filters.cardType = selectedType;
      if (selectedElement !== "all") filters.element = selectedElement;
      if (search) filters.search = search;

      const data = await cardService.getCards(filters);
      setCards(data);
    } catch (error) {
      console.error("Error filtering cards:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case "common": return "bg-slate-500";
      case "uncommon": return "bg-green-500";
      case "rare": return "bg-blue-500";
      case "super_rare": return "bg-purple-500";
      case "ultra_rare": return "bg-amber-500";
      case "champion_rare": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
        <div className="container py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-heading font-bold mb-2">Card Database</h1>
              <p className="text-muted-foreground">
                Browse all Grand Archive cards from every set
              </p>
            </div>
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Card Database"}
            </Button>
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
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="mt-4 text-muted-foreground">Loading cards...</p>
                </div>
              ) : cards.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No cards found matching your filters</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cards.map((card) => (
                    <Link href={`/cards/${card.id}`} key={card.id}>
                      <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer border-border/50 overflow-hidden">
                        <div className="aspect-[2.5/3.5] bg-secondary/20 relative overflow-hidden">
                          <img
                            src={card.image_url}
                            alt={card.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-heading font-semibold mb-2 line-clamp-1">
                            {card.name}
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`${getRarityColor(card.rarity)} text-white`}>
                              {card.rarity}
                            </Badge>
                            {card.element && (
                              <Badge variant="outline">{card.element}</Badge>
                            )}
                            <Badge variant="secondary">{card.card_type}</Badge>
                          </div>
                          {card.sets && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {card.sets.name}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}