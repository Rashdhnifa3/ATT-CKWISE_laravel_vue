# ATT&CKWISE migration — in progress

Original Angular application remains in `../nav-app`. Migration branch: `migration/attackwise-vue-laravel`.

Source audit, feature inventory and original baseline: `docs/migration/`. Original baseline: 315 unit and 5 browser tests passed. Target feature parity is **not yet implemented or verified**.

## Backend foundation

PHP 8.3+ (tested 8.5.4), Composer 2; Laravel 13.42 locked in composer.lock. SQLite default, optional MySQL through Laravel DB_* configuration. No account required; no layer upload endpoints.

Linux/macOS:

```sh
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve --host=127.0.0.1 --port=8000
```

Windows PowerShell uses `Copy-Item .env.example .env` instead of `cp`. Ensure PHP SQLite extensions are enabled. Run `php artisan test` and `vendor/bin/pint --test` (Windows: `vendor\bin\pint --test`).

`GET /api/v1/health` returns `{ "data": { "status": "ok" } }`.

Remaining: official-data API, Vue frontend/domain migration, import/export, full regression and performance comparison. The framework scaffold is not a migrated Navigator implementation.
