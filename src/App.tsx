/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  Bookmark,
  Check,
  Compass,
  Copy,
  History,
  Laptop,
  List,
  Moon,
  RefreshCw,
  Search,
  Smartphone,
  Sun,
  Trash2,
  Type,
} from 'lucide-react';
import {
  BookmarkRecord,
  ChapterItem,
  ChapterReaderData,
  ComicItem,
  ReaderTheme,
  ReaderViewMode,
  ReadingHistoryRecord,
} from './types';
import { getBookCoverArtwork, sanitizeDocId } from './utils/artworkGenerator';
import {
  DoodleSpeechBurst,
  DoodleStar,
  DoodleUnderline,
} from './components/DoodleAccents';
import { StackedFanDeck } from './components/StackedFanDeck';
import { SeriesDetailModal } from './components/SeriesDetailModal';
import { ReaderModal } from './components/ReaderModal';

type ActiveSection = 'explore' | 'catalog' | 'bookmarks' | 'history' | 'sync';

const LOCAL_BOOKMARKS_KEY = 'komibaca_bookmarks_v1';
const LOCAL_HISTORY_KEY = 'komibaca_history_v1';
const LOCAL_PREFS_KEY = 'komibaca_prefs_v1';
const LOCAL_DEVICE_ID_KEY = 'komibaca_device_id_v1';
const LOCAL_SYNC_KEY = 'komibaca_sync_key_v1';

