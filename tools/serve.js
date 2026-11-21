// 브라우저 변환 페이지를 띄우는 아주 작은 웹 서버
//   npm run web  →  http://localhost:5173/web/
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 5173;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".psd": "application/octet-stream", ".css": "text/css" };

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let p = decodeURIComponent(url.pathname);
    // 첫 화면은 /web/ 으로 보내요. '/'에서 바로 보여주면 페이지의 상대 주소(home/…jpg 등)가 틀어져요
    if (p === "/" || p === "/web") return res.writeHead(302, { Location: "/web/" + url.search }).end();
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, buf) => {
      if (err) return res.writeHead(404).end("not found");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}/web/`));
