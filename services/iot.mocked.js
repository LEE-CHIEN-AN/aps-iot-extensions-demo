// Sensors for Room 604 (6F Special Classroom) in 土研2023.rvt.
// objectId=11405: Revit Room 604 dbId (fragCount=0, no mesh — data reference only)
// shadingObjectId=11531: 6F floor slab dbId (has mesh — DataViz renders heatmap here)
// Locations from clientToWorld measurements in APS Viewer (feet).
const SENSORS = {
    '604-window': {
        name: '604 靠窗',
        description: '靠窗（涼）',
        groupName: '6F',
        location: { x: -24.6, y: 0.3, z: 12.7 },
        objectId: 11405,
        shadingObjectId: 11531
    },
    '604-door': {
        name: '604 門口',
        description: '門口（中）',
        groupName: '6F',
        location: { x: -24.6, y: -16.7, z: 12.7 },
        objectId: 11405,
        shadingObjectId: 11531
    },
    '604-center': {
        name: '604 中央',
        description: '中央（中）',
        groupName: '6F',
        location: { x: -17.7, y: -7.9, z: 12.7 },
        objectId: 11405,
        shadingObjectId: 11531
    },
    '604-wall': {
        name: '604 牆邊',
        description: '牆邊（熱）',
        groupName: '6F',
        location: { x: -10.6, y: -16.7, z: 12.7 },
        objectId: 11405,
        shadingObjectId: 11531
    },
    '604-aircondition': {
        name: '604 冷氣旁',
        description: '冷氣旁（涼）',
        groupName: '6F',
        location: { x: -10.6, y: 0.3, z: 12.7 },
        objectId: 11405,
        shadingObjectId: 11531
    }
};

const CHANNELS = {
    'temp': {
        name: 'Temperature',
        description: 'External temperature in degrees Celsius.',
        type: 'double',
        unit: '°C',
        min: 18.0,
        max: 28.0
    },
    'co2': {
        name: 'CO₂',
        description: 'Level of carbon dioxide.',
        type: 'double',
        unit: 'ppm',
        min: 482.81,
        max: 640.00
    }
};

async function getSensors() {
    return SENSORS;
}

async function getChannels() {
    return CHANNELS;
}

async function getSamples(timerange, resolution = 32) {
    return {
        count: resolution,
        timestamps: generateTimestamps(timerange.start, timerange.end, resolution),
        data: {
            '604-window':      { 'temp': generateRandomValues(18.0, 21.0, resolution, 0.5), 'co2': generateRandomValues(590.0, 630.0, resolution, 4.0) },
            '604-door':        { 'temp': generateRandomValues(22.0, 25.0, resolution, 0.5), 'co2': generateRandomValues(555.0, 590.0, resolution, 4.0) },
            '604-center':      { 'temp': generateRandomValues(21.0, 24.0, resolution, 0.5), 'co2': generateRandomValues(545.0, 580.0, resolution, 4.0) },
            '604-wall':        { 'temp': generateRandomValues(24.0, 27.0, resolution, 0.5), 'co2': generateRandomValues(510.0, 550.0, resolution, 4.0) },
            '604-aircondition':{ 'temp': generateRandomValues(19.0, 22.0, resolution, 0.5), 'co2': generateRandomValues(500.0, 535.0, resolution, 4.0) }
        }
    };
}

function generateTimestamps(start, end, count) {
    const delta = Math.floor((end.getTime() - start.getTime()) / (count - 1));
    const timestamps = [];
    for (let i = 0; i < count; i++) {
        timestamps.push(new Date(start.getTime() + i * delta));
    }
    return timestamps;
}

function generateRandomValues(min, max, count, maxDelta) {
    const values = [];
    let lastValue = min + Math.random() * (max - min);
    for (let i = 0; i < count; i++) {
        values.push(lastValue);
        lastValue += (Math.random() - 0.5) * 2.0 * maxDelta;
        if (lastValue > max) {
            lastValue = max;
        }
        if (lastValue < min) {
            lastValue = min;
        }
    }
    return values;
}

module.exports = {
    getSensors,
    getChannels,
    getSamples
};
