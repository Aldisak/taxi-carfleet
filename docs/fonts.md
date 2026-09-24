# Fonts — self-hosted variable Manrope

`Manrope-var.woff2` is **one** variable font file (wght axis 200–800) carrying
**Latin + Latin-ext + Cyrillic** — covering every UI locale (cs, en, de, ru, uk,
fil) in a single face. The identical file also lives at
`product-website/public/fonts/Manrope-var.woff2`.

## Do NOT reintroduce split subsets

Do not switch to Google Fonts `css2` or the `@fontsource` per-subset packages.
Both ship Manrope as separate files (latin / latin-ext / cyrillic / …) joined by
`unicode-range`. Czech `ě š č ř ž ů ď ť ň` (latin-ext) and ru/uk Cyrillic then
fall back to a **system font mid-word** whenever their subset file fails to load,
and the production edge CSP (`default-src 'self'`) blocks external fonts anyway.
See `docs/decisions.md` (2026-09-24). Guard tests
(`web/src/shared/theme/GlobalStyle.test.tsx`) fail if `fonts.googleapis` or
`@fontsource` reappears.

## Regenerate

Built from upstream `Manrope[wght].ttf` (OFL,
`https://github.com/google/fonts/tree/main/ofl/manrope`) with `fonttools`:

```bash
pip install fonttools brotli
pyftsubset "Manrope[wght].ttf" \
  --unicodes="U+0000-00FF,U+0100-024F,U+0300-0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2116,U+2122,U+2190-2199,U+2212,U+2264-2265,U+FB01-FB02" \
  --layout-features='*' --flavor=woff2 \
  --output-file=web/public/fonts/Manrope-var.woff2

cp web/public/fonts/Manrope-var.woff2 product-website/public/fonts/Manrope-var.woff2
```

`--layout-features='*'` keeps OpenType features; omitting `--instance` preserves
the variable `wght` axis so one file serves all weights. Output is ~45 KB.
The `@font-face` (in `GlobalStyle.tsx` and `product-website/src/styles/global.css`)
declares `font-weight: 500 800`.
