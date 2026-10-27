import { SoftKomikScraper } from "./softkomik/SoftKomikScraper.js";
import { KomikuScraper } from "./komiku/KomikuScraper.js";
import { NoveldexScraper } from "./noveldex/NoveldexScraper.js";
import { LuvyaaAdapter } from "./luvyaa/LuvyaaAdapter.js";
import { MantaScraper } from "./manta/MantaScraper.js";
import { AppError, ERROR_CODES } from "../utils/errors.js";

const scrapers = {
  softkomik: new SoftKomikScraper(),
  komiku: new KomikuScraper(),
  luvyaa: new LuvyaaAdapter(),
  noveldex: new NoveldexScraper(),
  manta: new MantaScraper()
};

export function getScraper(source) {
  if (!source) {
    throw new AppError(ERROR_CODES.INVALID_REQUEST, "Source is required", 400);
  }
  const clean = String(source).toLowerCase().trim();
  const scraper = scrapers[clean];
  if (!scraper) {
    throw new AppError(ERROR_CODES.SOURCE_NOT_FOUND, `Source '${source}' not found`, 404);
  }
  return scraper;
}

export { scrapers };

