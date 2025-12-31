import { Command } from "commander";
import type { Task, TaskStatus, TaskPriority } from "../models/task.ts";
import { loadTasks } from "../storage/file.ts";
import { statusColor, priorityColor, dim, bold, cyan } from "../utils/colors.ts";
import { formatRelativeDate } from "../utils/dates.ts";
import { formatTable, type Column } from "../utils/table.ts";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .alias("ls")
    .description("List all tasks")
    .option("-s, --status <status>", "Filter by status (pending, in_progress, completed)")
    .option("-p, --priority <priority>", "Filter by priority (low, medium, high)")
    .option("-t, --tag <tag>", "Filter by tag")
    .action(async (options: { status?: string; priority?: string; tag?: string }) => {
      let tasks = await loadTasks();

      if (options.status) {
        const status = options.status as TaskStatus;
        tasks = tasks.filter((t) => t.status === status);
      }

      if (options.priority) {
        const priority = options.priority as TaskPriority;
        tasks = tasks.filter((t) => t.priority === priority);
      }

      if (options.tag) {
        tasks = tasks.filter((t) => t.tags.includes(options.tag!));
      }

      if (tasks.length === 0) {
        console.log(dim("No tasks found."));
        return;
      }

      tasks.sort((a, b) => {
        const statusOrder = { pending: 0, in_progress: 1, completed: 2 };
        const priorityOrder = { high: 0, medium: 1, low: 2 };

        if (a.status !== b.status) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        if (a.priority !== b.priority) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const columns: Column[] = [
        { header: "ID", width: 8 },
        { header: "Title", width: 35 },
        { header: "Status", width: 12 },
        { header: "Priority", width: 8 },
        { header: "Due", width: 12 },
        { header: "Tags", width: 15 },
      ];

      const rows = tasks.map((task) => [
        task.id.slice(0, 8),
        task.title,
        statusColor(task.status),
        priorityColor(task.priority),
        task.dueDate ? formatRelativeDate(task.dueDate) : dim("-"),
        task.tags.length > 0 ? cyan(task.tags.join(", ")) : dim("-"),
      ]);

      console.log(formatTable(columns, rows));
      console.log();
      printSummary(tasks);
    });
}

function printSummary(tasks: Task[]): void {
  const total = tasks.length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completed = tasks.filter((t) => t.status === "completed").length;

  console.log(
    `${bold("Total:")} ${total} │ ` +
      `${dim("Pending:")} ${pending} │ ` +
      `${statusColor("in_progress")}: ${inProgress} │ ` +
      `${statusColor("completed")}: ${completed}`
  );
}
