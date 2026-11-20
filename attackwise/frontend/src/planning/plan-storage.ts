// Port of nav-app/src/app/planning/plan-storage.service.ts (ATT&CKWISE reference).
// Keys and record shape are unchanged so Angular and Vue can share one origin's storage:
//   attackwise-plans  JSON array of {id, name, updated, data: <serialized layer string>}
//   attackwise-draft  legacy single-plan draft; migrated into attackwise-plans then removed
// Documented strengthenings (CURRENT_PARITY.md ST-05/ST-06), reference-compatible on rollback:
//   * if attackwise-plans holds unreadable JSON, it is copied once to
//     attackwise-plans-unreadable-backup before the first overwrite (the reference overwrote it);
//   * array entries this version does not recognise are kept on write (the reference dropped them).

export interface SavedPlan {
    id: string;
    name: string;
    updated: number;
    data: string;
}

export const PLANS_KEY = 'attackwise-plans';
export const LEGACY_KEY = 'attackwise-draft';
export const UNREADABLE_BACKUP_KEY = 'attackwise-plans-unreadable-backup';

export interface Serializable {
    planId: string;
    name: string;
    serialize(visibleOnly: boolean): string;
}

const isPlan = (p: unknown): p is SavedPlan =>
    !!p && typeof (p as SavedPlan).id === 'string' && typeof (p as SavedPlan).data === 'string';

export function newPlanId() {
    return 'plan-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export class PlanStorage {
    constructor(private storage: () => Storage = () => window.localStorage) {
        this.migrateLegacyDraft();
    }

    /** Raw array as stored (including unrecognised entries), or [] when absent/unreadable. */
    private rawEntries(): unknown[] {
        const raw = this.storage().getItem(PLANS_KEY);
        if (raw === null) return [];
        try {
            const value = JSON.parse(raw);
            return Array.isArray(value) ? value : [];
        } catch {
            return [];
        }
    }

    list(): SavedPlan[] {
        try {
            return this.rawEntries()
                .filter(isPlan)
                .sort((a, b) => b.updated - a.updated);
        } catch {
            return [];
        }
    }

    get(id: string): SavedPlan | undefined {
        return this.list().find((p) => p.id === id);
    }

    /** Returns false when browser storage is unavailable or full. */
    save(vm: Serializable | null | undefined): boolean {
        if (!vm) return false;
        if (!vm.planId) vm.planId = newPlanId();
        try {
            const plan: SavedPlan = { id: vm.planId, name: vm.name, updated: Date.now(), data: vm.serialize(false) };
            const others = this.rawEntries().filter((p) => !(isPlan(p) && p.id === plan.id));
            this.write([plan, ...others]);
            return true;
        } catch {
            return false;
        }
    }

    remove(id: string): void {
        try {
            this.write(this.rawEntries().filter((p) => !(isPlan(p) && p.id === id)));
        } catch {
            /* Nothing to remove when storage is unavailable. */
        }
    }

    private write(plans: unknown[]) {
        const store = this.storage();
        const current = store.getItem(PLANS_KEY);
        if (current !== null && store.getItem(UNREADABLE_BACKUP_KEY) === null) {
            let readable = true;
            try {
                readable = Array.isArray(JSON.parse(current));
            } catch {
                readable = false;
            }
            if (!readable) store.setItem(UNREADABLE_BACKUP_KEY, current);
        }
        store.setItem(PLANS_KEY, JSON.stringify(plans));
    }

    private migrateLegacyDraft() {
        try {
            const raw = this.storage().getItem(LEGACY_KEY);
            if (!raw) return;
            const obj = JSON.parse(raw);
            const id = obj?.attackwise?.planId || newPlanId();
            if (obj.attackwise) obj.attackwise.planId = id;
            if (!this.list().some((p) => p.id === id)) {
                this.write([{ id, name: obj?.name || 'Plan', updated: Date.now(), data: JSON.stringify(obj) }, ...this.rawEntries()]);
            }
            this.storage().removeItem(LEGACY_KEY);
        } catch {
            /* Ignore unreadable legacy drafts (left in place, as in the reference). */
        }
    }
}
