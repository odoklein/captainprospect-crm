// Renders docs/WHITE_LABEL_PLAN.md to a designed A4 PDF.
// Working file — not a deliverable.
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "docs", "WHITE_LABEL_PLAN.md");
const OUT = path.join(ROOT, "docs", "WHITE_LABEL_PLAN.pdf");
const LOGO = path.join(ROOT, "public", "brand", "logo-inverse.png");

const C = {
    primary: "#263460",
    primaryDeep: "#18213F",
    accent: "#C64B8B",
    ink: "#1F2937",
    body: "#374151",
    muted: "#6B7280",
    line: "#E2E5EC",
    soft: "#F6F7FA",
    white: "#FFFFFF",
    code: "#F3F4F6",
    success: "#0F766E",
};

const FONT_DIR = "C:/Windows/Fonts";
const FONTS = {
    regular: path.join(FONT_DIR, "calibri.ttf"),
    bold: path.join(FONT_DIR, "calibrib.ttf"),
    italic: path.join(FONT_DIR, "calibrii.ttf"),
    mono: path.join(FONT_DIR, "consola.ttf"),
};

const PAGE = { width: 595.28, height: 841.89 };
const M = { top: 68, right: 54, bottom: 62, left: 54 };
const CONTENT_W = PAGE.width - M.left - M.right;
const BODY_TOP = M.top;
const BODY_BOTTOM = PAGE.height - M.bottom;

const doc = new PDFDocument({
    size: "A4",
    margins: M,
    bufferPages: true,
    info: {
        Title: "White-label readiness — plan and findings",
        Author: "Captain Prospect CRM",
        Subject: "Runtime per-instance branding: plan, assumptions and execution sequence",
        Keywords: "white-label, brand, instance, prisma, next.js",
    },
});

doc.registerFont("body", FONTS.regular);
doc.registerFont("body-bold", FONTS.bold);
doc.registerFont("body-italic", FONTS.italic);
doc.registerFont("mono", FONTS.mono);

const stream = fs.createWriteStream(OUT);
doc.pipe(stream);

// ── inline markdown ────────────────────────────────────────────────────────

