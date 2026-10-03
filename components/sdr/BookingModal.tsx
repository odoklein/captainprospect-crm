"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, Button, useToast } from "@/components/ui";
import { Loader2, Calendar, CheckCircle2 } from "lucide-react";

// ============================================
// BOOKING MODAL PROPS
// ============================================

interface BookingModalProps {
    isOpen: boolean;
    onClose: () => void;
    bookingUrl: string;
    contactId: string;
    contactName: string;
    onBookingSuccess?: () => void;
}

// ============================================
// BOOKING MODAL COMPONENT
// ============================================

export function BookingModal({
    isOpen,
    onClose,
    bookingUrl,
    contactId,
    contactName,
    onBookingSuccess,
}: BookingModalProps) {
    const { success, error: showError } = useToast();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Listen for postMessage events from booking tools (Calendly, etc.)
    useEffect(() => {
        if (!isOpen) return;

        const handleMessage = async (event: MessageEvent) => {
            // Security: Only accept messages from known booking domains
            const allowedOrigins = [
                "https://calendly.com",
                "https://*.calendly.com",
                "https://cal.com",
                "https://*.cal.com",
                window.location.origin,
            ];

            // Check origin (basic check - in production, validate more strictly)
            const origin = event.origin;
            const isAllowed = allowedOrigins.some((allowed) => {
                if (allowed.includes("*")) {
                    const pattern = allowed.replace("*", ".*");
                    return new RegExp(`^${pattern}$`).test(origin);
                }
                return origin === allowed;
            });

            if (!isAllowed) {
                console.warn("Ignored message from unauthorized origin:", origin);
                return;
            }

            // Handle Calendly events
            if (event.data.event === "calendly.event_scheduled") {
                setIsProcessing(true);
                try {
                    const res = await fetch("/api/actions/booking-success", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contactId,
                            eventData: event.data.payload,
                        }),
                    });

                    const json = await res.json();

                    if (json.success) {
                        success(
                            "Rendez-vous confirmé",
                            `Le rendez-vous avec ${contactName} a été enregistré`
                        );
                        onBookingSuccess?.();
                        setTimeout(() => {
                            onClose();
                        }, 1500);
                    } else {
                        showError("Erreur", json.error || "Impossible d'enregistrer le rendez-vous");
                    }
                } catch (err) {
                    console.error("Failed to process booking:", err);
                    showError("Erreur", "Impossible d'enregistrer le rendez-vous");
                } finally {
                    setIsProcessing(false);
                }
            }

            // Handle generic booking success events
            if (event.data.type === "booking_success" || event.data.event === "booking.completed") {
                setIsProcessing(true);
                try {
                    const res = await fetch("/api/actions/booking-success", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contactId,
                            eventData: event.data,
                        }),
                    });

                    const json = await res.json();

                    if (json.success) {
                        success(
                            "Rendez-vous confirmé",
                            `Le rendez-vous avec ${contactName} a été enregistré`
                        );
                        onBookingSuccess?.();
                        setTimeout(() => {
                            onClose();
                        }, 1500);
                    } else {
                        showError("Erreur", json.error || "Impossible d'enregistrer le rendez-vous");
                    }
                } catch (err) {
                    console.error("Failed to process booking:", err);
                    showError("Erreur", "Impossible d'enregistrer le rendez-vous");
                } finally {
                    setIsProcessing(false);
                }
            }
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, [isOpen, contactId, contactName, onBookingSuccess, onClose, success, showError]);

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Planifier un rendez-vous"
            description={`Avec ${contactName}`}
            size="xl"
            className="max-h-[90vh]"
        >
            <div className="relative">
                {isProcessing && (
                    <div className="absolute inset-0 bg-white/90 z-10 flex items-center justify-center rounded-lg">
                        <div className="text-center">
                            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-2" />
                            <p className="text-sm text-slate-600">Enregistrement du rendez-vous...</p>
                        </div>
                    </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-slate-600">
                            <p className="font-medium text-slate-900 mb-1">
                                Le rendez-vous sera automatiquement enregistré
                            </p>
                            <p>
                                Une fois que vous aurez confirmé le rendez-vous dans le calendrier ci-dessous,
                                il sera automatiquement ajouté à votre liste de rendez-vous.
                            </p>
                        </div>
                    </div>
                </div>

                <iframe
                    ref={iframeRef}
                    src={bookingUrl}
                    className="w-full h-[600px] border-0 rounded-lg"
                    title="Booking Calendar"
                    allow="camera; microphone; geolocation"
                />
            </div>
        </Modal>
    );
}

export default BookingModal;
