import * as assert from "node:assert";
import { describe, it } from "mocha";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  archiveActiveLogIfNeeded,
  formatDateKey,
  getArchiveDateStamp,
  shouldRunOnFocus,
  FOCUS_THROTTLE_MS,
} from "../../extension";

describe("Copilot Telemetry Logger", () => {
  it("formats dates using UTC date key", () => {
    const date = new Date(Date.UTC(2026, 1, 13, 23, 59, 59));
    assert.strictEqual(formatDateKey(date), "2026-02-13");
  });

  it("derives archive date stamp from previous quota reset when parseable", () => {
    const prevKey = "2026-02-14T00:00:00Z";
    const stamp = getArchiveDateStamp(prevKey, new Date(Date.UTC(2026, 1, 13, 0, 0, 0)));
    assert.strictEqual(stamp, "2026-02-14");
  });

  it("falls back to today when previous quota reset is missing or invalid", () => {
    const now = new Date(Date.UTC(2026, 1, 13, 0, 0, 0));
    const invalidKey = "not-a-date";
    assert.strictEqual(getArchiveDateStamp(invalidKey, now), "2026-02-13");
    assert.strictEqual(getArchiveDateStamp("no-reset", now), "2026-02-13");
  });

  it("allows focus logging when throttle window has elapsed", () => {
    const lastRun = 0;
    const now = FOCUS_THROTTLE_MS + 1;
    assert.ok(shouldRunOnFocus(lastRun, now, FOCUS_THROTTLE_MS));
  });

  it("blocks focus logging within the throttle window", () => {
    const lastRun = 1_000_000;
    const now = lastRun + FOCUS_THROTTLE_MS - 1;
    assert.strictEqual(shouldRunOnFocus(lastRun, now, FOCUS_THROTTLE_MS), false);
  });

  it("archives the active log when the quota window changes", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-telemetry-test-"));
    try {
      const activePath = path.join(tmpDir, "copilot-telemetry.jsonl");
      await fs.writeFile(activePath, "line-1\n", "utf8");

      const prevKey = "2026-02-14T00:00:00Z";
      const currentKey = "2026-03-14T00:00:00Z";
      const now = new Date(Date.UTC(2026, 1, 13, 0, 0, 0));

      const archivePath = await archiveActiveLogIfNeeded(tmpDir, prevKey, currentKey, now);
      assert.ok(archivePath);
      assert.strictEqual(path.basename(archivePath ?? ""), "copilot-telemetry-2026-02-14.jsonl");

      const archiveContents = await fs.readFile(archivePath ?? "", "utf8");
      assert.strictEqual(archiveContents, "line-1\n");

      const activeExists = await fs
        .stat(activePath)
        .then(() => true)
        .catch(() => false);
      assert.strictEqual(activeExists, false);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not archive when quota window is unchanged", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-telemetry-test-"));
    try {
      const activePath = path.join(tmpDir, "copilot-telemetry.jsonl");
      await fs.writeFile(activePath, "line-1\n", "utf8");

      const prevKey = "2026-02-14T00:00:00Z";
      const currentKey = "2026-02-14T00:00:00Z";
      const now = new Date(Date.UTC(2026, 1, 13, 0, 0, 0));

      const archivePath = await archiveActiveLogIfNeeded(tmpDir, prevKey, currentKey, now);
      assert.strictEqual(archivePath, null);

      const activeContents = await fs.readFile(activePath, "utf8");
      assert.strictEqual(activeContents, "line-1\n");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
