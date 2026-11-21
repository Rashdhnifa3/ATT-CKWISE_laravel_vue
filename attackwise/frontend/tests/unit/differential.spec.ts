// Differential tests: the Angular reference's framework-free modules (imported directly from
// nav-app/src) versus the Vue ports, on identical inputs including edge cases.
import { describe, expect, it } from 'vitest';
import * as refRisk from '../../../../nav-app/src/app/planning/risk-calculation';
import * as refState from '../../../../nav-app/src/app/planning/planning-state';
import * as refD3 from '../../../../nav-app/src/app/planning/d3fend-data';
import { TechniqueVM as RefTVM } from '../../../../nav-app/src/app/classes/technique-vm';
import { Filter as RefFilter } from '../../../../nav-app/src/app/classes/filter';
import { Gradient as RefGradient } from '../../../../nav-app/src/app/classes/gradient';
import { LayoutOptions as RefLayout } from '../../../../nav-app/src/app/classes/layout-options';
import * as risk from '../../src/planning/risk-calculation';
import * as state from '../../src/planning/planning-state';
import * as d3 from '../../src/planning/d3fend-data';
import { Filter, Gradient, LayoutOptions, TechniqueVM } from '../../src/layer/annotations';
import d3fendAsset from '../../public/assets/d3fend/attack-d3fend.json';

const scores: unknown[] = [null, undefined, NaN, -1, 0, 1, 2.5, 3, 4, 6, 7, 10, 11, '3', '', true, {}, Infinity];
const formulas = ['strongest', 'average', 'sum'] as const;

// Reference modules log type errors with console.error; silence for readability.
const quiet = <T>(fn: () => T): T => {
    const e = console.error, w = console.warn, a = (globalThis as { alert?: unknown }).alert;
    console.error = () => {};
    console.warn = () => {};
    (globalThis as { alert?: unknown }).alert = () => {};
    try {
        return fn();
    } finally {
        console.error = e;
        console.warn = w;
        (globalThis as { alert?: unknown }).alert = a;
    }
};

describe('risk formulas (reference vs Vue)', () => {
    it('agree for every combination of attack/defense scores and formula, incl. missing, zero, negative and bounds', () => {
        let compared = 0;
        for (const f of formulas)
            for (const a of scores)
                for (const d1 of scores)
                    for (const defenses of [[], [d1], [d1, 9], [0, d1, 10]]) {
                        expect(risk.calculateRisk(a, defenses, f), `${String(a)} ${JSON.stringify(defenses)} ${f}`).toEqual(refRisk.calculateRisk(a, defenses, f));
                        compared++;
                    }
        expect(compared).toBeGreaterThan(3000);
    });
    it('rounds to two decimals like the reference', () => {
        expect(risk.calculateRisk(10, [1, 2, 2], 'average')).toEqual(refRisk.calculateRisk(10, [1, 2, 2], 'average'));
        expect(risk.calculateRisk(10, [1, 2, 2], 'average').defense).toBe(1.67);
    });
});

describe('planning state (reference vs Vue)', () => {
    it('validScore / scoreStyle agree', () => {
        for (const s of scores) {
            expect(state.validScore(s)).toBe(refState.validScore(s));
            expect(state.scoreStyle(s)).toEqual(refState.scoreStyle(s));
            expect(state.scoreStyle(s, true)).toEqual(refState.scoreStyle(s, true));
        }
    });
    it('restorePlanning sanitises old and malformed input identically', () => {
        const inputs: unknown[] = [
            undefined,
            null,
            {},
            { attackScores: { T1: 0, T2: 11, T3: '5', T4: 7 }, defenseScores: { a: 10, b: -1 } },
            { selectedDefenses: ['a', 1, null, 'b'], standaloneDefenses: 'x', customDefenses: [{ id: 'custom-1', name: 'n', description: 'd', attackIDs: ['T1'] }, { id: 'x', name: 'n', description: '', attackIDs: [] }, { id: 'custom-2', name: 'n', description: 'd', attackIDs: [1] }] },
            { defenseStatus: { a: 'Deployed', b: 'Planned', c: 'Nope' }, ratings: { T1: { a: 'full', b: 'bad' }, T2: null }, defenseSelections: { T1: { a: true, b: 'yes' } } },
            { manualDefenseMappings: { a: ['T1', 2], b: 'T1' }, riskFormula: 'average', finalized: true },
            { riskFormula: 'median' },
        ];
        for (const input of inputs) expect(JSON.parse(JSON.stringify(state.restorePlanning(input)))).toEqual(JSON.parse(JSON.stringify(refState.restorePlanning(input))));
    });
});

