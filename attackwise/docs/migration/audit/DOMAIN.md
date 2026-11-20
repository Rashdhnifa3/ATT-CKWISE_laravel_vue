# Domain, data, and compatibility audit

Audited reference: local `nav-app` (package version 5.3.2), migration branch based on `7e960e38`, with preexisting user changes retained. This is source-level evidence, not proof of migrated behavior. No legacy source was edited during this audit. Paths below are relative to the repository root; abbreviated `classes/`, `services/`, and `utils/` paths mean `nav-app/src/app/`.

## Files inspected

All 13 top-level model files in `classes/`, all 13 files in `classes/stix/` including barrel exports, all four service implementations and their specs, all five utility files, `layers/README.md`, all 14 layer-format specifications (1.0–4.5), all eight sample layer JSON files, and the domain-related portions of `tabs.component.ts` and `version-upgrade.component.ts` were inspected. Test fixtures `src/tests/utils/mock-data.ts` and `mock-layers.ts` and matrix/upgrade test declarations were reviewed as reference inputs. UI rendering and exports are covered separately in `UI.md`.

## Runtime data flow and ownership

1. `ConfigService.loadConfig()` reads `./assets/config.json`; validates a collection-index URL or nonempty configured versions; builds feature/group maps, context menus, annotation underline colors, banner and default-layer settings; then applies feature overrides from the URL fragment. If a collection URL exists, it fetches that index even when custom versions are enabled.
2. `DataService` first registers configured versions when `versions.enabled`, then index versions. Versions are sorted by descending numeric major release. `latestVersion` is the first entry. `Domain.id` is `${domain_identifier}-${version.number}`; it is not a STIX ID.
3. Layers request domain data. Custom configuration supports multiple bundle URLs, TAXII, and Workbench-style Basic authorization. `parseBundles()` builds an in-memory domain object graph and fires domain callbacks. No database, account, or layer persistence endpoint exists.
4. `ViewModel.loadVMData()` initializes tactic-specific annotation records after domain data is available. Matrix/UI operations mutate this local layer object, while STIX objects are shared domain data.
5. JSON import, score expressions, visual state, annotation edits, JSON export, SVG, and XLSX run in the browser. Local files are read by `FileReader`; they are not uploaded to a server.
6. Browser storage is limited to theme cookies in the inspected implementation. No `localStorage` or `sessionStorage` layer persistence was found. Theme cookie `is_user_theme_dark` expires after 180 days, uses `path=/;SameSite=Strict`, and can be deleted for OS-following theme behavior.

### Recommended migration contract

Preserve the model method names and calculation algorithms as plain TypeScript under `frontend/src/domain/{classes,services,utils}`. Keep framework UI/state adapters outside that directory. `DataService` type dependencies should become type-only imports or narrow interfaces; replace Angular decorators, `HttpClient`, `EventEmitter`, and RxJS transport with typed fetch/Promise and callback adapters. The source classes themselves contain no Angular decorators.

The backend only needs official-source delivery/cache for the initial migration:

| Route | Contract | Reason |
|---|---|---|
| `GET /api/v1/health` | `{data:{status:"ok"}}` | Independent API readiness |
| `GET /api/v1/attack/index` | `{data: <unchanged official collection index>}` | Discover all supported releases/domains without duplicated metadata |
| `GET /api/v1/attack/bundles/{domain}/{version}` | `{data: <unchanged STIX bundle>}` | Deliver/cache the selected official domain/release without dropping STIX fields |

The browser passes `[response.data]` to the ported parser. Configured custom index/data URLs, TAXII, and local layer files remain browser-side; this preserves custom hosting and privacy without an arbitrary server URL proxy. Official route selection must not override configured custom datasets. Index and bundle metadata must identify the same minor release. Backend implementation must validate known domains and versions against the index, constrain upstream origins, bound requests, and retain structured failures. A broad server-side techniques CRUD API or layer database is not justified by current behavior.

## Data and configuration feature ledger

Every row is **audited / implementation unverified**. Suggested tests are acceptance cases, not claims that tests have run.

