// @libs core,crypto,inflate,tmdb,hls,anime,embeds,raghav_anime
// RaghavAnime Kitsu — the Kitsu-catalog flavour of RaghavAnime. Same stream sources; titles for
// the title-matched sites come from Kitsu.

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    return await raghavAnimeStreams(tmdbId, mediaType, season, episode, "RaghavAnime Kitsu", "raghavanimekitsu", true);
  } catch (e) {
    console.log("[RaghavAnimeKitsu] error", e && e.message);
    return [];
  }
}
