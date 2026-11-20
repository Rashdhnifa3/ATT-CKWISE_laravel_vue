<?php

namespace App\Services\Attack;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory as HttpFactory;
use Throwable;

/**
 * Read-only access to official ATT&CK STIX data (collection index + versioned bundles).
 *
 * - The index URL is fixed by configuration; bundle URLs come only from that index and must be
 *   https on an allowed host. Domain/version are validated against the index before any fetch.
 * - Index: disk cache with TTL; if the upstream fails and a cached copy exists it is served as stale.
 * - Bundles: versioned and immutable, cached on disk indefinitely after validation.
 * - Version resolution mirrors the frontend (and the Angular reference): a bare major ("17")
 *   resolves to the FIRST listed entry of that major in the index; "17.1" must match exactly.
 */
final class AttackDataService
{
    public const MINIMUM_SUPPORTED_MAJOR = 4;

    public function __construct(private readonly HttpFactory $http) {}

    /** @return array{index: array<string, mixed>, cache: string} */
    public function index(): array
    {
        $path = $this->cacheDir().'/index.json';
        $ttl = (int) config('attackwise.index_ttl');
        if (is_file($path) && (time() - (int) filemtime($path)) < $ttl) {
            $cached = $this->decodeIndex((string) file_get_contents($path));
            if ($cached !== null) {
                return ['index' => $cached, 'cache' => 'hit'];
            }
        }

        try {
            $url = (string) config('attackwise.collection_index_url');
            $this->assertAllowedUrl($url);
            $response = $this->http->timeout((int) config('attackwise.timeout'))->accept('application/json')->get($url);
            if (! $response->successful()) {
                throw AttackDataException::upstream('Collection index request failed with HTTP '.$response->status().'.');
            }
            $index = $this->decodeIndex($response->body());
            if ($index === null) {
                throw AttackDataException::invalidUpstream('The collection index is not valid ATT&CK index JSON.');
            }
            $this->atomicWrite($path, $response->body());

            return ['index' => $index, 'cache' => 'miss'];
        } catch (Throwable $e) {
            $error = $e instanceof AttackDataException ? $e : AttackDataException::upstream('Collection index could not be retrieved.');
            if ($error->errorCode !== 'disallowed_source' && is_file($path)) {
                $stale = $this->decodeIndex((string) file_get_contents($path));
                if ($stale !== null) {
                    return ['index' => $stale, 'cache' => 'stale'];
                }
            }
            throw $error;
        }
    }

    /** @return array{path: string, version: string, cache: string} */
    public function bundle(string $domain, string $version): array
    {
        if (! preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/', $domain)) {
            throw AttackDataException::invalidParameter('Domain must be a lowercase collection identifier such as enterprise-attack.');
        }
        if (! preg_match('/^\d{1,3}(\.\d{1,3})?$/', $version)) {
            throw AttackDataException::invalidParameter('Version must be a major version (e.g. 17) or major.minor (e.g. 17.1).');
        }

        $entry = $this->resolve($this->index()['index'], $domain, $version);
        $path = $this->cacheDir().'/bundles/'.$domain.'/'.$entry['version'].'.json';
        if (is_file($path)) {
            return ['path' => $path, 'version' => $entry['version'], 'cache' => 'hit'];
        }

        $this->assertAllowedUrl($entry['url']);
        @mkdir(dirname($path), 0775, true);
        $lock = fopen($path.'.lock', 'c');
        if ($lock === false) {
            throw AttackDataException::upstream('Bundle cache is not writable.');
        }
        try {
            flock($lock, LOCK_EX);
            if (is_file($path)) {
                return ['path' => $path, 'version' => $entry['version'], 'cache' => 'hit'];
            }
            $this->download($entry['url'], $path);

            return ['path' => $path, 'version' => $entry['version'], 'cache' => 'miss'];
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
            @unlink($path.'.lock');
        }
    }

    /** Same identifier rule as the frontend DataService.getDomainIdentifier. */
    public static function domainIdentifier(string $collectionName): string
    {
        return strtolower(str_replace(['&', ' '], ['a', '-'], $collectionName));
    }

    /**
     * @param  array<string, mixed>  $index
     * @return array{version: string, url: string}
     */
    public function resolve(array $index, string $domain, string $version): array
    {
        foreach ($index['collections'] as $collection) {
            if (self::domainIdentifier((string) $collection['name']) !== $domain) {
                continue;
            }
            foreach ($collection['versions'] as $entry) {
                $listed = (string) $entry['version'];
                $major = (int) explode('.', $listed)[0];
                if ($major < self::MINIMUM_SUPPORTED_MAJOR) {
                    continue;
                }
                $matches = str_contains($version, '.') ? $listed === $version : (string) $major === $version;
                if ($matches) {
                    return ['version' => $listed, 'url' => (string) $entry['url']];
                }
            }
            throw AttackDataException::unknownVersion($domain, $version);
        }
        throw AttackDataException::unknownDomain($domain);
    }

    private function download(string $url, string $path): void
    {
        $tmp = $path.'.part-'.bin2hex(random_bytes(4));
        try {
            try {
                $response = $this->http->timeout((int) config('attackwise.timeout'))->withOptions(['sink' => $tmp])->get($url);
            } catch (ConnectionException) {
                throw AttackDataException::upstream('Bundle source could not be reached.');
            }
            if (! $response->successful()) {
                throw AttackDataException::upstream('Bundle request failed with HTTP '.$response->status().'.');
            }
            if (! is_file($tmp) || filesize($tmp) === 0) {
                // HTTP fakes ignore the sink option.
                file_put_contents($tmp, $response->body());
            }
            $size = (int) filesize($tmp);
            if ($size > (int) config('attackwise.max_bundle_bytes')) {
                throw AttackDataException::invalidUpstream('Bundle exceeds the configured size limit.');
            }
            $head = (string) file_get_contents($tmp, false, null, 0, 4096);
            if (! preg_match('/^\s*\{.*"type"\s*:\s*"bundle"/s', $head) || ! json_validate((string) file_get_contents($tmp))) {
                throw AttackDataException::invalidUpstream('Bundle source did not return a STIX bundle.');
            }
            rename($tmp, $path);
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }

    /** @return array<string, mixed>|null */
    private function decodeIndex(string $json): ?array
    {
        $data = json_decode($json, true);
        if (! is_array($data) || ! isset($data['collections']) || ! is_array($data['collections'])) {
            return null;
        }
        foreach ($data['collections'] as $collection) {
            if (! is_array($collection) || ! is_string($collection['name'] ?? null) || ! is_array($collection['versions'] ?? null)) {
                return null;
            }
            foreach ($collection['versions'] as $entry) {
                if (! is_array($entry) || ! is_string($entry['version'] ?? null) || ! is_string($entry['url'] ?? null)) {
                    return null;
                }
            }
        }

        return $data;
    }

    private function assertAllowedUrl(string $url): void
    {
        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (($parts['scheme'] ?? '') !== 'https' || $host === '' || isset($parts['user']) || isset($parts['port'])
            || ! in_array($host, array_map('strtolower', (array) config('attackwise.allowed_hosts')), true)) {
            throw AttackDataException::disallowedSource($url);
        }
    }

    private function atomicWrite(string $path, string $contents): void
    {
        @mkdir(dirname($path), 0775, true);
        $tmp = $path.'.tmp-'.bin2hex(random_bytes(4));
        file_put_contents($tmp, $contents);
        rename($tmp, $path);
    }

    private function cacheDir(): string
    {
        return rtrim((string) config('attackwise.cache_dir'), '/');
    }
}
