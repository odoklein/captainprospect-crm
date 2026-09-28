"use client";

import { ActionCockpit } from "./_components/ActionCockpit";

// SDR action cockpit: table-first work queue. Structure:
//   _lib/        pure logic (types, status semantics, queue selectors + tests)
//   _hooks/      data + behaviour (scope, status config, queue, logging, keyboard)
//   _components/ UI (header, segment tiles, command bar, table, composer, overlays)
export default function SDRActionPage() {
    return <ActionCockpit />;
}
