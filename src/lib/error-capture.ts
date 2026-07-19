// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.
//
// The capture is request-scoped via AsyncLocalStorage. It used to be a single
// module-level slot, which in a concurrent server meant one request's 500 could
// be logged with a different request's error — and two simultaneous failures
// raced, so one got the right stack and the other got a generic fallback.

import { AsyncLocalStorage } from "node:async_hooks";

type Slot = { error?: unknown };

const storage = new AsyncLocalStorage<Slot>();

// Fallback for errors raised outside any request scope (module init, and
// runtimes where the global handlers fire detached from the request context).
let ambientError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  const slot = storage.getStore();
  if (slot) {
    slot.error = error;
    return;
  }
  ambientError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

/** Runs `fn` with its own capture slot, so concurrent requests cannot mix. */
export function withErrorCapture<T>(fn: () => T): T {
  return storage.run({}, fn);
}

export function consumeLastCapturedError(): unknown {
  const slot = storage.getStore();
  if (slot?.error !== undefined) {
    const { error } = slot;
    slot.error = undefined;
    return error;
  }

  if (!ambientError) return undefined;
  if (Date.now() - ambientError.at > TTL_MS) {
    ambientError = undefined;
    return undefined;
  }
  const { error } = ambientError;
  ambientError = undefined;
  return error;
}
