import axios from "axios";
import * as cheerio from "cheerio";
import { BaseScraper } from "../BaseScraper.js";
import { AppError, ERROR_CODES } from "../../utils/errors.js";
import { normalizeComic, normalizeChapter, normalizeImage } from "../../utils/normalize.js";

const BASE_URL = "https://noveldex.io";

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  },
  timeout: 20000
});

function extractFlightData(html) {
  const $ = cheerio.load(html);
  let combined = "";
  $("script").each((_, el) => {
    const s = $(el).html() || "";
    if (s.includes("self.__next_f.push")) {
      const matches = s.matchAll(/self\.__next_f\.push\(\[1,"(.*)"\]\)/gs);
      for (const m of matches) {
        try {
          combined += JSON.parse(`"${m[1]}"`);
        } catch {
          combined += m[1];
        }
      }
    }
  });
  return combined;
}

function extractJsonObject(str, key) {
  if (!str) return null;
  const target = `"${key}":{`;
  const idx = str.indexOf(target);
  if (idx === -1) return null;
  const start = idx + target.length - 1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(str.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function extractJsonArray(str, key) {
  if (!str) return null;
  const target = `"${key}":[`;
  const idx = str.indexOf(target);
  if (idx === -1) return null;
  const start = idx + target.length - 1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "[") depth++;
      else if (char === "]") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(str.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function deriveKey(partialKeyHint, timestamp, clientNonce) {
  const a = `${partialKeyHint}|${timestamp}|${clientNonce}`;
  const n = new Uint8Array(32);
  let i = 0x811c9dc5;
  for (let e = 0; e < a.length; e++) {
    i ^= a.charCodeAt(e);
    i = Math.imul(i, 0x1000193) >>> 0;
  }
  for (let e = 0; e < 32; e++) {
    i ^= Math.imul(e, 0x9e3779b9) >>> 0;
    i = Math.imul(i, 0x1000193) >>> 0;
    n[e] = 255 & i;
  }
  return n;
}

function decryptContent(encryptedBase64, key) {
  const raw = Buffer.from(encryptedBase64, "base64");
  const r = new Uint8Array(raw.length);
  const keyLen = key.length;
  for (let n = 0; n < raw.length; n++) {
    r[n] = raw[n] ^ key[n % keyLen];
  }
  return new TextDecoder("utf-8").decode(r);
}

function cleanSlug(input) {
  if (!input) return "";
  const cleaned = input.replace(/^https?:\/\/[^\/]+/, "");
  const match = cleaned.match(/\/series\/(?:novel|comic)\/([^\/?#]+)/) || cleaned.match(/\/series\/([^\/?#]+)/);
  if (match) return match[1];
  return input.replace(/^\/+|\/+$/g, "");
}

export class NoveldexScraper extends BaseScraper {
  constructor() {
    super("noveldex");
  }

  _humanizeSlug(slug) {
    return String(slug || "")
      .split("-")
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  _extractCleanTitle($, el, slug) {
    const imgAlt = $(el).find("img").attr("alt")?.trim();
    if (imgAlt && !["new", "up", "hot", "read now", "cover"].includes(imgAlt.toLowerCase())) {
      return imgAlt;
    }
    const heading = $(el).find("h3, h2, h4").first().text().trim();
    if (heading && !["new", "up", "hot", "read now"].includes(heading.toLowerCase())) {
      return heading;
    }
    return this._humanizeSlug(slug);
  }

  async getHome() {
    try {
      const { data } = await client.get("/");
      const $ = cheerio.load(data);

      const parseCards = (selector) => {
        const arr = [];
        $(selector).each((_, el) => {
          const href = $(el).attr("href") || "";
          const slug = cleanSlug(href);
          if (!slug || arr.some(item => item.slug === slug)) return;
          const title = this._extractCleanTitle($, el, slug);
          const cover = $(el).find("img").attr("src") || "";
          const isNovel = href.includes("/series/novel/");
          arr.push(normalizeComic({
            id: `noveldex:${slug}`,
            source: "noveldex",
            sourceId: slug,
            slug,
            title,
            cover: cover ? (cover.startsWith("http") ? cover : `${BASE_URL}${cover}`) : null,
            type: isNovel ? "novel" : "manhwa",
            status: "Ongoing"
          }));
        });
        return arr;
      };

      const featured = parseCards('a[href*="ref=homepage_featured"]');
      const latest = parseCards('a[href*="ref=homepage_new"]');
      const onSale = parseCards('a[href*="ref=homepage_sale"]');

      return {
        latest: latest.length > 0 ? latest : featured,
        new: onSale.length > 0 ? onSale : featured,
        popular: featured,
        sources: ["noveldex"]
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }

  async search(query, page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const cleanQ = String(query || "").trim();
    const params = { page: safePage };
    if (cleanQ) params.search = cleanQ;

    try {
      const { data } = await client.get("/series", { params });
      const flight = extractFlightData(data);

      let results = [];
      let totalCount = 0;

      const initialSeries = extractJsonArray(flight, "initialSeries");
      if (Array.isArray(initialSeries)) {
        results = initialSeries.map(item => normalizeComic({
          id: `noveldex:${item.slug || item.urlSlug}`,
          source: "noveldex",
          sourceId: item.slug || item.urlSlug,
          slug: item.slug || item.urlSlug,
          title: item.title,
          type: item.type?.toLowerCase() || "novel",
          status: item.status?.toLowerCase() || null,
          cover: item.coverImage ? (item.coverImage.startsWith("http") ? item.coverImage : `${BASE_URL}${item.coverImage}`) : null,
          genres: (item.genres || []).map(g => g.genre?.slug || g.name || g.slug)
        }));
      }

      const countMatch = flight.match(/"resultCount":(\d+)/);
      if (countMatch) {
        totalCount = parseInt(countMatch[1], 10);
      }

      if (results.length === 0 && !cleanQ) {
        const $ = cheerio.load(data);
        $('a[href^="/series/novel/"], a[href^="/series/comic/"]').each((_, el) => {
          const href = $(el).attr("href") || "";
          if (href.includes("/chapter/")) return;
          const slug = cleanSlug(href);
          const title = this._extractCleanTitle($, el, slug);
          const cover = $(el).find("img").attr("src") || "";
          const isNovel = href.includes("/series/novel/");
          if (slug && !results.some(r => r.slug === slug)) {
            results.push(normalizeComic({
              id: `noveldex:${slug}`,
              source: "noveldex",
              sourceId: slug,
              slug,
              title,
              cover: cover ? (cover.startsWith("http") ? cover : `${BASE_URL}${cover}`) : null,
              type: isNovel ? "novel" : "manhwa"
            }));
          }
        });
      }

      if (cleanQ) {
        const tokens = cleanQ.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
        if (tokens.length > 0) {
          results = results.filter(item => {
            const hay = `${item.title || ""} ${item.slug || ""}`.toLowerCase();
            return tokens.some(tok => hay.includes(tok));
          });
        }
      }

      return {
        items: results,
        page: safePage,
        hasNextPage: totalCount > safePage * 20
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }

  async getLatest(page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    try {
      const { data } = await client.get("/series", { params: { sort: "latest", page: safePage } });
      const flight = extractFlightData(data);
      const initialSeries = extractJsonArray(flight, "initialSeries") || [];
      const items = initialSeries.map(item => normalizeComic({
        id: `noveldex:${item.slug || item.urlSlug}`,
        source: "noveldex",
        sourceId: item.slug || item.urlSlug,
        slug: item.slug || item.urlSlug,
        title: item.title,
        type: item.type?.toLowerCase() || "manhwa",
        status: item.status?.toLowerCase() || null,
        cover: item.coverImage ? (item.coverImage.startsWith("http") ? item.coverImage : `${BASE_URL}${item.coverImage}`) : null,
        genres: (item.genres || []).map(g => g.genre?.slug || g.name || g.slug)
      }));

      return {
        items,
        page: safePage,
        hasNextPage: items.length >= 20
      };
    } catch (err) {
      return this.search("", page);
    }
  }

  async getList(page = 1) {
    return this.getLatest(page);
  }

  async getByGenre(genre, page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    try {
      const { data } = await client.get("/series", { params: { genre, page: safePage } });
      const flight = extractFlightData(data);
      const initialSeries = extractJsonArray(flight, "initialSeries") || [];
      const items = initialSeries.map(item => normalizeComic({
        id: `noveldex:${item.slug || item.urlSlug}`,
        source: "noveldex",
        sourceId: item.slug || item.urlSlug,
        slug: item.slug || item.urlSlug,
        title: item.title,
        type: item.type?.toLowerCase() || "manhwa",
        status: item.status?.toLowerCase() || null,
        cover: item.coverImage ? (item.coverImage.startsWith("http") ? item.coverImage : `${BASE_URL}${item.coverImage}`) : null,
        genres: (item.genres || []).map(g => g.genre?.slug || g.name || g.slug)
      }));

      return {
        genre,
        items,
        page: safePage,
        hasNextPage: items.length >= 20
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }

  async getByType(type, page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    try {
      const { data } = await client.get("/series", { params: { type, page: safePage } });
      const flight = extractFlightData(data);
      const initialSeries = extractJsonArray(flight, "initialSeries") || [];
      const items = initialSeries.map(item => normalizeComic({
        id: `noveldex:${item.slug || item.urlSlug}`,
        source: "noveldex",
        sourceId: item.slug || item.urlSlug,
        slug: item.slug || item.urlSlug,
        title: item.title,
        type: item.type?.toLowerCase() || "manhwa",
        status: item.status?.toLowerCase() || null,
        cover: item.coverImage ? (item.coverImage.startsWith("http") ? item.coverImage : `${BASE_URL}${item.coverImage}`) : null,
        genres: (item.genres || []).map(g => g.genre?.slug || g.name || g.slug)
      }));

      return {
        type,
        items,
        page: safePage,
        hasNextPage: items.length >= 20
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }

  async getDetail(slugOrUrl, includeChapters = true) {
    const slug = cleanSlug(slugOrUrl);
    if (!slug) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Slug is required", 400);
    }

    try {
      let res = await client.get(`/series/novel/${slug}`, { validateStatus: () => true });
      let flight = extractFlightData(res.data);
      let seriesObj = extractJsonObject(flight, "series");

      if (!seriesObj || !seriesObj.id) {
        res = await client.get(`/series/comic/${slug}`, { validateStatus: () => true });
        flight = extractFlightData(res.data);
        seriesObj = extractJsonObject(flight, "series");
      }

      if (seriesObj) {
        const rawChapters = extractJsonArray(flight, "initialChapters") || extractJsonArray(flight, "chapters") || seriesObj.chapters || [];
        const formattedChapters = rawChapters.map(c => normalizeChapter({
          id: `noveldex:${seriesObj.slug}:${c.number}`,
          comicId: `noveldex:${seriesObj.slug}`,
          source: "noveldex",
          sourceId: seriesObj.slug,
          chapter: String(c.number),
          title: c.title || `Chapter ${c.number}`,
          url: `${BASE_URL}/series/${(seriesObj.type || "").toLowerCase().includes("comic") ? "comic" : "novel"}/${seriesObj.slug}/chapter/${c.number}`,
          releaseDate: c.publishedAt ?? null
        }));

        const comic = normalizeComic({
          id: `noveldex:${seriesObj.slug}`,
          source: "noveldex",
          sourceId: seriesObj.slug,
          slug: seriesObj.slug,
          title: seriesObj.title,
          alternativeTitles: seriesObj.altTitle ? [seriesObj.altTitle] : [],
          type: (seriesObj.type || "manhwa").toLowerCase(),
          status: seriesObj.status?.toLowerCase() || null,
          author: seriesObj.author || seriesObj.authorName || null,
          artist: seriesObj.artist || seriesObj.artistName || null,
          cover: seriesObj.coverImage ? (seriesObj.coverImage.startsWith("http") ? seriesObj.coverImage : `${BASE_URL}${seriesObj.coverImage}`) : null,
          synopsis: seriesObj.description || null,
          latestChapter: formattedChapters.length > 0 ? formattedChapters[0].chapter : null,
          genres: (seriesObj.genres || []).map(g => g.name || g.slug)
        });

        return {
          comic,
          chapters: includeChapters ? formattedChapters : []
        };
      }

      // Fallback Cheerio HTML
      const $ = cheerio.load(res.data);
      const title = $("h1").first().text().trim() || slug;
      const description = $('meta[name="description"]').attr("content") || $(".synopsis, .description, p").first().text().trim() || null;
      const cover = $('meta[property="og:image"]').attr("content") || null;
      const chapters = [];

      $('a[href*="/chapter/"]').each((_, el) => {
        const href = $(el).attr("href") || "";
        const chNumMatch = href.match(/\/chapter\/([\d.]+)/);
        if (chNumMatch) {
          const number = chNumMatch[1];
          if (!chapters.some(c => c.chapter === number)) {
            chapters.push(normalizeChapter({
              id: `noveldex:${slug}:${number}`,
              comicId: `noveldex:${slug}`,
              source: "noveldex",
              sourceId: slug,
              chapter: number,
              title: $(el).text().trim() || `Chapter ${number}`,
              url: `${BASE_URL}${href.split("?")[0]}`
            }));
          }
        }
      });

      const comic = normalizeComic({
        id: `noveldex:${slug}`,
        source: "noveldex",
        sourceId: slug,
        slug,
        title,
        cover,
        synopsis: description,
        type: "manhwa",
        latestChapter: chapters.length > 0 ? chapters[0].chapter : null
      });

      return {
        comic,
        chapters: includeChapters ? chapters : []
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }

  async getChapters(slugOrUrl) {
    const detail = await this.getDetail(slugOrUrl, true);
    return detail.chapters;
  }

  async getChapter(slugOrUrl, chapterNumber) {
    let slug = "";
    let chNum = chapterNumber;

    if (typeof slugOrUrl === "string" && slugOrUrl.includes("/chapter/")) {
      const cleaned = slugOrUrl.replace(/^https?:\/\/[^\/]+/, "");
      const urlMatch = cleaned.match(/\/series\/(?:novel|comic)\/([^\/?#]+)\/chapter\/([^\/?#]+)/) || cleaned.match(/\/series\/([^\/?#]+)\/chapter\/([^\/?#]+)/);
      if (urlMatch) {
        slug = urlMatch[1];
        chNum = urlMatch[2];
      }
    } else {
      slug = cleanSlug(slugOrUrl);
    }

    try {
      let res = await client.get(`/series/novel/${slug}/chapter/${chNum}`, { validateStatus: () => true });
      let flight = extractFlightData(res.data);
      let chapterInfo = extractJsonObject(flight, "chapter");
      let seriesInfo = extractJsonObject(flight, "series");

      if (!chapterInfo || !chapterInfo.id) {
        res = await client.get(`/series/comic/${slug}/chapter/${chNum}`, { validateStatus: () => true });
        flight = extractFlightData(res.data);
        chapterInfo = extractJsonObject(flight, "chapter");
        seriesInfo = extractJsonObject(flight, "series");
      }

      const isComic = chapterInfo?.pages && chapterInfo.pages.length > 0;
      const images = [];

      let novelParagraphs = [];

      if (isComic) {
        (chapterInfo.pages || []).forEach((p, idx) => {
          if (p.imageUrl) {
            images.push(normalizeImage({
              index: idx,
              image: p.imageUrl.startsWith("http") ? p.imageUrl : `${BASE_URL}${p.imageUrl}`,
              rawPath: p.imageUrl
            }, idx));
          }
        });
      } else {
        // Novel content (XOR decrypt)
        let htmlContent = "";
        const xorMatch = flight.match(/"xorEncryption":\{"encryptedBase64":"\$([^"]+)","partialKeyHint":"([^"]+)","timestamp":(\d+),"clientNonce":"([^"]+)"\}/);
        if (xorMatch) {
          const refId = xorMatch[1];
          const partialKeyHint = xorMatch[2];
          const timestamp = parseInt(xorMatch[3], 10);
          const clientNonce = xorMatch[4];

          const refRegex = new RegExp(`${refId}:T[0-9a-fA-F]+,([A-Za-z0-9+/=]+)`);
          const payloadMatch = flight.match(refRegex);
          if (payloadMatch) {
            const encryptedBase64 = payloadMatch[1];
            const key = deriveKey(partialKeyHint, timestamp, clientNonce);
            htmlContent = decryptContent(encryptedBase64, key);
          }
        }

        if (!htmlContent && chapterInfo?.content) {
          htmlContent = chapterInfo.content;
        }

        if (htmlContent) {
          const $c = cheerio.load(htmlContent);
          $c("p, div, h2, h3, blockquote").each((_, el) => {
            const txt = $c(el).text().trim();
            if (txt && !novelParagraphs.includes(txt)) {
              novelParagraphs.push(txt);
            }
          });
          if (novelParagraphs.length === 0) {
            novelParagraphs = $c.text()
              .split(/\n+/)
              .map(s => s.trim())
              .filter(Boolean);
          }
        }
      }

      return {
        id: `noveldex:${slug}:${chNum}`,
        number: String(chNum),
        title: chapterInfo?.title || `Chapter ${chNum}`,
        type: isComic ? "manhwa" : "novel",
        images,
        novelContent: novelParagraphs.length > 0 ? {
          subtitle: `${seriesInfo?.title || this._humanizeSlug(slug)} — ${chapterInfo?.title || `Chapter ${chNum}`}`,
          authorNote: `Hasil scrape langsung & dekripsi XOR dari NovelDex (${novelParagraphs.length} paragraf teks asli).`,
          paragraphs: novelParagraphs
        } : undefined
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }
}
