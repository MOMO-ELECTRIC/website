# GitHub Pages deployment

This site is plain static HTML/CSS/JS and can be deployed directly with GitHub Pages.

## Option 1: root repo + /docs

1. Push this repo to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/docs`
4. Save.

GitHub Pages will publish `docs/index.html`.

## Option 2: separate repo

Copy the files inside `docs/` into a dedicated repo root and enable Pages from `/ (root)`.

## Files

- `index.html` — homepage
- `styles.css` — styles
- `script.js` — tiny footer year helper

## Next recommended improvements

- Replace placeholder project section with real project photos
- Add license number, service area, and company address if desired
- Add bilingual EN page if needed
- Add domain + CNAME when ready
