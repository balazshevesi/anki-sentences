import { render } from "preact";
import { App } from "./app.tsx";

const frontElement = document.getElementById("front")!;
const cardText = frontElement.innerText;
const wordByWord = JSON.parse(document.getElementById("wordByWord")!.innerText);
frontElement.innerText = "";
render(<App cardText={cardText} wordByWord={wordByWord} />, frontElement);
