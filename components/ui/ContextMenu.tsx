"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Edit, Trash2, Eye, Copy, Download, MoreHorizontal } from "lucide-react";

// ============================================
// TYPES
// ============================================

interface ContextMenuItem {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: "default" | "danger";
    disabled?: boolean;
    divider?: boolean;
}

interface ContextMenuProps {
    items: ContextMenuItem[];
    position: { x: number; y: number } | null;
    onClose: () => void;
}

// ============================================
// CONTEXT MENU COMPONENT
// ============================================

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        if (position) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("keydown", handleEscape);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [position, onClose]);

    if (!mounted || !position) return null;

    // Calculate position to keep menu in viewport
    const menuWidth = 200;
    const menuHeight = items.length * 40;
    const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 20);
    const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 20);

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-[100] min-w-[180px] bg-surface rounded-xl shadow-lg border border-line py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: adjustedX, top: adjustedY }}
        >
            {items.map((item, index) => (
                <div key={index}>
                    {item.divider && index > 0 && (
                        <div className="h-px bg-slate-200 my-1" />
                    )}
                    <button
                        onClick={() => {
                            if (!item.disabled) {
                                item.onClick();
                                onClose();
                            }
                        }}
                        disabled={item.disabled}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${item.disabled
                                ? "text-ink-4 cursor-not-allowed"
                                : item.variant === "danger"
                                    ? "text-red-600 hover:bg-red-50"
                                    : "text-ink-2 hover:bg-surface-2"
                            }`}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                </div>
            ))}
        </div>,
        document.body
    );
}

// ============================================
// HOOK FOR CONTEXT MENU
// ============================================

export function useContextMenu() {
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [contextData, setContextData] = useState<any>(null);

    const handleContextMenu = (e: React.MouseEvent, data?: any) => {
        e.preventDefault();
        setPosition({ x: e.clientX, y: e.clientY });
        setContextData(data);
    };

    const close = () => {
        setPosition(null);
        setContextData(null);
    };

    return {
        position,
        contextData,
        handleContextMenu,
        close,
    };
}
