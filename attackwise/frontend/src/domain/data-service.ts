// Port of nav-app/src/app/services/data.service.ts (MITRE ATT&CK Navigator, Apache-2.0).
// Parsing is unchanged. Transport: official collection-index domains are read from the
// Laravel API (`/attack/bundles/{domain}/{version}`); configured custom sources and
// bundleURL/customDataURL sources are fetched directly by the browser as in the reference.

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Asset,
    Campaign,
    DataComponent,
    DetectionStrategy,
    Domain,
    Group,
    Matrix,
    Mitigation,
    Note,
    Software,
    Technique,
    Version,
    type DomainLookup,
    type StixSDO,
} from './stix';
import { apiBase, type CollectionIndex, type ConfigService } from './config';

export const minimumSupportedVersion = '4.0';

export class DataLoadError extends Error {}

export class DataService implements DomainLookup {
    public domain_backwards_compatibility: Record<string, string> = {
        'mitre-enterprise': 'enterprise-attack',
        'mitre-mobile': 'mobile-attack',
    };
    public domains: Domain[] = [];
    public versions: Version[] = [];
    public latestVersion!: Version;
    private fetcher: typeof fetch;

    constructor(
        private configService: ConfigService,
        fetcher?: typeof fetch
    ) {
        this.fetcher = fetcher ?? ((input, init) => fetch(input, init));
        if (configService.versions?.enabled) this.setUpDomains(configService.versions.entries);
        if (configService.collectionIndex) this.parseCollectionIndex(configService.collectionIndex);
        this.versions.sort((a, b) => (+a.number > +b.number ? -1 : 1));
        this.latestVersion = this.versions[0];
    }

    public onDataLoad(domainVersionID: string, callback: () => void) {
        this.getDomain(domainVersionID)?.dataLoadedCallbacks.push(callback);
    }

    public parseBundles(domain: Domain, stixBundles: any[]): void {
        const platforms = new Set<string>();
        const seenIDs = new Set<string>();
        const matrixSDOs: StixSDO[] = [];
        const idToTacticSDO = new Map<string, StixSDO>();
        const matrixToTechniqueSDOs = new Map<string, StixSDO[]>();
        for (const bundle of stixBundles) {
            const techniqueSDOs: StixSDO[] = [];
            const bundleMatrices: StixSDO[] = [];
            const idToTechniqueSDO = new Map<string, StixSDO>();
            const analyticSDOs: StixSDO[] = [];
            for (const sdo of bundle.objects) {
                if (sdo.type != 'x-mitre-matrix') {
                    if (seenIDs.has(sdo.id)) continue;
                    seenIDs.add(sdo.id);
                }
                switch (sdo.type) {
                    case 'x-mitre-data-component':
                        domain.dataComponents.push(new DataComponent(sdo, this));
                        break;
                    case 'x-mitre-data-source':
                        domain.dataSources.set(sdo.id, { name: sdo.name, external_references: sdo.external_references });
                        break;
                    case 'intrusion-set':
                        domain.groups.push(new Group(sdo, this));
                        break;
                    case 'malware':
                    case 'tool':
                        domain.software.push(new Software(sdo, this));
                        break;
                    case 'campaign':
                        domain.campaigns.push(new Campaign(sdo, this));
                        break;
                    case 'x-mitre-asset':
                        domain.assets.push(new Asset(sdo, this));
                        break;
                    case 'x-mitre-detection-strategy':
                        domain.detectionStrategies.push(new DetectionStrategy(sdo, this));
                        break;
                    case 'x-mitre-analytic':
                        analyticSDOs.push(sdo);
                        break;
                    case 'course-of-action':
                        domain.mitigations.push(new Mitigation(sdo, this));
                        break;
                    case 'relationship':
                        this.parseRelationship(sdo, domain);
                        break;
                    case 'attack-pattern':
                        idToTechniqueSDO.set(sdo.id, sdo);
                        if (!sdo.x_mitre_is_subtechnique) techniqueSDOs.push(sdo);
                        break;
                    case 'x-mitre-tactic':
                        idToTacticSDO.set(sdo.id, sdo);
                        break;
                    case 'x-mitre-matrix':
                        matrixSDOs.push(sdo);
                        bundleMatrices.push(sdo);
                        break;
                    case 'note':
                        domain.notes.push(new Note(sdo));
                        break;
                }
            }
            this.createTechniques(techniqueSDOs, idToTechniqueSDO, domain);
            for (const m of bundleMatrices) {
                if (!matrixToTechniqueSDOs.get(m.id)) matrixToTechniqueSDOs.set(m.id, techniqueSDOs);
                else matrixToTechniqueSDOs.get(m.id)!.push(...techniqueSDOs);
            }
            this.parsePlatforms(domain).forEach((p) => platforms.add(p));
            if (domain.detectionStrategies && analyticSDOs.length && domain.relationships.detection_strategies_detect) {
                this.buildDataComponentToTechniquesMap(domain, analyticSDOs);
            }
        }
        this.createMatrices(matrixSDOs, idToTacticSDO, matrixToTechniqueSDOs, domain);
        domain.platforms = Array.from(platforms);
        domain.dataLoaded = true;
        domain.executeCallbacks();
    }