| ID | Feature and source | Exact behavior | Migration owner / test requirement |
|---|---|---|---|
| D01 | Official release discovery — `services/data.service.ts:346`, `parseCollectionIndex` | Collection name becomes identifier by spaces→hyphens, `&`→`a`, lowercase. Major releases below 4 are omitted. Index version URLs retained; major labels exposed. | DataService + API; three domains, old release, unordered minor releases, malformed index |
| D02 | Custom versions and bundle lists — `data.service.ts:324`, `setUpDomains` | Configured version number is first digit sequence; each domain may use multiple `data` URLs; configured entries and index entries coexist. | DataService; multiple bundles, custom domain identity and collision cases |
| D03 | Workbench Basic auth — `data.service.ts:406`, `ServiceAuth` | Version-level `{enabled,serviceName,apiKey}` becomes Basic authorization for configured HTTP data URLs. | Browser transport; header correctness, never persist credentials or send them to official API |
| D04 | TAXII 2.0/2.1 — `utils/taxii2lib.ts`, `getDomainData` | TAXII 2.1 default Accept/version header; legacy MITRE hostname selects STIX 2.0 media type and `/stix/`; others use `/api/v21/collections/{id}/objects/`. Basic auth; query filters; optional item range; 10s timeout wrapper. | Transport adapter; both URL/media types, filter encoding, timeout/failure. Do not claim pagination support absent in source. |
| D05 | Data loading lifecycle — `loadDomainData`, `Domain.executeCallbacks` | In-memory loaded flag and callbacks; invalid domain rejects. `newLayer` requests refresh for unloaded domains. | Per-domain Promise cache; repeat/simultaneous loads and failed request retry |
| D06 | Multiple-bundle merge — `parseBundles` | Deduplicates STIX IDs first-seen across bundles, except matrix SDOs. Matrix-specific technique membership derives from the bundles where matrix occurs. Matrix duplicates are created only once. | Parser fixtures with repeated IDs, matrix split across bundles, separate matrices |
| D07 | STIX metadata — `classes/stix/stix-object.ts` | Retains STIX ID, first external-reference ATT&CK ID/URL, name, description, created/modified, revoked/deprecated, object version. Missing first external ID raises alert and error for objects requiring IDs. | STIX class port; first-reference semantics and missing ID error |
| D08 | Matrix/tactic placement — `createMatrices`, `Matrix`, `Tactic` | Skips deprecated matrices, preserves `tactic_refs` order, ignores missing tactic refs. Only active techniques with matching phase shortnames populate each tactic. | Parser/matrix; order, missing refs, revoked/deprecated exclusion |
| D09 | Sub-techniques — `createTechniques`, `Technique` | `subtechnique-of` maps parent STIX ID to child IDs; feature flag controls creation. Child parent pointer assigned. Revoked/deprecated children excluded from parent's visible list. Active techniques expose tactic IDs. | Parser and selection; all parent/child/tactic placements |
| D10 | Platforms — `parsePlatforms`, `Technique`, `Software` | Trim platform strings on techniques/software. Actual domain platform list is active techniques + sub-techniques, despite a broader comment mentioning software. First-seen ordering. | Parser; whitespace, missing fields, inactive objects |
| D11 | Relationship families — `parseRelationship` | Preserves maps for subtechniques, component detection, detection strategies, group/software/campaign uses, campaign attribution, mitigation, revocation, and targeted assets. | All maps need positive/negative fixtures; no synthesized relationships |
| D12 | Groups/campaigns/software — corresponding STIX classes | Group related techniques are deduplicated union of direct uses and uses by attributed campaigns. Software and campaigns return direct relationship IDs. | Search/multiselect; campaign-derived union and duplicates |
| D13 | Mitigations/assets/detection strategies — corresponding STIX classes | Related technique IDs come from `mitigates`, reverse `targets`, and strategy `detects` maps. Strategy retains analytic refs. | Search/multiselect; each family and empty relationship |
| D14 | Legacy data sources/components — `DataComponent`, `Domain.supportsLegacyDataSources` | Legacy mode requires both data sources and component relationships. Component resolves parent technique objects and data-source name/first URL. | Search/multiselect; old releases and missing source refs |
| D15 | Modern analytics/component mapping — `buildDataComponentToTechniquesMap`, `addTechniqueToDataComponents` | Strategy→first detected technique→analytic refs→log source component refs. Deduplicates component-technique pairs. Current lookup searches parent techniques only. | Parser; optional log sources, duplicate refs, no matching technique |
| D16 | Notes — `classes/stix/note.ts` | Preserves optional abstract, content and object refs. | Parser and tooltip; Unicode/newlines, no abstract |
| D17 | Feature tree — `ConfigService.setFeature`, `setFeature_object` | Recursive group toggles; disabled parent forces descendants false. Unknown group query returns true and unknown group count −1. A group can be queried as all/any. | Configuration adapter; nested groups and URL override |
| D18 | URL feature overrides — `getAllFragments` | Parses `[#&](\w+)=(\w+)`; defined flags/groups become true only for literal `true`. URL layer values use a separate tabs parser and percent decoding. | URL tests; group false, unknown flag, repeated layer URL |
| D19 | Config values/default layers — `loadConfig`, `tabs.loadTabs` | Context menus, banner, underline colors, feature lists, defaults. Bundle URL+version+domain takes precedence over `layerURL`; layer URLs take precedence over configured defaults. Default layers skip ATT&CK upgrade prompting. | Startup tests for every precedence branch and failed remote load |
| D20 | Custom context-menu interpolation — `classes/context-menu-item.ts` | Parent/child ATT&CK ID, STIX ID, slugged names, child suffix, tactic ID/STIX ID/shortname replacements. Child template optional. | Context-menu tests; every placeholder and malicious URL handling |

