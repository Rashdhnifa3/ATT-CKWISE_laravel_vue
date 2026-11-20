// Port of the reachable parts of nav-app/src/app/classes/view-model.ts (MITRE ATT&CK Navigator,
// Apache-2.0, extended by ATT&CKWISE). Serialization and deserialization keep the reference
// field order, validation and the optional `attackwise` extension.
// Not ported (no reachable caller in the reference UI): matrix filtering/sorting, aggregate
// scores, bulk annotation editing, highlight, upgrade annotation copy — see CURRENT_PARITY.md.

/* eslint-disable @typescript-eslint/no-explicit-any */
import tinycolor from 'tinycolor2';
import { PlanningState, restorePlanning } from '../planning/planning-state';
import type { DataService } from '../domain/data-service';
import type { Technique } from '../domain/stix';
import { Filter, Gradient, LayoutOptions, Link, Metadata, TechniqueVM, layerWarnings } from './annotations';

export const navVersion = '5.3.2';
export const layerVersion = '4.5';

export type PlanningView = 'attack' | 'defensive' | 'final';

export class ViewModel {
    public planningState = new PlanningState();
    public planningView: PlanningView = 'attack';
    public planId = '';
    public name: string;
    public domain = '';
    public version = '';
    public domainVersionID: string;
    public description = '';
    public uid: string;
    public bundleURL: string | undefined;
    public loaded = false;

    public techniqueVMs = new Map<string, TechniqueVM>();
    public selectedTechniques = new Set<string>();

    public filters = new Filter();
    public layout = new LayoutOptions();
    public hideDisabled = false;
    public showTacticRowBackground = false;
    public tacticRowBackground = '#dddddd';
    public gradient = new Gradient();
    public legendItems: { label: string; color: string }[] = [];
    public backgroundPresets = [
        '#e60d0d', '#fc3b3b', '#fc6b6b', '#fca2a2', '#e6550d', '#fd8d3c', '#fdae6b', '#fdd0a2',
        '#e6d60d', '#fce93b', '#fcf26b', '#fcf3a2', '#31a354', '#74c476', '#a1d99b', '#c7e9c0',
        '#3182bd', '#6baed6', '#9ecae1', '#c6dbef', '#756bb1', '#9e9ac8', '#bcbddc', '#dadaeb',
        '#636363', '#969696', '#bdbdbd', '#d9d9d9',
    ];
    public legendColorPresets: string[] = [];
    public initializeScoresTo = '';
    public metadata: Metadata[] = [];
    public links: Link[] = [];
    public technique_show_subtechnique = false;
    public sorting = 0;
    public selectTechniquesAcrossTactics = true;
    public selectSubtechniquesWithParent = false;
    public selectVisibleTechniques = false;

    constructor(
        name: string,
        uid: string,
        domainVersionID: string,
        public dataService: DataService
    ) {
        this.domainVersionID = domainVersionID;
        this.name = name;
        this.uid = uid;
        this.legendColorPresets = this.backgroundPresets;
    }

    public loadVMData(): void {
        const domain = this.dataService.getDomain(this.domainVersionID)!;
        if (domain.isCustom) this.bundleURL = domain.urls[0];
        if (!this.domainVersionID || !domain.dataLoaded) {
            this.dataService.onDataLoad(this.domainVersionID, () => {
                this.initTechniqueVMs();
                this.filters.initPlatformOptions(this.dataService.getDomain(this.domainVersionID)!.platforms);
            });
        } else {
            this.initTechniqueVMs();
            this.filters.initPlatformOptions(domain.platforms);
        }
        this.loaded = true;
    }

    private techniquesOfDomain(): Technique[] {
        return this.dataService.getDomain(this.domainVersionID)!.techniques;
    }

    private initTechniqueVMs(): void {
        for (const technique of this.techniquesOfDomain()) {
            for (const id of technique.get_all_technique_tactic_ids()) {
                const vm = new TechniqueVM(id);
                vm.score = this.initializeScoresTo;
                this.setTechniqueVM(vm, false);
            }
            for (const sub of technique.subtechniques) {
                for (const id of sub.get_all_technique_tactic_ids()) {
                    const vm = new TechniqueVM(id);
                    vm.score = this.initializeScoresTo;
                    this.setTechniqueVM(vm, false);
                }
            }
        }
        if (this.layout.expandedSubtechniques == 'annotated') {
            for (const technique of this.techniquesOfDomain()) {
                if (!technique.subtechniques.length) continue;
                for (const id of technique.get_all_technique_tactic_ids()) {
                    const tvm = this.getTechniqueVM_id(id);
                    for (const sub of technique.subtechniques) {
                        tvm.showSubtechniques = tvm.showSubtechniques || sub.get_all_technique_tactic_ids().some((sid) => this.getTechniqueVM_id(sid).annotated());
                    }
                }
            }
        } else if (this.layout.expandedSubtechniques == 'all') {
            for (const technique of this.techniquesOfDomain()) {
                if (!technique.subtechniques.length) continue;
                for (const id of technique.get_all_technique_tactic_ids()) this.getTechniqueVM_id(id).showSubtechniques = true;
            }
        } else {
            for (const technique of this.techniquesOfDomain()) {
                if (!technique.subtechniques.length) continue;
                for (const id of technique.get_all_technique_tactic_ids()) {
                    if (this.getTechniqueVM_id(id).showSubtechniques) {
                        this.technique_show_subtechnique = true;
                        break;
                    }
                }
            }
            if (this.layout.expandedSubtechniques == 'none' && !this.technique_show_subtechnique) {
                this.techniqueVMs.forEach((tvm) => (tvm.showSubtechniques = false));
            }
        }
    }

