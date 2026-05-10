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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, RefreshCw, Database, X } from "lucide-react";
import type { Card as CardType } from "@/services/cardService";
import { cardService } from "@/services/cardService";

export default function CardsPage() {
  const [cards, setCards] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const cardsPerPage = 120;
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    loadCards();
    loadDbStatus();
  }, [currentPage]);

  // Poll for progress updates while syncing
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (syncing) {
      interval = setInterval(async () => {
        try {
          const response = await fetch("/api/sync-progress");
          const progress = await response.json();
          setSyncProgress(progress);

          if (!progress.isRunning) {
            setSyncing(false);
            clearInterval(interval);
            
            if (progress.error) {
              toast({
                title: "Sync failed",
                description: progress.error,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Sync complete!",
                description: progress.message,
              });
              await loadCards();
              await loadDbStatus();
            }
          }
        } catch (error) {
          console.error("Progress check error:", error);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncing]);

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
      const data = await cardService.getCards();
      
      const filteredData = searchQuery 
        ? data.filter((card) => card.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : data;
      
      const total = Math.ceil(filteredData.length / cardsPerPage);
      setTotalPages(total);
      
      const startIndex = (currentPage - 1) * cardsPerPage;
      const endIndex = startIndex + cardsPerPage;
      const paginatedCards = filteredData.slice(startIndex, endIndex);
      
      setCards(paginatedCards);
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

  const handleSync = async (forceFullSync = false) => {
    setSyncing(true);
    setSyncProgress({ isRunning: true, message: "Starting sync...", currentPage: 0, totalPages: 0 });
    
    try {
      toast({
        title: forceFullSync ? "Full sync started" : "Checking for updates...",
        description: forceFullSync 
          ? "Re-syncing entire card database. This will take 3-5 minutes."
          : "Checking for new sets and cards...",
      });

      fetch("/api/sync-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceFullSync }),
      }).catch((error) => {
        console.error("Sync request error:", error);
        setSyncing(false);
        toast({
          title: "Sync failed to start",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      });
    } catch (error) {
      console.error("Sync error:", error);
      setSyncing(false);
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    loadCards();
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCardClick = (card: CardType) => {
    setSelectedCard(card);
    setDialogOpen(true);
  };

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
            
            <div className="flex gap-2">
              <Button
                onClick={() => handleSync(false)}
                disabled={syncing}
                variant="outline"
                className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
              >
                {syncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Update Database
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => handleSync(true)}
                disabled={syncing}
                variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-slate-800"
                title="Force full re-sync (slow)"
              >
                Full Re-sync
              </Button>
            </div>
          </div>

          {syncing && syncProgress && (
            <div className="mb-6 p-4 bg-slate-800 border border-cyan-500/30 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                <div className="flex-1">
                  <p className="text-white font-medium">{syncProgress.message}</p>
                  {syncProgress.totalPages > 0 && (
                    <p className="text-sm text-slate-400">
                      Page {syncProgress.currentPage} of ~{syncProgress.totalPages}
                      {syncProgress.processedCards > 0 && ` • ${syncProgress.processedCards} cards fetched`}
                    </p>
                  )}
                </div>
              </div>
              {syncProgress.totalPages > 0 && (
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (syncProgress.currentPage / syncProgress.totalPages) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
              <Input
                type="text"
                placeholder="Search cards..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-400 text-lg">
                No cards found. Click 'Update Database' to import cards.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {cards.map((card) => (
                  <Card
                    key={card.id}
                    className="bg-slate-800 border-slate-700 hover:border-cyan-500 transition-all cursor-pointer overflow-hidden group"
                    onClick={() => handleCardClick(card)}
                  >
                    <CardContent className="p-0">
                      {card.image_url && (
                        <img
                          src={card.image_url}
                          alt={card.name}
                          className="w-full h-auto group-hover:scale-105 transition-transform duration-200"
                        />
                      )}
                      <div className="p-2">
                        <p className="text-white text-sm font-medium line-clamp-2 leading-tight">
                          {card.name}
                        </p>
                        {card.is_restricted && (
                          <Badge className="mt-1 bg-red-600 text-white text-xs">
                            Restricted
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
                    <Input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const page = parseInt(e.target.value);
                        if (page >= 1 && page <= totalPages) {
                          handlePageChange(page);
                        }
                      }}
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
                {selectedCard?.name}
                {selectedCard?.is_restricted && (
                  <Badge className="bg-red-600 text-white">Restricted</Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedCard && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {/* Left: Card Image */}
                <div className="flex items-start justify-center">
                  {selectedCard.image_url && (
                    <img
                      src={selectedCard.image_url}
                      alt={selectedCard.name}
                      className="w-full max-w-md rounded-lg shadow-2xl"
                    />
                  )}
                </div>

                {/* Right: Card Details */}
                <div className="space-y-4 text-white">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Name</h3>
                    <p className="text-lg">{selectedCard.name}</p>
                  </div>

                  {selectedCard.rarity && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Rarity</h3>
                      <p className="text-lg">{selectedCard.rarity}</p>
                    </div>
                  )}

                  {selectedCard.card_type && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Type</h3>
                      <p className="text-lg">{selectedCard.card_type}</p>
                    </div>
                  )}

                  {selectedCard.element && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Element</h3>
                      <p className="text-lg">{selectedCard.element}</p>
                    </div>
                  )}

                  {selectedCard.cost !== null && selectedCard.cost !== undefined && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Cost</h3>
                      <p className="text-lg">{selectedCard.cost}</p>
                    </div>
                  )}

                  {selectedCard.effect_text && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Effect</h3>
                      <p className="text-base leading-relaxed">{selectedCard.effect_text}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    {selectedCard.power !== null && selectedCard.power !== undefined && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Power</h3>
                        <p className="text-lg">{selectedCard.power}</p>
                      </div>
                    )}

                    {selectedCard.life !== null && selectedCard.life !== undefined && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Life</h3>
                        <p className="text-lg">{selectedCard.life}</p>
                      </div>
                    )}

                    {selectedCard.speed !== null && selectedCard.speed !== undefined && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Speed</h3>
                        <p className="text-lg">{selectedCard.speed}</p>
                      </div>
                    )}
                  </div>

                  {selectedCard.class && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Class</h3>
                      <p className="text-lg">{selectedCard.class}</p>
                    </div>
                  )}

                  {selectedCard.illustrator && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Illustrator</h3>
                      <p className="text-base italic text-slate-300">{selectedCard.illustrator}</p>
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