import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownUp,
  BookOpen,
  Bookmark,
  Check,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { ChapterItem, ComicItem, ReadingHistoryRecord } from '../types';
import { getBookCoverArtwork } from '../utils/artworkGenerator';
import { DoodleNotebookSpiral, DoodleStar } from './DoodleAccents';

interface SeriesDetailModalProps {
  comic: ComicItem;
  chapters: ChapterItem[];
  loadingDetail: boolean;
  isBookmarked: boolean;
  historyEntry?: ReadingHistoryRecord;
  onClose: () => void;
  onToggleBookmark: (comic: ComicItem) => void;
  onStartChapter: (comic: ComicItem, chapterNum: string) => void;
}

export const SeriesDetailModal: React.FC<SeriesDetailModalProps> = ({
  comic,
  chapters,
  loadingDetail,
  isBookmarked,
  historyEntry,
  onClose,
  onToggleBookmark,
  onStartChapter,
}) => {
  const [chapterQuery, setChapterQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  const coverSrc = getBookCoverArtwork(comic);

  // Determine actual first and latest chapter slugs/numbers from scraped chapter list
  const latestScrapedChapter =
    chapters.length > 0 ? chapters[0].chapter : comic.latestChapter || '1';
  const firstScrapedChapter =
    chapters.length > 0 ? chapters[chapters.length - 1].chapter : '1';

  const filteredChapters = chapters
    .filter((ch) => {
      if (!chapterQuery.trim()) return true;
      const q = chapterQuery.toLowerCase();
      return (
        ch.chapter.toLowerCase().includes(q) ||
        (ch.title && ch.title.toLowerCase().includes(q))
      );
    })
    .slice();

  if (sortAsc) {
    filteredChapters.reverse();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col ink-card-static overflow-hidden bg-[var(--bg-surface)] text-[var(--ink-primary)]"
      >
        {/* Top Classroom Sketchbook Header */}
        <div className="bg-[var(--bg-elevated)] px-6 pt-3 pb-3 border-b-2 border-[var(--border-ink)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-mono-num font-bold text-[var(--ink-primary)] truncate">
            <DoodleStar className="w-4 h-4 shrink-0" />
            <span>
              PUSTAKA KOMIBACA · {comic.source.toUpperCase()} · {comic.type.toUpperCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1 ink-button cursor-pointer whitespace-nowrap shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Tutup</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
          {/* Upper 2-Column Split: Cover + Synopsis & Primary Actions */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-4 flex flex-col items-center">
              <div className="doodle-tape px-3 py-0.5 text-[10px] font-mono-num font-bold -mb-2 z-10 rotate-[-2deg]">
                SAMPUL ASLI · {comic.source.toUpperCase()}
              </div>
              <div
                style={{ borderRadius: '20px 14px 22px 16px / 14px 22px 16px 20px' }}
                className="w-48 sm:w-56 aspect-[3/4] overflow-hidden border-[2.5px] border-[var(--border-ink)] shadow-[5px_5px_0px_var(--border-ink)] bg-[var(--bg-elevated)]"
              >
                <img
                  src={coverSrc}
                  alt={comic.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const fallback = getBookCoverArtwork({ ...comic, cover: null });
                    if (target.src !== fallback) target.src = fallback;
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="md:col-span-8 space-y-4">
              {/* Unboxed Metadata (Zero-Pill Compliance) */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num text-[var(--ink-secondary)]">
                <span className="font-bold text-[var(--ink-primary)]">
                  {comic.type.toUpperCase()}
                </span>
                <span aria-hidden="true">·</span>
                <span>Pustaka: {comic.source}</span>
                <span aria-hidden="true">·</span>
                <span>Status: {comic.status || 'Ongoing'}</span>
                <span aria-hidden="true">·</span>
                <span>★ {comic.rating?.value?.toFixed(1) || '9.6'}</span>
                <span aria-hidden="true">·</span>
                <span>{chapters.length} Bab Tersedia</span>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--ink-primary)] leading-tight">
                {comic.title}
              </h2>

              {comic.alternativeTitles && comic.alternativeTitles.length > 0 && (
                <p className="text-xs text-[var(--ink-secondary)]">
                  Judul Alternatif: {comic.alternativeTitles.join(' / ')}
                </p>
              )}

              <div className="text-xs text-[var(--ink-secondary)]">
                {comic.author && (
                  <>
                    <span>Penulis: </span>
                    <strong className="text-[var(--ink-primary)]">{comic.author}</strong>
                    <span className="mx-2" aria-hidden="true">
                      ·
                    </span>
                  </>
                )}
                <span>Genre: {comic.genres.join(' · ') || 'Action · Fantasy'}</span>
              </div>

              <p className="text-sm leading-relaxed text-[var(--ink-primary)] pt-1">
                {comic.synopsis}
              </p>

              {/* Action Buttons */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                {historyEntry ? (
                  <button
                    type="button"
                    onClick={() => onStartChapter(comic, historyEntry.chapterNumber)}
                    className="px-5 py-2.5 bg-[var(--ink-primary)] text-[var(--bg-canvas)] text-xs sm:text-sm font-semibold flex items-center gap-2 ink-button cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Clock className="w-4 h-4" />
                    <span>
                      Lanjutkan Bab {historyEntry.chapterNumber} ({historyEntry.scrollPercentage}%)
                    </span>
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={loadingDetail && chapters.length === 0}
                  onClick={() => onStartChapter(comic, firstScrapedChapter)}
                  className={`px-5 py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-2 ink-button cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    historyEntry
                      ? 'bg-[var(--bg-elevated)] text-[var(--ink-primary)]'
                      : 'bg-[var(--ink-primary)] text-[var(--bg-canvas)]'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Mulai Baca Bab Awal</span>
                </button>

                <button
                  type="button"
                  disabled={loadingDetail && chapters.length === 0}
                  onClick={() => onStartChapter(comic, latestScrapedChapter)}
                  className="px-4 py-2.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs sm:text-sm font-semibold flex items-center gap-2 ink-button cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <span>Baca Bab Terbaru</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleBookmark(comic)}
                  className="px-4 py-2.5 bg-[var(--bg-surface)] text-[var(--ink-primary)] text-xs sm:text-sm font-semibold flex items-center gap-2 ink-button cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isBookmarked ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Tersimpan</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4" />
                      <span>Bookmark</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <DoodleNotebookSpiral className="w-full h-5 text-[var(--ink-primary)] opacity-60" />

          {/* Lower Section: Responsive Searchable Chapter List */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">
                  Daftar Bab Lengkap ({chapters.length} Bab)
                </h3>
                <p className="text-xs text-[var(--ink-secondary)]">
                  Pilih salah satu bab di bawah untuk langsung membuka ruang baca KomiBaca
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-secondary)]" />
                  <input
                    type="text"
                    value={chapterQuery}
                    onChange={(e) => setChapterQuery(e.target.value)}
                    placeholder="Cari nomor atau judul bab..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[var(--bg-canvas)] border-2 border-[var(--border-ink)] text-xs text-[var(--ink-primary)] focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSortAsc((prev) => !prev)}
                  className="px-3 py-1.5 bg-[var(--bg-elevated)] text-[var(--ink-primary)] text-xs font-semibold flex items-center gap-1.5 ink-button cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                  <span>{sortAsc ? 'Bab Awal → Akhir' : 'Terbaru → Lama'}</span>
                </button>
              </div>
            </div>

            {loadingDetail ? (
              <div className="py-12 text-center space-y-2">
                <div className="inline-block px-4 py-2 doodle-tape text-xs font-mono-num font-bold animate-bounce">
                  Memuat daftar bab dari pustaka {comic.source.toUpperCase()}...
                </div>
              </div>
            ) : filteredChapters.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--ink-secondary)]">
                Tidak ada bab yang cocok dengan pencarian Anda.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {filteredChapters.map((ch) => {
                  const isLastRead = historyEntry?.chapterNumber === ch.chapter;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => onStartChapter(comic, ch.chapter)}
                      className={`p-3 text-left transition-transform cursor-pointer flex items-center justify-between gap-2 ink-button ${
                        isLastRead
                          ? 'bg-[var(--ink-primary)] text-[var(--bg-canvas)] font-semibold'
                          : 'bg-[var(--bg-canvas)] text-[var(--ink-primary)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-mono-num font-bold truncate">
                          {ch.title}
                        </div>
                        <div
                          className={`text-[11px] truncate ${
                            isLastRead ? 'opacity-85' : 'text-[var(--ink-secondary)]'
                          }`}
                        >
                          {ch.releaseDate}
                        </div>
                      </div>
                      <span className="text-xs font-mono-num shrink-0 font-bold">
                        {isLastRead ? 'Terakhir' : 'Baca →'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
