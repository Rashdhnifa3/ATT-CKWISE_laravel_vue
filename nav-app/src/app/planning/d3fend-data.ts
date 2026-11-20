/** MITRE D3FEND reference data imported by scripts/import-d3fend.mjs. Kept separate from user plan state. */
export const D3FEND_PREFIX = 'd3f:';

export interface D3fendDefenseInfo {
    /** Plan-state id, e.g. "d3f:FileAnalysis" (D3FEND ontology namespace + ontology ID). */
    id: string;
    ontologyID: string;
    name: string;
    /** D3FEND tactic, empty when not present in the source data. */
    tactic: string;
    /** Parent/query technique named in the source data, empty when not present. */
    query: string;
}
export interface D3fendEvidence {
    defenseRelation: string;
    offensiveRelation: string;
    artifact: string;
    /** ATT&CK tactics under which the source listed this exact relationship. */
    attackTactics: string[];
}
export interface D3fendRelation {
    attackID: string;
    defense: D3fendDefenseInfo;
    /** Mapping type exactly as written in the source, e.g. "D3FEND inferred mapping". */
    type: string;
    evidence: D3fendEvidence[];
}
export interface D3fendIndex {
    note: string;
    defenses: Map<string, D3fendDefenseInfo>;
    relations: Map<string, D3fendRelation[]>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Validates the imported asset. Malformed entries are skipped rather than guessed. */
export function parseD3fend(raw: any): D3fendIndex {
    if (raw?.format !== 'attackwise-d3fend-v1') throw new Error('Unsupported D3FEND data format');
    const defenses = new Map<string, D3fendDefenseInfo>();
    for (const [ontologyID, d] of Object.entries<any>(raw.defenses || {})) {
        if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(ontologyID)) continue;
        const id = D3FEND_PREFIX + ontologyID;
        defenses.set(id, { id, ontologyID, name: str(d?.name) || ontologyID, tactic: str(d?.tactic), query: str(d?.query) });
    }
    const relations = new Map<string, D3fendRelation[]>();
    for (const [attackID, list] of Object.entries<any>(raw.mappings || {})) {
        if (!/^T\d{4}(\.\d{3})?$/.test(attackID) || !Array.isArray(list)) continue;
        const seen = new Set<string>();
        const items: D3fendRelation[] = [];
        for (const entry of list) {
            const defense = defenses.get(D3FEND_PREFIX + str(entry?.d));
            if (!defense) continue;
            const key = defense.id + '\u0001' + str(entry.t);
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({
                attackID,
                defense,
                type: str(entry.t),
                evidence: (Array.isArray(entry.e) ? entry.e : []).map((e: any[]) => ({
                    defenseRelation: str(e?.[0]),
                    offensiveRelation: str(e?.[1]),
                    artifact: str(e?.[2]),
                    attackTactics: Array.isArray(e?.[3]) ? e[3].filter((t: unknown) => typeof t === 'string') : [],
                })),
            });
        }
        if (items.length) relations.set(attackID, items);
    }
    return { note: str(raw.source?.note), defenses, relations };
}

/**
 * Relations recorded for exactly this ATT&CK ID. A parent technique's relations are never
 * inherited by its sub-techniques (and vice versa); only explicit source rows are returned.
 */
export function d3fendRelationsFor(index: D3fendIndex | null, attackID: string): D3fendRelation[] {
    return index?.relations.get(attackID) || [];
}

export function isD3fendId(id: string) {
    return id.startsWith(D3FEND_PREFIX);
}
