import * as cheerio from "cheerio";
import { BaseScraper } from "../BaseScraper.js";
import { AppError, ERROR_CODES } from "../../utils/errors.js";
import { normalizeComic, normalizeChapter, normalizeImage } from "../../utils/normalize.js";

const BASE_URL = "https://manta.net";
const API_BASE = "https://manta.net/manta/v1";
const FRONT_API_BASE = "https://manta.net/front/v1";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://manta.net/en"
};

const TYPE_MAP = {
  COMIC: 10,
  COMIC_ALT: 30,
  NOVEL: 40,
  MANGA_A: 50,
  MANGA_B: 60
};

export class MantaScraper extends BaseScraper {
  constructor() {
    super("manta");
  }

  mapType(typeNum, tags = []) {
    const num = Number(typeNum ?? 0);
    if (num === TYPE_MAP.NOVEL) return "novel";
    if (num === TYPE_MAP.MANGA_A || num === TYPE_MAP.MANGA_B) return "manga";
    const hasNovelTag = tags.some(t => {
      const name = typeof t === "object" ? (t.name?.en ?? Object.values(t.name ?? {})[0] ?? t.name ?? "") : String(t);
      return String(name).toLowerCase() === "novel" || t.id === 292;
    });
    if (hasNovelTag) return "novel";
    return "comic";
  }

  formatItem(raw) {
    if (!raw) return null;
    const id = String(raw.id ?? raw.seriesId ?? "");
    const rawData = raw.data ?? {};
    const rawImage = raw.image ?? {};

    const title = typeof rawData.title === "object"
      ? (rawData.title?.en ?? Object.values(rawData.title ?? {})[0] ?? "")
      : (raw.title ?? rawData.title ?? "");

    const tags = (rawData.tags ?? []).map(t => {
      if (typeof t === "string") return t;
      return typeof t.name === "object" ? (t.name?.en ?? Object.values(t.name ?? {})[0] ?? "") : (t.name ?? "");
    }).filter(Boolean);

    const typeNum = Number(raw.type ?? raw.seriesType ?? 0);
    const category = this.mapType(typeNum, rawData.tags ?? []);

    const cover = rawImage["1280x1840_720"]?.downloadUrl ??
      rawImage["1280x1840_480"]?.downloadUrl ??
      rawImage["1440x1440_720"]?.downloadUrl ??
      rawImage["1440x1440_480"]?.downloadUrl ??
      rawImage.thumbnail1?.downloadUrl ??
      raw.coverImage?.downloadUrl ??
      null;

    const latestChapter = raw.episodeCount ?? raw.latestEpisode?.ord ?? null;

    return normalizeComic({
      id: `manta:${id}`,
      source: "manta",
      sourceId: id,
      slug: id,
      title: String(title).trim(),
      type: category,
      genres: tags,
      cover,
      latestChapter: latestChapter !== null ? String(latestChapter) : null
    });
  }

