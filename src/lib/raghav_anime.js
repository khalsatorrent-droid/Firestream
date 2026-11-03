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
  if (!t) return null;
  if (t.charAt(0) === "{" || t.charAt(0) === "[") return t;
  var raw = b64ToBytes(t);
  var attempts = obf === "2" ? [true, false] : [false, true];
  for (var i = 0; i < attempts.length; i++) {
    try {
      var data = attempts[i] ? xorBytes(raw, new Uint8Array(MIRURO_XOR)) : raw;
      return utf8Decode(inflateAuto(data));
    } catch (e) {}
  }
  return null;
}

async function miruroPipe(path, query) {
  var q = Object.assign({}, query, { live: "true", _t: Math.floor(Date.now() / 600000) * 600000 });
  var enc = bytesToB64(utf8Encode(JSON.stringify({ path: path, method: "GET", query: q, body: null })), true);
  var domains = miruroWorking ? [miruroWorking].concat(MIRURO_DOMAINS.filter(function (d) { return d !== miruroWorking; })) : MIRURO_DOMAINS.slice();
  for (var i = 0; i < Math.min(3, domains.length); i++) {
    var d = domains[i];
    var res = await getFull(d + "/api/secure/pipe?e=" + enc, { headers: { "User-Agent": UA_MOBILE, "Referer": d + "/", "Origin": d, "Accept": "*/*" }, timeout: 20000 });
    if (!res || res.status !== 200 || !res.text || /cf-browser-verification|challenge-platform|Just a moment/i.test(res.text)) continue;
    var dec = miruroDecode(res.text, headerGet(res.headers, "x-obfuscated"));
    var j = parseJsonSafe(dec);
    if (j) { miruroWorking = d; return j; }
  }
  return null;
}

async function srcMiruro(ctx) {
  var eps = await miruroPipe("episodes", { anilistId: ctx.anime.anilistId });
  if (!eps || !eps.providers) return;
  var jobs = [];
  Object.keys(eps.providers).forEach(function (prov) {
    var cats = (eps.providers[prov] || {}).episodes || {};
    [["sub", cats.sub || cats.ssub, cats.sub ? "sub" : "ssub"], ["dub", cats.dub, "dub"]].forEach(function (c) {
      var list = c[1] || [];
      var ep = list.filter(function (e) { return e && e.number === ctx.anime.episode && e.id; })[0];
      if (ep) jobs.push({ prov: prov, id: ep.id, cat: c[2], audio: c[0] });
    });
  });
  await runLimited(jobs.map(function (j) {
    return async function () {
      var r = await miruroPipe("sources", { episodeId: j.id, provider: j.prov, category: j.cat, anilistId: ctx.anime.anilistId });
      if (!r || !r.streams) return;
      var name = MIRURO_NAMES[j.prov] || j.prov;
      var label = (j.audio === "dub" ? "Dub" : j.cat === "ssub" ? "Softsub" : "Sub");
      for (var i = 0; i < r.streams.length; i++) {
        var s = r.streams[i];
        if (!s || !s.url) continue;
        var headers = { "Referer": s.referer || "https://www.miruro.com/", "User-Agent": UA_MOBILE };
        var fan = s.fansub ? " [" + s.fansub + "]" : "";
        if (s.type === "hls" || s.type === "mp4") {
          ctx.sink.add({ url: s.url, source: "Miruro " + name, label: label + fan, quality: s.quality || (s.resolution && s.resolution.height), headers: headers, title: ctx.mediaTitle, type: s.type === "hls" ? "m3u8" : "mp4" });
        } else if (s.type === "embed") {
          await resolveEmbed(ctx.sink, s.url, s.referer || "https://www.miruro.com/", label + fan, "Miruro " + name, ctx.mediaTitle);
        }
      }
      (r.subtitles || []).forEach(function (sb) { if (sb.url) ctx.sink.sub(sb.lang || "English", sb.url); });
    };
  }), 4);
}

