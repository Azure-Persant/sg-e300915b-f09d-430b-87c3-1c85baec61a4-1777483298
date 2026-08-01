import { checkDeck, sectionCounts, type DeckProblem, type RuleCard, type SectionCount } from "@/lib/deckRules";
import { referencesToken } from "@/lib/deckImport";
import type { CardOwnership } from "@/services/collectionService";
import type { ArtOption, DeckCardWithCard } from "@/services/deckService";

/**
 * Everything both deck pages say about a deck, derived in one place.
 *
 * The view and the editor show the same counts, the same rule problems and the
 * same missing-cards list; only the controls differ. Deriving it twice would be
 * two chances for them to disagree about whether a deck is legal.
 */

const EMPTY_OWNERSHIP: CardOwnership = {
  personal: 0,
  sale: 0,
  loaned: 0,
  total: 0,
  foil: 0,
  foilOnHand: 0,
  locations: [],
};

/**
 * Copies available for a deck row. Lent-out cards are owned but cannot be put in
 * a deck, and a row asking for foil is only satisfied by foil copies — a plain
 * copy is not the card that row calls for.
 */
export const onHandFor = (held: CardOwnership | undefined, foil: boolean): number => {
  const owned = held ?? EMPTY_OWNERSHIP;
  return foil ? owned.foilOnHand : owned.personal + owned.sale - owned.foilOnHand;
};

export interface MissingEntry {
  /** Card name, with "(foil)" appended when the shortfall is of foil copies. */
  name: string;
  copies: number;
}

export interface DeckSummary {
  ruleCards: RuleCard[];
  counts: SectionCount[];
  problems: DeckProblem[];
  errors: DeckProblem[];
  missing: { entries: MissingEntry[]; copies: number };
}

export function summariseDeck(
  rows: DeckCardWithCard[],
  ownership: Map<string, CardOwnership>
): DeckSummary {
  const ruleCards: RuleCard[] = rows.map((row) => ({
    cardId: row.card_id,
    name: row.cards.name,
    types: row.cards.types,
    costMemory: row.cards.cost_memory,
    costReserve: row.cards.cost_reserve,
    isRestricted: row.cards.is_restricted,
    quantity: row.quantity,
    section: row.section,
  }));

  const problems = checkDeck(ruleCards);

  // Aggregated by name, because "two more Cinder Geyser" is the useful statement
  // even when the deck lists two printings of it. Foil shortfalls are counted
  // separately, since a plain copy will not fill them.
  const byName = new Map<string, number>();
  for (const row of rows) {
    const short = row.quantity - onHandFor(ownership.get(row.card_id), row.foil);
    if (short <= 0) continue;
    const label = row.foil ? `${row.cards.name} (foil)` : row.cards.name;
    byName.set(label, (byName.get(label) ?? 0) + short);
  }

  const entries = [...byName.entries()]
    .map(([name, copies]) => ({ name, copies }))
    .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));

  return {
    ruleCards,
    counts: sectionCounts(ruleCards),
    problems,
    errors: problems.filter((problem) => problem.severity === "error"),
    missing: {
      entries,
      copies: entries.reduce((total, entry) => total + entry.copies, 0),
    },
  };
}

/**
 * The tokens a deck creates, one preview each.
 *
 * Matched from the deck's own card text against the catalog's token cards, which
 * is the relationship this app has — no card names are hardcoded. Informational
 * only: nothing here reaches the rules, the counts or the inventory check.
 */
export function deckTokens(rows: DeckCardWithCard[], tokenCards: ArtOption[]): ArtOption[] {
  const effectText = rows.map((row) => row.cards.effect_text ?? "").join("\n");
  if (!effectText.trim()) return [];

  const byName = new Map<string, ArtOption>();
  for (const token of tokenCards) {
    if (byName.has(token.name)) continue;
    if (referencesToken(effectText, token.name)) byName.set(token.name, token);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Rows split into the three lists, each sorted by name. */
export function groupSections(rows: DeckCardWithCard[]) {
  return (["material", "main", "sideboard"] as const).map((section) => {
    const inSection = rows
      .filter((row) => row.section === section)
      .sort(
        (a, b) =>
          a.cards.name.localeCompare(b.cards.name) || Number(a.foil) - Number(b.foil)
      );
    return {
      section,
      rows: inSection,
      copies: inSection.reduce((total, row) => total + row.quantity, 0),
    };
  });
}
