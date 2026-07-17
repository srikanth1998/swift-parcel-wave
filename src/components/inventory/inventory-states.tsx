import { AlertCircle, PackageOpen, RefreshCw, SearchX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type InventoryErrorStateProps = {
  error: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
};

export function InventoryErrorState({
  error,
  onRetry,
  isRetrying = false,
}: InventoryErrorStateProps) {
  const message = error instanceof Error ? error.message : "Inventory could not be loaded.";

  return (
    <Alert variant="destructive" className="bg-destructive/5">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>We couldn’t load inventory</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className={isRetrying ? "animate-spin" : undefined} aria-hidden="true" />
          {isRetrying ? "Trying again…" : "Try again"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export type InventoryEmptyStateProps = {
  filtered: boolean;
  onClearFilters?: () => void;
};

export function InventoryEmptyState({ filtered, onClearFilters }: InventoryEmptyStateProps) {
  const Icon = filtered ? SearchX : PackageOpen;

  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="rounded-full bg-muted p-3 text-muted-foreground" aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 font-display text-lg font-semibold">
        {filtered ? "No matching products" : "No inventory yet"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Try another search or clear your filters to see all products."
          : "Products will appear here after they are added to the catalog."}
      </p>
      {filtered && onClearFilters ? (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
