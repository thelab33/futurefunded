import type { ReactNode } from "react";
import styles from "./CampaignFoundation.module.css";
export default function PublicCampaignLayout({children}: {children: ReactNode}) {
  return <div className={styles.foundation}>{children}</div>;
}
