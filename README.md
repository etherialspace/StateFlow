# StateFlow — Smart Workday Scratchpad

A zero-friction, local-first daily workspace that sits between your system clipboard and heavy note apps.

## Core Features
- **Live Content Auto-Detection**:
  - `{ } JSON`: Validates JSON payloads, displays key/item counts, and offers 1-click **Prettify** and **Minify**.
  - `🔗 Dirty URL Sanitizer`: Strips tracking query parameters (`utm_source`, `utm_campaign`, `fbclid`, `gclid`, etc.) automatically.
  - `✅ Interactive Checklists`: Turns markdown task lists (`- [ ]`) into interactive progress-tracked cards.
  - `🛡️ Secret & Credential Shield`: Automatically detects API keys (`sk-...`, `ghp_...`, `AIza...`, JWTs) and masks them to prevent leaks on Zoom/screen shares.
  - `🎨 Color Swatch Extractor`: Renders clickable color swatches from Hex, RGB, and HSL tokens.
  - `📊 CSV / TSV Table Renderer`: Renders comma- or tab-separated snippets as clean tables with 1-click **Copy as Markdown Table**.
- **Global Privacy Shield**: One-click screen-share mode blurs sensitive content across the board.
- **Transient Lifecycle**: Pin important cards and sweep unpinned temporary clips at the end of your workday.
- **Markdown Digest Export**: Export your active board into a clean Markdown summary for Slack, Notion, or Obsidian.

## Running Locally
Open `index.html` directly in any browser or serve the folder locally:
```bash
python3 -m http.server 8080
```
