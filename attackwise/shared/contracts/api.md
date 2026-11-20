

- `GET /api/v1/health` → `{data: {status: "ok"}}`.
- `GET /api/v1/attack/index` → `{data: <original collection index>}`.
- `GET /api/v1/attack/bundles/{domain}/{version}` → `{data: <original STIX bundle>}`.

Responses preserve all STIX fields. Domain/version validation and index membership constrain upstream fetches; no arbitrary URL proxy or layer upload endpoint. Failures use JSON `{error: {code, message}}` with suitable HTTP status. Official data are cached on disk. CORS allows configured frontend origins. Default browser configuration is served by Vite/static hosting. Configured custom sources and TAXII stay browser-side, respecting browser CORS.
