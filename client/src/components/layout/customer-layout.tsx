import { Outlet } from "react-router-dom";

import { Brand } from "./brand";

export function CustomerLayout() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Brand link={false} />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Customer storefront
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface px-4 py-5 text-center text-sm text-ink-muted">
        Orders are managed by the seller. Payment is confirmed directly with them.
      </footer>
    </div>
  );
}
