import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Loader2, Search, X } from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ELEMENT_ORDER, elementRank } from "@/lib/deckOrder";
import { deckService, type ShowcaseDeck } from "@/services/deckService";

const ANY = "__any__";

/**
 * Public decks, newest first.
 *
 * Open to everyone: no account is needed to browse or to open a deck from here.
 * Filtering happens in Postgres against the arrays the deck_showcase view
 * aggregates, so the page never downloads decks it is about to throw away.
 */
export default function DeckShowcasePage() {
  const { toast } = useToast();
  const [decks, setDecks] = useState<ShowcaseDeck[]>([]);
  const [champions, setChampions] = useState<string[]>([]);
  const [elements, setElements] = useState<string[]>([]);
  const [champion, setChampion] = useState<string>(ANY);
  const [chosenElements, setChosenElements] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    (async () => {
      try {
        const filters = await deckService.getShowcaseFilters();
        setChampions(filters.champions);
        // Ordered the way decks order their elements, not by how many decks use
        // them, so the row of buttons is stable as decks come and go.
        setElements(filters.elements.slice().sort((a, b) => elementRank(a) - elementRank(b)));
      } catch (error) {
        console.error("Could not load showcase filters:", error);
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const rows = await deckService.getShowcase({
          champion: champion === ANY ? null : champion,
          elements: chosenElements,
          search: debouncedSearch,
        });
        if (active) setDecks(rows);
      } catch (error) {
        if (active) {
          toast({
            variant: "destructive",
            title: "Could not load the showcase",
            description: error instanceof Error ? error.message : "Please try again.",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [champion, chosenElements, debouncedSearch, toast]);

  const toggleElement = (element: string) =>
    setChosenElements((current) =>
      current.includes(element)
        ? current.filter((value) => value !== element)
        : [...current, element]
    );

  const filtered = champion !== ANY || chosenElements.length > 0 || debouncedSearch.trim();

  const knownElements = useMemo(
    () => elements.filter((element) => ELEMENT_ORDER.includes(element.toUpperCase())),
    [elements]
  );

  return (
    <>
      <SEO
        title="Deck Showcase"
        description="Public Grand Archive decks shared by the community"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="mb-2 text-4xl font-bold text-white">Deck Showcase</h1>
            <p className="text-slate-400">
              Public decks from the community, newest first. No account needed to look.
            </p>
          </div>

          <Card className="mb-6 border-slate-700 bg-slate-800/50">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search deck names..."
                    className="border-slate-700 bg-slate-800 pl-9 text-white placeholder:text-slate-500"
                  />
                </div>

                <Select value={champion} onValueChange={setChampion}>
                  <SelectTrigger className="w-[240px] border-slate-700 bg-slate-800 text-white">
                    <SelectValue placeholder="Any champion" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any champion</SelectItem>
                    {champions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {filtered && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setChampion(ANY);
                      setChosenElements([]);
                      setSearch("");
                    }}
                    className="text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>

              {knownElements.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs uppercase tracking-wide text-slate-500">
                    Elements
                  </span>
                  {knownElements.map((element) => {
                    const on = chosenElements.includes(element);
                    return (
                      <button
                        key={element}
                        type="button"
                        onClick={() => toggleElement(element)}
                        aria-pressed={on}
                        className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                          on
                            ? "border-cyan-500 bg-cyan-500/15 text-cyan-300"
                            : "border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white"
                        }`}
                      >
                        {element}
                      </button>
                    );
                  })}
                  {chosenElements.length > 1 && (
                    <span className="ml-1 text-xs text-slate-500">
                      showing decks using any of these
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : decks.length === 0 ? (
            <div className="py-16 text-center">
              <Layers className="mx-auto mb-4 h-16 w-16 text-slate-600" />
              <p className="mb-2 text-lg font-medium text-white">
                {filtered ? "No decks match those filters" : "No public decks yet"}
              </p>
              <p className="text-slate-400">
                {filtered
                  ? "Try clearing a filter."
                  : "Set one of your own decks to Public and it will appear here."}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {decks.map((deck) => (
                <Card
                  key={deck.id}
                  className="overflow-hidden border-slate-700 bg-slate-800/50 transition-colors hover:border-cyan-500/60"
                >
                  <div className="relative aspect-video overflow-hidden bg-slate-900">
                    <Link
                      href={`/decks/${deck.id}`}
                      aria-label={`Open ${deck.name}`}
                      className="group absolute inset-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
                    >
                      {deck.cover_image_url ? (
                        <CardImage
                          src={deck.cover_image_url}
                          alt={deck.cover_name ?? deck.name}
                          variant="banner"
                          quality={90}
                          className="absolute left-[-6%] top-0 h-full w-[112%] max-w-none object-cover object-[center_30%] transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Layers className="h-10 w-10 text-slate-700" />
                        </span>
                      )}

                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent p-3 pt-8">
                        <span className="block truncate text-lg font-bold text-white">
                          {deck.name}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          by {deck.owner_name}
                          {deck.top_champion && ` · ${deck.top_champion}`}
                        </span>
                      </span>
                    </Link>
                  </div>

                  <CardContent className="space-y-3 p-4">
                    {deck.description && (
                      <p className="line-clamp-2 text-sm text-slate-400">{deck.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(deck.elements ?? []).map((element) => (
                        <Badge
                          key={element}
                          variant="outline"
                          className="border-slate-600 text-xs text-slate-300"
                        >
                          {element}
                        </Badge>
                      ))}
                      <span className="ml-auto text-xs text-slate-500">
                        {deck.card_count} cards
                      </span>
                    </div>

                    <Button
                      asChild
                      className="w-full bg-cyan-600 text-white hover:bg-cyan-700"
                    >
                      <Link href={`/decks/${deck.id}`}>View deck</Link>
                    </Button>
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
