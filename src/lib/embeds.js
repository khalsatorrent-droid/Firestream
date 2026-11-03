// Embed resolvers shared across providers (MegaPlay family, FlixCloud, packed players, generic).
// Each resolver pushes into a StreamSink and returns true when something was added.

var MEGAPLAY_UA = UA_DESKTOP;
var _megaSeeds = null;

async function megaKeySeeds(base) {
  var fallback = ["i?LMTAx0Q6,:}50U", "W0;27ToaUpl_P%'c"];
  if (_megaSeeds) return [_megaSeeds, fallback];
  var js = await getText(base + "/lib/newclient.min.js", null, 10000);
  var m = js && /[A-Za-z]\w*="([^"]{16})",[A-Za-z]\w*="([^"]{16})"/.exec(js);
  if (m) { _megaSeeds = [m[1], m[2]]; return [_megaSeeds, fallback]; }
  return [fallback];
}

function megaDecrypt(enc, keySeed, ivSeed) {
  try {
    var key = new Uint8Array(32); key.set(utf8Encode(keySeed).subarray(0, 32));
    var iv = new Uint8Array(16); iv.set(utf8Encode(ivSeed).subarray(0, 16));
    return utf8Decode(aesCbcDecrypt(b64ToBytes(enc), key, iv));
  } catch (e) { return null; }
}

function megaMigrate(u) {
  return u && u.indexOf("https://cdn.imgnex.top/anime") >= 0 ? u.replace("https://cdn.imgnex.top/anime", "https://megap.norami.top") : u;
}

var MEGA_TOKEN_KEY = "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
function megaSignUrl(url) {
  var m = /\/([a-f0-9]{32})\/([a-f0-9]{32})\//i.exec(url);
  if (!m) return url;
  var expires = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  var payload = expires + "|" + m[1].toLowerCase() + "/" + m[2].toLowerCase();
  var token = bytesToB64(utf8Encode(payload), true) + "." + bytesToB64(hmacSha256(MEGA_TOKEN_KEY, payload), true);
  return url + (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + token;
}

// returns {m3u8, subtitles:[[label,url]]} or null
async function megaplayResolve(embedUrl, referer) {
  var host = hostOf(embedUrl);
  if (!host) return null;
  var html = await getText(embedUrl, { "User-Agent": MEGAPLAY_UA, "Referer": referer || ("https://" + host + "/") }, 15000);
  if (!html) return null;
  var idm = /data-id=["'](\d+)/.exec(html) || /data-realid=["'](\d+)/.exec(html) || /\/stream\/s-\d+\/(\d+)\//.exec(embedUrl);
  if (!idm) return null;
  var audio = (/\/(dub|sub)(?:[\/?#]|$)/.exec(embedUrl) || /type\s*:\s*['"](dub|sub)['"]/.exec(html) || [0, "sub"])[1];
  var alt = (/data-domain=["']([^"']+)["']/.exec(html) || [])[1];
  var hosts = [host]; if (alt && alt !== host) hosts.push(alt);
  for (var h = 0; h < hosts.length; h++) {
    var base = "https://" + hosts[h];
    var ajax = { "User-Agent": MEGAPLAY_UA, "Accept": "*/*", "X-Requested-With": "XMLHttpRequest", "Origin": base, "Referer": embedUrl };
    var eps = ["getSourcesNew", "getSources"];
    for (var e = 0; e < eps.length; e++) {
      var root = await getJson(base + "/stream/" + eps[e] + "?id=" + idm[1] + "&type=" + audio, ajax, 15000);
      if (!root) continue;
      var src = root.sources, file = null;
      if (src && !Array.isArray(src) && typeof src === "object") file = src.file;
      else if (Array.isArray(src) && src.length) file = src[0].file;
      if (!file && root.enc) {
        var seeds = await megaKeySeeds(base);
        for (var s = 0; s < seeds.length && !file; s++) {
          var plain = megaDecrypt(root.enc, seeds[s][0], seeds[s][1]);
          var fm = plain && /"file"\s*:\s*"([^"]+)"/.exec(plain);
          if (fm) file = fm[1].replace(/\\\//g, "/");
        }
      }
      if (!file) continue;
      file = megaMigrate(file);
      var origin = originOf(file) || "https://megap.norami.top";
      var subs = [];
      (root.tracks || []).forEach(function (t) {
        if (!t || !t.file || (t.kind !== "captions" && t.kind !== "subtitles")) return;
        subs.push([t.label || "English", t.file.replace("https://cdn.imgnex.top/anime", origin)]);
      });
      return { m3u8: file, subtitles: subs };
    }
  }
  return null;
}

// adds all variants (signed) of a megaplay master
async function megaplayEmit(sink, sourceTag, label, m3u8, referer, subtitles, mediaTitle) {
  var headers = { "User-Agent": MEGAPLAY_UA, "Referer": referer };
  var signed = megaSignUrl(m3u8);
  var text = await getText(signed, headers, 15000);
  var found = false;
  var variants = text ? parseMaster(text, m3u8) : [];
  if (variants.length) {
    variants.forEach(function (v) {
      sink.add({ url: megaSignUrl(v.url), source: sourceTag, label: label, quality: v.height || null, headers: headers, title: mediaTitle, type: "m3u8" });
    });
    found = true;
  } else if (text && text.indexOf("#EXTM3U") >= 0) {
    sink.add({ url: signed, source: sourceTag, label: label, headers: headers, title: mediaTitle, type: "m3u8" });
    found = true;
  }
  (subtitles || []).forEach(function (s) { sink.sub(s[0], s[1], headers); });
  return found;
}

async function resolveMegaplayFamily(sink, embedUrl, referer, label, sourceTag, mediaTitle) {
  var st = await megaplayResolve(embedUrl, referer);
  if (!st) return false;
  return megaplayEmit(sink, sourceTag, label, st.m3u8, "https://" + hostOf(embedUrl) + "/", st.subtitles, mediaTitle);
}

// FlixCloud: one MKV containing all audio/sub tracks; token is IP bound so it's minted on-device
async function flixcloudResolve(embedUrl) {
  var id = (/\/e\/([a-z0-9]+)/i.exec(embedUrl) || [])[1];
  if (!id) return null;
  var base = "https://flixcloud.cc";
  var headers = { "User-Agent": UA_MOBILE, "Referer": base + "/", "Accept": "*/*" };
  var body = await getText(base + "/d/" + id + "/__data.json", headers, 12000);
  if (!body) return null;
  var fileId = (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(body) || [])[0];
  var token = (/eyJ[\w-]+\.[\w-]+\.[\w-]+/.exec(body) || [])[0];
  if (!fileId || !token) return null;
  var host = (/https:\/\/[a-z0-9-]+\.flixcloud\.cc/i.exec(body) || [base])[0];
  var prog = await getText(host + "/download/" + fileId + "/progress?token=" + token, headers, 10000);
  if (!prog || prog.indexOf('"ready"') < 0) return null;
  return {
    url: host + "/download/" + fileId + "?token=" + token,
    quality: parseInt((/(\d{3,4})p/.exec(body) || [])[1], 10) || null,
    size: (/"(\d+(?:\.\d+)?\s*[KMG]B)"/i.exec(body) || [])[1] || null,
    headers: { "User-Agent": UA_MOBILE, "Referer": base + "/" }
  };
}

var M3U8_RE = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/;
var MP4_RE = /https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/;

function passSubtitleFromQuery(sink, embedUrl) {
  var q = embedUrl.split("?")[1];
  if (!q) return;
  var s = /(?:^|&)(?:sub|caption_1|c1_file)=([^&]+)/.exec(q);
  if (!s) return;
  var l = /(?:^|&)(?:sub_1|c1_label)=([^&]+)/.exec(q);
  try { sink.sub(l ? decodeURIComponent(l[1]) : "English", decodeURIComponent(s[1])); } catch (e) {}
}

// Generic: look for m3u8/mp4 in the page or its packed JS. Covers most "file:" style players
// (streamwish/filemoon/vidhide/kwik/voe-like clones).
async function resolveGenericEmbed(sink, embedUrl, referer, label, sourceTag, mediaTitle) {
  var html = await getText(embedUrl, { "User-Agent": UA_DESKTOP, "Referer": referer || embedUrl }, 15000);
  if (!html) return false;
  var hay = html + "\n" + findPackedAndUnpack(html);
  // voe hides a base64 redirect / json
  var voe = /'hls'\s*:\s*'([^']+)'/.exec(hay);
  if (voe) { try { hay += "\n" + b64decodeString(voe[1]); } catch (e) {} }
  var fileM = /(?:file|src|source)\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/.exec(hay);
  var u = fileM ? fileM[1] : null;
  if (!u) { var mm = M3U8_RE.exec(hay) || MP4_RE.exec(hay); u = mm ? mm[0] : null; }
  if (!u) return false;
  u = absUrl(u.replace(/\\\//g, "/"), embedUrl);
  var headers = { "User-Agent": UA_DESKTOP, "Referer": "https://" + hostOf(embedUrl) + "/", "Origin": "https://" + hostOf(embedUrl) };
  var q = null;
  if (/\.m3u8/.test(u)) q = await probeHlsQuality(u, headers);
  sink.add({ url: u, source: sourceTag, label: label, quality: q || label, headers: headers, title: mediaTitle });
  var tm = /tracks\s*:\s*\[([^\]]+)\]/.exec(hay);
  if (tm) {
    var re = /file\s*:\s*["']([^"']+\.(?:vtt|srt)[^"']*)["'][^}]*?label\s*:\s*["']([^"']+)["']/g, x;
    while ((x = re.exec(tm[1]))) sink.sub(x[2], absUrl(x[1], embedUrl));
  }
  return true;
}

async function resolveEmbed(sink, embedUrl, referer, label, sourceTag, mediaTitle) {
  if (!embedUrl) return false;
  if (embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
  var host = hostOf(embedUrl);
  try {
    if (/megaplay|vidwish\.live|vidtube\.site/.test(host)) return await resolveMegaplayFamily(sink, embedUrl, referer, label, sourceTag, mediaTitle);
    if (/flixcloud\.cc$/.test(host)) {
      var f = await flixcloudResolve(embedUrl);
      if (!f) return false;
      sink.add({ url: f.url, source: sourceTag, label: label + " (Multi-audio MKV)", quality: f.quality, size: f.size, headers: f.headers, title: mediaTitle, type: "mkv" });
      return true;
    }
    passSubtitleFromQuery(sink, embedUrl);
    return await resolveGenericEmbed(sink, embedUrl, referer, label, sourceTag, mediaTitle);
  } catch (e) {
    return false;
  }
}
