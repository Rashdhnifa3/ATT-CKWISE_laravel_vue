import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { saveAs } from "file-saver";
type Lang = 'ar' | 'en';

export interface ReportInput {
  formula?: string; riskIndex?: number | null;
  lang: Lang; version: string; coverage: number; posture: string; covered: number; partial: number; gaps: number; total: number;
  tactics: { name: string; total: number; covered: number; partial: number; gaps: number; pct: number }[];
  rows: { id: string; name: string; tactic: string; status: string; defenses: string }[];
  recommendations: string[];
  chart?: { data: Uint8Array; width: number; height: number } | undefined;
}

export async function exportDocx(r: ReportInput) {
  const rtl = r.lang === "ar";
  const L = (en: string, ar: string) => (rtl ? ar : en);
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, rightToLeft: rtl, font: rtl ? "Arial" : "Calibri", ...o });
  const p = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new Paragraph({ bidirectional: rtl, spacing: { after: 120 }, children: [run(text, o)] });
  const h = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, bidirectional: rtl, spacing: { before: 300, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "6366F1", space: 1 } }, children: [run(text, { bold: true, size: 30, color: "1E1B4B" })] });
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const W = 9360;
  const table = (head: string[], widths: number[], body: string[][]) => new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths, visuallyRightToLeft: rtl,
    rows: [head, ...body].map((cells, ri) => new TableRow({ tableHeader: ri === 0, children: cells.map((c, ci) => new TableCell({
      borders, width: { size: widths[ci]!, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
      ...(ri === 0 ? { shading: { fill: "312E81", type: ShadingType.CLEAR } } : {}),
      children: [new Paragraph({ bidirectional: rtl, children: [run(c, { bold: ri === 0, size: 18, ...(ri === 0 ? { color: "FFFFFF" } : {}) })] })],
    })) })),
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ATT&CKWISE", bold: true, size: 48, color: "4F46E5" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: rtl, spacing: { after: 300 }, children: [run(L("Executive Threat Defense Report — MITRE ATT&CK Enterprise", "التقرير التنفيذي لخطة الدفاع — MITRE ATT&CK Enterprise"), { size: 24, color: "555555" })] }),
    p(new Date().toLocaleDateString(rtl ? "ar" : "en-GB", { dateStyle: "long" }), { color: "777777" }),
    p("ATT&CK dataset version: " + r.version),
    h(L("Executive summary", "الملخص التنفيذي")),
    p(L("Risk formula: ", "معادلة الخطر: ") + (r.formula || '—')),
    p(L("Residual risk index: ", "مؤشر الخطر المتبقي: ") + (r.riskIndex === null || r.riskIndex === undefined ? L('Not Rated','غير مقيّم') : r.riskIndex + '/100')),
    p(L('A = attack score. D = selected linked defense scores. Negative results are preserved; the 0–100 index uses max(0, A − D). Missing scores are not zero.', 'A = سكور الهجوم. D = سكورات الدفاعات المختارة المرتبطة. تظهر النتائج السالبة كما هي ويستخدم المؤشر max(0, A − D). السكور المفقود ليس صفراً.')),
    p(L(`Defense-selection coverage: ${r.coverage}% — ${r.posture}`, `نسبة تغطية اختيار الدفاعات: ${r.coverage}% — ${r.posture}`), { bold: true, size: 26 }),
    p(L(`Of ${r.total} selected attack techniques, ${r.covered} have a selected defense and ${r.gaps} have no selected defense.`,
        `من أصل ${r.total} تقنية هجوم محددة: ${r.covered} لها دفاع مختار، و${r.gaps} دون دفاع مختار.`)),
    p(L("Coverage reflects selected related defenses, not verified deployment or effectiveness.", "التغطية تعكس اختيار الدفاعات المرتبطة ولا تؤكد التطبيق أو فعالية الحماية.")),
    h(L("Tactical coverage breakdown", "تحليل التغطية حسب التكتيك")),
  ];
  if (r.chart) {
    const w = 600, hgt = Math.round((r.chart.height / r.chart.width) * w);
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: r.chart.data, transformation: { width: w, height: hgt }, altText: { title: "Risk formula chart", description: "Mean attack minus defense score by tactic", name: "chart" } })] }));
  }
  children.push(table([L("Tactic", "التكتيك"), L("Techniques", "التقنيات"), L("Defended", "محمية"), L("Partial", "جزئية"), L("Gaps", "ثغرات"), L("Coverage", "التغطية")],
    [3160, 1240, 1240, 1240, 1240, 1240], r.tactics.map((t) => [t.name, `${t.total}`, `${t.covered}`, `${t.partial}`, `${t.gaps}`, `${t.pct}%`])));
  children.push(h(L("Selected attacks and selected defenses", "مصفوفة الهجمات المحددة والدفاعات المختارة")));
  children.push(table([L("ID", "المعرف"), L("Technique", "التقنية"), L("Tactic", "التكتيك"), L("Status", "الحالة"), L("Defenses (official + custom)", "الدفاعات (رسمية + مخصصة)")],
    [900, 2000, 1500, 1260, 3700], r.rows.map((x) => [x.id, x.name, x.tactic, x.status, x.defenses])));
  children.push(h(L("Key remediation recommendations", "أهم توصيات المعالجة")));
  r.recommendations.forEach((t, i) => children.push(p(`${i + 1}. ${t}`)));

  const doc = new Document({
    styles: { default: { document: { run: { font: rtl ? "Arial" : "Calibri", size: 22 } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  saveAs(await Packer.toBlob(doc), `ATTACKWISE-Report-${new Date().toISOString().slice(0, 10)}.docx`);
}
