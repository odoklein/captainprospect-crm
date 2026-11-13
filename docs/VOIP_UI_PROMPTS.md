# Suzalink VoIP — GPT Image prompt kit

Four screens, one design language, built on the Suzalink / Captain Prospect CRM design system.

**Assumption:** the four screens are Le Cockpit (SDR live call), File d'appel (SDR queue and contacts), Zéro Admin (post-call review), and Pilotage VoIP (manager live floor). UI copy is French; the prompts are in English so GPT Image follows the composition more reliably.

**Format:** 1536×1024 landscape, straight-on UI screenshot, no device frame.

---

## How to use

1. Paste one full prompt below into GPT Image. Each prompt already contains the locked style DNA.
2. Generate three variants and keep the one with the clearest focal point, not the busiest one.
3. Rebuild the winning frame in Figma with real components and copy. Generated text is a placeholder, never production copy.

**Text fidelity:** if labels come back garbled, regenerate once. If it persists, keep the layout and reduce the visible labels to the eight largest; rebuild the rest in Figma. Do not keep adding words to the prompt.

**Consistency:** use the same ratio, the same palette and the same sample names across all four. The set only works if it looks like one product.

---

## The locked style DNA

Use this block when you write a fifth screen yourself.

```text
High-fidelity desktop SaaS UI for Suzalink, a French B2B sales CRM. One straight-on 1536×1024 screenshot, no laptop or browser frame, no presentation board. Warm off-white #F7F5F2 canvas; 64px deep-navy #263460 icon rail; white cards with 1px #DED8CF borders and 12px radius; magenta #C64B8B only for live, active and primary states; ink #151827; muted #646A80; success #2F6B4F; warning #9A5B1E. Bricolage Grotesque headings, Inter UI text; 12px uppercase labels, 14px body, 28px page title, 44px KPI figures. Strict 8px grid, 12 columns, 1px hairlines, 4% ambient shadow, generous whitespace. French copy, initials avatars, no photographs of people. Crisp, aligned, dense but calm. No gradients, glassmorphism, 3D, neon, emoji, lorem ipsum, greeked text, extra logos or watermarks.
```

---

## Screen 01 — Le Cockpit

**Role:** SDR, during the call.
**Job:** hold the person, the history, the live objection, the suggested answer, the next action and the call controls in one view.

```text
High-fidelity desktop SaaS UI for Suzalink, a French B2B sales CRM. One straight-on 1536×1024 screenshot, no laptop or browser frame, no presentation board. Warm off-white #F7F5F2 canvas; 64px deep-navy #263460 icon rail; white cards with 1px #DED8CF borders and 12px radius; magenta #C64B8B only for live, active and primary states; ink #151827; muted #646A80; success #2F6B4F; warning #9A5B1E. Bricolage Grotesque headings, Inter UI text; 12px uppercase labels, 14px body, 28px page title, 44px KPI figures. Strict 8px grid, 12 columns, 1px hairlines, 4% ambient shadow, generous whitespace. French copy, initials avatars, no photographs of people. Crisp, aligned, dense but calm. No gradients, glassmorphism, 3D, neon, emoji, lorem ipsum, greeked text, extra logos or watermarks.

SCREEN 01 — "LE COCKPIT", the SDR's live-call workspace.

Composition: a 64px navy icon rail on the far left with six thin-line icons, the queue icon active in magenta. A 64px white top bar: breadcrumb "Appels / Cockpit" on the left; on the right a green dot with "Excellente", a magenta live pill "EN APPEL · 04:12", and the agent's initials "CR". Under the top bar, three zones: a 220px queue rail titled "File d'appel" with three compact prospect rows — Léa Martin / Nord Bat (highlighted, pill "Suivant"), Hugo Bernard / Studio 14, Inès Petit / Atelier B — and a muted "3 restants"; a fluid prospect workspace; a 340px context panel. An 84px sticky call bar spans the workspace and the panel.

Prospect workspace: a white header card with a 56px initials avatar "CR", the name "Camille Roussel", the role "Directrice Marketing · Atelier Nord", the phone "+33 6 12 44 87 21", the location "Paris 14e · 10:42", and two pills, "Chaude" and "Renouvellement Q1". Below it, two equal cards: "Derniers échanges" with a three-item timeline (email opened yesterday, call two days ago · 03:12, note added); "Objections" with the quote "Nous avons déjà un prestataire." and a magenta-ruled "Réponse suggérée" block with two short lines. A "Prochaine action" card reads "Rappeler jeudi · 14:00".

Context panel: "Contexte compte" with short rows (42 salariés, Architecture, 18 400 €, Décideur), a collapsed "Script" card with three bullets, and a "Notes" card with two lines.

Call bar: the timer "04:12" in white, buttons "Muet", "Attente", "Clavier", "Transférer", a device selector, four audio-quality bars, and a magenta "Terminer" button on the right.

The prospect and the live call are the only heroes: no charts, no tables, no secondary dashboard.
```

