// StreamPlay sources — ported from phisher98's StreamPlay (decompiled build 694).
// Movie/TV: Vidlink, Vidrock, VidEasy, XPass, DahmerMovies, Vadapav, KissKH, OpenSubtitles (subs).
// Anime: Miruro, AniKage, AniKoto, Anidap, Ani.pm, Kyren, ReAnime, AniNami (shared with RaghavAnime engine).

var spLog = makeLog("StreamPlay");
var ENC_DEC = "https://enc-dec.app/api";

// ---------------- Vidlink ----------------
async function spVidlink(ctx) {
  var info = ctx.info;
  var e = await getJson(ENC_DEC + "/enc-vidlink?text=" + info.tmdbId, { "User-Agent": UA_DESKTOP });
  var enc = e && e.result;
  if (!enc) return;
  var url = info.isTv ? "https://vidlink.pro/api/b/tv/" + enc + "/" + info.season + "/" + info.episode : "https://vidlink.pro/api/b/movie/" + enc;
  var ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
  var d = await getJson(url, { "User-Agent": ua, "Connection": "keep-alive", "Referer": "https://vidlink.pro/", "Origin": "https://vidlink.pro" });
  var st = d && d.stream;
  if (!st) return;
  var vh = { "Referer": "https://vidlink.pro/", "Origin": "https://vidlink.pro", "User-Agent": ua };
  var q = st.qualities || {};
  Object.keys(q).forEach(function (k) { if (q[k] && q[k].url) ctx.sink.add({ url: q[k].url, source: "Vidlink", quality: k, headers: vh, title: ctx.mediaTitle }); });
  if (st.playlist) ctx.sink.add({ url: st.playlist, source: "Vidlink", label: "HLS", headers: vh, title: ctx.mediaTitle, type: "m3u8" });
  (st.captions || []).forEach(function (c) { if (c.url) ctx.sink.sub(c.language || "Unknown", c.url); });
}

// ---------------- Vidrock ----------------
var VIDROCK_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
function decryptVidrock(payload) {
  try {
    var raw = b64ToBytes(payload);
    if (raw.length <= 28) return null;
    var iv = raw.subarray(0, 12);
    var ct = raw.subarray(12, raw.length - 16); // strip GCM tag
    return utf8Decode(aesGcmDecrypt(ct, hexToBytes(VIDROCK_KEY), iv));
  } catch (e) { return null; }
}

