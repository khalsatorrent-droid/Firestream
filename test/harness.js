// Loads a built provider in a sandbox with a mocked fetch.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeFetch(routes, log) {
  return async function (url, init) {
    init = init || {};
    log.push((init.method || "GET") + " " + url);
    for (const [re, handler] of routes) {
      if (re.test(url)) {
        const r = await handler(url, init);
        const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
        const headers = r.headers || {};
        return {
          ok: (r.status || 200) < 400, status: r.status || 200, url,
          headers: { get: (n) => headers[n.toLowerCase()] ?? null },
          text: async () => body, json: async () => JSON.parse(body)
        };
      }
    }
    return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "", json: async () => ({}) };
  };
}

async function run(id, args, routes, opts) {
  const code = fs.readFileSync(path.join(__dirname, "..", "providers", id + ".js"), "utf8");
  const log = [];
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports, console: (opts && opts.verbose) ? console : { log() {}, error() {}, warn() {} },
    fetch: makeFetch(routes, log), setTimeout, clearTimeout, Promise, URL, Date, Math, JSON,
    Uint8Array, Uint16Array, Uint32Array, Int32Array, Array, Object, String, Number, RegExp, Error, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, escape, unescape, isNaN, Symbol, Map, Set,
    require: (n) => { throw new Error("require not available: " + n); }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: id + ".js" });
  const out = await module.exports.getStreams.apply(null, args);
  return { streams: out, log };
}

const TMDB = [
  [/api\.themoviedb\.org\/3\/movie\/\d+\?/, () => ({ body: { id: 1, title: "Test Movie", original_title: "Test Movie", release_date: "2023-05-01", imdb_id: "tt1", genres: [{ id: 28, name: "Action" }], original_language: "en", alternative_titles: { titles: [] } } })],
  [/api\.themoviedb\.org\/3\/tv\/\d+\/season\/\d+\/episode\/\d+/, () => ({ body: { air_date: "2020-01-08" } })],
  [/api\.themoviedb\.org\/3\/tv\/\d+\?/, () => ({ body: { id: 2, name: "Test Show", original_name: "Test Show", first_air_date: "2020-01-01", genres: [{ id: 16 }], original_language: "ja", origin_country: ["JP"], external_ids: { imdb_id: "tt2", tvdb_id: 9 }, seasons: [{ season_number: 1, episode_count: 12 }, { season_number: 2, episode_count: 12 }], alternative_titles: { results: [] } } })]
];

function check(name, cond, extra) {
  if (!cond) { console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); process.exitCode = 1; }
  else console.log("ok  ", name);
}

module.exports = { run, TMDB, check };
