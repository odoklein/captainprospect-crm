/**
 * Assistant PDF — public surface (server only: pdfkit).
 *
 *   renderAssistantPdf(doc)          → Buffer (render.ts)
 *   answerToBlocks / markdownToBlocks → the layout model (markdown.ts)
 *   pdfFileName(base, date)           → « bilan-acme-2026-10-29.pdf » (text.ts)
 *   conversationPdfDoc / runReportPdfDoc → what the export routes render (exports.ts)
 */

export { renderAssistantPdf, renderAssistantPdfDetailed, type AssistantPdfDoc, type AssistantPdfResult, type AssistantPdfSection } from "./render";
export { answerToBlocks, markdownToBlocks, type Block, type Run } from "./markdown";
export { attachmentHeader, frLongDate, pdfFileName, pdfSafe } from "./text";
