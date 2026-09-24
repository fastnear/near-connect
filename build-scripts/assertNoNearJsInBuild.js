// Fails the build if anything under build/ imports from @near-js/*. near-connect
// accepts near-api-js-shaped actions structurally and must never depend on the
// package — see src/actions/near-api-js-shapes.ts.
const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");
const importPattern = /(from\s*['"]@near-js\/|require\(\s*['"]@near-js\/)/;
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath);
    } else if (/\.(js|cjs|mjs|d\.ts)$/.test(entry.name) && importPattern.test(fs.readFileSync(entryPath, "utf8"))) {
      offenders.push(path.relative(buildDir, entryPath));
    }
  }
}

walk(buildDir);

if (offenders.length > 0) {
  console.error("@near-js imports reached build/ (near-connect must not depend on near-api-js):\n  " + offenders.join("\n  "));
  process.exit(1);
}
console.log("✓ build/ has no @near-js imports");
