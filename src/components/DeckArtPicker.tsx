import { useEffect, useState, type ReactNode } from "react";
import { Check, ImageOff, Loader2 } from "lucide-react";

import { CardImage } from "@/components/CardImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { deckService, type ArtGroup } from "@/services/deckService";

interface Props {
  children: ReactNode;
  deckId: string;
  /** The printing currently used as the deck's art, if any. */
  currentCardId: string | null;
  /** Called after the choice is saved, so the caller can refresh its list. */
  onChange?: (cardId: string | null) => void;
}

/**
 * Choose which card's art represents the deck.
 *
 * Options are every printing of every card in the deck — the point is picking
 * between the alternate arts of one card as much as between cards — plus the
 * tokens the deck creates, which are in the catalog but never in a deck list.
 *
 * Loaded when the dialog opens rather than with the page: a deck of 30 names has
 * a few hundred printings, and most visits to the deck list never open this.
 */
export function DeckArtPicker({ children, deckId, currentCardId, onChange }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<ArtGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(currentCardId);

  useEffect(() => {
    setSelected(currentCardId);
  }, [currentCardId]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const options = await deckService.getArtOptions(deckId);
        if (active) setGroups(options);
      } catch (error) {
        if (active) {
          toast({
            title: "Could not load card art",
            description:
              error instanceof Error ? error.message : "Please try again in a moment.",
            variant: "destructive",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, deckId, toast]);

  const choose = async (cardId: string | null) => {
    setSaving(cardId ?? "none");
    try {
      await deckService.setCoverCard(deckId, cardId);
      setSelected(cardId);
      onChange?.(cardId);
      setOpen(false);
    } catch (error) {
      toast({
        title: "Could not save that art",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const deckGroups = groups.filter((group) => group.kind === "deck");
  const tokenGroups = groups.filter((group) => group.kind === "token");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-slate-700 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Choose the deck art</DialogTitle>
          <DialogDescription className="text-slate-400">
            Every printing of every card in this deck, so alternate arts are here
            too. Tokens the deck creates are listed at the end.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-12 text-center text-slate-400">
            Add cards to the deck first — the art comes from the cards in it.
          </p>
        ) : (
          <div className="space-y-8">
            <Button
              variant="outline"
              onClick={() => choose(null)}
              disabled={saving !== null}
              className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
            >
              <ImageOff className="mr-2 h-4 w-4" />
              Use no art
            </Button>

            {deckGroups.map((group) => (
              <ArtRow
                key={`deck-${group.name}`}
                group={group}
                selected={selected}
                saving={saving}
                onChoose={choose}
              />
            ))}

            {tokenGroups.length > 0 && (
              <div className="space-y-8 border-t border-slate-700 pt-6">
                <p className="text-sm text-slate-400">
                  Tokens this deck creates
                </p>
                {tokenGroups.map((group) => (
                  <ArtRow
                    key={`token-${group.name}`}
                    group={group}
                    selected={selected}
                    saving={saving}
                    onChoose={choose}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArtRow({
  group,
  selected,
  saving,
  onChoose,
}: {
  group: ArtGroup;
  selected: string | null;
  saving: string | null;
  onChoose: (cardId: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold text-white">{group.name}</h3>
        {group.kind === "token" && (
          <Badge variant="outline" className="border-violet-500 text-violet-300">
            Token
          </Badge>
        )}
        <span className="text-xs text-slate-500">
          {group.options.length} printing{group.options.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {group.options.map((option) => {
          const isSelected = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChoose(option.id)}
              disabled={saving !== null}
              className={`group relative overflow-hidden rounded-lg border-2 text-left transition-colors ${
                isSelected
                  ? "border-cyan-400"
                  : "border-transparent hover:border-cyan-500/60"
              }`}
            >
              <CardImage
                src={option.image_url}
                alt={`${option.name} (${option.set_code ?? "unknown set"})`}
                variant="tile"
                className="h-auto w-full"
              />
              <span className="block px-1.5 py-1 text-[11px] leading-tight text-slate-400">
                {option.set_code ?? "???"} {option.card_number}
              </span>

              {isSelected && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-cyan-500 p-1 text-white">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {saving === option.id && (
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/60">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
