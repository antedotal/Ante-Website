# Ante Website – Design & Tech Stack

## 1. Project Summary

Ante Website is the marketing/landing site for **Ante – The Social Task Manager**.  
It is a **static-first Next.js App Router** project using **React + TypeScript** and **Tailwind 4–style utility classes** with custom UI components and animations.

The codebase is optimized for:
- Quickly iterating on **marketing content and visual design**.
- Adding **new static routes** (e.g., signup, legal pages).
- Reusing a growing **library of UI primitives and section components**.

---

## 2. Tech Stack

### 2.1 Core Runtime & Framework

- **Framework**: Next.js `16.1.1`
- **Language**: TypeScript `^5`
- **UI Library**: React `19.2.3`, React DOM `19.2.3`
- **Rendering model**:
  - App Router (`app/` directory)
  - Single `RootLayout` in `app/layout.tsx`
  - Static marketing pages (no data fetching or APIs currently)

Key config files:
- `next.config.ts` – Next.js configuration.
- `tsconfig.json` – TypeScript configuration.
- `next-env.d.ts` – Next.js TypeScript env declarations.

### 2.2 Styling & Theming

- **Tailwind CSS v4** (`tailwindcss` and `@tailwindcss/postcss` in `devDependencies`).
- Global stylesheet: `app/globals.css`.
- **Fonts**:
  - `DM_Sans` and `Bricolage_Grotesque` loaded via `next/font/google` in `app/layout.tsx`.
  - Fonts are exposed as CSS variables (`--font-dm-sans`, `--font-bricolage-grotesque`) and applied via classes like `font-sans`, `font-serif-custom`.

**Global theme (from `app/layout.tsx`):**
- `body` has a teal/blue **diagonal gradient** background:
  - `linear-gradient(135deg, #003A4A 0%, #003040 33%, #002530 66%, #001A20 100%)`
- **Noise overlay**:
  - A full-screen `div` with an inline SVG `feTurbulence` filter creates subtle noise.
  - Positioned `fixed` with `pointer-events: none`, blended via `opacity` and `mixBlendMode: overlay`.
- Base text color: white, with Tailwind utility classes for variations (e.g., `text-white/80`).

### 2.3 UI, Animations & Visual Libraries

From `package.json` `dependencies`:

- **Animations & motion**:
  - `framer-motion`
  - `motion`
  - `gsap`
  - `lenis` for smooth scrolling behavior
  - GSAP ScrollTrigger is used for pinned scroll sections and sequential fades.
  - A GSAP-driven custom cursor adapts its color based on section data attributes.
- **3D / visual effects**:
  - `three`
  - `@react-three/fiber`
  - `@react-three/drei`
  - `cobe` (for globe-like visualizations)
- **Icons**:
  - `lucide-react`
- **Styling helpers**:
  - `class-variance-authority` – for variant-based component APIs.
  - `tailwind-merge` – for merging Tailwind class strings.
  - `clsx` – general-purpose className utility.
- **Radix primitives**:
  - `@radix-ui/react-icons`
  - `@radix-ui/react-slot`

### 2.4 Tooling, Linting & Scripts

- **Linting**:
  - `eslint` `^9`
  - `eslint-config-next` `16.1.1`
  - Config: `eslint.config.mjs`
- **Build pipeline**:
  - `postcss.config.mjs` – PostCSS/Tailwind integration.
- **NPM scripts** (from `package.json`):
  - `dev`: `next dev`
  - `build`: `next build`
  - `start`: `next start`
  - `lint`: `eslint`

**Recommended workflow:**
- Start dev server: `npm run dev`
- Type check: `tsc --noEmit` (or rely on IDE/Next build)
- Lint: `npm run lint`
- Production build: `npm run build` then `npm run start`

---

## 3. Directory & File Structure

High-level layout under the repo root:

- `app/` – Next.js App Router entry point (layouts, pages, global styles).

### Recent Changes

