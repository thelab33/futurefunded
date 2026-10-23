import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./Home.module.css";

export const metadata: Metadata = {
  title: "FutureFunded | Community Fundraising Infrastructure",
  description: "One operating system for credible community campaigns and the work behind them. Explore FutureFunded’s campaign engine and Organizer Studio preview.",
  alternates: { canonical: "https://getfuturefunded.com/" },
  openGraph: {
    title: "FutureFunded | Community Fundraising Infrastructure",
    description: "Premium campaigns. Connected operations. Community at the center.",
    url: "https://getfuturefunded.com/",
    type: "website",
    images: [{ url: "https://getfuturefunded.com/media/connect-atx-elite/7th-black.webp", alt: "Connect ATX Elite athletes gathered in a courtside huddle" }],
  },
};

const campaignUrl = "/c/connect-atx-elite";
const studioUrl = "/organizer-preview";

function Arrow() { return <span aria-hidden="true">→</span>; }
function Brand() {
  return <span className={styles.brand}>
    <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true" fill="none">
      <rect x=".5" y=".5" width="35" height="35" rx="9" stroke="currentColor" />
      <path d="M10 25V11h15M10 18h12M18 25V11" stroke="currentColor" strokeWidth="2.2" />
      <path d="m23 23 4-4m0 0h-4m4 0v4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
    <span className={styles.brandLabel}><span>FutureFunded<span className={styles.brandDot}>.</span></span><small>Community fundraising infrastructure</small></span>
  </span>;
}

function ProductVisual() {
  return <div className={styles.productVisual} role="img" aria-label="FutureFunded platform illustration: public campaign pages, sponsors and sharing; an Organizer Studio visual preview; live giving, reporting and automated follow-up in development.">
    <div className={styles.windowBar}><span className={styles.windowDots} aria-hidden="true">● ● ●</span><span>FutureFunded / Platform</span><span className={styles.conceptBadge}>Illustration</span></div>
    <div className={styles.productBody}>
      <div className={styles.productTopline}><span>One mission. Connected layers.</span><span aria-hidden="true">FF / 01</span></div>
      <strong className={styles.productTitle}>Your community.<br />Your operating system.</strong>
      <div className={styles.productLayers}>
        <div className={styles.productLayer}><span className={styles.layerIcon} aria-hidden="true">01</span><div><strong>Public campaign</strong><span>Story · Goal · Sponsor packages</span></div><span className={styles.available}>Available</span></div>
        <div className={styles.productLayer}><span className={styles.layerIcon} aria-hidden="true">02</span><div><strong>Community reach</strong><span>Campaign link · QR &amp; sharing</span></div><span className={styles.available}>Available</span></div>
        <div className={styles.productLayer}><span className={styles.layerIcon} aria-hidden="true">03</span><div><strong>Organizer Studio</strong><span>Campaign operations · Updates</span></div><span className={styles.preview}>Visual preview</span></div>
      </div>
      <div className={styles.productNext}><span>In development</span><p>Live giving · Reporting · Automated follow-up</p></div>
    </div>
    <div className={styles.productCaption}>Platform structure illustration · No live campaign data</div>
  </div>;
}

