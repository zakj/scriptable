// icon-color: blue; icon-glyph: info;
// @ts-check

const util = importModule("util");
const purpleAir = importModule("purpleAir");

const textColor = new Color("#ffffff", 1);
const dimTextColor = new Color("#ffffff", 0.85);

/** @type {Record<string, (wt: WidgetText) => void>} */
const textFmt = {
  bignum: (wt) => {
    wt.font = Font.ultraLightSystemFont(36);
    wt.lineLimit = 1;
    wt.textColor = textColor;
  },
  normal: (wt) => {
    wt.font = Font.systemFont(12);
    wt.textColor = textColor;
  },
  subhead: (wt) => {
    wt.font = Font.thinSystemFont(12);
    wt.lineLimit = 1;
    wt.textColor = dimTextColor;
  },
};

/** @type {{minAqi: number, color: Color, symbol: string}[]} */
const AQI_THRESHOLDS = [
  { minAqi: 300, color: new Color("ce4ec5", 1), symbol: "aqi.high" }, // hazardous
  { minAqi: 200, color: new Color("f33939", 1), symbol: "aqi.high" }, // very unhealthy
  { minAqi: 150, color: new Color("f16745", 1), symbol: "aqi.medium" }, // unhealthy
  { minAqi: 100, color: new Color("f7a021", 1), symbol: "aqi.medium" }, // unhealthy for sensitive groups
  { minAqi: 50, color: new Color("f2e269", 1), symbol: "aqi.low" }, // moderate
  { minAqi: -Infinity, color: textColor, symbol: "aqi.low" }, // good (green: 6de46d)
];

const backgroundImageFile = new util.File(
  `bg-medium-top-${Device.isUsingDarkAppearance() ? "dark" : "light"}.jpg`
);
const calendarListFile = new util.File("calendar-list.json");
const locationCacheFile = new util.File("location.json", { local: true });
const pillImageFile = new util.File("pill.png");
const weatherApiKeyFile = new util.File("openweather-api-key.json");

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
    const now = new Date();
    const refreshAt =
      now.getHours() < 7
        ? now.setHours(6, 30) && now // don't update overnight
        : now.getTime() + 5 * 60 * 1000; // 5 minutes
    widget.refreshAfterDate = new Date(refreshAt);
    Script.setWidget(widget);
  }
}

// ----------------------------------------

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundImage = await backgroundImageFile.readImage();
  widget.setPadding(10, 15, 10, 0);

  const eventsStack = widget.addStack();
  widget.addSpacer(null);
  const bottomStack = widget.addStack();
  bottomStack.bottomAlignContent();
  const dateStack = bottomStack.addStack();
  bottomStack.addSpacer(null);
  const weatherStack = bottomStack.addStack();

  await Promise.all([
    buildDate(dateStack),
    buildEvents(eventsStack),
    buildWeather(weatherStack),
  ]);

  return widget;
}

/** @type {(stack: WidgetStack) => Promise<void>} */
async function buildDate(stack) {
  const dateFormatter = new DateFormatter();
  const now = new Date();

  stack.bottomAlignContent();

  dateFormatter.dateFormat = "d";
  textFmt.bignum(stack.addText(dateFormatter.string(now)));
  stack.addSpacer(5);

  const dayStack = stack.addStack();
  dayStack.layoutVertically();
  dateFormatter.dateFormat = "EEEE";
  textFmt.normal(dayStack.addText(dateFormatter.string(now).toUpperCase()));
  dayStack.addSpacer(6);
}

