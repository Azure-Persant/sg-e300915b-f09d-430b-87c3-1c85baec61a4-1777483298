import { Check, ChevronsUpDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label?: string;
  count?: number;
};

type Props = {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Shown in the search box. Subtypes has 146 options, sets 56. */
  searchPlaceholder?: string;
  className?: string;
};

/**
 * Dropdown checklist with a type-to-narrow box.
 *
 * Every filter uses the same control, including the short ones: Subtypes has 146
 * options and Sets 56, so a search box is required there, and using one control
 * everywhere keeps the bar consistent rather than mixing two interaction styles.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = "Search...",
  className,
}: Props) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            "justify-between bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white",
            className
          )}
        >
          <span className="truncate">
            {label}
            {selected.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
              >
                {selected.length}
              </Badge>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0 bg-slate-800 border-slate-700" align="start">
        <Command className="bg-slate-800">
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-white placeholder:text-slate-400"
          />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-4 text-center text-sm text-slate-400">
              No matches.
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => toggle(option.value)}
                    className="text-white aria-selected:bg-slate-700 cursor-pointer"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                        isSelected
                          ? "border-cyan-400 bg-cyan-500/30"
                          : "border-slate-600"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-cyan-300" />}
                    </div>
                    <span className="flex-1 truncate">{option.label ?? option.value}</span>
                    {option.count != null && (
                      <span className="ml-2 text-xs text-slate-400">{option.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>

          {selected.length > 0 && (
            <div className="border-t border-slate-700 p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
                className="w-full justify-center text-slate-300 hover:text-white hover:bg-slate-700"
              >
                <X className="mr-1 h-3 w-3" />
                Clear {label.toLowerCase()}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
