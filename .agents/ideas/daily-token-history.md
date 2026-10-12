# Daily Token Usage History & CSV Export — Feature Specification

## 1. Executive Summary & Purpose

This specification provides a complete, turnkey implementation blueprint for adding a **1-Year Daily Token Usage History Heatmap and CSV Export** to the `AGY-ContextExt` plugin.

An AI agent or developer picking up this document can proceed directly to execution without repeating background research, log discovery, or architectural planning.

### High-Level Requirements

1. **Dual-Tab Interface**:
   - **Tab 1 ("Current Session")**: Retains the existing real-time context window usage, 200-block memory heatmap, category breakdown, and subscription quota monitoring.
   - **Tab 2 ("Daily History")**: Dedicated view presenting the 365-day calendar heatmap, key annual metrics, a chronological breakdown table, and a 1-click CSV export.
2. **Calendar Heatmap (Codex / GitHub Contribution Style)**:
   - Displays a 52-week $\times$ 7-day grid representing the last 365 days leading up to the current date.
   - **Exclusively daily**: No weekly or cumulative toggle controls (strictly daily resolution as requested).
   - 5-tier color scale (from neutral light/transparent gray for 0 tokens up to deep saturated blue for peak usage), matching the reference design.
   - Dynamic month labels along the bottom or top (`Nov`, `Dec`, `Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`).
   - Rich interactive hover tooltips detailing date, day of the week, total tokens, input/output/cache breakdown, and message turn count.
3. **Annual Summary Metrics**:
   - Metric cards displaying: Total Annual Tokens, Active Days Count, Daily Average (on active days), and Peak Day (date and volume).
4. **Chronological Table & CSV Export**:
   - Responsive table listing days with activity in descending order.
   - Prominent **"Export to CSV"** button triggering an instant browser download (`antigravity-daily-token-usage.csv`) encoded with UTF-8 BOM (`\uFEFF`) for native compatibility with Microsoft Excel, Google Sheets, and LibreOffice.

---

## 2. Research Findings & Empirical Data Source

