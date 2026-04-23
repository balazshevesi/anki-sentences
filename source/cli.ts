import { cac } from "cac";
import { COMMAND_DEFINITIONS } from "./modules/cli/defaults";
import { addCommonOptions, normalizeRawArgs, parseCliOptions } from "./modules/cli/options";
import { runCommand } from "./modules/cli/run";
import type { CommandDefinition, RawCliOptions } from "./modules/cli/types";

function registerCommand(
  cli: ReturnType<typeof cac>,
  commandDefinition: CommandDefinition,
  onCommand: (name: CommandDefinition["name"], options: RawCliOptions) => Promise<void>,
): void {
  const command = cli.command(
    commandDefinition.name,
    commandDefinition.description,
  );
  addCommonOptions(command);
  command.action(async (rawOptions) => {
    await onCommand(commandDefinition.name, rawOptions as RawCliOptions);
  });
}

export async function runCli(rawArgs = process.argv.slice(2)): Promise<void> {
  const normalizedArgs = normalizeRawArgs(rawArgs);
  let commandExecution: Promise<void> | null = null;

  const cli = cac("deck");
  cli.usage("<command> [options]");

  for (const commandDefinition of COMMAND_DEFINITIONS) {
    registerCommand(cli, commandDefinition, async (commandName, rawOptions) => {
      const options = parseCliOptions(rawOptions);
      commandExecution = runCommand(commandName, options);
      await commandExecution;
    });
  }

  cli.help();
  cli.parse(["bun", "cli.ts", ...normalizedArgs], { run: true });

  if (commandExecution) {
    await commandExecution;
  }
}

if (import.meta.main) {
  await runCli();
}
