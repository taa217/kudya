---
doc: checklist
status: approved
---
# Build Checklist

Build mode: fast

## Slices

- [x] **1. A casual chat message becomes a priced, confirmed order on the board**
  Becomes usable: Type "2 sadza nebeef and one mazoe", give a name and pickup, say yes, and a KD-001 ticket appears on the board with correct prices.
  Why now: This is the kernel (model reads, code counts) end to end, scaffold included.
  PRD ref: `prd.md > The Core Journey` (steps 1-6), `prd.md > Understanding the order`, `prd.md > Grounded pricing`, `prd.md > Collecting details and confirming`
  Spec ref: `spec.md > Interpreter (src/interpret.js)`, `spec.md > Order engine (src/engine.js)`, `spec.md > HTTP server (server.js)`, `spec.md > File Structure`
  Build: menu.json, rules interpreter (English + Shona numbers, aliases, typos), engine state machine, JSON order store, server API, chat + board page.
  Verify (mechanical): Scripted conversation via `handleMessage` places KD-001 with total $11.50; "1 pizza" is refused; `npm test`.
  Learner check: Open http://localhost:3000, order in your own words, confirm, and see the ticket.
  Commit: `Chat-to-ticket order agent with grounded pricing`

- [x] **2. The agent knows what's left in the pot**
  Becomes usable: Ordering more than is left adds only what remains and offers a same-type substitute; placing an order reduces portions left; vendor can adjust portions.
  Why now: Overselling is the most expensive real-world failure for a small kitchen.
  PRD ref: `prd.md > Stock-aware ordering`
  Spec ref: `spec.md > Order and stock store (src/store.js)`
  Build: stock.json, all-or-nothing takeStock, engine caps + substitutes, stock API and board controls.
  Verify (mechanical): Test "never oversells" passes; "5 mazoe" with 4 left adds 4 and suggests Coke.
  Learner check: Ask for 5 Mazoe, then watch the Mazoe count hit 0 after confirming.
  Commit: `Stock-aware ordering with substitutes`

- [x] **3. USD + ZiG totals and suburb delivery runs**
  Becomes usable: Every total shows ZiG; delivery asks for a suburb, adds the zone fee, and ready deliveries group into one run per suburb with "Send rider".
  Why now: Makes the order usable for a Harare kitchen's money and riders.
  PRD ref: `prd.md > USD and ZiG totals`, `prd.md > Delivery by suburb`
  Spec ref: `spec.md > Delivery zones and currency (src/engine.js + menu.json)`, `spec.md > Kitchen board views (public/app.js)`
  Build: zig rate + zones in menu.json, findSuburb, fee in priceCart, runs view + dispatch API.
  Verify (mechanical): Test "full delivery journey" passes (Mabelreign, $2 fee, $11.00, ZiG 292.68).
  Learner check: Order for delivery to Borrowdale twice, mark both ready, see one Borrowdale run.
  Commit: `ZiG totals, suburb zones and delivery runs`

- [x] **4. Cook-now prep list and optional Gemini interpreter**
  Becomes usable: The board sums new tickets into a prep list; setting GEMINI_API_KEY switches interpretation to Gemini with the rules engine as fallback.
  Why now: Rounds out the kitchen's view; the model path stays optional so the demo never depends on a key.
  PRD ref: `prd.md > Kitchen prep list`, `prd.md > States and Boundaries` (AI unavailable)
  Spec ref: `spec.md > Kitchen board views (public/app.js)`, `spec.md > External Services and Dependencies`
  Build: renderPrep in app.js; geminiInterpret with JSON output, id validation and fallback.
  Verify (mechanical): Two new orders sum correctly in the prep list (browser screenshot); server starts without a key and reports "rules".
  Learner check: Place two orders and read the Cook now list.
  Commit: `Prep list and optional Gemini interpreter`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 1: Clyde asked for the product to be less generic (stock, ZiG, suburb runs, prep list), which became slices 2–4.
- [x] Final kick-the-tires exploration and feedback completed — full journey run in a real browser and recorded for the demo.

## Final Review

- [x] Final review complete — feedback resolved; Clyde reviews the repo and video before submission.

## Code Tour and App Map

- [x] Learning activity complete — brief recap: following one order from chat to ticket.
- [x] Optional edit and transfer reflection addressed — not applicable.
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: one message traced through interpret.js → engine.js → store.js → app.js; tests in test/engine.test.js.
Route and stops: `rulesInterpret()` → `handleMessage()` → `takeStock()` / `addOrder()` → `refresh()`.
Edit outcome: not applicable.
Reflection: not applicable.
Activity mode: recap.

## Revisions

- Added stock-aware ordering, USD + ZiG totals, suburb delivery runs and a prep list — Clyde's feedback after the first working slice was that the order bot alone felt generic.
- Fuzzy matching now needs 6+ letter words, and a bare word while waiting for a name is treated as a name — "Chipo" was being read as "chips".

## Post-review fixes (Oct 19)
- [x] Quantities survive filler words ("two plates of sadza with chicken" → 2)
- [x] "x 2" / "x2" / "*2" after a dish
- [x] Added Sadza & Muriwo and Rice & Beef Stew (common orders that were misread)
- [x] Bare "sadza" / "rice" gets a which-one question instead of a guess
- [x] Gemini default model updated to gemini-2.5-flash
