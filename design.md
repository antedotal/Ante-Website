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
- `ColorBendBackground.tsx`

High-level intended roles:
- **`Navbar`**: Top navigation for the marketing site (links, logo, CTA).
- **`Hero`**: Above-the-fold content describing Ante’s core value prop.
- **`HowItWorks`**: Explains the core flow/experience.
- **`Features`**: Lists feature highlights/benefits.
- **`Footer`**: Footer with links, probably including legal routes (`/privacy`, `/terms`) and signup.
- **`ColorBendBackground`**: Likely visual effect background for sections or hero.

These are composed in `app/page.tsx`.

#### 3.2.1 `components/ui/` – UI Primitives & Effects

- `Button.tsx` – shared button component.
- `Card.tsx` – card layout component.
- `Beams.tsx` – animated light beams background (Three.js + React Three Fiber).
- `shimmer-button.tsx` – gradient/shimmer button (used in CTA only).
- `MagneticButton.tsx` – magnetic hover wrapper for CTA buttons.
- `CustomCursor.tsx` – GSAP-driven cursor with color swapping per section.
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