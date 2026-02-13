# Release Notes

Current release: `v1.0.2`

This repository ships as a VS Code extension packaged in a `.vsix` file. Use the steps
below to install the release artifact in VS Code.

## Install a .vsix in VS Code

1. Download the `.vsix` file from the GitHub Release assets or build it locally.
2. Open VS Code.
3. Open the Extensions view.
4. Select the overflow menu (`...`) and choose `Install from VSIX...`.
5. Pick the downloaded `.vsix` file and confirm.

## Verify the install

Open the Command Palette and run `Copilot Telemetry: Run Daily Log Now`. This writes
`copilot-telemetry.jsonl` to the configured directory and confirms the extension is active.
