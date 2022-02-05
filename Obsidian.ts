// TODO: improve success state
// TODO: strip markdown from description
// TODO: cache file modification dates to avoid re-parsing
// TODO: cache file list and dir modification dates
// TODO: show +N when more than 3 tasks

const { transparent, applyTint } = importModule('no-background');
import { parseDocument } from 'obsidian-tasks-parser';
import { addText, refreshAfter, WidgetTextProps } from './util';

type Task = {
  description: string;
  due: number;
  filename: string;
  start: number;
};

const BOOKMARK = 'Obsidian';
const NOW = new Date().getTime();

const textStyle: WidgetTextProps = {
  font: Font.systemFont(12),
  textColor: new Color('#ffffff', 1),
};
const dateFormatter = new DateFormatter();
dateFormatter.dateFormat = 'yyyy-MM-dd';

main().then(() => Script.complete());

async function main() {
  const fm = FileManager.iCloud();
  if (!fm.bookmarkExists(BOOKMARK)) {
    console.error(`Please point a bookmark named ${BOOKMARK} to your vault.`);
    return;
  }

  const tasks = (await scanDirForTasks(fm, fm.bookmarkedPath(BOOKMARK)))
    .filter((t) => t.due <= NOW || t.start <= NOW)
    .sort((a, b) => a.due - b.due || a.start - b.start);
  const widget = tasks.length ? buildTasksWidget(tasks) : buildEmptyWidget();
  widget.backgroundImage = await transparent(Script.name());
  applyTint(widget, '#666666', 0.2);

  if (config.runsInApp) {
    widget.presentSmall();
  } else {
    widget.refreshAfterDate = refreshAfter(5);
    Script.setWidget(widget);
  }
}

async function scanDirForTasks(fm: FileManager, dir: string): Promise<Task[]> {
  const normDate = (s: string): number =>
    s ? dateFormatter.date(s).getTime() : Number.MAX_SAFE_INTEGER;
  let results: Task[] = [];
  for (const filename of fm.listContents(dir)) {
    const path = fm.joinPath(dir, filename);
    if (fm.isDirectory(path)) {
      results = results.concat(await scanDirForTasks(fm, path));
    } else if (fm.fileExtension(path) === 'md') {
      await fm.downloadFileFromiCloud(path);
      results = results.concat(
        parseDocument(fm.readString(path), ' ').map((task) => ({
          description: task.description,
          due: normDate(task.dueDate),
          filename: filename.replace(/\.md$/, ''),
          start: normDate(task.startDate),
        }))
      );
    }
  }
  return results;
}

function buildTasksWidget(tasks: Task[]): ListWidget {
  const showTaskCount = 3;
  const widget = new ListWidget();
  widget.setPadding(16, 10, 16, 5);

  const titleStack = widget.addStack();
  titleStack.addSpacer();
  addText(titleStack, 'Today'.toUpperCase(), {
    ...textStyle,
    font: Font.boldSystemFont(12),
    textOpacity: 0.8,
  });
  titleStack.addSpacer(5); // difference between left/right padding
  titleStack.addSpacer();
  widget.addSpacer(5);

  for (const task of tasks.slice(0, showTaskCount)) {
    widget.addSpacer(3);
    const hStack = widget.addStack();
    addText(hStack, '•', {
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
  if (tasks.length > showTaskCount) {
    const hStack = widget.addStack();
    hStack.addSpacer();
    addText(hStack, `+${tasks.length - showTaskCount}`, {
      ...textStyle,
      textOpacity: 0.5,
    });
    hStack.addSpacer(5);
  }

  return widget;
}

function buildEmptyWidget(): ListWidget {
  const widget = new ListWidget();
  widget.setPadding(50, 50, 50, 50);
  const s = widget.addStack();
  const checkmark = SFSymbol.named('checkmark.circle');
  checkmark.applyFont(Font.systemFont(128));
  s.addSpacer();
  s.addImage(checkmark.image);
  s.addSpacer();
  return widget;
}

export {};