#### 2026-02-11 — Navbar Color Adaptation & Panel Spacing
- **Navbar**: Text/brand/hamburger colors now adapt to scroll state. Bar (top, no scroll): dark text (`#1a1a1a`) for visibility against white body. Pill (scrolled): white text against dark backdrop. Uses `motion.div` animate for smooth color transitions.
- **Page**: Inset panel padding tightened — left/right reduced (`px-2 sm:px-2.5 md:px-3`), top increased +5px to `pt-[77px]`, bottom increased +10px to `pb-[13px] sm:pb-[14px] md:pb-[15px]`.
- **Hero**: Grid gap between text and mockup columns reduced from `gap-12 lg:gap-16` to `gap-8 lg:gap-10`.

#### 2026-02-13 — Mobile Hero Fix, HowItWorks Pin, Footer Cleanup & Component Pruning
- **Hero (mobile)**: Removed `min-h-screen` on mobile (now `lg:min-h-screen` only). Reduced mobile vertical padding (`py-12 sm:py-16 md:py-0`). Phone mockup now visible on all breakpoints with responsive sizing (`w-52 h-[26rem]` on mobile, scaling up via `sm:` and `lg:` breakpoints). Inset panel wrapper in `page.tsx` has reduced mobile padding (`px-2 sm:px-3 md:px-6`, `pt-[68px] sm:pt-[77px]`, `pb-2 sm:pb-3 md:pb-6`) to shrink the gradient borders on small screens.
- **HowItWorks**: Section header (`<h2>`) moved inside the `pinRef` container so it pins with the grid and stays visible during scroll-lock. Pinned container has `pt-24 sm:pt-28` to clear the fixed navbar. Subtitle ("The screen locks, the cards move...") removed entirely. ScrollTrigger `start` changed from `"top-=100 top"` to `"top top"` for flush pin.
- **Footer/CTA continuity**: Removed `border-t border-white/5` from footer so CTA and footer appear as one seamless element. Added horizontal CSS `mask-image` gradient to the "Made in Sydney" `CurvedLoop` marquee container for smooth fade on left/right edges. Enhanced `CurvedLoop.tsx` SVG mask with `<feGaussianBlur>` filter (stdDeviation 6) and tighter fade stops (8%/92%) for a softer blur+fade effect at the horizontal edges.
- **Deleted unused components**: Removed `ColorBendBackground.tsx`, `Testimonials.tsx`, and `Stats.tsx` — all had zero imports anywhere in the codebase.

#### 2026-02-11 — Jomo-style Inset Hero Panel
- **Layout**: Body background changed from teal diagonal gradient to `#FAFBFC` (white). The teal gradient moved to the Hero section itself.
- **Page (`app/page.tsx`)**: Hero wrapped in an inset rounded panel (`px-3 sm:px-4 md:px-5` padding, `rounded-2xl md:rounded-3xl`, `overflow-hidden`). `pt-[72px]` pushes the panel top below the fixed navbar's initial bar height. Creates a visible white border/frame around the hero, making the transition to white content sections seamless.
- **Hero**: Now carries its own `linear-gradient(135deg, ...)` background inline, since the body is white. Beams still render on top. The rounded container in `page.tsx` clips the hero edges into a card shape.

#### 2026-02-11 — Remove Hero Transition & Footer Spacing
- **Hero-to-content transition**: Removed entirely (gradient div deleted from `app/page.tsx`). Hero now flows directly into `HowItWorks`.
- **Footer**: Increased vertical gap between content and curved marquee (`mt-6` → `mt-20 md:mt-28`). Reduced marquee speed from 1.5 to 0.7.

#### 2026-02-11 — Footer Layout & Hero Transition Gradient
- **Footer**: Privacy/Terms links moved directly under the Instagram/Email buttons (right-aligned column). Removed the separate bordered section that previously held them.
- **Hero-to-content transition**: Replaced 3-stop Tailwind gradient with a 7-stop inline `linear-gradient` for a much more gradual teal→white shift. Increased transition div height to `h-48 sm:h-60 md:h-72`. Reduced backdrop blur from `3xl` to `2xl`.

#### 2026-02-11 — Footer Curved Marquee Polish
- **Footer**: Curve now arches upward (`curveAmount={-200}`). Privacy/Terms links moved above the curve. Removed copyright line and "by Antedotal" branding.
- **CurvedLoop**: Added SVG `linearGradient` + `<mask>` for edge fade. Text fades in from 0→100% opacity at 0–15% of width, and back out at 85–100%. Mask uses a unique ID per instance.