async function spVidrock(ctx) {
  var info = ctx.info;
  var api = info.isTv ? "https://vidrock.ru/api/tv/" + info.tmdbId + "/" + info.season + "/" + info.episode + "/" : "https://vidrock.ru/api/movie/" + info.tmdbId + "/";
  var h = { "Origin": "https://vidrock.ru", "Referer": "https://vidrock.ru/", "User-Agent": UA_DESKTOP };
  var j = await getJson(api, h);
  if (!j || typeof j !== "object") return;
  Object.keys(j).forEach(function (name) {
    var sd = j[name];
    var enc = sd && sd.url;
    if (!enc || enc === "error" || enc === "null") return;
    var u = decryptVidrock(enc);
    if (u && /^https?:\/\//.test(u)) ctx.sink.add({ url: u, source: "Vidrock", label: name, headers: h, title: ctx.mediaTitle, type: u.indexOf("m3u8") >= 0 ? "m3u8" : undefined });
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
  for (var i = 0; i < str.length; i++) t = Math.imul((str.charCodeAt(i) ^ t) >>> 0, 16777619) >>> 0;
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
  st.s[i] = n2; st.isSet[i] = true; st.acc = n2;
  return n2;
}
function decryptVidy(cipherB64, seed, tmdbId) {
  try {
    var bytes = b64ToBytes(cipherB64);
    if (bytes.length <= 4) return null;
    var st = vidyInit(seed, tmdbId), w = 0, ks = new Uint8Array(bytes.length);
    for (var bi = 0; bi < bytes.length;) {
      var word = vidyNext(st, w++);
      for (var k = 0; k < 4 && bi < bytes.length; k++) ks[bi++] = (word >>> (8 * k)) & 255;
    }
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ ks[i];
    if (out[0] !== 109 || out[1] !== 118 || out[2] !== 109 || out[3] !== 49) return null; // "mvm1"
    return utf8Decode(out.subarray(4));
  } catch (e) { return null; }
}

var VIDEASY_SERVERS = [
  ["Yoru", "cdn"], ["Cypher", "downloader2"], ["Breach", "m4uhd"], ["Neon", "vsrc"],
  ["Vyse", "hdmovie", "English"], ["Killjoy", "meine", null, "language=german"], ["Fade", "hdmovie", "Hindi"],
  ["Omen", "lamovie"], ["Raze", "superflix"]
];

async function spVideasy(ctx) {
  var info = ctx.info;
  var api = "https://api.speedracelight.com";
  var h = { "Accept": "*/*", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36", "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/" };
  var sj = await getJson(api + "/seed?mediaId=" + info.tmdbId, h);
  var seed = sj && sj.seed != null ? String(sj.seed) : null;
  if (!seed) return;
  var q = function (s) { return encodeURIComponent(s).replace(/\+/g, "%20"); };
  var encTitle = q(q(info.title));
  var tmdbNum = parseInt(info.tmdbId, 10);
  await runLimited(VIDEASY_SERVERS.map(function (sv) {
    return async function () {
      var url = api + "/" + sv[1] + "/sources-with-title?title=" + encTitle + "&mediaType=" + (info.isTv ? "tv" : "movie") + "&year=" + (info.year || "") + "&tmdbId=" + info.tmdbId +
        (info.isTv ? "&episodeId=" + info.episode + "&seasonId=" + info.season : "") + "&imdbId=" + (info.imdbId || "") + "&enc=2&seed=" + encodeURIComponent(seed) + (sv[3] ? "&" + sv[3] : "");
      var enc = await getText(url, h);
      enc = enc ? enc.trim() : "";
      if (!enc || enc.charAt(0) === "{") return;
      var parsed = parseJsonSafe(decryptVidy(enc, seed, tmdbNum));
      if (!parsed) {
        var r = await postJson(ENC_DEC + "/dec-videasy", { text: enc, id: tmdbNum, seed: seed });
        parsed = r && (r.result && typeof r.result === "object" ? r.result : r);
      }
      if (!parsed) return;
      (parsed.sources || []).forEach(function (s) {
        if (!s || !s.url) return;
        var ql = s.quality || "Unknown";
        if (sv[2] && String(ql).toLowerCase().indexOf(sv[2].toLowerCase()) < 0) return;
        ctx.sink.add({ url: s.url, source: "VidEasy " + sv[0], label: ql, quality: ql, headers: { "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/", "User-Agent": h["User-Agent"] }, title: ctx.mediaTitle });
      });
      (parsed.subtitles || []).forEach(function (s) { if (s && s.url) ctx.sink.sub(s.label || s.display || s.language || s.lang, s.url); });
    };
  }), 4);
}

// ---------------- XPass ----------------
async function xpassServers(dataUrl, referer) {
  var path = dataUrl.split("?")[0];
  var token = (/token=([^&]+)/.exec(dataUrl) || [])[1] || "";
  var key = sha256Bytes("spv3-data-response|spv3-build-1787821613-50e5fc97c9dce367|" + path + "|" + token);
  var full = /^http/.test(dataUrl) ? dataUrl : "https://play.xpass.top" + dataUrl;
  var t = await getText(full, { "User-Agent": UA_DESKTOP, "Referer": referer, "Origin": "https://play.xpass.top" });
  if (!t) return [];
  var raw = b64ToBytes(t.trim());
  if (raw.length <= 28) return [];
  var plain = utf8Decode(aesGcmDecrypt(raw.subarray(12, raw.length - 16), key, raw.subarray(0, 12)));
  var j = parseJsonSafe(plain);
  return Array.isArray(j) ? j : [];
}

async function spXpass(ctx) {
  var info = ctx.info;
  var embed = info.isTv ? "https://play.xpass.top/e/tv/" + info.tmdbId + "/" + info.season + "/" + info.episode + "?autostart=true" : "https://play.xpass.top/e/movie/" + info.tmdbId + "?autostart=true";
  var html = await getText(embed, { "Referer": "https://streamsrcs.2embed.cc/", "User-Agent": UA_DESKTOP });
  if (!html) return;
  var servers = [];
  var dm = /var dataUrl\s*=\s*"([^"]+)"/.exec(html);
  if (dm) servers = await xpassServers(dm[1], embed);
  if (!servers.length) {
    // backup buttons embedded in the page
    var re = /data-(?:url|src)="([^"]+)"[^>]*>([^<]{1,40})</g, m;
    while ((m = re.exec(html))) servers.push({ url: m[1], name: m[2].trim() });
  }
  await runLimited(servers.map(function (s) {
    return async function () {
      if (!s || !s.url) return;
      var full = /^http/.test(s.url) ? s.url : "https://play.xpass.top" + s.url;
      var pl = await getJson(full, { "Referer": embed, "Origin": "https://play.xpass.top", "Accept": "application/json,*/*" });
      var item = pl && pl.playlist && pl.playlist[0];
      ((item && item.sources) || []).forEach(function (src) {
        if (!src.file) return;
        var file = /^http/.test(src.file) ? src.file : "https://play.xpass.top" + src.file;
        ctx.sink.add({ url: file, source: "XPass " + (s.name || "Server"), headers: { "Referer": "https://play.xpass.top/" }, title: ctx.mediaTitle, type: /hls/i.test(src.type || "") || file.indexOf(".m3u8") >= 0 ? "m3u8" : undefined });
      });
    };
  }), 4);
}

