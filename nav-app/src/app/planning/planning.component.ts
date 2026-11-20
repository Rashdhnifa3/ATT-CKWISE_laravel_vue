import { calculateRisk } from './risk-calculation';
import { PlanningUiService } from './planning-ui.service';
import { PlanningIconComponent } from './planning-icon.component';
import { Component, Input, Output, EventEmitter, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewModel } from '../classes/view-model';
import { Technique } from '../classes/stix';
import { DataService } from '../services/data.service';
import { ViewModelsService } from '../services/viewmodels.service';
import { validScore, scoreStyle } from './planning-state';
import { PlanStorageService } from './plan-storage.service';
import { D3fendService } from './d3fend.service';
import { D3fendEvidence, isD3fendId } from './d3fend-data';
type DefenseSource = 'attack' | 'd3fend' | 'custom';
interface Defense {
    id: string;
    name: string;
    description: string;
    attackID: string;
    source: DefenseSource;
    /** D3FEND tactic, only for D3FEND defenses and only when present in the imported data. */
    d3fendTactic?: string;
    mappings: { attack: Technique; source: string; mappingType?: string; evidence?: D3fendEvidence[] }[];
}
@Component({
    selector: 'wise-planning',
    imports: [CommonModule, FormsModule, PlanningIconComponent],
    templateUrl: './planning.component.html',
    styleUrls: ['./planning.component.scss'],
})
export class PlanningComponent {
    @Input() viewModel: ViewModel;
    @Output() download = new EventEmitter<void>();
    columnLimits: Record<string, number> = {};
    columnTechniques(shortname: string) {
        const q = this.ui.search.trim().toLowerCase();
        return this.catalog.filter(t => !t.parent && t.tactics.includes(shortname) && (!q || [t,...t.subtechniques].some(x => (x.attackID + ' ' + x.name + ' ' + this.ui.name(x)).toLowerCase().includes(q))));
    }
    columnVisible(shortname: string) { return this.columnTechniques(shortname).slice(0,this.columnLimits[shortname] || 20); }
    tacticFilter = '';
    chartHover: number | null = null;
    trackChart(_index: number, item: { name: string }) { return item.name; }
    trackDefense(_index: number, item: Defense) { return item.id; }
    scrollTactic(id: string) { this.tacticFilter = id; }
    get displayedTactics() { return this.tacticFilter ? this.tactics.filter(t => t.shortname === this.tacticFilter) : this.tactics; }
    scoreLevel(t: Technique) { return this.selected(t) ? scoreStyle(this.state.attackScores[t.attackID]).level : 'missing'; }
    isDefenseChosen(t: Technique, m: Defense) {
        const explicit = this.state.defenseSelections[t.attackID]?.[m.id];
        if (typeof explicit === 'boolean') return explicit;
        const rating = this.state.ratings[t.attackID]?.[m.id];
        return rating ? rating !== 'none' : this.state.selectedDefenses.includes(m.id);
    }
    selectedMappedDefenses(t: Technique) { return this.mappedDefenses(t).filter(m => this.isDefenseChosen(t,m)); }
    get defenseContext() { return this.researchAttack ? this.attacks.find(t => t.attackID === this.researchAttack) : null; }
    defenseTargets(m: Defense) { return m.mappings.map(r => r.attack).filter((t,i,list) => list.findIndex(x => x.id === t.id) === i && (!this.researchAttack || t.attackID === this.researchAttack)); }
    chosenForContext(m: Defense) {
        const targets = this.defenseTargets(m);
        if (this.researchAttack) return targets.some(t => this.isDefenseChosen(t,m));
        return this.state.standaloneDefenses.includes(m.id) || targets.some(t => this.isDefenseChosen(t,m));
    }
    chooseDefense(m: Defense) {
        const selected = !this.chosenForContext(m);
        for (const t of this.defenseTargets(m)) this.state.defenseSelections[t.attackID] = { ...this.state.defenseSelections[t.attackID], [m.id]: selected };
        if (!this.researchAttack) {
            this.state.standaloneDefenses = this.state.standaloneDefenses.filter(id => id !== m.id);
            if (selected) this.state.standaloneDefenses.push(m.id);
        }
        if (selected) this.edit(m.id,m.name,true);
        else if (this.editor?.id === m.id) this.editor = null;
        this.changed();
    }
    get editingDefense() { return this.editor?.defense ? this.defenses.find(m => m.id === this.editor.id) : null; }
    hasManualMapping(m: Defense, t: Technique) { return (this.state.manualDefenseMappings[m.id] || []).includes(t.attackID); }
    officialMapping(m: Defense, t: Technique) { return m.mappings.some(r => r.attack.id === t.id && !r.source.startsWith('User-defined')); }
    linkDefense(m: Defense, t: Technique, checked: boolean) {
        const targets = (this.state.manualDefenseMappings[m.id] || []).filter(id => id !== t.attackID);
        if (checked) targets.push(t.attackID);
        this.state.manualDefenseMappings[m.id] = targets;
        this.state.defenseSelections[t.attackID] = { ...this.state.defenseSelections[t.attackID], [m.id]: checked };
        this.changed();
    }
    get defenseCatalog() {
        const q = this.defenseSearch.trim().toLowerCase();
        return this.defenses.filter(m => (!this.researchAttack || m.mappings.some(r => r.attack.attackID === this.researchAttack)) && (!q || (m.attackID + ' ' + m.name + ' ' + this.ui.name(m) + ' ' + this.sourceLabel(m) + ' ' + (m.d3fendTactic || '')).toLowerCase().includes(q)) && (this.defenseFilter === 'All' || this.defenseFilter === 'Selected' && this.chosenForContext(m) || this.defenseFilter === 'Official' && m.source === 'attack' || this.defenseFilter === 'D3FEND' && m.source === 'd3fend' || this.defenseFilter === 'Custom' && m.source === 'custom'));
    }
    sourceLabel(m: Defense) { return m.source === 'd3fend' ? 'MITRE D3FEND' : m.source === 'custom' ? this.ui.tr('Custom','مخصص') : 'MITRE ATT&CK'; }
    evidenceText(e: D3fendEvidence) { return [this.ui.tr('Defense ','الدفاع ') + (e.defenseRelation || '—'), this.ui.tr('attack ','الهجوم ') + (e.offensiveRelation || '—'), e.artifact || this.ui.tr('artifact not specified','الأداة غير محددة')].join(' · '); }
    /** Shown when the selected technique has no imported D3FEND relation (absence of a mapping ≠ absence of a defense). */
    get d3fendNote() {
        if (this.defenseFilter !== 'All' && this.defenseFilter !== 'D3FEND') return '';
        if (this.d3fend.status === 'error') return this.ui.tr('D3FEND reference data could not be loaded.','تعذر تحميل بيانات D3FEND المرجعية.');
        if (this.d3fend.status !== 'ready') return this.ui.tr('Loading D3FEND reference data…','جارٍ تحميل بيانات D3FEND المرجعية…');
        if (!this.researchAttack || this.d3fend.relationsFor(this.researchAttack).length) return '';
        return this.ui.tr('No D3FEND mapping for ','لا توجد علاقة D3FEND للتقنية ') + this.researchAttack + this.ui.tr(' in the imported data. This does not mean no effective defense exists.',' في البيانات المستوردة. هذا لا يعني عدم وجود دفاع فعّال.');
    }
    tacticNames(t: Technique) { return t.tactics.map(name => { const tactic = this.tactics.find(x => x.shortname === name); return tactic ? this.ui.name(tactic) : name; }).join(' · '); }
    get activeAttack() { return this.attacks.find(t => t.attackID === this.researchAttack) || this.attacks[0]; }
    mappedDefenses(t: Technique) { return this.defenses.filter(m => m.mappings.some(r => r.attack.id === t.id)); }
    rating(t: Technique, m: Defense) {
        const explicit = this.state.ratings[t.attackID]?.[m.id];
        if (explicit) return explicit;
        if (!this.state.selectedDefenses.includes(m.id) || (this.state.defenseStatus[m.id] || 'Deployed') !== 'Deployed') return 'none';
        return this.state.defenseScores[m.id] === 10 ? 'full' : this.state.defenseScores[m.id] > 0 ? 'partial' : 'none';
    }
    rate(t: Technique, m: Defense, status: string) {
        this.state.ratings[t.attackID] = { ...this.state.ratings[t.attackID], [m.id]: status };
        if (!this.state.selectedDefenses.includes(m.id)) this.state.selectedDefenses.push(m.id);
        this.changed();
    }
    statusOf(t: Technique) { return this.mappedDefenses(t).some(m => this.isDefenseChosen(t,m)) ? 'covered' : 'gap'; }
    statusText(status: string) { return status === 'covered' ? this.ui.tr('Defense selected','دفاع مختار') : this.ui.tr('Gap — no defense selected','ثغرة — لا يوجد دفاع مختار'); }
    countStatus(status: string) { return this.attacks.filter(t => this.statusOf(t) === status).length; }
    coveragePercent(items = this.attacks) { return items.length ? Math.round(items.reduce((sum,t) => sum + (this.statusOf(t) === 'covered' ? 1 : 0),0) / items.length * 100) : 0; }
    get reportTactics() { return this.tactics.map(t => { const items = this.attacks.filter(x => x.tactics.includes(t.shortname)); return {name: this.ui.name(t), total:items.length,pct:this.coveragePercent(items),covered:items.filter(x=>this.statusOf(x)==='covered').length,partial:0,gaps:items.filter(x=>this.statusOf(x)==='gap').length}; }).filter(t=>t.total); }
    tone(pct: number) { return pct > 75 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)'; }
    get posture() { return this.coveragePercent() > 75 ? this.ui.tr('High selection coverage','تغطية اختيار مرتفعة') : this.coveragePercent() >= 40 ? this.ui.tr('Moderate selection coverage','تغطية اختيار متوسطة') : this.ui.tr('Defense gaps','فجوات دفاعية'); }
    defenseScoreText(value: unknown) { return validScore(value) ? value + '/10 · ' + (value <= 3 ? this.ui.tr('Weak Defense','دفاع ضعيف') : value <= 6 ? this.ui.tr('Moderate Defense','دفاع متوسط') : this.ui.tr('Strong Defense','دفاع قوي')) : this.ui.tr('Not Rated','غير مقيّم'); }
    defenseLevel(m: Defense) { return this.chosenForContext(m) ? scoreStyle(this.state.defenseScores[m.id], true).level : 'missing'; }
    scoreText(value: unknown) { return validScore(value) ? value + '/10 · ' + (value <= 3 ? this.ui.tr('Low Attack Risk','خطورة منخفضة') : value <= 6 ? this.ui.tr('Medium Attack Risk','خطورة متوسطة') : this.ui.tr('High Attack Risk','خطورة عالية')) : this.ui.tr('Not Rated','غير مقيّم'); }
    clearScore() { if (this.editor) { delete (this.editor.defense ? this.state.defenseScores : this.state.attackScores)[this.editor.id]; this.draft = null; this.changed(); } }
    async exportWord() {
        try {
            const { exportDocx } = await import('./reference-report');
            const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = Math.max(260,this.scoredTactics.length * 54 + 60);
            const ctx = canvas.getContext('2d'); let chart;
            if (ctx) {
                ctx.fillStyle = '#121726'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.font = '14px sans-serif';
                const zero=350+this.chartPosition(0)*7.5;
                ctx.strokeStyle='#64748b';ctx.beginPath();ctx.moveTo(zero,10);ctx.lineTo(zero,canvas.height-10);ctx.stroke();
                this.scoredTactics.forEach((t,i)=>{const y=30+i*54;ctx.fillStyle='#e2e8f0';ctx.fillText(t.name,20,y+18);if(t.result!==null){ctx.fillStyle=t.result<=3?'#10b981':t.result<=6?'#f59e0b':'#f43f5e';ctx.fillRect(350+this.chartPosition(Math.min(0,t.result))*7.5,y,Math.max(2,this.chartWidth(t.result)*7.5),24);}ctx.fillStyle='#e2e8f0';ctx.fillText(t.result===null?'Not Rated':String(t.result),1120,y+18);});
                const blob = await new Promise<Blob>(resolve => canvas.toBlob(resolve,'image/png'));
                if (blob) chart = { data:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height };
            }
            await exportDocx({formula:this.formulaText,riskIndex:this.riskIndex,chart,lang:this.ui.lang,version:String(this.domain?.version?.number || ''),coverage:this.coveragePercent(),posture:this.posture,total:this.attacks.length,covered:this.countStatus('covered'),partial:this.countStatus('partial'),gaps:this.countStatus('gap'),tactics:this.reportTactics,rows:this.attacks.map(t=>({id:t.attackID,name:this.ui.name(t) + ' — A: ' + this.scoreText(this.state.attackScores[t.attackID]) + ' | D: ' + (this.calculation(t).defense ?? this.ui.tr('Not Rated','غير مقيّم')) + ' | '+this.formulaText+' = '+(this.calculation(t).result ?? this.ui.tr('Not Rated','غير مقيّم')),tactic:this.tacticNames(t),status:this.resultLabel(t),defenses:this.mappedDefenses(t).filter(m=>this.isDefenseChosen(t,m)).map(m=>m.attackID + ' ' + this.ui.name(m) + ' — ' + this.defenseScoreText(this.state.defenseScores[m.id])).join('; ')})),recommendations:this.attacks.filter(t=>this.statusOf(t)!=='covered').map(t=>this.ui.tr('Review defenses for ','مراجعة الدفاعات للتقنية ') + t.attackID + ' ' + this.ui.name(t))});
            this.exportMessage = this.ui.tr('Report downloaded','تم تنزيل التقرير');
        } catch { this.exportMessage = this.ui.tr('Export failed. Please try again.','فشل التصدير. حاول مرة أخرى.'); }
    }
    autosave() {
        this.storageMessage = this.storage.save(this.viewModel)
            ? this.ui.tr('Autosaved in this browser','تم الحفظ تلقائياً في المتصفح')
            : this.ui.tr('Browser storage unavailable. Download your plan to keep it.','التخزين غير متاح. نزّل الخطة لحفظها.');
    }
    selectedInTactic(shortname: string) { return this.attacks.filter(t => t.tactics.includes(shortname)).length; }
    calculation(t: Technique) { return calculateRisk(this.state.attackScores[t.attackID],this.selectedMappedDefenses(t).map(m=>this.state.defenseScores[m.id]),this.state.riskFormula); }
    residual(t: Technique): number | null { return this.calculation(t).risk; }
    get formulaText() { return this.state.riskFormula === 'sum' ? 'A − sum(D)' : this.state.riskFormula === 'average' ? 'A − mean(D)' : 'A − max(D)'; }
    get scoredTactics() { return this.tactics.map(t=>{
        const items=this.attacks.filter(x=>x.tactics.includes(t.shortname));
        const values=items.map(x=>this.calculation(x).result);
        const incomplete=values.filter(x=>x===null).length;
        return {name:this.ui.name(t),total:items.length,incomplete,result:incomplete || !items.length ? null : Math.round(values.reduce((a,b)=>a+b,0)/items.length*100)/100};
    }).filter(t=>t.total); }
    get chartMinimum() { return Math.min(-10,...this.scoredTactics.filter(t=>t.result!==null).map(t=>Math.floor(t.result/5)*5)); }
    chartPosition(value: number) { return (value-this.chartMinimum)/(10-this.chartMinimum)*100; }
    chartWidth(value: number) { return Math.abs(value)/(10-this.chartMinimum)*100; }
    get chartTicks() { return Array.from({length:5},(_,i)=>Math.round((this.chartMinimum+(10-this.chartMinimum)*i/4)*100)/100); }
    resultTone(value: number | null) { return value === null ? 'var(--muted-foreground)' : value <= 3 ? 'var(--success)' : value <= 6 ? 'var(--warning)' : 'var(--danger)'; }
    resultLabel(t: Technique) { const value=this.calculation(t).result; return value === null ? this.ui.tr('Not Rated','غير مقيّم') : value <= 0 ? this.ui.tr('Defense score meets attack','سكور الدفاع يغطي الهجوم') : value <= 3 ? this.ui.tr('Low remaining risk','خطر متبقٍ منخفض') : value <= 6 ? this.ui.tr('Medium remaining risk','خطر متبقٍ متوسط') : this.ui.tr('High remaining risk','خطر متبقٍ مرتفع'); }
    get unscoredAttacks() { return this.attacks.filter(t=>this.calculation(t).result===null).length; }
    gap(t: Technique) { const r = this.residual(t); return r === null ? 'Assessment incomplete' : r === 0 ? 'Fully Covered' : this.defensesFor(t).some(m => (this.state.defenseStatus[m.id] || 'Deployed') === 'Deployed' && this.state.defenseScores[m.id] > 0) ? 'Partial' : 'Exposed Gap'; }
    get fullyMitigated() { return this.attacks.filter(t => this.residual(t) === 0).length; }
    get criticalGaps() { return this.attacks.filter(t => (this.residual(t) ?? -1) >= 7).length; }
    get riskIndex() { return !this.attacks.length || this.attacks.some(t => this.residual(t) === null) ? null : Math.round(this.attacks.reduce((sum, t) => sum + this.residual(t), 0) / this.attacks.length * 10); }
    get riskLabel() { return this.riskIndex === null ? 'Assessment incomplete' : this.riskIndex <= 30 ? 'Low Risk' : this.riskIndex <= 60 ? 'Moderate Risk' : 'High Risk'; }
    printReport() { window.print(); }
    async copyBrief() {
        const text = '# ' + this.viewModel.name + '\n\nResidual risk: ' + (this.riskIndex ?? 'Incomplete') + '/100\n\n' + this.attacks.map(t => '- ' + t.attackID + ' ' + t.name + ': ' + this.gap(t) + ' (' + (this.residual(t) ?? 'unscored') + '/10)').join('\n') + '\n\nScenario estimate: threat × (1 − strongest deployed defense / 10). Not a measured probability.';
        try { await navigator.clipboard.writeText(text); this.exportMessage = 'Markdown brief copied.'; }
        catch { this.exportMessage = 'Clipboard unavailable. Use the PDF or JSON export.'; }
    }
    tactic = '';
    search = '';
    page = 0;
    expanded = new Set<string>();
    colorBlind = false;
    storageMessage = '';
    exportMessage = '';
    editor: { id: string; name: string; defense: boolean } | null = null;
    draft: number | null = null;
    customName = '';
    customDescription = '';
    customAttacks: string[] = [];
    customScore: number | null = null;
    toggleCustomAttack(id: string, checked: boolean) { this.customAttacks = checked ? [...new Set([...this.customAttacks, id])] : this.customAttacks.filter(a => a !== id); }
    customEditing = '';
    showCustom = false;
    customError = '';
    deleteCandidate = '';
    researchAttack = '';
    defenseFilter = 'All';
    defenseSearch = '';
    defensePage = 0;
    defenseFilters = ['All', 'Selected', 'Not Selected', 'Official', 'D3FEND', 'Custom'];
    get researchedAttacks() { return this.attacks.filter(t => !this.researchAttack || t.attackID === this.researchAttack); }
    get filteredDefenses() {
        const q = this.defenseSearch.toLowerCase().trim();
        return this.defenses.filter(m => (!this.researchAttack || m.mappings.some(r => r.attack.attackID === this.researchAttack)) &&
            (!q || (m.name + ' ' + m.attackID).toLowerCase().includes(q)) &&
            (this.defenseFilter === 'All' || this.defenseFilter === 'Selected' && this.state.selectedDefenses.includes(m.id) ||
             this.defenseFilter === 'Not Selected' && !this.state.selectedDefenses.includes(m.id) ||
             this.defenseFilter === 'Official' && m.source === 'attack' || this.defenseFilter === 'D3FEND' && m.source === 'd3fend' || this.defenseFilter === 'Custom' && m.source === 'custom'));
    }
    get visibleDefenses() { return this.filteredDefenses.slice(this.defensePage * 8, (this.defensePage + 1) * 8); }
    mappingKind(m: Defense) { return m.source === 'custom' ? 'Custom' : m.source === 'd3fend' ? 'D3FEND inferred' : m.mappings.some(r => r.source.includes('Direct')) ? 'Direct' : 'Parent-level'; }
    relatedNames(m: Defense) { return [...new Set(m.mappings.map(r => r.attack.attackID))].join(' · '); }
    addCustom() { this.showCustom = true; this.customEditing = ''; this.customName = ''; this.customDescription = ''; this.customAttacks = this.activeAttack ? [this.activeAttack.attackID] : []; this.customScore = null; this.customError = ''; setTimeout(() => this.host.nativeElement.querySelector('#custom-name')?.focus()); }
    deleteCustom(id: string) {
        this.state.customDefenses = this.state.customDefenses.filter(m => m.id !== id);
        this.state.selectedDefenses = this.state.selectedDefenses.filter(value => value !== id);
        delete this.state.defenseScores[id];
        this.state.standaloneDefenses = this.state.standaloneDefenses.filter(value => value !== id);
        delete this.state.manualDefenseMappings[id];
        delete this.state.defenseStatus[id];
        for (const selections of Object.values(this.state.defenseSelections)) delete selections[id];
        for (const ratings of Object.values(this.state.ratings)) delete ratings[id];
        if (this.editor?.id === id) this.editor = null;
        if (this.customEditing === id) this.showCustom = false;
        this.deleteCandidate = ''; this.defensePage = 0; this.changed();
    }
    Math = Math;
    scoreOptions = Array.from({ length: 11 }, (_, i) => i);
    get tacticName() { return this.tactics.find(t => t.shortname === this.currentTactic)?.name || 'Techniques'; }
    tacticCount(shortname: string) { return this.catalog.filter(t => !t.parent && t.tactics.includes(shortname)).length; }
    get editorDescription() { return this.editor?.defense ? this.defenses.find(m => m.id === this.editor.id)?.description : this.catalog.find(t => t.attackID === this.editor?.id)?.description; }
    get editorCode() { return this.editor?.defense ? this.defenses.find(m => m.id === this.editor.id)?.attackID : this.editor?.id; }
    plainDescription(value = '') { return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]*>/g, '').replace(/\(Citation:[^)]*\)/g, '').trim(); }
    valid = validScore;
    style = scoreStyle;
    constructor(
        public ui: PlanningUiService,
        public data: DataService,
        private models: ViewModelsService,
        private host: ElementRef,
        private storage: PlanStorageService,
        public d3fend: D3fendService
    ) {
        this.d3fend.load();
        try {
            this.colorBlind = localStorage.getItem('attackwise-color-blind') === 'true';
        } catch {
            /* Session setting remains usable. */
        }
    }
    get state() {
        return this.viewModel.planningState;
    }
    get domain() {
        return this.data.getDomain(this.viewModel.domainVersionID);
    }
    get tactics() {
        return this.domain?.tactics || [];
    }
    get currentTactic() {
        return this.tactic || this.tactics[0]?.shortname;
    }
    get catalog() {
        return Array.from(new Map([...(this.domain?.techniques || []), ...(this.domain?.subtechniques || [])].map(t => [t.id, t])).values()).filter(t => !t.revoked && !t.deprecated);
    }
    get attacks() {
        return this.catalog.filter((t) => t.get_all_technique_tactic_ids().some((id) => this.viewModel.selectedTechniques.has(id)));
    }
    selected(t: Technique) {
        return t.get_all_technique_tactic_ids().some((id) => this.viewModel.selectedTechniques.has(id));
    }
    ngOnChanges() {
        this.editor = null;
        this.tactic = '';
        this.page = 0;
        this.search = '';
        this.researchAttack = ''; this.defensePage = 0; this.showCustom = false;
    }
    hasOfficialMapping(t: Technique) {
        return this.defenses.some((m) => m.source === 'attack' && m.mappings.some((r) => r.attack.id === t.id));
    }
    get filtered() {
        const q = this.search.toLowerCase().trim();
        return this.catalog.filter(
            (t) =>
                !t.parent &&
                t.tactics.includes(this.currentTactic) &&
                (!q || [t, ...t.subtechniques].some((x) => `${x.name} ${x.attackID}`.toLowerCase().includes(q)))
        );
    }
    get visible() {
        return this.filtered.slice(this.page * 12, (this.page + 1) * 12);
    }
    get defenses(): Defense[] {
        const selectedAttacks = this.attacks;
        const official = (this.domain?.mitigations || [])
            .filter((m) => !m.revoked && !m.deprecated)
            .map((m) => {
                const related = m.mitigated(this.viewModel.domainVersionID);
                return {
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    attackID: m.attackID,
                    source: 'attack' as DefenseSource,
                    mappings: selectedAttacks.flatMap((attack) => {
                        const mappings = [];
                        if (related.includes(attack.id)) mappings.push({ attack, source: 'MITRE ATT&CK · Direct mapping' });
                        if (attack.parent && related.includes(attack.parent.id))
                            mappings.push({ attack, source: `MITRE ATT&CK · Parent mapping (${attack.parent.attackID})` });
                        return mappings;
                    }),
                };
            });
        const custom = this.state.customDefenses.map((m) => ({
            ...m,
            attackID: 'Custom',
            source: 'custom' as DefenseSource,
            mappings: selectedAttacks
                .filter((a) => m.attackIDs.includes(a.attackID))
                .map((attack) => ({ attack, source: 'User-defined mapping · Not an official ATT&CK relationship' })),
        }));
        return [...official, ...this.d3fendDefenses(selectedAttacks), ...custom].map(m => ({...m, mappings: [...m.mappings, ...selectedAttacks.filter(t => (this.state.manualDefenseMappings[m.id] || []).includes(t.attackID) && !m.mappings.some(r=>r.attack.id===t.id)).map(attack=>({attack,source:'User-defined mapping · Not an official ATT&CK relationship'}))]}));
    }
    /**
     * Every imported D3FEND technique, mapped to the selected attacks by exact ATT&CK ID (no parent →
     * sub-technique inheritance), plus any D3FEND defense referenced by the plan so saved choices never vanish.
     */
    d3fendDefenses(selectedAttacks: Technique[]): Defense[] {
        const byId = new Map<string, Defense>();
        const entry = (id: string) => {
            let d = byId.get(id);
            if (!d) {
                const info = this.d3fend.index?.defenses.get(id);
                d = { id, name: info?.name || id.slice(4), description: info?.description || '', attackID: id, source: 'd3fend', d3fendTactic: info?.tactic || '', mappings: [] };
                byId.set(id, d);
            }
            return d;
        };
        for (const id of this.d3fend.index?.defenses.keys() || []) entry(id);
        for (const attack of selectedAttacks)
            for (const rel of this.d3fend.relationsFor(attack.attackID))
                entry(rel.defense.id).mappings.push({ attack, source: 'MITRE D3FEND · ' + (rel.type || 'Mapping type not specified'), mappingType: rel.type, evidence: rel.evidence });
        const s = this.state;
        const referenced = [...s.selectedDefenses, ...s.standaloneDefenses, ...Object.keys(s.defenseScores), ...Object.keys(s.manualDefenseMappings), ...Object.values(s.defenseSelections).flatMap(Object.keys), ...Object.values(s.ratings).flatMap(Object.keys)];
        for (const id of referenced) if (isD3fendId(id)) entry(id);
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    get selectedDefenses() {
        return this.defenses.filter((m) => this.state.selectedDefenses.includes(m.id));
    }
    defensesFor(t: Technique) {
        return this.selectedDefenses.filter((m) => m.mappings.some((r) => r.attack.id === t.id));
    }
    get missing() {
        return (
            this.attacks.filter((t) => !validScore(this.state.attackScores[t.attackID])).length +
            this.selectedDefenses.filter((m) => !validScore(this.state.defenseScores[m.id])).length
        );
    }
    get ready() {
        return this.attacks.length > 0;
    }
    get covered() {
        return this.attacks.filter((t) => this.defensesFor(t).length > 0).length;
    }
    coverage(t: Technique) {
        return this.defensesFor(t).length ? '◆ Selected defense mapped' : '○ No selected defense';
    }
    label(score: unknown, defense = false) {
        const s = scoreStyle(score, defense);
        return `${s.symbol} ${validScore(score) ? score + '/10 · ' : ''}${s.label}`;
    }
    preference() {
        try {
            localStorage.setItem('attackwise-color-blind', String(this.colorBlind));
        } catch {
            this.storageMessage = 'Preference applies this session; browser storage is unavailable.';
        }
    }
    changed() {
        if (this.researchAttack && !this.attacks.some(t => t.attackID === this.researchAttack)) this.researchAttack = '';
        this.defensePage = Math.min(this.defensePage, Math.max(0, Math.ceil(this.filteredDefenses.length / 8) - 1));
        this.state.finalized = false;
        this.autosave();
        this.exportMessage = '';
        this.models.onSelectionChange.emit();
    }
    switchView(view: 'attack' | 'defensive' | 'final') {
        this.viewModel.planningView = view;
        this.editor = null;
        this.autosave();
    }
    toggle(t: Technique) {
        if (this.selected(t)) {
            for (const id of t.get_all_technique_tactic_ids()) this.viewModel.selectedTechniques.delete(id);
            delete this.state.attackScores[t.attackID];
            if (this.editor?.id === t.attackID) this.editor = null;
            this.state.selectedDefenses = this.selectedDefenses.map((m) => m.id);
        } else {
            for (const id of t.get_all_technique_tactic_ids()) this.viewModel.selectedTechniques.add(id);
            this.edit(t.attackID, t.name, false);
        }
        this.changed();
    }
    clear() {
        this.viewModel.clearSelectedTechniques();
        this.state.attackScores = {};
        this.state.selectedDefenses = [];
        this.state.defenseSelections = {};
        this.state.standaloneDefenses = [];
        this.state.ratings = {};
        this.editor = null;
        this.changed();
    }
    toggleDefense(m: Defense) {
        if (this.state.selectedDefenses.includes(m.id)) {
            this.state.selectedDefenses = this.state.selectedDefenses.filter((id) => id !== m.id);
            if (this.editor?.id === m.id) this.editor = null;
        } else {
            this.state.selectedDefenses.push(m.id);
            this.edit(m.id, m.name, true);
        }
        this.changed();
    }
    edit(id: string, name: string, defense: boolean) {
        this.editor = { id, name, defense };
        this.draft = (defense ? this.state.defenseScores[id] : this.state.attackScores[id]) ?? null;
        setTimeout(() => this.host.nativeElement.querySelector('#scenario-score')?.focus());
    }
    saveScore() {
        if (!this.editor || !validScore(this.draft)) return;
        (this.editor.defense ? this.state.defenseScores : this.state.attackScores)[this.editor.id] = this.draft;
        this.editor = null;
        this.changed();
    }
    saveCustom() {
        const targets = this.customAttacks.filter(id => this.attacks.some(a => a.attackID === id));
        if (!this.customName.trim() || !targets.length) { this.customError = this.ui.tr('Enter a name and choose at least one attack.','أدخل اسماً واختر هجوماً واحداً على الأقل.'); return; }
        if (this.customScore !== null && (this.customScore as unknown) !== '' && !validScore(this.customScore)) { this.customError = this.ui.tr('Score must be a whole number from 0 to 10.','السكور رقم صحيح من 0 إلى 10.'); return; }
        const id = this.customEditing || `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const existing = this.state.customDefenses.find((m) => m.id === id);
        const value = { id, name: this.customName.trim(), description: this.customDescription.trim(), attackIDs: targets };
        for (const old of existing?.attackIDs || []) if (!targets.includes(old)) this.state.defenseSelections[old] = { ...this.state.defenseSelections[old], [id]: false };
        if (existing) Object.assign(existing, value);
        else this.state.customDefenses.push(value);
        if (!this.state.selectedDefenses.includes(id)) this.state.selectedDefenses.push(id);
        for (const attack of targets) this.state.defenseSelections[attack] = { ...this.state.defenseSelections[attack], [id]: true };
        if (validScore(this.customScore)) this.state.defenseScores[id] = this.customScore;
        else delete this.state.defenseScores[id];
        this.customName = this.customDescription = this.customEditing = '';
        this.customAttacks = []; this.customScore = null;
        this.showCustom = false; this.customError = '';
        this.changed();
    }
    editCustom(id: string) {
        const m = this.state.customDefenses.find((d) => d.id === id);
        if (m) {
            this.showCustom = true; this.customError = '';
            setTimeout(() => this.host.nativeElement.querySelector('#custom-name')?.focus());
            this.customEditing = id;
            this.customName = m.name;
            this.customDescription = m.description;
            this.customAttacks = [...m.attackIDs];
            this.customScore = this.state.defenseScores[id] ?? null;
        }
    }
    finalize() {
        if (this.ready) this.state.finalized = true;
    }
    async exportPNG() {
        if (!this.ready || !this.state.finalized) return;
        this.exportMessage = 'Creating PNG…';
        // Dedicated paginated export; every text line and assessment is preserved.
        const lines: { text: string; score?: number; defense?: boolean }[] = [];
        for (const t of this.attacks) {
            lines.push({ text: `${t.attackID} · ${t.name} (${t.tactics.join(', ')})` });
            lines.push({
                text: `User-defined Attack Score: ${this.label(this.state.attackScores[t.attackID])}`,
                score: this.state.attackScores[t.attackID],
            });
            lines.push({ text: `Coverage Status: ${this.coverage(t)}` });
            for (const m of this.defensesFor(t)) {
                lines.push({ text: `${m.attackID} · ${m.name}` });
                lines.push({
                    text: `User-defined Defense Score: ${this.label(this.state.defenseScores[m.id], true)}`,
                    score: this.state.defenseScores[m.id],
                    defense: true,
                });
                for (const r of m.mappings.filter((r) => r.attack.id === t.id)) lines.push({ text: r.source });
            }
            lines.push({ text: `Modeled Residual Risk: ${this.residual(t) ?? 'Incomplete'}/10 · ${this.gap(t)}` });
            lines.push({ text: '' });
        }
        const canvas = document.createElement('canvas');
        canvas.width = 2400;
        canvas.height = 3000;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            this.exportMessage = 'PNG creation failed: canvas unavailable.';
            return;
        }
        ctx.scale(2, 2);
        ctx.font = '16px sans-serif';
        const wrapped = lines.flatMap((line) => {
            const chunks: typeof lines = [];
            let text = '';
            for (const word of line.text.split(' ')) {
                if (ctx.measureText(text + word).width > 1050) {
                    chunks.push({ text });
                    text = '';
                }
                // Split unusually long unbroken user text too.
                for (const char of word + ' ') {
                    if (ctx.measureText(text + char).width > 1050) {
                        chunks.push({ text });
                        text = '';
                    }
                    text += char;
                }
            }
            chunks.push({ ...line, text });
            return chunks;
        });
        const pages = Math.max(1, Math.ceil(wrapped.length / 30));
        try {
            const files: { blob: Blob; name: string }[] = [];
            for (let page = 0; page < pages; page++) {
                ctx.fillStyle = '#101827';
                ctx.fillRect(0, 0, 1200, 1500);
                ctx.fillStyle = '#f1f5f9';
                ctx.font = 'bold 24px sans-serif';
                ctx.fillText(`ATT&CKWISE · ${this.viewModel.name.slice(0, 65)}`, 40, 48);
                ctx.font = '16px sans-serif';
                ctx.fillText(
                    `Page ${page + 1}/${pages} · ${this.colorBlind ? 'Color Blind Friendly · patterns enabled' : 'Scores and shapes enabled'}`,
                    40,
                    80
                );
                ctx.fillText(
                    `Coverage: ${this.covered}/${this.attacks.length} attacks have selected defenses; mappings do not verify effectiveness.`,
                    40,
                    110
                );
                let y = 150;
                for (const line of wrapped.slice(page * 30, (page + 1) * 30)) {
                    ctx.fillStyle = validScore(line.score) ? scoreStyle(line.score, line.defense).color : '#f1f5f9';
                    ctx.fillText(line.text, 40, y);
                    if (validScore(line.score)) {
                        const width = line.score * 95;
                        ctx.fillRect(40, y + 7, width, 9);
                        if (this.colorBlind) {
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(40, y + 7, width, 9);
                            ctx.clip();
                            ctx.strokeStyle = '#101827';
                            ctx.lineWidth = 2;
                            const level = scoreStyle(line.score).level;
                            for (let x = 40; x < 40 + width; x += level === 'low' ? 14 : level === 'medium' ? 9 : 5) {
                                ctx.beginPath();
                                ctx.moveTo(x, y + 7);
                                ctx.lineTo(x + (level === 'medium' ? 0 : 8), y + 16);
                                ctx.stroke();
                            }
                            ctx.restore();
                        }
                    }
                    y += 39;
                }
                ctx.fillStyle = '#f1f5f9';
                ctx.fillText('● 0–3 Low Attack Risk / Weak Defense · ■ 4–6 Medium Attack Risk / Moderate Defense', 40, 1380);
                ctx.fillText(
                    '▲ 7–10 High Attack Risk / Strong Defense · Green = low risk or strong defense; amber = middle; red = high risk or weak defense.',
                    40,
                    1410,
                    1100
                );
                ctx.fillText('User-defined scenario assessments, not verified real-world effectiveness. Residual risk uses the strongest deployed defense.', 40, 1440);
                ctx.fillText('Sources: MITRE ATT&CK; MITRE D3FEND (inferred mappings). Custom mappings are user-defined.', 40, 1470);
                const blob = await new Promise<Blob>((resolve, reject) =>
                    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
                );
                files.push({ blob, name: `attackwise-plan-${page + 1}.png` });
            }
            for (const file of files) {
                const url = URL.createObjectURL(file.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
            this.exportMessage = `${files.length} PNG file(s) created; download requested. Your browser may ask to allow multiple downloads.`;
        } catch {
            this.exportMessage = 'PNG creation failed. Please try again.';
        }
    }
}
