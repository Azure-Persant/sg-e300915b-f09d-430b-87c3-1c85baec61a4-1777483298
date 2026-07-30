import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Loader2, Package, Search } from "lucide-react";

import { SEO } from "@/components/SEO";
import { Navigation } from "@/components/Navigation";
import { CardImage } from "@/components/CardImage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  collectionShareService,
  type SharedCollectionMeta,
  type SharedHolding,
} from "@/services/collectionService";

/**
 * A shared collection, read by token.
 *
 * Deliberately does not distinguish "no such token" from "expired", "revoked" or
 * "not yours" — the database returns nothing for all four, so a visitor cannot
 * probe for which tokens exist.
 */
export default function SharedCollectionPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  const [meta, setMeta] = useState<SharedCollectionMeta | null>(null);
  const [holdings, setHoldings] = useState<SharedHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openCard, setOpenCard] = useState<SharedHolding | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const result = await collectionShareService.read(token);
        if (!active) return;
        setMeta(result?.meta ?? null);
        setHoldings(result?.holdings ?? []);
      } catch {
        if (active) setMeta(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const visible = search.trim()
    ? holdings.filter((h) => h.card_name.toLowerCase().includes(search.trim().toLowerCase()))
    : holdings;

  const totals = holdings.reduce(
    (acc, h) => ({
      personal: acc.personal + h.personal_quantity,
      sale: acc.sale + h.sale_quantity,
      loaned: acc.loaned + h.loaned_quantity,
    }),
    { personal: 0, sale: 0, loaned: 0 }
  );

  return (
    <>
      <SEO
        title={meta ? `${meta.owner_name}'s collection` : "Shared collection"}
        description="A shared Grand Archive collection"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />

        <main className="container mx-auto px-4 py-8">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : !meta ? (
            <div className="mx-auto max-w-md text-center py-20">
              <Package className="mx-auto h-10 w-10 text-slate-500" />
              <h1 className="mt-4 text-2xl font-bold text-white">This link isn&apos;t available</h1>
              <p className="mt-2 text-slate-400">
                It may have expired, been revoked, or be limited to a specific
                account. If it was shared with your email address, sign in with
                that address and try again.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-white">
                  {meta.owner_name}&apos;s collection
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {meta.label && <span className="text-slate-300">{meta.label}</span>}
                  {meta.include_personal && (
                    <span className="text-slate-300">{totals.personal} personal</span>
                  )}
                  {meta.include_sale && (
                    <span className="text-amber-400">{totals.sale} for sale</span>
                  )}
                  {meta.include_loaned && (
                    <span className="text-violet-400">{totals.loaned} lent out</span>
                  )}
                  {meta.expires_at && (
                    <span className="text-slate-500">
                      link expires {new Date(meta.expires_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative mb-6 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  placeholder="Search this collection..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
                />
              </div>

              {visible.length === 0 ? (
                <p className="py-12 text-center text-slate-400">
                  {holdings.length === 0
                    ? "Nothing shared here yet."
                    : `No cards match "${search}".`}
                </p>
              ) : (
                <div className="space-y-2">
                  {visible.map((h) => (
                    <Card
                      key={h.card_id}
                      onClick={() => setOpenCard(h)}
                      className="cursor-pointer bg-slate-800/50 border-slate-700 transition-colors hover:border-cyan-500/60"
                    >
                      <CardContent className="flex flex-wrap items-center gap-3 p-3">
                        {h.image_url && (
                          <CardImage
                            src={h.image_url}
                            alt={h.card_name}
                            variant="thumb"
                            className="h-16 w-auto rounded"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{h.card_name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <Badge
                              variant="outline"
                              className="border-cyan-500 font-mono text-cyan-400"
                            >
                              {h.set_code ?? "???"}
                            </Badge>
                            <span className="text-slate-400">{h.rarity}</span>
                            {h.set_name && <span className="text-slate-500">{h.set_name}</span>}
                          </div>
                        </div>

                        <div className="ml-auto flex flex-wrap items-center gap-4 text-sm">
                          {/* Counts only. Where the cards are, and who is
                              holding a loan, stay with the owner. */}
                          {h.personal_quantity > 0 && (
                            <span className="text-white">{h.personal_quantity}x</span>
                          )}
                          {h.sale_quantity > 0 && (
                            <span className="text-amber-400">{h.sale_quantity}x for sale</span>
                          )}
                          {h.loaned_quantity > 0 && (
                            <span className="text-violet-400">{h.loaned_quantity}x lent out</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        <Dialog open={!!openCard} onOpenChange={(open) => !open && setOpenCard(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            {openCard && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl text-white">{openCard.card_name}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    {openCard.image_url && (
                      <CardImage
                        src={openCard.image_url}
                        alt={openCard.card_name}
                        variant="detail"
                        priority
                        className="w-full max-w-[380px] h-auto rounded-lg shadow-2xl"
                      />
                    )}
                  </div>

                  <div className="space-y-4 text-white">
                    <Detail label="Set">
                      {openCard.set_name ?? "Unknown"}
                      {openCard.set_code ? ` (${openCard.set_code})` : ""}
                    </Detail>
                    <Detail label="Rarity">{openCard.rarity}</Detail>
                    {openCard.card_type && <Detail label="Type">{openCard.card_type}</Detail>}
                    {openCard.element && <Detail label="Element">{openCard.element}</Detail>}
                    {openCard.cost !== null && <Detail label="Cost">{openCard.cost}</Detail>}
                    {openCard.effect_text && (
                      <Detail label="Effect">
                        <span className="text-base leading-relaxed">{openCard.effect_text}</span>
                      </Detail>
                    )}

                    <div className="grid grid-cols-3 gap-4">
                      {openCard.power !== null && <Detail label="Power">{openCard.power}</Detail>}
                      {openCard.life !== null && <Detail label="Life">{openCard.life}</Detail>}
                      {openCard.speed && <Detail label="Speed">{openCard.speed}</Detail>}
                    </div>

                    <div className="border-t border-slate-700 pt-3 space-y-1 text-sm">
                      {openCard.personal_quantity > 0 && (
                        <p className="text-white">{openCard.personal_quantity} in collection</p>
                      )}
                      {openCard.sale_quantity > 0 && (
                        <p className="text-amber-400">{openCard.sale_quantity} for sale</p>
                      )}
                      {openCard.loaned_quantity > 0 && (
                        <p className="text-violet-400">{openCard.loaned_quantity} lent out</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

/** Small labelled row, matching how the card browser presents details. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{label}</h3>
      <p className="text-lg">{children}</p>
    </div>
  );
}
