// build.js
// Minifies script.js + styles.css, gives each a content hash in the
// filename (e.g. script.a1b2c3d4.js), and rewrites index.html to point
// at the hashed files. Mirrors what webpack/Next.js do automatically.
//
// Run with: node build.js
// Output goes into /dist — deploy /dist as your site root.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

function hashOf(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 10);
}

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function build() {
  rimraf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  // The real Apps Script URL is never committed to source — it's read
  // from a Vercel Environment Variable at build time and substituted
  // into the __GOOGLE_SHEET_URL__ placeholder inside script.js.
  // Set it in: Vercel Project → Settings → Environment Variables →
  //   Name:  GOOGLE_SHEET_URL
  //   Value: https://script.google.com/macros/s/XXXXX/exec
  const googleSheetUrl = process.env.GOOGLE_SHEET_URL;
  if (!googleSheetUrl) {
    console.error(
      "Build failed: GOOGLE_SHEET_URL environment variable is not set.\n" +
      "Set it in Vercel → Project Settings → Environment Variables (and in your local .env for `vercel dev`)."
    );
    process.exit(1);
  }

  // 1. Minify JS (and inject the Google Sheet URL in place of the
  //    __GOOGLE_SHEET_URL__ placeholder — this is a plain text/AST
  //    substitution done by esbuild, so the source file itself never
  //    contains the real URL).
  const jsResult = await esbuild.build({
    entryPoints: [path.join(ROOT, "script.js")],
    bundle: false,
    minify: true,
    write: false,
    target: ["es2018"],
    define: {
      __GOOGLE_SHEET_URL__: JSON.stringify(googleSheetUrl),
    },
  });
  const jsContent = jsResult.outputFiles[0].contents;
  const jsHash = hashOf(jsContent);
  const jsName = `script.${jsHash}.js`;
  fs.writeFileSync(path.join(DIST, jsName), jsContent);

  // 2. Minify CSS
  const cssResult = await esbuild.build({
    entryPoints: [path.join(ROOT, "styles.css")],
    bundle: false,
    minify: true,
    write: false,
  });
  const cssContent = cssResult.outputFiles[0].contents;
  const cssHash = hashOf(cssContent);
  const cssName = `styles.${cssHash}.css`;
  fs.writeFileSync(path.join(DIST, cssName), cssContent);

  // 3. Rewrite index.html and privacy.html to reference hashed files
  for (const page of ["index.html", "privacy.html"]) {
    const srcPath = path.join(ROOT, page);
    if (!fs.existsSync(srcPath)) continue;
    let html = fs.readFileSync(srcPath, "utf8");
    html = html.replace(/href="styles\.css"/g, `href="/${cssName}"`);
    html = html.replace(/src="script\.js"/g, `src="/${jsName}"`);
    fs.writeFileSync(path.join(DIST, page), html);
  }

  // 4. Copy everything else as-is (images, manifest, sw.js, api/, vercel.json, etc.)
  const passthrough = [
    "manifest.json",
    "sw.js",
    "site-status.json",
    "vercel.json",
    "robots.txt",
    "sitemap.xml",
    "images",
    "icons",
    "api",
  ];
  for (const item of passthrough) {
    copyRecursive(path.join(ROOT, item), path.join(DIST, item));
  }

  console.log("Build complete →", DIST);
  console.log("  JS:  " + jsName + "  (" + (jsContent.length / 1024).toFixed(1) + " KB)");
  console.log("  CSS: " + cssName + " (" + (cssContent.length / 1024).toFixed(1) + " KB)");
}

build().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});