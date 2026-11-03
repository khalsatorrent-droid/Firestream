// StreamHubOne sources — ported from the Desi repo's StreamHubOne (decompiled build 76).
// Unique here: Hexa, VidZee, PrimeSrc (PrimeWire), ProjectFreeTV. Shared with StreamPlay: Vidlink,
// Vidrock, VidEasy, XPass, KissKH, OpenSubtitles; anime: ReAnime, AniKage, AniKoto, Miruro.

var shLog = makeLog("StreamHubOne");

// ---------------- Hexa ----------------
async function shHexa(ctx) {
  var info = ctx.info;
  var url = info.isTv ? "https://theemoviedb.hexa.su/api/tmdb/tv/" + info.tmdbId + "/season/" + info.season + "/episode/" + info.episode + "/images" : "https://theemoviedb.hexa.su/api/tmdb/movie/" + info.tmdbId + "/images";
  var key = randomHex(64);
  var tk = await getJson(ENC_DEC + "/enc-hexa", null);
  var token = tk && tk.result && tk.result.token;
  if (!token) return;
  var enc = await getText(url, { "User-Agent": UA_DESKTOP.replace("131.0.0.0", "149.0.0.0"), "Accept": "text/plain", "X-Api-Key": key, "X-Fingerprint-Lite": "e9136c41504646444", "Referer": "https://hexa.su/", "X-Cap-Token": token });
  if (!enc) return;
  var d = await postJson(ENC_DEC + "/dec-hexa", { text: enc, key: key });
  var res = d && d.result;
  ((res && res.sources) || []).forEach(function (s) {
    if (!s.url) return;
    ctx.sink.add({ url: s.url, source: "Hexa " + (s.server ? s.server.charAt(0).toUpperCase() + s.server.slice(1) : ""), headers: { "Referer": "https://hexa.su/", "Origin": "https://hexa.su" }, title: ctx.mediaTitle, type: "m3u8" });
  });
}

// ---------------- VidZee ----------------
var VIDZEE_SECRET = "A7kP9xM2Qv8Lr4Nz1Ht6Yc3Bw5Jf0DsU";
function decryptVidzee(encrypted) {
  try {
    var dec = b64decodeString(encrypted);
    var i = dec.indexOf(":");
    if (i < 0) return null;
    var key = new Uint8Array(32); key.set(utf8Encode(VIDZEE_SECRET).subarray(0, 32));
    return utf8Decode(aesCbcDecrypt(b64ToBytes(dec.substring(i + 1)), key, b64ToBytes(dec.substring(0, i))));
  } catch (e) { return null; }
}

async function shVidzee(ctx) {
  var info = ctx.info;
  await runLimited([0, 1, 2, 4, 5, 6, 7].map(function (sr) {
    return async function () {
      var url = "https://player.vidzee.wtf/api/server?id=" + info.tmdbId + "&sr=" + sr + (info.isTv ? "&ss=" + info.season + "&ep=" + info.episode : "");
      var j = await getJson(url, { "Referer": "https://player.vidzee.wtf/", "User-Agent": UA_DESKTOP });
      if (!j) return;
      var hdr = {};
      var ho = j.headers || {};
      Object.keys(ho).forEach(function (k) { hdr[k] = ho[k]; });
      var ref = hdr.referer || hdr.Referer;
      if (ref) hdr.Referer = ref;
      (j.url || []).forEach(function (o) {
        var u = o && o.link ? decryptVidzee(o.link) : null;
        if (!u || u.indexOf("https:") < 0) return;
        ctx.sink.add({ url: u, source: "VidZee " + (o.name || sr), label: (o.lang || "") + (o.flag ? " " + o.flag : ""), headers: hdr, title: ctx.mediaTitle, type: (o.type || "hls") === "hls" ? "m3u8" : undefined });
      });
      (j.tracks || []).forEach(function (t) { if (t.url) ctx.sink.sub(t.lang || "Unknown", t.url); });
    };
  }), 4);
}

