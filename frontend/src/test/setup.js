import "@testing-library/jest-dom";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const setupDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(setupDir, "Report"), { recursive: true });
