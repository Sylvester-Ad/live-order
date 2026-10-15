import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "./providers";
import { createTestRouter } from "./router";

function renderRoute(path: string) {
  return render(
    <AppProviders>
      <RouterProvider router={createTestRouter([path])} />
    </AppProviders>,
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("application routes", () => {
  it("redirects unauthenticated sellers to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
          401,
        ),
      ),
    );

    renderRoute("/");

    expect(await screen.findByRole("heading", { name: /sign in to liveorder/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /seller navigation/i })).not.toBeInTheDocument();
  });

  it("keeps the public storefront outside seller authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: "live-1",
          name: "Friday Fashion Live",
          slug: "friday-fashion",
          status: "ACTIVE",
          products: [{ id: "product-1", name: "Cotton Shirt", price: 12550, options: null }],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/live/friday-fashion");

    expect(await screen.findByRole("heading", { name: "Friday Fashion Live" })).toBeInTheDocument();
    expect(screen.getByText("GH₵ 125.50")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/public/lives/friday-fashion");
  });

  it("signs in, restores the seller route, and shows real Lives", async () => {
    const live = {
      id: "live-1",
      name: "Friday Fashion Live",
      slug: "friday-fashion",
      status: "ACTIVE",
      createdAt: "2026-10-12T10:00:00.000Z",
      updatedAt: "2026-10-12T10:00:00.000Z",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/creator/me")) {
        return jsonResponse(
          { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
          401,
        );
      }
      if (url.includes("/creator/access")) {
        expect(JSON.parse(String(init?.body))).toEqual({ accessCode: "seller-code" });
        return jsonResponse({ data: { id: "creator-1", name: "Ama" } });
      }
      if (url.includes("/lives")) {
        return jsonResponse({ data: [live] });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/login");

    fireEvent.change(await screen.findByLabelText("Access code"), {
      target: { value: "seller-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Your selling workspace" })).toBeInTheDocument();
    expect(await screen.findByText("Friday Fashion Live")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("shows a useful not-found screen for unknown routes", async () => {
    renderRoute("/does-not-exist");

    expect(screen.getByRole("heading", { name: /couldn't find that page/i })).toBeInTheDocument();
  });
});
