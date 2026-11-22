import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { createTestRouter } from "../../src/app/router";

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
  it("shows the public landing page without checking seller authentication", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/");

    expect(
      screen.getByRole("heading", {
        name: /turn your product posts into orders you can keep track of/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Instagram, TikTok, Facebook, WhatsApp or in person/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Selling moves fast. Details get left behind.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /One tote product shared separately/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Different customer chats contain/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Your link travels. Orders land here.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "A Store customers can browse" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create your online store/i }),
    ).toHaveAttribute("href", "/register");
    expect(
      screen.getAllByRole("link", { name: /sign in/i })[0],
    ).toHaveAttribute("href", "/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps registration feedback conditional for generic email responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      message: "If the details can be used, LiveOrder will email next steps.",
    }, 202)));

    renderRoute("/register");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ama" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ama@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SellerPassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Request received." })).toBeInTheDocument();
    expect(screen.queryByText(/Check your email for a verification link/i)).not.toBeInTheDocument();
    expect(screen.getByText(/If the details can be used, LiveOrder will email next steps/i)).toBeInTheDocument();
  });

  it("redirects unauthenticated sellers to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            {
              error: {
                code: "UNAUTHENTICATED",
                message: "Authentication required",
              },
            },
            401,
          ),
        ),
    );

    renderRoute("/dashboard");

    expect(
      await screen.findByRole("heading", { name: /sign in to liveorder/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: /seller navigation/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the public storefront outside seller authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: "live-1",
          name: "Friday Fashion Live",
          slug: "friday-fashion",
          status: "PUBLISHED",
          tiktokLiveUrl: null,
          products: [
            {
              id: "product-1",
              name: "Cotton Shirt",
              price: 12550,
              options: null,
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/live/friday-fashion");

    expect(
      await screen.findByRole("heading", { name: "Friday Fashion Live" }),
    ).toBeInTheDocument();
    expect(screen.getByText("GH₵ 125.50")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/public/stores/friday-fashion",
    );
  });

  it("signs in with email and password, then shows the seller's Stores", async () => {
    const live = {
      id: "live-1",
      name: "Friday Fashion Live",
      slug: "friday-fashion",
      status: "PUBLISHED",
      tiktokLiveUrl: null,
      createdAt: "2026-10-12T10:00:00.000Z",
      updatedAt: "2026-10-12T10:00:00.000Z",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/creator/me")) {
          return jsonResponse(
            {
              error: {
                code: "UNAUTHENTICATED",
                message: "Authentication required",
              },
            },
            401,
          );
        }
        if (url.includes("/creator/password/login")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            email: "ama@example.com",
            password: "SellerPassword123",
          });
          return jsonResponse({ data: { id: "creator-1", name: "Ama" } });
        }
        if (url.includes("/stores")) {
          return jsonResponse({ data: [live] });
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/login");

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ama@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "SellerPassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Welcome back, Ama" }),
    ).toBeInTheDocument();
    await screen.findByRole("region", { name: "Store summary" });
    expect(
      screen.getByRole("link", { name: "Open Friday Fashion Live workspace" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("keeps account claiming visible for sellers who still use an access code", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            {
              error: {
                code: "UNAUTHENTICATED",
                message: "Authentication required",
              },
            },
            401,
          ),
        ),
    );
    renderRoute("/login");

    expect(
      await screen.findByRole("heading", { name: /sign in to liveorder/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /claim your existing account/i }),
    ).toHaveAttribute("href", "/claim-account");
  });

  it("shows a useful not-found screen for unknown routes", async () => {
    renderRoute("/does-not-exist");

    expect(
      screen.getByRole("heading", { name: /couldn't find that page/i }),
    ).toBeInTheDocument();
  });
});
