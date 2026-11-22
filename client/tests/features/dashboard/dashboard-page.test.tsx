import { render, screen, within } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";
import type { Store } from "../../../src/features/lives/api/lives-api";

const creator = { id: "creator-1", name: "Ama" };
function store(id: string, status: Store["status"]): Store {
  return { id, name: `Store ${id}`, slug: id, status, tiktokLiveUrl: null, createdAt: "2026-10-12T10:00:00.000Z", updatedAt: null };
}
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function renderDashboard() { return render(<AppProviders><RouterProvider router={createTestRouter(["/dashboard"])} /></AppProviders>); }
function authenticatedFetch(stores: Store[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/creator/me")) return response({ data: creator });
    if (String(input).endsWith("/v1/stores")) return response({ data: stores });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("seller dashboard", () => {
  it("summarizes Store publication states and links to each Store workspace", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([store("published", "PUBLISHED"), store("draft", "DRAFT"), store("offline", "UNPUBLISHED")]));
    renderDashboard();
    const summary = await screen.findByRole("region", { name: "Store summary" });
    expect(within(summary).getByText("Total Stores").nextElementSibling).toHaveTextContent("3");
    expect(within(summary).getByText("Published").nextElementSibling).toHaveTextContent("1");
    expect(within(summary).getByText("Drafts").nextElementSibling).toHaveTextContent("1");
    expect(within(summary).getByText("Unpublished").nextElementSibling).toHaveTextContent("1");
    expect(await screen.findByRole("link", { name: "Open Store published workspace" })).toHaveAttribute("href", "/stores/published");
    expect(screen.getByRole("link", { name: "Create a Store" })).toHaveAttribute("href", "/stores/new");
  });

  it("offers Store creation when the seller has no Stores", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([]));
    renderDashboard();
    expect(await screen.findByRole("heading", { name: "Start with your first Store" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first Store" })).toHaveAttribute("href", "/stores/new");
  });

  it("shows a loading state without presenting zero counts while Stores load", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      return new Promise<Response>(() => undefined);
    }));
    renderDashboard();
    expect(await screen.findByText("Loading your Stores…")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Store summary" })).not.toBeInTheDocument();
  });

  it("shows a retry state without misleading zero counts after a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("/creator/me")
      ? response({ data: creator })
      : response({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } }, 404)));
    renderDashboard();
    expect(await screen.findByText("We couldn't load your Stores.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
