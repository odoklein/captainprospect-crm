import fs from "node:fs";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.DOMMatrix = globalThis.DOMMatrix || DOMMatrix;
globalThis.ImageData = globalThis.ImageData || ImageData;
globalThis.Path2D = globalThis.Path2D || Path2D;

const file = process.argv[2] || "docs/WHITE_LABEL_PLAN.pdf";
const outDir = process.argv[3] || "work/proof";
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(file));
const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
console.log("pages", pdf.numPages);

for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const out = path.join(outDir, `page-${String(n).padStart(2, "0")}.png`);
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log(out, canvas.width, canvas.height);
}
