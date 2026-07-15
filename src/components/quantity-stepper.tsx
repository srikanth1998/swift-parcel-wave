import { Minus, Plus } from "lucide-react";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-8" : "h-10";
  const btn = size === "sm" ? "w-8" : "w-10";
  return (
    <div
      className={`inline-flex ${dim} items-center overflow-hidden rounded-full border border-primary/30 bg-primary/5`}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btn} flex h-full items-center justify-center text-primary transition-transform duration-150 ease-out hover:bg-primary/10 active:scale-90 disabled:opacity-40`}
        disabled={value <= min}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span
        key={value}
        className={`${size === "sm" ? "w-7 text-xs" : "w-9 text-sm"} animate-badge-bump text-center font-semibold text-primary tabular-nums`}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${btn} flex h-full items-center justify-center text-primary transition-transform duration-150 ease-out hover:bg-primary/10 active:scale-90 disabled:opacity-40`}
        disabled={value >= max}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
