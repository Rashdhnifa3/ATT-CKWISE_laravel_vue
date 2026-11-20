<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Attack\AttackDataService;
use Illuminate\Http\JsonResponse;

/** GET /api/v1/attack/index → {"data": <original collection index>} */
final class AttackIndexController extends Controller
{
    public function __invoke(AttackDataService $attack): JsonResponse
    {
        $result = $attack->index();

        return response()
            ->json(['data' => $result['index']], 200, [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            ->header('X-Attack-Cache', $result['cache'])
            ->header('Cache-Control', 'public, max-age=300');
    }
}
