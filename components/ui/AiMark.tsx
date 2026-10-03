import { createLucideIcon } from "lucide-react";

// The one glyph for AI-powered features (drafting, analysis, suggestions,
// enrichment). A compass needle rather than the generic sparkle: it ties AI
// to the Captain Prospect brand and reads as "guidance", not magic.
// Built with createLucideIcon, so it is a drop-in LucideIcon: same props
// (size, strokeWidth, className) and assignable to `icon: LucideIcon` fields.
export const AiMark = createLucideIcon("ai-mark", [
    ["path", { d: "M19 5 14.12 14.12 9.88 9.88Z", fill: "currentColor", key: "needle-n" }],
    ["path", { d: "M5 19 9.88 9.88 14.12 14.12Z", key: "needle-s" }],
    ["circle", { cx: "6", cy: "6", r: "1", fill: "currentColor", key: "dot" }],
]);

export default AiMark;
