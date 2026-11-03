const nc = require("crypto");
const { run, TMDB, check } = require("./harness");
const vidzeeEnc = (url) => {
  const key = Buffer.alloc(32); Buffer.from("A7kP9xM2Qv8Lr4Nz1Ht6Yc3Bw5Jf0DsU").copy(key);
  const iv = nc.randomBytes(16);
  const c = nc.createCipheriv("aes-256-cbc", key, iv);
  const ct = Buffer.concat([c.update(url), c.final()]);
  return Buffer.from(iv.toString("base64") + ":" + ct.toString("base64")).toString("base64");
};
(async () => {
  const routes = [...TMDB,
    [/enc-dec\.app\/api\/enc-hexa/, () => ({ body: { result: { token: "CAP" } } })],
    [/theemoviedb\.hexa\.su\/api\/tmdb\/tv\/2\/season\/1\/episode\/4\/images/, (u, i) => { if (i.headers["X-Cap-Token"] !== "CAP" || !/^[0-9a-f]{64}$/.test(i.headers["X-Api-Key"])) throw new Error("hdr"); return { body: "ENCHEXA" }; }],
    [/enc-dec\.app\/api\/dec-hexa/, (u, i) => { const b = JSON.parse(i.body); if (b.text !== "ENCHEXA" || b.key.length !== 64) throw new Error("body"); return { body: { result: { sources: [{ server: "alpha", url: "https://hx.cdn/a.m3u8" }] } } }; }],
    [/player\.vidzee\.wtf\/api\/server\?id=2&sr=1&ss=1&ep=4/, () => ({ body: { headers: { referer: "https://core.vidzee.wtf/" }, url: [{ link: vidzeeEnc("https://vz.cdn/v.m3u8"), name: "Nflix", lang: "English", type: "hls" }], tracks: [{ lang: "English", url: "https://vz.cdn/en.vtt" }] } })],
    [/player\.vidzee\.wtf/, () => ({ body: { url: [] } })],
    [/primesrc\.me\/api\/v1\/s\?imdb=tt2&season=1&episode=4&type=tv/, () => ({ body: { servers: [{ name: "Filemoon", key: "K1", quality: "1080p" }] } })],
    [/primesrc\.me\/api\/v1\/l\?key=K1/, () => ({ body: { link: "https://filemoon.example/e/xyz" } })],
    [/filemoon\.example\/e\/xyz/, () => ({ body: "<script>eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0({1:\"2://3.4/5.6\"})',7,7,'jwplayer|file|https|fm|cdn|master|m3u8'.split('|')))</script>" })],
    [/fm\.cdn\/master\.m3u8/, () => ({ body: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080\nx.m3u8\n" })],
    [/projectfreetv\.sx\/data\/browse/, (u) => { if (!/keyword=Test\+Show\+-\+season\+1/.test(u)) throw new Error(u); return { body: { movies: [{ _id: "PF1" }] } }; }],
    [/projectfreetv\.sx\/data\/watch\/\?_id=PF1/, () => ({ body: { streams: [{ e: "4", stream: "https://other.host/embed/9" }, { e: "5", stream: "https://other.host/embed/10" }] } })],
    [/other\.host\/embed\/9/, () => ({ body: 'sources: [{file:"https://pf.cdn/ep4.mp4"}]' })],
  ];
  const { streams, log } = await run("streamhubone", ["2", "tv", 1, 4], routes);
  const urls = streams.map((s) => s.url);
  if (process.env.DEBUG) console.log(log.join("\n"));
  check("hexa", urls.includes("https://hx.cdn/a.m3u8"), urls);
  check("vidzee decrypt + referer", urls.includes("https://vz.cdn/v.m3u8") && streams.find((s) => s.url === "https://vz.cdn/v.m3u8").headers.Referer === "https://core.vidzee.wtf/", streams.find((s) => s.url.includes("vz.cdn")));
  check("primesrc -> packed filemoon", urls.includes("https://fm.cdn/master.m3u8"), urls);
  check("projectfreetv episode filter", urls.includes("https://pf.cdn/ep4.mp4") && !log.some((l) => /embed\/10/.test(l)), urls);
  check("anime sources attempted (anime show)", log.some((l) => /arm\.haglund/.test(l)));
  console.log(streams.length, "streams");
})();
