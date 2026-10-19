# 🍲 Kudya — chat in, clean orders out

**Kudya** (Shona: *food / to eat*) is an AI order-taker for small food kitchens in Zimbabwe. Customers order the way they already text the kitchen on WhatsApp ("2 sadza nebeef, mazoe mbiri, deliver to Avondale"), and the kitchen gets a clean, priced, stock-checked ticket.

Built for Devpost's **Build With AI: Basics** hackathon using the Devpost Learn Skill Pack. Planning docs: [`devpost/scope.md`](devpost/scope.md), [`devpost/prd.md`](devpost/prd.md), [`devpost/spec.md`](devpost/spec.md), [`devpost/checklist.md`](devpost/checklist.md).

## The problem
A lunch kitchen in Harare takes dozens of WhatsApp orders around 12:30. Someone scrolls chats, re-types orders into a notebook, adds up USD and ZiG by hand, promises dishes that already ran out, and sends riders to the same suburb three times.

## What Kudya does
- **Understands casual, mixed English/Shona orders**: "mbiri" = 2, "nehuku" = with chicken, "ehe" = yes, number words, "x2", small typos.
- **Never invents a dish or a price.** The interpreter (rules engine, or Gemini when a key is set) only extracts intent; the code checks the menu and computes every total.
- **Never oversells.** It knows the portions left today, adds only what's left, and suggests the closest same-type substitute. Stock is taken all-or-nothing at confirmation.
- **USD + ZiG** on every summary and ticket (rate set in `menu.json`; seeded with the RBZ interbank average for 16 Oct 2026, 26.6072).
- **Delivery by suburb**: zone fees (A $1, B $1.50, C $2), and ready deliveries grouped into one rider run per suburb with a one-tap **Send rider**.
- **Cook now** prep list: every dish across new tickets, summed.
- Explicit **"yes" before placing**; nothing reaches the kitchen without it.

## Run it
Requires Node.js 18+. No dependencies to install.

```bash
git clone https://github.com/taa217/kudya.git
cd kudya
npm start          # http://localhost:3000
npm test           # kernel checks
```

Optional: copy `.env.example` to `.env` and set `GEMINI_API_KEY` to let Gemini interpret messages (the rules engine stays as a fallback). The chat header shows which engine answered.

Try:
1. `hi, can i get 2 sadza nebeef, sadza nehuku mbiri and 5 mazoe`
2. `Tendai` → `deliver to 14 Nigels Lane, Borrowdale` → `yes`
3. On the board: **Mark ready**, then **Send rider** on the Borrowdale run.

Reset demo data: `curl -X POST localhost:3000/api/reset`.

## How it's built
```
server.js          tiny HTTP server + JSON API (no framework)
menu.json          menu, starting stock, ZiG rate, delivery zones
src/interpret.js   message → intent (rules engine or Gemini, JSON only)
src/engine.js      cart, stock checks, pricing, zones, conversation
src/store.js       orders.json + stock.json
public/            chat + kitchen board (vanilla JS)
test/              node:test kernel checks
```

## License
MIT
