import type { Metadata } from "next";
import { AgencySignup } from "@/components/onboarding/AgencySignup";

export const metadata: Metadata = { title: "Créer votre espace client", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
    return <AgencySignup token={(await params).token} />;
}
