// icon-color: light-gray; icon-glyph: cog;
// @ts-check

/** @class File */

class File {
  /** @param {string} filename */
  constructor(filename, { local } = { local: false }) {
    this.fm = local ? FileManager.local() : FileManager.iCloud();
    const dir = this.fm.joinPath(this.fm.documentsDirectory(), Script.name());
    if (!this.fm.fileExists(dir)) this.fm.createDirectory(dir);
    this.path = this.fm.joinPath(dir, filename);
    this.iCloud = !local;
  }

  get exists() {
    return this.fm.fileExists(this.path);
  }

  get modified() {
    return this.fm.modificationDate(this.path);
  }

  /** @type {(minutes: number) => boolean} */
  modifiedInLast(minutes) {
    // this.modified can be null sometimes?
    if (!this.exists || !this.modified) return false;
    const delta = new Date().getTime() - this.modified.getTime();
    return delta < minutes * 60 * 1000;
  }

  async readImage() {
    if (this.iCloud) await this.fm.downloadFileFromiCloud(this.path);
    return this.fm.readImage(this.path);
  }

  async readJSON() {
    if (this.iCloud) await this.fm.downloadFileFromiCloud(this.path);
    return JSON.parse(this.fm.readString(this.path));
  }

  writeJSON(value) {
    this.fm.writeString(this.path, JSON.stringify(value));
  }
}

module.exports = {
  File,
};
