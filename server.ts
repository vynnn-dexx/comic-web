import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
// @ts-ignore - JS module from scraper engine
import { scrapers, getScraper } from './src/hwaverse-engine/scrapers/index.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '5mb' }));

// --- 1. IN-MEMORY TTL CACHE FOR SCRAPER SPEED ---
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const memoryCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.value as T;
}

function getStale<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  return entry ? (entry.value as T) : null;
}

function setCache<T>(key: string, value: T, ttlSeconds = 300): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

// --- 2. IMAGE PROXY HELPER FOR HOTLINK-PROTECTED SCRAPER IMAGES ---
function getRefererForSource(sourceOrUrl: string): string {
  const s = sourceOrUrl.toLowerCase();
  if (s.includes('softkomik') || s.includes('komik.im') || s.includes('softdevices')) {
    return 'https://softkomik.co/';
  }
  if (s.includes('komiku')) {
    return 'https://komiku.org/';
  }
  if (s.includes('luvyaa') || s.includes('cdn-nyaa')) {
    return 'https://v5.luvyaa.co/';
  }
  if (s.includes('noveldex')) {
    return 'https://noveldex.io/';
  }
  if (s.includes('manta')) {
    return 'https://manta.net/';
  }
  try {
    return new URL(sourceOrUrl).origin + '/';
  } catch {
    return 'https://google.com/';
  }
}

function wrapProxyUrl(rawUrl: string | null | undefined, source = ''): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (rawUrl.startsWith('/api/image-proxy') || rawUrl.startsWith('data:')) return rawUrl;
  if (!rawUrl.startsWith('http')) return null;
  return `/api/image-proxy?url=${encodeURIComponent(rawUrl)}&source=${encodeURIComponent(source)}`;
}

function decorateComicForClient(comic: any): any {
  if (!comic) return null;
  const source = String(comic.source || 'softkomik').toLowerCase();
  const sourceId = String(comic.sourceId || comic.slug || '').trim();
  const rawCover = comic.cover || comic.thumbnail || null;
  return {
    id: comic.id || `${source}:${sourceId}`,
    source,
    sourceId,
    slug: comic.slug || sourceId,
    title: comic.title && comic.title !== 'NEW' ? comic.title : sourceId.replace(/-/g, ' '),
    alternativeTitles: Array.isArray(comic.alternativeTitles) ? comic.alternativeTitles : [],
    type: comic.type || (source === 'noveldex' ? 'novel' : 'manhwa'),
    status: comic.status || 'Ongoing',
    genres: Array.isArray(comic.genres) && comic.genres.length > 0 ? comic.genres : ['Fantasy', 'Action'],
    author: comic.author || null,
    artist: comic.artist || null,
    cover: wrapProxyUrl(rawCover, source),
    rawCover,
    synopsis:
      comic.synopsis ||
      `Koleksi pustaka KomiBaca dari ${source.toUpperCase()}. Klik untuk melihat daftar bab lengkap dan mulai membaca.`,
    latestChapter: comic.latestChapter ? String(comic.latestChapter).replace(/^Chapter\s+/i, '') : 'Terbaru',
    rating: {
      value: comic.rating?.value || (typeof comic.rating === 'number' ? comic.rating : 9.5),
      count: comic.rating?.count || 1200,
    },
    updatedAt: comic.updatedAt || 'Live Scrape',
  };
}

// --- 3. ZERO-LOGIN DEVICE ID + IP ADDRESS REAL-TIME SYNC ENGINE ---
interface SyncProfileData {
  syncKey: string;
  ipHash: string;
  devices: { deviceId: string; deviceLabel: string; ipHash: string; lastSeen: string }[];
  bookmarks: any[];
  history: any[];
  preferences: {
    theme: string;
    viewMode: string;
    fontSize: number;
  };
  updatedAt: string;
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'komibaca-data')
  : path.join(process.cwd(), 'data');
const SYNC_FILE = path.join(DATA_DIR, 'device_sync_store.json');

function loadSyncStore(): Record<string, SyncProfileData> {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveSyncStore(store: Record<string, SyncProfileData>): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SYNC_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

const syncStore: Record<string, SyncProfileData> = loadSyncStore();
const sseClients = new Map<string, Set<express.Response>>();

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress || '127.0.0.1';
  return raw.replace(/^::ffff:/, '');
}

function getIpSyncKey(ip: string): string {
  const hash = crypto.createHash('sha1').update(ip + '_hwaverse_salt').digest('hex').slice(0, 6).toUpperCase();
  return `IP-${hash}`;
}

function broadcastToSyncRoom(syncKey: string, payload: SyncProfileData) {
  const clients = sseClients.get(syncKey);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}

