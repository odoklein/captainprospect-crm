import { Suspense } from "react";
import TemplatesView from "@/components/email/templates/TemplatesView";

export const metadata = { title: "Templates · Email Hub" };

export default function EmailHubTemplatesPage() {
    return (
        <Suspense fallback={null}>
            <TemplatesView />
        </Suspense>
    );
}
