---
doc: spec
status: approved
---
# Kudya — Technical Spec

## How This Works, In Plain Language
Kudya is one small Node.js server and one web page.
- The **page** shows the customer chat and the vendor board. It sends each chat message to the server and asks the server for the order list every two seconds.
- The **server** keeps one conversation per chat session. When a message arrives, the **interpreter** works out what the customer meant: which items, how many, add or remove, their name, pickup or delivery, yes or no. It uses Google's Gemini model when an API key is set, and a built-in rule-based parser otherwise (or if the model call fails).
- The interpreter only returns *intent*. The **order engine** then looks every item up in `menu.json`, rejects anything not on the menu, checks **today's stock**, and computes every price, delivery fee and USD/ZiG total itself. That's the core trust rule: the model reads, the code counts.
- When the customer confirms, the stock is taken (all-or-nothing) and the order is saved to `data/orders.json`. The board shows it, adds it to the prep list, and later groups ready deliveries by suburb.

Why this shape: no database, no framework, one dependency-free server — the smallest thing that proves the kernel and records cleanly for a demo.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Page loads → `GET /api/menu` (kitchen name for greeting) and starts polling `GET /api/orders`.
2. Customer types → `POST /api/chat {sessionId, text}`.
3. Server → interpreter (Gemini or rules) → `{intent, items[{name, qty, op}], name, fulfilment, address}`.
4. Order engine → matches names to menu ids, applies add/remove/set to the session cart, prices it, works out the next missing detail, writes the reply.
5. Reply returns with the cart and `engine` badge → page renders bubbles.
6. On "yes" with a complete cart → order saved with `KD-###` number → next poll shows it on the board.
7. Vendor clicks "Mark ready" → `POST /api/orders/:id/status` → file updated. Delivery orders appear under their suburb run; "Send rider" → `POST /api/runs/dispatch {ids}`.
8. Vendor adjusts portions → `POST /api/stock/:id {qty}`; board reads `GET /api/stock`.

## Stack
- Node.js 18+ (built-in `http`, `fs`, global `fetch`) — https://nodejs.org/docs/latest/api/ ; no npm dependencies.
- Vanilla HTML/CSS/JS front end.
- Optional: Gemini API (`gemini-2.0-flash`) — https://ai.google.dev/gemini-api/docs ; chosen because it has a free tier and JSON output mode.

## Where It Runs and How Someone Tries It
- Local: `npm start` (or `node server.js`) then open http://localhost:3000.
- Optional AI model: `GEMINI_API_KEY=... npm start`. Without it, the rule-based interpreter runs and the badge reads "rules".
- Tests: `npm test` runs the interpreter/engine checks.
- Demo video: screen recording of the core journey, published on YouTube (required by rules). Public repo on GitHub with MIT license.

## Look and Feel
Implements `prd.md > Look and Feel`: chat wallpaper #efe7dd, outgoing bubbles #d9fdd3, header #075e54; board on #faf7f2 with cards in white, accent maize #f2b705 for "New" and green #128c7e for "Ready". System UI font, 14–15px chat text, rounded 12px cards.

## Components

### Web page (`public/index.html`, `public/app.js`, `public/styles.css`)
Chat panel and board panel. Implements `prd.md > Screens and Layout`, `prd.md > Vendor order board`.

### HTTP server (`server.js`)
Static files + JSON API: `GET /api/menu`, `POST /api/chat`, `GET /api/orders`, `POST /api/orders/:id/status`, `POST /api/reset`.

### Interpreter (`src/interpret.js`)
`interpret(text, context)` → intent object. Gemini path with a JSON-only system prompt that includes the menu names; rules path with number words (English + Shona), alias + fuzzy matching (Levenshtein), add/remove/set detection. Implements `prd.md > Understanding the order`.

### Order engine (`src/engine.js`)
Session state machine: `ordering → need_name → need_fulfilment → need_address → confirming → placed`. Applies item ops, prices from the menu, builds replies. Implements `prd.md > Grounded pricing`, `prd.md > Editing the order in chat`, `prd.md > Collecting details and confirming`.

### Order and stock store (`src/store.js`)
Reads/writes `data/orders.json` and `data/stock.json`; `takeStock(lines)` is all-or-nothing. Implements `prd.md > Stock-aware ordering`, `prd.md > States and Boundaries` (persistence).

### Delivery zones and currency (`src/engine.js` + `menu.json`)
`findSuburb()` matches an address against `menu.delivery.zones`; fee comes from the zone. ZiG = USD × `menu.zig.rate`. Implements `prd.md > Delivery by suburb`, `prd.md > USD and ZiG totals`.

### Kitchen board views (`public/app.js`)
Prep list (sum of New tickets), delivery runs (Ready deliveries grouped by suburb), portions-left controls. Implements `prd.md > Kitchen prep list`, `prd.md > Delivery by suburb`.

## Data Model
- `menu.json`: `{ kitchen, currency, zig: {rate, source}, delivery: {zones: [{name, fee, suburbs[]}]}, items: [{id, name, price, group, stock, aliases[]}] }` (`stock` = starting portions).
- `data/stock.json`: `{ itemId: portionsLeft }`.
- Session (memory): `{ cart: {id: qty}, name, fulfilment, address, suburb, stage }`.
- Order (file): `{ id: "KD-001", name, items: [{id, name, qty, price, lineTotal}], subtotal, deliveryFee, total, totalZig, fulfilment, address, suburb, zone, status: "new"|"ready"|"collected"|"dispatched", createdAt }`.

## File Structure
```
kudya/
├── server.js            # HTTP server + API routes
├── menu.json            # the vendor's menu (single source of prices)
├── src/
│   ├── interpret.js     # message → intent (Gemini or rules)
│   ├── engine.js        # conversation state, cart, pricing, replies
│   └── store.js         # orders.json + stock.json persistence
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── test/engine.test.js  # node --test checks for the kernel
├── data/                # orders.json (git-ignored, created on first run)
├── devpost/             # scope.md, prd.md, spec.md, checklist.md
├── .env.example
├── LICENSE              # MIT
└── README.md
```

## External Services and Dependencies
- Gemini `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY` with `generationConfig.responseMimeType = "application/json"`. Free tier rate limits apply. Optional.

## Important Failure Modes
- **Model unavailable or returns bad JSON** → fall back to the rules interpreter for that message; badge shows "rules".
- **Unknown item** → named in the reply with suggestions; cart unchanged.
- **orders.json / stock.json missing or corrupt** → start fresh from menu.json and recreate.
- **Two customers race for the last portion** → `takeStock` refuses the second; the agent updates their order and asks again.

## What Was Simplified and Why
- **Web chat** instead of WhatsApp — same conversation, no Meta verification needed for a demo.
- **JSON file** instead of a database — one vendor, local demo.
- **Polling** instead of websockets — 2 s is fine for a kitchen board.

## Decisions and Open Issues
- Model interprets, code prices (kernel). Tradeoff: menu aliases need upkeep; accepted.
- Rule-based fallback keeps the demo reliable offline and without keys.
- Learner uncertainty: how much to trust the LLM's extraction. Clarified by the grounding rule plus tests that check prices and unknown-item refusals against the menu.
