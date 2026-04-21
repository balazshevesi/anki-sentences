import { useState } from "preact/hooks";
import "./app.css";

type WordProps = {
  word: string;
  translatedWord: string;
};

type AppProps = {
  cardText: string;
  wordByWord: string[];
};

function Word({ word, translatedWord }: WordProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button
      class="word-token"
      type="button"
      onClick={() => setIsOpen((open) => !open)}
    >
      <span>{word}</span>
      {isOpen && translatedWord.length > 0 && (
        <span class="word-translation">{translatedWord}</span>
      )}
    </button>
  );
}

function tokenizeSentence(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function App({ cardText, wordByWord }: AppProps) {
  const tokens = tokenizeSentence(cardText);

  return (
    <div class="card-words" role="group" aria-label="Sentence words">
      {tokens.map((word, index) => (
        <Word
          key={`${word}-${index}`}
          word={word}
          translatedWord={wordByWord[index] ?? ""}
        />
      ))}
    </div>
  );
}