// ---------------- DahmerMovies (open directory) ----------------
async function spDahmer(ctx) {
  var info = ctx.info, base = "https://a.111477.xyz";
  var url = info.isTv ? base + "/tvs/" + encodeURIComponent(info.title.replace(/:/g, " -")) + "/Season " + info.season + "/" : base + "/movies/" + encodeURIComponent(info.title.replace(/:/g, "")) + " (" + info.year + ")/";
  url = url.replace(/ /g, "%20");
  var html = await getText(url, { "User-Agent": UA_DESKTOP }, 20000);
  if (!html) return;
  var re = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g, m, picks = [];
  var epRe = info.isTv ? new RegExp("S" + pad2(info.season) + "E" + pad2(info.episode), "i") : /(1080p|2160p)/i;
  while ((m = re.exec(html))) { if (epRe.test(m[2]) && /\.(mkv|mp4|avi)$/i.test(m[2].trim())) picks.push([m[2].trim(), m[1]]); }
  picks.forEach(function (p) {
    var href = p[1].indexOf(base) >= 0 ? p[1] : (/^https?:/.test(p[1]) ? p[1] : (p[1].charAt(0) === "/" ? base + p[1] : url + p[1]));
    var tags = [];
    if (/hevc|x265|h265/i.test(p[0])) tags.push("HEVC");
    if (/\bhdr|dv\b|dolby.?vision/i.test(p[0])) tags.push("HDR");
    if (/remux/i.test(p[0])) tags.push("REMUX");
    ctx.sink.add({ url: href, source: "DahmerMovies", label: tags.join(" ") || qualityFrom(p[0]), quality: p[0], title: ctx.mediaTitle + "\n" + decodeHtml(p[0]) });
  });
}

// ---------------- Vadapav (stremio addon) ----------------
async function spVadapav(ctx) {
  var info = ctx.info;
  if (!info.imdbId) return;
  var ep = info.isTv ? "https://stremio.vadapav.mov/stream/series/" + info.imdbId + ":" + info.season + ":" + info.episode + ".json" : "https://stremio.vadapav.mov/stream/movie/" + info.imdbId + ".json";
  var j = await getJson(ep, { "User-Agent": UA_DESKTOP, "Accept": "application/json, text/plain, */*" });
  ((j && j.streams) || []).forEach(function (s) {
    if (!s.url || !/^http/.test(s.url)) return;
    var t = String(s.title || s.name || "").split("\n")[0].trim();
    ctx.sink.add({ url: s.url, source: "Vadapav", label: (/(2160p|1080p|720p|480p)/i.exec(t) || [""])[0], quality: t, headers: { "Referer": "https://vadapav.mov/" }, title: ctx.mediaTitle + (t ? "\n" + t : "") });
  });
}

