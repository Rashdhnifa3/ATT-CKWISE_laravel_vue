// Unit tests for the framework-free Vue domain layer (expected values follow the reference
// implementation; synthetic STIX from shared/fixtures/mock-data.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../src/domain/config';
import { DataService } from '../../src/domain/data-service';
import { ViewModel } from '../../src/layer/view-model';
import { PlanStorage, LEGACY_KEY, PLANS_KEY, UNREADABLE_BACKUP_KEY } from '../../src/planning/plan-storage';
import { Workspace } from '../../src/app/workspace';
import { matrixSDO, TA0000, TA0001, T0000, T0000_000, T0000_002, T0001, M0000 } from '../../../shared/fixtures/mock-data';
import config from '../../public/assets/config.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
const objects = [
    { ...M0000, name: 'Network Defense' },
    { type: 'relationship', id: 'rel-m', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: T0000.id },
    { ...matrixSDO, tactic_refs: [TA0000.id, TA0001.id] },
    TA0000,
    TA0001,
    { ...T0000, external_references: [{ external_id: 'T1595' }], x_mitre_platforms: [' Windows ', 'PRE'] },
    ...[T0000_000, T0000_002].map((c, i) => ({ ...c, external_references: [{ external_id: `T1595.00${i + 1}` }] })),
    { ...T0001, kill_chain_phases: [TA0000, TA0001].map((t) => ({ kill_chain_name: 'mitre-attack', phase_name: t.x_mitre_shortname })) },
    ...[T0000_000, T0000_002].map((c, i) => ({ type: 'relationship', id: `rel-${i}`, relationship_type: 'subtechnique-of', source_ref: c.id, target_ref: T0000.id })),
];

function setup(features: Record<string, boolean> = {}) {
    const cfg = new ConfigService();
    cfg.versions = { enabled: true, entries: [{ name: 'ATT&CK v13', version: '13', domains: [{ name: 'Enterprise', identifier: 'enterprise-attack', data: ['https://example.invalid/e.json'] }] }] };
    for (const f of (config as any).features) cfg.setFeature_object(f);
    for (const [k, v] of Object.entries(features)) cfg.setFeature(k, v);
    const data = new DataService(cfg);
    const domain = data.domains[0];
    data.parseBundles(domain, [{ type: 'bundle', objects }]);
    return { cfg, data, domain };
}

describe('DataService.parseBundles', () => {
    it('builds tactics in matrix order, techniques, sub-techniques, platforms and mitigations', () => {
        const { domain } = setup();
        expect(domain.tactics.map((t) => t.shortname)).toEqual([TA0000.x_mitre_shortname, TA0001.x_mitre_shortname]);
        expect(domain.techniques.map((t) => t.attackID)).toEqual(['T1595', T0001.external_references[0].external_id]);
        expect(domain.subtechniques.map((t) => t.attackID)).toEqual(['T1595.001', 'T1595.002']);
        expect(domain.subtechniques[0].parent?.attackID).toBe('T1595');
        expect(domain.platforms).toContain('Windows');
        expect(domain.mitigations[0].mitigated(domain.id)).toEqual([T0000.id]);
        expect(domain.techniques[1].get_all_technique_tactic_ids()).toHaveLength(2);
    });
    it('honours the subtechniques feature flag (URL fragment #subtechniques=false)', () => {
        const { domain } = setup({ subtechniques: false });
        expect(domain.subtechniques).toEqual([]);
        expect(domain.techniques[0].subtechniques).toEqual([]);
    });
    it('throws on an object without an ATT&CK ID, like the reference', () => {
        const { data } = setup();
        const d2 = data.domains[0];
        expect(() => data.parseBundles(d2, [{ objects: [{ type: 'course-of-action', id: 'course-of-action--x', name: 'bad' }] }])).toThrow(/external_references/);
    });
    it('parseCollectionIndex keeps the first listed entry per major, skips < 4, and routes official bundles through the API', () => {
        const cfg = new ConfigService();
        cfg.collectionIndex = {
            name: 'MITRE ATT&CK',
            collections: [{ name: 'Enterprise ATT&CK', versions: [{ version: '20.1', url: 'u1' }, { version: '20.0', url: 'u0' }, { version: '19.2', url: 'u2' }, { version: '3.0', url: 'old' }] }],
        };
        const data = new DataService(cfg);
        expect(data.versions.map((v) => v.number)).toEqual(['20', '19']);
        // Object.values over integer keys is ascending, as in the reference's identical reduce.
        expect(data.domains.map((d) => [d.id, d.urls[0], d.official])).toEqual([
            ['enterprise-attack-19', '/api/v1/attack/bundles/enterprise-attack/19', true],
            ['enterprise-attack-20', '/api/v1/attack/bundles/enterprise-attack/20', true],
        ]);
        expect(data.latestVersion.number).toBe('20');
    });
    it('getDomainData unwraps API envelopes and reports HTTP errors', async () => {
        const cfg = new ConfigService();
        cfg.collectionIndex = { name: 'MITRE ATT&CK', collections: [{ name: 'Enterprise ATT&CK', versions: [{ version: '20.1', url: 'u' }] }] };
        const fetcher = vi.fn(async (url: RequestInfo | URL) =>
            String(url).endsWith('/20') ? new Response(JSON.stringify({ data: { type: 'bundle', objects: [] } })) : new Response('x', { status: 503 })
        );
        const data = new DataService(cfg, fetcher as typeof fetch);
        expect(await data.getDomainData(data.domains[0])).toEqual([{ type: 'bundle', objects: [] }]);
        data.domains[0].urls = ['/api/v1/attack/bundles/enterprise-attack/99'];
        await expect(data.getDomainData(data.domains[0])).rejects.toThrow('HTTP 503');
    });
});

