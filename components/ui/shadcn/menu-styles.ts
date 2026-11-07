// Shared class strings of the menu family (DropdownMenu, ContextMenu, Select,
// Command). Geometry is concentric: panel 16px (rounded-panel) with p-1.5 →
// rows 10px. Literal strings so Tailwind's scanner sees every class.

/** The floating panel. `origin-*` and max-height are added per primitive. */
export const menuContentClassName =
    "z-(--sh-z-popover) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-panel border border-line bg-surface p-1.5 text-ink shadow-overlay outline-hidden " +
    "duration-150 ease-snappy data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 " +
    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 " +
    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

/** One row. Highlight follows keyboard focus (`focus:`) or cmdk's `data-selected`. */
export const menuItemClassName =
    "relative flex cursor-default items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-ink-2 outline-hidden select-none " +
    "transition-colors duration-100 focus:bg-surface-3 focus:text-ink " +
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-3 focus:[&_svg:not([class*='text-'])]:text-ink-2";

/** variant="destructive" on an item. */
export const menuItemDestructiveClassName =
    "data-[variant=destructive]:text-danger data-[variant=destructive]:focus:bg-danger-soft data-[variant=destructive]:focus:text-danger-ink data-[variant=destructive]:*:[svg]:text-danger!";

/** Checkbox / radio rows: room on the left for the indicator. */
export const menuCheckItemClassName = "py-1.5 pr-2 pl-8";
export const menuItemIndicatorClassName = "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center";

export const menuLabelClassName =
    "px-2 pt-2 pb-1 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase data-[inset]:pl-8";

export const menuSeparatorClassName = "-mx-1.5 my-1.5 h-px bg-line-subtle";

export const menuShortcutClassName = "ml-auto pl-4 text-xs tracking-widest text-ink-4";

export const menuSubTriggerClassName = "data-[state=open]:bg-surface-3 data-[state=open]:text-ink";
