export interface CustomDefense {
    id: string;
    name: string;
    description: string;
    attackIDs: string[];
}
export class PlanningState {
    attackScores: Record<string, number | null> = {};
    defenseScores: Record<string, number> = {};
    selectedDefenses: string[] = [];
    customDefenses: CustomDefense[] = [];
    defenseStatus: Record<string, string> = {};
    ratings: Record<string, Record<string, string>> = {};
    defenseSelections: Record<string, Record<string, boolean>> = {};
    standaloneDefenses: string[] = [];
    manualDefenseMappings: Record<string, string[]> = {};
    riskFormula: 'strongest' | 'average' | 'sum' = 'strongest';
    finalized = false;
}
export function validScore(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
}
export function scoreStyle(score: unknown, defense = false) {
    if (!validScore(score)) return { label: 'Not Rated', symbol: '◇', color: '#cbd5e1', level: 'missing' };
    const index = score <= 3 ? 0 : score <= 6 ? 1 : 2;
    return {
        label: (defense ? ['Weak Defense', 'Moderate Defense', 'Strong Defense'] : ['Low Attack Risk', 'Moderate Attack Risk', 'High Attack Risk'])[
            index
        ],
        symbol: ['●', '■', '▲'][index],
        color: (defense ? ['#fda4af', '#fcd34d', '#86efac'] : ['#86efac', '#fcd34d', '#fda4af'])[index],
        level: ['low', 'medium', 'high'][index],
    };
}
export function restorePlanning(value: any): PlanningState {
    const state = new PlanningState();
    for (const key of ['attackScores', 'defenseScores']) {
        for (const [id, score] of Object.entries(value?.[key] || {})) if (validScore(score)) state[key][id] = score;
    }
    if (Array.isArray(value?.selectedDefenses)) state.selectedDefenses = value.selectedDefenses.filter((id) => typeof id === 'string');
    if (Array.isArray(value?.customDefenses))
        state.customDefenses = value.customDefenses.filter(
            (d) =>
                typeof d?.id === 'string' &&
                d.id.startsWith('custom-') &&
                typeof d.name === 'string' &&
                typeof d.description === 'string' &&
                Array.isArray(d.attackIDs) &&
                d.attackIDs.every((id) => typeof id === 'string')
        );
    for (const [id, status] of Object.entries(value?.defenseStatus || {})) if (['Deployed', 'Planned', 'Not Applicable'].includes(String(status))) state.defenseStatus[id] = String(status);
    for (const [attack, ratings] of Object.entries(value?.ratings || {})) {
        if (!ratings || typeof ratings !== 'object') continue;
        state.ratings[attack] = {};
        for (const [id,status] of Object.entries(ratings)) if (['full','partial','none'].includes(String(status))) state.ratings[attack][id] = String(status);
    }
    for (const [attack, selections] of Object.entries(value?.defenseSelections || {})) {
        if (!selections || typeof selections !== 'object') continue;
        state.defenseSelections[attack] = {};
        for (const [id, selected] of Object.entries(selections)) if (typeof selected === 'boolean') state.defenseSelections[attack][id] = selected;
    }
    if (Array.isArray(value?.standaloneDefenses)) state.standaloneDefenses = value.standaloneDefenses.filter(id => typeof id === 'string');
    for (const [id, targets] of Object.entries(value?.manualDefenseMappings || {})) if (Array.isArray(targets)) state.manualDefenseMappings[id] = targets.filter(t => typeof t === 'string');
    if (['strongest','average','sum'].includes(value?.riskFormula)) state.riskFormula = value.riskFormula;
    return state;
}
