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
  it("keeps the login form working without the implementation-detail footer", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/creator/me")) {
        return response({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401);
      }
      if (url.includes("/creator/access") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ accessCode: "seller-access-code" });
        return response({ data: { id: "creator-1", name: "Ama" } });
      }
      if (url.endsWith("/v1/lives")) return response({ data: [] });
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
    fireEvent.change(screen.getByLabelText("Access code"), {
      target: { value: "seller-access-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Welcome back, Ama" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
