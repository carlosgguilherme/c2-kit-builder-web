// Static server for the built site that mimics the Vercel setup used in production:
// clean URLs (/termos -> termos.html) and the custom 404 page with status 404.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "dist");
const port = Number(process.env.PORT || 4180);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain" };

async function file(path) {
  try {
    const s = await stat(path);
    return s.isFile() ? path : null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const clean = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const found = (await file(join(root, clean === "/" ? "index.html" : clean))) ?? (await file(join(root, clean + ".html")));
  const path = found ?? join(root, "404.html");
  res.writeHead(found ? 200 : 404, { "Content-Type": types[extname(path)] ?? "application/octet-stream" });
  res.end(await readFile(path));
}).listen(port, () => console.log(`e2e server on http://localhost:${port}`));
