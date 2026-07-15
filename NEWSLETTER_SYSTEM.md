# Davide Studios Newsletter System

Reusable monthly newsletter workflow for **Davide Studios: Monthly Newsletter — [Month] Issue**.

## Repository Inspection Summary

The website is a static, image-led portfolio served by a small Node server and Vercel-compatible API layer. The visual system is defined mainly in `styles.css`, with content-driven portfolio data in `data/site.json`.

Existing identity tokens:

- Backgrounds: near-black gallery surfaces, chiefly `#0b0a09`, `#080807`, `#11100e`.
- Text: warm porcelain `#f1ede6`, muted bone/stone text `#cfc6bb` and `#a9a29a`.
- Accent: restrained warm gold `#bca66e`, used sparingly for section kickers and fine rules.
- Typography: display serif stack `Didot`, `Bodoni 72`, `Baskerville`, then `Times New Roman`; sans stack `Avenir Next`, `Neue Haas Grotesk Text`, `Helvetica Neue`, Arial.
- Rhythm: generous spacing, compact uppercase labels, large editorial serif headings, fine separators, and photography-led pacing.
- Imagery: cinematic portrait and fashion work, mostly local responsive assets under `assets/images/responsive/`.

Current architecture:

- `index.html` is the homepage shell.
- `styles.css` contains the responsive design system.
- `script.js` renders portfolio galleries from `data/site.json`.
- `server.js` serves public static files and API endpoints.
- `api/` and `lib/` handle admin, contact, client area, print shop and security.
- The public newsletter signup posts to `/api/newsletter` and uses Resend Contacts for subscriber management.

Recommended approach implemented:

- Keep the newsletter system separate from the homepage so the site is not redesigned.
- Keep subscriber data out of the repository; use Resend Contacts, Segments and Topics for the email list.
- Use explicit consent, rate limiting, a honeypot field and double opt-in confirmation by default for public enrollment.
- Store each monthly issue as structured JSON.
- Store research provenance in a matching source manifest.
- Generate production email HTML from data, with email-safe table layout and inline styles.
- Use a browser preview page for editorial review.
- Treat placeholder/sample content as draft-only and block strict validation until research is approved.

## File Map

- `newsletter/data/issues/2026-07.json`  
  Sample monthly issue content and editorial source of truth. Issue JSON is read server-side and through the authenticated admin API; draft files are not served directly.

- `newsletter/data/issues/index.json`  
  Server-side publication index for the stable `/field-notes/YYYY-MM` pages. Each entry records research status separately from explicit `publicationStatus`; published entries also carry `publishedAt` and `updatedAt` for Article metadata and the sitemap. The raw index is not a public endpoint.

- `newsletter/data/sources/2026-07.manifest.json`  
  Protected source manifest for the same issue. It is read server-side and through the authenticated admin API, not served as a public static file.

- `newsletter/lib/render-email.js`  
  Validates issue data and renders the inline-styled production email.

- `newsletter/build-email.js`  
  CLI builder for `newsletter/dist/[issue-id].html`.

- `newsletter/dist/[issue-id].html`
  Generated only after strict source and research validation succeeds. Draft issues do not keep a public production file.

- `newsletter-preview.html`  
  Authenticated browser preview for editorial review. Open it from the signed-in admin editor so the tab retains the admin session.

- `newsletter-preview.css` / `newsletter-preview.js`  
  Preview-only rendering and styling.

- `lib/field-notes-pages.js` / `api/field-notes.js`
  Server-rendered public issue pages. The first response contains the complete article, issue-specific canonical/social metadata, Article structured data, and stable archive links.

- `field-notes.html` / `field-notes.css` / `field-notes.js`  
  Compatibility shell, public styles and mobile-navigation behaviour. Issue content is always server-rendered; production routes the old `.html` URL and query-string issue links through the stable issue handler.

- `newsletter-signup.js`  
  Shared browser behaviour for the Field Notes signup form.

- `lib/newsletter.js` / `api/newsletter.js`  
  Public enrollment endpoint. It validates consent, sends confirmation email, and creates or re-subscribes a Resend Contact after confirmation.

- `lib/newsletter-metrics.js`
  Best-effort, server-only transport for strict anonymous lifecycle facts. It signs the exact JSON body with timestamped HMAC headers, uses an opaque event ID for idempotency, rejects non-HTTPS destinations except localhost, and never includes subscriber or provider identifiers.

- `lib/newsletter-send-state/[issue-id].json`
  Private, durable live-send lock and outcome record. A live attempt is acquired before Resend is called and remains fail-closed when delivery is sent, rejected, or ambiguous. Reconcile this record with Resend before any manual intervention; never delete it merely to retry.

