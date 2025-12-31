export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  completedAt?: string;
}

export interface TaskStore {
  tasks: Task[];
}

export function createTask(
  title: string,
  options: {
    priority?: TaskPriority;
    tags?: string[];
    dueDate?: string;
  } = {}
): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    status: "pending",
    priority: options.priority ?? "medium",
    tags: options.tags ?? [],
    createdAt: now,
    updatedAt: now,
    dueDate: options.dueDate,
  };
}

export function updateTask(task: Task, updates: Partial<Omit<Task, "id" | "createdAt">>): Task {
  return {
    ...task,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

export function completeTask(task: Task): Task {
  const now = new Date().toISOString();
  return {
    ...task,
    status: "completed",
    completedAt: now,
    updatedAt: now,
  };
}
