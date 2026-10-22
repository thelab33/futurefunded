import type { Campaign, CampaignUpdate } from "@/domain/campaigns/types";

/** This is the public projection, not the organizer's editable draft source. */
export type PublicCampaignUpdate = CampaignUpdate & { status: "published"; publishedAt: string };
export type FundingCheckpoint = {
  id: string;
  label: string;
  threshold: number;
  reached: boolean;
  remaining: number;
};

const IS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CATEGORY = new Set(["practice", "competition", "travel", "equipment", "access", "community"]);

/**
 * Fail closed: drafts, legacy records with no approval, scheduled entries,
 * invalid dates, and incomplete entries are excluded from every public view.
 * Never infer publication or verification from the existence of a data record.
 */
export function publishedSeasonUpdates(updates: readonly CampaignUpdate[] = [], asOf: string): PublicCampaignUpdate[] {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) return [];
  const ids = new Set<string>();
  return updates.filter((entry): entry is PublicCampaignUpdate => {
    if (entry.status !== "published" || !entry.publishedAt || !IS_UTC.test(entry.publishedAt)) return false;
    const when = Date.parse(entry.publishedAt);
    // Reject calendar rollover such as February 30, even if JS normalizes it.
    if (!Number.isFinite(when) || when > cutoff || new Date(when).toISOString().slice(0, 19) !== entry.publishedAt.slice(0, 19)) return false;
    if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(entry.id) || ids.has(entry.id)) return false;
    if (typeof entry.title !== "string" || !entry.title.trim() || entry.title.length > 120) return false;
    if (typeof entry.summary !== "string" || !entry.summary.trim() || entry.summary.length > 600) return false;
    if (entry.category && !CATEGORY.has(entry.category)) return false;
    ids.add(entry.id);
    return true;
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

/** Strip all unpublished activity BEFORE serializing a campaign to the browser. */
export function publicCampaignSnapshot(campaign: Campaign, asOf: string): Campaign {
  if (!campaign.community) return campaign;
  return {
    ...campaign,
    community: {
      ...campaign.community,
      updates: publishedSeasonUpdates(campaign.community.updates, asOf),
    },
  };
}

/** Dollar-progress checkpoints, NEVER a statement that an expense was purchased. */
export function fundingCheckpoints(raised: number, goal: number): FundingCheckpoint[] {
  if (!Number.isFinite(raised) || !Number.isFinite(goal) || raised < 0 || goal <= 0) return [];
  return [
    { id: "quarter", label: "First quarter", share: .25 },
    { id: "halfway", label: "Halfway", share: .5 },
    { id: "three-quarter", label: "Three quarters", share: .75 },
    { id: "goal", label: "Season goal", share: 1 },
  ].map(({ id, label, share }) => {
    const threshold = Math.round(goal * share * 100) / 100;
    return { id, label, threshold, reached: raised >= threshold, remaining: Math.max(0, Math.round((threshold - raised) * 100) / 100) };
  });
}
