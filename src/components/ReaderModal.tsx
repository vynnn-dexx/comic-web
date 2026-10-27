import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Moon,
  Sun,
  Type,
  Minus,
  Plus,
  Layers,
  FileText,
  Wifi,
} from 'lucide-react';
import {
  ChapterItem,
  ChapterReaderData,
  ComicItem,
  ReaderTheme,
  ReaderViewMode,
} from '../types';

interface ReaderModalProps {
  comic: ComicItem;
  chapterData: ChapterReaderData;
  chaptersList: ChapterItem[];
  loadingChapter: boolean;
  readerError: string | null;
  isBookmarked: boolean;
  initialScrollPercentage: number;
  initialPageIndex: number;
  theme: ReaderTheme;
  viewMode: ReaderViewMode;
  fontSize: number;
  syncStatusText: string;
  onClose: () => void;
  onSelectChapter: (chapterNum: string) => void;
  onToggleBookmark: (comic: ComicItem) => void;
  onChangeTheme: (theme: ReaderTheme) => void;
  onChangeViewMode: (mode: ReaderViewMode) => void;
  onChangeFontSize: (size: number) => void;
  onProgressUpdate: (params: {
    chapterNumber: string;
    chapterTitle: string;
    lastPosition: number;
    scrollPercentage: number;
    isFinished: boolean;
  }) => void;
}

// Memoized Webtoon Panels so HUD/scroll state updates NEVER re-render the heavy image list
const MemoizedWebtoonPanels = memo(
  ({
    comicTitle,
    comicSource,
    chapterNumber,
    images,
    panelWidthMode,
    onToggleHud,
  }: {
    comicTitle: string;
    comicSource: string;
    chapterNumber: string;
    images: { index: number; image: string }[];
    panelWidthMode: 'compact' | 'normal' | 'wide';
    onToggleHud: () => void;
  }) => {
    return (
      <div
        className={`${
          panelWidthMode === 'compact'
            ? 'max-w-xl'
            : panelWidthMode === 'wide'
              ? 'max-w-5xl'
              : 'max-w-3xl'
        } mx-auto px-2 sm:px-6 py-4 flex flex-col items-center gap-0`}
        onClick={onToggleHud}
      >
        <div className="mb-3 doodle-tape px-3 py-1 text-xs font-mono-num font-bold text-[var(--ink-primary)]">
          RUANG BACA KOMIBACA · {images.length} PANEL DARI {comicSource.toUpperCase()} (KLIK LAYAR
          UNTUK SEMBUNYIKAN MENU)
        </div>
        {images.map((imgItem, idx) => (
          <div
            key={idx}
            className="w-full bg-[var(--bg-surface)] border-x-2 first:border-t-2 last:border-b-2 border-[var(--border-ink)] overflow-hidden"
          >
            <img
              src={imgItem.image}
              alt={`${comicTitle} Bab ${chapterNumber} Panel ${idx + 1}`}
              referrerPolicy="no-referrer"
              decoding="async"
              loading={idx < 5 ? 'eager' : 'lazy'}
              className="w-full h-auto block select-none"
            />
          </div>
        ))}
      </div>
    );
  }
);

