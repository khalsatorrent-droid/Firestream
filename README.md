# Firestream — Nuvio Plugins

Local scrapers for the [Nuvio](https://github.com/NuvioMedia) app, ported from popular CloudStream extensions.

## Install

1. Open **Nuvio** → **Settings → Local Scrapers**
2. Add this repository URL:
   ```
   https://raw.githubusercontent.com/khalsatorrent-droid/Firestream/refs/heads/main/manifest.json
   ```
3. Enable the scrapers you want.

## Scrapers

| Scraper | Ported from | Content | What's inside |
|---|---|---|---|
| **StreamPlay** | phisher98 · StreamPlay | Movies, TV, Anime, Asian drama | Vidlink, Vidrock, VidEasy (9 servers), XPass, DahmerMovies, Vadapav, OpenSubtitles · Anime: Miruro, AniKage, AniKoto, Anidap, Ani.pm, Kyren, ReAnime, AniNami · KissKH |
| **StreamHubOne** | Faisal0786 · Desi · StreamHubOne | Movies, TV, Anime | Hexa, VidZee, PrimeWire (PrimeSrc), ProjectFreeTV, Vidlink, Vidrock, VidEasy, XPass, KissKH, OpenSubtitles · Anime: ReAnime, AniKage, AniKoto, Miruro |
| **RaghavAnime** | KSHITIJ8473 · raghav · RaghavAnime | Anime (sub + dub) | Miruro, AniKage, Anidap, Ani.pm, AniNami, VidHawk, Kyren, Re:ANIME, Anv, AniKoto |
| **RaghavAnime Kitsu** | KSHITIJ8473 · raghav · RaghavAnimeKitsu | Anime (sub + dub) | Same engine; titles for matching come from Kitsu. Disabled by default — enable one of the two. |
| **NetNaija** | KSHITIJ8473 · raghav · NetNaija | Movies, TV, Anime | Every audio track (Original, Hindi/Tamil/Telugu/… dubs) as its own stream, plus subtitles |

### Not ported

Some sub-sources of the original extensions depend on Android-only pieces (WebView, Cloudflare solving, a local
segment-decrypting proxy) that a Nuvio JS plugin can't run: AniSuge, AniWaves, 2DHive, GoTaku, Senshi, Xanime and the
AniChan server list. The HubCloud/GDFlix-style Indian download sites (HDHub4u, 4KHDHub, MoviesDrive, UHDMovies, Vegamovies…)
are not part of these ports.

## Development

Sources live in `src/` and are readable. `providers/*.js` are generated — don't edit them by hand.

```
src/lib/        shared helpers (http, crypto, inflate, TMDB, AniList mapping, embed resolvers, per-extension engines)
src/providers/  one small entry file per scraper; first line `// @libs ...` lists the libs it bundles
build.js        concatenates libs + entry, transpiles to ES2016 (no async/await) -> providers/<id>.js
test/           offline tests with a mocked fetch
```

```
node build.js            # build every scraper
node build.js streamplay # build one
npm test                 # offline tests
```

The build needs the TypeScript compiler (`npm i -g typescript`); there are no runtime dependencies.
