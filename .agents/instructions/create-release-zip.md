# Instruction: Create Release ZIP

This instruction describes how to package `AGY-ContextExt` into a clean distribution ZIP archive when explicitly requested by the user.

## Requirements & Rules

1. **Version Detection**: Extract the current version string `x.y.z` dynamically from `src/plugin.json`.
2. **Archive Name**: `agy-context-ext-vx.y.z.zip`.
3. **Internal Structure**: The archive must contain a single top-level directory named `agy-context-ext/` which encloses all files and folders directly from `src/` (e.g., `agy-context-ext/plugin.json`, `agy-context-ext/assets/logo.svg`, `agy-context-ext/sidecars/...`).
4. **Target Destination**: The user's OS `Downloads` folder.
5. **No Pollution**: Use a temporary staging folder and clean it up immediately after compression.

---

## Execution Commands

### Windows (PowerShell)

```powershell
$version = (Get-Content "src/plugin.json" | ConvertFrom-Json).version
$downloads = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads"
$zipPath = Join-Path $downloads "agy-context-ext-v$version.zip"
$tempStage = Join-Path ([System.IO.Path]::GetTempPath()) "agy-release-staging"

if (Test-Path $tempStage) { Remove-Item -Path $tempStage -Recurse -Force }
$stageDir = Join-Path $tempStage "agy-context-ext"
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
Copy-Item -Path "src\*" -Destination $stageDir -Recurse -Force

if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }
Compress-Archive -Path $stageDir -DestinationPath $zipPath -Force
Remove-Item -Path $tempStage -Recurse -Force

Write-Output "Release ZIP created at: $zipPath"
```

### macOS / Linux (Bash / Zsh)

```bash
VERSION=$(node -p "require('./src/plugin.json').version")
DOWNLOADS="$HOME/Downloads"
ZIP_PATH="$DOWNLOADS/agy-context-ext-v$VERSION.zip"
TEMP_STAGE=$(mktemp -d)
STAGE_DIR="$TEMP_STAGE/agy-context-ext"

mkdir -p "$STAGE_DIR"
cp -R src/* "$STAGE_DIR/"
rm -f "$ZIP_PATH"
(cd "$TEMP_STAGE" && zip -r "$ZIP_PATH" agy-context-ext)
rm -rf "$TEMP_STAGE"

echo "Release ZIP created at: $ZIP_PATH"
```

---

## Verification

Verify that the ZIP archive is valid and has the required `agy-context-ext/...` prefix:

- **PowerShell**:
  ```powershell
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  $zip.Entries | Select-Object -ExpandProperty FullName
  $zip.Dispose()
  ```
- **Bash**:
  ```bash
  unzip -l "$ZIP_PATH"
  ```
