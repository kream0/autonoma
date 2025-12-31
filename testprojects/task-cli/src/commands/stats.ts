import { Command } from "commander";
import { loadTasks } from "../storage/file.ts";
import { bold, green, yellow, gray, cyan } from "../utils/colors.ts";

export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description("Show task statistics")
    .action(async () => {
      const tasks = await loadTasks();

      const total = tasks.length;
      const pending = tasks.filter((t) => t.status === "pending").length;
      const inProgress = tasks.filter((t) => t.status === "in_progress").length;
      const completed = tasks.filter((t) => t.status === "completed").length;

      const highPriority = tasks.filter((t) => t.priority === "high" && t.status !== "completed").length;
      const overdue = tasks.filter((t) => {
        if (!t.dueDate || t.status === "completed") return false;
        return new Date(t.dueDate) < new Date();
      }).length;

      console.log();
      console.log(bold("Task Statistics"));
      console.log("─".repeat(30));
      console.log(`${cyan("Total:")}        ${total}`);
      console.log(`${gray("Pending:")}      ${pending}`);
      console.log(`${yellow("In Progress:")} ${inProgress}`);
      console.log(`${green("Completed:")}   ${completed}`);
      console.log("─".repeat(30));

      if (highPriority > 0) {
        console.log(`High Priority: ${highPriority}`);
      }

      if (overdue > 0) {
        console.log(`Overdue:       ${overdue}`);
      }

      if (total > 0) {
        const completionRate = Math.round((completed / total) * 100);
        console.log(`Completion:    ${completionRate}%`);
      }

      console.log();
    });
}
