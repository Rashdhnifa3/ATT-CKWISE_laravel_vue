# Incremental migration plan

1. Preserve legacy/user changes, create dedicated branch and digest manifest.
2. Read all source areas; record feature inventory and original build/unit/browser baselines.
3. Fix versioned API and browser domain contracts. Official index and STIX bundles cross the API; user layers never do.
4. Create independent Laravel 13 and Vue 3/Vite/strict TypeScript applications.
5. Port domain models and calculations with differential fixtures; preserve STIX relationships and old layer handling.
6. Rebuild Navigator tabs, matrix layouts, selections, annotations, filters, settings and dialogs in Vue.
7. Port local import/export, arithmetic, configuration, search and upgrade flows.
8. Exercise unit/feature/component/browser tests, original-to-target-to-original layer round trips and export contents.
9. Compare screenshots and timing using identical datasets and browser conditions. Correct defects before acceptance.
10. Reconcile every inventory row, document Windows/Linux setup and production configuration, record verified and unverified differences.

No acceptance step can be replaced by compilation. Incomplete features remain explicitly open. No future ATT&CKWISE enhancements are included. Root owns integration; disjoint domain/frontend/backend work may proceed concurrently after audit/baseline. Small commits stage only new `attackwise/` paths.

## API contract

- `GET /api/v1/health` → `{data: {status: "ok"}}`.
- `GET /api/v1/attack/index` → `{data: <original collection index>}`.
- `GET /api/v1/attack/bundles/{domain}/{version}` → `{data: <original STIX bundle>}`.

Responses preserve all STIX fields. Domain/version validation and index membership constrain upstream fetches; no arbitrary URL proxy or layer upload endpoint. Failures use JSON `{error: {code, message}}` with suitable HTTP status. Official data are cached on disk. CORS allows configured frontend origins. Default browser configuration is served by Vite/static hosting. Configured custom sources and TAXII stay browser-side, respecting browser CORS.
