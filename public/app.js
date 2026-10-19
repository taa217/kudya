// Kudya front end: customer chat + kitchen board.
const $ = id => document.getElementById(id);
const sessionId = sessionStorage.kudyaSession || (sessionStorage.kudyaSession = Math.random().toString(36).slice(2));
let menu = null;
let knownIds = new Set();
let firstLoad = true;

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const usd = n => `$${Number(n).toFixed(2)}`;
const zig = n => `ZiG ${(n * menu.zig.rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = s => esc(s).replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>"); // WhatsApp-style *bold*
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function addMsg(text, dir, extra = "") {
  const el = document.createElement("div");
  el.className = `msg ${dir} ${extra}`;
  el.innerHTML = `${fmt(text)}<span class="time">${now()}${dir === "out" ? " ✓✓" : ""}</span>`;
  $("messages").appendChild(el);
  $("messages").scrollTop = $("messages").scrollHeight;
}

async function sendText(text) {
  if (!text.trim()) return;
  addMsg(text, "out");
  const typing = document.createElement("div");
  typing.className = "typing"; typing.textContent = "typing…";
  $("messages").appendChild(typing);
  $("messages").scrollTop = $("messages").scrollHeight;
  try {
    const data = await (await post("/api/chat", { sessionId, text })).json();
    await new Promise(r => setTimeout(r, 350));
    typing.remove();
    addMsg(data.reply || "Sorry, something went wrong.", "in", data.placed ? "placed" : "");
    $("engineBadge").textContent = data.engine === "gemini" ? "Gemini" : "rules engine";
    refresh();
  } catch {
    typing.remove();
    addMsg("I couldn't reach the kitchen just now. Please try again.", "in");
  }
}

function ticket(o) {
  const t = new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const how = o.fulfilment === "delivery" ? `🛵 ${esc(o.address || o.suburb || "Delivery")}` : "🏃 Pickup";
  const fresh = !firstLoad && !knownIds.has(o.id) ? "fresh" : "";
  const action = o.status === "new"
    ? `<button class="t-btn" data-act="ready" data-id="${o.id}">Mark ready</button>`
    : `<button class="t-btn" data-act="collected" data-id="${o.id}">Collected</button>`;
  return `<div class="ticket ${o.status} ${fresh}">
    <div class="t-head"><span class="t-id">${o.id}</span><span>${esc(o.name)}</span></div>
    <div class="t-meta">${how} · ${t}</div>
    <ul class="t-items">${o.items.map(i => `<li><span>${i.qty} × ${esc(i.name)}</span><span>${usd(i.lineTotal)}</span></li>`).join("")}
    ${o.deliveryFee ? `<li><span>Delivery (${esc(o.zone)})</span><span>${usd(o.deliveryFee)}</span></li>` : ""}</ul>
    <div class="t-foot"><span class="t-total">${usd(o.total)} <span class="t-sub">${zig(o.total)}</span></span>${action}</div></div>`;
}

function renderPrep(orders) {
  // Everything on "New" tickets, summed per dish: what the kitchen should cook right now.
  const sum = {};
  orders.filter(o => o.status === "new").forEach(o => o.items.forEach(i => (sum[i.name] = (sum[i.name] || 0) + i.qty)));
  const rows = Object.entries(sum).sort((a, b) => b[1] - a[1]);
  $("prepList").innerHTML = rows.length
    ? rows.map(([n, q]) => `<div class="prep-row"><span class="prep-qty">${q}×</span><span class="prep-name">${esc(n)}</span></div>`).join("")
    : `<div class="muted">Nothing to cook. New orders add up here.</div>`;
}

function renderRuns(orders) {
  // Ready delivery orders grouped by suburb, so one rider takes one trip.
  const groups = {};
  orders.filter(o => o.status === "ready" && o.fulfilment === "delivery").forEach(o => (groups[o.suburb] = groups[o.suburb] || []).push(o));
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  $("runCount").textContent = entries.length;
  $("runList").innerHTML = entries.length
    ? entries.map(([sub, os]) => `<div class="run">
        <div class="run-head"><span>🛵 ${esc(sub)} <span class="t-sub">${esc(os[0].zone)}</span></span><span>${os.length} order${os.length > 1 ? "s" : ""}</span></div>
        <ul>${os.map(o => `<li>${o.id} · ${esc(o.name)} · ${esc(o.address)} · ${usd(o.total)}</li>`).join("")}</ul>
        <button class="t-btn" data-act="dispatch" data-ids="${os.map(o => o.id).join(",")}">Send rider (${os.length})</button></div>`).join("")
    : `<div class="empty">Ready deliveries group here by suburb.</div>`;
}

function renderStock(stock) {
  $("stockList").innerHTML = menu.items.map(i => {
    const left = stock[i.id];
    const cls = left === 0 ? "out" : left <= 3 ? "low" : "";
    return `<div class="stock-row ${cls}"><span class="name">${esc(i.name)}</span>
      <button class="sbtn" data-stock="${i.id}" data-d="-1">−</button><span class="left">${left === 0 ? "0" : left}</span><button class="sbtn" data-stock="${i.id}" data-d="1">+</button></div>`;
  }).join("");
}

let lastStock = {};
async function refresh() {
  const [orders, stock] = await Promise.all([(await fetch("/api/orders")).json(), (await fetch("/api/stock")).json()]);
  lastStock = stock;
  const neu = orders.filter(o => o.status === "new").reverse();
  const ready = orders.filter(o => o.status === "ready" && o.fulfilment !== "delivery").reverse();
  $("newList").innerHTML = neu.length ? neu.map(ticket).join("") : `<div class="empty">No new orders. They appear here the moment a customer confirms.</div>`;
  $("readyList").innerHTML = ready.length ? ready.map(ticket).join("") : `<div class="empty">Nothing waiting for pickup.</div>`;
  $("newCount").textContent = neu.length; $("readyCount").textContent = ready.length;
  const total = orders.reduce((s, o) => s + o.total, 0);
  $("statCount").textContent = `${orders.length} order${orders.length === 1 ? "" : "s"} today`;
  $("statTotal").textContent = usd(total);
  $("statZig").textContent = `(${zig(total)})`;
  renderPrep(orders); renderRuns(orders); renderStock(stock);
  knownIds = new Set(orders.map(o => o.id));
  firstLoad = false;
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (b) {
    if (b.dataset.act === "dispatch") await post("/api/runs/dispatch", { ids: b.dataset.ids.split(",") });
    else await post(`/api/orders/${b.dataset.id}/status`, { status: b.dataset.act });
    return refresh();
  }
  const s = e.target.closest("[data-stock]");
  if (s) {
    const id = s.dataset.stock;
    await post(`/api/stock/${id}`, { qty: Math.max(0, (lastStock[id] || 0) + Number(s.dataset.d)) });
    return refresh();
  }
  const c = e.target.closest(".chip");
  if (c) sendText(c.dataset.text);
});

$("composer").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("input").value; $("input").value = "";
  sendText(v);
});

(async () => {
  menu = await (await fetch("/api/menu")).json();
  $("kitchenName").textContent = menu.kitchen;
  $("chatTitle").textContent = menu.kitchen;
  $("rate").textContent = `1 USD = ZiG ${menu.zig.rate}`;
  addMsg(`Mhoro! 👋 Welcome to ${menu.kitchen}. Order the way you'd text us, e.g. "2 sadza nehuku and a coke". Type "menu" to see prices.`, "in");
  refresh();
  setInterval(refresh, 2000);
})();
