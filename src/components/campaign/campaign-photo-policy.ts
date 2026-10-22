export type CampaignPhoto = {
  src: string;
  alt: string;
  label?: string;
  objectPosition?: string;
  mobileObjectPosition?: string;
};

/** Never rotate onto a photograph which has not loaded successfully. */
export function nextLoadedPhoto(current: number, count: number, loaded: ReadonlySet<number>, direction: 1 | -1): number | null {
  if (!Number.isInteger(count) || count < 1) return null;
  for (let offset = 1; offset <= count; offset++) {
    const candidate = ((current + direction * offset) % count + count) % count;
    if (loaded.has(candidate)) return candidate;
  }
  return null;
}

export function shouldRotatePhotos(state: {
  requested: boolean; reduced: boolean; interactive: boolean;
  hovered: boolean; inView: boolean; readyCount: number;
}) {
  return state.requested && !state.reduced && state.interactive &&
    !state.hovered && state.inView && state.readyCount > 1;
}
