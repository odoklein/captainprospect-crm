"use client";

import { TaskFeed } from "@/components/tasks/TaskFeed";

export default function ManagerTasksPage() {
    return <TaskFeed projectsHref="/manager/projects" />;
}
