<?php

use App\Http\Controllers\Api\AttackBundleController;
use App\Http\Controllers\Api\AttackIndexController;
use App\Http\Controllers\Api\HealthController;
use Illuminate\Support\Facades\Route;

// Read-only API (shared/contracts/api.md). Plans and layers never cross this API.
Route::prefix('v1')->group(function (): void {
    Route::get('health', HealthController::class);
    Route::get('attack/index', AttackIndexController::class);
    Route::get('attack/bundles/{domain}/{version}', AttackBundleController::class)
        ->where(['domain' => '[^/]+', 'version' => '[^/]+']);
});