### Relationship representation

| Map | Key | Value |
|---|---|---|
| `subtechniques_of` | Parent technique STIX ID | Child STIX IDs |
| `component_rel` | Data component STIX ID | Technique STIX IDs |
| `detection_strategies_detect` | Strategy STIX ID | Technique STIX IDs |
| `group_uses` | Intrusion-set STIX ID | Technique STIX IDs |
| `software_uses` | Malware/tool STIX ID | Technique STIX IDs |
| `campaign_uses` | Campaign STIX ID | Technique STIX IDs |
| `campaigns_attributed_to` | Group STIX ID | Campaign STIX IDs |
| `mitigates` | Course-of-action STIX ID | Technique STIX IDs |
| `revoked_by` | Revoked STIX ID | Replacement STIX ID (scalar) |
| `targeted_assets` | Asset STIX ID | Technique STIX IDs |

Relationship parsing does not universally discard revoked/deprecated relationship objects; this is distinct from filtering techniques for display.

## Layer state and algorithms

| ID | Feature and source | Exact behavior | Required checks |
|---|---|---|---|
| L01 | Layer identity/state — `ViewModel` constructor, `ViewModelsService.newViewModel` | Session-unique `vm{nonce}` UID; name/domain/version/description, technique map, selected set, highlight state, settings, sidebar state. Nonce is not persistent identity. | Create/destroy/switch/duplicate isolation; preserve state between tabs |
| L02 | Tactic-specific annotations — `Technique.get_technique_tactic_id`, `ViewModel.initTechniqueVMs` | Map key `${attackID}^${tactic.shortname}`. Invalid tactic throws. Init creates records for each active parent/child placement without overwriting imports. | Cross-tactic annotations independent; import-before-init unchanged |
| L03 | Selection scope — `selectTechnique*`, `unselectTechnique*` | Default across tactics true; parent-child selection false; visible-only false. Grouped child click recurses to parent and siblings. Visibility filtering gates selection via `TechniqueVM.isVisible`. | All eight scope combinations, child click, hidden placements |
| L04 | Selection feedback — `getSelectedTechniqueCount`, `isTechniqueSelected`, `isTacticSelected` | Count deduplicates by technique and optionally parent depending on settings. Selection query treats any selected sibling/placement as selected in grouped mode. Tactic selection checks every parent technique. | Count against set size, partial selections, toggled settings |
| L05 | Selection operations — `clearSelectedTechniques`, `invertSelection`, `selectAnnotated`, `selectUnannotated` | Invert clears and rebuilds selection; annotated/unannotated operate as intersection when selection exists and whole set otherwise. Modified includes expansion, annotated does not. | No-selection vs existing-selection, visible-only, expansion-only |
| L06 | Highlight — `highlightTechnique`, `clearHighlight` | Highlighted IDs use STIX IDs, not annotation IDs. Optional tactic limits highlight. Parent grouping adds parent when child hovered. | Cross-tactic hover and clear |
| L07 | Annotation fields — `TechniqueVM` | Internal score is string (`''` unscored), manual color, comment, enabled=true, metadata/links arrays, expansion=false. Aggregate score/color are derived; visibility is transient. | Score 0 vs unscored, explicit color, enabled false, Unicode |
| L08 | Bulk edits/mixed values — `editSelectedTechniques`, `getEditingCommonValue`, `checkValues` | Scalars applied to all selected records. Common scalar returns empty when different. First selected annotation is active; link/metadata comparison uses JSON-stringified arrays and mismatch lists. Reselect first after removal. | Mixed values, first-item removal, list ordering, no selection |
| L09 | Metadata/link bulk edits — `editSelectedTechniqueValues` | Deep copies through class serialize/deserialize per selected annotation. Metadata is name/value or divider; links label/URL or divider. Empty entry filtered on export; divider false still valid. | No shared arrays, valid/invalid entries, divider false, URL safety |
| L10 | Clear annotations — `TechniqueVM.resetAnnotations` | Resets score/comment/color/enabled/derived aggregate/links/metadata; leaves expansion state. | Reset does not collapse; score color recomputation |
| L11 | Filtering — `filterTechniques`, `filterTactics`, `isSubtechniqueEnabled` | Hidden-disabled filter keeps disabled parent if an enabled child matches selected platform. PRE-ATT&CK matrix bypasses platform filtering. Missing platform treated as `None`. Empty tactics removed. Visibility flags updated during filtering. | Parent disabled + visible child, no platforms, PRE matrix, empty selection |
| L12 | Platform compatibility — `Filter.deserialize` | Maps android→Android, ios→iOS, windows→Windows, linux→Linux, mac→macOS; AWS/GCP/Azure→IaaS. Deduplicates. Empty imported selection becomes all platforms on initialization. | Alias mapping and explicit empty list compatibility |
| L13 | Sorting — `sortTechniques`, `sortSubTechniques`, `sortingAlgorithm` | 0 A–Z, 1 Z–A, 2 numeric ascending, 3 descending. Score ties alphabetical. Unscored parents sort as −Infinity, unscored children as 0. Aggregate sorting applies to parents when enabled. | All modes with score 0/unscored/negative/ties/children |
| L14 | Aggregate scoring — `calculateAggregateScore` | Includes parent plus scored children. Parent contributes 0 even when unscored for min/max. No scored records returns −Infinity. Average denominator scored records or all children+parent when countUnscored. min/max/sum/average round to 2 decimals; store finite display string and gradient color. | Positive children+unscored parent min=0; negative scores; denominator; rounding |
| L15 | Gradient — `Gradient` | Six presets; default red/yellow/green, range 0..100; `tinygradient.rgb(100)` discrete colors. Clamp endpoints, round normalized index, cap at 99. Serialized colors use 8-digit RGBA; displayed score colors use 6-digit RGB. Empty score produces undefined color. | Exact known colors, bounds, alpha, multiple stops, zero/unscored |
| L16 | Layout — `LayoutOptions` | side/flat/mini. Mini forces showID/showName false; leaving mini restores showName true. Enabling name/ID from mini selects side. Aggregate option average/min/max/sum; countUnscored getter false unless average. Expansion none/annotated/all. | All transitions, invalid values log warning without replacing current state |
| L17 | Initial expansion — `ViewModel.initTechniqueVMs` | `annotated` opens a parent when any child placement annotated; `all` expands all parents. `none` respects imported per-parent expansion flags when present. | Annotated child under another tactic, explicit expansion+none |
| L18 | Legend/tactic background — `ViewModel` | Add default label NewItem/color #00ffff, delete, clear; manual color palette plus gradient stops become legend presets. Tactic background optional, default #dddddd. | Add/edit/delete/reorder UI, color presets and JSON round-trip |
| L19 | Layer operations — `ViewModelsService.layerOperation` | mathjs expression lowercase; empty-scope evaluation supports constant initialization; Boolean becomes 1/0. Otherwise union of annotation keys, missing/unscored/non-numeric input→0, omit output when all inputs unscored. Non-number/non-Boolean rejects. | Constants, a+b, Boolean, missing values, invalid expression, different domains |
| L20 | Operation inheritance — same | Independently inherit comments, links, metadata, manual colors, enabled, filters, legend and gradient. Computed min/max set range when unequal; 0..1 uses transparentblue. Explicit inherited gradient supersedes computed gradient. | Every inheritance source independently; unchanged source layers |
| L21 | ATT&CK version comparison — `DataService.compareVersions` | Match by STIX ID, compare modified timestamp, revoked/deprecated transitions and object version. Categories additions/changes/minor_changes/deprecations/revocations/unchanged. Previously inactive unchanged objects ignored. No deleted-object category. | Each category, same IDs, missing object versions, no deletion category |
| L22 | Upgrade annotation transfer — `initCopyAnnotations`, `copyAnnotations`, `revertCopy` | Automatically copy annotated unchanged/minor changes. Copy deserializes annotation onto new record, disables source, tracks copied placement/reviewed technique. Revert resets destination and re-enables source. | All placements, changed tactics, revoked replacements, reversible review |
| L23 | Sidebar/transient state — `ViewModel.sidebarContentType`, `openSidebar` | Valid types layerUpgrade/search/layerSettings; invalid resets empty. Sidebar open, stickyToolbar, selection/highlight and derived colors are not layer JSON fields. | Switch layers without losing local view; no transient serialization |

