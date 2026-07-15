import * as React from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";

type RevealProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Stagger index — each step adds ~60ms of delay. Cap the visible stagger at ~8 items. */
  index?: number;
  as?: "div" | "li";
};

/**
 * Scroll-triggered fade + rise, once per element. Delay is capped so long lists
 * don't leave the last row waiting a full second to appear.
 */
export const Reveal = React.forwardRef<HTMLDivElement, RevealProps>(
  ({ className, style, index = 0, as = "div", ...props }, forwardedRef) => {
    const { ref, inView } = useInView<HTMLDivElement>();
    const delayMs = Math.min(index, 7) * 60;
    const Comp = as as "div";

    return (
      <Comp
        ref={(node: HTMLDivElement | null) => {
          ref.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        style={{ animationDelay: inView ? `${delayMs}ms` : undefined, ...style }}
        className={cn(
          inView
            ? "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out"
            : "opacity-0",
          className,
        )}
        {...props}
      />
    );
  },
);
Reveal.displayName = "Reveal";
