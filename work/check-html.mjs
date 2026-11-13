import fs from "node:fs";

const file = process.argv[2] || "docs/TWILIO_MULTI_AGENCY_ASSESSMENT.html";
const html = fs.readFileSync(file, "utf8");
const errors = [];

const voidTags = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const stack = [];
const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
let m;
while ((m = tagRe.exec(html))) {
  const raw = m[0];
  const name = m[1].toLowerCase();
  const selfClosing = m[2] === "/";
  if (raw.startsWith("<!") || raw.startsWith("<?")) continue;
  if (raw.startsWith("</")) {
    if (!stack.length) { errors.push(`close without open: </${name}> at ${m.index}`); continue; }
    const top = stack[stack.length - 1];
    if (top.name !== name) {
      errors.push(`mismatch: </${name}> at ${m.index}, open <${top.name}> from ${top.index}`);
      const idx = stack.map(s => s.name).lastIndexOf(name);
      if (idx >= 0) stack.length = idx; else continue;
    } else stack.pop();
  } else if (!voidTags.has(name) && !selfClosing) {
    stack.push({ name, index: m.index });
  }
}
for (const open of stack) errors.push(`unclosed <${open.name}> at ${open.index}`);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) errors.push(`duplicate ids: ${[...new Set(dupes)].join(", ")}`);

const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const openBraces = (style.match(/{/g) || []).length;
const closeBraces = (style.match(/}/g) || []).length;
if (openBraces !== closeBraces) errors.push(`CSS braces ${openBraces}/${closeBraces}`);

const defs = new Set([...style.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(x => x[1]));
const uses = new Set([...style.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(x => x[1]));
const missing = [...uses].filter(v => !defs.has(v));
if (missing.length) errors.push(`undefined vars: ${missing.join(", ")}`);

const imgs = [...html.matchAll(/<img\b[^>]*>/g)];
for (const img of imgs) if (!/\bsrc="[^"]+"/.test(img[0]) || !/\balt="[^"]*"/.test(img[0])) errors.push(`bad img: ${img[0]}`);

const controls = [...html.matchAll(/<(a|button|input|select|textarea)\b[^>]*>/g)].map(x => x[0]);
console.log(`tags=${(html.match(/<[a-zA-Z]/g) || []).length} css=${openBraces} ids=${ids.length} controls=${controls.length} imgs=${imgs.length}`);
console.log(errors.length ? errors.join("\n") : "OK: nesting, ids, css, vars, images");
