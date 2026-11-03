/**
 * streamplay - Firestream Nuvio provider
 * Built from src/providers/streamplay.js — edit the source, then run `node build.js`.
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
// ---- lib/inflate.js ----
// Minimal DEFLATE decoder (raw / zlib / gzip) — enough for API payloads.
function inflateRaw(data) {
    var out = [], pos = 0, bitBuf = 0, bitCnt = 0;
    function bits(n) {
        while (bitCnt < n) {
            if (pos >= data.length)
                throw new Error("inflate: eof");
            bitBuf |= data[pos++] << bitCnt;
            bitCnt += 8;
        }
        var v = bitBuf & ((1 << n) - 1);
        bitBuf >>>= n;
        bitCnt -= n;
        return v;
    }
    function buildTree(lengths) {
        var counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(lengths.length), i;
        for (i = 0; i < lengths.length; i++)
            counts[lengths[i]]++;
        counts[0] = 0;
        for (i = 1; i < 16; i++)
            offs[i] = offs[i - 1] + counts[i - 1];
        for (i = 0; i < lengths.length; i++)
            if (lengths[i])
                syms[offs[lengths[i]]++] = i;
        return { counts: counts, syms: syms };
    }
    function decodeSym(t) {
        var code = 0, first = 0, index = 0;
        for (var len = 1; len < 16; len++) {
            code |= bits(1);
            var count = t.counts[len];
            if (code - count < first)
                return t.syms[index + (code - first)];
            index += count;
            first += count;
            first <<= 1;
            code <<= 1;
        }
        throw new Error("inflate: bad code");
    }
    var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
    var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
    var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
    var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
    var fixedL, fixedD;
    (function () {
        var l = new Uint8Array(288), i;
        for (i = 0; i < 144; i++)
            l[i] = 8;
        for (; i < 256; i++)
            l[i] = 9;
        for (; i < 280; i++)
            l[i] = 7;
        for (; i < 288; i++)
            l[i] = 8;
        fixedL = buildTree(l);
        var d = new Uint8Array(30);
        for (i = 0; i < 30; i++)
            d[i] = 5;
        fixedD = buildTree(d);
    })();
    var final = 0;
    while (!final) {
        final = bits(1);
        var type = bits(2);
        if (type === 0) {
            bitBuf = 0;
            bitCnt = 0;
            var len = data[pos] | (data[pos + 1] << 8);
            pos += 4;
            for (var k = 0; k < len; k++)
                out.push(data[pos++]);
            continue;
        }
        var lt, dt;
        if (type === 1) {
            lt = fixedL;
            dt = fixedD;
        }
        else if (type === 2) {
            var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
            var ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
            var cl = new Uint8Array(19);
            for (var c = 0; c < hclen; c++)
                cl[ORDER[c]] = bits(3);
            var clt = buildTree(cl);
            var lens = new Uint8Array(hlit + hdist), n = 0;
            while (n < hlit + hdist) {
                var sym = decodeSym(clt);
                if (sym < 16)
                    lens[n++] = sym;
                else if (sym === 16) {
                    var prev = lens[n - 1], r = 3 + bits(2);
                    while (r--)
                        lens[n++] = prev;
                }
                else if (sym === 17) {
                    var z = 3 + bits(3);
                    while (z--)
                        lens[n++] = 0;
                }
                else {
                    var z2 = 11 + bits(7);
                    while (z2--)
                        lens[n++] = 0;
                }
            }
            lt = buildTree(lens.subarray(0, hlit));
            dt = buildTree(lens.subarray(hlit));
        }
        else
            throw new Error("inflate: bad block");
        for (;;) {
            var s = decodeSym(lt);
            if (s < 256)
                out.push(s);
            else if (s === 256)
                break;
            else {
                s -= 257;
                var length = LBASE[s] + bits(LEXT[s]);
                var ds = decodeSym(dt);
                var dist = DBASE[ds] + bits(DEXT[ds]);
                var start = out.length - dist;
                for (var m = 0; m < length; m++)
                    out.push(out[start + m]);
            }
        }
    }
    return new Uint8Array(out);
}
// auto-detect gzip / zlib / raw
function inflateAuto(data) {
    if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
        var flg = data[3], p = 10;
        if (flg & 4)
            p += 2 + (data[p] | (data[p + 1] << 8));
        if (flg & 8) {
            while (data[p])
                p++;
            p++;
        }
        if (flg & 16) {
            while (data[p])
                p++;
            p++;
        }
        if (flg & 2)
            p += 2;
        return inflateRaw(data.subarray(p));
    }
    var isZlib = data.length > 1 && (data[0] & 0x0f) === 8 && (data[0] >> 4) <= 7 && (((data[0] << 8) | data[1]) % 31 === 0);
    return inflateRaw(isZlib ? data.subarray(2) : data);
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
// ---- lib/anime.js ----
// TMDB -> AniList/MAL mapping for anime providers.
var ANILIST_GQL = "https://graphql.anilist.co";
function anilistQuery(query, variables) {
    return __awaiter(this, void 0, void 0, function* () {
        var res = yield getFull(ANILIST_GQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA_MOBILE },
            body: JSON.stringify({ query: query, variables: variables || {} }),
            timeout: 12000
        });
        var j = res ? parseJsonSafe(res.text) : null;
        return j && j.data ? j.data : null;
    });
}
var AL_FIELDS = "id idMal format episodes seasonYear status synonyms startDate { year month day } title { romaji english native }";
function anilistByIds(ids) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!ids.length)
            return [];
        var d = yield anilistQuery("query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){" + AL_FIELDS + "}}}", { ids: ids });
        return d && d.Page ? d.Page.media || [] : [];
    });
}
function anilistSearch(search, format) {
    return __awaiter(this, void 0, void 0, function* () {
        var d = yield anilistQuery("query($s:String){Page(perPage:15){media(search:$s,type:ANIME,sort:SEARCH_MATCH){" + AL_FIELDS + "}}}", { s: search });
        var list = d && d.Page ? d.Page.media || [] : [];
        if (format === "MOVIE")
            list = list.filter(function (m) { return m.format === "MOVIE"; }).concat(list.filter(function (m) { return m.format !== "MOVIE"; }));
        return list;
    });
}
function alStart(m) {
    var s = m.startDate || {};
    return (s.year || 9999) * 10000 + (s.month || 0) * 100 + (s.day || 0);
}
function alTitles(m) {
    var t = m.title || {};
    return [t.english, t.romaji, t.native].concat(m.synonyms || []).filter(Boolean);
}
function armIds(info) {
    return __awaiter(this, void 0, void 0, function* () {
        var ids = {};
        var urls = [
            "https://arm.haglund.dev/api/v2/themoviedb?id=" + info.tmdbId,
            info.imdbId ? "https://arm.haglund.dev/api/v2/imdb?id=" + info.imdbId : null,
            info.tvdbId && info.isTv ? "https://arm.haglund.dev/api/v2/thetvdb?id=" + info.tvdbId : null
        ].filter(Boolean);
        var results = yield Promise.all(urls.map(function (u) { return getJson(u, { "Accept": "application/json" }, 8000); }));
        results.forEach(function (r) {
            if (!r)
                return;
            (Array.isArray(r) ? r : [r]).forEach(function (e) { if (e && e.anilist)
                ids[e.anilist] = true; });
        });
        return Object.keys(ids).map(function (x) { return parseInt(x, 10); });
    });
}
function aniZip(anilistId) {
    return __awaiter(this, void 0, void 0, function* () {
        return getJson("https://api.ani.zip/mappings?anilist_id=" + anilistId, { "Accept": "application/json" }, 8000);
    });
}
// Returns { anilistId, malId, kitsuId, episode, title, jpTitle, titles, year, format } or null
function resolveAnime(info) {
    return __awaiter(this, void 0, void 0, function* () {
        var ids = yield armIds(info);
        var media = yield anilistByIds(ids.slice(0, 40));
        if (!media.length) {
            // fall back to a title search on AniList
            var tries = [info.title, info.originalTitle].filter(Boolean);
            for (var i = 0; i < tries.length && !media.length; i++) {
                var found = yield anilistSearch(tries[i], info.isTv ? null : "MOVIE");
                media = found.filter(function (m) {
                    var best = 0;
                    alTitles(m).forEach(function (t) { best = Math.max(best, titleSimilarity(t, tries[i])); });
                    return best >= 0.6;
                });
            }
        }
        if (!media.length)
            return null;
        var pick = null, epNum = info.isTv ? info.episode : 1;
        if (!info.isTv) {
            var movies = media.filter(function (m) { return m.format === "MOVIE"; });
            var pool = movies.length ? movies : media;
            pool.sort(function (a, b) {
                var ya = Math.abs((a.seasonYear || (a.startDate || {}).year || 0) - (info.year || 0));
                var yb = Math.abs((b.seasonYear || (b.startDate || {}).year || 0) - (info.year || 0));
                return ya - yb;
            });
            pick = pool[0];
        }
        else {
            var series = media.filter(function (m) { return m.format !== "MOVIE" && m.format !== "MUSIC"; });
            if (!series.length)
                series = media;
            series.sort(function (a, b) { return alStart(a) - alStart(b); });
            // 1) exact match through ani.zip episode tables (tvdb numbering ≈ tmdb numbering)
            if (series.length > 1 || info.season > 1) {
                var zips = yield Promise.all(series.slice(0, 12).map(function (m) { return aniZip(m.id); }));
                for (var z = 0; z < zips.length && !pick; z++) {
                    var eps = zips[z] && zips[z].episodes;
                    if (!eps)
                        continue;
                    for (var key in eps) {
                        var e = eps[key];
                        if (!e || !/^\d+$/.test(key))
                            continue;
                        var bySeason = e.seasonNumber === info.season && e.episodeNumber === info.episode;
                        var byDate = info.episodeAirDate && e.airDate === info.episodeAirDate && (e.seasonNumber == null || e.seasonNumber === info.season);
                        if (bySeason || byDate) {
                            pick = series[z];
                            epNum = parseInt(key, 10);
                            break;
                        }
                    }
                }
            }
            // 2) season index / absolute episode walk
            if (!pick) {
                var tv = series.filter(function (m) { return m.format === "TV" || m.format === "ONA" || m.format === "TV_SHORT"; });
                if (!tv.length)
                    tv = series;
                if (info.season > 1 && tv[info.season - 1]) {
                    pick = tv[info.season - 1];
                    epNum = info.episode;
                }
                else {
                    var remaining = info.season > 1 ? (info.absoluteEpisode || info.episode) : info.episode;
                    for (var t = 0; t < tv.length; t++) {
                        var count = tv[t].episodes || 0;
                        if (!count || remaining <= count || t === tv.length - 1) {
                            pick = tv[t];
                            epNum = remaining;
                            break;
                        }
                        remaining -= count;
                    }
                }
            }
        }
        if (!pick)
            return null;
        var tt = pick.title || {};
        var kitsuId = null;
        try {
            var zz = yield aniZip(pick.id);
            if (zz && zz.mappings)
                kitsuId = zz.mappings.kitsu_id || null;
        }
        catch (e) { }
        return {
            anilistId: pick.id,
            malId: pick.idMal || null,
            kitsuId: kitsuId,
            episode: epNum,
            title: tt.english || tt.romaji || info.title,
            romaji: tt.romaji || null,
            jpTitle: tt.romaji || tt.native || null,
            native: tt.native || null,
            titles: alTitles(pick).concat([info.title, info.originalTitle]).filter(Boolean),
            year: pick.seasonYear || (pick.startDate || {}).year || info.year,
            format: pick.format,
            totalEpisodes: pick.episodes || null
        };
    });
}
// ---- lib/embeds.js ----
// Embed resolvers shared across providers (MegaPlay family, FlixCloud, packed players, generic).
// Each resolver pushes into a StreamSink and returns true when something was added.
var MEGAPLAY_UA = UA_DESKTOP;
var _megaSeeds = null;
function megaKeySeeds(base) {
    return __awaiter(this, void 0, void 0, function* () {
        var fallback = ["i?LMTAx0Q6,:}50U", "W0;27ToaUpl_P%'c"];
        if (_megaSeeds)
            return [_megaSeeds, fallback];
        var js = yield getText(base + "/lib/newclient.min.js", null, 10000);
        var m = js && /[A-Za-z]\w*="([^"]{16})",[A-Za-z]\w*="([^"]{16})"/.exec(js);
        if (m) {
            _megaSeeds = [m[1], m[2]];
            return [_megaSeeds, fallback];
        }
        return [fallback];
    });
}
function megaDecrypt(enc, keySeed, ivSeed) {
    try {
        var key = new Uint8Array(32);
        key.set(utf8Encode(keySeed).subarray(0, 32));
        var iv = new Uint8Array(16);
        iv.set(utf8Encode(ivSeed).subarray(0, 16));
        return utf8Decode(aesCbcDecrypt(b64ToBytes(enc), key, iv));
    }
    catch (e) {
        return null;
    }
}
function megaMigrate(u) {
    return u && u.indexOf("https://cdn.imgnex.top/anime") >= 0 ? u.replace("https://cdn.imgnex.top/anime", "https://megap.norami.top") : u;
}
var MEGA_TOKEN_KEY = "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
function megaSignUrl(url) {
    var m = /\/([a-f0-9]{32})\/([a-f0-9]{32})\//i.exec(url);
    if (!m)
        return url;
    var expires = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    var payload = expires + "|" + m[1].toLowerCase() + "/" + m[2].toLowerCase();
    var token = bytesToB64(utf8Encode(payload), true) + "." + bytesToB64(hmacSha256(MEGA_TOKEN_KEY, payload), true);
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + token;
}
// returns {m3u8, subtitles:[[label,url]]} or null
function megaplayResolve(embedUrl, referer) {
    return __awaiter(this, void 0, void 0, function* () {
        var host = hostOf(embedUrl);
        if (!host)
            return null;
        var html = yield getText(embedUrl, { "User-Agent": MEGAPLAY_UA, "Referer": referer || ("https://" + host + "/") }, 15000);
        if (!html)
            return null;
        var idm = /data-id=["'](\d+)/.exec(html) || /data-realid=["'](\d+)/.exec(html) || /\/stream\/s-\d+\/(\d+)\//.exec(embedUrl);
        if (!idm)
            return null;
        var audio = (/\/(dub|sub)(?:[\/?#]|$)/.exec(embedUrl) || /type\s*:\s*['"](dub|sub)['"]/.exec(html) || [0, "sub"])[1];
        var alt = (/data-domain=["']([^"']+)["']/.exec(html) || [])[1];
        var hosts = [host];
        if (alt && alt !== host)
            hosts.push(alt);
        for (var h = 0; h < hosts.length; h++) {
            var base = "https://" + hosts[h];
            var ajax = { "User-Agent": MEGAPLAY_UA, "Accept": "*/*", "X-Requested-With": "XMLHttpRequest", "Origin": base, "Referer": embedUrl };
            var eps = ["getSourcesNew", "getSources"];
            for (var e = 0; e < eps.length; e++) {
                var root = yield getJson(base + "/stream/" + eps[e] + "?id=" + idm[1] + "&type=" + audio, ajax, 15000);
                if (!root)
                    continue;
                var src = root.sources, file = null;
                if (src && !Array.isArray(src) && typeof src === "object")
                    file = src.file;
                else if (Array.isArray(src) && src.length)
                    file = src[0].file;
                if (!file && root.enc) {
                    var seeds = yield megaKeySeeds(base);
                    for (var s = 0; s < seeds.length && !file; s++) {
                        var plain = megaDecrypt(root.enc, seeds[s][0], seeds[s][1]);
                        var fm = plain && /"file"\s*:\s*"([^"]+)"/.exec(plain);
                        if (fm)
                            file = fm[1].replace(/\\\//g, "/");
                    }
                }
                if (!file)
                    continue;
                file = megaMigrate(file);
                var origin = originOf(file) || "https://megap.norami.top";
                var subs = [];
                (root.tracks || []).forEach(function (t) {
                    if (!t || !t.file || (t.kind !== "captions" && t.kind !== "subtitles"))
                        return;
                    subs.push([t.label || "English", t.file.replace("https://cdn.imgnex.top/anime", origin)]);
                });
                return { m3u8: file, subtitles: subs };
            }
        }
        return null;
    });
}
// adds all variants (signed) of a megaplay master
function megaplayEmit(sink, sourceTag, label, m3u8, referer, subtitles, mediaTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        var headers = { "User-Agent": MEGAPLAY_UA, "Referer": referer };
        var signed = megaSignUrl(m3u8);
        var text = yield getText(signed, headers, 15000);
        var found = false;
        var variants = text ? parseMaster(text, m3u8) : [];
        if (variants.length) {
            variants.forEach(function (v) {
                sink.add({ url: megaSignUrl(v.url), source: sourceTag, label: label, quality: v.height || null, headers: headers, title: mediaTitle, type: "m3u8" });
            });
            found = true;
        }
        else if (text && text.indexOf("#EXTM3U") >= 0) {
            sink.add({ url: signed, source: sourceTag, label: label, headers: headers, title: mediaTitle, type: "m3u8" });
            found = true;
        }
        (subtitles || []).forEach(function (s) { sink.sub(s[0], s[1], headers); });
        return found;
    });
}
function resolveMegaplayFamily(sink, embedUrl, referer, label, sourceTag, mediaTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        var st = yield megaplayResolve(embedUrl, referer);
        if (!st)
            return false;
        return megaplayEmit(sink, sourceTag, label, st.m3u8, "https://" + hostOf(embedUrl) + "/", st.subtitles, mediaTitle);
    });
}
// FlixCloud: one MKV containing all audio/sub tracks; token is IP bound so it's minted on-device
function flixcloudResolve(embedUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        var id = (/\/e\/([a-z0-9]+)/i.exec(embedUrl) || [])[1];
        if (!id)
            return null;
        var base = "https://flixcloud.cc";
        var headers = { "User-Agent": UA_MOBILE, "Referer": base + "/", "Accept": "*/*" };
        var body = yield getText(base + "/d/" + id + "/__data.json", headers, 12000);
        if (!body)
            return null;
        var fileId = (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(body) || [])[0];
        var token = (/eyJ[\w-]+\.[\w-]+\.[\w-]+/.exec(body) || [])[0];
        if (!fileId || !token)
            return null;
        var host = (/https:\/\/[a-z0-9-]+\.flixcloud\.cc/i.exec(body) || [base])[0];
        var prog = yield getText(host + "/download/" + fileId + "/progress?token=" + token, headers, 10000);
        if (!prog || prog.indexOf('"ready"') < 0)
            return null;
        return {
            url: host + "/download/" + fileId + "?token=" + token,
            quality: parseInt((/(\d{3,4})p/.exec(body) || [])[1], 10) || null,
            size: (/"(\d+(?:\.\d+)?\s*[KMG]B)"/i.exec(body) || [])[1] || null,
            headers: { "User-Agent": UA_MOBILE, "Referer": base + "/" }
        };
    });
}
var M3U8_RE = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/;
var MP4_RE = /https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/;
function passSubtitleFromQuery(sink, embedUrl) {
    var q = embedUrl.split("?")[1];
    if (!q)
        return;
    var s = /(?:^|&)(?:sub|caption_1|c1_file)=([^&]+)/.exec(q);
    if (!s)
        return;
    var l = /(?:^|&)(?:sub_1|c1_label)=([^&]+)/.exec(q);
    try {
        sink.sub(l ? decodeURIComponent(l[1]) : "English", decodeURIComponent(s[1]));
    }
    catch (e) { }
}
// Generic: look for m3u8/mp4 in the page or its packed JS. Covers most "file:" style players
// (streamwish/filemoon/vidhide/kwik/voe-like clones).
function resolveGenericEmbed(sink, embedUrl, referer, label, sourceTag, mediaTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        var html = yield getText(embedUrl, { "User-Agent": UA_DESKTOP, "Referer": referer || embedUrl }, 15000);
        if (!html)
            return false;
        var hay = html + "\n" + findPackedAndUnpack(html);
        // voe hides a base64 redirect / json
        var voe = /'hls'\s*:\s*'([^']+)'/.exec(hay);
        if (voe) {
            try {
                hay += "\n" + b64decodeString(voe[1]);
            }
            catch (e) { }
        }
        var fileM = /(?:file|src|source)\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/.exec(hay);
        var u = fileM ? fileM[1] : null;
        if (!u) {
            var mm = M3U8_RE.exec(hay) || MP4_RE.exec(hay);
            u = mm ? mm[0] : null;
        }
        if (!u)
            return false;
        u = absUrl(u.replace(/\\\//g, "/"), embedUrl);
        var headers = { "User-Agent": UA_DESKTOP, "Referer": "https://" + hostOf(embedUrl) + "/", "Origin": "https://" + hostOf(embedUrl) };
        var q = null;
        if (/\.m3u8/.test(u))
            q = yield probeHlsQuality(u, headers);
        sink.add({ url: u, source: sourceTag, label: label, quality: q || label, headers: headers, title: mediaTitle });
        var tm = /tracks\s*:\s*\[([^\]]+)\]/.exec(hay);
        if (tm) {
            var re = /file\s*:\s*["']([^"']+\.(?:vtt|srt)[^"']*)["'][^}]*?label\s*:\s*["']([^"']+)["']/g, x;
            while ((x = re.exec(tm[1])))
                sink.sub(x[2], absUrl(x[1], embedUrl));
        }
        return true;
    });
}
function resolveEmbed(sink, embedUrl, referer, label, sourceTag, mediaTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!embedUrl)
            return false;
        if (embedUrl.indexOf("//") === 0)
            embedUrl = "https:" + embedUrl;
        var host = hostOf(embedUrl);
        try {
            if (/megaplay|vidwish\.live|vidtube\.site/.test(host))
                return yield resolveMegaplayFamily(sink, embedUrl, referer, label, sourceTag, mediaTitle);
            if (/flixcloud\.cc$/.test(host)) {
                var f = yield flixcloudResolve(embedUrl);
                if (!f)
                    return false;
                sink.add({ url: f.url, source: sourceTag, label: label + " (Multi-audio MKV)", quality: f.quality, size: f.size, headers: f.headers, title: mediaTitle, type: "mkv" });
                return true;
            }
            passSubtitleFromQuery(sink, embedUrl);
            return yield resolveGenericEmbed(sink, embedUrl, referer, label, sourceTag, mediaTitle);
        }
        catch (e) {
            return false;
        }
    });
}
// ---- lib/raghav_anime.js ----
// Engine behind RaghavAnime / RaghavAnime Kitsu — port of Raghav's aggregated anime extension.
// Ported sources (HTTP only): Miruro, AniKage, Anidap, AniPM, AniNami, VidHawk, Kyren, Re:ANIME, Anv, AniKoto.
// Not ported (need Android WebView / Cloudflare solving / local segment proxy): AniSuge, AniWaves,
// 2DHive, GoTaku, Senshi, Xanime, AniChan server list.
var raLog = makeLog("RaghavAnime");
// ---------------- Miruro ----------------
var MIRURO_DOMAINS = ["https://www.miruro.ru", "https://www.miruro.tv", "https://www.miruro.to", "https://www.miruro.bz"];
var MIRURO_NAMES = { kiwi: "AnimePahe", pewe: "AniDB", bonk: "AnimeDao", bee: "AniKoto", ally: "AllManga", hop: "KickAssAnime", moo: "AnimeGG", nun: "Nun", bun: "Bun", twin: "Twin", cog: "Cog" };
var MIRURO_XOR = [0x71, 0x95, 0x10, 0x34, 0xF8, 0xFB, 0xCF, 0x53, 0xD8, 0x9D, 0xB5, 0x2C, 0xEB, 0x3D, 0xC2, 0x2C];
var miruroWorking = null;
function miruroDecode(body, obf) {
    var t = String(body || "").trim();
    if (!t)
        return null;
    if (t.charAt(0) === "{" || t.charAt(0) === "[")
        return t;
    var raw = b64ToBytes(t);
    var attempts = obf === "2" ? [true, false] : [false, true];
    for (var i = 0; i < attempts.length; i++) {
        try {
            var data = attempts[i] ? xorBytes(raw, new Uint8Array(MIRURO_XOR)) : raw;
            return utf8Decode(inflateAuto(data));
        }
        catch (e) { }
    }
    return null;
}
function miruroPipe(path, query) {
    return __awaiter(this, void 0, void 0, function* () {
        var q = Object.assign({}, query, { live: "true", _t: Math.floor(Date.now() / 600000) * 600000 });
        var enc = bytesToB64(utf8Encode(JSON.stringify({ path: path, method: "GET", query: q, body: null })), true);
        var domains = miruroWorking ? [miruroWorking].concat(MIRURO_DOMAINS.filter(function (d) { return d !== miruroWorking; })) : MIRURO_DOMAINS.slice();
        for (var i = 0; i < Math.min(3, domains.length); i++) {
            var d = domains[i];
            var res = yield getFull(d + "/api/secure/pipe?e=" + enc, { headers: { "User-Agent": UA_MOBILE, "Referer": d + "/", "Origin": d, "Accept": "*/*" }, timeout: 20000 });
            if (!res || res.status !== 200 || !res.text || /cf-browser-verification|challenge-platform|Just a moment/i.test(res.text))
                continue;
            var dec = miruroDecode(res.text, headerGet(res.headers, "x-obfuscated"));
            var j = parseJsonSafe(dec);
            if (j) {
                miruroWorking = d;
                return j;
            }
        }
        return null;
    });
}
function srcMiruro(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var eps = yield miruroPipe("episodes", { anilistId: ctx.anime.anilistId });
        if (!eps || !eps.providers)
            return;
        var jobs = [];
        Object.keys(eps.providers).forEach(function (prov) {
            var cats = (eps.providers[prov] || {}).episodes || {};
            [["sub", cats.sub || cats.ssub, cats.sub ? "sub" : "ssub"], ["dub", cats.dub, "dub"]].forEach(function (c) {
                var list = c[1] || [];
                var ep = list.filter(function (e) { return e && e.number === ctx.anime.episode && e.id; })[0];
                if (ep)
                    jobs.push({ prov: prov, id: ep.id, cat: c[2], audio: c[0] });
            });
        });
        yield runLimited(jobs.map(function (j) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    var r = yield miruroPipe("sources", { episodeId: j.id, provider: j.prov, category: j.cat, anilistId: ctx.anime.anilistId });
                    if (!r || !r.streams)
                        return;
                    var name = MIRURO_NAMES[j.prov] || j.prov;
                    var label = (j.audio === "dub" ? "Dub" : j.cat === "ssub" ? "Softsub" : "Sub");
                    for (var i = 0; i < r.streams.length; i++) {
                        var s = r.streams[i];
                        if (!s || !s.url)
                            continue;
                        var headers = { "Referer": s.referer || "https://www.miruro.com/", "User-Agent": UA_MOBILE };
                        var fan = s.fansub ? " [" + s.fansub + "]" : "";
                        if (s.type === "hls" || s.type === "mp4") {
                            ctx.sink.add({ url: s.url, source: "Miruro " + name, label: label + fan, quality: s.quality || (s.resolution && s.resolution.height), headers: headers, title: ctx.mediaTitle, type: s.type === "hls" ? "m3u8" : "mp4" });
                        }
                        else if (s.type === "embed") {
                            yield resolveEmbed(ctx.sink, s.url, s.referer || "https://www.miruro.com/", label + fan, "Miruro " + name, ctx.mediaTitle);
                        }
                    }
                    (r.subtitles || []).forEach(function (sb) { if (sb.url)
                        ctx.sink.sub(sb.lang || "English", sb.url); });
                });
            };
        }), 4);
    });
}
// ---------------- AniKage ----------------
function srcAniKage(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = yield raghavDomain("anikage", "https://anikage.cc");
        var api = main + "/api/media/anime";
        var headers = { "Accept": "application/json", "User-Agent": UA_DESKTOP };
        var slug = null;
        var queries = [ctx.anime.title, ctx.anime.jpTitle].filter(Boolean);
        for (var i = 0; i < queries.length && !slug; i++) {
            var b = yield getJson(api + "/browse?q=" + encodeURIComponent(queries[i]) + "&sort=popularity&page=1&limit=25&adult=true", headers);
            var hit = b && (b.data || []).filter(function (x) { return x.anilistId === ctx.anime.anilistId && x.slug; })[0];
            if (hit)
                slug = hit.slug;
        }
        if (!slug)
            return;
        var pageHtml = yield getText(main, null, 8000);
        var proxy = (pageHtml && (/"PUBLIC_PROXY_URL"\s*:\s*"([^"]+)"/.exec(pageHtml) || [])[1]) || (yield raghavDomain("anikageproxy", null)) || "https://og.bakayaro.live";
        var proxyHeaders = { "Referer": main + "/", "Origin": main };
        function px(p, type) {
            if (/^https?:\/\//.test(p))
                return p;
            if (/^\/(m3u8|stream|hls)\//.test(p))
                return proxy + p;
            if (/^(m3u8|stream|hls)\//.test(p))
                return proxy + "/" + p;
            return proxy + "/" + type + "/" + p;
        }
        var servers = yield getJson(api + "/" + slug + "/episodes/" + ctx.anime.episode + "/servers", headers);
        var list = ((servers && servers.servers) || []).filter(function (s) { return s.id; });
        var jobs = [];
        ["sub", "dub"].forEach(function (lang) {
            list.forEach(function (s) {
                if (s.subTypes && s.subTypes.length && s.subTypes.indexOf(lang) < 0)
                    return;
                jobs.push({ s: s, lang: lang });
            });
        });
        yield runLimited(jobs.map(function (j) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    var prov = j.s.providerId || j.s.id;
                    var r = yield getJson(api + "/" + slug + "/episodes/" + ctx.anime.episode + "/sources?provider=" + prov + "&lang=" + j.lang + "&server=" + j.s.id, headers);
                    if (!r)
                        return;
                    var subs = r.subtitles || [];
                    subs.forEach(function (sb) { if (sb.file)
                        ctx.sink.sub(sb.label || j.lang, px(sb.file, "stream"), proxyHeaders); });
                    var subType = j.lang === "sub" ? (subs.length ? "Softsub" : "Hardsub") : "Dub";
                    var embeds = [];
                    (r.sources || []).forEach(function (src) {
                        if (src.embedUrl)
                            embeds.push([src.embedUrl, src.server]);
                        if (src.url)
                            ctx.sink.add({ url: px(src.url, src.isM3U8 ? "m3u8" : "stream"), source: "AniKage " + j.s.id, label: subType + (src.server && src.server !== j.s.id ? " " + src.server : ""), quality: src.quality || "1080p", headers: proxyHeaders, title: ctx.mediaTitle, type: src.isM3U8 ? "m3u8" : undefined });
                    });
                    (r.embeds || []).forEach(function (e) { if (e.url)
                        embeds.push([e.url, e.server]); });
                    for (var k = 0; k < embeds.length; k++)
                        yield resolveEmbed(ctx.sink, embeds[k][0], main + "/", subType, "AniKage " + (embeds[k][1] || j.s.id), ctx.mediaTitle);
                });
            };
        }), 4);
    });
}
// ---------------- Anidap ----------------
var ANIDAP_XOR = "10b06cdc1ca48c9fb0b94af97cc040cf";
var ANIDAP_UWU_KEYS = { sora: "https://krussdomi.com", yuki: "https://megaplay.buzz", uwu: "https://kwik.cx/", kiwi: "https://anidb.app/", miku: "https://allanime.uns.bio" };
function anidapUwu(url, key) {
    var data = concatBytes(utf8Encode(url), new Uint8Array([0]), utf8Encode(key));
    return "https://cdnx.aniwatchtv.site/uwu/" + bytesToB64(xorBytes(data, latin1Bytes(ANIDAP_XOR)), true);
}
function anidapShiro(url) {
    var b = utf8Encode(url), hex = "";
    for (var i = 0; i < b.length; i++) {
        var x = (b[i] ^ 137) & 0xff;
        hex += (x < 16 ? "0" : "") + x.toString(16);
    }
    return "https://hls.dramavideo.se/media/" + hex + "&origin=https://kem.clvd.xyz/";
}
function anidapTransform(url, providerId, referer) {
    var p = providerId.toLowerCase(), r = url;
    if (r.indexOf("https://vivibebe.site/public/stream/") >= 0)
        r = r.replace("https://vivibebe.site/public/stream/", "https://hawk.aniwatchtv.site/media/");
    if (r.indexOf("https://playeng.animeapps.top/r2/") === 0)
        r = "https://bd.aniwatchtv.site/media" + r.replace(/^https?:\/\/[^\/]+/, "").replace("/r2", "");
    if (p === "shiro")
        r = anidapShiro(r);
    else if (ANIDAP_UWU_KEYS[p])
        r = anidapUwu(r, ANIDAP_UWU_KEYS[p]);
    else if (p === "mochi")
        r = r.replace("https://tools.fast4speed.rsvp", "https://mp4.24stream.xyz/storage");
    else if (p === "beep") {
        if (!/^https:\/\/bd\.(24stream\.xyz|aniwatchtv\.site)\/media/.test(r))
            r = "https://bd.aniwatchtv.site/media" + r.replace(/^https?:\/\/[^\/]+/, "").replace("/r2", "");
    }
    if (r === url && referer && p !== "vee" && p !== "neko")
        return anidapUwu(url, referer);
    return r.replace(/^http:\/\//, "https://");
}
function srcAnidap(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = yield raghavDomain("anidap", "https://anidap.lol");
        var chad = main.replace("://", "://chad.") + "/rest/api";
        var cf = { "Referer": main + "/", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Origin": main, "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-site", "User-Agent": UA_MOBILE };
        var d = yield getJson(main + "/api/anime/" + ctx.anime.anilistId, { "Referer": main + "/home", "Accept": "application/json", "User-Agent": UA_MOBILE });
        if (!d)
            return;
        var data = d.data && typeof d.data === "object" && Object.keys(d.data).length ? d.data : d;
        var slug = data.id || data.slug;
        if (!slug)
            return;
        var sv = yield getJson(chad + "/servers?id=" + slug + "&epNum=" + ctx.anime.episode, cf);
        if (!sv)
            return;
        var proxyHeaders = { "User-Agent": UA_MOBILE, "Accept": "*/*", "Origin": main, "Referer": main + "/" };
        var jobs = [];
        [["sub", sv.subProviders], ["dub", sv.dubProviders]].forEach(function (c) {
            var list = (c[1] || []).map(function (n) { return typeof n === "string" ? { id: n } : n; }).filter(function (n) { return n && n.id; });
            if (!list.some(function (n) { return n.id === "adp"; }))
                list.unshift({ id: "adp" });
            list.forEach(function (n) { jobs.push({ type: c[0], p: n }); });
        });
        yield runLimited(jobs.map(function (j) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    var root = yield getJson(chad + "/sources?id=" + slug + "&epNum=" + ctx.anime.episode + "&type=" + j.type + "&providerId=" + j.p.id, cf);
                    if (!root)
                        return;
                    var node = root.data && root.data.sources ? root.data : root;
                    var hdrs = node.headers || {};
                    var referer = hdrs.Referer || hdrs.referer;
                    var hard = j.p.tip && /hard/i.test(j.p.tip);
                    var label = (j.type === "dub" ? "Dub" : hard ? "Hardsub" : "Sub");
                    (node.tracks || node.subtitles || []).forEach(function (t) {
                        var u = (t.url || "").replace("https:///", "https://");
                        var l = (t.label || t.lang || "Subtitle");
                        if (!/^http/.test(u) || /thumbnail/i.test(l) || t.kind === "thumbnails")
                            return;
                        ctx.sink.sub(l, u, /megaplay|lostproject|vyrnex/.test(u) ? { "Origin": "https://megaplay.buzz", "Referer": "https://megaplay.buzz/" } : hdrs);
                    });
                    for (var i = 0; i < (node.sources || []).length; i++) {
                        var s = node.sources[i];
                        if (!s || !s.url)
                            continue;
                        var isHls = /mpegurl|m3u8/i.test(s.type || "") || /\.m3u8|index\.txt|\.txt(\?|$)/.test(s.url);
                        var isMp4 = /mp4|webm|matroska/i.test(s.type || "") || /\.(mp4|webm|mkv)(\?|$)/.test(s.url);
                        if (isHls) {
                            var txt = yield getText(s.url, hdrs, 10000);
                            if (txt && txt.indexOf("#EXTM3U") >= 0) {
                                ctx.sink.add({ url: s.url, source: "Anidap " + j.p.id, label: label, quality: s.quality, headers: hdrs, title: ctx.mediaTitle, type: "m3u8" });
                            }
                            else {
                                var prox = anidapTransform(s.url, j.p.id, referer);
                                if (prox !== s.url) {
                                    var t2 = yield getText(prox, proxyHeaders, 10000);
                                    if (t2 && t2.indexOf("#EXTM3U") >= 0)
                                        ctx.sink.add({ url: prox, source: "Anidap " + j.p.id, label: label, quality: s.quality, headers: proxyHeaders, title: ctx.mediaTitle, type: "m3u8" });
                                }
                            }
                        }
                        else if (isMp4) {
                            ctx.sink.add({ url: s.url, source: "Anidap " + j.p.id, label: label, quality: s.quality, headers: hdrs, title: ctx.mediaTitle });
                        }
                        else {
                            yield resolveEmbed(ctx.sink, s.url, referer || main + "/", label, "Anidap " + j.p.id, ctx.mediaTitle);
                        }
                    }
                });
            };
        }), 4);
    });
}
// ---------------- AniPM ----------------
function srcAniPM(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = yield raghavDomain("anipm", "https://ani.pm");
        var H = function (ref) { return { "User-Agent": UA_DESKTOP, "Accept": "application/json", "Referer": ref || main + "/" }; };
        var SETTLAR = "https://embed.settlar.io";
        function settlar(root, channel, label) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!root.settlarSelection)
                    return;
                var ses = yield getJson(main + "/api/anime/settlar/session?selection=" + encodeURIComponent(root.settlarSelection) + "&provider=anipm&ep=" + ctx.anime.episode + "&channel=" + channel + "&telemetry=0", H());
                var embedUrl = ses && ses.embedUrl;
                var t = embedUrl && (/t=([^&]+)/.exec(embedUrl) || [])[1];
                if (!t)
                    return;
                var st = yield getJson(SETTLAR + "/api/embed/session?t=" + t, H(SETTLAR + "/embed/v1"));
                if (!st || !/^http/.test(st.source || ""))
                    return;
                var ph = { "User-Agent": UA_DESKTOP, "Referer": SETTLAR + "/" };
                (st.subtitles || []).forEach(function (s) { if (s.url)
                    ctx.sink.sub(s.label || "Subtitle", s.url, ph); });
                ctx.sink.add({ url: st.source, source: "AniPM", label: label, headers: ph, title: ctx.mediaTitle, type: "m3u8" });
            });
        }
        yield Promise.all(["sub", "dub"].map(function (channel) {
            return __awaiter(this, void 0, void 0, function* () {
                var root = yield getJson(main + "/api/anime/playback-bootstrap/anilist/" + ctx.anime.anilistId + "?ep=" + ctx.anime.episode + "&lang=" + channel + "&backup=1", H());
                if (!root || root.effectiveLanguage !== channel)
                    return;
                var tasks = [settlar(root, channel, channel === "dub" ? "Dub" : "Sub")];
                if (root.backupEmbed && root.backupEmbed.available && /^http/.test(root.backupEmbed.url || "")) {
                    tasks.push(resolveMegaplayFamily(ctx.sink, root.backupEmbed.url, main + "/", "MegaPlay " + channel, "AniPM", ctx.mediaTitle));
                }
                tasks.push((function () {
                    return __awaiter(this, void 0, void 0, function* () {
                        var pk = yield getJson(main + "/api/anime/anipm-server/_packages?anilistId=" + ctx.anime.anilistId, H());
                        var e = pk && pk.episodes && pk.episodes[String(ctx.anime.episode)];
                        if (e && e[channel + "hard"])
                            yield settlar(root, channel + "hard", "Hardsub (" + channel + ")");
                    });
                })());
                yield Promise.all(tasks);
            });
        }));
        // beta server: one master with every audio language
        var beta = yield getJson(main + "/api/anime/beta-server/" + ctx.anime.anilistId, H());
        if (beta && beta.available && (beta.episodes || []).some(function (x) { return parseInt(x, 10) === ctx.anime.episode; }) && beta.path && beta.origin) {
            var wp = beta.path.replace(/^\/watch\//, "");
            var cut = wp.lastIndexOf("-");
            if (cut > 0) {
                var origin = beta.origin.replace(/\/$/, "");
                var epPad = ("0000" + ctx.anime.episode).slice(-4);
                var master = origin + "/hls/" + wp.substring(cut + 1) + "-" + wp.substring(0, cut) + "/E" + epPad + "/master.m3u8";
                var bh = { "User-Agent": UA_DESKTOP, "Referer": origin + "/" };
                for (var a = 0; a < 2; a++) {
                    var r = yield getFull(master, { headers: Object.assign({ "Accept": "*/*" }, bh), timeout: 15000 });
                    if (r && r.status === 200 && /^#EXTM3U/.test(r.text || "")) {
                        ctx.sink.add({ url: master, source: "AniPM", label: "Multi-audio", headers: bh, title: ctx.mediaTitle, type: "m3u8" });
                        break;
                    }
                }
            }
        }
    });
}
// ---------------- AniNami ----------------
function srcAniNami(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = yield raghavDomain("aninami", "https://www.aninami.site");
        var H = { "Accept": "application/json", "Referer": main + "/" };
        var eps = yield getJson(main + "/api/episodes/" + ctx.anime.anilistId, H);
        var provs = eps && eps.results && eps.results.providers;
        if (!provs)
            return;
        var ids = [];
        Object.keys(provs).forEach(function (p) {
            var e = (provs[p] || {}).episodes || {};
            ["sub", "dub"].forEach(function (cat) {
                (e[cat] || []).forEach(function (it) { if (it && it.number === ctx.anime.episode && it.id)
                    ids.push(it.id); });
            });
        });
        yield runLimited(ids.map(function (epId) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    var parts = epId.split("/");
                    if (parts.length < 5 || parts[0] !== "watch")
                        return;
                    var audio = parts[3];
                    var r = yield getJson(main + "/api/watch/" + parts[1] + "/" + parts[2] + "/" + audio + "/" + parts.slice(4).join("/"), H);
                    var streams = r && r.results && r.results.streams;
                    if (!streams)
                        return;
                    for (var i = 0; i < streams.length; i++) {
                        var s = streams[i];
                        if (!s || !s.url)
                            continue;
                        var ref = s.referer || main + "/";
                        var label = (audio === "dub" ? "Dub" : "Sub") + (s.server ? " " + s.server : "");
                        var t = (s.type || "").toLowerCase();
                        if (t === "hls" || t === "mp4" || t === "video")
                            ctx.sink.add({ url: s.url, source: "AniNami", label: label, quality: s.quality, headers: { "Referer": ref }, title: ctx.mediaTitle, type: t === "hls" ? "m3u8" : "mp4" });
                        else
                            yield resolveEmbed(ctx.sink, s.url, ref, label, "AniNami", ctx.mediaTitle);
                    }
                });
            };
        }), 4);
    });
}
// ---------------- VidHawk (AniChan's proxy) ----------------
function srcVidHawk(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var parent = yield raghavDomain("anichan", "https://anichan.to");
        var parentHost = hostOf(parent) || "anichan.to";
        var H = { "User-Agent": UA_MOBILE, "Referer": parent + "/" };
        yield Promise.all(["sub", "dub"].map(function (audio) {
            return __awaiter(this, void 0, void 0, function* () {
                var race = yield getJson("https://vidhawk.buzz/api/stream/race?episode=" + ctx.anime.episode + "&audio=" + audio + "&server=kari&anilistId=" + ctx.anime.anilistId + "&parentHost=" + parentHost, H, 12000);
                if (!race)
                    return;
                var cands = (race.servers || []).filter(function (s) { return s.ticket; });
                if (!cands.length && race.ticket)
                    cands = [{ ticket: race.ticket }];
                var wanted = audio === "dub" ? ["dub", "hin"] : ["sub"];
                for (var i = 0; i < cands.length; i++) {
                    var play = yield getJson("https://vidhawk.buzz/api/play?t=" + encodeURIComponent(cands[i].ticket), H, 10000);
                    ((play && play.tracks) || []).forEach(function (t) {
                        var id = (t.id || "").toLowerCase();
                        if (wanted.indexOf(id) < 0 || !/^http/.test(t.src || ""))
                            return;
                        ctx.sink.add({ url: t.src, source: "VidHawk " + (cands[i].label || cands[i].id || ""), label: id === "hin" ? "Hindi" : id === "dub" ? "Dub" : "Sub", headers: H, title: ctx.mediaTitle, type: "m3u8" });
                    });
                }
            });
        }));
    });
}
// ---------------- Kyren ----------------
function srcKyren(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = "https://kyren.moe";
        var H = { "User-Agent": UA_MOBILE, "Accept": "application/json", "Referer": main + "/" };
        var jobs = [];
        ["sub", "dub"].forEach(function (lang) { ["megaplay", "megaplay-direct", "tryembed"].forEach(function (server) { jobs.push([lang, server]); }); });
        yield runLimited(jobs.map(function (j) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    var r = yield getJson(main + "/api/stream/" + ctx.anime.anilistId + "/" + ctx.anime.episode + "?lang=" + j[0] + "&title=" + encodeURIComponent(ctx.anime.title || "") + "&server=" + j[1], H);
                    if (!r || r.ok !== true)
                        return;
                    var srcs = r.sources || [];
                    for (var i = 0; i < srcs.length; i++) {
                        var s = srcs[i];
                        if (!s.url)
                            continue;
                        var label = (s.isDub || s.language === "dub" ? "Dub" : "Sub");
                        if (s.type === "hls")
                            ctx.sink.add({ url: s.url, source: "Kyren " + (s.provider || j[1]), label: label, quality: s.quality, headers: { "User-Agent": UA_MOBILE, "Referer": main + "/" }, title: ctx.mediaTitle, type: "m3u8" });
                        else
                            yield resolveEmbed(ctx.sink, s.url, main + "/", label, "Kyren " + (s.provider || j[1]), ctx.mediaTitle);
                    }
                    (r.subtitles || []).forEach(function (s) { if (s.url)
                        ctx.sink.sub(s.label || s.lang || "English", s.url); });
                });
            };
        }), 3);
    });
}
// ---------------- Re:ANIME (FlixCloud MKV with both audios) ----------------
function srcReAnime(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = yield raghavDomain("reanime", "https://reanime.to");
        var r = yield getJson(main + "/api/flix/" + ctx.anime.anilistId + "/" + ctx.anime.episode, { "User-Agent": UA_MOBILE, "Accept": "application/json", "Referer": main + "/watch/" });
        var seen = {};
        var embeds = ((r && r.servers) || []).map(function (s) { return s.dataLink; }).filter(function (u) {
            var id = u && (/\/e\/([a-z0-9]+)/i.exec(u) || [])[1];
            if (!id || seen[id])
                return false;
            seen[id] = true;
            return true;
        });
        yield Promise.all(embeds.map(function (u) {
            return __awaiter(this, void 0, void 0, function* () {
                var f = yield flixcloudResolve(u);
                if (f)
                    ctx.sink.add({ url: f.url, source: "Re:ANIME", label: "Sub & Dub (MKV)", quality: f.quality, size: f.size, headers: f.headers, title: ctx.mediaTitle, type: "mkv" });
            });
        }));
    });
}
// ---------------- Anv ----------------
var anvCookie = null;
function srcAnv(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = "https://anv.to", page = "https://anv.to/anime/one-piece-odmau-episode-1";
        var base = { "User-Agent": UA_DESKTOP.replace("131.0.0.0", "155.0.0.0"), "Accept-Language": "en-US,en;q=0.9" };
        if (!anvCookie) {
            var res = yield getFull(page, { headers: base, timeout: 12000 });
            var sc = res && headerGet(res.headers, "set-cookie");
            var m = sc && /shiro_watch=([^;]+)/.exec(sc);
            if (m)
                anvCookie = "shiro_watch=" + m[1].trim();
        }
        if (!anvCookie)
            return;
        var r = yield postJson(main + "/api/episode", { anilistId: ctx.anime.anilistId, malId: null, episode: ctx.anime.episode }, Object.assign({}, base, { "Origin": main, "Referer": main + "/", "Cookie": anvCookie }));
        if (!r || r.status !== "ready")
            return;
        var playH = Object.assign({}, base, { "Cookie": anvCookie, "Referer": page });
        (r.variants || []).forEach(function (v) {
            if (v.id !== "sub" && v.id !== "dub")
                return;
            (v.sources || []).forEach(function (s) {
                if (!s.url)
                    return;
                var u = /^http/.test(s.url) ? s.url : main + s.url;
                ctx.sink.add({ url: u, source: "Anv", label: (v.id === "dub" ? "Dub" : "Sub") + " " + (s.label || ""), headers: playH, title: ctx.mediaTitle, type: "m3u8" });
                (s.tracks || []).forEach(function (t) { if (t.src)
                    ctx.sink.sub(t.label || t.language || "English", /^http/.test(t.src) ? t.src : main + t.src, playH); });
            });
        });
    });
}
// ---------------- AniKoto (HTML site) ----------------
function anikotoResult(json) {
    var j = parseJsonSafe(json);
    return j && j.status === 200 ? j.result : null;
}
var ANIKOTO_HOST_MAP = [["vibeplayer.site", "nanobyte.bigdreamsmalldih.site"]];
for (var _ak = 1; _ak <= 16; _ak++)
    ANIKOTO_HOST_MAP.push(["vault-" + pad2(_ak) + ".uwucdn.top", "uwu" + _ak + ".bigdreamsmalldih.site"]);
