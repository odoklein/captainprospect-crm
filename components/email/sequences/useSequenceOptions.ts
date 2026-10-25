"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson, errorMessage } from "./api";
import type { SequenceOptions } from "./types";

/** Mailboxes (with health), missions + lists, current user, engine status. */
export function useSequenceOptions() {
    const [options, setOptions] = useState<SequenceOptions | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const { data } = await apiJson<SequenceOptions>("/api/email/sequences/options");
            setOptions(data);
        } catch (e) {
            setError(errorMessage(e, "Impossible de charger les boîtes d'envoi"));
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { options, error, reload: load };
}
