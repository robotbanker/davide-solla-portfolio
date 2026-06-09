# Davide Solla Website Rebuild

Portfolio website for Davide Solla, rebuilt from the public Adobe Portfolio content into a refined fashion-photography presentation.

## Files

- `index.html` - single-page website structure and SEO metadata
- `styles.css` - responsive editorial design system
- `script.js` - mobile navigation, data-driven albums, image lightbox, and contact form submission
- `data/site.json` - editable portfolio albums, covers, section text, and gallery image lists
- `admin.html` - protected admin portal for editing albums and uploading images
- `server.js` / `api/admin.js` - local and Vercel admin backend endpoints
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
- `RESEND_API_KEY` - Resend API key used by the contact form
- `CONTACT_TO_EMAIL` - private recipient address for enquiries
- `CONTACT_FROM_EMAIL` - verified sender address, for example `Website <hello@yourdomain.com>`
- `CONTACT_SUBJECT_PREFIX` - optional email subject prefix, defaults to `Website enquiry`

Production uploads are committed to GitHub under `assets/images/uploads/`, and album/text edits update `data/site.json`.
Album/text edits also refresh `sitemap.xml` so newly published portfolio images can be discovered through the image sitemap.
After each admin save, the backend calls `VERCEL_DEPLOY_HOOK_URL` so Vercel starts a fresh deployment immediately.

Create the deploy hook in Vercel under Project Settings -> Git -> Deploy Hooks. Choose the production branch, usually `main`, then copy the generated URL into the `VERCEL_DEPLOY_HOOK_URL` environment variable.

## Contact Form

The public form posts to `/api/contact`, so the visitor never sees the recipient address in the page HTML. Configure the recipient and sender with `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` in the hosting environment.

The backend currently sends through Resend. Set `RESEND_API_KEY` before publishing the contact form.
