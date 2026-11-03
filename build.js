#!/usr/bin/env node
// Builds src/providers/<id>.js (+ the shared libs it lists) into providers/<id>.js
// Each provider starts with:   // @libs core,crypto,tmdb
// Output is plain ES2016 (async/await -> generators) so it runs in Nuvio's JS engine.
// Usage: node build.js [id ...]
const fs = require("fs");
const path = require("path");

function loadTs() {
  const tries = ["typescript", "/opt/node22/lib/node_modules/typescript", "/usr/lib/node_modules/typescript", "/usr/local/lib/node_modules/typescript"];
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error("typescript not found: npm i -g typescript");
}
const ts = loadTs();

const ROOT = __dirname;
const SRC = path.join(ROOT, "src", "providers");
const LIB = path.join(ROOT, "src", "lib");
const OUT = path.join(ROOT, "providers");

function build(id) {
  const file = path.join(SRC, id + ".js");
  const code = fs.readFileSync(file, "utf8");
  const m = /^\/\/\s*@libs\s+([\w,\s-]+)$/m.exec(code);
  const libs = m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : ["core"];
  let joined = "";
  for (const l of libs) joined += "\n// ---- lib/" + l + ".js ----\n" + fs.readFileSync(path.join(LIB, l + ".js"), "utf8");
  joined += "\n// ---- providers/" + id + ".js ----\n" + code;
  joined += '\nif (typeof module !== "undefined" && module.exports) { module.exports = { getStreams: getStreams }; } else if (typeof global !== "undefined") { global.getStreams = getStreams; } else if (typeof globalThis !== "undefined") { globalThis.getStreams = getStreams; }\n';
  const out = ts.transpileModule(joined, {
    compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS, ignoreDeprecations: "6.0", removeComments: false, allowJs: true, noEmitHelpers: false },
    reportDiagnostics: true,
    fileName: id + ".js"
  });
  if (out.diagnostics && out.diagnostics.length) {
    out.diagnostics.forEach((d) => console.error(id, ts.flattenDiagnosticMessageText(d.messageText, "\n")));
    throw new Error("transpile failed: " + id);
  }
  let text = out.outputText.replace(/^"use strict";\s*/, "");
  if (/\basync\s+(function|\()|\bawait\s/.test(text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) throw new Error(id + ": async/await left after transpile");
  const banner = "/**\n * " + id + " - Firestream Nuvio provider\n * Built from src/providers/" + id + ".js — edit the source, then run `node build.js`.\n */\n";
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, id + ".js"), banner + text);
  new Function("module", "require", text); // syntax check
  console.log("built", id, (text.length / 1024).toFixed(1) + " KB");
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(SRC).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));
ids.forEach(build);
