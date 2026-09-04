import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import { runWhenIdle } from "./lib/idle";

// A new build activates its service worker immediately; the page reload that
// follows is deferred until no dialog is open so typing is never interrupted.
registerSW({ immediate: true, onNeedReload: () => runWhenIdle(() => window.location.reload()) });
import "@nocturne-rose/sisyphus/theme.css";
import "./theme/base.css";
import "./app/app.css";

createRoot(document.getElementById("root")!).render(<App />);