// Get or initialize device + IP sync profile
app.get('/api/device-sync', (req, res) => {
  const clientIp = getClientIp(req);
  const ipSyncKey = getIpSyncKey(clientIp);
  const requestedKey = String(req.query.syncKey || '').trim().toUpperCase();
  const deviceId = String(req.query.deviceId || 'DEV-LOCAL').trim();
  const deviceLabel = String(req.query.deviceLabel || 'Browser').trim();

  // Use custom syncKey if provided, otherwise default to IP-based sync room so devices on same Wi-Fi/IP sync automatically
  const activeKey = requestedKey || ipSyncKey;

  if (!syncStore[activeKey]) {
    syncStore[activeKey] = {
      syncKey: activeKey,
      ipHash: ipSyncKey,
      devices: [],
      bookmarks: [],
      history: [],
      preferences: {
        theme: 'mint',
        viewMode: 'webtoon',
        fontSize: 18,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  const record = syncStore[activeKey];
  const now = new Date().toISOString();
  const existingDev = record.devices.find((d) => d.deviceId === deviceId);
  if (existingDev) {
    existingDev.lastSeen = now;
    existingDev.deviceLabel = deviceLabel;
    existingDev.ipHash = ipSyncKey;
  } else {
    record.devices.unshift({
      deviceId,
      deviceLabel,
      ipHash: ipSyncKey,
      lastSeen: now,
    });
    record.devices = record.devices.slice(0, 10);
  }

  res.json({
    success: true,
    data: {
      ...record,
      detectedIpKey: ipSyncKey,
      clientIpMasked: clientIp.includes('.')
        ? clientIp.split('.').slice(0, 2).join('.') + '.*.*'
        : 'Jaringan Lokal',
    },
  });
});

// Real-time SSE stream for instant cross-device updates without login
app.get('/api/device-sync/stream', (req, res) => {
  const clientIp = getClientIp(req);
  const ipSyncKey = getIpSyncKey(clientIp);
  const syncKey = String(req.query.syncKey || ipSyncKey).trim().toUpperCase();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!sseClients.has(syncKey)) {
    sseClients.set(syncKey, new Set());
  }
  sseClients.get(syncKey)!.add(res);

  req.on('close', () => {
    sseClients.get(syncKey)?.delete(res);
  });
});

// Push bookmarks, reading history, and preferences by Device ID + IP Sync Key
app.post('/api/device-sync', (req, res) => {
  const clientIp = getClientIp(req);
  const ipSyncKey = getIpSyncKey(clientIp);
  const {
    syncKey: rawSyncKey,
    deviceId = 'DEV-LOCAL',
    deviceLabel = 'Browser',
    bookmarks,
    history,
    preferences,
    replaceAll = false,
  } = req.body || {};

  const activeKey = String(rawSyncKey || ipSyncKey).trim().toUpperCase();
  const now = new Date().toISOString();

  if (!syncStore[activeKey]) {
    syncStore[activeKey] = {
      syncKey: activeKey,
      ipHash: ipSyncKey,
      devices: [],
      bookmarks: [],
      history: [],
      preferences: {
        theme: 'mint',
        viewMode: 'webtoon',
        fontSize: 18,
      },
      updatedAt: now,
    };
  }

  const record = syncStore[activeKey];

  // Update device list
  const existingDev = record.devices.find((d) => d.deviceId === deviceId);
  if (existingDev) {
    existingDev.lastSeen = now;
    existingDev.deviceLabel = deviceLabel;
    existingDev.ipHash = ipSyncKey;
  } else {
    record.devices.unshift({ deviceId, deviceLabel, ipHash: ipSyncKey, lastSeen: now });
    record.devices = record.devices.slice(0, 10);
  }

  // Merge or replace bookmarks
  if (Array.isArray(bookmarks)) {
    if (replaceAll) {
      record.bookmarks = bookmarks.slice(0, 200);
    } else {
      const map = new Map<string, any>();
      for (const b of record.bookmarks) map.set(b.comicId, b);
      for (const b of bookmarks) {
        if (b && b.comicId) map.set(b.comicId, b);
      }
      record.bookmarks = Array.from(map.values()).sort((a, b) =>
        String(b.updatedAtIso || '').localeCompare(String(a.updatedAtIso || ''))
      );
    }
  }

  // Merge or replace history
  if (Array.isArray(history)) {
    if (replaceAll) {
      record.history = history.slice(0, 200);
    } else {
      const map = new Map<string, any>();
      for (const h of record.history) map.set(h.comicId, h);
      for (const h of history) {
        if (h && h.comicId) {
          const prev = map.get(h.comicId);
          if (!prev || String(h.updatedAtIso || '') >= String(prev.updatedAtIso || '')) {
            map.set(h.comicId, h);
          }
        }
      }
      record.history = Array.from(map.values()).sort((a, b) =>
        String(b.updatedAtIso || '').localeCompare(String(a.updatedAtIso || ''))
      );
    }
  }

  if (preferences && typeof preferences === 'object') {
    record.preferences = {
      ...record.preferences,
      ...preferences,
    };
  }

  record.updatedAt = now;
  saveSyncStore(syncStore);
  broadcastToSyncRoom(activeKey, record);

  res.json({
    success: true,
    data: record,
  });
});

// --- 4. KOMIBACA LIVE SCRAPER ENDPOINTS ---

// Image Proxy with proper Referer so SoftKomik, Komiku, Luvyaa, NovelDex, and Manta images never 403
app.get('/api/image-proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '');
  const source = String(req.query.source || '');
  if (!rawUrl || !rawUrl.startsWith('http')) {
    res.status(400).send('Invalid URL');
    return;
  }
  try {
    const referer = getRefererForSource(source || rawUrl);
    const response = await axios.get(rawUrl, {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: referer,
        Origin: referer.replace(/\/$/, ''),
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    const contentType = String(response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(response.data));
  } catch {
    res.status(502).send('Upstream image unavailable');
  }
});

// Helper to run scrapers with timeout
const scrapersMap: Record<string, any> = scrapers as Record<string, any>;
async function runWithTimeout<T = any>(promise: Promise<any>, ms = 9000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Scraper timeout')), ms)
    ),
  ]);
}

