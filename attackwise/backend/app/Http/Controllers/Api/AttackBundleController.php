<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Attack\AttackDataService;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /api/v1/attack/bundles/{domain}/{version} → {"data": <original STIX bundle>}
 * The cached bundle bytes are streamed unchanged inside the envelope (no re-encoding), so every
 * STIX field is preserved and large bundles do not need to be decoded in PHP.
 */
final class AttackBundleController extends Controller
{
    public function __invoke(AttackDataService $attack, string $domain, string $version): StreamedResponse
    {
        $bundle = $attack->bundle($domain, $version);
        $path = $bundle['path'];

        return response()->stream(function () use ($path): void {
            echo '{"data":';
            readfile($path);
            echo '}';
        }, 200, [
            'Content-Type' => 'application/json',
            'X-Attack-Version' => $bundle['version'],
            'X-Attack-Cache' => $bundle['cache'],
            'Cache-Control' => 'public, max-age=86400, immutable',
        ]);
    }
}
