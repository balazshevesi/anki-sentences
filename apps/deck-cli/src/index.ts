import { loadDeckConfig } from "./config/deckConfig";
import { runDeckPipeline } from "./orchestration/pipeline";

try {
  const config = await loadDeckConfig();
  await runDeckPipeline(config);
} catch (error) {
  console.error("Deck generation failed:", error);
  process.exit(1);
}