### 2.1 File System Storage
Antigravity stores all session data and trajectories under the user profile directory:
- **Root Directory**: `%USERPROFILE%\.gemini\antigravity\brain\` (Windows) or `~/.gemini/antigravity/brain/` (macOS/Linux).
- **Session Folders**: Identified by UUIDs (e.g., `00d36443-ed79-49ab-b856-43577d6310c4`).
- **Telemetry File**: `<brainDir>/<conversationId>/.system_generated/logs/transcript.jsonl` (with fallback to `<brainDir>/<conversationId>/transcript.jsonl`).
- **Subagents**: Subagent sessions also reside as separate directories under `brain/`, meaning a recursive scan across `brain/` automatically captures both primary and subagent token consumption.

### 2.2 Telemetry Record Structure (`transcript.jsonl`)
Each line in `transcript.jsonl` is a JSON object. Model execution steps are identified by `step.type === "PLANNER_RESPONSE"`:

```json
{
  "step_index": 1,
  "source": "MODEL",
  "type": "PLANNER_RESPONSE",
  "status": "DONE",
  "created_at": "2026-10-11T11:49:11Z",
  "input_tokens": 18584,
  "cache_read_tokens": 0,
  "output_tokens": 417,
  "thinking": "...",
  "tool_calls": [...]
}
```

Key observations from local environment analysis:
1. **Timestamp Normalization**: `created_at` is UTC ISO 8601. To group turns accurately into the user's calendar days, timestamps must be converted to local dates:
   ```javascript
   const localDateStr = new Date(step.created_at).toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
   ```
2. **Token Fields**:
   - **Recent Logs (early October 2026 onwards)**: Contain authoritative numerical fields `input_tokens`, `output_tokens`, and `cache_read_tokens`.
     $$\text{Total Step Tokens} = \text{input\_tokens} + \text{output\_tokens} + \text{cache\_read\_tokens}$$
   - **Older Logs (May to late September 2026)**: In earlier Antigravity builds, `input_tokens` was omitted from certain transcript lines. For those turns, token volume is estimated using character counts divided by 4:
     $$\text{approxTokens} = \left\lfloor \frac{\text{userChars} + \text{agentChars} + \text{toolChars}}{4} \right\rfloor$$
     *(Consistent with the heuristic documented in `.agents/docs/telemetry-log-parsing.md`)*.

---

## 3. Architecture & Performance Strategy

### 3.1 Incremental In-Memory Caching (`DailyHistoryScanner`)
A machine with 100+ conversation sessions takes ~1.5 to 1.8 seconds to read and parse all files synchronously from disk. Re-parsing every file on each UI poll would create unnecessary CPU and disk churn.

**Solution**: The backend implements an incremental mtime-indexed cache:
1. Maintain an in-memory dictionary: `sessionCache = Map<conversationId, { mtimeMs: number, dailyTotals: Map<dateStr, DayMetrics> }>`
2. On scan:
   - For each directory in `brain/`, inspect `fs.statSync(transcriptPath).mtimeMs`.
   - If `mtimeMs === cachedEntry.mtimeMs`, immediately reuse `cachedEntry.dailyTotals` (0 disk I/O, 0 JSON parses).
   - If `mtimeMs` is newer (or session is unseen), stream-read lines and update the cache.
3. Subsequent endpoint queries execute in **under 10 milliseconds**.

### 3.2 365-Day Matrix Normalization
The backend builds a continuous array of exactly 365 calendar days ending on today's local date (`today - 364 days` to `today`):
- Any day with no logged turns is represented with `totalTokens: 0, turns: 0, level: 0`.
- Days with activity have their calculated `totalTokens`, `inputTokens`, `outputTokens`, `cacheTokens`, and `turns`.

### 3.3 Intensity Scale Calculation (Quartiles / Percentiles)
To match the visual contrast of the Codex reference image:
- **Level 0**: 0 tokens.
- For all active days ($N$ days with $\text{tokens} > 0$), calculate thresholds $P_{25}, P_{50}, P_{75}$:
  - **Level 1 (Light Blue)**: $0 < \text{tokens} \le P_{25}$
  - **Level 2 (Medium-Light Blue)**: $P_{25} < \text{tokens} \le P_{50}$
  - **Level 3 (Vibrant Blue)**: $P_{50} < \text{tokens} \le P_{75}$
  - **Level 4 (Deep Navy Blue)**: $\text{tokens} > P_{75}$

---

## 4. API Endpoints Specification (`main.mjs`)

The Sidecar backend must expose two endpoints:

### 4.1 `GET /api/history`
Returns the 365-day array and aggregated metrics.

#### Response Schema
```typescript
interface HistoryResponse {
  updatedAt: string; // ISO 8601
  summary: {
    totalTokens: number;
    totalTokensFormatted: string; // e.g. "42.3M"
    totalTurns: number;
    activeDays: number;
    dailyAverage: number;
    dailyAverageFormatted: string; // e.g. "704.2k"
    peakDay: {
      date: string; // "YYYY-MM-DD"
      tokens: number;
      tokensFormatted: string;
    };
  };
  days: Array<{
    date: string; // "YYYY-MM-DD"
    dayOfWeek: number; // 0 (Sun) to 6 (Sat)
    totalTokens: number;
    totalTokensFormatted: string;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    turns: number;
    level: 0 | 1 | 2 | 3 | 4;
    isEstimated: boolean;
  }>;
}
```

### 4.2 `GET /api/history/refresh`
Forces an invalidation of the mtime cache, triggers a full re-scan, and returns the fresh `HistoryResponse`.

---

## 5. Frontend & UI Implementation (`index.html`)

> [!IMPORTANT]
> In accordance with **Rule #1 in AGENTS.md**, all HTML, CSS, and JavaScript MUST remain completely inlined within `src/sidecars/panel/index.html`. Do not extract CSS or JS into separate files, as Electron and the Sidecar SDK aggressively cache separate assets.

### 5.1 Tab Navigation
Insert a top-level tab strip directly under `.dash-header`:
```html
<div class="nav-tabs">
  <button class="nav-tab active" data-tab="live">Current Session</button>
  <button class="nav-tab" data-tab="history">Daily History</button>
</div>
```

- Clicking a tab toggles visibility between `#tab-live-container` and `#tab-history-container`.
- The active tab selection should persist in `localStorage.getItem('agy_active_tab')`.

### 5.2 CSS Tokens for the Heatmap
Add high-contrast color tokens to `:root`:
```css
/* Daily Heatmap (Codex / GitHub Blue Scale) */
--hm-empty: rgba(148, 163, 184, 0.16);
--hm-empty-border: rgba(148, 163, 184, 0.3);
--hm-level-1: #bae6fd; /* Light blue */
--hm-level-2: #60a5fa; /* Sky blue */
--hm-level-3: #2563eb; /* Vibrant royal blue */
--hm-level-4: #1e3a8a; /* Deep navy blue */
```

### 5.3 Heatmap Layout & Scrolling
- **Grid Layout**: 52 columns $\times$ 7 rows.
- **Cell Dimensions**: 10px $\times$ 10px with `border-radius: 2px` and `gap: 3px`.
- **Month Row**: Dynamic month labels (`Nov`, `Dec`, `Jan`, etc.) placed below or above the columns, positioned based on the week index where each new month begins.
- **Horizontal Container**: Wrapped in `overflow-x: auto; -webkit-overflow-scrolling: touch;`. On initial render, execute `container.scrollLeft = container.scrollWidth` so the most recent weeks are immediately visible on narrow auxiliary panes.
- **Tooltip**: Hovering over a cell renders an absolute-positioned floating tooltip displaying:
  - Formatted date (e.g., `Thursday, October 8, 2026`)
  - Total tokens (e.g., `19,295,635 tokens`)
  - Breakdown: `Input: 2.2M | Output: 96.5k | Cache: 16.9M`
  - Turns: `120 messages`

