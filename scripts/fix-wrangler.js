import fs from "node:fs";
import path from "node:path";

// Remove generated .output/server/wrangler.json to prevent Cloudflare Pages Wrangler conflicts
const generatedWrangler = path.join(process.cwd(), ".output", "server", "wrangler.json");
if (fs.existsSync(generatedWrangler)) {
  fs.unlinkSync(generatedWrangler);
  console.log("Removed generated .output/server/wrangler.json to prevent Cloudflare build conflicts.");
}
