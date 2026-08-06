import fs from "node:fs";
import path from "node:path";

function fixAssetsBinding(filePath) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, "utf8");
    if (content.includes('"ASSETS"')) {
      content = content.replace(/"binding":\s*"ASSETS"/g, '"binding": "STATIC_ASSETS"');
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`Replaced reserved ASSETS binding in ${filePath}`);
    }
  }
}

fixAssetsBinding(path.join(process.cwd(), ".output", "server", "wrangler.json"));
fixAssetsBinding(path.join(process.cwd(), ".wrangler", "deploy", "config.json"));
