# For AI assistants

Read `HANDOFF.md` first (in Traditional Chinese / Cantonese). Section 5 lists rules the owner set; follow all of them.

- Build: `npm ci && npm run build` (single-file output in `dist/index.html`).
- Check: `npm run sim -- 1000 auto` (also `def`, `agui`) must report 錯誤 0.
- Ship: bump `VERSION` in `src/main.ts`, run `npm run release`, give the owner `release/public/index.html` to upload to Netlify.
- Game text is Cantonese (Traditional Chinese). Keep code comments in the same style.
