import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";

registerSW({ immediate: true });
import "@nocturne-rose/sisyphus/theme.css";
import "./theme/base.css";
import "./app/app.css";

createRoot(document.getElementById("root")!).render(<App />);
