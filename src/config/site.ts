/** A configured public origin is metadata, never permission to enable a service. */
export function getPublicOrigin(): string | null {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || url.port) return null;
    return url.origin;
  } catch {return null;}
}
export function getCampaignCanonicalUrl(slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)) return null;
  const origin = getPublicOrigin();
  return origin ? `${origin}/c/${slug}` : null;
}
