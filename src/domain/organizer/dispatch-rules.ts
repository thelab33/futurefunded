/** M3A: shared, deterministic editorial validation. Never accept raw HTML. */
export const DISPATCH_CATEGORIES = ["practice", "competition", "travel", "equipment", "access", "community"] as const;
export type DispatchCategory = typeof DISPATCH_CATEGORIES[number];
export type DispatchDraftInput = Readonly<{ title: string; summary: string; category: DispatchCategory }>;

export class DispatchValidationError extends Error {
  constructor(readonly field: "title" | "summary" | "category" | "version", message: string) {
    super(message);
    this.name = "DispatchValidationError";
  }
}

const forbidden = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u;
function boundedText(value: unknown, field: "title" | "summary", max: number): string {
  if (typeof value !== "string") throw new DispatchValidationError(field, `${field} is required.`);
  const clean = value.trim().normalize("NFC");
  if (clean.length < 1 || clean.length > max || forbidden.test(clean) || /[<>]/u.test(clean)) {
    throw new DispatchValidationError(field, `${field} must be plain text, 1–${max} characters.`);
  }
  return clean;
}
export function validateDispatchDraft(input: unknown): DispatchDraftInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DispatchValidationError("title", "A draft is required.");
  }
  const raw = input as Record<string, unknown>;
  const category = raw.category;
  if (typeof category !== "string" || !DISPATCH_CATEGORIES.some(item => item === category)) {
    throw new DispatchValidationError("category", "Choose a supported update category.");
  }
  return {
    title: boundedText(raw.title, "title", 120),
    summary: boundedText(raw.summary, "summary", 600),
    category: category as DispatchCategory,
  };
}
export function validateExpectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new DispatchValidationError("version", "The expected version must be a positive integer.");
  }
  return value as number;
}
