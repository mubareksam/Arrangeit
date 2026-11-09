import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const theme = (() => {
  try {
    return localStorage.getItem("arrangeit.theme") ?? "dusk";
  } catch {
    return "dusk";
  }
})();
document.documentElement.dataset.theme = theme;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
