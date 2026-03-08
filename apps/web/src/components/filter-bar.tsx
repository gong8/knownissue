"use client";

import { useState, useRef, forwardRef } from "react";
import { Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Severity, BugStatus } from "@knownissue/shared";

export type SortOption = "latest" | "oldest" | "severity" | "patches";

export interface FilterState {
  search: string;
  severities: Set<Severity>;
  statuses: Set<BugStatus>;
  ecosystems: Set<string>;
  sort: SortOption;
}

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

const ALL_SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const ALL_STATUSES: BugStatus[] = ["open", "confirmed", "patched", "closed"];
const ALL_ECOSYSTEMS = ["node", "python", "go", "rust", "other"];
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "latest", label: "latest" },
  { value: "oldest", label: "oldest" },
  { value: "severity", label: "severity" },
  { value: "patches", label: "most patches" },
];

export const FilterBar = forwardRef<HTMLInputElement, FilterBarProps>(
  function FilterBar({ filters, onFiltersChange }, ref) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const activeFilterCount =
    filters.severities.size + filters.statuses.size + filters.ecosystems.size;

  const chips: { label: string; onRemove: () => void }[] = [];
  filters.severities.forEach((s) =>
    chips.push({
      label: `severity:${s}`,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          severities: toggleInSet(filters.severities, s),
        }),
    })
  );
  filters.statuses.forEach((s) =>
    chips.push({
      label: `status:${s}`,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          statuses: toggleInSet(filters.statuses, s),
        }),
    })
  );
  filters.ecosystems.forEach((e) =>
    chips.push({
      label: `ecosystem:${e}`,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          ecosystems: toggleInSet(filters.ecosystems, e),
        }),
    })
  );

  return (
    <div className="space-y-2">
      {/* Main bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={ref}
            placeholder="search..."
            className="pl-9 font-mono text-sm"
            value={filters.search}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value })
            }
          />
        </div>

        {/* Filter button */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 font-mono">
              <SlidersHorizontal size={14} />
              filter
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div className="space-y-3">
              {/* Severity */}
              <div>
                <p className="mb-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  severity
                </p>
                <div className="space-y-1">
                  {ALL_SEVERITIES.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={filters.severities.has(s)}
                        onCheckedChange={() =>
                          onFiltersChange({
                            ...filters,
                            severities: toggleInSet(filters.severities, s),
                          })
                        }
                      />
                      <span className="font-mono">{s}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="mb-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  status
                </p>
                <div className="space-y-1">
                  {ALL_STATUSES.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={filters.statuses.has(s)}
                        onCheckedChange={() =>
                          onFiltersChange({
                            ...filters,
                            statuses: toggleInSet(filters.statuses, s),
                          })
                        }
                      />
                      <span className="font-mono">{s}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Ecosystem */}
              <div>
                <p className="mb-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  ecosystem
                </p>
                <div className="space-y-1">
                  {ALL_ECOSYSTEMS.map((e) => (
                    <label
                      key={e}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={filters.ecosystems.has(e)}
                        onCheckedChange={() =>
                          onFiltersChange({
                            ...filters,
                            ecosystems: toggleInSet(filters.ecosystems, e),
                          })
                        }
                      />
                      <span className="font-mono">{e}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort button */}
        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 font-mono">
              <ArrowUpDown size={14} />
              sort: {filters.sort}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1" align="end">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onFiltersChange({ ...filters, sort: opt.value });
                  setSortOpen(false);
                }}
                className={cn(
                  "w-full rounded-sm px-2 py-1.5 text-left text-sm font-mono transition-colors hover:bg-surface-hover",
                  filters.sort === opt.value && "text-primary"
                )}
              >
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.label}
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              {chip.label}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