// 5. LIVE Home Feed across all HwaVerse Scrapers (softkomik, komiku, luvyaa, noveldex, manta)
app.get('/api/home', async (req, res) => {
  const source = String(req.query.source || 'all').toLowerCase().trim();
  const forceRefresh = req.query.refresh === 'true';
  const cacheKey = `home:${source}`;

  if (!forceRefresh) {
    const cached = getCached<any>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }
  }

  const targetSources =
    source === 'all'
      ? ['softkomik', 'komiku', 'luvyaa', 'noveldex', 'manta']
      : [source];

  const settled = await Promise.allSettled(
    targetSources.map(async (srcKey) => {
      const scraper = scrapersMap[srcKey];
      if (!scraper) return { srcKey, home: null };
      const home = await runWithTimeout<any>(scraper.getHome(), 9500);
      return { srcKey, home };
    })
  );

  const latest: any[] = [];
  const popular: any[] = [];
  const newList: any[] = [];

  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value.home) {
      const { home } = item.value;
      const l = (home.latest || []).map(decorateComicForClient).filter(Boolean);
      const p = (home.popular || []).map(decorateComicForClient).filter(Boolean);
      const n = (home.new || []).map(decorateComicForClient).filter(Boolean);
      latest.push(...l);
      popular.push(...p);
      newList.push(...n);
    }
  }

  // Deduplicate items across sources
  const seenIds = new Set<string>();
  const dedupLatest: any[] = [];
  for (const c of latest) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      dedupLatest.push(c);
    }
  }

  const seenPop = new Set<string>();
  const dedupPopular: any[] = [];
  for (const c of [...popular, ...dedupLatest]) {
    if (!seenPop.has(c.id)) {
      seenPop.add(c.id);
      dedupPopular.push(c);
    }
  }

  const data = {
    popular: dedupPopular.slice(0, 12),
    latest: dedupLatest,
    new: newList.slice(0, 12),
    scrapedAt: new Date().toISOString(),
  };

  if (dedupLatest.length > 0) {
    setCache(cacheKey, data, 300);
  }

  res.json({ success: true, data });
});

// Built-in dictionary of popular Anime, Manga, Manhwa & Light Novel abbreviations/aliases
const POPULAR_TITLE_ALIASES: Record<string, string[]> = {
  watanare: [
    'watashi ga koibito',
    'watashi ga koibito ni nareru wake naijan',
    "there's no freaking way i'll be your lover",
  ],
  'wata-nare': ['watashi ga koibito', 'watashi ga koibito ni nareru wake naijan'],
  oregairu: ['yahari ore no seishun', 'my teen romantic comedy'],
  danmachi: ['dungeon ni deai', 'is it wrong to try to pick up girls in a dungeon'],
  konosuba: ['kono subarashii sekai', "god's blessing on this wonderful world"],
  tensura: ['tensei shitara slime', 'that time i got reincarnated as a slime'],
  roshidere: ['tokidoki bosotto russia-go', 'alya sometimes hides her feelings in russian'],
  makeine: ['make heroine ga oosugiru', 'too many losing heroines'],
  bokuyaba: ['boku no kokoro no yabai yatsu', 'dangers in my heart'],
  kusuriya: ['kusuriya no hitorigoto', 'apothecary diaries'],
  apothecary: ['kusuriya no hitorigoto', 'apothecary diaries'],
  frieren: ['sousou no frieren', 'frieren'],
  orv: ['omniscient reader', 'omniscient reader viewpoint'],
  tbate: ['the beginning after the end', 'beginning after the end'],
  lotm: ['lord of the mysteries'],
  jjk: ['jujutsu kaisen'],
  csm: ['chainsaw man'],
  kny: ['kimetsu no yaiba', 'demon slayer'],
  aot: ['shingeki no kyojin', 'attack on titan'],
  snk: ['shingeki no kyojin', 'attack on titan'],
  bnha: ['boku no hero academia', 'my hero academia'],
  mha: ['boku no hero academia', 'my hero academia'],
  sao: ['sword art online'],
  rezero: ['re:zero', 're zero'],
  kanokari: ['kanojo okarishimasu', 'rent a girlfriend'],
  gotoubun: ['5-toubun no hanayome', 'quintessential quintuplets'],
  kaguya: ['kaguya-sama wa kokurasetai', 'kaguya-sama'],
  komi: ['komi-san wa komyushou desu', 'komi cant communicate'],
  nagatoro: ['ijiranaide nagatoro-san', 'nagatoro'],
  bocchi: ['bocchi the rock'],
  oshinoko: ['oshi no ko'],
  mushoku: ['mushoku tensei', 'jobless reincarnation'],
  slime: ['tensei shitara slime', 'slime'],
  eminence: ['kage no jitsuryokusha', 'eminence in shadow'],
};