## JSON contract and historical compatibility

Current writer emits layer format `4.5` and Navigator version from package metadata. ATT&CK major version comes from the selected domain. Each serialized layer includes name, versions, domain, description, filters, sorting, layout, hideDisabled, modified techniques, gradient, legend, valid metadata/links, tactic background, and three selection options. `customDataURL` appears only for a custom domain.

Technique export includes techniqueID, tactic, optional numeric score, color, comment, enabled, valid metadata/links, and expansion. Only `modified()` records are emitted, unless an extension-preservation policy requires retaining an otherwise unknown record. “Visible only” export emits modified records with `isVisible === true`; it does not delete the hidden annotations from the live layer. Scores are numeric on the wire, strings internally. JSON output uses tabs for indentation; UTF-8/Unicode and semantic equality matter more than key ordering.

| ID | Compatibility rule | Original source / required verification |
|---|---|---|
| J01 | Single object or array of layers | `tabs.readJSONFile` and `loadLayerFromURL`; round-trip several layers in order |
| J02 | Domain aliases | `deserializeDomainVersionID`: mitre-enterprise→enterprise-attack, mitre-mobile→mobile-attack |
| J03 | Version fallback | No ATT&CK version uses current latest; string attack version uses first digit sequence. `version` scalar overrides `versions.layer` when both present. |
| J04 | Omitted tactic | `deserialize`: copy annotation to every active placement matching technique ID, including sub-techniques. Unknown ID without tactic currently disappears; explicit tactic record can remain even when unknown. |
| J05 | Legacy viewMode | `deserialize`: 0 side/name, 1 side/ID only, 2 mini. `layout` takes precedence. Historical viewFullTable is not read by current implementation. |
| J06 | Historical platform strings | `Filter.deserialize` mappings above; `filters.stages` ignored in current implementation |
| J07 | Older layer schema feedback | `tabs.versionMismatchWarning`: same-major different-minor→6500ms snackbar with changelog action; major mismatch→dismissable warning dialog; compatibility attempt continues |
| J08 | Older ATT&CK release | `tabs.versionUpgradeDialog/upgradeLayer`: choose retain supported release or upgrade; unsupported retained release rejected. Default layers bypass prompt. |
| J09 | Custom data layer | File import with customDataURL invokes custom-domain workflow; domain/version/URL collision validation; serialized layer retains URL |
| J10 | Unknown-field policy | Current source reconstructs known objects and drops unfamiliar fields. User requires retaining valid extensions: retain original unknown fields at all object levels in a sidecar, merge known canonical outputs on export, preserve unknown annotations, reject unsafe structure/prototype pollution. This must be tested and documented as strengthened compatibility. |
| J11 | Invalid field behavior | Mostly logs type error and retains default; malformed outer JSON can escape the import callback. Missing tactic warns. Implement useful structured diagnostics without claiming original malformed-file error paths were reliable. |

