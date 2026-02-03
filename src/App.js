// App.js
import React, { useState, useEffect, useMemo } from "react";
import styled, { createGlobalStyle, keyframes } from "styled-components";

/* -------------------------------------------------------
   CONFIG – this replaces your CONFIG constant in <script>
-------------------------------------------------------- */

const CONFIG = {
  platformName: "FutureFunded",
  org: {
    name: "Connect ATX Elite",
    segment: "6th–8th grade AAU basketball",
    city: "Austin",
    state: "TX",
    country: "US",
  },
  campaign: {
    title: "Season Fundraiser",
    goal: 25000,
    raised: 18430,
    supporters: 126,
    seasonWindowEnd: "2026-03-15T23:59:59-05:00",
  },
  currency: "USD",
};

/* -------------------------------------------------------
   GLOBAL STYLE & THEME TOKENS
-------------------------------------------------------- */

const GlobalStyle = createGlobalStyle`
  :root {
    --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-scale: 1;

    --font-size-xs: calc(0.75rem * var(--font-scale));
    --font-size-sm: calc(0.875rem * var(--font-scale));
    --font-size-md: calc(1rem * var(--font-scale));
    --font-size-lg: calc(1.125rem * var(--font-scale));
    --font-size-xl: calc(1.5rem * var(--font-scale));
    --font-size-2xl: calc(2rem * var(--font-scale));
    --font-size-3xl: calc(2.5rem * var(--font-scale));

    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.5rem;
    --space-6: 2rem;
    --space-7: 2.5rem;
    --space-8: 3rem;
    --space-9: 4rem;

    --radius-sm: 0.375rem;
    --radius-md: 0.75rem;
    --radius-lg: 1.25rem;
    --radius-pill: 999px;

    --transition-fast: 120ms ease-out;
    --transition-med: 200ms ease-out;
    --transition-slow: 320ms ease-out;

    --brand-black: #020617;
    --brand-gold: #fdb927;
    --brand-red:  #ce1141;

    --accent-gold: var(--brand-gold);
    --accent-red:  var(--brand-red);
    --accent-success: #22c55e;

    --gradient-cta: linear-gradient(
      90deg,
      rgba(206, 17, 65, 1) 0%,
      rgba(206, 17, 65, 0.96) 24%,
      rgba(253, 185, 39, 0.98) 100%
    );

    --gradient-cta-alt: linear-gradient(
      90deg,
      var(--accent-gold) 0%,
      var(--accent-red) 100%
    );

    --gradient-progress: linear-gradient(
      90deg,
      var(--accent-gold),
      var(--accent-red)
    );

    --announcement-height: 0px;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body, #root {
    margin: 0;
    padding: 0;
    height: 100%;
  }

  body {
    font-family: var(--font-sans);
    font-size: var(--font-size-md);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(circle at top, rgba(15, 23, 42, 0.95), transparent 55%),
      radial-gradient(circle at bottom, rgba(206, 17, 65, 0.2), transparent 55%),
      #020617;
    color: #f9fafb;
  }

  body[data-theme="light"] {
    background:
      radial-gradient(circle at top, rgba(206, 17, 65, 0.06), transparent 55%),
      radial-gradient(circle at bottom, rgba(253, 185, 39, 0.18), transparent 55%),
      #faf5ef;
    color: #0b1220;
  }

  a {
    color: var(--accent-gold);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  button {
    font-family: inherit;
  }

  :focus-visible {
    outline: 2px solid var(--accent-gold);
    outline-offset: 3px;
  }
`;

/* -------------------------------------------------------
   ANIMATIONS
-------------------------------------------------------- */

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const growBar = keyframes`
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
`;

/* -------------------------------------------------------
   LAYOUT PRIMITIVES
-------------------------------------------------------- */

const PageShell = styled.div`
  min-height: 100vh;
  background-image:
    radial-gradient(circle at 10% 0%, rgba(253, 185, 39, 0.22), transparent 55%),
    radial-gradient(circle at 90% 100%, rgba(206, 17, 65, 0.22), transparent 55%);
`;

const Shell = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 var(--space-4);

  @media (min-width: 768px) {
    padding: 0 var(--space-6);
  }
`;

const Section = styled.section`
  margin-bottom: var(--space-8);

  &:last-of-type {
    margin-bottom: var(--space-6);
  }
`;

const SectionHeader = styled.header`
  margin-bottom: var(--space-5);
`;

const SectionEyebrow = styled.p`
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--accent-gold);
  margin: 0 0 var(--space-2);
`;

const SectionTitle = styled.h2`
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-xl);
  line-height: 1.1;
`;

const SectionSubtitle = styled.p`
  margin: 0;
  font-size: var(--font-size-sm);
  color: rgba(148, 163, 184, 1);
  max-width: 34rem;

  body[data-theme="light"] & {
    color: #4b5563;
  }
`;

const Card = styled.div`
  border-radius: 1.5rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.98);
  padding: var(--space-4);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.9);
  animation: ${fadeInUp} 260ms var(--transition-med);

  body[data-theme="light"] & {
    background: #ffffff;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
  }
`;

const Button = styled.button`
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  padding: 0.6rem 1.1rem;
  font-size: var(--font-size-sm);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  white-space: nowrap;
  cursor: pointer;
  transition: transform var(--transition-fast),
    box-shadow var(--transition-med),
    filter var(--transition-med);

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
  }

  &:active {
    transform: translateY(0);
    filter: brightness(0.98);
  }
`;

const ButtonPrimary = styled(Button)`
  background: var(--gradient-cta);
  color: #111827;
  box-shadow: 0 0 32px rgba(253, 185, 39, 0.55);
`;

const ButtonOutline = styled(Button)`
  background: rgba(15, 23, 42, 0.9);
  border-color: rgba(148, 163, 184, 0.6);
  color: #e5e7eb;

  body[data-theme="light"] & {
    background: #ffffff;
    color: #111827;
  }
`;

const ButtonGhost = styled(Button)`
  background: transparent;
  border-color: transparent;
  color: rgba(148, 163, 184, 0.9);

  &:hover {
    background: rgba(15, 23, 42, 0.5);

    body[data-theme="light"] & {
      background: rgba(15, 23, 42, 0.06);
    }
  }
`;

const Pill = styled.span`
  border-radius: var(--radius-pill);
  padding: 0.1rem 0.55rem;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
`;

/* -------------------------------------------------------
   ANNOUNCEMENT BAR
-------------------------------------------------------- */

const AnnouncementBarShell = styled.div`
  position: sticky;
  top: 0;
  z-index: 40;
  background: linear-gradient(90deg, rgba(5, 7, 18, 0.96), rgba(15, 23, 42, 0.96));
  border-bottom: 1px solid rgba(156, 163, 175, 0.35);
  color: #e5e7eb;

  body[data-theme="light"] & {
    background: linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(253, 185, 39, 0.92));
  }
`;

const AnnouncementInner = styled(Shell)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
`;

const AnnouncementMain = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  font-size: var(--font-size-sm);
`;

const AnnouncementText = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AnnouncementPill = styled(Pill)`
  background: rgba(15, 23, 42, 0.8);
  color: var(--accent-gold);
  border: 1px solid rgba(248, 250, 252, 0.18);
`;

const AnnouncementDismiss = styled.button`
  border: none;
  background: transparent;
  color: rgba(148, 163, 184, 0.9);
  font-size: 1rem;
  padding: 0.125rem;
  line-height: 1;
  border-radius: var(--radius-pill);
  cursor: pointer;

  &:hover {
    color: #e5e7eb;
    background: rgba(15, 23, 42, 0.3);
  }
`;

/* -------------------------------------------------------
   HEADER
-------------------------------------------------------- */

const SiteHeader = styled.header`
  position: sticky;
  top: var(--announcement-height);
  z-index: 30;
  backdrop-filter: blur(18px);
  background: linear-gradient(to bottom, rgba(5, 7, 18, 0.96), rgba(9, 9, 20, 0.92));

  body[data-theme="light"] & {
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.96), rgba(250, 245, 239, 0.96));
  }
`;

const SiteHeaderInner = styled(Shell)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
`;

const BrandLockup = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
`;

const BrandBadge = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 1rem;
  background:
    radial-gradient(circle at 30% 0%, rgba(248, 250, 252, 0.9), transparent 60%),
    radial-gradient(circle at 70% 100%, var(--accent-gold), transparent 60%),
    #020617;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  font-weight: 800;
  font-size: var(--font-size-sm);
  box-shadow: 0 0 42px rgba(253, 185, 39, 0.55);
  border: 1px solid rgba(248, 250, 252, 0.6);
  text-transform: uppercase;
`;

