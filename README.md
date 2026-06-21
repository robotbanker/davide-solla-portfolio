# Davide Solla Website Rebuild

Portfolio website for Davide Solla, rebuilt from the public Adobe Portfolio content into a refined fashion-photography presentation.

## Files

- `index.html` - homepage structure and SEO metadata
- `client-area.html` / `client-area.js` - private client login and embedded gallery page
- `styles.css` - responsive editorial design system
- `script.js` - mobile navigation, data-driven albums, image lightbox, and contact form submission
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
- `RESEND_API_KEY` - optional fallback provider key if SMTP is not configured
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

## Client Area

Use the Client area block in `admin.html` to create a client login, set or reset the password, and paste the client's Lightroom shared gallery link. Private client records and password hashes are authenticated-encrypted in `data/admin-site.enc`; client records are removed from the public `data/site.json`.

Clients open `client-area.html`, sign in with their email and password, then view the embedded gallery or open the Lightroom link directly for downloads.

## Contact Form

The public form posts to `/api/contact`, so the visitor never sees the recipient address in the page HTML. Configure the recipient and sender with `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` in the hosting environment.

The backend sends through Gmail SMTP when `SMTP_USER` and `SMTP_PASS` are set. Use a Gmail app password for `SMTP_PASS`, not the normal account password. If SMTP is not configured, the backend falls back to Resend when `RESEND_API_KEY` is available.

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
