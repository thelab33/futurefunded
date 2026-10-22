"use client";
import { useState } from "react";
import type { Campaign } from "@/domain/campaigns/types";
import Image from "next/image";
import { CampaignPhotoLayers } from "./CampaignPhotoLayers";
import styles from "./CampaignAthletesDetail.module.css";

/** A manually operated viewer inside the existing chapter dialog. */
export function CampaignAthletesDetail({ campaign }: { campaign: Campaign }) {
  const photos = (campaign.athleteGallery ?? []).filter((photo, index, all) => all.findIndex(item => item.src === photo.src) === index);
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, photos.length - 1));
  function step(direction: 1 | -1) { setSelected(current => (current + direction + photos.length) % photos.length); }
  return (
    <div className={styles.athleteChapter} data-athlete-documentary="true">
      <p>Basketball brings athletes, coaches, and families together. Consistent practice, opportunities to compete, and travel support help keep that connection moving.</p>
      <p>Photographs from the program’s journey are documentary history, not a current roster or a fixed team count.</p>
      {photos.length > 0 ? <div className={styles.athleteGallery} data-athlete-viewer="true">
        <figure className={styles.feature}>
          <div className={styles.stage} id="athlete-featured-photo" tabIndex={0} role="group"
            aria-label="Featured program photograph. Use left and right arrow keys to browse."
            onKeyDown={event => {
              if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1);
            }}>
            <CampaignPhotoLayers photos={photos} active={active} contain sizes="(max-width: 768px) 90vw, 720px" showUnavailable />
          </div>
          <figcaption aria-live="polite" aria-atomic="true">
            <span className={styles.counter}>{active + 1} / {photos.length}</span>
            <span>{photos[active].alt}</span>
          </figcaption>
        </figure>
        {photos.length > 1 && <>
          <div className={styles.viewerControls} role="group" aria-label="Program photograph navigation">
            <button type="button" aria-controls="athlete-featured-photo" onClick={() => step(-1)}>← Previous</button>
            <span>Inside the program</span>
            <button type="button" aria-controls="athlete-featured-photo" onClick={() => step(1)}>Next →</button>
          </div>
          <div className={styles.thumbnailStrip} role="group" aria-label="Choose a program photograph">
            {photos.map((photo, index) => <button key={photo.src} type="button" aria-pressed={active === index}
              aria-controls="athlete-featured-photo" aria-label={`Show photograph ${index + 1}: ${photo.alt}`}
              onClick={() => setSelected(index)}>
              <Image unoptimized src={photo.src} alt="" width={160} height={120} sizes="120px" />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>)}
          </div>
        </>}
      </div> : <p>Program photographs have not been published.</p>}
      <p className={styles.athleteFundNote}>Every gift supports the shared season fund.</p>
    </div>
  );
}
