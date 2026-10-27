import { BaseScraper } from "../BaseScraper.js";
import { normalizeComic, normalizeChapter, normalizeImage } from "../../utils/normalize.js";
import luvyaaApi from "./LuvyaaScraper.js";

export class LuvyaaAdapter extends BaseScraper {
  constructor() {
    super("luvyaa");
  }

  _cleanId(id) {
    if (!id) return "";
    return String(id).replace(/^luvyaa:/i, "").trim();
  }

  async getHome() {
    const [latestRes, popRes] = await Promise.allSettled([
      luvyaaApi.getLatestLuvyaa(1),
      luvyaaApi.getPopularLuvyaa(1)
    ]);

    const latest = (latestRes.status === "fulfilled" && latestRes.value?.results)
      ? latestRes.value.results.map(r => this._mapComic(r))
      : [];

    const popular = (popRes.status === "fulfilled" && popRes.value?.results)
      ? popRes.value.results.map(r => this._mapComic(r))
      : [];

    return {
      latest,
      new: latest.slice(0, 10),
      popular
    };
  }

  async getLatest(page = 1) {
    const res = await luvyaaApi.getLatestLuvyaa(page);
    return {
      items: (res.results || []).map(r => this._mapComic(r)),
      page: res.page || page,
      hasNextPage: res.hasNextPage || false
    };
  }

  async search(query, page = 1) {
    const res = await luvyaaApi.searchLuvyaa(query, page);
    return {
      items: (res.results || []).map(r => this._mapComic(r)),
      page: res.page || page,
      hasNextPage: res.hasNextPage || false
    };
  }

  async getByGenre(genre, page = 1) {
    const cleanGenre = String(genre || "").toLowerCase().trim();
    if (["manhwa", "manga", "manhua", "comic", "novel", "all"].includes(cleanGenre)) {
      return this.getLatest(page);
    }
    try {
      const res = await luvyaaApi.getByGenreLuvyaa(cleanGenre, page);
      const items = (res.results || []).map(r => this._mapComic(r));
      return {
        genre: cleanGenre,
        items,
        page: res.page || Number(page) || 1,
        hasNextPage: res.hasNextPage || false
      };
    } catch {
      return {
        genre: cleanGenre,
        items: [],
        page: Number(page) || 1,
        hasNextPage: false
      };
    }
  }

  async getByType(type, page = 1) {
    return this.getLatest(page);
  }

  async getDetail(id, includeChapters = true) {
    const cleanId = this._cleanId(id);
    const res = await luvyaaApi.getDetailLuvyaa(cleanId);
    const data = res.result;

    const comic = normalizeComic({
      id: `luvyaa:${data.slug}`,
      source: "luvyaa",
      sourceId: data.slug,
      slug: data.slug,
      title: data.title,
      alternativeTitle: data.alternativeTitle,
      cover: data.image,
      thumbnail: data.image,
      rating: data.rating ? parseFloat(data.rating) : 8.0,
      status: data.status || "Ongoing",
      type: "manhwa",
      genres: data.genres || [],
      synopsis: data.synopsis,
      totalChapters: data.totalChapters || data.chapters?.length || 0
    });

    const chapters = includeChapters && Array.isArray(data.chapters)
      ? data.chapters.map(ch => normalizeChapter({
          id: `luvyaa:${data.slug}:${ch.slug}`,
          comicId: `luvyaa:${data.slug}`,
          source: "luvyaa",
          sourceId: data.slug,
          chapter: ch.slug,
          title: ch.title,
          releaseDate: ch.releaseDate
        }))
      : [];

    return { comic, chapters };
  }

  async getChapters(id) {
    const detail = await this.getDetail(id, true);
    return detail.chapters;
  }

  async getChapter(id, chapterNum) {
    const cleanId = this._cleanId(id);
    const cleanCh = chapterNum ? String(chapterNum).trim() : "";

    let res;
    if (cleanCh && (cleanCh.includes("-chapter-") || cleanCh.startsWith("http") || cleanCh.startsWith(cleanId))) {
      res = await luvyaaApi.getChapterLuvyaa(cleanCh);
    } else {
      res = await luvyaaApi.getChapterLuvyaa(cleanId, cleanCh || null);
    }
    const data = res.result;

    const images = (data.images || []).map((img, idx) => {
      if (typeof img === "string") {
        return normalizeImage({ image: img, index: idx + 1 }, idx + 1);
      }
      return normalizeImage(img, idx + 1);
    });

    return {
      id: `luvyaa:${cleanId}:${cleanCh || data.slug}`,
      number: String(cleanCh || data.slug),
      title: data.title || `Chapter ${cleanCh}`,
      images,
      prevChapter: data.prevChapterSlug,
      nextChapter: data.nextChapterSlug
    };
  }

  _mapComic(r) {
    return normalizeComic({
      id: `luvyaa:${r.slug}`,
      source: "luvyaa",
      sourceId: r.slug,
      slug: r.slug,
      title: r.title,
      cover: r.image,
      thumbnail: r.image,
      type: r.type || "manhwa",
      status: r.status || "Ongoing",
      latestChapter: r.latestChapter,
      rating: r.rating ? parseFloat(r.rating) : 8.0
    });
  }
}
