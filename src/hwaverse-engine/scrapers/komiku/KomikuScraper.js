import * as cheerio from "cheerio";
import { BaseScraper } from "../BaseScraper.js";
import { AppError, ERROR_CODES } from "../../utils/errors.js";
import { normalizeComic, normalizeChapter, normalizeImage } from "../../utils/normalize.js";

const BASE_URL = "https://komiku.id";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://komiku.id/"
};

export class KomikuScraper extends BaseScraper {
  constructor() {
    super("komiku");
  }

  extractSlug(slugOrUrl) {
    if (!slugOrUrl) return "";
    let clean = String(slugOrUrl).trim();
    clean = clean.replace(/^https?:\/\/komiku\.(id|to|org)/i, "");
    clean = clean.replace(/^\/+|\/+$/g, "");
    clean = clean.replace(/^manga\//i, "");
    clean = clean.replace(/\/chapter.*$/i, "");
    clean = clean.replace(/^\/+|\/+$/g, "");
    return clean;
  }

  async fetchHtml(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if (!res.ok) {
        if (res.status === 404) {
          throw new AppError(ERROR_CODES.NOT_FOUND, `Content not found at ${url}`, 404);
        }
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, `Komiku HTTP ${res.status}`, 502);
      }
      return await res.text();
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.name === "AbortError") {
        throw new AppError(ERROR_CODES.SOURCE_TIMEOUT, "Request to Komiku timed out", 504);
      }
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  cleanChapterNum(rawText) {
    if (!rawText) return null;
    const cleaned = String(rawText)
      .replace(/Terbaru\s*:?/gi, "")
      .replace(/Awal\s*:?/gi, "")
      .replace(/Chapter\s*/gi, "")
      .replace(/Ch\.?\s*/gi, "")
      .trim();
    const match = cleaned.match(/(\d+(?:[.-]\d+)?)/);
    return match ? match[1] : cleaned || null;
  }

  parseCards(html) {
    const $ = cheerio.load(html);
    const items = [];

    $(".bge").each((_, el) => {
      const a = $(el).find("a").first();
      const href = a.attr("href") || "";
      const slug = this.extractSlug(href);
      const title = $(el).find("h3, h4").first().text().trim() || a.attr("title") || slug;
      const img = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || null;
      const type = $(el).find(".tpe1_inf b").text().trim().toLowerCase() || "manga";
      const infText = $(el).find(".tpe1_inf").text().replace($(el).find(".tpe1_inf b").text(), "").trim();
      const rawLatest = $(el).find(".new1 a, .chapter, span").last().text().trim() || null;
      const latestCh = this.cleanChapterNum(rawLatest);

      if (slug && title) {
        items.push(normalizeComic({
          id: `komiku:${slug}`,
          source: "komiku",
          sourceId: slug,
          slug,
          title,
          cover: img,
          type,
          genres: infText ? [infText] : [],
          latestChapter: latestCh
        }));
      }
    });

    if (items.length === 0) {
      $(".manga-card").each((_, el) => {
        const a = $(el).find("a").first();
        const href = a.attr("href") || "";
        const slug = this.extractSlug(href);
        const title = $(el).find("h4").text().trim() || a.attr("title") || slug;
        const img = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || null;
        const rawLatest = $(el).find(".chapter, span").last().text().trim() || null;
        const latestCh = this.cleanChapterNum(rawLatest);

        if (slug && title) {
          items.push(normalizeComic({
            id: `komiku:${slug}`,
            source: "komiku",
            sourceId: slug,
            slug,
            title,
            cover: img,
            type: "manga",
            latestChapter: latestCh
          }));
        }
      });
    }

    return items;
  }

