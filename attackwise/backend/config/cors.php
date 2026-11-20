<?php

// Only the read-only ATT&CK API is exposed cross-origin, and only to configured frontend origins.
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['GET', 'OPTIONS'],
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('ATTACKWISE_FRONTEND_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4174'))))),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['Accept', 'Content-Type'],
    'exposed_headers' => ['X-Attack-Version', 'X-Attack-Cache'],
    'max_age' => 600,
    'supports_credentials' => false,
];