### Historical formats inspected

| Format | Fields/changes relevant to import |
|---|---|
| 1.0 | Scalar version, domain aliases, filter stages/platforms, viewFullTable, score/color/comment/enabled |
| 1.1 | viewMode replaces viewFullTable |
| 1.2 | legendItems |
| 1.3 | tactic background controls |
| 2.0 | per-technique tactic and selectTechniquesAcrossTactics |
| 2.1/2.2 | layer/technique metadata; same core field families |
| 3.0 | layout object, sub-technique IDs/expansion, selectSubtechniquesWithParent |
| 4.0 | versions object, canonical domain identifiers, filter stages removed |
| 4.1 | metadata dividers |
| 4.2 | aggregate scoring layout settings |
| 4.3 | links and dividers at layer/technique levels |
| 4.4 | customDataURL |
| 4.5 | selectVisibleTechniques, expandedSubtechniques, documented array-of-layers export |

Presence of a historical specification is not evidence every historical field still has active behavior. The source and spec disagree on default selectSubtechniquesWithParent (spec true, implementation false); use implementation as functional reference and document the discrepancy.

### Repository sample fixtures

| Fixture | Layer version | ATT&CK/domain | Annotation records |
|---|---|---|---:|
| `layers/samples/Bear_APT.json` | 4.5 | 17 / enterprise-attack | 126 |
| `layers/samples/proposed-defensive-evasion-split.json` | 4.5 | 17 / enterprise-attack, custom data | 326 |
| `layers/samples/heatmap_layer.json` | 3.0 | unspecified / mitre-enterprise | 428 |
| `layers/samples/ATTACKcon 2018/Black_Pins.json` | 3.0 | unspecified / mitre-enterprise | 22 |
| `layers/samples/ATTACKcon 2018/Blue_Pins.json` | 3.0 | unspecified / mitre-enterprise | 32 |
| `layers/samples/ATTACKcon 2018/Gold_Pins.json` | 3.0 | unspecified / mitre-enterprise | 27 |
| `layers/samples/ATTACKcon 2018/Red_Pins.json` | 3.0 | unspecified / mitre-enterprise | 24 |
| `layers/samples/ATTACKcon 2018/Submitter_Responses.json` | 3.0 | unspecified / mitre-enterprise | 47 |

