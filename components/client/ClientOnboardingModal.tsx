"use client";

import { useState } from "react";
import {
    LayoutDashboard,
    MessageSquare,
    Target,
    BarChart3,
    Compass,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ClientOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDismissPermanently: () => Promise<void>;
}

const STEPS = [
    {
        icon: LayoutDashboard,
        title: "Tableau de bord",
        description:
            "Vos missions, les contacts qualifiés et les RDV planifiés, mis à jour en temps réel.",
        color: "bg-primary-100 text-primary-600",
    },
    {
        icon: BarChart3,
        title: "Résultats",
        description:
            "Performance de chaque mission : taux de conversion, nombre de contacts, rendez-vous obtenus et activité récente.",
        color: "bg-accent-100 text-accent-600",
    },
    {
        icon: MessageSquare,
        title: "Contact",
        description:
            "Échangez avec les SDR et l'équipe dédiée à vos missions depuis la messagerie du portail.",
        color: "bg-emerald-100 text-emerald-600",
    },
    {
        icon: Target,
        title: "Opportunités",
        description:
            "Les contacts intéressés par vos offres, dès qu'ils sont qualifiés. Export CSV disponible à tout moment.",
        color: "bg-amber-100 text-amber-600",
    },
];

export function ClientOnboardingModal({
    isOpen,
    onClose,
    onDismissPermanently,
}: ClientOnboardingModalProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");

    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === STEPS.length - 1;
    const step = STEPS[currentStep];
    const Icon = step.icon;

    const goNext = () => {
        if (!isLastStep) {
            setSlideDirection("right");
            setCurrentStep((s) => s + 1);
        }
    };

    const goPrev = () => {
        if (!isFirstStep) {
            setSlideDirection("left");
            setCurrentStep((s) => s - 1);
        }
    };

    const goToStep = (index: number) => {
        setSlideDirection(index > currentStep ? "right" : "left");
        setCurrentStep(index);
    };

    const handleDismissPermanently = async () => {
        setIsSubmitting(true);
        try {
            await onDismissPermanently();
            onClose();
        } catch {
            // Error handled by parent
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setCurrentStep(0);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            size="lg"
            showCloseButton={true}
            closeOnOverlay={false}
        >
            <div
                className="space-y-6"
                role="dialog"
                aria-labelledby="onboarding-title"
                aria-describedby="onboarding-desc"
            >
                {/* Header */}
                <div className="text-center pb-2">
                    <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-4">
                        <Compass className="w-8 h-8 text-white" />
                    </div>
                    <h2 id="onboarding-title" className="text-xl font-bold text-slate-900">
                        Bienvenue sur votre portail client
                    </h2>
                    <p id="onboarding-desc" className="text-slate-600 mt-1 max-w-md mx-auto">
                        Les principales sections de votre espace.
                    </p>
                </div>

                {/* Step indicator dots */}
                <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Étapes">
                    {STEPS.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => goToStep(i)}
                            role="tab"
                            aria-selected={i === currentStep}
                            aria-label={`Étape ${i + 1} : ${s.title}`}
                            className={cn(
                                "transition-all duration-300 rounded-full",
                                i === currentStep
                                    ? "w-8 h-2.5 bg-primary-500"
                                    : "w-2.5 h-2.5 bg-slate-200 hover:bg-slate-300"
                            )}
                        />
                    ))}
                </div>

                {/* Step Content - with slide animation */}
                <div className="overflow-hidden">
                    <div
                        key={currentStep}
                        className={cn(
                            "flex gap-5 p-6 rounded-2xl bg-slate-50 border border-slate-100 transition-all duration-300",
                            slideDirection === "right"
                                ? "animate-slide-in-right"
                                : "animate-slide-in-left"
                        )}
                        role="tabpanel"
                        aria-label={step.title}
                    >
                        <div className={cn(
                            "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0",
                            step.color
                        )}>
                            <Icon className="w-7 h-7" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                                    {currentStep + 1}/{STEPS.length}
                                </span>
                                <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed mt-1">
                                {step.description}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Navigation + Actions */}
                <ModalFooter className="flex-col sm:flex-row gap-3 border-t pt-6">
                    {/* Left: nav arrows */}
                    <div className="flex items-center gap-2 order-2 sm:order-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={goPrev}
                            disabled={isFirstStep}
                            aria-label="Étape précédente"
                            className="gap-1"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Précédent
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={goNext}
                            disabled={isLastStep}
                            aria-label="Étape suivante"
                            className="gap-1"
                        >
                            Suivant
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Right: close / dismiss */}
                    <div className="flex items-center gap-2 order-1 sm:order-2 sm:ml-auto">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDismissPermanently}
                            disabled={isSubmitting}
                            isLoading={isSubmitting}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            Ne plus afficher
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleClose}
                            disabled={isSubmitting}
                        >
                            {isLastStep ? "Commencer" : "Fermer"}
                        </Button>
                    </div>
                </ModalFooter>
            </div>
        </Modal>
    );
}
