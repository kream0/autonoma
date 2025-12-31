import { Command } from "commander";
import { clearCompletedTasks } from "../storage/file.ts";
import { green, dim } from "../utils/colors.ts";

export function registerClearCommand(program: Command): void {
  program
    .command("clear")
    .description("Clear tasks")
    .option("-c, --completed", "Clear all completed tasks")
    .action(async (options: { completed?: boolean }) => {
      if (!options.completed) {
        console.log(dim("Use --completed to clear completed tasks."));
        return;
      }

      const count = await clearCompletedTasks();

      if (count === 0) {
        console.log(dim("No completed tasks to clear."));
        return;
      }

      console.log(`${green("✓")} Cleared ${count} completed task${count !== 1 ? "s" : ""}`);
    });
}
