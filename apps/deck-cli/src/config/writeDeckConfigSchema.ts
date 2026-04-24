import {
  DEFAULT_DECK_CONFIG_SCHEMA_PATH,
  writeDeckConfigJsonSchema,
} from "./deckConfig";

async function run(): Promise<void> {
  await writeDeckConfigJsonSchema();
  console.log(`Wrote deck config schema to ${DEFAULT_DECK_CONFIG_SCHEMA_PATH}`);
}

if (import.meta.main) {
  await run();
}