describe('D3FEND parsing (reference vs Vue) on the shipped asset', () => {
    it('produces the same index', () => {
        const a = refD3.parseD3fend(d3fendAsset);
        const b = d3.parseD3fend(d3fendAsset);
        expect([...b.defenses.entries()]).toEqual([...a.defenses.entries()]);
        expect([...b.relations.entries()]).toEqual([...a.relations.entries()]);
        expect(b.note).toBe(a.note);
        expect(b.defenses.size).toBe(149);
    });
    it('rejects other formats like the reference', () => {
        expect(() => d3.parseD3fend({ format: 'other' })).toThrow();
        expect(() => refD3.parseD3fend({ format: 'other' })).toThrow();
    });
});

const techniqueReps: Record<string, unknown>[] = [
    { techniqueID: 'T1566', tactic: 'initial-access', score: 0, color: '#fc3b3b', comment: 'zero\nسطر', enabled: true, metadata: [{ name: 'a', value: 'b' }, { divider: true }, { name: '', value: 'x' }], links: [{ label: 'l', url: 'https://example.org' }, { divider: true }, { url: 'https://no-label' }], showSubtechniques: true },
    { techniqueID: 'T1', tactic: 't', score: -3.5, enabled: false },
    { techniqueID: 'T2', tactic: 't', score: '5', color: 'not-a-color', enabled: 'no', comment: 7, showSubtechniques: 1 },
    { techniqueID: 'T3', tactic: 't', color: '', metadata: [], links: [] },
];

describe('layer annotation classes (reference vs Vue)', () => {
    it('TechniqueVM deserialize → serialize / modified / annotated agree', () => {
        for (const rep of techniqueReps) {
            const ref = new RefTVM('');
            const vue = new TechniqueVM('');
            quiet(() => ref.deserialize(JSON.stringify(rep), rep.techniqueID as string, rep.tactic as string));
            quiet(() => vue.deserialize(JSON.stringify(rep), rep.techniqueID as string, rep.tactic as string));
            expect(vue.serialize()).toBe(ref.serialize());
            expect(vue.modified()).toBe(ref.modified());
            expect(vue.annotated()).toBe(ref.annotated());
            expect(vue.technique_tactic_union_id).toBe(ref.technique_tactic_union_id);
        }
    });
    it('Filter maps historical platform names identically', () => {
        for (const rep of [{ platforms: ['windows', 'mac', 'linux', 'AWS', 'GCP', 'Azure', 'android', 'ios', 'Custom'] }, { platforms: [1, 'x'] }, {}, { stages: ['act'] }]) {
            const ref = new RefFilter();
            const vue = new Filter();
            quiet(() => ref.deserialize(rep));
            quiet(() => vue.deserialize(rep));
            expect(vue.serialize()).toBe(ref.serialize());
        }
    });
    it('Gradient colours, serialisation and score → colour lookup agree', () => {
        const reps = [
            { colors: ['#ff6666ff', '#ffe766ff', '#8ec843ff'], minValue: -10, maxValue: 10 },
            { colors: ['#ffffff00', '#66b1ff'], minValue: 0, maxValue: 100 },
            { colors: ['red', 'not-a-color'], minValue: 0, maxValue: 1 },
            { colors: ['#000', '#fff'] },
        ];
        for (const rep of reps) {
            const ref = new RefGradient();
            const vue = new Gradient();
            quiet(() => ref.deserialize(JSON.stringify(rep)));
            quiet(() => vue.deserialize(JSON.stringify(rep)));
            expect(vue.serialize()).toBe(ref.serialize());
            // Outcome includes exceptions: the reference throws for NaN input / missing bounds, and so must the port.
            const outcome = (fn: () => unknown) => {
                try {
                    return { value: fn() };
                } catch (e) {
                    return { threw: (e as Error).constructor.name };
                }
            };
            for (const v of ['', '-20', '-10', '-3.5', '0', '0.5', '1', '3', '50', '99.4', '99.6', '100', '1000', 'x'])
                expect(outcome(() => vue.getHexColor(v)), JSON.stringify(rep) + ' ' + v).toEqual(outcome(() => ref.getHexColor(v)));
        }
        for (const preset of Object.keys(new RefGradient().presets)) {
            const ref = new RefGradient();
            const vue = new Gradient();
            ref.setGradientPreset(preset);
            vue.setGradientPreset(preset);
            expect(vue.serialize()).toBe(ref.serialize());
        }
    });
    it('LayoutOptions transitions and legacy values agree', () => {
        const reps = [
            { layout: 'mini' },
            { layout: 'mini', showName: true },
            { showID: true, layout: 'flat', aggregateFunction: 'sum', countUnscored: true },
            { aggregateFunction: 'average', countUnscored: true, expandedSubtechniques: 'all' },
            { layout: 'diagonal', aggregateFunction: 'median', expandedSubtechniques: 'some', showID: 'yes' },
        ];
        for (const rep of reps) {
            const ref = new RefLayout();
            const vue = new LayoutOptions();
            quiet(() => ref.deserialize(rep));
            quiet(() => vue.deserialize(rep));
            expect(vue.serialize()).toEqual(ref.serialize());
        }
    });
});
