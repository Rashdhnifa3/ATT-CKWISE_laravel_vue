// Port of the reachable behaviour of nav-app/src/app/tabs/tabs.component.ts, the ViewModelsService
// bookkeeping it relies on, and app.component.ts (leave-site prompt). Method names follow the
// reference so CURRENT_PARITY.md rows can point at both implementations.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { markRaw, reactive } from 'vue';
import { ConfigService } from '../domain/config';
import { DataService, DataLoadError } from '../domain/data-service';
import { Domain, Version } from '../domain/stix';
import { ViewModel, layerVersion, navVersion, type PlanningView } from '../layer/view-model';
import { compareVersions, initCopyAnnotations } from '../layer/upgrade';
import { PlanStorage, type SavedPlan } from '../planning/plan-storage';
import { ui } from '../planning/ui';
import { notify } from './notify';

export interface Tab {
    title: string;
    isCloseable: boolean;
    showCloseButton: boolean;
    domain: string;
    isDataTable: boolean;
    viewModel: ViewModel | null;
}

let uidCounter = 0;

export class Workspace {
    config!: ConfigService;
    data!: DataService;
    storage!: PlanStorage;
    readonly matrix = 'enterprise-attack';
    planName = '';
    savedPlans: SavedPlan[] = [];
    deletePlanCandidate = '';
    planError = '';
    creatingPlan = false;
    activeTab: Tab | null = null;
    layerTabs: Tab[] = [];
    viewModels: ViewModel[] = [];
    bannerContent = '';
    /** Bumped when lazily-loaded domain data arrives so views recompute. */
    dataRevision = 0;
    startupError = '';

    // ---- setup ---------------------------------------------------------------------------
    async boot(fetcher?: typeof fetch): Promise<void> {
        const config = new ConfigService();
        await config.loadConfig(fetcher);
        this.config = markRaw(config);
        this.data = markRaw(new DataService(config, fetcher));
        this.storage = markRaw(new PlanStorage());
        this.bannerContent = config.banner;
        this.newBlankTab();
        this.loadTabs(config.defaultLayers).then(() => {
            if (this.layerTabs.length == 0) this.newBlankTab();
            if (!this.activeTab) this.selectTab(this.layerTabs[0]);
        });
    }

    /** Reference ngAfterViewInit: auto-create the first plan when nothing is saved. */
    afterViewInit() {
        if (!window.location.hash) {
            setTimeout(() => {
                this.refreshSavedPlans();
                if (!this.savedPlans.length) {
                    this.planName = ui.tr('Enterprise Threat Plan', 'خطة تهديدات المؤسسة');
                    this.createPlan();
                }
            });
        }
        if (isSafariAtMost13()) notify.open('safari');
    }

