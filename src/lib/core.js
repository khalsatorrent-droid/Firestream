// Shared helpers used by every Firestream provider.
// Plain JS (no imports): the build script concatenates lib files in front of
// each provider and transpiles async/await down for the Nuvio runtime.

var UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var UA_MOBILE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function withTimeout(promise, ms, fallback) {
  return new Promise(function (resolve) {
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
    promise.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      function () { if (!done) { done = true; clearTimeout(t); resolve(fallback); } });
  });
}

// fetch with a hard timeout; never throws, returns null on failure
async function request(url, opts) {
  opts = opts || {};
  var timeout = opts.timeout || 15000;
  var init = { method: opts.method || "GET", headers: opts.headers || {} };
  if (opts.body !== undefined) init.body = opts.body;
  if (opts.redirect) init.redirect = opts.redirect;
  init.skipSizeCheck = true;
  try {
    var res = await withTimeout(fetch(url, init), timeout, null);
    return res;
  } catch (e) {
    return null;
  }
}

async function getText(url, headers, timeout) {
  var res = await request(url, { headers: headers, timeout: timeout });
  if (!res) return null;
  try {
    var t = await withTimeout(res.text(), timeout || 15000, null);
    return t;
  } catch (e) { return null; }
}

// returns { ok, status, text, headers, url }
async function getFull(url, opts) {
  var res = await request(url, opts);
  if (!res) return null;
  var text = null;
  try { text = await withTimeout(res.text(), (opts && opts.timeout) || 15000, null); } catch (e) {}
  return { ok: res.ok, status: res.status, text: text, headers: res.headers, url: res.url || url };
}

function parseJsonSafe(t) {
  if (t == null) return null;
  if (typeof t === "object") return t;
  try { return JSON.parse(t); } catch (e) { return null; }
}

async function getJson(url, headers, timeout) {
  return parseJsonSafe(await getText(url, headers, timeout));
}

async function postJson(url, body, headers, timeout) {
  var h = Object.assign({ "Content-Type": "application/json", "Accept": "application/json" }, headers || {});
  var res = await getFull(url, { method: "POST", headers: h, body: typeof body === "string" ? body : JSON.stringify(body), timeout: timeout });
  return res ? parseJsonSafe(res.text) : null;
}

async function postForm(url, form, headers, timeout) {
  var body = Object.keys(form).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(form[k]); }).join("&");
  var h = Object.assign({ "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }, headers || {});
  return getFull(url, { method: "POST", headers: h, body: body, timeout: timeout });
}

function headerGet(headers, name) {
  if (!headers) return null;
  try {
    if (typeof headers.get === "function") return headers.get(name);
  } catch (e) {}
  var lower = name.toLowerCase();
  for (var k in headers) if (k.toLowerCase() === lower) return headers[k];
  return null;
}

// run async tasks with a concurrency limit, collecting nothing (tasks push results themselves)
async function runLimited(tasks, limit) {
  var i = 0;
  async function worker() {
    while (i < tasks.length) {
      var t = tasks[i++];
      try { await t(); } catch (e) {}
    }
  }
  var workers = [];
  for (var w = 0; w < Math.min(limit || 6, tasks.length); w++) workers.push(worker());
  await Promise.all(workers);
}

function absUrl(u, base) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  try { return new URL(u, base).toString(); } catch (e) {}
  var origin = (base.match(/^https?:\/\/[^\/]+/) || [""])[0];
  if (u.charAt(0) === "/") return origin + u;
  return base.replace(/[^\/]*$/, "") + u;
}

