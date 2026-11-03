// @libs core,crypto,inflate,tmdb,hls,anime,embeds,raghav_anime,streamplay,streamhub
// StreamHubOne — port of the Desi repo's StreamHubOne multi-source aggregator.

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    return await streamHubOneStreams(tmdbId, mediaType, season, episode);
  } catch (e) {
    console.log("[StreamHubOne] error", e && e.message);
    return [];
  }
}