  async getHome() {
    try {
      const [mangaHtml, manhwaHtml] = await Promise.allSettled([
        this.fetchHtml(`https://api.komiku.org/manga/?tipe=manga&orderby=modified`),
        this.fetchHtml(`https://api.komiku.org/manga/?tipe=manhwa&orderby=modified`)
      ]);

      const mangaItems = mangaHtml.status === "fulfilled" ? this.parseCards(mangaHtml.value) : [];
      const manhwaItems = manhwaHtml.status === "fulfilled" ? this.parseCards(manhwaHtml.value) : [];
      const combined = [];
      const maxLen = Math.max(mangaItems.length, manhwaItems.length);
      for (let i = 0; i < maxLen; i++) {
        if (mangaItems[i]) combined.push(mangaItems[i]);
        if (manhwaItems[i]) combined.push(manhwaItems[i]);
      }

      if (combined.length === 0) {
        const fallbackHtml = await this.fetchHtml(`${BASE_URL}/daftar-komik/?tipe=manga`);
        combined.push(...this.parseCards(fallbackHtml));
      }

      return {
        latest: combined.slice(0, 16),
        new: combined.slice(8, 24),
        popular: combined.slice(0, 12),
        sources: ["komiku"]
      };
    } catch (err) {
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    }
  }

  async search(query, page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const q = String(query || "").trim();
    if (!q) {
      return { items: [], page: safePage, hasNextPage: false };
    }

    try {
      const searchUrl = `https://api.komiku.org/?post_type=manga&s=${encodeURIComponent(q)}`;
      const html = await this.fetchHtml(searchUrl);
      const items = this.parseCards(html);

      return {
        items,
        page: safePage,
        hasNextPage: false
      };
    } catch (err) {
      return {
        items: [],
        page: safePage,
        hasNextPage: false
      };
    }
  }

  async getLatest(page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = safePage === 1
      ? `https://api.komiku.org/manga/?tipe=manhwa&orderby=modified`
      : `https://api.komiku.org/manga/page/${safePage}/?tipe=manhwa&orderby=modified`;
    let items = [];
    try {
      const html = await this.fetchHtml(url);
      items = this.parseCards(html);
    } catch {
      const fallbackUrl = safePage === 1 ? `${BASE_URL}/daftar-komik/?tipe=manhwa` : `${BASE_URL}/daftar-komik/page/${safePage}/?tipe=manhwa`;
      const html = await this.fetchHtml(fallbackUrl);
      items = this.parseCards(html);
    }

    return {
      items,
      page: safePage,
      hasNextPage: items.length >= 10
    };
  }

  async getList(page = 1) {
    return this.getLatest(page);
  }

  async getByGenre(genre, page = 1) {
    const cleanGenre = String(genre || "").toLowerCase().trim();
    if (["manhwa", "manga", "manhua", "comic", "novel"].includes(cleanGenre)) {
      return this.getByType(cleanGenre, page);
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const encodedGenre = encodeURIComponent(cleanGenre);
    const url = safePage === 1
      ? `https://api.komiku.org/genre/${encodedGenre}/`
      : `https://api.komiku.org/genre/${encodedGenre}/page/${safePage}/`;
    let items = [];
    try {
      const html = await this.fetchHtml(url);
      items = this.parseCards(html);
    } catch {
      const fallbackUrl = safePage === 1 ? `${BASE_URL}/genre/${encodedGenre}/` : `${BASE_URL}/genre/${encodedGenre}/page/${safePage}/`;
      const html = await this.fetchHtml(fallbackUrl);
      items = this.parseCards(html);
    }

    return {
      genre: cleanGenre,
      items,
      page: safePage,
      hasNextPage: items.length >= 10
    };
  }

  async getByType(type, page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const cleanType = String(type).toLowerCase().trim();
    const url = safePage === 1
      ? `https://api.komiku.org/manga/?tipe=${cleanType}&orderby=modified`
      : `https://api.komiku.org/manga/page/${safePage}/?tipe=${cleanType}&orderby=modified`;
    let items = [];
    try {
      const html = await this.fetchHtml(url);
      items = this.parseCards(html);
    } catch {
      const fallbackUrl = safePage === 1 ? `${BASE_URL}/daftar-komik/?tipe=${cleanType}` : `${BASE_URL}/daftar-komik/page/${safePage}/?tipe=${cleanType}`;
      const html = await this.fetchHtml(fallbackUrl);
      items = this.parseCards(html);
    }

    return {
      type: cleanType,
      items,
      page: safePage,
      hasNextPage: items.length >= 10
    };
  }

  async getDetail(id, includeChapters = true) {
    const slug = this.extractSlug(id);
    if (!slug) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Comic slug is required", 400);
    }

    const url = `${BASE_URL}/manga/${slug}/`;
    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $("#Judul h1").text().replace(/^Komik\s+/i, "").trim() || slug;
    const cover = $(".ims img").attr("data-src") || $(".ims img").attr("src") || null;
    const synopsis = $(".desc, .sin").text().trim() || null;
    const type = $(".inftable tr:contains('Jenis') td:last-child").text().trim().toLowerCase() || "manhwa";
    const author = $(".inftable tr:contains('Pengarang') td:last-child").text().trim() || null;

    const genres = [];
    $(".genre li, .genre a").each((_, el) => {
      const g = $(el).text().trim();
      if (g) genres.push(g);
    });

    const chapters = [];
    $("#Daftar_Chapter tr, .chapter tr, tbody tr").each((_, el) => {
      const a = $(el).find("a").first();
      const href = a.attr("href");
      const chTitle = a.text().trim();
      if (href && (href.includes("-chapter-") || href.includes("/chapter-"))) {
        const match = href.match(/chapter-(\d+(\.\d+)?)/i);
        const chNum = match ? match[1] : chTitle.replace(/[^0-9.]/g, "");
        if (chNum) {
          chapters.push(normalizeChapter({
            id: `komiku:${slug}:${chNum}`,
            comicId: `komiku:${slug}`,
            source: "komiku",
            sourceId: slug,
            chapter: chNum,
            title: `Chapter ${chNum}`,
            url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
            releaseDate: $(el).find(".tgl, .date").text().trim() || null
          }));
        }
      }
    });

    const comic = normalizeComic({
      id: `komiku:${slug}`,
      source: "komiku",
      sourceId: slug,
      slug,
      title,
      type,
      genres,
      author,
      cover,
      synopsis,
      latestChapter: chapters.length > 0 ? chapters[0].chapter : null
    });

    return {
      comic,
      chapters: includeChapters ? chapters : []
    };
  }

