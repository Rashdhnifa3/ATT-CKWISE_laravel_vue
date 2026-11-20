import { scoreStyle, validScore } from './planning-state';
export interface StrategyEntity { id: string; code: string; name: string; score?: number; source?: string; }
export interface StrategyRow { attack: StrategyEntity; defenses: StrategyEntity[]; totalDefenses?: number; continuation?: boolean; }
export const escapeXML = (value: string) => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
function wrap(value: string, size: number): string[] {
    const result: string[] = []; let line = '';
    for (const word of value.split(/\s+/)) {
        if (line && line.length + word.length > size) { result.push(line); line = ''; }
        let rest = word;
        while (rest.length > size) { if (line) { result.push(line); line = ''; } result.push(rest.slice(0, size)); rest = rest.slice(size); }
        line += (line ? ' ' : '') + rest;
    }
    if (line) result.push(line);
    return result.length ? result : [''];
}
const text = (value: string, x: number, y: number, size = 13, fill = '#eef3fa', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${escapeXML(value)}</text>`;
const titleLines = (e: StrategyEntity) => wrap(e.name, 32);
const nodeHeight = (e: StrategyEntity) => 96 + titleLines(e).length * 18 + (e.source ? wrap(e.source, 42).length * 13 : 0);
function node(e: StrategyEntity, x: number, y: number, defense: boolean, friendly: boolean) {
    const s = scoreStyle(e.score, defense), h = nodeHeight(e);
    const accessible = `${e.code} ${e.name}. User-defined ${defense ? 'Defense' : 'Attack'} Score: ${validScore(e.score) ? e.score + '/10' : 'not entered'}. ${s.label}. Inspect details`;
    let svg = `<g role="button" tabindex="0" data-inspect="${escapeXML(e.id)}" data-defense="${defense}" aria-label="${escapeXML(accessible)}" style="cursor:pointer"><title>${escapeXML(accessible)}</title><rect x="${x}" y="${y}" width="310" height="${h}" rx="10" fill="${defense ? '#112632' : '#172335'}" stroke="${defense ? '#3b646b' : '#405b7b'}"/><rect x="${x}" y="${y + 16}" width="3" height="${h - 32}" rx="1" fill="${s.color}"/>`;
    svg += text(e.code, x + 18, y + 25, 11, '#abbcd0', 500);
    titleLines(e).forEach((line, i) => svg += text(line, x + 18, y + 49 + i * 18, 14, '#eef3fa', 500));
    const sy = y + 55 + titleLines(e).length * 18;
    svg += text(`${s.symbol} ${validScore(e.score) ? e.score + '/10 · ' : ''}${s.label}`, x + 18, sy, 12, s.color);
    svg += `<rect x="${x + 18}" y="${sy + 12}" width="274" height="5" rx="2" fill="#0b111b"/>`;
    if (validScore(e.score)) {
        svg += `<rect x="${x + 18}" y="${sy + 12}" width="${27.4 * e.score}" height="5" fill="${s.color}"/>`;
        if (friendly) svg += `<rect x="${x + 18}" y="${sy + 12}" width="${27.4 * e.score}" height="5" fill="url(#aw-${s.level})"/>`;
    }
    if (e.source) wrap(e.source, 42).forEach((line, i) => svg += text(line, x + 18, sy + 37 + i * 13, 10, '#abbcd0'));
    return svg + '</g>';
}
/** Escapes every external string; no foreignObject, HTML, external assets, or invented risk calculations. */
export function renderStrategySVG(rows: StrategyRow[], friendly: boolean, planName = '', pageLabel = '', summary = ''): { svg: string; height: number } {
    const exporting = !!planName;
    const heading = exporting ? wrap(planName, 62) : [];
    const top = exporting ? 124 + heading.length * 25 : 52;
    const heights = rows.map(r => Math.max(nodeHeight(r.attack), r.defenses.reduce((h, d) => h + nodeHeight(d) + 14, 0) + ((r.totalDefenses || 0) > r.defenses.length ? 38 : 0), 145) + 44);
    const height = top + heights.reduce((a, b) => a + b, 0) + (exporting ? 165 : 28);
    let body = '';
    if (exporting) {
        body += text('ATT&CKWISE / VISUAL STRATEGY PLAN', 32, 36, 13, '#86dfd0', 600);
        heading.forEach((line, i) => body += text(line, 32, 72 + i * 25, 23, '#eef3fa', 500));
        body += text(pageLabel, 1050, 36, 11, '#abbcd0');
        body += text(summary, 32, 90 + heading.length * 25, 12, '#abbcd0');
    }
    body += text('01  ATTACK SCENARIOS', 32, top - 20, 10, '#abbcd0', 600);
    body += text('02  SELECTED DEFENSES', 444, top - 20, 10, '#abbcd0', 600);
    body += text('03  ASSESSMENT', 872, top - 20, 10, '#abbcd0', 600);
    let y = top;
    rows.forEach((r, i) => {
        const h = heights[i] - 44, ay = y + (h - nodeHeight(r.attack)) / 2;
        const resultY = y + (h - 140) / 2;
        let dy = y;
        body += `<path d="M20 ${y + h + 22} H1180" stroke="#253449" stroke-dasharray="3 6"/>`;
        const connector = (fromX: number, fromY: number, toX: number, toY: number, gap = false) => `<path d="M${fromX} ${fromY} C${fromX + 48} ${fromY},${toX - 48} ${toY},${toX} ${toY}" fill="none" stroke="${gap ? '#a9b4c5' : '#608c9d'}" stroke-width="1.5" ${gap ? 'stroke-dasharray="5 5"' : ''}/>`;
        if (r.defenses.length) {
            for (const d of r.defenses) {
                const center = dy + nodeHeight(d) / 2;
                body += connector(342, ay + nodeHeight(r.attack) / 2, 444, center);
                body += connector(754, center, 872, resultY + 70);
                body += node(d, 444, dy, true, friendly);
                dy += nodeHeight(d) + 14;
            }
        } else {
            body += connector(342, ay + nodeHeight(r.attack) / 2, 444, y + h / 2, true);
            body += connector(754, y + h / 2, 872, resultY + 70, true);
            body += `<rect x="444" y="${y + h / 2 - 40}" width="310" height="80" rx="10" fill="#111b29" stroke="#718399" stroke-dasharray="5 5"/>`;
            body += text('○ No selected defense', 462, y + h / 2 - 3, 14, '#cbd5e1');
            body += text('Research relevant mitigations', 462, y + h / 2 + 20, 11, '#abbcd0');
        }
        body += node(r.attack, 32, ay, false, friendly);
        if ((r.totalDefenses || 0) > r.defenses.length) {
            body += `<g role="button" tabindex="0" data-expand="${escapeXML(r.attack.id)}" aria-label="Expand all defenses for ${escapeXML(r.attack.name)}" style="cursor:pointer"><rect x="444" y="${dy}" width="310" height="32" rx="5" fill="#203149"/>${text('+ ' + (r.totalDefenses - r.defenses.length) + ' more defenses · Expand group', 460, dy + 21, 11, '#96c5ff')}</g>`;
        }
        const count = r.totalDefenses ?? r.defenses.length;
        body += `<rect x="872" y="${resultY}" width="296" height="140" rx="10" fill="#111b29" stroke="#3c526a"/>`;
        body += text(count ? '◆ Selected defense mapped' : '○ Coverage gap', 890, resultY + 28, 13, count ? '#86dfd0' : '#cbd5e1', 500);
        body += text(count + ' selected mitigation' + (count === 1 ? '' : 's'), 890, resultY + 51, 11, '#abbcd0');
        body += text('Modeled Residual Risk', 890, resultY + 82, 11, '#abbcd0');
        body += text('Unavailable', 890, resultY + 103, 14, '#eef3fa');
        body += text('No documented scoring method', 890, resultY + 123, 10, '#abbcd0');
        y += heights[i];
    });
    if (exporting) {
        body += text('USER-DEFINED SCORES  /  0–10', 32, y + 18, 11, '#86dfd0', 600);
        body += text('● 0–3 Low Attack Risk / Weak Defense     ■ 4–6 Moderate Attack Risk / Moderate Defense', 32, y + 43, 12);
        body += text('▲ 7–10 High Attack Risk / Strong Defense. Green: low risk or strong defense. Amber: middle. Red: high risk or weak defense.', 32, y + 65, 11);
        body += text('◆ Selected defense mapped   ○ Coverage gap. Mappings do not verify effectiveness. Residual risk is not calculated.', 32, y + 88, 11, '#abbcd0');
        body += text('Source: MITRE ATT&CK. Parent mappings are inherited; custom mappings are user-defined. Additional sources not integrated.', 32, y + 111, 11, '#abbcd0');
        body += text(friendly ? 'Color Blind Friendly: numeric labels, distinct symbols and band patterns enabled.' : 'Scenario assessments are user-defined, not verified real-world effectiveness.', 32, y + 134, 11, '#abbcd0');
    }
    return { height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="group" aria-label="Attack to defense strategy map"><defs><pattern id="aw-low" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0 14 14" stroke="#101827" stroke-width="2"/></pattern><pattern id="aw-medium" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 0V9" stroke="#101827" stroke-width="2"/></pattern><pattern id="aw-high" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0 5 5" stroke="#101827" stroke-width="2"/></pattern></defs><style>text{font-family:Arial,sans-serif}g[role=button]:focus{outline:none}g[role=button]:focus>rect:first-of-type{stroke:#96c5ff;stroke-width:3}g[role=button]:hover>rect:first-of-type{stroke:#96c5ff}</style><rect width="1200" height="${height}" fill="#0d1622"/>${body}</svg>` };
}
