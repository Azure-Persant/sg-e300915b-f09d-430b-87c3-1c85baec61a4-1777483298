interface StructuredError {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
}

const readText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const structured = error as StructuredError;
    const message = readText(structured.message);
    const details = readText(structured.details);
    const hint = readText(structured.hint);
    const code = readText(structured.code);
    const parts = [message, details, hint].filter(
      (part, index, values): part is string => Boolean(part) && values.indexOf(part) === index
    );

    if (parts.length > 0) {
      return `${parts.join(" — ")}${code ? ` (${code})` : ""}`;
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Fall through to the generic message for circular objects.
    }
  }

  return "An unexpected error occurred.";
}
