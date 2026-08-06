import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), ".output", "server", "wrangler.json");
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(/\\\\/g, "/").replace(/\.\.\\public/g, "../public");
  fs.writeFileSync(file, content, "utf8");
  console.log("Fixed wrangler.json asset paths for Cloudflare deployment.");
}
