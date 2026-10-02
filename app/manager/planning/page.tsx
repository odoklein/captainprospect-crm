"use client";

import { PlanningBoard } from "./board/PlanningBoard";

/** The shell gives this route the full remaining area (no padded, capped wrapper). */
export default function PlanningPage() {
    return <PlanningBoard />;
}
