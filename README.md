# StateFlow — Developer Scratchpad & Payload Studio

A zero-friction, local-first daily developer workspace that sits between your system clipboard and heavy note apps.

---

## Versions Available

### 🚀 Version 2: Pro Workbench & Payload Studio (Current Default)
Located in root (`index.html`, `styles.css`, `app.js`):
- **Tailwind CSS v3 Design System** with Dark & Light mode toggle (`class="dark"`).
- **Split / Rows / Grid View Layouts**:
  - **Split View Inspector**: 4-column card list on the left, 8-column Code Canvas inspector on the right featuring macOS traffic light dots, code line numbering, and syntax-highlighted code.
  - **Rows View**: Full-width developer stream rows.
  - **Grid View**: Multi-column responsive cards grid.
- **Mobile Native Shell**:
  - Collapsible scratchpad buffer (`expand_less` / `expand_more`).
  - Safe-area inset handling (`pt-safe`, `pb-safe`).
  - Fixed mobile bottom navigation (`Scratch`, `Snippets`, `Console`, `Status`).
- **Composer Power Tools**:
  - `+ Checklist`: Inserts `- [ ] ` checklist items.
  - `Clean URLs`: Strips tracking query parameters (`utm_*`, `fbclid`, `gclid`, etc.).
  - `Format JSON`: Validates and prettifies JSON with 2-space indentation.
  - `Case`: Cycles casing (lowercase $\to$ UPPERCASE $\to$ Title Case $\to$ camelCase).
  - `Math / Calc`: Solves inline arithmetic expressions.
- **Privacy Mode**: Masks tokens, API keys, and JWTs with `••••••••••••`.
- **Offline Telemetry & Action Logs**: Live action logs and storage statistics.

---

### 🏛️ Version 1: Classic Render-Style Minimalist Scratchpad
Located in `v1/` (`v1/index.html`, `v1/styles.css`, `v1/app.js`):
- **Pure Custom CSS** with strict 1px borders, no box-shadows, and Render cloud console aesthetics.
- Centered search bar with quick keyboard navigation (`/`).
- Streamlined horizontal note cards with quick copy, pin, and markdown export dialog.
- Fast, zero-dependency lightweight bundle.

---

## Running Locally

Serve the repository with any HTTP server:
```bash
# Python 3
python3 -m http.server 8090
```

- Open **Version 2 (Pro)**: `http://localhost:8090/`
- Open **Version 1 (Classic)**: `http://localhost:8090/v1/`

You can also toggle between both versions at any time using the version switcher in the top navigation bar.