function stripInline(s) {
    return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function parseInline(s) {
    const runs = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    let last = 0;
    let m;
    while ((m = re.exec(s))) {
        if (m.index > last) runs.push({ text: s.slice(last, m.index), bold: false, mono: false, italic: false });
        const t = m[0];
        if (t.startsWith("**")) runs.push({ text: t.slice(2, -2), bold: true, mono: false, italic: false });
        else if (t.startsWith("`")) runs.push({ text: t.slice(1, -1), bold: false, mono: true, italic: false });
        else runs.push({ text: t.slice(1, -1), bold: false, mono: false, italic: true });
        last = m.index + t.length;
    }
    if (last < s.length) runs.push({ text: s.slice(last), bold: false, mono: false, italic: false });
    return runs.length ? runs : [{ text: s, bold: false, mono: false, italic: false }];
}

function setRunFont(run, size) {
    if (run.mono) doc.font("mono").fontSize(size - 1).fillColor(C.primaryDeep);
    else if (run.bold) doc.font("body-bold").fontSize(size).fillColor(C.ink);
    else if (run.italic) doc.font("body-italic").fontSize(size).fillColor(C.body);
    else doc.font("body").fontSize(size).fillColor(C.body);
}

function inlineHeight(md, width, size, lineGap = 2.4) {
    doc.font("body").fontSize(size);
    return doc.heightOfString(stripInline(md), { width, lineGap });
}

function drawInline(md, x, y, width, size, opts = {}) {
    const runs = parseInline(md);
    let started = false;
    runs.forEach((run, i) => {
        setRunFont(run, size);
        const settings = {
            width,
            lineGap: opts.lineGap ?? 2.4,
            align: opts.align ?? "left",
            continued: i < runs.length - 1,
        };
        if (started) {
            doc.text(run.text, settings);
        } else {
            doc.text(run.text, x, y, settings);
            started = true;
        }
    });
    return doc.y;
}

// ── page furniture ─────────────────────────────────────────────────────────

function bodyPageHeader(pageIndex, total) {
    doc.switchToPage(pageIndex);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    doc.font("body").fontSize(7.5).fillColor(C.muted);
    doc.text("CAPTAIN PROSPECT CRM  ·  WHITE-LABEL READINESS", M.left, 34, {
        width: CONTENT_W / 2,
        characterSpacing: 0.6,
        lineBreak: false,
    });
    doc.text("PLAN AND FINDINGS", M.left + CONTENT_W / 2, 34, {
        width: CONTENT_W / 2,
        align: "right",
        characterSpacing: 0.6,
        lineBreak: false,
    });
    doc.moveTo(M.left, 48).lineTo(PAGE.width - M.right, 48).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.moveTo(M.left, PAGE.height - 44).lineTo(PAGE.width - M.right, PAGE.height - 44).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.font("body").fontSize(8).fillColor(C.muted);
    doc.text("Runtime branding · technical plan", M.left, PAGE.height - 36, {
        width: CONTENT_W / 2,
        lineBreak: false,
    });
    doc.font("body-bold").fontSize(8).fillColor(C.primary);
    doc.text(`${pageIndex + 1} / ${total}`, M.left, PAGE.height - 36, {
        width: CONTENT_W,
        align: "right",
        lineBreak: false,
    });
    doc.restore();
    doc.page.margins.bottom = oldBottom;
}

// ── cover ──────────────────────────────────────────────────────────────────

function cover() {
    const grad = doc.linearGradient(0, 0, PAGE.width, PAGE.height);
    grad.stop(0, C.primaryDeep).stop(0.55, C.primary).stop(1, "#101833");
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(grad);

    doc.save();
    doc.circle(PAGE.width - 40, -30, 210).lineWidth(1.2).strokeColor(C.accent).strokeOpacity(0.45).stroke();
    doc.circle(PAGE.width - 40, -30, 150).lineWidth(0.7).strokeColor(C.white).strokeOpacity(0.18).stroke();
    doc.circle(-60, PAGE.height + 30, 190).lineWidth(1).strokeColor(C.accent).strokeOpacity(0.28).stroke();
    doc.restore();

    if (fs.existsSync(LOGO)) {
        doc.image(LOGO, M.left, 58, { fit: [190, 78] });
    } else {
        doc.font("body-bold").fontSize(20).fillColor(C.white).text("CAPTAIN PROSPECT", M.left, 64);
    }

    doc.font("body-bold").fontSize(9).fillColor(C.accent).text("WHITE-LABEL READINESS", M.left, 286, {
        characterSpacing: 2.2,
    });

    doc.font("body-bold").fontSize(40).fillColor(C.white).text("One image,\nmany agencies.", M.left, 310, {
        width: CONTENT_W,
        lineGap: -2,
    });

    doc.font("body").fontSize(14).fillColor("#D7DBE8").text(
        "Plan, findings and execution sequence for runtime,\nper-instance branding — without touching the live\nCaptain Prospect deployment.",
        M.left,
        432,
        { width: 400, lineGap: 4 },
    );

    const chipY = 548;
    const chipW = 318;
    doc.roundedRect(M.left, chipY, chipW, 32, 16).fill(C.accent);
    doc.font("body-bold").fontSize(8.5).fillColor(C.white).text(
        "PLAN ONLY  ·  NO CODE OR DATABASE CHANGE YET",
        M.left + 16,
        chipY + 11,
        { characterSpacing: 0.9 },
    );

    doc.moveTo(M.left, 682).lineTo(PAGE.width - M.right, 682).lineWidth(0.6).strokeColor("#4A5578").stroke();

    const cols = [
        ["SCOPE", "CRM repository only"],
        ["STEPS", "1 – 10"],
        ["DATE", "25 October 2026"],
    ];
    cols.forEach(([k, v], i) => {
        const x = M.left + i * (CONTENT_W / 3);
        doc.font("body-bold").fontSize(7.5).fillColor("#9AA3BE").text(k, x, 702, { characterSpacing: 1.4 });
        doc.font("body").fontSize(10.5).fillColor(C.white).text(v, x, 716);
    });

    doc.font("body").fontSize(8).fillColor("#8B94B0").text(
        "Prepared for the engineering team · Control plane out of scope",
        M.left,
        PAGE.height - M.bottom - 12,
        { lineBreak: false },
    );

    doc.addPage();
}

// ── page 2: contents + control ─────────────────────────────────────────────

function frontMatter(headings) {
    doc.font("body-bold").fontSize(9).fillColor(C.accent).text("CONTENTS", M.left, 90, { characterSpacing: 1.8 });
    doc.moveTo(M.left, 108).lineTo(PAGE.width - M.right, 108).lineWidth(1).strokeColor(C.line).stroke();

    let y = 126;
    headings.forEach((h, i) => {
        const num = String(i + 1).padStart(2, "0");
        doc.font("body-bold").fontSize(9).fillColor(C.accent).text(num, M.left, y + 1, { width: 26 });
        doc.font("body-bold").fontSize(11).fillColor(C.ink).text(h, M.left + 34, y, { width: CONTENT_W - 34 });
        y += 26;
    });

    y += 18;
    doc.font("body-bold").fontSize(9).fillColor(C.accent).text("DOCUMENT CONTROL", M.left, y, { characterSpacing: 1.8 });
    y += 16;
    doc.moveTo(M.left, y).lineTo(PAGE.width - M.right, y).lineWidth(1).strokeColor(C.line).stroke();
    y += 14;

    const rows = [
        ["Status", "Plan for review. No schema, code or database change applied."],
        ["Scope", "This CRM repository. The provisioning control plane is excluded."],
        ["Database", "Live shared database. Not read, not migrated, not seeded."],
        ["Migration", "New SQL drafted by hand and validated in PGlite only."],
        ["Checks", "TypeScript, ESLint, brand:check, pure-unit tests, visual pass."],
        ["Deliverables", "Phased code for steps 1–8 and 10; written proposal for step 9."],
    ];
    rows.forEach(([k, v], i) => {
        if (i % 2 === 0) doc.rect(M.left, y - 4, CONTENT_W, 34).fill(C.soft);
        doc.font("body-bold").fontSize(8.5).fillColor(C.primary).text(k, M.left + 10, y + 3, { width: 88 });
        doc.font("body").fontSize(8.5).fillColor(C.body).text(v, M.left + 104, y + 3, { width: CONTENT_W - 118, lineGap: 1 });
        y += 34;
    });

    y += 16;
    doc.roundedRect(M.left, y, CONTENT_W, 62, 6).fill("#FDF2F7");
    doc.rect(M.left, y, 4, 62).fill(C.accent);
    doc.font("body-bold").fontSize(9).fillColor(C.accent).text("BEFORE CODE", M.left + 18, y + 12, { characterSpacing: 1.2 });
    doc.font("body").fontSize(9).fillColor(C.body).text(
        "Section 2 lists the assumptions in the brief that do not hold as written. Section 8 records the defaults this plan will use unless corrected.",
        M.left + 18,
        y + 27,
        { width: CONTENT_W - 36, lineGap: 2 },
    );
}

// ── blocks ─────────────────────────────────────────────────────────────────

let y = BODY_TOP;

function newPage() {
    doc.addPage();
    y = BODY_TOP;
}

function need(h) {
    if (y + h > BODY_BOTTOM) newPage();
}

function sectionHeading(num, title) {
    need(74);
    y += 12;
    doc.font("body-bold").fontSize(9).fillColor(C.accent).text(num, M.left, y, { width: 30 });
    doc.font("body-bold").fontSize(17).fillColor(C.primary).text(title, M.left + 34, y - 3, {
        width: CONTENT_W - 34,
        lineGap: 1,
    });
    const h = doc.heightOfString(title, { width: CONTENT_W - 34 });
    y += Math.max(24, h + 6);
    doc.moveTo(M.left, y).lineTo(PAGE.width - M.right, y).lineWidth(1.1).strokeColor(C.primary).stroke();
    doc.moveTo(M.left, y).lineTo(M.left + 54, y).lineWidth(2.4).strokeColor(C.accent).stroke();
    y += 16;
}

function subHeading(title) {
    const h = inlineHeight(`**${title}**`, CONTENT_W, 11.5);
    need(h + 26);
    y += 14;
    doc.font("body-bold").fontSize(11.5).fillColor(C.primary).text(stripInline(title), M.left, y, { width: CONTENT_W });
    y += h + 7;
}

function paragraph(md) {
    const h = inlineHeight(md, CONTENT_W, 9.6);
    need(h + 8);
    y = drawInline(md, M.left, y, CONTENT_W, 9.6);
    y += 7;
}

function bullets(items) {
    items.forEach((item) => {
        const h = inlineHeight(item, CONTENT_W - 16, 9.4);
        need(h + 6);
        doc.circle(M.left + 2.5, y + 4.2, 1.9).fill(C.accent);
        y = drawInline(item, M.left + 14, y, CONTENT_W - 14, 9.4);
        y += 5;
    });
    y += 2;
}

function numbered(items) {
    items.forEach((item, i) => {
        const h = inlineHeight(item, CONTENT_W - 22, 9.4);
        need(h + 6);
        doc.font("body-bold").fontSize(9.4).fillColor(C.accent).text(`${i + 1}.`, M.left, y, { width: 18 });
        y = drawInline(item, M.left + 22, y, CONTENT_W - 22, 9.4);
        y += 5;
    });
    y += 2;
}

function codeBlock(lines) {
    const pad = 12;
    const text = lines.join("\n");
    doc.font("mono").fontSize(8).fillColor(C.primaryDeep);
    const h = doc.heightOfString(text, { width: CONTENT_W - pad * 2, lineGap: 2 }) + pad * 2;
    need(h + 10);
    doc.roundedRect(M.left, y, CONTENT_W, h, 4).fill(C.code);
    doc.rect(M.left, y, 3, h).fill(C.accent);
    doc.font("mono").fontSize(8).fillColor(C.primaryDeep).text(text, M.left + pad, y + pad, {
        width: CONTENT_W - pad * 2,
        lineGap: 2,
    });
    y += h + 12;
}

function tableWidths(cols) {
    const fractions = {
        2: [0.44, 0.56],
        3: [0.3, 0.44, 0.26],
        4: [0.24, 0.3, 0.24, 0.22],
        5: [0.2, 0.22, 0.2, 0.2, 0.18],
    };
    const f = fractions[cols.length] || cols.map(() => 1 / cols.length);
    return f.map((v) => v * CONTENT_W);
}

function table(rows) {
    const header = rows[0];
    const body = rows.slice(1);
    const widths = tableWidths(header);
    const pad = 5.5;
    const headSize = 8;
    const bodySize = 7.9;

    const headH =
        Math.max(
            ...header.map((c, i) => {
                doc.font("body-bold").fontSize(headSize);
                return doc.heightOfString(stripInline(c), { width: widths[i] - pad * 2, lineGap: 1 });
            }),
        ) + pad * 2;

    const drawHead = () => {
        doc.rect(M.left, y, CONTENT_W, headH).fill(C.primary);
        let x = M.left;
        header.forEach((c, i) => {
            doc.font("body-bold").fontSize(headSize).fillColor(C.white).text(stripInline(c), x + pad, y + pad, {
                width: widths[i] - pad * 2,
                lineGap: 1,
            });
            x += widths[i];
        });
        y += headH;
    };

    need(headH + 30);
    drawHead();

    body.forEach((row, ri) => {
        const cells = row.map((c) => stripInline(c));
        const rowH =
            Math.max(
                ...cells.map((c, i) => {
                    doc.font(i === 0 ? "body-bold" : "body").fontSize(bodySize);
                    return doc.heightOfString(c, { width: widths[i] - pad * 2, lineGap: 1.2 });
                }),
            ) +
            pad * 2;

        if (y + rowH > BODY_BOTTOM) {
            newPage();
            drawHead();
        }

        if (ri % 2 === 1) doc.rect(M.left, y, CONTENT_W, rowH).fill(C.soft);
        let x = M.left;
        cells.forEach((c, i) => {
            doc.font(i === 0 ? "body-bold" : "body")
                .fontSize(bodySize)
                .fillColor(i === 0 ? C.ink : C.body)
                .text(c, x + pad, y + pad, { width: widths[i] - pad * 2, lineGap: 1.2 });
            x += widths[i];
        });
        y += rowH;
        doc.moveTo(M.left, y).lineTo(PAGE.width - M.right, y).lineWidth(0.4).strokeColor(C.line).stroke();
    });

    doc.rect(M.left, y - (body.length ? 0 : 0), 0, 0);
    y += 14;
}

function divider() {
    y += 4;
    need(12);
    doc.moveTo(M.left, y).lineTo(PAGE.width - M.right, y).lineWidth(0.5).strokeColor(C.line).stroke();
    y += 12;
}

// ── parse the markdown ────────────────────────────────────────────────────

const md = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const lines = md.split("\n");

// The opening title and status line are replaced by the cover and control page.
let start = lines.findIndex((l) => l.startsWith("## 1."));
if (start < 0) start = 0;

const headings = lines
    .filter((l) => l.startsWith("## "))
    .map((l) => l.replace(/^##\s+\d+\.\s*/, "").trim());

cover();
frontMatter(headings);
doc.addPage();
y = BODY_TOP;

let i = start;
let inCode = false;
let codeLines = [];
let listBuf = [];
let listOrdered = false;
let tableBuf = [];
let paraBuf = [];
let firstSection = true;

function flushPara() {
    if (!paraBuf.length) return;
    paragraph(paraBuf.join(" "));
    paraBuf = [];
}

function flushList() {
    if (!listBuf.length) return;
    if (listOrdered) numbered(listBuf);
    else bullets(listBuf);
    listBuf = [];
}

function flushTable() {
    if (!tableBuf.length) return;
    const rows = tableBuf
        .filter((r) => !/^\|[\s:|-]+\|$/.test(r))
        .map((r) =>
            r
                .replace(/^\|/, "")
                .replace(/\|$/, "")
                .split("|")
                .map((c) => c.trim()),
        );
    if (rows.length) table(rows);
    tableBuf = [];
}

while (i < lines.length) {
    const line = lines[i];

    if (inCode) {
        if (line.startsWith("```")) {
            codeBlock(codeLines);
            codeLines = [];
            inCode = false;
        } else {
            codeLines.push(line);
        }
        i++;
        continue;
    }

    if (line.startsWith("```")) {
        flushPara();
        flushList();
        flushTable();
        inCode = true;
        i++;
        continue;
    }

    if (line.startsWith("## ")) {
        flushPara();
        flushList();
        flushTable();
        if (!firstSection) {
            const used = y - BODY_TOP;
            if (used > 300) {
                doc.addPage();
                y = BODY_TOP;
            } else {
                y += 6;
            }
        }
        firstSection = false;
        const m = line.match(/^##\s+(\d+)\.\s*(.+)$/);
        if (m) sectionHeading(m[1].padStart(2, "0"), m[2].trim());
        else sectionHeading("—", line.replace(/^##\s+/, "").trim());
        i++;
        continue;
    }

    if (line.startsWith("### ")) {
        flushPara();
        flushList();
        flushTable();
        subHeading(line.replace(/^###\s+/, "").trim());
        i++;
        continue;
    }

    if (line.startsWith("|")) {
        flushPara();
        flushList();
        tableBuf.push(line);
        i++;
        continue;
    }

    if (/^---+$/.test(line.trim())) {
        flushPara();
        flushList();
        flushTable();
        divider();
        i++;
        continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
        flushPara();
        flushTable();
        if (listOrdered && listBuf.length) flushList();
        listOrdered = false;
        listBuf.push(line.replace(/^\s*[-*]\s+/, "").trim());
        i++;
        continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
        flushPara();
        flushTable();
        if (!listOrdered && listBuf.length) flushList();
        listOrdered = true;
        listBuf.push(line.replace(/^\s*\d+\.\s+/, "").trim());
        i++;
        continue;
    }

    if (line.trim() === "") {
        flushPara();
        flushList();
        flushTable();
        i++;
        continue;
    }

    // continuation of a wrapped list item
    if (listBuf.length && /^\s{2,}\S/.test(line) && !line.trim().startsWith("|")) {
        listBuf[listBuf.length - 1] += " " + line.trim();
        i++;
        continue;
    }

    // keep a "Signature:"-style lead-in with the code block that follows
    if (paraBuf.length === 0 && line.trim().endsWith(":") && (lines[i + 1] || "").startsWith("```")) {
        need(96);
    }

    paraBuf.push(line.trim());
    i++;
}

flushPara();
flushList();
flushTable();
if (inCode && codeLines.length) codeBlock(codeLines);

// ── footer numbering on every page except the cover ───────────────────────

const range = doc.bufferedPageRange();
const total = range.count;
for (let p = 1; p < total; p++) bodyPageHeader(p, total);

doc.end();

stream.on("finish", () => {
    const st = fs.statSync(OUT);
    console.log(`PDF written: ${OUT}`);
    console.log(`Pages: ${total}`);
    console.log(`Size: ${st.size} bytes`);
});