    public getTechniqueVM_id(id: string): TechniqueVM {
        const vm = this.techniqueVMs.get(id);
        if (!vm) throw Error('technique VM not found: ' + id);
        return vm;
    }

    public setTechniqueVM(vm: TechniqueVM, overwrite = true): void {
        if (this.techniqueVMs.has(vm.technique_tactic_union_id)) {
            if (overwrite) this.techniqueVMs.delete(vm.technique_tactic_union_id);
            else return;
        }
        this.techniqueVMs.set(vm.technique_tactic_union_id, vm);
    }

    public clearSelectedTechniques(): void {
        this.selectedTechniques.clear();
    }

    public serialize(downloadAnnotationsOnVisibleTechniques: boolean): string {
        const modified: unknown[] = [];
        this.techniqueVMs.forEach((value) => {
            if (value.modified() && !downloadAnnotationsOnVisibleTechniques) modified.push(JSON.parse(value.serialize()));
            else if (value.modified() && value.isVisible === true && downloadAnnotationsOnVisibleTechniques) modified.push(JSON.parse(value.serialize()));
        });
        const domain = this.dataService.getDomain(this.domainVersionID)!;
        const rep: Record<string, any> = {};
        rep.name = this.name;
        rep.versions = { attack: domain.getVersion(), navigator: navVersion, layer: layerVersion };
        rep.domain = domain.domain_identifier;
        if (domain.isCustom) rep.customDataURL = domain.urls[0];
        rep.description = this.description;
        rep.filters = JSON.parse(this.filters.serialize());
        rep.sorting = this.sorting;
        rep.layout = this.layout.serialize();
        rep.hideDisabled = this.hideDisabled;
        rep.techniques = modified;
        rep.gradient = JSON.parse(this.gradient.serialize());
        rep.legendItems = JSON.parse(JSON.stringify(this.legendItems));
        rep.metadata = this.metadata.filter((m) => m.valid()).map((m) => m.serialize());
        rep.links = this.links.filter((l) => l.valid()).map((l) => l.serialize());
        rep.showTacticRowBackground = this.showTacticRowBackground;
        rep.tacticRowBackground = this.tacticRowBackground;
        rep.selectTechniquesAcrossTactics = this.selectTechniquesAcrossTactics;
        rep.selectSubtechniquesWithParent = this.selectSubtechniquesWithParent;
        rep.selectVisibleTechniques = this.selectVisibleTechniques;
        rep.attackwise = {
            planId: this.planId,
            view: this.planningView,
            selectedTechniques: Array.from(this.selectedTechniques),
            planning: JSON.parse(JSON.stringify(this.planningState)),
        };
        return JSON.stringify(rep, null, '\t');
    }

    public deserializeDomainVersionID(rep: any): string {
        let versionNumber = '';
        const obj = typeof rep == 'string' ? JSON.parse(rep) : rep;
        this.name = obj.name;
        this.version = this.dataService.latestVersion.number;
        if ('versions' in obj) {
            if ('attack' in obj.versions) {
                if (typeof obj.versions.attack === 'string') {
                    if (obj.versions.attack.length > 0) this.version = obj.versions.attack.match(/\d+/g)[0];
                } else layerWarnings.push('TypeError: attack version field is not a string');
            }
            versionNumber = String(obj.versions['layer']);
        }
        if ('version' in obj) versionNumber = String(obj.version);
        if (obj.domain in this.dataService.domain_backwards_compatibility) this.domain = this.dataService.domain_backwards_compatibility[obj.domain];
        else this.domain = obj.domain;
        this.domainVersionID = this.dataService.getDomainVersionID(this.domain, this.version);
        return versionNumber;
    }

