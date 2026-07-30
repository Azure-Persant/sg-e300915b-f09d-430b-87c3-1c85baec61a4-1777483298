import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

import { CardImage } from "@/components/CardImage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { deckService, type ArtOption } from "@/services/deckService";

interface Props {
  children: ReactNode;
  /** Card name, which is what identifies the printings to choose between. */
  cardName: string;
  /** The printing the deck currently uses. */
  currentCardId: string;
  onSelect: (cardId: string) => Promise<void> | void;
}

/**
 * Swap which printing of a card the deck uses.
 *
 * Reached by clicking the card in the deck list, because that is where someone
 * is looking when they decide they would rather have the other art. Fetched on
 * open — one card's printings is a small query, and most rows are never clicked.
 */
export function PrintingPicker({ children, cardName, currentCardId, onSelect }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ArtOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const printings = await deckService.printingsForCardName(cardName);
        if (active) setOptions(printings);
      } catch (error) {
        if (active) {
          toast({
            title: "Could not load printings",
            description: error instanceof Error ? error.message : "Please try again.",
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
  }, [open, cardName, toast]);

  const choose = async (cardId: string) => {
    if (cardId === currentCardId) {
      setOpen(false);
      return;
    }
    setSaving(cardId);
    try {
      await onSelect(cardId);
      setOpen(false);
    } catch (error) {
      toast({
        title: "Could not change the printing",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border-slate-700 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{cardName}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Choose which printing this deck uses. The count stays the same.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
          </div>
        ) : options.length <= 1 ? (
          <p className="py-8 text-center text-slate-400">
            This card has only one printing with art.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {options.map((option) => {
              const isCurrent = option.id === currentCardId;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => choose(option.id)}
                  disabled={saving !== null}
                  className={`relative overflow-hidden rounded-lg border-2 text-left transition-colors ${
                    isCurrent ? "border-cyan-400" : "border-transparent hover:border-cyan-500/60"
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

                  {isCurrent && (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
