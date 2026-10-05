# Teamwork Round 2 Review & QA Handoff Report

## 1. What the Prior Attempt Got Wrong
1. **Google Fonts CSS2 Variable Axes Ordering Violation (R2 Bug)**:
   - **Input**: In `app/layout.tsx`, `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght,wdth,ROND@6..144,1..1000,25..151,0..100&display=swap" />`.
   - **Expected**: In accordance with the Google Fonts CSS2 API specification, variable font axis keywords must be strictly sorted in alphabetical order (standard registered lowercase axes `opsz,wdth,wght`, followed by custom uppercase axes `ROND`), and their respective numerical range groups must strictly correspond to the axis sequence (`6..144,25..151,1..1000,0..100`).
   - **Actual**: `wght` was placed before `wdth` (`w-g-h-t` before `w-d-t-h`), and values were ordered as `1..1000,25..151`. When processed by the strict Google Fonts CSS2 parser, invalid axis order triggers an HTTP 400 Bad Request error or causes the font file to fail to load, falling back to system sans-serif.
   - **Root Cause**: The prior attempt manually assembled the Google Fonts CSS2 query string without sorting the axis tags alphabetically.

2. **Grainient Initial Frame Blank Flash on Mount & Resize Boundary (R3 Bug/Gap)**:
   - **Input**: Page loads containing `Grainient` (Hero, SignUp, Privacy, Terms) and window resize events while static or paused.
   - **Expected**: A rendered WebGL frame is present immediately when the canvas is attached to the DOM so no transparent/blank canvas flash is visible, and any resize event immediately redraws to the new dimensions.
   - **Actual**: `isVisible` was initialized to `false` in `Grainient.tsx`, and `setSize()` was guarded by `if (isVisible && ...)`. On initial mount, `setSize()` was called while `isVisible` was `false`, skipping `render()`. The canvas remained completely unpainted until the asynchronous `IntersectionObserver` callback fired in a later turn of the event loop.
   - **Root Cause**: Tying the initial render and resize draw exclusively to `isVisible` before `IntersectionObserver` had delivered its first entry.

3. **Incomplete `.dark` Theme Tokens (R1 Hygiene Gap)**:
   - **Input**: Downstream components or elements inheriting the `.dark` class.
   - **Expected**: `--primary` and `--accent` tokens resolve to `#4A8B9F`.
   - **Actual**: In `app/globals.css`, the `.dark` block still defined `--primary: oklch(0.922 0 0)` and `--accent: oklch(0.269 0 0)`.
   - **Root Cause**: `.dark` block was omitted when updating `:root` custom properties.

## 2. What I Changed
- **`app/layout.tsx`**:
  - Reordered Google Sans Flex CDN link to `opsz,wdth,wght,ROND@6..144,25..151,1..1000,0..100` to comply strictly with Google Fonts CSS2 API alphabetical sorting rules.
- **`components/ui/Grainient.tsx`**:
  - Initialized `isVisible = true` on mount.
  - Updated `setSize()` to unconditionally render a frame when `prefersReducedMotion || raf === 0`, ensuring an immediate paint on canvas attachment and after resizing without waiting for asynchronous observer callbacks.
- **`app/globals.css`**:
  - Aligned `.dark` block `--primary` and `--accent` to `#4A8B9F` with `--primary-foreground: #ffffff` and `--accent-foreground: #ffffff`.
- **`.guidelines/design.md`**:
  - Updated documentation with the corrected alphabetical Google Fonts CDN URL, expanded heading/subheading typography coverage, Lenis stylesheet integration, and Grainient WebGL context lifecycle.

## 3. Verification Record
- **Deep Verification (ran actual tests):**
  - `pnpm run lint`: Exited with code 0 (zero errors, zero warnings).
  - `pnpm run typecheck`: Exited with code 0 (zero errors).
  - `pnpm run build`: Exited with code 0 (Next.js 16.3.3 Turbopack compiled and optimized 16 static/dynamic routes in ~1.5s).
  - `pnpm test`: Exited with code 0 (33 test files passed, 384 tests passed).
  - Zero occurrences of legacy `#003949` remain in the entire codebase.
- **Shallow Verification (manual only):**
  - Inspected compiled CSS bundle to verify `--color-background`, `--color-primary`, and `--color-accent` compile directly to `#4a8b9f`.
  - Inspected font variation settings in compiled output to verify `ROND 50` on body and `wdth 151, ROND 50` on headings.
- **Unverified aspects:**
  - Physical multi-monitor hardware refresh rates (e.g. 120Hz/144Hz ProMotion/FreeSync displays) and trackpad inertia curves.
  - Offline environments with strict firewalls blocking Google Fonts CDN (falls back cleanly to system `sans-serif`).

## 4. Known Issues
- `Minor Robustness Risk`: Offline or corporate firewall environments blocking `fonts.googleapis.com` or `fonts.gstatic.com` gracefully fall back to system `sans-serif`.

## 5. Remaining Risk & Next Step
All acceptance criteria for R1 (color refresh), R2 (typography), R3 (scroll performance), and R4 (documentation and guardrails) are fully addressed and verified. The codebase is clean, tests and builds pass with zero errors, and the implementation is ready for merge.
