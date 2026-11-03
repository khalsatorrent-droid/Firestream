const { run, TMDB, check } = require("./harness");
(async () => {
  const routes = [...TMDB,
    [/firebaseio/, () => ({ body: { netnaija: "https://netnaija.film/" } })],
    [/subject\/trending/, () => ({ headers: { "x-user": JSON.stringify({ token: "TKN" }) }, body: { code: 0 } })],
    [/subject\/search/, () => ({ body: { data: { items: [
      { title: "Test Show [Hindi]", detailPath: "test-show-hindi", subjectType: 2, releaseDate: "2020-01-01" },
      { title: "Other", detailPath: "other", subjectType: 2 }] } } })],
    [/\/detail\?/, () => ({ body: { data: { subject: { subjectId: "S1", dubs: [
      { subjectId: "S1", detailPath: "test-show", lanName: "Original Audio", original: true, type: 0 },
      { subjectId: "S2", detailPath: "test-show-hindi", lanName: "Hindi dub", type: 0 }] } } } })],
    [/subject\/play/, (u, i) => {
      if (i.headers.Authorization !== "Bearer TKN") throw new Error("no auth");
      const hi = u.includes("S2");
      return { body: { data: {
        streams: [{ id: "st" + (hi ? 2 : 1), url: "https://cdn.x/" + (hi ? "hi" : "orig") + "_1080.mp4", resolutions: "1080", size: "1073741824" },
          { url: "https://cdn.x/vip.mp4", resolutions: "720", vipLocked: true }],
        hls: [{ url: "https://cdn.x/" + (hi ? "hi" : "o") + ".m3u8", resolutions: "720" }] } } };
    }],
    [/subject\/caption/, () => ({ body: { data: { captions: [{ lanName: "English", url: "https://cdn.x/en.srt" }] } } })]
  ];
  const { streams, log } = await run("netnaija", ["2", "tv", 1, 3], routes);
  check("streams returned", streams.length === 4, streams);
  check("play uses season/episode", log.some((l) => /se=1&ep=3/.test(l)), log);
  check("vip skipped", !streams.some((s) => s.url.includes("vip")));
  check("labels", streams.some((s) => /Hindi Dub/.test(s.name)) && streams.some((s) => /Original/.test(s.name)), streams.map((s) => s.name));
  check("subtitles attached", streams[0].subtitles && streams[0].subtitles[0].url === "https://cdn.x/en.srt", streams[0]);
  check("1080 first", streams[0].quality === "1080p", streams[0]);
  const m = await run("netnaija", ["1", "movie"], routes);
  check("movie no match (tv-only results)", m.streams.length === 0, m.streams);
})();