function originOf(u) {
  var m = /^(https?:\/\/[^\/?#]+)/i.exec(u || "");
  return m ? m[1] : "";
}

function hostOf(u) {
  var m = /^https?:\/\/([^\/?#:]+)/i.exec(u || "");
  return m ? m[1].toLowerCase() : "";
}

function qualityFrom(any) {
  if (any == null) return "Auto";
  if (typeof any === "number") {
    if (any >= 2000) return "4K";
    if (any >= 1000) return "1080p";
    if (any >= 700) return "720p";
    if (any >= 470) return "480p";
    if (any >= 350) return "360p";
    if (any > 0) return any + "p";
    return "Auto";
  }
  var s = String(any);
  if (/2160|4k|uhd/i.test(s)) return "4K";
  if (/1440/.test(s)) return "1440p";
  if (/1080|fhd/i.test(s)) return "1080p";
  if (/720|\bhd\b/i.test(s)) return "720p";
  if (/480/.test(s)) return "480p";
  if (/360/.test(s)) return "360p";
  if (/240/.test(s)) return "240p";
  return "Auto";
}

var QUALITY_RANK = { "4K": 2160, "1440p": 1440, "1080p": 1080, "720p": 720, "480p": 480, "360p": 360, "240p": 240, "Auto": 500 };

function qualityRank(q) {
  return QUALITY_RANK[q] != null ? QUALITY_RANK[q] : (parseInt(q, 10) || 0);
}

function formatBytes(n) {
  n = Number(n);
  if (!n || n <= 0) return null;
  var u = ["B", "KB", "MB", "GB", "TB"], i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i >= 3 ? 2 : 0) + " " + u[i];
}

function formatType(url) {
  if (/\.m3u8(\?|$)|\/hls\/|playlist|master\.txt/i.test(url)) return "m3u8";
  if (/\.mpd(\?|$)/i.test(url)) return "dash";
  if (/\.mkv(\?|$)/i.test(url)) return "mkv";
  return "mp4";
}

// Stream collector shared by all providers: dedupes by url and builds
// Nuvio-shaped stream objects.
function StreamSink(pluginName, providerId) {
  this.plugin = pluginName;
  this.provider = providerId;
  this.items = [];
  this.subs = [];
  this.seen = {};
  this.seenSubs = {};
}

StreamSink.prototype.add = function (o) {
  if (!o || !o.url || !/^https?:\/\//i.test(o.url)) return;
  if (this.seen[o.url]) return;
  this.seen[o.url] = true;
  var quality = o.quality ? qualityFrom(o.quality) : qualityFrom(o.label);
  var source = o.source || this.plugin;
  var label = o.label || "";
  var extra = [];
  if (o.size) extra.push(o.size);
  if (o.lang) extra.push(o.lang);
  var title = (o.title || "") + (o.title ? "\n" : "") + [source + (label ? " · " + label : ""), quality, formatType(o.url).toUpperCase()].concat(extra).join(" | ");
  this.items.push({
    name: this.plugin + " | " + source + (label && label.length <= 24 ? " · " + label : "") + (quality && quality !== "Auto" ? " " + quality : ""),
    title: title,
    url: o.url,
    quality: quality,
    size: o.size || undefined,
    headers: o.headers && Object.keys(o.headers).length ? o.headers : undefined,
    provider: this.provider,
    type: o.type || formatType(o.url),
    subtitles: o.subtitles || undefined,
    _order: this.items.length
  });
};

StreamSink.prototype.sub = function (lang, url, headers) {
  if (!url || this.seenSubs[url]) return;
  this.seenSubs[url] = true;
  var s = { url: url, lang: lang || "English", label: lang || "English" };
  if (headers) s.headers = headers;
  this.subs.push(s);
};

StreamSink.prototype.result = function () {
  var subs = this.subs;
  var out = this.items.map(function (s) {
    if (!s.subtitles && subs.length) s.subtitles = subs.slice();
    return s;
  });
  out.sort(function (a, b) {
    var d = qualityRank(b.quality) - qualityRank(a.quality);
    return d !== 0 ? d : a._order - b._order;
  });
  out.forEach(function (s) { delete s._order; });
  return out;
};

function cleanTitle(s) {
  return String(s || "").toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[‘’'`"]/g, "")
    .replace(/\(\d{4}\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleSimilarity(a, b) {
  a = cleanTitle(a); b = cleanTitle(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  var ta = a.split(" "), tb = b.split(" ");
  var setB = {};
  tb.forEach(function (t) { setB[t] = true; });
  var common = ta.filter(function (t) { return setB[t]; }).length;
  var score = (2 * common) / (ta.length + tb.length);
  if (a.indexOf(b) === 0 || b.indexOf(a) === 0) score = Math.max(score, 0.8);
  return score;
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function stripTags(s) {
  return decodeHtml(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function makeLog(tag) {
  return function () {
    try {
      var args = Array.prototype.slice.call(arguments);
      console.log.apply(console, ["[" + tag + "]"].concat(args));
    } catch (e) {}
  };
}
