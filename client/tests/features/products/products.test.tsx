import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";
import type { Product } from "../../../src/features/products/api/products-api";

const creator = { id: "creator-1", name: "Ama" };
const live = {
  id: "live-1",
  name: "Friday fashion",
  slug: "friday-fashion-a1b2c3d4",
  status: "DRAFT" as const,
  tiktokLiveUrl: null,
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
};

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    liveId: "live-1",
    name: "Classic T-shirt",
    price: 2550,
    options: { sizes: ["S", "M"], colors: ["Black", "White"] },
    stockQuantity: 8,
    image: null,
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
    ...overrides,
  };
}

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

function productFetch(initialProducts: Product[] = [], rejectDelete = true, failFirstImageUpload = false) {
  let products = initialProducts;
  let imageUploads = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
    if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
    if (url.endsWith("/api/v1/lives/live-1/products") && (!init?.method || init.method === "GET")) {
      return response({ data: products });
    }
    if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "POST") {
      const formData = init.body instanceof FormData ? init.body : null;
      if (formData?.has("image")) {
        imageUploads += 1;
        if (failFirstImageUpload && imageUploads === 1) {
          return response({ error: { code: "IMAGE_STORAGE_FAILED", message: "Upload failed" } }, 502);
        }
      }
      const body = JSON.parse(formData ? String(formData.get("product")) : String(init.body)) as { name: string; price: number; stockQuantity: number; options?: unknown };
      const created = product({
        id: "product-new",
        ...body,
        options: body.options ?? null,
        image: formData?.has("image")
          ? { id: "image-1", url: "https://images.example/product.png", createdAt: "2026-10-12T10:00:00.000Z" }
          : null,
      });
      products = [...products, created];
      return response({ data: created }, 201);
    }
    const imagePath = url.match(/\/api\/v1\/lives\/live-1\/products\/([^/]+)\/image$/);
    if (imagePath && init?.method === "POST") {
      imageUploads += 1;
      if (failFirstImageUpload && imageUploads === 1) {
        return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Upload failed" } }, 500);
      }
      const productId = imagePath[1];
      const current = products.find((item) => item.id === productId);
      if (!current) return response({ error: { code: "PRODUCT_NOT_FOUND", message: "Missing" } }, 404);
      const updated = product({ ...current, image: { id: "image-1", url: "https://images.example/product.png", createdAt: "2026-10-12T10:00:00.000Z" } });
      products = products.map((item) => item.id === updated.id ? updated : item);
      return response({ data: updated });
    }
    if (url.endsWith("/api/v1/lives/live-1/products/product-1") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Partial<Product>;
      const updated = { ...products[0], ...body } as Product;
      products = products.map((item) => item.id === updated.id ? updated : item);
      return response({ data: updated });
    }
    if (url.endsWith("/api/v1/lives/live-1/products/product-1") && init?.method === "DELETE") {
      if (rejectDelete) {
        return response({ error: { code: "PRODUCT_IN_USE", message: "Products with order history cannot be deleted" } }, 409);
      }
      products = products.filter((item) => item.id !== "product-1");
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/api/v1/lives/live-1/products/product-1/image") && init?.method === "DELETE") {
      const updated = product({ ...products[0], image: null });
      products = products.map((item) => item.id === updated.id ? updated : item);
      return response({ data: updated });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  return fetchMock;
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

describe("seller product management", () => {
  it("keeps create-form values when the Live query refetches and fails", async () => {
    let liveRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) {
        liveRequests += 1;
        return liveRequests === 1
          ? response({ data: [live] })
          : response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Refresh failed" } }, 500);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const queryClient = createTestQueryClient();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new", queryClient);

    const nameInput = await screen.findByLabelText("Product name");
    fireEvent.change(nameInput, { target: { value: "My unsaved product" } });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["lives"] }); });

    expect(screen.getByLabelText("Product name")).toHaveValue("My unsaved product");
    expect(screen.getByRole("button", { name: "Create product" })).toBeEnabled();
    await screen.findByText("The latest Live or product data could not be refreshed. Your current form values are preserved.");
    queryClient.clear();
  });

  it("preserves edited product values across a successful background refetch", async () => {
    let productRequests = 0;
    let currentProduct = product();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products")) {
        productRequests += 1;
        if (productRequests >= 2) currentProduct = product({ name: "Server refreshed name", price: 4000, stockQuantity: 20 });
        return response({ data: [currentProduct] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const queryClient = createTestQueryClient();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit", queryClient);

    const nameInput = await screen.findByLabelText("Product name");
    fireEvent.change(nameInput, { target: { value: "My product draft" } });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["products", "live-1"] }); });
    await waitFor(() => expect(productRequests).toBeGreaterThan(1));

    expect(screen.getByLabelText("Product name")).toHaveValue("My product draft");
    expect(screen.getByLabelText("Price (GHS)")).toHaveValue("40.00");
    expect(screen.getByLabelText("Stock quantity")).toHaveValue(20);
    expect(screen.queryByText("Loading product…")).not.toBeInTheDocument();
    queryClient.clear();
  });

  it("initializes a different product when the route changes without leaking the previous draft", async () => {
    const otherLive = { ...live, id: "live-2", name: "Saturday market" };
    const otherProduct = product({ id: "product-2", liveId: "live-2", name: "Canvas tote", price: 1200, stockQuantity: 3 });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live, otherLive] });
      if (url.endsWith("/api/v1/lives/live-1/products")) return response({ data: [product()] });
      if (url.endsWith("/api/v1/lives/live-2/products")) return response({ data: [otherProduct] });
      throw new Error(`Unexpected request: ${url}`);
    });
    const queryClient = createTestQueryClient();
    const router = createTestRouter(["/lives/live-1/products/product-1/edit"]);
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Unsaved first product" } });
    await act(async () => { await router.navigate("/lives/live-2/products/product-2/edit"); });

    expect(await screen.findByLabelText("Product name")).toHaveValue("Canvas tote");
    expect(screen.getByLabelText("Price (GHS)")).toHaveValue("12.00");
    expect(screen.getByText("Update product details for Saturday market.")).toBeInTheDocument();
    queryClient.clear();
  });

  it("lists only the selected Live's products with formatted price and options", async () => {
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products");

    expect(await screen.findByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByText("Friday fashion")).toBeInTheDocument();
    expect(screen.getByText("Classic T-shirt")).toBeInTheDocument();
    expect(screen.getByText("GH₵ 25.50")).toBeInTheDocument();
    expect(screen.getByText("8 in stock")).toBeInTheDocument();
    expect(screen.getByText("S · M")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/lives/live-1/products"))).toBe(true);
  });

  it("shows an actionable empty state for a Live with no products", async () => {
    vi.stubGlobal("fetch", productFetch());
    renderPath("/lives/live-1/products");

    expect(await screen.findByRole("heading", { name: "No products yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first product" })).toHaveAttribute(
      "href",
      "/lives/live-1/products/new",
    );
  });

  it("does not display a product whose response belongs to another Live", async () => {
    vi.stubGlobal("fetch", productFetch([product({ liveId: "live-2" })]));
    renderPath("/lives/live-1/products");

    expect(await screen.findByRole("heading", { name: "No products yet" })).toBeInTheDocument();
    expect(screen.queryByText("Classic T-shirt")).not.toBeInTheDocument();
  });

  it("shows a loading state while the selected Live's products are being fetched", async () => {
    let resolveProducts!: (value: Response) => void;
    const pendingProducts = new Promise<Response>((resolve) => { resolveProducts = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products")) return pendingProducts;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products");

    expect(await screen.findByText("Loading products for this Live…")).toBeInTheDocument();
    resolveProducts(response({ data: [] }));
    expect(await screen.findByRole("heading", { name: "No products yet" })).toBeInTheDocument();
  });

  it("shows a retry state when the product list request fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products")) {
        return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Request failed" } }, 500);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products");

    expect(await screen.findByText("We couldn't load this Live's products.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No products yet" })).not.toBeInTheDocument();
  });

  it("creates a product with stock and visually configured choices", async () => {
    const fetchMock = productFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "  Cotton shirt " } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "25.50" } });
    fireEvent.change(screen.getByLabelText("Stock quantity"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option group" }));
    fireEvent.change(screen.getByLabelText("Option group 1 name"), { target: { value: "Size" } });
    fireEvent.change(screen.getByLabelText("Size choice 1"), { target: { value: "S" } });
    fireEvent.click(screen.getByRole("button", { name: "Add choice" }));
    fireEvent.change(screen.getByLabelText("Size choice 2"), { target: { value: "M" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("Product created.")).toBeInTheDocument();
    expect(screen.getByText("Cotton shirt")).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      name: "Cotton shirt",
      price: 2550,
      stockQuantity: 12,
      options: { Size: ["S", "M"] },
    });
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/image") && init?.method === "POST")).toBe(false);
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/api/v1/lives/live-1/products") && init?.method === "GET",
    )).toBe(true); // The destination list is refreshed after creation succeeds.
  });

  it("rejects invalid price and unfinished options before sending a create request", async () => {
    const fetchMock = productFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "A product" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "1.001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option group" }));
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("Enter an amount with up to two decimal places.")).toBeInTheDocument();
    expect(screen.getByText("Enter a name for every option group.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("does not create a product when its image upload fails and retries the combined create", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:new-product" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const fetchMock = productFetch([], true, true);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    const file = new File(["image"], "bag.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Limited bag" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "25.00" } });
    fireEvent.change(screen.getByLabelText("Stock quantity"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Choose an image file"), { target: { files: [file] } });
    expect(screen.getByRole("img", { name: "Limited bag product preview" })).toHaveAttribute("src", "blob:new-product");

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("The image provider could not save the image. No product was created; check the image and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Product name")).toHaveValue("Limited bag");

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByRole("heading", { name: "Products" })).toBeInTheDocument();
    const productCreateCalls = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith("/products") && init?.method === "POST");
    expect(productCreateCalls).toHaveLength(2);
    expect(productCreateCalls.every(([, init]) => init?.body instanceof FormData)).toBe(true);
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/image") && init?.method === "POST")).toBe(false);
    expect(await screen.findByText("Limited bag")).toBeInTheDocument();
  });

  it("edits option group and choices while preserving the configured options format", async () => {
    const fetchMock = productFetch([product({ options: { Size: ["S"] } })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.change(await screen.findByLabelText("Option group 1 name"), { target: { value: "Colour" } });
    fireEvent.change(screen.getByLabelText("Colour choice 1"), { target: { value: "Black" } });
    fireEvent.click(screen.getByRole("button", { name: "Add choice" }));
    fireEvent.change(screen.getByLabelText("Colour choice 2"), { target: { value: "White" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    expect(await screen.findByText("Product changes saved.")).toBeInTheDocument();
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({ options: { Colour: ["Black", "White"] } });
  });

  it("allows stock quantity to be edited back to zero", async () => {
    const fetchMock = productFetch([product({ stockQuantity: 5 })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.change(await screen.findByLabelText("Stock quantity"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Product changes saved.")).toBeInTheDocument();
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({ stockQuantity: 0 });
  });

  it("shows backend product validation errors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "GET") return response({ data: [] });
      if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "POST") {
        return response({ error: { code: "VALIDATION_ERROR", message: "Request validation failed" } }, 400);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");
    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "A product" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "12.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("The server rejected one or more product fields. Check the name, price, stock and options, then try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create product" })).toBeEnabled();
  });

  it("updates supported fields while preserving untouched existing options", async () => {
    const original = product();
    const fetchMock = productFetch([original]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Cotton T-shirt" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "30.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Product changes saved.")).toBeInTheDocument();
    expect(screen.getByText("GH₵ 30.00")).toBeInTheDocument();
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ name: "Cotton T-shirt", price: 3000, stockQuantity: 8 });
    expect(screen.getByText("S · M")).toBeInTheDocument();
  });

  it("clears options only when the creator chooses to clear them", async () => {
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.click(await screen.findByRole("button", { name: "Clear options" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText("Product changes saved.");
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ name: "Classic T-shirt", price: 2550, stockQuantity: 8, options: null });
  });

  it("keeps edits unsaved and stays on the form when the update fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "GET") return response({ data: [product()] });
      if (url.endsWith("/api/v1/lives/live-1/products/product-1") && init?.method === "PATCH") {
        return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Request failed" } }, 500);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");
    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Unsaved name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("We couldn't save this product. Your current product information is unchanged; please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Product name")).toHaveValue("Unsaved name");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("removes a product from its Live after confirmed deletion succeeds", async () => {
    const fetchMock = productFetch([product()], false);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products");

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this product?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete product" }));

    expect(await screen.findByText("Product deleted.")).toBeInTheDocument();
    expect(screen.queryByText("Classic T-shirt")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No products yet" })).toBeInTheDocument();
  });

  it("keeps a product visible when deletion is rejected because of order history", async () => {
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products");

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this product?" });
    expect(within(dialog).getByText(/Classic T-shirt/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete product" }));

    expect(await screen.findByText("This product has order history and can't be deleted. It is still in this Live.")).toBeInTheDocument();
    expect(screen.getByText("Classic T-shirt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true));
  });

  it("uploads a product image through multipart form data and updates the saved preview", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:preview" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    const file = new File(["image"], "shirt.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Choose an image file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload image" }));

    expect(await screen.findByText("Product image updated.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Classic T-shirt product preview" })).toHaveAttribute("src", "https://images.example/product.png");
    const uploadCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/products/product-1/image") && init?.method === "POST");
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
    expect((uploadCall?.[1]?.body as FormData).get("image")).toBe(file);
  });
});
