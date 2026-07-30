/**
 * The plain-text deck list format used by omni.gatcg.com.
 *
 *   # Material Deck
 *   1 Fragmented Spirit of Fire
 *
 *   # Main Deck
 *   4 Cinder Geyser
 *
 *   # Sideboard
 *   2 Meltdown
 *
 * Kept as pure functions with no database or React in sight, because this is
 * the part that has to cope with whatever a person actually pastes.
 */

export type DeckSection = "material" | "main" | "sideboard";

export const DECK_SECTIONS: readonly DeckSection[] = ["material", "main", "sideboard"] as const;

export const SECTION_LABELS: Record<DeckSection, string> = {
  material: "Material Deck",
  main: "Main Deck",
  sideboard: "Sideboard",
};

export const isDeckSection = (value: unknown): value is DeckSection =>
  typeof value === "string" && (DECK_SECTIONS as readonly string[]).includes(value);

/** Anything unrecognised is read as a main deck card, which is the common case. */
export const asDeckSection = (value: unknown): DeckSection =>
  isDeckSection(value) ? value : "main";

export interface DeckListEntry {
  quantity: number;
  name: string;
  section: DeckSection;
  /** Set code, when the list names one — "Cinder Geyser (MRC) 042". */
  setCode: string | null;
  /** Collector number, when the list names one. */
  cardNumber: string | null;
  /** 1-based line in the pasted text, so problems can point somewhere. */
  line: number;
}

export interface ParsedDeckList {
  entries: DeckListEntry[];
  /** Lines that looked like content but could not be read. */
  problems: string[];
}

/**
 * Curly quotes and non-breaking spaces arrive whenever a list has been through
 * a word processor or a chat window. Card names in the catalog use the straight
 * forms, so normalise before matching rather than failing to find the card.
 */
const normalisePunctuation = (text: string): string =>
  text
    .replace(/ /g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");

/**
 * Which list a header line opens. Checked most specific first: "Material Deck"
 * also contains "deck", and "Sideboard" must not be read as the main deck.
 */
const sectionFromHeader = (text: string): DeckSection | null => {
  const t = text.toLowerCase();
  if (t.includes("side")) return "sideboard";
  if (t.includes("material") || t.includes("champion")) return "material";
  if (t.includes("main") || t.includes("deck")) return "main";
  return null;
};

/** "3 Card Name", "3x Card Name", "3 x Card Name". */
const ENTRY = /^(\d{1,3})\s*[xX]?\s+(.*\S)\s*$/;

/**
 * A trailing set annotation, as omni writes when a list pins printings:
 * "Cinder Geyser (MRC) 042" or "Cinder Geyser [MRC]". No Grand Archive card
 * name ends in a bracketed token, so this is safe to strip.
 */
const ANNOTATION = /\s*[([]([A-Za-z0-9]{2,10})[)\]](?:\s+([A-Za-z0-9-]+))?$/;

export function parseDeckList(text: string): ParsedDeckList {
  const entries: DeckListEntry[] = [];
  const problems: string[] = [];
  let section: DeckSection = "main";

  const lines = normalisePunctuation(text).split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    // Headers, in either "# Main Deck" or bare "Main Deck" form.
    if (trimmed.startsWith("#")) {
      const heading = trimmed.replace(/^#+\s*/, "").replace(/:$/, "");
      const found = sectionFromHeader(heading);
      if (found) {
        section = found;
      } else {
        problems.push(`Line ${line}: ignored unrecognised heading "${heading}"`);
      }
      return;
    }

    // Comment lines some exporters add.
    if (trimmed.startsWith("//")) return;

    const match = ENTRY.exec(trimmed);
    if (!match) {
      // A bare section name with no "#" — "Sideboard" on its own line.
      const found = sectionFromHeader(trimmed);
      if (found && trimmed.split(/\s+/).length <= 3) {
        section = found;
        return;
      }
      problems.push(`Line ${line}: could not read "${trimmed}"`);
      return;
    }

    const quantity = Number.parseInt(match[1], 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      problems.push(`Line ${line}: "${trimmed}" has no usable quantity`);
      return;
    }

    let name = match[2];
    let setCode: string | null = null;
    let cardNumber: string | null = null;

    const annotation = ANNOTATION.exec(name);
    if (annotation) {
      setCode = annotation[1].toUpperCase();
      cardNumber = annotation[2] ?? null;
      name = name.slice(0, annotation.index).trim();
    }

    if (!name) {
      problems.push(`Line ${line}: "${trimmed}" has no card name`);
      return;
    }

    entries.push({ quantity, name, section, setCode, cardNumber, line });
  });

  return { entries, problems };
}

/** A single line's worth of deck list, for export. */
export interface DeckListRow {
  quantity: number;
  name: string;
  section: DeckSection;
}

/**
 * Back to text, in the same shape omni reads.
 *
 * Rows are aggregated by name within each section: a deck holds printings, and
 * three copies of one card split across two printings is still "3 Card Name" in
 * a deck list. Names are sorted so exporting the same deck twice gives the same
 * file.
 */
export function formatDeckList(rows: DeckListRow[]): string {
  const out: string[] = [];

  for (const section of DECK_SECTIONS) {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.section !== section) continue;
      totals.set(row.name, (totals.get(row.name) ?? 0) + row.quantity);
    }
    if (totals.size === 0) continue;

    if (out.length) out.push("");
    out.push(`# ${SECTION_LABELS[section]}`);
    for (const name of [...totals.keys()].sort((a, b) => a.localeCompare(b))) {
      out.push(`${totals.get(name)} ${name}`);
    }
  }

  return out.join("\n");
}

/** Total copies in a section, for the deck header counts. */
export const countSection = (rows: DeckListRow[], section: DeckSection): number =>
  rows.reduce((total, row) => (row.section === section ? total + row.quantity : total), 0);
