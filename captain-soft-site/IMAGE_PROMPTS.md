# Visuels du site — prompts de génération

Déposez chaque visuel dans `public/photos/` avec le **nom de fichier** indiqué
(extension libre : `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`). Au prochain `npm run build`,
le site l'utilise automatiquement à la place de la photo Unsplash de secours
(voir `content/images.ts`, où se trouve aussi le texte alternatif de chaque visuel).

Pas de portrait pour le témoignage : un visage généré à côté d'une citation passerait
pour un vrai client. Utilisez la photo réelle de la personne citée.

Suffixe à ajouter à chaque prompt pour garder une série cohérente :

```text
Consistent series look: natural light, warm-neutral grade, soft contrast, fine 35mm-style film grain, editorial premium B2B aesthetic, photorealistic, no text, no logos, no watermarks.
```

| # | Fichier | Section | Format |
|---|---|---|---|
| 1 | `hero-nature` | 3. Hero (cadre derrière la maquette) | 1536×1024 |
| 2 | `sdr-headset` | 5. Bande « L'IA au service de vos SDRs » | 1024×1536 ou 4:3 |
| 3 | `case-agency` | 9. Cas client « Agence de prospection » | 1536×1024 |
| 4 | `case-smb` | 9. Cas client « PME B2B » | 1536×1024 |
| 5 | `case-freelance` | 9. Cas client « SDR indépendant » | 1536×1024 |
| 6 | `cta-landscape` | 13. CTA final | 1536×1024 |
| 7 | `security-texture` | 12. Bande Sécurité (optionnel) | 1536×1024 |

## 1 · hero-nature

```text
Wide editorial landscape photograph of calm, rolling volcanic hills in the French Auvergne at dawn. Layers of soft fog fill the valleys; the horizon sits in the upper third. Palette: muted sage green, warm grey-beige sky, pale mist, very low contrast. The centre and lower two-thirds must stay quiet and soft-focus (a software interface will float over them). Diffused overcast light, no harsh sun. Shot on a medium-format camera, 45mm, f/8, slight film grain, gently desaturated, Kinfolk / Cereal magazine aesthetic. No people, no buildings, no roads, no animals, no text, no watermark, no lens flare, no HDR look.
```

## 2 · sdr-headset

```text
Candid editorial photo of a French sales development representative, woman in her late twenties, wearing a slim single-ear headset with a boom microphone, mid-phone-conversation with a relaxed half-smile, looking slightly off-camera toward the left of the frame. She sits at a light oak desk with an open laptop whose screen is out of focus and unreadable. Bright Paris office with tall windows, late-afternoon golden light raking from the right, warm skin tones. Palette: cream, sand, terracotta, with one deep navy (#263460) element (her knit sweater). Subject in the right half of the frame, generous breathing room on the left. 85mm, f/1.8, shallow depth of field, natural pose, not stock-like, subtle film grain. No logos, no readable text, no call-centre cubicles, no exaggerated smile, no thumbs up.
```

## 3 · case-agency

```text
Documentary-style photo inside the open-plan office of a small French B2B prospecting agency. Four or five SDRs of varied ages and backgrounds sit at long shared oak desks wearing headsets, several mid-call, one taking notes, laptops and a second monitor showing blurred, unreadable dashboards. Exposed brick, tall plants, morning daylight from large factory windows. Natural, warm colour grade with subtle navy and dusty-rose accents in clothing. 35mm, f/2.8, eye level, slight motion in one hand gesture for life. No visible brand logos, no readable screens or text, no posed group smile, no headset-cliché call centre rows.
```

## 4 · case-smb

```text
Editorial photo in a small French B2B company office: a sales manager in her forties stands beside a seated younger sales rep, both looking at a laptop showing an abstract, blurred bar chart, the manager pointing at the screen, engaged and calm. Glass partition and whiteboard softly out of focus behind them, soft window daylight, warm neutral palette (off-white #F7F5F0, oak, charcoal) with a navy (#263460) blazer as the only strong colour. 50mm, f/2.2, natural candid moment, believable modern SME, not corporate stock. No logos, no readable text on screens or boards, no handshake, no high-five.
```

## 5 · case-freelance

```text
Candid photo of an independent B2B sales consultant, man in his thirties, working from a bright home office in an old Haussmann-style Paris apartment: herringbone parquet, white mouldings, tall window. He wears a light headset and is mid-call, looking at a laptop on a small wooden desk with a paper notebook, pen and a coffee cup. Warm morning light, plants, calm focused mood. Palette: warm whites, oak, sage green, one navy accent. 35mm, f/2, documentary feel, slight film grain. No logos, no readable screen content, no cluttered background, no fake smile at camera.
```

## 6 · cta-landscape

```text
Expansive alpine landscape at dusk: jagged snow-capped peaks rising above a soft sea of clouds, vast calm sky taking 60% of the frame. Deep navy and indigo tones dominate (#18213F to #263460), with a faint rose-magenta glow along the horizon (#C64B8B, very subtle). The centre of the image must be low-detail and fairly dark, because a dark overlay and a centred white headline will sit on top. Long-exposure smoothness in the clouds, crisp ridgelines, medium-format quality, gentle film grain. No people, no text, no sun disc, no oversaturation, no fantasy elements.
```

## 7 · security-texture (optionnel)

```text
Minimal abstract architectural photograph at night: a repeating grid facade of concrete and dark glass seen straight on, perfectly symmetrical, evoking a vault or secure building without showing servers. Monochrome deep navy (#18213F to #263460) with faint cool highlights on the grid edges, large dark areas, very low contrast so white text stays readable on top. Shot with a tilt-shift lens for perfectly straight lines, slight grain. No people, no signage, no text, no neon, no padlock icons, no glowing circuit-board clichés.
```