// ---------------- KissKH (Asian drama) ----------------
async function spKisskh(ctx) {
  var info = ctx.info, base = "https://kisskh.is";
  var titles = [info.title, info.originalTitle].filter(Boolean);
  var drama = null;
  for (var i = 0; i < titles.length && !drama; i++) {
    var res = await getJson(base + "/api/DramaList/Search?q=" + encodeURIComponent(titles[i]) + "&type=" + (info.isTv ? "1" : "2"), { "Referer": base + "/" });
    if (!res || !res.length) continue;
    var cand = res.filter(function (r) {
      if (!r.title) return false;
      if (info.isTv && info.season > 1) return new RegExp("Season " + info.season + "\\b", "i").test(r.title) && titleSimilarity(r.title.replace(/Season \d+/i, ""), titles[i]) >= 0.6;
      return titleSimilarity(r.title.replace(/\(\d{4}\)/, ""), titles[i]) >= 0.75;
    });
    drama = cand[0] || null;
  }
  if (!drama) return;
  var slug = String(drama.title).replace(/[^a-zA-Z0-9]+/g, "-");
  var det = await getJson(base + "/api/DramaList/Drama/" + drama.id + "?isq=false", { "Referer": base + "/Drama/" + slug + "?id=" + drama.id });
  var eps = (det && det.episodes) || [];
  var ep = info.isTv ? eps.filter(function (e) { return e.number === info.episode; })[0] : eps[0];
  if (!ep) return;
  var k = await getJson("https://script.google.com/macros/s/AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA/exec?id=" + ep.id + "&version=2.8.10", null, 10000);
  if (!k || !k.key) return;
  var src = await getJson(base + "/api/DramaList/Episode/" + ep.id + ".png?err=false&ts=&time=&kkey=" + k.key, { "Referer": base + "/Drama/" + slug + "/Episode-" + ep.number + "?id=" + drama.id + "&ep=" + ep.id + "&page=0&pageSize=100" });
  if (!src) return;
  [src.video, src.thirdParty].forEach(function (link) {
    if (!link) return;
    if (link.indexOf("//") === 0) link = "https:" + link;
    if (/\.m3u8|\.mp4/.test(link)) ctx.sink.add({ url: link, source: "KissKH", headers: { "Origin": base, "Referer": base + "/" }, title: ctx.mediaTitle });
    else return resolveEmbed(ctx.sink, link, base + "/", "", "KissKH", ctx.mediaTitle);
  });
  var sk = await getJson("https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=" + ep.id + "&version=2.8.10", null, 10000);
  if (sk && sk.key) {
    var subs = await getJson(base + "/api/Sub/" + ep.id + "?kkey=" + sk.key, null);
    (subs || []).forEach(function (s) { if (s.src && /\.(srt|vtt)(\?|$)/i.test(s.src)) ctx.sink.sub(s.label, s.src); });
  }
}

// ---------------- OpenSubtitles v3 (subtitles only) ----------------
async function spSubtitles(ctx) {
  var info = ctx.info;
  if (!info.imdbId) return;
  var url = info.isTv ? "https://opensubtitles-v3.strem.io/subtitles/series/" + info.imdbId + ":" + info.season + ":" + info.episode + ".json" : "https://opensubtitles-v3.strem.io/subtitles/movie/" + info.imdbId + ".json";
  var j = await getJson(url, { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" });
  var seen = {};
  ((j && j.subtitles) || []).forEach(function (s) {
    if (!s.url) return;
    var lang = s.lang || "Unknown";
    seen[lang] = (seen[lang] || 0) + 1;
    if (seen[lang] <= 3) ctx.sink.sub(lang, s.url);
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

async function streamPlayStreams(tmdbId, mediaType, season, episode) {
  var info = await getTmdbMedia(tmdbId, mediaType, season, episode);
  if (!info) return [];
  var sink = new StreamSink("StreamPlay", "streamplay");
  var ctx = { info: info, sink: sink, mediaTitle: mediaLabel(info) };
  var tasks = SP_MOVIE_SOURCES.slice();
  var asian = ["ko", "zh", "cn", "th", "tl"].indexOf(info.lang) >= 0 || (info.lang === "ja" && !info.isAnime);
  if (asian) tasks.push(["KissKH", spKisskh]);
  if (info.isAnime) {
    var anime = await resolveAnime(info);
    if (anime) {
      var actx = { info: info, anime: anime, sink: sink, mediaTitle: ctx.mediaTitle + (info.isTv ? " · Ep " + anime.episode : "") };
      SP_ANIME_SOURCES.forEach(function (s) { tasks.push([s[0], function () { return s[1](actx); }]); });
    }
    tasks.push(["KissKH", spKisskh]);
  }
  await withTimeout(runLimited(tasks.map(function (t) {
    return async function () {
      try { await withTimeout(t[1](ctx), 40000, null); } catch (e) { spLog(t[0], "failed", e && e.message); }
    };
  }), 6), 75000, null);
  return sink.result();
}
