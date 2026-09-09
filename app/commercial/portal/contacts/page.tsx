"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CommercialContactsPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/commercial/portal");
    }, [router]);

    return null;
}