export default function Home() {
  return <div className={styles.page} id="top">
    <Link className={styles.skip} href="#home-main">Skip to content</Link>
    <header className={styles.header}>
      <Link href="/" aria-label="FutureFunded home"><Brand /></Link>
      <nav className={styles.nav} aria-label="Main navigation"><Link href="#platform">Platform</Link><Link href="#in-action">In action</Link><Link className={styles.navAction} href={campaignUrl}>View campaign <Arrow /></Link></nav>
    </header>
    <main id="home-main">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Community fundraising infrastructure</p>
          <h1 id="home-title">Fundraising.<br /><em>Built to operate.</em></h1>
          <p className={styles.lede}>One operating system for credible campaigns and the work behind them. Bring the public campaign, sponsorship, and organizer workflow into one connected experience.</p>
          <div className={styles.actions}><Link className={styles.primary} href="#platform">Explore the platform <span aria-hidden="true">↓</span></Link><Link className={styles.textLink} href={studioUrl}>Studio preview <Arrow /></Link></div>
          <p className={styles.audiences}>For teams, schools, clubs, nonprofits,<br className={styles.optionalBreak} /> and community organizers.</p>
        </div>
        <ProductVisual />
      </section>

      <section className={styles.platform} id="platform" aria-labelledby="platform-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Connected capabilities</p><h2 id="platform-title">The engine.<br /><em>The system around it.</em></h2></div><p>Crowdfunding is the public engine. FutureFunded connects the campaign to sponsorship, giving, and operations—with each capability’s availability clearly shown.</p></div>
        <div className={styles.capabilities}>
          <article><div className={styles.cardTop}><span>01 / Public experience</span></div><h3>Campaign &amp; community</h3><dl>
            <div><dt>Premium campaign pages <span className={styles.available}>Available</span></dt><dd>Story, photography, goals, and program needs.</dd></div>
            <div><dt>QR &amp; share tools <span className={styles.available}>Available</span></dt><dd>One campaign link for the community to pass on.</dd></div>
          </dl></article>
          <article><div className={styles.cardTop}><span>02 / Support pathways</span></div><h3>Sponsorship &amp; giving</h3><dl>
            <div><dt>Sponsor-ready packages <span className={styles.available}>Explore today</span></dt><dd>Defined partnership levels and program context.</dd></div>
            <div><dt>Donor-grade checkout <span className={styles.preview}>In preparation</span></dt><dd>Gift selection and review; live payments are not open.</dd></div>
          </dl></article>
          <article><div className={styles.cardTop}><span>03 / Organizer operations</span></div><h3>Readiness &amp; continuity</h3><dl>
            <div><dt>Reporting <span className={styles.preview}>Planned</span></dt><dd>Verified live donation reporting and reconciliation.</dd></div>
            <div><dt>Launch readiness &amp; follow-up <span className={styles.preview}>Planned</span></dt><dd>Launch checks and automated follow-up workflows.</dd></div>
          </dl></article>
        </div>
      </section>

      <section className={styles.inAction} id="in-action" aria-labelledby="action-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Product in action</p><h2 id="action-title">One mission.<br /><em>Two connected views.</em></h2></div><p>See the supporter experience through Connect ATX Elite, then explore the organizer workspace direction behind it.</p></div>
        <div className={styles.exampleGrid}>
          <article className={styles.campaignExample}>
            <div className={styles.examplePhoto}><Image unoptimized src="/media/connect-atx-elite/7th-black.webp" alt="Connect ATX Elite youth basketball players gathered in a courtside huddle" width={720} height={480} loading="eager" sizes="(max-width: 760px) 90vw, 25vw" /></div>
            <div className={styles.exampleCopy}><span className={styles.exampleLabel}>01 / Public campaign</span><h3>Connect ATX Elite</h3><p>Austin youth basketball.<br />One shared season fund.</p><p className={styles.goal}><strong>$20,000</strong> season goal</p><Link className={styles.textLink} href={campaignUrl}>Explore the campaign <Arrow /></Link><span className={styles.serviceNote}>Giving is not open yet.</span></div>
          </article>
          <article className={styles.studioExample}>
            <div className={styles.exampleTop}><span className={styles.exampleLabel}>02 / Organizer Studio</span><span className={styles.studioBadge}>Visual preview</span></div><h3>The work behind the campaign.</h3><p>Preview campaign operations and season-update workflows in a dedicated organizer workspace.</p><div className={styles.studioModules}><span>Campaign operations</span><span>Season updates</span></div><Link className={styles.lightLink} href={studioUrl}>Explore Studio <Arrow /></Link><p className={styles.previewNote}>Sample data only. Account access, saving, and publishing are not enabled.</p>
          </article>
        </div>
      </section>

      <section className={styles.questions} aria-labelledby="questions-title">
        <div className={styles.questionIntro}><p className={styles.eyebrow}>Before you explore</p><h2 id="questions-title">A clearer start.</h2><p>See the public campaign or take a look inside the Studio preview.</p><Link className={styles.primary} href={campaignUrl}>View campaign <Arrow /></Link></div>
        <div className={styles.faqs}>
          <details><summary>How is FutureFunded different from crowdfunding?<span aria-hidden="true">+</span></summary><p>Crowdfunding is the public campaign engine. FutureFunded is the larger community fundraising infrastructure platform around it: sponsor packages, donor checkout, QR sharing, reporting, launch readiness, and follow-up. Current, preview, and planned capabilities are identified above.</p></details>
          <details><summary>What can I use today?<span aria-hidden="true">+</span></summary><p>Explore the Connect ATX Elite campaign, its sponsor packages, and its QR and sharing tools. Giving is not open yet. Organizer Studio is a visual preview with sample data; account access, saving, and publishing are not enabled.</p></details>
          <details><summary>Can I launch my own campaign?<span aria-hidden="true">+</span></summary><p>Self-service campaign creation is not available yet. The featured campaign demonstrates the public experience, and the Studio preview shows the organizer workspace direction. Live giving, reporting, launch checks, and automated follow-up remain in development.</p></details>
        </div>
      </section>
    </main>
    <footer className={styles.footer}><div><Link href="/" aria-label="FutureFunded home"><Brand /></Link><p>Big futures. Built together.</p></div><nav aria-label="Footer navigation"><Link href={campaignUrl}>Campaign <Arrow /></Link><Link href={studioUrl}>Studio preview <Arrow /></Link><Link href="#top">Back to top ↑</Link></nav><div className={styles.footerBottom}><span>© {new Date().getFullYear()} FutureFunded</span><span>Community at the center.</span></div></footer>
  </div>;
}
