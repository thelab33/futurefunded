import type { CSSProperties } from "react";
import type { CampaignBranding } from "@/domain/campaigns/types";

const palettes = {
  warm: { paper: "#faf9f6", stage: "#f1efea", ink: "#21324a", muted: "#536174", line: "#d8dce1", selected: "#eaf0f7", accent: "#254a78", focus: "#1769c2", error: "#a12615" },
  clean: { paper: "#ffffff", stage: "#f4f5f7", ink: "#202733", muted: "#566171", line: "#d5dce5", selected: "#e9eef7", accent: "#344f78", focus: "#1769c2", error: "#a12615" },
  dark: { paper: "#1d324d", stage: "#132239", ink: "#faf9f6", muted: "#c9d3df", line: "#52657e", selected: "#2b4668", accent: "#b9d4f7", focus: "#96c9ff", error: "#ffb4a5" },
} as const;

function hex(value: string | undefined): string | null {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return value.toLowerCase();
}
function luminance(value: string): number {
  const channels = [1, 3, 5].map(index => {
    const channel = parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function campaignContrast(first: string, second: string): number {
  const [low, high] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}
export function resolveCampaignBranding(branding?: CampaignBranding) {
  const surface = branding?.surface && Object.hasOwn(palettes, branding.surface) ? branding.surface : "warm";
  const palette = palettes[surface];
  const candidate = hex(branding?.accent);
  // Functional accents must remain legible on both ordinary and selected cards.
  // Brand color never controls the focus ring, body ink or error messaging.
  const accepted = Boolean(candidate && campaignContrast(candidate, palette.paper) >= 4.5
    && campaignContrast(candidate, palette.selected) >= 4.5);
  const accent = accepted ? candidate! : palette.accent;
  const style = {
    "--campaign-font-display": branding?.typography === "modern" ? "var(--font-geist-sans), system-ui, sans-serif" : "Georgia, serif",
    "--campaign-font-body": "var(--font-geist-sans), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    ...(branding?.surface ? {
      "--campaign-paper": palette.paper, "--campaign-stage": palette.stage,
      "--campaign-ink": palette.ink, "--campaign-muted": palette.muted,
      "--campaign-line": palette.line, "--campaign-selected": palette.selected,
      "--campaign-focus": palette.focus, "--campaign-error": palette.error,
    } : {}),
    ...(candidate || branding?.surface ? { "--campaign-accent": accent } : {}),
  } as CSSProperties;
  return { style, surface, accent, accentAccepted: accepted };
}
