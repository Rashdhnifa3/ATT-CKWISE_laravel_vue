# Original baseline

Navigator 5.3.2, Node 22.22.1, Chromium 153.0.8010.12, viewport 1440×1000. Saved logs directly reviewed.

- Karma: 315 passed. Command: npm test -- --watch=false --browsers=ChromeHeadlessCI.
- Playwright: 5 passed; two exercise preexisting Plan changes excluded from target scope. Command: npm run test:e2e.
- Production builds with and without --aot=false produced output successfully; existing CommonJS/style warnings remain.
- Official Enterprise 20.1: 26,699 STIX objects.
- Official-data annotations exported and reimported; JSON and screenshots saved under shared/fixtures/baseline.
- Timing values in metrics.json are single-run diagnostics. Other browsers and exhaustive old-release workflows remain untested.

Evidence: shared/fixtures/baseline/logs/{unit,e2e,build,build-default-aot}.log and tools/baseline/capture.mjs (paths relative to attackwise).
