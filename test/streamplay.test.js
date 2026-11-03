const nc = require("crypto");
const fs = require("fs");
const vm = require("vm");
const { run, TMDB, check } = require("./harness");

const gcm = (key, plain) => {
  const iv = nc.randomBytes(12);
  const c = nc.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url");
};
// reuse the provider's own keystream to build a VidEasy payload (keystream itself is checked against Java separately)
const c = { Uint8Array, Uint32Array, Math, String, Array, JSON, console };
vm.createContext(c);
vm.runInContext(["core", "crypto", "streamplay"].map((f) => fs.readFileSync(__dirname + "/../src/lib/" + f + ".js", "utf8")).join("\n").replace(/^var SP_[\s\S]*/m, ""), c);
const vidyEnc = (obj, seed, id) => {
  const pt = Buffer.concat([Buffer.from("mvm1"), Buffer.from(JSON.stringify(obj))]);
  const st = c.vidyInit(seed, id), ks = [];
  for (let w = 0; ks.length < pt.length; w++) { const x = c.vidyNext(st, w); for (let k = 0; k < 4; k++) ks.push((x >>> (8 * k)) & 255); }
  return Buffer.from(pt.map((b, i) => b ^ ks[i])).toString("base64url");
};

(async () => {
  const xpassKeyFor = (path, token) => nc.createHash("sha256").update("spv3-data-response|spv3-build-1787821613-50e5fc97c9dce367|" + path + "|" + token).digest();
  const routes = [...TMDB,
    [/enc-dec\.app\/api\/enc-vidlink/, () => ({ body: { result: "ENC1" } })],
    [/vidlink\.pro\/api\/b\/movie\/ENC1/, () => ({ body: { stream: { qualities: { "1080": { url: "https://vl.cdn/1080.mp4" }, "720": { url: "https://vl.cdn/720.mp4" } }, captions: [{ language: "English", url: "https://vl.cdn/en.vtt" }] } } })],
    [/vidrock\.ru\/api\/movie\/1\//, () => ({ body: { Astra: { url: gcm(Buffer.from("7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f", "hex"), "https://vr.cdn/astra/master.m3u8") }, Orion: { url: "error" } } })],
    [/speedracelight\.com\/seed/, () => ({ body: { seed: "S33D" } })],
    [/speedracelight\.com\/cdn\/sources-with-title/, (u) => { if (!/title=Test%2520Movie/.test(u)) throw new Error("title enc " + u); return { body: vidyEnc({ sources: [{ url: "https://ve.cdn/4k.m3u8", quality: "4K" }], subtitles: [{ language: "French", url: "https://ve.cdn/fr.vtt" }] }, "S33D", 1) }; }],
    [/speedracelight\.com\/hdmovie\/sources-with-title/, () => ({ body: vidyEnc({ sources: [{ url: "https://ve.cdn/hi.m3u8", quality: "Hindi 1080p" }, { url: "https://ve.cdn/en.m3u8", quality: "English 1080p" }] }, "S33D", 1) })],
    [/play\.xpass\.top\/e\/movie\/1/, () => ({ body: 'var dataUrl = "/data/abc?token=TK";' })],
    [/play\.xpass\.top\/data\/abc/, () => ({ body: gcm(xpassKeyFor("/data/abc", "TK"), JSON.stringify([{ name: "Alpha", url: "/pl/1" }])) })],
    [/play\.xpass\.top\/pl\/1/, () => ({ body: { playlist: [{ sources: [{ file: "https://xp.cdn/a.m3u8", type: "hls" }] }] } })],
    [/a\.111477\.xyz\/movies\/Test%20Movie%20\(2023\)\//, () => ({ body: '<a href="Test.Movie.2023.2160p.REMUX.mkv">Test.Movie.2023.2160p.REMUX.mkv</a><a href="x.720p.mkv">x.720p.mkv</a>' })],
    [/stremio\.vadapav\.mov\/stream\/movie\/tt1\.json/, () => ({ body: { streams: [{ url: "https://vp.cdn/m.mkv", title: "Test Movie 1080p\nsize" }] } })],
    [/opensubtitles-v3/, () => ({ body: { subtitles: [{ lang: "eng", url: "https://os/1.srt" }] } })]
  ];
  const { streams, log } = await run("streamplay", ["1", "movie"], routes);
  const urls = streams.map((s) => s.url);
  if (process.env.DEBUG) console.log(log.join("\n"));
  check("vidlink", urls.includes("https://vl.cdn/1080.mp4") && urls.includes("https://vl.cdn/720.mp4"), urls);
  check("vidrock gcm", urls.includes("https://vr.cdn/astra/master.m3u8"), urls);
  check("videasy vidy cipher", urls.includes("https://ve.cdn/4k.m3u8"), urls);
  check("videasy hdmovie language filter", urls.includes("https://ve.cdn/hi.m3u8") && urls.includes("https://ve.cdn/en.m3u8"), urls);
  check("xpass", urls.includes("https://xp.cdn/a.m3u8"), urls);
  check("dahmer 2160 only", urls.some((u) => /2160p\.REMUX\.mkv$/.test(u)) && !urls.some((u) => /720p\.mkv$/.test(u)), urls);
  check("vadapav", urls.includes("https://vp.cdn/m.mkv"), urls);
  check("4K sorted first", streams[0].quality === "4K", streams.map((s) => s.quality));
  check("subs merged", (streams[0].subtitles || []).length >= 3, streams[0].subtitles);
  check("no anime calls for non-anime", !log.some((l) => /miruro|anilist/.test(l)));
  console.log(streams.length, "streams");
})();
