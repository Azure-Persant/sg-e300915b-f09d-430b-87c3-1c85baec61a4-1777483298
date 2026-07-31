import { SECTION_LABELS, type DeckSection } from "@/lib/deckList";

/**
 * Grand Archive deck construction, as far as this app can check it.
 *
 * The limits live here as named constants rather than scattered through the UI,
 * so correcting one is a one-line change. What the catalog actually knows about a
 * card is its types, its costs, its name and whether it is restricted — so those
 * rules are enforced from data. Anything needing information the sync does not
 * store (element and class matching against your champion) is not checked here,
 * and is deliberately absent rather than guessed at.
 */

/** Cards with these types go in the material deck rather than the main deck. */
export const MATERIAL_TYPES = ["CHAMPION", "REGALIA"] as const;

/** Copies of one card name allowed across the whole deck. */
export const COPY_LIMIT = 4;

/** Copies allowed of a name on the restricted list. */
export const RESTRICTED_LIMIT = 1;

export const MATERIAL_DECK_SIZE = 12;
export const MAIN_DECK_MINIMUM = 60;

/**
 * The sideboard is measured in points, not cards. A material deck card costs
 * three, because a material slot is worth more than a main deck slot; everything
 * else costs one.
 */
export const SIDEBOARD_MAX_POINTS = 15;
export const MATERIAL_SIDEBOARD_POINTS = 3;
export const MAIN_SIDEBOARD_POINTS = 1;

/**
 * Whether the copy limit counts the sideboard alongside the main and material
 * decks. Counting it is the stricter reading and the usual one; flip this if
 * Grand Archive treats a constructed sideboard separately.
 */
export const SIDEBOARD_COUNTS_TOWARD_COPY_LIMIT = true;

/**
 * Which half of a deck a card belongs to.
 *
 * Read from the cost, which is what the game actually keys on: every material
 * deck card is paid for with memory and every main deck card with reserve, and no
 * card in the catalog carries both. "unknown" means the catalog gave us neither,
 * in which case nothing here guesses — the caller disables the move instead of
 * sending the card somewhere plausible.
 */
export type CostFamily = "material" | "main" | "unknown";

/** The card fields the placement rules read. */
export interface CostShape {
  cost_memory?: number | null;
  cost_reserve?: number | null;
  types?: string[] | null;
}

/** Champions and regalia are material deck cards. */
export const belongsInMaterial = (types: string[] | null | undefined): boolean =>
  (types ?? []).some((type) => (MATERIAL_TYPES as readonly string[]).includes(type.toUpperCase()));

/**
 * Note the null checks rather than truthiness: a memory cost of 0 is both
 * extremely common — most regalia are free — and falsy.
 */
export function costFamily(card: CostShape): CostFamily {
  if (card.cost_memory !== null && card.cost_memory !== undefined) return "material";
  if (card.cost_reserve !== null && card.cost_reserve !== undefined) return "main";
  // Costs missing: fall back to the type line, which is a fact rather than a
  // guess. Only a card with neither cost nor a material type is unknown.
  if (belongsInMaterial(card.types)) return "material";
  return "unknown";
}

/** Where a card lives when it is not in the sideboard. */
export const homeSection = (card: CostShape): DeckSection | null => {
  const family = costFamily(card);
  if (family === "material") return "material";
  if (family === "main") return "main";
  return null;
};

/**
 * Where a card is allowed to sit.
 *
 * The sideboard takes either kind — a spare regalia is a normal sideboard card,
 * costing three points instead of one — so the real constraint is that a material
 * card never sits in the main deck and vice versa.
 */
export const allowedSections = (card: CostShape): DeckSection[] => {
  const home = homeSection(card);
  return home ? [home, "sideboard"] : ["material", "main", "sideboard"];
};

/**
 * The section a card goes to when added or imported. An explicit sideboard stays
 * in the sideboard; anything else lands in the card's own half regardless of
 * which heading a pasted list filed it under.
 */
export const sectionForCard = (card: CostShape, requested: DeckSection): DeckSection => {
  if (requested === "sideboard") return "sideboard";
  return homeSection(card) ?? (requested === "material" ? "main" : requested);
};

/**
 * Where the swap button sends a card: out to the sideboard, or back to its own
 * half. Derived from the cost rather than from the section it is currently in,
 * which is what used to send a sideboarded regalia into the main deck.
 *
 * Returns null when the card's half is unknown, so the button can be disabled
 * rather than moving it somewhere wrong.
 */
export const swapTarget = (card: CostShape, section: DeckSection): DeckSection | null => {
  const home = homeSection(card);
  if (!home) return null;
  return section === "sideboard" ? home : "sideboard";
};

/** What the rules need to know about one card in a deck. */
export interface RuleCard {
  cardId: string;
  name: string;
  types: string[] | null;
  costMemory: number | null;
  costReserve: number | null;
  isRestricted: boolean | null;
  quantity: number;
  section: DeckSection;
}

export interface DeckProblem {
  /** An error means the deck is not legal; a warning is worth seeing anyway. */
  severity: "error" | "warning";
  message: string;
}

/** The cost shape of a RuleCard, for the placement helpers above. */
const shapeOf = (card: RuleCard): CostShape => ({
  cost_memory: card.costMemory,
  cost_reserve: card.costReserve,
  types: card.types,
});

