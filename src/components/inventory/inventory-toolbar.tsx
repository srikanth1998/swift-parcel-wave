import { Search, SlidersHorizontal, X } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InventoryFilters, InventoryFilterStatus, InventorySort } from "./types";

const ALL_CATEGORIES = "__all_categories__";

export type InventoryToolbarProps = {
  value: InventoryFilters;
  onChange: (value: InventoryFilters) => void;
  onClear: () => void;
  categories: string[];
  resultCount: number;
  totalCount: number;
  disabled?: boolean;
};

export function InventoryToolbar({
  value,
  onChange,
  onClear,
  categories,
  resultCount,
  totalCount,
  disabled = false,
}: InventoryToolbarProps) {
  const id = useId();
  const activeFilterCount =
    Number(value.query.trim().length > 0) +
    Number(value.status !== "all") +
    Number(value.category !== null);
  const hasCustomView = activeFilterCount > 0 || value.sort !== "stock-asc";

  function update<Key extends keyof InventoryFilters>(key: Key, nextValue: InventoryFilters[Key]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_10rem_12rem_10rem_auto] lg:items-end">
        <div>
          <Label htmlFor={`${id}-search`} className="sr-only">
            Search inventory
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="search"
              value={value.query}
              onChange={(event) => update("query", event.target.value)}
              placeholder="Search name, SKU, or category"
              className="pl-9 pr-9"
              autoComplete="off"
              disabled={disabled}
            />
            {value.query ? (
              <button
                type="button"
                onClick={() => update("query", "")}
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <Label htmlFor={`${id}-status`} className="sr-only">
            Filter by stock status
          </Label>
          <Select
            value={value.status}
            onValueChange={(status) => update("status", status as InventoryFilterStatus)}
            disabled={disabled}
          >
            <SelectTrigger id={`${id}-status`} aria-label="Filter by stock status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="ok">In stock</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${id}-category`} className="sr-only">
            Filter by category
          </Label>
          <Select
            value={value.category ?? ALL_CATEGORIES}
            onValueChange={(category) =>
              update("category", category === ALL_CATEGORIES ? null : category)
            }
            disabled={disabled || categories.length === 0}
          >
            <SelectTrigger id={`${id}-category`} aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${id}-sort`} className="sr-only">
            Sort inventory
          </Label>
          <Select
            value={value.sort}
            onValueChange={(sort) => update("sort", sort as InventorySort)}
            disabled={disabled}
          >
            <SelectTrigger id={`${id}-sort`} aria-label="Sort inventory">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stock-asc">Stock: low first</SelectItem>
              <SelectItem value="stock-desc">Stock: high first</SelectItem>
              <SelectItem value="name-asc">Name: A–Z</SelectItem>
              <SelectItem value="name-desc">Name: Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={onClear}
          disabled={disabled || !hasCustomView}
          className="justify-self-start lg:justify-self-auto"
        >
          <SlidersHorizontal aria-hidden="true" />
          Reset
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground" role="status" aria-live="polite">
        Showing {resultCount.toLocaleString()} of {totalCount.toLocaleString()} products
      </p>
    </div>
  );
}
