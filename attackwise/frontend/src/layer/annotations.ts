// Port of nav-app/src/app/classes/{technique-vm,filter,gradient,layout-options,metadata,link}.ts
// (MITRE ATT&CK Navigator, Apache-2.0). Serialization output and validation are kept identical;
// console.error/alert diagnostics are collected in `layerWarnings` instead of alert().

/* eslint-disable @typescript-eslint/no-explicit-any */
import tinycolor from 'tinycolor2';
import tinygradient from 'tinygradient';

/** Non-fatal import diagnostics (reference: console.error / alert). Drained by the UI. */
export const layerWarnings: string[] = [];
const warn = (...parts: unknown[]) => {
    const msg = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    layerWarnings.push(msg);
    if (typeof console !== 'undefined') console.error(msg);
};

export class Metadata {
    public name?: string;
    public value?: string;
    public divider?: boolean;
    public serialize(): object {
        return this.name && this.value ? { name: this.name, value: this.value } : { divider: this.divider };
    }
    public deserialize(rep: any): void {
        const obj = typeof rep == 'string' ? JSON.parse(rep) : rep;
        if ('name' in obj) {
            if (typeof obj.name === 'string') this.name = obj.name;
            else warn("TypeError: Metadata field 'name' is not a string");
            if ('value' in obj) {
                if (typeof obj.value === 'string') this.value = obj.value;
                else warn("TypeError: Metadata field 'value' is not a string");
            } else warn("Error: Metadata required field 'value' not present");
        } else if ('divider' in obj) {
            if (typeof obj.divider === 'boolean') this.divider = obj.divider;
            else warn("TypeError: Metadata field 'divider' is not a boolean");
        } else warn("Error: Metadata required field 'name' or 'divider' not present");
    }
    public valid(): boolean {
        return !!((this.name && this.name.length > 0 && this.value && this.value.length > 0) || this.divider !== undefined);
    }
}

export class Link {
    public label?: string;
    public url?: string;
    public divider?: boolean;
    public serialize(): object {
        return this.label && this.url ? { label: this.label, url: this.url } : { divider: this.divider };
    }
    public deserialize(rep: any): void {
        const obj = typeof rep == 'string' ? JSON.parse(rep) : rep;
        if ('url' in obj) {
            if (typeof obj.url === 'string') this.url = obj.url;
            else warn("TypeError: Link field 'url' is not a string");
            if ('label' in obj) {
                if (typeof obj.label === 'string') this.label = obj.label;
                else warn("TypeError: Link field 'label' is not a string");
            } else warn("Error: Link required field 'label' not present");
        } else if ('divider' in obj) {
            if (typeof obj.divider === 'boolean') this.divider = obj.divider;
            else warn("TypeError: Link field 'divider' is not a boolean");
        } else warn("Error: Link required field 'url' or 'divider' not present");
    }
    public valid(): boolean {
        return !!((this.label && this.label.length > 0 && this.url && this.url.length > 0) || this.divider !== undefined);
    }
}

export class TechniqueVM {
    public techniqueID: string;
    public technique_tactic_union_id: string;
    public tactic: string;
    public score = '';
    public scoreColor: string | undefined;
    public aggregateScore: any;
    public aggregateScoreColor: string | undefined;
    public color = '';
    public enabled = true;
    public comment = '';
    public metadata: Metadata[] = [];
    public links: Link[] = [];
    public showSubtechniques = false;
    public isVisible = true;

    constructor(technique_tactic_union_id: string) {
        this.technique_tactic_union_id = technique_tactic_union_id;
        const split = technique_tactic_union_id.split('^');
        this.techniqueID = split[0];
        this.tactic = split[1];
    }

    public modified(): boolean {
        return this.annotated() || this.showSubtechniques;
    }

    public annotated(): boolean {
        return this.score != '' || this.color != '' || !this.enabled || this.comment != '' || this.links.length !== 0 || this.metadata.length !== 0;
    }

    public serialize(): string {
        const rep: Record<string, any> = {};
        rep.techniqueID = this.techniqueID;
        rep.tactic = this.tactic;
        if (this.score !== '' && !isNaN(Number(this.score))) rep.score = Number(this.score);
        rep.color = this.color;
        rep.comment = this.comment;
        rep.enabled = this.enabled;
        rep.metadata = this.metadata.filter((m) => m.valid()).map((m) => m.serialize());
        rep.links = this.links.filter((l) => l.valid()).map((l) => l.serialize());
        rep.showSubtechniques = this.showSubtechniques;
        return JSON.stringify(rep, null, '\t');
    }

