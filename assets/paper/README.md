# Paper textures

`paper.js` draws a real paper texture (once, in WebGL) behind any element with
`data-paper="<look>"`. The site uses the `site` look as the page background.

| Look | Paper | Seed | Notes |
|---|---|---|---|
| `site` | `#f3f0e9` | 5 | Thicket paper in the site's cream (`--color-bg`) |
| `thicket` | `#f9f8f1` | 5 | Thicket paper |
| `slate` | `#86999a` | 51 | Slate stock |
| `receipt` | `#fdfcf8` | 49 | Free receipt, folded and crumpled |

## Vendored library

`vendor/paper-shaders-0.0.81/` holds the seven files of
[Paper Shaders](https://github.com/paper-design/shaders) (`@paper-design/shaders`)
that the paper texture needs, byte-identical to the npm package. `LICENSE` and
`NOTICE` are included as Apache-2.0 requires.

- Version: 0.0.81, published 2026-09-17 (meets the 14-day package rule)
- Tarball integrity (verified on download): `sha512-jeGdyjMscZ2bxmQdo8lhwUufHUf4iq3s1ayjh8PXU7Go42Rw8E3I0It1FZdc3HuWt5J82m//DRWaxsRqRfA4Gg==`
- Retrieved: 2026-11-04

To update: download a newer version that is at least 14 days old, copy the
same files from its `dist/` (follow the imports of `shader-mount.js`,
`get-shader-color-from-string.js`, `get-shader-noise-texture.js` and
`shaders/paper-texture.js`), and update the version above.
