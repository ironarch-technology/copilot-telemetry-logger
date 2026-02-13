import * as vscode from "vscode";
import * as os from "os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

interface QuotaSnapshot {
  quota_id: string;
  timestamp_utc?: string;
  entitlement?: number;
  remaining?: number;
  unlimited?: boolean;
}

interface CopilotUserData {
  quota_snapshots?: Record<string, QuotaSnapshot>;
  quota_reset_date_utc?: string;
}

interface DailyLogEntry {
  date: string;
  timestamp: string;
  premium_entitlement: number | null;
  premium_remaining: number | null;
  premium_used: number | null;
  quota_reset_date_utc: string | null;
  source: "github_copilot_internal";
  version: 1;
}

const LAST_RUN_KEY = "copilotTelemetry.lastRunDate";
const LAST_FOCUS_RUN_TS_KEY = "copilotTelemetry.lastFocusRunTs";
const CURRENT_QUOTA_RESET_KEY = "copilotTelemetry.currentQuotaReset";
const DEFAULT_LOG_FILE = "copilot-telemetry.jsonl";
const NO_RESET_KEY = "no-reset";
const FORCE_RESET_ENV = "COPILOT_TELEMETRY_FORCE_RESET";
export const FOCUS_THROTTLE_MS = 60 * 60 * 1000;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("copilotTelemetry.runNow", async () => {
      await runDailyLog(context, "manual");
    })
  );

  if (!isTestEnvironment()) {
    // Log on activation (startup)
    void runDailyLog(context, "startup");

    // Trigger on window focus but throttle to at most once per hour
    const focusDisposable = vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) return;
      const last = context.globalState.get<number>(LAST_FOCUS_RUN_TS_KEY) ?? 0;
      if (shouldRunOnFocus(last, Date.now(), FOCUS_THROTTLE_MS)) {
        void runDailyLog(context, "focus");
        void context.globalState.update(LAST_FOCUS_RUN_TS_KEY, Date.now());
      }
    });
    context.subscriptions.push(focusDisposable);
  }
}

export function deactivate(): void {
  // no-op
}

