Pretext 1.0.0 (vendored)
========================

Fast multiline text measurement and layout without DOM reflow, by Cheng Lou.
Used by `assets/js/stamp-flow.js`: text re-flows around a rubber stamp that
has been dragged onto it (`assets/js/stamp-drag.js`). Loaded lazily with
`import()` the first time a stamp is picked up, so ordinary page views never
download it.

- Package:   @chenglou/pretext 1.0.0 (published 2026-10-14), MIT, no dependencies
- Source:    https://registry.npmjs.org/@chenglou/pretext/-/pretext-1.0.0.tgz
- Integrity: sha512-BxKiDMxWJhyzL8asvcgg3T9YnUU7OUFsKO8oRaR2SYAPX4Sh2wM9gqTBjrBaZ4fnl84cEQ8czC0Q1M83z3chsA==
- Shasum:    631111669669a4dead2431594268fad69a8b0a80
- Retrieved: 2026-11-03; both hashes checked against the tarball before copying
- Copied:    2026-11-04 unchanged from the `pretext-black-hole` branch (commit
             c693814), where it was first vendored and checked; every file's
             git blob hash matches that commit

Contents: `package/dist/*.js` and `package/dist/generated/*.js` copied
unchanged (ES modules; the entry points are `layout.js` and `rich-inline.js`),
plus `LICENSE`. The TypeScript sources, `.d.ts` files and source maps are left
out. To upgrade, download the new tarball, verify it against the registry's
`dist.integrity`, and replace these files wholesale.
