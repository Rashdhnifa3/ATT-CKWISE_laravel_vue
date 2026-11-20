// Port of nav-app/src/app/services/config.service.ts (MITRE ATT&CK Navigator, Apache-2.0).
// Differences: plain fetch instead of HttpClient; the official collection index is read
// through the ATT&CKWISE Laravel API instead of directly from GitHub (shared/contracts/api.md).

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FeatureObject {
    name: string;
    enabled: boolean;
    description?: string;
    display_name?: string;
    subfeatures?: FeatureObject[];
}

export interface VersionsConfig {
    enabled: boolean;
    entries: any[];
}

export interface CollectionIndex {
    name: string;
    collections: { name: string; versions: { version: string; url: string }[] }[];
    [k: string]: unknown;
}

/** API base for the official ATT&CK data endpoints. Same-origin `/api/v1` unless built otherwise. */
export function apiBase(): string {
    const configured = (import.meta.env?.VITE_ATTACKWISE_API_BASE as string | undefined) ?? '/api/v1';
    return configured.replace(/\/+$/, '');
}

export class ConfigError extends Error {}

export class ConfigService {
    public collectionIndex: CollectionIndex | null = null;
    public collectionIndexURL = '';
    public versions: VersionsConfig = { enabled: false, entries: [] };
    public defaultLayers: { enabled?: boolean; urls?: string[] } = {};
    public commentColor = 'yellow';
    public linkColor = 'blue';
    public metadataColor = 'purple';
    public banner = '';
    public featureList: FeatureObject[] = [];
    public customizefeatureList: FeatureObject[] = [];
    public contextMenuItems: { label: string; url: string; subtechnique_url?: string }[] = [];

    private features = new Map<string, boolean>();
    private featureGroups = new Map<string, string[]>();

    public get subtechniquesEnabled(): boolean {
        return this.features.get('subtechniques') as boolean;
    }

    public getFeature(name: string): boolean {
        return this.features.get(name) as boolean;
    }

    public getFeatureGroupCount(group: string): number {
        if (!this.featureGroups.has(group)) return -1;
        return this.featureGroups.get(group)!.filter((f) => this.getFeature(f)).length;
    }

    public setFeature(featureName: string, value: unknown): string[] {
        if (typeof value == 'boolean') {
            if (this.featureGroups.has(featureName)) {
                this.featureGroups.get(featureName)!.forEach((sub) => this.setFeature(sub, value));
            } else {
                this.features.set(featureName, value);
            }
            return [featureName];
        }
        if (typeof value == 'object' && value) {
            let subfeatures: string[] = [];
            Object.keys(value).forEach((field) => {
                subfeatures = subfeatures.concat(this.setFeature(field, (value as Record<string, unknown>)[field]));
            });
            this.featureGroups.set(featureName, subfeatures);
            return subfeatures;
        }
        return [];
    }

    public setFeature_object(featureObject: FeatureObject, override: boolean | null = null): string[] {
        if (!Object.prototype.hasOwnProperty.call(featureObject, 'subfeatures')) {
            const enabled = override !== null ? override : featureObject.enabled;
            this.features.set(featureObject.name, enabled);
            return [featureObject.name];
        }
        if (!override) override = !featureObject.enabled ? false : null;
        let subfeatures: string[] = [];
        for (const sub of featureObject.subfeatures || []) subfeatures = subfeatures.concat(this.setFeature_object(sub, override));
        this.featureGroups.set(featureObject.name, subfeatures);
        return subfeatures;
    }

    public isFeature(name: string): boolean {
        return this.features.has(name);
    }
    public isFeatureGroup(name: string): boolean {
        return this.featureGroups.has(name);
    }

    /** Same regex as the reference: only `\w+=\w+` pairs after # or &. */
    public getAllFragments(url: string = window.location.href): Map<string, string> {
        const fragments = new Map<string, string>();
        const regex = /[#&](\w+)=(\w+)/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(url))) fragments.set(match[1], match[2]);
        return fragments;
    }

    public validateConfig(config: any): any {
        if (!config.collection_index_url && !config.versions?.entries?.length) {
            throw new ConfigError(`'collection_index_url' or 'versions' must be defined`);
        }
        if (config.collection_index_url && typeof config.collection_index_url !== 'string') {
            throw new ConfigError(`'collection_index_url' must be a string`);
        }
        return config;
    }

    /** Loads ./assets/config.json and, when configured, the official collection index (via API). */
    public async loadConfig(fetcher: typeof fetch = fetch.bind(window)): Promise<void> {
        const res = await fetcher('./assets/config.json');
        if (!res.ok) throw new ConfigError(`config.json returned HTTP ${res.status}`);
        const config = this.validateConfig(await res.json());
        for (const item of config['custom_context_menu_items'] || []) this.contextMenuItems.push(item);
        this.defaultLayers = config['default_layers'] || {};
        this.commentColor = config['comment_color'];
        this.linkColor = config['link_color'];
        this.metadataColor = config['metadata_color'];
        this.banner = config['banner'] || '';
        this.featureList = config['features'] || [];
        this.customizefeatureList = config['customize_features'] || [];
        this.featureList.forEach((f) => this.setFeature_object(f));
        this.customizefeatureList.forEach((f) => this.setFeature_object(f));
        this.getAllFragments().forEach((value, key) => {
            if (this.isFeature(key) || this.isFeatureGroup(key)) this.setFeature(key, value == 'true');
        });
        this.versions = config['versions'];
        if (config['collection_index_url']) {
            this.collectionIndexURL = config['collection_index_url'];
            const indexRes = await fetcher(apiBase() + '/attack/index', { headers: { Accept: 'application/json' } });
            if (!indexRes.ok) throw new ConfigError('collection index failed to load. HTTP ' + indexRes.status);
            const body = await indexRes.json();
            if (!body || typeof body !== 'object' || !body.data) throw new ConfigError('collection index failed to load. Unexpected API response');
            this.collectionIndex = body.data;
        }
    }
}