  async getChapters(id) {
    const detail = await this.getDetail(id, true);
    return detail.chapters;
  }

  async getChapter(id, chapterNum) {
    const slug = this.extractSlug(id);
    const ch = String(chapterNum).trim();
    if (!slug || !ch) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Comic slug and chapter number are required", 400);
    }

    const candidates = [
      `${BASE_URL}/${slug}-chapter-${ch}/`,
      `${BASE_URL}/${slug}-chapter-${ch.padStart(2, "0")}/`,
      `${BASE_URL}/${slug}-chapter-${ch.padStart(3, "0")}/`,
      `${BASE_URL}/${slug}-chapter-${ch.replace(/^0+/, "") || "0"}/`,
      `${BASE_URL}/manga/${slug}/chapter-${ch}/`
    ];

    let html = null;
    for (const url of candidates) {
      try {
        html = await this.fetchHtml(url);
        if (html && (html.includes("Baca_Komik") || html.includes("chapter-body") || html.includes("article_content"))) {
          break;
        }
      } catch {
        // Try next candidate
      }
    }

    if (!html) {
      // Fallback: look up chapter URL from comic details
      try {
        const detail = await this.getDetail(slug, true);
        const target = detail.chapters.find(c =>
          c.chapter === ch ||
          parseFloat(c.chapter) === parseFloat(ch) ||
          c.title?.toLowerCase().includes(`chapter ${ch}`)
        );
        if (target && target.url) {
          html = await this.fetchHtml(target.url);
        }
      } catch (err) {
        // Ignore fallback error
      }
    }

    if (!html) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Chapter ${ch} not found for ${slug}`, 404);
    }

    const $ = cheerio.load(html);
    const images = [];

    $("#Baca_Komik img, .chapter-body img, #article_content img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
      if (src && !src.includes("lazy.jpg") && !src.includes("promosi") && !src.includes("iklan") && !src.includes("logo")) {
        images.push(normalizeImage({
          index: images.length,
          image: src.startsWith("//") ? `https:${src}` : src,
          rawPath: src
        }, images.length));
      }
    });

    return {
      id: `komiku:${slug}:${ch}`,
      number: ch,
      title: `Chapter ${ch}`,
      images
    };
  }
}
