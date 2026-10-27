import React, { useState, memo } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { ComicItem } from '../types';
import { getBookCoverArtwork } from '../utils/artworkGenerator';
import { DoodleSparkleCluster } from './DoodleAccents';

interface StackedFanDeckProps {
  items: ComicItem[];
  bookmarkedIds: Set<string>;
  onSelectComic: (comic: ComicItem) => void;
  onStartReading: (comic: ComicItem, chapterNum?: string) => void;
  onToggleBookmark: (comic: ComicItem) => void;
}

export const StackedFanDeck: React.FC<StackedFanDeckProps> = memo(
  ({ items, bookmarkedIds, onSelectComic, onStartReading, onToggleBookmark }) => {
    const deckItems = items.slice(0, 5);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isFanned, setIsFanned] = useState(false);

    if (deckItems.length === 0) return null;

    const safeIdx = activeIndex % deckItems.length;
    const activeComic = deckItems[safeIdx] || deckItems[0];
    const isBookmarked = bookmarkedIds.has(activeComic.id);

    const handlePrev = () => {
      setActiveIndex((prev) => (prev - 1 + deckItems.length) % deckItems.length);
    };

    const handleNext = () => {
      setActiveIndex((prev) => (prev + 1) % deckItems.length);
    };

    return (
      <div
        className="relative flex flex-col items-center justify-between h-full p-6 ink-card-static bg-[var(--bg-elevated)]/65"
        onMouseEnter={() => setIsFanned(true)}
        onMouseLeave={() => setIsFanned(false)}
      >
        {/* Hand-drawn Washi Tape Top Corner Accent */}
        <div className="doodle-tape px-3 py-0.5 text-[11px] font-mono-num font-bold text-[var(--ink-primary)] -mt-9 mb-2 rotate-[-1.5deg]">
          REKOMENDASI KOMIBACA · KARTU KIPAS 60FPS
        </div>

        {/* Top Classroom Label Bar */}
        <div className="w-full flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink-primary)]">
            <DoodleSparkleCluster className="w-5 h-5 text-[var(--ink-primary)]" />
            <span>Sentuh, Geser, atau Klik Kartu untuk Memilih Bacaan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Karya sebelumnya"
              className="p-1.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] ink-button cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono-num font-bold px-2 text-[var(--ink-primary)]">
              0{safeIdx + 1} / 0{deckItems.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Karya selanjutnya"
              className="p-1.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] ink-button cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 60fps Hardware-Accelerated Stacked Fan Cards Stage */}
        <div className="relative w-full h-[300px] sm:h-[330px] flex items-center justify-center my-2 select-none">
          {deckItems.map((comic, idx) => {
            let offset = idx - safeIdx;
            if (offset > Math.floor(deckItems.length / 2)) offset -= deckItems.length;
            if (offset < -Math.floor(deckItems.length / 2)) offset += deckItems.length;

            const isCenter = offset === 0;
            const spreadFactor = isFanned ? 1.28 : 1.05;
            const translateX = offset * 48 * spreadFactor;
            const translateY = Math.abs(offset) * 13;
            const rotateDeg = offset * (isFanned ? 10 : 7);
            const scale = isCenter ? 1 : Math.max(0.82, 0.93 - Math.abs(offset) * 0.06);
            const zIndex = 30 - Math.abs(offset) * 5;
            const coverSrc = getBookCoverArtwork(comic);

            return (
              <motion.div
                key={comic.id}
                drag={isCenter ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_e, info) => {
                  if (info.offset.x < -45) handleNext();
                  else if (info.offset.x > 45) handlePrev();
                }}
                onClick={() => {
                  if (isCenter) {
                    onSelectComic(comic);
                  } else {
                    setActiveIndex(idx);
                  }
                }}
                animate={{
                  x: translateX,
                  y: translateY,
                  rotate: rotateDeg,
                  scale,
                  opacity: Math.abs(offset) > 2 ? 0 : 1,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 28,
                  mass: 0.65,
                }}
                style={{
                  zIndex,
                  borderRadius: '20px 14px 22px 16px / 14px 22px 16px 20px',
                  willChange: 'transform, opacity',
                }}
                className={`absolute w-48 sm:w-54 h-68 sm:h-74 overflow-hidden border-[2.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] cursor-pointer ${
                  isCenter
                    ? 'shadow-[6px_6px_0px_var(--border-ink)]'
                    : 'shadow-[3px_3px_0px_var(--border-ink)]'
                }`}
              >
                <img
                  src={coverSrc}
                  alt={comic.title}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  draggable={false}
                  onError={(e) => {
                    const target = e.currentTarget;
                    const fallback = getBookCoverArtwork({ ...comic, cover: null });
                    if (target.src !== fallback) target.src = fallback;
                  }}
                  className="w-full h-full object-cover pointer-events-none"
                />
                {/* Bottom Measured Scrim for Readability */}
                <div className="absolute inset-x-0 bottom-0 p-3.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white pointer-events-none">
                  <div className="text-[11px] font-mono-num text-emerald-300 mb-0.5">
                    {comic.type.toUpperCase()} · {comic.source.toUpperCase()} · Bab{' '}
                    {comic.latestChapter}
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-bold leading-snug line-clamp-2">
                    {comic.title}
                  </h4>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Active Fan Card Info & Quick Actions */}
        <div className="w-full pt-3 border-t-2 border-dashed border-[var(--border-ink)]/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-[var(--ink-secondary)] font-mono-num">
              <span>{activeComic.type.toUpperCase()}</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>Pustaka: {activeComic.source}</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>Bab {activeComic.latestChapter}</span>
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--ink-primary)] truncate max-w-xs sm:max-w-sm">
              {activeComic.title}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onToggleBookmark(activeComic)}
              className="px-3 py-2 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center justify-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
            >
              {isBookmarked ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tersimpan</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Bookmark</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectComic(activeComic)}
              className="px-3 py-2 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center justify-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
            >
              <List className="w-3.5 h-3.5" />
              <span>Pilih Bab</span>
            </button>

            <button
              type="button"
              onClick={() => onStartReading(activeComic)}
              className="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs font-semibold flex items-center justify-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0 flex-1 sm:flex-initial"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Langsung Baca</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
);
