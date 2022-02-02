//! icon-color: deep-gray; icon-glyph: tasks;
// @ts-check

// TODO: improve success state
// TODO: strip markdown from description

/** @typedef {{description: string, due: Date, filename: string}} Task */

const { transparent, applyTint } = importModule("no-background");

const BOOKMARK = "Obsidian";
const TODAY = new Date();
const TASK_RE =
  /^\s*- \[ \] *(?<description>.+?) *📅 *(?<due>\d\d\d\d-\d\d-\d\d)/gm;

const textStyle = {
  font: Font.systemFont(12),
  textColor: new Color("#ffffff", 1),
};
const dateFormatter = new DateFormatter();
dateFormatter.dateFormat = "yyyy-MM-dd";

main().then(() => Script.complete());

async function main() {
  const fm = FileManager.iCloud();
  if (!fm.bookmarkExists(BOOKMARK)) {
    console.error(`Please point a bookmark named ${BOOKMARK} to your vault.`);
    return;
  }
  const tasks = await scanDirForTasks(fm, fm.bookmarkedPath(BOOKMARK));
  tasks.sort((a, b) => a.due.getTime() - b.due.getTime());
  const widget = tasks.length
    ? buildTasksWidget(tasks.slice(0, 3))
    : buildEmptyWidget();
  widget.backgroundImage = await transparent(Script.name());
  applyTint(widget, "#666666", 0.2);

  if (config.runsInApp) {
    widget.presentSmall();
  } else {
    widget.refreshAfterDate = refreshAt();
    Script.setWidget(widget);
  }
}

/** @type {() => Date} */
function refreshAt() {
  // TODO factor into utils
  const now = new Date();
  return new Date(
    now.getHours() < 7
      ? now.setHours(6, 30) && now // don't update overnight
      : now.getTime() + 30 * 1000 // in 30 seconds
  );
}

/** @type {(fm: FileManager, path: string) => Promise<Task[]>} */
async function scanDirForTasks(fm, dir) {
  let results = [];
  for (const filename of fm.listContents(dir)) {
    const path = fm.joinPath(dir, filename);
    if (fm.isDirectory(path)) {
      results = results.concat(await scanDirForTasks(fm, path));
    } else if (/\.md/.test(filename)) {
      await fm.downloadFileFromiCloud(path);
      results = results.concat(
        [...fm.readString(path).matchAll(TASK_RE)]
          .map((match) => ({
            description: match.groups.description,
            due: dateFormatter.date(match.groups.due),
            filename: filename.replace(/\.md$/, ""),
          }))
          .filter((task) => task.due <= TODAY)
      );
    }
  }
  return results;
}

/**
 *  @type {(
 *   stack: ListWidget | WidgetStack,
 *   text: string,
 *   properties: Partial<{[K in keyof WidgetText]: WidgetText[K]}>
 * ) => WidgetText}
 */
function addText(stack, text, properties) {
  const wt = stack.addText(text);
  Object.entries(properties).forEach(([k, v]) => (wt[k] = v));
  return wt;
}

/** @type {(tasks: Task[]) => ListWidget} */
function buildTasksWidget(tasks) {
  const widget = new ListWidget();
  widget.setPadding(16, 10, 16, 5);

  const titleStack = widget.addStack();
  titleStack.addSpacer();
  addText(titleStack, "Today".toUpperCase(), {
    ...textStyle,
    font: Font.boldSystemFont(12),
    textOpacity: 0.8,
  });
  titleStack.addSpacer(5); // difference between left/right padding
  titleStack.addSpacer();
  widget.addSpacer(5);

  for (const task of tasks) {
    widget.addSpacer(3);
    const hStack = widget.addStack();
    addText(hStack, "•", {
      ...textStyle,
      textOpacity: 0.4,
    });
    hStack.addSpacer(3);
    const vStack = hStack.addStack();
    vStack.layoutVertically();
    addText(vStack, task.description, {
      ...textStyle,
      textOpacity: 0.8,
      lineLimit: 2,
    });
    addText(vStack, task.filename, {
      ...textStyle,
      textOpacity: 0.5,
      lineLimit: 1,
    });
  }

  widget.addSpacer(); // top align
  return widget;
}

/** @type {() => ListWidget} */
function buildEmptyWidget() {
  const widget = new ListWidget();
  widget.setPadding(50, 50, 50, 50);
  const s = widget.addStack();
  const checkmark = SFSymbol.named("checkmark.circle");
  checkmark.applyFont(Font.systemFont(128));
  s.addSpacer();
  s.addImage(checkmark.image);
  s.addSpacer();
  return widget;
}

module.exports = {};
