---
doc: prd
status: approved
---
# Kudya — Product Requirements

An AI order-taker that turns a customer's casual chat into a priced, confirmed order on a small food vendor's board. Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
1. The vendor opens Kudya. They see the customer chat (left) and the order board (right). The chat greets the customer with the kitchen's name and a "see menu" hint.
2. The customer types an order in their own words, e.g. "hi can i get 2 sadza nebeef and one mazoe".
3. The agent replies with an itemised list, each line priced from the menu, plus a running total, and asks for whatever is missing: the customer's name, then pickup or delivery (and address for delivery).
4. The customer can add ("add a coke"), remove ("remove the mazoe"), or change quantities in the same chat; the agent re-reads the updated order each time.
5. When everything is known, the agent shows the final summary and asks "Shall I place it?". The customer says "yes".
6. The agent confirms with an order number and the total in USD and ZiG. A new ticket appears on the kitchen board within two seconds, its dishes are added to the "Cook now" prep list, and the portions-left counts drop.
7. The vendor clicks "Mark ready". Pickup orders move to Ready for pickup; delivery orders join the delivery run for their suburb. "Send rider" dispatches the whole suburb run at once. Refreshing the page keeps everything.

## Screens and Layout
One page, two panels side by side (stacked on narrow screens):
- **Customer chat** — phone-frame chat, message bubbles, input box, quick-reply chips ("Menu", "Start over").
- **Kitchen board** — three columns: New tickets; Ready for pickup + Delivery runs (grouped by suburb); Cook now prep list + Portions left today.

## Look and Feel
WhatsApp-like chat (green outgoing bubbles, light beige wallpaper) beside a clean ticket board on warm off-white. Accent colour: deep green with a maize-yellow highlight. Rounded sans-serif type (system UI stack). Friendly, short agent copy with light local phrasing ("Mhoro!", "Ndatenda").

## Features and Behavior

### Understanding the order
- Extracts menu items and quantities from free text: digits ("2"), words ("two", "a", "one"), Shona numbers ("mbiri", "nhatu", "imwe"), and "x2" forms.
- Matches casual names and aliases to menu items ("sadza nebeef", "beef stew" → Sadza & Beef Stew; "mazoe" → Mazoe Orange 2L) and tolerates small typos.
  - [ ] "2 sadza nebeef and one mazoe" produces 2 × Sadza & Beef Stew and 1 × Mazoe Orange with correct line totals.
- Items not on the menu are named and politely refused, with up to three suggestions; they are never added.
  - [ ] "1 pizza" gets a reply that pizza isn't on the menu and the cart is unchanged.

### Grounded pricing
- Every price and total is computed from `menu.json`, never from the model's text.
  - [ ] Totals on the chat summary and the board ticket match the menu prices exactly.

### Stock-aware ordering
- Each dish has portions left today. The agent never adds more than what's left: it adds what remains, says so, and offers the closest-priced in-stock dish of the same type (main, side, drink). Sold-out dishes are refused with a substitute.
- Stock is taken all-or-nothing when the order is placed; if something sold out mid-chat, the agent updates the order and asks again.
- The vendor can adjust portions with − / + on the board.
  - [ ] "5 mazoe" with 4 left adds 4 and offers a substitute.
  - [ ] Placing an order reduces the portions-left numbers on the board.

### USD and ZiG totals
- Every summary and ticket shows the USD total and the ZiG equivalent at the rate in `menu.json` (seeded with the RBZ interbank average for 16 Oct 2026, 26.6072).
  - [ ] $9.00 shows as ZiG 239.46.

### Delivery by suburb
- Delivery needs an address and a known suburb; if the address has none, the agent asks which suburb. The suburb's zone sets the delivery fee (Zone A $1, B $1.50, C $2).
- Ready delivery orders are grouped into one run per suburb on the board; "Send rider" marks the whole run dispatched.
  - [ ] Two ready Borrowdale orders appear as one Borrowdale run.

### Kitchen prep list
- "Cook now" sums every dish across New tickets, largest first.
  - [ ] Two new orders with 2 and 1 Sadza & Beef show "3× Sadza & Beef Stew".

### Editing the order in chat
- "add …", "remove …", "no …", and new quantities update the cart; the agent re-reads it.
  - [ ] "remove the mazoe" removes it and the total drops accordingly.

### Collecting details and confirming
- The agent asks for name, then pickup or delivery; delivery asks for an address.
- Shows a final summary and requires an explicit "yes" (or "ehe", "confirm", "place it") before placing.
  - [ ] No ticket exists before the customer says yes.

### Vendor order board
- New tickets appear automatically (poll every 2 s) with order number, customer name, items, total, fulfilment, time.
- "Mark ready" moves the ticket to Ready.
  - [ ] A placed order appears on the board without a manual refresh.
  - [ ] Orders persist after a server restart.

### Menu on request
- "menu" shows the menu with prices.

## States and Boundaries
- **First use / empty board** — board shows "No orders yet — they'll appear here the moment a customer confirms."
- **Empty cart, unclear message** — agent says what it can do and offers the menu.
- **AI unavailable** — if no model key is configured or the model call fails, a built-in rule-based parser handles the message so the demo never breaks; a small badge shows which engine answered.
- **After placing** — the chat resets for a new order.
- **Persistence** — orders and stock persist in local JSON files; chat sessions are in memory.
- **Sold out** — menu shows "(sold out)" / "(only N left)"; the agent offers a substitute.
- **Unknown suburb** — the agent lists the suburbs it delivers to.

## Product Decisions
- Single vendor, sample menu for "Mai Rudo's Kitchen" — keeps the demo about the conversation.
- Explicit confirmation before placing — a wrong order costs a small vendor real money.
- Model interprets, code prices — the core trust decision of the product.
- Stock, ZiG, suburb runs and prep list added at Clyde's request so it solves a Harare kitchen's real day, not a generic chatbot demo.

## What We're Building
Everything under Features and Behavior, on one page, runnable locally with one command.

## Deferred From the POC
- WhatsApp Business API connection — needs Meta verification.
- Payment (EcoCash/Innbucks) — needs merchant integration.
- Menu editor and multiple vendors — not needed to prove the kernel.
- Customer notifications when ready — needs the WhatsApp channel.

## Possible Later Enhancements
Voice-note orders, daily sales summary for the vendor, stock-outs that the agent respects.

## Non-Goals
- Not a POS or accounting tool.
- No delivery routing or rider management.

## Open Questions
None blocking.
