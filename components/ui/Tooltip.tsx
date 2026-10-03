"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// ============================================
// TOOLTIP COMPONENT
// ============================================

interface TooltipProps {
  content: string | React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  trigger?: "hover" | "click";
  delay?: number;
  className?: string;
  maxWidth?: string;
}

export function Tooltip({
  content,
  children,
  position = "top",
  trigger = "hover",
  delay = 200,
  className,
  maxWidth = "max-w-xs",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Calculate tooltip position
  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      let top = 0;
      let left = 0;

      switch (position) {
        case "top":
          top = triggerRect.top + scrollY - tooltipRect.height - 8;
          left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2;
          break;
        case "bottom":
          top = triggerRect.bottom + scrollY + 8;
          left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2;
          break;
        case "left":
          top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2;
          left = triggerRect.left + scrollX - tooltipRect.width - 8;
          break;
        case "right":
          top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2;
          left = triggerRect.right + scrollX + 8;
          break;
      }

      // Keep tooltip within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < 8) left = 8;
      if (left + tooltipRect.width > viewportWidth - 8) {
        left = viewportWidth - tooltipRect.width - 8;
      }
      if (top < scrollY + 8) top = scrollY + 8;
      if (top + tooltipRect.height > scrollY + viewportHeight - 8) {
        top = scrollY + viewportHeight - tooltipRect.height - 8;
      }

      setTooltipPosition({ top, left });
    }
  }, [isVisible, position]);

  const handleShow = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleHide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const handleClick = () => {
    if (trigger === "click") {
      setIsVisible(!isVisible);
    }
  };

  // Close on outside click for click trigger
  useEffect(() => {
    if (trigger === "click" && isVisible) {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          tooltipRef.current &&
          triggerRef.current &&
          !tooltipRef.current.contains(e.target as Node) &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          setIsVisible(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [trigger, isVisible]);

  // Close on escape key
  useEffect(() => {
    if (isVisible && trigger === "click") {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsVisible(false);
        }
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isVisible, trigger]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={trigger === "hover" ? handleShow : undefined}
        onMouseLeave={trigger === "hover" ? handleHide : undefined}
        onClick={handleClick}
        className="inline-flex items-center"
      >
        {children}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            "fixed z-50 px-3 py-2 text-sm text-white bg-slate-900 rounded-lg shadow-lg",
            "pointer-events-none",
            maxWidth,
            className
          )}
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {typeof content === "string" ? (
            <p className="whitespace-normal">{content}</p>
          ) : (
            content
          )}
          {/* Arrow */}
          <div
            className={cn(
              "absolute w-2 h-2 bg-slate-900 transform rotate-45",
              position === "top" && "bottom-[-4px] left-1/2 -translate-x-1/2",
              position === "bottom" && "top-[-4px] left-1/2 -translate-x-1/2",
              position === "left" && "right-[-4px] top-1/2 -translate-y-1/2",
              position === "right" && "left-[-4px] top-1/2 -translate-y-1/2"
            )}
          />
        </div>
      )}
    </>
  );
}

// ============================================
// TOOLTIP TRIGGER (Info Icon Wrapper)
// ============================================

interface TooltipTriggerProps {
  content: string | React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function TooltipTrigger({ content, position = "top", className }: TooltipTriggerProps) {
  return (
    <Tooltip content={content} position={position} className={className}>
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 text-ink-4 hover:text-ink-2 transition-colors focus:outline-none"
        aria-label="Information"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
    </Tooltip>
  );
}

export default Tooltip;
