import { File } from "./util";

type Location = { lat: number; lng: number };

export async function fetchAqi(
  sensorId: number
): Promise<{ current: number; trend: number }> {
  const req = new Request(`https://www.purpleair.com/json?show=${sensorId}`);
  const json = await req.loadJSON();

  // https://www2.purpleair.com/community/faq#hc-json-object-fields
  const stats = json.results
    .filter((r) => !(r.Flag || r.A_H))
    .map((r) => JSON.parse(r.Stats));
  const pm2_5 = stats.reduce((acc, { v }) => acc + v, 0) / stats.length;
  const trend = stats[0].v1 - stats[0].v3;

  return {
    current: aqiFromPm(pm2_5),
    trend: Math.abs(trend) > 5 ? trend : 0,
  };
}

export async function fetchSensorId({ lat, lng }: Location): Promise<number> {
  const sensorCacheFile = new File("purple-air.json");
  if (sensorCacheFile.modifiedInLast(15)) {
    const sensorCache = await sensorCacheFile.readJSON();
    if (sensorCache.lat === lat && sensorCache.lng === lng)
      return sensorCache.id;
  }

  let sensors = [];
  let bound = 0.01;
  while (sensors.length < 1 && bound < 0.5) {
    const nwLat = lat + bound;
    const seLat = lat - bound;
    const nwLng = lng - bound;
    const seLng = lng + bound;
    const req = new Request(
      `https://www.purpleair.com/json?exclude=true&nwlat=${nwLat}&selat=${seLat}&nwlng=${nwLng}&selng=${seLng}`
    );
    const json = await req.loadJSON();
    sensors = json.results.filter(
      (s) => !s.Flag && !s.A_H && s.DEVICE_LOCATIONTYPE !== "inside"
    );
    bound *= 2;
  }

  let closestSensor = null;
  let closestDistance = Infinity;
  for (const sensor of sensors) {
    const distance = haversine(
      { lat, lng },
      { lat: sensor.Lat, lng: sensor.Lon }
    );
    if (distance < closestDistance) {
      closestSensor = sensor;
      closestDistance = distance;
    }
  }

  sensorCacheFile.writeJSON({ lat, lng, id: closestSensor.ID });
  return closestSensor.ID;
}

function haversine(one: Location, two: Location): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(two.lat - one.lat);
  const dLng = toRadians(two.lng - one.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) *
      Math.sin(dLng / 2) *
      Math.cos(toRadians(one.lat)) *
      Math.cos(toRadians(two.lat));
  return 2 * Math.asin(Math.sqrt(a));
}

function aqiFromPm(pm: number): number {
  type TableRow = [
    concLo: number,
    concHi: number,
    aqiLo: number,
    aqiHi: number
  ];
  const table: TableRow[] = [
    [0.0, 12.0, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 500.4, 301, 500],
  ];

  const computeAqi = (
    concI: number,
    [concLo, concHi, aqiLo, aqiHi]: TableRow
  ): number =>
    Math.round(
      ((concI - concLo) / (concHi - concLo)) * (aqiHi - aqiLo) + aqiLo
    );

  const values = table.find(([concLo, concHi, aqiLo, aqiHi]) => pm <= concHi);
  return values ? computeAqi(pm, values) : 500;
}