async function runDailyLog(
  context: vscode.ExtensionContext,
  trigger: "startup" | "manual" | "focus"
): Promise<void> {
  try {
    const today = new Date();
    const todayKey = formatDateKey(today);
    const lastRunKey = context.globalState.get<string>(LAST_RUN_KEY);

    if (trigger === "startup" && lastRunKey === todayKey) {
      return;
    }

    const data = await fetchCopilotUserData();
    const forcedReset = process.env[FORCE_RESET_ENV];
    if (forcedReset && forcedReset.trim().length > 0) {
      data.quota_reset_date_utc = forcedReset.trim();
    }
    const quota = extractPremiumQuota(data);

    const entry: DailyLogEntry = {
      date: todayKey,
      timestamp: new Date().toISOString(),
      premium_entitlement: quota?.entitlement ?? null,
      premium_remaining: quota?.remaining ?? null,
      premium_used:
        quota && quota.entitlement != null && quota.remaining != null
          ? Math.max(0, quota.entitlement - quota.remaining)
          : null,
      quota_reset_date_utc: data.quota_reset_date_utc ?? null,
      source: "github_copilot_internal",
      version: 1
    };

    await appendDailyLog(context, entry);
    await context.globalState.update(LAST_RUN_KEY, todayKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Copilot Telemetry Logger failed:", message);
    vscode.window.showWarningMessage(
      `Copilot Telemetry Logger failed to record usage: ${message}`
    );
  }
}

async function fetchCopilotUserData(): Promise<CopilotUserData> {
  const session = await vscode.authentication.getSession("github", ["user:email"], {
    createIfNone: true
  });

  if (!session) {
    throw new Error("GitHub authentication session not available");
  }

  const response = await fetch("https://api.github.com/copilot_internal/user", {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json",
      "User-Agent": "Copilot-Telemetry-Logger"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as CopilotUserData;
  return json ?? {};
}

function extractPremiumQuota(data: CopilotUserData): QuotaSnapshot | null {
  const snapshots = data.quota_snapshots ? Object.values(data.quota_snapshots) : [];
  const premium = snapshots.find((quota) => quota.quota_id === "premium_interactions");
  if (!premium || premium.unlimited) {
    return null;
  }
  return premium;
}

async function appendDailyLog(
  context: vscode.ExtensionContext,
  entry: DailyLogEntry
): Promise<void> {
  // Read user-configured directory from settings. If empty, default to the
  // user's home directory. The setting accepts a path to a directory. A
  // leading '~' will be expanded to the user's home directory.
  const config = vscode.workspace.getConfiguration("copilotTelemetry");
  const configured = config.get<string>("logDirectory") ?? "";
  const trimmed = configured.trim();

  let dirPath: string;
  if (trimmed.length === 0) {
    dirPath = os.homedir();
  } else if (trimmed.startsWith("~")) {
    dirPath = path.join(os.homedir(), trimmed.slice(1));
  } else {
    dirPath = trimmed;
  }

    // Ensure directory exists (use node fs for append-only writes to avoid
    // reading/writing the entire file every time).
    await fs.mkdir(dirPath, { recursive: true });

    // Determine current and previous quota reset markers. We keep a single
    // active file named `copilot-telemetry.jsonl`. When the quota reset value
    // changes, roll the existing active file to an archive file that includes
    // a date (YYYY-MM-DD) and start a new active file.
    const currentQuotaKey = entry.quota_reset_date_utc ?? NO_RESET_KEY;
    const prevQuotaKey = context.globalState.get<string>(CURRENT_QUOTA_RESET_KEY) ?? NO_RESET_KEY;

    await archiveActiveLogIfNeeded(dirPath, prevQuotaKey, currentQuotaKey, new Date());

    const activeFilePath = path.join(dirPath, DEFAULT_LOG_FILE);
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(activeFilePath, line, "utf8");

    // Update stored current quota reset marker so future runs know the active
    // quota window.
    await context.globalState.update(CURRENT_QUOTA_RESET_KEY, currentQuotaKey);

    // Notify the user of the resolved file path so debugger/test runs can
    // easily find the output. This is intentionally visible to users.
    void vscode.window.showInformationMessage(`Copilot telemetry written to ${activeFilePath}`);
  }

export function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getArchiveDateStamp(prevQuotaKey: string, now: Date): string {
  if (prevQuotaKey !== NO_RESET_KEY) {
    const parsedPrev = new Date(prevQuotaKey);
    if (!isNaN(parsedPrev.getTime())) {
      return formatDateKey(parsedPrev);
    }
  }

  return formatDateKey(now);
}

export function shouldRunOnFocus(lastRunTs: number, nowMs: number, throttleMs: number): boolean {
  return nowMs - lastRunTs >= throttleMs;
}

export async function archiveActiveLogIfNeeded(
  dirPath: string,
  prevQuotaKey: string,
  currentQuotaKey: string,
  now: Date
): Promise<string | null> {
  if (prevQuotaKey === currentQuotaKey) {
    return null;
  }

  const activeFilePath = path.join(dirPath, DEFAULT_LOG_FILE);

  try {
    await fs.stat(activeFilePath);
  } catch {
    return null;
  }

  const dateStamp = getArchiveDateStamp(prevQuotaKey, now);
  const archiveName = `copilot-telemetry-${dateStamp}.jsonl`;
  const archivePath = path.join(dirPath, archiveName);

  try {
    await fs.rename(activeFilePath, archivePath);
  } catch {
    await fs.copyFile(activeFilePath, archivePath);
    await fs.unlink(activeFilePath);
  }

  return archivePath;
}

function isTestEnvironment(): boolean {
  return Boolean(process.env.VSCODE_EXTENSION_TEST || process.env.VSCODE_TEST || process.env.NODE_ENV === "test");
}
