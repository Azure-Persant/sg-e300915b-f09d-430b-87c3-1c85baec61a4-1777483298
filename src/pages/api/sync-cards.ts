import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/integrations/supabase/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { updateProgress, resetProgress } from "./sync-progress";

const API_BASE_URL = "https://api.gatcg.com";
const CARD_UPSERT_BATCH_SIZE = 200;
const RESTRICTED_UPDATE_BATCH_SIZE = 50;
const SYNC_DEADLINE_MS = 270_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MANUAL_SYNC_PAGES_PER_REQUEST = 8;
// A run older than this with status "running" cannot still be alive: it exceeds
// the 300s maxDuration ceiling by a wide margin.
const STALE_RUN_TIMEOUT_MS = 600_000;

export const config = {
  maxDuration: 300,
};

const splitIntoBatches = <T,>(items: T[], batchSize: number): T[][] => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Check if force full sync is requested
  const forceFullSync = req.method === "POST" && req.body?.forceFullSync === true;
  const requestedStartPage = Number(req.body?.startPage);
  const startPage =
    req.method === "POST" && Number.isInteger(requestedStartPage) && requestedStartPage > 0
      ? requestedStartPage
      : 1;
  const maxPagesThisRequest =
    req.method === "POST" ? MANUAL_SYNC_PAGES_PER_REQUEST : Number.POSITIVE_INFINITY;

  // Helper function to map rarity numbers to names
  const mapRarityNumber = (rarityNum: number): string => {
    const rarityMap: Record<number, string> = {
      1: "C",      // Common
      2: "U",      // Uncommon
      3: "R",      // Rare
      4: "SR",     // Super Rare
      5: "UR",     // Ultra Rare
      6: "ScR",    // Secret Rare
      7: "CSR",    // Collector's Super Rare
      8: "CUR",    // Collector's Ultra Rare
      9: "P",      // Promo
    };
    return rarityMap[rarityNum] || "UNKNOWN";
  };

  console.log("=== SYNC STARTED (SEPARATE EDITIONS MODE) ===");

  // Close out rows abandoned by a previous run. A serverless invocation that is
  // killed by the platform timeout never reaches its catch block, so its row
  // stays "running" forever and every later diagnosis is read against stale state.
  const { data: reaped, error: reapError } = await supabaseAdmin
    .from("sync_history")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message:
        "Abandoned: the serverless invocation ended without reporting a result (most likely the platform execution limit). Marked failed by a later sync.",
    })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - STALE_RUN_TIMEOUT_MS).toISOString())
    .select("id");

  if (reapError) {
    console.error("Failed to reap stale sync rows:", getErrorMessage(reapError));
  } else if (reaped?.length) {
    console.warn(`Marked ${reaped.length} abandoned sync run(s) as failed:`, reaped.map(r => r.id));
  }

  // Create sync history record
  const { data: syncRecord, error: syncCreateError } = await supabaseAdmin
    .from("sync_history")
    .insert({
      started_at: new Date().toISOString(),
      status: "running",
    })
    .select()
    .single();

  if (syncCreateError) {
    // Without a row there is no durable record of this run, so say so loudly
    // rather than silently proceeding into an unobservable sync.
    console.error("Failed to create sync record:", getErrorMessage(syncCreateError));
    return res.status(500).json({
      success: false,
      error: `Could not open a sync_history record: ${getErrorMessage(syncCreateError)}`,
      stage: "opening the sync history record",
    });
  }

  const syncId = syncRecord?.id;
  let syncStage = "checking the existing catalog";
  const syncStartedAt = Date.now();

  const assertTimeRemaining = () => {
    if (Date.now() - syncStartedAt >= SYNC_DEADLINE_MS) {
      throw new Error(
        "The sync stopped before Vercel's five-minute limit. Run it again to retry, or use a smaller synchronization batch."
      );
    }
  };

  // Reset progress tracking
  resetProgress();
  updateProgress({ isRunning: true, message: "Starting sync..." });

  // Declared outside the try so the failure path can report how far the run got.
  // Previously these lived inside the try, so a failed run wrote neither counter
  // and the columns kept their DB default of 0 — making every failure look like
  // it died on the very first page.
  let pagesFetchedThisRequest = 0;
  let insertedCount = 0;

  try {
    // Check if we should do incremental sync
    let shouldDoIncrementalSync = false;
    let existingSetCodes: string[] = [];

    if (req.method === "GET" && !forceFullSync) {
      const { count: cardCount } = await supabaseAdmin
        .from("cards")
        .select("*", { count: "exact", head: true });

      // If we have cards already, do incremental sync
      if (cardCount && cardCount > 100) {
        shouldDoIncrementalSync = true;

        const { data: existingSets } = await supabaseAdmin
          .from("sets")
          .select("code");

        existingSetCodes = existingSets?.map(s => s.code) || [];
        console.log(`Incremental sync mode: ${existingSetCodes.length} sets already in database`);
        updateProgress({ message: `Incremental sync: checking for new sets (${existingSetCodes.length} existing)` });
      }
    }

    let allCardsData: any[] = [];
    let hasMore = true;
    let page = startPage;
    const pageSize = 100;

    syncStage = "downloading cards from the Grand Archive API";

    // Estimate total pages (API typically has ~40-60 pages)
    updateProgress({ totalPages: 60, message: "Fetching cards from API..." });

    // Fetch all cards using pagination with separate_editions=true
    while (hasMore) {
      assertTimeRemaining();
      const url = `${API_BASE_URL}/cards/search?separate_editions=true&page=${page}&limit=${pageSize}&sort=collector_number`;

      console.log(`Fetching page ${page}...`);
      updateProgress({
        currentPage: page,
        message: `Fetching page ${page}...`
      });

      let response: Response;
      try {
        response = await fetch(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (fetchError) {
        // Network failures, DNS errors and AbortSignal timeouts all land here with
        // messages that name neither the page nor the URL. Attach both.
        throw new Error(
          `Could not reach the Grand Archive API on page ${page} (${url}): ${getErrorMessage(fetchError)}`
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "<response body unreadable>");
        console.error(`API request failed with status ${response.status}:`, errorText);
        throw new Error(
          `Grand Archive API returned ${response.status} ${response.statusText} for page ${page} (${url}): ${errorText.slice(0, 500)}`
        );
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(
          `Grand Archive API returned a non-JSON body for page ${page} (${url}): ${getErrorMessage(parseError)}`
        );
      }

      if (!Array.isArray(data?.data)) {
        // Guards against a silent contract change: without this the sync would
        // treat a reshaped payload as "zero cards" and report success.
        throw new Error(
          `Unexpected Grand Archive API response shape on page ${page}: expected "data" to be an array, got ${typeof data?.data}. Top-level keys: ${Object.keys(data ?? {}).join(", ") || "none"}`
        );
      }

      const cards = data.data;

      allCardsData = allCardsData.concat(cards);
      console.log(`  ✓ Page ${page}: ${cards.length} cards (total: ${allCardsData.length})`);
      updateProgress({
        processedCards: allCardsData.length,
        message: `Fetched ${allCardsData.length} cards from ${page} pages`
      });

      hasMore = data.has_more || false;

      // Update total pages estimate based on actual pagination
      if (hasMore && page === 1) {
        const estimatedTotal = Math.ceil((data.total_cards || 5000) / pageSize);
        updateProgress({ totalPages: estimatedTotal });
      }

      page++;
      pagesFetchedThisRequest++;

      if (pagesFetchedThisRequest >= maxPagesThisRequest) {
        break;
      }

    }

    console.log(
      `\n[STEP 1 COMPLETE] Fetched ${allCardsData.length} card editions from ${pagesFetchedThisRequest} pages`
    );
    updateProgress({
      message: `Processing ${allCardsData.length} cards...`,
      totalPages: pagesFetchedThisRequest,
    });

    console.log(`\n[STEP 2] Processing ${allCardsData.length} card objects...`);

    // Extract unique sets - with separate_editions=true, set info is INSIDE editions array
    const uniqueSets = new Map<string, any>();
    allCardsData.forEach((card: any) => {
      // Loop through editions array to find all sets
      const editions = card.result_editions || card.editions || [];
      editions.forEach((edition: any) => {
        if (edition?.set) {
          const setCode = edition.set.id;
          if (!uniqueSets.has(setCode)) {
            uniqueSets.set(setCode, {
              code: setCode,
              name: edition.set.name,
              release_date: edition.set.release_date || null,
            });
          }
        }
      });
    });

    console.log(`  Found ${uniqueSets.size} unique sets in API`);

    // Check for new sets (if incremental sync)
    let newSetCodes: string[] = [];
    if (shouldDoIncrementalSync) {
      const allSetCodes = Array.from(uniqueSets.keys());
      newSetCodes = allSetCodes.filter(code => !existingSetCodes.includes(code));

      if (newSetCodes.length === 0) {
        console.log("  ✓ No new sets found - database is up to date!");
        updateProgress({
          isRunning: false,
          message: "Database is up to date - no new sets to sync"
        });

        // Update sync history
        if (syncId) {
          await supabaseAdmin
            .from("sync_history")
            .update({
              completed_at: new Date().toISOString(),
              status: "completed",
              total_cards_processed: 0,
              total_sets_processed: 0,
              pages_fetched: pagesFetchedThisRequest,
            })
            .eq("id", syncId);
        }

        return res.status(200).json({
          success: true,
          message: "Database is up to date",
          totalCards: allCardsData.length,
          processedInBatch: 0,
          newSets: 0,
          setsProcessed: 0,
          pagesProcessed: pagesFetchedThisRequest,
          nextPage: null,
        });
      }

      console.log(`  Found ${newSetCodes.length} NEW sets to sync:`, newSetCodes);
      updateProgress({ message: `Found ${newSetCodes.length} new sets to sync` });
    }

    syncStage = "saving card sets to Supabase";

    // Insert/update sets
    if (uniqueSets.size > 0) {
      const setsArray = Array.from(uniqueSets.values());
      console.log(`  Upserting ${setsArray.length} sets...`);
      updateProgress({ message: `Upserting ${setsArray.length} sets...` });

      const { data: insertedSets, error: setsError } = await supabaseAdmin
        .from("sets")
        .upsert(setsArray, { onConflict: "code" })
        .select("id, code");

      if (setsError) {
        console.error("  ❌ Error upserting sets:", setsError);
        throw new Error(`Failed to upsert sets: ${setsError.message}`);
      }

      console.log(`  ✓ Upserted ${insertedSets?.length || 0} sets`);
    }

    syncStage = "reading saved card sets from Supabase";

    // Fetch set IDs
    const { data: allSets, error: fetchSetsError } = await supabaseAdmin
      .from("sets")
      .select("id, code");

    if (fetchSetsError) {
      throw new Error(`Failed to fetch sets: ${fetchSetsError.message}`);
    }

    const setCodeToId = new Map<string, string>();
    allSets?.forEach(set => {
      setCodeToId.set(set.code, set.id);
    });

    console.log(`  Mapped ${setCodeToId.size} set codes to IDs`);

    // Process cards - with separate_editions=true, each card object has ALL its editions in the editions[] array
    updateProgress({ message: "Processing card data..." });
    const cardsToInsert: any[] = [];

    allCardsData.forEach((card: any) => {
      // Get all editions for this card (result_editions and editions are the same)
      const editions = card.result_editions || card.editions || [];

      // Loop through EACH edition and create a separate database entry
      editions.forEach((edition: any) => {
        const setCode = edition.set?.id;
        const setId = setCode ? setCodeToId.get(setCode) : null;

        if (!setId) {
          console.warn(`  ⚠️ No set_id found for: ${card.name} (${setCode})`);
          return;
        }

        // If incremental sync, only process cards from new sets
        if (shouldDoIncrementalSync && !newSetCodes.includes(setCode)) {
          return;
        }

        const imageUrl = edition.image ? `https://api.gatcg.com${edition.image}` : null;
        const effect = edition.effect_raw || edition.effect || card.effect_raw || card.effect || null;

        const types = card.types || [];
        const subtypes = card.subtypes || [];
        let typeString = '';
        if (types.length > 0) typeString += types.join(' ').toUpperCase();
        if (subtypes.length > 0) {
          if (typeString) typeString += ' — ';
          typeString += subtypes.join(' ').toUpperCase();
        }

        cardsToInsert.push({
          set_id: setId,
          name: card.name || "Unknown",
          card_number: edition.collector_number || "UNKNOWN",
          element: card.element || null,
          card_type: typeString || "Unknown",
          class: Array.isArray(card.classes) && card.classes.length > 0
            ? card.classes.join(", ")
            : null,
          rarity: typeof edition.rarity === 'number'
            ? mapRarityNumber(edition.rarity)
            : "UNKNOWN",
          cost: card.cost_reserve !== null && card.cost_reserve !== undefined
            ? card.cost_reserve
            : (card.cost_memory || 0),
          power: card.stats?.ATK !== undefined ? card.stats.ATK : null,
          life: card.stats?.HP !== undefined ? card.stats.HP : null,
          speed: card.speed !== null && card.speed !== undefined ? card.speed : null,
          effect_text: effect,
          flavor_text: edition.flavor || card.flavor || null,
          image_url: imageUrl,
          illustrator: edition.illustrator || null,
        });
      });
    });

    console.log(`  Prepared ${cardsToInsert.length} card printings`);
    updateProgress({ message: `Inserting ${cardsToInsert.length} cards into database...` });

    if (cardsToInsert.length > 0) {
      syncStage = "saving card printings to Supabase";
      // Deduplicate - use (set_id, card_number, rarity, image_url) to allow extended art variants
      // Extended art cards have same set/number/rarity but different images
      const uniqueCards = new Map<string, any>();
      cardsToInsert.forEach(card => {
        const key = `${card.set_id}_${card.card_number}_${card.rarity}_${card.image_url || 'no-image'}`;
        if (!uniqueCards.has(key)) {
          uniqueCards.set(key, card);
        }
      });

      const deduplicatedCards = Array.from(uniqueCards.values());

      const cardBatches = splitIntoBatches(deduplicatedCards, CARD_UPSERT_BATCH_SIZE);

      for (const [batchIndex, cardBatch] of cardBatches.entries()) {
        assertTimeRemaining();
        updateProgress({
          message: `Saving card batch ${batchIndex + 1} of ${cardBatches.length}...`,
        });

        const { error: cardsError } = await supabaseAdmin
          .from("cards")
          .upsert(cardBatch, { onConflict: "set_id,card_number,rarity,image_url" })
          .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));

        if (cardsError) {
          console.error(`Error inserting card batch ${batchIndex + 1}:`, cardsError);
          throw new Error(
            `Failed to save card batch ${batchIndex + 1} of ${cardBatches.length}: ${getErrorMessage(cardsError)}`
          );
        }

        insertedCount += cardBatch.length;
      }
    }

    console.log(`\n✅ SYNC COMPLETE:`);
    console.log(`   - Pages in this request: ${pagesFetchedThisRequest}`);
    console.log(`   - Cards synced: ${insertedCount}`);
    console.log(`   - Sets: ${shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size}`);

    // Fetch restricted cards separately (legality data not available with separate_editions=true)
    console.log(`\n[STEP 3] Fetching restricted cards...`);
    updateProgress({ message: "Updating restricted card status..." });

    syncStage = "updating restricted-card status";

    if (!hasMore) {
      try {
        const restrictedNames: string[] = [];
        let restrictedPage = 1;
        let hasMoreRestricted = true;

        // Fetch all pages of restricted cards
        while (hasMoreRestricted && restrictedPage <= 10) {
          assertTimeRemaining();
          const restrictedUrl = `${API_BASE_URL}/cards/search?legality_format=STANDARD&legality_state=RESTRICTED&page=${restrictedPage}&limit=100`;
          const restrictedResponse = await fetch(restrictedUrl, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });

          if (restrictedResponse.ok) {
            const restrictedData = await restrictedResponse.json();
            const restrictedCards = restrictedData.data || [];

            console.log(`  Page ${restrictedPage}: ${restrictedCards.length} restricted cards`);
            restrictedNames.push(...restrictedCards.map((card: any) => card.name));

            hasMoreRestricted = restrictedData.has_more || false;
            restrictedPage++;

          } else {
            console.warn(`  ⚠️ Failed to fetch restricted cards page ${restrictedPage}`);
            break;
          }
        }

        // Get unique card names
        const uniqueRestrictedNames = [...new Set(restrictedNames)];
        console.log(`  Total: ${restrictedNames.length} printings, ${uniqueRestrictedNames.length} unique restricted cards`);

        if (uniqueRestrictedNames.length > 0) {
          const restrictedBatches = splitIntoBatches(
            uniqueRestrictedNames,
            RESTRICTED_UPDATE_BATCH_SIZE
          );

          for (const [batchIndex, restrictedBatch] of restrictedBatches.entries()) {
            assertTimeRemaining();
            const { error: updateError } = await supabaseAdmin
              .from("cards")
              .update({ is_restricted: true })
              .in("name", restrictedBatch)
              .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));

            if (updateError) {
              throw new Error(
                `Failed to update restricted-card batch ${batchIndex + 1} of ${restrictedBatches.length}: ${getErrorMessage(updateError)}`
              );
            }
          }

          console.log(`  ✓ Updated ${uniqueRestrictedNames.length} card names as restricted`);
        }
      } catch (restrictedError) {
        console.warn("  ⚠️ Error fetching restricted cards (non-critical):", restrictedError);
      }
    }

    updateProgress({
      isRunning: false,
      message: `Sync complete! Processed ${insertedCount} cards from ${shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size} sets`
    });

    // Update sync history
    if (syncId) {
      await supabaseAdmin
        .from("sync_history")
        .update({
          completed_at: new Date().toISOString(),
          status: "completed",
          total_cards_processed: insertedCount,
          total_sets_processed: shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size,
          pages_fetched: pagesFetchedThisRequest,
        })
        .eq("id", syncId);
    }

    return res.status(200).json({
      success: true,
      totalCards: allCardsData.length,
      processedInBatch: insertedCount,
      newSets: shouldDoIncrementalSync ? newSetCodes.length : uniqueSets.size,
      setsProcessed: uniqueSets.size,
      pagesProcessed: pagesFetchedThisRequest,
      nextPage: hasMore ? page : null,
      incrementalSync: shouldDoIncrementalSync,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const elapsedSeconds = Math.round((Date.now() - syncStartedAt) / 1000);
    const diagnosticMessage =
      `${syncStage}: ${errorMessage} ` +
      `[after ${elapsedSeconds}s, ${pagesFetchedThisRequest} page(s) fetched, ${insertedCount} card(s) saved]`;

    // Log the raw error too — the stack is the only place the real throw site shows up.
    console.error("Sync error:", {
      stage: syncStage,
      elapsedSeconds,
      pagesFetchedThisRequest,
      insertedCount,
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    updateProgress({
      isRunning: false,
      error: diagnosticMessage,
      message: "Sync failed"
    });

    // Update sync history with error. Record the counters as well: leaving them at
    // the column default made past failures indistinguishable from "died on page 1".
    if (syncId) {
      try {
        const { error: historyError } = await supabaseAdmin
          .from("sync_history")
          .update({
            completed_at: new Date().toISOString(),
            status: "failed",
            error_message: diagnosticMessage.slice(0, 2000),
            pages_fetched: pagesFetchedThisRequest,
            total_cards_processed: insertedCount,
          })
          .eq("id", syncId)
          .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));

        if (historyError) {
          // If this write fails the row stays "running" and the next sync reaps it.
          console.error(
            "Failed to record sync failure in sync_history:",
            getErrorMessage(historyError)
          );
        }
      } catch (historyWriteError) {
        console.error(
          "Failed to record sync failure in sync_history:",
          getErrorMessage(historyWriteError)
        );
      }
    }

    return res.status(500).json({
      success: false,
      error: diagnosticMessage,
      stage: syncStage,
      pagesFetched: pagesFetchedThisRequest,
      cardsSaved: insertedCount,
      elapsedSeconds,
    });
  }
}