const BrandText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const BrandNameRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  white-space: nowrap;
`;

const BrandNameMain = styled.span`
  font-weight: 600;
  color: #e5e7eb;

  body[data-theme="light"] & {
    color: #111827;
  }
`;

const BrandNameSecondary = styled.span`
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 1);
`;

const BrandMeta = styled.div`
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HeaderNav = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-4);
`;

const NavList = styled.ul`
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (min-width: 768px) {
    display: flex;
    gap: var(--space-3);
  }
`;

const NavLink = styled.a`
  position: relative;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(148, 163, 184, 1);
  padding-bottom: 0.15rem;

  &:hover {
    color: #e5e7eb;
    text-decoration: none;
  }

  &::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -0.4rem;
    height: 2px;
    width: 0;
    border-radius: 999px;
    background: var(--gradient-cta-alt);
    transition: width var(--transition-med);
  }

  &[data-active="true"]::after {
    width: 100%;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
`;

/* -------------------------------------------------------
   PROGRESS STRIP
-------------------------------------------------------- */

const ProgressStrip = styled.div`
  border-top: 1px solid rgba(15, 23, 42, 0.9);
  border-bottom: 1px solid rgba(15, 23, 42, 0.9);
  background: linear-gradient(to right, rgba(5, 7, 18, 0.95), rgba(15, 23, 42, 0.92));

  body[data-theme="light"] & {
    background: linear-gradient(to right, rgba(255, 255, 255, 0.98), rgba(250, 245, 239, 0.98));
  }
`;

const ProgressStripInner = styled(Shell)`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-2);
  padding-bottom: var(--space-2);
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

const ProgressStripMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: space-between;
  align-items: center;
`;

const ProgressLabel = styled.span`
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.7rem;
  color: rgba(148, 163, 184, 1);
`;

const ProgressSummary = styled.span`
  color: #e5e7eb;

  body[data-theme="light"] & {
    color: #111827;
  }

  strong {
    color: var(--accent-gold);
    font-weight: 600;
  }
`;

const ProgressBarOuter = styled.div`
  position: relative;
  height: 0.4rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.8);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.4);

  body[data-theme="light"] & {
    background: rgba(229, 231, 235, 0.9);
  }
`;

const ProgressBarInner = styled.div`
  position: absolute;
  inset: 0;
  transform-origin: left center;
  transform: ${({ ratio }) => `scaleX(${ratio})`};
  background: var(--gradient-progress);
  box-shadow: 0 0 18px rgba(253, 185, 39, 0.5);
  animation: ${growBar} 600ms var(--transition-slow);
`;

/* -------------------------------------------------------
   HERO SECTION
-------------------------------------------------------- */

const Hero = styled(Section)`
  margin-top: var(--space-6);
`;

const HeroGrid = styled.div`
  display: grid;
  gap: var(--space-5);

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    align-items: stretch;
  }
`;

const HeroMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const HeroBadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: rgba(148, 163, 184, 1);
`;

const HeroBadgeDot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 0%, var(--accent-gold), var(--accent-red));
  box-shadow: 0 0 10px rgba(253, 185, 39, 0.9);
`;

const HeroHeading = styled.h1`
  font-size: var(--font-size-3xl);
  line-height: 1.1;
  margin: 0 0 var(--space-2);

  @media (min-width: 768px) {
    font-size: 2.75rem;
  }
`;

const HeroSubtitle = styled.p`
  font-size: var(--font-size-md);
  color: #e5e7eb;
  margin: 0 0 var(--space-3);
  max-width: 34rem;

  body[data-theme="light"] & {
    color: #4b5563;
  }
`;

const HeroBody = styled.div`
  font-size: var(--font-size-sm);
  color: rgba(148, 163, 184, 1);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 36rem;
`;

const HeroCtaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
`;

const HeroTrustList = styled.ul`
  margin: 0;
  padding-left: 1.1rem;
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

const HeroMetaRow = styled.div`
  margin-top: var(--space-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

const HeroFocusText = styled.span`
  color: rgba(148, 163, 184, 1);
`;

const HeroAside = styled(Card).attrs({ as: "aside" })`
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle at top left, rgba(253, 185, 39, 0.18), transparent 55%),
    radial-gradient(circle at bottom right, rgba(206, 17, 65, 0.2), transparent 55%),
    #020617;

  body[data-theme="light"] & {
    background: radial-gradient(circle at top left, rgba(206, 17, 65, 0.08), transparent 55%),
      #ffffff;
  }
`;

const HeroAsideInner = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const HeroStatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
`;

const HeroStat = styled.div`
  padding: var(--space-3);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.45);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.65);

  body[data-theme="light"] & {
    background: rgba(255, 255, 255, 0.96);
  }
`;

const HeroStatLabel = styled.div`
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(148, 163, 184, 1);
  margin-bottom: 0.3rem;
`;

const HeroStatValue = styled.div`
  font-size: var(--font-size-lg);
  font-weight: 600;
`;

const HeroStatHint = styled.div`
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

const HeroProgressShell = styled.div`
  padding: var(--space-3);
  border-radius: 1rem;
  background: radial-gradient(circle at top, rgba(248, 250, 252, 0.08), transparent 65%);
  border: 1px solid rgba(156, 163, 175, 0.6);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.65);

  body[data-theme="light"] & {
    background: radial-gradient(circle at top, rgba(206, 17, 65, 0.08), transparent 65%),
      #ffffff;
  }
`;

const HeroProgressBarOuter = styled.div`
  padding: 1px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.5),
    rgba(206, 17, 65, 0.9),
    rgba(253, 185, 39, 0.95)
  );
`;

const HeroProgressBarInner = styled.div`
  position: relative;
  height: 0.55rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.95);
  overflow: hidden;

  body[data-theme="light"] & {
    background: rgba(15, 23, 42, 0.9);
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    transform-origin: left center;
    transform: ${({ ratio }) => `scaleX(${ratio})`};
    background: var(--gradient-progress);
    box-shadow: 0 0 18px rgba(253, 185, 39, 0.9);
    animation: ${growBar} 600ms var(--transition-slow);
  }
`;

const HeroProgressSummary = styled.div`
  font-size: var(--font-size-xs);
  color: #e5e7eb;
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;

  body[data-theme="light"] & {
    color: #111827;
  }
`;

const HeroCountdownPill = styled(Pill)`
  align-self: flex-start;
  padding: 0.25rem 0.8rem;
  border: 1px solid rgba(249, 250, 251, 0.2);
  background: rgba(15, 23, 42, 0.85);
  color: var(--accent-gold);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;

  body[data-theme="light"] & {
    background: rgba(15, 23, 42, 0.9);
    color: #fef9c3;
  }
`;

const HeroCountdownDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent-gold);
  box-shadow: 0 0 10px rgba(253, 185, 39, 0.9);
`;

/* -------------------------------------------------------
   TEAMS SECTION (simplified, still premium)
-------------------------------------------------------- */

const TeamsHeaderRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);

  @media (min-width: 768px) {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
`;

const TeamsFilter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

const Select = styled.select`
  border-radius: var(--radius-pill);
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: rgba(15, 23, 42, 0.95);
  color: #e5e7eb;
  padding: 0.4rem 0.8rem;
  font-size: var(--font-size-sm);

  body[data-theme="light"] & {
    background: #ffffff;
    color: #111827;
  }
`;

const TeamsGallery = styled.div`
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  padding-bottom: var(--space-3);
  padding-top: var(--space-1);
  scroll-snap-type: x mandatory;
`;

const TeamCard = styled.article`
  scroll-snap-align: start;
  min-width: 260px;
  max-width: 280px;
  background: rgba(15, 23, 42, 0.98);
  border-radius: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.45);
  overflow: hidden;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.65);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  transition:
    transform var(--transition-med),
    box-shadow var(--transition-med),
    opacity var(--transition-med),
    border-color var(--transition-med);

  ${({ dimmed }) =>
    dimmed &&
    `
      opacity: 0.5;
      transform: translateY(0) scale(0.98);
      box-shadow: none;
    `}

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.9);
    border-color: rgba(206, 17, 65, 0.85);
  }

  body[data-theme="light"] & {
    background: #ffffff;
  }
`;

const TeamCardMedia = styled.div`
  position: relative;
  height: 140px;
  background-image:
    linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.6)),
    radial-gradient(circle at 10% 10%, rgba(253, 185, 39, 0.9), transparent 55%),
    radial-gradient(circle at 80% 80%, rgba(206, 17, 65, 0.85), transparent 55%);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: var(--space-3);
`;

