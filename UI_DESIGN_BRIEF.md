# StateFlow — Descriptive UI Specification (For AI Design Agents)

Copy and paste the prompt block below into any AI UI/UX design assistant to get tailored visual design sistemas, theme recommendations, or component redesigns for this app.

---

```markdown
You are a Senior Product Designer and UI Architect. Please recommend a cohesive visual design direction, color system, typography scale, and component styling for my web application described below.

## 1. Product Overview
- **App Name:** SlateFlow — Smart Workspace Scratchpad
- **Purpose:** A fast, clutter-free daily scratchpad for developers, product managers, and analysts to dump raw text, tasks, links, JSON snippets, credentials, calculations, and CSV/TSV tables into a single input box and have them automatically classified into interactive cards.
- **Target Platform:** Responsive Web App (Desktop-first workflow, fully usable on Tablet and Mobile).
- **Core Philosophy:** Minimalist, high-contrast, low-friction, keyboard-friendly, zero visual clutter.

## 2. Screen Structure & Layout Zones (Top to Bottom)

### Zone A: Sticky Top Header Bar
- **Left:** Brand title (`SlateFlow`) + subtle subtitle (`Workspace Scratchpad`).
- **Right (Global Controls):**
  - Search input (`Search cards (Press /)...`)
  - Privacy mode toggle button (`Privacy: Off / On` — blurs card bodies on screen share)
  - Theme toggle button (`Theme: Dark / Light`)
  - Primary CTA button (`Export Markdown` — opens a modal with a full workspace digest)

### Zone B: Smart Capture Composer (Hero Input Card)
- **Main Input:** Multi-line auto-resizing `<textarea>` where users paste or type anything (notes, `- [ ]` checklists, dirty URLs, JSON, math expressions like `450 * 12`, JWT tokens, or CSV data).
- **Bottom Composer Toolbar:**
  - **Left Quick-Format Tools:**
    - `+ Checklist` (inserts or converts lines to `- [ ] ` checkboxes)
    - `Clean URLs` (strips tracking parameters like `utm_*`, `fbclid`, `gclid` in place)
    - `Format` (pretty-prints JSON, decodes JWTs, or evaluates math in place)
    - `Case` (cycles `UPPERCASE`, `lowercase`, `Title Case`, `snake_case`)
    - Optional `Card title` text input
  - **Right Submission Controls:**
    - Live auto-detection status badge (`Ready`, `Checklist (4)`, `JSON (5 keys)`, `Links (2)`, `Credential`, `Table`, `= 5,400`)
    - `Pin` checkbox toggle
    - Primary `Save Card` button (`Cmd/Ctrl + Enter`)

### Zone C: Workspace Control Bar (Filters & Layout Switcher)
- **Left — Content-Type Filter Tabs:**
  - `All` | `Pinned` | `Checklists` | `Links` | `JSON` | `Credentials` | `Tables` | `Notes`
- **Right — View Layout Switcher & Bulk Action:**
  - `Grid` (responsive multi-column card grid)
  - `Masonry` (variable-height 3-column waterfall)
  - `List` (single-column focused reading stream)
  - `Split View` (left scrollable card list + right full inspector with live raw-text editor)
  - `Clear Unpinned` destructive button (opens confirmation dialog)

### Zone D: Interactive Cards Board (6 Polymorphic Card Types)
Every card shares a consistent shell:
- **Card Header:** Detected type badge (`TASKS`, `URL`, `JSON`, `SECRET`, `TABLE`, `NOTE`) + relative timestamp (`18m ago`), card title, and top-right `Pin`/`Pinned` + `Delete` buttons.
- **Card Body (Adapts to Content Type):**
  1. **Checklist Card (`TASKS`):** Shows completion counter (`Completed: 2 / 4`), interactive checkbox rows with strikethrough on completion, per-item remove (`×`) button, and an inline `Add checklist item...` input + `Add` button.
  2. **Sanitized Links Card (`URL`):** Lists each extracted domain/URL in a sub-card showing the clean hostname, stripped URL in monospace, `Copy URL` button, and `Open` external link button.
  3. **JSON / JWT Payload Card (`JSON`):** Monospace scrollable code well with `Format` (pretty-print) and `Minify` action buttons.
  4. **Credential / Secret Card (`SECRET`):** Automatically masks API keys/tokens (`sk-proj-••••••`) in a monospace well with a `Masked credential` warning label and a `Reveal / Hide` toggle button.
  5. **Data Table Card (`TABLE`):** Renders pasted CSV/TSV lines as a structured HTML table with sticky headers and a `Copy Markdown` table exporter button.
  6. **Plain Note / Code / Math Card (`NOTE`):** Clean monospace/sans-serif well with a `To Checklist` one-click converter button.
- **Card Footer:** Left contextual action buttons + right primary `Copy` button.

### Zone E: Modals & Feedback
- **Export Workspace Dialog:** Form dialog with read-only Markdown digest textarea, `Cancel` button, and `Copy to Clipboard` primary button.
- **Destructive Confirmation Dialog:** Triggered by `Clear Unpinned`, with `Cancel` and destructive `Clear Unpinned` buttons.
- **Toast Notifications:** Bottom-right non-intrusive toast for clipboard and formatting feedback.

## 3. What I Want You (The AI Design Agent) to Recommend
Based on this exact UI structure and feature set, please propose:
1. **3 Distinct Visual Design Directions** (e.g., High-Contrast OLED Technical, Warm Editorial Paper, Crisp Swiss Grid) and explain which fits best.
2. **Complete Design Tokens** (HEX colors for Dark & Light mode, surface elevation strategy, border treatments, and status colors).
3. **Typography & Hierarchy System** (UI sans-serif + monospace pairing, sizes, weights, and line heights).
4. **Card & Composer Micro-Layout Improvements** to make the 6 card types feel even cleaner, more scannable, and visually cohesive without adding clutter.
```
