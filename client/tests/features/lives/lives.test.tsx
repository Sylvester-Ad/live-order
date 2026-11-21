import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";
import type { Store } from "../../../src/features/lives/api/lives-api";

const draftStore: Store = {
  id: "live-1",
  name: "Friday fashion",
  slug: "friday-fashion-a1b2c3d4",
  status: "DRAFT",
  tiktokLiveUrl: null,
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
};

const creator = { id: "creator-1", name: "Ama" };

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPath(path: string, queryClient?: QueryClient) {
  return render(
    queryClient
      ? <QueryClientProvider client={queryClient}><RouterProvider router={createTestRouter([path])} /></QueryClientProvider>
      : <AppProviders><RouterProvider router={createTestRouter([path])} /></AppProviders>,
  );
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

function authenticatedFetch(lives: unknown[] = [draftStore]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/creator/me")) return response({ data: creator });
    if (url.endsWith("/v1/stores") && init?.method === "POST") {
      return response({ data: draftStore }, 201);
    }
    if (url.endsWith("/v1/stores")) return response({ data: lives });
    if (url.includes("/v1/stores/") && url.endsWith("/orders")) return response({ data: [] });
    if (url.includes("/v1/stores/live-1/") && init?.method === "POST") {
      const status = url.endsWith("/publish") ? "PUBLISHED" : "UNPUBLISHED";
      const updated = { ...draftStore, status };
      return response({ data: updated });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("seller Store management", () => {
  it("shows the creator's Stores and opens the selected workspace", async () => {
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);

    renderPath("/stores");

    expect(await screen.findByRole("heading", { name: "Friday fashion" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText(/Created /)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open storefront" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open TikTok LIVE" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Manage Store" }));

    expect(await screen.findByRole("heading", { name: "Store publication" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).includes("/api/v1/stores") && init?.credentials === "include",
    )).toBe(true);
  });

  it("shows an actionable empty state", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([]));
    renderPath("/stores");

    expect(await screen.findByRole("heading", { name: "No Stores yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first Store" })).toHaveAttribute("href", "/stores/new");
  });

  it("shows a loading state while the Stores request is pending", async () => {
    let resolveList!: (value: Response) => void;
    const pendingStores = new Promise<Response>((resolve) => { resolveList = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      return pendingStores;
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores");

    expect(await screen.findByText("Loading your Stores…")).toBeInTheDocument();
    resolveList(response({ data: [] }));
    expect(await screen.findByRole("heading", { name: "No Stores yet" })).toBeInTheDocument();
  });

  it("shows a retry state when the Stores request fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Request failed" } }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores");

    expect(await screen.findByText("We couldn't load your Stores.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows storefront and TikTok actions and reports clipboard success", async () => {
    const activeStore: Store = {
      ...draftStore,
      status: "PUBLISHED",
      tiktokLiveUrl: "https://www.tiktok.com/@creator/live",
    };
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboardWrite } });
    vi.stubGlobal("fetch", authenticatedFetch([activeStore]));
    renderPath("/stores");

    expect(await screen.findByRole("link", { name: "Open storefront" })).toHaveAttribute("href", expect.stringContaining("/live/friday-fashion-a1b2c3d4"));
    expect(screen.getByRole("link", { name: "Open TikTok LIVE" })).toHaveAttribute("href", activeStore.tiktokLiveUrl);
    fireEvent.click(screen.getByRole("button", { name: "Copy storefront link" }));
    expect(await screen.findByText("Storefront link copied.")).toBeInTheDocument();
    expect(clipboardWrite).toHaveBeenCalledWith(expect.stringContaining("/live/friday-fashion-a1b2c3d4"));
    expect(screen.getByRole("link", { name: "Manage orders" })).toHaveAttribute("href", "/stores/live-1/orders");
  });

  it("switches Store context while preserving the current seller section", async () => {
    const secondStore: Store = { ...draftStore, id: "store-2", name: "Saturday market", slug: "saturday-market" };
    vi.stubGlobal("fetch", authenticatedFetch([draftStore, secondStore]));
    renderPath("/stores/live-1/orders");

    fireEvent.change(await screen.findByLabelText("Managing Store"), { target: { value: "store-2" } });
    expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Store management" })).toHaveAttribute("href", "/stores/store-2");
    expect(screen.getByLabelText("Managing Store")).toHaveValue("store-2");
  });

  it("reports clipboard failures with a recovery hint", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });
    vi.stubGlobal("fetch", authenticatedFetch([{ ...draftStore, status: "PUBLISHED" }]));
    renderPath("/stores");

    fireEvent.click(await screen.findByRole("button", { name: "Copy storefront link" }));
    expect(await screen.findByText("Couldn't copy the storefront link. Select and copy the URL from the Store workspace.")).toBeInTheDocument();
  });

  it("validates a Store name and creates a Store before opening its workspace", async () => {
    const tiktokLiveUrl = "https://www.tiktok.com/@creator/live";
    const created = { ...draftStore, name: "New summer collection", id: "live-new", tiktokLiveUrl };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.endsWith("/v1/stores") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ name: "New summer collection", tiktokLiveUrl });
        return response({ data: created }, 201);
      }
      if (url.endsWith("/v1/stores")) return response({ data: [created] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores/new");

    const nameField = await screen.findByLabelText("Store name");
    fireEvent.change(nameField, { target: { value: "    " } });
    fireEvent.click(screen.getByRole("button", { name: "Create Store" }));
    expect(await screen.findByText("Enter a name for this Store.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/v1/stores") && init?.method === "POST")).toBe(false);

    fireEvent.change(nameField, { target: { value: "  New summer collection  " } });
    fireEvent.change(screen.getByLabelText("TikTok LIVE URL (optional)"), { target: { value: tiktokLiveUrl } });
    fireEvent.click(screen.getByRole("button", { name: "Create Store" }));
    expect(await screen.findByRole("heading", { name: "New summer collection" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/v1/stores") && init?.method === "POST")).toBe(true);
  });

  it("updates a TikTok LIVE URL from the Store workspace", async () => {
    const original: Store = { ...draftStore, status: "PUBLISHED", tiktokLiveUrl: null };
    let current = original;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.endsWith("/v1/stores") && init?.method !== "PATCH") return response({ data: [current] });
      if (url.endsWith("/v1/stores/live-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { tiktokLiveUrl: string | null };
        current = { ...current, tiktokLiveUrl: body.tiktokLiveUrl };
        return response({ data: current });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores/live-1");

    const input = await screen.findByLabelText("TikTok LIVE URL");
    fireEvent.change(input, { target: { value: "https://live.tiktok.com/@creator/live" } });
    fireEvent.click(screen.getByRole("button", { name: "Save TikTok link" }));

    expect(await screen.findByText("TikTok LIVE link saved.")).toBeInTheDocument();
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ tiktokLiveUrl: "https://live.tiktok.com/@creator/live" });
  });

  it("refreshes an untouched TikTok URL but preserves the creator's draft during later refetches", async () => {
    let current: Store = { ...draftStore, tiktokLiveUrl: null };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.endsWith("/v1/stores")) return response({ data: [current] });
      throw new Error(`Unexpected request: ${url}`);
    });
    const queryClient = createTestQueryClient();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores/live-1", queryClient);

    await screen.findByLabelText("TikTok LIVE URL");
    current = { ...current, tiktokLiveUrl: "https://www.tiktok.com/@creator/latest" };
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["stores"] }); });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/v1/stores")).length).toBeGreaterThan(1));
    expect(screen.getByLabelText("TikTok LIVE URL")).toHaveValue(current.tiktokLiveUrl);

    fireEvent.change(screen.getByLabelText("TikTok LIVE URL"), { target: { value: "https://live.tiktok.com/@creator/my-draft" } });
    current = { ...current, tiktokLiveUrl: "https://www.tiktok.com/@creator/changed-again" };
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["stores"] }); });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/v1/stores")).length).toBeGreaterThan(2));
    expect(screen.getByLabelText("TikTok LIVE URL")).toHaveValue("https://live.tiktok.com/@creator/my-draft");
    queryClient.clear();
  });

  it("initializes the correct TikTok link when navigating to a different Store", async () => {
    const otherStore: Store = {
      ...draftStore,
      id: "live-2",
      name: "Saturday market",
      slug: "saturday-market-a1b2c3d4",
      tiktokLiveUrl: "https://www.tiktok.com/@creator/saturday",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      if (String(input).endsWith("/v1/stores")) return response({ data: [draftStore, otherStore] });
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    const queryClient = createTestQueryClient();
    const router = createTestRouter(["/stores/live-1"]);
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);

    fireEvent.change(await screen.findByLabelText("TikTok LIVE URL"), { target: { value: "https://live.tiktok.com/@creator/first-draft" } });
    await act(async () => { await router.navigate("/stores/live-2"); });

    expect(await screen.findByLabelText("TikTok LIVE URL")).toHaveValue(otherStore.tiktokLiveUrl);
    expect(screen.getByRole("heading", { name: "Saturday market" })).toBeInTheDocument();
    queryClient.clear();
  });

  it("shows backend validation errors when Store creation is rejected", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      if (init?.method === "POST") {
        return response({
          error: { code: "VALIDATION_ERROR", message: "Request validation failed" },
        }, 400);
      }
      if (String(input).endsWith("/v1/stores")) return response({ data: [] });
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores/new");

    fireEvent.change(await screen.findByLabelText("Store name"), { target: { value: "A valid name" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Store" }));

    expect(await screen.findByText("Check the Store name and optional TikTok LIVE link.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Store" })).toBeEnabled();
  });

  it("activates a draft and reflects the server status", async () => {
    let currentStore: Store = draftStore;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.endsWith("/v1/stores/live-1/publish") && init?.method === "POST") {
        currentStore = { ...currentStore, status: "PUBLISHED" };
        return response({ data: currentStore });
      }
      if (url.endsWith("/v1/stores")) return response({ data: [currentStore] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores/live-1");

    expect(await screen.findByRole("button", { name: "Publish Store" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish Store" }));

    expect(await screen.findByText("Published")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish Store" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).includes("/v1/stores/live-1") &&
      init?.method === "POST" && String(input).endsWith("/publish"),
    )).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "← All Stores" }));
    expect(await screen.findByRole("link", { name: "Manage Store" })).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("confirms ending an active Store and removes active-only controls after success", async () => {
    let currentStore: Store = { ...draftStore, status: "PUBLISHED" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.endsWith("/v1/stores/live-1/unpublish") && init?.method === "POST") {
        currentStore = { ...currentStore, status: "UNPUBLISHED" };
        return response({ data: currentStore });
      }
      if (url.endsWith("/v1/stores")) return response({ data: [currentStore] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores/live-1");

    fireEvent.click(await screen.findByRole("button", { name: "Take Store offline" }));
    expect(screen.getByRole("alertdialog", { name: "Unpublish this Store?" })).toBeInTheDocument();
    const dialog = screen.getByRole("alertdialog", { name: "Unpublish this Store?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Take Store offline" }));

    expect(await screen.findByText("Unpublished")).toBeInTheDocument();
    expect(screen.getByText("This Store is offline. Its products and orders are saved, and you can publish it again at any time.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take Store offline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /live\/friday-fashion/ })).not.toBeInTheDocument();
  });

  it("retains the confirmed state and offers retry after a rejected transition", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.endsWith("/v1/stores/live-1/publish") && init?.method === "POST") {
        return response({ error: { code: "INVALID_STATUS_TRANSITION", message: "Cannot activate" } }, 409);
      }
      if (url.endsWith("/v1/stores")) return response({ data: [draftStore] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/stores/live-1");

    fireEvent.click(await screen.findByRole("button", { name: "Publish Store" }));

    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This Store's status changed. Refresh the page before trying again.");
    expect(screen.getByRole("button", { name: "Publish Store" })).toBeEnabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("renders a missing Store without exposing transition actions", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([]));
    renderPath("/stores/unknown");

    expect(await screen.findByRole("heading", { name: "Store not found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish Store" })).not.toBeInTheDocument();
  });
});
