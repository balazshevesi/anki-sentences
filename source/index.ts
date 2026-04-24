import { loadDeckConfig } from "./modules/config/deckConfig";
import { runDeckPipeline } from "./modules/deck/pipeline";

try {
  const config = await loadDeckConfig();
  await runDeckPipeline(config);
} catch (error) {
  console.error("Deck generation failed:", error);
  process.exit(1);
}
