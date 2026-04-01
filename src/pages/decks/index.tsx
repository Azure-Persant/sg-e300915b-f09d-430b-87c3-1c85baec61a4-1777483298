import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deckService, type Deck } from "@/services/deckService";
import { useAuth } from "@/hooks/useAuth";
import { Layers, Plus, Calendar, Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function DecksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadDecks();
    }
  }, [user]);

  const loadDecks = async () => {
    if (!user) return;
    try {
      const data = await deckService.getUserDecks(user.id);
      setDecks(data);
    } catch (error) {
      console.error("Error loading decks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeck = async () => {
    if (!user || !newDeckName.trim()) return;
    try {
      await deckService.createDeck(user.id, newDeckName, newDeckDescription);
      setNewDeckName("");
      setNewDeckDescription("");
      setCreateDialogOpen(false);
      await loadDecks();
    } catch (error) {
      console.error("Error creating deck:", error);
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm("Are you sure you want to delete this deck?")) return;
    try {
      await deckService.deleteDeck(deckId);
      await loadDecks();
    } catch (error) {
      console.error("Error deleting deck:", error);
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
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-heading font-bold mb-2">My Decks</h1>
              <p className="text-muted-foreground">
                Build and manage your Grand Archive decks
              </p>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Deck
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-heading">Create New Deck</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="deck-name">Deck Name *</Label>
                    <Input
                      id="deck-name"
                      placeholder="e.g., Lorraine Control"
                      value={newDeckName}
                      onChange={(e) => setNewDeckName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deck-description">Description (Optional)</Label>
                    <Textarea
                      id="deck-description"
                      placeholder="Deck strategy, notes..."
                      value={newDeckDescription}
                      onChange={(e) => setNewDeckDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleCreateDeck} className="w-full" disabled={!newDeckName.trim()}>
                    Create Deck
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-muted-foreground">Loading decks...</p>
            </div>
          ) : decks.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium mb-2">No decks yet</p>
              <p className="text-muted-foreground mb-6">Create your first deck to start building</p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Deck
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {decks.map((deck) => (
                <Card key={deck.id} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="font-heading mb-2 line-clamp-1">
                          {deck.name}
                        </CardTitle>
                        {deck.description && (
                          <CardDescription className="line-clamp-2">
                            {deck.description}
                          </CardDescription>
                        )}
                      </div>
                      <div className="rounded-full bg-primary/10 p-2">
                        <Layers className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {new Date(deck.updated_at).toLocaleDateString()}
                    </div>
                    <div className="flex gap-2">
                      <Button asChild className="flex-1">
                        <Link href={`/decks/${deck.id}`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDeleteDeck(deck.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}