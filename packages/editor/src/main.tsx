import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const root = document.querySelector("#root");
if (root === null) throw new Error("Natural editor root was not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
