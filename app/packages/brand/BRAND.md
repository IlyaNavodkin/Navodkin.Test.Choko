# Chioko

Visual identity based on the supplied reference: an ivory workspace, burgundy
actions and a Chihuahua mascot in a burgundy hoodie. `tokens.css` is the source
of truth for colors, typography and corner radii.

| Role | Token | Color |
| --- | --- | --- |
| Primary action / active module | `--accent` | `#900C30` |
| Pressed action | `--accent-press` | `#720825` |
| Selection surface | `--accent-soft` | `#F7E4E7` |
| Selection text | `--accent-ink` | `#800C2D` |
| App background | `--bg` | `#FAF7F4` |
| Editor cards | `--panel` | `#FFFCFA` |
| Navigation / chrome | `--panel-2` | `#F3ECE5` |
| Module rail | `--rail-bg` | `#800C2D` |
| Rail icons | `--rail-fg` | `#FFF4F4` |
| Titlebar and toolbar | `--chrome-bg` | `#F4E3DC` |
| Divider | `--border` | `#EAE0D9` |
| Primary text | `--ink` | `#2D101B` |
| Secondary text | `--ink-2` | `#573C42` |
| Mascot gold | `--brand-gold` | `#E9A347` |
| Mascot cocoa | `--brand-cocoa` | `#673A24` |

Use burgundy for primary actions, active navigation, links and selected items.
The module rail has light line icons on burgundy; its active module uses an ivory
button with a burgundy icon. Use pale rose for selected tree rows
and tags. Keep green, red, amber, blue and gray for their semantic result states;
pair them with text or glyphs. Do not give each module a different brand color.

Typography uses three roles, with matching Russian and English glyphs:

| Role | Typeface / weight | Size |
| --- | --- | --- |
| Chioko wordmark | Nunito Sans Black 900 (`--font-brand`) | 28–32px |
| Page and case titles | Rubik ExtraBold 800 (`--font-heading`) | 24–28px |
| Section headings | Rubik Bold 700 (`--font-heading`) | 16–18px |
| Interface and reading text | Onest Regular 400 (`--font-ui`, `--font-read`) | 14px |
| Buttons and menus | Onest Medium 500 | 13–14px |
| Captions and display IDs | Onest Medium 500 | 12px |
| Code, file paths and terminal output | IBM Plex Mono 400–600 (`--font-mono`) | context-dependent |

Use Onest SemiBold 600 for emphasis inside the interface. Nunito Sans is reserved
for the Chioko wordmark; it is not the interface or heading font. All font faces
are bundled as local WOFF2 assets in `fonts/`, with their OFL license files;
desktop rendering makes no Google Fonts network requests. See `fonts/README.md`.

The wordmark has slightly tight letter spacing. Corner radii are 5px for small
controls, 8px for buttons and inputs, and 12px for editor cards. Use quiet borders
and minimal shadows. Typography does not widen or add text labels to the icon rail.

`chioko-mascot.png` is the original supplied artwork, preserved unchanged. The
desktop `Logo` component uses `mix-blend-mode: multiply` to integrate its white
canvas into the light surfaces. Display the full mascot without stretching,
recoloring or cropping; pair it with the burgundy Chioko wordmark when there is
room. Module navigation uses a 56px icon rail with 40px buttons and a 36px mascot.
Keep module names available through accessible labels and hover tooltips.

The rail spans the full window height and stays 56px wide. Titlebar (36px) and
project toolbar (48px) sit to its right on a soft warm rose surface. The shared
`chrome-pattern.svg` contains paws, bones, bugs and checklists, used as a static
decorative CSS mask at 14% opacity in the rail and 6.5% in the header. Patterns
never intercept pointer events. Keep editor cards and content surfaces plain.

Generate the Windows window/taskbar and executable icons with
`pnpm --filter @chioko/desktop make-icon`. That script reads the same mascot.
Packages use `@chioko/*`, project data lives in `.ch/`, and release/update IDs
point to the private Chioko repository. Legacy SVG exports remain
available for existing consumers; the desktop uses the Chioko PNG export.
