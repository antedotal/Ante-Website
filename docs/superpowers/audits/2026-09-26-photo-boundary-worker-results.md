# Local photo boundary Worker receipt

26 September 2026. Source baseline `86856ee`; the implementation is the commit containing this receipt. The local OpenNext Worker was built with a temporary diagnostic route, run sequentially, stopped, and rebuilt without the route. This is local screening, not production activation or hosted resource acceptance.

Runtime: macOS 27.0 (26A428), arm64; Node 26.8.2; pnpm 12.4.2; Wrangler 4.139.0; OpenNext Cloudflare 1.20.6; Next 16.3.3. Wrangler's build reported workerd compatibility date 2026-09-25; a standalone `workerd --version` executable was unavailable. The child environment allowed only PATH, a fresh temporary HOME/TMPDIR, CI, disabled Next/Wrangler telemetry and synthetic public configuration. Preview bound `127.0.0.1:8787` with run nonce `23ebe787-6e06-4224-b840-59dfc9581865`. No provider request, credential, deployment or production route change was made.

The deterministic corpus uses Node zlib level 6 for PNG with CRC-checked RGBA scanlines and the installed MozJPEG encoder at quality 65 for baseline/progressive JPEG. Fixture tests checked PNG signature/IHDR/depth/color, every chunk CRC, exact inflated row length and last filter. Both padded PNGs decode with the pinned PNG codec; both JPEGs decode with the pinned JPEG codec. The 2 MiB PNG is padded by permitted, printable `tEXt` metadata split into roughly 60 KB chunks, not by high-entropy image data. The maximum RGBA16 PNG expands to 32,002,000 preflight scanline bytes. SHA-256 hashes identify the exact bytes screened:

| Case | Bytes | SHA-256 | Worker result | Worker wall ms |
| --- | ---: | --- | --- | ---: |
| PNG RGBA8 2000×2000 | 26,786 | `49f151fe51f6208cefb7ca7d6fe4ad164ac6750e519c0308581127b6cefa4763` | 200, 2000×2000 | 47 |
| PNG RGBA16 2000×2000 | 43,271 | `73d3c99b6e77e0b273fa74f12ca362374a7d974b928da0aa56adef82fd929fc5` | 200, 2000×2000 | 77 |
| PNG RGBA8 2048×1953 | 26,917 | `e935a57d7ed431cde111b76e7dc3f4c2a8cf5118adfb5b3f91dd717c21004183` | 200, 2048×1953 | 32 |
| PNG metadata-padded exact cap | 2,097,152 | `4624653a70f071a9631426e86dd759cdbc2e7de7ba0a3b8006ff52604e28b784` | 200, 2000×2000 | 53 |
| PNG metadata-padded cap+1 | 2,097,153 | `48cc69bba353b433c97317d263d99529a8b9334077a2fcaadf29cd3cad9ebc03` | 413 `too_large` | 1 |
| PNG CRC-valid late bad filter | 26,787 | `deaff8b5cd6e71a3f3a7dc272e5a7bdbc4c32a043ab6010b7714fba69fecf972` | 422 `invalid_image` | 28 |
| JPEG baseline 2000×2000 | 209,601 | `c6bb8b66fd1ccdff66ce1f106af30925688aaf339ec781d266d85be5bb125e35` | 200, 2000×2000 | 26 |
| JPEG progressive 2000×2000 | 191,054 | `d10667008c54fea4bc7fd522529eddb5f7a8ce3b6f3d1297db5db526b7e8eb37` | 200, 2000×2000 | 26 |

After each denial, a valid 2000×2000 PNG succeeded with the exact 26,786-byte length (Worker wall 32 and 33 ms). Warm repeats: RGBA16 PNG 65/63/61 ms; progressive JPEG 23/30/21 ms. Each successful response matched MIME, width, height and original byte length. These are Worker `performance.now()` wall observations, not CPU timings, a peak isolate-memory measure or throughput claims. The raw JSONL and build transcript were captured outside Git at `/tmp/ante-photo-boundary-worker-20260926.log` for this run.

The initial local attempt exposed an invalid fixture: one enormous `tEXt` chunk failed the pinned PNG decoder and Worker at 422. The corrected fixture splits valid printable metadata into smaller chunks and independently decodes before the passing Worker run. No production validator behavior was changed. Focused fixture/process tests, TypeScript and targeted ESLint passed. Two OpenNext builds completed in the passing run. The temporary source route and final Worker route artifacts were absent afterward; `lsof` found no listener on port 8787. Lifecycle tests additionally exercised occupied-port refusal, nonce mismatch and failure-path process-group exit.

Remaining gates: no CPU profile, total transient isolate-memory bound, maximum-area concurrent overlap, cold-isolate distribution, grayscale JPEG or near-cap compressed entropy coverage was measured here. Hosted plan/configured CPU limit, hosted full-route CPU/outcome evidence and memory acceptance remain open. The production photo mode remains closed.

Independent review accepted the diagnostic slice through `a656a18`; see [review and remaining follow-ups](2026-09-26-photo-boundary-worker-review.md). Both actual builds emitted the known Node DEP0205 deprecation warning. It did not invalidate the observed outcomes.
