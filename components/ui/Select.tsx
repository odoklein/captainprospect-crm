"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldMessage } from "./Field";

// ============================================
// SELECT COMPONENT
// ============================================

export interface SelectOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
    disabled?: boolean;
    title?: string;
}

interface SelectProps {
    options: SelectOption[];
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    error?: string;
    disabled?: boolean;
    searchable?: boolean;
    className?: string;
    /** Use on dark headers (e.g. blue-navy): light text on semi-transparent background */
    variant?: "default" | "header-dark";
    /** Max height (px) of the options list before it scrolls. Defaults to 240px. */
    maxHeight?: number;
}

export function Select({
    options,
    value,
    onChange,
    placeholder = "Sélectionner...",
    label,
    error,
    disabled = false,
    searchable = false,
    className,
    variant = "default",
    maxHeight = 240,
}: SelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find((opt) => opt.value === value);

    const filteredOptions = searchable
        ? options.filter((opt) =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : options;

    // Close on outside click (when dropdown is portaled, it's not inside containerRef so we also check for the dropdown element)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const isInsideTrigger = containerRef.current?.contains(target);
            const isInsidePortaledDropdown = (target as Element).closest?.("[data-select-dropdown]");
            if (!isInsideTrigger && !isInsidePortaledDropdown) {
                setIsOpen(false);
                setSearchQuery("");
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Keyboard navigation
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (disabled) return;

            switch (e.key) {
                case "Enter":
                    e.preventDefault();
                    if (isOpen && filteredOptions[highlightedIndex]) {
                        onChange(filteredOptions[highlightedIndex].value);
                        setIsOpen(false);
                        setSearchQuery("");
                    } else {
                        setIsOpen(true);
                    }
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    if (!isOpen) {
                        setIsOpen(true);
                    } else {
                        setHighlightedIndex((prev) =>
                            prev < filteredOptions.length - 1 ? prev + 1 : prev
                        );
                    }
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                    break;
                case "Escape":
                    setIsOpen(false);
                    setSearchQuery("");
                    break;
            }
        },
        [disabled, isOpen, filteredOptions, highlightedIndex, onChange]
    );

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && searchable && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen, searchable]);

    // For header-dark: measure trigger position when dropdown opens, so we can portal with fixed position
    const updateDropdownRect = useCallback(() => {
        if (triggerRef.current && variant === "header-dark") {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropdownRect({ top: rect.bottom + 8, left: rect.left, width: rect.width });
        } else {
            setDropdownRect(null);
        }
    }, [variant]);

    useLayoutEffect(() => {
        if (isOpen && variant === "header-dark") {
            updateDropdownRect();
        } else {
            setDropdownRect(null);
        }
    }, [isOpen, variant, updateDropdownRect]);

    useEffect(() => {
        if (isOpen && variant === "header-dark") {
            const onScrollOrResize = () => updateDropdownRect();
            window.addEventListener("scroll", onScrollOrResize, true);
            window.addEventListener("resize", onScrollOrResize);
            return () => {
                window.removeEventListener("scroll", onScrollOrResize, true);
                window.removeEventListener("resize", onScrollOrResize);
            };
        }
    }, [isOpen, variant, updateDropdownRect]);

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            {label && (
                <label className="mb-1.5 block text-[13px] font-medium text-ink-2">
                    {label}
                </label>
            )}

            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                title={selectedOption?.title}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-invalid={Boolean(error) || undefined}
                className={cn(
                    "w-full flex items-center justify-between gap-2 h-10 px-3.5 text-sm",
                    "border rounded-control text-left transition-[border-color,box-shadow,background-color] duration-150",
                    variant === "header-dark"
                        ? "bg-white/10 border-white/20 text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        : "bg-surface shadow-2xs focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/12",
                    variant === "default" && (error
                        ? "border-danger"
                        : isOpen
                            ? "border-primary-400 ring-4 ring-primary-500/12"
                            : "border-line hover:border-line-strong"),
                    disabled && "opacity-50 cursor-not-allowed",
                    variant === "default" && disabled && "bg-surface-2"
                )}
            >
                <span className={cn(
                    "flex items-center gap-2 truncate",
                    variant === "header-dark"
                        ? selectedOption ? "text-white" : "text-white/70"
                        : selectedOption ? "text-ink" : "text-ink-4"
                )}>
                    {selectedOption?.icon}
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown
                    className={cn(
                        "w-4 h-4 transition-transform flex-shrink-0",
                        variant === "header-dark" ? "text-white/80" : "text-ink-4",
                        isOpen && "rotate-180"
                    )}
                />
            </button>

            {/* Error Message */}
            <FieldMessage error={error} />

            {/* Dropdown - use portal when header-dark so it isn't clipped by overflow-hidden */}
            {isOpen && (() => {
                const dropdownContent = (
                    <>
                        {/* Search Input */}
                        {searchable && (
                            <div className="p-1.5 pb-2 border-b border-line-subtle">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setHighlightedIndex(0);
                                        }}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Rechercher…"
                                        className="w-full h-9 pl-9 pr-3 bg-surface-2 border border-line rounded-[10px] text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-primary-400 focus:bg-surface"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Options */}
                        <div role="listbox" className="overflow-y-auto p-1" style={{ maxHeight }}>
                            {filteredOptions.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-ink-3 text-center">
                                    Aucun résultat
                                </div>
                            ) : (
                                filteredOptions.map((option, index) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="option"
                                        aria-selected={option.value === value}
                                        title={option.title}
                                        onClick={() => {
                                            if (!option.disabled) {
                                                onChange(option.value);
                                                setIsOpen(false);
                                                setSearchQuery("");
                                            }
                                        }}
                                        onMouseEnter={() => setHighlightedIndex(index)}
                                        disabled={option.disabled}
                                        className={cn(
                                            "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                            index === highlightedIndex && "bg-surface-3",
                                            option.disabled && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <span className={cn(
                                            "flex items-center gap-2 truncate",
                                            option.value === value ? "text-primary-700 font-semibold" : "text-ink"
                                        )}>
                                            {option.icon}
                                            {option.label}
                                        </span>
                                        {option.value === value && (
                                            <Check className="w-4 h-4 text-primary-600" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                );

                if (variant === "header-dark" && dropdownRect && typeof document !== "undefined") {
                    return createPortal(
                        <div
                            data-select-dropdown
                            className="bg-surface border border-line rounded-panel shadow-overlay overflow-hidden animate-ds-pop origin-top"
                            style={{
                                position: "fixed",
                                top: dropdownRect.top,
                                left: dropdownRect.left,
                                width: dropdownRect.width,
                                minWidth: "10rem",
                                zIndex: 9999,
                            }}
                        >
                            {dropdownContent}
                        </div>,
                        document.body
                    );
                }

                return (
                    <div className="absolute z-50 w-full mt-1.5 bg-surface border border-line rounded-panel shadow-overlay overflow-hidden animate-ds-pop origin-top">
                        {dropdownContent}
                    </div>
                );
            })()}
        </div>
    );
}

// ============================================
// MULTI-SELECT COMPONENT
// ============================================

interface MultiSelectProps {
    options: SelectOption[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    label?: string;
    error?: string;
    disabled?: boolean;
    maxSelections?: number;
    className?: string;
}

export function MultiSelect({
    options,
    value,
    onChange,
    placeholder = "Sélectionner...",
    label,
    error,
    disabled = false,
    maxSelections,
    className,
}: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOptions = options.filter((opt) => value.includes(opt.value));

    const filteredOptions = options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (optionValue: string) => {
        if (value.includes(optionValue)) {
            onChange(value.filter((v) => v !== optionValue));
        } else if (!maxSelections || value.length < maxSelections) {
            onChange([...value, optionValue]);
        }
    };

    const removeOption = (optionValue: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(value.filter((v) => v !== optionValue));
    };

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            {label && (
                <label className="mb-1.5 block text-[13px] font-medium text-ink-2">
                    {label}
                </label>
            )}

            {/* Trigger */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm",
                    "bg-surface border rounded-control text-left min-h-10 shadow-2xs",
                    "transition-[border-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/12",
                    error
                        ? "border-danger"
                        : isOpen
                            ? "border-primary-400 ring-4 ring-primary-500/12"
                            : "border-line hover:border-line-strong",
                    disabled && "opacity-50 cursor-not-allowed bg-surface-2"
                )}
            >
                <div className="flex-1 flex flex-wrap gap-1">
                    {selectedOptions.length === 0 ? (
                        <span className="px-1 text-ink-4">{placeholder}</span>
                    ) : (
                        selectedOptions.map((opt) => (
                            <span
                                key={opt.value}
                                className="inline-flex h-6 items-center gap-1 pl-2 pr-1 bg-primary-50 text-primary-700 border border-primary-100 rounded-md text-xs font-medium"
                            >
                                {opt.label}
                                <button
                                    type="button"
                                    onClick={(e) => removeOption(opt.value, e)}
                                    aria-label={`Retirer ${opt.label}`}
                                    className="inline-flex size-4 items-center justify-center rounded hover:bg-primary-100 hover:text-primary-900"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))
                    )}
                </div>
                <ChevronDown
                    className={cn(
                        "w-4 h-4 text-ink-4 transition-transform flex-shrink-0",
                        isOpen && "rotate-180"
                    )}
                />
            </button>

            <FieldMessage error={error} />

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1.5 bg-surface border border-line rounded-panel shadow-overlay overflow-hidden animate-ds-pop origin-top">
                    {/* Search */}
                    <div className="p-1.5 pb-2 border-b border-line-subtle">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Rechercher…"
                            className="w-full h-9 px-3 bg-surface-2 border border-line rounded-[10px] text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-primary-400 focus:bg-surface"
                        />
                    </div>

                    {/* Options */}
                    <div role="listbox" aria-multiselectable className="max-h-60 overflow-y-auto p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-ink-3 text-center">
                                Aucun résultat
                            </div>
                        ) : (
                            filteredOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleOption(option.value)}
                                    disabled={
                                        option.disabled ||
                                        (!!maxSelections &&
                                            value.length >= maxSelections &&
                                            !value.includes(option.value))
                                    }
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-surface-3",
                                        (option.disabled ||
                                            (!!maxSelections &&
                                                value.length >= maxSelections &&
                                                !value.includes(option.value))) &&
                                        "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "size-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors",
                                            value.includes(option.value)
                                                ? "bg-primary border-primary"
                                                : "border-line-strong bg-surface"
                                        )}
                                    >
                                        {value.includes(option.value) && (
                                            <Check className="w-3 h-3 text-primary-fg" strokeWidth={3} />
                                        )}
                                    </div>
                                    <span className="truncate text-ink">{option.label}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Select;
