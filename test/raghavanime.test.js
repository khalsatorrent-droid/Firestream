const zlib = require("zlib");
const nc = require("crypto");
const { run, TMDB, check } = require("./harness");

const XOR = [0x71, 0x95, 0x10, 0x34, 0xF8, 0xFB, 0xCF, 0x53, 0xD8, 0x9D, 0xB5, 0x2C, 0xEB, 0x3D, 0xC2, 0x2C];
const pipeEncode = (obj, xor) => {
  let b = zlib.gzipSync(Buffer.from(JSON.stringify(obj)));
  if (xor) b = Buffer.from(b.map((x, i) => x ^ XOR[i % 16]));
  return b.toString("base64url");
};
// megaplay enc: AES-256-CBC with zero-padded seeds
const megaEnc = (plain) => {
  const key = Buffer.alloc(32); Buffer.from("i?LMTAx0Q6,:}50U").copy(key);
  const iv = Buffer.from("W0;27ToaUpl_P%'c");
  const c = nc.createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([c.update(plain), c.final()]).toString("base64");
};

(async () => {
  const routes = [...TMDB,
    [/firebaseio/, () => ({ body: {} })],
    [/arm\.haglund\.dev/, () => ({ body: [{ anilist: 101 }, { anilist: 202 }] })],
    [/graphql\.anilist\.co/, () => ({ body: { data: { Page: { media: [
      { id: 101, idMal: 1, format: "TV", episodes: 12, startDate: { year: 2020, month: 1 }, title: { english: "Test Show", romaji: "Tesuto" } },
      { id: 202, idMal: 2, format: "TV", episodes: 12, startDate: { year: 2021, month: 1 }, title: { english: "Test Show Season 2", romaji: "Tesuto 2" } }] } } } })],
    [/api\.ani\.zip\/mappings\?anilist_id=202/, () => ({ body: { mappings: { kitsu_id: 55 }, episodes: { "1": { seasonNumber: 2, episodeNumber: 1 }, "3": { seasonNumber: 2, episodeNumber: 3 } } } })],
    [/api\.ani\.zip\/mappings\?anilist_id=101/, () => ({ body: { episodes: { "1": { seasonNumber: 1, episodeNumber: 1 } } } })],
    // Miruro pipe
    [/miruro\.ru\/api\/secure\/pipe/, (u) => {
      const req = JSON.parse(Buffer.from(new URL(u).searchParams.get("e"), "base64url").toString());
      if (req.path === "episodes") return { body: pipeEncode({ providers: { kiwi: { episodes: { sub: [{ id: "k3", number: 3 }], dub: [{ id: "k3d", number: 3 }] } } } }) };
      return { headers: { "x-obfuscated": "2" }, body: pipeEncode({ streams: [{ url: "https://m.cdn/" + req.query.episodeId + ".m3u8", type: "hls", quality: "1080p" }], subtitles: [{ url: "https://m.cdn/en.vtt", lang: "English" }] }, true) };
    }],
    // Re:ANIME -> flixcloud
    [/reanime\.to\/api\/flix\/202\/3/, () => ({ body: { servers: [{ dataLink: "https://flixcloud.cc/e/abc123" }, { dataLink: "https://flixcloud.cc/e/abc123" }] } })],
    [/flixcloud\.cc\/d\/abc123\/__data\.json/, () => ({ body: '{"x":"12345678-1234-1234-1234-123456789abc","t":"eyJa.eyJb.sig","h":"https://s1.flixcloud.cc","q":"1080p","s":"1.2 GB"}' })],
    [/s1\.flixcloud\.cc\/download\/.*progress/, () => ({ body: '{"status":"ready"}' })],
    // Kyren -> megaplay embed (enc)
    [/kyren\.moe\/api\/stream/, (u) => ({ body: /server=megaplay$/.test(u) && u.includes("lang=sub") ? { ok: true, sources: [{ url: "https://megaplay.buzz/stream/s-2/999/sub", type: "embed", provider: "megaplay" }] } : { ok: false } })],
    [/megaplay\.buzz\/stream\/s-2\/999\/sub$/, () => ({ body: '<div data-id="999"></div>' })],
    [/megaplay\.buzz\/lib\/newclient/, () => ({ body: "nothing" })],
    [/megaplay\.buzz\/stream\/getSourcesNew/, () => ({ body: { enc: megaEnc('{"file":"https://cdn.imgnex.top/anime/0123456789abcdef0123456789abcdef/fedcba9876543210fedcba9876543210/master.m3u8"}'), tracks: [{ kind: "captions", file: "https://cdn.imgnex.top/anime/sub.vtt", label: "English" }] } })],
    [/megap\.norami\.top\/.*master\.m3u8\?token=/, () => ({ body: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080\n1080/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720\n720/index.m3u8\n" })],
    // AniKoto
    [/anikototv\.to\/filter/, () => ({ body: '<div class="item"><a href="/watch/test-show-s2" class="name d-title">Test Show Season 2</a></div>' })],
    [/anikototv\.to\/watch\/test-show-s2/, () => ({ body: '<div id="watch-main" data-id="77"></div>' })],
    [/anikototv\.to\/ajax\/episode\/list\/77/, () => ({ body: { status: 200, result: '<a data-ids="AA&amp;BB" data-num="3" data-sub="1">x</a>' } })],
    [/anikototv\.to\/ajax\/server\/list/, (u) => { if (!u.includes(encodeURIComponent("AA&BB"))) throw new Error("ids"); return { body: { status: 200, result: '<div class="type" data-type="sub"><ul><li data-link-id="L1">HD-1</li></ul></div>' } }; }],
    [/anikototv\.to\/ajax\/server\?get=L1/, () => ({ body: { status: 200, result: { url: "https://player.x/e/1#" + Buffer.from("https://vault-01.uwucdn.top/a/master.m3u8").toString("base64") } } })],
  ];
  const { streams, log } = await run("raghavanime", ["2", "tv", 2, 3], routes);
  const urls = streams.map((s) => s.url);
  if (process.env.DEBUG) console.log(log.filter((l) => new RegExp(process.env.DEBUG).test(l)).join("\n"));
  check("mapped via ani.zip to anilist 202 ep 3", log.some((l) => /reanime\.to\/api\/flix\/202\/3/.test(l)), log.filter((l) => /reanime/.test(l)));
  check("miruro sub+dub", urls.includes("https://m.cdn/k3.m3u8") && urls.includes("https://m.cdn/k3d.m3u8"), urls);
  check("flixcloud mkv once", urls.filter((u) => u.includes("flixcloud.cc/download/12345678")).length === 1, urls);
  check("megaplay signed variants", urls.filter((u) => /megap\.norami\.top\/.*\/1080\/index\.m3u8\?token=/.test(u)).length === 1, urls);
  check("anikoto hash m3u8 remapped", urls.includes("https://uwu1.bigdreamsmalldih.site/a/master.m3u8"), urls);
  check("subtitles present", streams[0].subtitles && streams[0].subtitles.length >= 1, streams[0]);
  check("all have provider id", streams.every((s) => s.provider === "raghavanime"));
  console.log(streams.length, "streams;", streams.map((s) => s.name).join(" / "));
  const k = await run("raghavanimekitsu", ["2", "tv", 2, 3], routes);
  check("kitsu flavour returns streams", k.streams.length === streams.length, k.streams.length);
})();
