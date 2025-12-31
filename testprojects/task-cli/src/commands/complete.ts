import { Command } from "commander";
import { completeTask } from "../models/task.ts";
import { updateTaskById } from "../storage/file.ts";
import { green, red, cyan } from "../utils/colors.ts";

export function registerCompleteCommand(program: Command): void {
  program
    .command("complete <id>")
    .alias("done")
    .description("Mark a task as complete")
    .action(async (id: string) => {
      const updated = await updateTaskById(id, completeTask);

      if (!updated) {
        console.error(red(`Task not found: ${id}`));
        process.exit(1);
      }

      console.log(`${green("✓")} Completed: ${cyan(updated.title)}`);
    });
}
