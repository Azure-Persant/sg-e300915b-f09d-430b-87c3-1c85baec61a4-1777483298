import { useMemo, useState, type ReactNode } from "react";
import { Copy, Download, FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  DECK_SECTIONS,
  SECTION_LABELS,
  countSection,
  parseDeckList,
  type DeckListEntry,
} from "@/lib/deckList";
import type { ImportResult } from "@/services/deckService";

/** How a paste combines with what is already in the deck. */
export type ImportMode = "replace" | "add";

const PLACEHOLDER = `# Material Deck
1 Fragmented Spirit of Fire
1 Diao Chan, Enchantress

# Main Deck
4 Cinder Geyser
3 Ignis Deus

# Sideboard
2 Meltdown`;

interface ImportProps {
  children: ReactNode;
  onImport: (entries: DeckListEntry[], mode: ImportMode) => Promise<ImportResult>;
  /** Hidden when the deck is empty — there is nothing to replace. */
  canReplace?: boolean;
}

/**
 * Paste a deck list in the omni.gatcg.com format.
 *
 * The parse runs as you type, so the counts and any unreadable lines are
 * visible before anything is written. Names that have no printing in the
 * catalog are reported after the import rather than silently dropped — a
 * misspelling and a card this app has never synced look identical otherwise.
 */
export function DeckImportDialog({ children, onImport, canReplace = true }: ImportProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("replace");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parsed = useMemo(() => parseDeckList(text), [text]);
  const totals = DECK_SECTIONS.map((section) => ({
    section,
    copies: countSection(parsed.entries, section),
  })).filter((row) => row.copies > 0);
  const totalCopies = totals.reduce((sum, row) => sum + row.copies, 0);

  const reset = () => {
    setText("");
    setResult(null);
    setBusy(false);
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const outcome = await onImport(parsed.entries, canReplace ? mode : "add");
      setResult(outcome);
      toast({
        title: "Deck list imported",
        description: `${outcome.copies} card${outcome.copies === 1 ? "" : "s"} across ${
          outcome.matched
        } printing${outcome.matched === 1 ? "" : "s"}.`,
      });
      // Leave the dialog open when something did not resolve, so the names stay
      // on screen to be fixed.
      if (outcome.unmatched.length === 0) {
        setOpen(false);
        reset();
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Could not import that list.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-700 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Import a deck list</DialogTitle>
          <DialogDescription className="text-slate-400">
            Paste a list in the same format omni.gatcg.com uses — a{" "}
            <code className="text-slate-300"># Material Deck</code> /{" "}
            <code className="text-slate-300"># Main Deck</code> /{" "}
            <code className="text-slate-300"># Sideboard</code> heading, then one
            &ldquo;quantity name&rdquo; per line.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult(null);
          }}
          placeholder={PLACEHOLDER}
          rows={14}
          spellCheck={false}
          className="border-slate-700 bg-slate-950 font-mono text-sm text-slate-100 placeholder:text-slate-600"
        />

        {text.trim() && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {totals.length === 0 ? (
                <span className="text-slate-400">Nothing readable yet.</span>
              ) : (
                totals.map(({ section, copies }) => (
                  <span key={section} className="text-slate-300">
                    <span className="font-semibold text-white">{copies}</span>{" "}
                    {SECTION_LABELS[section]}
                  </span>
                ))
              )}
            </div>

            {parsed.problems.length > 0 && (
              <ul className="space-y-1 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
                {parsed.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result && result.unmatched.length > 0 && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <p className="font-medium">
              {result.unmatched.length} name
              {result.unmatched.length === 1 ? "" : "s"} had no card in the catalog:
            </p>
            <p className="mt-1 text-amber-100/90">{result.unmatched.join(", ")}</p>
            <p className="mt-2 text-amber-200/70">
              Everything else was imported. Check the spelling, or the card may not
              be in a synced set yet.
            </p>
          </div>
        )}

        {canReplace && (
          <div className="space-y-2">
            <Label className="text-slate-300">When importing</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as ImportMode)}
              className="gap-2"
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <RadioGroupItem value="replace" className="border-slate-600" />
                Replace the deck with this list
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <RadioGroupItem value="add" className="border-slate-600" />
                Add these cards to what is already here
              </label>
            </RadioGroup>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={handleImport}
            disabled={busy || parsed.entries.length === 0}
            className="bg-cyan-600 text-white hover:bg-cyan-700"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            {totalCopies > 0 ? `Import ${totalCopies} cards` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExportProps {
  children: ReactNode;
  /** The deck as text, already in the export format. */
  text: string;
  /** Used for the downloaded file name. */
  deckName: string;
}

/**
 * The deck as pasteable text.
 *
 * The text is shown rather than only copied, because the clipboard API needs a
 * secure context and a user gesture and quietly fails often enough that a copy
 * button on its own is not a reliable way to get a deck out of the app.
 */
export function DeckExportDialog({ children, text, deckName }: ExportProps) {
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "The deck list is on your clipboard." });
    } catch {
      toast({
        title: "Could not copy",
        description: "Select the text and copy it manually.",
        variant: "destructive",
      });
    }
  };

  const download = () => {
    const safeName = deckName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "deck";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-700 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Export deck list</DialogTitle>
          <DialogDescription className="text-slate-400">
            The same format omni.gatcg.com reads. Copies of one card across
            different printings are combined into a single line.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          readOnly
          value={text}
          rows={16}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="border-slate-700 bg-slate-950 font-mono text-sm text-slate-100"
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={download}
            className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
          >
            <Download className="mr-2 h-4 w-4" />
            Download .txt
          </Button>
          <Button onClick={copy} className="bg-cyan-600 text-white hover:bg-cyan-700">
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
