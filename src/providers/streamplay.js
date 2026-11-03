// @libs core,crypto,inflate,tmdb,hls,anime,embeds,raghav_anime,streamplay
// StreamPlay — port of phisher98's StreamPlay multi-source aggregator (movies, TV, anime, Asian drama).

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    return await streamPlayStreams(tmdbId, mediaType, season, episode);
  } catch (e) {
    console.log("[StreamPlay] error", e && e.message);
    return [];
  }
}
