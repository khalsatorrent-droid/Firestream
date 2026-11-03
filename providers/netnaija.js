/**
 * netnaija - Firestream Nuvio provider
 * Built from src/providers/netnaija.js — edit the source, then run `node build.js`.
 */
// ---- lib/core.js ----
// Shared helpers used by every Firestream provider.
// Plain JS (no imports): the build script concatenates lib files in front of
// each provider and transpiles async/await down for the Nuvio runtime.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var UA_MOBILE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}
function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
        var done = false;
        var t = setTimeout(function () { if (!done) {
            done = true;
            resolve(fallback);
        } }, ms);
        promise.then(function (v) { if (!done) {
            done = true;
            clearTimeout(t);
            resolve(v);
        } }, function () { if (!done) {
            done = true;
            clearTimeout(t);
            resolve(fallback);
        } });
    });
}
// fetch with a hard timeout; never throws, returns null on failure
function request(url, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        opts = opts || {};
        var timeout = opts.timeout || 15000;
        var init = { method: opts.method || "GET", headers: opts.headers || {} };
        if (opts.body !== undefined)
            init.body = opts.body;
        if (opts.redirect)
            init.redirect = opts.redirect;
        init.skipSizeCheck = true;
        try {
            var res = yield withTimeout(fetch(url, init), timeout, null);
            return res;
        }
        catch (e) {
            return null;
        }
    });
}
function getText(url, headers, timeout) {
    return __awaiter(this, void 0, void 0, function* () {
        var res = yield request(url, { headers: headers, timeout: timeout });
        if (!res)
            return null;
        try {
            var t = yield withTimeout(res.text(), timeout || 15000, null);
            return t;
        }
        catch (e) {
            return null;
        }
    });
}
// returns { ok, status, text, headers, url }
function getFull(url, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        var res = yield request(url, opts);
        if (!res)
            return null;
        var text = null;
        try {
            text = yield withTimeout(res.text(), (opts && opts.timeout) || 15000, null);
        }
        catch (e) { }
        return { ok: res.ok, status: res.status, text: text, headers: res.headers, url: res.url || url };
    });
}
function parseJsonSafe(t) {
    if (t == null)
        return null;
    if (typeof t === "object")
        return t;
    try {
        return JSON.parse(t);
    }
    catch (e) {
        return null;
    }
}
function getJson(url, headers, timeout) {
    return __awaiter(this, void 0, void 0, function* () {
        return parseJsonSafe(yield getText(url, headers, timeout));
    });
}
function postJson(url, body, headers, timeout) {
    return __awaiter(this, void 0, void 0, function* () {
        var h = Object.assign({ "Content-Type": "application/json", "Accept": "application/json" }, headers || {});
        var res = yield getFull(url, { method: "POST", headers: h, body: typeof body === "string" ? body : JSON.stringify(body), timeout: timeout });
        return res ? parseJsonSafe(res.text) : null;
    });
}
function postForm(url, form, headers, timeout) {
    return __awaiter(this, void 0, void 0, function* () {
        var body = Object.keys(form).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(form[k]); }).join("&");
        var h = Object.assign({ "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }, headers || {});
        return getFull(url, { method: "POST", headers: h, body: body, timeout: timeout });
    });
}
function headerGet(headers, name) {
    if (!headers)
        return null;
    try {
        if (typeof headers.get === "function")
            return headers.get(name);
    }
    catch (e) { }
    var lower = name.toLowerCase();
    for (var k in headers)
        if (k.toLowerCase() === lower)
            return headers[k];
    return null;
}
// run async tasks with a concurrency limit, collecting nothing (tasks push results themselves)
function runLimited(tasks, limit) {
    return __awaiter(this, void 0, void 0, function* () {
        var i = 0;
        function worker() {
            return __awaiter(this, void 0, void 0, function* () {
                while (i < tasks.length) {
                    var t = tasks[i++];
                    try {
                        yield t();
                    }
                    catch (e) { }
                }
            });
        }
        var workers = [];
        for (var w = 0; w < Math.min(limit || 6, tasks.length); w++)
            workers.push(worker());
        yield Promise.all(workers);
    });
}
function absUrl(u, base) {
    if (!u)
        return u;
    if (/^https?:\/\//i.test(u))
        return u;
    if (u.indexOf("//") === 0)
        return "https:" + u;
    try {
        return new URL(u, base).toString();
    }
    catch (e) { }
    var origin = (base.match(/^https?:\/\/[^\/]+/) || [""])[0];
    if (u.charAt(0) === "/")
        return origin + u;
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
    if (any == null)
        return "Auto";
    if (typeof any === "number") {
        if (any >= 2000)
            return "4K";
        if (any >= 1000)
            return "1080p";
        if (any >= 700)
            return "720p";
        if (any >= 470)
            return "480p";
        if (any >= 350)
            return "360p";
        if (any > 0)
            return any + "p";
        return "Auto";
    }
    var s = String(any);
    if (/2160|4k|uhd/i.test(s))
        return "4K";
    if (/1440/.test(s))
        return "1440p";
    if (/1080|fhd/i.test(s))
        return "1080p";
    if (/720|\bhd\b/i.test(s))
        return "720p";
    if (/480/.test(s))
        return "480p";
    if (/360/.test(s))
        return "360p";
    if (/240/.test(s))
        return "240p";
    return "Auto";
}
var QUALITY_RANK = { "4K": 2160, "1440p": 1440, "1080p": 1080, "720p": 720, "480p": 480, "360p": 360, "240p": 240, "Auto": 500 };
function qualityRank(q) {
    return QUALITY_RANK[q] != null ? QUALITY_RANK[q] : (parseInt(q, 10) || 0);
}
function formatBytes(n) {
    n = Number(n);
    if (!n || n <= 0)
        return null;
    var u = ["B", "KB", "MB", "GB", "TB"], i = 0;
    while (n >= 1024 && i < u.length - 1) {
        n /= 1024;
        i++;
    }
    return n.toFixed(i >= 3 ? 2 : 0) + " " + u[i];
}
function formatType(url) {
    if (/\.m3u8(\?|$)|\/hls\/|playlist|master\.txt/i.test(url))
        return "m3u8";
    if (/\.mpd(\?|$)/i.test(url))
        return "dash";
    if (/\.mkv(\?|$)/i.test(url))
        return "mkv";
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
    if (!o || !o.url || !/^https?:\/\//i.test(o.url))
        return;
    if (this.seen[o.url])
        return;
    this.seen[o.url] = true;
    var quality = o.quality ? qualityFrom(o.quality) : qualityFrom(o.label);
    var source = o.source || this.plugin;
    var label = o.label || "";
    var extra = [];
    if (o.size)
        extra.push(o.size);
    if (o.lang)
        extra.push(o.lang);
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
    if (!url || this.seenSubs[url])
        return;
    this.seenSubs[url] = true;
    var s = { url: url, lang: lang || "English", label: lang || "English" };
    if (headers)
        s.headers = headers;
    this.subs.push(s);
};
StreamSink.prototype.result = function () {
    var subs = this.subs;
    var out = this.items.map(function (s) {
        if (!s.subtitles && subs.length)
            s.subtitles = subs.slice();
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
    a = cleanTitle(a);
    b = cleanTitle(b);
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    var ta = a.split(" "), tb = b.split(" ");
    var setB = {};
    tb.forEach(function (t) { setB[t] = true; });
    var common = ta.filter(function (t) { return setB[t]; }).length;
    var score = (2 * common) / (ta.length + tb.length);
    if (a.indexOf(b) === 0 || b.indexOf(a) === 0)
        score = Math.max(score, 0.8);
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
        }
        catch (e) { }
    };
}
// ---- lib/crypto.js ----
// Self-contained crypto helpers (no native modules): base64, utf8, MD5,
// SHA-1, SHA-256, HMAC, AES (CBC / CTR / GCM-decrypt / ECB), EVP_BytesToKey.
// Byte arrays are Uint8Array everywhere.
var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_LOOKUP = (function () {
    var t = {};
    for (var i = 0; i < 64; i++)
        t[B64_CHARS.charAt(i)] = i;
    t["-"] = 62;
    t["_"] = 63;
    return t;
})();
function b64ToBytes(s) {
    s = String(s || "").replace(/[\s=]/g, "");
    var out = new Uint8Array(Math.floor(s.length * 3 / 4));
    var buf = 0, bits = 0, n = 0;
    for (var i = 0; i < s.length; i++) {
        var v = B64_LOOKUP[s.charAt(i)];
        if (v === undefined)
            continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[n++] = (buf >> bits) & 0xff;
        }
    }
    return out.subarray(0, n);
}
function bytesToB64(bytes, urlSafe, noPad) {
    var out = "", i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
        var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += B64_CHARS.charAt((n >> 18) & 63) + B64_CHARS.charAt((n >> 12) & 63) + B64_CHARS.charAt((n >> 6) & 63) + B64_CHARS.charAt(n & 63);
    }
    var rem = bytes.length - i;
    if (rem === 1) {
        var a = bytes[i] << 16;
        out += B64_CHARS.charAt((a >> 18) & 63) + B64_CHARS.charAt((a >> 12) & 63) + "==";
    }
    else if (rem === 2) {
        var b = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += B64_CHARS.charAt((b >> 18) & 63) + B64_CHARS.charAt((b >> 12) & 63) + B64_CHARS.charAt((b >> 6) & 63) + "=";
    }
    if (urlSafe)
        out = out.replace(/\+/g, "-").replace(/\//g, "_");
    if (noPad || urlSafe)
        out = out.replace(/=+$/, "");
    return out;
}
function utf8Encode(str) {
    str = String(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
            var c2 = str.charCodeAt(i + 1);
            if (c2 >= 0xdc00 && c2 < 0xe000) {
                c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
                i++;
            }
        }
        if (c < 0x80)
            out.push(c);
        else if (c < 0x800)
            out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000)
            out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else
            out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
}
function utf8Decode(bytes) {
    var s = "", i = 0;
    while (i < bytes.length) {
        var b = bytes[i++];
        if (b < 0x80)
            s += String.fromCharCode(b);
        else if ((b & 0xe0) === 0xc0)
            s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 63));
        else if ((b & 0xf0) === 0xe0) {
            s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
        }
        else if ((b & 0xf8) === 0xf0) {
            var cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
            cp -= 0x10000;
            s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
        else
            s += String.fromCharCode(b);
    }
    return s;
}
function latin1Bytes(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++)
        out[i] = str.charCodeAt(i) & 0xff;
    return out;
}
function bytesToLatin1(b) {
    var s = "";
    for (var i = 0; i < b.length; i++)
        s += String.fromCharCode(b[i]);
    return s;
}
function hexToBytes(hex) {
    hex = String(hex).replace(/[^0-9a-f]/gi, "");
    var out = new Uint8Array(hex.length >> 1);
    for (var i = 0; i < out.length; i++)
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}
function bytesToHex(b) {
    var s = "";
    for (var i = 0; i < b.length; i++)
        s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
    return s;
}
function toBytes(x) {
    if (x instanceof Uint8Array)
        return x;
    if (Array.isArray(x))
        return new Uint8Array(x);
    return utf8Encode(x);
}
function concatBytes() {
    var len = 0, i;
    for (i = 0; i < arguments.length; i++)
        len += arguments[i].length;
    var out = new Uint8Array(len), off = 0;
    for (i = 0; i < arguments.length; i++) {
        out.set(arguments[i], off);
        off += arguments[i].length;
    }
    return out;
}
function b64decodeString(s) { return utf8Decode(b64ToBytes(s)); }
function b64encodeString(s, urlSafe) { return bytesToB64(utf8Encode(s), urlSafe); }
// ---------------- MD5 ----------------
function md5Bytes(input) {
    var msg = toBytes(input);
    var K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    for (var i = 0; i < 64; i++)
        K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    var ml = msg.length;
    var withPad = new Uint8Array(((ml + 8) >> 6) * 64 + 64);
    withPad.set(msg);
    withPad[ml] = 0x80;
    var bitLen = ml * 8;
    withPad[withPad.length - 8] = bitLen & 0xff;
    withPad[withPad.length - 7] = (bitLen >>> 8) & 0xff;
    withPad[withPad.length - 6] = (bitLen >>> 16) & 0xff;
    withPad[withPad.length - 5] = (bitLen >>> 24) & 0xff;
    withPad[withPad.length - 4] = Math.floor(ml / 536870912) & 0xff;
    var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    var M = new Int32Array(16);
    for (var off = 0; off < withPad.length; off += 64) {
        for (var j = 0; j < 16; j++)
            M[j] = withPad[off + j * 4] | (withPad[off + j * 4 + 1] << 8) | (withPad[off + j * 4 + 2] << 16) | (withPad[off + j * 4 + 3] << 24);
        var A = a0, B = b0, C = c0, D = d0;
        for (var k = 0; k < 64; k++) {
            var F, g;
            if (k < 16) {
                F = (B & C) | (~B & D);
                g = k;
            }
            else if (k < 32) {
                F = (D & B) | (~D & C);
                g = (5 * k + 1) % 16;
            }
            else if (k < 48) {
                F = B ^ C ^ D;
                g = (3 * k + 5) % 16;
            }
            else {
                F = C ^ (B | ~D);
                g = (7 * k) % 16;
            }
            F = (F + A + K[k] + M[g]) | 0;
            A = D;
            D = C;
            C = B;
            B = (B + ((F << S[k]) | (F >>> (32 - S[k])))) | 0;
        }
        a0 = (a0 + A) | 0;
        b0 = (b0 + B) | 0;
        c0 = (c0 + C) | 0;
        d0 = (d0 + D) | 0;
    }
    var out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach(function (v, idx) {
        out[idx * 4] = v & 0xff;
        out[idx * 4 + 1] = (v >>> 8) & 0xff;
        out[idx * 4 + 2] = (v >>> 16) & 0xff;
        out[idx * 4 + 3] = (v >>> 24) & 0xff;
    });
    return out;
}
function md5Hex(input) { return bytesToHex(md5Bytes(input)); }
// ---------------- SHA-1 / SHA-256 ----------------
function shaPad(msg) {
    var ml = msg.length;
    var out = new Uint8Array(((ml + 8) >> 6) * 64 + 64);
    out.set(msg);
    out[ml] = 0x80;
    var bitLenHi = Math.floor(ml / 536870912), bitLenLo = (ml * 8) >>> 0;
    var n = out.length;
    out[n - 8] = (bitLenHi >>> 24) & 0xff;
    out[n - 7] = (bitLenHi >>> 16) & 0xff;
    out[n - 6] = (bitLenHi >>> 8) & 0xff;
    out[n - 5] = bitLenHi & 0xff;
    out[n - 4] = (bitLenLo >>> 24) & 0xff;
    out[n - 3] = (bitLenLo >>> 16) & 0xff;
    out[n - 2] = (bitLenLo >>> 8) & 0xff;
    out[n - 1] = bitLenLo & 0xff;
    return out;
}
function wordsToBytes(words) {
    var out = new Uint8Array(words.length * 4);
    for (var i = 0; i < words.length; i++) {
        out[i * 4] = (words[i] >>> 24) & 0xff;
        out[i * 4 + 1] = (words[i] >>> 16) & 0xff;
        out[i * 4 + 2] = (words[i] >>> 8) & 0xff;
        out[i * 4 + 3] = words[i] & 0xff;
    }
    return out;
}
function sha1Bytes(input) {
    var m = shaPad(toBytes(input));
    var h = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0];
    var w = new Int32Array(80);
    for (var off = 0; off < m.length; off += 64) {
        for (var i = 0; i < 16; i++)
            w[i] = (m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3];
        for (i = 16; i < 80; i++) {
            var x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (x << 1) | (x >>> 31);
        }
        var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
        for (i = 0; i < 80; i++) {
            var f, k;
            if (i < 20) {
                f = (b & c) | (~b & d);
                k = 0x5a827999;
            }
            else if (i < 40) {
                f = b ^ c ^ d;
                k = 0x6ed9eba1;
            }
            else if (i < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8f1bbcdc | 0;
            }
            else {
                f = b ^ c ^ d;
                k = 0xca62c1d6 | 0;
            }
            var t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
            e = d;
            d = c;
            c = (b << 30) | (b >>> 2);
            b = a;
            a = t;
        }
        h[0] = (h[0] + a) | 0;
        h[1] = (h[1] + b) | 0;
        h[2] = (h[2] + c) | 0;
        h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0;
    }
    return wordsToBytes(h);
}
var SHA256_K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function sha256Bytes(input) {
    var m = shaPad(toBytes(input));
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19].map(function (x) { return x | 0; });
    var w = new Int32Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < m.length; off += 64) {
        for (var i = 0; i < 16; i++)
            w[i] = (m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3];
        for (i = 16; i < 64; i++) {
            var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (i = 0; i < 64; i++) {
            var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            var ch = (e & f) ^ (~e & g);
            var t1 = (hh + S1 + ch + (SHA256_K[i] | 0) + w[i]) | 0;
            var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var t2 = (S0 + maj) | 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0;
        h[1] = (h[1] + b) | 0;
        h[2] = (h[2] + c) | 0;
        h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0;
        h[5] = (h[5] + f) | 0;
        h[6] = (h[6] + g) | 0;
        h[7] = (h[7] + hh) | 0;
    }
    return wordsToBytes(h);
}
function sha256Hex(input) { return bytesToHex(sha256Bytes(input)); }
function sha1Hex(input) { return bytesToHex(sha1Bytes(input)); }
function hmac(hashFn, key, msg) {
    key = toBytes(key);
    msg = toBytes(msg);
    if (key.length > 64)
        key = hashFn(key);
    var k = new Uint8Array(64);
    k.set(key);
    var ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) {
        ipad[i] = k[i] ^ 0x36;
        opad[i] = k[i] ^ 0x5c;
    }
    return hashFn(concatBytes(opad, hashFn(concatBytes(ipad, msg))));
}
function hmacSha256(key, msg) { return hmac(sha256Bytes, key, msg); }
function hmacSha1(key, msg) { return hmac(sha1Bytes, key, msg); }
function hmacMd5(key, msg) { return hmac(md5Bytes, key, msg); }
// ---------------- AES ----------------
var AES_SBOX = new Uint8Array(256), AES_INV_SBOX = new Uint8Array(256);
(function () {
    var p = 1, q = 1;
    do {
        p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
        q ^= q << 1;
        q ^= q << 2;
        q ^= q << 4;
        q &= 0xff;
        if (q & 0x80)
            q ^= 0x09;
        var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
        x = (x ^ 0x63) & 0xff;
        AES_SBOX[p] = x;
        AES_INV_SBOX[x] = p;
    } while (p !== 1);
    AES_SBOX[0] = 0x63;
    AES_INV_SBOX[0x63] = 0;
})();
function gmul(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i++) {
        if (b & 1)
            p ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi)
            a ^= 0x1b;
        b >>= 1;
    }
    return p;
}
function aesExpandKey(key) {
    key = toBytes(key);
    var nk = key.length / 4, nr = nk + 6;
    var w = new Uint8Array(16 * (nr + 1));
    w.set(key);
    var rcon = 1;
    for (var i = nk; i < 4 * (nr + 1); i++) {
        var t0 = w[(i - 1) * 4], t1 = w[(i - 1) * 4 + 1], t2 = w[(i - 1) * 4 + 2], t3 = w[(i - 1) * 4 + 3];
        if (i % nk === 0) {
            var tmp = t0;
            t0 = AES_SBOX[t1] ^ rcon;
            t1 = AES_SBOX[t2];
            t2 = AES_SBOX[t3];
            t3 = AES_SBOX[tmp];
            rcon = gmul(rcon, 2);
        }
        else if (nk > 6 && i % nk === 4) {
            t0 = AES_SBOX[t0];
            t1 = AES_SBOX[t1];
            t2 = AES_SBOX[t2];
            t3 = AES_SBOX[t3];
        }
        w[i * 4] = w[(i - nk) * 4] ^ t0;
        w[i * 4 + 1] = w[(i - nk) * 4 + 1] ^ t1;
        w[i * 4 + 2] = w[(i - nk) * 4 + 2] ^ t2;
        w[i * 4 + 3] = w[(i - nk) * 4 + 3] ^ t3;
    }
    return { w: w, nr: nr };
}
function aesEncryptBlock(ks, input) {
    var s = new Uint8Array(input), w = ks.w, nr = ks.nr, i, c;
    for (i = 0; i < 16; i++)
        s[i] ^= w[i];
    for (var r = 1; r <= nr; r++) {
        for (i = 0; i < 16; i++)
            s[i] = AES_SBOX[s[i]];
        var t = s[1];
        s[1] = s[5];
        s[5] = s[9];
        s[9] = s[13];
        s[13] = t;
        t = s[2];
        s[2] = s[10];
        s[10] = t;
        t = s[6];
        s[6] = s[14];
        s[14] = t;
        t = s[15];
        s[15] = s[11];
        s[11] = s[7];
        s[7] = s[3];
        s[3] = t;
        if (r !== nr) {
            for (c = 0; c < 4; c++) {
                var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
                s[c * 4] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
                s[c * 4 + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
                s[c * 4 + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
                s[c * 4 + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
            }
        }
        for (i = 0; i < 16; i++)
            s[i] ^= w[r * 16 + i];
    }
    return s;
}
function aesDecryptBlock(ks, input) {
    var s = new Uint8Array(input), w = ks.w, nr = ks.nr, i, c;
    for (i = 0; i < 16; i++)
        s[i] ^= w[nr * 16 + i];
    for (var r = nr - 1; r >= 0; r--) {
        var t = s[13];
        s[13] = s[9];
        s[9] = s[5];
        s[5] = s[1];
        s[1] = t;
        t = s[2];
        s[2] = s[10];
        s[10] = t;
        t = s[6];
        s[6] = s[14];
        s[14] = t;
        t = s[3];
        s[3] = s[7];
        s[7] = s[11];
        s[11] = s[15];
        s[15] = t;
        for (i = 0; i < 16; i++)
            s[i] = AES_INV_SBOX[s[i]];
        for (i = 0; i < 16; i++)
            s[i] ^= w[r * 16 + i];
        if (r !== 0) {
            for (c = 0; c < 4; c++) {
                var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
                s[c * 4] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
                s[c * 4 + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
                s[c * 4 + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
                s[c * 4 + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
            }
        }
    }
    return s;
}
function pkcs7Unpad(b) {
    if (!b.length)
        return b;
    var n = b[b.length - 1];
    if (n < 1 || n > 16 || n > b.length)
        return b;
    for (var i = b.length - n; i < b.length; i++)
        if (b[i] !== n)
            return b;
    return b.subarray(0, b.length - n);
}
function pkcs7Pad(b) {
    var n = 16 - (b.length % 16);
    var out = new Uint8Array(b.length + n);
    out.set(b);
    for (var i = b.length; i < out.length; i++)
        out[i] = n;
    return out;
}
function aesCbcDecrypt(data, key, iv, noUnpad) {
    data = toBytes(data);
    var ks = aesExpandKey(key), prev = toBytes(iv).subarray(0, 16);
    var out = new Uint8Array(data.length - (data.length % 16));
    for (var off = 0; off + 16 <= data.length; off += 16) {
        var block = data.subarray(off, off + 16);
        var dec = aesDecryptBlock(ks, block);
        for (var i = 0; i < 16; i++)
            out[off + i] = dec[i] ^ prev[i];
        prev = block;
    }
    return noUnpad ? out : pkcs7Unpad(out);
}
function aesCbcEncrypt(data, key, iv) {
    data = pkcs7Pad(toBytes(data));
    var ks = aesExpandKey(key), prev = toBytes(iv).subarray(0, 16);
    var out = new Uint8Array(data.length);
    for (var off = 0; off < data.length; off += 16) {
        var block = new Uint8Array(16);
        for (var i = 0; i < 16; i++)
            block[i] = data[off + i] ^ prev[i];
        prev = aesEncryptBlock(ks, block);
        out.set(prev, off);
    }
    return out;
}
function aesEcbDecrypt(data, key, noUnpad) {
    data = toBytes(data);
    var ks = aesExpandKey(key);
    var out = new Uint8Array(data.length - (data.length % 16));
    for (var off = 0; off + 16 <= data.length; off += 16)
        out.set(aesDecryptBlock(ks, data.subarray(off, off + 16)), off);
    return noUnpad ? out : pkcs7Unpad(out);
}
// CTR with a full 16-byte initial counter block (big-endian increment of the last 4 bytes)
function aesCtr(data, key, counterBlock) {
    data = toBytes(data);
    var ks = aesExpandKey(key);
    var ctr = new Uint8Array(toBytes(counterBlock));
    var out = new Uint8Array(data.length);
    for (var off = 0; off < data.length; off += 16) {
        var ksb = aesEncryptBlock(ks, ctr);
        for (var i = 0; i < 16 && off + i < data.length; i++)
            out[off + i] = data[off + i] ^ ksb[i];
        for (var j = 15; j >= 12; j--) {
            ctr[j] = (ctr[j] + 1) & 0xff;
            if (ctr[j] !== 0)
                break;
        }
    }
    return out;
}
// AES-GCM decrypt without tag verification (12 byte iv). data = ciphertext (tag stripped)
function aesGcmDecrypt(data, key, iv) {
    iv = toBytes(iv);
    var j0 = new Uint8Array(16);
    j0.set(iv.subarray(0, 12));
    j0[15] = 2; // counter starts at 2 for the first ciphertext block
    return aesCtr(data, key, j0);
}
// OpenSSL "Salted__" + EVP_BytesToKey(MD5) as used by CryptoJS passphrase mode
function evpBytesToKey(pass, salt, keyLen, ivLen) {
    pass = toBytes(pass);
    var out = new Uint8Array(0), prev = new Uint8Array(0);
    while (out.length < keyLen + ivLen) {
        prev = md5Bytes(concatBytes(prev, pass, salt));
        out = concatBytes(out, prev);
    }
    return { key: out.subarray(0, keyLen), iv: out.subarray(keyLen, keyLen + ivLen) };
}
function cryptoJsAesDecrypt(b64Cipher, passphrase) {
    var raw = b64ToBytes(b64Cipher);
    if (bytesToLatin1(raw.subarray(0, 8)) !== "Salted__")
        return null;
    var salt = raw.subarray(8, 16);
    var kv = evpBytesToKey(passphrase, salt, 32, 16);
    return utf8Decode(aesCbcDecrypt(raw.subarray(16), kv.key, kv.iv));
}
function xorBytes(data, key) {
    data = toBytes(data);
    key = toBytes(key);
    var out = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++)
        out[i] = data[i] ^ key[i % key.length];
    return out;
}
function randomHex(n) {
    var s = "";
    for (var i = 0; i < n; i++)
        s += Math.floor(Math.random() * 16).toString(16);
    return s;
}
// ---- lib/tmdb.js ----
// TMDB lookup shared by all providers.
var TMDB_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var TMDB_API = "https://api.themoviedb.org/3";
function resolveTmdbId(id, mediaType) {
    return __awaiter(this, void 0, void 0, function* () {
        var s = String(id || "").trim();
        if (/^tt\d+/i.test(s)) {
            var f = yield getJson(TMDB_API + "/find/" + s + "?api_key=" + TMDB_KEY + "&external_source=imdb_id");
            var list = f ? (mediaType === "tv" ? f.tv_results : f.movie_results) : null;
            if ((!list || !list.length) && f)
                list = mediaType === "tv" ? f.movie_results : f.tv_results;
            return list && list.length ? String(list[0].id) : null;
        }
        s = s.replace(/^tmdb:/i, "").split(":")[0];
        return /^\d+$/.test(s) ? s : null;
    });
}
// Returns media info or null.
function getTmdbMedia(id, mediaType, season, episode) {
    return __awaiter(this, void 0, void 0, function* () {
        var isTv = mediaType === "tv" || mediaType === "series";
        var tmdbId = yield resolveTmdbId(id, isTv ? "tv" : "movie");
        if (!tmdbId)
            return null;
        var d = yield getJson(TMDB_API + "/" + (isTv ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&append_to_response=external_ids,alternative_titles");
        if (!d || d.success === false)
            return null;
        var title = isTv ? (d.name || d.original_name) : (d.title || d.original_title);
        var date = isTv ? d.first_air_date : d.release_date;
        var alts = [];
        var at = d.alternative_titles && (d.alternative_titles.titles || d.alternative_titles.results);
        if (at)
            at.forEach(function (t) { if (t && t.title)
                alts.push(t.title); });
        var info = {
            tmdbId: tmdbId,
            isTv: isTv,
            type: isTv ? "tv" : "movie",
            title: title || "",
            originalTitle: (isTv ? d.original_name : d.original_title) || "",
            year: date ? parseInt(date.substring(0, 4), 10) : null,
            date: date || null,
            imdbId: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null,
            tvdbId: d.external_ids && d.external_ids.tvdb_id || null,
            lang: d.original_language || "",
            genres: (d.genres || []).map(function (g) { return g.name; }),
            genreIds: (d.genres || []).map(function (g) { return g.id; }),
            countries: d.origin_country || (d.production_countries || []).map(function (c) { return c.iso_3166_1; }),
            altTitles: alts,
            seasons: d.seasons || [],
            runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null,
            season: isTv ? (parseInt(season, 10) || 1) : null,
            episode: isTv ? (parseInt(episode, 10) || 1) : null,
            episodeAirDate: null,
            absoluteEpisode: null
        };
        info.isAnime = info.genreIds.indexOf(16) >= 0 && (info.lang === "ja" || info.countries.indexOf("JP") >= 0);
        if (isTv) {
            var ep = yield getJson(TMDB_API + "/tv/" + tmdbId + "/season/" + info.season + "/episode/" + info.episode + "?api_key=" + TMDB_KEY);
            if (ep && ep.air_date)
                info.episodeAirDate = ep.air_date;
            // absolute episode number across regular seasons (useful for long-running anime)
            var abs = 0;
            (info.seasons || []).forEach(function (s) {
                if (s.season_number > 0 && s.season_number < info.season)
                    abs += s.episode_count || 0;
            });
            info.absoluteEpisode = abs + info.episode;
        }
        return info;
    });
}
function mediaLabel(info) {
    if (!info)
        return "";
    var t = info.title + (info.year ? " (" + info.year + ")" : "");
    if (info.isTv)
        t += " S" + pad2(info.season) + "E" + pad2(info.episode);
    return t;
}
function titleCandidates(info) {
    var list = [info.title, info.originalTitle].concat(info.altTitles || []);
    var seen = {}, out = [];
    list.forEach(function (t) {
        if (!t)
            return;
        var k = cleanTitle(t);
        if (!k || seen[k])
            return;
        seen[k] = true;
        out.push(t);
    });
    return out;
}
// ---- lib/hls.js ----
// HLS helpers + remote domain lists
// parse a master playlist into [{url, height, bandwidth}]
function parseMaster(text, masterUrl) {
    var out = [];
    if (!text || text.indexOf("#EXT-X-STREAM-INF") < 0)
        return out;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf("#EXT-X-STREAM-INF:") !== 0)
            continue;
        var j = i + 1;
        while (j < lines.length && (!lines[j].trim() || lines[j].trim().charAt(0) === "#"))
            j++;
        if (j >= lines.length)
            break;
        var res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
        var bw = /BANDWIDTH=(\d+)/.exec(line);
        out.push({ url: absUrl(lines[j].trim(), masterUrl), height: res ? parseInt(res[2], 10) : 0, bandwidth: bw ? parseInt(bw[1], 10) : 0 });
        i = j;
    }
    return out;
}
// fetch a master playlist and return best quality label (or null)
function probeHlsQuality(url, headers) {
    return __awaiter(this, void 0, void 0, function* () {
        var t = yield getText(url, headers, 8000);
        if (!t)
            return null;
        var v = parseMaster(t, url);
        if (!v.length)
            return null;
        var best = v.reduce(function (a, b) { return b.height > a.height ? b : a; }, v[0]);
        return best.height ? qualityFrom(best.height) : null;
    });
}
var _remoteDomains = {};
function remoteDomains(url) {
    return __awaiter(this, void 0, void 0, function* () {
        if (_remoteDomains[url])
            return _remoteDomains[url];
        var j = yield getJson(url, null, 6000);
        var map = {};
        if (j && typeof j === "object") {
            Object.keys(j).forEach(function (k) {
                var v = j[k];
                if (typeof v === "string" && v)
                    map[k] = v.replace(/\/+$/, "");
            });
        }
        _remoteDomains[url] = map;
        return map;
    });
}
// Firebase domain list used by Raghav's extensions
function raghavDomain(key, fallback) {
    return __awaiter(this, void 0, void 0, function* () {
        var m = yield remoteDomains("https://cloudstreampluginhelper-default-rtdb.firebaseio.com/.json");
        return m[key] || m[key + "_url"] || m[key + "_domain"] || fallback;
    });
}
// Unpack Dean Edwards p.a.c.k.e.r. javascript
function unpackJs(src) {
    var m = /}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/.exec(src);
    if (!m)
        return null;
    var payload = m[1].replace(/\\'/g, "'"), radix = parseInt(m[2], 10), count = parseInt(m[3], 10), words = m[4].split("|");
    function base(n) {
        var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (n < radix)
            return chars.charAt(n);
        return base(Math.floor(n / radix)) + chars.charAt(n % radix);
    }
    var dict = {};
    while (count--) {
        var k = base(count);
        dict[k] = words[count] || k;
    }
    return payload.replace(/\b\w+\b/g, function (w) { return dict[w] !== undefined ? dict[w] : w; });
}
function findPackedAndUnpack(html) {
    var out = [];
    var re = /eval\(function\(p,a,c,k,e,(?:r|d)\)[\s\S]*?\.split\('\|'\)[^)]*\)\)/g, m;
    while ((m = re.exec(html))) {
        var u = unpackJs(m[0]);
        if (u)
            out.push(u);
    }
    return out.join("\n");
}
// ---- providers/netnaija.js ----
// @libs core,crypto,tmdb,hls
// NetNaija — port of Raghav's NetNaija CloudStream extension (aoneroom h5 API).
// Every audio track (original + dubs) is a separate subject; each becomes its own stream.
var NN_API = "https://h5-api.aoneroom.com/wefeed-h5api-bff";
var nnLog = makeLog("NetNaija");
var nnToken = null;
function nnClientToken() {
    var ts = Math.floor(Date.now() / 1000).toString();
    return ts + "," + md5Hex(ts.split("").reverse().join(""));
}
function nnBaseHeaders(mainUrl) {
    return {
        "User-Agent": UA_MOBILE,
        "Accept": "application/json",
        "Origin": mainUrl,
        "Referer": mainUrl + "/",
        "X-Request-Lang": "en",
        "X-Client-Info": '{"timezone":"Asia/Kolkata"}'
    };
}
function nnGrabToken(res) {
    try {
        var xu = headerGet(res && res.headers, "x-user");
        if (!xu)
            return;
        var t = JSON.parse(xu).token;
        if (t)
            nnToken = t;
    }
    catch (e) { }
}
function nnEnsureToken(mainUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (nnToken)
            return nnToken;
        var h = nnBaseHeaders(mainUrl);
        h["X-Client-Token"] = nnClientToken();
        var res = yield getFull(NN_API + "/subject/trending?page=1&perPage=1", { headers: h, timeout: 10000 });
        nnGrabToken(res);
        return nnToken || "";
    });
}
function nnAuthHeaders(mainUrl, extra) {
    return __awaiter(this, void 0, void 0, function* () {
        var token = yield nnEnsureToken(mainUrl);
        var h = nnBaseHeaders(mainUrl);
        if (token) {
            h["Cookie"] = "token=" + token;
            h["Authorization"] = "Bearer " + token;
        }
        else {
            h["X-Client-Token"] = nnClientToken();
        }
        return Object.assign(h, extra || {});
    });
}
function nnSourceLabel(dub) {
    if (!dub || !dub.lanName)
        return null;
    if (dub.original)
        return "Original";
    var base = dub.lanName.split(" dub")[0].split(" sub")[0].trim();
    if (!base)
        return null;
    var low = base.toLowerCase();
    var pretty = low === "ptbr" ? "PT-BR" : low === "esla" ? "ES-LA" : base.charAt(0).toUpperCase() + base.slice(1);
    return dub.type === 1 ? pretty + " Hardsub" : pretty + " Dub";
}
function nnSearch(mainUrl, query) {
    return __awaiter(this, void 0, void 0, function* () {
        var h = yield nnAuthHeaders(mainUrl, { "Content-Type": "application/json" });
        var res = yield getFull(NN_API + "/subject/search", {
            method: "POST", headers: h, timeout: 12000,
            body: JSON.stringify({ keyword: query, page: 1, perPage: 20 })
        });
        nnGrabToken(res);
        var j = res ? parseJsonSafe(res.text) : null;
        return (j && j.data && j.data.items) || [];
    });
}
function nnScore(item, info) {
    if (!item || !item.title || !item.detailPath)
        return -1;
    var wantType = info.isTv ? 2 : 1;
    if (item.subjectType && item.subjectType !== wantType)
        return -1;
    // titles on this site often carry a "[Hindi]" / "S1" suffix — score the cleaned name
    var t = item.title.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\bS\d+(-S?\d+)?\b/ig, " ");
    var best = 0;
    titleCandidates(info).forEach(function (c) { best = Math.max(best, titleSimilarity(t, c)); });
    if (best < 0.6)
        return -1;
    var y = item.releaseDate ? parseInt(item.releaseDate.substring(0, 4), 10) : null;
    if (y && info.year && !info.isTv && Math.abs(y - info.year) > 1)
        return -1;
    if (y && info.year && y === info.year)
        best += 0.2;
    return best;
}
function getStreams(tmdbId, mediaType, season, episode) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            var info = yield getTmdbMedia(tmdbId, mediaType, season, episode);
            if (!info)
                return [];
            var mainUrl = yield raghavDomain("netnaija", "https://netnaija.film");
            var sink = new StreamSink("NetNaija", "netnaija");
            var items = yield nnSearch(mainUrl, info.title);
            if (!items.length && info.originalTitle && info.originalTitle !== info.title)
                items = yield nnSearch(mainUrl, info.originalTitle);
            var scored = items.map(function (it) { return { it: it, s: nnScore(it, info) }; })
                .filter(function (x) { return x.s >= 0; })
                .sort(function (a, b) { return b.s - a.s; });
            if (!scored.length) {
                nnLog("no match for", info.title);
                return [];
            }
            // a show can be listed several times (one per language); collect dubs from the top matches
            var dubs = [], seenSubject = {};
            for (var i = 0; i < Math.min(3, scored.length); i++) {
                var path = scored[i].it.detailPath;
                var dres = yield getFull(NN_API + "/detail?detailPath=" + encodeURIComponent(path), { headers: yield nnAuthHeaders(mainUrl), timeout: 12000 });
                nnGrabToken(dres);
                var d = dres ? parseJsonSafe(dres.text) : null;
                var subject = d && d.data && d.data.subject;
                if (!subject)
                    continue;
                var list = subject.dubs && subject.dubs.length ? subject.dubs : [{ subjectId: subject.subjectId, detailPath: path, lanName: "Original Audio", lanCode: "en", type: 0, original: true }];
                list.forEach(function (dub) {
                    if (dub && dub.subjectId && dub.detailPath && !seenSubject[dub.subjectId]) {
                        seenSubject[dub.subjectId] = true;
                        dubs.push(dub);
                    }
                });
                if (i === 0 && scored.length > 1 && scored[1].s < scored[0].s - 0.15)
                    break;
            }
            var se = info.isTv ? info.season : 0, ep = info.isTv ? info.episode : 0;
            var playHeaders = { "Referer": mainUrl + "/", "Origin": mainUrl, "User-Agent": UA_MOBILE };
            var captionFrom = null;
            yield runLimited(dubs.map(function (dub) {
                return function () {
                    return __awaiter(this, void 0, void 0, function* () {
                        var label = nnSourceLabel(dub);
                        if (!label)
                            return;
                        var h = yield nnAuthHeaders(mainUrl, { "X-Source": "webNetnaijaSite", "Referer": mainUrl + "/videoPlayPage/" + dub.detailPath });
                        var url = NN_API + "/subject/play?subjectId=" + dub.subjectId + "&se=" + se + "&ep=" + ep + "&detailPath=" + encodeURIComponent(dub.detailPath);
                        var res = yield getFull(url, { headers: h, timeout: 12000 });
                        nnGrabToken(res);
                        var j = res ? parseJsonSafe(res.text) : null;
                        var data = j && j.data;
                        if (!data)
                            return;
                        (data.streams || []).forEach(function (s) {
                            if (!s.url || !s.resolutions || s.vipLocked)
                                return;
                            sink.add({
                                url: s.url, source: label, label: s.resolutions + "p" + (s.codecName ? " " + s.codecName : ""),
                                quality: parseInt(s.resolutions, 10), size: formatBytes(s.size), headers: playHeaders,
                                title: mediaLabel(info), lang: label
                            });
                            if (s.id && (dub.original || !captionFrom))
                                captionFrom = { id: s.id, subjectId: dub.subjectId, detailPath: dub.detailPath };
                        });
                        (data.hls || []).forEach(function (s) {
                            if (!s.url)
                                return;
                            sink.add({ url: s.url, source: label, label: "HLS", quality: parseInt(s.resolutions, 10) || null, headers: playHeaders, title: mediaLabel(info), type: "m3u8" });
                        });
                    });
                };
            }), 4);
            if (captionFrom) {
                var ch = yield nnAuthHeaders(mainUrl, { "X-Source": "webNetnaijaSite" });
                var cj = yield getJson(NN_API + "/subject/caption?format=MP4&id=" + captionFrom.id + "&subjectId=" + captionFrom.subjectId + "&detailPath=" + encodeURIComponent(captionFrom.detailPath), ch, 10000);
                ((cj && cj.data && cj.data.captions) || []).forEach(function (c) { if (c.url)
                    sink.sub(c.lanName || c.lan, c.url); });
            }
            return sink.result();
        }
        catch (e) {
            nnLog("error", e && e.message);
            return [];
        }
    });
}
if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
}
else if (typeof global !== "undefined") {
    global.getStreams = getStreams;
}
else if (typeof globalThis !== "undefined") {
    globalThis.getStreams = getStreams;
}
