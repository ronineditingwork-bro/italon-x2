# Editorial motion layer — Italon Experience

This is a deliberately small opt-in enhancement to the **existing vanilla JavaScript** site.
Do not migrate the catalogue, Lab, or any other part of the site to React just to
copy snippets from React Bits or 21st.dev.

## What is wired

- **GSAP 3.15.0** and **ScrollTrigger** — scroll-linked, low-amplitude movement of
  selected photographic scenes (`data-motion-parallax`).
- **Lenis 1.3.27** — synchronized with GSAP's ticker (one RAF loop) for smooth
  desktop wheel scrolling. Native scrolling stays in place on mobile and touch.
- **React Bits inspiration** — a small native implementation of magnetic buttons
  (`data-motion-magnet`), *not* a React component or downloaded vendor code.
- **21st.dev inspiration** — restrained cursor-following spotlight on editorial
  cards (`data-motion-spotlight`), using local CSS variables; no external runtime.

The enhancements are intentionally **not** enabled in Outdoor Lab, Material Lab,
the image picker, the product pages, checkout/quote dialog, or calculators.

## How to extend

Place the appropriate data attribute only on an editorial element:

```html
<img data-motion-parallax src="..." alt="...">
<a href="..." class="btn" data-motion-magnet>See collection</a>
<a href="..." class="tile" data-motion-spotlight>...</a>
```

Only `home`, `collections`, `x2`, `inspiration` presently load the
motion module. To cover another editorial page, add its `data-page` value to
the allowlist in `site/js/main.mjs`. A dynamic `import()` code-splits GSAP and
Lenis away from the site-critical entrypoint.

Files: `site/js/motion.mjs`, `site/css/motion.css`, `site/css/site.css`,
`site/js/main.mjs`. Existing `data-reveal` animations remain the normal
visibility transition: do **not** animate the same text's opacity twice.

## Accessibility / compatibility

- `prefers-reduced-motion: reduce`: animations and Lenis are not initialized.
- Fine-pointer desktop only (width at least 960 px). Touch and smaller screens
  use the site's original native scrolling.
- The current dialog state (`html.has-dialog`) pauses/resumes Lenis. Nested
  scroll containers inside dialogs are excluded from Lenis.
- Progressive enhancement: if dynamic import fails, navigation, photos, anchor
  links, product cards, carts, PDFs and the rest of the site continue to work.
- Keep real tile textures unchanged. Motion adjusts **presentation only**,
  never image pixels, scale calibration or materials in Lab.

## Verification before merge / deploy

```sh
npm ci --no-audit --no-fund
npm run check
npm test
npm run test:hosting
npm run build
```

Also manually test: Windows/macOS mouse + wheel, mobile iOS/Android, a
reduced-motion browser setting, menu/search/cart dialogs, anchor navigation,
bfcache back, 320 px layout, and realistic photos on /lab/ and /outdoor/.

Building a branch does **not** publish it on italon-x2.ru.
Review the PR and deploy it only through the existing release workflow.
