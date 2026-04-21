import { render } from "preact";
import { App } from "./app.tsx";

const frontElement = document.getElementById("front")!;
const cardText = frontElement.innerText;
frontElement.innerText = "";
render(<App cardText={cardText} />, frontElement);