const TeamCourt = styled.div`
  width: 60%;
  height: 60%;
  border-radius: 1rem;
  border: 2px solid rgba(249, 250, 251, 0.75);
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.6),
    0 12px 24px rgba(15, 23, 42, 0.9);
  position: relative;
  overflow: hidden;

  &::before,
  &::after {
    content: "";
    position: absolute;
    inset: 12%;
    border-radius: 999px;
    border: 1px dashed rgba(249, 250, 251, 0.6);
  }
`;

const TeamBall = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 20%, #fff8db, #fdb927);
  box-shadow: 0 0 18px rgba(253, 185, 39, 0.9);
  border: 1px solid rgba(15, 23, 42, 0.8);
  transform: translateY(8px);
`;

const TeamBody = styled.div`
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const TeamTagline = styled.div`
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(148, 163, 184, 1);
`;

const TeamTitle = styled.h3`
  font-size: var(--font-size-md);
  margin: 0;
`;

const TeamHook = styled.p`
  font-size: var(--font-size-sm);
  color: rgba(148, 163, 184, 1);
  margin: 0;
`;

const TeamMetaPills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: var(--space-1);
`;

const MetaPill = styled(Pill)`
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: rgba(148, 163, 184, 1);
  background: rgba(15, 23, 42, 0.8);

  ${({ soft }) =>
    soft &&
    `
      background: rgba(206, 17, 65, 0.12);
      border-color: rgba(206, 17, 65, 0.65);
      color: var(--accent-gold);
    `}

  body[data-theme="light"] & {
    background: #f9fafb;
  }
`;

/* -------------------------------------------------------
   IMPACT TILES
-------------------------------------------------------- */

const ImpactTiles = styled.div`
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-3);

  @media (min-width: 640px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const ImpactTile = styled.button`
  border: none;
  text-align: left;
  border-radius: 1.25rem;
  padding: var(--space-3);
  border: 1px solid rgba(148, 163, 184, 0.5);
  background: radial-gradient(circle at top left, rgba(206, 17, 65, 0.16), transparent 55%),
    rgba(15, 23, 42, 0.9);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.65);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-start;
  color: #e5e7eb;
  cursor: pointer;
  transition:
    transform var(--transition-med),
    box-shadow var(--transition-med),
    border-color var(--transition-med),
    background var(--transition-med);

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.9);
    border-color: rgba(206, 17, 65, 0.9);
    background: radial-gradient(circle at top left, rgba(206, 17, 65, 0.24), transparent 55%),
      rgba(15, 23, 42, 0.96);
  }

  body[data-theme="light"] & {
    background: radial-gradient(circle at top left, rgba(206, 17, 65, 0.08), transparent 55%),
      #ffffff;
    color: #111827;
  }
`;

const ImpactAmount = styled.div`
  font-size: var(--font-size-xl);
  font-weight: 600;
`;

const ImpactLabel = styled.div`
  font-size: var(--font-size-sm);
  color: var(--accent-gold);
  text-transform: uppercase;
  letter-spacing: 0.12em;
`;

const ImpactBody = styled.p`
  font-size: var(--font-size-sm);
  color: rgba(148, 163, 184, 1);
  margin: 0;

  body[data-theme="light"] & {
    color: #4b5563;
  }
`;

const ImpactPerfect = styled.p`
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
  margin: 0;
`;

/* -------------------------------------------------------
   DONATION FORM
-------------------------------------------------------- */

const DonateGrid = styled.div`
  display: grid;
  gap: var(--space-4);

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr);
    align-items: flex-start;
  }
`;

const FormGrid = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const FieldLabel = styled.label`
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(148, 163, 184, 1);
`;

const FauxFieldLabel = styled.div`
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(148, 163, 184, 1);
`;

const Input = styled.input`
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  padding: 0.6rem 0.8rem;
  background: rgba(15, 23, 42, 0.9);
  color: #e5e7eb;
  font-size: var(--font-size-sm);

  body[data-theme="light"] & {
    background: #ffffff;
    color: #111827;
  }

  &::placeholder {
    color: rgba(148, 163, 184, 1);
  }

  ${({ invalid }) =>
    invalid &&
    `
      border-color: rgba(206, 17, 65, 0.9);
      box-shadow: 0 0 0 1px rgba(206, 17, 65, 0.9);
    `}
`;

const Textarea = styled.textarea`
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  padding: 0.6rem 0.8rem;
  background: rgba(15, 23, 42, 0.9);
  color: #e5e7eb;
  font-size: var(--font-size-sm);
  resize: vertical;
  min-height: 80px;

  body[data-theme="light"] & {
    background: #ffffff;
    color: #111827;
  }

  &::placeholder {
    color: rgba(148, 163, 184, 1);
  }

  ${({ invalid }) =>
    invalid &&
    `
      border-color: rgba(206, 17, 65, 0.9);
      box-shadow: 0 0 0 1px rgba(206, 17, 65, 0.9);
    `}
`;

const FieldError = styled.p`
  display: ${({ visible }) => (visible ? "block" : "none")};
  font-size: var(--font-size-xs);
  color: var(--accent-red);
  margin: 0;
`;

const AmountRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const AmountInputWrap = styled.div`
  display: flex;
  align-items: center;
  border-radius: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  background: rgba(15, 23, 42, 0.9);
  overflow: hidden;

  body[data-theme="light"] & {
    background: #ffffff;
  }
`;

const AmountPrefix = styled.span`
  padding: 0.6rem 0.75rem 0.6rem 0.9rem;
  font-size: var(--font-size-md);
  color: rgba(148, 163, 184, 1);
`;

const AmountInput = styled.input`
  border: none;
  outline: none;
  background: transparent;
  color: #e5e7eb;
  font-size: var(--font-size-md);
  padding-right: 0.8rem;
  width: 100%;

  body[data-theme="light"] & {
    color: #111827;
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  ${({ invalid }) =>
    invalid &&
    `
      color: var(--accent-red);
    `}
`;

const AmountChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const Chip = styled.button`
  border-radius: var(--radius-pill);
  padding: 0.3rem 0.65rem;
  font-size: var(--font-size-xs);
  border: 1px solid rgba(148, 163, 184, 0.5);
  background: rgba(15, 23, 42, 0.9);
  color: rgba(148, 163, 184, 1);
  cursor: pointer;

  body[data-theme="light"] & {
    background: #ffffff;
  }

  &:hover {
    border-color: rgba(206, 17, 65, 0.9);
    color: var(--accent-gold);
  }
`;

const ToggleGroup = styled.div`
  display: inline-flex;
  border-radius: var(--radius-pill);
  padding: 0.15rem;
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: rgba(15, 23, 42, 0.9);

  body[data-theme="light"] & {
    background: #f9fafb;
  }
`;

const ToggleButton = styled.button`
  border-radius: var(--radius-pill);
  border: none;
  padding: 0.3rem 0.8rem;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${({ active }) => (active ? "#111827" : "rgba(148, 163, 184, 1)")};
  background: ${({ active }) => (active ? "var(--gradient-cta-alt)" : "transparent")};
  cursor: pointer;
`;

const HelpText = styled.p`
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
  margin: 0.3rem 0 0;
`;

const FormFooter = styled.div`
  margin-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

const DonationStatsGrid = styled.div`
  display: grid;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: rgba(148, 163, 184, 1);

  strong {
    color: #e5e7eb;

    body[data-theme="light"] & {
      color: #111827;
    }
  }
`;

const DonationTagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: var(--font-size-xs);
`;

const DonationTag = styled(Pill)`
  border: 1px solid rgba(148, 163, 184, 0.6);
  color: rgba(148, 163, 184, 1);
  background: rgba(15, 23, 42, 0.8);

  body[data-theme="light"] & {
    background: rgba(255, 255, 255, 0.96);
  }
`;

/* -------------------------------------------------------
   SPONSORS (simplified but same concept)
-------------------------------------------------------- */

const SponsorsGrid = styled.div`
  display: grid;
  gap: var(--space-4);

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    align-items: flex-start;
  }
`;

const SponsorList = styled.ol`
  list-style: none;
  margin: var(--space-3) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const SponsorCard = styled.li`
  border-radius: 1.1rem;
  padding: var(--space-3);
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: rgba(15, 23, 42, 0.9);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  position: relative;
  overflow: hidden;

  ${({ top }) =>
    top &&
    `
      border-color: var(--accent-gold);
      box-shadow: 0 0 32px rgba(253, 185, 39, 0.55);
    `}

  body[data-theme="light"] & {
    background: #111827;
    color: #f9fafb;
  }
`;

const SponsorRank = styled.div`
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--accent-gold);
`;

const SponsorMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const SponsorName = styled.div`
  font-weight: 600;
  font-size: var(--font-size-sm);
