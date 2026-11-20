# Source audit

Reference: local Navigator 5.3.2, upstream commit `7e960e38`, audited 2026-11-16. The reference contains preexisting uncommitted changes in app/tabs and browser tests. These files are preserved in place. Their Plan workflow is explicitly outside this migration because the request prohibits introducing Attack/Defense Plan features. Existing Navigator controls within that shell remain the reference.

The Git repository is `attack-navigator/`; its parent workspace is not a Git repository. Migration branch: `migration/attackwise-vue-laravel`. New applications and documentation are under `attackwise/`. No original source files are moved.

## Structure and sources

289 tracked source/configuration/documentation files; 129 files under `nav-app/src/app`. Angular 19 standalone components, TypeScript 5.8, Angular Material, mutable service-owned ViewModel classes, Map/Set annotation and selection state. README and USAGE reviewed along with actual implementation; detailed source traces are in [UI audit](audit/UI.md) and [domain audit](audit/DOMAIN.md). Complete tracked path inventory: [source-files.txt](source-files.txt).

The browser fetches configuration and an ATT&CK collection index, constructs version/domain records, lazily loads STIX bundles/TAXII collections, builds matrix/tactic/technique and relationship models, and initializes layer view models. Technique/tactic annotation keys are `techniqueID^tactic-shortname`. Layers, selections, scoring, arithmetic, file import/export and visual rendering are browser operations. The source does not upload local layers or require an account.

## Compatibility and environments

Current layer format 4.5; minimum ATT&CK major 4. Collection versions retain major-version behavior documented in the domain audit. Enterprise, Mobile and ICS plus configured custom domains must remain available. Current official collection index fetched for baseline contains ATT&CK 20.1; fixtures pin URL and checksum rather than assuming “latest” is stable.

Documented runtime: Node 22 and Angular CLI 19. Available: Node 22.22.1, npm 9.2.0, PHP 8.5.4, Composer 2.9.5. Source README lists older browsers including IE11; actual Angular 19 and Vue 3 cannot substantiate IE11 support. Browser support will be reported from measured tests, not inherited README claims.

## Tests and notices

Karma/Jasmine, Playwright and obsolete Protractor/TSLint configuration coexist. Baseline outcomes are in [BASELINE_RESULTS.md](BASELINE_RESULTS.md). Production and JIT/browser-test builds are tracked separately. Browser fixtures in the existing e2e suite are synthetic and are not production data.

Apache-2.0 MITRE source license and NOTICE remain in the original root and are copied into ATT&CKWISE. Attribution applies to ported domain models, styles, icons and renderers. ATT&CK terms remain linked. New framework dependencies retain their own licenses.

## Audit status

Implementation-derived UI and domain audit reports are collected before migration implementation starts. Inventory rows distinguish implemented behavior from verified parity; a build alone never establishes parity.
