<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_is_public_and_uses_versioned_contract(): void
    {
        $this->getJson('/api/v1/health')->assertOk()
            ->assertExactJson(['data' => ['status' => 'ok']]);
    }

    public function test_unknown_api_route_returns_json(): void
    {
        $this->get('/api/v1/missing')->assertNotFound()
            ->assertHeader('Content-Type', 'application/json');
    }
}
