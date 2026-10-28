import type { components } from "../types/openapi.generated";

export type ApiErrorBody = components["schemas"]["ErrorResponse"];

export type ApiRequestOptions = Omit<RequestInit, "body" | "signal"> & {
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  responseType?: "json" | "text" | "blob" | "arraybuffer";
  params?: Record<string, string | number | boolean | undefined>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class TransportError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TransportError";
    this.cause = cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getApiUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
) {
  const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim() || "/api";
  const base = new URL(
    configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`,
    window.location.origin,
  );
  const relativePath = path.replace(/^\/+/, "");
  const url = new URL(relativePath, base);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    typeof body === "string"
  ) {
    return body;
  }

  return JSON.stringify(body);
}

function isJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

function apiErrorFromPayload(status: number, payload: unknown): ApiError {
  if (isRecord(payload) && isRecord(payload.error)) {
    const error = payload.error;
    return new ApiError(
      status,
      typeof error.code === "string" ? error.code : "HTTP_ERROR",
      typeof error.message === "string" ? error.message : "Request failed",
      error.details,
    );
  }

  return new ApiError(status, "HTTP_ERROR", `Request failed with status ${status}`, payload);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw apiErrorFromPayload(response.status, payload);
  }

  if (isRecord(payload) && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

async function parseResponse<T>(response: Response, responseType: NonNullable<ApiRequestOptions["responseType"]>): Promise<T> {
  if (!response.ok) {
    if (responseType === "json" && isJsonResponse(response)) {
      return parseJsonResponse<T>(response);
    }

    const details = responseType === "blob"
      ? await response.blob()
      : responseType === "arraybuffer"
        ? await response.arrayBuffer()
        : await response.text();

    throw apiErrorFromPayload(response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (responseType === "blob") {
    return (await response.blob()) as T;
  }

  if (responseType === "arraybuffer") {
    return (await response.arrayBuffer()) as T;
  }

  if (responseType === "text" || !isJsonResponse(response)) {
    return (await response.text()) as T;
  }

  return parseJsonResponse<T>(response);
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    body,
    params,
    signal,
    timeoutMs = 15_000,
    responseType = "json",
    headers,
    method = "GET",
    ...requestInit
  } = options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortListener = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abortListener, { once: true });
  }

  try {
    const requestHeaders = new Headers(headers);
    const requestBody = serializeBody(body);

    if (
      requestBody !== undefined &&
      !(requestBody instanceof FormData) &&
      !requestHeaders.has("Content-Type")
    ) {
      requestHeaders.set("Content-Type", "application/json");
    }

    const response = await fetch(getApiUrl(path, params), {
      ...requestInit,
      method,
      body: requestBody,
      credentials: requestInit.credentials ?? "include",
      headers: requestHeaders,
      signal: controller.signal,
    });

    return await parseResponse<T>(response, responseType);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TransportError("Request was aborted or timed out", error);
    }

    throw new TransportError("Network request failed", error);
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortListener);
  }
}

export const api = {
  get<T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiRequest<T>(path, { ...options, method: "GET" });
  },
  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiRequest<T>(path, { ...options, method: "POST", body });
  },
  patch<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiRequest<T>(path, { ...options, method: "PATCH", body });
  },
  delete<T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiRequest<T>(path, { ...options, method: "DELETE" });
  },
};
