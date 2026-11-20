import { validScore } from './planning-state';
export type RiskFormula = 'strongest' | 'average' | 'sum';
export function calculateRisk(attack: unknown, defenses: unknown[], formula: RiskFormula) {
    if (!validScore(attack) || defenses.some(score => !validScore(score))) return { defense: null, result: null, risk: null };
    const scores = defenses as number[];
    const defense = !scores.length ? 0 : formula === 'sum' ? scores.reduce((a,b)=>a+b,0) : formula === 'average' ? scores.reduce((a,b)=>a+b,0) / scores.length : Math.max(...scores);
    const raw = attack - defense;
    return { defense: Math.round(defense * 100) / 100, result: Math.round(raw * 100) / 100, risk: Math.max(0,Math.min(10,raw)) };
}
