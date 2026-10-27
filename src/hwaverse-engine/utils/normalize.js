export function normalizeType(type) {
  if (!type) return null;
  const clean = String(type).trim().toLowerCase();
  if (clean === "manhwa" || clean === "korean") return "manhwa";
  if (clean === "manga" || clean === "japanese") return "manga";
  if (clean === "manhua" || clean === "chinese") return "manhua";
  if (clean === "novel" || clean === "light novel") return "novel";
  if (clean === "comic" || clean === "webtoon") return "comic";
  return clean;
}

export function normalizeComic(raw = {}) {
  const source = String(raw.source ?? "").trim();
  const sourceId = String(raw.sourceId ?? raw.id ?? "").trim();
  const id = raw.id && String(raw.id).includes(":") ? String(raw.id) : `${source}:${sourceId}`;

  return {
    id,
    source,
    sourceId,
    slug: raw.slug ? String(raw.slug).trim() : null,
    title: String(raw.title ?? "").trim(),
    alternativeTitles: Array.isArray(raw.alternativeTitles)
      ? raw.alternativeTitles.filter(Boolean).map(t => String(t).trim())
      : raw.alternative_titles
        ? JSON.parse(raw.alternative_titles)
        : [],
    type: normalizeType(raw.type),
    status: raw.status ? String(raw.status).trim() : null,
    genres: Array.isArray(raw.genres)
      ? raw.genres.filter(Boolean).map(g => String(g).trim())
      : raw.genres_json
        ? JSON.parse(raw.genres_json)
        : [],
    author: raw.author ? String(raw.author).trim() : null,
    artist: raw.artist ? String(raw.artist).trim() : null,
    cover: raw.cover ? String(raw.cover).trim() : null,
    synopsis: raw.synopsis ? String(raw.synopsis).trim() : null,
    latestChapter: raw.latestChapter ?? raw.latest_chapter ?? null,
    rating: {
      value: raw.rating?.value !== undefined && raw.rating?.value !== null
        ? Number(raw.rating.value)
        : raw.rating_value !== undefined && raw.rating_value !== null
          ? Number(raw.rating_value)
          : null,
      count: raw.rating?.count !== undefined && raw.rating?.count !== null
        ? Number(raw.rating.count)
        : raw.rating_count !== undefined && raw.rating_count !== null
          ? Number(raw.rating_count)
          : null
    },
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null
  };
}

export function normalizeChapter(raw = {}) {
  const source = String(raw.source ?? "").trim();
  const comicId = String(raw.comicId ?? raw.comic_id ?? "").trim();
  const sourceId = String(raw.sourceId ?? raw.source_id ?? "").trim();
  const chapter = String(raw.chapter ?? "").trim();
  const id = raw.id ?? `${comicId}:${chapter}`;

  return {
    id,
    comicId,
    source,
    sourceId,
    chapter,
    title: raw.title ? String(raw.title).trim() : `Chapter ${chapter}`,
    url: raw.url ? String(raw.url).trim() : null,
    releaseDate: raw.releaseDate ?? raw.release_date ?? null
  };
}

export function normalizeImage(raw = {}, defaultIndex = 0) {
  const index = Number(raw.index ?? defaultIndex);
  const image = String(raw.image ?? raw.image_url ?? "").trim();
  const rawPath = raw.rawPath ?? raw.raw_path ?? null;

  return {
    index,
    image,
    rawPath: rawPath ? String(rawPath).trim() : null
  };
}
