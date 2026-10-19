---
doc: scope
status: approved
---
# Kudya

An AI order-taker for small food vendors: customers order in plain chat, the vendor gets a clean, correctly priced ticket.

## The Unique Kernel
The customer writes the way people actually text a local kitchen ("2 sadza nebeef, 1 coke, pickup at 1") — mixed English and Shona, numbers as words, typos — and the agent turns that into a structured order **priced only from the vendor's real menu**. The model understands; the code owns the menu, **today's stock** and the maths, so the agent can never invent a dish, a price, or promise food that's already finished.

What makes it Zimbabwean rather than a generic chatbot: it knows what's left in the pot (never oversells, offers a substitute), quotes every total in **USD and ZiG**, prices delivery by **suburb zone** and groups ready deliveries into **one rider run per suburb**, and turns the open tickets into a **"cook now" prep list** for the kitchen.

## Who It's For
Mai Rudo, who runs a lunch kitchen in Harare's CBD and takes 40+ orders a day over WhatsApp. Today she scrolls chats, re-types orders into a notebook, adds up totals by hand, and misses messages at the 12:30 rush.

## The Core Loop
A customer opens the chat, types an order in their own words, the agent reads it back with prices and asks for anything missing (name, pickup or delivery), the customer says "yes", and the order lands on Mai Rudo's board. She taps it through New → Ready. Customers come back because ordering takes one message; she comes back because she never re-types or re-adds an order.

## Inspiration & Identity
WhatsApp chat feel on the customer side; a calm kitchen-ticket board on the vendor side. Warm, local, fast. Zimbabwean food and phrasing as first-class, not an afterthought.

## Why This Matters to the Learner
Clyde builds WhatsApp and AI agents for local food businesses; this is the heart of that work distilled into a small, demonstrable proof of concept.

## What "Working" Looks Like
Open the app: a phone-style chat on the left, the vendor's order board on the right. Type "hi, can i get 2 sadza nebeef and one mazoe orange, pickup" → the agent replies with an itemised, priced summary and asks for a name → "Tendai" → "yes" → a ticket for Tendai appears on the board with the right total. The "oh, that's cool" beat: a messy Shona-English message turning into a perfect ticket, and the agent politely refusing a dish that isn't on the menu.

## The POC Boundary
- One vendor, one menu (JSON file).
- Web chat that simulates the WhatsApp conversation.
- Agent that extracts items + quantities, name and pickup/delivery, confirms, and places the order.
- Stock-aware ordering: portions left per dish; the agent caps at what's left and suggests a same-type substitute; stock is taken only when an order is placed.
- Kitchen board: New → Ready tickets, a "cook now" prep list summed across new tickets, portions-left controls, and delivery runs grouped by suburb with a one-tap "send rider".
- USD + ZiG totals (configurable rate) and suburb-zone delivery fees.
- Everything persisted to local JSON files.

## Later
- Live ZiG rate pulled daily from the RBZ.
- Real WhatsApp Business API connection.
- Mobile-money (EcoCash) payment links.
- Multiple vendors and menu editing UI.

## Explicitly Cut
- Payments — needs merchant accounts; not needed to prove the kernel.
- Accounts/login — one vendor on a local machine for the demo.
- Live WhatsApp integration — needs Meta business verification; the web chat proves the same conversation.
