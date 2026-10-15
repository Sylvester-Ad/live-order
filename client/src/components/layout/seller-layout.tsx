import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useCurrentCreator, useLogout } from "../../features/auth/hooks/use-auth";
import { cx } from "../../lib/cx";
import { Button } from "../ui/button";
import { Notice } from "../feedback/feedback";
import { Brand } from "./brand";

const navigation = [
  { label: "Dashboard", to: "/", end: true },
  { label: "Lives", to: "/lives", end: false },
];

export function SellerLayout() {
  const [logoutError, setLogoutError] = useState(false);
  const creator = useCurrentCreator();
  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    setLogoutError(false);

    try {
      await logout.mutateAsync();
      await navigate("/login", { replace: true });
    } catch {
      setLogoutError(true);
    }
  }

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="px-6 py-7">
          <Brand />
        </div>
        <nav aria-label="Seller navigation" className="grid gap-1 px-3">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cx(
                  "rounded-control px-4 py-3 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-800"
                    : "text-ink-muted hover:bg-canvas hover:text-ink",
                )
              }
              end={item.end}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-border p-4">
          <div className="mb-3 flex items-center gap-3 rounded-control bg-canvas p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
              {creator.data?.name.slice(0, 1).toUpperCase() ?? "S"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{creator.data?.name ?? "Seller"}</p>
              <p className="text-xs text-ink-muted">Seller workspace</p>
            </div>
          </div>
          <Button
            className="w-full justify-start"
            disabled={logout.isPending}
            onClick={handleLogout}
            size="sm"
            variant="ghost"
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-border bg-surface px-4 py-3 sm:px-7 lg:px-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="lg:hidden">
              <Brand />
            </div>
            <nav aria-label="Seller navigation" className="hidden items-center gap-1 sm:flex lg:hidden">
              {navigation.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    cx(
                      "rounded-control px-3 py-2 text-sm font-semibold",
                      isActive ? "bg-brand-50 text-brand-800" : "text-ink-muted hover:text-ink",
                    )
                  }
                  end={item.end}
                  key={item.to}
                  to={item.to}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-sm font-medium text-ink-muted sm:block">
                {creator.data?.name}
              </span>
              <Button
                disabled={logout.isPending}
                onClick={handleLogout}
                size="sm"
                variant="ghost"
              >
                {logout.isPending ? "Signing out…" : "Sign out"}
              </Button>
            </div>
          </div>
          <nav aria-label="Seller navigation" className="mx-auto mt-3 flex max-w-6xl gap-2 sm:hidden">
            {navigation.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  cx(
                    "flex-1 rounded-control px-3 py-2 text-center text-sm font-semibold",
                    isActive ? "bg-brand-50 text-brand-800" : "text-ink-muted",
                  )
                }
                end={item.end}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto min-h-[calc(100vh-73px)] max-w-6xl px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          {logoutError && (
            <div className="mb-6">
              <Notice title="We couldn't sign you out. Try again." />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
