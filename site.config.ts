type Env = Record<string, string | undefined>;

function resolveSiteUrl(env: Env): string {
  const fromEnv = env.VITE_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

export function createSiteConfig(env: Env) {
  return {
    url: resolveSiteUrl(env),
    name: 'KomiBaca',
    shortName: 'KomiBaca',
    title: 'KomiBaca — Reader Web Manga, Manhwa & Light Novel',
    description:
      'KomiBaca adalah website reader komik, manga, manhwa, dan light novel bergaya buku sketsa interaktif dengan mode gelap, bookmark, riwayat baca, dan sinkronisasi progres antar perangkat.',
    schemaDescription:
      'Web reader untuk manga, manhwa, manhua, komik, dan light novel dari beberapa sumber, dengan tema mint, gelap, dan sepia, bookmark, riwayat baca, serta sinkronisasi progres antar perangkat.',
    locale: 'id_ID',
    language: 'id',
    author: 'FadelSM',
    applicationCategory: 'EntertainmentApplication',
    priceCurrency: 'IDR',
    keywords: [
      'KomiBaca',
      'baca komik online',
      'baca manga',
      'baca manhwa',
      'manhua',
      'light novel',
      'webtoon',
      'reader web',
      'bookmark komik',
      'riwayat baca',
      'sinkronisasi progres baca',
      'FadelSM',
    ],
    themeColor: { light: '#E8F8F0', dark: '#071914' },
    ogImage: {
      path: '/og-image.jpg',
      width: 1200,
      height: 630,
      type: 'image/jpeg',
      alt: 'Pratinjau KomiBaca',
    },
    links: {
      github: 'https://github.com/FadelSM',
    },
    googleSiteVerification: env.GOOGLE_SITE_VERIFICATION || '',
  };
}

export type SiteConfig = ReturnType<typeof createSiteConfig>;
