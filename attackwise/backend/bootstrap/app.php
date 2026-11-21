<?php

use App\Services\Attack\AttackDataException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

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
        // Every other failure under /api (unknown path, wrong method, unexpected error) uses the same
        // shape. With APP_DEBUG=false no exception detail is exposed.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*') && ! $request->is('api')) {
                return null;
            }
            $status = $e instanceof HttpExceptionInterface ? $e->getStatusCode() : 500;
            [$code, $message] = match (true) {
                $status === 404 => ['not_found', 'No API endpoint matches this path.'],
                $status === 405 => ['method_not_allowed', 'This API is read-only; use GET.'],
                $status === 429 => ['too_many_requests', 'Too many requests.'],
                $status >= 500 => ['server_error', 'The server could not complete the request.'],
                default => ['http_'.$status, Response::$statusTexts[$status] ?? 'Request failed.'],
            };
            $headers = $e instanceof HttpExceptionInterface ? $e->getHeaders() : [];

            return response()->json(['error' => ['code' => $code, 'message' => $message]], $status, $headers);
        });
    })->create();
