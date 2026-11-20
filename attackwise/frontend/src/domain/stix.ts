// Ported from MITRE ATT&CK Navigator (Apache-2.0, see attackwise/NOTICE.txt):
// nav-app/src/app/classes/stix/*.ts and classes/domain.ts, classes/version.ts.
// Framework-free; behaviour (including error paths) intentionally mirrors the reference.

/** Minimal lookup used by STIX objects that need relationship data of their domain. */
export interface DomainLookup {
    getDomain(domainVersionID: string): Domain | undefined;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type StixSDO = Record<string, any>;

export class StixError extends Error {}

export abstract class StixObject {
    public readonly id: string;
    public readonly attackID!: string;
    public readonly name: string;
    public readonly description: string;
    public readonly url: string;
    public readonly created: string;
    public readonly modified: string;
    public readonly revoked: boolean;
    public readonly deprecated: boolean;
    public readonly version: string;
    protected readonly lookup: DomainLookup;

    constructor(stixSDO: StixSDO, lookup: DomainLookup, supportsAttackID = true) {
        this.id = stixSDO.id;
        this.name = stixSDO.name;
        this.description = stixSDO?.description ?? '';
        this.created = stixSDO.created;
        this.modified = stixSDO.modified;
        this.revoked = stixSDO.revoked ? stixSDO.revoked : false;
        this.deprecated = stixSDO.x_mitre_deprecated ? stixSDO.x_mitre_deprecated : false;
        this.version = stixSDO.x_mitre_version ? stixSDO.x_mitre_version : '';
        this.lookup = lookup;
        if (supportsAttackID) {
            const refs = stixSDO.external_references;
            if (refs && refs[0] && refs[0].external_id) {
                this.attackID = refs[0].external_id;
            } else {
                // Reference shows alert() and throws; callers surface the failure.
                throw new StixError('Error: external_references has invalid format in imported StixObject (ID: ' + stixSDO.id + ')');
            }
        }
        if ('external_references' in stixSDO && stixSDO.external_references.length > 0) {
            this.url = stixSDO.external_references[0].url;
        } else {
            this.url = '';
        }
    }

    /** 0 when equal or unversioned; >0 if this is newer; <0 if that is newer. */
    public compareVersion(that: StixObject): number {
        if (!this.version || !that.version) return 0;
        const a = this.version.split('.');
        const b = that.version.split('.');
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a.length == b.length && a.length < i) return 0;
            if (a.length < i) return -1;
            if (b.length < i) return 1;
            if (+a[i] == +b[i]) continue;
            return +a[i] - +b[i];
        }
        return 0;
    }

    public revoked_by(domainVersionID: string): string | undefined {
        const rels = this.lookup.getDomain(domainVersionID)?.relationships.revoked_by;
        return rels?.has(this.id) ? rels.get(this.id) : undefined;
    }
}

export class Technique extends StixObject {
    public readonly platforms: string[] | undefined;
    public readonly tactics!: string[];
    public readonly subtechniques: Technique[];
    public readonly datasources: string;
    public parent: Technique | null = null;
    public get isSubtechnique() {
        return this.parent != null;
    }

    constructor(stixSDO: StixSDO, subtechniques: Technique[], lookup: DomainLookup) {
        super(stixSDO, lookup);
        this.platforms = stixSDO.x_mitre_platforms ? stixSDO.x_mitre_platforms.map((p: string) => p.trim()) : undefined;
        this.datasources = stixSDO.x_mitre_data_sources ? stixSDO.x_mitre_data_sources.toString() : '';
        if (!this.revoked && !this.deprecated) {
            this.tactics = stixSDO.kill_chain_phases.map((phase: StixSDO) => phase.phase_name);
        }
        this.subtechniques = subtechniques.filter((sub) => !(sub.deprecated || sub.revoked));
        for (const sub of this.subtechniques) sub.parent = this;
    }

    public get_technique_tactic_id(tactic: string | Tactic): string {
        const shortname = tactic instanceof Tactic ? tactic.shortname : tactic;
        if (!this.tactics.includes(shortname)) throw new Error(shortname + ' is not a tactic of ' + this.attackID);
        return this.attackID + '^' + shortname;
    }

    public get_all_technique_tactic_ids(): string[] {
        if (this.revoked || this.deprecated) return [];
        return this.tactics.map((s) => this.get_technique_tactic_id(s));
    }
}

export class Tactic extends StixObject {
    public readonly techniques: Technique[];
    public readonly shortname: string;
    constructor(stixSDO: StixSDO, techniques: Technique[], lookup: DomainLookup) {
        super(stixSDO, lookup);
        this.shortname = stixSDO.x_mitre_shortname;
        this.techniques = techniques.filter((t) => !t.revoked && !t.deprecated && t.tactics.includes(this.shortname));
    }
}

