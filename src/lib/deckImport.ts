/**
 * The decisions an import has to make, kept away from the database calls that
 * surround them so they can be exercised directly.
 */

/** The bits of a printing needed to choose between printings of one card. */
export interface PrintingChoice {
  id: string;
  name: string;
  card_number: string;
  sets: { code: string; name: string; rank: number } | null;
}

/** How a deck list line pins a printing, when it does. */
export interface PrintingHint {
  setCode: string | null;
  cardNumber: string | null;
}

/**
 * Names are matched on letters and digits only, so "Diao Chan, Enchantress"
 * still matches when a list writes it without the comma, and case never
 * matters.
 */
export const looseKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Which printing to use for a name from a pasted list.
 *
 * A deck list names cards, not printings, so something has to choose. In order:
 * the printing the list explicitly pinned, then one the owner actually holds (so
 * an imported deck lines up with their shelves), then the earliest set by rank,
 * then the lowest collector number so the result is stable rather than whatever
 * Postgres happened to return first.
 */
export function pickPrinting<T extends PrintingChoice>(
  candidates: T[],
  hint: PrintingHint,
  owned: Set<string>
): T | null {
  if (candidates.length === 0) return null;

  if (hint.setCode) {
    const pinned = candidates.filter((candidate) => candidate.sets?.code === hint.setCode);
    const exact = hint.cardNumber
      ? pinned.find((candidate) => candidate.card_number === hint.cardNumber)
      : undefined;
    if (exact) return exact;
    if (pinned.length) return pinned[0];
  }

  return candidates.slice().sort((a, b) => {
    const ownedDiff = Number(owned.has(b.id)) - Number(owned.has(a.id));
    if (ownedDiff !== 0) return ownedDiff;

    const rankDiff = (a.sets?.rank ?? 999) - (b.sets?.rank ?? 999);
    if (rankDiff !== 0) return rankDiff;

    return a.card_number.localeCompare(b.card_number, undefined, { numeric: true });
  })[0];
}

/**
 * Whether any of this text creates the named token.
 *
 * Tokens are in the card catalog but never in a deck list, so the only link
 * from a deck to the tokens it makes is the card text: "Then summon a Spirit
 * Shard token." Requiring the word "token" after the name is what keeps a card
 * that merely shares a word with a token out of the results.
 */
export function referencesToken(effectText: string, tokenName: string): boolean {
  const escaped = tokenName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s+tokens?\\b`).test(effectText.toLowerCase());
}

/** PostgREST has a URL length limit, so long `in` lists go up in chunks. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}
