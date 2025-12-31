import { Command } from "commander";
import { loadTasks } from "../storage/file.ts";
import { formatDate } from "../utils/dates.ts";

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export tasks to markdown")
    .action(async () => {
      const tasks = await loadTasks();

      const lines: string[] = [];
      lines.push("# Tasks");
      lines.push("");
      lines.push(`*Exported on ${formatDate(new Date().toISOString())}*`);
      lines.push("");

      const pending = tasks.filter((t) => t.status === "pending");
      const inProgress = tasks.filter((t) => t.status === "in_progress");
      const completed = tasks.filter((t) => t.status === "completed");

      if (pending.length > 0) {
        lines.push("## Pending");
        lines.push("");
        for (const task of pending) {
          lines.push(formatTaskMarkdown(task));
        }
        lines.push("");
      }

      if (inProgress.length > 0) {
        lines.push("## In Progress");
        lines.push("");
        for (const task of inProgress) {
          lines.push(formatTaskMarkdown(task));
        }
        lines.push("");
      }

      if (completed.length > 0) {
        lines.push("## Completed");
        lines.push("");
        for (const task of completed) {
          lines.push(formatTaskMarkdown(task, true));
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
      lines.push(
        `**Summary:** ${tasks.length} total | ${pending.length} pending | ${inProgress.length} in progress | ${completed.length} completed`
      );

      console.log(lines.join("\n"));
    });
}

function formatTaskMarkdown(
  task: { title: string; priority: string; tags: string[]; dueDate?: string },
  isCompleted = false
): string {
  const checkbox = isCompleted ? "- [x]" : "- [ ]";
  let line = `${checkbox} **${task.title}**`;

  const meta: string[] = [];

  if (task.priority !== "medium") {
    meta.push(`priority: ${task.priority}`);
  }

  if (task.tags.length > 0) {
    meta.push(`tags: ${task.tags.join(", ")}`);
  }

  if (task.dueDate) {
    meta.push(`due: ${formatDate(task.dueDate)}`);
  }

  if (meta.length > 0) {
    line += ` _(${meta.join(" | ")})_`;
  }

  return line;
}
