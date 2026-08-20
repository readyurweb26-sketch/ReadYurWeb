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

  // 1. Minify JS
  const jsResult = await esbuild.build({
    entryPoints: [path.join(ROOT, "script.js")],
    bundle: false,
    minify: true,
    write: false,
    target: ["es2018"],
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