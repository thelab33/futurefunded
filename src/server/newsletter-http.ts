import "server-only";
import { randomBytes } from "node:crypto";
export class NewsletterInputError extends Error { constructor(public status: number, message: string) { super(message); } }
export function checkOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new NewsletterInputError(403, "Please submit from the campaign page.");
}
export async function boundedText(request: Request, maximum = 4096) {
  if (Number(request.headers.get("content-length") ?? 0) > maximum) throw new NewsletterInputError(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new NewsletterInputError(400, "Missing request.");
  const chunks: Uint8Array[] = []; let total = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > maximum) { await reader.cancel(); throw new NewsletterInputError(413, "Request too large."); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export const tokenValid = (value: string | null): value is string => Boolean(value && /^[a-f0-9]{64}$/.test(value));
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 429 ? { "Retry-After": "3600" } : {}) } }); }
export function confirmationPage(title: string, message: string, token?: string, slug?: string, status = 200) {
  const nonce = randomBytes(16).toString("base64");
  const content = token ? `<form method="post" action="/api/newsletter/confirm"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Confirm season updates →</button></form>` : slug ? `<a href="/c/${encodeURIComponent(slug)}">Back to campaign →</a>` : "";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · FutureFunded</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f1efea;color:#172b47;font:16px/1.6 system-ui,sans-serif;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:min(100%,560px);background:#faf9f6;border:1px solid #d8dce1;border-top:3px solid #e7b95f;border-radius:16px;padding:clamp(24px,5vw,40px)}small{font-weight:750;letter-spacing:.1em}h1{font:700 clamp(28px,5vw,38px)/1.15 Georgia,serif;letter-spacing:-.025em}p{color:#536174}button,a{display:block;width:100%;padding:14px 18px;border:0;border-radius:9px;background:#e7b95f;color:#172b47;text-align:center;font:700 16px/1.4 system-ui,sans-serif;text-decoration:none;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #165dcc;outline-offset:4px}</style></head><body><main><small>FUTUREFUNDED · SEASON UPDATES</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${content}</main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "strict-origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` } });
}
