import Link from "next/link";
import { OrganizerStudio } from "@/components/organizer/OrganizerStudio";
import styles from "@/components/organizer/OrganizerStudio.module.css";

export const metadata = {
  title: "Organizer Studio Preview | FutureFunded",
};

export default function OrganizerPreview() {
  return (
    <main className={styles.page}>
      <div
        role="status"
        style={{
          background: "#fff0cf",
          color: "#4e371c",
          padding: "12px 22px",
          textAlign: "center",
          fontSize: 13,
        }}
      >
        <strong>VISUAL PREVIEW — SAMPLE DATA ONLY.</strong>{" "}
        No authentication, saving, publishing, or database connection is enabled.
      </div>

      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand}>
            FutureFunded
            <span>· Organizer Studio</span>
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
