import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";
import type { Product } from "../../../src/features/products/api/products-api";
import { pendingProductCreationStorageKey } from "../../../src/features/products/lib/pending-product-creation";
import { getOrCreateProductImageUploadKey } from "../../../src/features/products/lib/pending-product-image-upload";

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
    images: [],
    image: null,
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
    ...overrides,
  };
}

function productImage(id: string, url: string, isPrimary = false) {
  return { id, url, createdAt: "2026-10-12T10:00:00.000Z", isPrimary };
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

function productFetch(
  initialProducts: Product[] = [],
  rejectDelete = true,
  uploadFailures = 0,
  failFileNames: string[] = [],
  rejectImageLimit = false,
  failPrimarySelection = false,
  failImageRemoval = false,
  initialPendingUploads: Array<{ idempotencyKey: string; status: "PENDING"; canResume: true; createdAt: string | null }> = [],
  completedUploadKeys: string[] = [],
  rejectPendingUploads = false,
) {
  let products = initialProducts;
  let createdProductCount = 0;
  let uploadAttempts = 0;
  let successfulImageCount = 0;
  const failedFiles = new Set<string>();
  const createdByKey = new Map<string, { payload: string; product: Product }>();
  const pendingUploadKeys = new Set(initialPendingUploads.map((upload) => upload.idempotencyKey));
  const completedKeys = new Set(completedUploadKeys);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
    if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
    const uploadStatusPath = url.match(/\/api\/v1\/lives\/live-1\/product-image-uploads\/([^/?]+)$/);
    if (uploadStatusPath) {
      const idempotencyKey = decodeURIComponent(uploadStatusPath[1]);
      if (completedKeys.has(idempotencyKey)) {
        return response({ data: {
          idempotencyKey,
          productId: "product-1",
          status: "COMPLETED",
          canResume: false,
          image: { id: "completed-image", url: "https://images.example/completed.png", createdAt: null },
          createdAt: null,
        } });
      }
      if (pendingUploadKeys.has(idempotencyKey)) {
        return response({ data: { idempotencyKey, productId: "product-1", status: "PENDING", canResume: true, createdAt: null } });
      }
      return response({ error: { code: "UPLOAD_NOT_FOUND", message: "Missing" } }, 404);
    }
    if (/\/api\/v1\/lives\/live-1\/products\/[^/]+\/image-uploads\/pending$/.test(url)) {
      if (rejectPendingUploads) {
        return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Pending uploads unavailable" } }, 500);
      }
      return response({ data: [...pendingUploadKeys].map((idempotencyKey) => ({
        idempotencyKey, status: "PENDING" as const, canResume: true as const, createdAt: null,
      })) });
    }
    if (url.endsWith("/api/v1/lives/live-1/products") && (!init?.method || init.method === "GET")) {
      return response({ data: products });
    }
    if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "POST") {
      if (init.body instanceof FormData) {
        return response({ error: { code: "UNSUPPORTED_PRODUCT_MEDIA_TYPE", message: "JSON only" } }, 415);
      }
      const idempotencyKey = new Headers(init.headers).get("Idempotency-Key");
      if (!idempotencyKey) return response({ error: { code: "VALIDATION_ERROR", message: "Missing key" } }, 400);
      const payload = String(init.body);
      const previous = createdByKey.get(idempotencyKey);
      if (previous) {
        if (previous.payload !== payload) {
          return response({ error: { code: "IDEMPOTENCY_KEY_REUSED", message: "Key reused" } }, 409);
        }
        return response({ data: previous.product }, 201);
      }
      const body = JSON.parse(payload) as { name: string; price: number; stockQuantity: number; options?: unknown };
      const created = product({
        id: `product-new-${++createdProductCount}`,
        ...body,
        options: body.options ?? null,
        image: null,
      });
      createdByKey.set(idempotencyKey, { payload, product: created });
      products = [...products, created];
      return response({ data: created }, 201);
    }
    const imagePath = url.match(/\/api\/v1\/lives\/live-1\/products\/([^/]+)\/images$/);
    if (imagePath && init?.method === "POST") {
      const productId = imagePath[1];
      const current = products.find((item) => item.id === productId);
      if (!current) return response({ error: { code: "PRODUCT_NOT_FOUND", message: "Missing" } }, 404);
      uploadAttempts += 1;
      const body = init.body;
      const file = body instanceof FormData ? body.get("image") : null;
      if (!(file instanceof File)) return response({ error: { code: "IMAGE_REQUIRED", message: "Missing" } }, 400);
      const idempotencyKey = new Headers(init.headers).get("Idempotency-Key");
      if (rejectImageLimit || current.images.length >= 3) {
        return response({ error: { code: "PRODUCT_IMAGE_LIMIT_REACHED", message: "Limit reached" } }, 409);
      }
      if (
        uploadAttempts <= uploadFailures ||
        (failFileNames.includes(file.name) && !failedFiles.has(file.name))
      ) {
        failedFiles.add(file.name);
        if (idempotencyKey) pendingUploadKeys.add(idempotencyKey);
        return response({ error: { code: "IMAGE_STORAGE_FAILED", message: "Provider unavailable" } }, 502);
      }
      if (idempotencyKey) {
        pendingUploadKeys.delete(idempotencyKey);
        completedKeys.add(idempotencyKey);
      }
      const image = {
        id: `uploaded-image-${++successfulImageCount}`,
        url: `https://images.example/${file.name}`,
        createdAt: "2026-10-12T10:00:00.000Z",
      };
      const updated = product({
        ...current,
        images: [...current.images, { ...image, isPrimary: current.images.length === 0 }],
        image: current.image ?? image,
      });
      products = products.map((item) => item.id === updated.id ? updated : item);
      return response({ data: { product: updated, image } }, 201);
    }
    if (url.endsWith("/api/v1/lives/live-1/products/product-1") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Partial<Product>;
      const updated = { ...products[0], ...body } as Product;
      products = products.map((item) => item.id === updated.id ? updated : item);
      return response({ data: updated });
    }
    const primaryImagePath = url.match(/\/api\/v1\/lives\/live-1\/products\/([^/]+)\/images\/([^/]+)\/primary$/);
    if (primaryImagePath && init?.method === "PATCH") {
      if (failPrimarySelection) {
        return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Selection failed" } }, 500);
      }
      const current = products.find((item) => item.id === primaryImagePath[1]);
      if (!current) return response({ error: { code: "PRODUCT_NOT_FOUND", message: "Missing" } }, 404);
      const primary = current.images.find((image) => image.id === primaryImagePath[2]);
      const updated = product({
        ...current,
        images: current.images.map((image) => ({ ...image, isPrimary: image.id === primaryImagePath[2] })),
        image: primary ? { id: primary.id, url: primary.url, createdAt: primary.createdAt } : null,
      });
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
    const imageRemovalPath = url.match(/\/api\/v1\/lives\/live-1\/products\/([^/]+)\/images\/([^/]+)$/);
    if (imageRemovalPath && init?.method === "DELETE") {
      if (failImageRemoval) {
        return response({ error: { code: "INTERNAL_SERVER_ERROR", message: "Removal failed" } }, 500);
      }
      const current = products.find((item) => item.id === imageRemovalPath[1]);
      if (!current) return response({ error: { code: "PRODUCT_NOT_FOUND", message: "Missing" } }, 404);
      const remainingImages = current.images.filter((image) => image.id !== imageRemovalPath[2]);
      const removedPrimary = current.images.some((image) => image.id === imageRemovalPath[2] && image.isPrimary);
      const updated = product({
        ...current,
        images: remainingImages.map((image, index) => ({
          ...image,
          isPrimary: removedPrimary ? index === 0 : image.isPrimary,
        })),
        image: remainingImages.find((image) => image.isPrimary) ?? (removedPrimary ? remainingImages[0] ?? null : current.image),
      });
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
  sessionStorage.clear();
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
    expect(screen.getByText("No image")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/lives/live-1/products"))).toBe(true);
  });

  it("shows a product's only gallery image on its card", async () => {
    const fetchMock = productFetch([product({
      images: [productImage("image-1", "https://images.example/only.png", true)],
    })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products");

    expect(await screen.findByRole("img", { name: "Classic T-shirt" })).toHaveAttribute(
      "src",
      "https://images.example/only.png",
    );
    expect(screen.queryByText("No product image")).not.toBeInTheDocument();
  });

  it("uses the explicitly primary image for a product card thumbnail", async () => {
    const fetchMock = productFetch([product({
      images: [
        productImage("image-1", "https://images.example/first.png"),
        productImage("image-2", "https://images.example/primary.png", true),
      ],
    })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products");

    expect(await screen.findByRole("img", { name: "Classic T-shirt" })).toHaveAttribute(
      "src",
      "https://images.example/primary.png",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Add another choice" }));
    fireEvent.change(screen.getByLabelText("Size choice 2"), { target: { value: "M" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("Product created.")).toBeInTheDocument();
    expect(screen.getByText("Cotton shirt")).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall?.[1]?.body).not.toBeInstanceOf(FormData);
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      name: "Cotton shirt",
      price: 2550,
      stockQuantity: 12,
      options: { Size: ["S", "M"] },
    });
    expect(new Headers(createCall?.[1]?.headers).get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(screen.queryByLabelText("Choose an image file")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/image") && init?.method === "POST")).toBe(false);
    expect(screen.getByText("Cotton shirt")).toBeInTheDocument();
    expect(sessionStorage.getItem(pendingProductCreationStorageKey("creator-1", "live-1"))).toBeNull();
  });

  it("recovers the same product request and key after a timeout and refresh", async () => {
    let committedProduct: Product | null = null;
    let createAttempts = 0;
    const createKeys: string[] = [];
    const createBodies: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products") && (!init?.method || init.method === "GET")) {
        return response({ data: committedProduct ? [committedProduct] : [] });
      }
      if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "POST") {
        createAttempts += 1;
        const key = new Headers(init.headers).get("Idempotency-Key");
        createKeys.push(key ?? "");
        createBodies.push(String(init.body));
        if (!committedProduct) {
          const body = JSON.parse(String(init.body)) as { name: string; price: number; stockQuantity: number };
          committedProduct = product({
            id: "product-after-lost-response",
            ...body,
            options: null,
            image: null,
          });
        }
        if (createAttempts === 1) throw new DOMException("Request timed out", "AbortError");
        return response({ data: committedProduct }, 201);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    const queryClient = createTestQueryClient();
    vi.stubGlobal("fetch", fetchMock);
    const firstRender = renderPath("/lives/live-1/products/new", queryClient);

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "  Saved shirt  " } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "19.50" } });
    fireEvent.change(screen.getByLabelText("Stock quantity"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText(/We couldn't confirm whether the product was saved/)).toBeInTheDocument();
    expect(screen.getByText("An unfinished product creation was found.")).toBeInTheDocument();
    const savedAttempt = JSON.parse(sessionStorage.getItem(pendingProductCreationStorageKey("creator-1", "live-1")) ?? "null") as {
      idempotencyKey: string;
      input: { name: string; price: number; stockQuantity: number };
    };
    expect(savedAttempt.input).toEqual({ name: "Saved shirt", price: 1950, stockQuantity: 7 });

    firstRender.unmount();
    renderPath("/lives/live-1/products/new", queryClient);

    expect(await screen.findByLabelText("Product name")).toHaveValue("Saved shirt");
    expect(screen.getByLabelText("Product name")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry saved creation" }));

    expect(await screen.findByText("Product created.")).toBeInTheDocument();
    expect(createKeys).toEqual([savedAttempt.idempotencyKey, savedAttempt.idempotencyKey]);
    expect(createBodies).toEqual([
      JSON.stringify(savedAttempt.input),
      JSON.stringify(savedAttempt.input),
    ]);
    expect(sessionStorage.getItem(pendingProductCreationStorageKey("creator-1", "live-1"))).toBeNull();
    queryClient.clear();
  });

  it("keeps the same attempt after an HTTP request timeout", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "POST") {
        return response({ error: { code: "REQUEST_TIMEOUT", message: "Request timed out" } }, 408);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Saved shirt" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "19.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText(/We couldn't confirm whether the product was saved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry saved creation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard rejected attempt and edit" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(pendingProductCreationStorageKey("creator-1", "live-1"))).not.toBeNull();
  });

  it("explains a deleted creation result and starts a fresh attempt with a new key", async () => {
    const creationKeys: string[] = [];
    const creationBodies: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/lives")) return response({ data: [live] });
      if (url.endsWith("/api/v1/lives/live-1/products") && (!init?.method || init.method === "GET")) {
        return response({ data: [] });
      }
      if (url.endsWith("/api/v1/lives/live-1/products") && init?.method === "POST") {
        creationKeys.push(new Headers(init.headers).get("Idempotency-Key") ?? "");
        creationBodies.push(String(init.body));
        if (creationKeys.length === 1) {
          return response({
            error: {
              code: "IDEMPOTENCY_RESULT_DELETED",
              message: "The product created by this request has since been deleted",
            },
          }, 410);
        }

        const input = JSON.parse(String(init.body)) as { name: string; price: number; stockQuantity: number };
        return response({ data: product({ id: "new-product", ...input, options: null }) }, 201);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Deleted shirt" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "19.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("This product was created successfully but has since been deleted.")).toBeInTheDocument();
    expect(screen.getByText(/This saved request cannot recreate it/)).toBeInTheDocument();
    expect(screen.queryByText("An unfinished product creation was found.")).not.toBeInTheDocument();
    expect(screen.queryByText(/no product was created/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard rejected attempt and edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creation result deleted" })).toBeDisabled();
    const deletedAttempt = JSON.parse(sessionStorage.getItem(pendingProductCreationStorageKey("creator-1", "live-1")) ?? "null") as {
      idempotencyKey: string;
      input: { name: string; price: number; stockQuantity: number };
    };
    expect(creationKeys).toEqual([deletedAttempt.idempotencyKey]);

    fireEvent.click(screen.getByRole("button", { name: "Start a new product" }));

    expect(sessionStorage.getItem(pendingProductCreationStorageKey("creator-1", "live-1"))).toBeNull();
    expect(screen.getByLabelText("Product name")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create product" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Replacement shirt" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "25.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("Product created.")).toBeInTheDocument();
    expect(creationKeys).toHaveLength(2);
    expect(creationKeys[1]).not.toBe(deletedAttempt.idempotencyKey);
    expect(creationBodies.map((body) => JSON.parse(body))).toEqual([
      deletedAttempt.input,
      { name: "Replacement shirt", price: 2500, stockQuantity: 0 },
    ]);
  });

  it("uses a new idempotency key for a genuinely new product", async () => {
    const fetchMock = productFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "First product" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "10.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Product created.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Add another product" }));
    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Second product" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "11.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Product created.")).toBeInTheDocument();

    const createCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST" && init.body !== undefined);
    const keys = createCalls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
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

  it("edits option group and choices while preserving the configured options format", async () => {
    const fetchMock = productFetch([product({ options: { Size: ["S"] } })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.change(await screen.findByLabelText("Option group 1 name"), { target: { value: "Colour" } });
    fireEvent.change(screen.getByLabelText("Colour choice 1"), { target: { value: "Black" } });
    fireEvent.click(screen.getByRole("button", { name: "Add another choice" }));
    fireEvent.change(screen.getByLabelText("Colour choice 2"), { target: { value: "White" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    expect(await screen.findByText("Product changes saved.")).toBeInTheDocument();
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({ options: { Colour: ["Black", "White"] } });
  });

  it("previews, edits, and removes choices in a large option group", async () => {
    const fetchMock = productFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    fireEvent.click(await screen.findByRole("button", { name: "Add option group" }));
    fireEvent.change(screen.getByLabelText("Option group 1 name"), { target: { value: "Colour" } });
    const choices = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Orange", "Purple", "Brown"];
    fireEvent.change(screen.getByLabelText("Colour choice 1"), { target: { value: choices[0] } });
    for (const [index, choice] of choices.slice(1).entries()) {
      fireEvent.click(screen.getByRole("button", { name: "Add another choice" }));
      fireEvent.change(screen.getByLabelText(`Colour choice ${index + 2}`), { target: { value: choice } });
    }

    const preview = screen.getByRole("region", { name: "Customer option preview" });
    expect(within(preview).getByText(choices.join(" · "))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Colour choice 4"), { target: { value: "Navy" } });
    expect(within(preview).getByText("Black · White · Red · Navy · Green · Yellow · Pink · Orange · Purple · Brown")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove choice 10 from Colour" }));
    expect(screen.queryByLabelText("Colour choice 10")).not.toBeInTheDocument();
    expect(within(preview).queryByText(choices.join(" · "))).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Cotton shirt" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "25.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("Product created.")).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      options: { Colour: ["Black", "White", "Red", "Navy", "Green", "Yellow", "Pink", "Orange", "Purple"] },
    });
  });

  it("explains duplicate variation choices before submitting", async () => {
    const fetchMock = productFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/new");

    fireEvent.change(await screen.findByLabelText("Product name"), { target: { value: "Cotton shirt" } });
    fireEvent.change(screen.getByLabelText("Price (GHS)"), { target: { value: "25.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option group" }));
    fireEvent.change(screen.getByLabelText("Option group 1 name"), { target: { value: "Colour" } });
    fireEvent.change(screen.getByLabelText("Colour choice 1"), { target: { value: "Black" } });
    fireEvent.click(screen.getByRole("button", { name: "Add another choice" }));
    fireEvent.change(screen.getByLabelText("Colour choice 2"), { target: { value: "black" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("Choices in Colour must be unique.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
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

    expect(await screen.findByText("The server rejected this request before creating a product. You may discard this saved attempt deliberately, then correct the details and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard rejected attempt and edit" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retry saved creation" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Discard rejected attempt and edit" }));
    expect(screen.getByLabelText("Product name")).toBeEnabled();
    expect(sessionStorage.getItem(pendingProductCreationStorageKey("creator-1", "live-1"))).toBeNull();
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

  it("shows an empty state for a product with no gallery images", async () => {
    vi.stubGlobal("fetch", productFetch([product()]));
    renderPath("/lives/live-1/products/product-1/edit");

    expect(await screen.findByRole("heading", { name: "Product image gallery" })).toBeInTheDocument();
    expect(screen.getByText("No product images yet.")).toBeInTheDocument();
  });

  it("shows a single product image and marks it as primary in the editor gallery", async () => {
    vi.stubGlobal("fetch", productFetch([product({
      images: [productImage("image-1", "https://images.example/only.png", true)],
    })]));
    renderPath("/lives/live-1/products/product-1/edit");

    expect(await screen.findByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/only.png",
    );
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("shows every image in a multi-image editor gallery and identifies the primary", async () => {
    vi.stubGlobal("fetch", productFetch([product({
      images: [
        productImage("image-1", "https://images.example/first.png"),
        productImage("image-2", "https://images.example/primary.png", true),
        productImage("image-3", "https://images.example/third.png"),
      ],
    })]));
    renderPath("/lives/live-1/products/product-1/edit");

    expect(await screen.findByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/first.png",
    );
    expect(screen.getByRole("img", { name: "Classic T-shirt image 2" })).toHaveAttribute(
      "src",
      "https://images.example/primary.png",
    );
    expect(screen.getByRole("img", { name: "Classic T-shirt image 3" })).toHaveAttribute(
      "src",
      "https://images.example/third.png",
    );
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("selects another uploaded image as primary and reflects the server response", async () => {
    const fetchMock = productFetch([product({
      images: [
        productImage("image-1", "https://images.example/first.png", true),
        productImage("image-2", "https://images.example/second.png"),
      ],
    })]);
    vi.stubGlobal("fetch", fetchMock);
    const router = createTestRouter(["/lives/live-1/products/product-1/edit"]);
    render(<AppProviders><RouterProvider router={router} /></AppProviders>);

    expect(await screen.findAllByText("Primary")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Make primary" }));

    await waitFor(() => expect(screen.getAllByText("Primary")).toHaveLength(1));
    expect(screen.getByRole("img", { name: "Classic T-shirt image 2" })).toHaveAttribute(
      "src",
      "https://images.example/second.png",
    );
    expect(screen.getByRole("button", { name: "Make primary" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/products/product-1/images/image-2/primary") && init?.method === "PATCH",
    )).toBe(true);
    await act(async () => { await router.navigate("/lives/live-1/products"); });
    expect(await screen.findByRole("img", { name: "Classic T-shirt" })).toHaveAttribute(
      "src",
      "https://images.example/second.png",
    );
  });

  it("does not imply a failed primary selection succeeded", async () => {
    const fetchMock = productFetch(
      [product({
        images: [
          productImage("image-1", "https://images.example/first.png", true),
          productImage("image-2", "https://images.example/second.png"),
        ],
      })],
      true,
      0,
      [],
      false,
      true,
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.click(await screen.findByRole("button", { name: "Make primary" }));

    expect(await screen.findByText("We couldn't make this image primary. The current primary image has not changed.")).toBeInTheDocument();
    expect(screen.getAllByText("Primary")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/first.png",
    );
  });

  it("confirms removal of one image and preserves the other gallery images", async () => {
    const fetchMock = productFetch([product({
      images: [
        productImage("image-1", "https://images.example/primary.png", true),
        productImage("image-2", "https://images.example/other.png"),
      ],
    })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.click(await screen.findAllByRole("button", { name: "Remove image" }).then((buttons) => buttons[1]!));
    const dialog = screen.getByRole("alertdialog", { name: "Remove this image?" });
    expect(within(dialog).getByText(/Classic T-shirt image 2/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove image" }));

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
        "src",
        "https://images.example/primary.png",
      );
      expect(screen.queryByRole("img", { name: "Classic T-shirt image 2" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/products/product-1/images/image-2") && init?.method === "DELETE",
    )).toBe(true);
  });

  it("reflects backend primary promotion after removing the primary image", async () => {
    const fetchMock = productFetch([product({
      images: [
        productImage("image-1", "https://images.example/primary.png", true),
        productImage("image-2", "https://images.example/remaining.png"),
      ],
    })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.click((await screen.findAllByRole("button", { name: "Remove image" }))[0]!);
    const dialog = screen.getByRole("alertdialog", { name: "Remove this image?" });
    expect(within(dialog).getByText(/Classic T-shirt image 1/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove image" }));

    await waitFor(() => expect(screen.getByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/remaining.png",
    ));
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("leaves the product gallery empty after removing its last image", async () => {
    const fetchMock = productFetch([product({
      images: [productImage("image-1", "https://images.example/only.png", true)],
    })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.click(await screen.findByRole("button", { name: "Remove image" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Remove this image?" }))
      .getByRole("button", { name: "Remove image" }));

    expect(await screen.findByText("No product images yet.")).toBeInTheDocument();
    expect(screen.queryByText("Primary")).not.toBeInTheDocument();
  });

  it("keeps an image in the gallery when its removal request fails", async () => {
    const fetchMock = productFetch([product({
      images: [productImage("image-1", "https://images.example/primary.png", true)],
    })], true, 0, [], false, false, true);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.click(await screen.findByRole("button", { name: "Remove image" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Remove this image?" }))
      .getByRole("button", { name: "Remove image" }));

    expect(await screen.findByText("We couldn't remove this image. It remains in the gallery; please try again.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/primary.png",
    );
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

    expect(await screen.findByText("We couldn't save this product. Your current changes are still here; please try again.")).toBeInTheDocument();
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

  it("uploads a product image with an idempotency key and updates the gallery", async () => {
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    const file = new File(["image"], "shirt.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), { target: { files: [file] } });
    expect(await screen.findByText("shirt.png")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (1)" }));

    expect(await screen.findByText("Product image updated.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute("src", "https://images.example/shirt.png");
    const uploadCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/products/product-1/images") && init?.method === "POST");
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
    expect((uploadCall?.[1]?.body as FormData).get("image")).toBe(file);
    expect(new Headers(uploadCall?.[1]?.headers).get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(screen.getByRole("img", { name: "Classic T-shirt image 1" }))
      .toHaveAttribute("src", "https://images.example/shirt.png");
  });

  it("discovers multiple pending uploads and retries only the exact matching file with its original key", async () => {
    const originalFile = new File(["original bytes"], "shirt.png", { type: "image/png" });
    const originalKey = await getOrCreateProductImageUploadKey("creator-1", "live-1", "product-1", originalFile);
    const otherKey = globalThis.crypto.randomUUID();
    const pending = [originalKey, otherKey].map((idempotencyKey) => ({
      idempotencyKey,
      status: "PENDING" as const,
      canResume: true as const,
      createdAt: null,
    }));
    const fetchMock = productFetch([product()], true, 0, [], false, false, false, pending);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    const pendingList = await screen.findByRole("list", { name: "Unfinished image uploads" });
    expect(within(pendingList).getByText("Upload unfinished — choose the original file to retry.")).toBeInTheDocument();
    expect(within(pendingList).getByText("Upload unfinished — the original retry details are unavailable in this tab.")).toBeInTheDocument();
    expect(await screen.findByText("1 of 3 image slots available")).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: { files: [new File(["original bytes"], "shirt-copy.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Original file matched; ready to retry")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Retry pending upload" }));

    expect(await screen.findByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/shirt-copy.png",
    );
    const uploadCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    );
    expect(uploadCalls).toHaveLength(1);
    expect(new Headers(uploadCalls[0]?.[1]?.headers).get("Idempotency-Key")).toBe(originalKey);
    expect((uploadCalls[0]?.[1]?.body as FormData).get("image")).toMatchObject({ name: "shirt-copy.png" });
  });

  it("does not reuse a pending key when the selected file does not match", async () => {
    const originalFile = new File(["original bytes"], "shirt.png", { type: "image/png" });
    const pendingKey = await getOrCreateProductImageUploadKey("creator-1", "live-1", "product-1", originalFile);
    const pending = [{
      idempotencyKey: pendingKey,
      status: "PENDING" as const,
      canResume: true as const,
      createdAt: null,
    }];
    const fetchMock = productFetch([product()], true, 0, [], false, false, false, pending);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: { files: [new File(["different bytes"], "new-photo.png", { type: "image/png" })] },
    });
    expect(await screen.findByText(/doesn't match a saved unfinished upload/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (1)" }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(([input, init]) =>
        String(input).endsWith("/products/product-1/images") && init?.method === "POST",
      );
      expect(uploadCall).toBeDefined();
      expect(new Headers(uploadCall?.[1]?.headers).get("Idempotency-Key")).not.toBe(pendingKey);
    });
  });

  it("preserves the original attempt after a recovered upload fails", async () => {
    const file = new File(["original bytes"], "shirt.png", { type: "image/png" });
    const key = await getOrCreateProductImageUploadKey("creator-1", "live-1", "product-1", file);
    const pending = [{
      idempotencyKey: key,
      status: "PENDING" as const,
      canResume: true as const,
      createdAt: null,
    }];
    const fetchMock = productFetch([product()], true, 1, [], false, false, false, pending);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");
    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: { files: [file] },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Retry pending upload" }));

    expect(await screen.findByText("The image provider could not save this file. Check the image and retry later.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Retry pending upload" })).toBeInTheDocument();
    expect(sessionStorage.getItem("liveorder:pending-product-image-uploads:creator-1:live-1:product-1"))
      .toContain(key);
    expect(fetchMock.mock.calls.filter(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    )).toHaveLength(1);
  });

  it("reconciles an already completed upload without submitting it again", async () => {
    const file = new File(["original bytes"], "shirt.png", { type: "image/png" });
    const key = await getOrCreateProductImageUploadKey("creator-1", "live-1", "product-1", file);
    const fetchMock = productFetch(
      [product({ images: [productImage("completed-image", "https://images.example/completed.png", true)] })],
      true,
      0,
      [],
      false,
      false,
      false,
      [],
      [key],
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    expect(await screen.findByText("An upload completed before the page refreshed. The product gallery has been updated.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/completed.png",
    );
    expect(sessionStorage.getItem("liveorder:pending-product-image-uploads:creator-1:live-1:product-1")).toBeNull();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    )).toBe(false);
  });

  it("keeps the editor usable and explains when pending uploads cannot be checked", async () => {
    const fetchMock = productFetch([product()], true, 0, [], false, false, false, [], [], true);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit", createTestQueryClient());

    expect(await screen.findByText("Unfinished uploads could not be checked. Refresh this page or try again before starting another upload.")).toBeInTheDocument();
    expect(screen.getByLabelText("Product name")).toHaveValue("Classic T-shirt");
    expect(screen.getByLabelText("Choose images for Classic T-shirt")).toBeDisabled();
  });

  it("uploads multiple selected images independently with different idempotency keys", async () => {
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");
    const files = [
      new File(["first image"], "first.png", { type: "image/png" }),
      new File(["second image"], "second.png", { type: "image/png" }),
    ];

    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), { target: { files } });
    expect(await screen.findByText("first.png")).toBeInTheDocument();
    expect(await screen.findByText("second.png")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (2)" }));

    expect(await screen.findByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/first.png",
    );
    expect(await screen.findByRole("img", { name: "Classic T-shirt image 2" })).toHaveAttribute(
      "src",
      "https://images.example/second.png",
    );
    const imageCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    );
    expect(imageCalls).toHaveLength(2);
    expect(new Headers(imageCalls[0]?.[1]?.headers).get("Idempotency-Key"))
      .not.toBe(new Headers(imageCalls[1]?.[1]?.headers).get("Idempotency-Key"));
  });

  it("enforces the three-image limit including existing images", async () => {
    const fetchMock = productFetch([product({
      images: [
        productImage("existing-1", "https://images.example/existing-1.png", true),
        productImage("existing-2", "https://images.example/existing-2.png"),
      ],
    })]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");

    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: {
        files: [
          new File(["third image"], "third.png", { type: "image/png" }),
          new File(["extra image"], "extra.png", { type: "image/png" }),
        ],
      },
    });

    expect(await screen.findByText("Only 1 image slot available. The remaining selected images were not added.")).toBeInTheDocument();
    expect(await screen.findByText("third.png")).toBeInTheDocument();
    expect(screen.queryByText("extra.png")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (1)" }));

    expect(await screen.findByRole("img", { name: "Classic T-shirt image 3" })).toHaveAttribute(
      "src",
      "https://images.example/third.png",
    );
    expect(screen.getByText("This product has reached the three-image limit.")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose images for Classic T-shirt")).toBeDisabled();
  });

  it("does not submit the same selected upload twice while it is in progress", async () => {
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");
    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: { files: [new File(["image"], "photo.png", { type: "image/png" })] },
    });
    const uploadButton = await screen.findByRole("button", { name: "Upload selected images (1)" });

    fireEvent.click(uploadButton);
    fireEvent.click(uploadButton);

    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input, init]) =>
        String(input).endsWith("/products/product-1/images") && init?.method === "POST",
      )).toHaveLength(1);
    });
  });

  it("validates every selected file before allowing an upload", async () => {
    const fetchMock = productFetch([product()]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");
    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: {
        files: [
          new File(["not an image"], "notes.txt", { type: "text/plain" }),
          new File(["x".repeat(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
        ],
      },
    });

    expect(await screen.findByText("Choose a JPEG, PNG, or WebP image.")).toBeInTheDocument();
    expect(screen.getByText("Product images must be 5 MB or smaller.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload selected images/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    )).toBe(false);
  });

  it("keeps successful uploads and retries only the failed file with its original key", async () => {
    const fetchMock = productFetch([product()], true, 0, ["bad.png"]);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");
    const goodFile = new File(["good image"], "good.png", { type: "image/png" });
    const badFile = new File(["bad image"], "bad.png", { type: "image/png" });

    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: { files: [goodFile, badFile] },
    });
    expect(await screen.findByText("good.png")).toBeInTheDocument();
    expect(await screen.findByText("bad.png")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (2)" }));

    expect(await screen.findByText("The image provider could not save this file. Check the image and retry later.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Classic T-shirt image 1" })).toHaveAttribute(
      "src",
      "https://images.example/good.png",
    );
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    const firstCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    );
    expect(firstCalls).toHaveLength(2);
    const badFirstCall = firstCalls.find(([, init]) => (init?.body as FormData).get("image") === badFile);
    const badOriginalKey = new Headers(badFirstCall?.[1]?.headers).get("Idempotency-Key");

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => {
      const currentCalls = fetchMock.mock.calls.filter(([input, init]) =>
        String(input).endsWith("/products/product-1/images") && init?.method === "POST",
      );
      expect(currentCalls).toHaveLength(3);
    });
    const imageCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    );
    const retryCall = imageCalls[2];
    expect((retryCall?.[1]?.body as FormData).get("image")).toBe(badFile);
    expect(new Headers(retryCall?.[1]?.headers).get("Idempotency-Key")).toBe(badOriginalKey);
    expect(imageCalls.filter(([, init]) => (init?.body as FormData).get("image") === goodFile)).toHaveLength(1);
    expect(imageCalls.filter(([, init]) => (init?.body as FormData).get("image") === badFile)).toHaveLength(2);
  });

  it("shows a clear recovery message when the backend reports the image limit", async () => {
    const fetchMock = productFetch([product()], true, 0, [], true);
    vi.stubGlobal("fetch", fetchMock);
    renderPath("/lives/live-1/products/product-1/edit");
    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), {
      target: { files: [new File(["image"], "photo.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("photo.png")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (1)" }));

    expect(await screen.findByText("The server reports that this product has reached the three-image limit. The gallery will refresh.")).toBeInTheDocument();
    expect(screen.getByText("This product has reached the three-image limit. Remove an image before adding another.")).toBeInTheDocument();
  });

  it("reuses the upload key after a timeout and page refresh when the original file is reselected", async () => {
    const firstFetch = productFetch([product()], true, 1);
    vi.stubGlobal("fetch", firstFetch);
    const firstRender = renderPath("/lives/live-1/products/product-1/edit");
    const file = new File(["same original bytes"], "shirt.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), { target: { files: [file] } });
    await screen.findByText("shirt.png");
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (1)" }));
    await screen.findByText("The image provider could not save this file. Check the image and retry later.");

    const firstUpload = firstFetch.mock.calls.find(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    );
    const firstKey = new Headers(firstUpload?.[1]?.headers).get("Idempotency-Key");
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    firstRender.unmount();

    const secondFetch = productFetch([product()]);
    vi.stubGlobal("fetch", secondFetch);
    renderPath("/lives/live-1/products/product-1/edit");
    const reselectedFile = new File(["same original bytes"], "shirt.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Choose images for Classic T-shirt"), { target: { files: [reselectedFile] } });
    await screen.findByText("shirt.png");
    fireEvent.click(await screen.findByRole("button", { name: "Upload selected images (1)" }));

    expect(await screen.findByText("Product image updated.")).toBeInTheDocument();
    const retryUpload = secondFetch.mock.calls.find(([input, init]) =>
      String(input).endsWith("/products/product-1/images") && init?.method === "POST",
    );
    expect(new Headers(retryUpload?.[1]?.headers).get("Idempotency-Key")).toBe(firstKey);
  });
});
