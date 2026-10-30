"use client";

import { TaskFeed } from "@/components/tasks/TaskFeed";

export default function DeveloperTasksPage() {
    return <TaskFeed projectsHref="/developer/projects" />;
}