async function expandSearchQueries(rawQuery: string): Promise<{
  queries: string[];
  detectedSource: string | null;
  resolvedTitle: string | null;
}> {
  const lower = rawQuery.toLowerCase().trim();
  let detectedSource: string | null = null;
  for (const s of ['komiku', 'softkomik', 'luvyaa', 'noveldex', 'manta']) {
    if (new RegExp(`\\b${s}\\b`, 'i').test(lower)) {
      detectedSource = s;
      break;
    }
  }

  // Strip filler/noise prefixes & source names ("manga watanare komiku" -> "watanare")
  const core = lower
    .replace(
      /\b(manga|manhwa|manhua|novel|light novel|komik|comic|baca|cari|di|nya|sub|indo|indonesia|bahasa|komiku|softkomik|luvyaa|noveldex|manta)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  const queries = new Set<string>();
  if (core) queries.add(core);
  if (rawQuery.trim() && rawQuery.trim().toLowerCase() !== core) {
    queries.add(rawQuery.trim());
  }

  let resolvedTitle: string | null = null;

  // 1. Check built-in popular aliases dictionary
  if (core && POPULAR_TITLE_ALIASES[core]) {
    for (const alias of POPULAR_TITLE_ALIASES[core]) {
      queries.add(alias);
    }
    resolvedTitle = POPULAR_TITLE_ALIASES[core][0];
  } else {
    for (const [key, aliases] of Object.entries(POPULAR_TITLE_ALIASES)) {
      if (core.includes(key)) {
        for (const alias of aliases) queries.add(alias);
        resolvedTitle = aliases[0];
        break;
      }
    }
  }

  // 2. Also query Kitsu Manga API when not already resolved by built-in dictionary
  if (!resolvedTitle && core && core.length >= 3) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2200);
      const kitsuRes = await fetch(
        `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(core)}&page[limit]=2`,
        { signal: controller.signal, headers: { Accept: 'application/vnd.api+json' } }
      );
      clearTimeout(timer);
      if (kitsuRes.ok) {
        const kitsuJson: any = await kitsuRes.json();
        const first = kitsuJson?.data?.[0]?.attributes;
        if (first) {
          const romaji = String(first.titles?.en_jp || first.canonicalTitle || '').trim();
          const english = String(first.titles?.en || '').trim();
          if (romaji) {
            const shortRomaji = romaji
              .replace(/[^\w\s-]/g, ' ')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 4)
              .join(' ');
            if (shortRomaji.length >= 3) queries.add(shortRomaji.toLowerCase());
            if (!resolvedTitle) resolvedTitle = romaji;
          }
          if (english) {
            const shortEng = english
              .replace(/[^\w\s-]/g, ' ')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 4)
              .join(' ');
            if (shortEng.length >= 3) queries.add(shortEng.toLowerCase());
          }
        }
      }
    } catch {
      // Ignore Kitsu timeout
    }
  }

  const orderedQueries = resolvedTitle
    ? [resolvedTitle, ...Array.from(queries).filter((qItem) => qItem !== resolvedTitle)]
    : Array.from(queries);

  return {
    queries: orderedQueries.slice(0, 3),
    detectedSource,
    resolvedTitle,
  };
}

// 6. LIVE Search across HwaVerse Scrapers (with Smart Alias & Source Detection)
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const source = String(req.query.source || 'all').toLowerCase().trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

  if (!q) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: "Query parameter 'q' is required" },
    });
    return;
  }

  const { queries, detectedSource, resolvedTitle } = await expandSearchQueries(q);

  // If the user literally searched just a source name like "komiku" or "manga komiku" with no other title words
  if (queries.length === 0 || (queries.length === 1 && queries[0] === detectedSource)) {
    const targetSrc = detectedSource || (source !== 'all' ? source : 'komiku');
    const scraper = scrapersMap[targetSrc];
    if (scraper) {
      try {
        const latestRes = await runWithTimeout<any>(scraper.getLatest(page), 9500);
        const items = (latestRes?.items || []).map(decorateComicForClient).filter(Boolean);
        res.json({
          success: true,
          data: {
            items,
            page,
            hasNextPage: items.length >= 10,
            resolvedQuery: `Katalog ${targetSrc.toUpperCase()}`,
          },
        });
        return;
      } catch {
        // continue to normal flow
      }
    }
  }

  let targetSources =
    source === 'all'
      ? ['komiku', 'softkomik', 'luvyaa', 'noveldex', 'manta']
      : [source];

  // Put detected source first if user mentioned e.g. "komiku" in their search text
  if (detectedSource && targetSources.includes(detectedSource)) {
    targetSources = [
      detectedSource,
      ...targetSources.filter((s) => s !== detectedSource),
    ];
  } else if (detectedSource && source !== 'all' && source !== detectedSource) {
    targetSources = [detectedSource, source];
  }

  const settled = await Promise.allSettled(
    targetSources.map(async (srcKey) => {
      const scraper = scrapersMap[srcKey];
      if (!scraper) return [];
      const perQuerySettled = await Promise.allSettled(
        queries.map((candidateQ) =>
          runWithTimeout<any>(scraper.search(candidateQ, page), 9500)
        )
      );
      const srcItems: any[] = [];
      for (const pq of perQuerySettled) {
        if (pq.status === 'fulfilled' && Array.isArray(pq.value?.items)) {
          srcItems.push(
            ...pq.value.items.map(decorateComicForClient).filter(Boolean)
          );
        }
      }
      return srcItems;
    })
  );

  const combined: any[] = [];
  const seen = new Set<string>();
  for (const s of settled) {
    if (s.status === 'fulfilled' && Array.isArray(s.value)) {
      for (const item of s.value) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          combined.push(item);
        }
      }
    }
  }

  res.json({
    success: true,
    data: {
      items: combined,
      page,
      hasNextPage: combined.length >= 15,
      resolvedQuery: resolvedTitle || (queries[0] !== q.toLowerCase() ? queries[0] : null),
      expandedQueries: queries,
    },
  });
});