Counts were computed by parsing the actual files. Old samples use IDs that may now be revoked; compare against a declared release and record unresolved IDs explicitly. A successful JSON parse alone does not establish import parity.

## Dependencies and reusable boundaries

| Dependency/source | Actual role | Migration treatment |
|---|---|---|
| `tinycolor2`, `tinygradient` | Color validation/conversion, discrete score gradient, presets | Retain exact algorithms; version-lock and compare colors |
| `mathjs` evaluate | Layer operation expression engine | Retain supported language; constrain untrusted evaluation resources and validate numeric result |
| Angular core / HttpClient / RxJS | Service injection, transport, selection emitter | Replace with explicit constructors, fetch/Promises, reactive store events |
| `buffer` | Basic auth token encoding in DataService | Browser-compatible encoding; support Unicode credentials deliberately |
| `detect-browser` | IE/Safari detection and compatibility warning | Retain only user-facing browser behaviors still supported by target toolchain |
| `utils/taxii2lib.ts` | Browser fetch/Headers/btoa TAXII client | Port with license attribution; improve bounded failure handling with documented tests |
| `classes/stix/*` | Object graph, lookup methods | Reuse as framework-independent TS; preserve metadata/raw source through boundary |
| `classes/view-model.ts`, `technique-vm.ts` | Layer state and selection/calculation/serialization | Reuse, add strict typing and extension sidecar; no backend layer mutations |
| `context-menu-item.ts` | URL template interpolation | Reuse; safe URL protocols and text rendering at component boundary |
| `utils/cookies.ts` | Theme preference only | Browser utility; no mandatory account/storage |
| `utils/navigator.d.ts` | Old MS save Blob browser extension | Browser compatibility decision, not server logic |
| `services/icons.service.ts` | Registers bundled SVGs with Material registry | Replace by static trusted asset references, preserve SVG files |
| Barrel exports / `Tab`, `Version`, `VersionChangelog` | Public model organization and state containers | Preserve equivalent names/contracts; Pinia owns application collections |

No new repository abstraction or database-backed layer model is needed. API-resource serialization must not turn raw STIX maps into a reduced example dataset.

## Existing test evidence and missing coverage

Tests reviewed, not executed by this audit leaf:

