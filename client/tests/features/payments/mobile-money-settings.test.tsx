import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";

const creator = { id: "creator-1", name: "Ama Mensah" };
const stores = [
  { id: "store-1", name: "Ama's Kitchen", slug: "amas-kitchen", status: "DRAFT", tiktokLiveUrl: null, createdAt: null, updatedAt: null },
  { id: "store-2", name: "Ama's Fashion", slug: "amas-fashion", status: "PUBLISHED", tiktokLiveUrl: null, createdAt: null, updatedAt: null },
];
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Store Mobile Money settings", () => {
  it("creates settings for the selected Store and handles an unconfigured Store", async () => {
    let savedInput: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/stores")) return response({ data: stores });
      if (url.endsWith("/api/v1/stores/store-1/mobile-money") && init?.method === "GET") return response({ data: null });
      if (url.endsWith("/api/v1/stores/store-1/mobile-money") && init?.method === "PUT") {
        savedInput = JSON.parse(String(init.body));
        return response({ data: { ...savedInput as Record<string, unknown>, updatedAt: "2026-11-18T10:00:00.000Z" } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AppProviders><RouterProvider router={createTestRouter(["/stores/store-1/settings/payments"])} /></AppProviders>);

    expect(await screen.findByRole("heading", { name: "Mobile Money" })).toBeInTheDocument();
    expect(screen.getByText(/No Mobile Money settings are configured for this Store yet/)).toBeInTheDocument();
    expect(screen.getAllByText(/Ama's Kitchen/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "TELECEL_CASH" } });
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Mobile Money number"), { target: { value: "+233 24 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save payment settings" }));

    expect(await screen.findByText("Store Mobile Money settings saved.")).toBeInTheDocument();
    expect(savedInput).toEqual({ provider: "TELECEL_CASH", accountName: "Ama Mensah", mobileMoneyNumber: "+233 24 123 4567", enabled: true });
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/creator/mobile-money"))).toBe(false);
  });

  it("loads and disables the current Store's settings without clearing them", async () => {
    const settings = { provider: "AT_MONEY", accountName: "Ama Mensah", mobileMoneyNumber: "0279876543", enabled: true, updatedAt: "2026-11-18T10:00:00.000Z" };
    let updateBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/stores")) return response({ data: stores });
      if (url.endsWith("/api/v1/stores/store-1/mobile-money") && init?.method === "GET") return response({ data: settings });
      if (url.endsWith("/api/v1/stores/store-1/mobile-money") && init?.method === "PUT") {
        updateBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return response({ data: { ...updateBody, updatedAt: "2026-11-18T11:00:00.000Z" } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AppProviders><RouterProvider router={createTestRouter(["/stores/store-1/settings/payments"])} /></AppProviders>);

    expect(await screen.findByLabelText("Account name")).toHaveValue("Ama Mensah");
    expect(screen.getByLabelText("Mobile Money number")).toHaveValue("0279876543");
    const toggle = screen.getByRole("checkbox", { name: /Show Mobile Money instructions/ });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save payment settings" }));

    await waitFor(() => expect(updateBody).toMatchObject({ provider: "AT_MONEY", accountName: "Ama Mensah", mobileMoneyNumber: "0279876543", enabled: false }));
    expect(await screen.findByText("Store Mobile Money settings saved.")).toBeInTheDocument();
  });

  it("uses separate cached settings when switching Stores", async () => {
    const first = { provider: "MTN_MOBILE_MONEY", accountName: "Kitchen", mobileMoneyNumber: "0241234567", enabled: true, updatedAt: null };
    const second = { provider: "TELECEL_CASH", accountName: "Fashion", mobileMoneyNumber: "0201234567", enabled: false, updatedAt: null };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/stores")) return response({ data: stores });
      if (url.endsWith("/api/v1/stores/store-1/mobile-money")) return response({ data: first });
      if (url.endsWith("/api/v1/stores/store-2/mobile-money")) return response({ data: second });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createTestRouter(["/stores/store-1/settings/payments"]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
    expect(await screen.findByLabelText("Account name")).toHaveValue("Kitchen");
    await act(async () => { await router.navigate("/stores/store-2/settings/payments"); });
    expect(await screen.findByLabelText("Account name")).toHaveValue("Fashion");
    expect(screen.getByRole("checkbox", { name: /Show Mobile Money instructions to customers/ })).not.toBeChecked();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/stores/store-2/mobile-money"))).toBe(true);
    client.clear();
  });
});
