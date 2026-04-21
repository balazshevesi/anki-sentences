import { render } from "preact";
import { App } from "./app.tsx";

const front = document.getElementById("front")!;
const cardText = front.innerText;
render(<App text={cardText} />, front);
