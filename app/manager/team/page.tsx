"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeamRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/manager/utilisateurs");
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[200px]">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}
