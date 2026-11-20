# Dependency map

| Source dependency | Responsibility | Target |
|---|---|---|
| Angular/core, router, forms, Material/CDK | Component lifecycle, templates, dialogs, menus | Vue 3 Composition API SFCs, Vue Router, accessible native controls styled against reference |
| Injectable Config/Data/ViewModels services | App configuration, STIX graph, layer state | Framework-free TypeScript services plus Pinia |
| HttpClient, RxJS, buffer, TAXII utility | Index/bundle HTTP and TAXII | Typed native fetch; Laravel official-data API; browser direct custom sources |
| tinycolor2, tinygradient | Color validation and 100-step RGB gradients | Retain algorithms and dependencies |
| mathjs | Layer expression evaluation | Retain supported expression semantics |
| D3 and d3-svg-legend | SVG matrix measurement/layout/export | Framework-free port of existing renderer |
| ExcelJS, file-saver | Browser XLSX/download | ExcelJS and Blob downloads |
| ngx-color-picker / ngx-drag-drop | Color controls, gradient/legend ordering | Vue controls preserving underlying data behavior |
| ngx-markdown / marked | Help/changelog/description Markdown | marked and DOMPurify sanitization |
| Karma / Jasmine / Protractor | Legacy tests | Preserved baseline; Vitest / Vue Test Utils / Playwright for target |
| TSLint / Codelyzer | Legacy lint | ESLint and Prettier |

Final resolved versions are pinned in independent npm and Composer lockfiles. No Angular runtime is permitted in the target dependency graph.

Supported target versions were checked against the [Laravel 13 release policy](https://laravel.com/framework/docs/13.x/releases), [Laravel deployment requirements](https://laravel.com/framework/docs/deployment), [Vue guide](https://vuejs.org/guide/quick-start) and [Vite requirements](https://vite.dev/guide/), then package registries. The installed Node 22.22.1 and PHP 8.5.4 satisfy the chosen stable toolchain.
