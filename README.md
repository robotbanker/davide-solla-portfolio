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

Open `http://localhost:4173/admin.html`. The local default password is `admin`.

For production, set these Vercel environment variables:

- `ADMIN_PASSWORD` - the password for the admin portal
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

Production uploads are committed to GitHub under `assets/images/uploads/`, and album/text edits update `data/site.json`.
Album/text edits also refresh `sitemap.xml` so newly published portfolio images can be discovered through the image sitemap.
After each admin save, the backend calls `VERCEL_DEPLOY_HOOK_URL` so Vercel starts a fresh deployment immediately.

Create the deploy hook in Vercel under Project Settings -> Git -> Deploy Hooks. Choose the production branch, usually `main`, then copy the generated URL into the `VERCEL_DEPLOY_HOOK_URL` environment variable.

## Client Area

Use the Client area block in `admin.html` to create a client login, set or reset the password, and paste the client's Lightroom shared gallery link. Client passwords are stored as hashes in `data/admin-site.json`, and client records are removed from the public `data/site.json`.

Clients open `client-area.html`, sign in with their email and password, then view the embedded gallery or open the Lightroom link directly for downloads.

## Contact Form

The public form posts to `/api/contact`, so the visitor never sees the recipient address in the page HTML. Configure the recipient and sender with `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` in the hosting environment.

The backend sends through Gmail SMTP when `SMTP_USER` and `SMTP_PASS` are set. Use a Gmail app password for `SMTP_PASS`, not the normal account password. If SMTP is not configured, the backend falls back to Resend when `RESEND_API_KEY` is available.
