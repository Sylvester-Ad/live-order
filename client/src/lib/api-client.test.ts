import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, TransportError, api, apiRequest } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("central API client", () => {
  it("uses the API base path, unwraps success data, and includes cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { result: "ok" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ result: string }>("/v1/lives", {
      params: { page: 2, search: "Friday Sale" },
    });

    expect(result).toEqual({ result: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/api/v1/lives",
        search: "?page=2&search=Friday+Sale",
      }),
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("preserves backend validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed",
              details: { field: "accessCode" },
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(api.post("/v1/creator/access", {})).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: { field: "accessCode" },
    } satisfies Partial<ApiError>);
  });

  it("handles no-content responses and text downloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('"Order ID"\r\n"order-1"\r\n', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.post<void>("/v1/creator/logout")).resolves.toBeUndefined();
    await expect(
      apiRequest<string>("/v1/lives/live-1/orders/export", { responseType: "text" }),
    ).resolves.toContain("Order ID");
  });

  it("distinguishes network failures from backend errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(api.get("/v1/lives")).rejects.toBeInstanceOf(TransportError);
  });
});