// ---------------- PrimeSrc (PrimeWire mirrors) ----------------
async function shPrimeSrc(ctx) {
  var info = ctx.info;
  if (!info.imdbId) return;
  var h = { "Referer": "https://primesrc.me/", "User-Agent": UA_DESKTOP.replace("131.0.0.0", "149.0.0.0") };
  var url = info.isTv ? "https://primesrc.me/api/v1/s?imdb=" + info.imdbId + "&season=" + info.season + "&episode=" + info.episode + "&type=tv" : "https://primesrc.me/api/v1/s?imdb=" + info.imdbId + "&type=movie";
  var list = await getJson(url, h, 30000);
  var servers = (list && list.servers) || [];
  await runLimited(servers.slice(0, 12).map(function (s) {
    return async function () {
      if (!s.key) return;
      var r = await getJson("https://primesrc.me/api/v1/l?key=" + encodeURIComponent(s.key), h);
      if (r && r.link) await resolveEmbed(ctx.sink, r.link, "https://primesrc.me/", [s.quality, s.file_size].filter(Boolean).join(" "), "PrimeWire " + (s.name || ""), ctx.mediaTitle);
    };
  }), 4);
}

// ---------------- ProjectFreeTV ----------------
async function shProjectFreeTv(ctx) {
  var info = ctx.info, base = "https://projectfreetv.sx";
  var q = info.title.replace(/ /g, "+") + (info.isTv ? "+-+season+" + info.season : "");
  var s = await getJson(base + "/data/browse/?lang=3&keyword=" + q + "&year=" + (info.isTv ? "" : info.year || "") + "&networks=&rating=&votes=&genre=&country=&cast=&directors=&type=&order_by=&page=1&limit=1", { "Referer": base + "/" });
  var m = s && s.movies && s.movies[0];
  if (!m || !m._id) return;
  var w = await getJson(base + "/data/watch/?_id=" + m._id, { "Referer": base + "/" }, 60000);
  var streams = (w && w.streams) || [];
  var picks = streams.filter(function (it) { return !info.isTv || parseInt(it.e, 10) === info.episode; });
  await runLimited(picks.slice(0, 10).map(function (it) {
    return async function () { if (it.stream) await resolveEmbed(ctx.sink, it.stream, base + "/", "", "ProjectFreeTV", ctx.mediaTitle); };
  }), 4);
}

async function streamHubOneStreams(tmdbId, mediaType, season, episode) {
  var info = await getTmdbMedia(tmdbId, mediaType, season, episode);
  if (!info) return [];
  var sink = new StreamSink("StreamHubOne", "streamhubone");
  var ctx = { info: info, sink: sink, mediaTitle: mediaLabel(info) };
  var tasks = [
    ["Vidlink", spVidlink], ["Vidrock", spVidrock], ["VidEasy", spVideasy], ["XPass", spXpass],
    ["Hexa", shHexa], ["VidZee", shVidzee], ["PrimeSrc", shPrimeSrc], ["ProjectFreeTV", shProjectFreeTv],
    ["Subtitles", spSubtitles]
  ];
  if (["ko", "zh", "cn", "th", "tl"].indexOf(info.lang) >= 0) tasks.push(["KissKH", spKisskh]);
  if (info.isAnime) {
    var anime = await resolveAnime(info);
    if (anime) {
      var actx = { info: info, anime: anime, sink: sink, mediaTitle: ctx.mediaTitle + (info.isTv ? " · Ep " + anime.episode : "") };
      [["ReAnime", srcReAnime], ["AniKage", srcAniKage], ["AniKoto", srcAniKoto], ["Miruro", srcMiruro]].forEach(function (s) {
        tasks.push([s[0], function () { return s[1](actx); }]);
      });
    }
  }
  await withTimeout(runLimited(tasks.map(function (t) {
    return async function () {
      try { await withTimeout(t[1](ctx), 40000, null); } catch (e) { shLog(t[0], "failed", e && e.message); }
    };
  }), 6), 75000, null);
  return sink.result();
}
