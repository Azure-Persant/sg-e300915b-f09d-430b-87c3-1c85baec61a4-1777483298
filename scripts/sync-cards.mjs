#!/usr/bin/env node
/**
 * Full Grand Archive catalog sync.
 *
 * This runs as a plain Node process (GitHub Actions, or locally) rather than as
 * a Vercel serverless function. The catalog is ~4,500 printings across ~151 API
 * pages; at ~1.7s per page the fetch loop alone exceeds Vercel's 300s
 * maxDuration, which is why the serverless cron could never finish and left
 * sync_history rows stranded in "running".
 *
 * Usage:
 *   node scripts/sync-cards.mjs [--dry-run] [--max-pages N] [--concurrency N]
 *
 * Env:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)   required unless --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY                    required unless --dry-run
 */

import { createClient } from "@supabase/supabase-js";

const API_BASE_URL = "https://api.gatcg.com";
const CARD_UPSERT_BATCH_SIZE = 200;
const SET_UPSERT_BATCH_SIZE = 100;
const RESTRICTED_UPDATE_BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_RETRIES = 4;
const STALE_RUN_TIMEOUT_MS = 600_000;

// The API caps page_size at 30 server-side regardless of the requested limit.
// We still ask for more so the cap is the API's decision, not an assumption
// baked into this script — actual page size is always read from the response.
const REQUESTED_PAGE_LIMIT = 100;

const RARITY_BY_NUMBER = {
  1: "C",    // Common
  2: "U",    // Uncommon
  3: "R",    // Rare
  4: "SR",   // Super Rare
  5: "UR",   // Ultra Rare
  6: "ScR",  // Secret Rare
  7: "CSR",  // Collector's Super Rare
  8: "CUR",  // Collector's Ultra Rare — all 18 rarity-8 printings carry a "-cur" slug suffix
  9: "P",    // Promo
};

// ---------------------------------------------------------------- utilities

const parseArgs = (argv) => {
  const args = { dryRun: false, maxPages: Infinity, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--max-pages") args.maxPages = Number(argv[++i]);
    else if (arg === "--concurrency") args.concurrency = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  return args;
};

const errorMessage = (error) => {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint]
      .filter((p) => typeof p === "string" && p.trim());
    if (parts.length) {
      return `${parts.join(" — ")}${error.code ? ` (${error.code})` : ""}`;
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      /* circular */
    }
  }
  return "An unexpected error occurred.";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const batches = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const log = (...parts) => console.log(`[${new Date().toISOString()}]`, ...parts);

// ------------------------------------------------------------------- fetch

