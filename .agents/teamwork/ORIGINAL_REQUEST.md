# Original User Request

## 2026-10-03T11:37:31Z

This is a single self-contained fix; keep it small and focused. Refresh the Ante website visual styling by replacing the primary blue color with #4A8B9F, adopting Google Sans Flex via Google Fonts CDN with custom variable font axis settings, and eliminating scroll lag across the website.

Working directory: c:\Users\havis\Documents\Projects\Ante-Website
Integrity mode: development

## Requirements

### R1. Primary Blue Color Refresh
Update the primary blue color across the website (including CSS theme tokens `--color-background`, `--color-primary`, `--color-accent`, and associated background/gradient references that use the `#003949` shade) to `#4A8B9F`.

### R2. Typography Update to Google Sans Flex via Google Fonts CDN
Load Google Sans Flex using the Google Fonts CDN link in the root HTML `<head>` and remove the local fontsource package import. Configure CSS font-variation-settings so body copy defaults to a roundness axis `ROND` value of `50`, and emphasised text elements (titles, main headings, and subheadings) apply a width axis `wdth` value of `151` alongside `ROND` 50.

### R3. Scroll Performance Optimization
Eliminate scroll stutter and lag throughout the website. Resolve GPU compositing bottlenecks, WebGL animation overhead, and smooth-scrolling synchronization issues so the page scrolls fluidly at standard display refresh rates.

### R4. Project Documentation & Quality Guardrails
Update `./.guidelines/design.md` with all architectural, styling, and performance changes made during this refresh. Ensure that existing linting rules, type checks, and project build pipelines pass without errors or regressions.

## Acceptance Criteria

### Visual & Typography
- [ ] The Google Sans Flex font is loaded via Google Fonts CDN in the application root head without console warnings or layout shifts.
- [ ] Base text across the site renders with font variation axis `"ROND" 50`.
- [ ] Titles and subheadings render with font variation axis `"wdth" 151` and `"ROND" 50`.
- [ ] The primary background and brand color tokens are set to `#4A8B9F`.

### Scroll & Performance
- [ ] Page scrolling is smooth and responsive with no frame drops caused by fixed fullscreen filter overlays, duplicate animation frames, or unthrottled WebGL renders.
- [ ] Smooth scrolling mechanisms and scroll-driven animations run in sync without rubber-banding or frame conflicts.
- [ ] Offscreen WebGL canvas rendering pauses when not in the active viewport.

### Build & Verification
- [ ] `pnpm run lint` completes with zero errors.
- [ ] `pnpm run typecheck` completes with zero errors.
- [ ] `pnpm run build` completes successfully.
- [ ] `.guidelines/design.md` contains accurate documentation reflecting the font, color, and scroll performance updates.