- `config.service.spec.ts`: feature groups/flags, fragments, config validation.
- `data.service.spec.ts`: configured/index/Workbench/TAXII setup, domain IDs/version support, bundle object/map counts, version comparison, relationship methods, invalid technique tactic.
- `viewmodels.service.spec.ts`: nonce/lifecycle, operation a+b plus inheritance, selection/annotations, visibility, exact gradient colors, invalid technique/layout field types, old layer version/domain compatibility, mismatch tracking, custom URL.
- `matrix/matrix-common.spec.ts`: filters/sort/selection modifier semantics are additional UI integration evidence.
- `version-upgrade/version-upgrade.component.spec.ts`: dialog construction and upgrade result.
- `layer-upgrade/changelog-cell/changelog-cell.component.spec.ts`: upgrade review UI and theme utility integration.
- Shared `mock-data.ts` and `mock-layers.ts` supply synthetic fixtures for unit tests; they must never substitute for official runtime ATT&CK datasets.

Required new semantic fixture coverage: complete official Enterprise/Mobile/ICS bundles and old release; duplicate/multi-bundle matrices; modern analytics and legacy data sources; every relationship family; all selection settings; exact gradient/aggregate results; malformed and unknown fields; legacy domains/viewMode; import→export→original re-import; per-layer independent operations/metadata; network failure recovery. Browser baseline and performance evidence belong in `BASELINE_RESULTS.md`.

## Preexisting hazards discovered by source inspection

These are source-derived risks, not experimentally confirmed failures unless a baseline report supplies reproduction. Do not silently classify them as migration defects or promise compatibility with accidental crashes.

1. `parseCollectionIndex` compares `acc[major].minor` but stores only `{version,url}`. It therefore keeps the first encountered minor release; sorted upstream input may conceal the issue. Select the intended latest minor deterministically and document/test the correction.
2. `getDomainData` has one service-wide `domainData$`, not a cache per domain. A non-refresh fetch after a different domain may reuse the wrong observable. `loadDomainData` resolves for an already-loaded domain but does not return, and repeated parsing appends object arrays. Source callers often use refresh=true; test actual transitions and implement a domain-keyed cache.
3. `loadDomainData` subscription has no error callback; request failures can leave the Promise pending. TAXII timeout wrapper does not abort the fetch and HTTP status is not checked before JSON decoding.
4. Bundle parsing builds parent/child objects per bundle and requires related child SDOs in that same bundle. Cross-bundle relationships may not produce all expected children. Preserve current supported bundle combinations and document any broadening.
5. Modern and legacy data-component lookup search parent techniques only. Child-linked analytics/components may be missing in related-technique results.
6. `StixObject.compareVersion` bounds use `< i` where `<= i` would be needed for missing segments; mixed lengths can produce NaN. Absent versions intentionally compare equal.
7. Aggregate min includes an unscored parent as zero. This is a visible scoring semantic to preserve rather than replacing with an intuitively different minimum.
8. Operations copy scalar fields directly; links/metadata inheritance shares references in source. Deep-copying inherited collections is safer and must be covered by source-layer isolation tests.
9. Unknown JSON fields are dropped; unqualified unknown/revoked annotation IDs can be lost. Extension retention needs explicit treatment.
10. `readJSONFile` parses outer JSON outside its per-layer try/catch, invokes layer-format warning twice, and its success Promise lacks a normal resolve. These are observable failure/lifecycle concerns.
11. Imported gradients do not enforce at least two stops or a finite increasing range before calling tinygradient; malformed arrays can throw. Schema boundary validation is needed.
12. Link model validation accepts any nonempty URL; protocol safety must be enforced at clickable/rendered boundaries. No source guarantee makes `javascript:` safe.
13. Filter initialization treats empty selected platforms as uninitialized and resets to all. Preserve this on import unless explicitly documented otherwise.
14. Default-layer HTTP failure handling resolves and continues, while domain data failure handling can hang. Failure UX must be tested separately for layer and STIX requests.

## Completion assessment

The model/service/format audit is complete at source level. This document does not mark any migrated feature implemented or verified. Before acceptance, each row must map to a concrete implementation and passing semantic/browser evidence in the central feature inventory. Applicable Apache-2.0 license, MITRE NOTICE and TAXII client attribution must accompany reused source.
