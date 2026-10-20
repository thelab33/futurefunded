import type { Campaign } from "@/domain/campaigns/types";
import Image from "next/image";
import styles from "@/components/campaign/CampaignAthletesDetail.module.css";

/** Preserve the legacy chapter key and documentary claims. */
export function CampaignAthletesDetail({ campaign }: { campaign: Campaign }) {
  const photos = campaign.athleteGallery ?? [];

  return (
    <div className={styles.athleteChapter} data-athlete-documentary="true">
      <p>Basketball brings athletes, coaches, and families together. Consistent practice, opportunities to compete, and travel support help keep that connection moving.</p>
      <p>Photographs from the program’s journey are documentary history, not a current roster or a fixed team count.</p>
      {photos.length > 0 ? (
        <div className={styles.athleteGallery}>
          {photos.map((photo, index) => (
            <figure key={`${photo.src}-${index}`}>
              <Image
                unoptimized
                src={photo.src}
                alt=""
                width={640}
                height={480}
                sizes={index === 0 ? "(max-width: 575px) 85vw, (max-width: 768px) 85vw, 660px" : "(max-width: 575px) 85vw, (max-width: 768px) 42vw, 320px"}
              />
              <figcaption>{photo.alt}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p>Program photographs have not been published.</p>
      )}
      <p className={styles.athleteFundNote}>Every gift supports the shared season fund.</p>
    </div>
  );
}