// 7. LIVE Latest / List
app.get('/api/list', async (req, res) => {
  const source = String(req.query.source || 'all').toLowerCase().trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const cacheKey = `list:${source}:${page}`;

  const cached = getCached<any>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached });
    return;
  }

  const targetSources =
    source === 'all'
      ? ['softkomik', 'komiku', 'luvyaa', 'noveldex', 'manta']
      : [source];

  const settled = await Promise.allSettled(
    targetSources.map(async (srcKey) => {
      const scraper = scrapersMap[srcKey];
      if (!scraper) return [];
      const resData = await runWithTimeout<any>(scraper.getLatest(page), 9500);
      return (resData?.items || []).map(decorateComicForClient).filter(Boolean);
    })
  );

  // Interleave results so all sources appear evenly when source === 'all'
  const buckets = settled
    .filter((s): s is PromiseFulfilledResult<any[]> => s.status === 'fulfilled')
    .map((s) => s.value);

  const interleaved: any[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      const item = bucket[i];
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        interleaved.push(item);
      }
    }
  }

  const data = {
    items: interleaved,
    page,
    hasNextPage: interleaved.length >= 12,
  };

  if (interleaved.length > 0) {
    setCache(cacheKey, data, 300);
  }
  res.json({ success: true, data });
});

