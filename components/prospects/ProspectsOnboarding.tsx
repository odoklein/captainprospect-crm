"use client";

import { useState, useEffect } from "react";
import { Tour } from "@/components/ui/Tour";
import { getTourSteps } from "@/lib/prospects/tours";
import { Button, Card } from "@/components/ui";
import { PlayCircle } from "lucide-react";

// ============================================
// PROSPECTS ONBOARDING
// ============================================

interface ProspectsOnboardingProps {
  tourId?: string;
  autoStart?: boolean;
}

export function ProspectsOnboarding({ tourId = "complete", autoStart = false }: ProspectsOnboardingProps) {
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [hasCompletedTour, setHasCompletedTour] = useState(false);

  // Check if tour was completed
  useEffect(() => {
    const completed = localStorage.getItem(`tour-completed-${tourId}`);
    setHasCompletedTour(completed === "true");
    
    // Auto-start if enabled and not completed
    if (autoStart && !completed && !isTourOpen) {
      // Small delay to ensure page is rendered
      setTimeout(() => {
        setIsTourOpen(true);
      }, 1000);
    }
  }, [tourId, autoStart, isTourOpen]);

  const handleComplete = () => {
    localStorage.setItem(`tour-completed-${tourId}`, "true");
    setHasCompletedTour(true);
  };

  const handleStartTour = () => {
    setIsTourOpen(true);
  };

  const steps = getTourSteps(tourId);

  if (steps.length === 0) return null;

  return (
    <>
      {!hasCompletedTour && !isTourOpen && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="p-4 shadow-lg max-w-sm">
            <h3 className="font-semibold text-slate-900 mb-2">Visite guidée de Prospects</h3>
            <p className="text-sm text-slate-600 mb-3">
              Sources, règles et pipeline des prospects entrants, étape par étape.
            </p>
            <Button onClick={handleStartTour} size="sm" className="w-full">
              <PlayCircle className="w-4 h-4 mr-2" />
              Commencer la visite
            </Button>
          </Card>
        </div>
      )}

      <Tour
        steps={steps}
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onComplete={handleComplete}
        showProgress={true}
        allowSkip={true}
      />
    </>
  );
}

// Helper to check if tour completed
export function hasCompletedTour(tourId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`tour-completed-${tourId}`) === "true";
}

// Helper to reset tour completion
export function resetTour(tourId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`tour-completed-${tourId}`);
}