// ---------------- AniKage ----------------
async function srcAniKage(ctx) {
  var main = await raghavDomain("anikage", "https://anikage.cc");
  var api = main + "/api/media/anime";
  var headers = { "Accept": "application/json", "User-Agent": UA_DESKTOP };
  var slug = null;
  var queries = [ctx.anime.title, ctx.anime.jpTitle].filter(Boolean);
  for (var i = 0; i < queries.length && !slug; i++) {
    var b = await getJson(api + "/browse?q=" + encodeURIComponent(queries[i]) + "&sort=popularity&page=1&limit=25&adult=true", headers);
    var hit = b && (b.data || []).filter(function (x) { return x.anilistId === ctx.anime.anilistId && x.slug; })[0];
    if (hit) slug = hit.slug;
  }
  if (!slug) return;
  var pageHtml = await getText(main, null, 8000);
  var proxy = (pageHtml && (/"PUBLIC_PROXY_URL"\s*:\s*"([^"]+)"/.exec(pageHtml) || [])[1]) || await raghavDomain("anikageproxy", null) || "https://og.bakayaro.live";
  var proxyHeaders = { "Referer": main + "/", "Origin": main };
  function px(p, type) {
    if (/^https?:\/\//.test(p)) return p;
    if (/^\/(m3u8|stream|hls)\//.test(p)) return proxy + p;
    if (/^(m3u8|stream|hls)\//.test(p)) return proxy + "/" + p;
    return proxy + "/" + type + "/" + p;
  }
  var servers = await getJson(api + "/" + slug + "/episodes/" + ctx.anime.episode + "/servers", headers);
  var list = ((servers && servers.servers) || []).filter(function (s) { return s.id; });
  var jobs = [];
  ["sub", "dub"].forEach(function (lang) {
    list.forEach(function (s) {
      if (s.subTypes && s.subTypes.length && s.subTypes.indexOf(lang) < 0) return;
      jobs.push({ s: s, lang: lang });
    });
  });
  await runLimited(jobs.map(function (j) {
    return async function () {
      var prov = j.s.providerId || j.s.id;
      var r = await getJson(api + "/" + slug + "/episodes/" + ctx.anime.episode + "/sources?provider=" + prov + "&lang=" + j.lang + "&server=" + j.s.id, headers);
      if (!r) return;
      var subs = r.subtitles || [];
      subs.forEach(function (sb) { if (sb.file) ctx.sink.sub(sb.label || j.lang, px(sb.file, "stream"), proxyHeaders); });
      var subType = j.lang === "sub" ? (subs.length ? "Softsub" : "Hardsub") : "Dub";
      var embeds = [];
      (r.sources || []).forEach(function (src) {
        if (src.embedUrl) embeds.push([src.embedUrl, src.server]);
        if (src.url) ctx.sink.add({ url: px(src.url, src.isM3U8 ? "m3u8" : "stream"), source: "AniKage " + j.s.id, label: subType + (src.server && src.server !== j.s.id ? " " + src.server : ""), quality: src.quality || "1080p", headers: proxyHeaders, title: ctx.mediaTitle, type: src.isM3U8 ? "m3u8" : undefined });
      });
      (r.embeds || []).forEach(function (e) { if (e.url) embeds.push([e.url, e.server]); });
      for (var k = 0; k < embeds.length; k++) await resolveEmbed(ctx.sink, embeds[k][0], main + "/", subType, "AniKage " + (embeds[k][1] || j.s.id), ctx.mediaTitle);
    };
  }), 4);
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
  for (var i = 0; i < b.length; i++) { var x = (b[i] ^ 137) & 0xff; hex += (x < 16 ? "0" : "") + x.toString(16); }
  return "https://hls.dramavideo.se/media/" + hex + "&origin=https://kem.clvd.xyz/";
}

function anidapTransform(url, providerId, referer) {
  var p = providerId.toLowerCase(), r = url;
  if (r.indexOf("https://vivibebe.site/public/stream/") >= 0) r = r.replace("https://vivibebe.site/public/stream/", "https://hawk.aniwatchtv.site/media/");
  if (r.indexOf("https://playeng.animeapps.top/r2/") === 0) r = "https://bd.aniwatchtv.site/media" + r.replace(/^https?:\/\/[^\/]+/, "").replace("/r2", "");
  if (p === "shiro") r = anidapShiro(r);
  else if (ANIDAP_UWU_KEYS[p]) r = anidapUwu(r, ANIDAP_UWU_KEYS[p]);
  else if (p === "mochi") r = r.replace("https://tools.fast4speed.rsvp", "https://mp4.24stream.xyz/storage");
  else if (p === "beep") {
    if (!/^https:\/\/bd\.(24stream\.xyz|aniwatchtv\.site)\/media/.test(r)) r = "https://bd.aniwatchtv.site/media" + r.replace(/^https?:\/\/[^\/]+/, "").replace("/r2", "");
  }
  if (r === url && referer && p !== "vee" && p !== "neko") return anidapUwu(url, referer);
  return r.replace(/^http:\/\//, "https://");
}

async function srcAnidap(ctx) {
  var main = await raghavDomain("anidap", "https://anidap.lol");
  var chad = main.replace("://", "://chad.") + "/rest/api";
  var cf = { "Referer": main + "/", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Origin": main, "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-site", "User-Agent": UA_MOBILE };
  var d = await getJson(main + "/api/anime/" + ctx.anime.anilistId, { "Referer": main + "/home", "Accept": "application/json", "User-Agent": UA_MOBILE });
  if (!d) return;
  var data = d.data && typeof d.data === "object" && Object.keys(d.data).length ? d.data : d;
  var slug = data.id || data.slug;
  if (!slug) return;
  var sv = await getJson(chad + "/servers?id=" + slug + "&epNum=" + ctx.anime.episode, cf);
  if (!sv) return;
  var proxyHeaders = { "User-Agent": UA_MOBILE, "Accept": "*/*", "Origin": main, "Referer": main + "/" };
  var jobs = [];
  [["sub", sv.subProviders], ["dub", sv.dubProviders]].forEach(function (c) {
    var list = (c[1] || []).map(function (n) { return typeof n === "string" ? { id: n } : n; }).filter(function (n) { return n && n.id; });
    if (!list.some(function (n) { return n.id === "adp"; })) list.unshift({ id: "adp" });
    list.forEach(function (n) { jobs.push({ type: c[0], p: n }); });
  });
  await runLimited(jobs.map(function (j) {
    return async function () {
      var root = await getJson(chad + "/sources?id=" + slug + "&epNum=" + ctx.anime.episode + "&type=" + j.type + "&providerId=" + j.p.id, cf);
      if (!root) return;
      var node = root.data && root.data.sources ? root.data : root;
      var hdrs = node.headers || {};
      var referer = hdrs.Referer || hdrs.referer;
      var hard = j.p.tip && /hard/i.test(j.p.tip);
      var label = (j.type === "dub" ? "Dub" : hard ? "Hardsub" : "Sub");
      (node.tracks || node.subtitles || []).forEach(function (t) {
        var u = (t.url || "").replace("https:///", "https://");
        var l = (t.label || t.lang || "Subtitle");
        if (!/^http/.test(u) || /thumbnail/i.test(l) || t.kind === "thumbnails") return;
        ctx.sink.sub(l, u, /megaplay|lostproject|vyrnex/.test(u) ? { "Origin": "https://megaplay.buzz", "Referer": "https://megaplay.buzz/" } : hdrs);
      });
      for (var i = 0; i < (node.sources || []).length; i++) {
        var s = node.sources[i];
        if (!s || !s.url) continue;
        var isHls = /mpegurl|m3u8/i.test(s.type || "") || /\.m3u8|index\.txt|\.txt(\?|$)/.test(s.url);
        var isMp4 = /mp4|webm|matroska/i.test(s.type || "") || /\.(mp4|webm|mkv)(\?|$)/.test(s.url);
        if (isHls) {
          var txt = await getText(s.url, hdrs, 10000);
          if (txt && txt.indexOf("#EXTM3U") >= 0) {
            ctx.sink.add({ url: s.url, source: "Anidap " + j.p.id, label: label, quality: s.quality, headers: hdrs, title: ctx.mediaTitle, type: "m3u8" });
          } else {
            var prox = anidapTransform(s.url, j.p.id, referer);
            if (prox !== s.url) {
              var t2 = await getText(prox, proxyHeaders, 10000);
              if (t2 && t2.indexOf("#EXTM3U") >= 0) ctx.sink.add({ url: prox, source: "Anidap " + j.p.id, label: label, quality: s.quality, headers: proxyHeaders, title: ctx.mediaTitle, type: "m3u8" });
            }
          }
        } else if (isMp4) {
          ctx.sink.add({ url: s.url, source: "Anidap " + j.p.id, label: label, quality: s.quality, headers: hdrs, title: ctx.mediaTitle });
        } else {
          await resolveEmbed(ctx.sink, s.url, referer || main + "/", label, "Anidap " + j.p.id, ctx.mediaTitle);
        }
      }
    };
  }), 4);
}

// ---------------- AniPM ----------------
async function srcAniPM(ctx) {
  var main = await raghavDomain("anipm", "https://ani.pm");
  var H = function (ref) { return { "User-Agent": UA_DESKTOP, "Accept": "application/json", "Referer": ref || main + "/" }; };
  var SETTLAR = "https://embed.settlar.io";
  async function settlar(root, channel, label) {
    if (!root.settlarSelection) return;
    var ses = await getJson(main + "/api/anime/settlar/session?selection=" + encodeURIComponent(root.settlarSelection) + "&provider=anipm&ep=" + ctx.anime.episode + "&channel=" + channel + "&telemetry=0", H());
    var embedUrl = ses && ses.embedUrl;
    var t = embedUrl && (/t=([^&]+)/.exec(embedUrl) || [])[1];
    if (!t) return;
    var st = await getJson(SETTLAR + "/api/embed/session?t=" + t, H(SETTLAR + "/embed/v1"));
    if (!st || !/^http/.test(st.source || "")) return;
    var ph = { "User-Agent": UA_DESKTOP, "Referer": SETTLAR + "/" };
    (st.subtitles || []).forEach(function (s) { if (s.url) ctx.sink.sub(s.label || "Subtitle", s.url, ph); });
    ctx.sink.add({ url: st.source, source: "AniPM", label: label, headers: ph, title: ctx.mediaTitle, type: "m3u8" });
  }
  await Promise.all(["sub", "dub"].map(async function (channel) {
    var root = await getJson(main + "/api/anime/playback-bootstrap/anilist/" + ctx.anime.anilistId + "?ep=" + ctx.anime.episode + "&lang=" + channel + "&backup=1", H());
    if (!root || root.effectiveLanguage !== channel) return;
    var tasks = [settlar(root, channel, channel === "dub" ? "Dub" : "Sub")];
    if (root.backupEmbed && root.backupEmbed.available && /^http/.test(root.backupEmbed.url || "")) {
      tasks.push(resolveMegaplayFamily(ctx.sink, root.backupEmbed.url, main + "/", "MegaPlay " + channel, "AniPM", ctx.mediaTitle));
    }
    tasks.push((async function () {
      var pk = await getJson(main + "/api/anime/anipm-server/_packages?anilistId=" + ctx.anime.anilistId, H());
      var e = pk && pk.episodes && pk.episodes[String(ctx.anime.episode)];
      if (e && e[channel + "hard"]) await settlar(root, channel + "hard", "Hardsub (" + channel + ")");
    })());
    await Promise.all(tasks);
  }));
  // beta server: one master with every audio language
  var beta = await getJson(main + "/api/anime/beta-server/" + ctx.anime.anilistId, H());
  if (beta && beta.available && (beta.episodes || []).some(function (x) { return parseInt(x, 10) === ctx.anime.episode; }) && beta.path && beta.origin) {
    var wp = beta.path.replace(/^\/watch\//, "");
    var cut = wp.lastIndexOf("-");
    if (cut > 0) {
      var origin = beta.origin.replace(/\/$/, "");
      var epPad = ("0000" + ctx.anime.episode).slice(-4);
      var master = origin + "/hls/" + wp.substring(cut + 1) + "-" + wp.substring(0, cut) + "/E" + epPad + "/master.m3u8";
      var bh = { "User-Agent": UA_DESKTOP, "Referer": origin + "/" };
      for (var a = 0; a < 2; a++) {
        var r = await getFull(master, { headers: Object.assign({ "Accept": "*/*" }, bh), timeout: 15000 });
        if (r && r.status === 200 && /^#EXTM3U/.test(r.text || "")) { ctx.sink.add({ url: master, source: "AniPM", label: "Multi-audio", headers: bh, title: ctx.mediaTitle, type: "m3u8" }); break; }
      }
    }
  }
}

// ---------------- AniNami ----------------
async function srcAniNami(ctx) {
  var main = await raghavDomain("aninami", "https://www.aninami.site");
  var H = { "Accept": "application/json", "Referer": main + "/" };
  var eps = await getJson(main + "/api/episodes/" + ctx.anime.anilistId, H);
  var provs = eps && eps.results && eps.results.providers;
  if (!provs) return;
  var ids = [];
  Object.keys(provs).forEach(function (p) {
    var e = (provs[p] || {}).episodes || {};
    ["sub", "dub"].forEach(function (cat) {
      (e[cat] || []).forEach(function (it) { if (it && it.number === ctx.anime.episode && it.id) ids.push(it.id); });
    });
  });
  await runLimited(ids.map(function (epId) {
    return async function () {
      var parts = epId.split("/");
      if (parts.length < 5 || parts[0] !== "watch") return;
      var audio = parts[3];
      var r = await getJson(main + "/api/watch/" + parts[1] + "/" + parts[2] + "/" + audio + "/" + parts.slice(4).join("/"), H);
      var streams = r && r.results && r.results.streams;
      if (!streams) return;
      for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (!s || !s.url) continue;
        var ref = s.referer || main + "/";
        var label = (audio === "dub" ? "Dub" : "Sub") + (s.server ? " " + s.server : "");
        var t = (s.type || "").toLowerCase();
        if (t === "hls" || t === "mp4" || t === "video") ctx.sink.add({ url: s.url, source: "AniNami", label: label, quality: s.quality, headers: { "Referer": ref }, title: ctx.mediaTitle, type: t === "hls" ? "m3u8" : "mp4" });
        else await resolveEmbed(ctx.sink, s.url, ref, label, "AniNami", ctx.mediaTitle);
      }
    };
  }), 4);
}

// ---------------- VidHawk (AniChan's proxy) ----------------
async function srcVidHawk(ctx) {
  var parent = await raghavDomain("anichan", "https://anichan.to");
  var parentHost = hostOf(parent) || "anichan.to";
  var H = { "User-Agent": UA_MOBILE, "Referer": parent + "/" };
  await Promise.all(["sub", "dub"].map(async function (audio) {
    var race = await getJson("https://vidhawk.buzz/api/stream/race?episode=" + ctx.anime.episode + "&audio=" + audio + "&server=kari&anilistId=" + ctx.anime.anilistId + "&parentHost=" + parentHost, H, 12000);
    if (!race) return;
    var cands = (race.servers || []).filter(function (s) { return s.ticket; });
    if (!cands.length && race.ticket) cands = [{ ticket: race.ticket }];
    var wanted = audio === "dub" ? ["dub", "hin"] : ["sub"];
    for (var i = 0; i < cands.length; i++) {
      var play = await getJson("https://vidhawk.buzz/api/play?t=" + encodeURIComponent(cands[i].ticket), H, 10000);
      ((play && play.tracks) || []).forEach(function (t) {
        var id = (t.id || "").toLowerCase();
        if (wanted.indexOf(id) < 0 || !/^http/.test(t.src || "")) return;
        ctx.sink.add({ url: t.src, source: "VidHawk " + (cands[i].label || cands[i].id || ""), label: id === "hin" ? "Hindi" : id === "dub" ? "Dub" : "Sub", headers: H, title: ctx.mediaTitle, type: "m3u8" });
      });
    }
  }));
}

// ---------------- Kyren ----------------
async function srcKyren(ctx) {
  var main = "https://kyren.moe";
  var H = { "User-Agent": UA_MOBILE, "Accept": "application/json", "Referer": main + "/" };
  var jobs = [];
  ["sub", "dub"].forEach(function (lang) { ["megaplay", "megaplay-direct", "tryembed"].forEach(function (server) { jobs.push([lang, server]); }); });
  await runLimited(jobs.map(function (j) {
    return async function () {
      var r = await getJson(main + "/api/stream/" + ctx.anime.anilistId + "/" + ctx.anime.episode + "?lang=" + j[0] + "&title=" + encodeURIComponent(ctx.anime.title || "") + "&server=" + j[1], H);
      if (!r || r.ok !== true) return;
      var srcs = r.sources || [];
      for (var i = 0; i < srcs.length; i++) {
        var s = srcs[i];
        if (!s.url) continue;
        var label = (s.isDub || s.language === "dub" ? "Dub" : "Sub");
        if (s.type === "hls") ctx.sink.add({ url: s.url, source: "Kyren " + (s.provider || j[1]), label: label, quality: s.quality, headers: { "User-Agent": UA_MOBILE, "Referer": main + "/" }, title: ctx.mediaTitle, type: "m3u8" });
        else await resolveEmbed(ctx.sink, s.url, main + "/", label, "Kyren " + (s.provider || j[1]), ctx.mediaTitle);
      }
      (r.subtitles || []).forEach(function (s) { if (s.url) ctx.sink.sub(s.label || s.lang || "English", s.url); });
    };
  }), 3);
}

// ---------------- Re:ANIME (FlixCloud MKV with both audios) ----------------
async function srcReAnime(ctx) {
  var main = await raghavDomain("reanime", "https://reanime.to");
  var r = await getJson(main + "/api/flix/" + ctx.anime.anilistId + "/" + ctx.anime.episode, { "User-Agent": UA_MOBILE, "Accept": "application/json", "Referer": main + "/watch/" });
  var seen = {};
  var embeds = ((r && r.servers) || []).map(function (s) { return s.dataLink; }).filter(function (u) {
    var id = u && (/\/e\/([a-z0-9]+)/i.exec(u) || [])[1];
    if (!id || seen[id]) return false;
    seen[id] = true; return true;
  });
  await Promise.all(embeds.map(async function (u) {
    var f = await flixcloudResolve(u);
    if (f) ctx.sink.add({ url: f.url, source: "Re:ANIME", label: "Sub & Dub (MKV)", quality: f.quality, size: f.size, headers: f.headers, title: ctx.mediaTitle, type: "mkv" });
  }));
}

// ---------------- Anv ----------------
var anvCookie = null;
async function srcAnv(ctx) {
  var main = "https://anv.to", page = "https://anv.to/anime/one-piece-odmau-episode-1";
  var base = { "User-Agent": UA_DESKTOP.replace("131.0.0.0", "155.0.0.0"), "Accept-Language": "en-US,en;q=0.9" };
  if (!anvCookie) {
    var res = await getFull(page, { headers: base, timeout: 12000 });
    var sc = res && headerGet(res.headers, "set-cookie");
    var m = sc && /shiro_watch=([^;]+)/.exec(sc);
    if (m) anvCookie = "shiro_watch=" + m[1].trim();
  }
  if (!anvCookie) return;
  var r = await postJson(main + "/api/episode", { anilistId: ctx.anime.anilistId, malId: null, episode: ctx.anime.episode }, Object.assign({}, base, { "Origin": main, "Referer": main + "/", "Cookie": anvCookie }));
  if (!r || r.status !== "ready") return;
  var playH = Object.assign({}, base, { "Cookie": anvCookie, "Referer": page });
  (r.variants || []).forEach(function (v) {
    if (v.id !== "sub" && v.id !== "dub") return;
    (v.sources || []).forEach(function (s) {
      if (!s.url) return;
      var u = /^http/.test(s.url) ? s.url : main + s.url;
      ctx.sink.add({ url: u, source: "Anv", label: (v.id === "dub" ? "Dub" : "Sub") + " " + (s.label || ""), headers: playH, title: ctx.mediaTitle, type: "m3u8" });
      (s.tracks || []).forEach(function (t) { if (t.src) ctx.sink.sub(t.label || t.language || "English", /^http/.test(t.src) ? t.src : main + t.src, playH); });
    });
  });
}

// ---------------- AniKoto (HTML site) ----------------
function anikotoResult(json) {
  var j = parseJsonSafe(json);
  return j && j.status === 200 ? j.result : null;
}

var ANIKOTO_HOST_MAP = [["vibeplayer.site", "nanobyte.bigdreamsmalldih.site"]];
for (var _ak = 1; _ak <= 16; _ak++) ANIKOTO_HOST_MAP.push(["vault-" + pad2(_ak) + ".uwucdn.top", "uwu" + _ak + ".bigdreamsmalldih.site"]);
ANIKOTO_HOST_MAP.push(["vault-99.uwucdn.top", "uwu17.bigdreamsmalldih.site"]);
for (var _ao = 10; _ao <= 16; _ao++) ANIKOTO_HOST_MAP.push(["vault-" + _ao + ".owocdn.top", _ao + ".bigdreamsmalldih.site"]);
ANIKOTO_HOST_MAP.push(["vault-99.owocdn.top", "99.bigdreamsmalldih.site"]);

async function srcAniKoto(ctx) {
  var main = await raghavDomain("anikoto", "https://anikototv.to");
  var bh = { "User-Agent": UA_MOBILE, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
  var target = null;
  var queries = [ctx.anime.title, ctx.anime.romaji].filter(Boolean);
  for (var qi = 0; qi < queries.length && !target; qi++) {
    var html = await getText(main + "/filter?keyword=" + encodeURIComponent(queries[qi]), bh);
    if (!html) continue;
    var re = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/a>|<a[^>]+class="[^"]*\bname\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, m;
    var best = 0;
    while ((m = re.exec(html))) {
      var href = m[1] || m[3], name = stripTags(m[2] || m[4]);
      var sc = 0;
      ctx.anime.titles.forEach(function (t) { sc = Math.max(sc, titleSimilarity(name, t)); });
      if (sc > best && sc >= 0.75) { best = sc; target = absUrl(href, main); }
    }
  }
  if (!target) return;
  var page = await getText(target, bh);
  var animeId = page && ((/id="watch-main"[^>]*data-id="(\d+)"/.exec(page) || /data-id=["'](\d+)["']/.exec(page)) || [])[1];
  if (!animeId) return;
  var ajax = { "User-Agent": UA_MOBILE, "X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*; q=0.01", "Referer": target };
  var listHtml = anikotoResult(await getText(main + "/ajax/episode/list/" + animeId, ajax));
  if (!listHtml) return;
  var epRe = /<a([^>]*data-ids="[^"]*"[^>]*)>/g, em, ids = null;
  while ((em = epRe.exec(listHtml))) {
    var attrs = em[1];
    if (parseInt((/data-num="(\d+)"/.exec(attrs) || [])[1], 10) === ctx.anime.episode) { ids = decodeHtml((/data-ids="([^"]*)"/.exec(attrs) || [])[1]); break; }
  }
  if (!ids) return;
  var serverHtml = anikotoResult(await getText(main + "/ajax/server/list?servers=" + encodeURIComponent(ids), ajax));
  if (!serverHtml) return;
  var jobs = [];
  var blocks = serverHtml.split(/<div[^>]+class="type"/);
  blocks.forEach(function (blk) {
    var type = (/data-type="(\w+)"/.exec(blk) || [])[1];
    if (!type) return;
    var li = /<li[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g, lm;
    while ((lm = li.exec(blk))) jobs.push({ type: type, id: lm[1], name: stripTags(lm[2]) || "Server" });
  });
  await runLimited(jobs.map(function (j) {
    return async function () {
      var r = parseJsonSafe(await getText(main + "/ajax/server?get=" + encodeURIComponent(j.id), ajax));
      var url = r && r.status === 200 && r.result && r.result.url;
      if (!url) return;
      if (url.indexOf("//") === 0) url = "https:" + url; else if (url.charAt(0) === "/") url = main + url;
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
        } catch (e) {}
      }
      await resolveEmbed(ctx.sink, url, target, label, "AniKoto " + j.name, ctx.mediaTitle);
    };
  }), 4);
}

var RAGHAV_SOURCES = [
  ["Miruro", srcMiruro], ["AniKage", srcAniKage], ["Anidap", srcAnidap], ["AniPM", srcAniPM],
  ["AniNami", srcAniNami], ["VidHawk", srcVidHawk], ["Kyren", srcKyren], ["ReAnime", srcReAnime],
  ["Anv", srcAnv], ["AniKoto", srcAniKoto]
];

async function raghavAnimeStreams(tmdbId, mediaType, season, episode, pluginName, providerId, preferKitsu) {
  var info = await getTmdbMedia(tmdbId, mediaType, season, episode);
  if (!info) return [];
  var anime = await resolveAnime(info);
  if (!anime) { raLog("no AniList mapping for", info.title); return []; }
  if (preferKitsu && anime.kitsuId) {
    // Kitsu catalog flavour: use Kitsu's canonical/English titles for the title-matched sources
    var k = await getJson("https://kitsu.io/api/edge/anime/" + anime.kitsuId, { "Accept": "application/vnd.api+json" }, 8000);
    var at = k && k.data && k.data.attributes;
    if (at) {
      var t = at.titles || {};
      anime.titles = [at.canonicalTitle, t.en, t.en_jp, t.ja_jp].concat(anime.titles).filter(Boolean);
      if (t.en_jp) anime.romaji = t.en_jp;
    }
  }
  var sink = new StreamSink(pluginName, providerId);
  var ctx = { info: info, anime: anime, sink: sink, mediaTitle: mediaLabel(info) + (info.isTv ? " · Ep " + anime.episode : "") };
  await withTimeout(runLimited(RAGHAV_SOURCES.map(function (s) {
    return async function () {
      try { await withTimeout(s[1](ctx), 40000, null); } catch (e) { raLog(s[0], "failed", e && e.message); }
    };
  }), 5), 75000, null);
  return sink.result();
}
