// @ts-nocheck
import { useState } from "preact/hooks";
import "./app.css";

const Word = ({ word, translatedWord }) => {
  const [popoverIsOpen, setPopoverIsOpen] = useState(false);

  return (
    <span
      onClick={() => {
        setPopoverIsOpen(!popoverIsOpen);
        console.log("clicked", clicked);
      }}
      // style={{ background: clicked ? "red" : "blue" }}
    >
      {word} {popoverIsOpen && <span>{translatedWord}</span>}
    </span>
  );
};

export function App({ cardText, wordByWord }) {
  return (
    <>
      {cardText.split(" ").map((word, idx) => {
        return <Word word={word} translatedWord={wordByWord[idx]} />;
      })}
    </>
  );
}
