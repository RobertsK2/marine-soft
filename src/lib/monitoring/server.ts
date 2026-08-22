import * as Sentry from "@sentry/nextjs";

export type SerializedServerError = {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  details?: string;
  hint?: string;
  cause?: SerializedServerError;
};

const ERROR_FIELDS = ["code", "details", "hint"] as const;

export function serializeServerError(
  error: unknown,
  depth = 0,
): SerializedServerError {
  if (error instanceof Error) {
    const serialized: SerializedServerError = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) serialized.stack = error.stack;
    if (error.cause !== undefined && depth < 4) {
      serialized.cause = serializeServerError(error.cause, depth + 1);
    }

    return serialized;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const serialized: SerializedServerError = {
      name: typeof record.name === "string" ? record.name : "NonErrorThrown",
      message:
        typeof record.message === "string"
          ? record.message
          : "A non-Error object was thrown.",
    };

    for (const field of ERROR_FIELDS) {
      if (typeof record[field] === "string") serialized[field] = record[field];
    }

    return serialized;
  }

  return {
    name: "NonErrorThrown",
    message: typeof error === "string" ? error : String(error),
  };
}

export function captureServerError(
  error: unknown,
  context: Record<string, string | number | boolean | null> = {},
) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    console.error("DockPay server error", {
      error: serializeServerError(error),
      context,
    });
  }
}
