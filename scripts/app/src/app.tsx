// @ts-nocheck
import { useState } from "preact/hooks";
import "./app.css";

const Word = ({ word }) => {
  const [clicked, setClicked] = useState(false);

  return (
    <span
      onClick={() => {
        setClicked(!clicked);
        console.log("clicked", clicked);
      }}
      style={{ background: clicked ? "red" : "blue" }}
    >
      {word}{" "}
    </span>
  );
};

export function App({ cardText }) {
  return (
    <>
      {cardText.split(" ").map((word) => {
        return <Word word={word} />;
      })}
    </>
  );
}