`;

const SponsorMessage = styled.p`
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
  margin: 0;
`;

const SponsorAmount = styled.div`
  font-weight: 600;
  font-size: var(--font-size-sm);
`;

const TierList = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
`;

const TierHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
`;

const TierName = styled.div`
  font-weight: 600;
  font-size: var(--font-size-md);
`;

const TierRange = styled.div`
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(148, 163, 184, 1);
`;

const TierBenefits = styled.ul`
  margin: 0 0 var(--space-2);
  padding-left: 1.1rem;
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

const TierCta = styled.p`
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

/* -------------------------------------------------------
   MEMBERSHIPS & HOW IT WORKS
-------------------------------------------------------- */

const TabsWrapper = styled(Card)`
  padding: var(--space-3);

  @media (min-width: 768px) {
    padding: var(--space-4);
  }
`;

const TabList = styled.div`
  display: inline-flex;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(148, 163, 184, 0.6);
  padding: 0.15rem;
  background: rgba(15, 23, 42, 0.9);

  body[data-theme="light"] & {
    background: #f9fafb;
  }
`;

const TabButton = styled.button`
  border-radius: var(--radius-pill);
  border: none;
  padding: 0.35rem 0.9rem;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: ${({ active }) => (active ? "#111827" : "rgba(148, 163, 184, 1)")};
  background: ${({ active }) => (active ? "var(--gradient-cta-alt)" : "transparent")};
  cursor: pointer;
`;

const TabPanel = styled.div`
  margin-top: var(--space-3);
  font-size: var(--font-size-sm);
  color: rgba(148, 163, 184, 1);

  body[data-theme="light"] & {
    color: #4b5563;
  }
`;

const MembershipGrid = styled(DonateGrid)`
  margin-top: var(--space-3);

  @media (min-width: 900px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

/* -------------------------------------------------------
   QR & SHARE – simplified visual
-------------------------------------------------------- */

const QrSectionCard = styled(Card)`
  border-style: dashed;
`;

const QrGrid = styled.div`
  display: grid;
  gap: var(--space-4);

  @media (min-width: 768px) {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    align-items: center;
  }
`;

const QrVisualWrap = styled.div`
  display: flex;
  justify-content: center;
`;

const QrVisual = styled.div`
  width: 176px;
  height: 176px;
  border-radius: 1.25rem;
  border: 2px solid rgba(248, 250, 252, 0.9);
  background: radial-gradient(circle at center, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.98));
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.9);
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: repeat(12, 1fr);
  gap: 2px;
  padding: 18px;
`;

const QrCell = styled.div`
  border-radius: 2px;
  background: ${({ accent }) => (accent ? "var(--accent-red)" : "#020617")};
`;

/* -------------------------------------------------------
   FOOTER, MOBILE CTA, TOAST, BACK TO TOP
-------------------------------------------------------- */

const SiteFooter = styled.footer`
  border-top: 1px solid rgba(15, 23, 42, 0.9);
  padding-top: var(--space-4);
  padding-bottom: var(--space-6);
  font-size: var(--font-size-xs);
  color: rgba(148, 163, 184, 1);
`;

const FooterInner = styled(Shell)`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  @media (min-width: 640px) {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
`;

const FooterLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
`;

const MobileCtaBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0.5rem;
  z-index: 35;
  display: flex;
  justify-content: center;
  pointer-events: none;

  @media (min-width: 768px) {
    display: none;
  }
`;

const MobileCtaInner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  background: radial-gradient(circle at top left, rgba(253, 185, 39, 0.25), transparent 55%),
    rgba(15, 23, 42, 0.96);
  border-radius: 999px;
  box-shadow: 0 0 32px rgba(253, 185, 39, 0.55);
  border: 1px solid rgba(253, 185, 39, 0.9);
  padding: 0.5rem 0.8rem 0.5rem 1rem;
  max-width: 480px;
  width: calc(100% - 1.5rem);
  pointer-events: auto;
  font-size: var(--font-size-xs);
`;

const MobileCtaText = styled.div`
  color: #e5e7eb;

  strong {
    color: var(--accent-gold);
  }
`;

const Toast = styled.div`
  position: fixed;
  left: 50%;
  bottom: 4.5rem;
  transform: translateX(-50%) translateY(20px);
  background: rgba(15, 23, 42, 0.98);
  color: #e5e7eb;
  border-radius: var(--radius-pill);
  padding: 0.55rem 1.05rem;
  font-size: var(--font-size-xs);
  border: 1px solid rgba(148, 163, 184, 0.65);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.9);
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: none;
  transition:
    opacity var(--transition-med),
    transform var(--transition-med);
  max-width: 90%;
  text-align: center;
  z-index: 45;
  transform: ${({ visible }) =>
    visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(20px)"};

  @media (min-width: 768px) {
    bottom: 2.5rem;
  }
`;

const BackToTopButton = styled.button`
  position: fixed;
  right: 1rem;
  bottom: 1.25rem;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.95);
  color: var(--accent-gold);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transform: ${({ visible }) => (visible ? "translateY(0)" : "translateY(8px)")};
  transition:
    opacity var(--transition-med),
    transform var(--transition-med);
  z-index: 40;
