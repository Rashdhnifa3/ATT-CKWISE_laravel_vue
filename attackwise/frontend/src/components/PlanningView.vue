<script setup lang="ts">
// Port of nav-app/src/app/planning/planning.component.html (ATT&CKWISE reference).
// DOM structure, classes, ARIA attributes and texts are kept so reference selectors and
// Playwright scenarios apply unchanged.
import { ref, toRef } from 'vue';
import AwIcon from './AwIcon.vue';
import type { ViewModel } from '../layer/view-model';
import { usePlanning } from '../planning/usePlanning';
import { ui } from '../planning/ui';

const props = defineProps<{ viewModel: ViewModel }>();
const emit = defineEmits<{ download: [] }>();
const host = ref<HTMLElement | null>(null);
const focus = (selector: string) => host.value?.querySelector<HTMLElement>(selector)?.focus();
const p = usePlanning(toRef(props, 'viewModel'), focus);
const { local } = p;
const Math = globalThis.Math;
const scoreOptions = Array.from({ length: 11 }, (_, i) => i);
void scoreOptions;

// Angular NumberValueAccessor semantics: '' → null, otherwise parseFloat.
const numberValue = (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    return v === '' ? null : parseFloat(v);
};
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
const toggleExpanded = (id: string) => (local.expanded.has(id) ? local.expanded.delete(id) : local.expanded.add(id));
const riskTone = () => p.resultTone(p.riskIndex.value === null ? null : p.riskIndex.value / 10);
</script>