/** Sideboard points for one card's copies. */
export const pointsFor = (card: RuleCard): number =>
  (costFamily(shapeOf(card)) === "material" ? MATERIAL_SIDEBOARD_POINTS : MAIN_SIDEBOARD_POINTS) *
  card.quantity;

/** Total sideboard points, which is what the 15 limit is measured in. */
export const sideboardPoints = (cards: RuleCard[]): number =>
  cards
    .filter((card) => card.section === "sideboard")
    .reduce((total, card) => total + pointsFor(card), 0);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Everything wrong with a deck, worst first.
 *
 * Placement problems come first because they are the ones that make the rest of
 * the counts meaningless.
 */
export function checkDeck(cards: RuleCard[]): DeckProblem[] {
  const problems: DeckProblem[] = [];

  const copiesIn = (section: DeckSection) =>
    cards
      .filter((card) => card.section === section)
      .reduce((total, card) => total + card.quantity, 0);

  // Placement.
  for (const card of cards) {
    const shape = shapeOf(card);
    if (costFamily(shape) === "unknown") {
      problems.push({
        severity: "warning",
        message: `${card.name} has no cost in the catalog, so its deck half cannot be checked.`,
      });
      continue;
    }
    if (!allowedSections(shape).includes(card.section)) {
      problems.push({
        severity: "error",
        message:
          homeSection(shape) === "material"
            ? `${card.name} is a material deck card and cannot go in the main deck.`
            : `${card.name} is a main deck card and cannot go in the material deck.`,
      });
    }
  }

  // Copies of a name. Printings are irrelevant here: four copies split across
  // two arts are still four copies of the card.
  const byName = new Map<string, { copies: number; restricted: boolean }>();
  for (const card of cards) {
    if (card.section === "sideboard" && !SIDEBOARD_COUNTS_TOWARD_COPY_LIMIT) continue;
    const entry = byName.get(card.name) ?? { copies: 0, restricted: false };
    entry.copies += card.quantity;
    entry.restricted = entry.restricted || card.isRestricted === true;
    byName.set(card.name, entry);
  }

  for (const [name, entry] of byName) {
    const limit = entry.restricted ? RESTRICTED_LIMIT : COPY_LIMIT;
    if (entry.copies > limit) {
      problems.push({
        severity: "error",
        message: entry.restricted
          ? `${name} is restricted to ${plural(limit, "copy")} — this deck has ${entry.copies}.`
          : `${name}: ${entry.copies} copies, more than the ${limit} allowed.`,
      });
    }
  }

  // Sizes. An empty deck is one being built, not an illegal one, so the size
  // rules stay quiet until there is something to judge.
  const material = copiesIn("material");
  const main = copiesIn("main");
  const points = sideboardPoints(cards);

  if (cards.length > 0) {
    if (material !== MATERIAL_DECK_SIZE) {
      problems.push({
        severity: "error",
        message: `The material deck holds ${material} of ${MATERIAL_DECK_SIZE} cards.`,
      });
    }
    if (main < MAIN_DECK_MINIMUM) {
      problems.push({
        severity: "error",
        message: `The main deck holds ${main} cards, ${MAIN_DECK_MINIMUM - main} short of ${MAIN_DECK_MINIMUM}.`,
      });
    }
  }

  if (points > SIDEBOARD_MAX_POINTS) {
    problems.push({
      severity: "error",
      message: `The sideboard is ${points} points, over the ${SIDEBOARD_MAX_POINTS} allowed. Material deck cards cost ${MATERIAL_SIDEBOARD_POINTS} points each.`,
    });
  }

  return problems;
}

/** Section counts against their targets, for the deck header. */
export interface SectionCount {
  section: DeckSection;
  label: string;
  /** What the header shows: cards for the decks, points for the sideboard. */
  value: number;
  /** Copies, kept for anything counting cards rather than points. */
  copies: number;
  /** The size this section is aiming at, where there is one. */
  target: number | null;
  /** Distinguishes "13 cards" from "15 points" in the header. */
  unit: "cards" | "points";
  ok: boolean;
}

export function sectionCounts(cards: RuleCard[]): SectionCount[] {
  const copies = (section: DeckSection) =>
    cards
      .filter((card) => card.section === section)
      .reduce((total, card) => total + card.quantity, 0);

  const material = copies("material");
  const main = copies("main");
  const sideboardCopies = copies("sideboard");
  const points = sideboardPoints(cards);

  return [
    {
      section: "material",
      label: SECTION_LABELS.material,
      value: material,
      copies: material,
      target: MATERIAL_DECK_SIZE,
      unit: "cards",
      ok: material === MATERIAL_DECK_SIZE,
    },
    {
      section: "main",
      label: SECTION_LABELS.main,
      value: main,
      copies: main,
      target: MAIN_DECK_MINIMUM,
      unit: "cards",
      ok: main >= MAIN_DECK_MINIMUM,
    },
    {
      section: "sideboard",
      label: SECTION_LABELS.sideboard,
      value: points,
      copies: sideboardCopies,
      target: SIDEBOARD_MAX_POINTS,
      unit: "points",
      ok: points <= SIDEBOARD_MAX_POINTS,
    },
  ];
}
