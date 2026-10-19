// Order engine: owns the cart, the menu, today's stock and every number.
// The interpreter says what the customer *meant*; this file decides what is
// on the menu, what's still in the pot, what it costs and what to ask next.
const { interpret } = require("./interpret");
const store = require("./store");

const sessions = new Map();
const newSession = () => ({ cart: {}, name: null, fulfilment: null, address: null, suburb: null, stage: "ordering" });
function getSession(id) {
  if (!sessions.has(id)) sessions.set(id, newSession());
  return sessions.get(id);
}

// ---------- money ----------
const usd = n => `$${n.toFixed(2)}`;
const zig = (n, menu) => `ZiG ${(n * menu.zig.rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const both = (n, menu) => `${usd(n)} (${zig(n, menu)})`;

// ---------- delivery zones ----------
function findSuburb(text, menu) {
  if (!text) return null;
  const t = " " + text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ") + " ";
  for (const z of menu.delivery.zones)
    for (const s of z.suburbs)
      if (t.includes(" " + s.toLowerCase() + " ")) return { suburb: s, zone: z.name, fee: z.fee };
  return null;
}

function priceCart(s, menu) {
  const lines = Object.entries(s.cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const item = menu.items.find(i => i.id === id);
      return { id, name: item.name, qty, price: item.price, lineTotal: +(item.price * qty).toFixed(2) };
    });
  const subtotal = +lines.reduce((a, l) => a + l.lineTotal, 0).toFixed(2);
  const z = s.fulfilment === "delivery" ? findSuburb(s.suburb || s.address, menu) : null;
  const deliveryFee = z ? z.fee : 0;
  const total = +(subtotal + deliveryFee).toFixed(2);
  return { lines, subtotal, deliveryFee, total, totalZig: +(total * menu.zig.rate).toFixed(2), zone: z };
}

function cartText(p, menu) {
  let t = p.lines.map(l => `• ${l.qty} × ${l.name} — ${usd(l.lineTotal)}`).join("\n");
  if (p.deliveryFee) t += `\n• Delivery (${p.zone.suburb}, ${p.zone.zone}) — ${usd(p.deliveryFee)}`;
  return t + `\n*Total: ${both(p.total, menu)}*`;
}

function menuText(menu) {
  const stock = store.getStock();
  return `Here's what's cooking at ${menu.kitchen} today 🍲\n` +
    menu.items.map(i => `• ${i.name} — ${usd(i.price)}${stock[i.id] === 0 ? " (sold out)" : stock[i.id] <= 3 ? ` (only ${stock[i.id]} left)` : ""}`).join("\n") +
    `\n\nPrices in USD; we also take ZiG at ${menu.zig.rate.toFixed(2)}/USD.\nJust tell me what you'd like, e.g. "2 sadza nehuku and a coke".`;
}

// Best substitute: same group, in stock, closest price.
function substitute(itemId, menu, stock, cart) {
  const item = menu.items.find(i => i.id === itemId);
  const options = menu.items
    .filter(i => i.group === item.group && i.id !== itemId && stock[i.id] - (cart[i.id] || 0) > 0)
    .sort((a, b) => Math.abs(a.price - item.price) - Math.abs(b.price - item.price));
  return options[0] || null;
}

function nextStage(s) {
  if (!Object.values(s.cart).some(q => q > 0)) return "ordering";
  if (!s.name) return "need_name";
  if (!s.fulfilment) return "need_fulfilment";
  if (s.fulfilment === "delivery" && !s.address) return "need_address";
  if (s.fulfilment === "delivery" && !s.suburb) return "need_suburb";
  return "confirming";
}

function askFor(stage, s, menu) {
  switch (stage) {
    case "need_name": return "What name should I put the order under?";
    case "need_fulfilment": return `Thanks${s.name ? " " + s.name : ""}! Will you pick it up, or should we deliver?`;
    case "need_address": return "Where should we deliver it to? (street and suburb)";
    case "need_suburb": return `Which suburb is that in? We deliver to ${menu.delivery.zones.flatMap(z => z.suburbs).slice(0, 6).join(", ")} and more.`;
    case "confirming": {
      const how = s.fulfilment === "delivery" ? `Delivery to ${s.address}` : "Pickup at the kitchen";
      return `${how}, for ${s.name}. Shall I place the order? (yes / no)`;
    }
    default: return "";
  }
}

