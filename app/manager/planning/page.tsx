"use client";

import { PlanningBoard } from "./board/PlanningBoard";

export default function PlanningPage() {
    return (
        <div className="h-[calc(100vh-64px)]">
            <PlanningBoard />
        </div>
    );
}