    // ---- saved plans ---------------------------------------------------------------------
    refreshSavedPlans() {
        this.savedPlans = this.storage.list();
    }
    savedPlanDate(plan: SavedPlan) {
        return new Date(plan.updated).toLocaleString(ui.lang === 'ar' ? 'ar' : undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    async resumePlan(plan: SavedPlan): Promise<void> {
        const open = this.plans.find((tab) => tab.viewModel?.planId === plan.id);
        if (open) {
            this.selectTab(open);
            return;
        }
        const domain = this.latestEnterpriseDomain();
        if (!domain) {
            this.planError = ui.tr('The selected ATT&CK dataset is unavailable in this configuration.', 'بيانات ATT&CK غير متاحة.');
            return;
        }
        this.planError = '';
        this.creatingPlan = true;
        try {
            if (!domain.dataLoaded) this.parse(domain, await this.data.getDomainData(domain));
            const obj = JSON.parse(plan.data);
            obj.attackwise = { ...obj.attackwise, planId: plan.id };
            this.newLayer(domain.id, obj);
        } catch {
            this.planError = ui.tr('This saved plan could not be opened.', 'تعذر فتح الخطة المحفوظة.');
        } finally {
            this.creatingPlan = false;
        }
    }

    deleteSavedPlan(plan: SavedPlan): void {
        this.storage.remove(plan.id);
        this.deletePlanCandidate = '';
        this.refreshSavedPlans();
    }

    setView(view: PlanningView) {
        if (!this.activeTab?.isDataTable || !this.activeTab.viewModel) return;
        this.activeTab.viewModel.planningView = view;
        this.storage.save(this.activeTab.viewModel);
    }

    saveAllPlans() {
        for (const tab of this.plans) this.storage.save(tab.viewModel);
    }

    private latestEnterpriseDomain(): Domain | undefined {
        return this.data.domains.filter((d) => d.domain_identifier === this.matrix).sort((a, b) => Number(b.version.number) - Number(a.version.number))[0];
    }

    get selectedCount() {
        return new Set(Array.from(this.activeTab?.viewModel?.selectedTechniques || []).map((id) => id.split('^')[0])).size;
    }
    get currentVersion() {
        return this.activeTab?.viewModel ? this.data.getDomain(this.activeTab.viewModel.domainVersionID)?.version?.number : '';
    }
    nextStep() {
        if (this.activeTab?.isDataTable) this.setView(this.activeTab.viewModel!.planningView === 'attack' ? 'defensive' : 'final');
    }
    get plans(): Tab[] {
        return this.layerTabs.filter((tab) => tab.isDataTable);
    }

    async createPlan(): Promise<void> {
        if (this.creatingPlan) return;
        const name = this.planName.trim();
        this.planError = '';
        if (!name || name.length > 100) {
            this.planError = 'Enter a plan name between 1 and 100 characters.';
            return;
        }
        const domain = this.latestEnterpriseDomain();
        if (!domain) {
            this.planError = 'The selected ATT&CK dataset is unavailable in this configuration.';
            return;
        }
        this.creatingPlan = true;
        try {
            if (!domain.dataLoaded) this.parse(domain, await this.data.getDomainData(domain));
            this.newLayer(domain.id, { name });
            if (this.activeTab?.viewModel) this.storage.save(this.activeTab.viewModel);
            this.planName = '';
        } catch (e) {
            console.error(e);
            this.planError = 'Unable to load ATT&CK. Check your connection and try again.';
        } finally {
            this.creatingPlan = false;
        }
    }

    private parse(domain: Domain, bundles: any[]) {
        this.data.parseBundles(domain, bundles);
        this.dataRevision++;
    }

    // ---- tabs ----------------------------------------------------------------------------
    openTab(title: string, viewModel: ViewModel | null, isCloseable = false, replace = true, forceNew = false, isDataTable = false): void {
        if (!forceNew) {
            const tab = this.layerTabs.find((t) => t.title === title);
            if (tab) this.selectTab(tab);
            return;
        }
        const tab: Tab = reactive({
            title,
            isCloseable,
            showCloseButton: false,
            domain: viewModel ? viewModel.domainVersionID : '',
            isDataTable,
            viewModel,
        }) as Tab;
        if (!replace || this.layerTabs.length === 0) {
            this.layerTabs.push(tab);
            this.selectTab(this.layerTabs[this.layerTabs.length - 1]);
        } else {
            for (let i = 0; i < this.layerTabs.length; i++) {
                if (this.layerTabs[i] == this.activeTab) {
                    if (this.layerTabs[i].title == 'new tab') this.closeActiveTab(true);
                    this.layerTabs.splice(i, 0, tab);
                    this.selectTab(this.layerTabs[i]);
                    return;
                }
            }
        }
    }

    newBlankTab(replace = false): void {
        this.saveAllPlans();
        this.refreshSavedPlans();
        const existing = this.layerTabs.find((tab) => !tab.isDataTable);
        if (existing) this.selectTab(existing);
        else this.openTab('new tab', null, true, replace, true, false);
    }

    selectTab(tab: Tab | undefined): void {
        this.activeTab = tab ?? null;
    }

    closeTab(tab: Tab, allowNoTab = false) {
        let action = 0;
        if (tab.viewModel) this.destroyViewModel(tab.viewModel);
        const i = this.layerTabs.findIndex((t) => t === tab);
        if (tab == this.activeTab) {
            if (i == 0 && this.layerTabs.length > 1) action = 1;
            else if (i > 0) action = 2;
            else action = 3;
        }
        this.layerTabs.splice(i, 1);
        if (allowNoTab) return;
        if (action === 1 || action === 2) this.selectTab(this.layerTabs[0]);
        else if (action === 3) this.newBlankTab();
    }

    closeActiveTab(allowNoTab = false): void {
        if (this.activeTab) this.closeTab(this.activeTab, allowNoTab);
    }

    // ---- view models ---------------------------------------------------------------------
    newViewModel(name: string, domainVersionID: string): ViewModel {
        const vm = reactive(new ViewModel(name, 'vm' + ++uidCounter, domainVersionID, this.data)) as ViewModel;
        this.viewModels.push(vm);
        return vm;
    }

    destroyViewModel(vm: ViewModel) {
        const i = this.viewModels.indexOf(vm);
        if (i >= 0) this.viewModels.splice(i, 1);
    }

    getUniqueLayerName(root: string): string {
        let id = 0;
        const isInteger = (s: string) => String(Math.floor(Number(s))) === s;
        for (const vm of this.viewModels) {
            if (!vm.name.startsWith(root)) continue;
            if (vm.name === root) {
                id = Math.max(id, 1);
                continue;
            }
            const sub = vm.name.substring(root.length);
            if (isInteger(sub)) id = Math.max(id, Number(sub) + 1);
        }
        return id != 0 ? root + id : root;
    }

    newLayer(domainVersionID: string, obj?: any): void {
        const domain = this.data.getDomain(domainVersionID)!;
        if (!domain.dataLoaded) {
            this.data
                .loadDomainData(domainVersionID, true)
                .then(() => this.dataRevision++)
                .catch((e) => console.error(e));
        }
        const name = obj && 'name' in obj && obj['name'] ? obj['name'] : this.getUniqueLayerName('layer');
        const vm = this.newViewModel(name, domainVersionID);
        if (obj) vm.deserialize(obj);
        vm.loadVMData();
        this.openTab(name, vm, true, true, true, true);
    }

    // ---- custom data / bundle URL ---------------------------------------------------------
    validateInput(loadData: { url: string; version: string; identifier: string }, domainVersionID: string): boolean {
        try {
            const url = new URL(loadData.url);
            if (isNaN(loadData.version as unknown as number)) throw Error('version is not a number');
            const exists = this.data.domains.find((d) => d.id == domainVersionID);
            if (exists && !(exists.isCustom && exists.urls[0] == url.toString())) {
                throw Error(`the domain and version specified conflict with an existing set of ATT&CK data (${exists.name} ${exists.version.name})`);
            }
            return true;
        } catch (err) {
            console.error(err);
            if (err instanceof TypeError) alert('ERROR: invalid url, check the javascript console for more information.');
            else alert('ERROR ' + (err as Error).message);
            return false;
        }
    }

    async newLayerFromURL(loadData: { url: string; version: string; identifier: string }, obj?: any): Promise<void> {
        const domainID = loadData.identifier.toLowerCase();
        const domainVersionID = this.data.getDomainVersionID(domainID, loadData.version);
        if (!this.validateInput(loadData, domainVersionID)) return;
        const url = new URL(loadData.url).toString();
        try {
            const res = await fetch(url);
            if (!res.ok) throw new DataLoadError('HTTP ' + res.status);
            await res.json();
        } catch (err) {
            console.error(err);
            alert('ERROR retrieving data from ' + url + ', check the javascript console for more information.');
            return;
        }
        const exists = this.data.domains.find((d) => d.isCustom && d.id === domainVersionID);
        if (!exists) {
            let v = this.data.versions.find((v) => v.number == loadData.version);
            if (!v) {
                v = new Version(`ATT&CK v${loadData.version}`, String(loadData.version));
                this.data.versions.push(v);
            }
            const domain = new Domain(domainID, domainID, v, [url]);
            domain.isCustom = true;
            this.data.domains.push(domain);
        }
        this.newLayer(domainVersionID, obj);
    }

    // ---- startup / fragments --------------------------------------------------------------
    getNamedFragmentValue(name: string, url: string = window.location.href): string[] {
        name = name.replace(/[[\]]/g, '\\$&');
        const regex = new RegExp('[#&]' + name + '(?:=([^&#]*)|&|#|$)', 'g');
        const results: string[] = [];
        let match = regex.exec(url);
        while (match != null) {
            // Reference: decodeURIComponent(match[1].replace(...)) — a value-less fragment throws there.
            results.push(decodeURIComponent((match[1] as string).replace(/\+/g, ' ')));
            match = regex.exec(url);
        }
        return results;
    }

    async loadTabs(defaultLayers: { enabled?: boolean; urls?: string[] }) {
        const bundleURL = this.getNamedFragmentValue('bundleURL')[0];
        const bundleVersion = this.getNamedFragmentValue('version')[0];
        const bundleDomain = this.getNamedFragmentValue('domain')[0];
        const layerURLs = this.getNamedFragmentValue('layerURL');
        if (bundleURL?.length && bundleVersion && bundleDomain?.length) {
            this.newLayerFromURL({ url: bundleURL, version: bundleVersion, identifier: bundleDomain });
        } else if (layerURLs?.length) {
            let first = true;
            for (const url of layerURLs) {
                await this.loadLayerFromURL(url, first, true);
                first = false;
            }
        } else if (defaultLayers?.['enabled']) {
            let first = true;
            for (const url of defaultLayers['urls'] || []) {
                await this.loadLayerFromURL(url, first, true);
                first = false;
            }
        }
    }

    // ---- layer import ---------------------------------------------------------------------
    async versionMismatchWarning(layerVersionStr: string): Promise<boolean> {
        const global = layerVersion.split('.');
        const layer = layerVersionStr.split('.');
        if (layer[0] === global[0] && layer[1] !== global[1]) {
            const message = `Uploaded layer version (${layerVersionStr}) is out of date. Please update to v${layerVersion} for optimal compatibility.`;
            notify.snackbar(message, 'CHANGELOG', 6500, () => notify.open('changelog'));
            return true;
        }
        if (layer[0] !== global[0]) {
            await notify.open('versionWarning', { objVersion: layerVersionStr, globalVersion: layerVersion });
        }
        return true;
    }

    async versionUpgradeDialog(viewModel: ViewModel): Promise<{ oldID: string; newID: string } | null> {
        const currVersion = this.data.latestVersion.number;
        if (viewModel.version === currVersion) return null;
        const result = await notify.open<{ upgrade: boolean }>('upgrade', {
            layerName: viewModel.name,
            vmVersion: viewModel.version,
            currVersion,
            supported: this.data.isSupported(viewModel.version),
        });
        if (!result.upgrade && !this.data.isSupported(viewModel.version)) {
            throw new Error(`Uploaded layer version (${String(viewModel.version)}) is not supported by Navigator v${navVersion}`);
        }
        if (result.upgrade) return { oldID: viewModel.domainVersionID, newID: this.data.getDomainVersionID(viewModel.domain, currVersion) };
        return null;
    }

    async upgradeLayer(oldViewModel: ViewModel, serialized: any, replace: boolean, defaultLayers = false): Promise<void> {
        const openOld = async () => {
            this.openTab('new layer', oldViewModel, true, replace, true, true);
            if (!this.data.getDomain(oldViewModel.domainVersionID)!.dataLoaded) {
                await this.data.loadDomainData(oldViewModel.domainVersionID, true);
                this.dataRevision++;
            }
            oldViewModel.deserialize(serialized);
            oldViewModel.loadVMData();
        };
        if (defaultLayers) return openOld();
        let versions: { oldID: string; newID: string } | null;
        try {
            versions = await this.versionUpgradeDialog(oldViewModel);
        } catch (err) {
            console.error(err);
            alert('ERROR parsing file, check the javascript console for more information.');
            return;
        }
        if (!versions) return openOld();
        const newVM = this.newViewModel(oldViewModel.name, versions.newID);
        newVM.version = this.data.latestVersion.number;
        newVM.deserialize(serialized, false);
        newVM.loadVMData();
        this.openTab('new layer', newVM, true, replace, true, true);
        newVM.selectTechniquesAcrossTactics = false;
        for (const id of [versions.oldID, versions.newID]) {
            if (!this.data.getDomain(id)!.dataLoaded) await this.data.loadDomainData(id, true);
        }
        this.dataRevision++;
        const changelog = compareVersions(this.data, versions.oldID, versions.newID);
        oldViewModel.deserialize(serialized);
        oldViewModel.loadVMData();
        initCopyAnnotations(newVM, oldViewModel, changelog);
    }

    /** Reference loadLayerFromFile + readJSONFile (local FileReader; nothing is uploaded). */
    async readJSONFile(file: File): Promise<void> {
        const text = await file.text();
        const loadObjAsLayer = async (layerObj: any) => {
            if (layerObj.domain && layerObj.domain !== 'enterprise-attack') {
                this.planError = ui.tr('Only Enterprise ATT&CK plans are supported in this workspace.', 'هذه الواجهة تدعم خطط Enterprise ATT&CK فقط.');
                notify.snackbar(this.planError, ui.tr('Close', 'إغلاق'), 5000);
                return;
            }
            const viewModel = this.newViewModel('loading layer...', undefined as unknown as string);
            try {
                const layerVersionStr = viewModel.deserializeDomainVersionID(layerObj);
                await this.versionMismatchWarning(layerVersionStr);
                this.versionMismatchWarning(layerVersionStr); // reference calls it twice (second not awaited)
                if (!('customDataURL' in layerObj)) {
                    if (!this.data.getDomain(viewModel.domainVersionID)) {
                        throw new Error(`Error: '${viewModel.domain}' (v${viewModel.version}) is an invalid domain.`);
                    }
                    await this.upgradeLayer(viewModel, layerObj, true);
                } else {
                    viewModel.deserialize(layerObj);
                    await this.newLayerFromURL({ url: layerObj['customDataURL'], version: viewModel.version, identifier: viewModel.domain }, layerObj);
                }
            } catch (err) {
                console.error(err);
                alert(`ERROR parsing layer, check the javascript console for more information.`);
                this.destroyViewModel(viewModel);
            }
        };
        // Reference: JSON.parse errors escape the FileReader callback (nothing visible happens).
        let layerFile: any;
        try {
            layerFile = JSON.parse(text);
        } catch (err) {
            console.error(err);
            return;
        }
        if (layerFile?.length) {
            for (const layer of layerFile) await loadObjAsLayer(layer);
        } else {
            await loadObjAsLayer(layerFile);
        }
    }

    async loadLayerFromURL(loadURL: string, replace: boolean, defaultLayers = false): Promise<void> {
        let layerFile: any;
        try {
            const res = await fetch(loadURL);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const text = await res.text();
            layerFile = JSON.parse(text);
        } catch (err) {
            console.error(err);
            alert(`ERROR retrieving layer from ${loadURL}, check the javascript console for more information.`);
            return;
        }
        const loadLayerAsync = async (layerObj: any) => {
            const viewModel = this.newViewModel('loading layer...', undefined as unknown as string);
            try {
                const layerVersionStr = viewModel.deserializeDomainVersionID(layerObj);
                await this.versionMismatchWarning(layerVersionStr);
                if (!this.data.getDomain(viewModel.domainVersionID)) {
                    throw new Error(`Error: '${viewModel.domain}' (v${viewModel.version}) is an invalid domain.`);
                }
                await this.upgradeLayer(viewModel, layerObj, replace, defaultLayers);
            } catch (err) {
                console.error(err);
                alert(`ERROR parsing layer from ${loadURL}, check the javascript console for more information.`);
                this.destroyViewModel(viewModel);
            }
        };
        if (layerFile?.length) {
            for (const layer of layerFile) await loadLayerAsync(layer);
        } else {
            await loadLayerAsync(layerFile);
        }
    }

    /** DataTable.saveLayerLocally: download the active plan as `<name lowercased, spaces→_>.json`. */
    saveLayerLocally(vm: ViewModel) {
        const json = vm.serialize(false);
        const blob = new Blob([json], { type: 'text/json' });
        const filename = vm.name.toLowerCase().replace(/ /g, '_') + '.json';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}

function isSafariAtMost13(): boolean {
    const ua = navigator.userAgent;
    if (!/Safari\//.test(ua) || /Chrome|Chromium|Edg\//.test(ua)) return false;
    const m = ua.match(/Version\/(\d+)/);
    return !!m && Number(m[1]) <= 13;
}

export const workspace = reactive(new Workspace()) as Workspace;