- Newsletter tab in `admin.html`  
  Includes `Dry Run`, which sends only to `davidesolla@outlook.it`, and `Send issue now`, which saves the issue, requires issue-ID confirmation, runs strict validation, builds the email, and sends it through a Topic-scoped Resend Broadcast. SMTP is restricted to dry runs.

## Public Enrollment Setup

Required production environment variables:

- `RESEND_API_KEY`
- `NEWSLETTER_TOKEN_SECRET`
- `NEWSLETTER_FROM_EMAIL`
- `NEWSLETTER_RESEND_SEGMENT_ID`
- `NEWSLETTER_RESEND_TOPIC_ID`
- `RADAR_NEWSLETTER_METRICS_ENDPOINT`
- `NEWSLETTER_METRICS_WEBHOOK_SECRET`

Optional:

- `NEWSLETTER_REPLY_TO_EMAIL`
- `NEWSLETTER_DOUBLE_OPT_IN=false` only when another confirmed-consent process exists
- `RADAR_NEWSLETTER_METRICS_TIMEOUT_MS=4000`

`NEWSLETTER_RESEND_TOPIC_ID` is required for live audience sends. Create one public, opt-out-by-default Resend Topic named `Field Notes`, then store its ID in the production environment. The website explicitly opts a contact into that Topic only after confirmed consent. Live sends fail closed without the Topic; SMTP is available only for the single-recipient dry run.

The public `/preferences` page contains no analytics. A subscriber can request a short-lived, signed link without the site revealing whether an address is on the list. The secure page can update the Field Notes Topic or globally unsubscribe the Resend Contact; it never silently restores a globally unsubscribed Contact. Resubscription returns to the consent and double-opt-in flow.

Email confirmation is two-step: opening the confirmation URL performs no write, and the subscriber must explicitly submit the confirmation form. This prevents email link scanners from subscribing an address merely by visiting the URL. Confirmation claims are protected with purpose-bound AES-256-GCM so the query token does not expose the subscriber's email, name or source in URL logs.

`NEWSLETTER_TOKEN_SECRET` is a dedicated newsletter-only secret of at least 32 bytes. It must never fall back to or reuse `ADMIN_SESSION_SECRET`.

The website does not store subscriber email addresses in project files. `NEWSLETTER_RESEND_SEGMENT_ID` is required because Broadcasts target a Segment. The admin `Dry Run` button sends only to `davidesolla@outlook.it`; live sends fail closed unless Resend, the Segment and the public, opt-out-by-default Topic are all configured. The Topic-scoped Broadcast swaps both footer links to Resend's recipient-specific preference URL.

Resend remains the subscriber system of record. The website sends Radar only `newsletter.lifecycle.observed` facts for confirmed consent, Topic opt-out, global unsubscribe and accepted live Broadcast boundaries. Website facts contain a timestamp, event type and HMAC-derived event ID; Broadcast facts also carry `issue_id` and an HMAC-derived campaign key. They contain no names, emails, contact IDs, Resend Broadcast IDs, tokens, IP addresses, user agents, subjects or full links. Separately, Resend sends signed lifecycle events to Radar's private provider endpoint; Radar verifies them, immediately discards recipient-level fields, and retains only anonymous confirmation, opt-out and delivery-health facts. Radar does not retain names, emails, contact or provider IDs, IP addresses, user agents, subjects, full links, opens or clicks. A Radar error is logged only as lifecycle type plus generic code and never changes the already-completed consent or provider outcome.

## Adding a New Monthly Issue

1. Copy the previous issue JSON:

   ```bash
   cp newsletter/data/issues/2026-07.json newsletter/data/issues/2026-08.json
   cp newsletter/data/sources/2026-07.manifest.json newsletter/data/sources/2026-08.manifest.json
   ```

2. Update:

   - `issueId`
   - `month`
   - `year`
   - `title`
   - `preheader`
   - `openingNote`
   - all section content
   - matching source manifest entries
   - `newsletter/data/issues/index.json`, including `status`, `publishedAt`, and `updatedAt`, so approved issues receive stable public URLs and deterministic sitemap dates

3. Keep section order exactly:

   - `01 — Art`
   - `02 — Fashion`
   - `03 — On the Field`
   - Footer

4. Keep placeholder flags until research is complete:

   ```json
   "status": "sample-placeholder",
   "allowPlaceholders": true
   ```

5. Once all editorial and image sources are confirmed, change the issue and manifest status to:

   ```json
   "status": "research-approved"
   ```

   Then remove placeholder wording and `isPlaceholder` flags.

Saving through the newsletter admin preserves the original `publishedAt`, refreshes `updatedAt`, and writes the issue index plus `sitemap.xml` in the same repository commit. Draft or malformed issue records never become the current public issue. Every configured image is rendered with its source credit directly beneath it.

