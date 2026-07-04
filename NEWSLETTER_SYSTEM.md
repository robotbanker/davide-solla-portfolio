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
  Sample monthly issue content. This is the editorial source of truth.

- `newsletter/data/issues/index.json`  
  Public issue index used by `field-notes.html`. Keep every monthly issue listed here for repo/GitHub reference; the website only displays the current issue and prior issue.

- `newsletter/data/sources/2026-07.manifest.json`  
  Source manifest for the same issue.

- `newsletter/lib/render-email.js`  
  Validates issue data and renders the inline-styled production email.

- `newsletter/build-email.js`  
  CLI builder for `newsletter/dist/[issue-id].html`.

- `newsletter/dist/2026-07.html`  
  Generated production email output after running the build command.

- `newsletter-preview.html`  
  Local browser preview for editorial review.

- `newsletter-preview.css` / `newsletter-preview.js`  
  Preview-only rendering and styling.

- `field-notes.html` / `field-notes.css` / `field-notes.js`  
  Public website page that displays the latest monthly issue and one prior issue.

- `newsletter-signup.js`  
  Shared browser behaviour for the Field Notes signup form.

- `lib/newsletter.js` / `api/newsletter.js`  
  Public enrollment endpoint. It validates consent, sends confirmation email, and creates or re-subscribes a Resend Contact after confirmation.

- Newsletter tab in `admin.html`  
  Includes `Dry Run`, which sends only to `davidesolla@outlook.com`, and `Send issue now`, which saves the issue, requires issue-ID confirmation, runs strict validation, builds the email, and sends it through Resend Broadcasts when configured or SMTP as a fallback.

## Public Enrollment Setup

Required production environment variables:

- `RESEND_API_KEY`
- `NEWSLETTER_TOKEN_SECRET`
- `NEWSLETTER_FROM_EMAIL`

Optional:

- `NEWSLETTER_REPLY_TO_EMAIL`
- `NEWSLETTER_RESEND_SEGMENT_ID`
- `NEWSLETTER_RESEND_TOPIC_ID`
- `NEWSLETTER_RECIPIENTS`
- `NEWSLETTER_DOUBLE_OPT_IN=false` only when another confirmed-consent process exists

The website does not store subscriber email addresses in project files. `NEWSLETTER_RESEND_SEGMENT_ID` is required for Resend Broadcast sends because Broadcasts target a Segment. If Resend is not configured, the admin send button uses SMTP and sends to `NEWSLETTER_RECIPIENTS`, `NEWSLETTER_TO_EMAIL`, or `CONTACT_TO_EMAIL`. The admin `Dry Run` button sends only to `davidesolla@outlook.com`. The Resend broadcast HTML swaps the newsletter footer unsubscribe/preference links to Resend's unsubscribe URL placeholder before sending.

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
   - `newsletter/data/issues/index.json`, so the issue is stored in the website repo and the public Field Notes page can select the current/prior pair

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

5. Once all sources and image permissions are confirmed, change the issue and manifest status to:

   ```json
   "status": "research-approved"
   ```

   Then remove placeholder wording and `isPlaceholder` flags.

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
- If official imagery is not confirmed, keep the image placeholder and mark it in the source manifest.

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
- Store credit and usage status in the issue and source manifest.
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

Build the production email:

```bash
npm run newsletter:build
```

This writes:

```text
newsletter/dist/2026-07.html
```

For a different issue:

```bash
node newsletter/build-email.js 2026-08
```

Strict validation before sending:

```bash
node newsletter/build-email.js 2026-08 --strict
```

Strict mode fails if placeholder content remains or if the source manifest is not `research-approved`.

## QA Workflow

Basic code check:

```bash
npm run check
```

Desktop and mobile visual review:

1. Start the local server with `npm start`.
2. Open `http://localhost:4173/newsletter/dist/[issue-id].html`.
3. Check desktop width around `1440px`.
4. Check mobile width around `390px`.
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
