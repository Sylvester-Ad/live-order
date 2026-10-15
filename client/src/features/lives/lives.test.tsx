import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import type { Live } from "./api/lives-api";

const draftLive: Live = {
  id: "live-1",
  name: "Friday fashion",
  slug: "friday-fashion-a1b2c3d4",
  status: "DRAFT",
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

function renderPath(path: string) {
  return render(
    <AppProviders>
      <RouterProvider router={createTestRouter([path])} />
    </AppProviders>,
  );
}

function authenticatedFetch(lives: unknown[] = [draftLive]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/creator/me")) return response({ data: creator });
    if (url.endsWith("/v1/lives") && init?.method === "POST") {
      return response({ data: draftLive }, 201);
    }
    if (url.endsWith("/v1/lives")) return response({ data: lives });
    if (url.includes("/v1/lives/live-1") && init?.method === "PATCH") {
      const patchBody = JSON.parse(String(init.body)) as { status: string };
      const updated = { ...draftLive, status: patchBody.status };
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
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("seller Live management", () => {
  it("shows the creator's Lives and opens the selected workspace", async () => {
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);

    renderPath("/lives");

    expect(await screen.findByRole("heading", { name: "Friday fashion" })).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText(/^Created /)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Open Live" }));

    expect(await screen.findByRole("heading", { name: "Session status" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).includes("/api/v1/lives") && init?.credentials === "include",
    )).toBe(true);
  });

  it("shows an actionable empty state", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([]));
    renderPath("/lives");

    expect(await screen.findByRole("heading", { name: "No Lives yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first Live" })).toHaveAttribute("href", "/lives/new");
  });

  it("shows a loading state while the Lives request is pending", async () => {
    let resolveList!: (value: Response) => void;
    const pendingLives = new Promise<Response>((resolve) => { resolveList = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      return pendingLives;
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives");

    expect(await screen.findByText("Loading your Lives…")).toBeInTheDocument();
    resolveList(response({ data: [] }));
    expect(await screen.findByRole("heading", { name: "No Lives yet" })).toBeInTheDocument();
  });

  it("shows a retry state when the Lives request fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Request failed" } }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives");

    expect(await screen.findByText("We couldn't load your Lives.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("validates a Live name and creates a Live before opening its workspace", async () => {
    const created = { ...draftLive, name: "New summer collection", id: "live-new" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.endsWith("/v1/lives") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ name: "New summer collection" });
        return response({ data: created }, 201);
      }
      if (url.endsWith("/v1/lives")) return response({ data: [created] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/new");

    const nameField = await screen.findByLabelText("Live name");
    fireEvent.change(nameField, { target: { value: "    " } });
    fireEvent.click(screen.getByRole("button", { name: "Create Live" }));
    expect(await screen.findByText("Enter a name for this Live.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/v1/lives") && init?.method === "POST")).toBe(false);

    fireEvent.change(nameField, { target: { value: "  New summer collection  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create Live" }));
    expect(await screen.findByRole("heading", { name: "New summer collection" })).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/v1/lives") && init?.method === "POST")).toBe(true);
  });

  it("shows backend validation errors when Live creation is rejected", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/creator/me")) return response({ data: creator });
      if (init?.method === "POST") {
        return response({
          error: { code: "VALIDATION_ERROR", message: "Request validation failed" },
        }, 400);
      }
      if (String(input).endsWith("/v1/lives")) return response({ data: [] });
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/new");

    fireEvent.change(await screen.findByLabelText("Live name"), { target: { value: "A valid name" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Live" }));

    expect(await screen.findByText("Enter a valid Live name of 1 to 100 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Live" })).toBeEnabled();
  });

  it("activates a draft and reflects the server status", async () => {
    let currentLive: Live = draftLive;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.includes("/v1/lives/live-1") && init?.method === "PATCH") {
        currentLive = { ...currentLive, status: "ACTIVE" };
        return response({ data: currentLive });
      }
      if (url.endsWith("/v1/lives")) return response({ data: [currentLive] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1");

    expect(await screen.findByRole("button", { name: "Activate Live" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activate Live" }));

    expect(await screen.findByText("ACTIVE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate Live" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).includes("/v1/lives/live-1") &&
      init?.method === "PATCH" && init.body === JSON.stringify({ status: "ACTIVE" }),
    )).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "← All Lives" }));
    expect(await screen.findByRole("link", { name: "Open Live" })).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("confirms ending an active Live and removes active-only controls after success", async () => {
    let currentLive: Live = { ...draftLive, status: "ACTIVE" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.includes("/v1/lives/live-1") && init?.method === "PATCH") {
        currentLive = { ...currentLive, status: "ENDED" };
        return response({ data: currentLive });
      }
      if (url.endsWith("/v1/lives")) return response({ data: [currentLive] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1");

    fireEvent.click(await screen.findByRole("button", { name: "End Live" }));
    expect(screen.getByRole("alertdialog", { name: "End this Live?" })).toBeInTheDocument();
    const dialog = screen.getByRole("alertdialog", { name: "End this Live?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "End Live" }));

    expect(await screen.findByText("ENDED")).toBeInTheDocument();
    expect(screen.getByText("This Live has ended and cannot be reopened.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /live\/friday-fashion/ })).not.toBeInTheDocument();
  });

  it("retains the confirmed state and offers retry after a rejected transition", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) return response({ data: creator });
      if (url.includes("/v1/lives/live-1") && init?.method === "PATCH") {
        return response({ error: { code: "INVALID_STATUS_TRANSITION", message: "Cannot activate" } }, 409);
      }
      if (url.endsWith("/v1/lives")) return response({ data: [draftLive] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1");

    fireEvent.click(await screen.findByRole("button", { name: "Activate Live" }));

    expect(await screen.findByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This Live's status has changed. Refresh the page before trying again.");
    expect(screen.getByRole("button", { name: "Activate Live" })).toBeEnabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("renders a missing Live without exposing transition actions", async () => {
    vi.stubGlobal("fetch", authenticatedFetch([]));
    renderPath("/lives/unknown");

    expect(await screen.findByRole("heading", { name: "Live not found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate Live" })).not.toBeInTheDocument();
  });
});