/** @type {(stack: WidgetStack) => Promise<void>} */
async function buildEvents(stack) {
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
  const isAllDay = (event) => event.isAllDay || event.startDate <= todayStart;

  let events = await CalendarEvent.today(calendars);
  events = events.filter((e) => e.endDate > tenMinutesFromNow);
  if (now.getHours() >= 21 && events.filter((e) => !isAllDay(e)).length === 0) {
    events = await CalendarEvent.tomorrow(calendars);
    // Today's all-day events seem to show up in tomorrow's results.
    events = events.filter((e) => e.endDate.getDay() > now.getDay());
    if (events.length > 0) {
      const tomorrowText = stack.addText("Tomorrow".toUpperCase());
      tomorrowText.textColor = textColor;
      tomorrowText.font = Font.semiboldSystemFont(10);
    }
  }
  const eventSort = (e) => (isAllDay(e) ? e.endDate : e.startDate);
  events.sort((a, b) => eventSort(a) - eventSort(b));

  const moreEvents = events.slice(shownEvents);
  events = events.slice(0, shownEvents);

  stack.url = "calshow://";
  stack.layoutVertically();

  const pillImage = await pillImageFile.readImage();
  const pillSize = new Size(2, 11);
  /** @type {(stack: WidgetStack, color: Color) => void} */
  function pill(stack, color) {
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
      textFmt.subhead(timeStack.addText(dateFormatter.string(e.startDate)));
      containerStack.addSpacer(5);
    }

    pill(containerStack, e.calendar.color);
    containerStack.addSpacer(5);

    const textStack = containerStack.addStack();
    textStack.layoutVertically();
    const titleText = textStack.addText(
      e.title.replace(nonAsciiRe, " ").replace(/\s+/g, " ").trim()
    );
    titleText.lineLimit = 3;
    textFmt.normal(titleText);

    if (e.location && !e.location.match(/^http/)) {
      const locationText = textStack.addText(e.location);
      locationText.lineLimit = 1;
      textFmt.subhead(locationText);
    }
  });

  if (moreEvents.length) {
    stack.addSpacer(2);
    const containerStack = stack.addStack();

    const colors = moreEvents.reduce(
      (acc, e) => ({ [e.calendar.identifier]: e.calendar.color, ...acc }),
      {}
    );
    Object.values(colors).forEach((color) => {
      pill(containerStack, color);
      containerStack.addSpacer(3);
    });
    containerStack.addSpacer(2);

    const count = moreEvents.length;
    textFmt.subhead(
      containerStack.addText(`${count} more event${count > 1 ? "s" : ""}`)
    );
  }
}

/** @type {(stack: WidgetStack) => Promise<void>} */
async function buildWeather(stack) {
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
    aqiShown = true;
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

    const aqiText = aqiStack.addText((aqiCurrent || "-").toString());
    textFmt.subhead(aqiText);
    aqiText.textColor = color;

    if (trend) {
      wimg = aqiStack.addImage(SFSymbol.named(trend).image);
      wimg.imageSize = new Size(6, 6);
      wimg.tintColor = color;
    }
  }

  if (weather.status === "fulfilled") {
    textFmt.subhead(
      forecastStack.addText(`${weather.value.low}°/${weather.value.high}°`)
    );
    forecastStack.addSpacer(6);

    currentStack.layoutVertically();
    textFmt.bignum(currentStack.addText(`${weather.value.current}°`));
  } else {
    textFmt.bignum(currentStack.addText("--"));
  }
}

/** @type {() => Promise<{current: number, trend: number}>} */
async function fetchAqiData() {
  const location = await locationCacheFile.readJSON();
  const sensorId = await purpleAir.fetchSensorId({
    lat: location.lat,
    lng: location.lon,
  });
  console.log(`fetching aqi from sensor ${sensorId}`);
  return purpleAir.fetchAqi(sensorId);
}

/** @type {() => Promise<{low: number, high: number, current: number}>} */
async function fetchWeatherData() {
  const [apiKey, loc] = await Promise.all([
    weatherApiKeyFile.readJSON(),
    locationCacheFile.readJSON(),
  ]);

  const req = new Request(
    `https://api.openweathermap.org/data/2.5/onecall?lat=${loc.lat}&lon=${loc.lon}&units=imperial&exclude=minutely,hourly,alerts&appid=${apiKey}`
  );
  const resp = await req.loadJSON();
  return {
    low: Math.round(resp.daily[0].temp.min),
    high: Math.round(resp.daily[0].temp.max),
    current: Math.round(resp.current.temp),
  };
}
