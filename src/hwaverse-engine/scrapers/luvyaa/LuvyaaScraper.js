/**
 * =============================================================
 *  NAME       : LUVYAA MANGA/MANHWA SCRAPER
 *  AUTHOR     : Kyu:英俊的
 * =============================================================
 */

import axios from "axios";
import * as cheerio from "cheerio";

axios.defaults.timeout = 30000;

const BASE_URL = "https://v5.luvyaa.co";
const CREATOR = "Kyu:英俊的";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: BASE_URL
};

async function fetchHtml(url) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 30000 });
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      throw new Error("Halaman atau komik tidak ditemukan di Luvyaa (404)");
    }
    throw new Error(`Gagal terhubung ke Luvyaa: ${err.message}`);
  }
}

function cleanSlug(input) {
  if (!input) return "";
  let str = input.trim();
  if (str.startsWith("http://") || str.startsWith("https://")) {
    try {
      const parsed = new URL(str);
      str = parsed.pathname;
    } catch (_) {}
  }
  return str.replace(/^\/+|\/+$/g, "");
}

function parseMangaCards($) {
  const results = [];
  const seen = new Set();

  $(".bs .bsx, .listupd .bs, .page-item-detail").each((_, el) => {
    const $el = $(el);
    const a = $el.find("a").first();
    const href = a.attr("href");
    if (!href) return;

    const slug = cleanSlug(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const img = $el.find("img").first();
    const image =
      img.attr("src") || img.attr("data-src") || img.attr("lazy-src") || "";
    const title =
      $el.find(".tt, .series h4, h4, h3").first().text().trim() ||
      a.attr("title") ||
      "";
    const type = $el.find(".type, .typeflag").first().text().trim() || "";

    const rawRating =
      $el.find(".numscore, .rating, .score").first().text().trim() || "";
    const rating = rawRating
      ? rawRating.replace(/\s+/g, " ").trim().split(" ")[0]
      : null;

    const latestChapter =
      $el.find(".epxs, .adds .epxs, .ep").first().text().trim() || "";
    const latestChapterLink = $el.find(".epxs a, .adds a").first().attr("href");
    const latestChapterSlug = latestChapterLink
      ? cleanSlug(latestChapterLink)
      : null;

    const isCompleted =
      $el.find(".status.completed, .completed").length > 0 ||
      $el.text().toLowerCase().includes("completed");

    results.push({
      title,
      slug,
      url: href.startsWith("http") ? href : `${BASE_URL}/${slug}/`,
      image,
      type,
      rating,
      latestChapter,
      latestChapterSlug,
      status: isCompleted ? "Completed" : "Ongoing"
    });
  });

  return results;
}

export async function searchLuvyaa(query, page = 1) {
  if (!query) throw new Error("Parameter query wajib diisi");
  const p = parseInt(page, 10) || 1;
  const url =
    p > 1
      ? `${BASE_URL}/page/${p}/?s=${encodeURIComponent(query)}`
      : `${BASE_URL}/?s=${encodeURIComponent(query)}`;

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const results = parseMangaCards($);

  const hasNextPage =
    $(".hpage .r, .pagination .next, a.next, .nav-previous a").length > 0;

  return {
    status: true,
    creator: CREATOR,
    query,
    page: p,
    hasNextPage,
    total: results.length,
    results
  };
}

export async function getLatestLuvyaa(page = 1) {
  const p = parseInt(page, 10) || 1;
  const url =
    p > 1
      ? `${BASE_URL}/manga/page/${p}/?order=update`
      : `${BASE_URL}/manga/?order=update`;

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const results = parseMangaCards($);

  const hasNextPage =
    $(".hpage .r, .pagination .next, a.next, .nav-previous a").length > 0;

  return {
    status: true,
    creator: CREATOR,
    page: p,
    hasNextPage,
    total: results.length,
    results
  };
}

export async function getPopularLuvyaa(page = 1) {
  const p = parseInt(page, 10) || 1;
  const url =
    p > 1
      ? `${BASE_URL}/manga/page/${p}/?order=popular`
      : `${BASE_URL}/manga/?order=popular`;

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const results = parseMangaCards($);

  const hasNextPage =
    $(".hpage .r, .pagination .next, a.next, .nav-previous a").length > 0;

  return {
    status: true,
    creator: CREATOR,
    page: p,
    hasNextPage,
    total: results.length,
    results
  };
}

const LUVYAA_GENRES_ENUM = [
  { name: "Action", slug: "action" },
  { name: "Adult", slug: "adult" },
  { name: "Adventure", slug: "adventure" },
  { name: "Comedy", slug: "comedy" },
  { name: "Drama", slug: "drama" },
  { name: "Ecchi", slug: "ecchi" },
  { name: "Fantasy", slug: "fantasy" },
  { name: "Harem", slug: "harem" },
  { name: "Historical", slug: "historical" },
  { name: "Horror", slug: "horror" },
  { name: "Isekai", slug: "isekai" },
  { name: "Josei", slug: "josei" },
  { name: "Martial Arts", slug: "martial-arts" },
  { name: "Mature", slug: "mature" },
  { name: "Mecha", slug: "mecha" },
  { name: "Medical", slug: "medical" },
  { name: "Mystery", slug: "mystery" },
  { name: "Psychological", slug: "psychological" },
  { name: "Reverse Harem", slug: "reverse-harem" },
  { name: "Romance", slug: "romance" },
  { name: "School Life", slug: "school-life" },
  { name: "Sci-Fi", slug: "sci-fi" },
  { name: "Seinen", slug: "seinen" },
  { name: "Shoujo", slug: "shoujo" },
  { name: "Shounen", slug: "shounen" },
  { name: "Slice of Life", slug: "slice-of-life" },
  { name: "Smut", slug: "smut" },
  { name: "Sports", slug: "sports" },
  { name: "Supernatural", slug: "supernatural" },
  { name: "Thriller", slug: "thriller" },
  { name: "Tragedy", slug: "tragedy" }
];

export async function getGenresLuvyaa() {
  const genresMap = new Map();
  LUVYAA_GENRES_ENUM.forEach(g => {
    genresMap.set(g.slug, { name: g.name, slug: g.slug, url: `${BASE_URL}/genres/${g.slug}/` });
  });

  try {
    const url = `${BASE_URL}/manga/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    $(
      "a[href*='/genres/'], a[href*='/genre/'], .dropdown-menu.c4.genrelab li, ul.genre li"
    ).each((_, el) => {
      const $el = $(el);
      const a = $el.is("a") ? $el : $el.find("a").first();
      const href = a.attr("href") || $el.find("input").attr("value");
      const name = $el.text().trim() || a.text().trim();

      if (href && name) {
        const slug = cleanSlug(href).replace(/^genres\/|^genre\//, "");
        if (slug && !genresMap.has(slug)) {
          genresMap.set(slug, {
            name: name.replace(/\s+/g, " "),
            slug,
            url: `${BASE_URL}/genres/${slug}/`
          });
        }
      }
    });
  } catch (_) {}

  const genres = Array.from(genresMap.values());

  return {
    status: true,
    creator: CREATOR,
    total: genres.length,
    results: genres
  };
}

export async function getByGenreLuvyaa(genre, page = 1) {
  if (!genre) throw new Error("Parameter genre wajib diisi");
  const cleanGenre = cleanSlug(genre).replace(/^genres\/|^genre\//, "");
  const p = parseInt(page, 10) || 1;

  const url =
    p > 1
      ? `${BASE_URL}/genres/${cleanGenre}/page/${p}/`
      : `${BASE_URL}/genres/${cleanGenre}/`;

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const results = parseMangaCards($);

  const hasNextPage =
    $(".hpage .r, .pagination .next, a.next, .nav-previous a").length > 0;

  return {
    status: true,
    creator: CREATOR,
    genre: cleanGenre,
    page: p,
    hasNextPage,
    total: results.length,
    results
  };
}

export async function getDetailLuvyaa(slugOrUrl) {
  if (!slugOrUrl) throw new Error("Parameter slug / URL wajib diisi");
  
  let rawSlug = cleanSlug(slugOrUrl);
  let baseSlug = rawSlug;
  if (baseSlug.includes("-chapter-")) {
    baseSlug = baseSlug.replace(/-chapter-.*$/i, "");
  } else if (baseSlug.includes("-ch-")) {
    baseSlug = baseSlug.replace(/-ch-.*$/i, "");
  }
  baseSlug = baseSlug.replace(/^manga\//i, "");

  let url = slugOrUrl.startsWith("http") && !slugOrUrl.includes("-chapter-") ? slugOrUrl : `${BASE_URL}/${baseSlug}/`;

  let html = await fetchHtml(url);
  let $ = cheerio.load(html);

  // Jika halaman yang dibuka adalah halaman chapter, cari breadcrumb/link detail komik utama
  if (!$("#chapterlist").length && !$(".eplister").length && !$("ul.main.version-chap").length && !$("li.wp-manga-chapter").length) {
    const mangaBreadcrumb = $(".breadcrumb a, .ts-breadcrumb a, .allc a").toArray().find((el) => {
      const href = $(el).attr("href") || "";
      return href.includes(`${BASE_URL}/`) && !href.includes("-chapter-") && !href.endsWith("/manga/");
    });

    if (mangaBreadcrumb) {
      const bHref = $(mangaBreadcrumb).attr("href");
      baseSlug = cleanSlug(bHref);
      url = bHref.startsWith("http") ? bHref : `${BASE_URL}/${baseSlug}/`;
      html = await fetchHtml(url);
      $ = cheerio.load(html);
    }
  }

  const title =
    $(".entry-title").first().text().trim() ||
    $("h1").first().text().trim();

  if (!title) throw new Error("Komik tidak ditemukan");

  const alternativeTitle =
    $(".alternative").first().text().trim() ||
    $(".alter").first().text().trim() ||
    null;

  const img = $(".thumb img, .bigcontent img").first();
  const image =
    img.attr("src") ||
    img.attr("data-src") ||
    $("meta[property='og:image']").attr("content") ||
    "";

  const rating =
    $(".rating-score").first().text().trim() ||
    $(".num").first().text().trim() ||
    $(".rating strong").first().text().trim() ||
    null;

  const status =
    $(".kh-status, .status-text").first().text().trim() ||
    "";

  const synopsis =
    $(".entry-content, .entry-content-single, .desc, .synopsis")
      .first()
      .text()
      .trim() || "";

  const genres = [];
  $(".mgen a, .gnr a, a[href*='/genres/']").each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const chapters = [];
  const seenChapters = new Set();

  $(
    "#chapterlist li, .eplister li, ul.main.version-chap li, li.wp-manga-chapter, .cl li, div.chapter-list li, .bxcl ul li, ul.cl li, .chapter-list-wrap li, div.eph-num, .lchx li"
  ).each((_, el) => {
    const $el = $(el);
    const a = $el.find("a").first();
    const href = a.attr("href");
    if (!href) return;

    const cSlug = cleanSlug(href);
    if (!cSlug || seenChapters.has(cSlug)) return;
    seenChapters.add(cSlug);

    const chapNumEl = $el.find(".chapternum, .chap, .chapter-title, .ep-title, span.ch").first();
    let chapNum = chapNumEl.length ? chapNumEl.text() : a.text();
    chapNum = chapNum.replace(/\s+/g, " ").trim();
    if (chapNum.includes("\n")) {
      chapNum = chapNum.split("\n")[0].trim();
    }

    const chapDateEl = $el.find(".chapterdate, .date, .dt").first();
    let chapDate = chapDateEl.length ? chapDateEl.text().replace(/\s+/g, " ").trim() : null;

    chapters.push({
      title: chapNum || cSlug,
      slug: cSlug,
      url: href.startsWith("http") ? href : `${BASE_URL}/${cSlug}/`,
      releaseDate: chapDate || null
    });
  });

  return {
    status: true,
    creator: CREATOR,
    result: {
      title,
      alternativeTitle,
      slug: baseSlug,
      url: `${BASE_URL}/${baseSlug}/`,
      image,
      rating,
      status,
      genres,
      synopsis,
      totalChapters: chapters.length,
      chapters
    }
  };
}

export async function getChapterLuvyaa(slugOrUrl, chapterInput = null) {
  if (!slugOrUrl) throw new Error("Parameter slug / URL chapter wajib diisi");

  let rawSlug = cleanSlug(slugOrUrl);
  let chapter = chapterInput ? String(chapterInput).trim() : null;

  let slug = rawSlug;
  let url = slugOrUrl.startsWith("http") ? slugOrUrl : `${BASE_URL}/${slug}/`;

  // Determine base manga slug
  let baseSlug = rawSlug;
  if (baseSlug.includes("-chapter-")) {
    baseSlug = baseSlug.replace(/-chapter-.*$/i, "");
  } else if (baseSlug.includes("-ch-")) {
    baseSlug = baseSlug.replace(/-ch-.*$/i, "");
  }
  baseSlug = baseSlug.replace(/^manga\//i, "");

  // If chapter parameter is provided
  if (chapter) {
    let cNum = chapter.toLowerCase();
    if (cNum.startsWith("chapter-")) {
      cNum = cNum.replace(/^chapter-/, "").trim();
    } else if (cNum.startsWith("chapter")) {
      cNum = cNum.replace(/^chapter/, "").trim();
    } else if (cNum.startsWith("ch-")) {
      cNum = cNum.replace(/^ch-/, "").trim();
    } else if (cNum.startsWith("ch")) {
      cNum = cNum.replace(/^ch/, "").trim();
    }

    const candidateSlug = `${baseSlug}-chapter-${cNum}`;
    const candidateUrl = `${BASE_URL}/${candidateSlug}/`;

    let directSuccess = false;
    try {
      const htmlCand = await fetchHtml(candidateUrl);
      const $cand = cheerio.load(htmlCand);
      if ($cand("#readerarea").length || htmlCand.includes("ts_reader")) {
        slug = candidateSlug;
        url = candidateUrl;
        directSuccess = true;
      }
    } catch (_) {}

    if (!directSuccess) {
      // Direct candidate failed, fetch manga detail page to find chapter URL in chapterlist
      const detailUrl = `${BASE_URL}/${baseSlug}/`;
      const detailHtml = await fetchHtml(detailUrl);
      const $detail = cheerio.load(detailHtml);

      let foundHref = null;
      $detail("#chapterlist li, .eplister li").each((_, el) => {
        if (foundHref) return;
        const $el = $detail(el);
        const a = $el.find("a").first();
        const href = a.attr("href");
        if (!href) return;

        const chapText = $el.find(".chapternum").first().text().trim() || a.text().trim();
        const cSlug = cleanSlug(href);

        const chapTextNum = chapText.replace(/[^0-9.]/g, "");
        if (
          cSlug === candidateSlug ||
          cSlug.endsWith(`-chapter-${cNum}`) ||
          cSlug.endsWith(`-ch-${cNum}`) ||
          cSlug.endsWith(`-${cNum}`) ||
          chapTextNum === cNum ||
          chapText.toLowerCase().includes(`chapter ${cNum}`) ||
          chapText.toLowerCase().includes(`ch ${cNum}`)
        ) {
          foundHref = href;
        }
      });

      if (foundHref) {
        slug = cleanSlug(foundHref);
        url = foundHref.startsWith("http") ? foundHref : `${BASE_URL}/${slug}/`;
      } else {
        throw new Error(`Chapter '${chapter}' tidak ditemukan untuk komik '${baseSlug}'`);
      }
    }
  }

  let html = await fetchHtml(url);
  let $ = cheerio.load(html);

  // Jika input adalah slug komik detail (bukan chapter), otomatis ambil chapter terbaru/pertama
  if (!$("#readerarea").length && ($("#chapterlist").length || $(".eplister").length)) {
    const firstChapHref = $("#chapterlist li a, .eplister li a").first().attr("href");
    if (firstChapHref) {
      slug = cleanSlug(firstChapHref);
      url = firstChapHref.startsWith("http") ? firstChapHref : `${BASE_URL}/${slug}/`;
      html = await fetchHtml(url);
      $ = cheerio.load(html);
    }
  }

  const title = $("title").text().trim();
  const h1 = $("h1").first().text().trim() || title;

  let images = [];
  let tsPrevUrl = null;
  let tsNextUrl = null;

  const scriptText = $("script").text();
  const tsMatch = scriptText.match(/ts_reader\.run\((.*?)\);/s);

  if (tsMatch) {
    try {
      const json = JSON.parse(tsMatch[1]);
      if (json.sources && json.sources[0] && Array.isArray(json.sources[0].images)) {
        images = json.sources[0].images;
      }
      if (json.prevUrl) tsPrevUrl = json.prevUrl;
      if (json.nextUrl) tsNextUrl = json.nextUrl;
    } catch (_) {}
  }

  // Fallback 1: #readerarea img
  if (!images.length) {
    $("#readerarea img").each((_, el) => {
      const src =
        $(el).attr("src") || $(el).attr("data-src") || $(el).attr("lazy-src");
      if (
        src &&
        !src.includes("banner") &&
        !src.includes("logo") &&
        !src.includes("readerarea.svg")
      ) {
        images.push(src);
      }
    });
  }

  // Fallback 2: #readerarea noscript img
  if (!images.length) {
    const noscriptHtml = $("#readerarea noscript").html() || "";
    const $no = cheerio.load(noscriptHtml);
    $no("img").each((_, el) => {
      const src = $no(el).attr("src") || $no(el).attr("data-src");
      if (
        src &&
        !src.includes("banner") &&
        !src.includes("logo") &&
        !src.includes("readerarea.svg")
      ) {
        images.push(src);
      }
    });
  }

  const prevLink =
    tsPrevUrl ||
    $(".nextprev a[rel='prev']").attr("href") ||
    $(".chapnav a[rel='prev']").attr("href") ||
    null;
  const nextLink =
    tsNextUrl ||
    $(".nextprev a[rel='next']").attr("href") ||
    $(".chapnav a[rel='next']").attr("href") ||
    null;

  const prevSlug =
    prevLink && !prevLink.includes("#") && prevLink.trim() !== ""
      ? cleanSlug(prevLink)
      : null;
  const nextSlug =
    nextLink && !nextLink.includes("#") && nextLink.trim() !== ""
      ? cleanSlug(nextLink)
      : null;

  const allBreadcrumbs = [];
  $(".breadcrumb a, .ts-breadcrumb a, .allc a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      allBreadcrumbs.push({
        title: $(el).text().trim(),
        url: href
      });
    }
  });

  const mangaInfoBreadcrumb = allBreadcrumbs.find(
    (b) =>
      b.url.includes(`${BASE_URL}/`) &&
      !b.url.includes("-chapter-") &&
      !b.url.endsWith("/manga/")
  );

  return {
    status: true,
    creator: CREATOR,
    result: {
      title: h1,
      slug,
      url: `${BASE_URL}/${slug}/`,
      mangaSlug: mangaInfoBreadcrumb ? cleanSlug(mangaInfoBreadcrumb.url) : null,
      mangaUrl: mangaInfoBreadcrumb ? mangaInfoBreadcrumb.url : null,
      prevChapter: prevSlug ? `${BASE_URL}/${prevSlug}/` : null,
      prevChapterSlug: prevSlug,
      nextChapter: nextSlug ? `${BASE_URL}/${nextSlug}/` : null,
      nextChapterSlug: nextSlug,
      totalImages: images.length,
      images
    }
  };
}

export default {
  searchLuvyaa,
  getLatestLuvyaa,
  getPopularLuvyaa,
  getGenresLuvyaa,
  getByGenreLuvyaa,
  getDetailLuvyaa,
  getChapterLuvyaa
};
