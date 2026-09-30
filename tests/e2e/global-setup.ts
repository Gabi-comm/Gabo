import fs from "node:fs";
import path from "node:path";

/** Fresh fake-mode data for every e2e run (chats, overrides). Real .data and config/ are never touched. */
export default function globalSetup() {
  fs.rmSync(path.join(process.cwd(), ".data-fake"), { recursive: true, force: true });
}
