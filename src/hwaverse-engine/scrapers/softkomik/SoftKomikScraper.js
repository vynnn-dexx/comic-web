import * as cheerio from "cheerio";
import { BaseScraper } from "../BaseScraper.js";
import { AppError, ERROR_CODES } from "../../utils/errors.js";
import { normalizeComic, normalizeChapter, normalizeImage } from "../../utils/normalize.js";

const BASE_URL = "https://softkomik.co";
const COVER_BASE = "https://cover.softdevices.my.id/softkomik-cover";
const IMAGE_HOST_1 = "https://psy1.komik.im";
const IMAGE_HOST_2 = "https://image.komik.im/softkomik";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": `${BASE_URL}/`,
  "Origin": BASE_URL,
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8"
};

export class SoftKomikScraper extends BaseScraper {
  constructor(options = {}) {
    super("softkomik");
    this.options = options;
    this._browser = null;
  }

  formatCoverUrl(pathStr) {
    if (!pathStr) return null;
    if (pathStr.startsWith("http://") || pathStr.startsWith("https://")) return pathStr;
    return `${COVER_BASE}/${pathStr.replace(/^\/+/, "")}`;
  }

  formatImageUrl(pathStr, storageInter2 = false) {
    if (!pathStr) return null;
    if (pathStr.startsWith("http://") || pathStr.startsWith("https://")) return pathStr;
    const base = storageInter2 ? IMAGE_HOST_2 : IMAGE_HOST_1;
    return `${base}/${pathStr.replace(/^\/+/, "")}`;
  }

