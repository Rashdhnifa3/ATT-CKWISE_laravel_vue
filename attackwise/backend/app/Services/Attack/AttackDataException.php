<?php

namespace App\Services\Attack;

use RuntimeException;

/** Error with a stable API code, rendered as {"error": {"code", "message"}}. */
final class AttackDataException extends RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status)
    {
        parent::__construct($message);
    }

    public static function unknownDomain(string $domain): self
    {
        return new self('unknown_domain', "Domain '{$domain}' is not in the ATT&CK collection index.", 404);
    }

    public static function unknownVersion(string $domain, string $version): self
    {
        return new self('unknown_version', "Version '{$version}' of '{$domain}' is not in the ATT&CK collection index.", 404);
    }

    public static function invalidParameter(string $message): self
    {
        return new self('invalid_parameter', $message, 422);
    }

    public static function upstream(string $message): self
    {
        return new self('upstream_unavailable', $message, 502);
    }

    public static function invalidUpstream(string $message): self
    {
        return new self('upstream_invalid', $message, 502);
    }

    public static function disallowedSource(string $url): self
    {
        return new self('disallowed_source', "The index references a source outside the allowed hosts: {$url}", 502);
    }
}