---

## Screen 02 — File d'appel

**Role:** SDR, between calls.
**Job:** one surface for the contact list, the ordered queue, callbacks, duplicate protection and the next call.

```text
High-fidelity desktop SaaS UI for Suzalink, a French B2B sales CRM. One straight-on 1536×1024 screenshot, no laptop or browser frame, no presentation board. Warm off-white #F7F5F2 canvas; 64px deep-navy #263460 icon rail; white cards with 1px #DED8CF borders and 12px radius; magenta #C64B8B only for live, active and primary states; ink #151827; muted #646A80; success #2F6B4F; warning #9A5B1E. Bricolage Grotesque headings, Inter UI text; 12px uppercase labels, 14px body, 28px page title, 44px KPI figures. Strict 8px grid, 12 columns, 1px hairlines, 4% ambient shadow, generous whitespace. French copy, initials avatars, no photographs of people. Crisp, aligned, dense but calm. No gradients, glassmorphism, 3D, neon, emoji, lorem ipsum, greeked text, extra logos or watermarks.

SCREEN 02 — "FILE D'APPEL INTELLIGENTE", the SDR's calling queue and contact list.

Composition: 64px navy icon rail; a white top bar with the breadcrumb "Appels / File d'appel" and, on the right, a ghost "Pause" button and a magenta "Démarrer la session" button.

Header: page title "Session d'appels" at 28px, subtitle "42 prospects · 8 rappels · 3 priorités". A four-card KPI strip: "À appeler 42", "Rappels 8", "Priorité haute 3", "Sans réponse 12"; figures in Bricolage Grotesque at 32px, labels muted 12px.

Body: a 220px filter rail with a search field and vertical filters "Tous" (active), "Prioritaires", "Rappels", "Jamais contactés", "Sans réponse"; a "Segment" block with the chip "B2B · Île-de-France". The center is a dense white table of eight rows with columns: checkbox, priority pill P1/P2/P3, contact and company, phone, "Dernier contact", status pill, and an "Appeler" text button. One row is selected with a pale magenta tint and an inline "Pourquoi maintenant" strip: "Rappel promis hier · email ouvert 3× · score 92". The right column is a 340px "Prochain appel" card with initials "LM", "Léa Martin", "Nord Bat", the reason "Rappel promis hier", "Meilleur créneau : maintenant", a two-line script, a full-width "Appeler maintenant" magenta button and a "Passer" link.

Bottom fixed bar: progress "12 / 42", "Prochain dans 3 s" with a pause icon, and keyboard hints "A appeler · S passer · P pause".

Dense but calm. No modal, no wizard, no illustration, no separate contact detail panel.
```

---

## Screen 03 — Zéro Admin

**Role:** SDR, immediately after hanging up.
**Job:** review the proposed outcome, summary, follow-up, email and CRM updates, then confirm once.

```text
High-fidelity desktop SaaS UI for Suzalink, a French B2B sales CRM. One straight-on 1536×1024 screenshot, no laptop or browser frame, no presentation board. Warm off-white #F7F5F2 canvas; 64px deep-navy #263460 icon rail; white cards with 1px #DED8CF borders and 12px radius; magenta #C64B8B only for live, active and primary states; ink #151827; muted #646A80; success #2F6B4F; warning #9A5B1E. Bricolage Grotesque headings, Inter UI text; 12px uppercase labels, 14px body, 28px page title, 44px KPI figures. Strict 8px grid, 12 columns, 1px hairlines, 4% ambient shadow, generous whitespace. French copy, initials avatars, no photographs of people. Crisp, aligned, dense but calm. No gradients, glassmorphism, 3D, neon, emoji, lorem ipsum, greeked text, extra logos or watermarks.

SCREEN 03 — "ZÉRO ADMIN", the post-call follow-up review.

Composition: 64px navy icon rail; a white top bar reading "Fin d'appel" with "Camille Roussel · Atelier Nord" and the timer "06:48". Below it, a full-width white recording card: play button, waveform, "06:48", and the label "Enregistrement".

The body splits 60/40. Left: a "Résumé de l'appel" card with a small "Suggéré par l'IA" chip, four short bullet lines, a "Points clés" row of three chips ("Budget confirmé", "Décision en avril", "3 sites"), a quoted objection "Nous avons déjà un prestataire.", and a "Sentiment" pill "Positif". Every field is editable, with small pencil icons.

Right: the heading "À confirmer" and four stacked cards. "Résultat": a segmented control with "RDV pris" selected. "Suite": date chips with "Jeudi 14:00" selected. "Email de suivi": a mini draft with the subject "Votre projet d'agence", three short lines and a "Modifier" link. "CRM": short rows for stage "RDV planifié", montant "18 400 €", prochaine action "Envoyer la proposition".

A sticky bottom bar spans the screen: "1 action pour terminer" on the left, a ghost "Enregistrer le brouillon" and a magenta "Tout confirmer" on the right.

The right column must read as a review stack, not a settings form: short rows, clear selected states, one primary action. No long form, no multi-step wizard, no empty fields.
```

