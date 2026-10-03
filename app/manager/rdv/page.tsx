import type { Metadata } from "next";
import { RdvShell } from "./_components/RdvShell";

export const metadata: Metadata = {
  title: "RDV",
  description: "Gestion des rendez-vous — suivi, confirmation, fiche RDV et feedback.",
};

export default function RdvPage() {
  return <RdvShell />;
}