async function handleMessage(sessionId, text, menu) {
  const s = getSession(sessionId);
  const intent = await interpret(text, menu, { stage: s.stage });
  const parts = [];

  if (intent.intent === "reset") {
    sessions.set(sessionId, newSession());
    return reply("No problem, starting fresh. What would you like to order?", sessions.get(sessionId), menu, intent.engine);
  }
  if (intent.intent === "menu") parts.push(menuText(menu));

  // details (so "Tendai, pickup" works at any point)
  if (intent.name) s.name = intent.name;
  if (intent.fulfilment) s.fulfilment = intent.fulfilment;
  if (intent.fulfilment === "pickup") { s.address = null; s.suburb = null; }
  if (intent.address) s.address = intent.address;
  if (s.stage === "need_suburb" && !intent.items?.length) {
    const z = findSuburb(text, menu);
    if (z) {
      s.suburb = z.suburb;
      if (s.address && !s.address.toLowerCase().includes(z.suburb.toLowerCase())) s.address += `, ${z.suburb}`;
    } else parts.push(`Sorry, I don't recognise that suburb. We deliver to: ${menu.delivery.zones.flatMap(z => z.suburbs).join(", ")}.`);
  }
  if (s.address && !s.suburb) { const z = findSuburb(s.address, menu); if (z) s.suburb = z.suburb; }

  // items, checked against today's stock so we never promise food that's finished
  const stock = store.getStock();
  let changed = false;
  for (const it of intent.items || []) {
    const item = menu.items.find(m => m.id === it.id);
    if (!item) continue; // never trust an id we don't know
    const cur = s.cart[it.id] || 0;
    let want;
    if (it.op === "remove") want = it.qty && it.qty < cur ? cur - it.qty : 0;
    else if (it.op === "set") want = it.qty;
    else want = cur + it.qty;

    const left = stock[it.id];
    if (want > left) {
      const sub = substitute(it.id, menu, stock, s.cart);
      const subText = sub ? ` Can I offer ${sub.name} (${usd(sub.price)}) instead? Just say "add ${sub.aliases[0]}".` : "";
      if (left === 0) parts.push(`Sorry, ${item.name} is sold out for today.${subText}`);
      else parts.push(`We only have ${left} ${item.name} left, so I've put ${left} on your order.${subText}`);
      want = left;
    }
    if (want !== cur) changed = true;
    if (want > 0) s.cart[it.id] = want; else delete s.cart[it.id];
  }
  const unknown = (intent.unknown || []).filter(Boolean);
  if (unknown.length) {
    const popular = menu.items.filter(i => stock[i.id] > 0 && i.group === "mains").slice(0, 3).map(i => i.name).join(", ");
    parts.push(`Sorry, we don't have ${unknown.map(u => `"${u}"`).join(" or ")} on the menu. Popular today: ${popular}.`);
  }

  // confirm → place, re-checking stock at the last moment
  if (intent.intent === "confirm" && s.stage === "confirming") {
    const p = priceCart(s, menu);
    if (!store.takeStock(p.lines)) {
      const st = store.getStock();
      for (const l of p.lines) if (st[l.id] < l.qty) { if (st[l.id] > 0) s.cart[l.id] = st[l.id]; else delete s.cart[l.id]; }
      s.stage = nextStage(s);
      return reply(`Ah, sorry, something just sold out while we were chatting. I've updated your order to what's left:\n${cartText(priceCart(s, menu), menu)}\n\nShall I place it now? (yes / no)`, s, menu, intent.engine);
    }
    const placed = store.addOrder({
      name: s.name, items: p.lines, subtotal: p.subtotal, deliveryFee: p.deliveryFee,
      total: p.total, totalZig: p.totalZig, fulfilment: s.fulfilment, address: s.address,
      suburb: p.zone ? p.zone.suburb : null, zone: p.zone ? p.zone.zone : null,
    });
    sessions.set(sessionId, newSession());
    return reply(
      `✅ Order *${placed.id}* placed! Total ${both(placed.total, menu)}. ${placed.fulfilment === "delivery" ? `It'll go out on the next ${placed.suburb} run 🛵` : "We'll let you know when it's ready for pickup"}. Ndatenda, ${placed.name}! 🙏`,
      sessions.get(sessionId), menu, intent.engine, placed);
  }
  if (intent.intent === "decline" && s.stage === "confirming") {
    s.stage = "editing";
    return reply('Okay, not placed yet. Tell me what to change, or say "start over".', s, menu, intent.engine);
  }

  const hasCart = Object.keys(s.cart).length > 0;
  const stage = nextStage(s);
  s.stage = stage;
  if (changed && hasCart) parts.push(`Got it 👍 Your order:\n${cartText(priceCart(s, menu), menu)}`);
  else if (changed && !hasCart) parts.push("Your order is empty now. What would you like?");

  if (!parts.length && !hasCart) {
    if (intent.intent === "greet") parts.push(`Mhoro! 👋 Welcome to ${menu.kitchen}. What can I get you today? Type "menu" to see what's cooking.`);
    else parts.push(`I can take your order here. Try something like "2 sadza nebeef and a mazoe", or type "menu".`);
  } else if (hasCart) {
    if (stage === "confirming" && !changed) parts.push(`Here's your order:\n${cartText(priceCart(s, menu), menu)}`);
    const ask = askFor(stage, s, menu);
    if (ask) parts.push(ask);
  }
  return reply(parts.join("\n\n"), s, menu, intent.engine);
}

function reply(text, s, menu, engine, placed = null) {
  return { reply: text, cart: priceCart(s, menu), stage: s.stage, engine, placed };
}

module.exports = { handleMessage, priceCart, findSuburb, sessions };
