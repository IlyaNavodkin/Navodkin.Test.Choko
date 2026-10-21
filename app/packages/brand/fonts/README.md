# Bundled fonts

Source: the official Google Fonts CSS2 service, retrieved on 2026-10-21 with
`display=swap`. `../fonts.css` preserves its font-face weights and Unicode ranges,
with URLs rewritten to the local, unmodified WOFF2 files in this folder.

| Family | Weights | Google Fonts version | License |
| --- | --- | --- | --- |
| Onest | variable 400–600 | v11 | `onest-OFL.txt` |
| Rubik | variable 700–800 | v31 | `rubik-OFL.txt` |
| Nunito Sans | 900 | v19 | `nunitosans-OFL.txt` |
| IBM Plex Mono | 400, 500, 600 | v20 | `ibmplexmono-OFL.txt` |

Font sources: [Onest](https://fonts.google.com/specimen/Onest),
[Rubik](https://fonts.google.com/specimen/Rubik),
[Nunito Sans](https://fonts.google.com/specimen/Nunito+Sans),
[IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono).
License texts are the corresponding unmodified `OFL.txt` files from
[google/fonts](https://github.com/google/fonts/tree/main/ofl).

Keep these files when packaging the shared brand package. The Windows packaging
script copies the original license texts to `licenses/fonts/` in the distribution.
The desktop app must
not depend on an external font stylesheet: local fonts also work offline and
use the same glyphs and metrics in English and Russian.