---

## Screen 04 — Pilotage VoIP

**Role:** manager, live.
**Job:** show who is on a call, which number is degrading and where the queue is backing up; supervise from the row.

```text
High-fidelity desktop SaaS UI for Suzalink, a French B2B sales CRM. One straight-on 1536×1024 screenshot, no laptop or browser frame, no presentation board. Warm off-white #F7F5F2 canvas; 64px deep-navy #263460 icon rail; white cards with 1px #DED8CF borders and 12px radius; magenta #C64B8B only for live, active and primary states; ink #151827; muted #646A80; success #2F6B4F; warning #9A5B1E. Bricolage Grotesque headings, Inter UI text; 12px uppercase labels, 14px body, 28px page title, 44px KPI figures. Strict 8px grid, 12 columns, 1px hairlines, 4% ambient shadow, generous whitespace. French copy, initials avatars, no photographs of people. Crisp, aligned, dense but calm. No gradients, glassmorphism, 3D, neon, emoji, lorem ipsum, greeked text, extra logos or watermarks.

SCREEN 04 — "PILOTAGE VOIP", the sales manager's live floor.

Composition: 64px navy icon rail; a white top bar with "Pilotage VoIP", the date "Aujourd'hui · 14:32", and on the right a magenta dot with "En direct" and a ghost "Exporter" button.

A four-card KPI strip: "Appels en cours 14", "Taux de réponse 38 %", "Durée moyenne 06:24", "À qualifier 7" in warning color.

Main area 65/35. Left: an "Équipe en direct" table with columns SDR, statut, prospect, entreprise, durée, qualité, actions. Six rows: Sarah K. · En appel · Camille R. · Atelier Nord · 04:12 · green dot · ear, whisper and takeover icons; Yanis B. · Disponible; Maya L. · Pause · 12:08; Tom R. · En appel · Hugo B. · 02:48 · amber dot; Nora S. · En appel · Inès P. · 06:31; one more. The live row is expanded with a mini waveform and three labeled actions: "Écouter", "Chuchoter", "Prendre la main". Right: "Santé des numéros" with four rows (number, answer rate, tiny sparkline), one amber row marked "À surveiller"; below it "Files" with "Rappels 8", "Sans réponse 12", "Nouveaux 22".

A bottom strip: "Activité en direct" with four timestamped events.

More data than the SDR screens, same calm: magenta only for live, amber only for attention, green only for healthy quality. No charts larger than a sparkline, no separate analytics dashboard.
```

---

## Negative prompt

Append to every generation:

```text
No gradients, glassmorphism, neon, 3D, isometric view, laptop mockup, browser chrome, hands, people, stock photography, emoji, lorem ipsum, greeked or blurred text, invented logos, watermarks, purple-blue AI gradients, oversized pill buttons, heavy drop shadows, tilted perspective, dark mode, cluttered panels, overlapping cards, cut-off text, floating decorative shapes.
```

## Consistency checklist

- Same 64px rail, 64px top bar and 12px card radius in every screen.
- Magenta only on live, active or primary. If it is decorative, remove it.
- One page title, one primary action, no competing CTAs.
- Same French names and companies across the four images.
- Same three type sizes: 28, 17, 12.
- No new accent colour, chart style or icon family.

## Iteration recipe

1. Generate three variants without changing the prompt; pick the clearest hierarchy.
2. Regenerate once if the text garbles, then rebuild the copy in Figma.
3. Keep the same prefix and ratio across all four.
4. Judge at 25% size; if the focal point disappears, remove a card, not the whitespace.
