Copilot Telemetry Logger
=======================

A small Visual Studio Code extension that records a daily, local JSONL entry of your GitHub Copilot "premium_interactions" quota. The log is written to a configurable directory (defaults to the user's home directory).

Where the log is written
- The extension writes newline-delimited JSON entries to `copilot-telemetry.jsonl` in the configured directory.
- By default (empty setting) the directory is the user's home directory. Example resulting file paths:
  - macOS: `~/copilot-telemetry.jsonl`
  - Linux: `~/copilot-telemetry.jsonl`
  - Windows: `%USERPROFILE%\\copilot-telemetry.jsonl`
- The code that performs this is in `src/extension.ts` and uses the `copilotTelemetry.logDirectory` setting.

Configuration
- Setting: `copilotTelemetry.logDirectory` (string)
  - Default: empty string — extension expands this to the OS home directory.
  - You can provide an absolute path or a path starting with `~` (tilde) which will be expanded to the home directory.
  - Example (settings.json):

```json
{
  "copilotTelemetry.logDirectory": "~/logs/copilot"
}
```

Behavior
- The extension activates on VS Code `onStartupFinished` and logs once per UTC day. There is also a command `Copilot Telemetry: Run Daily Log Now` to force a manual run.
- While VS Code is open, the extension can also log on window focus (throttled to once per hour).
- When the quota reset date changes, the current `copilot-telemetry.jsonl` is archived to a dated filename and a new active log file is created.
- The log lines are stable, backward-compatible objects. See `src/extension.ts` for the exact schema and `DEFAULT_LOG_FILE = "copilot-telemetry.jsonl"`.

Development
- Install dependencies and compile:

```bash
npm install
npm run compile
```

- Run tests in the Extension Development Host:

```bash
npm test
```

Troubleshooting
- If the extension reports write permission errors, ensure the configured directory is writable by your user.
- If using Remote - SSH or Codespaces the file will be on the remote host's filesystem.

Debug: Force Quota Reset (Manual Rollover)
- To manually test log rollover without waiting for a real reset, set the `COPILOT_TELEMETRY_FORCE_RESET` environment variable before launching VS Code or the Extension Development Host.
- Example:

```bash
export COPILOT_TELEMETRY_FORCE_RESET="2026-02-14T00:00:00Z"
```

- Run the `Copilot Telemetry: Run Daily Log Now` command once to create or append to the active log file (`copilot-telemetry.jsonl`). Then change the env var to a different date and run the command again. The existing active log will be archived to a dated filename and a new active log will be created.

```bash
export COPILOT_TELEMETRY_FORCE_RESET="2026-03-14T00:00:00Z"
```

License
- MIT

Files to inspect
- Implementation: `src/extension.ts`
- Package manifest (configuration entry): `package.json`
