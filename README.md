# Davide Solla Website Rebuild

Portfolio website for Davide Solla, rebuilt from the public Adobe Portfolio content into a refined fashion-photography presentation.

## Files

- `index.html` - homepage structure and SEO metadata
- `client-area.html` / `client-area.js` - private client login and embedded gallery page
- `styles.css` - responsive editorial design system
- `script.js` - mobile navigation, data-driven albums, image lightbox, and contact form submission
- `newsletter-signup.js` - shared newsletter signup form behaviour
- `data/site.json` - editable portfolio albums, covers, section text, and gallery image lists
- `admin.html` - protected admin portal for editing albums and uploading images
- `server.js` / `api/admin.js` / `api/client.js` - local and Vercel backend endpoints
- `robots.txt` / `sitemap.xml` - crawler guidance and image sitemap for SEO
- `assets/images/` - curated local portfolio images from the current public site

## Admin Portal

Run locally:

```bash
npm install
npm start
```

Set `ADMIN_PASSWORD` in `.env.local`, then open `http://localhost:4173/admin.html`. There is no default password.

For production, set these Vercel environment variables:

- `ADMIN_PASSWORD` - the password for the admin portal
- `ADMIN_SESSION_SECRET` - optional separate key for signing eight-hour admin sessions
- `ADMIN_DATA_ENCRYPTION_KEY` - encryption key for private client records; keep this stable and backed up
- `GITHUB_TOKEN` - a fine-grained GitHub token with Contents read/write access to this repo
- `GITHUB_OWNER` - `robotbanker`
- `GITHUB_REPO` - `davide-solla-portfolio`
- `GITHUB_BRANCH` - `main`
- `VERCEL_DEPLOY_HOOK_URL` - Vercel Deploy Hook URL for the production branch
- `SMTP_USER` - Gmail address used to send website enquiries
- `SMTP_PASS` - Gmail app password for the website enquiry sender
- `SMTP_HOST` - optional SMTP host, defaults to `smtp.gmail.com`
- `SMTP_PORT` - optional SMTP port, defaults to `465`
- `CONTACT_TO_EMAIL` - private recipient address for enquiries, defaults to `SMTP_USER`
- `CONTACT_FROM_EMAIL` - sender address, for example `Davide Solla Website <davidesollastudios@gmail.com>`
- `CONTACT_SUBJECT_PREFIX` - optional email subject prefix, defaults to `Website enquiry`
- `RADAR_ENQUIRY_ENDPOINT` - private Radar intake URL for durable enquiry persistence
- `WEBSITE_ENQUIRY_WEBHOOK_SECRET` - shared server-only HMAC secret; use the same value in Radar
- `RADAR_ENQUIRY_TIMEOUT_MS` - optional Radar request timeout, defaults to six seconds
- `RESEND_API_KEY` - required for idempotent browser-enquiry notifications; also the fallback when legacy SMTP is not configured
- `NEWSLETTER_FROM_EMAIL` - sender for Field Notes confirmation emails, defaults to `CONTACT_FROM_EMAIL` or SMTP sender
- `NEWSLETTER_REPLY_TO_EMAIL` - optional reply-to address for newsletter confirmations
- `NEWSLETTER_TOKEN_SECRET` - stable secret used to sign double opt-in confirmation links
- `NEWSLETTER_DOUBLE_OPT_IN` - defaults to `true`; set to `false` only if another consent confirmation process exists
- `NEWSLETTER_RESEND_SEGMENT_ID` - Resend Segment ID used for enrollment and required for live Broadcast sends
- `NEWSLETTER_RESEND_TOPIC_ID` - public opt-in Resend Topic ID for Field Notes; required for preferences and live Broadcast sends
- `CREATIVEHUB_API_KEY` - Creativehub API key used server-side to load print products
- `CREATIVEHUB_API_BASE_URL` - optional Creativehub API base URL, defaults to `https://api.creativehub.io`
- `CREATIVEHUB_ORDER_COUNTRY_CODE` - optional fulfilment country code for checkout, defaults to `GB`
- `CREATIVEHUB_FULFILLMENT_LABEL` - optional shop fulfilment label, defaults to `UK-first print fulfilment`
- `CREATIVEHUB_LEAD_TIME` - optional print shop lead-time copy
- `STRIPE_SECRET_KEY` - optional Stripe secret key used to create live print checkout sessions
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret for `/api/stripe-webhook`
- `PRINT_PAYMENT_URL` - optional fallback payment link if Stripe is not configured
- `PRINT_CHECKOUT_SUCCESS_URL` - optional Stripe success redirect URL
- `PRINT_CHECKOUT_CANCEL_URL` - optional Stripe cancel redirect URL
- `PRINT_ORDER_TOKEN_SECRET` - optional signing secret for temporary print checkout tokens