    public deserialize(rep: string, techniqueID: string | undefined, tactic: string | undefined): void {
        const obj = JSON.parse(rep);
        if (techniqueID !== undefined) this.techniqueID = techniqueID;
        else warn('ERROR: TechniqueID field not present in technique');
        if (tactic !== undefined && tactic !== '') this.tactic = tactic;
        else {
            warn(`WARNING: The tactic field on the technique ID ${techniqueID} is not defined. Annotations for this technique may not be restored.`);
        }
        if ('comment' in obj) {
            if (typeof obj.comment === 'string') this.comment = obj.comment;
            else warn('TypeError: technique comment field is not a number:', obj.comment);
        }
        if ('color' in obj && obj.color !== '') {
            if (typeof obj.color === 'string' && tinycolor(obj.color).isValid()) this.color = obj.color;
            else warn('TypeError: technique color field is not a color-string:', obj.color);
        }
        if ('score' in obj) {
            if (typeof obj.score === 'number') this.score = String(obj.score);
            else warn('TypeError: technique score field is not a number:', obj.score);
        }
        if ('enabled' in obj) {
            if (typeof obj.enabled === 'boolean') this.enabled = obj.enabled;
            else warn('TypeError: technique enabled field is not a boolean:', obj.enabled);
        }
        if ('showSubtechniques' in obj) {
            if (typeof obj.showSubtechniques === 'boolean') this.showSubtechniques = obj.showSubtechniques;
            else warn('TypeError: technique showSubtechnique field is not a boolean:', obj.showSubtechniques);
        }
        if (this.tactic !== undefined && this.techniqueID !== undefined) this.technique_tactic_union_id = this.techniqueID + '^' + this.tactic;
        else warn('ERROR: Tactic and TechniqueID field needed.');
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
    }
}

export class Filter {
    public platforms: { options: string[]; selection: string[] } = { selection: [], options: [] };

    public initPlatformOptions(domainPlatforms: string[]): void {
        this.platforms.options = JSON.parse(JSON.stringify(domainPlatforms));
        if (!this.platforms.selection.length) this.platforms.selection = JSON.parse(JSON.stringify(domainPlatforms));
    }

    public serialize(): string {
        return JSON.stringify({ platforms: this.platforms.selection });
    }

    public deserialize(rep: any): void {
        const isStringArray = (arr: unknown[]): boolean => {
            for (const item of arr) {
                if (typeof item !== 'string') {
                    warn('TypeError:', item, 'is not a string');
                    return false;
                }
            }
            return true;
        };
        if (rep.platforms) {
            if (isStringArray(rep.platforms)) {
                const compat: Record<string, string> = {
                    android: 'Android',
                    ios: 'iOS',
                    windows: 'Windows',
                    linux: 'Linux',
                    mac: 'macOS',
                    AWS: 'IaaS',
                    GCP: 'IaaS',
                    Azure: 'IaaS',
                };
                const selection = new Set<string>();
                rep.platforms.forEach((p: string) => selection.add(p in compat ? compat[p] : p));
                this.platforms.selection = Array.from(selection);
            } else warn('TypeError: filter platforms field is not a string[]');
        }
    }
}

export class Gcolor {
    constructor(public color: string) {}
}

export class Gradient {
    public colors: Gcolor[] = [new Gcolor('red'), new Gcolor('green')];
    public options: string[] = ['#ffffff', '#ff6666', '#ffaf66', '#ffe766', '#8ec843', '#66b1ff', '#ff66f4'];
    public minValue: any = 0;
    public maxValue: any = 100;
    public gradient: any;
    public gradientRGB: any;
    public presets: Record<string, Gcolor[]> = {
        redgreen: [new Gcolor('#ff6666'), new Gcolor('#ffe766'), new Gcolor('#8ec843')],
        greenred: [new Gcolor('#8ec843'), new Gcolor('#ffe766'), new Gcolor('#ff6666')],
        bluered: [new Gcolor('#66b1ff'), new Gcolor('#ff66f4'), new Gcolor('#ff6666')],
        redblue: [new Gcolor('#ff6666'), new Gcolor('#ff66f4'), new Gcolor('#66b1ff')],
        transparentblue: [new Gcolor('#ffffff00'), new Gcolor('#66b1ff')],
        transparentred: [new Gcolor('#ffffff00'), new Gcolor('#ff6666')],
    };

    constructor() {
        this.setGradientPreset('redgreen');
    }

    public serialize(): string {
        const colorList = this.colors.map((g) => tinycolor(g.color).toHex8String());
        return JSON.stringify({ colors: colorList, minValue: this.minValue, maxValue: this.maxValue }, null, '\t');
    }

