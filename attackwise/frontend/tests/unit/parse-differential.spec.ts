// Differential test of STIX parsing (CURRENT_PARITY D05–D16): the reference DataService
// (nav-app/src/app/services/data.service.ts, constructed with stub HttpClient/ConfigService) and the Vue
// DataService parse the same bundles; every parsed collection, relationship map and the shared
// per-object queries must be identical. Synthetic multi-bundle data always runs; the real Enterprise
// release runs too when the Laravel API cache holds it (ATTACKWISE_CACHE_DIR or the backend default).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// The reference module graph pulls in @angular/common/http (partially compiled → needs the JIT compiler).
import '../../../../nav-app/node_modules/@angular/compiler/fesm2022/compiler.mjs';
import { DataService as RefDataService } from '../../../../nav-app/src/app/services/data.service';
import { DataService } from '../../src/domain/data-service';
import { ConfigService } from '../../src/domain/config';
import config from '../../public/assets/config.json';
import { matrixSDO, TA0000, TA0001, T0000, T0000_000, T0000_002, T0001, M0000 } from '../../../shared/fixtures/mock-data';

/* eslint-disable @typescript-eslint/no-explicit-any */
const VERSIONS = (n: string) => ({ enabled: true, entries: [{ name: 'v' + n, version: n, domains: [{ name: 'Enterprise', identifier: 'enterprise-attack', data: ['a.json', 'b.json'] }] }] });

function services(version: string) {
    const cfg = new ConfigService();
    cfg.versions = VERSIONS(version) as any;
    for (const f of (config as any).features) cfg.setFeature_object(f);
    const refCfg: any = { versions: VERSIONS(version), collectionIndex: undefined, subtechniquesEnabled: true, getFeature: () => true };
    const quiet = console.debug;
    console.debug = () => {};
    try {
        return { ref: new RefDataService({} as any, refCfg), vue: new DataService(cfg) };
    } finally {
        console.debug = quiet;
    }
}

const SKIP = new Set(['dataService', 'lookup', 'configService', 'dataLoadedCallbacks']);
/** Cycle-free, order-preserving snapshot: nested STIX objects become their ids; Maps/Sets become sorted entries. */
function snap(v: any, depth = 0): any {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Map) return [...v.entries()].map(([k, x]) => [k, snap(x, depth + 1)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (v instanceof Set) return [...v].map((x) => snap(x, depth + 1)).sort();
    if (Array.isArray(v)) return v.map((x) => snap(x, depth + 1));
    if (depth > 0 && typeof v.id === 'string' && v.constructor !== Object) return { ref: v.id };
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) if (!SKIP.has(k) && typeof v[k] !== 'function') out[k] = k === 'parent' ? v[k]?.id : snap(v[k], depth + 1);
    return out;
}

