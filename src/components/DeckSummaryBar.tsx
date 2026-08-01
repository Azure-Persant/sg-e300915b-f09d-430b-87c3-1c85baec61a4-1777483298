import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { MATERIAL_SIDEBOARD_POINTS } from "@/lib/deckRules";
import type { DeckSummary } from "@/lib/deckSummary";

/**
 * The strip above a deck: section counts, what the collection is short, and
 * whether the deck is legal.
 *
 * Shared by the view and the editor so the two cannot disagree about a deck.
 */
export function DeckSummaryBar({ summary }: { summary: DeckSummary }) {
  const { counts, problems, errors, missing } = summary;

  return (
    <Card className="mb-6 border-slate-700 bg-slate-800/50">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
        {counts.map((count) => (
          <div key={count.section}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{count.label}</p>
            {/* The sideboard is measured in points, so it shows points and keeps
                the card count as the smaller line beneath. */}
            <p className={`text-xl font-bold ${count.ok ? "text-white" : "text-amber-400"}`}>
              {count.value}
              {count.target !== null && (
                <span className="text-sm font-normal text-slate-500">
                  {count.section === "main" ? " / min " : " / "}
                  {count.target}
                  {count.unit === "points" && " pts"}
                </span>
              )}
            </p>
            {count.unit === "points" && (
              <p className="text-xs text-slate-500">
                {count.copies} card{count.copies === 1 ? "" : "s"}
                {" · material cards cost "}
                {MATERIAL_SIDEBOARD_POINTS}
              </p>
            )}
          </div>
        ))}

        <div className="hidden h-10 w-px bg-slate-700 sm:block" />

        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <div className="cursor-help">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Cards Missing from Inventory
              </p>
              <p
                className={`text-xl font-bold ${
                  missing.copies > 0
                    ? "text-amber-400 underline decoration-dotted underline-offset-4"
                    : "text-green-400"
                }`}
              >
                {missing.copies}
              </p>
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="max-h-80 w-80 overflow-y-auto border-slate-700 bg-slate-900 text-slate-200">
            {missing.entries.length === 0 ? (
              <p className="text-sm">Every card in this deck is in your collection and on hand.</p>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium text-white">
                  Missing {missing.copies} card{missing.copies === 1 ? "" : "s"}
                </p>
                <ul className="space-y-1 text-sm">
                  {missing.entries.map((entry) => (
                    <li key={entry.name} className="flex justify-between gap-3">
                      <span className="truncate">{entry.name}</span>
                      <span className="shrink-0 text-amber-400">{entry.copies}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  Copies lent out are not counted as on hand, and a foil row is only
                  filled by foil copies.
                </p>
              </>
            )}
          </HoverCardContent>
        </HoverCard>

        <div className="ml-auto">
          <HoverCard openDelay={100}>
            <HoverCardTrigger asChild>
              {errors.length === 0 ? (
                <Badge className="cursor-help gap-1 bg-green-600/20 text-green-300 hover:bg-green-600/30">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Deck is legal
                </Badge>
              ) : (
                <Badge className="cursor-help gap-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {errors.length} rule issue{errors.length === 1 ? "" : "s"}
                </Badge>
              )}
            </HoverCardTrigger>
            <HoverCardContent className="w-96 border-slate-700 bg-slate-900 text-slate-200">
              {problems.length === 0 ? (
                <p className="text-sm">
                  Nothing to flag: sizes, copy limits and the restricted list all check out.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {problems.map((problem) => (
                    <li key={problem.message} className="flex gap-2">
                      <AlertTriangle
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          problem.severity === "error" ? "text-amber-400" : "text-slate-500"
                        }`}
                      />
                      <span>{problem.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-slate-700 pt-2 text-xs text-slate-500">
                Champion levels and element or class matching are not checked — the catalog
                does not carry that yet.
              </p>
            </HoverCardContent>
          </HoverCard>
        </div>
      </CardContent>
    </Card>
  );
}
