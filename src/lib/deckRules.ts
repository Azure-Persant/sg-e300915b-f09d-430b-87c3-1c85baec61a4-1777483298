import { SECTION_LABELS, type DeckSection } from "@/lib/deckList";

/**
 * Grand Archive deck construction, as far as this app can check it.
 *
 * The limits live here as named constants rather than scattered through the UI,
 * so correcting one is a one-line change. What the catalog actually knows about
 * a card is its types, its name and whether it is restricted — so those rules
 * are enforced from data. Anything needing information the sync does not store
 * (champion levels, element and class matching against your champion) is not
 * checked here, and is deliberately absent rather than guessed at.
 */

/** Cards with these types go in the material deck and nowhere else. */
export const MATERIAL_TYPES = ["CHAMPION", "REGALIA"] as const;

/** Copies of one card name allowed across the whole deck. */
export const COPY_LIMIT = 4;

/** Copies allowed of a name on the restricted list. */
export const RESTRICTED_LIMIT = 1;

export const MATERIAL_DECK_SIZE = 12;
export const MAIN_DECK_MINIMUM = 60;
export const SIDEBOARD_MAXIMUM = 15;

/**
 * Whether the copy limit counts the sideboard alongside the main and material
 * decks. Counting it is the stricter reading and the usual one; flip this if
 * Grand Archive treats a constructed sideboard separately.
 */
export const SIDEBOARD_COUNTS_TOWARD_COPY_LIMIT = true;

/** What the rules need to know about one card in a deck. */
export interface RuleCard {
  cardId: string;
  name: string;
  types: string[] | null;
  isRestricted: boolean | null;
  quantity: number;
  section: DeckSection;
}

export interface DeckProblem {
  /** An error means the deck is not legal; a warning is worth seeing anyway. */
  severity: "error" | "warning";
  message: string;
}

/** Champions and regalia are material deck cards. */
export const belongsInMaterial = (types: string[] | null | undefined): boolean =>
  (types ?? []).some((type) => (MATERIAL_TYPES as readonly string[]).includes(type.toUpperCase()));

/**
 * Where a card is allowed to sit. Material cards have exactly one home, which is
 * why nothing asks the person building the deck to choose; everything else is a
 * genuine main-or-sideboard decision.
 */
export const allowedSections = (types: string[] | null | undefined): DeckSection[] =>
  belongsInMaterial(types) ? ["material"] : ["main", "sideboard"];

/** The section a card must go to when it is being added or imported. */
export const sectionForCard = (
  types: string[] | null | undefined,
  requested: DeckSection
): DeckSection => {
  if (belongsInMaterial(types)) return "material";
  // A non-material card cannot sit in the material deck, so a list that put it
  // there is read as a main deck card.
  return requested === "material" ? "main" : requested;
};

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
    const allowed = allowedSections(card.types);
    if (!allowed.includes(card.section)) {
      problems.push({
        severity: "error",
        message: belongsInMaterial(card.types)
          ? `${card.name} is a ${(card.types ?? []).join("/")} card and belongs in the material deck.`
          : `${card.name} cannot go in the material deck.`,
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
  const sideboard = copiesIn("sideboard");

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

  if (sideboard > SIDEBOARD_MAXIMUM) {
    problems.push({
      severity: "warning",
      message: `The sideboard holds ${sideboard} cards, more than the ${SIDEBOARD_MAXIMUM} allowed.`,
    });
  }

  return problems;
}

/** Section counts against their targets, for the deck header. */
export interface SectionCount {
  section: DeckSection;
  label: string;
  copies: number;
  /** The size this section is aiming at, where there is one. */
  target: number | null;
  ok: boolean;
}

export function sectionCounts(cards: RuleCard[]): SectionCount[] {
  const copies = (section: DeckSection) =>
    cards
      .filter((card) => card.section === section)
      .reduce((total, card) => total + card.quantity, 0);

  const material = copies("material");
  const main = copies("main");
  const sideboard = copies("sideboard");

  return [
    {
      section: "material",
      label: SECTION_LABELS.material,
      copies: material,
      target: MATERIAL_DECK_SIZE,
      ok: material === MATERIAL_DECK_SIZE,
    },
    {
      section: "main",
      label: SECTION_LABELS.main,
      copies: main,
      target: MAIN_DECK_MINIMUM,
      ok: main >= MAIN_DECK_MINIMUM,
    },
    {
      section: "sideboard",
      label: SECTION_LABELS.sideboard,
      copies: sideboard,
      target: null,
      ok: sideboard <= SIDEBOARD_MAXIMUM,
    },
  ];
}
