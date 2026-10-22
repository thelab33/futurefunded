/** Labels describe the link actually displayed; configuration alone cannot
 * turn a loopback URL into a published campaign. No actions live here. */
const presentations = {
  loading: {
    kind: "loading", badge: "Preparing link", truth: "Campaign link", status: "Preparing campaign link…",
    label: "Campaign link", share: "Share campaign", copied: "Link copied",
    intro: "Preparing the campaign link and sharing tools.",
    note: "", qrKicker: "Campaign QR", qrTitle: "Preparing campaign QR code", qrCopy: "The QR code will appear when a link is available.",
  },
  local: {
    kind: "local", badge: "Local preview", truth: "Campaign preview", status: "Preview link available",
    label: "Local preview link", share: "Share preview", copied: "Preview link copied",
    intro: "Review this campaign preview on your device. Publish a public campaign link before inviting others to share.",
    note: "This link and QR code open on this device only.", qrKicker: "Preview QR", qrTitle: "Open this local preview", qrCopy: "Scan to open the local link above on this device.",
  },
  published: {
    kind: "published", badge: "Published campaign", truth: "Published campaign", status: "Ready to share",
    label: "Public campaign link", share: "Share the season", copied: "Campaign link copied",
    intro: "Help the season reach people who can give, sponsor, or open the right door.",
    note: "", qrKicker: "Campaign QR", qrTitle: "Open the campaign", qrCopy: "This QR code opens the public campaign link shown above.",
  },
  current: {
    kind: "current", badge: "Current page", truth: "Current page", status: "Page link available",
    label: "Current page link", share: "Share page link", copied: "Page link copied",
    intro: "Review the current page link and QR code. A published campaign link has not been configured.",
    note: "Confirm the public campaign address before sharing it widely.", qrKicker: "Page QR", qrTitle: "Open this page", qrCopy: "This QR code opens the current page link shown above.",
  },
} as const;

export function relayLinkPresentation(url: string, canonicalUrl: string | null) {
  if (!url) return presentations.loading;
  try {
    const value = new URL(url);
    if (!["http:", "https:"].includes(value.protocol) || value.username || value.password) return presentations.loading;
    if (["localhost", "127.0.0.1", "[::1]"].includes(value.hostname)) return presentations.local;
    if (canonicalUrl && value.href === new URL(canonicalUrl).href) return presentations.published;
    return presentations.current;
  } catch {
    return presentations.loading;
  }
}
