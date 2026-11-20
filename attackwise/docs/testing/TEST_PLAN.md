# Verification plan

Acceptance requires every feature inventory row to have implemented code and evidence. The following checks are complementary; successful compilation is not parity.

| Layer | Checks | Evidence |
|---|---|---|
| Original reference | Documented production build, Karma, Playwright, official-data UI export and reimport | migration/BASELINE_RESULTS.md, shared/fixtures/baseline |
| Domain | STIX transformations, relationship resolution, selection flags, scores/aggregation, filters, layout, old schemas, unknown fields, expressions, errors | Vitest domain tests and golden fixtures |
| UI | Vue Test Utils rendering and controls, layer state, matrix selection, annotations and failures | Vitest component suites |
| API | Health/index/bundle routes, validation, safe upstream lookup, cache reuse, error responses, CORS | Laravel feature/unit tests |
| Browser | Enterprise/Mobile/ICS, subtechniques, multiselect, annotations, filter, multi-layer switch, JSON round-trip, SVG/XLSX contents, invalid imports, older data and configuration | Playwright tests, screenshots and traces |
| Differential | Import reference export in Vue; export back into original; compare normalized semantic fields | Baseline JSON + browser/fixture assertions |
| Performance | Same browser viewport and data from disk; startup/matrix/selection/switch/import/export time; heap where exposed | metrics.json files; single-run values labelled diagnostic |
| Preservation | SHA256 of every original tracked file plus existing untracked user test | Preserved legacy manifest |

Use official full data for production integration; small source-repository mock STIX bundles only as clearly labelled automated test fixtures. Browser failures must retain traces/screenshots. Do not mask unavailable remote sources with example techniques. Record unsupported browsers and untested combinations explicitly.

When schema text and implementation differ, implementation is functional reference; record discrepancy. Match semantic state rather than whitespace or JSON key order. Security tests cover disallowed URL schemes, unsafe HTML, malformed/oversized JSON, upstream errors and lack of layer-upload requests.
