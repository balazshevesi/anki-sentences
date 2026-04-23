import { runCli } from "./cli";

const args = process.argv.slice(2);
const hasSubcommand = args.length > 0 && !args[0]?.startsWith("--");

try {
  await runCli(hasSubcommand ? args : ["pipeline", ...args]);
} catch (error) {
  console.error("Deck generation failed:", error);
  process.exit(1);
}
