# Subscription Quota & Delegated Authentication Architecture

This document describes how `AGY-ContextExt` monitors rate limits and subscription quotas (5-hour rolling refresh window and weekly limits).

## 1. Delegated Authentication Model

The plugin utilizes a **zero-credential footprint**:
- No API keys, passwords, or OAuth credentials are stored, handled, or required by the plugin.
- The sidecar backend executes the local CLI command `agy --output-format json --print "/usage"` as a child process.

## 2. Silent Auth via Native OS Keyring

When `agy` runs, it performs **Silent Authentication** via its internal keyring manager:
- It retrieves the active OAuth 2.0 session token from the host operating system's native secure credential store:
  - **Windows**: Windows Credential Manager (DPAPI-encrypted).
  - **macOS**: Keychain.
  - **Linux**: Secret Service API (`libsecret`).
- If the access token is near expiration, `agy` automatically executes the OAuth token refresh handshake against Google's authentication servers.

## 3. Upstream Google API Endpoint

With a valid Bearer token, `agy` issues an HTTPS request:
- **Endpoint**: `POST https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary`
- **Header**: `Authorization: Bearer <oauth_access_token>`
- **Response Format**:
  Structured JSON containing model groups and quota buckets:
  ```json
  {
    "command": {
      "name": "usage",
      "data": {
        "groups": [
          {
            "name": "Gemini Models",
            "buckets": [
              {
                "id": "gemini-5h",
                "name": "Five Hour Limit Remaining",
                "window": "5h",
                "remaining_fraction": 0.988,
                "reset_time": "2026-10-09T23:29:33Z",
                "description": "..."
              },
              {
                "id": "gemini-weekly",
                "name": "Weekly Limit Remaining",
                "window": "weekly",
                "remaining_fraction": 0.946,
                "reset_time": "2026-10-14T06:59:11Z",
                "description": "..."
              }
            ]
          }
        ]
      }
    }
  }
  ```

## 4. Backend Caching & Asynchronous Worker

Because network requests to Google's backend take ~1.5 to 2.5 seconds:
- **Asynchronous Worker**: The fetcher runs in the background and stores the result in `cachedSubscription`.
- **TTL Cache**: Quota data is cached for **2 minutes** (`SUBSCRIPTION_CACHE_TTL = 120_000`).
- **Decoupling**: The 1.5-second polling loop for context tokens remains fast and unblocked.
- **On-Demand Refresh**: `GET /api/subscription/refresh` triggers an immediate background fetch when the user clicks the refresh button on the UI.
- **Headless Execution (`windowsHide: true`)**: Child process execution sets `windowsHide: true` to prevent any terminal or console window flashing on Windows when invoking `agy`.

## 5. Cross-Platform Binary Discovery & Fallbacks

Desktop GUI environments on macOS and Linux frequently launch without the user's terminal `PATH` additions (such as `~/.local/bin` or `/opt/homebrew/bin`). To guarantee `agy` is discovered across platforms:

1. **Candidate Path Search (`resolveAgyCommand`)**:
   - **Windows**: Checks `%LOCALAPPDATA%\agy\bin\agy.exe`, `%USERPROFILE%\AppData\Local\agy\bin\agy.exe`, and `%USERPROFILE%\.gemini\antigravity\bin\agy.exe`.
   - **macOS / Linux**: Checks `~/.local/bin/agy`, `~/bin/agy`, `/opt/homebrew/bin/agy`, `/usr/local/bin/agy`, `/usr/bin/agy`, and `~/.gemini/antigravity/bin/agy`.
2. **Augmented Environment (`getAugmentedEnv`)**:
   - Injects the standard user bin directories into the child process `PATH` (`:` separator on POSIX, `;` on Windows) before invoking `exec()`.
3. **Graceful UI Fallback**:
   - If the CLI binary is missing or the user is logged out, the backend returns an error indicator and the frontend displays a clear message rather than hanging indefinitely.