Production uploads are committed to GitHub under `assets/images/uploads/`, and album/text edits update `data/site.json`.
Album/text edits also refresh `sitemap.xml` so newly published portfolio images can be discovered through the image sitemap.
After each admin save, the backend calls `VERCEL_DEPLOY_HOOK_URL` so Vercel starts a fresh deployment immediately.

Create the deploy hook in Vercel under Project Settings -> Git -> Deploy Hooks. Choose the production branch, usually `main`, then copy the generated URL into the `VERCEL_DEPLOY_HOOK_URL` environment variable.

## iPhone App

The `ios/` folder is a Capacitor iOS app that opens the live site at `https://www.davidesolla.com`. The app uses the hosted site because admin login, client galleries, contact forms, print checkout, and uploads depend on the Vercel/Node API endpoints.

Run after changing Capacitor config or native dependencies:

```bash
npm run ios:sync
```

Open the native project in Xcode:

```bash
npm run ios:open
```

From Xcode, choose a signing team and run the `App` scheme on an iPhone simulator or connected device.

## Client Area

Use the Client area block in `admin.html` to create a client login, set or reset the password, and paste the client's Lightroom shared gallery link. Private client records and password hashes are authenticated-encrypted in `data/admin-site.enc`; client records are removed from the public `data/site.json`.

Clients open `client-area.html`, sign in with their email and password, then view the embedded gallery or open the Lightroom link directly for downloads.

## Contact Form

The public form posts to `/api/contact`, so the visitor never sees the recipient address in the page HTML. Configure the recipient and sender with `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` in the hosting environment.

ID-bearing browser enquiries are sent through the Resend API with a deterministic idempotency
key, so a retry cannot create a duplicate notification. Configure `RESEND_API_KEY`,
`CONTACT_TO_EMAIL`, and `CONTACT_FROM_EMAIL` before enabling the Radar integration. Gmail SMTP
remains available only for legacy internal notifications that do not enter the enquiry funnel;
use a Gmail app password for `SMTP_PASS`, not the normal account password.

Browser submissions carry a stable opaque enquiry ID and submission timestamp. The backend
validates and HMAC-signs a privacy-minimised event, then Radar stores an immutable private
receipt before email is attempted. Identical retries cannot create a duplicate lifecycle
record. Delivery acceptance/failure is stored separately: failed notifications can retry,
accepted notifications are skipped, and Resend receives the same deterministic idempotency
key on every attempt. The API does not acknowledge the browser until Radar records provider
acceptance. The daily Radar email fallback uses the same contact endpoint without an enquiry
ID, so it remains an internal notification and cannot loop back into the commercial funnel.

Acquisition data is limited to landing path, referrer hostname, and the five standard UTM
fields. The form does not retain IP addresses, user agents, full URLs, `gclid`, `fbclid`, or
other advertising identifiers. Enquiry details are used only to answer and manage the
requested project and do not subscribe the sender to Field Notes. Radar assigns a two-year
retention review date; this is an operational default that should be confirmed during the
studio's focused privacy review.

## Newsletter Signup

The Field Notes page posts newsletter signups to `/api/newsletter`. The form asks for email, optional first name, and explicit consent, with a hidden honeypot field and per-IP rate limiting.

Subscriber records are managed in Resend Contacts rather than stored in this repository. Set `RESEND_API_KEY`, `NEWSLETTER_TOKEN_SECRET`, and a verified `NEWSLETTER_FROM_EMAIL` in production. By default the backend sends a confirmation email and only creates or re-subscribes the Resend Contact after the visitor clicks the confirmation link.

Set `NEWSLETTER_RESEND_SEGMENT_ID` so new contacts are added to the same Resend Segment used by the admin send button. Create a public opt-in Resend Topic named `Field Notes` and set `NEWSLETTER_RESEND_TOPIC_ID` so enrollment, provider-hosted preferences, and live sends share the same consent boundary.