`;

/* -------------------------------------------------------
   MAIN APP
-------------------------------------------------------- */

const teams = [
  {
    key: "6g",
    label: "6th Grade • Foundation squad",
    tagline: "6th grade • foundation",
    title: "6th Foundation • First step in the system",
    hook: "Fundamentals, friendships, and learning how to compete the right way — on and off the court.",
    tags: ["Skill reps", "Scholarship access"],
  },
  {
    key: "7g",
    label: "7th Grade • Gold squad",
    tagline: "7th grade • gold",
    title: "7th Gold • Ready for the big brackets",
    hook: "Travel-heavy schedule, film study, and leadership reps for athletes starting to dream about high school roles.",
    tags: ["Travel tournaments", "Film breakdown"],
  },
  {
    key: "8g",
    label: "8th Grade • Elite squad",
    tagline: "8th grade • elite",
    title: "8th Elite • High school ready",
    hook: "College-style prep: strength, speed work, and competitive showcases that set the stage for the next level.",
    tags: ["Showcase events", "Strength training"],
  },
  {
    key: "allstars",
    label: "Mixed • Showcase squad",
    tagline: "mixed • all-stars",
    title: "Showcase • Invite-only group",
    hook: "Select athletes across age groups combining for high-visibility tournaments and exposure weekends.",
    tags: ["Exposure events", "Travel scholarships"],
  },
];

const impactOptions = [
  {
    amount: 25,
    label: "High-rep session",
    body: "Covers one high-intensity practice slot: gym time, equipment, and coach support so kids can rep out the basics.",
    perfect: "Perfect for: parents, extended family, & alumni.",
  },
  {
    amount: 75,
    label: "Travel boost",
    body: "Fills the tank for a tournament trip — buses, tolls, and snacks so the team arrives together and ready.",
    perfect: "Perfect for: friends, neighbors, and local fans.",
  },
  {
    amount: 150,
    label: "Season unlock",
    body: "Helps an athlete cover a chunk of their full season: league fees, tournament entries, and scholarship funds.",
    perfect: "Perfect for: sponsors, employer match, and big fans.",
  },
];

const sponsorWall = [
  {
    rank: 1,
    name: "Torchlight Coffee Co.",
    message: "“Proud to fuel game days, homework nights, and everything in between.”",
    amount: "$2,500",
    top: true,
  },
  {
    rank: 2,
    name: "Ramos Family",
    message: "“So kids from every background can lace up and hoop.”",
    amount: "$1,250",
  },
  {
    rank: 3,
    name: "Eastside Print Shop",
    message: "Printing tournament tees, sponsor banners, and memories.",
    amount: "$750",
  },
  {
    rank: 4,
    name: "Friends of the Program",
    message: "Collective giving from alumni & neighbors.",
    amount: "$500",
  },
];

const membershipTiers = [
  {
    id: "rookie",
    name: "Rookie Club",
    priceMonthly: 15,
    priceAnnual: 150,
    blurb: "Best for parents & close family who want to back the program all season.",
    benefits: [
      "Monthly impact update email.",
      "Name on Friends of the Program wall.",
      "Early access to merch drops.",
    ],
  },
  {
    id: "starter",
    name: "Starter Five",
    priceMonthly: 35,
    priceAnnual: 350,
    blurb: "Best for local businesses & alumni who want to be in the rotation all year.",
    benefits: [
      "All Rookie perks.",
      "Logo or family name on membership wall.",
      "1 social media shoutout per season.",
    ],
  },
  {
    id: "allstar",
    name: "All-Star Circle",
    priceMonthly: 75,
    priceAnnual: 750,
    blurb: "Best for season-long partners who want visibility plus deep program impact.",
    benefits: [
      "All Starter perks.",
      "Logo on select print materials.",
      "Priority sponsor placement on fundraiser pages.",
    ],
  },
];

/* Countdown helper */
function useCountdown(endIso) {
  const [label, setLabel] = useState("Season goal window active now.");

  useEffect(() => {
    const end = new Date(endIso);
    if (Number.isNaN(end.getTime())) return;

    function update() {
      const now = new Date();
      const diffMs = end.getTime() - now.getTime();
      if (diffMs <= 0) {
        setLabel("Season goal window has closed. Thank you for your support!");
        return;
      }
      const diffMinutesTotal = Math.floor(diffMs / 60000);
      const days = Math.floor(diffMinutesTotal / (60 * 24));
      const hours = Math.floor((diffMinutesTotal % (60 * 24)) / 60);
      const minutes = diffMinutesTotal % 60;
      setLabel(
        `${days} day${days === 1 ? "" : "s"} · ${hours} hour${hours === 1 ? "" : "s"} · ${minutes} minute${
          minutes === 1 ? "" : "s"
        } left in this season window`
      );
    }

    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [endIso]);

  return label;
}

/* Toast helper */
function useToast() {
  const [toast, setToast] = useState("");
  const [visible, setVisible] = useState(false);

  const showToast = (message) => {
    setToast(message);
    setVisible(true);
    setTimeout(() => setVisible(false), 2600);
  };

  return { toast, visible, showToast };
}

/* Back-to-top visibility */
function useBackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY || window.pageYOffset;
      setVisible(y > 600);
    }
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return visible;
}

/* Theme hook */
function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const stored = window.localStorage.getItem("ff-theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      // ignore
    }
    const prefersLight =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    return prefersLight ? "light" : "dark";
  });

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem("ff-theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggleTheme };
}

/* -------------------------------------------------------
   MAIN COMPONENT
-------------------------------------------------------- */

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const countdownLabel = useCountdown(CONFIG.campaign.seasonWindowEnd);
  const { toast, visible: toastVisible, showToast } = useToast();
  const showBackToTop = useBackToTop();

  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const [donationAmount, setDonationAmount] = useState("");
  const [frequency, setFrequency] = useState("once");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [membershipBilling, setMembershipBilling] = useState("monthly");

  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [amountError, setAmountError] = useState(false);

  const [activeSection, setActiveSection] = useState("#overview");

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: CONFIG.currency || "USD",
        maximumFractionDigits: 0,
      }),
    []
  );

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
      }),
    []
  );

  const goal = CONFIG.campaign.goal;
  const raised = CONFIG.campaign.raised;
  const supporters = CONFIG.campaign.supporters;

  const progressRatio = goal > 0 ? Math.min(1, Math.max(0, raised / goal)) : 0;
  const progressPercent = Math.round(progressRatio * 100);

  /* Keep announcement height CSS var in sync */
  useEffect(() => {
    const bar = document.getElementById("announcement-bar");
    const height = bar && announcementVisible ? bar.offsetHeight : 0;
    document.documentElement.style.setProperty("--announcement-height", `${height}px`);
  }, [announcementVisible]);

  /* Simple scroll spy for nav highlight */
  useEffect(() => {
    const ids = ["overview", "teams", "impact", "donate", "sponsors", "memberships"];
    const sections = ids.map((id) => document.getElementById(id));

    function onScroll() {
      const y = window.scrollY || window.pageYOffset;
      let current = "#overview";
      sections.forEach((sec) => {
        if (!sec) return;
        const top = sec.offsetTop - 140; // header offset
        if (y >= top) current = `#${sec.id}`;
      });
      setActiveSection(current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleImpactClick = (amount) => {
    setDonationAmount(String(amount));
    setAmountError(false);
    showToast(`Amount updated to ${moneyFormatter.format(amount)}.`);
    const donateEl = document.getElementById("donate");
    if (donateEl) donateEl.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleChipClick = (amount) => {
    setDonationAmount(String(amount));
    setAmountError(false);
  };

  const handleDonateSubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.elements["donor-name"]?.value.trim() || "";
    const email = form.elements["donor-email"]?.value.trim() || "";
    const amountNum = parseFloat(donationAmount);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let valid = true;

    if (!name) {
      setNameError(true);
      valid = false;
    } else {
      setNameError(false);
    }

    if (!email || !emailRegex.test(email)) {
      setEmailError(true);
      valid = false;
    } else {
      setEmailError(false);
    }

    if (!(amountNum > 0)) {
      setAmountError(true);
      valid = false;
    } else {
      setAmountError(false);
    }

    if (!valid) {
      showToast("Double-check the highlighted fields to continue.");
      return;
    }

    showToast("Demo only — connect Stripe or PayPal to process this payment.");
  };

  const handleMembershipJoin = (tier) => {
    showToast(
      `Demo only — would create ${paymentMethod === "card" ? "Stripe" : "PayPal"} subscription for ${
        tier.name
      } (${membershipBilling}).`
    );
  };

  const scrollToTop = () => {
    const topEl = document.getElementById("top-shell");
    if (topEl) {
      topEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  /* Basic QR pattern cells */
  const qrCells = useMemo(() => {
    const cells = [];
    const size = 12;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const corner =
          (row < 3 && col < 3) ||
          (row < 3 && col >= 9) ||
          (row >= 9 && col < 3) ||
          (row >= 9 && col >= 9);
        const diag = (row + col) % 3 === 0;
        const accent = !corner && (row * size + col) % 11 === 0;
        cells.push({ corner, diag, accent });
      }
    }
    return cells;
  }, []);

  return (
    <>
      <GlobalStyle />
      <PageShell id="top-shell">
        {/* Announcement */}
        {announcementVisible && (
          <AnnouncementBarShell id="announcement-bar" aria-live="polite">
            <AnnouncementInner>
              <AnnouncementMain>
                <AnnouncementPill>Demo</AnnouncementPill>
                <AnnouncementText>
                  🏀 Built on <strong>{CONFIG.platformName}</strong> for{" "}
                  <strong>{CONFIG.org.name}</strong>’s {CONFIG.campaign.title}.
                </AnnouncementText>
              </AnnouncementMain>
              <AnnouncementDismiss
                type="button"
                aria-label="Dismiss announcement"
                onClick={() => setAnnouncementVisible(false)}
              >
                &times;
              </AnnouncementDismiss>
            </AnnouncementInner>
          </AnnouncementBarShell>
        )}

        {/* Header */}
        <SiteHeader role="banner">
          <SiteHeaderInner>
            <BrandLockup>
              <BrandBadge aria-hidden="true">
                {CONFIG.platformName
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 3)
                  .toUpperCase()}
              </BrandBadge>
              <BrandText>
                <BrandNameRow>
                  <BrandNameMain>{CONFIG.platformName}</BrandNameMain>
                  <BrandNameSecondary>Youth Fundraising Demo</BrandNameSecondary>
                </BrandNameRow>
                <BrandMeta>
                  {CONFIG.org.city}, {CONFIG.org.state} • {CONFIG.org.segment}
                </BrandMeta>
              </BrandText>
            </BrandLockup>
            <HeaderNav>
              <NavList aria-label="Primary">
                {[
                  ["#overview", "Overview"],
                  ["#teams", "Teams"],
                  ["#impact", "Impact"],
                  ["#donate", "Give"],
                  ["#sponsors", "Sponsors"],
                  ["#memberships", "Memberships"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <NavLink href={href} data-active={activeSection === href}>
                      {label}
                    </NavLink>
                  </li>
                ))}
              </NavList>
              <HeaderActions>
                <ButtonGhost
                  type="button"
                  aria-pressed={theme === "light"}
                  onClick={toggleTheme}
                >
                  <span aria-hidden="true">{theme === "dark" ? "🌙" : "☀️"}</span>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {theme === "dark" ? "Dark" : "Light"}
                  </span>
                </ButtonGhost>
                <ButtonPrimary as="a" href="#donate">
                  <span>Give now</span>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.16em",
                      opacity: 0.8,
                    }}
                  >
                    Secure checkout (demo)
                  </span>
                </ButtonPrimary>
              </HeaderActions>
            </HeaderNav>
          </SiteHeaderInner>
        </SiteHeader>

        {/* Progress strip */}
        <ProgressStrip>
          <ProgressStripInner>
            <ProgressStripMeta>
              <ProgressLabel>Season goal</ProgressLabel>
              <ProgressSummary>
                <strong>{moneyFormatter.format(raised)}</strong> raised of{" "}
                {moneyFormatter.format(goal)} goal ·{" "}
                <strong>{progressPercent}%</strong> funded
              </ProgressSummary>
            </ProgressStripMeta>
            <ProgressBarOuter
              role="progressbar"
              aria-label="Fundraising progress for this season"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <ProgressBarInner ratio={progressRatio} />
            </ProgressBarOuter>
          </ProgressStripInner>
        </ProgressStrip>

        {/* Main content */}
        <main role="main">
          <Shell>
            {/* Hero / Overview */}
            <Hero id="overview" aria-labelledby="overview-heading">
              <HeroGrid>
                <HeroMain>
                  <HeroBadgeRow>
                    <HeroBadgeDot aria-hidden="true" />
                    <span>
                      {CONFIG.org.city}, {CONFIG.org.state} • {CONFIG.org.segment}
                    </span>
                  </HeroBadgeRow>
                  <div>
                    <HeroHeading id="overview-heading">
                    ⚡ DEV BUILD: FUTUREFUNDED REACT ⚡
                    </HeroHeading>

                    <HeroSubtitle>
                      This demo shows what a FutureFunded-style fundraising page can look like for your
                      youth team, club, school, or nonprofit.
                    </HeroSubtitle>
                  </div>
                  <HeroBody>
                    <p>
                      Every practice rep, late-night gym, and bus ride to a tournament takes real
                      support. This layout is built so families, friends, alumni, and local businesses
                      can back a full season in just a few taps.
                    </p>
                    <p>
                      Donations in a live deployment would help secure gyms, travel, tournament fees,
                      uniforms, film, training, and even scholarships — all tracked in a modern,
                      mobile-first experience.
                    </p>

                    <HeroCtaRow>
                      <ButtonPrimary as="a" href="#donate">
                        Give now
                      </ButtonPrimary>
                      <ButtonOutline
                        type="button"
                        onClick={async () => {
                          const shareData = {
                            title: `${CONFIG.org.name} ${CONFIG.campaign.title}`,
                            text: "Help this youth program fuel gyms, travel, and scholarships this season.",
                            url: window.location.href,
                          };
                          try {
                            if (navigator.share) {
                              await navigator.share(shareData);
                              showToast("Thanks for sharing this cause!");
                            } else if (navigator.clipboard?.writeText) {
                              await navigator.clipboard.writeText(shareData.url);
                              showToast("Link copied — share this with friends & family.");
                            }
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <span aria-hidden="true">📤</span>
                        <span>Share this cause</span>
                      </ButtonOutline>
                    </HeroCtaRow>

                    <HeroTrustList>
                      <li>Secure, SSL-protected checkout (when wired to Stripe/PayPal).</li>
                      <li>Low platform fees so more support reaches kids and programs.</li>
                      <li>Funds gyms, travel, gear, tournaments &amp; scholarships.</li>
                    </HeroTrustList>

                    <p
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: "rgba(148,163,184,1)",
                      }}
                    >
                      Built as a white-label platform — any program can spin up a fully branded
                      fundraiser page like this in days, not weeks.
                    </p>

                    <HeroMetaRow>
                      <span>
                        <strong>{progressPercent}% funded</strong>
                        &nbsp;·&nbsp;
                        <span>
                          {moneyFormatter.format(raised)} of {moneyFormatter.format(goal)}
                        </span>
                      </span>
                      <HeroFocusText>Focusing impact across all squads.</HeroFocusText>
                    </HeroMetaRow>
                  </HeroBody>
                </HeroMain>

                <HeroAside aria-label="Season snapshot">
                  <HeroAsideInner>
                    <HeroStatGrid>
                      <HeroStat>
                        <HeroStatLabel>Season goal</HeroStatLabel>
                        <HeroStatValue>{moneyFormatter.format(goal)}</HeroStatValue>
                        <HeroStatHint>Covers full travel, gyms &amp; gear.</HeroStatHint>
                      </HeroStat>
                      <HeroStat>
                        <HeroStatLabel>Raised so far</HeroStatLabel>
                        <HeroStatValue>{moneyFormatter.format(raised)}</HeroStatValue>
                        <HeroStatHint>
                          {numberFormatter.format(supporters)} families &amp; friends.
                        </HeroStatHint>
                      </HeroStat>
                      <HeroStat>
                        <HeroStatLabel>Progress</HeroStatLabel>
                        <HeroStatValue>{progressPercent}%</HeroStatValue>
                        <HeroStatHint>Season window still open.</HeroStatHint>
                      </HeroStat>
                      <HeroStat>
                        <HeroStatLabel>Athletes served</HeroStatLabel>
                        <HeroStatValue>6th–8th</HeroStatValue>
                        <HeroStatHint>Player-first, classroom-first.</HeroStatHint>
                      </HeroStat>
                    </HeroStatGrid>

                    <HeroProgressShell>
                      <HeroProgressBarOuter>
                        <HeroProgressBarInner ratio={progressRatio} />
                      </HeroProgressBarOuter>
                      <HeroProgressSummary>
                        <span>
                          {moneyFormatter.format(raised)} of {moneyFormatter.format(goal)} goal
                        </span>
                        <span>
                          <strong>{progressPercent}% funded</strong> •{" "}
                          {numberFormatter.format(supporters)} supporters
                        </span>
                      </HeroProgressSummary>
                      <HeroCountdownPill aria-live="polite">
                        <HeroCountdownDot aria-hidden="true" />
                        <span>{countdownLabel}</span>
                      </HeroCountdownPill>
                    </HeroProgressShell>
                  </HeroAsideInner>
                </HeroAside>
              </HeroGrid>
            </Hero>

            {/* Teams */}
            <Section id="teams" aria-labelledby="teams-heading">
              <TeamsHeaderRow>
                <div>
                  <SectionEyebrow>Teams</SectionEyebrow>
                  <SectionTitle id="teams-heading">
                    Cinematic squads, same family.
                  </SectionTitle>
                  <SectionSubtitle>
                    Grouped into grade-level squads with shared culture, expectations, and support —
                    all benefitting from the same season goal.
                  </SectionSubtitle>
                </div>
                <TeamsFilter>
                  <span>Focus your impact</span>
                  <Select
                    defaultValue="all"
                    onChange={(e) => {
                      const key = e.target.value;
                      if (key === "all") {
                        setActiveSection("#teams");
                      }
                    }}
                  >
                    <option value="all">All teams</option>
                    <option value="6g">6th Grade • Foundation</option>
                    <option value="7g">7th Grade • Gold</option>
                    <option value="8g">8th Grade • Elite</option>
                    <option value="allstars">Mixed • Showcase</option>
                  </Select>
                </TeamsFilter>
              </TeamsHeaderRow>
              <TeamsGallery>
                {teams.map((team) => (
                  <TeamCard key={team.key}>
                    <TeamCardMedia aria-hidden="true">
                      <TeamCourt />
                      <TeamBall />
                    </TeamCardMedia>
                    <TeamBody>
                      <TeamTagline>{team.tagline}</TeamTagline>
                      <TeamTitle>{team.title}</TeamTitle>
                      <TeamHook>{team.hook}</TeamHook>
                      <TeamMetaPills>
                        <MetaPill soft>{team.tags[0]}</MetaPill>
                        <MetaPill>{team.tags[1]}</MetaPill>
                      </TeamMetaPills>
                    </TeamBody>
                  </TeamCard>
                ))}
              </TeamsGallery>
            </Section>

            {/* Impact */}
            <Section id="impact" aria-labelledby="impact-heading">
              <SectionHeader>
                <SectionEyebrow>Impact</SectionEyebrow>
                <SectionTitle id="impact-heading">Every dollar has a job.</SectionTitle>
                <SectionSubtitle>
                  These example amounts map to the kinds of impact you could highlight for your
                  program. Tap one to prefill the donation form.
                </SectionSubtitle>
              </SectionHeader>
              <ImpactTiles>
                {impactOptions.map((opt) => (
                  <ImpactTile
                    key={opt.amount}
                    type="button"
                    onClick={() => handleImpactClick(opt.amount)}
                  >
                    <ImpactAmount>${opt.amount}</ImpactAmount>
                    <ImpactLabel>{opt.label}</ImpactLabel>
                    <ImpactBody>{opt.body}</ImpactBody>
                    <ImpactPerfect>{opt.perfect}</ImpactPerfect>
                  </ImpactTile>
                ))}
              </ImpactTiles>
            </Section>

            {/* Donation */}
            <Section id="donate" aria-labelledby="donate-heading">
              <SectionHeader>
                <SectionEyebrow>Give</SectionEyebrow>
                <SectionTitle id="donate-heading">
                  Stripe-ready checkout, demo mode.
                </SectionTitle>
                <SectionSubtitle>
                  This form is a front-end only demo. In production, it would hand off to a secure
                  Stripe, PayPal, or custom checkout session.
                </SectionSubtitle>
              </SectionHeader>

              <DonateGrid>
                <Card aria-label="Donation form">
                  <FormGrid id="donation-form" onSubmit={handleDonateSubmit} noValidate>
                    <Field>
                      <FieldLabel htmlFor="donor-name">Name</FieldLabel>
                      <Input
                        id="donor-name"
                        name="donor-name"
                        type="text"
                        placeholder="Name we can thank"
                        invalid={nameError}
                        onChange={() => setNameError(false)}
                      />
                      <FieldError visible={nameError}>
                        Please add the name we can thank.
                      </FieldError>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="donor-email">Email</FieldLabel>
                      <Input
                        id="donor-email"
                        name="donor-email"
                        type="email"
                        placeholder="For your receipt only"
                        invalid={emailError}
                        onChange={() => setEmailError(false)}
                      />
                      <FieldError visible={emailError}>
                        Please enter a valid email address.
                      </FieldError>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="donor-note">
                        Note to the team (optional)
                      </FieldLabel>
                      <Textarea
                        id="donor-note"
                        name="donor-note"
                        rows={3}
                        placeholder="Leave a quick note for the players or coaches."
                      />
                    </Field>

                    <Field>
                      <FauxFieldLabel>Amount</FauxFieldLabel>
                      <AmountRow>
                        <AmountInputWrap>
                          <AmountPrefix>$</AmountPrefix>
                          <AmountInput
                            id="donation-amount"
                            name="donation-amount"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Enter amount"
                            value={donationAmount}
                            onChange={(e) => setDonationAmount(e.target.value)}
                            invalid={amountError}
                          />
                        </AmountInputWrap>
                        <AmountChips aria-label="Quick amounts">
                          {[25, 50, 75, 150, 300].map((amt) => (
                            <Chip key={amt} type="button" onClick={() => handleChipClick(amt)}>
                              ${amt}
                            </Chip>
                          ))}
                        </AmountChips>
                        <HelpText>Suggested gifts only — every dollar helps.</HelpText>
                        <FieldError visible={amountError}>
                          Please enter a donation amount.
                        </FieldError>
                      </AmountRow>
                    </Field>

                    <Field>
                      <FauxFieldLabel>Frequency</FauxFieldLabel>
                      <ToggleGroup role="radiogroup" aria-label="Donation frequency">
                        {["once", "monthly"].map((freq) => (
                          <ToggleButton
                            key={freq}
                            type="button"
                            active={frequency === freq}
                            onClick={() => setFrequency(freq)}
                          >
                            {freq === "once" ? "One-time" : "Monthly"}
                          </ToggleButton>
                        ))}
                      </ToggleGroup>
                      <HelpText>
                        {frequency === "once"
                          ? "Charge once today for this season’s fundraiser."
                          : "Charge this amount each month for the rest of the season window."}
                      </HelpText>
                    </Field>

                    <Field>
                      <FauxFieldLabel>Payment method</FauxFieldLabel>
                      <ToggleGroup role="radiogroup" aria-label="Payment method">
                        {[
                          ["card", "💳 Card (Stripe)"],
                          ["paypal", "🅿️ PayPal"],
                        ].map(([key, label]) => (
                          <ToggleButton
                            key={key}
                            type="button"
                            active={paymentMethod === key}
                            onClick={() => setPaymentMethod(key)}
                          >
                            {label}
                          </ToggleButton>
                        ))}
                      </ToggleGroup>
                      <HelpText>
                        {paymentMethod === "card"
                          ? "In production, this would mount a Stripe Elements card or Payment Element here."
                          : "In production, this would render a PayPal button or redirect to a PayPal checkout page."}
                      </HelpText>
                    </Field>

                    <FormFooter>
                      <ButtonPrimary type="submit">
                        Continue to secure payment (demo)
                      </ButtonPrimary>
                      <p>
                        In a real deployment, this button would create a secure checkout session with
                        Stripe, PayPal, or your school’s payment processor. No payments are processed
                        on this demo page.
                      </p>
                    </FormFooter>
                  </FormGrid>
                </Card>

                <Card aria-label="Give with confidence">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "var(--space-3)",
                    }}
                  >
                    <div>
                      <SectionEyebrow>Give with confidence</SectionEyebrow>
                      <div
                        style={{
                          fontSize: "var(--font-size-sm)",
                        }}
                      >
                        <strong>{progressPercent}% funded</strong> this season.
                      </div>
                    </div>
                    <Pill
                      style={{
                        borderStyle: "dashed",
                        borderColor: "rgba(206,17,65,0.9)",
                        color: "var(--accent-gold)",
                        background: "rgba(15,23,42,0.9)",
                      }}
                    >
                      Demo only
                    </Pill>
                  </div>

                  <DonationStatsGrid>
                    <div>
                      Raised so far:{" "}
                      <strong>{moneyFormatter.format(raised)}</strong>
                    </div>
                    <div>
                      Season goal:{" "}
                      <strong>{moneyFormatter.format(goal)}</strong>
                    </div>
                    <div>
                      Supporters:{" "}
                      <strong>{numberFormatter.format(supporters)} donors</strong>
                    </div>
                    <div>
                      Season window:{" "}
                      <strong>Through March 15, 2026</strong>
                    </div>
                  </DonationStatsGrid>

                  <DonationTagRow>
                    <DonationTag>SSL-only, tokenized payments</DonationTag>
                    <DonationTag>Donation receipts via email</DonationTag>
                    <DonationTag>Export-friendly for accounting</DonationTag>
                  </DonationTagRow>

                  <p
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "rgba(148,163,184,1)",
                      marginTop: "var(--space-3)",
                    }}
                  >
                    This platform is designed to plug into your existing accounting, booster, school,
                    or club reporting flows — so it stays easy to reconcile online and offline gifts in
                    one place.
                  </p>
                </Card>
              </DonateGrid>
            </Section>

            {/* Sponsors */}
            <Section id="sponsors" aria-labelledby="sponsors-heading">
              <SectionHeader>
                <SectionEyebrow>Sponsors</SectionEyebrow>
                <SectionTitle id="sponsors-heading">
                  A sponsor wall kids can point to.
                </SectionTitle>
                <SectionSubtitle>
                  Showcase families, small businesses, and season partners who go big for the program
                  — and give them a clean link to share.
                </SectionSubtitle>
              </SectionHeader>

              <SponsorsGrid>
                <Card aria-label="Season leaderboard">
                  <SectionEyebrow>Season leaders board</SectionEyebrow>
                  <SponsorList>
                    {sponsorWall.map((s) => (
                      <SponsorCard key={s.rank} top={s.top}>
                        <SponsorRank>#{s.rank}</SponsorRank>
                        <SponsorMain>
                          <SponsorName>{s.name}</SponsorName>
                          <SponsorMessage>{s.message}</SponsorMessage>
                        </SponsorMain>
                        <SponsorAmount>{s.amount}</SponsorAmount>
                      </SponsorCard>
                    ))}
                  </SponsorList>
                </Card>

                <TierList aria-label="Sponsor tiers">
                  <Card as="article">
                    <TierHeader>
                      <TierName>Season Partner</TierName>
                      <TierRange>$2,500+</TierRange>
                    </TierHeader>
                    <TierBenefits>
                      <li>Logo or family name featured at the top of the sponsor wall.</li>
                      <li>Shoutouts on program social and email updates.</li>
                      <li>Optional logo on warm-ups, banners, or schedule flyers.</li>
                    </TierBenefits>
                    <TierCta>
                      Interested in a Season Partner spot? Email{" "}
                      <a href="mailto:info@connectatxelite.org">info@connectatxelite.org</a> to talk
                      visibility, assets, and impact.
                    </TierCta>
                  </Card>

                  <Card as="article">
                    <TierHeader>
                      <TierName>Team Supporter</TierName>
                      <TierRange>$500–$2,499</TierRange>
                    </TierHeader>
                    <TierBenefits>
                      <li>Listed on the sponsor wall by name or business.</li>
                      <li>Optional highlight on specific team pages or rosters.</li>
                      <li>Mention in end-of-season recap and thank-you email.</li>
                    </TierBenefits>
                    <TierCta>
                      Perfect for local businesses, PTAs, and community partners. Tap in via{" "}
                      <a href="mailto:info@connectatxelite.org">info@connectatxelite.org</a>.
                    </TierCta>
                  </Card>

                  <Card as="article">
                    <TierHeader>
                      <TierName>Friend of the Team</TierName>
                      <TierRange>$100–$499</TierRange>
                    </TierHeader>
                    <TierBenefits>
                      <li>Listed under “Friends of the Program” on the sponsor wall.</li>
                      <li>Optional note from your family or group.</li>
                      <li>Counts toward the season goal &amp; player scholarships.</li>
                    </TierBenefits>
                    <TierCta>
                      Great for extended family, alumni groups, or workplace teams doing a mini-drive.
                    </TierCta>
                  </Card>
                </TierList>
              </SponsorsGrid>
            </Section>

            {/* Memberships */}
            <Section id="memberships" aria-labelledby="memberships-heading">
              <SectionHeader>
                <SectionEyebrow>Memberships</SectionEyebrow>
                <SectionTitle id="memberships-heading">
                  Season-long support, built in.
                </SectionTitle>
                <SectionSubtitle>
                  Turn one-time donors into season-long members with simple plans that plug into
                  Stripe or PayPal on the backend.
                </SectionSubtitle>
              </SectionHeader>

              <TabsWrapper>
                <TabList role="tablist" aria-label="Membership billing cadence">
                  {["monthly", "annual"].map((billing) => (
                    <TabButton
                      key={billing}
                      type="button"
                      active={membershipBilling === billing}
                      onClick={() => setMembershipBilling(billing)}
                    >
                      {billing === "monthly" ? "Monthly" : "Annual"}
                    </TabButton>
                  ))}
                </TabList>

                <TabPanel>
                  <MembershipGrid>
                    {membershipTiers.map((tier) => {
                      const price =
                        membershipBilling === "monthly"
                          ? tier.priceMonthly
                          : tier.priceAnnual;
                      const suffix = membershipBilling === "monthly" ? "/mo" : "/yr";
                      return (
                        <Card key={tier.id}>
                          <TierHeader>
                            <TierName>{tier.name}</TierName>
                            <TierRange>
                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize: "var(--font-size-md)",
                                }}
                              >
                                ${price}
                                {suffix}
                              </span>
                            </TierRange>
                          </TierHeader>
                          <SectionSubtitle>{tier.blurb}</SectionSubtitle>
                          <TierBenefits>
                            {tier.benefits.map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </TierBenefits>
                          <HeroCtaRow>
                            <ButtonPrimary
                              type="button"
                              onClick={() => handleMembershipJoin(tier)}
                            >
                              Join with card (demo)
                            </ButtonPrimary>
                            <ButtonOutline
                              type="button"
                              onClick={() => handleMembershipJoin(tier)}
                            >
                              Pay with PayPal (demo)
                            </ButtonOutline>
                          </HeroCtaRow>
                          <p
                            style={{
                              fontSize: "var(--font-size-xs)",
                              color: "rgba(148,163,184,1)",
                              marginTop: "var(--space-2)",
                            }}
                          >
                            In production, these buttons would create Stripe or PayPal subscriptions
                            tied to this tier.
                          </p>
                        </Card>
                      );
                    })}
                  </MembershipGrid>
                </TabPanel>
              </TabsWrapper>
            </Section>

            {/* How it works / FAQ */}
            <Section aria-label="How it works and FAQ">
              <SectionHeader>
                <SectionEyebrow>How it works</SectionEyebrow>
                <SectionTitle>Built for mobile-first giving.</SectionTitle>
                <SectionSubtitle>
                  Answer donor questions in one place and show exactly how online gifts, checks, and
                  employer match all add into the same season goal.
                </SectionSubtitle>
              </SectionHeader>

              <TabsWrapper>
                <TabList aria-label="Giving options">
                  {/* simple 2-tab toggle */}
                  {/* We'll just use membershipBilling state pattern but local */}
                </TabList>
                <TabPanel>
                  <h3>Online giving that feels built for this decade.</h3>
                  <p>
                    On a live page like this, online gifts flow through a secure checkout with your
                    payment provider. The donor experience stays clean, fast, and mobile-friendly —
                    from bleachers, buses, or couches.
                  </p>
                  <ul>
                    <li>Cards are processed via Stripe, PayPal, or your existing gateway.</li>
                    <li>Donors receive an instant email receipt with your org’s branding.</li>
                    <li>Recurring gifts auto-track for the rest of the season window.</li>
                  </ul>
                </TabPanel>
              </TabsWrapper>
            </Section>

            {/* QR / Share */}
            <Section aria-labelledby="qr-heading">
              <QrSectionCard>
                <QrGrid>
                  <div>
                    <SectionEyebrow>QR &amp; share</SectionEyebrow>
                    <SectionTitle id="qr-heading">
                      From the gym wall to grandma’s phone.
                    </SectionTitle>
                    <SectionSubtitle>
                      Every campaign has a shareable link — and, optionally, a QR code that points
                      straight to this page. That makes it easy to go from “scan” to “support” in a
                      few taps.
                    </SectionSubtitle>
                    <ul
                      style={{
                        marginTop: "var(--space-2)",
                        paddingLeft: "1.2rem",
                        fontSize: "var(--font-size-sm)",
                        color: "rgba(148,163,184,1)",
                      }}
                    >
                      <li>Print the QR on flyers and hang it in your home gym.</li>
                      <li>Drop the link into group chats or team text threads.</li>
                      <li>Ask relatives and alumni to scan from the live stream or bleachers.</li>
                    </ul>
                    <p
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: "rgba(148,163,184,1)",
                        marginTop: "var(--space-2)",
                      }}
                    >
                      Pro tip for admins: embed the QR or short link in pregame presentations,
                      parent meetings, and school newsletters so every touchpoint points back to the
                      same season goal.
                    </p>
                  </div>
                  <QrVisualWrap aria-hidden="true">
                    <QrVisual>
                      {qrCells.map((cell, idx) => (
                        <QrCell
                          key={idx}
                          accent={cell.accent}
                          style={{
                            opacity: cell.corner || cell.diag || cell.accent ? 1 : 0,
                          }}
                        />
                      ))}
                    </QrVisual>
                  </QrVisualWrap>
                </QrGrid>
              </QrSectionCard>
            </Section>
          </Shell>
        </main>

        {/* Footer */}
        <SiteFooter role="contentinfo">
          <FooterInner>
            <div>
              <div>
                &copy; {new Date().getFullYear()} {CONFIG.platformName}-style demo.
              </div>
              <div>
                White-label fundraising experience for youth programs, clubs, schools, and
                nonprofits.
              </div>
            </div>
            <FooterLinks>
              <span>Demo only — no live payments.</span>
              <span>•</span>
              <a href="#overview">Back to overview</a>
            </FooterLinks>
          </FooterInner>
        </SiteFooter>

        {/* Mobile CTA */}
        <MobileCtaBar aria-hidden="true">
          <MobileCtaInner>
            <MobileCtaText>
              <strong>{progressPercent}% funded</strong>
              &nbsp;·&nbsp;
              <span>
                {moneyFormatter.format(raised)} of {moneyFormatter.format(goal)}
              </span>
            </MobileCtaText>
            <ButtonPrimary as="a" href="#donate" style={{ padding: "0.4rem 0.9rem" }}>
              Give
            </ButtonPrimary>
          </MobileCtaInner>
        </MobileCtaBar>

        {/* Back to top */}
        <BackToTopButton
          type="button"
          aria-label="Back to top"
          visible={showBackToTop}
          onClick={scrollToTop}
        >
          ↑
        </BackToTopButton>

        {/* Toast */}
        <Toast role="status" aria-live="polite" visible={toastVisible}>
          {toast}
        </Toast>
      </PageShell>
    </>
  );
}