describe('ViewModel deserialize / serialize', () => {
    let env: ReturnType<typeof setup>;
    beforeEach(() => {
        env = setup();
    });
    const vm = () => new ViewModel('l', 'vm1', env.domain.id, env.data);
    it('expands a tactic-less technique to every tactic, keeps unknown IDs with explicit tactic, drops unknown without', () => {
        const v = vm();
        const shared = env.domain.techniques[1];
        vi.spyOn(console, 'error').mockImplementation(() => {});
        v.deserialize({
            techniques: [
                { techniqueID: shared.attackID, score: 1 },
                { techniqueID: 'T9999', tactic: 'execution', score: 2 },
                { techniqueID: 'T9998', score: 3 },
            ],
        });
        v.loadVMData();
        const out = JSON.parse(v.serialize(false));
        expect(out.techniques.map((t: any) => t.techniqueID + '^' + t.tactic).sort()).toEqual([...shared.get_all_technique_tactic_ids(), 'T9999^execution'].sort());
    });
    it('round-trips attackwise planning state and keeps standard Navigator fields', () => {
        const v = vm();
        v.deserialize({ name: 'n', description: 'd', attackwise: { planId: 'plan-x', view: 'final', selectedTechniques: ['T1595^' + TA0000.x_mitre_shortname, 3], planning: { attackScores: { T1595: 0 }, riskFormula: 'sum' } } });
        v.loadVMData();
        const out = JSON.parse(v.serialize(false));
        expect(out.versions).toEqual({ attack: '13', navigator: '5.3.2', layer: '4.5' });
        expect(out.attackwise.planId).toBe('plan-x');
        expect(out.attackwise.view).toBe('final');
        expect(out.attackwise.selectedTechniques).toEqual(['T1595^' + TA0000.x_mitre_shortname]);
        expect(out.attackwise.planning.attackScores).toEqual({ T1595: 0 });
        expect(out.attackwise.planning.riskFormula).toBe('sum');
        expect(Object.keys(out)).toEqual([
            'name', 'versions', 'domain', 'description', 'filters', 'sorting', 'layout', 'hideDisabled', 'techniques', 'gradient', 'legendItems', 'metadata', 'links',
            'showTacticRowBackground', 'tacticRowBackground', 'selectTechniquesAcrossTactics', 'selectSubtechniquesWithParent', 'selectVisibleTechniques', 'attackwise',
        ]);
    });
    it('deserializeDomainVersionID applies aliases, scalar version precedence and latest-version fallback', () => {
        const v = vm();
        expect(v.deserializeDomainVersionID({ name: 'x', domain: 'mitre-enterprise', version: '3.0', versions: { layer: '4.5' } })).toBe('3.0');
        expect(v.domainVersionID).toBe('enterprise-attack-13');
        expect(v.deserializeDomainVersionID({ name: 'x', domain: 'enterprise-attack', versions: { attack: 'v12.1', layer: '4.4' } })).toBe('4.4');
        expect(v.version).toBe('12');
    });
});

