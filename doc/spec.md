# Split the bill — specification

A two-person bill splitter. Snap a receipt with your phone, swipe each item left for "You" or right for "Them", and watch the per-person totals settle. Tax, tip, and service charges are prorated automatically against each person's subtotal.

**Design source of truth:** [Figma file](https://www.figma.com/design/YUyO4XQnCwPRtk1K6Asdr1)

---

## 1. User-facing behavior

### 1.1 The three screens

#### Start
- Two CTAs: **Take photo** (opens the device camera via `capture="environment"`) and **Upload from photos** (file picker).
- Inline disclosure: "Photo sent to Anthropic to read line items, then discarded."
- Hero illustration is a receipt emoji on a card with a warm gradient blob behind the title.

#### Loading
- Animated skeleton receipt + a small gradient ring spinner.
- Copy: *Reading your receipt… · Claude is identifying items and prices.*
- A **Cancel** affordance below aborts the in-flight request and returns to the start screen.

#### Bill review
- Items are grouped into three sections, each labeled with a colored chip:
  - **Unassigned** (neutral grey chip)
  - **You** (indigo chip — color `#4F46E5`)
  - **Them** (pink chip — color `#DB2777`)
- Each section header shows count and, once anything is assigned, the running subtotal.
- A sticky footer pinned to the bottom shows:
  - A yellow warning pill: `⚠ $X.XX still unassigned` (only when `unassigned > 0`).
  - Two large totals — indigo on the left (You) and pink on the right (Them).
  - A gradient hairline along the top edge of the footer.

### 1.2 Interactions

| Gesture | Effect |
|---------|--------|
| **Swipe row left** | Assign / unassign / switch (see §2.1 state machine). Green underlay on the right side: `→ You`. |
| **Swipe row right** | Same, mirrored. Green underlay on the left: `Them ←`. |
| **Swipe in the same direction the row is already assigned to** | Unassigns it. Underlay turns red and reads `Unassign`. |
| **Tap item name** | In-place rename. Enter saves, Escape cancels, blur saves. |
| **Tap item price** | In-place edit. Same commit semantics. |
| **Tap "New bill"** | Wipes the bill and returns to the start screen. |

Threshold to trigger a swipe action is 70 px of horizontal drag. Below that, the row springs back to its rest position.

Items animate between sections (`framer-motion` `layoutId={item.id}` + a spring transition). The card cross-fades / scales on enter and exit.

### 1.3 Persistence

The bill is mirrored to `localStorage` under the key `splitbill.v1`. Refresh restores you exactly where you left off, including assignments and any edits. The store hydrates after mount (via a `REHYDRATE` reducer action) to keep server-rendered HTML and the first client paint identical — avoids React hydration mismatches.

### 1.4 Error handling

- **API key missing** on the server → 500 with `{ "error": "Server missing ANTHROPIC_API_KEY" }`.
- **No image uploaded** → 400.
- **Unsupported MIME type** (anything other than `image/jpeg|png|webp|gif`) → 415.
- **Image larger than 8 MB** → 413.
- **Anthropic API failure** → 502 with the upstream message.
- **Zero items extracted** (Claude returned no line items at all) → friendly "I couldn't read any items from that photo." with **Try again** (re-runs against the same file) and **Pick a different photo**.

---

## 2. Technical architecture

### 2.1 Assignee state machine

`Assignee = "you" | "them" | null`. Transition table for `nextAssignee(current, direction)`:

| current  | direction `"left"` | direction `"right"` |
|----------|--------------------|---------------------|
| `null`   | `"you"`            | `"them"`            |
| `"you"`  | `null`             | `"them"` (switch)   |
| `"them"` | `"you"` (switch)   | `null`              |

**Invariant:** a swipe in the *same direction* as the row's current owner always unassigns. A swipe in the *opposite direction* either assigns (from unassigned) or switches sides. This makes "I made a mistake — undo" naturally reachable.

Implementation: `src/lib/store.ts → nextAssignee`. Exhaustively covered by `src/lib/store.test.ts`.

### 2.2 Totals math

`computeTotals(bill) → { you, them, unassigned, extras }`, all in dollars rounded to cents.

```
subYou   = Σ items where assignee == "you"
subThem  = Σ items where assignee == "them"
subU     = Σ items where assignee == null
extras   = tax + tip + service
assigned = subYou + subThem

if assigned > 0:
    shareYou  = extras * (subYou / assigned)
    shareThem = extras * (subThem / assigned)
elif subU > 0:                              # items exist but none assigned
    shareYou  = 0                           # hold extras back, don't allocate
    shareThem = 0
else:                                       # empty bill with extras
    shareYou  = shareThem = extras / 2

you  = round(subYou  + shareYou,  2)
them = round(subThem + shareThem, 2)
```

The "hold extras back when nothing is assigned" rule is intentional: showing each person `$X` while every item is still in Unassigned would be misleading. Once anything is assigned, extras snap into proportion.

Implementation: `src/lib/splitter.ts → computeTotals`. Edge cases pinned by `src/lib/splitter.test.ts`.

### 2.3 Data flow

```
ImageInput ──onPick(File)──▶ Home
                              │
                              ├─▶ resizeImage(file) ──── canvas downscale to ≤1600 px long edge, re-encode as JPEG q=0.85
                              │                          (skipped if already small & under 1.5 MB)
                              │
                              ├─▶ POST /api/extract  (multipart, key = "image")
                              │     └─▶ extractReceipt(client, base64, mime)
                              │           └─▶ Anthropic Messages API
                              │                model:  claude-sonnet-4-6
                              │                tool:   record_receipt  (forced via tool_choice)
                              │
                              ◀─── ExtractedReceipt { currency, lines[] }
                              │
                              └─▶ dispatch LOAD_RECEIPT  ──▶ Bill { items[], extras }
                                                              │
                                                              ├──▶ BillReview UI (with SwipeableRow per item)
                                                              └──▶ localStorage("splitbill.v1") sync
```

### 2.4 Claude tool-use contract

The server-side prompt forces a single tool call:

```jsonc
{
  "name": "record_receipt",
  "input_schema": {
    "type": "object",
    "required": ["currency", "lines"],
    "properties": {
      "currency": { "type": "string" },
      "lines": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "price", "category"],
          "properties": {
            "name":     { "type": "string" },
            "price":    { "type": "number" },
            "category": { "enum": ["item","tax","tip","service","discount","subtotal","total","other"] }
          }
        }
      }
    }
  }
}
```

Why force a tool: we want machine-parseable JSON regardless of how the model wants to chat. Free-form output is unreliable enough to be a recurring source of bugs; a forced tool is a contract.

Why these categories: `item` and `discount` map to draggable `Item`s in the UI. `tax | tip | service` accumulate into `bill.extras` and get prorated. `subtotal | total | other` are read (so the model has a category for what it sees) but discarded — they're redundant with the sum and would double-count if surfaced.

Server: `src/lib/parseReceipt.ts`. Route: `src/app/api/extract/route.ts`. Both covered by `src/app/api/extract/route.test.ts` (mocked) and `src/lib/parseReceipt.test.ts` (live, opt-in).

### 2.5 Component map

```
src/app/
  layout.tsx              ← html shell, viewport meta, 420 px column
  page.tsx                ← phase machine: idle / loading / error / review
  api/extract/route.ts    ← multipart POST handler

src/components/
  ImageInput.tsx          ← start screen
  LoadingScreen.tsx       ← spinner + cancel
  ErrorScreen.tsx         ← retry / pick-different
  BillReview.tsx          ← header + section list + sticky footer
  SwipeableRow.tsx        ← framer-motion draggable; tap-to-edit
  Totals.tsx              ← sticky footer totals + warning pill

src/lib/
  types.ts                ← Item, Bill, ExtractedReceipt, Assignee
  store.ts                ← useReducer + localStorage; nextAssignee helper
  splitter.ts             ← computeTotals + formatMoney
  resizeImage.ts          ← computeResizeTarget (pure) + canvas wrapper
  parseReceipt.ts         ← Anthropic tool definition + extractReceipt
```

### 2.6 Color tokens

| Token | Hex | Used for |
|-------|------|----------|
| `bg` | `#F5F5F4` | Page background |
| `text` | `#111827` | Primary text |
| `muted` | `#6B7280` | Secondary text |
| `you` / `you-faint` | `#4F46E5` / `#E0E7FF` | "You" chip + total |
| `them` / `them-faint` | `#DB2777` / `#FCE7F3` | "Them" chip + total |
| `assign-bg` / `assign-border` | `#D1FAE5` / `#10B981` | Assigned-row fill + border |
| `action` | `#059669` | Swipe underlay (assign) |
| `warn` / `warn-faint` | `#EF4444` / `#FEE2E2` | Swipe underlay (unassign), errors |
| `warn-bg` / `warn-text` | `#FEF3C7` / `#92400E` | "Still unassigned" pill |
| Gradient | `#F97316 → #EC4899` | Primary button, top stripe, decorative blob |

Tokens are declared as CSS custom properties in `src/app/globals.css` and surfaced to Tailwind v4 via `@theme inline`.

---

## 3. Privacy and security notes

- The Anthropic key lives **only** in `ANTHROPIC_API_KEY` on the server. The route handler reads it via `process.env`; it never reaches the client bundle (no `NEXT_PUBLIC_` prefix).
- Uploaded photos hit `/api/extract`, get base64'd, sent to Anthropic, then go out of scope at the end of the request. There is no persistence on the server side.
- All bill state lives in the browser (`localStorage`). Clearing site data clears the bill.
- The route caps uploads at 8 MB and validates MIME type before contacting Anthropic — defense against burning API credits on garbage.
