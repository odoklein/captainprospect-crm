import { redirect } from "next/navigation";

// The sidebar's "Email Hub" points here; the hub's only SDR page is "Mes envois".
export default function SdrEmailsPage() {
    redirect("/sdr/emails/sent");
}
