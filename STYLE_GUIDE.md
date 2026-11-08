# StateFlow — Render-Style Developer UI Style Guide

This style guide documents the **Render-Style Developer UI** implementation for StateFlow. It follows the deployment-centric developer UI paradigm with high contrast, true black depth, dense typography, and full-width horizontal rows.

---

## 1. COLOR PALETTE

### Core Design Tokens

| Role | Token | Value | Intended Use | Prohibited Use |
| :--- | :--- | :--- | :--- | :--- |
| **Base Background** | `--bg-app` | `#000000` (True Black) | Main content workspace to create deep contrast | Do not use for elevated cards or modals |
| **Elevated Surfaces** | `--bg-surface`, `--bg-card` | `#0A0A0A` to `#0F0F0F` | Left sidebar (250px), top navbar (56px), horizontal buffer rows, dialog cards | Do not use for base background |
| **Recessed Wells** | `--bg-well` | `#050505` | Monospace code blocks, textareas, inputs | Do not use for text headings |
| **Borders & Dividers** | `--border-default` | `#222222` or `#27272A` | Strictly 1px borders everywhere. **Zero box-shadows** | Do not add gradients or drop shadows |
| **Primary Text** | `--text-primary` | `#FFFFFF` or `#F3F4F6` | Primary headers, active titles, and core buffer data | Do not use for low-priority timestamps |
| **Secondary Text** | `--text-secondary` | `#9CA3AF` (Muted Gray) | Timestamps, metadata, breadcrumbs, and row snippet previews | Do not use for primary action buttons |
| **Accent (Info / Active)** | `--accent-purple` | `#581C87` (Deep Purple) | Informational banners, active navigation states, pinned borders (`#7E22CE`) | Do not overuse on non-active elements |
| **Accent (Success / Live)**| `--accent-success`| `#10B981` (Emerald Green)| "Live", "Ready", or successful status indicators and dots | Do not use for destructive triggers |
| **Accent (Danger)** | `--color-danger` | `#EF4444` / `#F87171` | Delete actions, clear unpinned prompts, error banners | Do not use for general navigation |

### Usage & WCAG Compliance
- **Strictly 1px borders everywhere (`#222222`).** Box shadows and glows are completely removed (`box-shadow: none !important;`).
- **Contrast Ratios:** `#FFFFFF` on `#000000` and `#0A0A0A` exceeds `18:1` (far above WCAG AA 4.5:1). `#9CA3AF` secondary text achieves `6.2:1` on `#0A0A0A`.
- **Multi-sensory status indicators:** Statuses always pair emerald/purple dots with explicit text tags (`LIVE`, `Pinned`, `Ready`, `Masked credential`).

---

## 2. TYPOGRAPHY & SIZING

- **Typefaces:** Clean sans-serif (`Inter`, `Roboto`, system sans-serif fallback) and monospace (`JetBrains Mono`, `IBM Plex Mono`).
- **Density:** Small and dense sizing: `12px` to `14px` for most UI elements.
- **Section Headers:** Uppercase with heavy letter-spacing:
  - `font-size: 11px`
  - `font-weight: 700`
  - `letter-spacing: 0.08em` (`tracking-wider`)
  - `text-transform: uppercase`
  - Applied to `WORKSPACE`, `FILTERS`, `OPERATIONS`, `NEW BUFFER ENTRY`.

---

## 3. LAYOUT STRUCTURE

1. **Left Sidebar (Fixed):**
   - Width: `250px`
   - Height: `100vh`
   - Surface: `#0A0A0A`
   - Right Divider: `1px solid #222222`
   - Contains: Brand mark with live status pill, project switcher dropdown (`production-us-east`), grouped navigation (`WORKSPACE`, `FILTERS`, `OPERATIONS`), dynamic counter badges, and runtime status footer.
   - Mobile: Slides into off-canvas drawer toggled via navbar hamburger.

2. **Top Navbar (Fixed):**
   - Height: `56px`
   - Surface: `#0A0A0A`
   - Bottom Divider: `1px solid #222222`
   - Houses: Breadcrumbs (`Home > Production > Scratchpad`), global resource search with `/` keyboard shortcut, privacy mode toggle, theme switcher, and Export CTA.

3. **List Views (Full-Width Horizontal Rows):**
   - Moved away from default masonry/grid cards into full-width horizontal rows using flexbox:
     - **Left:** Status indicator dot (`#10B981` Live / `#581C87` Pinned) + monospace type badge (`JSON`, `URL`, `TASKS`, `SECRET`, `TABLE`, `NOTE`).
     - **Middle:** Primary title (`#FFFFFF`, semibold 13px) + single-line monospace excerpt/preview (`#9CA3AF`).
     - **Right:** Timestamp (`14m ago`) + metadata + inline actions (`Copy`, `Pin`, `Delete`, `Expand`).
     - **Expandable Tray:** Interactive inline checklist items, cleaned URLs with tracking tag indicators, JSON pretty-printer/minifier, credential reveal toggle, and Markdown table copy.
