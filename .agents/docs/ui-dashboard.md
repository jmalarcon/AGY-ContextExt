# UI Dashboard & Visual Components

This document describes the design system, visual components, and frontend logic for `index.html`.

## 1. Visual Components

The dashboard is structured into four primary sections:

1. **Header**:
   - Model name badge.
   - Status badge: "Live" (pulsating green dot) when interval > 0s, or "Manual" (static red dot) when interval = 0s.
   - Configurable polling interval selector (0 to 60 seconds, where 0 is manual mode).
   - Global refresh button with click-spin animation.

2. **Overview Hero Card & Progress Bar**:
   - Total tokens consumed vs. capacity (percentage and count).
   - Free headroom display.
   - Multi-segment CSS bar displaying relative fractions of User, Agent, Tool, and System/Cache tokens.

3. **Memory Heatmap Matrix**:
   - 200-cell responsive CSS Grid (`repeat(20, 1fr)`).
   - Each cell represents **0.5%** of the context window (~5,000 tokens on 1M models).
   - Hover magnification (`transform: scale(1.45)`) with native tooltips indicating exact token counts.

4. **Category Breakdown Cards**:
   - 4 cards: User Messages, Agent Responses, Tool Calls, System & Cache.
   - Absolute token count and percentage of total capacity.

5. **Subscription Limits Card**:
   - 5-Hour rolling window: remaining percentage bar + dynamic countdown to reset (`Refreshes in Xh Ym`).
   - Weekly quota: remaining percentage bar + dynamic countdown to reset (`Refreshes in Xd Yh`).
   - Model group toggle pills (e.g. Gemini Models vs. Claude & GPT models).
   - Dynamic threshold coloring:
     - $\ge 50\%$: Emerald (`#10b981`)
     - $20\% \text{--} 49\%$: Amber (`#f59e0b`)
     - $< 20\%$: Rose / Red (`#f43f5e`)

## 2. Color Palette & High-Contrast Tokens

Colors are defined to provide high contrast on both light and dark themes:

| Category | CSS Variable | Hex Code | Meaning |
| :--- | :--- | :--- | :--- |
| **User** | `--c-user` | `#2563eb` | User prompts |
| **Agent** | `--c-agent` | `#059669` | Model thoughts & output |
| **Tool** | `--c-tool` | `#d97706` | Tool calls & execution |
| **System** | `--c-system` | `#7c3aed` | System instructions & cache |
| **Free** | `--c-free` | `rgba(148, 163, 184, 0.2)` | Unused headroom |

## 3. Frontend Polling & Lifecycles

- **Configurable Polling**: Polling interval defaults to 2 seconds and can be adjusted from 1 to 60 seconds via the header dropdown, or set to 0 (Manual mode). Persisted in `localStorage` (`agy_refresh_interval_sec`).
- **Dynamic Live/Manual Indicator**: Automatically updates to green "Live" with pulse ring during active polling, and switches to red "Manual" when the interval is set to 0.
- **Window Focus**: An event listener on `window.focus` triggers immediate refresh when the user focuses the Auxiliary Pane.
- **Manual Subscription Refresh**: Clicking the subscription refresh icon calls `/api/subscription/refresh` with an animated CSS spinner.

