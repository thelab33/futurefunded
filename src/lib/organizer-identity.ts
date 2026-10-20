import { createHash } from "node:crypto";

export function organizerSubject(email: string): string {
  const normalized = email.trim().toLowerCase().normalize("NFC");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) throw new Error("Invalid identity");
  return `emailsha256:${createHash("sha256").update(normalized).digest("hex")}`;
}