describe('PlanStorage', () => {
    const memory = () => {
        const m = new Map<string, string>();
        return {
            getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
            setItem: (k: string, v: string) => void m.set(k, String(v)),
            removeItem: (k: string) => void m.delete(k),
            clear: () => m.clear(),
            key: () => null,
            get length() {
                return m.size;
            },
            map: m,
        };
    };
    const fakeVm = (planId = '', name = 'P') => ({ planId, name, serialize: () => JSON.stringify({ name, attackwise: { planId } }) });

    it('migrates a legacy draft once and removes the legacy key', () => {
        const s = memory();
        s.setItem(LEGACY_KEY, JSON.stringify({ name: 'Old', attackwise: {} }));
        const st = new PlanStorage(() => s as unknown as Storage);
        expect(st.list().map((p) => p.name)).toEqual(['Old']);
        expect(s.getItem(LEGACY_KEY)).toBeNull();
        expect(JSON.parse(st.list()[0].data).attackwise.planId).toMatch(/^plan-/);
    });
    it('keeps unreadable data in a backup key before the first overwrite', () => {
        const s = memory();
        s.setItem(PLANS_KEY, '{oops');
        const st = new PlanStorage(() => s as unknown as Storage);
        expect(st.list()).toEqual([]);
        expect(st.save(fakeVm('', 'New'))).toBe(true);
        expect(s.getItem(UNREADABLE_BACKUP_KEY)).toBe('{oops');
        expect(JSON.parse(s.getItem(PLANS_KEY)!).map((p: any) => p.name)).toEqual(['New']);
    });
    it('keeps unrecognised entries, replaces by id and sorts by recency', () => {
        const s = memory();
        s.setItem(PLANS_KEY, JSON.stringify([{ future: true }, { id: 'a', name: 'A', updated: 1, data: '{}' }]));
        const st = new PlanStorage(() => s as unknown as Storage);
        st.save(fakeVm('a', 'A2'));
        const raw = JSON.parse(s.getItem(PLANS_KEY)!);
        expect(raw).toHaveLength(2);
        expect(raw.some((p: any) => p.future)).toBe(true);
        expect(st.list().map((p) => p.name)).toEqual(['A2']);
        st.remove('a');
        expect(JSON.parse(s.getItem(PLANS_KEY)!)).toEqual([{ future: true }]);
    });
    it('reports write failures instead of throwing', () => {
        const st = new PlanStorage(() => ({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} }) as unknown as Storage);
        expect(st.save(fakeVm())).toBe(false);
    });
});

describe('Workspace helpers (reference algorithms)', () => {
    it('getNamedFragmentValue: repeated values, percent and plus decoding', () => {
        const w = new Workspace();
        const url = 'http://x/#layerURL=https%3A%2F%2Fa%2Fl1.json&layerURL=https%3A%2F%2Fb%2Fl+2.json&bundleURL=u&version=13&domain=enterprise-attack';
        expect(w.getNamedFragmentValue('layerURL', url)).toEqual(['https://a/l1.json', 'https://b/l 2.json']);
        expect(w.getNamedFragmentValue('version', url)).toEqual(['13']);
        expect(w.getNamedFragmentValue('missing', url)).toEqual([]);
    });
    it('getUniqueLayerName follows the reference numbering', () => {
        const w = new Workspace();
        const names = (list: string[]) => (w.viewModels = list.map((name) => ({ name }) as ViewModel));
        names([]);
        expect(w.getUniqueLayerName('layer')).toBe('layer');
        names(['layer']);
        expect(w.getUniqueLayerName('layer')).toBe('layer1');
        names(['layer', 'layer1', 'layer7', 'layerx']);
        expect(w.getUniqueLayerName('layer')).toBe('layer8');
    });
    it('ConfigService fragment parsing and feature groups', () => {
        const c = new ConfigService();
        for (const f of (config as any).features) c.setFeature_object(f);
        expect(c.getFeatureGroupCount('technique_controls')).toBe(7);
        c.setFeature('technique_controls', false);
        expect(c.getFeatureGroupCount('technique_controls')).toBe(0);
        expect([...c.getAllFragments('http://x/#leave_site_dialog=false&tabs=true&bad=%20').entries()]).toEqual([
            ['leave_site_dialog', 'false'],
            ['tabs', 'true'],
        ]);
        expect(() => c.validateConfig({ collection_index_url: '', versions: {} })).toThrow();
        expect(() => c.validateConfig({ collection_index_url: 5 })).toThrow();
    });
});
