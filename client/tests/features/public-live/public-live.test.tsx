import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";

const liveResponse = (stockQuantity = 7, tiktokLiveUrl: string | null = null) => ({
  data: {
    id: "live-1",
    name: "Friday collection",
    slug: "friday-collection",
    status: "ACTIVE",
    tiktokLiveUrl,
    products: [
      {
        id: "product-1",
        name: "Cotton shirt",
        price: 2550,
        options: { Size: ["S", "M"] },
        stockQuantity,
        available: stockQuantity > 0,
        image: null,
      },
      {
        id: "product-2",
        name: "Sold-out cap",
        price: 1000,
        options: null,
        stockQuantity: 0,
        available: false,
        image: null,
      },
    ],
  },
});

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const confirmedOrder = {
  id: "order-1",
  liveId: "live-1",
  reference: "ORD-0123456789ABCDEF",
  customerName: "Ama Mensah",
  customerPhone: "0241234567",
  deliveryLocation: "Madina, Accra",
  totalAmount: 5100,
  paymentStatus: "PENDING",
  createdAt: "2026-10-20T10:00:00.000Z",
  items: [{
    id: "line-1",
    productId: "product-1",
    productName: "Cotton shirt",
    unitPrice: 2550,
    quantity: 2,
    selectedOptions: { Size: "M" },
  }],
};

function renderStorefront() {
  return render(<AppProviders><RouterProvider router={createTestRouter(["/live/friday-collection"])} /></AppProviders>);
}

