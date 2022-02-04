const { transparent } = importModule("no-background");
import { fetchAqi, fetchSensorId } from "./purpleAir";
import {
  addText,
  File,
  refreshAfter,
  urlParams,
  WidgetTextProps,
} from "./util";

const textColor = new Color("#ffffff", 1);
const style: Record<string, WidgetTextProps> = {
  bignum: {
    font: Font.ultraLightSystemFont(36),
    lineLimit: 1,
    textColor: textColor,
  },
  normal: {
    font: Font.systemFont(12),
    textColor: textColor,
  },
  subhead: {
    font: Font.thinSystemFont(12),
    lineLimit: 1,
    textColor: new Color("#ffffff", 0.85),
  },
};

type AqiThreshold = { minAqi: number; color: Color; symbol: string };
const AQI_THRESHOLDS: AqiThreshold[] = [
  { minAqi: 300, color: new Color("ce4ec5", 1), symbol: "aqi.high" }, // hazardous
  { minAqi: 200, color: new Color("f33939", 1), symbol: "aqi.high" }, // very unhealthy
  { minAqi: 150, color: new Color("f16745", 1), symbol: "aqi.medium" }, // unhealthy
  { minAqi: 100, color: new Color("f7a021", 1), symbol: "aqi.medium" }, // unhealthy for sensitive groups
  { minAqi: 50, color: new Color("f2e269", 1), symbol: "aqi.low" }, // moderate
  { minAqi: -Infinity, color: textColor, symbol: "aqi.low" }, // good (green: 6de46d)
];

// TODO share nobg cache dir?
// TODO build pill.png
// TODO update readme for openweather api key
const calendarListFile = new File<string[]>("calendar-list.json");
const locationCacheFile = new File<{ lat: number; lon: number }>(
  "location.json",
  { local: true }
);
const pillImageFile = new File("pill.png");
const weatherApiKeyFile = new File<string>("openweather-api-key.json");

main().then(() => Script.complete());

async function main() {
  if (!locationCacheFile.modifiedInLast(15)) {
    Location.setAccuracyToHundredMeters();
    const loc = await Location.current();
    locationCacheFile.writeJSON({ lat: loc.latitude, lon: loc.longitude });
  }

  if (config.runsInApp) {
    let updateCalendars = false;
    if (updateCalendars || !calendarListFile.exists) {
      const a = new Alert();
      a.title = "Change calendar list?";
      a.addAction("Update");
      a.addCancelAction("Cancel");
      updateCalendars = (await a.present()) !== -1;
    }
    if (updateCalendars) {
      const calendars = await Calendar.presentPicker(true);
      calendarListFile.writeJSON(calendars.map((c) => c.identifier));
    }
    const widget = await buildWidget();
    widget.presentMedium();
  } else if (config.runsInWidget) {
    const widget = await buildWidget();
    widget.refreshAfterDate = refreshAfter();
    Script.setWidget(widget);
  }
}

// ----------------------------------------

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundImage = await transparent(Script.name());
  widget.setPadding(10, 15, 10, 0);

  const eventsStack = widget.addStack();
  widget.addSpacer();
  const bottomStack = widget.addStack();
  bottomStack.bottomAlignContent();
  const dateStack = bottomStack.addStack();
  bottomStack.addSpacer();
  const weatherStack = bottomStack.addStack();

  await Promise.all([
    buildDate(dateStack),
    buildEvents(eventsStack),
    buildWeather(weatherStack),
  ]);

  return widget;
}

async function buildDate(stack: WidgetStack): Promise<void> {
  const dateFormatter = new DateFormatter();
  const now = new Date();

  stack.bottomAlignContent();

  dateFormatter.dateFormat = "d";
  addText(stack, dateFormatter.string(now), style.bignum);
  stack.addSpacer(5);

  const dayStack = stack.addStack();
  dayStack.layoutVertically();
  dateFormatter.dateFormat = "EEEE";
  addText(dayStack, dateFormatter.string(now).toUpperCase(), style.normal);
  dayStack.addSpacer(6);
}

