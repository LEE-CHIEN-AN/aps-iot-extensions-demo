// ThingSpeak + Wio Link IoT data service for Room 604 sensors.
// Sensor locations are in APS Viewer world space (feet).
// To find coordinates: open viewer, paste in DevTools console:
//   window.addEventListener('click', function h(e) {
//     var r = NOP_VIEWER.container.querySelector('canvas').getBoundingClientRect();
//     var hit = NOP_VIEWER.clientToWorld(e.clientX-r.left, e.clientY-r.top);
//     if (hit) console.log('XYZ:', hit.point.x.toFixed(1), hit.point.y.toFixed(1), hit.point.z.toFixed(1));
//     window.removeEventListener('click', h);
//   });

// Room 604: room dbId 11405 (Revit 房間, fragCount 0 — no mesh for surface shading).
// Floor slab dbId 11531 has geometry; shadingObjectId drives DataViz heatmap on the floor.
// Sensor location: clientToWorld click in viewer (feet/cm per model export).
const SENSOR_CONFIG = {
    '604-window': {
        name: '604 靠窗',
        description: '靠窗多功能感測器（溫濕度 / 磁場 / 懸浮微粒）',
        groupName: '6F Special Classroom 604',
        objectId: 11405,
        shadingObjectId: 11531,
        location: { x: -24.6, y: 0.3, z: 12.7 },
        channelId: '3027253',
        fieldMap: { temp: 'field1', humidity: 'field2', pm2_5: 'field5', pm10: 'field6' }
    },
    '604-door': {
        name: '604 門口',
        description: 'Wio Link 門口感測器（溫濕度 / 光照 / PIR）',
        groupName: '6F Special Classroom 604',
        objectId: 11405,
        shadingObjectId: 11531,
        location: { x: -24.6, y: -16.7, z: 12.7 },
        wioToken: process.env.WIOLINK_604_DOOR_TOKEN || '96c7644289c50aff68424a490845267f',
        wioSensors: {
            temp: '/GroveTempHumD2/temperature',
            humidity: '/GroveTempHumD2/humidity',
            light: '/GroveDigitalLightI2C0/lux'
        }
    },
    '604-center': {
        name: '604 中央',
        description: '中央桌邊感測器（溫濕度）',
        groupName: '6F Special Classroom 604',
        objectId: 11405,
        shadingObjectId: 11531,
        location: { x: -17.7, y: -7.9, z: 12.7 },
        channelId: '3022873',
        fieldMap: { temp: 'field1', humidity: 'field2' }
    },
    '604-wall': {
        name: '604 牆邊',
        description: 'Wio Link 牆邊感測器（溫濕度 / 光照 / PIR）',
        groupName: '6F Special Classroom 604',
        objectId: 11405,
        shadingObjectId: 11531,
        location: { x: -10.6, y: -16.7, z: 12.7 },
        wioToken: process.env.WIOLINK_604_WALL_TOKEN || '1b10e1172b455a426b53af996442c0ce',
        wioSensors: {
            temp: '/GroveTempHumD2/temperature',
            humidity: '/GroveTempHumD2/humidity',
            light: '/GroveDigitalLightI2C0/lux'
        }
    },
    '604-aircondition': {
        name: '604 冷氣旁',
        description: '冷氣旁感測器（溫濕度 / 光照）',
        groupName: '6F Special Classroom 604',
        objectId: 11405,
        shadingObjectId: 11531,
        location: { x: -10.6, y: 0.3, z: 12.7 },
        channelId: '3026055',
        apiKey: '797QS4ZPIJYT4U7W',
        fieldMap: { temp: 'field1', humidity: 'field2', light: 'field3' }
    }
};

const CHANNELS = {
    temp: {
        name: 'Temperature',
        description: '溫度',
        type: 'double',
        unit: '°C',
        min: 15,
        max: 30
    },
    humidity: {
        name: 'Humidity',
        description: '濕度',
        type: 'double',
        unit: '%',
        min: 50,
        max: 90
    },
    light: {
        name: 'Light Intensity',
        description: '光照強度',
        type: 'double',
        unit: 'lux',
        min: 0,
        max: 10000
    },
    pm2_5: {
        name: 'PM2.5',
        description: '細懸浮微粒',
        type: 'double',
        unit: 'μg/m³',
        min: 0,
        max: 150
    },
    pm10: {
        name: 'PM10',
        description: '懸浮微粒',
        type: 'double',
        unit: 'μg/m³',
        min: 0,
        max: 200
    }
};

