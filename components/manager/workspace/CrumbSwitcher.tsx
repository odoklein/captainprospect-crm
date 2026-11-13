"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/shadcn/dropdown-menu";

export interface SwitchItem {
    id: string;
    label: string;
    meta?: string;
}

function normalize(value: string) {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * One breadcrumb step: the name opens that place, the chevron lists its
 * siblings (other clients, other missions, other pages) to jump sideways
 * without going back up the tree.
 */
export function CrumbSwitcher({ label, current, items, kind, onOpen, onSelect }: {
    label: string;
    /** This step is the page being shown (not a link). */
    current?: boolean;
    items: SwitchItem[];
    /** « client », « mission », « page »: used in labels. */
    kind: string;
    onOpen?: () => void;
    onSelect: (id: string) => void;
}) {
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const shown = useMemo(() => {
        const needle = normalize(query.trim());
        return needle ? items.filter((item) => normalize(`${item.label} ${item.meta ?? ""}`).includes(needle)) : items;
    }, [items, query]);
    const selected = items.find((item) => item.label === label)?.id;

    return (
        <span className="cw-crumb-step">
            {current || !onOpen
                ? <span className="cw-crumb-current" aria-current={current ? "page" : undefined} title={label}><span>{label}</span></span>
                : <button className="cw-crumb-link" onClick={onOpen} title={label}><span>{label}</span></button>}
            {items.length > 1 && (
                <DropdownMenu onOpenChange={(open) => { if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 0); } }}>
                    <DropdownMenuTrigger asChild>
                        <button className="cw-crumb-chevron" aria-label={`Changer de ${kind}`}><ChevronDown aria-hidden /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72" onCloseAutoFocus={(event) => event.preventDefault()}>
                        <DropdownMenuLabel>Aller à un autre {kind}</DropdownMenuLabel>
                        {items.length > 7 && <label className="cw-menu-search">
                            <Search aria-hidden />
                            <input
                                ref={inputRef}
                                value={query}
                                placeholder="Rechercher…"
                                aria-label={`Rechercher un ${kind}`}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "ArrowDown") {
                                        event.preventDefault();
                                        (event.currentTarget.closest("[role=menu]")?.querySelector("[role=menuitem]") as HTMLElement | null)?.focus();
                                        return;
                                    }
                                    if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
                                }}
                            />
                        </label>}
                        <div className="cw-menu-scroll">
                            {shown.map((item) => (
                                <DropdownMenuItem key={item.id} onSelect={() => onSelect(item.id)}>
                                    <span className="w-4 shrink-0">{item.id === selected && <Check className="h-4 w-4" aria-label="Actuel" />}</span>
                                    <span className="min-w-0 truncate">{item.label}</span>
                                    {item.meta && <span className="cw-menu-item-meta">{item.meta}</span>}
                                </DropdownMenuItem>
                            ))}
                            {!shown.length && <p className="px-2 py-3 text-xs text-ink-3">Aucun résultat</p>}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </span>
    );
}
