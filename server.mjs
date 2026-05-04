import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");
const port = Number(process.env.PORT ?? 4178);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0] ?? "/");
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return path.join(base, normalized);
}

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    send(res, 200, JSON.stringify({ ok: true, service: "pam-codebase-atlas" }), {
      "Content-Type": "application/json; charset=utf-8",
    });
    return;
  }

  const requestedPath = req.url === "/" ? "/index.html" : req.url ?? "/index.html";
  let filePath = safeJoin(distPath, requestedPath);

  if (!filePath.startsWith(distPath)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distPath, "index.html");
  }

  const extension = path.extname(filePath);
  const body = fs.readFileSync(filePath);
  send(res, 200, body, {
    "Content-Type": contentTypes[extension] ?? "application/octet-stream",
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`PAM Codebase Atlas listening on ${port}`);
});
