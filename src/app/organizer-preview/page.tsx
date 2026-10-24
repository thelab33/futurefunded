import Link from "next/link";
import Image from "next/image";
import localFont from "next/font/local";
import preview from "@/components/organizer/OrganizerPreview.module.css";
import { OrganizerStudio } from "@/components/organizer/OrganizerStudio";
import styles from "@/components/organizer/OrganizerStudio.module.css";

const studioSans = localFont({
  src: "../../components/home/fonts/dm-sans.woff2",
  variable: "--font-ff-studio-sans",
  weight: "100 900",
  display: "swap",
});
const studioDisplay = localFont({
  src: "../../components/home/fonts/dm-serif-display.woff2",
  variable: "--font-ff-studio-display",
  weight: "400",
  display: "swap",
});

export const metadata = {
  title: "Organizer Studio Preview | FutureFunded",
};

export default function OrganizerPreview() {
  return (
    <main
      className={`${styles.page} ${preview.preview} ${studioSans.variable} ${studioDisplay.variable}`}
    >
      <div role="status" className={preview.notice}>
        <strong>VISUAL PREVIEW — SAMPLE DATA ONLY.</strong> No authentication,
        saving, publishing, or database connection is enabled.
      </div>

      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={`${styles.brand} ${preview.brand}`}>
            <Image
              src="/media/futurefunded/home/ff-mark.svg"
              alt=""
              width={35}
              height={35}
            />
            <span className={preview.wordmark}>
              FutureFunded<small>Organizer Studio · Preview</small>
            </span>
          </Link>
          <div className={styles.headerAside}>
            Connect ATX Elite
            <span>Private organizer workspace · Visual preview</span>
          </div>
        </header>

        <OrganizerStudio
          slug="connect-atx-elite"
          organization="Connect ATX Elite"
          role="owner"
          publicEnabled={false}
          previewMode
        />
      </div>
    </main>
  );
}
