"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";

export default function BDIndexPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/bd/dashboard");
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <Spinner className="size-6 text-primary" />
        </div>
    );
}
