import { render } from "preact";
import { App } from "./app.tsx";
import "./index.css";

function parseWordByWord(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) => (typeof item === "string" ? item : String(item)));
  } catch {
    return [];
  }
}

const frontElement = document.getElementById("front");
const wordByWordElement = document.getElementById("wordByWord");

if (!frontElement || !wordByWordElement) {
  throw new Error("Missing expected card fields in template.");
}

const cardText = frontElement.innerText;
const wordByWord = parseWordByWord(wordByWordElement.innerText);

frontElement.innerText = "";
render(<App cardText={cardText} wordByWord={wordByWord} />, frontElement);
