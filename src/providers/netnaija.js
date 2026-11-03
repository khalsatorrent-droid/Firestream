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
    if (!xu) return;
    var t = JSON.parse(xu).token;
    if (t) nnToken = t;
  } catch (e) {}
}

async function nnEnsureToken(mainUrl) {
  if (nnToken) return nnToken;
  var h = nnBaseHeaders(mainUrl);
  h["X-Client-Token"] = nnClientToken();
  var res = await getFull(NN_API + "/subject/trending?page=1&perPage=1", { headers: h, timeout: 10000 });
  nnGrabToken(res);
  return nnToken || "";
}

async function nnAuthHeaders(mainUrl, extra) {
  var token = await nnEnsureToken(mainUrl);
  var h = nnBaseHeaders(mainUrl);
  if (token) {
    h["Cookie"] = "token=" + token;
    h["Authorization"] = "Bearer " + token;
  } else {
    h["X-Client-Token"] = nnClientToken();
  }
  return Object.assign(h, extra || {});
}

function nnSourceLabel(dub) {
  if (!dub || !dub.lanName) return null;
  if (dub.original) return "Original";
  var base = dub.lanName.split(" dub")[0].split(" sub")[0].trim();
  if (!base) return null;
  var low = base.toLowerCase();
  var pretty = low === "ptbr" ? "PT-BR" : low === "esla" ? "ES-LA" : base.charAt(0).toUpperCase() + base.slice(1);
  return dub.type === 1 ? pretty + " Hardsub" : pretty + " Dub";
}

async function nnSearch(mainUrl, query) {
  var h = await nnAuthHeaders(mainUrl, { "Content-Type": "application/json" });
  var res = await getFull(NN_API + "/subject/search", {
    method: "POST", headers: h, timeout: 12000,
    body: JSON.stringify({ keyword: query, page: 1, perPage: 20 })
  });
  nnGrabToken(res);
  var j = res ? parseJsonSafe(res.text) : null;
  return (j && j.data && j.data.items) || [];
}

function nnScore(item, info) {
  if (!item || !item.title || !item.detailPath) return -1;
  var wantType = info.isTv ? 2 : 1;
  if (item.subjectType && item.subjectType !== wantType) return -1;
  // titles on this site often carry a "[Hindi]" / "S1" suffix — score the cleaned name
  var t = item.title.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\bS\d+(-S?\d+)?\b/ig, " ");
  var best = 0;
  titleCandidates(info).forEach(function (c) { best = Math.max(best, titleSimilarity(t, c)); });
  if (best < 0.6) return -1;
  var y = item.releaseDate ? parseInt(item.releaseDate.substring(0, 4), 10) : null;
  if (y && info.year && !info.isTv && Math.abs(y - info.year) > 1) return -1;
  if (y && info.year && y === info.year) best += 0.2;
  return best;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var info = await getTmdbMedia(tmdbId, mediaType, season, episode);
    if (!info) return [];
    var mainUrl = await raghavDomain("netnaija", "https://netnaija.film");
    var sink = new StreamSink("NetNaija", "netnaija");

    var items = await nnSearch(mainUrl, info.title);
    if (!items.length && info.originalTitle && info.originalTitle !== info.title) items = await nnSearch(mainUrl, info.originalTitle);
    var scored = items.map(function (it) { return { it: it, s: nnScore(it, info) }; })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return b.s - a.s; });
    if (!scored.length) { nnLog("no match for", info.title); return []; }

    // a show can be listed several times (one per language); collect dubs from the top matches
    var dubs = [], seenSubject = {};
    for (var i = 0; i < Math.min(3, scored.length); i++) {
      var path = scored[i].it.detailPath;
      var dres = await getFull(NN_API + "/detail?detailPath=" + encodeURIComponent(path), { headers: await nnAuthHeaders(mainUrl), timeout: 12000 });
      nnGrabToken(dres);
      var d = dres ? parseJsonSafe(dres.text) : null;
      var subject = d && d.data && d.data.subject;
      if (!subject) continue;
      var list = subject.dubs && subject.dubs.length ? subject.dubs : [{ subjectId: subject.subjectId, detailPath: path, lanName: "Original Audio", lanCode: "en", type: 0, original: true }];
      list.forEach(function (dub) {
        if (dub && dub.subjectId && dub.detailPath && !seenSubject[dub.subjectId]) {
          seenSubject[dub.subjectId] = true;
          dubs.push(dub);
        }
      });
      if (i === 0 && scored.length > 1 && scored[1].s < scored[0].s - 0.15) break;
    }

    var se = info.isTv ? info.season : 0, ep = info.isTv ? info.episode : 0;
    var playHeaders = { "Referer": mainUrl + "/", "Origin": mainUrl, "User-Agent": UA_MOBILE };
    var captionFrom = null;

    await runLimited(dubs.map(function (dub) {
      return async function () {
        var label = nnSourceLabel(dub);
        if (!label) return;
        var h = await nnAuthHeaders(mainUrl, { "X-Source": "webNetnaijaSite", "Referer": mainUrl + "/videoPlayPage/" + dub.detailPath });
        var url = NN_API + "/subject/play?subjectId=" + dub.subjectId + "&se=" + se + "&ep=" + ep + "&detailPath=" + encodeURIComponent(dub.detailPath);
        var res = await getFull(url, { headers: h, timeout: 12000 });
        nnGrabToken(res);
        var j = res ? parseJsonSafe(res.text) : null;
        var data = j && j.data;
        if (!data) return;
        (data.streams || []).forEach(function (s) {
          if (!s.url || !s.resolutions || s.vipLocked) return;
          sink.add({
            url: s.url, source: label, label: s.resolutions + "p" + (s.codecName ? " " + s.codecName : ""),
            quality: parseInt(s.resolutions, 10), size: formatBytes(s.size), headers: playHeaders,
            title: mediaLabel(info), lang: label
          });
          if (s.id && (dub.original || !captionFrom)) captionFrom = { id: s.id, subjectId: dub.subjectId, detailPath: dub.detailPath };
        });
        (data.hls || []).forEach(function (s) {
          if (!s.url) return;
          sink.add({ url: s.url, source: label, label: "HLS", quality: parseInt(s.resolutions, 10) || null, headers: playHeaders, title: mediaLabel(info), type: "m3u8" });
        });
      };
    }), 4);

    if (captionFrom) {
      var ch = await nnAuthHeaders(mainUrl, { "X-Source": "webNetnaijaSite" });
      var cj = await getJson(NN_API + "/subject/caption?format=MP4&id=" + captionFrom.id + "&subjectId=" + captionFrom.subjectId + "&detailPath=" + encodeURIComponent(captionFrom.detailPath), ch, 10000);
      ((cj && cj.data && cj.data.captions) || []).forEach(function (c) { if (c.url) sink.sub(c.lanName || c.lan, c.url); });
    }
    return sink.result();
  } catch (e) {
    nnLog("error", e && e.message);
    return [];
  }
}