// Format a Date as "YYYY-MM-DD HH:MM:SS" UTC for ThingSpeak query params.
function toThingSpeakDate(d) {
    return d.toISOString().replace('T', ' ').substring(0, 19);
}

async function fetchFeeds(channelId, start, end, apiKey = '') {
    const keyParam = apiKey ? `&api_key=${apiKey}` : '';
    const url =
        `https://api.thingspeak.com/channels/${channelId}/feeds.json` +
        `?start=${encodeURIComponent(toThingSpeakDate(start))}` +
        `&end=${encodeURIComponent(toThingSpeakDate(end))}` +
        `&results=8000${keyParam}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`ThingSpeak channel ${channelId} returned HTTP ${resp.status}`);
    }
    const json = await resp.json();
    return json.feeds || [];
}

// Wio Link real-time API — returns the current sensor value only.
// Historical data is not available via this API; the returned value is
// applied to all timestamps in getSamples() as a static snapshot.
const WIO_BASE = 'https://cn.wio.seeed.io/v1/node';

async function fetchWioLinkSensor(token, path) {
    const url = `${WIO_BASE}${path}?access_token=${token}`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return NaN;
        const json = await resp.json();
        return parseFloat(Object.values(json)[0]);
    } catch {
        return NaN;
    }
}

async function fetchAllWioLink(token, sensorPaths) {
    const entries = await Promise.all(
        Object.entries(sensorPaths).map(async ([channelId, path]) => {
            const value = await fetchWioLinkSensor(token, path);
            return [channelId, value];
        })
    );
    return Object.fromEntries(entries);
}

// Resample irregular ThingSpeak feeds onto `count` evenly-spaced timestamps.
// Returns an array of `count` numbers (NaN where no surrounding data exists).
function resample(feeds, fieldKey, startMs, endMs, count) {
    const points = feeds
        .filter(f => f[fieldKey] != null && f[fieldKey] !== '')
        .map(f => ({ t: new Date(f.created_at).getTime(), v: parseFloat(f[fieldKey]) }))
        .filter(p => !isNaN(p.v))
        .sort((a, b) => a.t - b.t);

    const values = new Array(count).fill(NaN);
    if (points.length === 0) return values;

    const step = count > 1 ? (endMs - startMs) / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
        const targetMs = startMs + i * step;

        // Binary search for the last point at or before targetMs.
        let lo = -1, hi = -1;
        let left = 0, right = points.length - 1;
        while (left <= right) {
            const mid = (left + right) >> 1;
            if (points[mid].t <= targetMs) { lo = mid; left = mid + 1; }
            else right = mid - 1;
        }
        if (lo + 1 < points.length) hi = lo + 1;

        if (lo !== -1 && hi !== -1) {
            const ratio = (targetMs - points[lo].t) / (points[hi].t - points[lo].t);
            values[i] = points[lo].v + ratio * (points[hi].v - points[lo].v);
        } else if (lo !== -1) {
            values[i] = points[lo].v;
        } else if (hi !== -1) {
            values[i] = points[hi].v;
        }
    }
    return values;
}

function generateTimestamps(start, end, count) {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const step = count > 1 ? (endMs - startMs) / (count - 1) : 0;
    return Array.from({ length: count }, (_, i) => new Date(startMs + i * step));
}

async function getSensors() {
    return Object.fromEntries(
        Object.entries(SENSOR_CONFIG).map(([id, { name, description, groupName, objectId, shadingObjectId, location }]) => [
            id, { name, description, groupName, objectId, shadingObjectId, location }
        ])
    );
}

async function getChannels() {
    return CHANNELS;
}

async function getSamples(timerange, resolution = 32) {
    const { start, end } = timerange;
    const count = Math.max(2, parseInt(resolution) || 32);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const timestamps = generateTimestamps(start, end, count);
    const data = {};

    await Promise.all(
        Object.entries(SENSOR_CONFIG).map(async ([sensorId, config]) => {
            data[sensorId] = {};

            if (config.wioToken) {
                const current = await fetchAllWioLink(config.wioToken, config.wioSensors);
                for (const [channelId, value] of Object.entries(current)) {
                    data[sensorId][channelId] = new Array(count).fill(isNaN(value) ? NaN : value);
                }
            } else {
                const feeds = await fetchFeeds(config.channelId, start, end, config.apiKey);
                for (const [channelId, fieldKey] of Object.entries(config.fieldMap)) {
                    data[sensorId][channelId] = resample(feeds, fieldKey, startMs, endMs, count);
                }
            }
        })
    );

    return { count, timestamps, data };
}

module.exports = { getSensors, getChannels, getSamples, fetchFeeds, resample, toThingSpeakDate };
