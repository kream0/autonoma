import { Command } from "commander";
import type { Task } from "../models/task.ts";
import { loadTasks } from "../storage/file.ts";
import { statusColor, priorityColor, dim, bold, cyan } from "../utils/colors.ts";
import { formatRelativeDate } from "../utils/dates.ts";
import { formatTable, type Column } from "../utils/table.ts";

export function registerSearchCommand(program: Command): void {
  program
    .command("search <keyword>")
    .description("Search tasks by keyword")
    .action(async (keyword: string) => {
      const tasks = await loadTasks();
      const lowerKeyword = keyword.toLowerCase();

      const matches = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(lowerKeyword) ||
          t.tags.some((tag) => tag.toLowerCase().includes(lowerKeyword))
      );

      if (matches.length === 0) {
        console.log(dim(`No tasks found matching "${keyword}".`));
        return;
      }

      const columns: Column[] = [
        { header: "ID", width: 8 },
        { header: "Title", width: 35 },
        { header: "Status", width: 12 },
        { header: "Priority", width: 8 },
        { header: "Due", width: 12 },
        { header: "Tags", width: 15 },
      ];

      const rows = matches.map((task) => [
        task.id.slice(0, 8),
        task.title,
        statusColor(task.status),
        priorityColor(task.priority),
        task.dueDate ? formatRelativeDate(task.dueDate) : dim("-"),
        task.tags.length > 0 ? cyan(task.tags.join(", ")) : dim("-"),
      ]);

      console.log(formatTable(columns, rows));
      console.log();
      console.log(`${bold("Found:")} ${matches.length} task${matches.length !== 1 ? "s" : ""}`);
    });
}
