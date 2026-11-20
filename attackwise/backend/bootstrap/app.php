<?php

use App\Services\Attack\AttackDataException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        // Contract error shape: {"error": {"code", "message"}} (shared/contracts/api.md).
        $exceptions->render(fn (AttackDataException $e) => response()->json(
            ['error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]],
            $e->status,
        ));
    })->create();
