// scripts/remove-root-api.js
const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'api');
const appApi = path.join(process.cwd(), 'app', 'api');

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const stat = fs.lstatSync(entryPath);
    if (stat.isDirectory()) {
      rmrf(entryPath);
    } else {
      fs.unlinkSync(entryPath);
    }
  }
  fs.rmdirSync(dir);
}

try {
  if (fs.existsSync(target)) {
    console.log('[SEO FIX] Removing stray root ./api directory before build to avoid routing conflicts...');
    rmrf(target);
    console.log('[SEO FIX] Removed ./api successfully.');
  } else {
    console.log('[SEO FIX] No root ./api directory found. Nothing to remove.');
  }

  if (fs.existsSync(appApi)) {
    console.log('[SEO FIX] app/api directory present.');
  } else {
    console.log('[SEO FIX] WARNING: app/api directory not found.');
  }
} catch (err) {
  console.error('[SEO FIX] Error while removing ./api:', err);
  process.exit(0);
}
