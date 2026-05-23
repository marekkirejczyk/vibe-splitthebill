# Split the bill — specification

A two-person bill splitter. Snap a receipt with your phone, swipe each item left for "You" or right for "Them", and watch the per-person totals settle. Tax, tip, and service charges are prorated automatically against each person's subtotal.

**Design source of truth:**
- Web: [Figma file](https://www.figma.com/design/YUyO4XQnCwPRtk1K6Asdr1)
- Mobile (React Native, in progress): [Figma file](https://www.figma.com/design/pRf4fWtfr9n3P4z8Eh6BzR) — 5 screens (Start / Loading / Error / Permission denied / Bill review) + 6 SwipeableRow & inline-edit interaction states. Variable collections (Color / Spacing / Radius) mirror `packages/core/src/theme.ts` 1:1.

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

### 1.5 Multi-quantity items

If a line on the receipt has a quantity multiplier, you'll see that many identical rows in the bill — each independently swipable, so two of three IPAs can go to You and one to Them.

How the per-unit price is decided:
- **Per-unit printed on the receipt** (e.g. `2 × $8.00   $16.00`, `Espresso  3 @ $3.50   $10.50`): we use the printed per-unit verbatim. If the receipt's arithmetic doesn't quite add up (a common rounding artifact), the printed per-unit still wins.
- **Only the line total printed** (e.g. `IPA pint x2   $16.00`): we divide the total across the rows. Any leftover cent lands on the first row, so the per-row prices always sum back to the printed line total exactly.

The expansion happens in `billFromReceipt` (`src/lib/store.ts`). The Anthropic model only reports what's printed; the app handles the multiplication / division and ID assignment.

### 1.6 Charges-already-in-prices toggles

Some receipts print prices that *already include* a charge that's broken out at the bottom:
- **Tax** is inclusive on most Indian / EU / UK / Australian receipts ("incl. GST", "VAT included", "MRP"). US-style receipts add tax on top.
- **Service** is sometimes included in the listed prices (some Asian / European venues that fold a service charge into menu prices and just show the breakdown).
- **Tip** is almost always additive — but if a receipt lists the gratuity inside the per-item price it would otherwise double-count.

Each is handled independently. The bill review header shows one toggle per non-zero extra:

> ☐ Tax already in prices · ₹91.50  
> ☐ Tip already in prices · ₹50.00  
> ☐ Service already in prices · ₹30.00

When **on**, that extra is shown in the UI but **excluded** from per-person totals — flip all three on and `You + Them + Unassigned` lands exactly on the item subtotal.

The initial state comes from `detectInclusive(receipt) → { tax, tip, service }`:
- **Explicit "exclusive" text hint** (`taxBehavior: "exclusive"`) → every flag false (US-style override).
- **All-inclusive math** (`Σ items ≈ printedTotal` within 1% / 5¢) → every non-zero extra is flagged true; this is the case where the printed total agrees that nothing below the items adds anything new.
- **Tax-only inclusive** (text hint says so, *or* `Σ items + tip + service ≈ printedTotal`) → tax flagged true; tip and service stay additive.
- **Anything else** → all flags false (safe default; user can flip).

Flags are persisted in `localStorage` along with the rest of the bill. Bills saved before this feature shipped — including ones that carried the old single `taxIncluded` boolean — migrate transparently on rehydrate.

Implementation: `detectInclusive` in `src/lib/store.ts` resolves the flags at load time; `computeTotals` in `src/lib/splitter.ts` zeros each component individually based on `bill.inclusive`. Covered by `src/lib/store.test.ts` (`describe("detectInclusive")`) and `src/lib/splitter.test.ts` (`describe("inclusive flags")`).

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
subYou     = Σ items where assignee == "you"
subThem    = Σ items where assignee == "them"
subU       = Σ items where assignee == null
# Each extra is zeroed independently when its inclusive flag is on — see §1.6.
tax        = bill.inclusive.tax     ? 0 : bill.extras.tax
tip        = bill.inclusive.tip     ? 0 : bill.extras.tip
service    = bill.inclusive.service ? 0 : bill.extras.service
extras     = tax + tip + service
itemsTotal = subYou + subThem + subU

if itemsTotal > 0:
    shareYou  = extras * (subYou  / itemsTotal)
    shareThem = extras * (subThem / itemsTotal)
    shareU    = extras - shareYou - shareThem      # remainder lands on unassigned
else:                                              # empty bill with extras
    shareYou = shareThem = extras / 2
    shareU = 0

you        = round(subYou  + shareYou,  2)
them       = round(subThem + shareThem, 2)
unassigned = round(subU    + shareU,    2)
```

**Why prorate over the full items pool (not just assigned).** Earlier versions divided extras over `subYou + subThem`, meaning the very first item you assigned absorbed the entire tax/tip pool until the other person also had items. On a half-assigned bill that made the per-person totals look wildly inflated. The current rule spreads extras proportionally across every item — assigned or not — so unassigned items "carry" their share of extras in the Unassigned bucket. As items move out of Unassigned, their share of extras follows them. When everything is assigned, `subU = 0` and the formula reduces to a pure proportional split between You and Them.

**Money is conserved.** `you + them + unassigned == subYou + subThem + subU + extras` (to the cent). This means the warning pill in the footer (`"₹X still unassigned"`) accounts for both unassigned food and the share of extras it currently carries — clearing the bill always drives that number to zero.

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
                              ◀─── ExtractedReceipt { currency, lines[ name, price, category, quantity?, unitPrice? ],
                                                       printedSubtotal?, printedTotal?, taxBehavior? }
                              │
                              └─▶ dispatch LOAD_RECEIPT
                                    └─▶ billFromReceipt(receipt)
                                          ├─▶ for each line:
                                          │     toMultiItem(line) → expandItemLine(mi) → 1..N Items
                                          │                                               (per-unit price honored
                                          │                                                when receipt prints it;
                                          │                                                otherwise divide & distribute pennies)
                                          └─▶ detectInclusive(receipt) → bill.inclusive { tax, tip, service }  (see §1.6)
                                          → Bill { items[], extras, inclusive }
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
      "currency":        { "type": "string" },
      "printedSubtotal": { "type": "number" }, // "Subtotal" line as printed, if visible
      "printedTotal":    { "type": "number" }, // final "Total" / "Grand Total" / "Amount Payable" line
      "taxBehavior":     { "enum": ["inclusive","exclusive","unknown"] }, // see §1.6
      "lines": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "price", "category"],
          "properties": {
            "name":      { "type": "string" },
            "price":     { "type": "number" }, // LINE TOTAL as printed
            "category":  { "enum": ["item","tax","tip","service","discount","subtotal","total","other"] },
            "quantity":  { "type": "integer", "minimum": 1 }, // set when receipt shows "2 ×", "x3", "3 @"
            "unitPrice": { "type": "number" }                 // set ONLY when per-unit is printed (e.g. "2 × $8.00 $16.00")
          }
        }
      }
    }
  }
}
```

Why force a tool: we want machine-parseable JSON regardless of how the model wants to chat. Free-form output is unreliable enough to be a recurring source of bugs; a forced tool is a contract.

Why these categories: `item` and `discount` map to draggable `Item`s in the UI (after per-unit expansion). `tax | tip | service` accumulate into `bill.extras` and get prorated. `subtotal | total | other` are read (so the model has a category for what it sees) but discarded — they're redundant with the sum and would double-count if surfaced.

Why two new optional fields instead of one: `quantity` alone wouldn't tell us how to derive the per-unit price. By splitting `quantity` and `unitPrice`, the model reports *exactly what's on the receipt* and the app picks the right strategy (honor printed-per-unit vs divide-and-distribute) without rounding drift from the model's arithmetic. See `§1.5` for the user-facing behavior, and `expandItemLine` in `src/lib/store.ts` for the implementation.

Why the three inclusivity-related fields: `taxBehavior` is the textual signal lifted straight off the receipt ("incl. GST" → `inclusive`, "Sales tax" → `exclusive`, else `unknown`). `printedSubtotal` and `printedTotal` let the app cross-check the math when the textual signal is missing — in particular, `Σ items ≈ printedTotal` is the giveaway that *everything* below the items is already in the prices. The app combines all three in `detectInclusive` (`src/lib/store.ts`); see `§1.6` for the user-facing behavior and resolution rules.

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