The Newsletter tab in `admin.html` has a `Dry Run` button and a `Send issue now` button. `Dry Run` saves the current issue and sends a test email only to `davidesolla@outlook.it` through Resend email sending or SMTP. `Send issue now` saves the current issue, requires typing the selected issue ID as confirmation, runs strict research and image-rights validation, builds the email HTML, and creates a Topic-scoped Resend Broadcast. Live delivery fails closed without the Resend API key, Segment and Topic; SMTP is never used for an audience send.

`NEWSLETTER_TOKEN_SECRET` must be a dedicated secret of at least 32 bytes and must not reuse the admin session secret. Live delivery creates a private per-issue state record in `lib/newsletter-send-state/` before calling Resend. A repeated, concurrent, or ambiguous attempt remains locked for manual reconciliation rather than risking a duplicate audience send.

## Privacy, Analytics and Search Console

GA4 uses measurement ID `G-1T625VVZL2` and basic consent mode. `privacy-consent.js` does not request Google's tag or send any analytics data until a visitor affirmatively allows analytics. The versioned choice is stored in first-party local storage, can be changed through the footer settings control, and is reset when the notice version changes. Advertising storage, user data, personalisation and Google Signals stay denied.

Analytics is available only on the homepage and Field Notes. It is absent from the private client area, email-preference page, admin tools and privacy page. Do not add a second direct GA4 tag, a GTM container, remarketing or advertising pixels without revisiting the consent design and privacy notice.

The local `google-tag.js` helper records these lightweight, consent-gated conversion signals:

- `generate_lead` after a durably accepted commission enquiry; the Radar-linked enquiry ID is not sent to GA
- `enquiry_intent` when visitors click links to the contact section
- `instagram_click` when visitors click the studio Instagram link

The enquiry contract records only `granted`, `denied` or `unset` as the analytics choice at submission. Acquisition context is allowlisted and excludes full referring URLs, click IDs, user agents and IP addresses. The public notice is at `/privacy`; `privacy_notice_version` must match its last-updated date when collection wording changes.

Google Search Console can verify the `https://www.davidesolla.com/` URL-prefix property using the installed GA4 tag after deployment. DNS verification remains the preferred method for a domain property covering all subdomains and protocols.

Recommended next steps:

1. Verify both the domain property and the `https://www.davidesolla.com/` URL-prefix property in Google Search Console.
2. Submit `https://www.davidesolla.com/sitemap.xml`.
3. Inspect and request indexing for `/` and `/field-notes.html`.
4. Accept analytics in a clean browser, then review GA4 Realtime to confirm page views and lead events are received.
5. Verify the GA4 event-data retention setting, provider data-processing terms and international-transfer safeguards during the studio's periodic privacy review.

Future SEO structure work, such as dedicated crawlable portfolio/story URLs or service pages, would change visible site structure and copy. Treat that as a separate content/design approval item, not a backend-only SEO change.

## Print Shop

The homepage print shop is driven by the server-side `/api/prints` endpoint, which loads products from Creativehub using `CREATIVEHUB_API_KEY`. Only products returned by Creativehub with available print options are shown. The public order panel posts buyer delivery details back to the same server-side endpoint, which creates a Creativehub embryonic order for delivery options.

After a delivery option is selected, the site creates a Stripe Checkout session when `STRIPE_SECRET_KEY` is configured. If Stripe is not configured, `PRINT_PAYMENT_URL` can be used as a temporary fallback payment link.

Configure a Stripe webhook endpoint at `/api/stripe-webhook` and listen for `checkout.session.completed`. The webhook verifies `STRIPE_WEBHOOK_SECRET` and confirms the Creativehub order only after Stripe reports the Checkout Session as paid.

To set up Creativehub:

1. Upload high-resolution images in Creativehub.
2. Select the files and choose "Sell as print".
3. Add print sizes, paper, pricing, and edition settings.
4. Complete Art store settings, including branding and a payment card for fulfilment.
5. Create an API key under Account settings -> API Keys.
6. Add that key to this site as `CREATIVEHUB_API_KEY`.

Keep Creativehub and Stripe keys server-side only; never put them in browser JavaScript or public data files. Creativehub requires a fulfilment payment card before draft orders can be created, because production and fulfilment costs are charged through the Creativehub account. Customer payment happens separately through the website checkout, then paid orders can be confirmed for Creativehub fulfilment.
