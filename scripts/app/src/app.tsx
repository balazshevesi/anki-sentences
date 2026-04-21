import { useState } from "preact/hooks";
import "./app.css";

export function App({ cardText }) {
  const [count, setCount] = useState(0);

  return <>{cardText}</>;
}
