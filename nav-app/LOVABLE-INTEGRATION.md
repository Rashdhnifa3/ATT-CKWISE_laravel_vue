# ATT&CKWISE reference integration

Reference: https://github.com/halawanianas50-hue/attackwise-defense-planner at e73ec18 (downloaded read-only under tmp/reference).
The deployed Lovable URL returned HTTP 403 to direct retrieval; the actual GitHub source was available and inspected. No pixel-exact claim against the deployed site is made.

The reference is React/TanStack Router/Tailwind. The target remains the existing Angular Navigator application. The reference styles.css, AppHeader.tsx, routes/index.tsx, defense.tsx, report.tsx, store.tsx, scoring.ts and report-docx.ts were inspected.

## Adapted design

Exact OKLCH tokens and locally hosted Plus Jakarta Sans, Noto Kufi Arabic and JetBrains Mono; compact pill navigation; 240px horizontally scrolling tactic columns; 380px defense sidebar; 320px report gauge and tactic coverage chart; reference Word report exporter. SVG icons replace the reference emojis as separately requested. Arabic and English switching updates lang and dir. Reference Arabic names are presentation labels only, with the actual dataset's English names as fallback.

The first visit opens the Enterprise matrix, as the reference root does. New Plan retains the existing launcher. The domain selector is removed, creation is fixed to Enterprise, and non-Enterprise imported plans are rejected without changing the underlying Navigator data infrastructure.

## Data and scoring

Navigator's configured ATT&CK domain/version, IDs, techniques, sub-techniques and official mitigation relationships remain authoritative. The header and exported report display the loaded version rather than hardcoding the reference's v14. No reference attack catalog was substituted.

Optional attack scores use the existing planning state extension; missing/null means Not Rated and 0 remains a valid rating. Selection automatically opens scoring, with skip and clear controls. Optional attack scores do not enter the coverage formula.

Per-attack mitigation ratings follow the reference: any fully applied defense means defended; otherwise any partial defense means partial; otherwise gap. Coverage = (defended + 0.5 × partial) / selected attacks × 100, rounded. Previous legacy scores are retained and used only as fallback for controls without an explicit new status: deployed 10 = full, deployed >0 = partial, otherwise none.

Existing attackwise-draft JSON remains readable; browser refresh restores the saved plan. No attackwise-v1 reference store is overwritten. Language uses its own key. Custom mappings remain user-defined and parent mappings retain their provenance.

## Intentional differences and limits

The full loaded Navigator catalog is larger than the reference's curated subset. Columns initially show 20 techniques with Show more, and expandable sub-techniques are retained. The optional score drawer, plan management, JSON import/export and MITRE attribution remain additional integration controls. The tactic chart is implemented with Angular/CSS rather than Recharts. Dataset entries without a reference Arabic label retain their original English title/description. The optional score is included in the Word report technique summary.

## Changed files

- src/attackwise-tokens.scss, src/styles.scss
- src/app/tabs/tabs.component.ts, tabs.component.html, tabs.component.scss
- src/app/planning/planning.component.ts, planning.component.html, planning.component.scss
- src/app/planning/planning-state.ts
- src/app/planning/planning-ui.service.ts, reference-labels.ts, reference-report.ts
- package.json, package-lock.json (fonts and docx)
- e2e/attackwise.spec.ts, e2e/planning-icons.spec.ts, e2e/lovable-integration.spec.ts

Git was unavailable on PATH and at the checked installation paths. Before edits, source and dependency manifests were backed up to tmp/checkpoints/before-lovable-adaptation.zip instead of discarding or resetting changes.

## Verification

Build: npm run build.
Browser regression checks: npx playwright test e2e/attackwise.spec.ts e2e/lovable-integration.spec.ts e2e/planning-icons.spec.ts.
Checks cover Enterprise-only entry, dataset retry/version selection, optional/unrated/zero/cleared scores, sub-techniques, independent defense ratings, custom defense editing, JSON round trip, Word download, refresh persistence, Arabic RTL, English LTR, desktop/mobile layout and SVG navigation.

## Requested follow-up: selection, filters and themes

- Scored parent/sub-technique cards and report rows use semantic low (0–3), medium (4–6), high (7–10) colors; missing scores remain neutral.
- Tactic pills filter to an adaptive full-width grid. All tactics restores the matrix; sub-techniques and search remain usable.
- Defense Plan now uses selection only, with all-catalog, attack-specific, search, selected-only, official and custom filters. Unrelated official mitigations are visible in the all-catalog view but cannot be assigned without a real relationship.
- New selections persist independently per attack under defenseSelections. Old ratings are preserved; non-none ratings are treated as selected unless overridden by a new explicit boolean. No deployment claims are inferred.
- Coverage now means the percentage of selected attacks with at least one selected related defense. The UI and Word export explain this selection-based measure; the previous partial/full application UI is removed.
- Midnight Indigo and Black & Orange are selectable throughout the workspace, with localStorage persistence. Severity colors retain their meaning in both themes.
- The report follows the supplied screenshot's glowing gauge, horizontal percentage chart, gridlines, axes and keyboard/mouse tooltip. Plot rows retain DOM identity so focus remains stable during tooltip updates.

Follow-up verification: build and six browser scenarios across attack selection, severity, tactic filtering, defense selection/filtering, custom controls, theme persistence, JSON/Word export, RTL/LTR and mobile sizing. See e2e/planning-refinements.spec.ts for the added scenario.

## Resumed work: defense scoring and risk formulas (2026-11-18)

This section supersedes the selection-only report behavior described above. The latest implementation allows optional 0–10 defense scores, standalone defense selection, and explicit manual attack links (identified separately from official MITRE relationships). A defense score is shared across its linked attacks.

The report supports attack minus strongest, average, or sum of selected linked defense scores. Negative results remain visible in the table and signed tactic chart. The residual risk index averages nonnegative results on a 0–100 scale. Missing attack or selected defense scores produce Not Rated; zero is valid. Selection coverage remains a separate measure in the defense view and Word report.

Resume fixes clean up all selection state when clearing a plan and remove stale selections, ratings and manual links when deleting a custom defense. Word labels identify selected defenses without implying deployment, and the embedded chart description now identifies the risk formula chart.

Verified: npm run build passed. Eight targeted Playwright tests passed (seven browser scenarios plus a calculation test), covering existing filters, themes, Arabic/English mobile layout, custom defenses, Word download, all three formulas, negative/missing/zero scores, manual mappings, refresh persistence, JSON round trip and clearing selections. Command:

```sh
npx playwright test e2e/attackwise.spec.ts e2e/lovable-integration.spec.ts e2e/planning-icons.spec.ts e2e/planning-refinements.spec.ts e2e/risk-calculation.spec.ts
```

These browser tests use controlled ATT&CK fixtures. They do not establish live upstream availability or visual fidelity of the Word document in Microsoft Word.
