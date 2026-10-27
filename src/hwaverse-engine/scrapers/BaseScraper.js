export class BaseScraper {
  constructor(name) {
    this.name = name;
  }

  async getHome() {
    throw new Error(`getHome() is not implemented for ${this.name}`);
  }

  async search(query, page = 1) {
    throw new Error(`search() is not implemented for ${this.name}`);
  }

  async getLatest(page = 1) {
    throw new Error(`getLatest() is not implemented for ${this.name}`);
  }

  async getList(page = 1) {
    throw new Error(`getList() is not implemented for ${this.name}`);
  }

  async getByGenre(genre, page = 1) {
    throw new Error(`getByGenre() is not implemented for ${this.name}`);
  }

  async getByType(type, page = 1) {
    throw new Error(`getByType() is not implemented for ${this.name}`);
  }

  async getDetail(id, includeChapters = true) {
    throw new Error(`getDetail() is not implemented for ${this.name}`);
  }

  async getChapters(id) {
    throw new Error(`getChapters() is not implemented for ${this.name}`);
  }

  async getChapter(id, chapter) {
    throw new Error(`getChapter() is not implemented for ${this.name}`);
  }
}
