import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers";
import { createTestRouter } from "../../../src/app/router";

const creator = { id: "creator-1", name: "Ama Mensah" };

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function renderSettingsPage() {
  const router = createTestRouter(["/settings/payments"]);
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seller Mobile Money settings", () => {
  it("creates settings and shows an explicit save result", async () => {
    let savedInput: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/creator/mobile-money") && init?.method === "GET") return response({ data: null });
      if (url.endsWith("/api/v1/creator/mobile-money") && init?.method === "PUT") {
        savedInput = JSON.parse(String(init.body));
        return response({
          data: {
            ...savedInput as Record<string, unknown>,
            updatedAt: "2026-11-18T10:00:00.000Z",
          },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    expect(await screen.findByRole("heading", { name: "Mobile Money" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Payments" }).every(
      (link) => link.getAttribute("aria-current") === "page",
    )).toBe(true);
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "TELECEL_CASH" } });
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Ama Mensah" } });
    fireEvent.change(screen.getByLabelText("Mobile Money number"), { target: { value: "+233 24 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save payment settings" }));

    expect(await screen.findByText("Mobile Money settings saved.")).toBeInTheDocument();
    expect(savedInput).toEqual({
      provider: "TELECEL_CASH",
      accountName: "Ama Mensah",
      mobileMoneyNumber: "+233 24 123 4567",
      enabled: true,
    });
  });

  it("loads saved details and can disable Mobile Money without clearing them", async () => {
    const settings = {
      provider: "AT_MONEY",
      accountName: "Ama Mensah",
      mobileMoneyNumber: "0279876543",
      enabled: true,
      updatedAt: "2026-11-18T10:00:00.000Z",
    };
    let updateBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/creator/me")) return response({ data: creator });
      if (url.endsWith("/api/v1/creator/mobile-money") && init?.method === "GET") return response({ data: settings });
      if (url.endsWith("/api/v1/creator/mobile-money") && init?.method === "PUT") {
        updateBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return response({ data: { ...updateBody, updatedAt: "2026-11-18T11:00:00.000Z" } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    expect(await screen.findByLabelText("Account name")).toHaveValue("Ama Mensah");
    expect(screen.getByLabelText("Mobile Money number")).toHaveValue("0279876543");
    const enableInstructions = screen.getByRole("checkbox", { name: /Show Mobile Money instructions to customers/ });
    expect(enableInstructions).toBeChecked();
    fireEvent.click(enableInstructions);
    fireEvent.click(screen.getByRole("button", { name: "Save payment settings" }));

    await waitFor(() => expect(updateBody).toMatchObject({
      provider: "AT_MONEY",
      accountName: "Ama Mensah",
      mobileMoneyNumber: "0279876543",
      enabled: false,
    }));
    expect(await screen.findByText("Mobile Money settings saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Account name")).toHaveValue("Ama Mensah");
    expect(screen.getByLabelText("Mobile Money number")).toHaveValue("0279876543");
  });
});