// 8. Comprehensive 68+ Genres List & Filter by Genre across Komiku, SoftKomik, Luvyaa, NovelDex
const COMPREHENSIVE_GENRES = [
  // Populer & Utama
  { name: 'Action', slug: 'action', category: 'Populer', countHint: '4.150+' },
  { name: 'Fantasy', slug: 'fantasy', category: 'Populer', countHint: '4.420+' },
  { name: 'Romance', slug: 'romance', category: 'Populer', countHint: '3.030+' },
  { name: 'Comedy', slug: 'comedy', category: 'Populer', countHint: '3.080+' },
  { name: 'Adventure', slug: 'adventure', category: 'Populer', countHint: '2.270+' },
  { name: 'Drama', slug: 'drama', category: 'Populer', countHint: '2.750+' },
  { name: 'Isekai', slug: 'isekai', category: 'Populer', countHint: '780+' },
  { name: 'School Life', slug: 'school-life', category: 'Populer', countHint: '1.430+' },
  { name: 'Slice of Life', slug: 'slice-of-life', category: 'Populer', countHint: '1.390+' },
  { name: 'Supernatural', slug: 'supernatural', category: 'Populer', countHint: '1.080+' },
  { name: 'Mystery', slug: 'mystery', category: 'Populer', countHint: '435+' },
  { name: 'Sci-Fi', slug: 'sci-fi', category: 'Populer', countHint: '330+' },

  // Demografi & Format
  { name: 'Shounen', slug: 'shounen', category: 'Demografi & Format', countHint: '2.620+' },
  { name: 'Seinen', slug: 'seinen', category: 'Demografi & Format', countHint: '1.210+' },
  { name: 'Shoujo', slug: 'shoujo', category: 'Demografi & Format', countHint: '500+' },
  { name: 'Josei', slug: 'josei', category: 'Demografi & Format', countHint: '195+' },
  { name: 'Yuri / Girls Love', slug: 'yuri', category: 'Demografi & Format', countHint: '120+' },
  { name: 'Shoujo Ai', slug: 'shoujo-ai', category: 'Demografi & Format', countHint: '95+' },
  { name: 'Shounen Ai', slug: 'shounen-ai', category: 'Demografi & Format', countHint: '45+' },
  { name: 'Webtoons', slug: 'webtoons', category: 'Demografi & Format', countHint: '250+' },
  { name: 'Long Strip', slug: 'long-strip', category: 'Demografi & Format', countHint: '180+' },
  { name: 'One Shot', slug: 'one-shot', category: 'Demografi & Format', countHint: '40+' },
  { name: '4-Koma', slug: '4-koma', category: 'Demografi & Format', countHint: '30+' },
  { name: 'Adaptation', slug: 'adaptation', category: 'Demografi & Format', countHint: '150+' },
  { name: 'Doujinshi', slug: 'doujinshi', category: 'Demografi & Format', countHint: '25+' },

  // Tema Isekai, Manhwa & Fantasi
  { name: 'Reincarnation', slug: 'reincarnation', category: 'Isekai & Fantasi', countHint: '275+' },
  { name: 'Regression', slug: 'regression', category: 'Isekai & Fantasi', countHint: '110+' },
  { name: 'System', slug: 'system', category: 'Isekai & Fantasi', countHint: '190+' },
  { name: 'Villainess', slug: 'villainess', category: 'Isekai & Fantasi', countHint: '140+' },
  { name: 'Magic', slug: 'magic', category: 'Isekai & Fantasi', countHint: '390+' },
  { name: 'Demons', slug: 'demons', category: 'Isekai & Fantasi', countHint: '140+' },
  { name: 'Monsters', slug: 'monsters', category: 'Isekai & Fantasi', countHint: '85+' },
  { name: 'Monster Girls', slug: 'monster-girls', category: 'Isekai & Fantasi', countHint: '35+' },
  { name: 'Vampire', slug: 'vampire', category: 'Isekai & Fantasi', countHint: '45+' },
  { name: 'Dark Fantasy', slug: 'dark-fantasy', category: 'Isekai & Fantasi', countHint: '90+' },
  { name: 'Time Travel', slug: 'time-travel', category: 'Isekai & Fantasi', countHint: '60+' },
  { name: 'Mythology', slug: 'mythology', category: 'Isekai & Fantasi', countHint: '40+' },
  { name: 'Academy', slug: 'academy', category: 'Isekai & Fantasi', countHint: '120+' },
  { name: 'Knight', slug: 'knight', category: 'Isekai & Fantasi', countHint: '55+' },

  // Aksi & Bela Diri
  { name: 'Martial Arts', slug: 'martial-arts', category: 'Aksi & Bela Diri', countHint: '960+' },
  { name: 'Murim', slug: 'murim', category: 'Aksi & Bela Diri', countHint: '180+' },
  { name: 'Super Power', slug: 'super-power', category: 'Aksi & Bela Diri', countHint: '110+' },
  { name: 'Sword Fight', slug: 'sword-fight', category: 'Aksi & Bela Diri', countHint: '65+' },
  { name: 'Revenge', slug: 'revenge', category: 'Aksi & Bela Diri', countHint: '95+' },
  { name: 'Military', slug: 'military', category: 'Aksi & Bela Diri', countHint: '50+' },
  { name: 'Mecha', slug: 'mecha', category: 'Aksi & Bela Diri', countHint: '35+' },
  { name: 'Apocalypse', slug: 'apocalypse', category: 'Aksi & Bela Diri', countHint: '60+' },
  { name: 'Survival', slug: 'survival', category: 'Aksi & Bela Diri', countHint: '70+' },
  { name: 'Xianxia', slug: 'xianxia', category: 'Aksi & Bela Diri', countHint: '85+' },
  { name: 'Xuanhuan', slug: 'xuanhuan', category: 'Aksi & Bela Diri', countHint: '80+' },

  // Romansa, Hobi & Kehidupan
  { name: 'Harem', slug: 'harem', category: 'Romansa & Kehidupan', countHint: '830+' },
  { name: 'Reverse Harem', slug: 'reverse-harem', category: 'Romansa & Kehidupan', countHint: '65+' },
  { name: 'Ecchi', slug: 'ecchi', category: 'Romansa & Kehidupan', countHint: '890+' },
  { name: 'Historical', slug: 'historical', category: 'Romansa & Kehidupan', countHint: '420+' },
  { name: 'Sports', slug: 'sports', category: 'Romansa & Kehidupan', countHint: '90+' },
  { name: 'Cooking', slug: 'cooking', category: 'Romansa & Kehidupan', countHint: '60+' },
  { name: 'Game', slug: 'game', category: 'Romansa & Kehidupan', countHint: '60+' },
  { name: 'Music', slug: 'music', category: 'Romansa & Kehidupan', countHint: '30+' },
  { name: 'Medical', slug: 'medical', category: 'Romansa & Kehidupan', countHint: '35+' },
  { name: 'Gender Bender', slug: 'gender-bender', category: 'Romansa & Kehidupan', countHint: '140+' },
  { name: 'Gyaru', slug: 'gyaru', category: 'Romansa & Kehidupan', countHint: '30+' },
  { name: 'Crossdressing', slug: 'crossdressing', category: 'Romansa & Kehidupan', countHint: '25+' },
  { name: 'Office Workers', slug: 'office-workers', category: 'Romansa & Kehidupan', countHint: '45+' },
  { name: 'Slow Life', slug: 'slow-life', category: 'Romansa & Kehidupan', countHint: '40+' },

  // Misteri, Horor & Psikologis
  { name: 'Horror', slug: 'horror', category: 'Horor & Psikologis', countHint: '310+' },
  { name: 'Psychological', slug: 'psychological', category: 'Horor & Psikologis', countHint: '330+' },
  { name: 'Thriller', slug: 'thriller', category: 'Horor & Psikologis', countHint: '75+' },
  { name: 'Tragedy', slug: 'tragedy', category: 'Horor & Psikologis', countHint: '240+' },
  { name: 'Crime', slug: 'crime', category: 'Horor & Psikologis', countHint: '30+' },
  { name: 'Police', slug: 'police', category: 'Horor & Psikologis', countHint: '25+' },
  { name: 'Gore', slug: 'gore', category: 'Horor & Psikologis', countHint: '55+' },
  { name: 'Ghosts', slug: 'ghosts', category: 'Horor & Psikologis', countHint: '35+' },
  { name: 'Mature', slug: 'mature', category: 'Horor & Psikologis', countHint: '200+' },
];

app.get('/api/genres', (_req, res) => {
  res.json({ success: true, data: COMPREHENSIVE_GENRES });
});

