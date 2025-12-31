#!/usr/bin/env bun

import { Command } from "commander";
import { registerAddCommand } from "./commands/add.ts";
import { registerListCommand } from "./commands/list.ts";
import { registerCompleteCommand } from "./commands/complete.ts";
import { registerDeleteCommand } from "./commands/delete.ts";
import { registerUpdateCommand } from "./commands/update.ts";
import { registerShowCommand } from "./commands/show.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerStatsCommand } from "./commands/stats.ts";
import { registerExportCommand } from "./commands/export.ts";
import { registerClearCommand } from "./commands/clear.ts";

const program = new Command();

program
  .name("task")
  .description("A command-line task manager")
  .version("1.0.0");

registerAddCommand(program);
registerListCommand(program);
registerCompleteCommand(program);
registerDeleteCommand(program);
registerUpdateCommand(program);
registerShowCommand(program);
registerSearchCommand(program);
registerStatsCommand(program);
registerExportCommand(program);
registerClearCommand(program);

program.parse();
