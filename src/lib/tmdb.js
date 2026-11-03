// TMDB lookup shared by all providers.
var TMDB_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var TMDB_API = "https://api.themoviedb.org/3";

async function resolveTmdbId(id, mediaType) {
  var s = String(id || "").trim();
  if (/^tt\d+/i.test(s)) {
    var f = await getJson(TMDB_API + "/find/" + s + "?api_key=" + TMDB_KEY + "&external_source=imdb_id");
    var list = f ? (mediaType === "tv" ? f.tv_results : f.movie_results) : null;
    if ((!list || !list.length) && f) list = mediaType === "tv" ? f.movie_results : f.tv_results;
    return list && list.length ? String(list[0].id) : null;
  }
  s = s.replace(/^tmdb:/i, "").split(":")[0];
  return /^\d+$/.test(s) ? s : null;
}

// Returns media info or null.
async function getTmdbMedia(id, mediaType, season, episode) {
  var isTv = mediaType === "tv" || mediaType === "series";
  var tmdbId = await resolveTmdbId(id, isTv ? "tv" : "movie");
  if (!tmdbId) return null;
  var d = await getJson(TMDB_API + "/" + (isTv ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&append_to_response=external_ids,alternative_titles");
  if (!d || d.success === false) return null;
  var title = isTv ? (d.name || d.original_name) : (d.title || d.original_title);
  var date = isTv ? d.first_air_date : d.release_date;
  var alts = [];
  var at = d.alternative_titles && (d.alternative_titles.titles || d.alternative_titles.results);
  if (at) at.forEach(function (t) { if (t && t.title) alts.push(t.title); });
  var info = {
    tmdbId: tmdbId,
    isTv: isTv,
    type: isTv ? "tv" : "movie",
    title: title || "",
    originalTitle: (isTv ? d.original_name : d.original_title) || "",
    year: date ? parseInt(date.substring(0, 4), 10) : null,
    date: date || null,
    imdbId: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null,
    tvdbId: d.external_ids && d.external_ids.tvdb_id || null,
    lang: d.original_language || "",
    genres: (d.genres || []).map(function (g) { return g.name; }),
    genreIds: (d.genres || []).map(function (g) { return g.id; }),
    countries: d.origin_country || (d.production_countries || []).map(function (c) { return c.iso_3166_1; }),
    altTitles: alts,
    seasons: d.seasons || [],
    runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null,
    season: isTv ? (parseInt(season, 10) || 1) : null,
    episode: isTv ? (parseInt(episode, 10) || 1) : null,
    episodeAirDate: null,
    absoluteEpisode: null
  };
  info.isAnime = info.genreIds.indexOf(16) >= 0 && (info.lang === "ja" || info.countries.indexOf("JP") >= 0);
  if (isTv) {
    var ep = await getJson(TMDB_API + "/tv/" + tmdbId + "/season/" + info.season + "/episode/" + info.episode + "?api_key=" + TMDB_KEY);
    if (ep && ep.air_date) info.episodeAirDate = ep.air_date;
    // absolute episode number across regular seasons (useful for long-running anime)
    var abs = 0;
    (info.seasons || []).forEach(function (s) {
      if (s.season_number > 0 && s.season_number < info.season) abs += s.episode_count || 0;
    });
    info.absoluteEpisode = abs + info.episode;
  }
  return info;
}

function mediaLabel(info) {
  if (!info) return "";
  var t = info.title + (info.year ? " (" + info.year + ")" : "");
  if (info.isTv) t += " S" + pad2(info.season) + "E" + pad2(info.episode);
  return t;
}

function titleCandidates(info) {
  var list = [info.title, info.originalTitle].concat(info.altTitles || []);
  var seen = {}, out = [];
  list.forEach(function (t) {
    if (!t) return;
    var k = cleanTitle(t);
    if (!k || seen[k]) return;
    seen[k] = true; out.push(t);
  });
  return out;
}
