import { homedir } from "os";
import { join } from "path";
import type { Task, TaskStore } from "../models/task.ts";

const CONFIG_DIR = join(homedir(), ".task-cli");
const TASKS_FILE = join(CONFIG_DIR, "tasks.json");

async function ensureConfigDir(): Promise<void> {
  const dir = Bun.file(CONFIG_DIR);
  if (!(await dir.exists())) {
    await Bun.write(join(CONFIG_DIR, ".keep"), "");
  }
}

export async function loadTasks(): Promise<Task[]> {
  try {
    await ensureConfigDir();
    const file = Bun.file(TASKS_FILE);
    if (await file.exists()) {
      const content = await file.text();
      const store: TaskStore = JSON.parse(content);
      return store.tasks;
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await ensureConfigDir();
  const store: TaskStore = { tasks };
  await Bun.write(TASKS_FILE, JSON.stringify(store, null, 2));
}

export async function addTask(task: Task): Promise<void> {
  const tasks = await loadTasks();
  tasks.push(task);
  await saveTasks(tasks);
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const tasks = await loadTasks();
  return tasks.find((t) => t.id === id || t.id.startsWith(id));
}

export async function updateTaskById(id: string, updater: (task: Task) => Task): Promise<Task | undefined> {
  const tasks = await loadTasks();
  const index = tasks.findIndex((t) => t.id === id || t.id.startsWith(id));
  if (index === -1) return undefined;

  const updated = updater(tasks[index]);
  tasks[index] = updated;
  await saveTasks(tasks);
  return updated;
}

export async function deleteTaskById(id: string): Promise<boolean> {
  const tasks = await loadTasks();
  const index = tasks.findIndex((t) => t.id === id || t.id.startsWith(id));
  if (index === -1) return false;

  tasks.splice(index, 1);
  await saveTasks(tasks);
  return true;
}

export async function clearCompletedTasks(): Promise<number> {
  const tasks = await loadTasks();
  const remaining = tasks.filter((t) => t.status !== "completed");
  const cleared = tasks.length - remaining.length;
  await saveTasks(remaining);
  return cleared;
}

export function getStoragePath(): string {
  return TASKS_FILE;
}
