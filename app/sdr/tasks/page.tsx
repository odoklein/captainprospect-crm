"use client";

import { TaskFeed } from "@/components/tasks/TaskFeed";

export default function SDRTasksPage() {
    return <TaskFeed projectsHref="/sdr/projects" />;
}