/** Fetch one page, retrying transient failures with exponential backoff. */
async function fetchPage(url, label) {
  let lastError;

  for (let attempt = 1; attempt <= PAGE_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "<unreadable>");
        // 4xx other than 429 is a contract problem, not a blip — fail fast.
        if (response.status < 500 && response.status !== 429) {
          throw new Error(
            `${label}: API returned ${response.status} ${response.statusText} — ${body.slice(0, 300)}`
          );
        }
        throw new Error(
          `${label}: API returned ${response.status} ${response.statusText} (retryable) — ${body.slice(0, 300)}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data?.data)) {
        throw new Error(
          `${label}: expected "data" to be an array, got ${typeof data?.data}. ` +
            `Top-level keys: ${Object.keys(data ?? {}).join(", ") || "none"}`
        );
      }

      return data;
    } catch (error) {
      lastError = error;
      const retryable = !/API returned 4\d\d/.test(errorMessage(error)) ||
        /429/.test(errorMessage(error));

      if (!retryable || attempt === PAGE_RETRIES) break;

      const backoff = 2 ** attempt * 500;
      log(`  ${label}: ${errorMessage(error)} — retrying in ${backoff}ms (attempt ${attempt}/${PAGE_RETRIES})`);
      await sleep(backoff);
    }
  }

  throw new Error(`${label} failed after ${PAGE_RETRIES} attempts: ${errorMessage(lastError)}`);
}

/** Run tasks with bounded concurrency, preserving input order in the output. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/** Fetch the whole catalog. Page 1 tells us how many pages there really are. */
async function fetchAllCards({ maxPages, concurrency }) {
  const pageUrl = (page) =>
    `${API_BASE_URL}/cards/search?separate_editions=true&page=${page}` +
    `&limit=${REQUESTED_PAGE_LIMIT}&sort=collector_number`;

  const first = await fetchPage(pageUrl(1), "page 1");
  const pageSize = first.page_size ?? first.data.length;
  const totalPages = first.total_pages ?? 1;
  const lastPage = Math.min(totalPages, maxPages);

  log(
    `Catalog: ${first.total_cards} cards across ${totalPages} pages ` +
      `(page_size=${pageSize}, requested limit=${REQUESTED_PAGE_LIMIT})`
  );
  if (lastPage < totalPages) log(`Limited to ${lastPage} page(s) by --max-pages`);

  const remaining = [];
  for (let page = 2; page <= lastPage; page++) remaining.push(page);

  let done = 1;
  const rest = await mapWithConcurrency(remaining, concurrency, async (page) => {
    const data = await fetchPage(pageUrl(page), `page ${page}`);
    done++;
    if (done % 25 === 0 || done === lastPage) log(`  fetched ${done}/${lastPage} pages`);
    return data.data;
  });

  const cards = [first.data, ...rest].flat();
  log(`Fetched ${cards.length} card objects from ${lastPage} page(s)`);

  return { cards, pagesFetched: lastPage, totalCards: first.total_cards };
}

// ------------------------------------------------------------------- parse

/** Collect the distinct sets referenced by every edition of every card. */
function extractSets(cards) {
  const sets = new Map();
  for (const card of cards) {
    for (const edition of card.result_editions || card.editions || []) {
      const set = edition?.set;
      if (!set?.id || sets.has(set.id)) continue;
      sets.set(set.id, {
        code: set.id,
        name: set.name,
        release_date: set.release_date ? set.release_date.slice(0, 10) : null,
      });
    }
  }
  return sets;
}

/**
 * Flatten cards into one row per printing.
 *
 * Note on stats: the API exposes power/life/speed at the card level. Earlier
 * code read card.stats.ATK / card.stats.HP, but no `stats` object exists in the
 * payload, so power and life were silently NULL on every row.
 */
function buildCardRows(cards, setCodeToId) {
  const rows = [];
  const skipped = [];

  for (const card of cards) {
    const types = Array.isArray(card.types) ? card.types : [];
    const subtypes = Array.isArray(card.subtypes) ? card.subtypes : [];
    let cardType = types.join(" ").toUpperCase();
    if (subtypes.length) {
      cardType = cardType
        ? `${cardType} — ${subtypes.join(" ").toUpperCase()}`
        : subtypes.join(" ").toUpperCase();
    }

    for (const edition of card.result_editions || card.editions || []) {
      const setCode = edition?.set?.id;
      const setId = setCode ? setCodeToId.get(setCode) : null;

      if (!setId) {
        skipped.push(`${card.name} (set ${setCode ?? "unknown"})`);
        continue;
      }

      rows.push({
        set_id: setId,
        name: card.name || "Unknown",
        card_number: edition.collector_number || "UNKNOWN",
        element: card.element ?? null,
        card_type: cardType || "Unknown",
        class: Array.isArray(card.classes) && card.classes.length
          ? card.classes.join(", ")
          : null,
        rarity: RARITY_BY_NUMBER[edition.rarity] ?? "UNKNOWN",
        cost: card.cost_reserve ?? card.cost_memory ?? 0,
        power: card.power ?? null,
        life: card.life ?? null,
        speed: card.speed ?? null,
        effect_text:
          edition.effect_raw || edition.effect || card.effect_raw || card.effect || null,
        flavor_text: edition.flavor || card.flavor || null,
        image_url: edition.image ? `${API_BASE_URL}${edition.image}` : null,
        illustrator: edition.illustrator || null,
      });
    }
  }

  // Matches the cards_printing_key unique constraint
  // (set_id, card_number, rarity, image_url) nulls not distinct.
  const unique = new Map();
  for (const row of rows) {
    unique.set(
      `${row.set_id}|${row.card_number}|${row.rarity}|${row.image_url ?? ""}`,
      row
    );
  }

  return { rows: Array.from(unique.values()), duplicates: rows.length - unique.size, skipped };
}

async function fetchRestrictedNames() {
  const names = new Set();
  let page = 1;

  while (page <= 20) {
    const url =
      `${API_BASE_URL}/cards/search?legality_format=STANDARD` +
      `&legality_state=RESTRICTED&page=${page}&limit=${REQUESTED_PAGE_LIMIT}`;
    const data = await fetchPage(url, `restricted page ${page}`);
    for (const card of data.data) if (card?.name) names.add(card.name);
    if (!data.has_more) break;
    page++;
  }

  return Array.from(names);
}

// ---------------------------------------------------------------------- db

const upsertInBatches = async (supabase, table, rows, size, onConflict, label) => {
  for (const [index, batch] of batches(rows, size).entries()) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(
        `${label}: batch ${index + 1} failed (${batch.length} rows): ${errorMessage(error)}`
      );
    }
  }
};

// -------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!args.dryRun && (!supabaseUrl || !serviceRoleKey)) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY. " +
        "Pass --dry-run to exercise fetch and parse without database access."
    );
  }

  const supabase = args.dryRun
    ? null
    : createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  let syncId = null;
  let pagesFetched = 0;
  let cardsSaved = 0;

  try {
    if (supabase) {
      // A run killed mid-flight never records its own failure, so its row would
      // stay "running" forever and skew every later diagnosis.
      const { data: reaped, error: reapError } = await supabase
        .from("sync_history")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message:
            "Abandoned: the run ended without reporting a result. Marked failed by a later sync.",
        })
        .eq("status", "running")
        .lt("started_at", new Date(Date.now() - STALE_RUN_TIMEOUT_MS).toISOString())
        .select("id");

      if (reapError) log(`Warning: could not reap stale runs: ${errorMessage(reapError)}`);
      else if (reaped?.length) log(`Marked ${reaped.length} abandoned run(s) as failed`);

      const { data: record, error: createError } = await supabase
        .from("sync_history")
        .insert({ started_at: new Date().toISOString(), status: "running" })
        .select("id")
        .single();

      if (createError) {
        throw new Error(`Could not open a sync_history record: ${errorMessage(createError)}`);
      }
      syncId = record.id;
      log(`Opened sync_history record ${syncId}`);
    }

    // -- fetch -------------------------------------------------------------
    const { cards, pagesFetched: pages } = await fetchAllCards(args);
    pagesFetched = pages;

    // -- sets --------------------------------------------------------------
    const sets = extractSets(cards);
    log(`Found ${sets.size} distinct sets`);

    let setCodeToId = new Map();

    if (supabase) {
      await upsertInBatches(
        supabase, "sets", Array.from(sets.values()), SET_UPSERT_BATCH_SIZE, "code", "Upserting sets"
      );

      const { data: allSets, error: setsReadError } = await supabase.from("sets").select("id, code");
      if (setsReadError) throw new Error(`Failed to read back sets: ${errorMessage(setsReadError)}`);
      setCodeToId = new Map(allSets.map((s) => [s.code, s.id]));
      log(`Upserted sets; ${setCodeToId.size} set codes mapped`);
    } else {
      // Stable placeholder ids so the dry run can still exercise the parser.
      setCodeToId = new Map(Array.from(sets.keys()).map((code) => [code, `dry-run-${code}`]));
    }

    // -- cards -------------------------------------------------------------
    const { rows, duplicates, skipped } = buildCardRows(cards, setCodeToId);
    log(`Prepared ${rows.length} printings (${duplicates} duplicate keys collapsed)`);
    if (skipped.length) {
      log(`Warning: skipped ${skipped.length} printings with no resolvable set, e.g. ${skipped.slice(0, 3).join("; ")}`);
    }

    if (supabase) {
      await upsertInBatches(
        supabase, "cards", rows, CARD_UPSERT_BATCH_SIZE, "set_id,card_number,rarity,image_url", "Upserting cards"
      );
      cardsSaved = rows.length;
      log(`Upserted ${cardsSaved} printings`);
    } else {
      cardsSaved = rows.length;
    }

    // -- restricted --------------------------------------------------------
    let restricted = [];
    if (args.maxPages === Infinity) {
      restricted = await fetchRestrictedNames();
      log(`Found ${restricted.length} restricted card names`);

      if (supabase && restricted.length) {
        // Clear first so cards no longer restricted do not stay flagged.
        const { error: clearError } = await supabase
          .from("cards").update({ is_restricted: false }).eq("is_restricted", true);
        if (clearError) throw new Error(`Failed to clear restricted flags: ${errorMessage(clearError)}`);

        for (const [index, batch] of batches(restricted, RESTRICTED_UPDATE_BATCH_SIZE).entries()) {
          const { error } = await supabase
            .from("cards").update({ is_restricted: true }).in("name", batch);
          if (error) {
            throw new Error(`Restricted batch ${index + 1} failed: ${errorMessage(error)}`);
          }
        }
        log(`Flagged ${restricted.length} restricted card names`);
      }
    } else {
      log("Skipping restricted-card pass (partial sync via --max-pages)");
    }

    // -- done --------------------------------------------------------------
    const elapsed = Math.round((Date.now() - startedAt) / 1000);

    if (supabase && syncId) {
      const { error } = await supabase
        .from("sync_history")
        .update({
          completed_at: new Date().toISOString(),
          status: "completed",
          total_cards_processed: cardsSaved,
          total_sets_processed: sets.size,
          pages_fetched: pagesFetched,
        })
        .eq("id", syncId);
      if (error) log(`Warning: could not record completion: ${errorMessage(error)}`);
    }

    log(
      `${args.dryRun ? "DRY RUN " : ""}SYNC COMPLETE in ${elapsed}s — ` +
        `${pagesFetched} pages, ${sets.size} sets, ${cardsSaved} printings, ${restricted.length} restricted`
    );

    if (args.dryRun) {
      console.log("\nSample row:\n" + JSON.stringify(rows[0], null, 2));
      const withPower = rows.filter((r) => r.power !== null).length;
      const withLife = rows.filter((r) => r.life !== null).length;
      const unknownRarity = rows.filter((r) => r.rarity === "UNKNOWN").length;
      console.log(
        `\nField coverage: power ${withPower}/${rows.length}, ` +
          `life ${withLife}/${rows.length}, UNKNOWN rarity ${unknownRarity}/${rows.length}`
      );
    }
  } catch (error) {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const message =
      `${errorMessage(error)} [after ${elapsed}s, ${pagesFetched} page(s) fetched, ${cardsSaved} card(s) saved]`;

    console.error(`\nSYNC FAILED: ${message}`);
    if (error instanceof Error && error.stack) console.error(error.stack);

    if (supabase && syncId) {
      try {
        await supabase
          .from("sync_history")
          .update({
            completed_at: new Date().toISOString(),
            status: "failed",
            error_message: message.slice(0, 2000),
            pages_fetched: pagesFetched,
            total_cards_processed: cardsSaved,
          })
          .eq("id", syncId);
      } catch (writeError) {
        console.error(`Also failed to record the failure: ${errorMessage(writeError)}`);
      }
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Fatal: ${errorMessage(error)}`);
  process.exitCode = 1;
});
