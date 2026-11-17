import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openPortal } from "@/lib/client-onboarding/service";
import { OnboardingPortal } from "@/components/client-onboarding/OnboardingPortal";
import { BrandLogo } from "@/components/brand/BrandLogo";

// Client-facing onboarding (no account): the token in the URL is the credential.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Onboarding", robots: { index: false, follow: false } };

export default async function ClientOnboardingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const found = await openPortal(token);
    if (found.kind === "not_found") notFound();
    if (found.kind === "expired") {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
                <div className="max-w-md rounded-[20px] border border-line bg-surface p-10 text-center">
                    <div className="flex justify-center"><BrandLogo height={32} /></div>
                    <h1 className="mt-6 font-display text-2xl font-bold text-ink">Ce lien a expiré</h1>
                    <p className="mt-2 text-sm text-ink-3">Demandez un nouveau lien à votre contact pour reprendre votre onboarding.</p>
                </div>
            </div>
        );
    }
    return <OnboardingPortal token={token} view={found.view} />;
}