    public createTechniques(techniqueSDOs: StixSDO[], idToTechniqueSDO: Map<string, StixSDO>, domain: Domain): void {
        for (const sdo of techniqueSDOs) {
            const subtechniques: Technique[] = [];
            if (this.configService.subtechniquesEnabled && domain.relationships.subtechniques_of.has(sdo.id)) {
                domain.relationships.subtechniques_of.get(sdo.id)!.forEach((subId) => {
                    if (idToTechniqueSDO.has(subId)) {
                        const sub = new Technique(idToTechniqueSDO.get(subId)!, [], this);
                        subtechniques.push(sub);
                        domain.subtechniques.push(sub);
                    }
                });
            }
            domain.techniques.push(new Technique(sdo, subtechniques, this));
        }
    }

    public createMatrices(matrixSDOs: StixSDO[], idToTacticSDO: Map<string, StixSDO>, matrixToTechniqueSDOs: Map<string, StixSDO[]>, domain: Domain): void {
        const created: string[] = [];
        for (const sdo of matrixSDOs) {
            if (created.includes(sdo.id)) continue;
            if (sdo.x_mitre_deprecated) continue;
            const ids = (matrixToTechniqueSDOs.get(sdo.id) || []).map((t) => t.id);
            const techniques = domain.techniques.filter((t) => ids.includes(t.id));
            domain.matrices.push(new Matrix(sdo, idToTacticSDO, techniques, this));
            created.push(sdo.id);
        }
    }

    public parsePlatforms(domain: Domain): Set<string> {
        const platforms = new Set<string>();
        domain.techniques.concat(domain.subtechniques).forEach((t) => {
            if (!t.deprecated && !t.revoked) t.platforms?.forEach((p) => platforms.add(p));
        });
        return platforms;
    }

    public buildDataComponentToTechniquesMap(domain: Domain, analytics: StixSDO[]) {
        for (const det of domain.detectionStrategies) {
            const refs = domain.relationships.detection_strategies_detect.get(det.id);
            const ref = refs && refs.length > 0 ? refs[0] : undefined;
            const technique = domain.getTechniqueById(ref);
            if (!technique) continue;
            for (const analyticRef of det.analyticRefs) {
                const analytic = analytics.find((a) => a.id === analyticRef);
                const dcRefs: string[] = analytic?.x_mitre_log_source_references?.map((l: StixSDO) => l.x_mitre_data_component_ref) ?? [];
                for (const dc of dcRefs) {
                    if (!domain.dataComponentsToTechniques.has(dc)) domain.dataComponentsToTechniques.set(dc, []);
                    const list = domain.dataComponentsToTechniques.get(dc)!;
                    if (!list.some((t) => t.id === technique.id)) list.push(technique);
                }
            }
        }
    }

    public parseRelationship(sro: StixSDO, domain: Domain): void {
        const add = (map: Map<string, string[]>, key: string, value: string) => {
            if (map.has(key)) map.get(key)!.push(value);
            else map.set(key, [value]);
        };
        const r = domain.relationships;
        switch (sro.relationship_type) {
            case 'subtechnique-of':
                if (!this.configService.subtechniquesEnabled) return;
                add(r.subtechniques_of, sro.target_ref, sro.source_ref);
                break;
            case 'uses':
                if (sro.source_ref.startsWith('intrusion-set') && sro.target_ref.startsWith('attack-pattern')) add(r.group_uses, sro.source_ref, sro.target_ref);
                else if ((sro.source_ref.startsWith('malware') || sro.source_ref.startsWith('tool')) && sro.target_ref.startsWith('attack-pattern'))
                    add(r.software_uses, sro.source_ref, sro.target_ref);
                else if (sro.source_ref.startsWith('campaign') && sro.target_ref.startsWith('attack-pattern')) add(r.campaign_uses, sro.source_ref, sro.target_ref);
                break;
            case 'mitigates':
                add(r.mitigates, sro.source_ref, sro.target_ref);
                break;
            case 'revoked-by':
                r.revoked_by.set(sro.source_ref, sro.target_ref);
                break;
            case 'detects':
                if (sro.source_ref.startsWith('x-mitre-data-component')) add(r.component_rel, sro.source_ref, sro.target_ref);
                else if (sro.source_ref.startsWith('x-mitre-detection-strategy')) add(r.detection_strategies_detect, sro.source_ref, sro.target_ref);
                break;
            case 'attributed-to':
                add(r.campaigns_attributed_to, sro.target_ref, sro.source_ref);
                break;
            case 'targets':
                add(r.targeted_assets, sro.target_ref, sro.source_ref);
                break;
        }
    }

