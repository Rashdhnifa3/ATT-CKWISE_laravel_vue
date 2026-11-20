// Port of the logic in nav-app/src/app/planning/planning.component.ts (ATT&CKWISE reference).
// Method names and semantics are preserved. Getters that the Angular template re-evaluated on
// every change-detection cycle are Vue computeds here (same results, cached).
// Unreachable reference methods (no template caller): rate, toggleDefense, finalize, exportPNG,
// copyBrief, filteredDefenses/visibleDefenses, coverage, label, gap — not ported (CURRENT_PARITY.md PL-90).

import { computed, nextTick, reactive, watch, type Ref } from 'vue';
import type { Technique, Tactic, Mitigation } from '../domain/stix';
import type { ViewModel, PlanningView } from '../layer/view-model';
import { calculateRisk } from './risk-calculation';
import { validScore, scoreStyle, type PlanningState } from './planning-state';
import { isD3fendId, type D3fendEvidence } from './d3fend-data';
import { d3fend } from './d3fend';
import { ui } from './ui';
import { workspace } from '../app/workspace';

export type DefenseSource = 'attack' | 'd3fend' | 'custom';
export interface Mapping {
    attack: Technique;
    source: string;
    mappingType?: string;
    evidence?: D3fendEvidence[];
}
export interface Defense {
    id: string;
    name: string;
    description: string;
    attackID: string;
    source: DefenseSource;
    d3fendTactic?: string;
    mappings: Mapping[];
}

