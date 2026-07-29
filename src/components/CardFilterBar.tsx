import { Search, SlidersHorizontal, X } from "lucide-react";

import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  EMPTY_FILTERS,
  countActiveFilters,
  type CardFilters,
  type FilterOptions,
  type Set as SetRow,
} from "@/services/cardService";

type Props = {
  filters: CardFilters;
  onChange: (filters: CardFilters) => void;
  options: FilterOptions;
  sets: SetRow[];
};

/** Blank means "no bound" rather than 0, so clearing a field widens the range. */
const parseBound = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

const boundValue = (value: number | null | undefined): string =>
  value == null ? "" : String(value);

function CostRange({
  legend,
  hint,
  min,
  max,
  onMin,
  onMax,
}: {
  legend: string;
  hint: string;
  min: number | null | undefined;
  max: number | null | undefined;
  onMin: (value: number | null) => void;
  onMax: (value: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-300">
        {legend} <span className="text-slate-500">{hint}</span>
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          placeholder="min"
          value={boundValue(min)}
          onChange={(e) => onMin(parseBound(e.target.value))}
          className="h-8 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
        />
        <span className="text-slate-500">–</span>
        <Input
          type="number"
          inputMode="numeric"
          placeholder="max"
          value={boundValue(max)}
          onChange={(e) => onMax(parseBound(e.target.value))}
          className="h-8 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
        />
      </div>
    </div>
  );
}

export function CardFilterBar({ filters, onChange, options, sets }: Props) {
  const set = <K extends keyof CardFilters>(key: K, value: CardFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const activeCount = countActiveFilters(filters);

  const setOptions = sets.map((s) => ({
    value: s.code,
    label: `${s.code} — ${s.name}`,
  }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
          <Input
            placeholder="Search card names..."
            value={filters.search ?? ""}
            onChange={(e) => set("search", e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
          <Input
            placeholder="Search effect text..."
            value={filters.effectSearch ?? ""}
            onChange={(e) => set("effectSearch", e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Element"
          searchPlaceholder="Search elements..."
          options={options.elements.map((o) => ({ value: o.value, count: o.count }))}
          selected={filters.elements ?? []}
          onChange={(v) => set("elements", v)}
        />
        <MultiSelectFilter
          label="Set"
          searchPlaceholder="Search sets..."
          options={setOptions}
          selected={filters.setCodes ?? []}
          onChange={(v) => set("setCodes", v)}
        />
        <MultiSelectFilter
          label="Type"
          searchPlaceholder="Search types..."
          options={options.types.map((o) => ({ value: o.value, count: o.count }))}
          selected={filters.types ?? []}
          onChange={(v) => set("types", v)}
        />
        <MultiSelectFilter
          label="Subtype"
          searchPlaceholder="Search 138 subtypes..."
          options={options.subtypes.map((o) => ({ value: o.value, count: o.count }))}
          selected={filters.subtypes ?? []}
          onChange={(v) => set("subtypes", v)}
        />
        <MultiSelectFilter
          label="Class"
          searchPlaceholder="Search classes..."
          options={options.classes.map((o) => ({ value: o.value, count: o.count }))}
          selected={filters.classes ?? []}
          onChange={(v) => set("classes", v)}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Cost
              {(filters.costMemoryMin != null ||
                filters.costMemoryMax != null ||
                filters.costReserveMin != null ||
                filters.costReserveMax != null) && (
                <Badge
                  variant="secondary"
                  className="ml-2 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
                >
                  on
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 bg-slate-800 border-slate-700 space-y-3" align="start">
            {/* No card carries both costs, so setting both ranges at once
                matches nothing — worth knowing before it looks like a bug. */}
            <p className="text-xs text-slate-400">
              Cards have either a memory cost or a reserve cost, never both.
              Leave a field blank for no limit; −1 means an X cost.
            </p>
            <CostRange
              legend="Memory cost"
              hint="(−1 to 12)"
              min={filters.costMemoryMin}
              max={filters.costMemoryMax}
              onMin={(v) => set("costMemoryMin", v)}
              onMax={(v) => set("costMemoryMax", v)}
            />
            <CostRange
              legend="Reserve cost"
              hint="(−1 to 16)"
              min={filters.costReserveMin}
              max={filters.costReserveMax}
              onMin={(v) => set("costReserveMin", v)}
              onMax={(v) => set("costReserveMax", v)}
            />
          </PopoverContent>
        </Popover>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            onClick={() => onChange({ ...EMPTY_FILTERS, search: filters.search })}
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <X className="mr-1 h-4 w-4" />
            Clear filters ({activeCount})
          </Button>
        )}
      </div>
    </div>
  );
}