    public setUpDomains(versions: any[]) {
        versions.forEach((version) => {
            const v = this.addVersion(version['name'], version['version'].match(/\d+/g)[0]);
            version['domains'].forEach((d: any) => {
                const domain = new Domain(d['identifier'], d['name'], v);
                if (version['authentication']) domain.authentication = version['authentication'];
                if (d['taxii_url'] && d['taxii_collection']) {
                    domain.taxii_url = d['taxii_url'];
                    domain.taxii_collection = d['taxii_collection'];
                } else {
                    domain.urls = d['data'];
                }
                this.domains.push(domain);
            });
        });
    }

    public parseCollectionIndex(index: CollectionIndex) {
        for (const collection of index.collections) {
            const identifier = this.getDomainIdentifier(collection.name);
            // Reference quirk kept on purpose: the reference stores {version, url} without `minor`,
            // so `undefined < minor` is always false and the FIRST listed entry of each major wins.
            // The Laravel API resolves a major version the same way (AttackIndex::resolveVersion).
            const minorVersionMap = collection.versions.reduce<Record<number, { version: string; url: string }>>((acc, version) => {
                const [major] = version.version.split('.').map(Number);
                if (!acc[major]) acc[major] = { version: version.version, url: version.url };
                return acc;
            }, {});
            for (const version of Object.values(minorVersionMap)) {
                const major = version.version.split('.')[0];
                if (+major < +minimumSupportedVersion) continue;
                const v = this.addVersion(`${index.name} v${major}`, major);
                const domain = new Domain(identifier, collection.name, v, [`${apiBase()}/attack/bundles/${encodeURIComponent(identifier)}/${encodeURIComponent(major)}`]);
                domain.official = true;
                this.domains.push(domain);
            }
        }
    }

    public getDomainIdentifier(name: string): string {
        return name.replace(/ /g, '-').replace(/&/g, 'a').toLowerCase();
    }

    public addVersion(name: string, number: string): Version {
        const existing = this.versions.find((v) => v.name === name && v.number === number);
        if (existing) return existing;
        const v = new Version(name, number);
        this.versions.push(v);
        return v;
    }

    /** Fetches every bundle of a domain. Throws DataLoadError on HTTP or parse failure. */
    public async getDomainData(domain: Domain): Promise<any[]> {
        if (domain.taxii_collection && domain.taxii_url) {
            throw new DataLoadError('TAXII sources are not supported by the Vue build yet (see CURRENT_PARITY.md D04).');
        }
        const headers: Record<string, string> = {};
        if (domain.authentication && domain.authentication.enabled) {
            const token = `${domain.authentication.serviceName}:${domain.authentication.apiKey}`;
            headers['Authorization'] = 'Basic ' + btoa(token);
        }
        if (domain.official) headers['Accept'] = 'application/json';
        return Promise.all(
            domain.urls.map(async (url) => {
                let res: Response;
                try {
                    res = await this.fetcher(url, { headers });
                } catch (e) {
                    throw new DataLoadError('Network error retrieving ' + url + ': ' + (e as Error).message);
                }
                if (!res.ok) throw new DataLoadError(`HTTP ${res.status} retrieving ${url}`);
                const body = await res.json();
                return domain.official ? body?.data : body;
            })
        );
    }

    public async loadDomainData(domainVersionID: string, refresh = false): Promise<void> {
        const domain = this.getDomain(domainVersionID);
        if (!domain) throw new DataLoadError("'" + domainVersionID + "' is not a valid domain & version.");
        if (domain.dataLoaded && !refresh) return;
        const bundles = await this.getDomainData(domain);
        this.parseBundles(domain, bundles);
    }

    public getDomain(domainVersionID: string): Domain | undefined {
        return this.domains.find((d) => d.id === domainVersionID);
    }

    public getDomainVersionID(domain: string, versionNumber: string | undefined): string {
        if (!versionNumber) versionNumber = this.versions[0].number;
        return domain + '-' + versionNumber;
    }

    public isSupported(version: string) {
        const match = (version.match(/\d+/g) || [''])[0];
        return this.versions.map((v) => v.number).includes(match);
    }
}
