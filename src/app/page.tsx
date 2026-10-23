import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./Home.module.css";

export const metadata: Metadata = {
  title: "FutureFunded | Community Fundraising Infrastructure",
  description: "Community fundraising infrastructure for teams, schools, clubs, nonprofits, and organizers. Explore the campaign engine and the Organizer Studio preview.",
  alternates: { canonical: "https://getfuturefunded.com/" },
  openGraph: {
    title: "FutureFunded | Community Fundraising Infrastructure",
    description: "The public campaign engine and the organizer workflow, connected through one community fundraising platform.",
    url: "https://getfuturefunded.com/",
    type: "website",
    images: [{ url: "https://getfuturefunded.com/media/connect-atx-elite/7th-black.webp", alt: "Connect ATX Elite athletes gathered in a courtside huddle" }],
  },
};

const campaignUrl = "/c/connect-atx-elite";
const studioUrl = "/organizer-preview";

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

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

export default function Home() {
  return <div className={styles.page} id="top">
    <a className={styles.skip} href="#home-main">Skip to content</a>
    <header className={styles.header}>
      <Link href="/" aria-label="FutureFunded home"><Brand /></Link>
      <nav className={styles.nav} aria-label="Main navigation">
        <a href="#platform">The platform</a>
        <a href="#studio">Organizer workflow</a>
        <Link className={styles.navAction} href={campaignUrl}>View campaign <Arrow /></Link>
      </nav>
    </header>

    <main id="home-main">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> Community fundraising infrastructure</p>
          <h1 id="home-title">Fundraising.<br /><em>Built to operate.</em></h1>
          <p className={styles.lede}>One operating system for credible campaigns and the work behind them. Built for teams, schools, clubs, nonprofits, and the organizers moving their communities forward.</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="#platform">Explore the platform <span aria-hidden="true">↓</span></a>
            <Link className={styles.textLink} href={campaignUrl}>View the campaign <Arrow /></Link>
          </div>
          <p className={styles.heroNote}>Campaigns out front. Operations behind them. Community at the center.</p>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.visualTop}><span>A shared goal. A stronger season.</span><span aria-hidden="true">01 / ATX</span></div>
          <figure className={styles.heroPhoto}>
            <Image unoptimized src="/media/connect-atx-elite/7th-black.webp" alt="Connect ATX Elite athletes gathered in a courtside huddle" width={900} height={1050} loading="eager" sizes="(max-width: 760px) 100vw, 48vw" />
            <figcaption><span>Austin, Texas</span><strong>The future<br />is a team effort.</strong></figcaption>
          </figure>
          <div className={styles.goalTag}><span className={styles.goalSymbol} aria-hidden="true">↗</span><div><span>Connect ATX Elite · Season goal</span><strong>$20,000 <small>One shared fund</small></strong></div></div>
        </div>
      </section>

      <div className={styles.audience} aria-label="Who FutureFunded is for"><span>Built for community organizers.</span><p>Teams <i aria-hidden="true">/</i> Schools <i aria-hidden="true">/</i> Clubs <i aria-hidden="true">/</i> Nonprofits</p></div>

      <section className={styles.platform} id="platform" aria-labelledby="platform-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>The platform, beyond the page</p><h2 id="platform-title">The campaign engine.<br /><em>The operating system.</em></h2><p>Crowdfunding is the public engine. FutureFunded is the larger system around it: sponsorship, giving, sharing, reporting, launch readiness, and follow-up. Explore what is available today and where the platform is going.</p></div>
        <div className={styles.capabilities}>
          <article><div className={styles.capabilityTop}><span className={styles.number}>01 / Campaign engine</span><span className={styles.availableBadge}>Explore today</span></div><h3>Premium campaign pages.</h3><p>Story, real photography, season goals, and program needs give supporters a clear picture of the mission.</p></article>
          <article><div className={styles.capabilityTop}><span className={styles.number}>02 / Sponsorship</span><span className={styles.availableBadge}>Explore today</span></div><h3>Sponsor-ready packages.</h3><p>Defined partnership levels and campaign context help businesses understand the opportunity before they connect.</p></article>
          <article><div className={styles.capabilityTop}><span className={styles.number}>03 / Giving</span><span className={styles.plannedBadge}>In preparation</span></div><h3>Donor-grade checkout.</h3><p>A clear gift selection and review experience is available to explore. Live payments and donation receipts are not enabled yet.</p></article>
          <article><div className={styles.capabilityTop}><span className={styles.number}>04 / Community reach</span><span className={styles.availableBadge}>Explore today</span></div><h3>QR &amp; share tools.</h3><p>A public campaign link, QR code, and sharing options help families and community partners carry the story forward.</p></article>
          <article><div className={styles.capabilityTop}><span className={styles.number}>05 / Reporting</span><span className={styles.plannedBadge}>Planned</span></div><h3>A clearer operating picture.</h3><p>Reporting is part of the platform roadmap. Verified live donation reporting and reconciliation are not available in the public experience.</p></article>
          <article><div className={styles.capabilityTop}><span className={styles.number}>06 / Organizer workflow</span><span className={styles.plannedBadge}>Preview + planned</span></div><h3>Readiness &amp; follow-up.</h3><p>Preview campaign operations and update workflows in Studio. Launch-readiness checks and automated follow-up are planned.</p></article>
        </div>
      </section>

      <section className={styles.featured} id="featured" aria-labelledby="featured-title">
        <div className={styles.featuredPhoto}><Image unoptimized src="/media/connect-atx-elite/6th-gold.webp" alt="Connect ATX Elite athletes and coaches celebrating with medals and a trophy" width={1100} height={850} sizes="(max-width: 760px) 100vw, 50vw" /><span>Featured community / Austin, TX</span></div>
        <div className={styles.featuredCopy}>
          <p className={styles.eyebrow}>The public campaign engine</p>
          <h2 id="featured-title">The platform.<br /><em>In the community.</em></h2>
          <p>Connect ATX Elite brings youth basketball, mentorship, and community together. Their campaign brings the story, season plan, sponsor packages, and sharing tools together in one public experience.</p>
          <dl className={styles.campaignFacts}><div><dt>Season goal</dt><dd>$20,000</dd></div><div><dt>The mission</dt><dd>Back every athlete.</dd></div></dl>
          <Link className={styles.primary} href={campaignUrl}>Meet Connect ATX Elite <Arrow /></Link>
          <p className={styles.availability}>Campaign available to explore. Giving is not open yet.</p>
        </div>
      </section>

      <section className={styles.studio} id="studio" aria-labelledby="studio-title">
        <div className={styles.studioCopy}><p className={styles.eyebrow}>The organizer operating layer</p><h2 id="studio-title">One campaign.<br /><em>A connected workflow.</em></h2><p>The campaign page is where supporters connect. Organizer Studio is the workspace direction behind it, with a preview of campaign operations and season-update workflows.</p><Link className={styles.lightLink} href={studioUrl}>Explore the Studio preview <Arrow /></Link><p className={styles.previewNote}>Visual preview with sample data. Saving, publishing, and account access are not enabled.</p></div>
        <div className={styles.studioIllustration} aria-label="FutureFunded platform structure with current availability">
          <div className={styles.windowBar}><span aria-hidden="true">● ● ●</span><span>FutureFunded / Operating system</span><span className={styles.previewBadge}>Platform map</span></div>
          <div className={styles.studioInner}><span className={styles.workspaceLabel}>One mission. Connected layers.</span><strong>Public experience.<br />Organizer clarity.</strong>
            <div className={styles.systemLayer}><div><span>01 / Public campaign</span><strong>Story · Sponsors · QR &amp; sharing</strong></div><span>Available</span></div>
            <div className={styles.systemLayer}><div><span>02 / Organizer Studio</span><strong>Campaign operations · Updates</strong></div><span>Visual preview</span></div>
            <div className={styles.systemLayer}><div><span>03 / Service connections</span><strong>Live giving · Reporting · Follow-up</strong></div><span>In development</span></div>
            <p>Current campaign and Studio preview are available to explore. Service availability is shown above.</p>
          </div>
        </div>
      </section>

      <section className={styles.questions} aria-labelledby="questions-title">
        <div><p className={styles.eyebrow}>A little more clarity</p><h2 id="questions-title">Good questions.<br /><em>Clear answers.</em></h2></div>
        <div className={styles.faqs}>
          <details><summary>What is FutureFunded?<span aria-hidden="true">+</span></summary><p>FutureFunded is a community fundraising infrastructure platform. Crowdfunding is its public campaign engine; the larger platform connects that experience to sponsorship and organizer workflows. Live giving, reporting, launch readiness, and automated follow-up remain in development. Explore the featured campaign and the Studio preview today.</p></details>
          <details><summary>How is this different from a crowdfunding site?<span aria-hidden="true">+</span></summary><p>A campaign page is the starting point. FutureFunded’s larger product direction includes sponsor packages, donor checkout, QR and sharing tools, reporting, launch readiness, and follow-up workflows around that page. Each capability’s current availability is identified in the platform overview.</p></details>
          <details><summary>Can I donate to Connect ATX Elite now?<span aria-hidden="true">+</span></summary><p>Giving is not open yet. You can explore the campaign, review the season goal, and share its public link. The $20,000 figure is the season goal, not an amount raised.</p></details>
          <details><summary>Can I create my own campaign?<span aria-hidden="true">+</span></summary><p>Self-service campaign creation is not available yet. Explore the featured campaign to see the public experience and the Organizer Studio preview to see the workspace concept.</p></details>
          <details><summary>Is Organizer Studio a working account?<span aria-hidden="true">+</span></summary><p>The public Studio link opens a visual preview using sample data. It does not provide authentication, saving, publishing, or a connection to live campaign records.</p></details>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title"><p className={styles.eyebrow}>Premium campaigns. Connected operations.</p><h2 id="closing-title">Built for trust.<br /><em>Centered on community.</em></h2><Link className={styles.primary} href={campaignUrl}>Explore Connect ATX Elite <Arrow /></Link></section>
    </main>
    <footer className={styles.footer}><div><Link href="/" aria-label="FutureFunded home"><Brand /></Link><p>Built for the people moving communities forward.</p></div><nav aria-label="Footer navigation"><Link href={campaignUrl}>Featured campaign <Arrow /></Link><Link href={studioUrl}>Studio preview <Arrow /></Link><a href="#top">Back to top ↑</a></nav><div className={styles.footerBottom}><span>© {new Date().getFullYear()} FutureFunded</span><span>Big futures. Built together.</span></div></footer>
  </div>;
}
