// Port of DataService.compareVersions, VersionChangelog and ViewModel.initCopyAnnotations /
// copyAnnotations (MITRE ATT&CK Navigator, Apache-2.0). These run when a user accepts the
// "Upgrade layer version?" dialog. The interactive upgrade sidebar is not rendered by the
// ATT&CKWISE reference (DataTable is always in planning mode), so only this automatic step is reachable.

import type { DataService } from '../domain/data-service';
import type { Domain, Technique } from '../domain/stix';
import type { ViewModel } from './view-model';

export class VersionChangelog {
    additions: string[] = [];
    changes: string[] = [];
    minor_changes: string[] = [];
    deprecations: string[] = [];
    revocations: string[] = [];
    unchanged: string[] = [];
    reviewed = new Set<string>();
    copied = new Set<string>();
    constructor(
        public oldDomainVersionID: string,
        public newDomainVersionID: string
    ) {}
}

export function getTechnique(data: DataService, attackID: string, domainVersionID: string): Technique | undefined {
    const domain = data.getDomain(domainVersionID)!;
    return domain.techniques.concat(domain.subtechniques).find((t) => t.attackID == attackID);
}

export function compareVersions(data: DataService, oldID: string, newID: string): VersionChangelog {
    const changelog = new VersionChangelog(oldID, newID);
    const oldDomain = data.getDomain(oldID) as Domain;
    const newDomain = data.getDomain(newID) as Domain;
    const previous = oldDomain.techniques.concat(oldDomain.subtechniques);
    const latest = newDomain.techniques.concat(newDomain.subtechniques);
    const lookup = new Map<string, Technique | undefined>(latest.map((t) => [t.id, previous.find((p) => p.id == t.id)]));
    for (const t of latest) {
        if (!t) continue;
        const prev = lookup.get(t.id);
        if (!prev) {
            if (t.deprecated || t.revoked) continue;
            changelog.additions.push(t.attackID);
        } else if (t.modified == prev.modified) {
            if (prev.revoked || prev.deprecated) continue;
            changelog.unchanged.push(t.attackID);
        } else if (t.revoked && !prev.revoked) changelog.revocations.push(t.attackID);
        else if (t.revoked && prev.revoked) continue;
        else if (t.deprecated && !prev.deprecated) changelog.deprecations.push(t.attackID);
        else if (t.deprecated && prev.deprecated) continue;
        else if (t.compareVersion(prev) != 0) changelog.changes.push(t.attackID);
        else changelog.minor_changes.push(t.attackID);
    }
    return changelog;
}

export function initCopyAnnotations(to: ViewModel, from: ViewModel, changelog: VersionChangelog): void {
    const data = to.dataService;
    const copy = (attackID: string) => {
        const fromTechnique = getTechnique(data, attackID, from.domainVersionID);
        if (!fromTechnique) return;
        const domain = data.getDomain(to.domainVersionID)!;
        const tactics = fromTechnique.tactics.map((s) => domain.tactics.find((t) => t.shortname == s));
        for (const tactic of tactics) {
            // Reference throws here when a tactic no longer exists; the throw happens inside an
            // RxJS completion handler and is only logged. Skipping is the observable equivalent.
            if (!tactic) continue;
            const fromVM = from.techniqueVMs.get(fromTechnique.get_technique_tactic_id(tactic.shortname));
            if (!fromVM?.annotated()) continue;
            const toTechnique = getTechnique(data, attackID, to.domainVersionID);
            const toVM = toTechnique && to.techniqueVMs.get(toTechnique.get_technique_tactic_id(tactic.shortname));
            if (!toVM) continue;
            changelog.reviewed.delete(fromTechnique.attackID);
            toVM.deserialize(fromVM.serialize(), fromTechnique.attackID, tactic.shortname);
            toVM.scoreColor = to.gradient.getHexColor(toVM.score);
            fromVM.enabled = false;
            changelog.copied.add(fromVM.technique_tactic_union_id);
            if (fromTechnique.get_all_technique_tactic_ids().every((id) => changelog.copied.has(id))) changelog.reviewed.add(fromTechnique.attackID);
        }
    };
    changelog.unchanged.forEach(copy);
    changelog.minor_changes.forEach(copy);
}
