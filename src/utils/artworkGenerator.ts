import { ComicItem } from '../types';

const PALETTES = [
  { bg1: '#D1FAE5', bg2: '#A7F3D0', ink: '#064E3B', accent: '#059669', badge: '#FEF3C7' },
  { bg1: '#E0F2FE', bg2: '#BAE6FD', ink: '#064E3B', accent: '#0284C7', badge: '#ECFDF5' },
  { bg1: '#FEF3C7', bg2: '#FDE68A', ink: '#064E3B', accent: '#D97706', badge: '#ECFDF5' },
  { bg1: '#CCFBF1', bg2: '#99F6E4', ink: '#064E3B', accent: '#0D9488', badge: '#FEF3C7' },
  { bg1: '#F3E8FF', bg2: '#E9D5FF', ink: '#064E3B', accent: '#7C3AED', badge: '#ECFDF5' },
];

export function getBookCoverArtwork(comic: Pick<ComicItem, 'id' | 'title' | 'type' | 'source' | 'cover'>): string {
  if (comic.cover && comic.cover.trim().length > 0) {
    return comic.cover;
  }

  let hash = 0;
  for (let i = 0; i < comic.id.length; i++) {
    hash = (hash * 31 + comic.id.charCodeAt(i)) >>> 0;
  }
  const palette = PALETTES[hash % PALETTES.length];
  const safeTitle = comic.title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const words = safeTitle.split(' ');
  const line1 = words.slice(0, 2).join(' ').slice(0, 18);
  const line2 = words.slice(2, 5).join(' ').slice(0, 18);
  const line3 = words.slice(5, 8).join(' ').slice(0, 18);

  const typeLabel = (comic.type || 'manhwa').toUpperCase();
  const sourceLabel = (comic.source || 'komibaca').toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 480" width="360" height="480">
    <defs>
      <linearGradient id="g_${hash}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg1}" />
        <stop offset="100%" stop-color="${palette.bg2}" />
      </linearGradient>
      <pattern id="p_${hash}" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="${palette.ink}" stroke-width="0.6" stroke-opacity="0.12" />
      </pattern>
    </defs>
    <rect width="360" height="480" fill="url(#g_${hash})" />
    <rect width="360" height="480" fill="url(#p_${hash})" />

    <!-- Classroom Notebook Binding & Frame -->
    <rect x="18" y="18" width="324" height="444" rx="18" fill="none" stroke="${palette.ink}" stroke-width="3.5" />
    <line x1="42" y1="18" x2="42" y2="462" stroke="${palette.ink}" stroke-width="2" stroke-dasharray="6 6" stroke-opacity="0.45" />

    <!-- Top Label -->
    <rect x="58" y="38" width="124" height="28" rx="8" fill="${palette.ink}" />
    <text x="120" y="57" text-anchor="middle" fill="#ECFDF5" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" letter-spacing="1.2">${typeLabel}</text>

    <!-- Central Illustrated Emblem -->
    <circle cx="192" cy="196" r="76" fill="#FFFFFF" fill-opacity="0.82" stroke="${palette.ink}" stroke-width="3" />
    <circle cx="192" cy="196" r="58" fill="none" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="8 5" />
    <polygon points="192,138 207,175 247,175 215,198 227,236 192,213 157,236 169,198 137,175 177,175" fill="${palette.badge}" stroke="${palette.ink}" stroke-width="2.5" stroke-linejoin="round" />
    <circle cx="192" cy="196" r="14" fill="${palette.accent}" />

    <!-- Title Card Plate -->
    <rect x="56" y="302" width="266" height="132" rx="14" fill="#FFFFFF" fill-opacity="0.92" stroke="${palette.ink}" stroke-width="3" />
    <text x="72" y="338" fill="${palette.ink}" font-family="Fredoka, Plus Jakarta Sans, sans-serif" font-size="22" font-weight="700">${line1}</text>
    <text x="72" y="366" fill="${palette.ink}" font-family="Fredoka, Plus Jakarta Sans, sans-serif" font-size="20" font-weight="700">${line2}</text>
    <text x="72" y="392" fill="${palette.accent}" font-family="Fredoka, Plus Jakarta Sans, sans-serif" font-size="17" font-weight="600">${line3}</text>
    <text x="72" y="418" fill="${palette.ink}" fill-opacity="0.65" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600">SUMBER · ${sourceLabel}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function sanitizeDocId(rawId: string): string {
  return rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}
