import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2 } from "lucide-react";
import type { Card as CardType } from "@/services/cardService";
import { cardService } from "@/services/cardService";

export default function CardsPage() {
  const [cards, setCards] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      setLoading(true);
      const data = await cardService.getCards();
      setCards(data);
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

  const handleSync = async () => {
    try {
      setSyncing(true);
      console.log("=== SYNC BUTTON CLICKED ===");
      console.log("Calling /api/sync-cards...");
      
      const response = await fetch("/api/sync-cards", {
        method: "POST",
      });

      console.log("Response status:", response.status);
      const data = await response.json();
      console.log("Response data:", data);

      if (!response.ok) {
        console.log("=== SYNC ERROR ===");
        console.log("Error:", data.error || data.details);
        throw new Error(data.error || data.details || "Sync failed");
      }

      console.log("=== SYNC SUCCESS ===");
      console.log("Total cards:", data.totalCards);
      console.log("Total sets:", data.totalSets);

      toast({
        title: "Sync Complete!",
        description: `Synced ${data.totalCards || 'unknown'} cards from ${data.totalSets || 'unknown'} sets.`,
      });

      await loadCards();
    } catch (error) {
      console.log("=== SYNC ERROR ===");
      console.error("Sync error:", error);
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync cards",
      });
    } finally {
      setSyncing(false);
    }
  };

  const filteredCards = cards.filter((card) =>
    card.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            </div>
            
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                "Sync Card Database"
              )}
            </Button>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
              <Input
                type="text"
                placeholder="Search cards..."
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
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-400 text-lg">
                {cards.length === 0 
                  ? "No cards found. Click 'Sync Card Database' to import cards."
                  : "No cards match your search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCards.map((card) => (
                <Card
                  key={card.id}
                  className="bg-slate-800 border-slate-700 hover:border-cyan-500 transition-all cursor-pointer"
                  onClick={() => router.push(`/cards/${card.id}`)}
                >
                  <CardHeader>
                    <CardTitle className="text-white text-lg">{card.name}</CardTitle>
                    <div className="flex gap-2 mt-2">
                      {card.card_type && (
                        <Badge variant="secondary" className="bg-slate-700">
                          {card.card_type}
                        </Badge>
                      )}
                      {card.rarity && (
                        <Badge 
                          variant="secondary"
                          className={
                            card.rarity === "common" ? "bg-gray-600" :
                            card.rarity === "uncommon" ? "bg-green-600" :
                            card.rarity === "rare" ? "bg-blue-600" :
                            card.rarity === "super_rare" ? "bg-purple-600" :
                            "bg-amber-600"
                          }
                        >
                          {card.rarity.replace("_", " ").toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {card.image_url && (
                      <img
                        src={card.image_url}
                        alt={card.name}
                        className="w-full rounded-lg mb-3"
                      />
                    )}
                    {card.effect_text && (
                      <p className="text-slate-300 text-sm line-clamp-3">
                        {card.effect_text}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}