# Davide Solla Website Rebuild

Static portfolio website for Davide Solla, rebuilt from the public Adobe Portfolio content into a refined fashion-photography presentation.

## Files

- `index.html` - single-page website structure and SEO metadata
- `styles.css` - responsive editorial design system
- `script.js` - mobile navigation, image lightbox, and contact mail draft
- `assets/images/` - curated local portfolio images from the current public site

## Before Publishing

Update the contact email in `index.html`:

```html
<form class="inquiry-form" data-contact-email="hello@davidesolla.com">
```

Replace `hello@davidesolla.com` with the preferred booking address.

The site is static and can be uploaded to most hosts. For a fully server-side contact form, connect the form to a provider such as Netlify Forms, Formspree, or your hosting platform's form handler.
