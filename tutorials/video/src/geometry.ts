// Pure geometry shared by the capture script and the video (no Remotion imports).
import type { Box } from "./types";

export type Pt = { x: number; y: number };

/** Where the pointer lands on a box: centre, or near the left edge of wide rows. */
export function hotspot(b: Box): Pt {
    return { x: b.w > 320 ? b.x + Math.min(160, b.w * 0.25) : b.x + b.w / 2, y: b.y + b.h / 2 };
}
