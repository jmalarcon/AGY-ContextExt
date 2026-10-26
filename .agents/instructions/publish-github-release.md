# Instruction: Publish GitHub Release (via `gh`)

This instruction describes how to create a GitHub Release, tag the release, generate release notes, and attach the release ZIP file using the GitHub CLI (`gh`).

## Prerequisites

1. **GitHub CLI (`gh`)**: Must be installed.
   - Windows: `winget install --id GitHub.cli`
   - macOS: `brew install gh`
   - Linux: `sudo apt install gh` (or distro package manager)
2. **Authentication**: Must be authenticated to GitHub with release/push permissions:

   ```bash
   gh auth status
   ```

   If not logged in, run `gh auth login` and complete interactive web/token login.
3. **Pushed Commits**: The commit corresponding to this version must already be pushed to `origin main` (see [git-commit-push.md](git-commit-push.md)).

---

## Step-by-Step Procedure

### 1. Extract Version & Locate Release ZIP

Ensure the release archive exists in the user's Downloads directory (following [create-release-zip.md](create-release-zip.md)):

```powershell
$version = (Get-Content "src/plugin.json" | ConvertFrom-Json).version
$downloads = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads"
$zipPath = Join-Path $downloads "agy-context-ext-v$version.zip"

if (-not (Test-Path $zipPath)) {
    throw "Release ZIP not found at: $zipPath. Run create-release-zip first."
}
```

### 2. Prepare User-Oriented Release Notes

Draft release notes written **from the end-user's perspective**, highlighting practical benefits, features, and fixes instead of raw git commit logs or dry technical diffs:

- Focus on what the user can do, see, or experience now that was not possible or clear before.
- Group by benefits (e.g. Highlights / What's New / Improvements).
- **MANDATORY**: Always conclude with the standard plugin update instructions so users know how to apply the release.

Example pattern:

```powershell
$notes = @"
## What's New in v$version

- **Stay Ahead of the "Dumb Zone"**: A prominent visual warning and status indicator alert you as your conversation approaches context degradation, helping you decide when to compact or branch before losing nuance.
- **Immediate Context Clarity**: Clear, color-coded memory distribution showing exact token shares consumed by your messages, agent reasoning, tool payloads, and system caches.
- **Precise Quota Tracking**: Instant visibility into your 5-hour and weekly Google Antigravity quotas with countdown timers to your next refresh.

## How to Install or Update

The \`.zip\` contains the plugin folder. Just extract and copy the folder to:

- Windows: \`%USERPROFILE%\.gemini\config\plugins\\`
- macOS/Linux: \`~/.gemini/config/plugins/\`

If you don't see the changes, uninstall and install the plugin from Antigravity or restart the app.
"@
```

Ask the user for confirmation about the release notes before continuing.

### 3. Create Release and Upload Asset

Run `gh release create` to tag, publish the release, and upload the ZIP asset simultaneously:

```powershell
gh release create "v$version" "$zipPath" --title "v$version" --notes "$notes"
```

*(Optional: Use `--draft` if creating an unannounced draft, or `--prerelease` if publishing a beta/RC).*

---

## Verification

Confirm the release is published and the ZIP asset is attached:

```powershell
gh release view "v$version"
```

You can also open the release in your browser:

```powershell
gh release view "v$version" --web
```