<template>
    <div ref="host" class="wise-planning">
        <section class="planner" :class="{ 'color-blind': local.colorBlind }">
            <section v-if="props.viewModel.planningView === 'attack'" class="attack-page">
                <label class="mobile-search"><AwIcon name="search" /><input v-model="ui.search" :aria-label="ui.tr('Search techniques', 'البحث عن التقنيات')" :placeholder="ui.tr('Search T1566, phishing…', 'ابحث T1566، تصيد…')" /></label>
                <div class="tactic-pills">
                    <button :class="{ 'active-filter': !local.tacticFilter }" :aria-pressed="!local.tacticFilter" @click="local.tacticFilter = ''">{{ ui.tr('All tactics', 'كل التكتيكات') }}</button>
                    <button
                        v-for="t in p.tactics.value"
                        :key="t.id"
                        :class="{ 'active-filter': local.tacticFilter === t.shortname, selected: !!p.selectedInTactic(t.shortname) }"
                        :aria-pressed="local.tacticFilter === t.shortname"
                        @click="p.scrollTactic(t.shortname)"
                    ><AwIcon name="target" />{{ ui.name(t) }}<b v-if="p.selectedInTactic(t.shortname)">{{ p.selectedInTactic(t.shortname) }}</b></button>
                </div>
                <div class="matrix-columns" :class="{ 'filtered-matrix': !!local.tacticFilter }">
                    <section v-for="t in p.displayedTactics.value" :key="t.id" class="tactic-column" :data-tactic="t.shortname">
                        <header class="glass tactic-heading">
                            <div><AwIcon name="target" /><span>{{ p.tacticCount(t.shortname) }}</span></div>
                            <h2>{{ ui.name(t) }}</h2>
                            <small dir="ltr">{{ t.attackID }}</small>
                        </header>
                        <div class="technique-grid">
                            <div v-for="item in p.columnVisible(t.shortname)" :key="item.id" class="technique-card glass" :class="{ selected: p.selected(item) }" :data-risk="p.scoreLevel(item)">
                                <button class="technique-select" :aria-pressed="p.selected(item)" @click="p.toggle(item)"><span class="technique-id" dir="ltr">{{ item.attackID }}</span><span v-if="p.selected(item)" class="selected-check"><AwIcon name="check" /></span><strong>{{ ui.name(item) }}</strong><small v-if="ui.lang === 'ar'" dir="ltr">{{ item.name }}</small><span class="platforms"><span v-for="platform in (item.platforms || []).slice(0, 3)" :key="platform" dir="ltr">{{ platform }}</span></span></button>
                                <div class="card-options">
                                    <button v-if="item.subtechniques.length" :aria-expanded="local.expanded.has(item.id)" @click="toggleExpanded(item.id)">{{ local.expanded.has(item.id) ? '−' : '+' }} {{ item.subtechniques.length }} {{ ui.tr('sub-techniques', 'تقنيات فرعية') }}</button>
                                    <button v-if="p.selected(item)" class="score-link" @click="p.edit(item.attackID, item.name, false)">{{ p.scoreText(p.state().attackScores[item.attackID]) }}</button>
                                </div>
                                <div v-if="local.expanded.has(item.id)" class="subtechniques">
                                    <div v-for="child in item.subtechniques" :key="child.id" :data-risk="p.scoreLevel(child)">
                                        <button :aria-pressed="p.selected(child)" class="child-select" @click="p.toggle(child)"><AwIcon v-if="p.selected(child)" name="check" /><span dir="ltr">{{ child.attackID }}</span>{{ ui.name(child) }}</button>
                                        <button v-if="p.selected(child)" @click="p.edit(child.attackID, child.name, false)">{{ p.scoreText(p.state().attackScores[child.attackID]) }}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p v-if="!p.columnTechniques(t.shortname).length" class="filter-empty">{{ ui.tr('No matching techniques', 'لا توجد تقنيات مطابقة') }}</p>
                        <button
                            v-if="p.columnVisible(t.shortname).length < p.columnTechniques(t.shortname).length"
                            class="load-more"
                            @click="local.columnLimits[t.shortname] = (local.columnLimits[t.shortname] || 20) + 20"
                        >{{ ui.tr('Show more techniques', 'عرض المزيد من التقنيات') }}</button>
                    </section>
                </div>
            </section>

            <section v-if="props.viewModel.planningView === 'final' && !p.attacks.value.length" class="empty-state">
                <AwIcon :name="props.viewModel.planningView === 'final' ? 'chart' : 'target'" />
                <h1>{{ props.viewModel.planningView === 'final' ? ui.tr('Nothing to report yet', 'لا توجد بيانات للتقرير بعد') : ui.tr('No attacks selected yet', 'لم يتم تحديد أي هجمات بعد') }}</h1>
                <button class="primary" @click="p.switchView('attack')">{{ ui.tr('Open Attack Matrix', 'افتح مصفوفة الهجمات') }}</button>
            </section>

            <section v-if="props.viewModel.planningView === 'defensive'" class="defense-page">
                <div class="defense-grid">
                    <nav class="attack-list" :aria-label="ui.tr('Selected attacks', 'الهجمات المحددة')">
                        <button class="glass" :class="{ active: !local.researchAttack }" @click="local.researchAttack = ''"><strong>{{ ui.tr('All mitigations', 'كل أنواع الميتيجيشن') }}</strong><small>{{ ui.tr('Browse all official and custom defenses', 'استعرض جميع الدفاعات الرسمية والمخصصة') }}</small></button>
                        <button v-for="t in p.attacks.value" :key="t.id" class="glass" :class="{ active: local.researchAttack === t.attackID }" @click="local.researchAttack = t.attackID">
                            <div><span class="technique-id" dir="ltr">{{ t.attackID }}</span><span class="status" :data-status="p.statusOf(t)">{{ p.statusText(p.statusOf(t)) }}</span></div>
                            <strong>{{ ui.name(t) }}</strong><small>{{ p.tacticNames(t) }}</small>
                        </button>
                    </nav>
                    <section class="glass defense-details">
                        <div class="details-heading">
                            <div>
                                <span class="technique-id" dir="ltr">{{ p.defenseContext.value?.attackID || 'MITRE ATT&CK' }}</span>
                                <h2>{{ p.defenseContext.value ? ui.name(p.defenseContext.value) : ui.tr('All mitigations', 'كل أنواع الميتيجيشن') }}</h2>
                                <p class="selection-note">{{ ui.tr('Choose the defenses for your plan. Selection does not imply deployment.', 'اختر الدفاعات لخطة العمل. الاختيار لا يعني أن الدفاع مطبّق فعلياً.') }}</p>
                            </div>
                            <button :disabled="!p.attacks.value.length" @click="p.addCustom()"><AwIcon name="add" />{{ ui.tr('Add defense', 'إضافة دفاع مخصص') }}</button>
                        </div>
                        <div class="defense-filters">
                            <label class="defense-search"><AwIcon name="search" /><input v-model="local.defenseSearch" :aria-label="ui.tr('Search mitigations', 'البحث عن الميتيجيشن')" :placeholder="ui.tr('Search name or mitigation ID…', 'ابحث بالاسم أو معرف الميتيجيشن…')" /></label>
                            <select v-model="local.defenseFilter" :aria-label="ui.tr('Mitigation filter', 'فلترة الميتيجيشن')">
                                <option value="All">{{ ui.tr('All types', 'كل الأنواع') }}</option>
                                <option value="Official">MITRE ATT&amp;CK</option>
                                <option value="D3FEND">MITRE D3FEND</option>
                                <option value="Custom">{{ ui.tr('Custom', 'المخصصة') }}</option>
                                <option value="Selected">{{ ui.tr('Selected only', 'المختارة فقط') }}</option>
                            </select>
                        </div>
                        <form v-if="local.showCustom" class="custom-editor" novalidate @submit.prevent="p.saveCustom()">
                            <h3>{{ local.customEditing ? ui.tr('Edit custom mitigation', 'تعديل ميتيجيشن مخصص') : ui.tr('Custom mitigation', 'ميتيجيشن مخصص') }}</h3>
                            <label>{{ ui.tr('Defense name', 'اسم الدفاع') }}<input id="custom-name" v-model="local.customName" name="customName" required maxlength="200" /></label>
                            <fieldset class="custom-attacks">
                                <legend>{{ ui.tr('Related attacks', 'الهجمات المرتبطة') }}</legend>
                                <label v-for="attack in p.attacks.value" :key="attack.id"><input type="checkbox" :name="'customAttack-' + attack.attackID" :checked="local.customAttacks.includes(attack.attackID)" @change="p.toggleCustomAttack(attack.attackID, checked($event))" /><b dir="ltr">{{ attack.attackID }}</b> {{ ui.name(attack) }}</label>
                            </fieldset>
                            <label>{{ ui.tr('Defense Score (0–10) — optional', 'درجة الدفاع (0–10) — اختياري') }}<input id="custom-score" name="customScore" type="number" min="0" max="10" step="1" :value="local.customScore ?? ''" @input="local.customScore = numberValue($event)" /></label>
                            <label>{{ ui.tr('Defense mechanism', 'طريقة الصد') }}<textarea v-model="local.customDescription" name="customDescription" rows="3"></textarea></label>
                            <p role="alert">{{ local.customError }}</p>
                            <button class="primary" type="submit">{{ ui.tr('Save defense', 'حفظ الدفاع') }}</button>
                            <button type="button" @click="local.showCustom = false">{{ ui.tr('Cancel', 'إلغاء') }}</button>
                        </form>
                        <p class="results-count">{{ p.defenseCatalog.value.length }} {{ ui.tr('mitigations', 'ميتيجيشن') }}</p>
                        <p v-if="p.d3fendNote.value" class="d3fend-empty" role="status">{{ p.d3fendNote.value }}</p>
                        <article
                            v-for="m in p.defenseCatalog.value"
                            :key="m.id"
                            class="mitigation"
                            :class="{ custom: m.source === 'custom', d3fend: m.source === 'd3fend', chosen: p.chosenForContext(m) }"
                            :data-defense="p.defenseLevel(m)"
                            :data-source="m.source"
                        >
                            <div class="mitigation-title"><span class="mitigation-id" dir="ltr">{{ m.attackID }}</span><strong>{{ ui.name(m) }}</strong><span class="source-badge" :data-source="m.source">{{ p.sourceLabel(m) }}</span><button class="choose-defense" :aria-pressed="p.chosenForContext(m)" @click="p.chooseDefense(m)"><AwIcon :name="p.chosenForContext(m) ? 'check' : 'add'" />{{ p.chosenForContext(m) ? ui.tr('Selected', 'مختار') : ui.tr('Select defense', 'اختيار الدفاع') }}</button></div>
                            <button v-if="p.chosenForContext(m)" class="defense-score score-link" @click="p.edit(m.id, m.name, true)">{{ p.defenseScoreText(p.state().defenseScores[m.id]) }}</button>
                            <p>{{ p.mitigationText(m) }}</p>
                            <small v-if="m.source === 'd3fend'">{{ ui.tr('D3FEND tactic: ', 'تكتيك D3FEND: ') }}<span dir="ltr">{{ m.d3fendTactic || ui.tr('not specified', 'غير محدد') }}</span></small>
                            <p v-if="m.mappings.length" class="related-attacks">{{ ui.tr('Related attacks: ', 'الهجمات المرتبطة: ') }}{{ p.relatedNames(m) }}<template v-for="(link, li) in m.mappings" :key="li"><small>{{ link.attack.attackID }} · {{ link.source }}</small><small v-for="(e, ei) in link.evidence || []" :key="ei" class="d3fend-evidence" dir="ltr">{{ p.evidenceText(e) }}</small></template></p>
                            <div v-if="m.source === 'custom'" class="custom-actions">
                                <button @click="p.editCustom(m.id)">{{ ui.tr('Edit', 'تعديل') }}</button>
                                <button :aria-label="ui.tr('Remove ', 'حذف ') + m.name" @click="local.deleteCandidate = m.id"><AwIcon name="close" /></button>
                                <span v-if="local.deleteCandidate === m.id"><button @click="p.deleteCustom(m.id)">{{ ui.tr('Confirm delete', 'تأكيد الحذف') }}</button><button @click="local.deleteCandidate = ''">{{ ui.tr('Cancel', 'إلغاء') }}</button></span>
                            </div>
                        </article>
                        <p v-if="!p.defenseCatalog.value.length">{{ ui.tr('No matching mitigations. Adjust your filters.', 'لا توجد نتائج مطابقة. غيّر الفلاتر.') }}</p>
                    </section>
                </div>
            </section>

            <section v-if="props.viewModel.planningView === 'final' && p.attacks.value.length" class="report-page">
                <header class="report-heading"><h1>{{ ui.tr('Executive Report', 'التقرير التنفيذي') }}</h1><button class="primary" @click="p.exportWord()"><AwIcon name="report" />{{ ui.tr('Export Word report (.docx)', 'تصدير تقرير Word (.docx)') }}</button></header>
                <p role="status">{{ local.exportMessage }}</p>
                <div class="formula-toolbar glass">
                    <label>{{ ui.tr('Risk formula', 'معادلة الخطر') }}<select v-model="p.state().riskFormula" :aria-label="ui.tr('Risk formula', 'معادلة الخطر')" @change="p.changed()"><option value="strongest">{{ ui.tr('Attack − strongest defense', 'الهجوم − أعلى سكور دفاع') }}</option><option value="average">{{ ui.tr('Attack − average defense', 'الهجوم − متوسط سكورات الدفاع') }}</option><option value="sum">{{ ui.tr('Attack − sum of defenses', 'الهجوم − مجموع سكورات الدفاع') }}</option></select></label>
                    <code dir="ltr">{{ p.formulaText.value }}</code>
                    <span>{{ ui.tr('Updates the chart, table and export', 'يحدّث الرسم والجدول والتصدير') }}</span>
                </div>
                <p class="report-method">{{ ui.tr('A = attack score; D = scores of selected, linked defenses. No selected defense means D = 0; any missing score leaves the result Not Rated. Negative results mean defense exceeds attack in this model. The 0–100 risk index averages max(0, result) × 10 and requires every attack to be rated.', 'A = سكور الهجوم؛ D = سكورات الدفاعات المختارة المرتبطة. دون دفاع مختار تكون D = 0؛ وأي سكور مفقود يجعل النتيجة غير مقيّمة. النتيجة السالبة تعني تفوق سكور الدفاع في هذا النموذج. مؤشر الخطر 0–100 هو متوسط max(0, النتيجة) × 10 ويحتاج تقييم كل الهجمات.') }}</p>
                <div class="report-grid">
                    <section class="glass coverage-gauge">
                        <div class="gauge">
                            <svg viewBox="0 0 180 180" :style="{ filter: 'drop-shadow(0 0 12px ' + riskTone() + ')' }" role="img" :aria-label="ui.tr('Residual risk index', 'مؤشر الخطر المتبقي') + ': ' + (p.riskIndex.value === null ? ui.tr('Not Rated', 'غير مقيّم') : p.riskIndex.value + '/100')"><circle cx="90" cy="90" r="70" fill="none" stroke="var(--secondary)" stroke-width="14" /><circle cx="90" cy="90" r="70" fill="none" :stroke="riskTone()" stroke-width="14" stroke-linecap="round" stroke-dasharray="439.823" :stroke-dashoffset="439.823 * (1 - (p.riskIndex.value || 0) / 100)" /></svg>
                            <div><strong>{{ p.riskIndex.value === null ? '—' : p.riskIndex.value }}</strong><small>{{ ui.tr('Residual risk / 100', 'الخطر المتبقي / 100') }}</small></div>
                        </div>
                        <span class="posture" :style="{ color: riskTone() }">{{ p.riskIndex.value === null ? ui.tr('Not Rated', 'غير مقيّم') : p.riskIndex.value <= 30 ? ui.tr('Low risk', 'خطر منخفض') : p.riskIndex.value <= 60 ? ui.tr('Medium risk', 'خطر متوسط') : ui.tr('High risk', 'خطر مرتفع') }}</span>
                        <div class="gauge-counts">
                            <div><strong class="success">{{ p.fullyMitigated.value }}</strong><small>{{ ui.tr('Result ≤ 0', 'النتيجة ≤ 0') }}</small></div>
                            <div><strong class="warning">{{ p.unscoredAttacks.value }}</strong><small>{{ ui.tr('Not Rated', 'غير مقيّم') }}</small></div>
                            <div><strong class="danger">{{ p.criticalGaps.value }}</strong><small>{{ ui.tr('High risk', 'خطر مرتفع') }}</small></div>
                        </div>
                    </section>
                    <section class="glass tactic-chart">
                        <h2>{{ ui.tr('Attack − defense by tactic', 'الهجوم − الدفاع حسب التكتيك') }}</h2>
                        <p class="chart-description">{{ ui.tr('Mean formula result per tactic. Lower is better.', 'متوسط نتيجة المعادلة لكل تكتيك. الأقل أفضل.') }}</p>
                        <div class="chart-plot" :style="{ minHeight: Math.max(220, p.scoredTactics.value.length * 72) + 'px' }" dir="ltr">
                            <div class="chart-gridlines" aria-hidden="true"></div>
                            <div
                                v-for="(t, i) in p.scoredTactics.value"
                                :key="t.name"
                                class="chart-row"
                                tabindex="0"
                                role="group"
                                :aria-label="t.name + ': ' + (t.result === null ? ui.tr('Not Rated', 'غير مقيّم') : t.result)"
                                :aria-describedby="local.chartHover === i ? 'tactic-tooltip-' + i : undefined"
                                @mouseenter="local.chartHover = i"
                                @mouseleave="local.chartHover = null"
                                @focus="local.chartHover = i"
                                @blur="local.chartHover = null"
                                @keydown.escape="local.chartHover = null"
                            >
                                <span>{{ t.name }}</span>
                                <div class="chart-track signed-track">
                                    <span class="zero-line" :style="{ left: p.chartPosition(0) + '%' }"></span>
                                    <div v-if="t.result !== null" class="signed-bar" :style="{ left: p.chartPosition(Math.min(0, t.result)) + '%', width: p.chartWidth(t.result) + '%', background: p.resultTone(t.result) }"></div>
                                    <span v-if="t.result === null" class="unrated-bar">{{ ui.tr('Not Rated', 'غير مقيّم') }}</span>
                                    <span v-if="t.result !== null" class="result-number">{{ t.result }}</span>
                                </div>
                                <div v-if="local.chartHover === i" :id="'tactic-tooltip-' + i" class="chart-tooltip glass" role="tooltip" :dir="ui.lang === 'ar' ? 'rtl' : 'ltr'">
                                    <strong>{{ t.name }}</strong><span dir="ltr">{{ p.formulaText.value }}</span><span>{{ ui.tr('Result', 'النتيجة') }}: {{ t.result === null ? ui.tr('Not Rated', 'غير مقيّم') : t.result }}</span><span>{{ ui.tr('Unrated attacks', 'هجمات غير مقيّمة') }}: {{ t.incomplete }}</span><span>{{ ui.tr('Attacks', 'الهجمات') }}: {{ t.total }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="chart-axis" dir="ltr"><span v-for="(tick, ti) in p.chartTicks.value" :key="ti">{{ tick }}</span></div>
                    </section>
                </div>
                <div class="glass report-table">
                    <table>
                        <thead><tr><th>ID</th><th>{{ ui.tr('Technique', 'التقنية') }}</th><th>{{ ui.tr('Tactic', 'التكتيك') }}</th><th>{{ ui.tr('Status', 'الحالة') }}</th><th>{{ ui.tr('Defenses', 'الدفاعات') }}</th><th>{{ ui.tr('Attack Score', 'درجة الهجوم') }}</th><th>{{ ui.tr('Combined defense score', 'سكور الدفاع المحسوب') }}</th><th>{{ ui.tr('Formula result', 'نتيجة المعادلة') }}</th></tr></thead>
                        <tbody>
                            <tr v-for="t in p.attacks.value" :key="t.id" :data-risk="p.scoreLevel(t)">
                                <td class="technique-id" dir="ltr">{{ t.attackID }}</td>
                                <td>{{ ui.name(t) }}</td>
                                <td>{{ p.tacticNames(t) }}</td>
                                <td><span class="status formula-status" :style="{ color: p.resultTone(p.calculation(t).result) }">{{ p.resultLabel(t) }}</span></td>
                                <td><details><summary>{{ p.selectedMappedDefenses(t).length }}</summary><p v-for="m in p.selectedMappedDefenses(t)" :key="m.id" :data-source="m.source">{{ m.attackID }} {{ ui.name(m) }} <small class="defense-source">{{ p.sourceLabel(m) }}</small> <button class="score-link" @click="p.edit(m.id, m.name, true)">{{ p.defenseScoreText(p.state().defenseScores[m.id]) }}</button></p></details></td>
                                <td><button class="score-link" @click="p.edit(t.attackID, t.name, false)">{{ p.scoreText(p.state().attackScores[t.attackID]) }}</button></td>
                                <td class="combined-defense">{{ p.calculation(t).defense === null ? ui.tr('Not Rated', 'غير مقيّم') : p.calculation(t).defense }}</td>
                                <td class="formula-result" :style="{ color: p.resultTone(p.calculation(t).result) }">{{ p.calculation(t).result === null ? ui.tr('Not Rated', 'غير مقيّم') : p.calculation(t).result }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="report-tools">
                    <button @click="emit('download')"><AwIcon name="download" />{{ ui.tr('Download plan JSON', 'تنزيل الخطة JSON') }}</button>
                    <button @click="p.printReport()">{{ ui.tr('Print / PDF', 'طباعة / PDF') }}</button>
                    <label><input v-model="local.colorBlind" type="checkbox" @change="p.preference()" />{{ ui.tr('Color Blind Friendly', 'ملائم لعمى الألوان') }}</label>
                </div>
            </section>

            <aside v-if="local.editor" class="glass score-drawer" aria-labelledby="score-title">
                <div class="drawer-heading"><AwIcon :name="local.editor.defense ? 'shield' : 'target'" /><button :aria-label="ui.tr('Close scoring panel', 'إغلاق لوحة التقييم')" @click="local.editor = null"><AwIcon name="close" /></button></div>
                <span class="technique-id" dir="ltr">{{ p.editorCode.value }}</span>
                <h2 id="score-title">{{ local.editor.name }}</h2>
                <p>{{ p.plainDescription(p.editorDescription.value).slice(0, 300) }}</p>
                <form novalidate @submit.prevent="p.saveScore()">
                    <label for="scenario-score">{{ local.editor.defense ? ui.tr('Defense Score (0–10) — optional', 'درجة الدفاع (0–10) — اختياري') : ui.tr('Attack Score (0–10) — optional', 'درجة الهجوم (0–10) — اختياري') }}</label>
                    <input id="scenario-score" name="score" type="number" min="0" max="10" step="1" :value="local.draft ?? ''" @input="local.draft = numberValue($event)" />
                    <input type="range" name="slider" :aria-label="local.editor.defense ? 'Defense score slider' : 'Attack score slider'" min="0" max="10" step="1" :value="local.draft ?? 0" @input="local.draft = numberValue($event)" />
                    <p class="score-feedback" :style="{ color: p.valid(local.draft) ? p.style(local.draft, local.editor.defense).color : 'var(--muted-foreground)' }">{{ local.editor.defense ? p.defenseScoreText(local.draft) : p.scoreText(local.draft) }}</p>
                    <button class="primary" type="submit" :disabled="!p.valid(local.draft)"><AwIcon name="check" />{{ ui.tr('Save score', 'حفظ التقييم') }}</button>
                    <button type="button" @click="p.clearScore()">{{ ui.tr('Clear score', 'مسح التقييم') }}</button>
                    <button type="button" @click="local.editor = null">{{ ui.tr('Skip for now', 'تخطي الآن') }}</button>
                </form>
                <section v-if="p.editingDefense.value" class="defense-links">
                    <h3>{{ ui.tr('Attack links', 'ربط الهجمات') }}</h3>
                    <p>{{ ui.tr('Manual links are your scenario assumptions, not official MITRE mappings. A score is shared by this defense across its linked attacks.', 'الربط اليدوي افتراض لخطة العمل وليس علاقة رسمية من MITRE. سكور الدفاع مشترك بين الهجمات المرتبطة به.') }}</p>
                    <label v-for="t in p.attacks.value" :key="t.id"><input type="checkbox" :checked="p.officialMapping(p.editingDefense.value, t) ? p.isDefenseChosen(t, p.editingDefense.value) : p.hasManualMapping(p.editingDefense.value, t)" @change="p.linkDefense(p.editingDefense.value!, t, checked($event))" /><span><b dir="ltr">{{ t.attackID }}</b> {{ ui.name(t) }}<small>{{ p.officialMapping(p.editingDefense.value, t) ? (p.editingDefense.value.source === 'd3fend' ? ui.tr('D3FEND inferred mapping', 'علاقة D3FEND مستنتجة') : ui.tr('MITRE mapping', 'علاقة MITRE')) : ui.tr('Manual mapping', 'ربط يدوي') }}</small></span></label>
                    <p v-if="!p.attacks.value.length">{{ ui.tr('Select attacks to link this defense. Its score is saved independently.', 'اختر هجمات لربط الدفاع بها. يُحفظ السكور بشكل مستقل.') }}</p>
                </section>
            </aside>

            <div v-if="props.viewModel.planningView === 'attack'" class="floating-bottom">
                <div class="glass">
                    <div><strong>{{ p.attacks.value.length }}</strong><small>{{ ui.tr('techniques selected', 'تقنيات محددة') }}</small></div>
                    <span class="draft-status" role="status">{{ local.storageMessage }}</span>
                    <div class="bottom-actions">
                        <button v-if="p.attacks.value.length" @click="p.clear()"><AwIcon name="close" />{{ ui.tr('Clear', 'مسح') }}</button>
                        <button class="primary" :disabled="!p.attacks.value.length" @click="p.switchView('defensive')"><AwIcon name="shield" />{{ ui.tr('Build Defense Plan', 'انتقل لخطة الدفاع') }}<AwIcon name="arrow" /></button>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped lang="scss" src="../styles/planning.scss"></style>
