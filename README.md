# Davide Solla Website Rebuild

Portfolio website for Davide Solla, rebuilt from the public Adobe Portfolio content into a refined fashion-photography presentation.

## Files

- `index.html` - single-page website structure and SEO metadata
- `styles.css` - responsive editorial design system
- `script.js` - mobile navigation, data-driven albums, image lightbox, and contact mail draft
- `data/site.json` - editable portfolio albums, covers, section text, and gallery image lists
- `admin.html` - protected admin portal for editing albums and uploading images
- `server.js` / `api/admin.js` - local and Vercel admin backend endpoints
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

Production uploads are committed to GitHub under `assets/images/uploads/`, and album/text edits update `data/site.json`.
After each admin save, the backend calls `VERCEL_DEPLOY_HOOK_URL` so Vercel starts a fresh deployment immediately.

Create the deploy hook in Vercel under Project Settings -> Git -> Deploy Hooks. Choose the production branch, usually `main`, then copy the generated URL into the `VERCEL_DEPLOY_HOOK_URL` environment variable.

## Before Publishing

Update the contact email in `index.html`:

```html
<form class="inquiry-form" data-contact-email="hello@davidesolla.com">
```

Replace `hello@davidesolla.com` with the preferred booking address.

The site is static and can be uploaded to most hosts. For a fully server-side contact form, connect the form to a provider such as Netlify Forms, Formspree, or your hosting platform's form handler.
