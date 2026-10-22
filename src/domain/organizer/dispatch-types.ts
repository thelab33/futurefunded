/** The public-safe update projection; no private draft or actor information. */
export type CampaignUpdate = Readonly<{
  id: string;
  title: string;
  summary: string;
  category?: "practice" | "competition" | "travel" | "equipment" | "access" | "community";
  status?: "draft" | "published";
  publishedAt?: string;
}>;
