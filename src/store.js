// Store: JSON files are plenty for one kitchen's day.
//   data/orders.json  every placed order
//   data/stock.json   portions left today, per menu item id
const fs = require("fs");
const path = require("path");

const DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const ORDERS = path.join(DIR, "orders.json");
const STOCK = path.join(DIR, "stock.json");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function write(file, data) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---- orders ----
function listOrders() {
  const o = read(ORDERS, []);
  return Array.isArray(o) ? o : [];
}
function addOrder(o) {
  const orders = listOrders();
  const n = orders.reduce((m, x) => Math.max(m, parseInt(x.id.slice(3), 10) || 0), 0) + 1;
  const order = { id: `KD-${String(n).padStart(3, "0")}`, ...o, status: "new", createdAt: new Date().toISOString() };
  orders.push(order);
  write(ORDERS, orders);
  return order;
}
function setStatus(ids, status) {
  const orders = listOrders();
  const changed = orders.filter(x => ids.includes(x.id));
  changed.forEach(o => { o.status = status; o[`${status}At`] = new Date().toISOString(); });
  write(ORDERS, orders);
  return changed;
}

// ---- stock ----
let menuRef = null;
function initStock(menu) {
  menuRef = menu;
  const s = read(STOCK, null);
  if (!s || typeof s !== "object") resetStock();
}
function getStock() {
  const s = read(STOCK, {});
  const out = {};
  for (const i of menuRef.items) out[i.id] = Number.isInteger(s[i.id]) ? s[i.id] : i.stock;
  return out;
}
function setStock(id, qty) {
  const s = getStock();
  if (!(id in s)) return null;
  s[id] = Math.max(0, qty | 0);
  write(STOCK, s);
  return s;
}
// Take portions for an order. All-or-nothing: returns false (and changes
// nothing) if any line is short, so we can never oversell.
function takeStock(lines) {
  const s = getStock();
  if (lines.some(l => (s[l.id] || 0) < l.qty)) return false;
  lines.forEach(l => (s[l.id] -= l.qty));
  write(STOCK, s);
  return true;
}
function resetStock() {
  write(STOCK, Object.fromEntries(menuRef.items.map(i => [i.id, i.stock])));
}
function resetAll() {
  write(ORDERS, []);
  resetStock();
}

module.exports = { listOrders, addOrder, setStatus, initStock, getStock, setStock, takeStock, resetStock, resetAll };
