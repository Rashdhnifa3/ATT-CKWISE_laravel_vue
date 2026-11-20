#!/usr/bin/env node
/**
 * Imports the ATT&CK ↔ D3FEND mapping workbook into a compact JSON asset used by the planner.
 *
 * Usage: node scripts/import-d3fend.mjs [path/to/workbook.xlsx]
 * Default source: data/d3fend/ATTACK_D3FEND_complete_mapping.xlsx
 * Output:         src/assets/d3fend/attack-d3fend.json (reference data, overwritten on every run)
 *                 data/d3fend/import-report.json        (validation report)
 * Definitions:    data/d3fend/d3fend-definitions.json   (official d3f:definition text from the D3FEND ontology, optional)
 *
 * The output is fully regenerated and sorted, so running the import again never creates duplicates.
 * Only built-in Node modules are used.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // attackwise/frontend
const shared = resolve(root, '../shared/data/d3fend');
const source = resolve(process.argv[2] || resolve(shared, 'ATTACK_D3FEND_complete_mapping.xlsx'));
const outFile = resolve(root, 'public/assets/d3fend/attack-d3fend.json');
const reportFile = resolve(shared, 'import-report.json');
const definitionsFile = resolve(shared, 'd3fend-definitions.json');
let definitions = {};
try {
    definitions = JSON.parse(readFileSync(definitionsFile, 'utf8')).definitions || {};
} catch {
    console.warn('No D3FEND definitions found at ' + definitionsFile + '; defenses will have no description.');
}

/** Minimal ZIP reader (central directory + deflate/stored entries). */
function unzip(buffer) {
    let eocd = buffer.length - 22;
    while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('Not a ZIP/XLSX file');
    const count = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    const files = new Map();
    for (let i = 0; i < count; i++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt central directory');
        const method = buffer.readUInt16LE(offset + 10);
        const compressed = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const local = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
        const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
        const raw = buffer.subarray(dataStart, dataStart + compressed);
        files.set(name, method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null);
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return files;
}

const decode = (s) =>
    s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e) =>
        e === 'lt'
            ? '<'
            : e === 'gt'
              ? '>'
              : e === 'quot'
                ? '"'
                : e === 'apos'
                  ? "'"
                  : e === 'amp'
                    ? '&'
                    : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    );
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Parses a worksheet into header-keyed objects. Supports inline/str cells and shared strings. */
function readSheet(xml, shared) {
    const rows = [];
    for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
        const cells = [];
        for (const c of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
            const attrs = c[1];
            const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
            const type = /\bt="(\w+)"/.exec(attrs)?.[1];
            const body = c[2] || '';
            let value = '';
            if (type === 'inlineStr') value = [...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decode(m[1])).join('');
            else {
                const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
                value = v === undefined ? '' : type === 's' ? (shared[Number(v)] ?? '') : decode(v);
            }
            cells[ref ? colIndex(ref) : cells.length] = value.trim();
        }
        rows.push(Array.from(cells, (v) => v ?? ''));
    }
    const [header, ...data] = rows;
    return data.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function loadWorkbook(path) {
    const files = unzip(readFileSync(path));
    const text = (name) => files.get(name)?.toString('utf8') || '';
    const shared = [...text('xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((si) =>
        [...si[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decode(m[1])).join('')
    );
    const rels = Object.fromEntries(
        [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
            /Id="([^"]+)"/.exec(m[0])[1],
            /Target="([^"]+)"/.exec(m[0])[1],
        ])
    );
    const sheets = {};
    for (const m of text('xl/workbook.xml').matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
        const name = decode(/name="([^"]+)"/.exec(m[0])[1]);
        const target = rels[/r:id="([^"]+)"/.exec(m[0])[1]].replace(/^\/?(xl\/)?/, 'xl/');
        sheets[name] = readSheet(text(target), shared);
    }
    return sheets;
}

const ATTACK_ID = /^T\d{4}(\.\d{3})?$/;
const D3FEND_ID = /^[A-Za-z][A-Za-z0-9-]*$/;
const D3FEND_TACTICS = new Set(['Model', 'Harden', 'Detect', 'Isolate', 'Deceive', 'Evict', 'Restore']);

const sheets = loadWorkbook(source);
const detailed = sheets['Detailed Relationships'];
if (!detailed) throw new Error('Sheet "Detailed Relationships" not found. Sheets: ' + Object.keys(sheets).join(', '));
const required = [
    'ATT&CK Tactic',
    'Parent Technique ID',
    'Sub-technique ID',
    'ATT&CK Technique / Sub-technique',
    'D3FEND Tactic',
    'D3FEND Defense',
    'D3FEND Ontology ID',
    'Mapping Type',
];
const missingColumns = required.filter((c) => detailed.length && !(c in detailed[0]));
if (missingColumns.length) throw new Error('Missing required columns: ' + missingColumns.join(', '));

const report = {
    source: basename(source),
    sheets: Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.length])),
    rowsRead: detailed.length,
    rejected: [],
    conflicts: [],
    groupedMismatches: [],
};
const defenses = new Map(); // id -> { name, tactic, query }
const attacks = new Map(); // attackID -> { name, tactics:Set }
const relations = new Map(); // key -> relation

