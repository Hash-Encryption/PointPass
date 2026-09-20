import { reportLovableError } from "./lovable-error-reporting";

export type ErrorCategory =
  | "AUTH"
  | "ONBOARDING"
  | "CUSTOMER"
  | "LOYALTY"
  | "SCANNER"
  | "ANALYTICS"
  | "BILLING"
  | "WALLET"
  | "RPC"
  | "SSR"
  | "GENERAL";

/**
 * Key patterns strictly redacted from logs, errors, and metadata:
 * - access_token / accessToken
 * - refresh_token / refreshToken
 * - authorization / bearer
 * - password / passwd
 * - pin / pin_hash / pinHash
 * - api_key / apiKey / secret
 * - service_role / serviceRole / service_role_key
 * - cookie / session
 */
const SENSITIVE_KEY_PATTERNS = [
  /access_?token/i,
  /accessToken/i,
  /refresh_?token/i,
  /refreshToken/i,
  /authorization/i,
  /bearer/i,
  /password/i,
  /passwd/i,
  /pin_?hash/i,
  /pinHash/i,
  /^pin$/i,
  /api_?key/i,
  /apiKey/i,
  /secret/i,
  /service_?role/i,
  /serviceRole/i,
  /service_role_key/i,
  /cookie/i,
  /session/i,
];

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9-_.]+/gi;
const JWT_PATTERN = /eyJ[A-Za-z0-9-_.]+\.[A-Za-z0-9-_.]+\.[A-Za-z0-9-_.]+/gi;

/**
 * Strips sensitive credentials, tokens, and hashes from string content.
 */
export function sanitizeErrorString(str: string): string {
  if (!str) return str;
  return str.replace(BEARER_PATTERN, "Bearer [REDACTED]").replace(JWT_PATTERN, "[REDACTED_JWT]");
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively scrubs credentials and sensitive properties from metadata objects.
 */
export function sanitizeLogMetadata(data: unknown, depth = 0): unknown {
  if (depth > 6 || data == null) return data;

  if (typeof data === "string") {
    return sanitizeErrorString(data);
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogMetadata(item, depth + 1));
  }

  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeLogMetadata(value, depth + 1);
      }
    }
    return sanitized;
  }

  return String(data);
}

export interface StructuredErrorLog {
  timestamp: string;
  category: ErrorCategory;
  name: string;
  message: string;
  route?: string;
  status?: number;
  metadata?: unknown;
  stack?: string;
}

/**
 * Production-ready structured error logging for both Cloudflare runtime and browser telemetry.
 * Automatically sanitizes secrets before printing or reporting.
 */
export function captureAppError(
  category: ErrorCategory,
  error: unknown,
  metadata?: Record<string, unknown>,
) {
  try {
    const timestamp = new Date().toISOString();
    let name = "Error";
    let message = "Unknown error";
    let stack: string | undefined;
    let status: number | undefined;

    if (error instanceof Error) {
      name = error.name;
      message = sanitizeErrorString(error.message);
      if (error.stack) {
        stack = sanitizeErrorString(error.stack);
      }
      const maybeStatus =
        (error as { status?: unknown; statusCode?: unknown }).status ??
        (error as { status?: unknown; statusCode?: unknown }).statusCode;
      if (typeof maybeStatus === "number") {
        status = maybeStatus;
      }
    } else if (typeof error === "string") {
      message = sanitizeErrorString(error);
    } else if (error && typeof error === "object") {
      const errObj = error as { message?: unknown; status?: unknown };
      if (typeof errObj.message === "string") {
        message = sanitizeErrorString(errObj.message);
      }
      if (typeof errObj.status === "number") {
        status = errObj.status;
      }
    }

    const route = typeof window !== "undefined" ? window.location.pathname : undefined;

    const sanitizedMetadata = metadata ? sanitizeLogMetadata(metadata) : undefined;

    const logPayload: StructuredErrorLog = {
      timestamp,
      category,
      name,
      message,
      ...(route ? { route } : {}),
      ...(status ? { status } : {}),
      ...(sanitizedMetadata ? { metadata: sanitizedMetadata } : {}),
      ...(stack ? { stack } : {}),
    };

    // Log structured payload to console (Cloudflare Workers / Pages runtime logging)
    console.error(`[${category}]`, JSON.stringify(logPayload));

    // Report to browser telemetry if running in client
    if (typeof window !== "undefined") {
      reportLovableError(error, {
        category,
        route,
        ...(sanitizedMetadata && typeof sanitizedMetadata === "object"
          ? (sanitizedMetadata as Record<string, unknown>)
          : {}),
      });
    }
  } catch {
    // Fail safely: Observability must never crash the application
  }
}
