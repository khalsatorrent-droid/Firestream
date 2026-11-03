// @libs core,crypto,inflate,tmdb,hls,anime,embeds,raghav_anime
// RaghavAnime — port of Raghav's "one stop" anime aggregator (TMDB -> AniList mapping, sub + dub).

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    return await raghavAnimeStreams(tmdbId, mediaType, season, episode, "RaghavAnime", "raghavanime", false);
  } catch (e) {
    console.log("[RaghavAnime] error", e && e.message);
    return [];
  }
}
