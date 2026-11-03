// HLS helpers + remote domain lists

// parse a master playlist into [{url, height, bandwidth}]
function parseMaster(text, masterUrl) {
  var out = [];
  if (!text || text.indexOf("#EXT-X-STREAM-INF") < 0) return out;
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
    var j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].trim().charAt(0) === "#")) j++;
    if (j >= lines.length) break;
    var res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
    var bw = /BANDWIDTH=(\d+)/.exec(line);
    out.push({ url: absUrl(lines[j].trim(), masterUrl), height: res ? parseInt(res[2], 10) : 0, bandwidth: bw ? parseInt(bw[1], 10) : 0 });
    i = j;
  }
  return out;
}

// fetch a master playlist and return best quality label (or null)
async function probeHlsQuality(url, headers) {
  var t = await getText(url, headers, 8000);
  if (!t) return null;
  var v = parseMaster(t, url);
  if (!v.length) return null;
  var best = v.reduce(function (a, b) { return b.height > a.height ? b : a; }, v[0]);
  return best.height ? qualityFrom(best.height) : null;
}

var _remoteDomains = {};
async function remoteDomains(url) {
  if (_remoteDomains[url]) return _remoteDomains[url];
  var j = await getJson(url, null, 6000);
  var map = {};
  if (j && typeof j === "object") {
    Object.keys(j).forEach(function (k) {
      var v = j[k];
      if (typeof v === "string" && v) map[k] = v.replace(/\/+$/, "");
    });
  }
  _remoteDomains[url] = map;
  return map;
}

// Firebase domain list used by Raghav's extensions
async function raghavDomain(key, fallback) {
  var m = await remoteDomains("https://cloudstreampluginhelper-default-rtdb.firebaseio.com/.json");
  return m[key] || m[key + "_url"] || m[key + "_domain"] || fallback;
}

// Unpack Dean Edwards p.a.c.k.e.r. javascript
function unpackJs(src) {
  var m = /}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/.exec(src);
  if (!m) return null;
  var payload = m[1].replace(/\\'/g, "'"), radix = parseInt(m[2], 10), count = parseInt(m[3], 10), words = m[4].split("|");
  function base(n) {
    var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (n < radix) return chars.charAt(n);
    return base(Math.floor(n / radix)) + chars.charAt(n % radix);
  }
  var dict = {};
  while (count--) { var k = base(count); dict[k] = words[count] || k; }
  return payload.replace(/\b\w+\b/g, function (w) { return dict[w] !== undefined ? dict[w] : w; });
}

function findPackedAndUnpack(html) {
  var out = [];
  var re = /eval\(function\(p,a,c,k,e,(?:r|d)\)[\s\S]*?\.split\('\|'\)[^)]*\)\)/g, m;
  while ((m = re.exec(html))) { var u = unpackJs(m[0]); if (u) out.push(u); }
  return out.join("\n");
}
