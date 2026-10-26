# Instruction: Publish GitHub Release (via `gh`)

This instruction describes how to create a GitHub Release, tag the release, generate release notes, and attach the release ZIP file using the GitHub CLI (`gh`).

## Critical Rules & Guidelines

1. **NO Automatic Commits**: NEVER execute `git commit` or `git push` automatically as part of publishing a release.
   - If there are uncommitted changes or untracked modifications (`git status --porcelain` is not clean), **warn the user** explicitly in case they forgot, but do NOT commit them without explicit instruction.
2. **Strictly Incremental Notes (Since Previous Release)**:
   - Identify the immediately preceding release tag (e.g., `git describe --tags --abbrev=0` or `gh release list --limit 2`).
   - Inspect ONLY the commits between the previous tag and HEAD:
     ```powershell
     $prevTag = git describe --tags --abbrev=0 2>$null
     git log "$prevTag..HEAD" --oneline
     ```
   - Do NOT include or repeat features/fixes that were already shipped in previous releases. Only new capabilities and bug fixes introduced strictly in this release cycle must be listed.
3. **User-Centric Tone**: Highlight practical benefits and what the user experiences or can now do, rather than technical code diffs or internal refactoring details.
4. **Mandatory Installation/Update Block**: Every release description must conclude with the exact installation/update instructions.

---

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
3. **Clean or Confirmed Working Tree**: Check `git status`.
   - If uncommitted changes exist, warn the user and ask if they wish to commit them first.
   - Never commit automatically.

---

## Step-by-Step Procedure

### 1. Check Previous Release & Review Incremental Changes

Find the latest published release tag and inspect the commit log strictly between that tag and current HEAD:

```powershell
$prevTag = git describe --tags --abbrev=0 2>$null
if ($prevTag) {
    Write-Host "Comparing changes since previous release: $prevTag"
    git log "$prevTag..HEAD" --oneline
} else {
    Write-Host "No previous release tag found. Inspecting recent history:"
    git log -n 10 --oneline
}
```

Review the commits to identify only the new user-facing features, improvements, or fixes delivered strictly in this cycle since `$prevTag`.

### 2. Extract Version & Locate Release ZIP

Ensure the release archive exists in the user's Downloads directory (following [create-release-zip.md](create-release-zip.md)):

```powershell
$version = (Get-Content "src/plugin.json" | ConvertFrom-Json).version
$downloads = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads"
$zipPath = Join-Path $downloads "agy-context-ext-v$version.zip"

if (-not (Test-Path $zipPath)) {
    throw "Release ZIP not found at: $zipPath. Run create-release-zip first."
}
```

### 3. Prepare User-Oriented Release Notes

Draft release notes written **strictly from the end-user's perspective**, detailing only the changes introduced since the previous release:

- Highlight tangible user benefits.
- Do NOT list features that already shipped in earlier versions.
- **MANDATORY**: Always conclude with the standard plugin update instructions:

```markdown
## How to Install or Update

The `.zip` contains the plugin folder. Just extract and copy the folder to:

- Windows: `%USERPROFILE%\.gemini\config\plugins\`
- macOS/Linux: `~/.gemini/config/plugins/`

If you don't see the changes, uninstall and install the plugin from Antigravity or restart the app.
```

Present the proposed release notes to the user for confirmation before publishing.

### 4. Create Release and Upload Asset

Save the release notes to a temporary UTF-8 file (avoiding CLI quoting/escaping errors in PowerShell) and run `gh release create`:

```powershell
$notesFile = Join-Path ([System.IO.Path]::GetTempPath()) "release-notes-v$version.md"
Set-Content -Path $notesFile -Value $notes -Encoding UTF8

gh release create "v$version" "$zipPath" --title "v$version" --notes-file "$notesFile"

Remove-Item -Path $notesFile -Force
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
