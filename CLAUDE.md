# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ante Website is the marketing/landing site for **Ante – The Social Task Manager**. It's a static-first Next.js 16 App Router project with React 19, TypeScript, and Tailwind CSS 4.

## Commands

use pnpm


## Architecture

### Tech Stack
- **Framework**: Next.js 16.1.1 (App Router)
- **UI**: React 19.2.3, TypeScript 5.x (strict mode)
- **Styling**: Tailwind CSS 4, CSS variables for fonts
- **Animations**: Framer Motion, GSAP, Three.js + React Three Fiber
- **Backend**: Supabase (waitlist functionality)

### Directory Structure
```
app/                    # Next.js App Router
├── layout.tsx          # Root layout (fonts, background, noise overlay)
├── page.tsx            # Home page
├── globals.css
└── (static)/           # Route group (not in URL)
    ├── signup/         # /signup - Waitlist form
    ├── privacy/        # /privacy
    └── terms/          # /terms
components/             # Shared components
├── Navbar.tsx, Hero.tsx, Features.tsx, Footer.tsx, etc.
└── ui/                 # UI primitives (Button, Card, shimmer-button, aurora-text, etc.)
lib/                    # Utilities
├── supabase.ts         # Supabase client
├── waitlist.ts         # Waitlist logic with security measures
└── utils.ts            # Helper utilities (cn, etc.)
```

### Global Theme
- **Background**: Deep teal gradient (`#003A4A` → `#001A20` at 135°) with noise overlay
- **Fonts**: DM Sans (sans), Young Serif (serif display via `font-serif-custom`), Roboto Flex
- **Text**: White with opacity variations (`text-white/80`)

## Development Guidelines

### From AGENTS.md
- ALWAYS comment code with its purpose, functionality and implementation
- Read `design.md` to understand the codebase
- After each implementation, update `design.md` with important changes
- If inconsistencies exist between code and docs, prefer actual code and update docs
- After any code implementation, check for lint errors and fix them
- Ensure industry-level security: sanitization, parameterization for SQL operations

### Code Conventions
- Function components with explicit TypeScript types
- Props interfaces named `${Component}Props`
- Accept `className` prop on UI components for customization
- Use Tailwind utilities over ad-hoc CSS
- Use `cn()` or `clsx()` for conditional class merging
- Keep pages thin; push logic into components

### Adding Content
- **New homepage sections**: Create in `components/`, import in `app/page.tsx`
- **New static pages**: Add under `app/(static)/<route>/page.tsx`
- **New UI components**: Place in `components/ui/`
- **Utilities**: Place in `lib/`

## Security Notes

The waitlist (`lib/waitlist.ts`) implements:
- Email validation (RFC 5322 regex, length limits)
- XSS prevention (HTML tag stripping)
- Unicode/homograph attack blocking
- Disposable email blocking
- Gmail normalization (prevents dot/plus variations)
- Honeypot bot detection on signup form

Supabase uses parameterized queries automatically. RLS policies are configured in `supabase/migrations/`.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Key Documentation

- `design.md` - Comprehensive technical documentation (keep updated)
- `CURRENT_SQL.md` - Database schema reference
