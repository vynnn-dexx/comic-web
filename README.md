<p align="center">
  <img src="public/readme.jpg" alt="KomiBaca" width="360" />
</p>

# KomiBaca

Web reader untuk manga, manhwa, manhua, komik, dan light novel. KomiBaca mengambil katalog dan isi bab dari beberapa sumber, menampilkannya dalam satu antarmuka, serta menyimpan bookmark dan riwayat baca yang dapat disinkronkan antar perangkat.

## Fitur

- Katalog gabungan dari lima sumber: SoftKomik, Komiku, Luvyaa, Noveldex, dan Manta. Daftar dapat difilter per sumber, format (manhwa, manga, manhua, komik, novel), dan genre.
- Pencarian judul di satu sumber atau semua sumber sekaligus.
- Tiga mode baca: webtoon (gulir vertikal), halaman per halaman, dan novel (teks). Tersedia pengaturan ukuran font dan gulir otomatis.
- Tiga tema: mint, gelap, dan sepia.
- Bookmark dan riwayat baca yang mencatat bab terakhir serta posisi baca.
- Sinkronisasi bookmark, riwayat, dan preferensi antar perangkat, baik otomatis berdasarkan alamat IP yang sama maupun dengan kunci sinkronisasi manual.
- Proxy gambar di sisi server untuk sampul dan halaman yang memerlukan header `Referer` dari situs sumber.

## Teknologi

- Antarmuka: React 19, TypeScript, Vite 8, Tailwind CSS 4, Motion
- Server: Express 4
- Scraping: Axios dan Cheerio
- Deploy: Vercel (fungsi serverless) atau server Node.js biasa

## Struktur Proyek

```text
api/index.ts          Entry point fungsi serverless untuk Vercel
server.ts             Server Express: API, proxy gambar, sinkronisasi
src/
  App.tsx             Halaman utama dan state aplikasi
  components/         Pembaca bab, detail seri, dan komponen tampilan
  hwaverse-engine/    Scraper per sumber dan utilitas normalisasi data
  utils/              Pembuat artwork sampul
  types.ts            Tipe data
plugins/siteMeta.ts   Plugin Vite untuk meta tag, robots.txt, sitemap.xml, manifest
site.config.ts        Konfigurasi situs (URL, judul, deskripsi, tema, OG image)
public/               Ikon, gambar Open Graph, dan gambar README
```

## Menjalankan Secara Lokal

Prasyarat: Node.js 22 atau lebih baru.

```bash
npm install
cp .env.example .env
npm run dev
```

Aplikasi berjalan di `http://localhost:3000`. Port ini ditetapkan di `server.ts`. Proyek ini juga menyertakan `bun.lock`, sehingga `bun install` dapat dipakai sebagai alternatif `npm install`.

## Variabel Lingkungan

| Variabel | Keterangan |
| --- | --- |
| `VITE_SITE_URL` | URL publik situs tanpa garis miring di akhir. Dipakai untuk canonical, Open Graph, `robots.txt`, `sitemap.xml`, dan `manifest.webmanifest`. Jika kosong, dipakai URL produksi Vercel, atau `http://localhost:3000`. |
| `GOOGLE_SITE_VERIFICATION` | Opsional. Token verifikasi Google Search Console. |

Variabel ini dibaca saat build, jadi nilainya harus sudah ada sebelum `npm run build` dijalankan.

## Perintah

| Perintah | Keterangan |
| --- | --- |
| `npm run dev` | Menjalankan server pengembangan (Express dengan middleware Vite) |
| `npm run build` | Membangun klien ke folder `dist/` |
| `npm start` | Menjalankan `server.ts`. Dengan `NODE_ENV=production`, server menyajikan isi `dist/` |
| `npm run lint` | Pemeriksaan tipe TypeScript |
| `npm run clean` | Menghapus `dist/` dan `server.js` |

Untuk menjalankan versi produksi di server sendiri:

```bash
npm run build
NODE_ENV=production npm start
```

## Endpoint API

Semua endpoint berada di bawah `/api`. Respons sukses berupa JSON dengan field `success` dan `data`. Kegagalan mengembalikan objek `error` berisi `code` dan `message`.

| Endpoint | Parameter | Keterangan |
| --- | --- | --- |
| `GET /api/home` | `source`, `refresh` | Beranda gabungan dari semua sumber |
| `GET /api/list` | `source`, `page` | Daftar rilis terbaru |
| `GET /api/search` | `q`, `source`, `page` | Pencarian judul |
| `GET /api/genres` | | Daftar genre |
| `GET /api/genre/:genre` | `source`, `page` | Daftar berdasarkan genre |
| `GET /api/type/:type` | `source`, `page` | Daftar berdasarkan format |
| `GET /api/comic/:source/:id` | | Detail seri |
| `GET /api/comic/:source/:id/chapters` | | Daftar bab |
| `GET /api/comic/:source/:id/chapter/:chapter` | | Isi bab (gambar atau teks novel) |
| `GET /api/image-proxy` | `url`, `source` | Mengambil gambar dari sumber dengan header yang sesuai |
| `GET /api/device-sync` | | Profil sinkronisasi perangkat saat ini |
| `POST /api/device-sync` | | Menyimpan bookmark, riwayat, dan preferensi |
| `GET /api/device-sync/stream` | | Pembaruan sinkronisasi secara langsung (Server-Sent Events) |

Nilai `source` yang tersedia: `softkomik`, `komiku`, `luvyaa`, `noveldex`, `manta`. Untuk endpoint daftar, nilai `all` menggabungkan semua sumber.

## Sinkronisasi

Data sinkronisasi disimpan di server dalam satu berkas JSON (`data/device_sync_store.json` saat dijalankan lokal). Setiap perangkat mendapat kunci sinkronisasi bawaan yang diturunkan dari hash alamat IP. Perangkat dengan IP yang sama otomatis berbagi data, dan perangkat lain dapat ditautkan dengan memasukkan kunci secara manual. Daftar perangkat per kunci dibatasi hingga 10 entri.

Folder `data/` sudah masuk `.gitignore`.

## Deploy ke Vercel

Konfigurasi ada di `vercel.json`:

- Build memakai `npm run build` dengan output `dist/`.
- Semua permintaan `/api/*` diarahkan ke fungsi `api/index.ts` dengan durasi maksimum 30 detik, dan folder `src/hwaverse-engine` disertakan ke dalam fungsi.
- Permintaan lain diarahkan ke `index.html`.

Isi `VITE_SITE_URL` di pengaturan Environment Variables Vercel jika memakai domain sendiri.

Catatan penting untuk lingkungan serverless: di Vercel, data sinkronisasi ditulis ke `/tmp/komibaca-data`. Penyimpanan ini bersifat sementara dan dapat hilang saat instance fungsi diganti, sehingga sinkronisasi tidak dijamin persisten. Koneksi `/api/device-sync/stream` juga ikut dibatasi durasi maksimum fungsi. Untuk penyimpanan permanen, jalankan di server Node.js biasa atau pindahkan penyimpanan ke database eksternal.

## Catatan Konten

KomiBaca tidak menyimpan konten secara permanen. Judul, gambar, dan teks diambil dari situs sumber saat diminta, dan hak ciptanya dimiliki oleh pemilik masing-masing. Struktur situs sumber dapat berubah kapan saja, sehingga scraper di `src/hwaverse-engine` perlu disesuaikan bila ada perubahan.

## Penulis

Dibuat oleh FadelSM — [github.com/FadelSM](https://github.com/FadelSM)