  extractSlug(input) {
    if (!input) return "";
    let clean = String(input).trim();
    clean = clean.replace(/^https?:\/\/softkomik\.(co|org)\//i, "");
    clean = clean.split("/chapter")[0];
    clean = clean.replace(/^\/+|\/+$/g, "");
    return clean;
  }

  extractGenres(item, defaultGenre = null) {
    if (Array.isArray(item?.Genre) && item.Genre.length > 0) return item.Genre;
    if (Array.isArray(item?.genre) && item.genre.length > 0) return item.genre;
    if (Array.isArray(item?.genres) && item.genres.length > 0) return item.genres;
    if (typeof item?.Genre === "string") return [item.Genre];
    if (typeof item?.genre === "string") return [item.genre];
    if (defaultGenre) return [defaultGenre];
    return [];
  }

  async fetchNextData(targetUrl, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(targetUrl, {
        headers: HEADERS,
        signal: controller.signal
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new AppError(ERROR_CODES.NOT_FOUND, `Content not found at ${targetUrl}`, 404);
        }
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, `HTTP ${res.status} when fetching ${targetUrl}`, 502);
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const scriptContent = $("#__NEXT_DATA__").html();
      if (!scriptContent) {
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, `SSR data not found at ${targetUrl}`, 502);
      }
      return JSON.parse(scriptContent);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.name === "AbortError") {
        throw new AppError(ERROR_CODES.SOURCE_TIMEOUT, "Request to SoftKomik timed out", 504);
      }
      throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, err.message, 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getBrowser() {
    if (!this._browser) {
      try {
        const { chromium } = await import("playwright");
        this._browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        });
      } catch (e) {
        throw new AppError(ERROR_CODES.SOURCE_UNAVAILABLE, "Playwright fallback unavailable: " + e.message, 503);
      }
    }
    return this._browser;
  }

  async closeBrowser() {
    if (this._browser) {
      await this._browser.close();
      this._browser = null;
    }
  }

  mapSoftKomikToComic(item) {
    const slug = item.title_slug ?? this.extractSlug(item.url ?? "");
    const sourceId = slug || String(item._id ?? item.id ?? "");

    return normalizeComic({
      id: `softkomik:${sourceId}`,
      source: "softkomik",
      sourceId,
      slug,
      title: item.title ?? "",
      type: item.type ?? null,
      status: item.status ?? null,
      genres: this.extractGenres(item),
      cover: this.formatCoverUrl(item.gambar),
      latestChapter: item.latest_chapter ? String(item.latest_chapter) : null,
      updatedAt: item.updated_at ?? null
    });
  }

  async getHome() {
    const nextData = await this.fetchNextData(BASE_URL);
    const data = nextData.props?.pageProps?.data ?? {};

    const formatList = (list = []) => list.map(item => this.mapSoftKomikToComic(item));

    const latest = formatList(data.updateNonProject ?? []);
    const newComics = formatList(data.newKomik ?? []);
    const popular = formatList(data.updateProject ?? data.project ?? []).ifEmpty ? [] : formatList(data.updateProject ?? data.project ?? []);

    return {
      latest,
      new: newComics,
      popular: popular.length > 0 ? popular : latest.slice(0, 10),
      sources: ["softkomik"]
    };
  }

  async search(query, page = 1) {
    if (!query || String(query).trim().length === 0) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Search query is required", 400);
    }
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = `${BASE_URL}/komik/list?name=${encodeURIComponent(query)}&page=${safePage}`;
    const nextData = await this.fetchNextData(url);
    const initialData = nextData.props?.pageProps?.initialData ?? {};
    const items = (initialData.data ?? []).map(item => this.mapSoftKomikToComic(item));
    const maxPage = parseInt(initialData.maxPage ?? 1, 10);

    return {
      items,
      page: safePage,
      hasNextPage: safePage < maxPage
    };
  }

  async getLatest(page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = `${BASE_URL}/komik/update?page=${safePage}`;
    const nextData = await this.fetchNextData(url);
    const initialData = nextData.props?.pageProps?.initialData ?? {};
    const items = (initialData.data ?? []).map(item => this.mapSoftKomikToComic(item));
    const maxPage = parseInt(initialData.maxPage ?? 1, 10);

    return {
      items,
      page: safePage,
      hasNextPage: safePage < maxPage
    };
  }

  async getList(page = 1) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = `${BASE_URL}/komik/list?page=${safePage}`;
    const nextData = await this.fetchNextData(url);
    const initialData = nextData.props?.pageProps?.initialData ?? {};
    const items = (initialData.data ?? []).map(item => this.mapSoftKomikToComic(item));
    const maxPage = parseInt(initialData.maxPage ?? 1, 10);

    return {
      items,
      page: safePage,
      hasNextPage: safePage < maxPage
    };
  }

  async getByGenre(genre, page = 1) {
    if (!genre) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Genre parameter is required", 400);
    }
    const cleanGenre = String(genre).toLowerCase().trim();
    if (["manhwa", "manga", "manhua", "comic", "novel"].includes(cleanGenre)) {
      return this.getByType(cleanGenre, page);
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = `${BASE_URL}/komik/list?genre=${encodeURIComponent(genre)}&page=${safePage}`;
    const nextData = await this.fetchNextData(url);
    const initialData = nextData.props?.pageProps?.initialData ?? {};
    let items = (initialData.data ?? []).map(item => this.mapSoftKomikToComic(item));
    let maxPage = parseInt(initialData.maxPage ?? 1, 10);

    if (items.length === 0) {
      const capGenre = genre.charAt(0).toUpperCase() + genre.slice(1);
      const capUrl = `${BASE_URL}/komik/list?genre=${encodeURIComponent(capGenre)}&page=${safePage}`;
      const capData = await this.fetchNextData(capUrl);
      const capInit = capData.props?.pageProps?.initialData ?? {};
      if (Array.isArray(capInit.data) && capInit.data.length > 0) {
        items = capInit.data.map(item => this.mapSoftKomikToComic(item));
        maxPage = parseInt(capInit.maxPage ?? 1, 10);
      }
    }

    return {
      genre,
      items,
      page: safePage,
      hasNextPage: safePage < maxPage
    };
  }

  async getByType(type, page = 1) {
    if (!type) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Type parameter is required", 400);
    }
    const cleanType = String(type).toLowerCase().trim();
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const url = `${BASE_URL}/komik/type/${encodeURIComponent(cleanType)}?page=${safePage}`;
    const nextData = await this.fetchNextData(url);
    const dataObj = nextData.props?.pageProps?.data ?? {};
    const items = (dataObj.data ?? []).map(item => this.mapSoftKomikToComic(item));
    const maxPage = parseInt(dataObj.maxPage ?? 1, 10);

    return {
      type: cleanType,
      items,
      page: safePage,
      hasNextPage: safePage < maxPage
    };
  }

  async getDetail(slugOrUrl, includeChapters = true) {
    const slug = this.extractSlug(slugOrUrl);
    if (!slug) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Slug or URL is required", 400);
    }

    const url = `${BASE_URL}/${slug}`;
    const nextData = await this.fetchNextData(url);
    const d = nextData.props?.pageProps?.data;
    if (!d) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Comic "${slug}" not found on SoftKomik`, 404);
    }

    const sourceId = d.title_slug ?? slug;
    const comicId = `softkomik:${sourceId}`;

    const comic = normalizeComic({
      id: comicId,
      source: "softkomik",
      sourceId,
      slug: d.title_slug ?? slug,
      title: d.title ?? "",
      alternativeTitles: d.title_alt ? [d.title_alt] : [],
      type: d.type ?? null,
      status: d.status ?? null,
      genres: this.extractGenres(d),
      author: d.author ?? null,
      artist: d.artist ?? null,
      cover: this.formatCoverUrl(d.gambar),
      synopsis: d.sinopsis ?? null,
      latestChapter: d.latest_chapter ? String(d.latest_chapter) : null,
      rating: {
        value: d.rating?.value ? Number(d.rating.value.toFixed(2)) : null,
        count: d.rating?.member ?? null
      },
      updatedAt: d.updated_at ?? null
    });

    let chapters = [];
    if (includeChapters) {
      chapters = await this.getChapters(slug);
    }

    return {
      comic,
      chapters
    };
  }

  async getChapters(slugOrUrl) {
    const slug = this.extractSlug(slugOrUrl);
    if (!slug) return [];

    try {
      const url = `${BASE_URL}/api/komik/${slug}/chapter?limit=1000`;
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.chapter) && json.chapter.length > 0) {
          return json.chapter.map(ch => normalizeChapter({
            comicId: `softkomik:${slug}`,
            source: "softkomik",
            sourceId: slug,
            chapter: String(ch.chapter),
            title: `Chapter ${ch.chapter}`,
            url: `${BASE_URL}/${slug}/chapter/${ch.chapter}`,
            releaseDate: ch.updated_at ?? ch.created_at ?? null
          }));
        }
      }
    } catch {}

    // Fallback: extract latest_chapter from comic detail SSR and generate chapters
    try {
      const detail = await this.getDetail(slug, false);
      const latestChStr = detail.comic.latestChapter;
      if (latestChStr) {
        const match = latestChStr.match(/(\d+(\.\d+)?)/);
        const maxCh = match ? parseInt(match[1], 10) : 0;
        if (maxCh > 0) {
          const chapters = [];
          const padLen = latestChStr.startsWith("0") ? latestChStr.length : 1;
          for (let i = maxCh; i >= 1; i--) {
            const chNum = padLen > 1 ? String(i).padStart(padLen, "0") : String(i);
            chapters.push(normalizeChapter({
              comicId: `softkomik:${slug}`,
              source: "softkomik",
              sourceId: slug,
              chapter: String(i),
              title: `Chapter ${i}`,
              url: `${BASE_URL}/${slug}/chapter/${chNum}`,
              releaseDate: detail.comic.updatedAt ?? null
            }));
          }
          return chapters;
        }
      }
    } catch {}

    return [];
  }

  async _fetchChaptersViaBrowser(slug) {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage({
        userAgent: HEADERS["User-Agent"]
      });

      await page.route("**/*", route => {
        const reqUrl = route.request().url();
        const type = route.request().resourceType();
        if (
          ["image", "stylesheet", "font", "media"].includes(type) ||
          reqUrl.includes("a-ads") ||
          reqUrl.includes("google") ||
          reqUrl.includes("histats") ||
          reqUrl.includes("sharethis") ||
          reqUrl.includes("dtscout") ||
          reqUrl.includes("mediumdirt")
        ) {
          return route.abort();
        }
        route.continue();
      });

      let chaptersData = null;
      page.on("response", async res => {
        if (res.url().includes("/komik/") && res.url().includes("/chapter?limit=")) {
          try {
            chaptersData = await res.json();
          } catch {}
        }
      });

      await page.goto(`${BASE_URL}/${slug}`, { waitUntil: "domcontentloaded", timeout: 20000 });

      for (let i = 0; i < 40; i++) {
        if (chaptersData) break;
        await page.waitForTimeout(100);
      }

      await page.close();
      return chaptersData?.chapter ?? [];
    } catch {
      return [];
    }
  }

  async getChapter(slugOrUrl, chapterNum) {
    let slug = this.extractSlug(slugOrUrl);
    let ch = chapterNum ? String(chapterNum).trim() : "";

    if (slugOrUrl.includes("/chapter/")) {
      const parts = slugOrUrl.split("/chapter/");
      slug = this.extractSlug(parts[0]);
      ch = parts[1].replace(/^\/+|\/+$/g, "");
    }

    if (!slug || !ch) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, "Comic slug and chapter number are required", 400);
    }

    const candidates = [ch];
    if (/^\d+$/.test(ch)) {
      const p3 = ch.padStart(3, "0");
      const p2 = ch.padStart(2, "0");
      if (!candidates.includes(p3)) candidates.push(p3);
      if (!candidates.includes(p2)) candidates.push(p2);
    }

    let nextData = null;
    let resolvedCh = ch;
    for (const cand of candidates) {
      try {
        nextData = await this.fetchNextData(`${BASE_URL}/${slug}/chapter/${cand}`);
        resolvedCh = cand;
        break;
      } catch (e) {
        if (cand === candidates[candidates.length - 1]) throw e;
      }
    }

    const pageProps = nextData?.props?.pageProps ?? {};
    const pageData = pageProps.data ?? {};

    let rawImages = Array.isArray(pageProps.imgList) ? pageProps.imgList : [];
    let storageInter2 = Boolean(pageData.data?.storageInter2);

    if (rawImages.length === 0) {
      try {
        const apiImgUrl = `${BASE_URL}/api/imgs/${slug}/${resolvedCh}`;
        const imgRes = await fetch(apiImgUrl, { headers: HEADERS });
        if (imgRes.ok) {
          const imgJson = await imgRes.json();
          if (Array.isArray(imgJson?.imageSrc)) {
            rawImages = imgJson.imageSrc;
          }
        }
      } catch {}
    }

    const formattedImages = rawImages.map((src, idx) => normalizeImage({
      index: idx,
      image: this.formatImageUrl(src, storageInter2),
      rawPath: src
    }, idx));

    return {
      id: `softkomik:${slug}:${ch}`,
      number: ch,
      title: `Chapter ${ch}`,
      images: formattedImages
    };
  }

  async _fetchChapterImagesViaBrowser(slug, chapter) {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage({
        userAgent: HEADERS["User-Agent"]
      });

      await page.route("**/*", route => {
        const reqUrl = route.request().url();
        const type = route.request().resourceType();
        if (
          ["stylesheet", "font", "media"].includes(type) ||
          reqUrl.includes("a-ads") ||
          reqUrl.includes("google") ||
          reqUrl.includes("histats") ||
          reqUrl.includes("sharethis") ||
          reqUrl.includes("dtscout") ||
          reqUrl.includes("mediumdirt")
        ) {
          return route.abort();
        }
        route.continue();
      });

      let chapterImgs = null;
      page.on("response", async res => {
        if (res.url().includes("/imgs/")) {
          try {
            chapterImgs = await res.json();
          } catch {}
        }
      });

      await page.goto(`${BASE_URL}/${slug}/chapter/${chapter}`, { waitUntil: "domcontentloaded", timeout: 20000 });

      for (let i = 0; i < 40; i++) {
        if (chapterImgs) break;
        await page.waitForTimeout(100);
      }

      await page.close();
      return chapterImgs ?? { imageSrc: [] };
    } catch {
      return { imageSrc: [] };
    }
  }
}