export class Matrix extends StixObject {
    public readonly tactics: Tactic[];
    constructor(stixSDO: StixSDO, idToTacticSDO: Map<string, StixSDO>, techniques: Technique[], lookup: DomainLookup) {
        super(stixSDO, lookup);
        this.tactics = stixSDO.tactic_refs
            .map((id: string) => idToTacticSDO.get(id))
            .filter((sdo: StixSDO | undefined) => sdo)
            .map((sdo: StixSDO) => new Tactic(sdo, techniques, lookup));
    }
}

export class Mitigation extends StixObject {
    public mitigated(domainVersionID: string): string[] {
        const rels = this.lookup.getDomain(domainVersionID)?.relationships.mitigates;
        return rels?.get(this.id) ?? [];
    }
}

/** Objects parsed for parity of load-time validation; their search UI is not reachable in the reference. */
export class Group extends StixObject {}
export class Campaign extends StixObject {}
export class Asset extends StixObject {}
export class Software extends StixObject {
    public readonly platforms: string[] | undefined;
    constructor(stixSDO: StixSDO, lookup: DomainLookup) {
        super(stixSDO, lookup);
        this.platforms = stixSDO.x_mitre_platforms ? stixSDO.x_mitre_platforms.map((p: string) => p.trim()) : undefined;
    }
}
export class DataComponent extends StixObject {
    public readonly dataSource: string;
    constructor(stixSDO: StixSDO, lookup: DomainLookup) {
        super(stixSDO, lookup, false);
        this.dataSource = stixSDO.x_mitre_data_source_ref;
    }
}
export class DetectionStrategy extends StixObject {
    public readonly analyticRefs: string[];
    constructor(stixSDO: StixSDO, lookup: DomainLookup) {
        super(stixSDO, lookup);
        this.analyticRefs = stixSDO.x_mitre_analytic_refs ?? [];
    }
}
export class Note {
    public readonly abstract?: string;
    public readonly content: string;
    public readonly object_refs: string[];
    constructor(stixSDO: StixSDO) {
        if (stixSDO.abstract) this.abstract = stixSDO.abstract;
        this.content = stixSDO.content;
        this.object_refs = stixSDO.object_refs;
    }
}

export class Version {
    constructor(
        public readonly name: string,
        public readonly number: string
    ) {}
}

export interface ServiceAuth {
    enabled: boolean;
    serviceName: string;
    apiKey: string;
}

export class Domain {
    public readonly id: string;
    public readonly domain_identifier: string;
    public readonly name: string;
    public readonly version: Version;
    public urls: string[] = [];
    public taxii_url = '';
    public taxii_collection = '';
    public authentication?: ServiceAuth;
    public dataLoaded = false;
    public dataLoadedCallbacks: (() => void)[] = [];
    public isCustom = false;
    /** true when bundles are read through the ATT&CKWISE Laravel API (official collection index). */
    public official = false;

    public matrices: Matrix[] = [];
    public get tactics(): Tactic[] {
        return this.matrices.flatMap((m) => m.tactics);
    }
    public techniques: Technique[] = [];
    public platforms: string[] = [];
    public subtechniques: Technique[] = [];
    public software: Software[] = [];
    public campaigns: Campaign[] = [];
    public assets: Asset[] = [];
    public dataComponents: DataComponent[] = [];
    public dataSources = new Map<string, { name: string; external_references: unknown[] }>();
    public dataComponentsToTechniques = new Map<string, Technique[]>();
    public groups: Group[] = [];
    public mitigations: Mitigation[] = [];
    public detectionStrategies: DetectionStrategy[] = [];
    public notes: Note[] = [];
    public relationships = {
        subtechniques_of: new Map<string, string[]>(),
        component_rel: new Map<string, string[]>(),
        detection_strategies_detect: new Map<string, string[]>(),
        group_uses: new Map<string, string[]>(),
        software_uses: new Map<string, string[]>(),
        campaign_uses: new Map<string, string[]>(),
        campaigns_attributed_to: new Map<string, string[]>(),
        mitigates: new Map<string, string[]>(),
        revoked_by: new Map<string, string>(),
        targeted_assets: new Map<string, string[]>(),
    };

    constructor(domain_identifier: string, name: string, version: Version, urls?: string[]) {
        this.id = `${domain_identifier}-${version.number}`;
        this.domain_identifier = domain_identifier;
        this.name = name;
        this.version = version;
        if (urls) this.urls = urls;
    }

    public getVersion(): string {
        return this.version.number;
    }

    public executeCallbacks(): void {
        for (const cb of this.dataLoadedCallbacks) cb();
    }

    public getTechniqueById(stixId: string | undefined): Technique | null {
        return this.techniques.find((t) => t.id === stixId) ?? null;
    }
}
