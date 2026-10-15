import type { components } from "../types/openapi.generated";

export type ApiErrorBody = components["schemas"]["ErrorResponse"];
export type ApiErrorCode = string;

export type ApiRequestOptions<TResponseType extends "json" | "text" | "blob" | "arraybuffer" = "json"> = Omit<
  RequestInit,
  "body" | "signal"
> & {
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  responseType?: TResponseType;
  params?: Record<string, string | number | boolean | undefined>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
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

function buildApiUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, window.location.origin);

  if (baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) {
    const target = new URL(baseUrl);
    target.pathname = `${target.pathname.replace(/\/$/, "")}${normalizedPath}`;
    url.href = target.href;
  } else {
    url.href = `${window.location.origin}${baseUrl}${normalizedPath}`;
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function resolveRequestBody(body: unknown): BodyInit | undefined {
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

async function parseJsonBody<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error as ApiErrorBody["error"];
    throw new ApiError(
      response.status,
      error?.code ?? "HTTP_ERROR",
      error?.message ?? "Request failed",
      error?.details,
    );
  }

  if (response.ok) {
    return ("data" in (payload as Record<string, unknown>)
      ? (payload as { data: T }).data
      : (payload as T)) as T;
  }

  throw new ApiError(
    response.status,
    "HTTP_ERROR",
    "Request failed",
    payload,
  );
}

async function parseNonJsonBody<T>(response: Response, responseType: "text" | "blob" | "arraybuffer") {
  if (responseType === "text") {
    return (await response.text()) as T;
  }

  if (responseType === "blob") {
    return (await response.blob()) as T;
  }

  return (await response.arrayBuffer()) as T;
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
  if (signal) {
    signal.addEventListener("abort", abortListener, { once: true });
  }

  try {
    const requestHeaders = new Headers(headers);
    const requestBody = resolveRequestBody(body);

    if (requestBody !== undefined && !(requestBody instanceof FormData) && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }

    const response = await fetch(buildApiUrl(path, params), {
      ...requestInit,
      method,
      body: requestBody,
      credentials: requestInit.credentials ?? "include",
      headers: requestHeaders,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (responseType === "json" && isJsonResponse(response)) {
        await parseJsonBody<never>(response);
      }

      if (responseType !== "json") {
        const payload = await parseNonJsonBody<string>(response, responseType);
        throw new ApiError(response.status, "HTTP_ERROR", `Request failed with status ${response.status}`, payload);
      }

      throw new ApiError(response.status, "HTTP_ERROR", `Request failed with status ${response.status}`);
    }

    if (responseType === "json") {
      if (response.status === 204) {
        return undefined as T;
      }

      if (isJsonResponse(response)) {
        return await parseJsonBody<T>(response);
      }

      const payload = await response.text();
      return payload as T;
    }

    return await parseNonJsonBody<T>(response, responseType);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TransportError("Request aborted or timed out", error);
    }

    throw new TransportError("Network request failed", error);
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", abortListener);
    }
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