  async fetchJson(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: controller.signal
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new AppError(ERROR_CODES.NOT_FOUND, `Content not found at ${url}`, 404);
        }
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, `Manta HTTP ${res.status}`, 502);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.name === "AbortError") {
        throw new AppError(ERROR_CODES.SOURCE_TIMEOUT, "Request to Manta timed out", 504);
      }
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getHomeSection(sectionType = "comics") {
    const validSections = {
      comic: "comics",
      comics: "comics",
      manga: "manga",
      novel: "novels",
      novels: "novels"
    };
    const targetKey = validSections[sectionType.toLowerCase()] ?? "comics";
    const url = `${FRONT_API_BASE}/home/202606?lang=en&homeType=${targetKey}`;
    const res = await this.fetchJson(url);
    const d = res?.data ?? {};

    const seriesMap = d.seriesMap ?? {};
    const items = (d.items ?? []).map(it => {
      const sMapData = seriesMap[it.seriesId] ?? {};
      const merged = { ...sMapData, ...it };
      return this.formatItem(merged);
    }).filter(Boolean);

    return items;
  }

  async getHome() {
    try {
      const [comics, manga, novels] = await Promise.all([
        this.getHomeSection("comics").catch(() => []),
        this.getHomeSection("manga").catch(() => []),
        this.getHomeSection("novels").catch(() => [])
      ]);

      return {
        latest: comics.slice(0, 10),
        new: novels.slice(0, 10),
        popular: manga.slice(0, 10),
        sources: ["manta"]
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }

  async search(query, page = 1) {
    if (!query || String(query).trim().length === 0) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Search query is required", 400);
    }

    const cleanQ = String(query).trim();
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = `${API_BASE}/search/series?lang=en&q=${encodeURIComponent(cleanQ)}`;
    const res = await this.fetchJson(url);
    const rawList = Array.isArray(res?.data) ? res.data : [];

    let items = rawList.map(raw => this.formatItem(raw)).filter(Boolean);
    const tokens = cleanQ.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length > 0) {
      items = items.filter(item => {
        const hay = `${item.title || ""} ${(item.alternativeTitles || []).join(" ")}`.toLowerCase();
        return tokens.some(tok => hay.includes(tok));
      });
    }

    const pageSize = 20;
    const offset = (safePage - 1) * pageSize;
    const pagedItems = items.slice(offset, offset + pageSize);

    return {
      items: pagedItems,
      page: safePage,
      hasNextPage: offset + pageSize < items.length
    };
  }

  async getLatest(page = 1) {
    const comics = await this.getHomeSection("comics");
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 20;
    const offset = (safePage - 1) * pageSize;
    const items = comics.slice(offset, offset + pageSize);

    return {
      items,
      page: safePage,
      hasNextPage: offset + pageSize < comics.length
    };
  }

  async getList(page = 1) {
    return this.getLatest(page);
  }

  async getByGenre(genre, page = 1) {
    if (!genre) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Genre parameter is required", 400);
    }
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = `${API_BASE}/search/series?lang=en&q=${encodeURIComponent(genre)}`;
    const res = await this.fetchJson(url);
    const rawList = Array.isArray(res?.data) ? res.data : [];
    const items = rawList.map(raw => this.formatItem(raw)).filter(Boolean);
    const pageSize = 20;
    const offset = (safePage - 1) * pageSize;

    return {
      genre,
      items: items.slice(offset, offset + pageSize),
      page: safePage,
      hasNextPage: offset + pageSize < items.length
    };
  }

  async getByType(type, page = 1) {
    if (!type) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Type parameter is required", 400);
    }

    const cleanType = String(type).toLowerCase().trim();
    let section = "comics";
    if (cleanType === "manga") section = "manga";
    if (cleanType === "novel") section = "novels";

    const items = await this.getHomeSection(section);
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 20;
    const offset = (safePage - 1) * pageSize;

    return {
      type: cleanType,
      items: items.slice(offset, offset + pageSize),
      page: safePage,
      hasNextPage: offset + pageSize < items.length
    };
  }

  async getDetail(id, includeChapters = true) {
    const seriesId = String(id).trim();
    if (!seriesId) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Series ID is required", 400);
    }

    const url = `${BASE_URL}/en/series/${seriesId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let nextData = null;
    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if (!res.ok) {
        if (res.status === 404) {
          throw new AppError(ERROR_CODES.NOT_FOUND, `Series "${seriesId}" not found on Manta`, 404);
        }
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, `Manta HTTP ${res.status}`, 502);
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      const scriptContent = $("#__NEXT_DATA__").html();
      if (!scriptContent) {
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, "Could not extract SSR data from Manta", 502);
      }
      nextData = JSON.parse(scriptContent);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.name === "AbortError") {
        throw new AppError(ERROR_CODES.SOURCE_TIMEOUT, "Request to Manta timed out", 504);
      }
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    } finally {
      clearTimeout(timeout);
    }

    const initial = nextData.props?.pageProps?.initialSeries;
    if (!initial) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Series data not found for ${seriesId}`, 404);
    }

    const d = initial.data ?? {};
    const head = nextData.props?.pageProps?.headData ?? {};
    const title = typeof d.title === "object"
      ? (d.title?.en ?? Object.values(d.title ?? {})[0] ?? "")
      : (d.title ?? head.title ?? "");

    const typeNum = Number(initial.type ?? 0);
    const category = this.mapType(typeNum, d.tags ?? []);

    const tags = (d.tags ?? []).map(t => {
      if (typeof t === "string") return t;
      return typeof t.name === "object" ? (t.name?.en ?? Object.values(t.name ?? {})[0] ?? "") : (t.name ?? "");
    }).filter(Boolean);

    const authors = (d.creators ?? []).map(c => c.name).filter(Boolean).join(", ");
    const cover = initial.image?.["1280x1840_720"]?.downloadUrl ??
      initial.image?.["1280x1840_480"]?.downloadUrl ??
      head.image ??
      null;

    const episodes = (initial.episodes ?? []).map(ep => normalizeChapter({
      id: `manta:${seriesId}:${ep.id}`,
      comicId: `manta:${seriesId}`,
      source: "manta",
      sourceId: seriesId,
      chapter: String(ep.ord ?? ep.id),
      title: ep.data?.title ?? `Episode ${ep.ord}`,
      url: `${BASE_URL}/en/episodes/${ep.id}`,
      releaseDate: ep.openAt ?? null
    }));

    const comic = normalizeComic({
      id: `manta:${seriesId}`,
      source: "manta",
      sourceId: seriesId,
      slug: seriesId,
      title: String(title).trim(),
      type: category,
      genres: tags,
      author: authors || null,
      cover,
      synopsis: d.description?.long ?? d.description?.short ?? head.description ?? null,
      latestChapter: episodes.length > 0 ? episodes[episodes.length - 1].chapter : null
    });

    return {
      comic,
      chapters: includeChapters ? episodes : []
    };
  }

  async getChapters(id) {
    const detail = await this.getDetail(id, true);
    return detail.chapters;
  }

  async getChapter(seriesId, chapterOrEpisodeId) {
    const targetId = String(chapterOrEpisodeId).trim();
    if (!targetId) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Chapter/Episode ID is required", 400);
    }

    let episodeId = targetId;
    if (!Number(targetId) || Number(targetId) < 1000) {
      const detail = await this.getDetail(seriesId, true);
      const found = detail.chapters.find(c => c.chapter === targetId);
      if (found && found.url) {
        const parts = found.url.split("/episodes/");
        if (parts[1]) episodeId = parts[1];
      }
    }

    const url = `${BASE_URL}/en/episodes/${episodeId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let nextData = null;
    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if (!res.ok) {
        if (res.status === 404) {
          throw new AppError(ERROR_CODES.NOT_FOUND, `Episode "${episodeId}" not found on Manta`, 404);
        }
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, `Manta HTTP ${res.status}`, 502);
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      const scriptContent = $("#__NEXT_DATA__").html();
      if (!scriptContent) {
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, "Could not extract SSR data for episode", 502);
      }
      nextData = JSON.parse(scriptContent);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.name === "AbortError") {
        throw new AppError(ERROR_CODES.SOURCE_TIMEOUT, "Request to Manta timed out", 504);
      }
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    } finally {
      clearTimeout(timeout);
    }

    const p = nextData.props?.pageProps ?? {};
    const previewImages = (p.previewCutImages ?? []).map((img, idx) => normalizeImage({
      index: idx,
      image: img.downloadUrl,
      rawPath: null
    }, idx));

    return {
      id: `manta:${seriesId}:${episodeId}`,
      number: targetId,
      title: p.previewEpisodeTitle ?? `Episode ${targetId}`,
      images: previewImages
    };
  }
}
