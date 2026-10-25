"use client";
import {
  useEffect,
  useRef,
  useState,
  useId,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import NextLink from "next/link";
import styles from "./HomeExperience.module.css";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Palette,
  UsersThree,
  Megaphone,
  FileText,
  GraduationCap,
  Heart,
  Handshake,
  ShareNetwork,
  Monitor,
  X,
  Plus,
  Minus,
  Check,
  Link,
  Copy,
  List,
  Target,
  ShieldCheck,
  Leaf,
  CalendarBlank,
} from "./HomeIcons";
import { QRCodeSVG } from "qrcode.react";
const CAMPAIGN_URL = "/c/connect-atx-elite";
const STUDIO_URL = "/organizer-preview";
function cx(value = "") {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => styles[name] || name)
    .join(" ");
}
function subscribeToLocation(onChange) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
const brands = {
  school: {
    name: "Cedar Grove School",
    fund: "Cedar Grove Learning Fund",
    title: "More room for possibility.",
    description:
      "Help students learn, create, and take part. Support classroom resources, enrichment, and access to more opportunities.",
    image: "school",
    alt: "Colored pencils and books on a sunlit classroom desk",
    color: "#19394c",
    accent: "#b18138",
    icon: GraduationCap,
    plan: "A clear plan for every student.",
    needs: [
      ["Learning resources", "Books, supplies, and classroom tools", BookOpen],
      ["Enrichment activities", "Arts, STEM, and hands-on learning", Palette],
      ["Student access", "Removing barriers to participation", UsersThree],
    ],
    identity: "A warm, confident identity for a stronger learning community.",
  },
  nonprofit: {
    name: "Harbor Community",
    fund: "Harbor Community Fund",
    title: "Stronger neighborhoods. Together.",
    description:
      "Support welcoming spaces, youth programs, and everyday resources that help neighbors thrive.",
    image: "community",
    alt: "Green vegetables growing in sunlit community garden beds",
    color: "#275447",
    accent: "#827c42",
    icon: Leaf,
    plan: "More opportunity, closer to home.",
    needs: [
      ["Community spaces", "Gardens and places to gather", Leaf],
      ["Youth programs", "Mentorship and after-school support", UsersThree],
      ["Shared resources", "Access to everyday essentials", Heart],
    ],
    identity: "An approachable, grounded identity built around community.",
  },
  arts: {
    name: "Northline Arts",
    fund: "Northline Arts Community Fund",
    title: "Creativity builds community.",
    description:
      "Help more people make, learn, and connect through art. Support materials, open workshops, and local events.",
    image: "arts",
    alt: "Paintbrushes and a watercolor palette on an arts studio desk",
    color: "#8b4230",
    accent: "#a47842",
    icon: Palette,
    plan: "Make room for creative possibility.",
    needs: [
      ["Creative materials", "Supplies for hands-on expression", Palette],
      ["Open workshops", "Accessible opportunities to learn", BookOpen],
      ["Community events", "Bringing local creativity together", UsersThree],
    ],
    identity: "An expressive, welcoming identity for a creative community.",
  },
};
const tabs = [
  { name: "Campaign", icon: FileText },
  { name: "Sponsorship", icon: ShieldCheck },
  { name: "Sharing", icon: ShareNetwork },
  { name: "Organizer preview", icon: UsersThree },
];
function Brand({ small = false, light = false }) {
  return (
    <a
      className={cx(`brand ${small ? "small" : ""} ${light ? "light" : ""}`)}
      href="#top"
      aria-label="FutureFunded home"
    >
      <Image
        src="/media/futurefunded/home/ff-mark.svg"
        alt=""
        width="34"
        height="34"
        sizes="(max-width: 699px) 90vw, (max-width: 959px) 45vw, 33vw"
      />
      <span>
        FutureFunded<span className={cx("brand-dot")}>.</span>
      </span>
    </a>
  );
}
function Action({ children, href, onClick, variant = "", className = "" }) {
  const content = (
    <>
      {children}
      <ArrowRight size={18} aria-hidden="true" />
    </>
  );
  return href ? (
    <NextLink href={href} className={cx(`action ${variant} ${className}`)}>
      {content}
    </NextLink>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={cx(`action ${variant} ${className}`)}
    >
      {content}
    </button>
  );
}
function Eyebrow({ children }) {
  return <p className={cx("eyebrow")}>{children}</p>;
}
function Reveal({ children, className = "", ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const ob = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          ref.current?.classList.add(styles.entered);
          ob.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx(`reveal ${className}`)} {...rest}>
      {children}
    </div>
  );
}
function Modal({ modal, close }) {
  const ref = useRef(null);
  const heading = useId();
  useEffect(() => {
    if (modal) {
      const el = ref.current;
      el.showModal();
      const before = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        el.close();
        document.body.style.overflow = before;
      };
    }
  }, [modal]);
  return (
    <dialog
      ref={ref}
      className={cx("modal")}
      aria-labelledby={heading}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {modal && (
        <>
          <button
            type="button"
            className={cx("icon-button modal-close")}
            aria-label="Close preview"
            onClick={close}
          >
            <X size={23} />
          </button>
          <Eyebrow>{modal.eyebrow || "FutureFunded · Product preview"}</Eyebrow>
          <h2 id={heading}>{modal.title}</h2>
          {modal.content}
          <button type="button" className={cx("action")} onClick={close}>
            Back to the platform
            <ArrowRight size={18} />
          </button>
        </>
      )}
    </dialog>
  );
}
function CampaignPanel({ brand, open, share }) {
  return (
    <div
      className={cx("campaign-layout panel-enter")}
      style={{ "--org": brand.color }}
    >
      <div className={cx("campaign-story")}>
        <h3>{brand.fund}</h3>
        <p className={cx("campaign-line")}>{brand.title}</p>
        <p className={cx("campaign-description")}>{brand.description}</p>
        <div className={cx("campaign-actions")}>
          <Action
            onClick={() =>
              open({
                title: brand.fund,
                eyebrow: "Sample campaign · Illustrative content",
                content: (
                  <>
                    <Image
                      className={cx("modal-photo")}
                      src={`/media/futurefunded/home/${brand.image}.webp`}
                      alt={brand.alt}
                      width={1024}
                      height={1024}
                      sizes="(max-width: 699px) 90vw, (max-width: 959px) 45vw, 33vw"
                    />
                    <p>{brand.description}</p>
                    <h3>A purpose for every contribution</h3>
                    <ul className={cx("simple-list")}>
                      {brand.needs.map(([name, text]) => (
                        <li key={name}>
                          <strong>{name}</strong>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                    <p className={cx("notice")}>
                      This sample demonstrates the campaign experience. It does
                      not collect donations.
                    </p>
                  </>
                ),
              })
            }
          >
            Explore sample
          </Action>
          <button
            type="button"
            className={cx("share-small")}
            aria-label="Preview sharing for Connect ATX Elite"
            onClick={share}
          >
            <ShareNetwork size={17} />
            <span>Try sharing</span>
          </button>
        </div>
      </div>
      <Image
        className={cx("campaign-photo")}
        src={`/media/futurefunded/home/${brand.image}.webp`}
        alt={brand.alt}
        fetchPriority="high"
        width={1024}
        height={1024}
        sizes="(max-width: 699px) 90vw, (max-width: 959px) 45vw, 33vw"
      />
      <div className={cx("campaign-plan")}>
        <Eyebrow>Our plan</Eyebrow>
        <h4>{brand.plan}</h4>
        <div className={cx("needs")}>
          {brand.needs.map(([name, desc, Icon]) => (
            <button
              type="button"
              key={name}
              className={cx("need-row")}
              onClick={() =>
                open({
                  title: name,
                  eyebrow: "Illustrative funding focus",
                  content: (
                    <>
                      <p>
                        {desc}. This focus area shows supporters what the
                        organization is working toward.
                      </p>
                      <p className={cx("notice")}>
                        Sample content for {brand.name}. It is not a verified
                        budget or live appeal.
                      </p>
                    </>
                  ),
                })
              }
            >
              <span className={cx("need-icon")}>
                <Icon size={26} />
              </span>
              <span>
                <strong>{name}</strong>
                <small>{desc}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function SponsorshipPanel({ brand, open }) {
  return (
    <div className={cx("alternate-panel panel-enter")}>
      <div className={cx("panel-intro")}>
        <Eyebrow>Partnership with purpose</Eyebrow>
        <h3>Give local partners a clear way to help.</h3>
        <p>
          Give businesses a clear choice of sponsorship packages and explain
          what each one supports.
        </p>
        <span className={cx("sample-label")}>
          Illustrative packages · No payments collected
        </span>
      </div>
      <div
        className={cx("sponsor-options")}
        aria-label="Sample sponsorship packages"
      >
        {[
          [
            "Community partner",
            "$500",
            "Support materials and everyday program needs.",
          ],
          [
            "Program partner",
            "$1,500",
            "Help make more program experiences possible.",
          ],
          [
            "Mission partner",
            "$3,000",
            "Back a broader season of community opportunity.",
          ],
        ].map(([name, amount, desc]) => (
          <button
            type="button"
            key={name}
            onClick={() =>
              open({
                title: name,
                eyebrow: `${brand.name} · Sample sponsorship`,
                content: (
                  <>
                    <p className={cx("package-amount")}>{amount}</p>
                    <p>{desc}</p>
                    <p>
                      A sponsorship package connects a clear contribution amount
                      with the program needs it supports.
                    </p>
                    <p className={cx("notice")}>
                      This is an illustrative package. No sponsorship is
                      reserved and no payment is processed.
                    </p>
                  </>
                ),
              })
            }
          >
            <Handshake size={25} />
            <span>
              <strong>{name}</strong>
              <small>{desc}</small>
            </span>
            <b>{amount}</b>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}
function SharingPanel({ shareUrl, copied, copy }) {
  return (
    <div className={cx("alternate-panel sharing-panel panel-enter")}>
      <div className={cx("panel-intro")}>
        <Eyebrow>One place to rally support</Eyebrow>
        <h3>One campaign. Ready to share.</h3>
        <p>
          Give your community a clear destination, whether they arrive through a
          link or a QR code.
        </p>
        <span className={cx("sample-label")}>
          This code opens the featured campaign. Local preview links work on
          this device or network.
        </span>
      </div>
      <div className={cx("share-example")}>
        <div>
          <Eyebrow>Featured campaign</Eyebrow>
          <span className={cx("share-org")}>Connect ATX Elite</span>
          <p>Fund the season. Back every athlete.</p>
          <div className={cx("share-link")}>
            <Link size={18} />
            <span>Campaign link · Connect ATX Elite</span>
          </div>
          <button type="button" className={cx("action")} onClick={copy}>
            {copied ? "Link copied" : "Copy campaign link"}
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
          <p className={cx("share-feedback")} role="status">
            {copied
              ? "Campaign link copied."
              : "Share the featured campaign with your community."}
          </p>
        </div>
        {shareUrl ? (
          <div className={cx("qr-card")}>
            <QRCodeSVG
              value={shareUrl}
              size={148}
              level="M"
              bgColor="#ffffff"
              fgColor="#182f43"
              role="img"
              aria-label="QR code to open Connect ATX Elite campaign"
              marginSize={4}
            />
            <span>Scan to view campaign</span>
          </div>
        ) : (
          <span className={cx("sample-label")}>Preparing campaign link…</span>
        )}
      </div>
    </div>
  );
}
function OrganizerPanel({ brand, open }) {
  return (
    <div className={cx("alternate-panel organizer-panel panel-enter")}>
      <div className={cx("panel-intro")}>
        <Eyebrow>Organizer Studio · Visual preview</Eyebrow>
        <h3>Your campaign, behind the scenes.</h3>
        <p>
          Explore a workspace for your campaign story, funding priorities, and
          community updates.
        </p>
        <span className={cx("sample-label")}>
          Sample data · Saving and publishing are not enabled.
        </span>
      </div>
      <div className={cx("studio-example")}>
        <div className={cx("studio-heading")}>
          <Monitor size={22} />
          <strong>{brand.name}</strong>
          <span>Preview</span>
        </div>
        {[
          ["Campaign story", "Shape the story supporters see", FileText],
          ["Funding priorities", "Show where support will go", Target],
          ["Community updates", "Keep your community informed", CalendarBlank],
        ].map(([name, desc, Icon]) => (
          <div className={cx("studio-row")} key={name}>
            <Icon size={22} />
            <span>
              <strong>{name}</strong>
              <small>{desc}</small>
            </span>
          </div>
        ))}
        <NextLink className={cx("text-link studio-route")} href={STUDIO_URL}>
          Open Organizer Studio preview
          <ArrowRight size={17} />
        </NextLink>
        <button
          type="button"
          className={cx("text-link")}
          onClick={() =>
            open({
              title: "A new chapter for your community",
              eyebrow: "Sample update · Preview only",
              content: (
                <>
                  <p>
                    Our next chapter begins with the same purpose: creating more
                    opportunities for our community to participate, learn, and
                    grow.
                  </p>
                  <p>
                    We look forward to sharing program milestones and stories
                    from the people making it possible.
                  </p>
                  <p className={cx("notice")}>
                    This is sample editorial content. No update has been saved,
                    sent, or published.
                  </p>
                </>
              ),
            })
          }
        >
          Preview a community update
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
/** @param {{canonicalCampaignUrl: string | null, year: number, givingOpen?: boolean}} props */
export function HomeExperience({ canonicalCampaignUrl, year, givingOpen=false }) {
  const [activeTab, setActiveTab] = useState(0),
    [brandKey, setBrandKey] = useState("school"),
    [mobileOpen, setMobileOpen] = useState(false),
    [modal, setModal] = useState(null),
    [copied, setCopied] = useState(false),
    [shareError, setShareError] = useState(""),
    [faq, setFaq] = useState(0);
  const brand = brands[brandKey],
    tabRefs = useRef([]),
    brandRefs = useRef([]),
    copyTimer = useRef();
  const shareUrl = useSyncExternalStore(
    subscribeToLocation,
    () =>
      canonicalCampaignUrl ||
      new URL(CAMPAIGN_URL, window.location.origin).toString(),
    () => canonicalCampaignUrl || "",
  );
  const fallbackInput = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setShareError("");
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 4000);
    } catch {
      setShareError(
        "Copy is unavailable in this browser. Select the campaign link below.",
      );
    }
  };
  useEffect(() => {
    if (shareError) {
      fallbackInput.current?.focus();
      fallbackInput.current?.select();
    }
  }, [shareError]);
  const tabKeys = (e) => {
    let i = activeTab;
    if (e.key === "ArrowRight") i = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") i = (i + tabs.length - 1) % tabs.length;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = tabs.length - 1;
    else return;
    e.preventDefault();
    setActiveTab(i);
    tabRefs.current[i]?.focus();
  };
  const brandKeys = (e) => {
    const keys = Object.keys(brands);
    let i = keys.indexOf(brandKey);
    if (e.key === "ArrowRight") i = (i + 1) % keys.length;
    else if (e.key === "ArrowLeft") i = (i + keys.length - 1) % keys.length;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = keys.length - 1;
    else return;
    e.preventDefault();
    setBrandKey(keys[i]);
    brandRefs.current[i]?.focus();
  };
  const questions = [
    [
      "Who is FutureFunded for?",
      "Teams, schools, PTAs, nonprofits, churches, arts programs, clubs, and community organizations with a clear purpose to fund and people to bring together.",
    ],
    [
      "Can FutureFunded reflect our identity?",
      "Yes. The white-label approach puts your organization’s name, colors, imagery, and story first within a consistent FutureFunded system. Switch between the sample identities above to see the approach.",
    ],
    [
      "What can I try today?",
      `Open the Connect ATX Elite campaign, explore sample sponsorship packages, or copy the featured campaign link. Organizer Studio uses sample data with saving and publishing disabled. ${givingOpen?"One-time giving is available on the featured campaign through Stripe.":"Live giving is not open yet."}`,
    ],
  ];
  return (
    <div className={styles.page} data-ff-home="polish-v1-1">
      <a href="#main" className={cx("skip-link")}>
        Skip to content
      </a>
      <header className={cx("header")} id="top">
        <div className={cx("header-inner")}>
          <Brand />
          <nav className={cx("nav")} aria-label="Main navigation">
            <a href="#platform">Platform</a>
            <a href="#communities">Communities</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <Action
            href={CAMPAIGN_URL}
            variant="outline"
            className={cx("header-action")}
          >
            View campaign
          </Action>
          <button
            type="button"
            className={cx("menu-button icon-button")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={25} /> : <List size={25} />}
          </button>
        </div>
        <nav
          className={cx("mobile-nav")}
          id="mobile-navigation"
          aria-label="Mobile navigation"
          hidden={!mobileOpen}
        >
          <a href="#platform" onClick={() => setMobileOpen(false)}>
            Platform
          </a>
          <a href="#communities" onClick={() => setMobileOpen(false)}>
            Communities
          </a>
          <a href="#how-it-works" onClick={() => setMobileOpen(false)}>
            How it works
          </a>
          <NextLink href={CAMPAIGN_URL} onClick={() => setMobileOpen(false)}>
            View campaign
            <ArrowRight size={18} />
          </NextLink>
        </nav>
      </header>
      <main id="main">
        <section className={cx("hero")} aria-labelledby="hero-title">
          <div className={cx("container")}>
            <div className={cx("hero-copy")}>
              <Eyebrow>Fundraising, with your name on it</Eyebrow>
              <h1 id="hero-title">
                <span>Your mission.</span> <span>Your brand.</span>
                <em>One fundraising platform.</em>
              </h1>
              <p>
                Bring your campaign, sponsors, and community together.
                <br className={cx("desktop-break")} /> Your identity up front. A
                clear plan behind every ask.
              </p>
              <div className={cx("hero-actions")}>
                <Action href="#platform" variant="ivory">
                  Explore the platform
                </Action>
                <Action href={CAMPAIGN_URL} variant="text light">
                  View example campaign
                </Action>
              </div>
            </div>
            <div id="platform" className={cx("platform-window")}>
              <h2 className={cx("sr-only")}>
                Explore the FutureFunded platform
              </h2>
              <div className={cx("window-heading")}>
                <Brand small />
                <span className={cx("window-divider")} />
                <span>Interactive platform preview</span>
                <span className={cx("window-note")}>
                  Sample organization · Explore the tabs
                </span>
              </div>
              <div
                role="tablist"
                aria-label="Explore the FutureFunded platform"
                className={cx("product-tabs")}
              >
                <span
                  className={cx("tab-indicator")}
                  style={{ transform: `translateX(${activeTab * 100}%)` }}
                />
                {tabs.map(({ name, icon: Icon }, i) => (
                  <button
                    type="button"
                    key={name}
                    role="tab"
                    id={`product-tab-${i}`}
                    aria-selected={activeTab === i}
                    aria-controls="product-panel"
                    tabIndex={activeTab === i ? 0 : -1}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    onKeyDown={tabKeys}
                    onClick={() => setActiveTab(i)}
                  >
                    <Icon size={21} />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
              <div
                className={cx("product-panel")}
                role="tabpanel"
                id="product-panel"
                aria-labelledby={`product-tab-${activeTab}`}
                tabIndex={0}
              >
                <div
                  key={`${activeTab}-${brandKey}`}
                  className={cx("panel-content")}
                >
                  {activeTab === 0 ? (
                    <CampaignPanel
                      brand={brand}
                      open={setModal}
                      share={() => setActiveTab(2)}
                    />
                  ) : activeTab === 1 ? (
                    <SponsorshipPanel brand={brand} open={setModal} />
                  ) : activeTab === 2 ? (
                    <SharingPanel
                      brand={brand}
                      shareUrl={shareUrl}
                      copied={copied}
                      copy={copy}
                    />
                  ) : (
                    <OrganizerPanel brand={brand} open={setModal} />
                  )}
                </div>
                {shareError && activeTab === 2 && (
                  <div className={cx("copy-fallback")} role="status">
                    <p>{shareError}</p>
                    <input
                      readOnly
                      aria-label="Campaign link"
                      ref={fallbackInput}
                      value={shareUrl}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                )}
              </div>
            </div>
            <p className={cx("audience-line")}>
              For teams, schools, PTAs, nonprofits, churches, arts programs, and
              community groups.
            </p>
          </div>
        </section>
        <section className={cx("proposition section-pad")}>
          <Reveal className={cx("container proposition-grid")}>
            <div>
              <Eyebrow>The FutureFunded platform</Eyebrow>
              <h2>
                Give people a reason to care.<em>And a clear way to help.</em>
              </h2>
              <p className={cx("section-copy")}>
                FutureFunded brings your story, funding priorities, and
                sponsorship opportunities into one branded fundraising
                experience. Help supporters understand who you are, what you
                need, and why their support matters.
              </p>
            </div>
            <div className={cx("benefits")}>
              {[
                [
                  Megaphone,
                  "Your organization, clearly presented",
                  "Put your name, your people, and your purpose at the heart of the campaign.",
                ],
                [
                  FileText,
                  "A plan supporters can understand",
                  "Connect each funding priority to a practical need and the opportunity it creates.",
                ],
                [
                  UsersThree,
                  "A view behind the campaign",
                  "Explore Organizer Studio for campaign content, funding priorities, and updates. Available as a visual preview.",
                ],
              ].map(([Icon, title, text]) => (
                <div key={title} className={cx("benefit")}>
                  <span className={cx("round-icon")}>
                    <Icon size={28} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>
        <section className={cx("identity section-pad")} id="communities">
          <Reveal className={cx("container")}>
            <div className={cx("identity-top")}>
              <div>
                <Eyebrow>Your brand belongs here</Eyebrow>
                <h2>
                  Your organization leads.
                  <em>FutureFunded brings it together.</em>
                </h2>
              </div>
              <div className={cx("identity-intro")}>
                <p>
                  Your name, colors, and story within one consistent platform.
                  Choose a sample below to see how the experience adapts.
                </p>
                <div
                  role="tablist"
                  className={cx("brand-tabs")}
                  aria-label="Try an organization identity"
                >
                  {Object.entries(brands).map(([key, b], i) => (
                    <button
                      type="button"
                      role="tab"
                      key={key}
                      aria-selected={brandKey === key}
                      aria-controls="brand-panel"
                      id={`brand-tab-${key}`}
                      tabIndex={brandKey === key ? 0 : -1}
                      ref={(el) => {
                        brandRefs.current[i] = el;
                      }}
                      onKeyDown={brandKeys}
                      onClick={() => setBrandKey(key)}
                    >
                      <b.icon size={25} />
                      {["Schools", "Nonprofits", "Arts & clubs"][i]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              className={cx("identity-preview")}
              id="brand-panel"
              role="tabpanel"
              aria-labelledby={`brand-tab-${brandKey}`}
              tabIndex={0}
              style={{ "--org": brand.color }}
            >
              <div className={cx("identity-photo-wrap")}>
                <Image
                  key={brandKey}
                  className={cx("identity-photo panel-enter")}
                  src={`/media/futurefunded/home/${brand.image}.webp`}
                  alt={brand.alt}
                  loading="lazy"
                  width={1024}
                  height={1024}
                  sizes="(max-width: 699px) 90vw, (max-width: 959px) 45vw, 33vw"
                />
              </div>
              <div
                className={cx("identity-story panel-enter")}
                key={`story-${brandKey}`}
              >
                <h3>{brand.fund}</h3>
                <p className={cx("campaign-line")}>{brand.title}</p>
                <p>{brand.description}</p>
              </div>
              <div
                className={cx("identity-details")}
                key={`identity-${brandKey}`}
              >
                <Eyebrow>Brand identity</Eyebrow>
                <h3>{brand.name}</h3>
                <div
                  className={cx("swatches")}
                  aria-label="Sample brand palette"
                >
                  <span style={{ background: brand.color }} />
                  <span style={{ background: brand.accent }} />
                  <span
                    style={{
                      background: brandKey === "arts" ? "#c8a88b" : "#668266",
                    }}
                  />
                  <span style={{ background: "#f5f1e6" }} />
                </div>
                <p>{brand.identity}</p>
                <span className={cx("sample-label")}>
                  Illustrative identity
                </span>
              </div>
            </div>
          </Reveal>
        </section>
        <section className={cx("process")} id="how-it-works">
          <Reveal className={cx("container process-grid")}>
            <div>
              <Eyebrow>A clear path to support</Eyebrow>
              <h2>How it works.</h2>
            </div>
            {[
              [
                FileText,
                "Tell your story",
                "Introduce your people, your purpose, and what comes next.",
              ],
              [
                Target,
                "Make the plan clear",
                "Show what needs funding and what each priority makes possible.",
              ],
              [
                UsersThree,
                "Bring people together",
                "Give families, sponsors, and supporters one campaign to share.",
              ],
            ].map(([Icon, title, text], i) => (
              <div className={cx("process-step")} key={title}>
                <span className={cx("step-number")}>0{i + 1}</span>
                <div>
                  <Icon size={28} />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </Reveal>
        </section>
        <section className={cx("example")} id="example">
          <Reveal className={cx("container example-grid")}>
            <div>
              <Eyebrow>Take a closer look</Eyebrow>
              <h2>
                See the campaign.
                <br />
                Explore the workspace.
              </h2>
            </div>
            <div className={cx("example-campaign")}>
              <Image
                src="/media/connect-atx-elite/7th-black.webp"
                alt="Connect ATX Elite athletes gathered in a courtside huddle"
                loading="lazy"
                width={1024}
                height={1024}
                sizes="(max-width: 699px) 90vw, (max-width: 959px) 45vw, 33vw"
              />
              <div>
                <h3>Connect ATX Elite</h3>
                <p>Austin youth basketball.</p>
                <small className={cx("availability")}>{givingOpen?"Giving is open":"Giving not open"}</small>
              </div>
              <Action href={CAMPAIGN_URL}>View campaign</Action>
            </div>
            <NextLink href={STUDIO_URL} className={cx("studio-link")}>
              <Monitor size={30} />
              <span>
                <strong>Organizer Studio preview</strong>
                <small>
                  Sample data. Saving and publishing are not enabled.
                </small>
              </span>
              <ArrowUpRight size={18} />
            </NextLink>
          </Reveal>
        </section>
        <section className={cx("faq")}>
          <Reveal className={cx("container faq-grid")}>
            <div>
              <Eyebrow>Common questions</Eyebrow>
              <h2>Quick answers.</h2>
            </div>
            <div>
              {questions.map(([question, answer], i) => (
                <div
                  key={question}
                  className={cx(`faq-item ${faq === i ? "expanded" : ""}`)}
                >
                  <h3>
                    <button
                      type="button"
                      aria-expanded={faq === i}
                      aria-controls={`answer-${i}`}
                      id={`question-${i}`}
                      onClick={() => setFaq(faq === i ? -1 : i)}
                    >
                      <span className={cx("faq-symbol")}>
                        {faq === i ? <Minus size={17} /> : <Plus size={17} />}
                      </span>
                      <span>{question}</span>
                    </button>
                  </h3>
                  <div
                    className={cx("faq-answer")}
                    id={`answer-${i}`}
                    role="region"
                    aria-labelledby={`question-${i}`}
                    hidden={faq !== i}
                  >
                    <p>{answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>
        <section className={cx("closing")}>
          <div className={cx("container closing-inner")}>
            <div className={cx("closing-copy")}>
              <h2>
                A clearer way to <em>rally support.</em>
              </h2>
              <p>Start with the campaign. See the work behind it.</p>
            </div>
            <div className={cx("closing-actions")}>
              <Action href={CAMPAIGN_URL} variant="ivory">
                View example campaign
              </Action>
              <Action href={STUDIO_URL} variant="outline light">
                Preview Organizer Studio
              </Action>
            </div>
          </div>
        </section>
      </main>
      <footer className={cx("footer")}>
        <div className={cx("container footer-inner")}>
          <Brand small light />
          <nav aria-label="Footer navigation">
            <a href="#platform">Platform</a>
            <a href="#communities">Communities</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <p>Big futures. Built together.</p>
          <small>© {year} FutureFunded</small>
        </div>
      </footer>
      <Modal modal={modal} close={() => setModal(null)} />
    </div>
  );
}
