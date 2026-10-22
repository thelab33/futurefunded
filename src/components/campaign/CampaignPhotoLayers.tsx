"use client";
import { useState, type CSSProperties } from "react";
import Image from "next/image";
import type { CampaignPhoto } from "./campaign-photo-policy";
import styles from "./CampaignPhotoLayers.module.css";

export function CampaignPhotoLayers({ photos, active, priority = false, decorative = false, contain = false, sizes,
  onLoad, onError, showUnavailable = false }: {
  photos: readonly CampaignPhoto[]; active: number; priority?: boolean; decorative?: boolean;
  contain?: boolean; sizes: string; showUnavailable?: boolean;
  onLoad?: (index: number) => void; onError?: (index: number) => void;
}) {
  const [selection, setSelection] = useState({ active, previous: null as number | null });
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  // Adjusting state to changed props preserves the prior opaque frame without
  // an effect delay or a fade through black. No animation-end timer is needed.
  if (selection.active !== active) setSelection({ active, previous: selection.active });
  const previous = selection.active !== active ? selection.active : selection.previous;
  return <div className={styles.layers} aria-hidden={decorative || undefined} data-photo-layers="true">
    {photos.map((photo, index) => <div key={photo.src} className={styles.layer}
      data-active={index === active} data-previous={index === previous}
      data-transition={previous !== null} data-failed={failed.has(index)}
      role={decorative ? undefined : "group"} aria-roledescription={decorative ? undefined : "slide"}
      aria-label={decorative ? undefined : `${photo.label ?? "Program photograph"}, ${index + 1} of ${photos.length}`}
      aria-hidden={index !== active || undefined}>
      <Image unoptimized fill src={photo.src} alt={decorative ? "" : photo.alt} sizes={sizes}
        preload={priority && index === 0} loading={priority && index === 0 ? undefined : "lazy"}
        fetchPriority={priority && index === 0 ? undefined : "low"}
        className={styles.image} style={{
          objectFit: contain ? "contain" : "cover",
          "--photo-position": photo.objectPosition ?? "center",
          "--photo-position-mobile": photo.mobileObjectPosition ?? photo.objectPosition ?? "center",
        } as CSSProperties}
        onLoad={() => onLoad?.(index)} onError={() => {
          setFailed(current => new Set([...current, index])); onError?.(index);
        }} />
    </div>)}
    {showUnavailable && failed.has(active) && <p className={styles.unavailable} role="status">This photograph couldn’t load. Choose another photograph.</p>}
  </div>;
}
