const fs = require("fs");
const files = ["sdr-ux-audit.html", "sdr-workspace-prototype.html"];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const scripts = [...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  let jsError = null;
  try {
    if (scripts.trim()) new Function(scripts);
  } catch (e) {
    jsError = e.message;
  }
  const ids = [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const divs = (s.match(/<div\b/gi) || []).length - (s.match(/<\/div>/gi) || []).length;
  const sections = (s.match(/<section\b/gi) || []).length - (s.match(/<\/section>/gi) || []).length;
  const buttons = (s.match(/<button\b/gi) || []).length - (s.match(/<\/button>/gi) || []).length;
  console.log(f, {
    bytes: Buffer.byteLength(s),
    js: jsError ? "ERR " + jsError : "ok",
    duplicateIds: dup.length ? dup : "none",
    divBalance: divs,
    sectionBalance: sections,
    buttonBalance: buttons,
  });
}
