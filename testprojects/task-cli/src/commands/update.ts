import { Command } from "commander";
import { updateTask, type TaskPriority, type TaskStatus } from "../models/task.ts";
import { updateTaskById } from "../storage/file.ts";
import { green, red, cyan } from "../utils/colors.ts";
import { parseDate } from "../utils/dates.ts";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update <id>")
    .description("Update a task")
    .option("-T, --title <title>", "New title")
    .option("-s, --status <status>", "New status (pending, in_progress, completed)")
    .option("-p, --priority <priority>", "New priority (low, medium, high)")
    .option("-t, --tags <tags>", "New comma-separated tags")
    .option("-d, --due <date>", "New due date (YYYY-MM-DD)")
    .action(
      async (
        id: string,
        options: {
          title?: string;
          status?: string;
          priority?: string;
          tags?: string;
          due?: string;
        }
      ) => {
        const updates: Partial<{
          title: string;
          status: TaskStatus;
          priority: TaskPriority;
          tags: string[];
          dueDate: string;
        }> = {};

        if (options.title) {
          updates.title = options.title;
        }

        if (options.status) {
          if (!["pending", "in_progress", "completed"].includes(options.status)) {
            console.error(red("Invalid status. Use: pending, in_progress, or completed"));
            process.exit(1);
          }
          updates.status = options.status as TaskStatus;
        }

        if (options.priority) {
          if (!["low", "medium", "high"].includes(options.priority)) {
            console.error(red("Invalid priority. Use: low, medium, or high"));
            process.exit(1);
          }
          updates.priority = options.priority as TaskPriority;
        }

        if (options.tags) {
          updates.tags = options.tags.split(",").map((t) => t.trim());
        }

        if (options.due) {
          const dueDate = parseDate(options.due);
          if (!dueDate) {
            console.error(red("Invalid date format. Use: YYYY-MM-DD"));
            process.exit(1);
          }
          updates.dueDate = dueDate;
        }

        if (Object.keys(updates).length === 0) {
          console.error(red("No updates provided. Use --help to see available options."));
          process.exit(1);
        }

        const updated = await updateTaskById(id, (task) => updateTask(task, updates));

        if (!updated) {
          console.error(red(`Task not found: ${id}`));
          process.exit(1);
        }

        console.log(`${green("✓")} Updated: ${cyan(updated.title)}`);
      }
    );
}
