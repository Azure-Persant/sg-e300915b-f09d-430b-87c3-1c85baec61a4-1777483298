import type { DeckSection } from "@/lib/deckList";

/**
 * The order cards appear in within a deck section.
 *
 * Two rules. The material deck leads with its champions, lowest level first, so
 * the Spirit a deck starts on is the first thing you see. Everything else —
 * regalia after the champions, and the whole of the main deck, sideboard and
 * tokens — groups by element and runs alphabetically inside each group.
 */

/**
 * Elements in display order: Norm, then the basics, then the advanced ones.
 *
 * Both tiers happen to be alphabetical, but they are written out rather than
 * sorted so the tiers stay deliberate. An element the catalog gains later and
 * that is missing here sorts after all of these rather than silently landing
 * first, which is what an unlisted value would do against a lookup that returned
 * zero.
 */
export const ELEMENT_ORDER: readonly string[] = [
  "NORM",
  "FIRE",
  "WATER",
  "WIND",
  "ARCANE",
  "ASTRA",
  "CRUX",
  "EXALTED",
  "EXIA",
  "LUXEM",
  "NEOS",
  "TERA",
  "UMBRA",
] as const;

const ELEMENT_RANK = new Map(ELEMENT_ORDER.map((element, index) => [element, index]));

/** Unknown or missing elements sort after every known one. */
export const elementRank = (element: string | null | undefined): number => {
  if (!element) return ELEMENT_ORDER.length + 1;
  return ELEMENT_RANK.get(element.toUpperCase()) ?? ELEMENT_ORDER.length;
};

/** The card fields the ordering reads. */
export interface OrderableCard {
  name: string;
  element?: string | null;
  types?: string[] | null;
  /**
   * A champion's memory cost is its level — checked against all 124 champions in
   * the catalog, where the two are equal without exception. The sync does not
   * store `level`, so this stands in for it; if a champion ever breaks that
   * equality, this is the line to fix.
   */
  cost_memory?: number | null;
}

export interface OrderableRow {
  cards: OrderableCard;
  foil?: boolean;
}

const isChampion = (card: OrderableCard): boolean =>
  (card.types ?? []).some((type) => type.toUpperCase() === "CHAMPION");

/** Level 0 champions are the Spirits — every one of the 31 in the catalog. */
export const championLevel = (card: OrderableCard): number => card.cost_memory ?? 0;

const byNameThenFinish = (a: OrderableRow, b: OrderableRow): number =>
  a.cards.name.localeCompare(b.cards.name) || Number(a.foil ?? false) - Number(b.foil ?? false);

/**
 * Compare two rows within one section.
 *
 * Champion ordering applies to the material deck only, which is what was asked
 * for. A champion sitting in a sideboard is legal but unusual, and there it
 * sorts by element with everything else.
 */
export function compareRows(section: DeckSection) {
  return (a: OrderableRow, b: OrderableRow): number => {
    if (section === "material") {
      const aChampion = isChampion(a.cards);
      const bChampion = isChampion(b.cards);

      if (aChampion !== bChampion) return aChampion ? -1 : 1;

      if (aChampion && bChampion) {
        const byLevel = championLevel(a.cards) - championLevel(b.cards);
        if (byLevel !== 0) return byLevel;
        return byNameThenFinish(a, b);
      }
    }

    const byElement = elementRank(a.cards.element) - elementRank(b.cards.element);
    if (byElement !== 0) return byElement;

    return byNameThenFinish(a, b);
  };
}

/** Sorted copy, leaving the caller's array alone. */
export function sortRows<T extends OrderableRow>(rows: T[], section: DeckSection): T[] {
  return rows.slice().sort(compareRows(section));
}

/** Tokens have no section of their own, so they order by element then name. */
export function sortByElementThenName<T extends { name: string; element?: string | null }>(
  items: T[]
): T[] {
  return items
    .slice()
    .sort(
      (a, b) => elementRank(a.element) - elementRank(b.element) || a.name.localeCompare(b.name)
    );
}
