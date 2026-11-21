// Component tests (Vue Test Utils + jsdom) for PlanningView and helpers, on synthetic STIX data.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { markRaw, nextTick, reactive } from 'vue';
import PlanningView from '../../src/components/PlanningView.vue';
import AwIcon from '../../src/components/AwIcon.vue';
import { ConfigService } from '../../src/domain/config';
import { DataService } from '../../src/domain/data-service';
import { ViewModel } from '../../src/layer/view-model';
import { PlanStorage } from '../../src/planning/plan-storage';
import { workspace } from '../../src/app/workspace';
import { ui } from '../../src/planning/ui';
import { d3fend } from '../../src/planning/d3fend';
import { sanitizeHtml } from '../../src/app/sanitize';
import { matrixSDO, TA0000, T0000, T0000_000, M0000 } from '../../../shared/fixtures/mock-data';
import config from '../../public/assets/config.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mountPlanner() {
    localStorage.clear();
    localStorage.setItem('attackwise-language', 'en');
    ui.init();
    const cfg = new ConfigService();
    cfg.versions = { enabled: true, entries: [{ name: 'v13', version: '13', domains: [{ name: 'Enterprise', identifier: 'enterprise-attack', data: ['x'] }] }] };
    for (const f of (config as any).features) cfg.setFeature_object(f);
    const data = new DataService(cfg);
    data.parseBundles(data.domains[0], [
        {
            objects: [
                { ...M0000, name: 'Network Defense' },
                { type: 'relationship', id: 'r', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: T0000.id },
                { ...matrixSDO, tactic_refs: [TA0000.id] },
                { ...TA0000, name: 'Reconnaissance' },
                { ...T0000, name: 'Active Scanning', external_references: [{ external_id: 'T1595' }] },
                { ...T0000_000, name: 'Scanning IP Blocks', external_references: [{ external_id: 'T1595.001' }] },
                { type: 'relationship', id: 'rs', relationship_type: 'subtechnique-of', source_ref: T0000_000.id, target_ref: T0000.id },
            ],
        },
    ]);
    workspace.data = markRaw(data);
    workspace.storage = markRaw(new PlanStorage());
    const vm = reactive(new ViewModel('Synthetic plan', 'vm', data.domains[0].id, data)) as ViewModel;
    vm.loadVMData();
    d3fend.status = 'ready';
    d3fend.index = markRaw({ note: '', defenses: new Map(), relations: new Map() });
    return { vm, wrapper: mount(PlanningView, { props: { viewModel: vm }, attachTo: document.body }) };
}