### 5.4 Daily Usage Table & CSV Export
Below the heatmap, render:
1. **Action Bar**:
   - Title: `Detailed Daily Usage`
   - Active days counter badge (e.g., `60 active days recorded`)
   - Export Button: `[ ⬇ Export to CSV ]`
2. **Scrollable Table**:
   - Columns: `Date`, `Total Tokens`, `Input`, `Output`, `Cache`, `Turns`.
   - Formatted numbers with thousand separators.
3. **CSV Export Routine**:
   When `Export to CSV` is clicked:
   ```javascript
   function exportToCSV(days) {
     const activeDays = days.filter(d => d.totalTokens > 0).sort((a, b) => b.date.localeCompare(a.date));
     const headers = ['Date', 'Total Tokens', 'Input Tokens', 'Output Tokens', 'Cache Tokens', 'Turns'];
     const rows = activeDays.map(d => [
       d.date,
       d.totalTokens,
       d.inputTokens,
       d.outputTokens,
       d.cacheTokens,
       d.turns
     ]);
     
     const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.href = url;
     link.download = `antigravity-daily-token-usage-${new Date().toISOString().slice(0, 10)}.csv`;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
     URL.revokeObjectURL(url);
   }
   ```

---

## 6. Implementation Step-by-Step Task List

When executing this task, complete the steps in the following order:

### Task 1: Version Bump (SemVer MINOR)
- Edit `src/plugin.json`: bump version from `1.0.0` to `1.1.0`.
- Edit `src/sidecars/panel/package.json`: bump version from `1.0.0` to `1.1.0`.

### Task 2: Backend Implementation (`main.mjs`)
- Implement `DailyHistoryScanner` class or helper functions in `src/sidecars/panel/main.mjs`:
  - `scanDailyHistory()` with `mtime`-based caching.
  - Aggregation of 365 days ending at local today.
  - Quantile level calculation (levels 0 to 4).
  - Summary metrics computation.
- Register endpoints:
  - `app.api('/api/history', () => getDailyHistory(), 'GET')`
  - `app.api('/api/history/refresh', () => refreshDailyHistory(), 'GET')`

### Task 3: Frontend Implementation (`index.html`)
- In `src/sidecars/panel/index.html`:
  - Add tab strip markup and CSS.
  - Wrap live dashboard in `#tab-live-container`.
  - Create `#tab-history-container` with:
    - Summary cards grid.
    - Heatmap card with week columns, month labels, and legend.
    - Floating tooltip element.
    - Detail table card with CSV download button.
  - Add JS handlers:
    - Tab switching logic with `localStorage` persistence.
    - `fetchHistoryData()` calling `/api/history`.
    - Heatmap grid generator and month label calculator.
    - Tooltip positioning and mouse events.
    - CSV generation with UTF-8 BOM (`\uFEFF`).

### Task 4: Local Sync & Hot-Reload
- Synchronize files to local Antigravity config directory:
  ```powershell
  Copy-Item -Path (Join-Path (Get-Location) "src\*") -Destination "$env:USERPROFILE\.gemini\config\plugins\agy-context-ext\" -Recurse -Force
  ```
- Toggle the plugin OFF and ON in Antigravity settings (**Customizations -> Installed -> Context Usage**) to restart the sidecar backend.

### Task 5: Documentation Update
- Create `.agents/docs/daily-token-history.md` detailing the log parser algorithm and UI design.
- Update `AGENTS.md` (add reference to the new doc in Section 4).
- Update `README.md` in Simplified Technical English explaining the new tab and CSV export feature.

---

## 7. Verification & Acceptance Checklist

| Check | Requirement | Verification Method |
| :--- | :--- | :--- |
| **1** | Seamless Tab Switching | Clicking "Current Session" and "Daily History" switches views without UI stutter or breaking live context polling. |
| **2** | Accurate Heatmap | 52 columns rendered; months aligned to respective columns; active days (June–October) display varying shades of blue. |
| **3** | Strictly Daily Resolution | Heatmap presents daily cells only; no weekly/cumulative view selector switches. |
| **4** | Interactive Tooltip | Hovering over any cell reveals formatted date, total tokens, breakdown (input, output, cache), and turns. |
| **5** | High-Performance Backend | Initial history load completes cleanly; subsequent calls return in `< 20ms` via mtime caching. |
| **6** | Valid CSV Export | Clicking "Export to CSV" downloads a `.csv` file. Opening in Excel or text editor verifies UTF-8 encoding, headers, and valid numeric rows. |
| **7** | Version Synchronization | `src/plugin.json` and `src/sidecars/panel/package.json` both match `1.1.0`. |
| **8** | Inlined Frontend Rule | `index.html` contains all necessary CSS and JS; no standalone `.css` or `.js` bundle files added. |
