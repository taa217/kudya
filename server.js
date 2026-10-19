// Kudya server: static files + a tiny JSON API. No dependencies.
const http = require("http");
const fs = require("fs");
const path = require("path");

// load .env if present (no dependency needed)
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { handleMessage } = require("./src/engine");
const store = require("./src/store");
const menu = JSON.parse(fs.readFileSync(path.join(__dirname, "menu.json"), "utf8"));
store.initStock(menu);

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(resolve => {
    let b = "";
    req.on("data", c => (b += c));
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/api/menu") return send(res, 200, menu);
    if (req.method === "GET" && url.pathname === "/api/orders") return send(res, 200, store.listOrders());
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const { sessionId, text } = await readBody(req);
      if (!sessionId || !text || typeof text !== "string") return send(res, 400, { error: "sessionId and text required" });
      return send(res, 200, await handleMessage(sessionId, text.slice(0, 500), menu));
    }
    const st = url.pathname.match(/^\/api\/orders\/(KD-\d+)\/status$/);
    if (req.method === "POST" && st) {
      const { status } = await readBody(req);
      if (!["new", "ready", "collected", "dispatched"].includes(status)) return send(res, 400, { error: "bad status" });
      const [o] = store.setStatus([st[1]], status);
      return o ? send(res, 200, o) : send(res, 404, { error: "not found" });
    }
    // dispatch a whole delivery run (one suburb) at once
    if (req.method === "POST" && url.pathname === "/api/runs/dispatch") {
      const { ids } = await readBody(req);
      if (!Array.isArray(ids) || !ids.length) return send(res, 400, { error: "ids required" });
      return send(res, 200, store.setStatus(ids.filter(i => /^KD-\d+$/.test(i)), "dispatched"));
    }
    if (req.method === "GET" && url.pathname === "/api/stock") return send(res, 200, store.getStock());
    const sk = url.pathname.match(/^\/api\/stock\/([a-z-]+)$/);
    if (req.method === "POST" && sk) {
      const { qty } = await readBody(req);
      if (!Number.isInteger(qty) || qty < 0) return send(res, 400, { error: "qty must be a whole number" });
      const s2 = store.setStock(sk[1], qty);
      return s2 ? send(res, 200, s2) : send(res, 404, { error: "unknown item" });
    }
    if (req.method === "POST" && url.pathname === "/api/reset") { store.resetAll(); return send(res, 200, { ok: true }); }

    // static
    const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Kudya running at http://localhost:${PORT}  (interpreter: ${process.env.GEMINI_API_KEY ? "Gemini + rules fallback" : "rules"})`);
});
