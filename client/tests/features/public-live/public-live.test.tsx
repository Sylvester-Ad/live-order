import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";

const liveResponse = (stockQuantity = 7) => ({
  data: {
    id: "live-1",
    name: "Friday collection",
    slug: "friday-collection",
    status: "ACTIVE",
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

function renderStorefront() {
  return render(<AppProviders><RouterProvider router={createTestRouter(["/live/friday-collection"])} /></AppProviders>);
}

describe("public customer ordering", () => {
  it("shows availability, validates the basket, and submits options without client prices", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/public/lives/friday-collection")) return response(liveResponse());
      if (url.endsWith("/api/v1/lives/live-1/orders") && init?.method === "POST") {
        return response({ data: { id: "order-1" } }, 201);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    expect(await screen.findByText("7 available")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity for Sold-out cap")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose Size for Cotton shirt"), { target: { value: "M" } });
    fireEvent.change(screen.getByLabelText("Quantity for Cotton shirt"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Madina, Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("heading", { name: "Thanks for your order" })).toBeInTheDocument();
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
          committedOrder = response({ data: { id: "order-committed" } }, 201);
          throw new TypeError("Connection closed after the server committed the order");
        }
        return committedOrder ?? response({ error: { code: "UNEXPECTED", message: "No committed order" } }, 500);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStorefront();

    fireEvent.change(await screen.findByLabelText("Quantity for Cotton shirt"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Madina, Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText("We couldn't place this order. Check your details and try again.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
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

    const quantity = await screen.findByLabelText("Quantity for Cotton shirt");
    fireEvent.change(quantity, { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0241234567" } });
    fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Madina, Accra" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByText(/Stock changed while you were ordering/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh availability" }));
    expect(await screen.findByText("2 available")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity for Cotton shirt")).toHaveValue(2);
  });
});
