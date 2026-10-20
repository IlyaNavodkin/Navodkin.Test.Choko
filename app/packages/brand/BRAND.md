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
| Divider | `--border` | `#EAE0D9` |
| Primary text | `--ink` | `#2D101B` |
| Secondary text | `--ink-2` | `#573C42` |
| Mascot gold | `--brand-gold` | `#E9A347` |
| Mascot cocoa | `--brand-cocoa` | `#673A24` |

Use burgundy for primary actions, active navigation, links and selected items.
Inactive navigation has burgundy line icons and dark text. Active navigation has
a solid burgundy background and white text. Use pale rose for selected tree rows
and tags. Keep green, red, amber, blue and gray for their semantic result states;
pair them with text or glyphs. Do not give each module a different brand color.

Use IBM Plex Sans for interface and reading text, IBM Plex Mono for IDs, paths
and code. The wordmark is bold with slightly tight letter spacing. Corner radii
are 5px for small controls, 8px for buttons and inputs, and 12px for editor cards.
Use quiet borders and minimal shadows.

`chioko-mascot.png` is the original supplied artwork, preserved unchanged. The
desktop `Logo` component uses `mix-blend-mode: multiply` to integrate its white
canvas into the light surfaces. Display the full mascot without stretching,
recoloring or cropping; pair it with the burgundy Chioko wordmark when there is
room. Module navigation uses a 56px icon rail with 40px buttons and a 36px mascot.
Keep module names available through accessible labels and hover tooltips.

Generate the Windows window/taskbar and executable icons with
`pnpm --filter @casewright/desktop make-icon`. That script reads the same mascot.
Internal package names, `.casewright` repository paths and release/update IDs
retain their existing identifiers for compatibility. Legacy SVG exports remain
available for existing consumers; the desktop uses the Chioko PNG export.
