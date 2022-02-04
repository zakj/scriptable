export type WidgetTextProps = Partial<WidgetText>;

export function addText(
  stack: ListWidget | WidgetStack,
  text: string,
  properties: WidgetTextProps
): WidgetText {
  const wt = stack.addText(text);
  Object.entries(properties).forEach(([k, v]) => (wt[k] = v));
  return wt;
}

export function refreshAfter(minutes: number = 0.5): Date {
  const now = new Date();
  return new Date(
    now.getHours() < 7
      ? now.setHours(6, 30) && now // don't update overnight
      : now.getTime() + minutes * 60 * 1000
  );
}

export function urlParams(obj: Record<string, string | number>): string {
  return Object.entries(obj)
    .map((e) => e.join("="))
    .join("&");
}

export class File<T> {
  fm: FileManager;
  path: string;
  iCloud: boolean;

  constructor(filename: string, { local } = { local: false }) {
    this.fm = local ? FileManager.local() : FileManager.iCloud();
    const dir = this.fm.joinPath(this.fm.documentsDirectory(), Script.name());
    if (!this.fm.fileExists(dir)) this.fm.createDirectory(dir);
    this.path = this.fm.joinPath(dir, filename);
    this.iCloud = !local;
  }

  get exists(): boolean {
    return this.fm.fileExists(this.path);
  }

  get modified(): Date {
    return this.fm.modificationDate(this.path);
  }

  modifiedInLast(minutes: number): boolean {
    // this.modified can be null sometimes?
    if (!this.exists || !this.modified) return false;
    const delta = new Date().getTime() - this.modified.getTime();
    return delta < minutes * 60 * 1000;
  }

  async readImage(): Promise<Image> {
    if (this.iCloud) await this.fm.downloadFileFromiCloud(this.path);
    return this.fm.readImage(this.path);
  }

  async readJSON(): Promise<T> {
    if (this.iCloud) await this.fm.downloadFileFromiCloud(this.path);
    return JSON.parse(this.fm.readString(this.path));
  }

  writeJSON(value: T): void {
    this.fm.writeString(this.path, JSON.stringify(value));
  }
}