#### 2026-02-11 — Media Fade-in, Features Auto-scroll & Footer Curved Marquee
- **HowItWorks**: Right-side media now transitions with a `y: 20 → 0` + `scale: 0.97 → 1` fade-in (via `gsap.fromTo`) for a more obvious step change. Exiting media slides down + scales out.
- **Features**: Increased auto-scroll speed from 0.35 to 0.6 px/frame. Removed CSS `scroll-snap` (conflicted with programmatic scrolling). Carousel now loops back to start when reaching end. Pauses on pointer enter / touch to allow manual browsing.
- **Footer**: Replaced plain "Made in Sydney" text with a `CurvedLoop` SVG marquee component (`components/ui/CurvedLoop.tsx`). Adapted from react-bits; uses SVG `<textPath>` on a quadratic bezier. Renders "Made in Sydney ✦" looping at 20% opacity. Non-interactive in footer context.
- **New component**: `components/ui/CurvedLoop.tsx` — reusable animated curved-path marquee. Props: `marqueeText`, `speed`, `curveAmount`, `direction`, `interactive`, `fontSize`, `fill`.

#### 2026-02-11 — Easing Unification & HowItWorks Scroll Re-architecture
- **Global easing**: All GSAP animations now use `NATURAL_EASE` (`"0.22, 1, 0.36, 1"` — ease-out-quint). Removed all `power2.out`, `power3.out` overrides. CSS transitions updated to `cubic-bezier(0.22, 1, 0.36, 1)` everywhere (nav links, shimmer button, `.font-immersive`). A `CSS_EASE_OUT_QUINT` constant exported from `lib/gsap.ts` for reference.
- **HowItWorks**: Left column no longer scrolls/translates. All five steps are visible and stationary; only the active step highlights (opacity + number colour) as the user scrolls. Right media viewport crossfades in sync. Removed `cardsTrackRef` and `y: -scrollDistance` timeline tween. Added `data-how-desc` attribute to description `<p>` elements so they can be individually dimmed/highlighted by GSAP. First step is highlighted by default on enter.

