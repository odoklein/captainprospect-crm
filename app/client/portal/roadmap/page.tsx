import { redirect } from "next/navigation";

// Roadmap and Nouveautés were merged into a single "Évolutions" page.
export default function ClientPortalRoadmapRedirect() {
    redirect("/client/portal/evolutions");
}
