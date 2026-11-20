<?php

namespace Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Contract tests for shared/contracts/api.md with synthetic upstream data (no network). */
class AttackApiTest extends TestCase
{
    private string $cacheDir;

    private const INDEX_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/index.json';

    private const E20_1 = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack-20.1.json';

    private const E20_0 = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack-20.0.json';

    private const E19_2 = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack-19.2.json';

    protected function setUp(): void
    {
        parent::setUp();
        $this->cacheDir = sys_get_temp_dir().'/attackwise-api-test-'.bin2hex(random_bytes(6));
        config([
            'attackwise.cache_dir' => $this->cacheDir,
            'attackwise.collection_index_url' => self::INDEX_URL,
            'attackwise.allowed_hosts' => ['raw.githubusercontent.com'],
            'attackwise.index_ttl' => 3600,
            'cors.allowed_origins' => ['http://127.0.0.1:4174'],
        ]);
        Http::preventStrayRequests();
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->cacheDir);
        parent::tearDown();
    }

    /** @return array<string, mixed> */
    private function index(array $extraVersions = []): array
    {
        return [
            'id' => 'x-mitre-collection--index',
            'name' => 'MITRE ATT&CK',
            'collections' => [
                [
                    'name' => 'Enterprise ATT&CK',
                    'versions' => array_merge([
                        ['version' => '20.1', 'url' => self::E20_1],
                        ['version' => '20.0', 'url' => self::E20_0],
                        ['version' => '19.2', 'url' => self::E19_2],
                        ['version' => '3.0', 'url' => 'https://raw.githubusercontent.com/old/enterprise-attack-3.0.json'],
                    ], $extraVersions),
                ],
                ['name' => 'ICS ATT&CK', 'versions' => [['version' => '20.1', 'url' => 'https://raw.githubusercontent.com/ics-20.1.json']]],
            ],
        ];
    }

    private function bundleJson(string $marker = 'a'): string
    {
        // Pretty-printed with unknown/custom fields and Unicode to prove byte-for-byte preservation.
        return json_encode([
            'type' => 'bundle',
            'id' => 'bundle--'.$marker,
            'objects' => [[
                'type' => 'attack-pattern', 'id' => 'attack-pattern--1', 'name' => 'Ⓣest — تقنية',
                'x_custom_unknown' => ['nested' => [1, 2.5, null, false]], 'external_references' => [['external_id' => 'T0001']],
            ]],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }

    public function test_health_contract_is_unchanged(): void
    {
        $this->getJson('/api/v1/health')->assertOk()->assertExactJson(['data' => ['status' => 'ok']]);
    }

    public function test_index_returns_the_original_index_and_reuses_the_cache(): void
    {
        Http::fake([self::INDEX_URL => Http::response($this->index())]);

        $this->getJson('/api/v1/attack/index')->assertOk()
            ->assertHeader('X-Attack-Cache', 'miss')
            ->assertExactJson(['data' => $this->index()]);
        $this->getJson('/api/v1/attack/index')->assertOk()->assertHeader('X-Attack-Cache', 'hit');

        Http::assertSentCount(1);
    }

    public function test_index_upstream_failure_without_cache_uses_error_shape(): void
    {
        Http::fake([self::INDEX_URL => Http::response('down', 503)]);

        $this->getJson('/api/v1/attack/index')->assertStatus(502)
            ->assertExactJson(['error' => ['code' => 'upstream_unavailable', 'message' => 'Collection index request failed with HTTP 503.']]);
    }

    public function test_index_connection_failure_returns_502(): void
    {
        Http::fake([self::INDEX_URL => fn () => throw new ConnectionException('timeout')]);

        $this->getJson('/api/v1/attack/index')->assertStatus(502)->assertJsonPath('error.code', 'upstream_unavailable');
    }

    public function test_stale_index_is_served_when_upstream_fails_after_ttl(): void
    {
        Http::fakeSequence(self::INDEX_URL)->push($this->index())->push('down', 500);

        $this->getJson('/api/v1/attack/index')->assertOk()->assertHeader('X-Attack-Cache', 'miss');
        config(['attackwise.index_ttl' => 0]);
        $this->getJson('/api/v1/attack/index')->assertOk()
            ->assertHeader('X-Attack-Cache', 'stale')
            ->assertJsonPath('data.name', 'MITRE ATT&CK');
    }

    public function test_malformed_index_is_rejected_and_not_cached(): void
    {
        Http::fake([self::INDEX_URL => Http::response(['collections' => [['name' => 'x']]])]);

        $this->getJson('/api/v1/attack/index')->assertStatus(502)->assertJsonPath('error.code', 'upstream_invalid');
        $this->assertFileDoesNotExist($this->cacheDir.'/index.json');
    }

    public function test_major_version_resolves_to_first_listed_entry_and_preserves_bytes(): void
    {
        $body = $this->bundleJson();
        Http::fake([self::INDEX_URL => Http::response($this->index()), self::E20_1 => Http::response($body)]);

        $response = $this->get('/api/v1/attack/bundles/enterprise-attack/20');
        $response->assertOk()->assertHeader('X-Attack-Version', '20.1')->assertHeader('X-Attack-Cache', 'miss');
        $this->assertSame('{"data":'.$body.'}', $response->streamedContent());
        $this->assertSame(json_decode($body, true), json_decode($response->streamedContent(), true)['data']);
        Http::assertSent(fn (Request $r) => $r->url() === self::E20_1);
    }

    public function test_exact_minor_version_and_bundle_cache_reuse(): void
    {
        Http::fake([self::INDEX_URL => Http::response($this->index()), self::E20_0 => Http::response($this->bundleJson('b'))]);

        $this->get('/api/v1/attack/bundles/enterprise-attack/20.0')->assertOk()->assertHeader('X-Attack-Version', '20.0');
        $again = $this->get('/api/v1/attack/bundles/enterprise-attack/20.0');
        $again->assertOk()->assertHeader('X-Attack-Cache', 'hit');
        $this->assertStringContainsString('bundle--b', $again->streamedContent());

        Http::assertSentCount(2); // index once + bundle once
    }

    public function test_unknown_domain_and_version_are_404_without_fetching_bundles(): void
    {
        Http::fake([self::INDEX_URL => Http::response($this->index())]);

        $this->getJson('/api/v1/attack/bundles/pre-attack/20')->assertNotFound()->assertJsonPath('error.code', 'unknown_domain');
        $this->getJson('/api/v1/attack/bundles/enterprise-attack/99')->assertNotFound()->assertJsonPath('error.code', 'unknown_version');
        $this->getJson('/api/v1/attack/bundles/enterprise-attack/20.9')->assertNotFound()->assertJsonPath('error.code', 'unknown_version');
        // Majors below the Navigator minimum (4) are not offered, as in the frontend.
        $this->getJson('/api/v1/attack/bundles/enterprise-attack/3')->assertNotFound()->assertJsonPath('error.code', 'unknown_version');

        Http::assertSentCount(1);
    }

    public function test_invalid_parameters_are_rejected_before_any_request(): void
    {
        foreach (['/api/v1/attack/bundles/Enterprise/20', '/api/v1/attack/bundles/enterprise-attack/latest', '/api/v1/attack/bundles/https:evil/1', '/api/v1/attack/bundles/enterprise-attack/1.2.3'] as $url) {
            $this->getJson($url)->assertStatus(422)->assertJsonPath('error.code', 'invalid_parameter');
        }
        // Encoded slashes / traversal never match the route at all.
        foreach (['/api/v1/attack/bundles/enterprise-attack/..%2F..%2Fx', '/api/v1/attack/bundles/https%3A%2F%2Fevil/1'] as $url) {
            $this->getJson($url)->assertNotFound()->assertHeader('Content-Type', 'application/json');
        }
        Http::assertNothingSent();
    }

    public function test_bundle_upstream_error_and_non_bundle_payload_are_502_and_not_cached(): void
    {
        Http::fake([
            self::INDEX_URL => Http::response($this->index()),
            self::E20_1 => Http::response('not found', 404),
            self::E20_0 => Http::response('<html>captive portal</html>'),
        ]);

        $this->getJson('/api/v1/attack/bundles/enterprise-attack/20.1')->assertStatus(502)->assertJsonPath('error.code', 'upstream_unavailable');
        $this->getJson('/api/v1/attack/bundles/enterprise-attack/20.0')->assertStatus(502)->assertJsonPath('error.code', 'upstream_invalid');
        $this->assertSame([], glob($this->cacheDir.'/bundles/enterprise-attack/*.json'));
    }

    public function test_index_entries_outside_allowed_hosts_are_never_fetched(): void
    {
        $index = $this->index([['version' => '18.0', 'url' => 'http://169.254.169.254/latest/meta-data']]);
        $index['collections'][0]['versions'][] = ['version' => '17.0', 'url' => 'https://evil.example/enterprise.json'];
        Http::fake([self::INDEX_URL => Http::response($index)]);

        $this->getJson('/api/v1/attack/bundles/enterprise-attack/18')->assertStatus(502)->assertJsonPath('error.code', 'disallowed_source');
        $this->getJson('/api/v1/attack/bundles/enterprise-attack/17')->assertStatus(502)->assertJsonPath('error.code', 'disallowed_source');
        Http::assertSentCount(1);
    }

    public function test_cors_allows_configured_origin_only(): void
    {
        Http::fake([self::INDEX_URL => Http::response($this->index())]);
        config(['cors.allowed_origins' => ['http://127.0.0.1:4174', 'http://127.0.0.1:5173']]);

        $this->withHeaders(['Origin' => 'http://127.0.0.1:4174'])->getJson('/api/v1/attack/index')
            ->assertOk()->assertHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4174');
        $this->withHeaders(['Origin' => 'https://attacker.example'])->getJson('/api/v1/attack/index')
            ->assertOk()->assertHeaderMissing('Access-Control-Allow-Origin');
        $this->call('OPTIONS', '/api/v1/attack/index', [], [], [], [
            'HTTP_ORIGIN' => 'http://127.0.0.1:4174',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ])->assertNoContent()->assertHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4174');
    }

    public function test_there_is_no_endpoint_that_accepts_user_layers(): void
    {
        foreach (['/api/v1/attack/index', '/api/v1/attack/bundles/enterprise-attack/20'] as $url) {
            $this->postJson($url, ['name' => 'layer'])->assertStatus(405);
            $this->putJson($url, ['name' => 'layer'])->assertStatus(405);
        }
        $this->postJson('/api/v1/layers', ['name' => 'layer'])->assertNotFound();
        $this->postJson('/api/v1/plans', ['name' => 'plan'])->assertNotFound();
        Http::assertNothingSent();
    }
}
