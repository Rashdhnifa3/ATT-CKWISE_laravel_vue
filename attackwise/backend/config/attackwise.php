<?php

// Official ATT&CK data source used by /api/v1/attack/*. Only the configured collection index
// URL is fetched directly; bundle URLs are taken from that index and must be https on an
// allowed host. There is no arbitrary URL proxy and no endpoint that accepts user layers.
return [
    'collection_index_url' => env('ATTACKWISE_COLLECTION_INDEX_URL', 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/index.json'),
    'allowed_hosts' => array_values(array_filter(array_map('trim', explode(',', (string) env('ATTACKWISE_ALLOWED_HOSTS', 'raw.githubusercontent.com'))))),
    'cache_dir' => env('ATTACKWISE_CACHE_DIR', storage_path('app/attack-cache')),
    // The index changes when MITRE publishes; versioned bundles are immutable and cached indefinitely.
    'index_ttl' => (int) env('ATTACKWISE_INDEX_TTL', 3600),
    'timeout' => (int) env('ATTACKWISE_UPSTREAM_TIMEOUT', 60),
    'max_bundle_bytes' => (int) env('ATTACKWISE_MAX_BUNDLE_BYTES', 200 * 1024 * 1024),
];
