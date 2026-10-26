# AGENTS.md: Developer & Agent Guide for AGY-ContextExt

## 1. Purpose & Scope

`AGY-ContextExt` is a UI extension plugin for the **Google Antigravity 2 Desktop Application** (Electron-based). It provides live, visual monitoring of the active conversation's context window consumption and subscription rate limits inside the right-hand **Auxiliary Pane**.

Key features:

- Live token consumption vs. capacity (1.0M Flash, 2.0M Pro).
- Segmented progress bar and 200-block memory heatmap (each block = 0.5% or ~5k tokens).
- 4-category token breakdown (User, Agent, Tool, System/Cache).
- Subscription rate limits: 5-hour rolling refresh window and weekly quotas with countdowns to reset.
- Configurable background polling interval (1 to 60s, or 0 for manual refresh) with dynamic Live/Manual status indicator. Default 2s.

## 2. Antigravity Customization Framework

When modifying this repository, refer to the built-in skills available by default in Antigravity:

- **`agy-customizations`**: `<appDataDir>/builtin/skills/agy-customizations/SKILL.md` (discovery priority, plugins).
- **`ui-extension`**: `<appDataDir>/builtin/skills/ui-extension/SKILL.md` (Sidecar SDK, auxiliary pane views).

### Discovery & Runtime Paths

- **Windows**: `%USERPROFILE%\.gemini\config\plugins\agy-context-ext\`
- **macOS / Linux**: `~/.gemini/config/plugins/agy-context-ext/`

## 3. Repository File Layout (`src/`)

```text
src/
├── plugin.json                  # Top-level plugin manifest (id, version, description, logo)
├── assets/
│   └── logo.svg                 # 64x64 SVG icon displayed in Customizations UI
└── sidecars/
    └── panel/                   # UI extension sidecar
        ├── sidecar.json         # Sidecar manifest (web UI & entrypoint)
        ├── package.json         # ES module configuration ({"type": "module"}, version)
        ├── main.mjs             # Node.js backend: SidecarApp, API, log & quota parser
        └── index.html           # Inlined frontend dashboard (HTML, CSS, JS)
```

## 4. Deep Technical Documentation (`.agents/docs/`)

To keep this guide concise and avoid context bloat, implementation details are modularized in [`.agents/docs/`](/.agents/docs/):

- [`.agents/docs/telemetry-log-parsing.md`](/.agents/docs/telemetry-log-parsing.md): Local transcript discovery (`transcript.jsonl`), token telemetry schema, character-to-token heuristics, and model capacity detection.
- [`.agents/docs/subscription-quota.md`](/.agents/docs/subscription-quota.md): Delegated authentication architecture, Silent Auth via OS Keyring, upstream Google endpoint (`retrieveUserQuotaSummary`), and background caching.
- [`.agents/docs/sidecar-architecture.md`](/.agents/docs/sidecar-architecture.md): Sidecar process lifecycle, Sidecar SDK integration, `preload.js` bridge, and Electron iframe caching mitigation.
- [`.agents/docs/ui-dashboard.md`](/.agents/docs/ui-dashboard.md): 200-cell heatmap math, high-contrast theme color tokens, and UI update lifecycles.

> **Agent Instruction**: Consult the specific document in `.agents/docs/` only when working on that domain.

## 5. Operational Instructions (`.agents/instructions/`)

To avoid context bloat, step-by-step procedures for releases, Git operations, and packaging are modularized in [`.agents/instructions/`](/.agents/instructions/):

- [`.agents/instructions/create-release-zip.md`](/.agents/instructions/create-release-zip.md): Packaging the extension into a distribution ZIP (`agy-context-ext-vx.y.z.zip`) in the OS `Downloads` folder.
- [`.agents/instructions/git-commit-push.md`](/.agents/instructions/git-commit-push.md): Staging, crafting exhaustive commit messages, and pushing clean commits to GitHub.
- [`.agents/instructions/publish-github-release.md`](/.agents/instructions/publish-github-release.md): Tagging, drafting release notes, and publishing GitHub Releases with the ZIP asset using GitHub CLI (`gh`).

> **Agent Instruction**: Consult the corresponding instruction in `.agents/instructions/` only when explicitly performing that task.

## 6. Development Workflow & Testing Rules

1. **Keep Frontend Inlined**: Maintain all CSS and JS within `src/sidecars/panel/index.html`. Separate asset files are aggressively cached by Electron and fail to update.
2. **Syncing to Local Antigravity**:
   For development purposes the contents of the `src` folder in this repo must be automatically copied to the local Antigravity plugins directory on every change, to try the live extension running in Antigravity 2 without restarting the app. Never hardcode absolute repository paths. Always derive paths dynamically relative to the current project root:

   - **Windows (PowerShell)**:

     ```powershell
     Copy-Item -Path (Join-Path (Get-Location) "src\*") -Destination "$env:USERPROFILE\.gemini\config\plugins\agy-context-ext\" -Recurse -Force
     ```

   - **macOS / Linux (Bash / Zsh)**:

     ```bash
     mkdir -p ~/.gemini/config/plugins/agy-context-ext
     cp -R ./src/* ~/.gemini/config/plugins/agy-context-ext/
     ```

3. **Cache Invalidation & Sidecar Restart**:
   - `index.html` edits: Closing and reopening the panel in Antigravity or toggling it in **⋮ -> Extensions** loads the new HTML.
   - `main.mjs` or `sidecar.json` edits: In **Customizations -> Installed**, toggle **Context Usage** OFF and back ON.

4. **Semantic Versioning (SemVer) Enforcement**:
   Every code change made to this repository MUST increment the version number in both `src/plugin.json` and `src/sidecars/panel/package.json` according to Semantic Versioning (`MAJOR.MINOR.PATCH`):
   - **PATCH** (`1.0.X`): Backwards-compatible bug fixes, styling polishes, minor refactors, or documentation corrections.
   - **MINOR** (`1.X.0`): New user features or UI controls (e.g. interval selector, new telemetry indicators), backwards-compatible capabilities.
   - **MAJOR** (`X.0.0`): Breaking changes, incompatible manifest formats, or sidecar communication protocol redesigns.
   Always keep the version string in `src/plugin.json` and `src/sidecars/panel/package.json` perfectly synchronized.

## 7. Documentation Maintenance Rules for AI Agents

To keep context lightweight and accurate across sessions, agents must follow these rules:

1. **Keep Existing Docs Synchronized**: Whenever you modify or refactor code, immediately update the corresponding technical document referenced in [Section 4](#4-deep-technical-documentation-agentsdocs). Never leave documentation out of date with the implementation.
2. **Modularize New Features**: If you introduce a new feature, architecture, or non-trivial domain, do not add extensive implementation details to this file. Create a new markdown document inside `.agents/docs/` and add a concise reference to it in Section 4.
3. **User Documentation**: Any change that alters end-user installation, settings, or visible behavior must be reflected in [`README.md`](README.md) following ASD-STE100 Simplified Technical English.
