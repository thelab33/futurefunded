import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./Home.module.css";

export const metadata: Metadata = {
  title: "FutureFunded | Big futures. Built together.",
  description: "Bring the story, season goal, and community together. Explore FutureFunded through Connect ATX Elite’s campaign and the Organizer Studio preview.",
  alternates: { canonical: "https://getfuturefunded.com/" },
  openGraph: {
    title: "FutureFunded | Big futures. Built together.",
    description: "One clear story. One shared goal. A community behind it.",
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
    <span>FutureFunded<span className={styles.brandDot}>.</span></span>
  </span>;
}

export default function Home() {
  return <div className={styles.page} id="top">
    <a className={styles.skip} href="#home-main">Skip to content</a>
    <header className={styles.header}>
      <Link href="/" aria-label="FutureFunded home"><Brand /></Link>
      <nav className={styles.nav} aria-label="Main navigation">
        <a href="#platform">The platform</a>
        <a href="#featured">Featured campaign</a>
        <Link className={styles.navAction} href={studioUrl}>Studio preview <Arrow /></Link>
      </nav>
    </header>

    <main id="home-main">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> Community, with a common goal</p>
          <h1 id="home-title">Big futures.<br /><em>Built together.</em></h1>
          <p className={styles.lede}>Behind every season is a community that makes it possible. Bring the story, the needs, and the people together in one place.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={campaignUrl}>Explore the campaign <Arrow /></Link>
            <a className={styles.textLink} href="#platform">Meet FutureFunded <span aria-hidden="true">↓</span></a>
          </div>
          <p className={styles.heroNote}>For the people building what comes next.</p>
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

      <div className={styles.audience} aria-label="Who FutureFunded is for"><span>Built around community.</span><p>Teams <i aria-hidden="true">/</i> Schools <i aria-hidden="true">/</i> Clubs <i aria-hidden="true">/</i> Community programs</p></div>

      <section className={styles.platform} id="platform" aria-labelledby="platform-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>The FutureFunded approach</p><h2 id="platform-title">Less scattered.<br /><em>More connected.</em></h2><p>A campaign should help people understand what matters, see where support can help, and find their place in the story.</p></div>
        <div className={styles.principles}>
          <article><span className={styles.number}>01 / The story</span><h3>Make the mission real.</h3><p>Meet the people behind the program through photographs, their story, and the needs that shape a season.</p><span className={styles.articleFoot}>People before numbers</span></article>
          <article><span className={styles.number}>02 / The goal</span><h3>Give the ask a purpose.</h3><p>A clear season goal and a shared plan put gym time, travel, meals, and equipment into context.</p><span className={styles.articleFoot}>One fund. Shared opportunity.</span></article>
          <article><span className={styles.number}>03 / The community</span><h3>Help the story travel.</h3><p>A campaign link and QR code give families, friends, and potential partners a simple place to start.</p><span className={styles.articleFoot}>A link worth passing on</span></article>
        </div>
      </section>

      <section className={styles.featured} id="featured" aria-labelledby="featured-title">
        <div className={styles.featuredPhoto}><Image unoptimized src="/media/connect-atx-elite/6th-gold.webp" alt="Connect ATX Elite athletes and coaches celebrating with medals and a trophy" width={1100} height={850} sizes="(max-width: 760px) 100vw, 50vw" /><span>Featured community / Austin, TX</span></div>
        <div className={styles.featuredCopy}>
          <p className={styles.eyebrow}>See it in the season</p>
          <h2 id="featured-title">More than<br /><em>the game.</em></h2>
          <p>Connect ATX Elite brings youth basketball, mentorship, and community together. Their campaign puts the program’s story and season needs in one shared place.</p>
          <dl className={styles.campaignFacts}><div><dt>Season goal</dt><dd>$20,000</dd></div><div><dt>The mission</dt><dd>Back every athlete.</dd></div></dl>
          <Link className={styles.primary} href={campaignUrl}>Meet Connect ATX Elite <Arrow /></Link>
          <p className={styles.availability}>Campaign available to explore. Giving is not open yet.</p>
        </div>
      </section>

      <section className={styles.studio} id="studio" aria-labelledby="studio-title">
        <div className={styles.studioCopy}><p className={styles.eyebrow}>For the people behind the program</p><h2 id="studio-title">The mission out front.<br /><em>The details in view.</em></h2><p>Explore the direction for Organizer Studio: a dedicated workspace for the people looking after the campaign.</p><Link className={styles.lightLink} href={studioUrl}>Explore the Studio preview <Arrow /></Link><p className={styles.previewNote}>Visual preview with sample data. Saving, publishing, and account access are not enabled.</p></div>
        <div className={styles.studioIllustration} aria-label="Illustration of the Organizer Studio concept, not live campaign data">
          <div className={styles.windowBar}><span aria-hidden="true">● ● ●</span><span>Organizer Studio</span><span className={styles.previewBadge}>Preview</span></div>
          <div className={styles.studioInner}><span className={styles.workspaceLabel}>The campaign workspace</span><strong>One place.<br />A clearer picture.</strong><div className={styles.workspaceRow}><span>Campaign overview</span><span aria-hidden="true">↗</span></div><div className={styles.workspaceRow}><span>Program story &amp; needs</span><span aria-hidden="true">↗</span></div><div className={styles.workspaceRow}><span>Community &amp; communication</span><span aria-hidden="true">↗</span></div><p>Workspace concept · Sample presentation</p></div>
        </div>
      </section>

      <section className={styles.questions} aria-labelledby="questions-title">
        <div><p className={styles.eyebrow}>A little more clarity</p><h2 id="questions-title">Good questions.<br /><em>Clear answers.</em></h2></div>
        <div className={styles.faqs}>
          <details><summary>What is FutureFunded?<span aria-hidden="true">+</span></summary><p>FutureFunded brings a program’s story, season needs, support options, and sharing tools into one campaign experience. Connect ATX Elite is the featured campaign you can explore today.</p></details>
          <details><summary>Can I donate to Connect ATX Elite now?<span aria-hidden="true">+</span></summary><p>Giving is not open yet. You can explore the campaign, review the season goal, and share its public link. The $20,000 figure is the season goal, not an amount raised.</p></details>
          <details><summary>Can I create my own campaign?<span aria-hidden="true">+</span></summary><p>Self-service campaign creation is not available yet. Explore the featured campaign to see the public experience and the Organizer Studio preview to see the workspace concept.</p></details>
          <details><summary>Is Organizer Studio a working account?<span aria-hidden="true">+</span></summary><p>The public Studio link opens a visual preview using sample data. It does not provide authentication, saving, publishing, or a connection to live campaign records.</p></details>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title"><p className={styles.eyebrow}>The next season starts with all of us</p><h2 id="closing-title">A shared goal.<br /><em>A bigger possibility.</em></h2><Link className={styles.primary} href={campaignUrl}>Explore Connect ATX Elite <Arrow /></Link></section>
    </main>
    <footer className={styles.footer}><div><Link href="/" aria-label="FutureFunded home"><Brand /></Link><p>For the people building what comes next.</p></div><nav aria-label="Footer navigation"><Link href={campaignUrl}>Featured campaign <Arrow /></Link><Link href={studioUrl}>Studio preview <Arrow /></Link><a href="#top">Back to top ↑</a></nav><div className={styles.footerBottom}><span>© {new Date().getFullYear()} FutureFunded</span><span>One clear story. One shared goal.</span></div></footer>
  </div>;
}
