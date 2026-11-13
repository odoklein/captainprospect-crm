# Suzalink — 10 mini-prompts, 10 implemented assets

## Shared creative direction
Deep teal #112F35, mint #B9EDD6, paper #F7F5F0, yellow #F6C227 as a small signal. Architectural precision, tactile materials, generous space. Keep the original Suzalink logo intact. Bricolage Grotesque headings and Geist interface text stay in HTML. No invented metrics, testimonials, logos, or baked-in UI text.

| # | Mini-prompt | Asset | Placement |
|---|---|---|---|
| 01 | Photograph a frosted mint-glass ribbon connecting sculpted teal fins; paper backdrop, one yellow fastener, soft window light, quiet center, no text. | `connection.webp` | Hero product stage |
| 02 | Photograph nested satin teal vault panels; mint glass seam and tiny yellow alignment pin; structure right, deep shadow left, no padlock cliché or lettering. | `vault.webp` | Security background |
| 03 | Create a tactile teal landscape with a mint path toward a small yellow sun; terrain below, dark negative space above, no text. | `horizon.webp` | Closing demo invitation |
| 04 | Draw a precise mint call waveform inside a dark teal rounded tile; a yellow terminal node signals the next action; 2.5-unit strokes, no text. | `execution.svg` | Execution feature |
| 05 | Draw a mint document outline with three information lines and a small yellow cross-shaped signal, framed by a teal tile; restrained, legible, no text. | `ia.svg` | AI feature |
| 06 | Draw a mint architectural shield around an isolated server rectangle; one yellow access point, teal tile, clean geometry, no gradients. | `instance.svg` | Dedicated instance feature |
| 07 | Draw a mint headset with a yellow microphone endpoint inside a teal tile; rounded strokes, clear silhouette at 44 pixels. | `sdr.svg` | SDR role selector |
| 08 | Draw three rising mint bars on a shared baseline, with a yellow endpoint on the tallest bar; teal tile, precise spacing. | `manager.svg` | Manager role selector |
| 09 | Draw a mint appointment calendar with a confident check mark and a yellow booking point; teal tile, same line weight and corner system. | `bd.svg` | Business developer selector |
| 10 | Draw a mint portal window with separated navigation and report areas; one yellow status point, teal tile, no text. | `client.svg` | Client role selector |

## Production
01–03 were created with the built-in image generation tool, reviewed visually, and encoded as WebP (1536 × 1024, quality 86). 04–10 are native SVG assets: 96 × 96 viewBox, 24-unit outer radius, mint 2.5-unit rounded strokes, consistent inset keyline. The SVGs deliberately extend the site's UI vocabulary rather than rasterizing interface elements.

All assets live in `public/creative/`. Images use existing Next Image components and lazy loading except the hero. Decorative emblems have empty alt text because adjacent labels convey their meaning. Text remains selectable and screen-reader accessible. No additional animation or dependencies.

View the contact sheet at `/creative/gallery.html`. Original generated PNGs remain in Codex's generated_images folder; optimized production copies are committed with the site. The generation prompts used for images expanded the mini-prompts above with landscape framing, exact palette, material and lighting requirements, and exclusions (no logos, people, UI or lettering).