function compare(bundles: any[], version: string) {
    const { ref, vue } = services(version);
    const rd = ref.domains[0], vd = vue.domains[0];
    ref.parseBundles(rd, JSON.parse(JSON.stringify(bundles)));
    vue.parseBundles(vd, JSON.parse(JSON.stringify(bundles)));
    const collections = ['matrices', 'techniques', 'subtechniques', 'software', 'campaigns', 'assets', 'dataComponents', 'groups', 'mitigations', 'detectionStrategies', 'notes'] as const;
    const counts: Record<string, number> = {};
    for (const c of collections) {
        counts[c] = (rd as any)[c].length;
        expect((vd as any)[c].map((o: any) => snap(o)), c).toEqual((rd as any)[c].map((o: any) => snap(o)));
    }
    // Guard against a vacuous comparison: snapshots carry the real fields.
    expect(Object.keys(snap(rd.techniques[0]))).toEqual(expect.arrayContaining(['id', 'attackID', 'name', 'description', 'url', 'platforms', 'subtechniques', 'datasources']));
    expect(rd.techniques.filter((t: any) => t.tactics?.length).length).toBeGreaterThan(0);
    expect(snap(vd.tactics), 'tactics').toEqual(snap(rd.tactics));
    expect(vd.platforms, 'platforms').toEqual(rd.platforms);
    expect(snap(vd.dataSources), 'dataSources').toEqual(snap(rd.dataSources));
    expect(snap(vd.dataComponentsToTechniques), 'dataComponentsToTechniques').toEqual(snap(rd.dataComponentsToTechniques));
    for (const k of Object.keys(rd.relationships)) expect(snap((vd.relationships as any)[k]), 'relationships.' + k).toEqual(snap(rd.relationships[k]));
    expect(Object.keys(vd.relationships).sort()).toEqual(Object.keys(rd.relationships).sort());
    expect(vd.dataLoaded).toBe(rd.dataLoaded);
    // Shared per-object queries.
    for (const [i, t] of [...rd.techniques, ...rd.subtechniques].entries()) {
        const vt = [...vd.techniques, ...vd.subtechniques][i];
        expect(vt.get_all_technique_tactic_ids()).toEqual(t.get_all_technique_tactic_ids());
        expect(vt.revoked_by(vd.id)).toEqual(t.revoked_by(rd.id));
    }
    for (const [i, m] of rd.mitigations.entries()) expect(vd.mitigations[i].mitigated(vd.id)).toEqual(m.mitigated(rd.id));
    // DataComponent.techniques()/source(), Group/Software/Campaign/Asset.used()/relatedTechniques() exist only in the
    // reference: their only callers are the classic search/multiselect (unreachable, CURRENT_PARITY U1). The data they
    // read (relationships, dataComponentsToTechniques, dataSources) is compared above.
    counts.tactics = rd.tactics.length;
    counts.relationshipMaps = Object.keys(rd.relationships).length;
    return counts;
}

describe('STIX parsing: reference DataService vs Vue DataService', () => {
    it('two synthetic bundles merged (D06), sub-techniques, shared technique, revoked/deprecated, mitigations', () => {
        const a = [
            { ...matrixSDO, tactic_refs: [TA0000.id, TA0001.id] },
            { ...TA0000, name: 'Reconnaissance' },
            { ...TA0001, name: 'Resource Development' },
            { ...T0000, name: 'Active Scanning', external_references: [{ external_id: 'T1595', url: 'https://attack.mitre.org/techniques/T1595' }], x_mitre_platforms: ['PRE', 'Windows'] },
            { ...T0000_000, name: 'Scanning IP Blocks', external_references: [{ external_id: 'T1595.001' }] },
            { type: 'relationship', id: 'rs1', relationship_type: 'subtechnique-of', source_ref: T0000_000.id, target_ref: T0000.id },
        ];
        const b = [
            { ...T0000_002, name: 'Deprecated child', x_mitre_deprecated: true, external_references: [{ external_id: 'T1595.002' }] },
            { type: 'relationship', id: 'rs2', relationship_type: 'subtechnique-of', source_ref: T0000_002.id, target_ref: T0000.id },
            { ...T0001, name: 'Shared technique', kill_chain_phases: [TA0000, TA0001].map((t) => ({ kill_chain_name: 'mitre-attack', phase_name: t.x_mitre_shortname })), x_mitre_platforms: ['Linux'] },
            { ...M0000, name: 'Network Defense' },
            { type: 'relationship', id: 'rm', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: T0000.id },
            { type: 'relationship', id: 'rr', relationship_type: 'revoked-by', source_ref: T0001.id, target_ref: T0000.id },
        ];
        const counts = compare([{ type: 'bundle', objects: a }, { type: 'bundle', objects: b }], '13');
        expect(counts.techniques).toBeGreaterThan(0);
    });

    const cacheDir = process.env.ATTACKWISE_CACHE_DIR || resolve(__dirname, '../../../backend/storage/app/attack-cache');
    const dir = resolve(cacheDir, 'bundles/enterprise-attack');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
    it.skipIf(!files.length)(`real Enterprise release from the API cache (${files.at(-1) ?? 'not cached: skipped'})`, () => {
        const file = files.at(-1)!;
        const bundle = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
        const counts = compare([bundle], file.split('.')[0]);
        console.info('real-data parse counts', file, JSON.stringify(counts));
        expect(counts.techniques).toBeGreaterThan(100);
        expect(counts.groups).toBeGreaterThan(50);
    }, 120000);
});