export function usePlanning(viewModel: Ref<ViewModel>, focus: (selector: string) => void) {
    const local = reactive({
        columnLimits: {} as Record<string, number>,
        tacticFilter: '',
        chartHover: null as number | null,
        tactic: '',
        search: '',
        page: 0,
        expanded: new Set<string>(),
        colorBlind: false,
        storageMessage: '',
        exportMessage: '',
        editor: null as { id: string; name: string; defense: boolean } | null,
        draft: null as number | null,
        customName: '',
        customDescription: '',
        customAttacks: [] as string[],
        customScore: null as number | null | string,
        customEditing: '',
        showCustom: false,
        customError: '',
        deleteCandidate: '',
        researchAttack: '',
        defenseFilter: 'All',
        defenseSearch: '',
        defensePage: 0,
    });

    d3fend.load();
    try {
        local.colorBlind = localStorage.getItem('attackwise-color-blind') === 'true';
    } catch {
        /* Session setting remains usable. */
    }

    const vm = () => viewModel.value;
    const state = (): PlanningState => viewModel.value.planningState;
    const domain = computed(() => {
        void workspace.dataRevision;
        return workspace.data.getDomain(vm().domainVersionID);
    });
    const tactics = computed<Tactic[]>(() => domain.value?.tactics || []);
    const currentTactic = computed(() => local.tactic || tactics.value[0]?.shortname);
    const catalog = computed<Technique[]>(() => {
        const d = domain.value;
        if (!d) return [];
        return Array.from(new Map([...d.techniques, ...d.subtechniques].map((t) => [t.id, t] as const)).values()).filter((t) => !t.revoked && !t.deprecated);
    });
    const selected = (t: Technique) => t.get_all_technique_tactic_ids().some((id) => vm().selectedTechniques.has(id));
    const attacks = computed(() => catalog.value.filter((t) => selected(t)));

    // ---- attack matrix ---------------------------------------------------------------------
    const columnTechniques = (shortname: string) => {
        const q = ui.search.trim().toLowerCase();
        return catalog.value.filter(
            (t) => !t.parent && t.tactics.includes(shortname) && (!q || [t, ...t.subtechniques].some((x) => (x.attackID + ' ' + x.name + ' ' + ui.name(x)).toLowerCase().includes(q)))
        );
    };
    const columnVisible = (shortname: string) => columnTechniques(shortname).slice(0, local.columnLimits[shortname] || 20);
    const scrollTactic = (id: string) => (local.tacticFilter = id);
    const displayedTactics = computed(() => (local.tacticFilter ? tactics.value.filter((t) => t.shortname === local.tacticFilter) : tactics.value));
    const scoreLevel = (t: Technique) => (selected(t) ? scoreStyle(state().attackScores[t.attackID]).level : 'missing');
    const selectedInTactic = (shortname: string) => attacks.value.filter((t) => t.tactics.includes(shortname)).length;
    const tacticCount = (shortname: string) => catalog.value.filter((t) => !t.parent && t.tactics.includes(shortname)).length;

    // ---- defenses ----------------------------------------------------------------------------
    const userDefined = 'User-defined mapping · Not an official ATT&CK relationship';
    const d3fendDefenses = (selectedAttacks: Technique[]): Defense[] => {
        const byId = new Map<string, Defense>();
        const entry = (id: string) => {
            let d = byId.get(id);
            if (!d) {
                const info = d3fend.index?.defenses.get(id);
                d = { id, name: info?.name || id.slice(4), description: info?.description || '', attackID: id, source: 'd3fend', d3fendTactic: info?.tactic || '', mappings: [] };
                byId.set(id, d);
            }
            return d;
        };
        for (const id of d3fend.index?.defenses.keys() || []) entry(id);
        for (const attack of selectedAttacks)
            for (const rel of d3fend.relationsFor(attack.attackID))
                entry(rel.defense.id).mappings.push({ attack, source: 'MITRE D3FEND · ' + (rel.type || 'Mapping type not specified'), mappingType: rel.type, evidence: rel.evidence });
        const s = state();
        const referenced = [
            ...s.selectedDefenses,
            ...s.standaloneDefenses,
            ...Object.keys(s.defenseScores),
            ...Object.keys(s.manualDefenseMappings),
            ...Object.values(s.defenseSelections).flatMap(Object.keys),
            ...Object.values(s.ratings).flatMap(Object.keys),
        ];
        for (const id of referenced) if (isD3fendId(id)) entry(id);
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    };
    const defenses = computed<Defense[]>(() => {
        const selectedAttacks = attacks.value;
        const s = state();
        const official: Defense[] = ((domain.value?.mitigations || []) as Mitigation[])
            .filter((m) => !m.revoked && !m.deprecated)
            .map((m) => {
                const related = m.mitigated(vm().domainVersionID);
                return {
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    attackID: m.attackID,
                    source: 'attack' as DefenseSource,
                    mappings: selectedAttacks.flatMap((attack) => {
                        const mappings: Mapping[] = [];
                        if (related.includes(attack.id)) mappings.push({ attack, source: 'MITRE ATT&CK · Direct mapping' });
                        if (attack.parent && related.includes(attack.parent.id)) mappings.push({ attack, source: `MITRE ATT&CK · Parent mapping (${attack.parent.attackID})` });
                        return mappings;
                    }),
                };
            });
        const custom: Defense[] = s.customDefenses.map((m) => ({
            ...m,
            attackID: 'Custom',
            source: 'custom' as DefenseSource,
            mappings: selectedAttacks.filter((a) => m.attackIDs.includes(a.attackID)).map((attack) => ({ attack, source: userDefined })),
        }));
        return [...official, ...d3fendDefenses(selectedAttacks), ...custom].map((m) => ({
            ...m,
            mappings: [
                ...m.mappings,
                ...selectedAttacks
                    .filter((t) => (s.manualDefenseMappings[m.id] || []).includes(t.attackID) && !m.mappings.some((r) => r.attack.id === t.id))
                    .map((attack) => ({ attack, source: userDefined })),
            ],
        }));
    });
    const mappedDefenses = (t: Technique) => defenses.value.filter((m) => m.mappings.some((r) => r.attack.id === t.id));
    const isDefenseChosen = (t: Technique, m: Defense) => {
        const explicit = state().defenseSelections[t.attackID]?.[m.id];
        if (typeof explicit === 'boolean') return explicit;
        const rating = state().ratings[t.attackID]?.[m.id];
        return rating ? rating !== 'none' : state().selectedDefenses.includes(m.id);
    };
    const selectedMappedDefenses = (t: Technique) => mappedDefenses(t).filter((m) => isDefenseChosen(t, m));
    const defenseContext = computed(() => (local.researchAttack ? attacks.value.find((t) => t.attackID === local.researchAttack) : null));
    const defenseTargets = (m: Defense) =>
        m.mappings.map((r) => r.attack).filter((t, i, list) => list.findIndex((x) => x.id === t.id) === i && (!local.researchAttack || t.attackID === local.researchAttack));
    const chosenForContext = (m: Defense) => {
        const targets = defenseTargets(m);
        if (local.researchAttack) return targets.some((t) => isDefenseChosen(t, m));
        return state().standaloneDefenses.includes(m.id) || targets.some((t) => isDefenseChosen(t, m));
    };
    const chooseDefense = (m: Defense) => {
        const isSelected = !chosenForContext(m);
        const s = state();
        for (const t of defenseTargets(m)) s.defenseSelections[t.attackID] = { ...s.defenseSelections[t.attackID], [m.id]: isSelected };
        if (!local.researchAttack) {
            s.standaloneDefenses = s.standaloneDefenses.filter((id) => id !== m.id);
            if (isSelected) s.standaloneDefenses.push(m.id);
        }
        if (isSelected) edit(m.id, m.name, true);
        else if (local.editor?.id === m.id) local.editor = null;
        changed();
    };
    const editingDefense = computed(() => (local.editor?.defense ? defenses.value.find((m) => m.id === local.editor!.id) || null : null));
    const hasManualMapping = (m: Defense, t: Technique) => (state().manualDefenseMappings[m.id] || []).includes(t.attackID);
    const officialMapping = (m: Defense, t: Technique) => m.mappings.some((r) => r.attack.id === t.id && !r.source.startsWith('User-defined'));
    const linkDefense = (m: Defense, t: Technique, checked: boolean) => {
        const s = state();
        const targets = (s.manualDefenseMappings[m.id] || []).filter((id) => id !== t.attackID);
        if (checked) targets.push(t.attackID);
        s.manualDefenseMappings[m.id] = targets;
        s.defenseSelections[t.attackID] = { ...s.defenseSelections[t.attackID], [m.id]: checked };
        changed();
    };
    const sourceLabel = (m: Defense) => (m.source === 'd3fend' ? 'MITRE D3FEND' : m.source === 'custom' ? ui.tr('Custom', 'مخصص') : 'MITRE ATT&CK');
    const defenseCatalog = computed(() => {
        const q = local.defenseSearch.trim().toLowerCase();
        const f = local.defenseFilter;
        return defenses.value.filter(
            (m) =>
                (!local.researchAttack || m.mappings.some((r) => r.attack.attackID === local.researchAttack)) &&
                (!q || (m.attackID + ' ' + m.name + ' ' + ui.name(m) + ' ' + sourceLabel(m) + ' ' + (m.d3fendTactic || '')).toLowerCase().includes(q)) &&
                (f === 'All' ||
                    (f === 'Selected' && chosenForContext(m)) ||
                    (f === 'Official' && m.source === 'attack') ||
                    (f === 'D3FEND' && m.source === 'd3fend') ||
                    (f === 'Custom' && m.source === 'custom'))
        );
    });
    const evidenceText = (e: D3fendEvidence) =>
        [ui.tr('Defense ', 'الدفاع ') + (e.defenseRelation || '—'), ui.tr('attack ', 'الهجوم ') + (e.offensiveRelation || '—'), e.artifact || ui.tr('artifact not specified', 'الأداة غير محددة')].join(' · ');
    const d3fendNote = computed(() => {
        if (local.defenseFilter !== 'All' && local.defenseFilter !== 'D3FEND') return '';
        if (d3fend.status === 'error') return ui.tr('D3FEND reference data could not be loaded.', 'تعذر تحميل بيانات D3FEND المرجعية.');
        if (d3fend.status !== 'ready') return ui.tr('Loading D3FEND reference data…', 'جارٍ تحميل بيانات D3FEND المرجعية…');
        if (!local.researchAttack || d3fend.relationsFor(local.researchAttack).length) return '';
        return (
            ui.tr('No D3FEND mapping for ', 'لا توجد علاقة D3FEND للتقنية ') +
            local.researchAttack +
            ui.tr(' in the imported data. This does not mean no effective defense exists.', ' في البيانات المستوردة. هذا لا يعني عدم وجود دفاع فعّال.')
        );
    });
    const tacticNames = (t: Technique) =>
        t.tactics
            .map((name) => {
                const tactic = tactics.value.find((x) => x.shortname === name);
                return tactic ? ui.name(tactic) : name;
            })
            .join(' · ');
    const activeAttack = computed(() => attacks.value.find((t) => t.attackID === local.researchAttack) || attacks.value[0]);
    const statusOf = (t: Technique) => (mappedDefenses(t).some((m) => isDefenseChosen(t, m)) ? 'covered' : 'gap');
    const statusText = (status: string) => (status === 'covered' ? ui.tr('Defense selected', 'دفاع مختار') : ui.tr('Gap — no defense selected', 'ثغرة — لا يوجد دفاع مختار'));
    const countStatus = (status: string) => attacks.value.filter((t) => statusOf(t) === status).length;
    const coveragePercent = (items: Technique[] = attacks.value) =>
        items.length ? Math.round((items.reduce((sum, t) => sum + (statusOf(t) === 'covered' ? 1 : 0), 0) / items.length) * 100) : 0;
    const reportTactics = () =>
        tactics.value
            .map((t) => {
                const items = attacks.value.filter((x) => x.tactics.includes(t.shortname));
                return {
                    name: ui.name(t),
                    total: items.length,
                    pct: coveragePercent(items),
                    covered: items.filter((x) => statusOf(x) === 'covered').length,
                    partial: 0,
                    gaps: items.filter((x) => statusOf(x) === 'gap').length,
                };
            })
            .filter((t) => t.total);
    const posture = () =>
        coveragePercent() > 75
            ? ui.tr('High selection coverage', 'تغطية اختيار مرتفعة')
            : coveragePercent() >= 40
              ? ui.tr('Moderate selection coverage', 'تغطية اختيار متوسطة')
              : ui.tr('Defense gaps', 'فجوات دفاعية');
    const defenseScoreText = (value: unknown) =>
        validScore(value)
            ? value + '/10 · ' + (value <= 3 ? ui.tr('Weak Defense', 'دفاع ضعيف') : value <= 6 ? ui.tr('Moderate Defense', 'دفاع متوسط') : ui.tr('Strong Defense', 'دفاع قوي'))
            : ui.tr('Not Rated', 'غير مقيّم');
    const defenseLevel = (m: Defense) => (chosenForContext(m) ? scoreStyle(state().defenseScores[m.id], true).level : 'missing');
    const scoreText = (value: unknown) =>
        validScore(value)
            ? value + '/10 · ' + (value <= 3 ? ui.tr('Low Attack Risk', 'خطورة منخفضة') : value <= 6 ? ui.tr('Medium Attack Risk', 'خطورة متوسطة') : ui.tr('High Attack Risk', 'خطورة عالية'))
            : ui.tr('Not Rated', 'غير مقيّم');
    const clearScore = () => {
        if (local.editor) {
            delete (local.editor.defense ? state().defenseScores : state().attackScores)[local.editor.id];
            local.draft = null;
            changed();
        }
    };

    // ---- report ------------------------------------------------------------------------------
    const calculation = (t: Technique) =>
        calculateRisk(
            state().attackScores[t.attackID],
            selectedMappedDefenses(t).map((m) => state().defenseScores[m.id]),
            state().riskFormula
        );
    const residual = (t: Technique): number | null => calculation(t).risk;
    const formulaText = computed(() => (state().riskFormula === 'sum' ? 'A − sum(D)' : state().riskFormula === 'average' ? 'A − mean(D)' : 'A − max(D)'));
    const scoredTactics = computed(() =>
        tactics.value
            .map((t) => {
                const items = attacks.value.filter((x) => x.tactics.includes(t.shortname));
                const values = items.map((x) => calculation(x).result);
                const incomplete = values.filter((x) => x === null).length;
                return {
                    name: ui.name(t),
                    total: items.length,
                    incomplete,
                    result: incomplete || !items.length ? null : Math.round(((values as number[]).reduce((a, b) => a + b, 0) / items.length) * 100) / 100,
                };
            })
            .filter((t) => t.total)
    );
    const chartMinimum = computed(() => Math.min(-10, ...scoredTactics.value.filter((t) => t.result !== null).map((t) => Math.floor((t.result as number) / 5) * 5)));
    const chartPosition = (value: number) => ((value - chartMinimum.value) / (10 - chartMinimum.value)) * 100;
    const chartWidth = (value: number) => (Math.abs(value) / (10 - chartMinimum.value)) * 100;
    const chartTicks = computed(() => Array.from({ length: 5 }, (_, i) => Math.round((chartMinimum.value + ((10 - chartMinimum.value) * i) / 4) * 100) / 100));
    const resultTone = (value: number | null) => (value === null ? 'var(--muted-foreground)' : value <= 3 ? 'var(--success)' : value <= 6 ? 'var(--warning)' : 'var(--danger)');
    const resultLabel = (t: Technique) => {
        const value = calculation(t).result;
        return value === null
            ? ui.tr('Not Rated', 'غير مقيّم')
            : value <= 0
              ? ui.tr('Defense score meets attack', 'سكور الدفاع يغطي الهجوم')
              : value <= 3
                ? ui.tr('Low remaining risk', 'خطر متبقٍ منخفض')
                : value <= 6
                  ? ui.tr('Medium remaining risk', 'خطر متبقٍ متوسط')
                  : ui.tr('High remaining risk', 'خطر متبقٍ مرتفع');
    };
    const unscoredAttacks = computed(() => attacks.value.filter((t) => calculation(t).result === null).length);
    const fullyMitigated = computed(() => attacks.value.filter((t) => residual(t) === 0).length);
    const criticalGaps = computed(() => attacks.value.filter((t) => (residual(t) ?? -1) >= 7).length);
    const riskIndex = computed(() =>
        !attacks.value.length || attacks.value.some((t) => residual(t) === null)
            ? null
            : Math.round((attacks.value.reduce((sum, t) => sum + (residual(t) as number), 0) / attacks.value.length) * 10)
    );

    const exportWord = async () => {
        try {
            const { exportDocx } = await import('./reference-report');
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = Math.max(260, scoredTactics.value.length * 54 + 60);
            const ctx = canvas.getContext('2d');
            let chart: { data: Uint8Array; width: number; height: number } | undefined;
            if (ctx) {
                ctx.fillStyle = '#121726';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = '14px sans-serif';
                const zero = 350 + chartPosition(0) * 7.5;
                ctx.strokeStyle = '#64748b';
                ctx.beginPath();
                ctx.moveTo(zero, 10);
                ctx.lineTo(zero, canvas.height - 10);
                ctx.stroke();
                scoredTactics.value.forEach((t, i) => {
                    const y = 30 + i * 54;
                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillText(t.name, 20, y + 18);
                    if (t.result !== null) {
                        ctx.fillStyle = t.result <= 3 ? '#10b981' : t.result <= 6 ? '#f59e0b' : '#f43f5e';
                        ctx.fillRect(350 + chartPosition(Math.min(0, t.result)) * 7.5, y, Math.max(2, chartWidth(t.result) * 7.5), 24);
                    }
                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillText(t.result === null ? 'Not Rated' : String(t.result), 1120, y + 18);
                });
                const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
                if (blob) chart = { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
            }
            await exportDocx({
                formula: formulaText.value,
                riskIndex: riskIndex.value,
                chart,
                lang: ui.lang,
                version: String(domain.value?.version?.number || ''),
                coverage: coveragePercent(),
                posture: posture(),
                total: attacks.value.length,
                covered: countStatus('covered'),
                partial: countStatus('partial'),
                gaps: countStatus('gap'),
                tactics: reportTactics(),
                rows: attacks.value.map((t) => ({
                    id: t.attackID,
                    name:
                        ui.name(t) +
                        ' — A: ' +
                        scoreText(state().attackScores[t.attackID]) +
                        ' | D: ' +
                        (calculation(t).defense ?? ui.tr('Not Rated', 'غير مقيّم')) +
                        ' | ' +
                        formulaText.value +
                        ' = ' +
                        (calculation(t).result ?? ui.tr('Not Rated', 'غير مقيّم')),
                    tactic: tacticNames(t),
                    status: resultLabel(t),
                    defenses: mappedDefenses(t)
                        .filter((m) => isDefenseChosen(t, m))
                        .map((m) => m.attackID + ' ' + ui.name(m) + ' — ' + defenseScoreText(state().defenseScores[m.id]))
                        .join('; '),
                })),
                recommendations: attacks.value.filter((t) => statusOf(t) !== 'covered').map((t) => ui.tr('Review defenses for ', 'مراجعة الدفاعات للتقنية ') + t.attackID + ' ' + ui.name(t)),
            });
            local.exportMessage = ui.tr('Report downloaded', 'تم تنزيل التقرير');
        } catch (e) {
            console.error(e);
            local.exportMessage = ui.tr('Export failed. Please try again.', 'فشل التصدير. حاول مرة أخرى.');
        }
    };

    // ---- persistence & editing ---------------------------------------------------------------
    const autosave = () => {
        local.storageMessage = workspace.storage.save(vm())
            ? ui.tr('Autosaved in this browser', 'تم الحفظ تلقائياً في المتصفح')
            : ui.tr('Browser storage unavailable. Download your plan to keep it.', 'التخزين غير متاح. نزّل الخطة لحفظها.');
    };
    const filteredDefenseCount = () => {
        // Reference `filteredDefenses` (only used to clamp defensePage).
        const q = local.defenseSearch.toLowerCase().trim();
        const s = state();
        const f = local.defenseFilter;
        return defenses.value.filter(
            (m) =>
                (!local.researchAttack || m.mappings.some((r) => r.attack.attackID === local.researchAttack)) &&
                (!q || (m.name + ' ' + m.attackID).toLowerCase().includes(q)) &&
                (f === 'All' ||
                    (f === 'Selected' && s.selectedDefenses.includes(m.id)) ||
                    (f === 'Not Selected' && !s.selectedDefenses.includes(m.id)) ||
                    (f === 'Official' && m.source === 'attack') ||
                    (f === 'D3FEND' && m.source === 'd3fend') ||
                    (f === 'Custom' && m.source === 'custom'))
        ).length;
    };
    const changed = () => {
        if (local.researchAttack && !attacks.value.some((t) => t.attackID === local.researchAttack)) local.researchAttack = '';
        local.defensePage = Math.min(local.defensePage, Math.max(0, Math.ceil(filteredDefenseCount() / 8) - 1));
        state().finalized = false;
        autosave();
        local.exportMessage = '';
    };
    const preference = () => {
        try {
            localStorage.setItem('attackwise-color-blind', String(local.colorBlind));
        } catch {
            local.storageMessage = 'Preference applies this session; browser storage is unavailable.';
        }
    };
    const switchView = (view: PlanningView) => {
        vm().planningView = view;
        local.editor = null;
        autosave();
    };
    const selectedDefenses = () => defenses.value.filter((m) => state().selectedDefenses.includes(m.id));
    const edit = (id: string, name: string, defense: boolean) => {
        local.editor = { id, name, defense };
        local.draft = (defense ? state().defenseScores[id] : state().attackScores[id]) ?? null;
        setTimeout(() => focus('#scenario-score'));
    };
    const toggle = (t: Technique) => {
        if (selected(t)) {
            for (const id of t.get_all_technique_tactic_ids()) vm().selectedTechniques.delete(id);
            delete state().attackScores[t.attackID];
            if (local.editor?.id === t.attackID) local.editor = null;
            state().selectedDefenses = selectedDefenses().map((m) => m.id);
        } else {
            for (const id of t.get_all_technique_tactic_ids()) vm().selectedTechniques.add(id);
            edit(t.attackID, t.name, false);
        }
        changed();
    };
    const clear = () => {
        vm().clearSelectedTechniques();
        const s = state();
        s.attackScores = {};
        s.selectedDefenses = [];
        s.defenseSelections = {};
        s.standaloneDefenses = [];
        s.ratings = {};
        local.editor = null;
        changed();
    };
    const saveScore = () => {
        if (!local.editor || !validScore(local.draft)) return;
        (local.editor.defense ? state().defenseScores : state().attackScores)[local.editor.id] = local.draft;
        local.editor = null;
        changed();
    };
    const toggleCustomAttack = (id: string, checked: boolean) =>
        (local.customAttacks = checked ? [...new Set([...local.customAttacks, id])] : local.customAttacks.filter((a) => a !== id));
    const addCustom = () => {
        local.showCustom = true;
        local.customEditing = '';
        local.customName = '';
        local.customDescription = '';
        local.customAttacks = activeAttack.value ? [activeAttack.value.attackID] : [];
        local.customScore = null;
        local.customError = '';
        setTimeout(() => focus('#custom-name'));
    };
    const saveCustom = () => {
        const s = state();
        const targets = local.customAttacks.filter((id) => attacks.value.some((a) => a.attackID === id));
        if (!local.customName.trim() || !targets.length) {
            local.customError = ui.tr('Enter a name and choose at least one attack.', 'أدخل اسماً واختر هجوماً واحداً على الأقل.');
            return;
        }
        if (local.customScore !== null && local.customScore !== '' && !validScore(local.customScore)) {
            local.customError = ui.tr('Score must be a whole number from 0 to 10.', 'السكور رقم صحيح من 0 إلى 10.');
            return;
        }
        const id = local.customEditing || `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const existing = s.customDefenses.find((m) => m.id === id);
        const value = { id, name: local.customName.trim(), description: local.customDescription.trim(), attackIDs: targets };
        for (const old of existing?.attackIDs || []) if (!targets.includes(old)) s.defenseSelections[old] = { ...s.defenseSelections[old], [id]: false };
        if (existing) Object.assign(existing, value);
        else s.customDefenses.push(value);
        if (!s.selectedDefenses.includes(id)) s.selectedDefenses.push(id);
        for (const attack of targets) s.defenseSelections[attack] = { ...s.defenseSelections[attack], [id]: true };
        if (validScore(local.customScore)) s.defenseScores[id] = local.customScore;
        else delete s.defenseScores[id];
        local.customName = local.customDescription = local.customEditing = '';
        local.customAttacks = [];
        local.customScore = null;
        local.showCustom = false;
        local.customError = '';
        changed();
    };
    const editCustom = (id: string) => {
        const m = state().customDefenses.find((d) => d.id === id);
        if (m) {
            local.showCustom = true;
            local.customError = '';
            setTimeout(() => focus('#custom-name'));
            local.customEditing = id;
            local.customName = m.name;
            local.customDescription = m.description;
            local.customAttacks = [...m.attackIDs];
            local.customScore = state().defenseScores[id] ?? null;
        }
    };
    const deleteCustom = (id: string) => {
        const s = state();
        s.customDefenses = s.customDefenses.filter((m) => m.id !== id);
        s.selectedDefenses = s.selectedDefenses.filter((v) => v !== id);
        delete s.defenseScores[id];
        s.standaloneDefenses = s.standaloneDefenses.filter((v) => v !== id);
        delete s.manualDefenseMappings[id];
        delete s.defenseStatus[id];
        for (const sel of Object.values(s.defenseSelections)) delete sel[id];
        for (const r of Object.values(s.ratings)) delete r[id];
        if (local.editor?.id === id) local.editor = null;
        if (local.customEditing === id) local.showCustom = false;
        local.deleteCandidate = '';
        local.defensePage = 0;
        changed();
    };

    const editorDescription = computed(() =>
        local.editor?.defense ? defenses.value.find((m) => m.id === local.editor!.id)?.description : catalog.value.find((t) => t.attackID === local.editor?.id)?.description
    );
    const editorCode = computed(() => (local.editor?.defense ? defenses.value.find((m) => m.id === local.editor!.id)?.attackID : local.editor?.id));
    const plainDescription = (value = '') =>
        value
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/<[^>]*>/g, '')
            .replace(/\(Citation:[^)]*\)/g, '')
            .trim();
    const mitigationText = (m: Defense) =>
        m.description ? plainDescription(m.description).slice(0, 280) : m.source === 'd3fend' ? ui.tr('No description in the imported data.', 'لا يوجد وصف في البيانات المستوردة.') : '';
    const relatedNames = (m: Defense) => [...new Set(m.mappings.map((r) => r.attack.attackID))].join(' · ');
    const printReport = () => window.print();

    // Reference ngOnChanges: reset transient state whenever another plan is bound.
    watch(
        viewModel,
        () => {
            local.editor = null;
            local.tactic = '';
            local.page = 0;
            local.search = '';
            local.researchAttack = '';
            local.defensePage = 0;
            local.showCustom = false;
        },
        { immediate: true }
    );

    return {
        local,
        state,
        domain,
        tactics,
        currentTactic,
        catalog,
        attacks,
        selected,
        columnTechniques,
        columnVisible,
        scrollTactic,
        displayedTactics,
        scoreLevel,
        selectedInTactic,
        tacticCount,
        defenses,
        mappedDefenses,
        isDefenseChosen,
        selectedMappedDefenses,
        defenseContext,
        chosenForContext,
        chooseDefense,
        editingDefense,
        hasManualMapping,
        officialMapping,
        linkDefense,
        sourceLabel,
        defenseCatalog,
        evidenceText,
        d3fendNote,
        tacticNames,
        statusOf,
        statusText,
        defenseScoreText,
        defenseLevel,
        scoreText,
        clearScore,
        calculation,
        formulaText,
        scoredTactics,
        chartPosition,
        chartWidth,
        chartTicks,
        resultTone,
        resultLabel,
        unscoredAttacks,
        fullyMitigated,
        criticalGaps,
        riskIndex,
        exportWord,
        changed,
        preference,
        switchView,
        edit,
        toggle,
        clear,
        saveScore,
        toggleCustomAttack,
        addCustom,
        saveCustom,
        editCustom,
        deleteCustom,
        editorDescription,
        editorCode,
        plainDescription,
        mitigationText,
        relatedNames,
        printReport,
        valid: validScore,
        style: scoreStyle,
        nextTick,
    };
}