describe('PlanningView', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders tactic columns, selects a technique, opens and saves the score drawer', async () => {
        const { vm, wrapper } = mountPlanner();
        expect(wrapper.findAll('.tactic-column')).toHaveLength(1);
        const card = wrapper.find('.technique-card');
        expect(card.attributes('data-risk')).toBe('missing');
        await card.find('.technique-select').trigger('click');
        expect(card.find('.technique-select').attributes('aria-pressed')).toBe('true');
        expect(wrapper.find('.score-drawer').exists()).toBe(true);
        expect((wrapper.find('#scenario-score').element as HTMLInputElement).value).toBe('');
        expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeDefined();
        await wrapper.find('#scenario-score').setValue('0');
        await wrapper.find('form').trigger('submit');
        expect(vm.planningState.attackScores).toEqual({ T1595: 0 });
        expect(wrapper.find('.technique-card').attributes('data-risk')).toBe('low');
        expect(wrapper.find('.score-drawer').exists()).toBe(false);
        expect(JSON.parse(localStorage.getItem('attackwise-plans')!)[0].name).toBe('Synthetic plan');
    });

    it('expands sub-techniques and keeps parent/child selections independent', async () => {
        const { vm, wrapper } = mountPlanner();
        await wrapper.find('.card-options button').trigger('click');
        expect(wrapper.find('.card-options button').attributes('aria-expanded')).toBe('true');
        await wrapper.find('.child-select').trigger('click');
        expect([...vm.selectedTechniques]).toEqual(['T1595.001^' + TA0000.x_mitre_shortname]);
    });

    it('defensive view: parent mapping, custom defense validation, deletion cleans every reference', async () => {
        const { vm, wrapper } = mountPlanner();
        await wrapper.find('.technique-select').trigger('click');
        vm.planningView = 'defensive';
        await nextTick();
        const official = wrapper.find('.mitigation[data-source=attack]');
        expect(official.text()).toContain('MITRE ATT&CK · Direct mapping');
        await official.find('.choose-defense').trigger('click');
        expect(wrapper.find('.attack-list .status').attributes('data-status')).toBe('covered');
        await wrapper.findAll('.details-heading button').at(0)!.trigger('click');
        await wrapper.find('form.custom-editor').trigger('submit');
        expect(wrapper.find('form.custom-editor [role=alert]').text()).toBe('Enter a name and choose at least one attack.');
        await wrapper.find('#custom-name').setValue('Synthetic control');
        await wrapper.find('#custom-score').setValue('11');
        await wrapper.find('form.custom-editor').trigger('submit');
        expect(wrapper.find('form.custom-editor [role=alert]').text()).toBe('Score must be a whole number from 0 to 10.');
        await wrapper.find('#custom-score').setValue('5');
        await wrapper.find('form.custom-editor').trigger('submit');
        const id = vm.planningState.customDefenses[0].id;
        expect(vm.planningState.defenseScores[id]).toBe(5);
        expect(vm.planningState.defenseSelections.T1595[id]).toBe(true);
        const custom = wrapper.find('.mitigation.custom');
        await custom.findAll('.custom-actions button').at(1)!.trigger('click');
        await wrapper.find('.mitigation.custom .custom-actions span button').trigger('click');
        expect(vm.planningState.customDefenses).toEqual([]);
        expect(JSON.stringify(vm.planningState)).not.toContain(id);
    });

    it('final report: formula switch, Not Rated vs zero, signed results', async () => {
        const { vm, wrapper } = mountPlanner();
        await wrapper.find('.technique-select').trigger('click');
        vm.planningState.attackScores.T1595 = 8;
        vm.planningState.defenseScores[M0000.id] = 9;
        vm.planningState.defenseSelections.T1595 = { [M0000.id]: true }; // standaloneDefenses alone does not link a defense to an attack (reference semantics)
        vm.planningView = 'final';
        await nextTick();
        expect(wrapper.find('.formula-result').text()).toBe('-1');
        expect(wrapper.find('.gauge strong').text()).toBe('0');
        delete vm.planningState.defenseScores[M0000.id];
        await nextTick();
        expect(wrapper.find('.formula-result').text()).toBe('Not Rated');
        expect(wrapper.find('.gauge strong').text()).toBe('—');
    });

    it('shows the storage-unavailable message when a save fails', async () => {
        const { wrapper } = mountPlanner();
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        await wrapper.find('.technique-select').trigger('click');
        await flushPromises();
        expect(wrapper.find('.draft-status').text()).toBe('Browser storage unavailable. Download your plan to keep it.');
        spy.mockRestore();
    });
});

describe('AwIcon and sanitizer', () => {
    it('renders an aria-hidden inline SVG inside an <aw-icon> element', () => {
        const w = mount(AwIcon, { props: { name: 'shield' } });
        expect(w.element.tagName.toLowerCase()).toBe('aw-icon');
        expect(w.find('svg').attributes()).toMatchObject({ 'aria-hidden': 'true', 'stroke-width': '1.75', focusable: 'false' });
    });
    it('strips active content from changelog HTML', () => {
        const out = sanitizeHtml('<p onclick="x()">ok</p><script>alert(1)</script><a href="javascript:alert(1)">j</a><a href="https://e.org">e</a><img src=x onerror=alert(1)>');
        expect(out).not.toMatch(/script|onclick|onerror|javascript:/i);
        expect(out).toContain('href="https://e.org"');
        expect(out).toContain('rel="noopener noreferrer"');
    });
});