#### 2026-02-11 — Layout & Polish Pass
- **Hero**: Converted from centred single-column to Jomo-style split layout (text left, app mockup right). Left column: eyebrow, rotating-word heading, subtitle, CTA. Right column: CSS phone mockup with fake task cards. Mockup slides in from right via GSAP. Heading split onto two lines: "Stop" on line 1, rotating word on line 2.
- **Navbar**: Removed underline-on-hover CSS `::after` effect; replaced with `hover:font-semibold` font-weight change. Morph transition easing set to quint ease-out `[0.22, 1, 0.36, 1]`.
- **Global easing**: `NATURAL_EASE` custom bezier set to ease-out-quint `"0.22, 1, 0.36, 1"` in `lib/gsap.ts`. All GSAP animations and navbar morph use this curve.
- **Hero-to-content transition**: Replaced CSS `filter: blur()` hack with layered approach: a `bg-gradient-to-b` from teal to light + a `backdrop-blur-3xl` overlay for a smooth soft edge.
- **HowItWorks**: Tightened vertical spacing between step title and description (`mb-2` → `mb-0.5`, added `leading-snug`). Blue colour was already consistent (#00A4C6).
- **Scrollbars**: Added global CSS to hide all scrollbars (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`) while preserving scroll functionality.
- **Features (auto-scroll)**: Replaced broken GSAP ScrollTrigger scrub with `requestAnimationFrame` loop + `IntersectionObserver`. Scrolls at ~0.35px/frame when section is visible.
- **CTA**: Fixed "person" orphan line break via word-split with non-breaking space. Background changed to `bg-[#003949]` to match the footer.

#### 2026-02-10 — Professional Redesign
- **Global**: Removed all blur+scale animations sitewide. Each section now has one unique animation.
- **CSS Cleanup**: Removed `.glass-panel`, `.font-stretch-hover`, `.text-gradient`, `.btn-gradient` utilities.
- **Noise overlay**: Reduced opacity from `0.18` to `0.10`.
- **lib/gsap.ts**: Added `REVEAL_Y` and `REVEAL_STAGGER` constants for consistent scroll-triggered entrances.
- **Deleted 12 unused UI components**: `bento-grid`, `blur-fade`, `magic-card`, `border-beam`, `aurora-text`, `animated-gradient-text`, `particles`, `globe`, `lightRays`, `ColorBends`, `TextType` (tsx + css).
- **Navbar**: Replaced Framer Motion pill variants with CSS-only scroll transition (`bg-transparent` → `bg-[#002530]/90 backdrop-blur-md`). Full-width layout. Underline-on-hover links via CSS `::after`. Plain `Link` CTA instead of `ShimmerButton`.
- **Hero**: Removed glass panel and full-phrase rotation. Content floats on teal background. Fixed "Stop [word]." headline with single rotating word (`procrastinating`/`scrolling`/`avoiding`) using GSAP slide animation. Reduced Beams to 6 beams, speed 0.4, muted colors. Plain solid CTA button.
- **HowItWorks**: Borderless numbered timeline (large `01`–`05` numbers, connector lines). Removed teal `bg-[#E5F1F4]` card backgrounds and `data-scroll-fade` system. Preserved GSAP ScrollTrigger pin/scrub. Active step number transitions from 15% to 80% opacity. Section uses `bg-[#FAFBFC]`. Uses `useSyncExternalStore` for mobile detection.
- **Features**: Complete rewrite to horizontal scroll carousel with CSS `scroll-snap`. Cards are borderless (image + text stacked). Section header fades in with `REVEAL_Y`. No GSAP on individual cards.
- **CallToAction**: Character-split GSAP entrance (each letter staggers in from `y: 60`). Radial glow background. Kept `MagneticButton` + `ShimmerButton` combo.
- **Footer**: Added `border-t border-white/5`, copyright line, Privacy/Terms links. Removed `backdrop-blur-xl` from social buttons.

#### 2026-02-05
- **Beams Component Optimization**:
  - Fixed WebGL error, optimized performance, reduced motion.
- `components/` – Shared UI components and page sections.
- `lib/` – Utilities (e.g., `utils.ts`).
- `public/` – Static assets (SVGs, images).
- Config & meta:
  - `next.config.ts`
  - `tsconfig.json`
  - `eslint.config.mjs`
  - `postcss.config.mjs`
  - `components.json`
  - `README.md`
  - `package.json`, `package-lock.json`

### 3.1 `app/` Structure

**Files & folders:**
- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css`
- `app/favicon.ico`
- `app/(static)/`
  - `signup/page.tsx`
  - `privacy/page.tsx`
  - `terms/page.tsx`

#### 3.1.1 `app/layout.tsx` (Root Layout)

Key responsibilities:
- Sets `<html lang="en">` and `<body>` wrapper.
- Loads Google fonts via `next/font/google`:
  - `DM_Sans` → `dmSans.variable`
  - `Bricolage_Grotesque` → `bricolageGrotesque.variable`
- Applies:
  - Global typography classes on `<body>`: `antialiased text-white font-sans`.
  - Background gradient and min-height via inline `style`.
- Renders:
  - `LenisProvider` to enable smooth scrolling across the site.
  - The global `CustomCursor` for cursor color and hover feedback.
  - A fixed, full-screen noise overlay `div`.
  - A nested `<div className="relative z-10">` wrapping `{children}` to ensure content is above the noise overlay.

This layout is shared by **all routes** under `app/`.

#### 3.1.2 `app/page.tsx` (Home Route `/`)

- Default export: `Home` React component.
- Layout:
  - `<main className="min-h-screen text-white relative">`
  - Top-level composition:
    - `<Navbar />`
    - `<Hero />`
    - `<HowItWorks />`
    - `<Features />`
    - CTA section
    - `<Footer />`
- Uses UI primitives:
  - `ShimmerButton` from `components/ui/shimmer-button`
  - `MagneticButton` from `components/ui/MagneticButton`
  - `ArrowRight` icon from `lucide-react`
- CTA section:
  - Large heading: “Ready to be a better person?”
  - Supporting copy: “Join the people who actually get things done.”
  - Primary button: “Join the waitlist” + arrow icon.

**Where to extend the homepage:**
- Add new sections by:
  1. Creating a new component in `components/` (e.g., `NewSection.tsx`).
  2. Importing it into `app/page.tsx`.
  3. Rendering it in the appropriate order.

#### 3.1.3 Static Route Group: `app/(static)/`

`(static)` is a **route group folder**; its name does not appear in URLs. Routes inside map directly to their directory names:

- `app/(static)/signup/page.tsx` → `/signup`
- `app/(static)/privacy/page.tsx` → `/privacy`
- `app/(static)/terms/page.tsx` → `/terms`

Each of these pages:
- Uses `<main className="min-h-screen text-white relative">`.
- Wraps content in a `.container mx-auto px-4 py-16` layout.
- Currently contains **placeholder copy** (“coming soon…”).

**Where to add simple static pages:**
- Duplicate one of these pages under `app/(static)/new-page-name/page.tsx`.
- Content is pure JSX; no special data fetching required.

### 3.2 `components/` Structure

Top-level components:

- `Navbar.tsx`
- `Hero.tsx`
- `HowItWorks.tsx`
- `Features.tsx`
- `CallToAction.tsx`
- `Footer.tsx`

High-level intended roles:
- **`Navbar`**: Top navigation for the marketing site (links, logo, CTA).
- **`Hero`**: Above-the-fold content describing Ante's core value prop. Split layout: text left, responsive phone mockup right (visible on all breakpoints).
- **`HowItWorks`**: Explains the core flow/experience. Title pins with the step grid during scroll-lock.
- **`Features`**: Lists feature highlights/benefits.
- **`Footer`**: Footer with links, curved "Made in Sydney" marquee, legal routes (`/privacy`, `/terms`). Seamless with CTA section (no border divider).

These are composed in `app/page.tsx`.

#### 3.2.1 `components/ui/` – UI Primitives & Effects

- `Button.tsx` – shared button component.
- `Card.tsx` – card layout component.
- `Beams.tsx` – animated light beams background (Three.js + React Three Fiber).
- `shimmer-button.tsx` – gradient/shimmer button (used in CTA only).
- `MagneticButton.tsx` – magnetic hover wrapper for CTA buttons.
- `CustomCursor.tsx` – GSAP-driven cursor with color swapping per section. Accepts an `enabled` prop (default `true`); set to `false` to disable and restore the native browser cursor. Currently disabled in `layout.tsx`.
- `LenisProvider.tsx` – smooth scrolling provider using Lenis.
- `icons.tsx` – inline SVG icons for buttons and footer links.

**Usage conventions:**
- For CTAs → `Button` / `shimmer-button` (shimmer reserved for final CTA only).
- For backgrounds → `Beams` (hero only).
- For interactive buttons → `MagneticButton` wrapping `ShimmerButton`.

**Animation architecture (2026-02-10 redesign):**
- **0 animations use blur. 0 animations use scale. 8 unique animation types.**
- Navbar: CSS-only `transition-all duration-300` on scroll.
- Hero: GSAP staggered `y + opacity` entrance; GSAP rotating word slide.
- HowItWorks: GSAP ScrollTrigger pin/scrub with opacity transitions.
- Features: GSAP `REVEAL_Y` on header; CSS `scroll-snap` horizontal scroll.
- CTA: GSAP character-split stagger (`y: 60`, `stagger: 0.02`).
- Footer: No animation.

### 3.3 `lib/`

- `lib/utils.ts` – common place for utilities, e.g., `cn` className helper or other shared logic.
  - When adding reusable **non-UI** helpers, prefer placing them here.
- `lib/gsap.ts` – shared GSAP custom ease registration for natural motion.
- `lib/supabase.ts` – Supabase client initialization using environment variables.
- `lib/waitlist.ts` – Waitlist signup function with enterprise-grade security (see Section 10).

### 3.4 `public/`

Static assets (served from the root URL):
- `public/globe.svg` → `/globe.svg`
- `public/window.svg` → `/window.svg`
- `public/file.svg` → `/file.svg`
- `public/next.svg`, `public/vercel.svg` – standard Next starter assets.

Use these by referencing `/asset-name.svg` from `img` tags or `next/image`.

---

## 4. Routing Overview

The App Router derives routes from the `app/` filesystem:

- `/` → `app/page.tsx`
- `/signup` → `app/(static)/signup/page.tsx`
- `/privacy` → `app/(static)/privacy/page.tsx`
- `/terms` → `app/(static)/terms/page.tsx`

**Route groups**:
- `(static)` is a **group only**, not part of the URL. It’s a good place to keep all mostly-static, simple pages (signup stub, legal docs, etc.).

**Layouts:**
- All routes currently share:
  - The single `RootLayout` in `app/layout.tsx`.
  - Global background, fonts, and noise overlay.

**Adding new routes:**
1. Create a new directory in `app/` (or `app/(static)/`) with your route name:
   - Example: `app/(static)/about/page.tsx` → `/about`
2. Export a default React component from `page.tsx`.
3. Optionally add nested layouts if needed via `layout.tsx` in that directory.

---

## 5. Layout & Theming Details

### 5.1 Global Body & Background

From `app/layout.tsx`:

- `<body>`:
  - Tailwind classes:
    - `antialiased`
    - `text-white`
    - `font-sans`
    - `selection:bg-blue-500 selection:text-white`
  - Inline `style`:
    - `background`: deep teal gradient.
    - `minHeight: '100vh'`.

- Noise overlay:
  - `fixed inset-0 pointer-events-none`
  - Inline SVG noise pattern via `backgroundImage`.
  - `opacity: 0.10`
  - `mixBlendMode: 'overlay'`

### 5.2 Typography & Branding

- Fonts:
  - `DM Sans` used for general copy and UI text.
  - `Bricolage Grotesque` used for headings / display text.
- Tailwind-style custom font utility classes:
  - `font-serif-custom` is used in headings and hero copy.

**Guideline for new components:**
- Use `font-serif-custom` for hero-like headings and brand moments.
- Use base `font-sans` and `text-white/80` for supporting copy.

---

## 6. Component & Data Flow

### 6.1 High-Level Composition (Home Page)

`app/page.tsx`:

- Imports:
  - `Hero`, `HowItWorks`, `Features`, `Navbar`, `Footer` from `components/`.
  - `ShimmerButton`, `MagneticButton` from `components/ui/`.
  - `ArrowRight` icon from `lucide-react`.

- Render structure:
  1. `<Navbar />`
  2. `<Hero />`
  3. `<HowItWorks />`
  4. `<Features />`
    5. CTA section:
      - Big heading: “Ready to be a better person?”
      - Copy encouraging waitlist signup.
      - `MagneticButton` wrapping `ShimmerButton` with “Join the waitlist” + `ArrowRight`.
  6. `<Footer />`

### 6.2 Data & State

- **Current state**: purely presentational.
  - No API routes.
  - No server actions.
  - No client-side data fetching.
- **Implication for onboarding**:
  - Safe to treat all pages as static; ideal playground for adjusting copy, visuals, and layout.
  - Adding dynamic behavior will require:
    - New client components (with `use client` if needed).
    - Potential `app/api` routes or integration with external backends.

---

## 7. Development & Onboarding Guide

### 7.1 Getting Started

1. Install dependencies:
   - `npm install`
2. Run the dev server:
   - `npm run dev`
3. Visit:
   - `http://localhost:3000` for the home page.

### 7.2 Where to Put Things

- **New marketing sections on the homepage**:
  - Create components under `components/` (e.g., `Benefits.tsx`).
  - Import and render in `app/page.tsx`.

- **New standalone pages**:
  - For simple static content: add under `app/(static)/<route>/page.tsx`.
  - For more complex sections or custom layouts, add route folders directly under `app/` with optional `layout.tsx`.

- **Reusable UI elements**:
  - Put in `components/ui/`.
  - Follow existing patterns (small, focused components; accept `className` props; reuse Tailwind + utilities).

- **Utilities / helpers**:
  - Place generic logic in `lib/utils.ts` or new files under `lib/`.

- **Assets**:
  - Place static files in `public/` and reference by `/filename.ext`.

### 7.3 Conventions & Best Practices

- Use **Tailwind utility classes** for layout and styling instead of ad-hoc CSS wherever possible.
- Reuse existing **UI primitives** (`Button`, `Card`, `magic-card`, `shimmer-button`, `aurora-text`) to keep visual style cohesive.
- Prefer **function components with TypeScript types**; keep props typed explicitly.
- Keep **pages thin** – push reusable presentational logic into `components/`.

---

## 8. Future Extensions (Guidance)

- **Backend / APIs**:
  - When needed, add `app/api/*` route handlers for server-side endpoints.
  - Document any new endpoints and data contracts here.

- **Auth / Signup**:
  - `/signup` now renders a **high-conversion waitlist page** with a modern, aesthetic design:
    - **Client component** (`'use client'`) using Framer Motion for subtle animations.
    - **Light, cream-colored card** (`bg-[#faf9f6]`) with large rounded corners (`rounded-3xl`) and soft drop shadow, centered on screen.
    - **Brand kit configuration** at the top of the file for easy customization:
      - `BRAND_NAME`: Currently "Ante"
      - `PRIMARY_COLOR`: Accent color (#005b70)
      - `COPY_HEADLINE`: Main headline text
      - `COPY_SUBTEXT`: Supporting description
    - **Typography**: Serif font (`font-serif-custom`) for headings and brand name, sans-serif for body text.
    - **Logo placeholder**: Square with rounded corners displaying the first letter of the brand name.
    - **Email input**: Single input field with mail icon on the left, light border, rounded corners.
    - **Join Waitlist button**: Full-width, dark background using `PRIMARY_COLOR`, includes Send icon, with hover/tap animations via Framer Motion.
    - **Footer**: Small text with "Terms | Privacy Policy" links.
    - **Animations**: Staggered fade-in animations for all elements using Framer Motion variants.
    - **Waitlist submission**: Uses `addToWaitlist` from `lib/waitlist.ts` with client-side validation and honeypot bot detection.
  - As real signup flows are implemented (e.g., linking to a separate app or embedded form), document:
    - Where the logic lives.
    - Any external services used (Supabase, Auth0, custom backend, etc.).

- **Analytics / Tracking**:
  - If adding analytics (e.g., GA, PostHog), document:
    - Where the script is injected (likely in `app/layout.tsx`).
    - Any custom event tracking patterns.

---

## 9. Quick Reference

- **Main routes**:
  - `/` – Home (`app/page.tsx`)
  - `/signup` – Waitlist-style signup page (`app/(static)/signup/page.tsx`)
  - `/privacy` – Privacy policy stub (`app/(static)/privacy/page.tsx`)
  - `/terms` – Terms & conditions stub (`app/(static)/terms/page.tsx`)

- **Main layout**:
  - `app/layout.tsx` – global fonts, background, noise overlay.

- **Key sections**:
  - `components/Navbar.tsx`
  - `components/Hero.tsx`
  - `components/HowItWorks.tsx`
  - `components/Features.tsx`
  - `components/Footer.tsx`

- **Key UI primitives**:
  - `components/ui/shimmer-button.tsx`
  - `components/ui/MagneticButton.tsx`
  - `components/ui/Button.tsx`
  - `components/ui/Card.tsx`
  - `components/ui/Beams.tsx`

---

## 10. Security Implementation

### 10.1 Waitlist Security (`lib/waitlist.ts`)

The waitlist signup function implements enterprise-grade security measures:

#### Input Validation & Sanitization
1. **Type checking** – Validates email is provided and is a string
2. **Email format validation** – RFC 5322 compliant regex pattern
3. **Email length validation** – RFC 5321 limits (320 total, 64 local part, 255 domain)
4. **Sanitization** – Trim whitespace, lowercase normalization

#### Attack Prevention
5. **SQL injection protection** – Supabase uses parameterized queries automatically
6. **XSS prevention** – HTML tags stripped from all inputs
7. **Unicode/homograph attack prevention** – Blocks suspicious unicode characters that could impersonate legitimate addresses
8. **Control character filtering** – Removes null bytes, zero-width characters, etc.

#### Spam & Abuse Prevention
9. **Email provider whitelist** – Only accepts major providers (Gmail, Outlook, iCloud, Yahoo, ProtonMail, etc.)
10. **Disposable email blocking** – Blocks 100+ known temporary email services
11. **Duplicate email detection** – Handled via database unique constraint with friendly error messaging
12. **Honeypot bot detection** – Hidden field that real users won't fill out

#### Error Handling
14. **Consistent error messages** – Security-conscious messaging that doesn't leak system details
15. **Error codes** – Internal error codes for debugging without exposing to users
16. **Unexpected error catching** – Graceful handling of network/system failures

### 10.2 Frontend Security (`app/(static)/signup/page.tsx`)

The signup page includes:
- **Honeypot field** – Hidden input for bot detection (position: absolute, opacity: 0, tabindex: -1)
- **Disabled states** – Prevents double submission during loading
- **Client-side validation** – Basic validation before server call

### 10.3 Supabase RLS Policies

The waitlist table requires Row Level Security (RLS) policies to function. Run the migration file `supabase/migrations/fix_waitlist_rls_v2.sql` in Supabase SQL Editor.

Required policies:
- **Allow anonymous waitlist signups** (INSERT, anon) - Lets public users sign up
- **Allow authenticated waitlist signups** (INSERT, authenticated) - Lets logged-in users sign up
- **Admins can manage waitlist** (ALL, service_role) - Admin access

**IMPORTANT**: The waitlist insert does NOT chain `.select()` after `.insert()` because:
- `.select()` requires SELECT permission on the table
- Anonymous users only have INSERT permission (by design for security)
- Chaining `.select().single()` would cause RLS policy violations
- Since we already have the email from input, we don't need to fetch it back from DB

### 10.4 Security Best Practices

When extending the codebase:
- Always use Supabase's built-in parameterized queries for SQL operations
- Sanitize and validate all user inputs server-side
- Never expose internal error details to users
- Use TypeScript types for all function parameters and returns
- Log security events (bot detection, suspicious activity) for monitoring
- Configure appropriate RLS policies for each table

---

## 11. Change Log

### 11.1 Grainient Animated Hero Background

- **Added** `components/ui/Grainient.tsx` — WebGL animated gradient component ported from react-bits. Uses `ogl` (already a project dependency) to render a full-screen GLSL fragment shader that blends three colors through noise-warped UV space with configurable warp, grain, contrast, and saturation post-processing.
- **Modified** `components/Hero.tsx`:
  - Removed inline `linear-gradient(135deg, …)` CSS background from the `<section>` element.
  - Added `<Grainient>` as an `absolute inset-0 z-0` background layer with teal palette: `color1="#236597"`, `color2="#003949"`, `color3="#00b0df"`.
  - Re-layered Beams component at `z-1` (was `-z-10`) so it renders on top of the Grainient but below content (`z-10`).
- **Dependency**: `ogl` (already installed) — lightweight WebGL2 library used for the shader renderer.

### 11.2 Download Buttons — Replace Waitlist/Early Access

Replaced all waitlist/early access CTAs with platform-aware download buttons.

- **Added** `lib/useDeviceType.ts` — Client-side hook detecting Android, iOS, or desktop via `navigator.userAgent`. Returns `{ isAndroid, isIOS, isMobile }` (all false during SSR).
- **Added** `AppleIcon` and `AndroidIcon` SVG components to `components/ui/icons.tsx`.
- **Modified** `components/Hero.tsx`:
  - Added `id="download"` to the `<section>` for scroll targeting from Navbar/CTA.
  - Replaced single "Join the waitlist" `<Link>` with two download buttons (iOS + Android).
  - On mobile: only the device-appropriate button renders. On desktop: both shown.
  - Placeholder store URLs (`#`) — replace with real App Store / Google Play links when published.
- **Modified** `components/Navbar.tsx`:
  - Replaced "Early Access" `<Link href="/signup">` with "Download" `<a>` that smooth-scrolls to `#download` hero section.
  - Removed unused `next/link` import.
- **Modified** `components/CallToAction.tsx`:
  - Replaced `ShimmerButton` + `MagneticButton` "Join the waitlist" with a plain "Download the app" button that scrolls to `#download`.
  - Removed `ShimmerButton` and `MagneticButton` imports (no longer used here).