ANIKOTO_HOST_MAP.push(["vault-99.uwucdn.top", "uwu17.bigdreamsmalldih.site"]);
for (var _ao = 10; _ao <= 16; _ao++)
    ANIKOTO_HOST_MAP.push(["vault-" + _ao + ".owocdn.top", _ao + ".bigdreamsmalldih.site"]);
ANIKOTO_HOST_MAP.push(["vault-99.owocdn.top", "99.bigdreamsmalldih.site"]);
function srcAniKoto(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var main = yield raghavDomain("anikoto", "https://anikototv.to");
        var bh = { "User-Agent": UA_MOBILE, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
        var target = null;
        var queries = [ctx.anime.title, ctx.anime.romaji].filter(Boolean);
        for (var qi = 0; qi < queries.length && !target; qi++) {
            var html = yield getText(main + "/filter?keyword=" + encodeURIComponent(queries[qi]), bh);
            if (!html)
                continue;
            var re = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/a>|<a[^>]+class="[^"]*\bname\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, m;
            var best = 0;
            while ((m = re.exec(html))) {
                var href = m[1] || m[3], name = stripTags(m[2] || m[4]);
                var sc = 0;
                ctx.anime.titles.forEach(function (t) { sc = Math.max(sc, titleSimilarity(name, t)); });
                if (sc > best && sc >= 0.75) {
                    best = sc;
                    target = absUrl(href, main);
                }
            }
        }
        if (!target)
            return;
        var page = yield getText(target, bh);
        var animeId = page && ((/id="watch-main"[^>]*data-id="(\d+)"/.exec(page) || /data-id=["'](\d+)["']/.exec(page)) || [])[1];
        if (!animeId)
            return;
        var ajax = { "User-Agent": UA_MOBILE, "X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*; q=0.01", "Referer": target };
        var listHtml = anikotoResult(yield getText(main + "/ajax/episode/list/" + animeId, ajax));
        if (!listHtml)
            return;
        var epRe = /<a([^>]*data-ids="[^"]*"[^>]*)>/g, em, ids = null;
        while ((em = epRe.exec(listHtml))) {
            var attrs = em[1];
            if (parseInt((/data-num="(\d+)"/.exec(attrs) || [])[1], 10) === ctx.anime.episode) {
                ids = decodeHtml((/data-ids="([^"]*)"/.exec(attrs) || [])[1]);
                break;
            }
        }
        if (!ids)
            return;
        var serverHtml = anikotoResult(yield getText(main + "/ajax/server/list?servers=" + encodeURIComponent(ids), ajax));
        if (!serverHtml)
            return;
        var jobs = [];
        var blocks = serverHtml.split(/<div[^>]+class="type"/);
        blocks.forEach(function (blk) {
            var type = (/data-type="(\w+)"/.exec(blk) || [])[1];
            if (!type)
                return;
            var li = /<li[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g, lm;
            while ((lm = li.exec(blk)))
                jobs.push({ type: type, id: lm[1], name: stripTags(lm[2]) || "Server" });
        });
        yield runLimited(jobs.map(function (j) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    var r = parseJsonSafe(yield getText(main + "/ajax/server?get=" + encodeURIComponent(j.id), ajax));
                    var url = r && r.status === 200 && r.result && r.result.url;
                    if (!url)
                        return;
                    if (url.indexOf("//") === 0)
                        url = "https:" + url;
                    else if (url.charAt(0) === "/")
                        url = main + url;
                    var label = j.type === "dub" ? "Dub" : j.type === "hsub" ? "Hardsub" : "Sub";
                    var hash = url.split("#")[1];
                    if (hash) {
                        try {
                            var dec = b64decodeString(hash.split("#")[0]);
                            ANIKOTO_HOST_MAP.forEach(function (p) { dec = dec.split(p[0]).join(p[1]); });
                            if (/^http/.test(dec) && dec.indexOf(".m3u8") >= 0) {
                                ctx.sink.add({ url: dec, source: "AniKoto " + j.name, label: label, headers: { "Referer": url, "Origin": "https://mewcdn.online" }, title: ctx.mediaTitle, type: "m3u8" });
                                return;
                            }
                        }
                        catch (e) { }
                    }
                    yield resolveEmbed(ctx.sink, url, target, label, "AniKoto " + j.name, ctx.mediaTitle);
                });
            };
        }), 4);
    });
}
var RAGHAV_SOURCES = [
    ["Miruro", srcMiruro], ["AniKage", srcAniKage], ["Anidap", srcAnidap], ["AniPM", srcAniPM],
    ["AniNami", srcAniNami], ["VidHawk", srcVidHawk], ["Kyren", srcKyren], ["ReAnime", srcReAnime],
    ["Anv", srcAnv], ["AniKoto", srcAniKoto]
];
function raghavAnimeStreams(tmdbId, mediaType, season, episode, pluginName, providerId, preferKitsu) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = yield getTmdbMedia(tmdbId, mediaType, season, episode);
        if (!info)
            return [];
        var anime = yield resolveAnime(info);
        if (!anime) {
            raLog("no AniList mapping for", info.title);
            return [];
        }
        if (preferKitsu && anime.kitsuId) {
            // Kitsu catalog flavour: use Kitsu's canonical/English titles for the title-matched sources
            var k = yield getJson("https://kitsu.io/api/edge/anime/" + anime.kitsuId, { "Accept": "application/vnd.api+json" }, 8000);
            var at = k && k.data && k.data.attributes;
            if (at) {
                var t = at.titles || {};
                anime.titles = [at.canonicalTitle, t.en, t.en_jp, t.ja_jp].concat(anime.titles).filter(Boolean);
                if (t.en_jp)
                    anime.romaji = t.en_jp;
            }
        }
        var sink = new StreamSink(pluginName, providerId);
        var ctx = { info: info, anime: anime, sink: sink, mediaTitle: mediaLabel(info) + (info.isTv ? " · Ep " + anime.episode : "") };
        yield withTimeout(runLimited(RAGHAV_SOURCES.map(function (s) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield withTimeout(s[1](ctx), 40000, null);
                    }
                    catch (e) {
                        raLog(s[0], "failed", e && e.message);
                    }
                });
            };
        }), 5), 75000, null);
        return sink.result();
    });
}
// ---- lib/streamplay.js ----
// StreamPlay sources — ported from phisher98's StreamPlay (decompiled build 694).
// Movie/TV: Vidlink, Vidrock, VidEasy, XPass, DahmerMovies, Vadapav, KissKH, OpenSubtitles (subs).
// Anime: Miruro, AniKage, AniKoto, Anidap, Ani.pm, Kyren, ReAnime, AniNami (shared with RaghavAnime engine).
var spLog = makeLog("StreamPlay");
var ENC_DEC = "https://enc-dec.app/api";
// ---------------- Vidlink ----------------
function spVidlink(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info;
        var e = yield getJson(ENC_DEC + "/enc-vidlink?text=" + info.tmdbId, { "User-Agent": UA_DESKTOP });
        var enc = e && e.result;
        if (!enc)
            return;
        var url = info.isTv ? "https://vidlink.pro/api/b/tv/" + enc + "/" + info.season + "/" + info.episode : "https://vidlink.pro/api/b/movie/" + enc;
        var ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
        var d = yield getJson(url, { "User-Agent": ua, "Connection": "keep-alive", "Referer": "https://vidlink.pro/", "Origin": "https://vidlink.pro" });
        var st = d && d.stream;
        if (!st)
            return;
        var vh = { "Referer": "https://vidlink.pro/", "Origin": "https://vidlink.pro", "User-Agent": ua };
        var q = st.qualities || {};
        Object.keys(q).forEach(function (k) { if (q[k] && q[k].url)
            ctx.sink.add({ url: q[k].url, source: "Vidlink", quality: k, headers: vh, title: ctx.mediaTitle }); });
        if (st.playlist)
            ctx.sink.add({ url: st.playlist, source: "Vidlink", label: "HLS", headers: vh, title: ctx.mediaTitle, type: "m3u8" });
        (st.captions || []).forEach(function (c) { if (c.url)
            ctx.sink.sub(c.language || "Unknown", c.url); });
    });
}
// ---------------- Vidrock ----------------
var VIDROCK_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
function decryptVidrock(payload) {
    try {
        var raw = b64ToBytes(payload);
        if (raw.length <= 28)
            return null;
        var iv = raw.subarray(0, 12);
        var ct = raw.subarray(12, raw.length - 16); // strip GCM tag
        return utf8Decode(aesGcmDecrypt(ct, hexToBytes(VIDROCK_KEY), iv));
    }
    catch (e) {
        return null;
    }
}
function spVidrock(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info;
        var api = info.isTv ? "https://vidrock.ru/api/tv/" + info.tmdbId + "/" + info.season + "/" + info.episode + "/" : "https://vidrock.ru/api/movie/" + info.tmdbId + "/";
        var h = { "Origin": "https://vidrock.ru", "Referer": "https://vidrock.ru/", "User-Agent": UA_DESKTOP };
        var j = yield getJson(api, h);
        if (!j || typeof j !== "object")
            return;
        Object.keys(j).forEach(function (name) {
            var sd = j[name];
            var enc = sd && sd.url;
            if (!enc || enc === "error" || enc === "null")
                return;
            var u = decryptVidrock(enc);
            if (u && /^https?:\/\//.test(u))
                ctx.sink.add({ url: u, source: "Vidrock", label: name, headers: h, title: ctx.mediaTitle, type: u.indexOf("m3u8") >= 0 ? "m3u8" : undefined });
        });
    });
}
// ---------------- VidEasy (with the local "Vidy" stream cipher) ----------------
var GOLD = -1640531527;
function vidyMix(e) {
    var v = Math.imul(-2048144789, (e >>> 16) ^ e) >>> 0;
    var v2 = Math.imul(-1028477387, (v >>> 13) ^ v) >>> 0;
    return ((v2 >>> 16) ^ v2) >>> 0;
}
function vidyFnv(str) {
    var t = -2128831035 >>> 0;
    for (var i = 0; i < str.length; i++)
        t = Math.imul((str.charCodeAt(i) ^ t) >>> 0, 16777619) >>> 0;
    return vidyMix(t);
}
function vidyRot(e, t) { var s = t & 31; return s === 0 ? e >>> 0 : ((e << s) | (e >>> (32 - s))) >>> 0; }
function vidyInit(seed, tmdbId) {
    var s = new Uint32Array(61), isSet = new Array(61).fill(false);
    var r = vidyMix((vidyFnv(seed) ^ vidyMix(((tmdbId >>> 0) ^ GOLD) >>> 0)) >>> 0);
    for (var e = 0; e < 8; e++) {
        var t = r % 61;
        var r2 = vidyRot((r + GOLD) >>> 0, (e & 7) + 7);
        s[t] = (vidyMix(r2) ^ r2) >>> 0;
        isSet[t] = true;
        r = vidyMix((t + r2) >>> 0);
    }
    return { s: s, isSet: isSet, acc: vidyMix(((-1515870811) ^ r) >>> 0) };
}
function vidyNext(st, t) {
    var n = st.acc, i = n % 61;
    var oVal = st.isSet[i] ? 0xffffffff : 0;
    var d = st.isSet[i] ? st.s[i] : 0;
    var c = Math.imul((t + 1) >>> 0, GOLD) >>> 0;
    var sVal = (d ^ c) >>> 0;
    var h = ((n ^ sVal) | ((n & sVal) & oVal)) >>> 0;
    var term1 = vidyRot((h + n) >>> 0, i & 31);
    var term2 = vidyRot(n, (i * 7) & 31);
    var n2 = vidyMix(((term1 ^ term2) + GOLD) >>> 0);
    st.s[i] = n2;
    st.isSet[i] = true;
    st.acc = n2;
    return n2;
}
function decryptVidy(cipherB64, seed, tmdbId) {
    try {
        var bytes = b64ToBytes(cipherB64);
        if (bytes.length <= 4)
            return null;
        var st = vidyInit(seed, tmdbId), w = 0, ks = new Uint8Array(bytes.length);
        for (var bi = 0; bi < bytes.length;) {
            var word = vidyNext(st, w++);
            for (var k = 0; k < 4 && bi < bytes.length; k++)
                ks[bi++] = (word >>> (8 * k)) & 255;
        }
        var out = new Uint8Array(bytes.length);
        for (var i = 0; i < bytes.length; i++)
            out[i] = bytes[i] ^ ks[i];
        if (out[0] !== 109 || out[1] !== 118 || out[2] !== 109 || out[3] !== 49)
            return null; // "mvm1"
        return utf8Decode(out.subarray(4));
    }
    catch (e) {
        return null;
    }
}
var VIDEASY_SERVERS = [
    ["Yoru", "cdn"], ["Cypher", "downloader2"], ["Breach", "m4uhd"], ["Neon", "vsrc"],
    ["Vyse", "hdmovie", "English"], ["Killjoy", "meine", null, "language=german"], ["Fade", "hdmovie", "Hindi"],
    ["Omen", "lamovie"], ["Raze", "superflix"]
];
function spVideasy(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info;
        var api = "https://api.speedracelight.com";
        var h = { "Accept": "*/*", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36", "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/" };
        var sj = yield getJson(api + "/seed?mediaId=" + info.tmdbId, h);
        var seed = sj && sj.seed != null ? String(sj.seed) : null;
        if (!seed)
            return;
        var q = function (s) { return encodeURIComponent(s).replace(/\+/g, "%20"); };
        var encTitle = q(q(info.title));
        var tmdbNum = parseInt(info.tmdbId, 10);
        yield runLimited(VIDEASY_SERVERS.map(function (sv) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    var url = api + "/" + sv[1] + "/sources-with-title?title=" + encTitle + "&mediaType=" + (info.isTv ? "tv" : "movie") + "&year=" + (info.year || "") + "&tmdbId=" + info.tmdbId +
                        (info.isTv ? "&episodeId=" + info.episode + "&seasonId=" + info.season : "") + "&imdbId=" + (info.imdbId || "") + "&enc=2&seed=" + encodeURIComponent(seed) + (sv[3] ? "&" + sv[3] : "");
                    var enc = yield getText(url, h);
                    enc = enc ? enc.trim() : "";
                    if (!enc || enc.charAt(0) === "{")
                        return;
                    var parsed = parseJsonSafe(decryptVidy(enc, seed, tmdbNum));
                    if (!parsed) {
                        var r = yield postJson(ENC_DEC + "/dec-videasy", { text: enc, id: tmdbNum, seed: seed });
                        parsed = r && (r.result && typeof r.result === "object" ? r.result : r);
                    }
                    if (!parsed)
                        return;
                    (parsed.sources || []).forEach(function (s) {
                        if (!s || !s.url)
                            return;
                        var ql = s.quality || "Unknown";
                        if (sv[2] && String(ql).toLowerCase().indexOf(sv[2].toLowerCase()) < 0)
                            return;
                        ctx.sink.add({ url: s.url, source: "VidEasy " + sv[0], label: ql, quality: ql, headers: { "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/", "User-Agent": h["User-Agent"] }, title: ctx.mediaTitle });
                    });
                    (parsed.subtitles || []).forEach(function (s) { if (s && s.url)
                        ctx.sink.sub(s.label || s.display || s.language || s.lang, s.url); });
                });
            };
        }), 4);
    });
}
// ---------------- XPass ----------------
function xpassServers(dataUrl, referer) {
    return __awaiter(this, void 0, void 0, function* () {
        var path = dataUrl.split("?")[0];
        var token = (/token=([^&]+)/.exec(dataUrl) || [])[1] || "";
        var key = sha256Bytes("spv3-data-response|spv3-build-1787821613-50e5fc97c9dce367|" + path + "|" + token);
        var full = /^http/.test(dataUrl) ? dataUrl : "https://play.xpass.top" + dataUrl;
        var t = yield getText(full, { "User-Agent": UA_DESKTOP, "Referer": referer, "Origin": "https://play.xpass.top" });
        if (!t)
            return [];
        var raw = b64ToBytes(t.trim());
        if (raw.length <= 28)
            return [];
        var plain = utf8Decode(aesGcmDecrypt(raw.subarray(12, raw.length - 16), key, raw.subarray(0, 12)));
        var j = parseJsonSafe(plain);
        return Array.isArray(j) ? j : [];
    });
}
function spXpass(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info;
        var embed = info.isTv ? "https://play.xpass.top/e/tv/" + info.tmdbId + "/" + info.season + "/" + info.episode + "?autostart=true" : "https://play.xpass.top/e/movie/" + info.tmdbId + "?autostart=true";
        var html = yield getText(embed, { "Referer": "https://streamsrcs.2embed.cc/", "User-Agent": UA_DESKTOP });
        if (!html)
            return;
        var servers = [];
        var dm = /var dataUrl\s*=\s*"([^"]+)"/.exec(html);
        if (dm)
            servers = yield xpassServers(dm[1], embed);
        if (!servers.length) {
            // backup buttons embedded in the page
            var re = /data-(?:url|src)="([^"]+)"[^>]*>([^<]{1,40})</g, m;
            while ((m = re.exec(html)))
                servers.push({ url: m[1], name: m[2].trim() });
        }
        yield runLimited(servers.map(function (s) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    if (!s || !s.url)
                        return;
                    var full = /^http/.test(s.url) ? s.url : "https://play.xpass.top" + s.url;
                    var pl = yield getJson(full, { "Referer": embed, "Origin": "https://play.xpass.top", "Accept": "application/json,*/*" });
                    var item = pl && pl.playlist && pl.playlist[0];
                    ((item && item.sources) || []).forEach(function (src) {
                        if (!src.file)
                            return;
                        var file = /^http/.test(src.file) ? src.file : "https://play.xpass.top" + src.file;
                        ctx.sink.add({ url: file, source: "XPass " + (s.name || "Server"), headers: { "Referer": "https://play.xpass.top/" }, title: ctx.mediaTitle, type: /hls/i.test(src.type || "") || file.indexOf(".m3u8") >= 0 ? "m3u8" : undefined });
                    });
                });
            };
        }), 4);
    });
}
// ---------------- DahmerMovies (open directory) ----------------
function spDahmer(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info, base = "https://a.111477.xyz";
        var url = info.isTv ? base + "/tvs/" + encodeURIComponent(info.title.replace(/:/g, " -")) + "/Season " + info.season + "/" : base + "/movies/" + encodeURIComponent(info.title.replace(/:/g, "")) + " (" + info.year + ")/";
        url = url.replace(/ /g, "%20");
        var html = yield getText(url, { "User-Agent": UA_DESKTOP }, 20000);
        if (!html)
            return;
        var re = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g, m, picks = [];
        var epRe = info.isTv ? new RegExp("S" + pad2(info.season) + "E" + pad2(info.episode), "i") : /(1080p|2160p)/i;
        while ((m = re.exec(html))) {
            if (epRe.test(m[2]) && /\.(mkv|mp4|avi)$/i.test(m[2].trim()))
                picks.push([m[2].trim(), m[1]]);
        }
        picks.forEach(function (p) {
            var href = p[1].indexOf(base) >= 0 ? p[1] : (/^https?:/.test(p[1]) ? p[1] : (p[1].charAt(0) === "/" ? base + p[1] : url + p[1]));
            var tags = [];
            if (/hevc|x265|h265/i.test(p[0]))
                tags.push("HEVC");
            if (/\bhdr|dv\b|dolby.?vision/i.test(p[0]))
                tags.push("HDR");
            if (/remux/i.test(p[0]))
                tags.push("REMUX");
            ctx.sink.add({ url: href, source: "DahmerMovies", label: tags.join(" ") || qualityFrom(p[0]), quality: p[0], title: ctx.mediaTitle + "\n" + decodeHtml(p[0]) });
        });
    });
}
// ---------------- Vadapav (stremio addon) ----------------
function spVadapav(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info;
        if (!info.imdbId)
            return;
        var ep = info.isTv ? "https://stremio.vadapav.mov/stream/series/" + info.imdbId + ":" + info.season + ":" + info.episode + ".json" : "https://stremio.vadapav.mov/stream/movie/" + info.imdbId + ".json";
        var j = yield getJson(ep, { "User-Agent": UA_DESKTOP, "Accept": "application/json, text/plain, */*" });
        ((j && j.streams) || []).forEach(function (s) {
            if (!s.url || !/^http/.test(s.url))
                return;
            var t = String(s.title || s.name || "").split("\n")[0].trim();
            ctx.sink.add({ url: s.url, source: "Vadapav", label: (/(2160p|1080p|720p|480p)/i.exec(t) || [""])[0], quality: t, headers: { "Referer": "https://vadapav.mov/" }, title: ctx.mediaTitle + (t ? "\n" + t : "") });
        });
    });
}
// ---------------- KissKH (Asian drama) ----------------
function spKisskh(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info, base = "https://kisskh.is";
        var titles = [info.title, info.originalTitle].filter(Boolean);
        var drama = null;
        for (var i = 0; i < titles.length && !drama; i++) {
            var res = yield getJson(base + "/api/DramaList/Search?q=" + encodeURIComponent(titles[i]) + "&type=" + (info.isTv ? "1" : "2"), { "Referer": base + "/" });
            if (!res || !res.length)
                continue;
            var cand = res.filter(function (r) {
                if (!r.title)
                    return false;
                if (info.isTv && info.season > 1)
                    return new RegExp("Season " + info.season + "\\b", "i").test(r.title) && titleSimilarity(r.title.replace(/Season \d+/i, ""), titles[i]) >= 0.6;
                return titleSimilarity(r.title.replace(/\(\d{4}\)/, ""), titles[i]) >= 0.75;
            });
            drama = cand[0] || null;
        }
        if (!drama)
            return;
        var slug = String(drama.title).replace(/[^a-zA-Z0-9]+/g, "-");
        var det = yield getJson(base + "/api/DramaList/Drama/" + drama.id + "?isq=false", { "Referer": base + "/Drama/" + slug + "?id=" + drama.id });
        var eps = (det && det.episodes) || [];
        var ep = info.isTv ? eps.filter(function (e) { return e.number === info.episode; })[0] : eps[0];
        if (!ep)
            return;
        var k = yield getJson("https://script.google.com/macros/s/AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA/exec?id=" + ep.id + "&version=2.8.10", null, 10000);
        if (!k || !k.key)
            return;
        var src = yield getJson(base + "/api/DramaList/Episode/" + ep.id + ".png?err=false&ts=&time=&kkey=" + k.key, { "Referer": base + "/Drama/" + slug + "/Episode-" + ep.number + "?id=" + drama.id + "&ep=" + ep.id + "&page=0&pageSize=100" });
        if (!src)
            return;
        [src.video, src.thirdParty].forEach(function (link) {
            if (!link)
                return;
            if (link.indexOf("//") === 0)
                link = "https:" + link;
            if (/\.m3u8|\.mp4/.test(link))
                ctx.sink.add({ url: link, source: "KissKH", headers: { "Origin": base, "Referer": base + "/" }, title: ctx.mediaTitle });
            else
                return resolveEmbed(ctx.sink, link, base + "/", "", "KissKH", ctx.mediaTitle);
        });
        var sk = yield getJson("https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=" + ep.id + "&version=2.8.10", null, 10000);
        if (sk && sk.key) {
            var subs = yield getJson(base + "/api/Sub/" + ep.id + "?kkey=" + sk.key, null);
            (subs || []).forEach(function (s) { if (s.src && /\.(srt|vtt)(\?|$)/i.test(s.src))
                ctx.sink.sub(s.label, s.src); });
        }
    });
}
// ---------------- OpenSubtitles v3 (subtitles only) ----------------
function spSubtitles(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = ctx.info;
        if (!info.imdbId)
            return;
        var url = info.isTv ? "https://opensubtitles-v3.strem.io/subtitles/series/" + info.imdbId + ":" + info.season + ":" + info.episode + ".json" : "https://opensubtitles-v3.strem.io/subtitles/movie/" + info.imdbId + ".json";
        var j = yield getJson(url, { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" });
        var seen = {};
        ((j && j.subtitles) || []).forEach(function (s) {
            if (!s.url)
                return;
            var lang = s.lang || "Unknown";
            seen[lang] = (seen[lang] || 0) + 1;
            if (seen[lang] <= 3)
                ctx.sink.sub(lang, s.url);
        });
    });
}
var SP_MOVIE_SOURCES = [
    ["Vidlink", spVidlink], ["Vidrock", spVidrock], ["VidEasy", spVideasy], ["XPass", spXpass],
    ["DahmerMovies", spDahmer], ["Vadapav", spVadapav], ["OpenSubtitles", spSubtitles]
];
var SP_ANIME_SOURCES = [
    ["Miruro", srcMiruro], ["AniKage", srcAniKage], ["AniKoto", srcAniKoto], ["Anidap", srcAnidap],
    ["AniPM", srcAniPM], ["Kyren", srcKyren], ["ReAnime", srcReAnime], ["AniNami", srcAniNami]
];
function streamPlayStreams(tmdbId, mediaType, season, episode) {
    return __awaiter(this, void 0, void 0, function* () {
        var info = yield getTmdbMedia(tmdbId, mediaType, season, episode);
        if (!info)
            return [];
        var sink = new StreamSink("StreamPlay", "streamplay");
        var ctx = { info: info, sink: sink, mediaTitle: mediaLabel(info) };
        var tasks = SP_MOVIE_SOURCES.slice();
        var asian = ["ko", "zh", "cn", "th", "tl"].indexOf(info.lang) >= 0 || (info.lang === "ja" && !info.isAnime);
        if (asian)
            tasks.push(["KissKH", spKisskh]);
        if (info.isAnime) {
            var anime = yield resolveAnime(info);
            if (anime) {
                var actx = { info: info, anime: anime, sink: sink, mediaTitle: ctx.mediaTitle + (info.isTv ? " · Ep " + anime.episode : "") };
                SP_ANIME_SOURCES.forEach(function (s) { tasks.push([s[0], function () { return s[1](actx); }]); });
            }
            tasks.push(["KissKH", spKisskh]);
        }
        yield withTimeout(runLimited(tasks.map(function (t) {
            return function () {
                return __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield withTimeout(t[1](ctx), 40000, null);
                    }
                    catch (e) {
                        spLog(t[0], "failed", e && e.message);
                    }
                });
            };
        }), 6), 75000, null);
        return sink.result();
    });
}
// ---- providers/streamplay.js ----
// @libs core,crypto,inflate,tmdb,hls,anime,embeds,raghav_anime,streamplay
// StreamPlay — port of phisher98's StreamPlay multi-source aggregator (movies, TV, anime, Asian drama).
function getStreams(tmdbId, mediaType, season, episode) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield streamPlayStreams(tmdbId, mediaType, season, episode);
        }
        catch (e) {
            console.log("[StreamPlay] error", e && e.message);
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