app.get('/api/genre/:genre', async (req, res) => {
  const genre = String(req.params.genre || 'action').toLowerCase().trim();
  const source = String(req.query.source || 'all').toLowerCase().trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const cacheKey = `genre:${source}:${genre}:${page}`;

  const cached = getCached<any>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached });
    return;
  }

  const targetSources =
    source === 'all'
      ? ['komiku', 'softkomik', 'luvyaa', 'noveldex']
      : [source];

  const settled = await Promise.allSettled(
    targetSources.map(async (srcKey) => {
      const scraper = scrapersMap[srcKey];
      if (!scraper || typeof scraper.getByGenre !== 'function') return [];
      const r = await runWithTimeout<any>(scraper.getByGenre(genre, page), 9500);
      return (r?.items || []).map(decorateComicForClient).filter(Boolean);
    })
  );

  const items: any[] = [];
  const seen = new Set<string>();
  for (const s of settled) {
    if (s.status === 'fulfilled' && Array.isArray(s.value)) {
      for (const item of s.value) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
    }
  }

  // Fallback: if a niche genre slug wasn't found via /genre/ endpoint, run a live search for that genre keyword!
  if (items.length === 0) {
    const keyword = genre.replace(/-/g, ' ');
    const fallbackSettled = await Promise.allSettled(
      targetSources.map(async (srcKey) => {
        const scraper = scrapersMap[srcKey];
        if (!scraper || typeof scraper.search !== 'function') return [];
        const r = await runWithTimeout<any>(scraper.search(keyword, 1), 8500);
        return (r?.items || []).map(decorateComicForClient).filter(Boolean);
      })
    );
    for (const s of fallbackSettled) {
      if (s.status === 'fulfilled' && Array.isArray(s.value)) {
        for (const item of s.value) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            items.push(item);
          }
        }
      }
    }
  }

  const data = { genre, items, page, hasNextPage: items.length >= 12 };
  if (items.length > 0) setCache(cacheKey, data, 180);
  res.json({ success: true, data });
});

// 9. Browse by Type (manhwa, manga, manhua, comic, novel)
app.get('/api/type/:type', async (req, res) => {
  const typeParam = String(req.params.type || 'all').toLowerCase().trim();
  const source = String(req.query.source || 'all').toLowerCase().trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const cacheKey = `type:${source}:${typeParam}:${page}`;

  const cached = getCached<any>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached });
    return;
  }

  const targetSources =
    source !== 'all'
      ? [source]
      : typeParam === 'novel'
        ? ['noveldex']
        : ['softkomik', 'komiku', 'luvyaa', 'manta'];

  const settled = await Promise.allSettled(
    targetSources.map(async (srcKey) => {
      const scraper = scrapersMap[srcKey];
      if (!scraper) return [];
      if (srcKey === 'noveldex' && typeParam === 'novel') {
        const home = await runWithTimeout<any>(scraper.getHome(), 9500);
        return [...(home.latest || []), ...(home.popular || [])]
          .map(decorateComicForClient)
          .filter(Boolean);
      }
      const r = await runWithTimeout<any>(scraper.getByType(typeParam, page), 9500);
      return (r?.items || []).map(decorateComicForClient).filter(Boolean);
    })
  );

  const items: any[] = [];
  const seen = new Set<string>();
  for (const s of settled) {
    if (s.status === 'fulfilled' && Array.isArray(s.value)) {
      for (const item of s.value) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
    }
  }

  const data = { type: typeParam, items, page, hasNextPage: items.length >= 12 };
  if (items.length > 0) setCache(cacheKey, data, 180);
  res.json({ success: true, data });
});

// 10. LIVE Comic / Novel Detail + Real Scraped Chapters List
app.get('/api/comic/:source/:id', async (req, res) => {
  const cleanSource = String(req.params.source || '').toLowerCase().trim();
  const cleanId = String(req.params.id || '')
    .replace(new RegExp(`^${cleanSource}:`, 'i'), '')
    .trim();
  const cacheKey = `detail:${cleanSource}:${cleanId}`;

  const cached = getCached<any>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached });
    return;
  }

  try {
    const scraper = getScraper(cleanSource);
    const detail = await runWithTimeout<any>(scraper.getDetail(cleanId, true), 12000);
    const comic = decorateComicForClient(detail.comic || { source: cleanSource, sourceId: cleanId, title: cleanId });
    const chapters = Array.isArray(detail.chapters)
      ? detail.chapters.map((ch: any) => ({
          id: ch.id || `${comic.id}:${ch.chapter}`,
          comicId: comic.id,
          source: cleanSource,
          sourceId: cleanId,
          chapter: String(ch.chapter),
          title: ch.title || `Bab ${ch.chapter}`,
          url: ch.url || null,
          releaseDate: ch.releaseDate || 'Tersedia',
        }))
      : [];

    if (chapters.length > 0 && (!comic.latestChapter || comic.latestChapter === 'Terbaru')) {
      comic.latestChapter = chapters[0].chapter;
    }

    const result = { comic, chapters };
    setCache(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (err: any) {
    const stale = getStale<any>(cacheKey);
    if (stale) {
      res.json({ success: true, data: stale });
      return;
    }
    res.status(502).json({
      success: false,
      error: {
        code: 'SCRAPER_ERROR',
        message: err?.message || `Gagal memuat detail dari ${cleanSource}`,
      },
    });
  }
});

