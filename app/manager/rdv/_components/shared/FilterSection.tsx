"use client";

import { useState, type ReactNode } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          color: "var(--ink)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: open ? 10 : 0,
        }}
      >
        {title}
        {open ? (
          <ChevronUp size={14} style={{ color: "var(--ink3)" }} />
        ) : (
          <ChevronDown size={14} style={{ color: "var(--ink3)" }} />
        )}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {children}
        </div>
      )}
    </div>
  );
}
