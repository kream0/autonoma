import { Command } from "commander";
import { createTask, type TaskPriority } from "../models/task.ts";
import { addTask } from "../storage/file.ts";
import { green, cyan, dim } from "../utils/colors.ts";
import { parseDate } from "../utils/dates.ts";

export function registerAddCommand(program: Command): void {
  program
    .command("add <title>")
    .description("Add a new task")
    .option("-p, --priority <priority>", "Task priority (low, medium, high)", "medium")
    .option("-t, --tags <tags>", "Comma-separated tags")
    .option("-d, --due <date>", "Due date (YYYY-MM-DD)")
    .action(async (title: string, options: { priority: string; tags?: string; due?: string }) => {
      const priority = validatePriority(options.priority);
      if (!priority) {
        console.error("Invalid priority. Use: low, medium, or high");
        process.exit(1);
      }

      let dueDate: string | undefined;
      if (options.due) {
        dueDate = parseDate(options.due);
        if (!dueDate) {
          console.error("Invalid date format. Use: YYYY-MM-DD");
          process.exit(1);
        }
      }

      const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : [];

      const task = createTask(title, { priority, tags, dueDate });
      await addTask(task);

      console.log(`${green("✓")} Task added: ${cyan(title)}`);
      console.log(`  ${dim("ID:")} ${task.id.slice(0, 8)}`);
    });
}

function validatePriority(priority: string): TaskPriority | null {
  if (priority === "low" || priority === "medium" || priority === "high") {
    return priority;
  }
  return null;
}
