import { Injectable } from '@angular/core';
import { ViewModel } from '../classes/view-model';

export interface SavedPlan {
    id: string;
    name: string;
    updated: number;
    data: string;
}

const KEY = 'attackwise-plans';
const LEGACY_KEY = 'attackwise-draft';

/** Autosaves every plan in this browser so work survives closing the site. */
@Injectable({ providedIn: 'root' })
export class PlanStorageService {
    constructor() {
        this.migrateLegacyDraft();
    }

    list(): SavedPlan[] {
        try {
            const value = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(value)
                ? value.filter((p) => typeof p?.id === 'string' && typeof p.data === 'string').sort((a, b) => b.updated - a.updated)
                : [];
        } catch {
            return [];
        }
    }

    get(id: string): SavedPlan | undefined {
        return this.list().find((p) => p.id === id);
    }

    /** Returns false when browser storage is unavailable or full. */
    save(vm: ViewModel): boolean {
        if (!vm) return false;
        if (!vm.planId) vm.planId = newPlanId();
        try {
            const plan: SavedPlan = { id: vm.planId, name: vm.name, updated: Date.now(), data: vm.serialize(false) };
            this.write([plan, ...this.list().filter((p) => p.id !== plan.id)]);
            return true;
        } catch {
            return false;
        }
    }

    remove(id: string): void {
        try {
            this.write(this.list().filter((p) => p.id !== id));
        } catch {
            /* Nothing to remove when storage is unavailable. */
        }
    }

    private write(plans: SavedPlan[]) {
        localStorage.setItem(KEY, JSON.stringify(plans));
    }

    private migrateLegacyDraft() {
        try {
            const raw = localStorage.getItem(LEGACY_KEY);
            if (!raw) return;
            const obj = JSON.parse(raw);
            const id = obj?.attackwise?.planId || newPlanId();
            if (obj.attackwise) obj.attackwise.planId = id;
            if (!this.list().some((p) => p.id === id)) {
                this.write([{ id, name: obj?.name || 'Plan', updated: Date.now(), data: JSON.stringify(obj) }, ...this.list()]);
            }
            localStorage.removeItem(LEGACY_KEY);
        } catch {
            /* Ignore unreadable legacy drafts. */
        }
    }
}

export function newPlanId() {
    return 'plan-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
