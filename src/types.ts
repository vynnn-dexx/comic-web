export type MediaFormatType = 'manhwa' | 'manga' | 'manhua' | 'comic' | 'novel';

export type ReaderTheme = 'mint' | 'dark' | 'sepia';
export type ReaderViewMode = 'webtoon' | 'paginated' | 'novel';

export interface ComicItem {
  id: string;
  source: string;
  sourceId: string;
  slug: string;
  title: string;
  alternativeTitles: string[];
  type: MediaFormatType;
  status: string;
  genres: string[];
  author: string;
  artist: string;
  cover: string | null;
  synopsis: string;
  latestChapter: string;
  rating: {
    value: number;
    count: number;
  };
  updatedAt: string;
}

export interface ChapterItem {
  id: string;
  comicId: string;
  source: string;
  sourceId: string;
  chapter: string;
  title: string;
  url: string | null;
  releaseDate: string;
}

export interface ChapterReaderData {
  id: string;
  comicId: string;
  source: string;
  sourceId: string;
  number: string;
  title: string;
  type: MediaFormatType;
  images: { index: number; image: string }[];
  novelContent?: {
    subtitle?: string;
    authorNote?: string;
    paragraphs: string[];
    glossary?: { term: string; definition: string }[];
  };
  prevChapter: string | null;
  nextChapter: string | null;
  totalChapters: number;
}

export interface BookmarkRecord {
  id: string;
  userId: string;
  comicId: string;
  source: string;
  sourceId: string;
  title: string;
  cover: string;
  type: MediaFormatType;
  latestChapter: string;
  updatedAtIso: string;
}

export interface ReadingHistoryRecord {
  id: string;
  userId: string;
  comicId: string;
  source: string;
  sourceId: string;
  title: string;
  cover: string;
  type: MediaFormatType;
  chapterId: string;
  chapterNumber: string;
  chapterTitle: string;
  totalChapters: number;
  lastPosition: number;
  scrollPercentage: number;
  isFinished: boolean;
  deviceLabel: string;
  updatedAtIso: string;
}
