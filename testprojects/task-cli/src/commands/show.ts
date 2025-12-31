import { Command } from "commander";
import { getTaskById } from "../storage/file.ts";
import { bold, cyan, dim, statusColor, priorityColor, red } from "../utils/colors.ts";
import { formatDateTime, formatRelativeDate } from "../utils/dates.ts";

export function registerShowCommand(program: Command): void {
  program
    .command("show <id>")
    .description("Show task details")
    .action(async (id: string) => {
      const task = await getTaskById(id);

      if (!task) {
        console.error(red(`Task not found: ${id}`));
        process.exit(1);
      }

      console.log();
      console.log(`${bold("Title:")}     ${task.title}`);
      console.log(`${bold("ID:")}        ${task.id}`);
      console.log(`${bold("Status:")}    ${statusColor(task.status)}`);
      console.log(`${bold("Priority:")}  ${priorityColor(task.priority)}`);
      console.log(
        `${bold("Tags:")}      ${task.tags.length > 0 ? cyan(task.tags.join(", ")) : dim("none")}`
      );
      console.log();
      console.log(
        `${bold("Created:")}   ${formatDateTime(task.createdAt)} (${formatRelativeDate(task.createdAt)})`
      );
      console.log(
        `${bold("Updated:")}   ${formatDateTime(task.updatedAt)} (${formatRelativeDate(task.updatedAt)})`
      );

      if (task.dueDate) {
        console.log(
          `${bold("Due:")}       ${formatDateTime(task.dueDate)} (${formatRelativeDate(task.dueDate)})`
        );
      }

      if (task.completedAt) {
        console.log(
          `${bold("Completed:")} ${formatDateTime(task.completedAt)} (${formatRelativeDate(task.completedAt)})`
        );
      }
      console.log();
    });
}
