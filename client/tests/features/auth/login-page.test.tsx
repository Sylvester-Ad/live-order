import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("login page", () => {
  it("authenticates with email and password and keeps account claiming visible", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) {
        return response({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401);
      }
      if (url.includes("/creator/password/login") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ email: "seller@example.com", password: "SellerPassword123" });
        return response({ data: { id: "creator-1", name: "Ama" } });
      }
      if (url.endsWith("/v1/stores")) return response({ data: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppProviders>
        <RouterProvider router={createTestRouter(["/login"])} />
      </AppProviders>,
    );

    expect(screen.queryByText("Your session stays on this device using a secure, HTTP-only cookie."))
      .not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /claim your existing account/i })).toHaveAttribute("href", "/claim-account");
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "seller@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "SellerPassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Welcome back, Ama" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