function getOrCreateDeviceId(): string {
  try {
    const existing =
      localStorage.getItem(LOCAL_DEVICE_ID_KEY) ||
      localStorage.getItem('hwaverse_device_id_v2');
    if (existing) return existing;
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newId = `DEV-${rand}`;
    localStorage.setItem(LOCAL_DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return 'DEV-WEB1';
  }
}

function detectDeviceLabel(): string {
  if (typeof window === 'undefined') return 'Web Reader';
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  return isMobile ? 'HP / Smartphone' : 'Desktop / Laptop';
}

interface CatalogCardProps {
  comic: ComicItem;
  isSaved: boolean;
  lastChapterNumber?: string;
  onOpenDetail: (comic: ComicItem) => void;
  onStartReading: (comic: ComicItem, chapterNum?: string) => void;
  onToggleBookmark: (comic: ComicItem) => void;
}

const CatalogCard = memo(
  ({
    comic,
    isSaved,
    lastChapterNumber,
    onOpenDetail,
    onStartReading,
    onToggleBookmark,
  }: CatalogCardProps) => {
    const coverSrc = getBookCoverArtwork(comic);

    return (
      <article className="ink-card catalog-card-item overflow-hidden flex flex-col justify-between relative">
        <div>
          {/* Cover Thumbnail */}
          <div
            onClick={() => onOpenDetail(comic)}
            className="relative aspect-[3/4] w-full overflow-hidden border-b-[2.5px] border-[var(--border-ink)] bg-[var(--bg-elevated)] cursor-pointer group"
          >
            <img
              src={coverSrc}
              alt={comic.title}
              referrerPolicy="no-referrer"
              decoding="async"
              loading="lazy"
              onError={(e) => {
                const target = e.currentTarget;
                const fallback = getBookCoverArtwork({ ...comic, cover: null });
                if (target.src !== fallback) target.src = fallback;
              }}
              className="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white flex items-center justify-between text-xs font-mono-num">
              <span>Bab {comic.latestChapter}</span>
              <span>{comic.source.toUpperCase()}</span>
            </div>
          </div>

          {/* Card Body (Zero-Pill Unboxed Metadata) */}
          <div className="p-4 space-y-2">
            <div className="text-[11px] font-mono-num text-[var(--ink-secondary)] flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[var(--ink-primary)]">
                {comic.type.toUpperCase()}
              </span>
              <span aria-hidden="true">·</span>
              <span>Pustaka: {comic.source}</span>
              <span aria-hidden="true">·</span>
              <span>{comic.status || 'Ongoing'}</span>
            </div>

            <h3
              onClick={() => onOpenDetail(comic)}
              className="font-display text-base font-bold text-[var(--ink-primary)] line-clamp-2 cursor-pointer hover:underline"
            >
              {comic.title}
            </h3>

            {comic.genres && comic.genres.length > 0 && (
              <p className="text-xs text-[var(--ink-secondary)] truncate">
                {comic.genres.slice(0, 3).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Card Footer Actions: Direct Read + Chapter List + Bookmark */}
        <div className="px-4 pb-4 pt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onStartReading(comic, lastChapterNumber)}
            className="flex-1 px-3 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold flex items-center justify-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>
              {lastChapterNumber ? `Lanjut Bab ${lastChapterNumber}` : 'Langsung Baca'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenDetail(comic)}
            title="Lihat Daftar Bab"
            aria-label="Lihat Daftar Bab"
            className="p-2 bg-[var(--bg-surface)] text-[var(--ink-primary)] ink-button cursor-pointer shrink-0"
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onToggleBookmark(comic)}
            title="Simpan ke Bookmark"
            aria-label="Simpan ke Bookmark"
            className="p-2 bg-[var(--bg-elevated)] text-[var(--ink-primary)] ink-button cursor-pointer shrink-0"
          >
            {isSaved ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
          </button>
        </div>
      </article>
    );
  }
);

export default function App() {
  // Navigation & Theme State
  const [activeSection, setActiveSection] = useState<ActiveSection>('explore');
  const [theme, setTheme] = useState<ReaderTheme>('mint');
  const [viewMode, setViewMode] = useState<ReaderViewMode>('webtoon');
  const [fontSize, setFontSize] = useState<number>(18);

  // Zero-Login Device ID & IP Sync State
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [deviceLabel] = useState<string>(() => detectDeviceLabel());
  const [syncKey, setSyncKey] = useState<string>(
    () => localStorage.getItem(LOCAL_SYNC_KEY) || ''
  );
  const [customSyncInput, setCustomSyncInput] = useState<string>('');
  const [detectedIpKey, setDetectedIpKey] = useState<string>('IP-LOKAL');
  const [clientIpMasked, setClientIpMasked] = useState<string>('Jaringan Aktif');
  const [connectedDevices, setConnectedDevices] = useState<
    { deviceId: string; deviceLabel: string; ipHash: string; lastSeen: string }[]
  >([]);
  const [copiedBadge, setCopiedBadge] = useState<boolean>(false);

  // KomiBaca Live Catalog Data State
  const [popularComics, setPopularComics] = useState<ComicItem[]>([]);
  const [catalogComics, setCatalogComics] = useState<ComicItem[]>([]);
  const [genresList, setGenresList] = useState<
    { name: string; slug: string; category?: string; countHint?: string }[]
  >([]);
  const [loadingFeed, setLoadingFeed] = useState<boolean>(true);

  // Filter & Search Controls
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [searchInput, setSearchInput] = useState<string>('');
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>('');
  const [resolvedSearchHint, setResolvedSearchHint] = useState<string | null>(null);
  const [showAllGenresBoard, setShowAllGenresBoard] = useState<boolean>(true);
  const [selectedGenreCategory, setSelectedGenreCategory] = useState<string>('Semua');
  const [genreFilterText, setGenreFilterText] = useState<string>('');
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const [loadingMoreCatalog, setLoadingMoreCatalog] = useState<boolean>(false);

  // Series Detail & Reader Modal State
  const [selectedComic, setSelectedComic] = useState<ComicItem | null>(null);
  const [selectedComicChapters, setSelectedComicChapters] = useState<ChapterItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const [activeReaderComic, setActiveReaderComic] = useState<ComicItem | null>(null);
  const [activeChapterData, setActiveChapterData] = useState<ChapterReaderData | null>(null);
  const [loadingChapter, setLoadingChapter] = useState<boolean>(false);
  const [readerError, setReaderError] = useState<string | null>(null);

  // Bookmarks & Reading History State
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [historyList, setHistoryList] = useState<ReadingHistoryRecord[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Sinkron Otomatis');

  // 1. Load local storage state on mount
  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem(LOCAL_PREFS_KEY);
      if (savedPrefs) {
        const parsed = JSON.parse(savedPrefs);
        if (parsed.theme && ['mint', 'dark', 'sepia'].includes(parsed.theme)) {
          setTheme(parsed.theme);
        }
        if (parsed.viewMode && ['webtoon', 'paginated', 'novel'].includes(parsed.viewMode)) {
          setViewMode(parsed.viewMode);
        }
        if (typeof parsed.fontSize === 'number') {
          setFontSize(parsed.fontSize);
        }
      }
      const savedBm = localStorage.getItem(LOCAL_BOOKMARKS_KEY);
      if (savedBm) setBookmarks(JSON.parse(savedBm));

      const savedHist = localStorage.getItem(LOCAL_HISTORY_KEY);
      if (savedHist) setHistoryList(JSON.parse(savedHist));
    } catch {
      // Ignore storage error
    }
  }, []);

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-sepia');
    if (theme === 'dark') root.classList.add('theme-dark');
    if (theme === 'sepia') root.classList.add('theme-sepia');
    try {
      localStorage.setItem(
        LOCAL_PREFS_KEY,
        JSON.stringify({ theme, viewMode, fontSize })
      );
    } catch {
      // Ignore
    }
  }, [theme, viewMode, fontSize]);

  // 2. Push state to Device ID + IP Sync Backend
  const pushToDeviceSync = useCallback(
    async (
      nextBookmarks: BookmarkRecord[],
      nextHistory: ReadingHistoryRecord[],
      nextPrefs?: { theme: ReaderTheme; viewMode: ReaderViewMode; fontSize: number },
      replaceAll = false,
      overrideSyncKey?: string
    ) => {
      try {
        const targetKey = overrideSyncKey ?? syncKey;
        const res = await fetch('/api/device-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            syncKey: targetKey,
            deviceId,
            deviceLabel,
            bookmarks: nextBookmarks,
            history: nextHistory,
            preferences: nextPrefs,
            replaceAll,
          }),
        }).then((r) => r.json());

        if (res?.success && res.data) {
          setBookmarks(res.data.bookmarks || nextBookmarks);
          setHistoryList(res.data.history || nextHistory);
          setConnectedDevices(res.data.devices || []);
          localStorage.setItem(
            LOCAL_BOOKMARKS_KEY,
            JSON.stringify(res.data.bookmarks || nextBookmarks)
          );
          localStorage.setItem(
            LOCAL_HISTORY_KEY,
            JSON.stringify(res.data.history || nextHistory)
          );
          setLastSyncTime(
            `${res.data.syncKey} · ${new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          );
        }
      } catch {
        setLastSyncTime(`Lokal (${deviceId})`);
      }
    },
    [syncKey, deviceId, deviceLabel]
  );

  // 3. Initial handshake + Real-time SSE connection for Device ID & IP Sync (Zero Login!)
  useEffect(() => {
    let eventSource: EventSource | null = null;

    async function initDeviceIpSync() {
      try {
        const localBmRaw = localStorage.getItem(LOCAL_BOOKMARKS_KEY);
        const localHistRaw = localStorage.getItem(LOCAL_HISTORY_KEY);
        const localBm: BookmarkRecord[] = localBmRaw ? JSON.parse(localBmRaw) : [];
        const localHist: ReadingHistoryRecord[] = localHistRaw ? JSON.parse(localHistRaw) : [];

        const query = new URLSearchParams({
          deviceId,
          deviceLabel,
          ...(syncKey ? { syncKey } : {}),
        });
        const res = await fetch(`/api/device-sync?${query.toString()}`).then((r) =>
          r.json()
        );
        if (res?.success && res.data) {
          const activeKey = res.data.syncKey;
          setDetectedIpKey(res.data.detectedIpKey || activeKey);
          setClientIpMasked(res.data.clientIpMasked || 'Jaringan Aktif');
          setCustomSyncInput(activeKey);
          if (!syncKey) {
            setSyncKey(activeKey);
          }

          // Merge local storage with server room state
          await pushToDeviceSync(localBm, localHist, undefined, false, activeKey);

          // Subscribe to real-time SSE updates on this IP / Sync Key room
          eventSource = new EventSource(
            `/api/device-sync/stream?syncKey=${encodeURIComponent(activeKey)}`
          );
          eventSource.onmessage = (ev) => {
            try {
              const payload = JSON.parse(ev.data);
              if (Array.isArray(payload.bookmarks)) {
                setBookmarks(payload.bookmarks);
                localStorage.setItem(
                  LOCAL_BOOKMARKS_KEY,
                  JSON.stringify(payload.bookmarks)
                );
              }
              if (Array.isArray(payload.history)) {
                setHistoryList(payload.history);
                localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(payload.history));
              }
              if (Array.isArray(payload.devices)) {
                setConnectedDevices(payload.devices);
              }
              setLastSyncTime(
                `Live ${payload.syncKey} · ${new Date().toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              );
            } catch {
              // ignore
            }
          };
        }
      } catch {
        setLastSyncTime(`Lokal (${deviceId})`);
      }
    }

    initDeviceIpSync();
    return () => {
      if (eventSource) eventSource.close();
    };
  }, [deviceId, deviceLabel, syncKey]);

  // 4. Fetch Live Home Feed
  const fetchLiveHomeFeed = useCallback(async (forceRefresh = false) => {
    setLoadingFeed(true);
    try {
      const [homeRes, genresRes] = await Promise.all([
        fetch(`/api/home?source=all${forceRefresh ? '&refresh=true' : ''}`).then((r) =>
          r.json()
        ),
        fetch('/api/genres').then((r) => r.json()),
      ]);
      if (homeRes?.success && homeRes.data) {
        setPopularComics(homeRes.data.popular || []);
        setCatalogComics(homeRes.data.latest || []);
      }
      if (genresRes?.success && Array.isArray(genresRes.data)) {
        setGenresList(genresRes.data);
      }
    } catch (e) {
      console.error('Failed loading live feed:', e);
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveHomeFeed(false);
  }, [fetchLiveHomeFeed]);

  // Debounce searchInput so typing automatically searches after 450ms without needing to press Enter
  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      if (trimmed !== activeSearchQuery) {
        setActiveSearchQuery(trimmed);
        if (trimmed) {
          setSelectedGenre('all');
          setSelectedType('all');
        } else {
          setResolvedSearchHint(null);
        }
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [searchInput, activeSearchQuery]);

  // 5. Fetch Filtered / Searched Live Scraped Catalog
  useEffect(() => {
    // Skip redundant call on initial mount when all filters are default and catalogComics already populated
    if (
      selectedType === 'all' &&
      selectedSource === 'all' &&
      selectedGenre === 'all' &&
      !activeSearchQuery.trim() &&
      catalogComics.length > 0
    ) {
      return;
    }

    async function fetchFilteredCatalog() {
      setLoadingFeed(true);
      setCatalogPage(1);
      try {
        let endpoint = `/api/list?source=${encodeURIComponent(selectedSource)}&page=1`;
        if (activeSearchQuery.trim()) {
          endpoint = `/api/search?q=${encodeURIComponent(
            activeSearchQuery.trim()
          )}&source=${encodeURIComponent(selectedSource)}&page=1`;
        } else if (selectedGenre !== 'all') {
          endpoint = `/api/genre/${encodeURIComponent(
            selectedGenre
          )}?source=${encodeURIComponent(selectedSource)}&page=1`;
        } else if (selectedType !== 'all') {
          endpoint = `/api/type/${encodeURIComponent(
            selectedType
          )}?source=${encodeURIComponent(selectedSource)}&page=1`;
        } else if (selectedSource === 'all') {
          endpoint = '/api/home?source=all';
        }

        const res = await fetch(endpoint).then((r) => r.json());
        if (res?.success && res.data) {
          const rawItems: ComicItem[] = res.data.items || res.data.latest || [];
          setCatalogComics(rawItems);
          setResolvedSearchHint(res.data.resolvedQuery || null);
        }
      } catch (e) {
        console.error('Filter query error:', e);
      } finally {
        setLoadingFeed(false);
      }
    }
    fetchFilteredCatalog();
  }, [selectedType, selectedSource, selectedGenre, activeSearchQuery]);

  // Load next page of catalog/genre/type
  const handleLoadMoreCatalog = useCallback(async () => {
    if (loadingMoreCatalog) return;
    const nextPage = catalogPage + 1;
    setLoadingMoreCatalog(true);
    try {
      let endpoint = `/api/list?source=${encodeURIComponent(selectedSource)}&page=${nextPage}`;
      if (activeSearchQuery.trim()) {
        endpoint = `/api/search?q=${encodeURIComponent(
          activeSearchQuery.trim()
        )}&source=${encodeURIComponent(selectedSource)}&page=${nextPage}`;
      } else if (selectedGenre !== 'all') {
        endpoint = `/api/genre/${encodeURIComponent(
          selectedGenre
        )}?source=${encodeURIComponent(selectedSource)}&page=${nextPage}`;
      } else if (selectedType !== 'all') {
        endpoint = `/api/type/${encodeURIComponent(
          selectedType
        )}?source=${encodeURIComponent(selectedSource)}&page=${nextPage}`;
      }

      const res = await fetch(endpoint).then((r) => r.json());
      if (res?.success && res.data) {
        const moreItems: ComicItem[] = res.data.items || res.data.latest || [];
        if (moreItems.length > 0) {
          setCatalogComics((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const uniqueNew = moreItems.filter((c) => !existingIds.has(c.id));
            return [...prev, ...uniqueNew];
          });
          setCatalogPage(nextPage);
        }
      }
    } catch (e) {
      console.error('Load more error:', e);
    } finally {
      setLoadingMoreCatalog(false);
    }
  }, [
    loadingMoreCatalog,
    catalogPage,
    selectedSource,
    activeSearchQuery,
    selectedGenre,
    selectedType,
  ]);

  const bookmarkedIds = useMemo(
    () => new Set(bookmarks.map((b) => b.comicId)),
    [bookmarks]
  );

  const historyByComicId = useMemo(() => {
    const map = new Map<string, ReadingHistoryRecord>();
    for (const h of historyList) {
      map.set(h.comicId, h);
    }
    return map;
  }, [historyList]);

  // Toggle Bookmark (Local + IP/Device Sync)
  const handleToggleBookmark = useCallback(
    async (comic: ComicItem) => {
      const docId = sanitizeDocId(comic.id);
      const exists = bookmarkedIds.has(comic.id);
      const next = exists
        ? bookmarks.filter((b) => b.comicId !== comic.id)
        : [
            {
              id: docId,
              userId: deviceId,
              comicId: comic.id,
              source: comic.source,
              sourceId: comic.sourceId,
              title: comic.title,
              cover: comic.cover || '',
              type: comic.type,
              latestChapter: comic.latestChapter || '1',
              updatedAtIso: new Date().toISOString(),
            },
            ...bookmarks,
          ];
      setBookmarks(next);
      localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(next));
      await pushToDeviceSync(next, historyList, undefined, true);
    },
    [bookmarks, bookmarkedIds, deviceId, historyList, pushToDeviceSync]
  );

  // Open Series Detail Modal (scrapes real chapters list from HwaVerse API)
  const handleOpenComicDetail = useCallback(async (comic: ComicItem) => {
    setSelectedComic(comic);
    setSelectedComicChapters([]);
    setLoadingDetail(true);
    try {
      const res = await fetch(
        `/api/comic/${encodeURIComponent(comic.source)}/${encodeURIComponent(
          comic.sourceId
        )}`
      ).then((r) => r.json());
      if (res?.success && res.data) {
        if (res.data.comic) setSelectedComic(res.data.comic);
        setSelectedComicChapters(res.data.chapters || []);
      }
    } catch (e) {
      console.error('Error loading comic detail:', e);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Update Reading Progress (Local + Real-Time Device/IP Sync)
  const handleUpdateReadingProgress = useCallback(
    async (
      comic: ComicItem,
      totalChaptersCount: number,
      params: {
        chapterNumber: string;
        chapterTitle: string;
        lastPosition: number;
        scrollPercentage: number;
        isFinished: boolean;
      }
    ) => {
      const docId = sanitizeDocId(comic.id);
      const chapterId = `${comic.id}:${params.chapterNumber}`.slice(0, 240);
      const nowIso = new Date().toISOString();

      const newEntry: ReadingHistoryRecord = {
        id: docId,
        userId: deviceId,
        comicId: comic.id,
        source: comic.source,
        sourceId: comic.sourceId,
        title: comic.title,
        cover: comic.cover || '',
        type: comic.type,
        chapterId,
        chapterNumber: params.chapterNumber,
        chapterTitle: params.chapterTitle,
        totalChapters: totalChaptersCount,
        lastPosition: params.lastPosition,
        scrollPercentage: params.scrollPercentage,
        isFinished: params.isFinished,
        deviceLabel: `${deviceLabel} (${deviceId})`,
        updatedAtIso: nowIso,
      };

      const filtered = historyList.filter((item) => item.comicId !== comic.id);
      const updated = [newEntry, ...filtered];
      setHistoryList(updated);
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(updated));

      await pushToDeviceSync(bookmarks, updated, undefined, false);
    },
    [deviceId, deviceLabel, historyList, bookmarks, pushToDeviceSync]
  );

  // Open Chapter Reader Modal (Scrapes Real Chapter Images or Decrypted Novel Text!)
  const handleStartReadingChapter = useCallback(
    async (comic: ComicItem, requestedChapterNum?: string) => {
      setActiveReaderComic(comic);
      setLoadingChapter(true);
      setReaderError(null);

      // Set appropriate default viewMode for comic type
      const preferredMode: ReaderViewMode =
        comic.type === 'novel' || comic.source === 'noveldex'
          ? 'novel'
          : comic.type === 'manga'
            ? 'paginated'
            : 'webtoon';
      setViewMode(preferredMode);

      // Create temporary loading placeholder chapter data so ReaderModal mounts immediately
      setActiveChapterData({
        id: `${comic.id}:loading`,
        comicId: comic.id,
        source: comic.source,
        sourceId: comic.sourceId,
        number: requestedChapterNum || comic.latestChapter || '1',
        title: `Memuat Bab...`,
        type: comic.type,
        images: [],
        prevChapter: null,
        nextChapter: null,
        totalChapters: 1,
      });

      try {
        // 1. If no specific chapter was passed, or if we don't have the scraped chapter list yet, fetch comic detail first to get exact valid chapter slug/number!
        let chList: ChapterItem[] =
          selectedComic?.id === comic.id && selectedComicChapters.length > 0
            ? selectedComicChapters
            : [];

        if (chList.length === 0) {
          const detailRes = await fetch(
            `/api/comic/${encodeURIComponent(comic.source)}/${encodeURIComponent(
              comic.sourceId
            )}`
          ).then((r) => r.json());
          if (detailRes?.success && Array.isArray(detailRes.data?.chapters)) {
            chList = detailRes.data.chapters;
            setSelectedComicChapters(chList);
          }
        }

        // Determine target chapter from history, requested chapter, or latest/first scraped chapter
        const hist = historyByComicId.get(comic.id);
        let targetCh = requestedChapterNum || hist?.chapterNumber || '';

        if (!targetCh && chList.length > 0) {
          // Pick the latest chapter (index 0) or first chapter (last index)
          targetCh = chList[0].chapter;
        }
        if (!targetCh) {
          targetCh =
            comic.latestChapter && comic.latestChapter !== 'Terbaru'
              ? comic.latestChapter
              : '1';
        }

        // 2. Fetch the live scraped chapter images / novel text
        const chapterRes = await fetch(
          `/api/comic/${encodeURIComponent(comic.source)}/${encodeURIComponent(
            comic.sourceId
          )}/chapter/${encodeURIComponent(targetCh)}`
        ).then((r) => r.json());

        if (chapterRes?.success && chapterRes.data?.chapter) {
          const chData: ChapterReaderData = chapterRes.data.chapter;
          if (Array.isArray(chapterRes.data.chapters) && chapterRes.data.chapters.length > 0) {
            chList = chapterRes.data.chapters;
            setSelectedComicChapters(chList);
          }
          setActiveChapterData(chData);

          if (
            chData.novelContent?.paragraphs?.length &&
            chData.images.length === 0
          ) {
            setViewMode('novel');
          }

          const isSameChapter = hist?.chapterNumber === String(chData.number);
          await handleUpdateReadingProgress(comic, chData.totalChapters || chList.length, {
            chapterNumber: String(chData.number),
            chapterTitle: chData.title,
            lastPosition: isSameChapter ? hist.lastPosition : 0,
            scrollPercentage: isSameChapter ? hist.scrollPercentage : 5,
            isFinished: false,
          });
        } else {
          setReaderError(
            chapterRes?.error?.message ||
              `Gagal mengambil konten bab ${targetCh} dari ${comic.source}. Silakan pilih bab lain dari Daftar Bab.`
          );
        }
      } catch (e: any) {
        setReaderError(
          e?.message || 'Terjadi gangguan jaringan saat mengambil halaman bab.'
        );
      } finally {
        setLoadingChapter(false);
      }
    },
    [
      selectedComic,
      selectedComicChapters,
      historyByComicId,
      handleUpdateReadingProgress,
    ]
  );

  const handleDeleteHistoryItem = async (item: ReadingHistoryRecord) => {
    const next = historyList.filter((h) => h.comicId !== item.comicId);
    setHistoryList(next);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(next));
    await pushToDeviceSync(bookmarks, next, undefined, true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--ink-primary)] classroom-grid-bg">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-5 sm:px-10 py-3.5 bg-[var(--bg-surface)]/95 backdrop-blur-md border-b-[2.5px] border-[var(--border-ink)]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#explore"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('explore');
          }}
          className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink-primary)] whitespace-nowrap shrink-0"
        >
          KomiBaca
        </a>

        {/* Zone 2: 5 Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-[var(--ink-secondary)]">
          <a
            href="#explore"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('explore');
            }}
            className={`hover:text-[var(--ink-primary)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'explore' ? 'text-[var(--ink-primary)] underline' : ''
            }`}
          >
            Beranda Baca
          </a>
          <a
            href="#catalog"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('catalog');
            }}
            className={`hover:text-[var(--ink-primary)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'catalog' ? 'text-[var(--ink-primary)] underline' : ''
            }`}
          >
            Katalog & Genre ({catalogComics.length})
          </a>
          <a
            href="#bookmarks"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('bookmarks');
            }}
            className={`hover:text-[var(--ink-primary)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'bookmarks' ? 'text-[var(--ink-primary)] underline' : ''
            }`}
          >
            Bookmark ({bookmarks.length})
          </a>
          <a
            href="#history"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('history');
            }}
            className={`hover:text-[var(--ink-primary)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'history' ? 'text-[var(--ink-primary)] underline' : ''
            }`}
          >
            Riwayat Baca ({historyList.length})
          </a>
          <a
            href="#sync"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('sync');
            }}
            className={`hover:text-[var(--ink-primary)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'sync' ? 'text-[var(--ink-primary)] underline' : ''
            }`}
          >
            Sinkron Perangkat
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action (Device ID + IP Status) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSection('sync')}
            className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-mono-num font-bold ink-button cursor-pointer whitespace-nowrap shrink-0"
          >
            {deviceId} · {syncKey || detectedIpKey}
          </button>
        </div>
      </header>

      {/* SKETCHBOOK WORKSPACE TOOLBAR (Below Header) */}
      <div className="border-b-2 border-dashed border-[var(--border-ink)]/30 bg-[var(--bg-elevated)]/60 px-5 sm:px-10 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Mobile Section Switcher */}
          <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-1 w-full">
            {(
              [
                { id: 'explore', label: 'Beranda' },
                { id: 'catalog', label: `Katalog (${catalogComics.length})` },
                { id: 'bookmarks', label: `Bookmark (${bookmarks.length})` },
                { id: 'history', label: `Riwayat (${historyList.length})` },
                { id: 'sync', label: `Sync (${deviceId})` },
              ] as { id: ActiveSection; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSection === tab.id
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                    : 'bg-[var(--bg-surface)] text-[var(--ink-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Live Reader Search Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSelectedGenre('all');
              setSelectedType('all');
              setActiveSearchQuery(searchInput.trim());
              setActiveSection('catalog');
            }}
            className="flex items-center gap-2 flex-1 max-w-xl"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-secondary)]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (e.target.value === '') {
                    setActiveSearchQuery('');
                    setResolvedSearchHint(null);
                  }
                }}
                placeholder="Cari manga, manhwa, novel, atau singkatan (mis. Watanare, Komiku, Oregairu, Solo)..."
                className="w-full pl-10 pr-8 py-2 rounded-2xl bg-[var(--bg-surface)] border-2 border-[var(--border-ink)] text-xs sm:text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-secondary)]/70 focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setActiveSearchQuery('');
                    setResolvedSearchHint(null);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
                  title="Bersihkan pencarian"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0"
            >
              Cari Judul
            </button>
          </form>

          {/* Theme Mode & Catalog Refresh */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchLiveHomeFeed(true)}
              className="px-3 py-1.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
              title="Muat ulang pustaka terbaru"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFeed ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Muat Ulang</span>
            </button>

            <div className="flex items-center gap-1 p-1 rounded-2xl bg-[var(--bg-surface)] border-2 border-[var(--border-ink)]">
              <button
                type="button"
                onClick={() => setTheme('mint')}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  theme === 'mint'
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                    : 'text-[var(--ink-primary)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Mint</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  theme === 'dark'
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                    : 'text-[var(--ink-primary)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Gelap</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('sepia')}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  theme === 'sepia'
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                    : 'text-[var(--ink-primary)]'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Sepia</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Search Chips & Popular Anime/Manga Abbreviations Bar */}
        <div className="max-w-7xl mx-auto pt-2.5 mt-2.5 border-t border-dashed border-[var(--border-ink)]/25 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-mono-num font-bold text-[var(--ink-secondary)] shrink-0">
            Pencarian Populer:
          </span>
          {[
            { label: 'Watanare (Komiku)', q: 'watanare', src: 'komiku' },
            { label: 'Watashi ga Koibito', q: 'watashi ga koibito', src: 'komiku' },
            { label: 'Manga Komiku Terbaru', q: '', src: 'komiku', type: 'manga' },
            { label: 'Solo Leveling', q: 'solo leveling', src: 'all' },
            { label: 'One Piece', q: 'one piece', src: 'komiku' },
            { label: 'Oregairu', q: 'oregairu', src: 'all' },
            { label: 'Kusuriya (Apothecary)', q: 'kusuriya', src: 'all' },
            { label: 'Frieren', q: 'frieren', src: 'all' },
            { label: 'Villainess', q: 'villainess', src: 'all' },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                setSelectedGenre('all');
                setSelectedType(chip.type || 'all');
                setSelectedSource(chip.src);
                setSearchInput(chip.q);
                setActiveSearchQuery(chip.q);
              }}
              className="px-2.5 py-1 text-[11px] font-semibold bg-[var(--bg-surface)] text-[var(--ink-primary)] ink-button cursor-pointer whitespace-nowrap shrink-0"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-5 sm:px-10 py-8 space-y-12">
        {/* SECTION 1: EXPLORE (Sketchbook Hero + Fan Deck + Continue Reading) */}
        {activeSection === 'explore' && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left Column: Expressive Hand-Drawn Doodle Classroom Card */}
              <div className="lg:col-span-6 flex flex-col justify-between p-6 sm:p-8 ink-card-static relative">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="doodle-tape px-3 py-1 text-xs font-mono-num font-bold text-[var(--ink-primary)] rotate-[-1deg]">
                      KOMIBACA READER · TANPA LOGIN & SINKRON REAL-TIME
                    </span>
                    <DoodleSpeechBurst className="w-6 h-6 text-[var(--ink-primary)]" />
                  </div>

                  <div className="space-y-2">
                    <h1
                      className="font-display text-3xl sm:text-5xl font-bold text-[var(--ink-primary)] leading-[1.12] tracking-tight"
                      style={{ textWrap: 'balance' }}
                    >
                      Ruang Baca Manga, Manhwa & Light Novel Bergaya Buku Sketsa!
                    </h1>
                    <DoodleUnderline className="w-60 h-4 text-[var(--accent-primary)]" />
                  </div>

                  <p className="text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed max-w-xl">
                    Nikmati ribuan koleksi <strong>Manga</strong>, <strong>Manhwa</strong>,{' '}
                    <strong>Manhua</strong>, dan <strong>Light Novel</strong> dari pustaka{' '}
                    <strong>Komiku</strong>, <strong>SoftKomik</strong>, <strong>Luvyaa</strong>,{' '}
                    <strong>NovelDex</strong>, serta <strong>Manta</strong>. Dilengkapi mode gelap,
                    kertas sepia, bookmark otomatis, dan sinkronisasi progres antar HP &amp; Desktop!
                  </p>

                  {/* Quick Library Server Switcher */}
                  <div className="pt-1 space-y-2">
                    <div className="text-xs font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
                      <DoodleStar className="w-4 h-4" />
                      <span>Pilih Server Pustaka KomiBaca:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: 'all', label: 'Semua Pustaka (80+ Judul)' },
                        { id: 'komiku', label: 'Komiku (Manga & Manhwa)' },
                        { id: 'softkomik', label: 'SoftKomik (Sub Indo)' },
                        { id: 'luvyaa', label: 'Luvyaa (Manhwa)' },
                        { id: 'noveldex', label: 'NovelDex (Light Novel)' },
                        { id: 'manta', label: 'Manta Comics' },
                      ].map((src) => (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => {
                            setSelectedSource(src.id);
                          }}
                          className={`px-3.5 py-1.5 text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0 ${
                            selectedSource === src.id
                              ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                              : 'bg-[var(--bg-elevated)] text-[var(--ink-primary)]'
                          }`}
                        >
                          {src.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip */}
                <div className="pt-6 mt-6 border-t-2 border-dashed border-[var(--border-ink)]/35 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {catalogComics.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleStartReadingChapter(catalogComics[0])}
                        className="px-5 py-2.5 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs sm:text-sm font-semibold flex items-center gap-2 ink-button cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>Mulai Baca Sekarang</span>
                      </button>
                    )}

                    {catalogComics.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const randomIdx = Math.floor(Math.random() * catalogComics.length);
                          handleOpenComicDetail(catalogComics[randomIdx]);
                        }}
                        className="px-4 py-2.5 bg-[var(--bg-elevated)] text-[var(--ink-primary)] text-xs sm:text-sm font-semibold flex items-center gap-2 ink-button cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Compass className="w-4 h-4" />
                        <span>Baca Judul Acak</span>
                      </button>
                    )}
                  </div>

                  <div className="text-xs font-mono-num text-[var(--ink-secondary)]">
                    Sync: <strong className="text-[var(--ink-primary)]">{lastSyncTime}</strong>
                  </div>
                </div>
              </div>

              {/* Right Column: 60fps Stacked Fan Cards Deck of Real Scraped Titles */}
              <div className="lg:col-span-6">
                <StackedFanDeck
                  items={popularComics.length > 0 ? popularComics : catalogComics}
                  bookmarkedIds={bookmarkedIds}
                  onSelectComic={handleOpenComicDetail}
                  onStartReading={(comic) => handleStartReadingChapter(comic)}
                  onToggleBookmark={handleToggleBookmark}
                />
              </div>
            </section>

            {/* Continue Reading Strip (if user has reading history) */}
            {historyList.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl font-bold">
                      Lanjutkan Bacaan Terakhir ({deviceId})
                    </h2>
                    <p className="text-xs text-[var(--ink-secondary)]">
                      Tersimpan otomatis di LocalStorage & tersinkron via IP ({syncKey || detectedIpKey})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection('history')}
                    className="text-xs font-semibold text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Semua Riwayat ({historyList.length})
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {historyList.slice(0, 3).map((item) => {
                    const coverUrl = getBookCoverArtwork({
                      id: item.comicId,
                      title: item.title,
                      type: item.type,
                      source: item.source,
                      cover: item.cover || null,
                    });
                    return (
                      <div
                        key={item.comicId}
                        className="p-4 ink-card flex items-center gap-4"
                      >
                        <img
                          src={coverUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-16 h-22 rounded-xl object-cover border-2 border-[var(--border-ink)] shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="text-[11px] font-mono-num text-[var(--ink-secondary)] truncate">
                            {item.type.toUpperCase()} · {item.source} · {item.deviceLabel}
                          </div>
                          <h3 className="font-display text-base font-bold truncate">
                            {item.title}
                          </h3>
                          <div className="flex items-center justify-between text-xs font-mono-num">
                            <span className="truncate max-w-[120px]">{item.chapterTitle}</span>
                            <span className="font-bold">{item.scrollPercentage}%</span>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-ink)] overflow-hidden">
                            <div
                              className="h-full bg-[var(--accent-primary)] origin-left"
                              style={{
                                transform: `scaleX(${Math.min(
                                  1,
                                  Math.max(0.05, item.scrollPercentage / 100)
                                )})`,
                              }}
                            />
                          </div>
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleStartReadingChapter(
                                  {
                                    id: item.comicId,
                                    source: item.source,
                                    sourceId: item.sourceId,
                                    slug: item.sourceId,
                                    title: item.title,
                                    alternativeTitles: [],
                                    type: item.type,
                                    status: 'Ongoing',
                                    genres: ['Action', 'Fantasy'],
                                    author: '',
                                    artist: '',
                                    cover: item.cover || null,
                                    synopsis: '',
                                    latestChapter: item.chapterNumber,
                                    rating: { value: 9.6, count: 1000 },
                                    updatedAt: 'Tersinkron',
                                  },
                                  item.chapterNumber
                                )
                              }
                              className="text-xs font-bold text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
                            >
                              Lanjutkan Baca Sekarang →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* SECTION 2: LIVE SCRAPED CATALOG GRID (Shown on both 'explore' and 'catalog') */}
        {(activeSection === 'explore' || activeSection === 'catalog') && (
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-dashed border-[var(--border-ink)]/35 pb-4">
              <div>
                <div className="inline-block doodle-tape px-2.5 py-0.5 text-[11px] font-mono-num font-bold mb-1.5">
                  PUSTAKA KOMIBACA · {catalogComics.length} JUDUL TERSEDIA
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold">
                  {activeSearchQuery
                    ? `Hasil Pencarian untuk "${activeSearchQuery}"`
                    : selectedGenre !== 'all'
                      ? `Genre: ${
                          genresList.find((g) => g.slug === selectedGenre)?.name ||
                          selectedGenre.toUpperCase()
                        }`
                      : selectedSource === 'all'
                        ? 'Katalog Lengkap KomiBaca (Manhwa, Manga & Novel)'
                        : `Katalog Pustaka: ${selectedSource.toUpperCase()}`}
                </h2>
                {activeSearchQuery && resolvedSearchHint && (
                  <p className="text-xs font-mono-num text-[var(--ink-secondary)] mt-1">
                    Pencarian pintar mencocokkan alias/judul resmi:{' '}
                    <strong className="text-[var(--ink-primary)]">
                      "{resolvedSearchHint}"
                    </strong>
                  </p>
                )}
              </div>

              {/* Format Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'all', label: 'Semua Format' },
                  { id: 'manhwa', label: 'Manhwa' },
                  { id: 'manga', label: 'Manga' },
                  { id: 'novel', label: 'Light Novel' },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => {
                      setSelectedType(fmt.id);
                      if (fmt.id !== 'all') {
                        setSearchInput('');
                        setActiveSearchQuery('');
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedType === fmt.id
                        ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                        : 'bg-[var(--bg-surface)] text-[var(--ink-primary)]'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* COMPREHENSIVE HAND-DRAWN GENRE EXPLORER BOARD (68+ GENRES) */}
            <div className="p-5 sm:p-6 ink-card-static space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-dashed border-[var(--border-ink)]/30 pb-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="doodle-tape px-2.5 py-0.5 text-xs font-mono-num font-bold">
                    DIREKTORI {genresList.length || 68} GENRE LENGKAP
                  </span>
                  <h3 className="font-display text-lg sm:text-xl font-bold text-[var(--ink-primary)]">
                    Papan Kapur Daftar Genre (Komiku, SoftKomik, Luvyaa & NovelDex)
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={genreFilterText}
                    onChange={(e) => setGenreFilterText(e.target.value)}
                    placeholder="Filter nama genre (mis. Yuri, Isekai, Murim)..."
                    className="px-3 py-1.5 rounded-xl bg-[var(--bg-canvas)] border-2 border-[var(--border-ink)] text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-secondary)]/70 focus:outline-none w-48 sm:w-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAllGenresBoard((prev) => !prev)}
                    className="px-3 py-1.5 bg-[var(--bg-elevated)] text-[var(--ink-primary)] text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {showAllGenresBoard ? 'Ringkas Genre' : `Buka Semua (${genresList.length})`}
                  </button>
                </div>
              </div>

              {/* Genre Category Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  'Semua',
                  'Populer',
                  'Demografi & Format',
                  'Isekai & Fantasi',
                  'Aksi & Bela Diri',
                  'Romansa & Kehidupan',
                  'Horor & Psikologis',
                ].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedGenreCategory(cat);
                      setShowAllGenresBoard(true);
                    }}
                    className={`px-3 py-1 text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedGenreCategory === cat
                        ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                        : 'bg-[var(--bg-canvas)] text-[var(--ink-primary)]'
                    }`}
                  >
                    {cat === 'Semua' ? `Semua Genre (${genresList.length})` : cat}
                  </button>
                ))}
              </div>

              {/* Genre Buttons Grid */}
              <div className="flex flex-wrap items-center gap-2 max-h-72 overflow-y-auto pr-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGenre('all');
                    setSearchInput('');
                    setActiveSearchQuery('');
                  }}
                  className={`px-3 py-1.5 text-xs font-bold ink-button cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedGenre === 'all' && !activeSearchQuery
                      ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--ink-primary)]'
                  }`}
                >
                  ★ Semua Genre
                </button>

                {(showAllGenresBoard ? genresList : genresList.slice(0, 18))
                  .filter((g) => {
                    const matchCat =
                      selectedGenreCategory === 'Semua' ||
                      g.category === selectedGenreCategory;
                    const matchText =
                      !genreFilterText.trim() ||
                      g.name.toLowerCase().includes(genreFilterText.toLowerCase()) ||
                      g.slug.toLowerCase().includes(genreFilterText.toLowerCase());
                    return matchCat && matchText;
                  })
                  .map((g) => (
                    <button
                      key={g.slug}
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setActiveSearchQuery('');
                        setSelectedType('all');
                        setSelectedGenre(g.slug);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                        selectedGenre === g.slug
                          ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                          : 'bg-[var(--bg-canvas)] text-[var(--ink-primary)] hover:bg-[var(--bg-elevated)]'
                      }`}
                    >
                      <span>{g.name}</span>
                      {g.countHint && (
                        <span
                          className={`text-[10px] font-mono-num px-1.5 py-0.2 rounded ${
                            selectedGenre === g.slug
                              ? 'bg-black/20 text-[var(--bg-canvas)]'
                              : 'bg-[var(--bg-elevated)] text-[var(--ink-secondary)]'
                          }`}
                        >
                          {g.countHint}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {/* Cards Grid */}
            {loadingFeed ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-96 ink-card animate-pulse bg-[var(--bg-elevated)]/40 p-4 flex flex-col justify-end"
                  >
                    <div className="h-4 w-2/3 bg-[var(--ink-secondary)]/20 rounded mb-2" />
                    <div className="h-3 w-1/2 bg-[var(--ink-secondary)]/20 rounded" />
                  </div>
                ))}
              </div>
            ) : catalogComics.length === 0 ? (
              <div className="p-12 ink-card text-center space-y-3">
                <p className="font-display text-lg font-bold">
                  Tidak ada judul yang cocok dengan filter ini
                </p>
                <p className="text-xs text-[var(--ink-secondary)]">
                  Klik tombol di bawah untuk mengembalikan semua katalog KomiBaca.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('all');
                    setSelectedSource('all');
                    setSelectedGenre('all');
                    setSearchInput('');
                    setActiveSearchQuery('');
                    fetchLiveHomeFeed(false);
                  }}
                  className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold ink-button cursor-pointer"
                >
                  Tampilkan Semua Katalog
                </button>
              </div>
            ) : (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                  {catalogComics.map((comic) => {
                    const isSaved = bookmarkedIds.has(comic.id);
                    const hist = historyByComicId.get(comic.id);

                    return (
                      <CatalogCard
                        key={comic.id}
                        comic={comic}
                        isSaved={isSaved}
                        lastChapterNumber={hist?.chapterNumber}
                        onOpenDetail={handleOpenComicDetail}
                        onStartReading={handleStartReadingChapter}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    );
                  })}
                </motion.div>

                {/* Pagination / Load More Button */}
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t-2 border-dashed border-[var(--border-ink)]/30">
                  <div className="text-xs font-mono-num text-[var(--ink-secondary)]">
                    Menampilkan <strong>{catalogComics.length}</strong> judul · Halaman{' '}
                    <strong>{catalogPage}</strong>
                  </div>
                  <button
                    type="button"
                    disabled={loadingMoreCatalog}
                    onClick={handleLoadMoreCatalog}
                    className="px-6 py-2.5 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs sm:text-sm font-semibold ink-button cursor-pointer disabled:opacity-50"
                  >
                    {loadingMoreCatalog
                      ? 'Memuat Halaman Berikutnya...'
                      : `Muat Lebih Banyak Judul (Halaman ${catalogPage + 1}) →`}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* SECTION 3: BOOKMARKS VIEW */}
        {activeSection === 'bookmarks' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-dashed border-[var(--border-ink)]/35 pb-4">
              <div>
                <h1 className="font-display text-3xl font-bold">
                  Buku Catatan Bookmark ({bookmarks.length})
                </h1>
                <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
                  Tersimpan di LocalStorage & otomatis disinkronkan via Device ID ({deviceId}) dan IP ({syncKey || detectedIpKey})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('catalog')}
                className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0"
              >
                Cari Bacaan Baru
              </button>
            </div>

            {bookmarks.length === 0 ? (
              <div className="p-12 ink-card text-center space-y-3">
                <Bookmark className="w-8 h-8 mx-auto text-[var(--ink-secondary)]" />
                <h2 className="font-display text-xl font-bold">Belum Ada Bookmark</h2>
                <p className="text-xs sm:text-sm text-[var(--ink-secondary)] max-w-md mx-auto">
                  Klik ikon Bookmark pada komik atau novel mana pun untuk menyimpannya tanpa perlu
                  login.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {bookmarks.map((bm) => {
                  const comicObj: ComicItem = {
                    id: bm.comicId,
                    source: bm.source,
                    sourceId: bm.sourceId,
                    slug: bm.sourceId,
                    title: bm.title,
                    alternativeTitles: [],
                    type: bm.type,
                    status: 'Ongoing',
                    genres: ['Fantasy', 'Action'],
                    author: '',
                    artist: '',
                    cover: bm.cover || null,
                    synopsis: '',
                    latestChapter: bm.latestChapter,
                    rating: { value: 9.6, count: 1000 },
                    updatedAt: 'Tersimpan',
                  };
                  const coverSrc = getBookCoverArtwork(comicObj);
                  const hist = historyByComicId.get(bm.comicId);

                  return (
                    <article
                      key={bm.comicId}
                      className="ink-card overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div
                          onClick={() => handleOpenComicDetail(comicObj)}
                          className="aspect-[3/4] w-full overflow-hidden border-b-2 border-[var(--border-ink)] bg-[var(--bg-elevated)] cursor-pointer"
                        >
                          <img
                            src={coverSrc}
                            alt={bm.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-4 space-y-1.5">
                          <div className="text-[11px] font-mono-num text-[var(--ink-secondary)]">
                            {bm.type.toUpperCase()} · {bm.source} · Bab {bm.latestChapter}
                          </div>
                          <h3 className="font-display text-base font-bold line-clamp-2">
                            {bm.title}
                          </h3>
                        </div>
                      </div>

                      <div className="px-4 pb-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleStartReadingChapter(
                              comicObj,
                              hist ? hist.chapterNumber : undefined
                            )
                          }
                          className="flex-1 px-3 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold ink-button cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {hist ? `Lanjut Bab ${hist.chapterNumber}` : 'Langsung Baca'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBookmark(comicObj)}
                          aria-label="Hapus Bookmark"
                          className="p-2 bg-[var(--bg-elevated)] text-[var(--ink-primary)] ink-button cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* SECTION 4: READING HISTORY VIEW */}
        {activeSection === 'history' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-dashed border-[var(--border-ink)]/35 pb-4">
              <div>
                <h1 className="font-display text-3xl font-bold">
                  Riwayat Baca & Progres Halaman ({historyList.length})
                </h1>
                <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
                  Tersimpan otomatis berdasarkan Device ID ({deviceId}), IP ({syncKey || detectedIpKey}), dan LocalStorage
                </p>
              </div>
            </div>

            {historyList.length === 0 ? (
              <div className="p-12 ink-card text-center space-y-3">
                <History className="w-8 h-8 mx-auto text-[var(--ink-secondary)]" />
                <h2 className="font-display text-xl font-bold">Belum Ada Riwayat Baca</h2>
                <p className="text-xs sm:text-sm text-[var(--ink-secondary)] max-w-md mx-auto">
                  Klik "Langsung Baca" pada judul komik atau novel mana pun, dan posisi halaman
                  terakhir Anda akan tercatat otomatis di sini.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyList.map((item) => {
                  const comicObj: ComicItem = {
                    id: item.comicId,
                    source: item.source,
                    sourceId: item.sourceId,
                    slug: item.sourceId,
                    title: item.title,
                    alternativeTitles: [],
                    type: item.type,
                    status: 'Ongoing',
                    genres: ['Action', 'Fantasy'],
                    author: '',
                    artist: '',
                    cover: item.cover || null,
                    synopsis: '',
                    latestChapter: item.chapterNumber,
                    rating: { value: 9.7, count: 1000 },
                    updatedAt: 'Tersinkron',
                  };
                  const coverSrc = getBookCoverArtwork(comicObj);

                  return (
                    <div
                      key={item.comicId}
                      className="p-4 sm:p-5 ink-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <img
                          src={coverSrc}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-16 h-22 rounded-xl object-cover border-2 border-[var(--border-ink)] shrink-0"
                        />
                        <div className="space-y-1 min-w-0">
                          <div className="text-xs font-mono-num text-[var(--ink-secondary)]">
                            {item.type.toUpperCase()} · {item.source} · {item.deviceLabel}
                          </div>
                          <h3 className="font-display text-lg font-bold truncate">
                            {item.title}
                          </h3>
                          <div className="text-xs font-mono-num text-[var(--ink-primary)]">
                            Terakhir: <strong>{item.chapterTitle}</strong> · Progres{' '}
                            <strong>{item.scrollPercentage}%</strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleStartReadingChapter(comicObj, item.chapterNumber)
                          }
                          className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Lanjutkan Baca</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteHistoryItem(item)}
                          aria-label="Hapus dari riwayat"
                          className="p-2 bg-[var(--bg-elevated)] text-[var(--ink-primary)] ink-button cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* SECTION 5: ZERO-LOGIN DEVICE ID & IP ADDRESS REAL-TIME SYNC */}
        {activeSection === 'sync' && (
          <section className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left: Device ID + IP Sync Controller */}
              <div className="lg:col-span-7 p-6 sm:p-8 ink-card-static flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="doodle-tape inline-block px-3 py-1 text-xs font-mono-num font-bold">
                    SINKRONISASI TANPA LOGIN · DEVICE ID + IP + LOCALSTORAGE
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold">
                    Sinkronisasi Otomatis Antar HP & Desktop
                  </h1>
                  <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
                    Anda tidak perlu login atau membuat akun! Secara otomatis, perangkat yang
                    berada pada jaringan / IP yang sama berbagi ruang sinkronisasi{' '}
                    <strong className="font-mono-num">{detectedIpKey}</strong>. Jika Anda menggunakan
                    data seluler berbeda, cukup ketik <strong>Kode Sync / Device Room</strong> yang
                    sama di bawah ini untuk menghubungkan HP dan Laptop secara real-time.
                  </p>

                  {/* Device & IP Identity Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)]/65 border-2 border-[var(--border-ink)]">
                      <div className="text-[11px] font-mono-num text-[var(--ink-secondary)]">
                        DEVICE ID ANDA
                      </div>
                      <div className="font-mono-num text-base font-bold mt-0.5">{deviceId}</div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">{deviceLabel}</div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)]/65 border-2 border-[var(--border-ink)]">
                      <div className="text-[11px] font-mono-num text-[var(--ink-secondary)]">
                        DETEKSI JARINGAN IP
                      </div>
                      <div className="font-mono-num text-base font-bold mt-0.5">
                        {detectedIpKey}
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        IP: {clientIpMasked}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)]/65 border-2 border-[var(--border-ink)]">
                      <div className="text-[11px] font-mono-num text-[var(--ink-secondary)]">
                        RUANG SYNC AKTIF
                      </div>
                      <div className="font-mono-num text-base font-bold mt-0.5">
                        {syncKey || detectedIpKey}
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        SSE Real-Time Aktif
                      </div>
                    </div>
                  </div>

                  {/* Link Another Device by Sync Key */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clean = customSyncInput.trim().toUpperCase();
                      if (!clean) return;
                      setSyncKey(clean);
                      localStorage.setItem(LOCAL_SYNC_KEY, clean);
                    }}
                    className="pt-3 space-y-2"
                  >
                    <label className="block text-xs font-bold">
                      Hubungkan Perangkat Lain dengan Kode Sync / Device ID:
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={customSyncInput}
                        onChange={(e) => setCustomSyncInput(e.target.value.toUpperCase())}
                        placeholder="Misal: IP-A1B2C3 atau DEV-XXXX"
                        className="flex-1 min-w-[180px] px-4 py-2 rounded-xl bg-[var(--bg-canvas)] border-2 border-[var(--border-ink)] font-mono-num text-xs sm:text-sm font-bold"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold ink-button cursor-pointer"
                      >
                        Gunakan Kode Sync Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(syncKey || detectedIpKey);
                          setCopiedBadge(true);
                          setTimeout(() => setCopiedBadge(false), 2000);
                        }}
                        className="px-3.5 py-2 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedBadge ? 'Tersalin!' : 'Salin Kode'}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Connected Devices List */}
                <div className="pt-4 border-t-2 border-dashed border-[var(--border-ink)]/35 space-y-2">
                  <div className="text-xs font-bold">
                    Perangkat Terhubung di Ruang {syncKey || detectedIpKey} (
                    {connectedDevices.length || 1} Perangkat):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(connectedDevices.length > 0
                      ? connectedDevices
                      : [
                          {
                            deviceId,
                            deviceLabel,
                            ipHash: detectedIpKey,
                            lastSeen: new Date().toISOString(),
                          },
                        ]
                    ).map((d) => (
                      <div
                        key={d.deviceId}
                        className="px-3 py-1.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-ink)] text-xs font-mono-num flex items-center gap-2"
                      >
                        {d.deviceLabel.includes('HP') ? (
                          <Smartphone className="w-3.5 h-3.5" />
                        ) : (
                          <Laptop className="w-3.5 h-3.5" />
                        )}
                        <span>
                          <strong>{d.deviceId}</strong> ({d.deviceLabel})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Reader Comfort & Backup Preferences Card */}
              <div className="lg:col-span-5 p-6 sm:p-8 ink-card-static flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="doodle-tape inline-block px-3 py-0.5 text-xs font-mono-num font-bold">
                    PREFERENSI RUANG BACA KOMIBACA
                  </div>
                  <h2 className="font-display text-xl font-bold">
                    Pengaturan Tampilan & Cadangan Data
                  </h2>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Atur gaya ruang baca favorit Anda. Semua perubahan otomatis disimpan dan
                    disinkronkan ke seluruh perangkat di ruang <strong>{syncKey || detectedIpKey}</strong>.
                  </p>

                  {/* Default Reader Mode Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold">Mode Baca Default:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'webtoon', label: 'Webtoon' },
                          { id: 'paginated', label: 'Per Halaman' },
                          { id: 'novel', label: 'Teks Novel' },
                        ] as { id: ReaderViewMode; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setViewMode(m.id);
                            pushToDeviceSync(bookmarks, historyList, {
                              theme,
                              viewMode: m.id,
                              fontSize,
                            });
                          }}
                          className={`px-3 py-2 text-xs font-semibold ink-button cursor-pointer ${
                            viewMode === m.id
                              ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                              : 'bg-[var(--bg-canvas)] text-[var(--ink-primary)]'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Default Novel Font Size */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>Ukuran Huruf Novel:</span>
                      <span className="font-mono-num">{fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={14}
                      max={28}
                      step={2}
                      value={fontSize}
                      onChange={(e) => {
                        const nextSize = Number(e.target.value);
                        setFontSize(nextSize);
                        pushToDeviceSync(bookmarks, historyList, {
                          theme,
                          viewMode,
                          fontSize: nextSize,
                        });
                      }}
                      className="w-full accent-[var(--ink-primary)] cursor-pointer"
                    />
                  </div>

                  {/* Export JSON Backup */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const backup = {
                          app: 'KomiBaca',
                          exportedAt: new Date().toISOString(),
                          deviceId,
                          syncRoom: syncKey || detectedIpKey,
                          bookmarks,
                          history: historyList,
                        };
                        const blob = new Blob([JSON.stringify(backup, null, 2)], {
                          type: 'application/json',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `komibaca-backup-${deviceId.toLowerCase()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="w-full px-4 py-2.5 bg-[var(--bg-canvas)] text-[var(--ink-primary)] text-xs font-semibold ink-button cursor-pointer"
                    >
                      Unduh Cadangan Bookmark & Riwayat (.JSON)
                    </button>
                  </div>
                </div>

                <div className="text-xs text-[var(--ink-secondary)] font-mono-num">
                  Penyimpanan: LocalStorage + KomiBaca IP Sync Room
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* CLEAN SKETCHBOOK FOOTER */}
      <footer className="mt-16 border-t-[2.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] px-5 sm:px-10 py-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--ink-secondary)]">
          <div className="font-display font-bold text-sm text-[var(--ink-primary)]">
            KomiBaca — Reader Web Manga, Manhwa & Light Novel · Device ID: {deviceId} · Sync Room:{' '}
            {syncKey || detectedIpKey}
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveSection('explore')}
              className="hover:underline cursor-pointer"
            >
              Beranda Baca
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('bookmarks')}
              className="hover:underline cursor-pointer"
            >
              Bookmark ({bookmarks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('history')}
              className="hover:underline cursor-pointer"
            >
              Riwayat ({historyList.length})
            </button>
          </div>
        </div>
      </footer>

      {/* SERIES DETAIL MODAL */}
      {selectedComic && !activeReaderComic && (
        <SeriesDetailModal
          comic={selectedComic}
          chapters={selectedComicChapters}
          loadingDetail={loadingDetail}
          isBookmarked={bookmarkedIds.has(selectedComic.id)}
          historyEntry={historyByComicId.get(selectedComic.id)}
          onClose={() => setSelectedComic(null)}
          onToggleBookmark={handleToggleBookmark}
          onStartChapter={(comic, chNum) => {
            setSelectedComic(null);
            handleStartReadingChapter(comic, chNum);
          }}
        />
      )}

      {/* FULL-SCREEN RESPONSIVE CHAPTER READER MODAL */}
      {activeReaderComic && activeChapterData && (
        <ReaderModal
          comic={activeReaderComic}
          chapterData={activeChapterData}
          chaptersList={selectedComicChapters}
          loadingChapter={loadingChapter}
          readerError={readerError}
          isBookmarked={bookmarkedIds.has(activeReaderComic.id)}
          initialScrollPercentage={
            historyByComicId.get(activeReaderComic.id)?.chapterNumber ===
            activeChapterData.number
              ? historyByComicId.get(activeReaderComic.id)?.scrollPercentage || 0
              : 0
          }
          initialPageIndex={
            historyByComicId.get(activeReaderComic.id)?.chapterNumber ===
            activeChapterData.number
              ? historyByComicId.get(activeReaderComic.id)?.lastPosition || 0
              : 0
          }
          theme={theme}
          viewMode={viewMode}
          fontSize={fontSize}
          syncStatusText={lastSyncTime}
          onClose={() => {
            setActiveReaderComic(null);
            setActiveChapterData(null);
            setReaderError(null);
          }}
          onSelectChapter={(chNum) => handleStartReadingChapter(activeReaderComic, chNum)}
          onToggleBookmark={handleToggleBookmark}
          onChangeTheme={(nextTheme) => {
            setTheme(nextTheme);
            pushToDeviceSync(bookmarks, historyList, {
              theme: nextTheme,
              viewMode,
              fontSize,
            });
          }}
          onChangeViewMode={(nextMode) => {
            setViewMode(nextMode);
            pushToDeviceSync(bookmarks, historyList, {
              theme,
              viewMode: nextMode,
              fontSize,
            });
          }}
          onChangeFontSize={(nextSize) => {
            setFontSize(nextSize);
            pushToDeviceSync(bookmarks, historyList, {
              theme,
              viewMode,
              fontSize: nextSize,
            });
          }}
          onProgressUpdate={(params) =>
            handleUpdateReadingProgress(
              activeReaderComic,
              activeChapterData.totalChapters || selectedComicChapters.length,
              params
            )
          }
        />
      )}
    </div>
  );
}
