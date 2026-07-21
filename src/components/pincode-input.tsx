import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { searchServiceablePincodes } from "@/lib/distributors.functions";

// PIN-code field with a live "which of these are we actually deliverable to"
// dropdown. Suggestions are advisory, not a hard gate — the field still
// accepts any 6-digit value, and the server (placeOrder /
// resolveDistributorForPincode) remains the real authority on whether an
// order can go through for it.
export function PincodeInput({
  id,
  value,
  onChange,
  required,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(value), 200);
    return () => clearTimeout(timer);
  }, [value]);

  const enabled = query.length >= 2;
  const {
    data: suggestions = [],
    isFetching,
    // isPaused: a retry is queued but withheld because networkMode:'online'
    // (the query-client default) thinks we're offline. Without this, a
    // failed lookup would sit in that limbo forever (status never reaches
    // 'error') and this component would misreport it as "not deliverable".
    isError,
    isPaused,
  } = useQuery({
    queryKey: ["serviceable-pincodes", query],
    queryFn: () => searchServiceablePincodes({ data: { query } }),
    enabled,
  });
  const inconclusive = isError || isPaused;

  const showPopover = open && enabled;

  return (
    <Popover open={showPopover} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          required={required}
          inputMode="numeric"
          autoComplete="postal-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="6-digit PIN"
          role="combobox"
          aria-expanded={showPopover}
          aria-autocomplete="list"
          value={value}
          onChange={(e) => {
            onChange(e.target.value.replace(/\D/g, "").slice(0, 6));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ul
          role="listbox"
          aria-label="Deliverable PIN codes"
          className="max-h-48 overflow-auto text-sm"
        >
          {isFetching && suggestions.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">Searching…</li>
          ) : inconclusive ? (
            <li className="px-2 py-1.5 text-muted-foreground">
              Couldn't check delivery coverage right now.
            </li>
          ) : suggestions.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">
              We don't deliver to that PIN code yet.
            </li>
          ) : (
            suggestions.map((pincode) => (
              <li key={pincode} role="option" aria-selected={pincode === value}>
                <button
                  type="button"
                  className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  // Fires before the input's onBlur, so the value is applied
                  // instead of the dropdown just closing on blur first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(pincode);
                    setOpen(false);
                  }}
                >
                  {pincode}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
