const storagePrefix = "liveorder:public-order-idempotency:";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(liveSlug: string) {
  return `${storagePrefix}${liveSlug}`;
}

/** Keeps only an opaque retry key in tab-scoped storage; customer fields stay in memory. */
export function getPublicOrderIdempotencyKey(liveSlug: string): string {
  const key = storageKey(liveSlug);

  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing && uuidPattern.test(existing)) return existing;
  } catch {
    // Storage can be disabled; the current page can still retry with its in-memory key.
  }

  const generated = window.crypto.randomUUID();
  try {
    window.sessionStorage.setItem(key, generated);
  } catch {
    // Do not block order submission when tab storage is unavailable.
  }
  return generated;
}

export function clearPublicOrderIdempotencyKey(liveSlug: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(liveSlug));
  } catch {
    // The in-memory caller also clears its key after a confirmed response.
  }
}
