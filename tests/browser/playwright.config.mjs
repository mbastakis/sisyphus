import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = process.env.SISYPHUS_TEST_PORT ?? "8423";

// E2E against the production-style single server: FastAPI serves the built
// frontend (frontend/dist) plus the API, with the fake in-memory repository —
// the real Taskwarrior replica is never touched. Run `task build:frontend`
// (or `npm --prefix frontend run build`) before `npm test`.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command:
      `uv run --project backend uvicorn sisyphus.main:app --host 127.0.0.1 --port ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      SISYPHUS_REPOSITORY: "fake",
      SISYPHUS_AUTH: "none",
      SISYPHUS_CONFIG: path.join(root, "config", "boards.yaml"),
      SISYPHUS_STATIC_DIR: path.join(root, "frontend", "dist"),
    },
  },
});
