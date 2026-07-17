import { ArrowRight, Loader2, PackagePlus, TriangleAlert } from "lucide-react";
import { forwardRef, useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AdjustmentFormValue,
  AdjustmentMode,
  AdjustmentReason,
  AdjustmentSubmission,
  InventoryProduct,
} from "./types";

const REASON_LABELS: Record<AdjustmentReason, string> = {
  restock: "Restock",
  correction: "Inventory correction",
  damage: "Damage or loss",
  return: "Customer return",
};

type ValidationError = {
  field: "product" | "amount";
  message: string;
};

export type StockAdjustmentFormProps = {
  products: InventoryProduct[];
  value: AdjustmentFormValue;
  onChange: (value: AdjustmentFormValue) => void;
  onSubmit: (value: AdjustmentSubmission) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  submissionError?: string | null;
};

export const StockAdjustmentForm = forwardRef<HTMLElement, StockAdjustmentFormProps>(
  function StockAdjustmentForm(
    {
      products,
      value,
      onChange,
      onSubmit,
      isSubmitting = false,
      disabled = false,
      submissionError,
    },
    ref,
  ) {
    const id = useId();
    const [validationError, setValidationError] = useState<ValidationError | null>(null);
    const selectedProduct = products.find((product) => product.id === value.productId);
    const parsedAmount = value.amount.trim() === "" ? Number.NaN : Number(value.amount);
    const canPreview =
      selectedProduct &&
      Number.isInteger(parsedAmount) &&
      (value.mode === "delta" || parsedAmount >= 0);
    const nextQuantity = canPreview
      ? value.mode === "set"
        ? Math.max(parsedAmount, 0)
        : Math.max(selectedProduct.stockQty + parsedAmount, 0)
      : null;

    function update<Key extends keyof AdjustmentFormValue>(
      key: Key,
      nextValue: AdjustmentFormValue[Key],
    ) {
      onChange({ ...value, [key]: nextValue });
      if (
        validationError &&
        ((key === "productId" && validationError.field === "product") ||
          (key === "amount" && validationError.field === "amount"))
      ) {
        setValidationError(null);
      }
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!value.productId) {
        setValidationError({ field: "product", message: "Choose a product to adjust." });
        return;
      }
      if (!Number.isInteger(parsedAmount)) {
        setValidationError({ field: "amount", message: "Enter a whole-number quantity." });
        return;
      }
      if (Math.abs(parsedAmount) > 1_000_000) {
        setValidationError({ field: "amount", message: "Quantity must be 1,000,000 or less." });
        return;
      }
      if (value.mode === "set" && parsedAmount < 0) {
        setValidationError({ field: "amount", message: "Exact quantity cannot be negative." });
        return;
      }
      if (value.mode === "delta" && parsedAmount === 0) {
        setValidationError({ field: "amount", message: "Enter a positive or negative change." });
        return;
      }

      setValidationError(null);
      onSubmit({ ...value, amount: parsedAmount });
    }

    const productError = validationError?.field === "product" ? validationError.message : null;
    const amountError = validationError?.field === "amount" ? validationError.message : null;

    return (
      <section
        ref={ref}
        tabIndex={-1}
        className="scroll-mt-32 rounded-lg border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-labelledby={`${id}-heading`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 id={`${id}-heading`} className="font-display text-lg font-semibold">
              Adjust stock
            </h2>
            <p className="text-xs text-muted-foreground">
              Every change is recorded in the audit log.
            </p>
          </div>
          <span className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">
            <PackagePlus className="h-4 w-4" />
          </span>
        </div>

        <form className="space-y-4 p-4" onSubmit={handleSubmit} aria-busy={isSubmitting} noValidate>
          <Field
            label="Product"
            htmlFor={`${id}-product`}
            error={productError}
            errorId={`${id}-product-error`}
          >
            <Select
              value={value.productId}
              onValueChange={(productId) => update("productId", productId)}
              disabled={disabled || isSubmitting || products.length === 0}
            >
              <SelectTrigger
                id={`${id}-product`}
                aria-invalid={Boolean(productError)}
                aria-describedby={productError ? `${id}-product-error` : undefined}
              >
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} · {product.stockQty.toLocaleString()} on hand
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Adjustment type" htmlFor={`${id}-mode`}>
              <Select
                value={value.mode}
                onValueChange={(mode) => update("mode", mode as AdjustmentMode)}
                disabled={disabled || isSubmitting}
              >
                <SelectTrigger id={`${id}-mode`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delta">Add or remove</SelectItem>
                  <SelectItem value="set">Set exact quantity</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={value.mode === "set" ? "New quantity" : "Quantity change"}
              htmlFor={`${id}-amount`}
              hint={value.mode === "delta" ? "Use a minus sign to remove stock." : undefined}
              hintId={`${id}-amount-hint`}
              error={amountError}
              errorId={`${id}-amount-error`}
            >
              <Input
                id={`${id}-amount`}
                type="number"
                inputMode="numeric"
                step={1}
                min={value.mode === "set" ? 0 : -1_000_000}
                max={1_000_000}
                value={value.amount}
                onChange={(event) => update("amount", event.target.value)}
                placeholder={value.mode === "set" ? "0" : "+10 or -2"}
                disabled={disabled || isSubmitting}
                aria-invalid={Boolean(amountError)}
                aria-describedby={
                  amountError
                    ? `${id}-amount-error`
                    : value.mode === "delta"
                      ? `${id}-amount-hint`
                      : undefined
                }
              />
            </Field>
          </div>

          {selectedProduct ? (
            <div
              className="rounded-md border border-border bg-muted/40 px-3 py-2.5"
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{selectedProduct.name}</span>
                <span className="flex shrink-0 items-center gap-2 font-mono font-semibold tabular-nums">
                  {selectedProduct.stockQty.toLocaleString()}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {nextQuantity === null ? "—" : nextQuantity.toLocaleString()}
                </span>
              </div>
              {canPreview &&
              value.mode === "delta" &&
              selectedProduct.stockQty + parsedAmount < 0 ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Stock is capped at zero; it cannot become negative.
                </p>
              ) : null}
            </div>
          ) : null}

          <Field label="Reason" htmlFor={`${id}-reason`}>
            <Select
              value={value.reason}
              onValueChange={(reason) => update("reason", reason as AdjustmentReason)}
              disabled={disabled || isSubmitting}
            >
              <SelectTrigger id={`${id}-reason`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REASON_LABELS) as AdjustmentReason[]).map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {REASON_LABELS[reason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Note"
            htmlFor={`${id}-note`}
            hint="Optional context for the audit log."
            hintId={`${id}-note-hint`}
          >
            <Textarea
              id={`${id}-note`}
              value={value.note}
              onChange={(event) => update("note", event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="For example: Received purchase order #1234"
              disabled={disabled || isSubmitting}
              aria-describedby={`${id}-note-hint ${id}-note-count`}
            />
            <div
              id={`${id}-note-count`}
              className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground"
            >
              {value.note.length}/300
            </div>
          </Field>

          {submissionError ? (
            <p
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {submissionError}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={disabled || isSubmitting || products.length === 0}
          >
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {isSubmitting ? "Saving adjustment…" : "Apply adjustment"}
          </Button>
        </form>
      </section>
    );
  },
);

function Field({
  label,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  hintId?: string;
  error?: string | null;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className={cn("mt-1.5", hint && "mt-2")}>{children}</div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
