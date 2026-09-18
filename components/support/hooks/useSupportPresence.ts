"use client";

import { useState } from "react";

export interface SupportPresenceState {
    isOnline: boolean;
    statusText: string;
    isTyping: boolean;
    typingAgentName: string | null;
}

export function useSupportPresence(): SupportPresenceState {
    // Current CRM operating hours & availability
    // Typically: Weekdays 9:00 - 18:30 Europe/Paris
    const [isOnline] = useState(() => {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        // Mon-Fri 8h-19h
        return day >= 1 && day <= 5 && hour >= 8 && hour < 19;
    });

    const statusText = isOnline
        ? "Support en direct · Réponse en quelques minutes"
        : "Support joignable · Réponse garantie sous 1h ouvrée";

    return {
        isOnline,
        statusText,
        isTyping: false,
        typingAgentName: null,
    };
}
