import type { Metadata } from "next";
import localFont from "next/font/local";
import { HomeExperience } from "@/components/home/HomeExperience";
import { getCampaignCanonicalUrl } from "@/config/site";

const homeSans = localFont({
  src: "../components/home/fonts/dm-sans.woff2",
  variable: "--font-ff-home-sans",
  weight: "100 900",
  display: "swap",
});
const homeDisplay = localFont({
  src: [
    {
      path: "../components/home/fonts/dm-serif-display.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../components/home/fonts/dm-serif-display-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-ff-home-display",
  display: "swap",
});
export const metadata: Metadata = {
  title: "FutureFunded | Branded fundraising for your community",
  description:
    "Branded fundraising for teams, schools, nonprofits, and community organizations. Explore campaign pages, sponsorship packages, sharing tools, and an organizer workspace preview.",
  alternates: { canonical: "https://getfuturefunded.com/" },
  openGraph: {
    title: "FutureFunded | Your brand. Your fundraising.",
    description:
      "Bring your campaign, sponsors, and community together. Your identity up front. A clear plan behind every ask.",
    url: "https://getfuturefunded.com/",
    type: "website",
    images: [
      {
        url: "https://getfuturefunded.com/media/futurefunded/home/school.webp",
        alt: "Illustrative school campaign imagery: books, pencils, and a classroom globe",
      },
    ],
  },
};
export default function Home() {
  return (
    <div className={`${homeSans.variable} ${homeDisplay.variable}`}>
      <HomeExperience
        canonicalCampaignUrl={getCampaignCanonicalUrl("connect-atx-elite")}
        year={2026}
      />
    </div>
  );
}
