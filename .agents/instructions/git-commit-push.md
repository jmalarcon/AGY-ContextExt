# Instruction: Git Commit & Push

This instruction describes how to stage, review, formulate an exhaustive commit message, and push code changes to GitHub when requested by the user.

## Requirements & Rules

1. **Explicit Request Required**: NEVER run `git commit` or `git push` automatically as part of other workflows (such as release publishing). Commits must only be triggered when the user explicitly requests to commit and push changes. If uncommitted changes exist when publishing a release, warn the user and await instruction.
2. **Mandatory User Confirmation**: ALWAYS present the drafted commit message (header and bulleted body) to the user and obtain their explicit confirmation before creating the commit or pushing to the remote repository.
3. **Clean Worktree Review**: Always run `git status` and `git diff` before staging to verify modified and untracked files. Do not commit temporary scratch files, test logs, or build artifacts.
4. **Commit Message Quality**:
   - **Concise Header**: Short, imperative headline indicating version or main feature (e.g., `v1.2.0 - Add dumb zone indicator and release workflows` or `feat: add dumb zone warning indicator`).
   - **Exhaustive Body**: Separate header from body with a blank line. Include a clear bulleted breakdown explaining *what* was changed and *why*, referencing specific files or components (UI dashboard, sidecar backend, documentation, packaging scripts).
5. **Branch Target**: Push to the primary upstream branch (typically `main`).

---

## Step-by-Step Procedure

### 1. Review Status & Inspect Diffs

```powershell
git status
git diff
```

### 2. Stage Changes

Stage the relevant project files:

```powershell
git add .
```

Confirm staged changes:

```powershell
git status --short
```

### 3. Draft & Request User Confirmation for the Commit Message

Craft a commit message that provides complete context without unnecessary fluff:

```text
v1.2.0 - Add release packaging and modular instruction workflows

- UI Dashboard: Visual and threshold updates for context consumption.
- Backend/Sidecar: Refined quota parsing and terminal suppression.
- Documentation: Modularized operations into .agents/instructions/ and updated AGENTS.md.
- Packaging: Automated cross-platform release ZIP creation.
```

> **CRITICAL**: Present the drafted commit message to the user in chat. **Wait for the user's explicit confirmation or suggested adjustments** before running `git commit` or `git push`.

### 4. Commit and Push to Upstream (Once Confirmed)

Once the user approves the commit message, execute the commit and push:

```powershell
$commitMsg = @"
<approved message>
"@

git commit -m "$commitMsg"
git push origin main
```

---

## Verification

Check that the working directory is clean and the local branch is in sync with `origin/main`:

```powershell
git status
git log -n 1 --stat
```