async function buildEvents(stack: WidgetStack): Promise<void> {
  const now = new Date();
  const tenMinutesFromNow = new Date();
  tenMinutesFromNow.setMinutes(tenMinutesFromNow.getMinutes() + 10);
  const shownEvents = 2;

  let calendars = await Calendar.forEvents();
  if (calendarListFile.exists) {
    const calendarList = new Set(await calendarListFile.readJSON());
    calendars = calendars.filter((c) => calendarList.has(c.identifier));
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isAllDay = (event: CalendarEvent) =>
    event.isAllDay || event.startDate <= todayStart;

  let events = await CalendarEvent.today(calendars);
  events = events.filter((e) => e.endDate > tenMinutesFromNow);
  if (now.getHours() >= 21 && events.filter((e) => !isAllDay(e)).length === 0) {
    events = await CalendarEvent.tomorrow(calendars);
    // Today's all-day events seem to show up in tomorrow's results.
    events = events.filter((e) => e.endDate.getDay() > now.getDay());
    if (events.length > 0) {
      addText(stack, "Tomorrow".toUpperCase(), {
        font: Font.semiboldSystemFont(10),
        textColor: textColor,
      });
    }
  }
  const eventSort = (e: CalendarEvent) =>
    isAllDay(e) ? e.endDate.getTime() : e.startDate.getTime();
  events.sort((a, b) => eventSort(a) - eventSort(b));

  const moreEvents = events.slice(shownEvents);
  events = events.slice(0, shownEvents);

  stack.url = "calshow://";
  stack.layoutVertically();

  const pillImage = await pillImageFile.readImage();
  const pillSize = new Size(2, 11);
  function pill(stack: WidgetStack, color: Color): void {
    const pillStack = stack.addStack();
    pillStack.layoutVertically();
    pillStack.addSpacer(2);
    const pill = pillStack.addImage(pillImage);
    pill.imageSize = pillSize;
    pill.tintColor = color;
  }

  const nonAsciiRe = /[^\x00-\x7f]/g;
  const dateFormatter = new DateFormatter();
  dateFormatter.dateFormat = "HH:mm";
  events.forEach((e) => {
    const containerStack = stack.addStack();
    containerStack.setPadding(3, 0, 3, 15);

    if (!isAllDay(e)) {
      const timeStack = containerStack.addStack();
      timeStack.size = new Size(34, 0);
      addText(timeStack, dateFormatter.string(e.startDate), style.subhead);
      containerStack.addSpacer(5);
    }

    pill(containerStack, e.calendar.color);
    containerStack.addSpacer(5);

    const textStack = containerStack.addStack();
    textStack.layoutVertically();
    addText(
      textStack,
      e.title.replace(nonAsciiRe, " ").replace(/\s+/g, " ").trim(),
      { ...style.normal, lineLimit: 3 }
    );

    if (e.location && !e.location.match(/^http/)) {
      addText(textStack, e.location, { ...style.subhead, lineLimit: 1 });
    }
  });

  if (moreEvents.length) {
    stack.addSpacer(2);
    const containerStack = stack.addStack();

    const colors = new Map(
      moreEvents.map((e) => [e.calendar.identifier, e.calendar.color])
    );
    [...colors.values()].forEach((color) => {
      pill(containerStack, color);
      containerStack.addSpacer(3);
    });
    containerStack.addSpacer(2);

    const count = moreEvents.length;
    addText(
      containerStack,
      `${count} more event${count > 1 ? "s" : ""}`,
      style.subhead
    );
  }
}

async function buildWeather(stack: WidgetStack): Promise<void> {
  const [aqi, weather] = await Promise.allSettled([
    fetchAqiData(),
    fetchWeatherData(),
  ]);

  stack.bottomAlignContent();
  const forecastStack = stack.addStack();
  forecastStack.layoutVertically();
  stack.addSpacer(5);
  const currentStack = stack.addStack();

  let aqiShown = false;
  let aqiCurrent = null;
  let aqiTrend = 0;
  if (aqi.status === "fulfilled" && aqi.value.current > 50) {
    aqiShown = true;
    aqiCurrent = aqi.value.current;
    aqiTrend = aqi.value.trend;
  } else if (aqi.status === "rejected") {
    // XXX aqiShown = true;
  }
  if (aqiShown) {
    const { color, symbol } = AQI_THRESHOLDS.find(
      ({ minAqi }) => (aqiCurrent || 0) >= minAqi
    );
    const trend =
      aqiTrend > 0
        ? "arrow.up.right"
        : aqiTrend < 0
        ? "arrow.down.right"
        : null;

    const aqiStack = forecastStack.addStack();
    aqiStack.centerAlignContent();
    aqiStack.spacing = 3;

    let wimg = aqiStack.addImage(SFSymbol.named(symbol).image);
    wimg.imageSize = new Size(10, 10);
    wimg.tintColor = color;

    addText(aqiStack, (aqiCurrent || "-").toString(), {
      ...style.subhead,
      textColor: color,
    });

    if (trend) {
      wimg = aqiStack.addImage(SFSymbol.named(trend).image);
      wimg.imageSize = new Size(6, 6);
      wimg.tintColor = color;
    }
  }

  if (weather.status === "fulfilled") {
    addText(
      forecastStack,
      `${weather.value.low}°/${weather.value.high}°`,
      style.subhead
    );
    forecastStack.addSpacer(6);
    currentStack.layoutVertically();
    addText(currentStack, `${weather.value.current}°`, style.bignum);
  } else {
    addText(currentStack, "--", style.bignum);
  }
}

async function fetchAqiData(): Promise<{ current: number; trend: number }> {
  const location = await locationCacheFile.readJSON();
  const sensorId = await fetchSensorId({
    lat: location.lat,
    lng: location.lon,
  });
  return fetchAqi(sensorId);
}

async function fetchWeatherData(): Promise<{
  low: number;
  high: number;
  current: number;
}> {
  const [apiKey, loc] = (await Promise.all([
    weatherApiKeyFile.readJSON(),
    locationCacheFile.readJSON(),
  ])) as [string, { lat: number; lon: number }];

  const url = `https://api.openweathermap.org/data/2.5/onecall`;
  const params = urlParams({
    appid: apiKey,
    exclude: "minutes,hourly,alerts",
    lat: loc.lat,
    lon: loc.lon,
    units: "imperial",
  });
  const req = new Request(`${url}?${params}`);
  const resp = await req.loadJSON();
  return {
    low: Math.round(resp.daily[0].temp.min),
    high: Math.round(resp.daily[0].temp.max),
    current: Math.round(resp.current.temp),
  };
}

module.exports = {};
