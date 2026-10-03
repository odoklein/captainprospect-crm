"use client";

import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { X, ChevronRight, ChevronLeft, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "./Button";

// ============================================
// TOUR STEP
// ============================================

export interface TourStep {
  target: string; // CSS selector or data attribute
  title: string;
  content: string | React.ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  action?: () => void; // Optional action before showing step
}

// ============================================
// TOUR COMPONENT
// ============================================

interface TourProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  showProgress?: boolean;
  allowSkip?: boolean;
}

export function Tour({
  steps,
  isOpen,
  onClose,
  onComplete,
  showProgress = true,
  allowSkip = true,
}: TourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});
  const overlayRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  // Find and highlight target element
  useEffect(() => {
    if (!isOpen || !step) return;

    const element = document.querySelector(step.target) as HTMLElement;
    if (!element) {
      console.warn(`Tour step target not found: ${step.target}`);
      return;
    }

    setTargetElement(element);

    // Execute action if provided
    if (step.action) {
      step.action();
    }

    // Scroll element into view
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    // Calculate spotlight position
    const rect = element.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    setSpotlightStyle({
      top: `${rect.top + scrollY}px`,
      left: `${rect.left + scrollX}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });

    // Highlight element
    element.style.zIndex = "1000";
    element.style.position = "relative";
    element.setAttribute("data-tour-active", "true");

    return () => {
      element.style.zIndex = "";
      element.style.position = "";
      element.removeAttribute("data-tour-active");
    };
  }, [isOpen, currentStep, step]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    onComplete?.();
    onClose();
    setCurrentStep(0);
  };

  // Close on escape key
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          handleComplete();
        }
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  if (!isOpen || !step) return null;

  const placement = step.placement || "bottom";
  const tooltipPosition = calculateTooltipPosition(targetElement, placement);

  return (
    <>
      {/* Overlay with spotlight */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/60"
        style={{
          clipPath: targetElement
            ? `polygon(0% 0%, 0% 100%, ${spotlightStyle.left}px 100%, ${spotlightStyle.left}px ${spotlightStyle.top}px, ${(spotlightStyle.left as number) + (spotlightStyle.width as number)}px ${spotlightStyle.top}px, ${(spotlightStyle.left as number) + (spotlightStyle.width as number)}px ${(spotlightStyle.top as number) + (spotlightStyle.height as number)}px, ${spotlightStyle.left}px ${(spotlightStyle.top as number) + (spotlightStyle.height as number)}px, ${spotlightStyle.left}px 100%, 100% 100%, 100% 0%)`
            : undefined,
        }}
      />

      {/* Tooltip */}
      {tooltipPosition && (
        <div
          className="fixed z-50 bg-surface rounded-xl shadow-2xl max-w-sm"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-line">
            <div className="flex-1">
              <h3 className="font-semibold text-ink">{step.title}</h3>
              {showProgress && (
                <p className="text-xs text-ink-3 mt-1">
                  Étape {currentStep + 1} sur {steps.length}
                </p>
              )}
            </div>
            <button
              onClick={handleComplete}
              className="p-1 hover:bg-surface-3 rounded-lg transition-colors ml-2"
              aria-label="Fermer"
            >
              <X className="w-4 h-4 text-ink-3" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {typeof step.content === "string" ? (
              <p className="text-sm text-ink-2 whitespace-pre-wrap">{step.content}</p>
            ) : (
              step.content
            )}
          </div>

          {/* Progress bar */}
          {showProgress && (
            <div className="px-4 pb-2">
              <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-line">
            <div className="flex gap-2">
              {allowSkip && (
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  <SkipForward className="w-4 h-4 mr-1" />
                  Passer
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button variant="secondary" size="sm" onClick={handlePrevious}>
                  <ChevronLeft className="w-4 h-4" />
                  Précédent
                </Button>
              )}
              <Button size="sm" onClick={handleNext}>
                {currentStep < steps.length - 1 ? (
                  <>
                    Suivant
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  "Terminer"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// CALCULATE TOOLTIP POSITION
// ============================================

function calculateTooltipPosition(
  element: HTMLElement | null,
  placement: "top" | "bottom" | "left" | "right"
): { top: number; left: number } | null {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  const tooltipWidth = 384; // max-w-sm
  const tooltipHeight = 200; // Estimated
  const gap = 16;

  let top = 0;
  let left = 0;

  switch (placement) {
    case "top":
      top = rect.top + scrollY - tooltipHeight - gap;
      left = rect.left + scrollX + rect.width / 2 - tooltipWidth / 2;
      break;
    case "bottom":
      top = rect.bottom + scrollY + gap;
      left = rect.left + scrollX + rect.width / 2 - tooltipWidth / 2;
      break;
    case "left":
      top = rect.top + scrollY + rect.height / 2 - tooltipHeight / 2;
      left = rect.left + scrollX - tooltipWidth - gap;
      break;
    case "right":
      top = rect.top + scrollY + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + scrollX + gap;
      break;
  }

  // Keep within viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (left < 16) left = 16;
  if (left + tooltipWidth > viewportWidth - 16) {
    left = viewportWidth - tooltipWidth - 16;
  }
  if (top < scrollY + 16) top = scrollY + 16;
  if (top + tooltipHeight > scrollY + viewportHeight - 16) {
    top = scrollY + viewportHeight - tooltipHeight - 16;
  }

  return { top, left };
}

// ============================================
// TOUR PROVIDER (Context)
// ============================================

interface TourContextType {
  startTour: (steps: TourStep[], tourId: string) => void;
  completeTour: (tourId: string) => void;
  hasCompletedTour: (tourId: string) => boolean;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  const [completedTours, setCompletedTours] = useState<Set<string>>(new Set());

  const startTour = (steps: TourStep[], tourId: string) => {
    // Implementation handled by individual tour components
  };

  const completeTour = (tourId: string) => {
    setCompletedTours((prev) => new Set(prev).add(tourId));
    // Persist to localStorage
    localStorage.setItem("completedTours", JSON.stringify(Array.from(completedTours)));
  };

  const hasCompletedTour = (tourId: string) => {
    return completedTours.has(tourId);
  };

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("completedTours");
    if (stored) {
      try {
        setCompletedTours(new Set(JSON.parse(stored)));
      } catch (e) {
        console.error("Failed to load completed tours", e);
      }
    }
  }, []);

  return (
    <TourContext.Provider value={{ startTour, completeTour, hasCompletedTour }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within TourProvider");
  }
  return context;
}

export default Tour;
