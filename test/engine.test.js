// Kernel checks: the agent understands casual orders, but prices, menu and stock come from code.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kudya-"));
delete process.env.GEMINI_API_KEY; // tests run the deterministic rules interpreter
const menu = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "menu.json"), "utf8"));
const store = require("../src/store");
store.initStock(menu);
const { handleMessage } = require("../src/engine");
const { rulesInterpret } = require("../src/interpret");

const say = (sid, t) => handleMessage(sid, t, menu);

test("understands mixed English/Shona quantities and aliases", () => {
  const r = rulesInterpret("hi can i get 2 sadza nebeef, sadza nehuku mbiri and one mazoe", menu, {});
  const got = Object.fromEntries(r.items.map(i => [i.id, i.qty]));
  assert.deepStrictEqual(got, { "sadza-beef": 2, "sadza-chicken": 2, mazoe: 1 });
});

test("prices come from the menu, never the message", async () => {
  const r = await say("p1", "3 sadza nematemba for $1 each");
  assert.strictEqual(r.cart.total, 9.0);
});

test("refuses items that are not on the menu", async () => {
  const r = await say("p2", "1 pizza please");
  assert.match(r.reply, /don't have "pizza"/);
  assert.strictEqual(r.cart.lines.length, 0);
});

test("never oversells: caps at stock and offers a substitute", async () => {
  store.resetStock();
  const r = await say("p3", "5 mazoe");
  assert.match(r.reply, /only have 4 Mazoe/);
  assert.match(r.reply, /instead/);
  assert.strictEqual(r.cart.lines[0].qty, 4);
});

test("full delivery journey: suburb zone fee, ZiG total, stock taken, order saved", async () => {
  store.resetAll();
  await say("p4", "2 rice nehuku");
  await say("p4", "Chipo");
  await say("p4", "deliver to 4 Lomagundi Rd, Mabelreign");
  const confirm = await say("p4", "ehe");
  assert.ok(confirm.placed);
  assert.strictEqual(confirm.placed.suburb, "Mabelreign");
  assert.strictEqual(confirm.placed.deliveryFee, 2.0);
  assert.strictEqual(confirm.placed.total, 11.0);
  assert.strictEqual(confirm.placed.totalZig, +(11 * menu.zig.rate).toFixed(2));
  assert.strictEqual(store.getStock()["rice-chicken"], 4);
  assert.strictEqual(store.listOrders().length, 1);
});

test("no order exists before the customer says yes", async () => {
  store.resetAll();
  await say("p5", "1 coke");
  await say("p5", "Tino");
  await say("p5", "pickup");
  assert.strictEqual(store.listOrders().length, 0);
  await say("p5", "yes");
  assert.strictEqual(store.listOrders().length, 1);
});

test("reads everyday phrasings: plates of, x 2, nemuriwo, rice and beef", () => {
  const q = m => Object.fromEntries(rulesInterpret(m, menu, {}).items.map(i => [i.id, i.qty]));
  assert.deepStrictEqual(q("Can I get two plates of sadza with chicken?"), { "sadza-chicken": 2 });
  assert.deepStrictEqual(q("sadza x 2"), {});
  assert.deepStrictEqual(q("sadza nebeef x 2 and coke x3"), { "sadza-beef": 2, coke: 3 });
  assert.deepStrictEqual(q("nditumireiwo sadza nemuriwo"), { "sadza-muriwo": 1 });
  assert.deepStrictEqual(q("I want rice and beef stew"), { "rice-beef": 1 });
  assert.deepStrictEqual(q("sadza nebeef nemuriwo"), { "sadza-beef": 1, covo: 1 });
});

test("a bare 'sadza' gets a which-one question, not a guess", async () => {
  store.resetAll();
  const r = await say("p6", "sadza x 2 please");
  assert.match(r.reply, /Which sadza\?/);
  assert.strictEqual(r.cart.lines.length, 0);
  const r2 = await say("p7", "2 sadza nehuku");
  assert.doesNotMatch(r2.reply, /Which sadza/);
});
