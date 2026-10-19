// Interpreter: turns a customer's free-text message into an *intent*.
// It never decides prices or whether an item exists on the menu: that is the
// order engine's job (see engine.js). Two interpreters share one output shape:
//   { intent, items: [{ text, qty, op }], name, fulfilment, address }
// intent: "order" | "remove" | "menu" | "confirm" | "decline" | "reset" | "greet" | "details" | "unknown"
// op: "add" | "remove" | "set"

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  // Shona
  imwe: 1, rimwe: 1, mbiri: 2, maviri: 2, nhatu: 3, matatu: 3, ina: 4, mana: 4, shanu: 5, mashanu: 5,
  // casual
  couple: 2, pair: 2,
};

const YES = /^(yes|yeah|yep|ya|yah|ehe|hongu|ok(ay)?|sure|confirm(ed)?|place it|go ahead|correct|that'?s (right|correct)|y)\b/i;
const NO = /^(no|nope|kwete|cancel|not yet|wait)\b/i;

function normalise(s) {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9.'&\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Find menu item mentions in a text chunk. Returns [{id, qty, index}]
function findItems(chunk, menu) {
  const text = " " + normalise(chunk) + " ";
  const candidates = [];
  for (const item of menu.items) {
    const names = [normalise(item.name), ...item.aliases.map(normalise)];
    for (const n of names) {
      const re = new RegExp(`(?<=\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|s\\s|es\\s)`, "g");
      let m;
      while ((m = re.exec(text))) candidates.push({ id: item.id, start: m.index, end: m.index + n.length, len: n.length });
    }
  }
  // fuzzy single-word typos ("sadaz", "mazo e") for single-token aliases of length >= 5
  const words = [...text.matchAll(/\S+/g)];
  for (const w of words) {
    const word = w[0];
    if (word.length < 6) continue;
    for (const item of menu.items) {
      for (const a of item.aliases.map(normalise)) {
        if (a.includes(" ") || a.length < 5) continue;
        if (word !== a && levenshtein(word, a) <= 1)
          candidates.push({ id: item.id, start: w.index, end: w.index + word.length, len: word.length - 0.5 });
      }
    }
  }
  // keep longest non-overlapping matches
  candidates.sort((x, y) => y.len - x.len || x.start - y.start);
  const taken = [];
  for (const c of candidates) {
    if (taken.some(t => c.start < t.end && t.start < c.end)) continue;
    taken.push(c);
  }
  taken.sort((x, y) => x.start - y.start);
  // quantity: look just before the match ("2 sadza", "two cokes", "mbiri") or right after ("coke x2")
  return taken.map(c => {
    // skip filler between the number and the dish: "two plates of sadza", "3 portions of rice"
    const FILLER = /^(plates?|portions?|servings?|packs?|boxes?|of|x|more|extra)$/;
    const before = text.slice(0, c.start).trim().split(" ").slice(-5).filter(w => !FILLER.test(w)).slice(-1);
    const afterToks = text.slice(c.end).replace(/^(es|s)(?=\s)/, "").trim().split(" ");
    let after = afterToks[0] || "";
    if ((after === "x" || after === "*") && /^\d+$/.test(afterToks[1] || "")) after = "x" + afterToks[1];
    let qty = 1;
    for (const tok of before.reverse()) {
      if (/^\d+$/.test(tok)) { qty = parseInt(tok, 10); break; }
      if (/^x\d+$/.test(tok)) { qty = parseInt(tok.slice(1), 10); break; }
      if (NUMBER_WORDS[tok] !== undefined) { qty = NUMBER_WORDS[tok]; break; }
    }
    const xm = after.match(/^[x*](\d+)$/);
    if (xm) qty = parseInt(xm[1], 10);
    // Shona number after the noun: "sadza nebeef mbiri"
    if (NUMBER_WORDS[after] && !["a", "an"].includes(after)) qty = NUMBER_WORDS[after];
    return { id: c.id, qty, start: c.start, end: c.end };
  });
}

// Phrases that look like food requests but don't match the menu ("1 pizza")
function findUnknown(chunk, menu, matched) {
  // ignore everything after a delivery instruction: that's an address, not food
  const text = " " + normalise(chunk).replace(/\b(deliver|delivery|bring it|address)\b.*$/, "") + " ";
  const out = [];
  const re = /(?<=\s)(\d+|a|an|one|two|three|four|five|mbiri|nhatu|imwe)\s+([a-z][a-z-]{2,}(?:\s[a-z][a-z-]{2,})?)/g;
  let m;
  const stop = /^(of|the|and|for|to|please|ndapota|more|minutes?|mins?|pm|am|o'?clock|people|person|time|order|plate|plates|piece|pieces|portion|portions|deliver|delivery|pickup|pick|collect|please|pls|thanks|more|of)$/;
  while ((m = re.exec(text))) {
    const start = m.index, end = m.index + m[0].length;
    if (matched.some(x => start < x.end && x.start < end)) continue;
    const word = m[2].split(" ")[0];
    if (stop.test(word)) continue;
    out.push(m[2].split(" ")[0]);
  }
  return out;
}

function rulesInterpret(text, menu, ctx = {}) {
  const raw = text.trim();
  const t = normalise(raw);
  const result = { intent: "unknown", items: [], unknown: [], name: null, fulfilment: null, address: null };

  if (/^(start over|reset|new order|clear)\b/.test(t)) return { ...result, intent: "reset" };
  if (/\b(menu|what do you have|what'?s available|munei|mune chii)\b/.test(t)) result.intent = "menu";

  // fulfilment & address
  if (/\b(pick ?up|collect|i'?ll come|takeaway|take away)\b/.test(t)) result.fulfilment = "pickup";
  const del = raw.match(/\b(?:deliver(?:y|ed)?|bring it)\b(?:\s+(?:it|to|at|in))*\s*(?:to\s+)?(.*)$/i);
  if (del) {
    result.fulfilment = "delivery";
    const addr = del[1].replace(/^(to|at|in)\s+/i, "").replace(/[.!]+$/, "").trim();
    if (addr.length >= 4 && !/^(please|pls|thanks?)$/i.test(addr)) result.address = addr;
  }
  // name
  const nm = raw.match(/\b(?:my name is|i am|i'm|its|it's|name'?s|ndini|zita rangu ndi)\s+([A-Z]?[a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/i);
  if (nm && !/^(hungry|here|fine|good|ready|done)$/i.test(nm[1])) result.name = cap(nm[1]);

  // A bare word or two while we're waiting for a name is a name ("Chipo"), unless it's exactly a menu item
  if (ctx.stage === "need_name" && /^[a-zA-Z]+( [a-zA-Z]+)?[.!]?$/.test(raw) && !YES.test(t) && !NO.test(t)) {
    const exact = menu.items.some(i => [i.name, ...i.aliases].map(normalise).includes(t.replace(/[.!]/g, "")));
    if (!exact) return { ...result, intent: "details", name: cap(raw.replace(/[.!]/g, "")) };
  }

  // items
  const removeMode = /\b(remove|take off|no more|cancel the|drop|without|minus|delete|bvisa)\b/.test(t);
  const setMode = /\b(make (it|that)|change .* to|actually)\b/.test(t);
  // split on add/and/plus so each chunk can have its own op
  const found = findItems(raw, menu);
  result.unknown = findUnknown(raw, menu, found);
  // a bare base ("sadza", "rice") with no relish named: ask which plate rather than guess
  const ntext = " " + t + " ";
  result.ambiguous = ["sadza", "rice"].filter(base => {
    const re = new RegExp(`\\s${base}\\s`, "g");
    let m, open = false;
    while ((m = re.exec(ntext))) { const at = m.index; if (!found.some(f => at + 1 >= f.start - 1 && at + 1 < f.end)) open = true; }
    return open;
  });
  if (result.ambiguous.length && !found.length) result.intent = "order";
  if (found.length) {
    const op = removeMode ? "remove" : setMode ? "set" : "add";
    result.items = found.map(f => ({ id: f.id, qty: f.qty, op }));
    result.intent = removeMode ? "remove" : "order";
  }

  // Context-dependent answers
  if (!found.length && result.intent !== "menu") {
    if (ctx.stage === "confirming" && YES.test(t)) return { ...result, intent: "confirm" };
    if (ctx.stage === "confirming" && NO.test(t)) return { ...result, intent: "decline" };
    if (ctx.stage === "need_name" && !result.name && /^[a-zA-Z]+(\s[a-zA-Z]+)?[.!]?$/.test(raw) && !YES.test(t) && !NO.test(t))
      result.name = cap(raw.replace(/[.!]/g, ""));
    if (ctx.stage === "need_address" && !result.address && raw.length >= 4) result.address = raw.replace(/[.!]+$/, "");
    if (ctx.stage === "need_fulfilment" && !result.fulfilment) {
      if (/\b(collect|come|pick)/.test(t)) result.fulfilment = "pickup";
      if (/\bdeliver/.test(t)) result.fulfilment = "delivery";
    }
    if (result.name || result.fulfilment || result.address) result.intent = "details";
    else if (/^(hi|hello|hey|mhoro|mhoroi|makadii|good (morning|afternoon|evening))\b/.test(t) && result.intent === "unknown") result.intent = "greet";
    else if (result.unknown.length) result.intent = "order";
  }
  return result;
}

function cap(s) {
  return s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// ---------- Gemini interpreter ----------
async function geminiInterpret(text, menu, ctx = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no key");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const menuList = menu.items.map(i => `- id "${i.id}": ${i.name} (also called: ${i.aliases.join(", ")})`).join("\n");
  const system = `You read WhatsApp-style messages sent to a small Zimbabwean food kitchen and extract the customer's intent.
Customers mix English and Shona (e.g. "nehuku" = with chicken, "mbiri" = two, "ehe" = yes, "kwete" = no).
Menu (use ONLY these ids):
${menuList}
Current conversation stage: ${ctx.stage || "ordering"}.
Return ONLY JSON: {"intent": one of "order","remove","menu","confirm","decline","reset","greet","details","unknown",
"items": [{"id": menu id, "qty": integer, "op": "add"|"remove"|"set"}],
"unknown": [words for requested foods that are NOT on the menu],
"name": customer's name or null, "fulfilment": "pickup"|"delivery"|null, "address": delivery address or null}.
Never invent ids. Never output prices. If the stage is need_name and the message is just a name, put it in name.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("gemini " + res.status);
  const data = await res.json();
  const out = JSON.parse(data.candidates[0].content.parts[0].text);
  const ids = new Set(menu.items.map(i => i.id));
  out.items = (out.items || []).filter(i => ids.has(i.id) && Number.isInteger(i.qty) && i.qty > 0);
  out.unknown = out.unknown || [];
  return out;
}

async function interpret(text, menu, ctx) {
  if (process.env.GEMINI_API_KEY) {
    try {
      return { ...(await geminiInterpret(text, menu, ctx)), engine: "gemini" };
    } catch (e) {
      // fall through to rules so the conversation never breaks
    }
  }
  return { ...rulesInterpret(text, menu, ctx), engine: "rules" };
}

module.exports = { interpret, rulesInterpret, findItems, normalise };