for (const [i, row] of detailed.entries()) {
    const rowNumber = i + 2;
    const parent = row['Parent Technique ID'];
    const sub = row['Sub-technique ID'];
    const attackID = sub || parent;
    const defenseID = row['D3FEND Ontology ID'];
    const reject = (reason) => report.rejected.push({ row: rowNumber, attackID, defenseID, reason });
    if (!ATTACK_ID.test(attackID)) {
        reject('Invalid ATT&CK ID');
        continue;
    }
    if (sub && !sub.startsWith(parent + '.')) {
        reject('Sub-technique ID does not belong to parent technique ID');
        continue;
    }
    if (!sub && parent.includes('.')) {
        reject('Parent technique ID has a sub-technique format');
        continue;
    }
    if (!D3FEND_ID.test(defenseID)) {
        reject('Invalid D3FEND ontology ID');
        continue;
    }
    const tactic = row['D3FEND Tactic'];
    if (tactic && !D3FEND_TACTICS.has(tactic)) {
        reject('Unknown D3FEND tactic: ' + tactic);
        continue;
    }

    const defense = { name: row['D3FEND Defense'] || '', tactic: tactic || '', query: row['D3FEND Query Defense'] || '' };
    const known = defenses.get(defenseID);
    if (!known) defenses.set(defenseID, defense);
    else if (known.name !== defense.name || known.tactic !== defense.tactic || known.query !== defense.query)
        report.conflicts.push({ row: rowNumber, defenseID, kept: known, found: defense });

    const attack = attacks.get(attackID) || { name: row['ATT&CK Technique / Sub-technique'], tactics: new Set() };
    if (row['ATT&CK Tactic']) attack.tactics.add(row['ATT&CK Tactic']);
    attacks.set(attackID, attack);

    // Identity of a relationship: technique, defense and the artifact evidence. The ATT&CK tactic only
    // records where the technique appears, so identical rows under different tactics are merged.
    const evidence = [row['Defense Artifact Relation'] || '', row['Offensive Artifact Relation'] || '', row['Offensive Artifact'] || ''];
    const key = [attackID, defenseID, ...evidence, row['Mapping Type'] || ''].join('\u0001');
    const rel = relations.get(key) || { attackID, defenseID, evidence, type: row['Mapping Type'] || '', tactics: new Set() };
    if (row['ATT&CK Tactic']) rel.tactics.add(row['ATT&CK Tactic']);
    relations.set(key, rel);
}

// Cross-check against the "Grouped Mapping" sheet (unique defenses per tactic + technique).
const grouped = sheets['Grouped Mapping'] || [];
for (const g of grouped) {
    const attackID = g['Sub-technique ID'] || g['Parent Technique ID'];
    const found = new Set(
        [...relations.values()].filter((r) => r.attackID === attackID && r.tactics.has(g['ATT&CK Tactic'])).map((r) => r.defenseID)
    );
    const expected = Number(g['Unique D3FEND Defenses']);
    if (found.size !== expected) report.groupedMismatches.push({ attackID, tactic: g['ATT&CK Tactic'], expected, found: found.size });
}

const sorted = [...relations.values()].sort(
    (a, b) => a.attackID.localeCompare(b.attackID) || a.defenseID.localeCompare(b.defenseID) || a.evidence.join().localeCompare(b.evidence.join())
);
const mappings = {};
for (const r of sorted) {
    const list = (mappings[r.attackID] ||= []);
    let entry = list.find((e) => e.d === r.defenseID && e.t === r.type);
    if (!entry) list.push((entry = { d: r.defenseID, t: r.type, e: [] }));
    entry.e.push([...r.evidence, [...r.tactics].sort()]);
}
const output = {
    format: 'attackwise-d3fend-v1',
    source: {
        file: basename(source),
        sheet: 'Detailed Relationships',
        note: 'D3FEND inferred mappings based on shared digital artifacts. A mapping is not a verified mitigation or evidence of effectiveness.',
        attackVersion: null,
        d3fendVersion: null,
    },
    defenses: Object.fromEntries(
        [...defenses]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([id, d]) => [id, { ...d, description: definitions[id]?.definition || '' }])
    ),
    attacks: Object.fromEntries(
        [...attacks].sort(([a], [b]) => a.localeCompare(b)).map(([id, a]) => [id, { name: a.name, tactics: [...a.tactics].sort() }])
    ),
    mappings,
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(output) + '\n');

Object.assign(report, {
    uniqueRelationships: sorted.length,
    uniqueDefensesWithMappings: defenses.size,
    attackIDsCovered: attacks.size,
    techniquesCovered: [...attacks.keys()].filter((id) => !id.includes('.')).length,
    subtechniquesCovered: [...attacks.keys()].filter((id) => id.includes('.')).length,
    techniqueDefensePairs: Object.values(mappings).reduce((n, list) => n + list.length, 0),
    mappingTypes: [...new Set(sorted.map((r) => r.type))],
    defensesWithoutDefinition: [...defenses.keys()].filter((id) => !definitions[id]?.definition),
    versions: 'Not present in source workbook',
});
writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(
    JSON.stringify(
        { ...report, rejected: report.rejected.length, conflicts: report.conflicts.length, groupedMismatches: report.groupedMismatches.length },
        null,
        2
    )
);
