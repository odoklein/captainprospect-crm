import { EmailHubLayout } from "@/components/email/EmailHubLayout";

export default function SdrEmailsLayout({ children }: { children: React.ReactNode }) {
    return <EmailHubLayout variant="sdr">{children}</EmailHubLayout>;
}
