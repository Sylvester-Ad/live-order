import { render, screen, within } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";
import type { Live } from "../../../src/features/lives/api/lives-api";

const creator = { id: "creator-1", name: "Ama" };

function live(id: string, name: string, status: Live["status"], createdAt: string | null): Live {
  return {
    id,
    name,
    slug: id,
    status,
    tiktokLiveUrl: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDashboard() {
  return render(
    <AppProviders>
      <RouterProvider router={createTestRouter(["/"])} />
    </AppProviders>,
  );
}

function authenticatedFetch(lives: Live[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/creator/me")) return response({ data: creator });
    if (String(input).endsWith("/v1/lives")) return response({ data: lives });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("seller dashboard", () => {
  it("shows accurate counts for all supported Live statuses", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([
      live("active-1", "Summer launch", "ACTIVE", "2026-10-12T10:00:00.000Z"),
      live("draft-1", "Autumn preview", "DRAFT", "2026-10-11T10:00:00.000Z"),
      live("ended-1", "Weekend sale", "ENDED", "2026-10-10T10:00:00.000Z"),
      live("active-2", "New arrivals", "ACTIVE", "2026-10-09T10:00:00.000Z"),
    ]));

    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Welcome back, Ama" })).toBeInTheDocument();
    const summary = await screen.findByRole("region", { name: "Live summary" });
    expect(within(summary).getByText("Total Lives").nextElementSibling).toHaveTextContent("4");
    expect(within(summary).getByText("Active Lives").nextElementSibling).toHaveTextContent("2");
    expect(within(summary).getByText("Draft Lives").nextElementSibling).toHaveTextContent("1");
    expect(within(summary).getByText("Ended Lives").nextElementSibling).toHaveTextContent("1");
  });

  it("prioritizes active workspaces and shows only the newest recent Lives", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([
      live("live-active", "Active collection", "ACTIVE", "2026-10-12T10:00:00.000Z"),
      live("live-draft", "Latest draft", "DRAFT", "2026-10-11T10:00:00.000Z"),
      live("live-ended", "Recent ended", "ENDED", "2026-10-10T10:00:00.000Z"),
      live("live-old", "Older draft", "DRAFT", "2026-10-09T10:00:00.000Z"),
    ]));

    renderDashboard();

    const activeSection = await screen.findByRole("region", { name: /active selling sessions/i });
    expect(within(activeSection).getByRole("link", { name: "Open Active collection workspace" }))
      .toHaveAttribute("href", "/lives/live-active");
    const recentSection = screen.getByRole("region", { name: /recent lives/i });
    expect(within(recentSection).getByText("Latest draft")).toBeInTheDocument();
    expect(within(recentSection).getByText("Recent ended")).toBeInTheDocument();
    expect(within(recentSection).queryByText("Older draft")).not.toBeInTheDocument();
    expect(within(recentSection).getByRole("link", { name: "View all Lives" })).toHaveAttribute("href", "/lives");
    expect(screen.getByRole("link", { name: "Create a Live" })).toHaveAttribute("href", "/lives/new");
  });

  it("shows zero counts and a useful creation path when there are no Lives", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([]));

    renderDashboard();

    const summary = await screen.findByRole("region", { name: "Live summary" });
    expect(within(summary).getByText("Total Lives").nextElementSibling).toHaveTextContent("0");
    expect(await screen.findByRole("heading", { name: "No active Lives right now" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Create a Live" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "View all Lives" })).toHaveAttribute("href", "/lives");
  });

  it("does not show summary counts while Lives are loading", async () => {
    let resolveLives!: (result: Response) => void;
    const pendingLives = new Promise<Response>((resolve) => { resolveLives = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      return pendingLives;
    }));

    renderDashboard();

    expect(await screen.findByText("Loading your Lives…")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Live summary" })).not.toBeInTheDocument();
    resolveLives(response({ data: [] }));
    expect(await screen.findByRole("region", { name: "Live summary" })).toBeInTheDocument();
  });

  it("shows a retry state without misleading zero counts after a failed request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Request failed" } }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect(await screen.findByText("We couldn't load your Lives.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Live summary" })).not.toBeInTheDocument();
  });
});
