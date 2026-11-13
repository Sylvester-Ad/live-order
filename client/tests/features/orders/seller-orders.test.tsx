import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";

const creator = { id: "creator-1", name: "Ama" };
const live = { id: "live-1", name: "Friday fashion", slug: "friday-fashion", status: "ACTIVE", tiktokLiveUrl: null, createdAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z" };
const firstOrder = {
  id: "order-1", liveId: "live-1", reference: "ORD-A1B2C3", customerName: "Ama Mensah", customerPhone: "0241234567", deliveryLocation: "Accra, Greater Accra", totalAmount: 25000, paymentStatus: "PENDING", createdAt: "2026-10-18T10:30:00.000Z",
  items: [{ id: "item-1", productId: "product-1", productName: "Cotton shirt", productImageUrl: "https://images.example/cotton-shirt.png", unitPrice: 12500, quantity: 2, selectedOptions: { Size: "M", Colour: "Blue" } }],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch({
  paymentFails = false,
  exportFails = false,
  alreadyPaid = false,
  orderItems = firstOrder.items,
}: {
  paymentFails?: boolean;
  exportFails?: boolean;
  alreadyPaid?: boolean;
  orderItems?: typeof firstOrder.items;
} = {}) {
  const initialOrder = { ...firstOrder, items: orderItems };
  let orders = [alreadyPaid ? { ...initialOrder, paymentStatus: "PAID" } : initialOrder];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/v1/creator/me")) return json({ data: creator });
    if (url.endsWith("/api/v1/lives")) return json({ data: [live] });
    if (url.endsWith("/api/v1/lives/live-1/products")) return json({ data: [] });
    if (url.endsWith("/api/v1/lives/live-1/orders/export")) {
      if (exportFails) return json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed" } }, 500);
      return new Response('"Order Reference"\r\n"ORD-A1B2C3"\r\n', { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    }
    if (url.endsWith("/api/v1/lives/live-1/orders") && init?.method === "GET") return json({ data: orders });
    if (url.endsWith("/api/v1/orders/order-1") && init?.method === "PATCH") {
      if (paymentFails) return json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed" } }, 500);
      orders = [{ ...firstOrder, paymentStatus: "PAID" }];
      return json({ data: orders[0] });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  return fetchMock;
}

function renderPath(path: string) {
  return render(<AppProviders><RouterProvider router={createTestRouter([path])} /></AppProviders>);
}

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("seller order management", () => {
  it("lists reference, customer, total, date, payment status and links to details", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPath("/lives/live-1/orders");

    const row = await screen.findByRole("row", { name: /ORD-A1B2C3/ });
    expect(within(row).getByText("Ama Mensah")).toBeInTheDocument();
    expect(within(row).getByText("GH₵ 250.00")).toBeInTheDocument();
    expect(within(row).getByText("Unpaid")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "View order" })).toHaveAttribute("href", "/lives/live-1/orders/order-1");
    expect(screen.getByRole("link", { name: "← Live management" })).toHaveAttribute("href", "/lives/live-1");
    expect(await screen.findAllByRole("img", { name: "Cotton shirt product image" })).not.toHaveLength(0);
  });

  it("provides contextual Products and Orders navigation with active and mobile states", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPath("/lives/live-1/orders");

    const user = userEvent.setup();
    const navigation = await screen.findAllByRole("navigation", { name: "Seller navigation" });
    expect(navigation).toHaveLength(2);
    const desktopNavigation = navigation.find((nav) => nav.closest("aside") !== null);
    const mobileNavigation = navigation.find((nav) => nav.classList.contains("fixed"));
    expect(desktopNavigation).toBeDefined();
    expect(mobileNavigation).toBeDefined();
    expect(desktopNavigation?.closest("aside")).toHaveClass("hidden", "lg:flex");
    expect(mobileNavigation).toHaveClass("lg:hidden");
    expect(within(mobileNavigation!).getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(within(desktopNavigation!).getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      "/lives/live-1/products",
    );

    const productsLink = within(mobileNavigation!).getByRole("link", { name: "Products" });
    productsLink.focus();
    expect(productsLink).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "No products yet" })).toBeInTheDocument();
    const updatedMobileNavigation = screen.getAllByRole("navigation", { name: "Seller navigation" })
      .find((nav) => nav.classList.contains("fixed"));
    expect(within(updatedMobileNavigation!).getByRole("link", { name: "Products" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows product thumbnails and a missing-image fallback for different order items", async () => {
    const fetchMock = mockFetch({
      orderItems: [
        firstOrder.items[0],
        {
          id: "item-2",
          productId: "product-2",
          productName: "Canvas cap",
          productImageUrl: null,
          unitPrice: 12500,
          quantity: 1,
          selectedOptions: null,
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/orders/order-1");

    expect(await screen.findByRole("img", { name: "Cotton shirt product image" })).toHaveAttribute(
      "src",
      "https://images.example/cotton-shirt.png",
    );
    expect(screen.getByRole("img", { name: "Canvas cap image unavailable" })).toHaveTextContent("No image");
  });

  it("falls back to a placeholder when a saved product image cannot load", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPath("/lives/live-1/orders/order-1");

    const image = await screen.findByRole("img", { name: "Cotton shirt product image" });
    fireEvent.error(image);

    expect(screen.getByRole("img", { name: "Cotton shirt image unavailable" })).toHaveTextContent("No image");
  });

  it("shows an empty state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return json({ data: creator });
      if (url.endsWith("/api/v1/lives")) return json({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/orders")) return json({ data: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/orders");
    expect(await screen.findByRole("heading", { name: "No orders yet" })).toBeInTheDocument();

  });

  it("does not offer payment confirmation for an already paid order", async () => {
    vi.stubGlobal("fetch", mockFetch({ alreadyPaid: true }));
    renderPath("/lives/live-1/orders");
    expect(await screen.findAllByText("Paid")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("shows a retry state when order retrieval fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return json({ data: creator });
      if (url.endsWith("/api/v1/lives")) return json({ data: [live] });
      return json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed" } }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/orders");
    expect(await screen.findByText("We couldn't load orders for this Live.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows persisted line details, options, customer data and total", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPath("/lives/live-1/orders/order-1");
    expect(await screen.findByRole("heading", { name: "ORD-A1B2C3" })).toBeInTheDocument();
    expect(screen.getByText("Cotton shirt")).toBeInTheDocument();
    expect(screen.getByText("Size: M")).toBeInTheDocument();
    expect(screen.getByText("Colour: Blue")).toBeInTheDocument();
    expect(screen.getByText("Accra, Greater Accra")).toBeInTheDocument();
    expect(screen.getByText(/125\.00 each/)).toBeInTheDocument();
    expect(screen.getAllByText("GH₵ 250.00")).not.toHaveLength(0);
    expect(screen.getByRole("link", { name: "← All orders" })).toHaveAttribute("href", "/lives/live-1/orders");
  });

  it("confirms and updates payment status, with no action shown for paid orders", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/orders");
    expect(await screen.findAllByText("ORD-A1B2C3")).not.toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Mark paid" })[0]);
    expect(await screen.findByRole("alertdialog", { name: "Confirm payment received?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark as paid" }));
    expect(await screen.findByText("Order marked as paid.")).toBeInTheDocument();
    expect(await screen.findAllByText("Paid")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/api/v1/orders/order-1") && init?.method === "PATCH" && init.body === JSON.stringify({ paymentStatus: "PAID" }))).toBe(true));
  });

  it("keeps a failed payment update unpaid and allows CSV export", async () => {
    vi.stubGlobal("fetch", mockFetch({ paymentFails: true }));
    renderPath("/lives/live-1/orders");
    expect(await screen.findAllByText("ORD-A1B2C3")).not.toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Mark paid" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Mark as paid" }));
    expect(await screen.findByText("We couldn't update payment status. Check the order and try again.")).toBeInTheDocument();
    expect(screen.getAllByText("Unpaid")).not.toHaveLength(0);
  });

  it("reports export errors and downloads using a Live-scoped filename", async () => {
    const createObjectURL = vi.fn(() => "blob:orders");
    const revokeObjectURL = vi.fn();
    const downloadedNames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedNames.push(this.download);
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/orders");
    expect(await screen.findAllByText("ORD-A1B2C3")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:orders");
    expect(downloadedNames).toHaveLength(1);
    expect(downloadedNames[0]).toMatch(/^Friday-fashion-orders-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/lives/live-1/orders/export"))).toBe(true);
  });

  it("shows export failure feedback", async () => {
    vi.stubGlobal("fetch", mockFetch({ exportFails: true }));
    renderPath("/lives/live-1/orders");
    expect(await screen.findAllByText("ORD-A1B2C3")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByText("The order export could not be downloaded. Please try again.")).toBeInTheDocument();
  });
});