// 11. LIVE Chapters List
app.get('/api/comic/:source/:id/chapters', async (req, res) => {
  const cleanSource = String(req.params.source || '').toLowerCase().trim();
  const cleanId = String(req.params.id || '')
    .replace(new RegExp(`^${cleanSource}:`, 'i'), '')
    .trim();
  const detailKey = `detail:${cleanSource}:${cleanId}`;

  const cachedDetail = getCached<any>(detailKey);
  if (cachedDetail?.chapters) {
    res.json({ success: true, data: { chapters: cachedDetail.chapters } });
    return;
  }

  try {
    const scraper = getScraper(cleanSource);
    const chaptersRaw = await runWithTimeout(scraper.getChapters(cleanId), 12000);
    const chapters = (Array.isArray(chaptersRaw) ? chaptersRaw : []).map((ch: any) => ({
      id: ch.id || `${cleanSource}:${cleanId}:${ch.chapter}`,
      comicId: `${cleanSource}:${cleanId}`,
      source: cleanSource,
      sourceId: cleanId,
      chapter: String(ch.chapter),
      title: ch.title || `Bab ${ch.chapter}`,
      url: ch.url || null,
      releaseDate: ch.releaseDate || 'Tersedia',
    }));
    res.json({ success: true, data: { chapters } });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      error: { code: 'SCRAPER_ERROR', message: err?.message || 'Gagal memuat daftar bab' },
    });
  }
});

// 12. LIVE Chapter Reader (Real Scraped Images & Decrypted Novel Text)
app.get('/api/comic/:source/:id/chapter/:chapter', async (req, res) => {
  const cleanSource = String(req.params.source || '').toLowerCase().trim();
  const cleanId = String(req.params.id || '')
    .replace(new RegExp(`^${cleanSource}:`, 'i'), '')
    .trim();
  const cleanChapter = String(req.params.chapter || '').trim();
  const cacheKey = `reader:${cleanSource}:${cleanId}:${cleanChapter}`;

  const cached = getCached<any>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached });
    return;
  }

  try {
    const scraper = getScraper(cleanSource);

    // Fetch chapter content and detail chapter list in parallel for prev/next navigation
    const [scrapedChapter, detailResult] = await Promise.allSettled([
      runWithTimeout(scraper.getChapter(cleanId, cleanChapter), 15000),
      getCached<any>(`detail:${cleanSource}:${cleanId}`)
        ? Promise.resolve(getCached<any>(`detail:${cleanSource}:${cleanId}`))
        : runWithTimeout(scraper.getDetail(cleanId, true), 12000),
    ]);

    if (scrapedChapter.status === 'rejected' || !scrapedChapter.value) {
      throw new Error(
        scrapedChapter.status === 'rejected'
          ? scrapedChapter.reason?.message
          : 'Bab tidak ditemukan'
      );
    }

    const chVal = scrapedChapter.value;
    const detailVal = detailResult.status === 'fulfilled' ? detailResult.value : null;
    const comic = decorateComicForClient(
      detailVal?.comic || {
        id: `${cleanSource}:${cleanId}`,
        source: cleanSource,
        sourceId: cleanId,
        slug: cleanId,
        title: cleanId.replace(/-/g, ' '),
        type: chVal.type || (cleanSource === 'noveldex' ? 'novel' : 'manhwa'),
      }
    );

    const chaptersList: any[] = Array.isArray(detailVal?.chapters) ? detailVal.chapters : [];
    const currentIdx = chaptersList.findIndex(
      (c) => String(c.chapter) === cleanChapter || String(c.chapter) === String(chVal.number)
    );

    // Note: chaptersList is ordered newest first (index 0 is latest)
    const nextChapter =
      chVal.nextChapter ||
      (currentIdx > 0 ? String(chaptersList[currentIdx - 1].chapter) : null);
    const prevChapter =
      chVal.prevChapter ||
      (currentIdx !== -1 && currentIdx < chaptersList.length - 1
        ? String(chaptersList[currentIdx + 1].chapter)
        : null);

    // Wrap every scraped chapter image in /api/image-proxy so hotlink protection is bypassed
    const proxiedImages = Array.isArray(chVal.images)
      ? chVal.images
          .map((img: any, idx: number) => {
            const rawImgUrl = typeof img === 'string' ? img : img?.image || img?.rawPath;
            const proxied = wrapProxyUrl(rawImgUrl, cleanSource);
            return proxied
              ? {
                  index: img?.index ?? idx,
                  image: proxied,
                  rawUrl: rawImgUrl,
                }
              : null;
          })
          .filter(Boolean)
      : [];

    const isNovel =
      Boolean(chVal.novelContent?.paragraphs?.length) ||
      chVal.type === 'novel' ||
      comic.type === 'novel';

    const chapterPayload = {
      id: chVal.id || `${comic.id}:${cleanChapter}`,
      comicId: comic.id,
      source: cleanSource,
      sourceId: cleanId,
      number: String(chVal.number || cleanChapter),
      title: chVal.title || `Bab ${cleanChapter}`,
      type: isNovel ? 'novel' : comic.type || 'manhwa',
      images: proxiedImages,
      novelContent: chVal.novelContent || undefined,
      prevChapter: prevChapter ? String(prevChapter) : null,
      nextChapter: nextChapter ? String(nextChapter) : null,
      totalChapters: chaptersList.length || 1,
    };

    const result = {
      comic,
      chapter: chapterPayload,
      chapters: chaptersList.map((ch: any) => ({
        id: ch.id || `${comic.id}:${ch.chapter}`,
        comicId: comic.id,
        source: cleanSource,
        sourceId: cleanId,
        chapter: String(ch.chapter),
        title: ch.title || `Bab ${ch.chapter}`,
        releaseDate: ch.releaseDate || 'Tersedia',
      })),
    };

    setCache(cacheKey, result, 900);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      error: {
        code: 'CHAPTER_SCRAPE_FAILED',
        message: err?.message || `Gagal memuat isi bab ${cleanChapter} dari ${cleanSource}`,
      },
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KomiBaca ReaderWeb server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;