    public deserialize(rep: any, restoreTechniques = true): void {
        const obj = typeof rep == 'string' ? JSON.parse(rep) : rep;
        this.planningState = restorePlanning(obj.attackwise?.planning);
        if (typeof obj.attackwise?.planId === 'string') this.planId = obj.attackwise.planId;
        if (['attack', 'defensive', 'final'].includes(obj.attackwise?.view)) this.planningView = obj.attackwise.view;
        if (Array.isArray(obj.attackwise?.selectedTechniques)) {
            this.selectedTechniques = new Set(obj.attackwise.selectedTechniques.filter((id: unknown) => typeof id === 'string'));
        }
        const typed = (key: string, type: string, apply: (v: any) => void) => {
            if (key in obj) {
                if (typeof obj[key] === type) apply(obj[key]);
                else layerWarnings.push(`TypeError: ${key} field is not a ${type}`);
            }
        };
        typed('description', 'string', (v) => (this.description = v));
        if ('filters' in obj) this.filters.deserialize(obj.filters);
        typed('sorting', 'number', (v) => (this.sorting = v));
        typed('hideDisabled', 'boolean', (v) => (this.hideDisabled = v));
        if ('gradient' in obj) {
            this.gradient = new Gradient();
            this.gradient.deserialize(JSON.stringify(obj.gradient));
        }
        if ('legendItems' in obj) {
            for (const item of obj.legendItems) {
                const legendItem = { color: '#defa217', label: 'default label' };
                if (!('label' in item) || !('color' in item)) {
                    layerWarnings.push("Error: LegendItem required field 'label' not present");
                    continue;
                }
                if (typeof item.label === 'string') legendItem.label = item.label;
                else {
                    layerWarnings.push('TypeError: legendItem label field is not a string');
                    continue;
                }
                if (typeof item.color === 'string' && tinycolor(item.color).isValid()) legendItem.color = item.color;
                else {
                    layerWarnings.push('TypeError: legendItem color field is not a color-string');
                    continue;
                }
                this.legendItems.push(legendItem);
            }
        }
        typed('showTacticRowBackground', 'boolean', (v) => (this.showTacticRowBackground = v));
        if ('tacticRowBackground' in obj) {
            if (typeof obj.tacticRowBackground === 'string' && tinycolor(obj.tacticRowBackground).isValid()) this.tacticRowBackground = obj.tacticRowBackground;
            else layerWarnings.push('TypeError: tacticRowBackground field is not a color-string');
        }
        typed('selectTechniquesAcrossTactics', 'boolean', (v) => (this.selectTechniquesAcrossTactics = v));
        typed('selectSubtechniquesWithParent', 'boolean', (v) => (this.selectSubtechniquesWithParent = v));
        typed('selectVisibleTechniques', 'boolean', (v) => (this.selectVisibleTechniques = v));
        if ('techniques' in obj && restoreTechniques && obj.techniques.length > 0) {
            for (const objTechnique of obj.techniques) {
                if ('tactic' in objTechnique) {
                    const tvm = new TechniqueVM('');
                    tvm.deserialize(JSON.stringify(objTechnique), objTechnique.techniqueID, objTechnique.tactic);
                    this.setTechniqueVM(tvm);
                } else {
                    // Same matching loop as the reference, including its break semantics.
                    for (const technique of this.techniquesOfDomain()) {
                        if (technique.attackID == objTechnique.techniqueID) {
                            if (technique.deprecated || technique.revoked) break;
                            for (const tactic of technique.tactics) {
                                const tvm = new TechniqueVM('');
                                tvm.deserialize(JSON.stringify(objTechnique), objTechnique.techniqueID, tactic);
                                this.setTechniqueVM(tvm);
                            }
                            break;
                        }
                        for (const sub of technique.subtechniques) {
                            if (sub.attackID == objTechnique.techniqueID) {
                                if (sub.deprecated || sub.revoked) break;
                                for (const tactic of sub.tactics) {
                                    const tvm = new TechniqueVM('');
                                    tvm.deserialize(JSON.stringify(objTechnique), objTechnique.techniqueID, tactic);
                                    this.setTechniqueVM(tvm);
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
        if ('metadata' in obj) {
            for (const mo of obj.metadata) {
                const m = new Metadata();
                m.deserialize(mo);
                if (m.valid()) this.metadata.push(m);
            }
        }
        if ('links' in obj) {
            for (const lo of obj.links) {
                const l = new Link();
                l.deserialize(lo);
                if (l.valid()) this.links.push(l);
            }
        }
        if ('customDataURL' in obj) this.bundleURL = obj.customDataURL;
        if ('layout' in obj) this.layout.deserialize(obj.layout);
        else if ('viewMode' in obj) {
            if (typeof obj.viewMode === 'number') {
                switch (obj.viewMode) {
                    case 1:
                        this.layout.layout = 'side';
                        this.layout.showName = false;
                        this.layout.showID = true;
                        break;
                    case 2:
                        this.layout.layout = 'mini';
                        this.layout.showName = false;
                        this.layout.showID = false;
                        break;
                    default:
                        break;
                }
            } else layerWarnings.push('TypeError: viewMode field is not a number');
        }
        this.updateGradient();
    }

    public updateGradient(): void {
        this.gradient.updateGradient();
        this.techniqueVMs.forEach((tvm) => (tvm.scoreColor = this.gradient.getHexColor(tvm.score)));
        this.legendColorPresets = [...this.backgroundPresets, ...this.gradient.colors.map((c) => c.color)];
    }
}
