"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The breadcrumb bar belongs to the shell, but what sits on its right (save
// state, the page's main action) belongs to the view that is open. Views render
// <CrumbActions> and it lands in the bar, so the location and its actions stay
// on one line at the top of the screen.

const CrumbSlotContext = createContext<HTMLElement | null>(null);

export const CrumbSlotProvider = CrumbSlotContext.Provider;

export function CrumbActions({ children }: { children: ReactNode }) {
    const slot = useContext(CrumbSlotContext);
    return slot ? createPortal(children, slot) : null;
}
