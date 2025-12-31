import { Command } from "commander";
import { deleteTaskById, getTaskById } from "../storage/file.ts";
import { green, red, cyan } from "../utils/colors.ts";

export function registerDeleteCommand(program: Command): void {
  program
    .command("delete <id>")
    .alias("rm")
    .description("Delete a task")
    .action(async (id: string) => {
      const task = await getTaskById(id);
      if (!task) {
        console.error(red(`Task not found: ${id}`));
        process.exit(1);
      }

      const deleted = await deleteTaskById(id);

      if (!deleted) {
        console.error(red(`Failed to delete task: ${id}`));
        process.exit(1);
      }

      console.log(`${green("✓")} Deleted: ${cyan(task.title)}`);
    });
}