describe("public customer ordering", () => {
  it("shows a live mobile cart summary and keeps the cart intact when the sheet closes", async () => {
    const fetchMock = vi.fn(async () => response(liveResponse()));
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    const addButton = await screen.findByRole("button", { name: "Add to order" });
    expect(addButton).toBeDisabled();
    fireEvent.change(await screen.findByLabelText("Choose Size for Cotton shirt"), { target: { value: "M" } });
    expect(addButton).toBeEnabled();
    fireEvent.change(await screen.findByLabelText("Quantity to add for Cotton shirt"), { target: { value: "2" } });
    fireEvent.click(addButton);
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("Subtotal · GH₵ 51.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View cart" }));
    const cartDialog = screen.getByRole("dialog", { name: "Your order" });
    expect(cartDialog).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Increase Cotton shirt quantity" }));
    expect(screen.getByLabelText("Quantity 3")).toBeInTheDocument();
    expect(screen.getByText("Estimated total").parentElement).toHaveTextContent("GH₵ 76.50");

    fireEvent.click(within(cartDialog).getByRole("button", { name: "Close cart" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View cart" }));
    expect(screen.getByLabelText("Quantity 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Cotton shirt" }));
    expect(screen.getByText("Add products to start your order.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Your order" })).getByRole("button", { name: "Close cart" }));
    expect(screen.queryByRole("button", { name: "View cart" })).not.toBeInTheDocument();
  });

  it("refreshes public availability when browser navigation remounts the storefront", async () => {
    let liveRequests = 0;
    const fetchMock = vi.fn(async () => {
      liveRequests += 1;
      return response(liveResponse(liveRequests > 1 ? 4 : 7));
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createTestRouter(["/live/friday-collection"]);
    render(<AppProviders><RouterProvider router={router} /></AppProviders>);

    expect(await screen.findByText("7 available")).toBeInTheDocument();
    await act(async () => { await router.navigate("/login"); });
    await act(async () => { await router.navigate("/live/friday-collection"); });
    expect(await screen.findByText("4 available")).toBeInTheDocument();
    expect(liveRequests).toBeGreaterThanOrEqual(2);
  });

  it("offers the TikTok broadcast link when the seller provides one", async () => {
    const fetchMock = vi.fn(async () => response(liveResponse(7, "https://www.tiktok.com/@creator/live")));
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    expect(await screen.findByRole("link", { name: "Return to TikTok LIVE" })).toHaveAttribute(
      "href",
      "https://www.tiktok.com/@creator/live",
    );
  });

  it("shows availability, validates the basket, and submits options without client prices", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/public/lives/friday-collection")) return response(liveResponse());
      if (url.endsWith("/api/v1/lives/live-1/orders") && init?.method === "POST") {
        return response({ data: confirmedOrder }, 201);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    expect(await screen.findByText("7 available")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity for Sold-out cap")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose Size for Cotton shirt"), { target: { value: "M" } });
    fireEvent.change(screen.getByLabelText("Quantity to add for Cotton shirt"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Added 2 Cotton shirt items to your order.");
    fireEvent.change(screen.getByLabelText("Quantity to add for Cotton shirt"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    expect(screen.getByLabelText("Quantity 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decrease Cotton shirt quantity" }));
    expect(screen.getByLabelText("Quantity 2")).toBeInTheDocument();
    expect(screen.getAllByText("GH₵ 51.00")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Madina, Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("heading", { name: "Thanks for your order" })).toBeInTheDocument();
    expect(screen.getByText("ORD-0123456789ABCDEF")).toBeInTheDocument();
    expect(screen.getByText("Size: M")).toBeInTheDocument();
    expect(screen.getByText("Payment has not been confirmed. The seller will follow up with you.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue shopping" })).toBeInTheDocument();
    const orderCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/api/v1/lives/live-1/orders") && init?.method === "POST");
    expect(JSON.parse(String(orderCall?.[1]?.body))).toEqual({
      customerName: "Ama Mensah",
      customerPhone: "0241234567",
      deliveryLocation: "Madina, Accra",
      items: [{ productId: "product-1", quantity: 2, selectedOptions: { Size: "M" } }],
    });
    expect(new Headers(orderCall?.[1]?.headers).get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("reuses the submission key when retrying after a committed response is lost", async () => {
    let orderRequests = 0;
    let committedOrder: Response | null = null;
    const requestKeys: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/public/lives/friday-collection")) return response(liveResponse());
      if (url.endsWith("/api/v1/lives/live-1/orders") && init?.method === "POST") {
        orderRequests += 1;
        requestKeys.push(new Headers(init.headers).get("Idempotency-Key") ?? "");
        if (orderRequests === 1) {
          committedOrder = response({ data: { ...confirmedOrder, id: "order-committed" } }, 201);
          throw new TypeError("Connection closed after the server committed the order");
        }
        return committedOrder ?? response({ error: { code: "UNEXPECTED", message: "No committed order" } }, 500);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    fireEvent.change(await screen.findByLabelText("Choose Size for Cotton shirt"), { target: { value: "M" } });
    fireEvent.change(await screen.findByLabelText("Quantity to add for Cotton shirt"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Madina, Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText(/couldn't confirm whether the order reached the seller/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry same order" }));
    expect(await screen.findByRole("heading", { name: "Thanks for your order" })).toBeInTheDocument();
    expect(requestKeys).toHaveLength(2);
    expect(requestKeys[1]).toBe(requestKeys[0]);
    expect(sessionStorage.getItem("liveorder:public-order-idempotency:friday-collection")).toBeNull();
  });

  it("reports stock conflicts and clamps the basket after availability refresh", async () => {
    let liveRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/public/lives/friday-collection")) {
        liveRequests += 1;
        return response(liveResponse(liveRequests > 1 ? 2 : 7));
      }
      if (url.endsWith("/api/v1/lives/live-1/orders") && init?.method === "POST") {
        return response({ error: { code: "INSUFFICIENT_STOCK", message: "Not enough stock" } }, 409);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    const quantity = await screen.findByLabelText("Quantity to add for Cotton shirt");
    fireEvent.change(screen.getByLabelText("Choose Size for Cotton shirt"), { target: { value: "M" } });
    fireEvent.change(quantity, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Madina, Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByText(/Stock changed while you were ordering/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh availability" }));
    expect(await screen.findByText("2 available")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decrease Cotton shirt quantity" }));
    expect(screen.getByLabelText("Quantity 2")).toBeInTheDocument();
  });

  it("confirms with the TikTok link only when supplied and returns to shopping", async () => {
    let liveRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/public/lives/friday-collection")) {
        liveRequests += 1;
        return response(liveResponse(liveRequests > 1 ? 5 : 7, "https://www.tiktok.com/@creator/live"));
      }
      if (url.endsWith("/api/v1/lives/live-1/orders") && init?.method === "POST") return response({ data: confirmedOrder }, 201);
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    fireEvent.change(await screen.findByLabelText("Choose Size for Cotton shirt"), { target: { value: "M" } });
    fireEvent.change(await screen.findByLabelText("Quantity to add for Cotton shirt"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Madina, Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));

    const tiktok = await screen.findByRole("link", { name: "Return to TikTok LIVE" });
    expect(tiktok).toHaveAttribute("href", "https://www.tiktok.com/@creator/live");
    fireEvent.click(screen.getByRole("button", { name: "Continue shopping" }));
    expect(await screen.findByRole("heading", { name: "Friday collection" })).toBeInTheDocument();
    expect(screen.getByText("Add products to start your order.")).toBeInTheDocument();
    expect(await screen.findByText("5 available")).toBeInTheDocument();
    expect(liveRequests).toBe(2);
  });

  it("validates customer details against the order request before sending", async () => {
    const fetchMock = vi.fn(async () => response(liveResponse()));
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    fireEvent.change(await screen.findByLabelText("Choose Size for Cotton shirt"), { target: { value: "M" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add to order" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your name using 1 to 100 characters.");
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/lives/live-1/orders"))).toBe(false);
  });
});