    public deserialize(rep: string): void {
        const obj = JSON.parse(rep);
        const isColorStringArray = (colors: unknown[]): boolean => {
            for (const c of colors) {
                if (typeof c !== 'string' || !tinycolor(c).isValid()) {
                    warn('TypeError:', c, 'is not a color-string');
                    return false;
                }
            }
            return true;
        };
        // Reference throws a TypeError here when `colors` is missing (iterating undefined);
        // that error propagates to the layer-import error path, as in the reference.
        if (isColorStringArray(obj.colors)) {
            this.colors = obj.colors.map((hex: string) => new Gcolor(hex));
        } else warn('TypeError: gradient colors field is not a color-string[]');
        this.minValue = obj.minValue;
        this.maxValue = obj.maxValue;
        this.updateGradient();
    }

    public setGradientPreset(preset: string): void {
        this.colors = this.presets[preset].map((c) => new Gcolor(c.color));
        this.updateGradient();
    }

    public updateGradient(): void {
        this.gradient = tinygradient(this.colors.map((c) => c.color));
        this.gradientRGB = this.gradient.rgb(100);
    }

    public getHexColor(valueString: string): string | undefined {
        if (!this.gradient) this.updateGradient();
        if (valueString.length == 0) return undefined;
        const value = Number(valueString);
        if (value >= this.maxValue) return this.gradientRGB[this.gradientRGB.length - 1].toHexString();
        if (value <= this.minValue) return this.gradientRGB[0].toHexString();
        const index = ((value - this.minValue) / (this.maxValue - this.minValue)) * 100;
        const rounded = Math.min(Math.round(index), this.gradientRGB.length - 1);
        return this.gradientRGB[rounded].toHexString();
    }
}

export class LayoutOptions {
    public readonly layoutOptions = ['side', 'flat', 'mini'];
    private _layout = 'side';
    public set layout(v: string) {
        if (!this.layoutOptions.includes(v)) {
            console.warn('invalid matrix layout', v);
            return;
        }
        const old = this._layout;
        this._layout = v;
        if (this._layout == 'mini') {
            this.showID = false;
            this.showName = false;
        }
        if (old == 'mini' && v != 'mini') this.showName = true;
    }
    public get layout(): string {
        return this._layout;
    }
    public readonly aggregateFunctionOptions = ['average', 'min', 'max', 'sum'];
    private _aggregateFunction = 'average';
    public set aggregateFunction(v: string) {
        if (!this.aggregateFunctionOptions.includes(v)) {
            console.warn('invalid aggregate fx option', v);
            return;
        }
        this._aggregateFunction = v;
    }
    public get aggregateFunction(): string {
        return this._aggregateFunction;
    }
    public _showID = false;
    public set showID(v: boolean) {
        this._showID = v;
        if (v && this._layout == 'mini') this._layout = 'side';
    }
    public get showID(): boolean {
        return this._showID;
    }
    public _showName = true;
    public set showName(v: boolean) {
        this._showName = v;
        if (v && this._layout == 'mini') this._layout = 'side';
    }
    public get showName(): boolean {
        return this._showName;
    }
    public showAggregateScores = false;
    public _countUnscored = false;
    public set countUnscored(v: boolean) {
        this._countUnscored = v;
    }
    public get countUnscored(): boolean {
        return this.aggregateFunction === 'average' ? this._countUnscored : false;
    }
    public expandedSubtechniquesOptions = ['none', 'annotated', 'all'];
    private _expandedSubtechniques = 'none';
    public set expandedSubtechniques(v: string) {
        if (!this.expandedSubtechniquesOptions.includes(v)) {
            console.warn('invalid expand subtechnique option', v);
            return;
        }
        this._expandedSubtechniques = v;
    }
    public get expandedSubtechniques(): string {
        return this._expandedSubtechniques;
    }

    public serialize(): object {
        return {
            layout: this.layout,
            aggregateFunction: this.aggregateFunction,
            showID: this.showID,
            showName: this.showName,
            showAggregateScores: this.showAggregateScores,
            countUnscored: this.countUnscored,
            expandedSubtechniques: this.expandedSubtechniques,
        };
    }

    public deserialize(rep: any) {
        const check = (key: string, type: string, apply: (v: any) => void) => {
            if (key in rep) {
                if (typeof rep[key] === type) apply(rep[key]);
                else warn(`TypeError: layout field '${key}' is not a ${type}:`, rep[key]);
            }
        };
        check('showID', 'boolean', (v) => (this.showID = v));
        check('showName', 'boolean', (v) => (this.showName = v));
        check('layout', 'string', (v) => (this.layout = v));
        check('aggregateFunction', 'string', (v) => (this.aggregateFunction = v));
        check('showAggregateScores', 'boolean', (v) => (this.showAggregateScores = v));
        check('countUnscored', 'boolean', (v) => (this.countUnscored = v));
        check('expandedSubtechniques', 'string', (v) => (this.expandedSubtechniques = v));
    }
}
