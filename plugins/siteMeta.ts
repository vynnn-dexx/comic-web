import type { Plugin } from 'vite';
import type { SiteConfig } from '../site.config';

type Asset = { type: string; body: string };

const PLACEHOLDER = '<site-meta></site-meta>';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const tag = (name: 'meta' | 'link', attrs: Record<string, string>) => {
  const serialized = Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(' ');
  return `<${name} ${serialized} />`;
};

function buildJsonLd(config: SiteConfig): string {
  const { url, ogImage, links } = config;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}/#app`,
        name: config.name,
        url,
        applicationCategory: config.applicationCategory,
        operatingSystem: 'All',
        description: config.schemaDescription,
        image: `${url}${ogImage.path}`,
        inLanguage: config.language,
        author: { '@id': `${url}/#author` },
        offers: { '@type': 'Offer', price: '0', priceCurrency: config.priceCurrency },
      },
      {
        '@type': 'Person',
        '@id': `${url}/#author`,
        name: config.author,
        url: links.github,
        sameAs: [links.github],
      },
    ],
  };
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

function buildHead(config: SiteConfig): string {
  const { url, ogImage, themeColor } = config;
  const imageUrl = `${url}${ogImage.path}`;

  const lines = [
    `<title>${escapeHtml(config.title)}</title>`,
    tag('meta', { name: 'description', content: config.description }),
    tag('meta', { name: 'keywords', content: config.keywords.join(', ') }),
    tag('meta', { name: 'author', content: config.author }),
    tag('meta', { name: 'application-name', content: config.name }),
    tag('meta', { name: 'referrer', content: 'origin-when-cross-origin' }),
    tag('meta', { name: 'format-detection', content: 'telephone=no, email=no, address=no' }),
    tag('meta', {
      name: 'robots',
      content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    }),
    tag('meta', { name: 'theme-color', content: themeColor.light, media: '(prefers-color-scheme: light)' }),
    tag('meta', { name: 'theme-color', content: themeColor.dark, media: '(prefers-color-scheme: dark)' }),
    tag('link', { rel: 'canonical', href: `${url}/` }),
    tag('link', { rel: 'author', href: config.links.github }),
    tag('link', { rel: 'icon', href: '/favicon.ico', sizes: 'any' }),
    tag('link', { rel: 'icon', href: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
    tag('link', { rel: 'icon', href: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
    tag('link', { rel: 'shortcut icon', href: '/favicon.ico' }),
    tag('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' }),
    tag('link', { rel: 'manifest', href: '/manifest.webmanifest' }),
    tag('meta', { property: 'og:type', content: 'website' }),
    tag('meta', { property: 'og:url', content: url }),
    tag('meta', { property: 'og:site_name', content: config.name }),
    tag('meta', { property: 'og:title', content: config.title }),
    tag('meta', { property: 'og:description', content: config.description }),
    tag('meta', { property: 'og:locale', content: config.locale }),
    tag('meta', { property: 'og:image', content: imageUrl }),
    tag('meta', { property: 'og:image:width', content: String(ogImage.width) }),
    tag('meta', { property: 'og:image:height', content: String(ogImage.height) }),
    tag('meta', { property: 'og:image:type', content: ogImage.type }),
    tag('meta', { property: 'og:image:alt', content: ogImage.alt }),
    tag('meta', { name: 'twitter:card', content: 'summary_large_image' }),
    tag('meta', { name: 'twitter:title', content: config.title }),
    tag('meta', { name: 'twitter:description', content: config.description }),
    tag('meta', { name: 'twitter:image', content: imageUrl }),
    tag('meta', { name: 'twitter:image:alt', content: ogImage.alt }),
  ];

  if (config.googleSiteVerification) {
    lines.push(tag('meta', { name: 'google-site-verification', content: config.googleSiteVerification }));
  }

  lines.push(`<script type="application/ld+json">${buildJsonLd(config)}</script>`);

  return lines.join('\n    ');
}

function buildAssets(config: SiteConfig): Map<string, Asset> {
  const robots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${config.url}/sitemap.xml`,
    `Host: ${config.url}`,
    '',
  ].join('\n');

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${escapeHtml(config.url)}/</loc>`,
    '    <changefreq>monthly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');

  const manifest = JSON.stringify(
    {
      name: config.title,
      short_name: config.shortName,
      description: config.description,
      start_url: '/',
      display: 'standalone',
      background_color: config.themeColor.light,
      theme_color: config.themeColor.light,
      lang: config.language,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  );

  return new Map<string, Asset>([
    ['/robots.txt', { type: 'text/plain; charset=utf-8', body: robots }],
    ['/sitemap.xml', { type: 'application/xml; charset=utf-8', body: sitemap }],
    ['/manifest.webmanifest', { type: 'application/manifest+json; charset=utf-8', body: manifest }],
  ]);
}

export function siteMeta(config: SiteConfig): Plugin {
  const assets = buildAssets(config);

  return {
    name: 'site-meta',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) => html.replace(PLACEHOLDER, buildHead(config)),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        const asset = assets.get(pathname);
        if (!asset) {
          next();
          return;
        }
        res.setHeader('Content-Type', asset.type);
        res.end(asset.body);
      });
    },
    generateBundle() {
      for (const [route, asset] of assets) {
        this.emitFile({ type: 'asset', fileName: route.slice(1), source: asset.body });
      }
    },
  };
}
