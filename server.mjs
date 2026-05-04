import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");
const app = express();
const port = Number(process.env.PORT ?? 4178);

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, service: "pam-codebase-atlas" });
});

app.use(express.static(distPath, { extensions: ["html"] }));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`PAM Codebase Atlas listening on ${port}`);
});
