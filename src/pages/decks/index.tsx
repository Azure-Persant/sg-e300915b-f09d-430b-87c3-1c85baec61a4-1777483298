import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Calendar, Image as ImageIcon, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { DeckArtPicker } from "@/components/DeckArtPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { parseDeckList } from "@/lib/deckList";
import { deckService, type DeckSummary } from "@/services/deckService";

export default function DecksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");
  const [newDeckList, setNewDeckList] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) loadDecks();
  }, [user]);

  const loadDecks = async () => {
    if (!user) return;
    try {
      setDecks(await deckService.getUserDecks(user.id));
    } catch (error) {
      toast({
        title: "Could not load your decks",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Creating a deck and pasting a list are one step, because that is how a deck
   * usually arrives — from somewhere else.
   */
  const handleCreateDeck = async () => {
    if (!user || !newDeckName.trim()) return;
    setCreating(true);
    try {
      const deck = await deckService.createDeck(user.id, newDeckName.trim(), newDeckDescription);

      if (newDeckList.trim()) {
        const { entries } = parseDeckList(newDeckList);
        const result = await deckService.importDeckList(deck.id, user.id, entries, {
          replace: true,
        });
        toast({
          title: "Deck created",
          description:
            result.unmatched.length > 0
              ? `${result.copies} cards imported. ${result.unmatched.length} name${
                  result.unmatched.length === 1 ? "" : "s"
                } not found: ${result.unmatched.join(", ")}`
              : `${result.copies} cards imported.`,
        });
      }

      setNewDeckName("");
      setNewDeckDescription("");
      setNewDeckList("");
      setCreateDialogOpen(false);
      await loadDecks();
    } catch (error) {
      toast({
        title: "Could not create that deck",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDeck = async (deckId: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deckService.deleteDeck(deckId);
      await loadDecks();
    } catch (error) {
      toast({
        title: "Could not delete that deck",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (authLoading || !user) {
    return (
      <>
        <Navigation />
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title="My Decks" description="Build and manage your Grand Archive decks" />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 text-4xl font-bold text-white">My Decks</h1>
              <p className="text-slate-400">
                Build and manage your Grand Archive decks
              </p>
            </div>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-cyan-600 text-white hover:bg-cyan-700">
                  <Plus className="mr-2 h-4 w-4" />
                  New Deck
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-slate-700 bg-slate-900 text-white">
                <DialogHeader>
                  <DialogTitle className="text-white">Create a new deck</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Start empty, or paste a list from omni.gatcg.com to fill it now.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="deck-name" className="text-slate-300">
                      Deck name
                    </Label>
                    <Input
                      id="deck-name"
                      placeholder="e.g. Rococo Fire"
                      value={newDeckName}
                      onChange={(event) => setNewDeckName(event.target.value)}
                      className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deck-description" className="text-slate-300">
                      Description (optional)
                    </Label>
                    <Textarea
                      id="deck-description"
                      placeholder="Strategy, notes..."
                      value={newDeckDescription}
                      onChange={(event) => setNewDeckDescription(event.target.value)}
                      rows={2}
                      className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deck-list" className="text-slate-300">
                      Deck list (optional)
                    </Label>
                    <Textarea
                      id="deck-list"
                      placeholder={"# Material Deck\n1 Fragmented Spirit of Fire\n\n# Main Deck\n4 Cinder Geyser"}
                      value={newDeckList}
                      onChange={(event) => setNewDeckList(event.target.value)}
                      rows={8}
                      spellCheck={false}
                      className="border-slate-700 bg-slate-950 font-mono text-sm text-slate-100 placeholder:text-slate-600"
                    />
                  </div>

                  <Button
                    onClick={handleCreateDeck}
                    className="w-full bg-cyan-600 text-white hover:bg-cyan-700"
                    disabled={!newDeckName.trim() || creating}
                  >
                    {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create deck
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : decks.length === 0 ? (
            <div className="py-16 text-center">
              <Layers className="mx-auto mb-4 h-16 w-16 text-slate-600" />
              <p className="mb-2 text-lg font-medium text-white">No decks yet</p>
              <p className="mb-6 text-slate-400">
                Create your first deck, or paste one in to get started
              </p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="bg-cyan-600 text-white hover:bg-cyan-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create your first deck
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {decks.map((deck) => (
                <Card
                  key={deck.id}
                  className="overflow-hidden border-slate-700 bg-slate-800/50 transition-colors hover:border-cyan-500/60"
                >
                  {/* The chosen card's art, cropped to a banner. Card art is
                      portrait and the illustration sits in the upper half, so
                      the crop is pinned to the top rather than centred. */}
                  <div className="relative h-40 overflow-hidden bg-slate-900">
                    {deck.cover?.image_url ? (
                      <CardImage
                        src={deck.cover.image_url}
                        alt={deck.cover.name}
                        variant="tile"
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Layers className="h-10 w-10 text-slate-700" />
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent p-3 pt-8">
                      <h2 className="line-clamp-1 text-lg font-bold text-white">
                        {deck.name}
                      </h2>
                      {deck.cover && (
                        <p className="line-clamp-1 text-xs text-slate-400">
                          Art: {deck.cover.name}
                        </p>
                      )}
                    </div>

                    <DeckArtPicker
                      deckId={deck.id}
                      currentCardId={deck.cover_card_id}
                      onChange={loadDecks}
                    >
                      <Button
                        size="icon"
                        variant="secondary"
                        title="Choose deck art"
                        className="absolute right-2 top-2 h-8 w-8 bg-slate-900/80 text-slate-200 hover:bg-slate-900 hover:text-white"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                    </DeckArtPicker>
                  </div>

                  <CardContent className="space-y-4 p-4">
                    {deck.description && (
                      <p className="line-clamp-2 text-sm text-slate-400">
                        {deck.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Calendar className="h-4 w-4" />
                      {deck.updated_at
                        ? new Date(deck.updated_at).toLocaleDateString()
                        : "—"}
                    </div>

                    <div className="flex gap-2">
                      <Button asChild className="flex-1 bg-cyan-600 text-white hover:bg-cyan-700">
                        <Link href={`/decks/${deck.id}`}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title={`Delete ${deck.name}`}
                        onClick={() => handleDeleteDeck(deck.id, deck.name)}
                        className="border-slate-600 text-slate-300 hover:bg-red-950 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
