import { redirect } from "next/navigation";

// Session to-dos now live in the unified task list.
export default function SessionTasksPage() {
    redirect("/developer/tasks");
}