export const ReaderModal: React.FC<ReaderModalProps> = ({
  comic,
  chapterData,
  chaptersList,
  loadingChapter,
  readerError,
  isBookmarked,
  initialScrollPercentage,
  initialPageIndex,
  theme,
  viewMode,
  fontSize,
  syncStatusText,
  onClose,
  onSelectChapter,
  onToggleBookmark,
  onChangeTheme,
  onChangeViewMode,
  onChangeFontSize,
  onProgressUpdate,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const progressBarFillRef = useRef<HTMLDivElement | null>(null);
  const progressTextRef = useRef<HTMLSpanElement | null>(null);
  const panelCounterRef = useRef<HTMLSpanElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  const [scrollPct, setScrollPct] = useState<number>(initialScrollPercentage || 0);
  const [currentPage, setCurrentPage] = useState<number>(initialPageIndex || 0);
  const [showChapterDrawer, setShowChapterDrawer] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(0); // 0 = off, 1 = 1x, 2 = 2x, 3 = 3x
  const [panelWidthMode, setPanelWidthMode] = useState<'compact' | 'normal' | 'wide'>('normal');

  const lastReportedRef = useRef<{ pct: number; page: number; ch: string }>({
    pct: -1,
    page: -1,
    ch: '',
  });

  const totalPages = Math.max(1, chapterData.images.length);
  const hasNovelText = Boolean(
    chapterData.novelContent &&
      Array.isArray(chapterData.novelContent.paragraphs) &&
      chapterData.novelContent.paragraphs.length > 0
  );

  // Preload adjacent pages in Paginated Manga mode for instant 60fps page flips
  useEffect(() => {
    if (viewMode !== 'paginated' || chapterData.images.length === 0) return;
    const toPreload = [currentPage + 1, currentPage + 2, currentPage - 1];
    for (const idx of toPreload) {
      const targetUrl = chapterData.images[idx]?.image;
      if (targetUrl) {
        const img = new Image();
        img.decoding = 'async';
        img.src = targetUrl;
      }
    }
  }, [viewMode, currentPage, chapterData.images]);

  // Frame-rate independent delta-time 60fps/120fps Auto-Scroll loop
  useEffect(() => {
    if (autoScrollSpeed <= 0 || viewMode === 'paginated') return;
    let rafId: number;
    let lastTime = performance.now();
    // Speed in pixels per second: 1x = 75px/s, 2x = 145px/s, 3x = 230px/s
    const pxPerSec = autoScrollSpeed === 1 ? 75 : autoScrollSpeed === 2 ? 145 : 230;

    const step = (now: number) => {
      const dt = Math.min(40, Math.max(0, now - lastTime));
      lastTime = now;
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop += (pxPerSec * dt) / 1000;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [autoScrollSpeed, viewMode]);

  // Restore saved position when chapter loads
  useEffect(() => {
    const startPage = Math.min(
      Math.max(0, initialPageIndex || 0),
      Math.max(0, chapterData.images.length - 1)
    );
    const startPct = initialScrollPercentage || 0;
    setCurrentPage(startPage);
    setScrollPct(startPct);

    const container = scrollContainerRef.current;
    if (container && viewMode !== 'paginated') {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        const maxScroll =
          scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight;
        if (maxScroll > 0 && startPct > 5) {
          scrollContainerRef.current.scrollTop = (startPct / 100) * maxScroll;
        } else {
          scrollContainerRef.current.scrollTop = 0;
        }
      });
    }
  }, [chapterData.id, viewMode]);

  const reportProgress = useCallback(
    (pct: number, pageIdx: number) => {
      const roundedPct = Math.min(100, Math.max(0, Math.round(pct)));
      const prev = lastReportedRef.current;
      if (
        prev.ch === chapterData.number &&
        Math.abs(prev.pct - roundedPct) < 6 &&
        prev.page === pageIdx &&
        roundedPct < 98
      ) {
        return;
      }
      lastReportedRef.current = {
        pct: roundedPct,
        page: pageIdx,
        ch: chapterData.number,
      };
      onProgressUpdate({
        chapterNumber: chapterData.number,
        chapterTitle: chapterData.title,
        lastPosition: pageIdx,
        scrollPercentage: roundedPct,
        isFinished: roundedPct >= 95,
      });
    },
    [chapterData.number, chapterData.title, onProgressUpdate]
  );

  // Zero-re-render 60fps RAF-throttled scroll handler
  const handleScroll = useCallback(() => {
    if (viewMode === 'paginated' || scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollContainerRef.current;
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      const pct =
        maxScroll <= 0 ? 100 : Math.min(100, Math.max(0, (el.scrollTop / maxScroll) * 100));
      const estimatedPage = Math.min(
        totalPages - 1,
        Math.floor((pct / 100) * totalPages)
      );

      // Update DOM directly at 60fps without triggering React state re-renders on every frame
      if (progressBarFillRef.current) {
        progressBarFillRef.current.style.transform = `scaleX(${Math.min(
          1,
          Math.max(0, pct / 100)
        )})`;
      }
      if (progressTextRef.current) {
        progressTextRef.current.textContent = `Progres ${Math.round(pct)}%`;
      }
      if (panelCounterRef.current) {
        panelCounterRef.current.textContent = `Panel ${estimatedPage + 1}/${totalPages}`;
      }

      reportProgress(pct, estimatedPage);
    });
  }, [viewMode, totalPages, reportProgress]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleToggleHud = useCallback(() => {
    setHudVisible((v) => !v);
  }, []);

  const handlePageStep = useCallback(
    (delta: number) => {
      const nextP = Math.min(totalPages - 1, Math.max(0, currentPage + delta));
      setCurrentPage(nextP);
      const pct = ((nextP + 1) / totalPages) * 100;
      setScrollPct(pct);
      reportProgress(pct, nextP);
    },
    [currentPage, totalPages, reportProgress]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showChapterDrawer) {
          setShowChapterDrawer(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowRight') {
        if (viewMode === 'paginated') {
          if (currentPage < totalPages - 1) {
            handlePageStep(1);
          } else if (chapterData.nextChapter) {
            onSelectChapter(chapterData.nextChapter);
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (viewMode === 'paginated') {
          if (currentPage > 0) {
            handlePageStep(-1);
          } else if (chapterData.prevChapter) {
            onSelectChapter(chapterData.prevChapter);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showChapterDrawer,
    viewMode,
    currentPage,
    totalPages,
    chapterData.nextChapter,
    chapterData.prevChapter,
    onClose,
    onSelectChapter,
    handlePageStep,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-canvas)] text-[var(--ink-primary)] classroom-grid-bg">
      {/* Top Reader Bar */}
      <AnimatePresence>
        {hudVisible && (
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="sticky top-0 z-30 bg-[var(--bg-surface)]/95 backdrop-blur-md border-b-2 border-[var(--border-ink)] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4"
          >
            {/* Left: Back button + Title & Source Info */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-[var(--bg-elevated)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-bold truncate">
                  {comic.title}
                </h2>
                <p className="text-xs text-[var(--ink-secondary)] truncate font-mono-num">
                  {comic.source.toUpperCase()} · {chapterData.title} ·{' '}
                  {hasNovelText
                    ? `${chapterData.novelContent?.paragraphs.length} Paragraf Novel`
                    : `${chapterData.images.length} Gambar Panel`}
                </p>
              </div>
            </div>

            {/* Center: Reading Mode Switcher (Webtoon / Manga / Novel) */}
            <div className="hidden lg:flex items-center gap-1.5 p-1 bg-[var(--bg-elevated)] border-2 border-[var(--border-ink)] rounded-2xl">
              <button
                type="button"
                onClick={() => onChangeViewMode('webtoon')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'webtoon'
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                    : 'text-[var(--ink-primary)]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Webtoon Vertikal</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('paginated')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'paginated'
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                    : 'text-[var(--ink-primary)]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Halaman Manga</span>
              </button>
              {hasNovelText && (
                <button
                  type="button"
                  onClick={() => onChangeViewMode('novel')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    viewMode === 'novel'
                      ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                      : 'text-[var(--ink-primary)]'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Teks Novel</span>
                </button>
              )}
            </div>

            {/* Right: Auto-Scroll, Panel Width, Theme, Bookmark & Chapter List Drawer Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              {viewMode !== 'paginated' && (
                <button
                  type="button"
                  onClick={() => setAutoScrollSpeed((s) => (s + 1) % 4)}
                  className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 ink-button cursor-pointer whitespace-nowrap shrink-0 ${
                    autoScrollSpeed > 0
                      ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                      : 'bg-[var(--bg-surface)] text-[var(--ink-primary)]'
                  }`}
                  title="Gulir Otomatis 60fps"
                >
                  <span>{autoScrollSpeed > 0 ? `Auto ${autoScrollSpeed}x` : 'Auto Scroll'}</span>
                </button>
              )}

              {viewMode === 'webtoon' && (
                <button
                  type="button"
                  onClick={() =>
                    setPanelWidthMode((m) =>
                      m === 'compact' ? 'normal' : m === 'normal' ? 'wide' : 'compact'
                    )
                  }
                  className="hidden md:flex px-3 py-1.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold items-center gap-1 ink-button cursor-pointer whitespace-nowrap shrink-0"
                  title="Ubah Lebar Panel Komik"
                >
                  <span>
                    {panelWidthMode === 'compact'
                      ? 'Lebar: Kompak'
                      : panelWidthMode === 'wide'
                        ? 'Lebar: Penuh'
                        : 'Lebar: Standar'}
                  </span>
                </button>
              )}

              <div className="hidden xl:flex items-center gap-1.5 text-xs text-[var(--ink-secondary)] font-mono-num px-1.5">
                <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate max-w-[130px]">{syncStatusText}</span>
              </div>

              <button
                type="button"
                onClick={() =>
                  onChangeTheme(
                    theme === 'mint' ? 'dark' : theme === 'dark' ? 'sepia' : 'mint'
                  )
                }
                className="px-3 py-1.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
              >
                {theme === 'dark' ? (
                  <>
                    <Moon className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Gelap</span>
                  </>
                ) : theme === 'sepia' ? (
                  <>
                    <Type className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Sepia</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Mint</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onToggleBookmark(comic)}
                className="px-3 py-1.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
              >
                {isBookmarked ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Bookmark className="w-3.5 h-3.5" />
                )}
                <span className="hidden md:inline">
                  {isBookmarked ? 'Tersimpan' : 'Bookmark'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowChapterDrawer((prev) => !prev)}
                className="px-3 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
              >
                <List className="w-3.5 h-3.5" />
                <span>Daftar Bab ({chaptersList.length})</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Reading Mode Switcher Sub-toolbar */}
      <div className="flex lg:hidden items-center justify-between gap-2 px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChangeViewMode('webtoon')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'webtoon'
                ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                : 'text-[var(--ink-primary)]'
            }`}
          >
            Webtoon Vertikal
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('paginated')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'paginated'
                ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                : 'text-[var(--ink-primary)]'
            }`}
          >
            Halaman Manga
          </button>
          {hasNovelText && (
            <button
              type="button"
              onClick={() => onChangeViewMode('novel')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'novel'
                  ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                  : 'text-[var(--ink-primary)]'
              }`}
            >
              Novel
            </button>
          )}
        </div>

        {(viewMode === 'novel' || hasNovelText) && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangeFontSize(Math.max(14, fontSize - 2))}
              className="p-1 rounded bg-[var(--bg-elevated)] text-[var(--ink-primary)] cursor-pointer"
              aria-label="Perkecil huruf"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono-num font-semibold">{fontSize}px</span>
            <button
              type="button"
              onClick={() => onChangeFontSize(Math.min(28, fontSize + 2))}
              className="p-1 rounded bg-[var(--bg-elevated)] text-[var(--ink-primary)] cursor-pointer"
              aria-label="Perbesar huruf"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main 60FPS GPU-Accelerated Reader Viewport */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto gpu-scroll-container relative"
      >
        {loadingChapter ? (
          <div className="max-w-3xl mx-auto px-4 py-24 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 ink-card flex items-center justify-center animate-bounce bg-[var(--bg-elevated)]">
              <BookOpen className="w-6 h-6 text-[var(--ink-primary)]" />
            </div>
            <p className="font-display text-xl font-bold">
              Memuat Halaman Bab dari Pustaka {comic.source.toUpperCase()}...
            </p>
            <p className="text-xs text-[var(--ink-secondary)]">
              Menyiapkan ruang baca KomiBaca & memuat gambar resolusi penuh
            </p>
          </div>
        ) : readerError ? (
          <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
            <div className="p-6 ink-card space-y-3">
              <h3 className="font-display text-xl font-bold">
                Bab Ini Belum Tersedia atau Sedang Dibatasi Sumber
              </h3>
              <p className="text-xs text-[var(--ink-secondary)]">{readerError}</p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChapterDrawer(true)}
                  className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold ink-button cursor-pointer"
                >
                  Pilih Bab Lainnya ({chaptersList.length} Bab)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold ink-button cursor-pointer"
                >
                  Kembali ke Katalog
                </button>
              </div>
            </div>
          </div>
        ) : viewMode === 'novel' || (hasNovelText && chapterData.images.length === 0) ? (
          /* LIGHT NOVEL READER VIEW */
          <article className="max-w-3xl mx-auto px-4 sm:px-10 py-8">
            <div className="ink-card-static p-6 sm:p-10 mb-8 bg-[var(--bg-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b-2 border-dashed border-[var(--border-ink)]/35">
                <div>
                  <div className="doodle-tape inline-block px-2.5 py-0.5 text-[11px] font-mono-num font-bold mb-2">
                    PUSTAKA NOVEL KOMIBACA · {comic.source.toUpperCase()}
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--ink-primary)]">
                    {chapterData.title}
                  </h1>
                </div>

                {/* Desktop Font Size Controls */}
                <div className="hidden lg:flex items-center gap-2 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-xl border-2 border-[var(--border-ink)]">
                  <span className="text-xs font-semibold mr-1">Ukuran Huruf</span>
                  <button
                    type="button"
                    onClick={() => onChangeFontSize(Math.max(14, fontSize - 2))}
                    className="p-1 rounded bg-[var(--bg-surface)] text-[var(--ink-primary)] cursor-pointer"
                    aria-label="Perkecil huruf"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono-num font-bold px-1.5">{fontSize}px</span>
                  <button
                    type="button"
                    onClick={() => onChangeFontSize(Math.min(28, fontSize + 2))}
                    className="p-1 rounded bg-[var(--bg-surface)] text-[var(--ink-primary)] cursor-pointer"
                    aria-label="Perbesar huruf"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {chapterData.novelContent?.authorNote && (
                <div className="p-3.5 mb-6 doodle-tape text-xs text-[var(--ink-primary)] font-medium">
                  {chapterData.novelContent.authorNote}
                </div>
              )}

              <div
                className="font-novel space-y-5 leading-relaxed text-[var(--ink-primary)]"
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.85 }}
              >
                {(chapterData.novelContent?.paragraphs || [comic.synopsis]).map((para, idx) => (
                  <p key={idx} className="text-pretty">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          </article>
        ) : viewMode === 'paginated' ? (
          /* PAGINATED MANGA / COMIC MODE */
          <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col items-center justify-center min-h-[calc(100vh-140px)]">
            <div className="relative w-full max-w-2xl ink-card-static overflow-hidden bg-[var(--bg-surface)]">
              <img
                src={chapterData.images[currentPage]?.image || chapterData.images[0]?.image}
                alt={`${comic.title} Bab ${chapterData.number} Halaman ${currentPage + 1}`}
                referrerPolicy="no-referrer"
                decoding="async"
                className="w-full h-auto max-h-[76vh] object-contain mx-auto select-none cursor-pointer"
                onClick={() => handlePageStep(1)}
              />
            </div>

            <div className="flex items-center justify-between gap-4 w-full max-w-2xl mt-4">
              <button
                type="button"
                onClick={() => handlePageStep(-1)}
                disabled={currentPage <= 0}
                className="px-4 py-2 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1.5 ink-button disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Halaman Sebelumnya</span>
              </button>

              <span className="text-xs font-mono-num font-bold text-[var(--ink-primary)]">
                Panel {currentPage + 1} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => handlePageStep(1)}
                disabled={currentPage >= totalPages - 1}
                className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold flex items-center gap-1.5 ink-button disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Halaman Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* VERTICAL WEBTOON CONTINUOUS SCROLL MODE (Memoized 60fps Panels) */
          <MemoizedWebtoonPanels
            comicTitle={comic.title}
            comicSource={comic.source}
            chapterNumber={chapterData.number}
            images={chapterData.images}
            panelWidthMode={panelWidthMode}
            onToggleHud={handleToggleHud}
          />
        )}

        {/* End of Chapter Classroom Navigation Card */}
        {!loadingChapter && !readerError && (
          <div className="max-w-3xl mx-auto px-4 pb-24 pt-6">
            <div className="ink-card-static p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono-num text-[var(--ink-secondary)]">
                  SELESAI MEMBACA · {chapterData.title.toUpperCase()}
                </div>
                <h3 className="font-display text-lg font-bold text-[var(--ink-primary)]">
                  {chapterData.nextChapter
                    ? `Lanjut ke Bab Berikutnya (${chapterData.nextChapter})?`
                    : 'Anda telah mencapai bab paling baru!'}
                </h3>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={!chapterData.prevChapter}
                  onClick={() =>
                    chapterData.prevChapter && onSelectChapter(chapterData.prevChapter)
                  }
                  className="px-4 py-2.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center justify-center gap-1.5 ink-button disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0 flex-1 sm:flex-initial"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Bab Sebelumnya</span>
                </button>

                <button
                  type="button"
                  disabled={!chapterData.nextChapter}
                  onClick={() =>
                    chapterData.nextChapter && onSelectChapter(chapterData.nextChapter)
                  }
                  className="px-5 py-2.5 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold flex items-center justify-center gap-1.5 ink-button disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0 flex-1 sm:flex-initial"
                >
                  <span>
                    {chapterData.nextChapter ? 'Baca Bab Berikutnya' : 'Bab Terakhir'}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Progress & Quick Chapter Navigation Bar */}
      <AnimatePresence>
        {hudVisible && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="sticky bottom-0 z-30 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t-2 border-[var(--border-ink)] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!chapterData.prevChapter}
                onClick={() =>
                  chapterData.prevChapter && onSelectChapter(chapterData.prevChapter)
                }
                className="px-3 py-1.5 bg-[var(--bg-elevated)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1 ink-button disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Bab Sebelumnya</span>
              </button>
            </div>

            {/* 60FPS Direct-DOM Updated Progress Bar */}
            <div className="flex-1 max-w-md flex items-center gap-3">
              <span
                ref={progressTextRef}
                className="text-xs font-mono-num font-bold text-[var(--ink-primary)] whitespace-nowrap shrink-0"
              >
                Progres {Math.round(scrollPct)}%
              </span>
              <div className="flex-1 h-3 rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--border-ink)] overflow-hidden">
                <div
                  ref={progressBarFillRef}
                  className="h-full bg-[var(--accent-primary)] origin-left will-change-transform"
                  style={{ transform: `scaleX(${Math.min(1, Math.max(0, scrollPct / 100))})` }}
                />
              </div>
              {!hasNovelText && (
                <span
                  ref={panelCounterRef}
                  className="hidden sm:inline text-xs font-mono-num text-[var(--ink-secondary)] whitespace-nowrap shrink-0"
                >
                  Panel {currentPage + 1}/{totalPages}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!chapterData.nextChapter}
                onClick={() =>
                  chapterData.nextChapter && onSelectChapter(chapterData.nextChapter)
                }
                className="px-3 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold flex items-center gap-1 ink-button disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Bab Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-over Chapter Drawer */}
      <AnimatePresence>
        {showChapterDrawer && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-sm h-full bg-[var(--bg-surface)] border-l-2 border-[var(--border-ink)] p-5 flex flex-col"
            >
              <div className="flex items-center justify-between pb-4 border-b-2 border-dashed border-[var(--border-ink)]/35">
                <div>
                  <h3 className="font-display text-lg font-bold">Pilih Bab ({comic.source})</h3>
                  <p className="text-xs text-[var(--ink-secondary)] font-mono-num">
                    Total {chaptersList.length} Bab Tersedia
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChapterDrawer(false)}
                  className="px-3 py-1.5 bg-[var(--bg-elevated)] text-xs font-semibold ink-button cursor-pointer"
                >
                  Tutup
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-2 gpu-scroll-container">
                {chaptersList.map((ch) => {
                  const isCurrent = ch.chapter === chapterData.number;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setShowChapterDrawer(false);
                        onSelectChapter(ch.chapter);
                      }}
                      className={`w-full text-left p-3 cursor-pointer flex items-center justify-between gap-3 ink-button ${
                        isCurrent
                          ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)] font-bold'
                          : 'bg-[var(--bg-canvas)] text-[var(--ink-primary)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-mono-num truncate">{ch.title}</div>
                        <div
                          className={`text-[11px] truncate ${
                            isCurrent ? 'opacity-80' : 'text-[var(--ink-secondary)]'
                          }`}
                        >
                          {ch.releaseDate}
                        </div>
                      </div>
                      <span className="text-xs font-mono-num shrink-0 font-bold">
                        {isCurrent ? 'Aktif' : 'Baca →'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
