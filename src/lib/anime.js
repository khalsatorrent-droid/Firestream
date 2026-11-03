// TMDB -> AniList/MAL mapping for anime providers.
var ANILIST_GQL = "https://graphql.anilist.co";

async function anilistQuery(query, variables) {
  var res = await getFull(ANILIST_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA_MOBILE },
    body: JSON.stringify({ query: query, variables: variables || {} }),
    timeout: 12000
  });
  var j = res ? parseJsonSafe(res.text) : null;
  return j && j.data ? j.data : null;
}

var AL_FIELDS = "id idMal format episodes seasonYear status synonyms startDate { year month day } title { romaji english native }";

async function anilistByIds(ids) {
  if (!ids.length) return [];
  var d = await anilistQuery("query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){" + AL_FIELDS + "}}}", { ids: ids });
  return d && d.Page ? d.Page.media || [] : [];
}

async function anilistSearch(search, format) {
  var d = await anilistQuery("query($s:String){Page(perPage:15){media(search:$s,type:ANIME,sort:SEARCH_MATCH){" + AL_FIELDS + "}}}", { s: search });
  var list = d && d.Page ? d.Page.media || [] : [];
  if (format === "MOVIE") list = list.filter(function (m) { return m.format === "MOVIE"; }).concat(list.filter(function (m) { return m.format !== "MOVIE"; }));
  return list;
}

function alStart(m) {
  var s = m.startDate || {};
  return (s.year || 9999) * 10000 + (s.month || 0) * 100 + (s.day || 0);
}

function alTitles(m) {
  var t = m.title || {};
  return [t.english, t.romaji, t.native].concat(m.synonyms || []).filter(Boolean);
}

async function armIds(info) {
  var ids = {};
  var urls = [
    "https://arm.haglund.dev/api/v2/themoviedb?id=" + info.tmdbId,
    info.imdbId ? "https://arm.haglund.dev/api/v2/imdb?id=" + info.imdbId : null,
    info.tvdbId && info.isTv ? "https://arm.haglund.dev/api/v2/thetvdb?id=" + info.tvdbId : null
  ].filter(Boolean);
  var results = await Promise.all(urls.map(function (u) { return getJson(u, { "Accept": "application/json" }, 8000); }));
  results.forEach(function (r) {
    if (!r) return;
    (Array.isArray(r) ? r : [r]).forEach(function (e) { if (e && e.anilist) ids[e.anilist] = true; });
  });
  return Object.keys(ids).map(function (x) { return parseInt(x, 10); });
}

async function aniZip(anilistId) {
  return getJson("https://api.ani.zip/mappings?anilist_id=" + anilistId, { "Accept": "application/json" }, 8000);
}

// Returns { anilistId, malId, kitsuId, episode, title, jpTitle, titles, year, format } or null
async function resolveAnime(info) {
  var ids = await armIds(info);
  var media = await anilistByIds(ids.slice(0, 40));
  if (!media.length) {
    // fall back to a title search on AniList
    var tries = [info.title, info.originalTitle].filter(Boolean);
    for (var i = 0; i < tries.length && !media.length; i++) {
      var found = await anilistSearch(tries[i], info.isTv ? null : "MOVIE");
      media = found.filter(function (m) {
        var best = 0;
        alTitles(m).forEach(function (t) { best = Math.max(best, titleSimilarity(t, tries[i])); });
        return best >= 0.6;
      });
    }
  }
  if (!media.length) return null;

  var pick = null, epNum = info.isTv ? info.episode : 1;

  if (!info.isTv) {
    var movies = media.filter(function (m) { return m.format === "MOVIE"; });
    var pool = movies.length ? movies : media;
    pool.sort(function (a, b) {
      var ya = Math.abs((a.seasonYear || (a.startDate || {}).year || 0) - (info.year || 0));
      var yb = Math.abs((b.seasonYear || (b.startDate || {}).year || 0) - (info.year || 0));
      return ya - yb;
    });
    pick = pool[0];
  } else {
    var series = media.filter(function (m) { return m.format !== "MOVIE" && m.format !== "MUSIC"; });
    if (!series.length) series = media;
    series.sort(function (a, b) { return alStart(a) - alStart(b); });

    // 1) exact match through ani.zip episode tables (tvdb numbering ≈ tmdb numbering)
    if (series.length > 1 || info.season > 1) {
      var zips = await Promise.all(series.slice(0, 12).map(function (m) { return aniZip(m.id); }));
      for (var z = 0; z < zips.length && !pick; z++) {
        var eps = zips[z] && zips[z].episodes;
        if (!eps) continue;
        for (var key in eps) {
          var e = eps[key];
          if (!e || !/^\d+$/.test(key)) continue;
          var bySeason = e.seasonNumber === info.season && e.episodeNumber === info.episode;
          var byDate = info.episodeAirDate && e.airDate === info.episodeAirDate && (e.seasonNumber == null || e.seasonNumber === info.season);
          if (bySeason || byDate) { pick = series[z]; epNum = parseInt(key, 10); break; }
        }
      }
    }
    // 2) season index / absolute episode walk
    if (!pick) {
      var tv = series.filter(function (m) { return m.format === "TV" || m.format === "ONA" || m.format === "TV_SHORT"; });
      if (!tv.length) tv = series;
      if (info.season > 1 && tv[info.season - 1]) {
        pick = tv[info.season - 1]; epNum = info.episode;
      } else {
        var remaining = info.season > 1 ? (info.absoluteEpisode || info.episode) : info.episode;
        for (var t = 0; t < tv.length; t++) {
          var count = tv[t].episodes || 0;
          if (!count || remaining <= count || t === tv.length - 1) { pick = tv[t]; epNum = remaining; break; }
          remaining -= count;
        }
      }
    }
  }
  if (!pick) return null;
  var tt = pick.title || {};
  var kitsuId = null;
  try {
    var zz = await aniZip(pick.id);
    if (zz && zz.mappings) kitsuId = zz.mappings.kitsu_id || null;
  } catch (e) {}
  return {
    anilistId: pick.id,
    malId: pick.idMal || null,
    kitsuId: kitsuId,
    episode: epNum,
    title: tt.english || tt.romaji || info.title,
    romaji: tt.romaji || null,
    jpTitle: tt.romaji || tt.native || null,
    native: tt.native || null,
    titles: alTitles(pick).concat([info.title, info.originalTitle]).filter(Boolean),
    year: pick.seasonYear || (pick.startDate || {}).year || info.year,
    format: pick.format,
    totalEpisodes: pick.episodes || null
  };
}
