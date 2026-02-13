# AGENTS.md

This repository is a VS Code extension that logs daily GitHub Copilot premium usage locally.
This file guides agentic coding tools working in this repo.

## Quick Facts

- Language: TypeScript
- Runtime: VS Code extension host (Node.js)
- Entry point: `src/extension.ts`
- Output: `out/extension.js`
- Local logs: `globalStorage` file `copilot-telemetry.jsonl`

## Build, Lint, Test

Use npm scripts from the repo root.

- Install dependencies: `npm install`
- Compile: `npm run compile`
- Watch: `npm run watch`
- Lint: `npm run lint`
- Test (all): `npm test`

### Running a single test

The test harness loads files matching `src/test/suite/**/*.test.ts`.
To run a single test, add `.only` to a `describe` or `it` in the target test.
Example:

```ts
describe.only("Copilot Telemetry Logger", () => {
  it("logs a daily entry", () => {
    // ...
  });
});
```

Then run:

```sh
npm test
```

Remove `.only` before committing.

## Repository Commands (Reference)

- `npm run compile`: TypeScript build to `out/`
- `npm run lint`: ESLint for `src/`
- `npm test`: VS Code extension test runner

## Project Behavior

- Runs on `onStartupFinished` activation.
- Logs once per day (UTC date key).
- Uses GitHub auth session via VS Code and the internal endpoint:
  `https://api.github.com/copilot_internal/user`
- Tracks `premium_interactions` quota only.
- Writes append-only JSONL in extension global storage.

## Code Style Guidelines

### Imports

- Prefer `import type` for types.
- Group imports: node built-ins, external, internal.
- Use explicit module paths (no implicit index barrels unless already in use).

### Formatting

- Use 2 spaces for indentation.
- Use double quotes for strings.
- Keep lines under ~110 chars where possible.
- Use trailing commas in multiline objects/arrays.

### Types

- Use explicit types for public functions and exported APIs.
- Avoid `any`. Use `unknown` with narrowing where needed.
- Prefer interfaces for structured objects.

### Naming

- `camelCase` for variables/functions.
- `PascalCase` for types and classes.
- `UPPER_SNAKE_CASE` for constants.
- Booleans should read as predicates (`isReady`, `hasData`).

### Error Handling

- Catch at top-level command boundaries.
- Include helpful context in thrown errors.
- Prefer user-facing warning messages only when action is blocked.
- Log internal errors with `console.error` for diagnostics.

### Async

- Prefer `async/await` over chained promises.
- Avoid unhandled promise rejections; `void` fire-and-forget only when safe.

### File/Storage

- Use `context.globalStorageUri` for local logs.
- Never store secrets or access tokens in files.

### Time/Date

- Use UTC date key (`YYYY-MM-DD`) for daily logs.
- Keep timestamps in ISO-8601 UTC.

## Extension Behavior Guidelines

- Do not spam notifications; use warnings only for failures.
- Avoid blocking the activation path.
- Keep log entries stable and backward compatible.

## Security and Privacy

- Log only aggregate daily values; do not store raw prompts or content.
- Keep data local to the machine.

## Cursor/Copilot Rules

- No `.cursorrules` or `.cursor/rules/` files found.
- No `.github/copilot-instructions.md` found.

## Suggested Workflow for Agents

- Update or add tests when changing logic.
- Run `npm run lint` before finalizing changes.
- Keep `AGENTS.md` aligned with new scripts or conventions.
