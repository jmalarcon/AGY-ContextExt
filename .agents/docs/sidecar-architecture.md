# Sidecar Architecture & Antigravity Runtime

This document details the lifecycle, packaging, and communication architecture of the Node.js sidecar in `AGY-ContextExt`.

## 1. Sidecar Lifecycle & Manifest

A sidecar is a background process managed by the Antigravity desktop supervisor.

In `src/sidecars/panel/sidecar.json`:
```json
{
  "command": "node",
  "args": ["main.mjs"],
  "restart_policy": "always",
  "display_name": "Context Usage",
  "description": "Displays live context window consumption and subscription limits",
  "has_web_ui": true,
  "ui_config": {
    "display_name": "Context Usage",
    "views": [
      {
        "path": "/",
        "entrypoint": "SIDECAR_UI_ENTRYPOINT_AUX_PANE",
        "title": "Context Usage"
      }
    ]
  }
}
```

- **`command: "node"`**: Antigravity automatically resolves this to its own bundled Node.js runtime if present, or falls back to system Node.js on `PATH`.
- **`entrypoint: "SIDECAR_UI_ENTRYPOINT_AUX_PANE"`**: Instructs Antigravity to render this view in the right-side Auxiliary Pane.
- **`restart_policy: "always"`**: Ensures supervisor restarts the process if unexpected errors occur.

## 2. Environment Variables & Sidecar SDK

Antigravity injects specific environment variables into the process:
- `ANTIGRAVITY_SIDECAR_WEB_PORT`: The random port the HTTP server must bind to.
- `ANTIGRAVITY_SIDECAR_UI_TOKEN`: Ephemeral authentication token passed in headers for non-GET requests.
- `ANTIGRAVITY_EXECUTABLE_DATA_DIR`: Private persistent directory for sidecar state.

The backend uses `sidecar_sdk`:
```javascript
import { SidecarApp, Response } from 'sidecar_sdk';
const app = new SidecarApp();
```
No `node_modules` or `npm install` are required; Antigravity dynamically resolves `'sidecar_sdk'` at runtime.

## 3. Webview Bridge (`preload.js`)

In `index.html`:
```html
<script src="/preload.js"></script>
```
The bridge script:
- Maps host theme CSS variables onto `:root` (e.g. `--background`, `--foreground`, `--card`, `--border`).
- Exposes `window.sidecar`:
  - `sidecar.conversationId`: Current conversation identifier.
  - `sidecar.fetch(url, options)`: Wrapper that injects the sidecar UI token automatically.

## 4. Electron Webview Cache Invalidation

Electron iframes aggressively cache static assets (`.css` and `.js` files) loaded via `<link>` or `<script src="...">`.
- **Mitigation Rule**: All CSS and frontend JavaScript must remain inlined directly inside `index.html`.
- For backend changes (`main.mjs` or `sidecar.json`), the sidecar process must be restarted by toggling the plugin OFF/ON in **Customizations -> Installed**.