## Editorial Content Rules

Opening note:

- 35-60 words.
- British English.
- Observant, warm, restrained.
- No sales language.

Art:

- 3-5 London events total.
- One featured event with image.
- Supporting events as concise editorial list items.
- Use official museum, gallery, artist, festival or ticketing sources only.
- Each listing needs title, institution, dates, London location, description, official link, CTA and “Why it matters visually”.

Fashion:

- 3-4 stories maximum.
- Use official brand, campaign, runway, press or approved publication sources only.
- Do not use retailer imagery, random image search, repost accounts or unverified social imagery.
- Use a real image URL from the official source and add a concise image credit.

On the Field:

- Keep this as a single studio-led module, not a multi-item diary.
- Do not add `PL Photostudio diary` or `In conversation` subsections.
- Use the issue’s `imageRotation.pool` to rotate one image from the existing Davide Studios website archive each month.
- Keep the note concise and studio-facing. Do not invent diary entries, collaborations or partnership news.

## Image Requirements

Email images should be compressed JPG or PNG where possible. AVIF/WebP are good for the website but not reliable across all email clients.

Recommended slots:

- Art featured image: `1200 x 760 px`, landscape.
- Fashion story image: `1200 x 900 px`, landscape or soft editorial crop.
- On the Field image: selected automatically from `sections.onTheField.imageRotation.pool`, using existing Davide Studios website images. Recommended source files are `1200px` JPG derivatives under `assets/images/responsive/`.

Image rules:

- Use descriptive alt text.
- Store the image credit and official source URL in the issue and source manifest.
- Use full production URLs in generated email. The renderer converts local `assets/...` paths to `https://www.davidesolla.com/assets/...`.
- Do not send with placeholder images unless the email is explicitly a draft.

## Source Manifest

Each issue must have:

```text
newsletter/data/sources/[issue-id].manifest.json
```

Every story entry stores:

- Story title
- Official source URL
- Booking URL where relevant
- Image credit / usage status
- Date checked
- Notes on why it was selected

Set the manifest status to `research-approved` only after every source has been checked.

## Preview, Build and Export

Run the local site:

```bash
npm start
```

Open:

```text
http://localhost:4173/newsletter-preview.html
```

Build the production email after the research and source checks pass:

```bash
npm run newsletter:build
```

This writes:

```text
newsletter/dist/2026-07.html
```

For a different issue:

```bash
node newsletter/build-email.js 2026-08 --strict
```

Strict validation before sending:

```bash
node newsletter/build-email.js 2026-08 --strict
```

Strict mode fails if placeholder content remains or if the source manifest is not `research-approved`.

## Image Sources and Attribution

Image publication is not gated by the legacy `imageRights` records. The public Field Notes page, authenticated preview and generated email all render every configured image URL. Each image has a `Source:` caption immediately beneath it, using the issue credit and linking to the story's official source URL.

The Newsletter admin’s **Image sources** panel displays the normal dry-run and live-send validation results and keeps the source manifest editable. Existing `imageRights` entries may remain as historical records, but they do not hide images or block builds and sends. The separate **Publish this issue at its stable Field Notes URL** checkbox remains the human publication decision; research approval alone never creates a public issue URL.

Admin saves carry a SHA-256 revision over the issue and manifest. GitHub-backed saves pin all reads and the commit parent to one branch-head SHA, then update the branch with compare-and-swap semantics; a stale tab or concurrent serverless instance receives `409` before it can overwrite the issue or shared index.

The final live-send confirmation also carries that saved revision. The server reads one pinned issue/manifest snapshot and rejects a changed revision before any provider request, so the audience can receive only the exact content that was reviewed and confirmed.

## QA Workflow

Basic code check:

```bash
npm run check
```

Desktop and mobile visual review before publishing:

1. Start the local server with `npm start`.
2. Open `http://localhost:4173/newsletter-preview.html?issue=[issue-id]`.
3. Check desktop width around `1440px`.
4. Check mobile width around `390px`.

After strict validation succeeds, build the production file and repeat the review at `http://localhost:4173/newsletter/dist/[issue-id].html` before a live send.
5. Capture screenshots into `output/playwright/` for review.

The production email deliberately avoids JavaScript, embedded video and fragile layout techniques. It uses table-based structure, inline styles and simple fluid image behaviour for email compatibility.

## Sending

This repository does not send newsletter emails automatically.

Recommended send process:

1. Complete research.
2. Approve the source manifest.
3. Run strict validation.
4. Build the production email.
5. Review desktop and mobile screenshots.
6. Sign in to `admin.html`, open Newsletter, select the issue and click `Send issue now`.
7. Type the issue ID in the confirmation prompt to send immediately.
8. Send a test email before the first live audience send whenever sender/domain configuration changes.
