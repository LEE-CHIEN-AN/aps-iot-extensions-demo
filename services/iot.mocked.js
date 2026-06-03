// TODO: Update objectId and location (x, y, z) for each sensor to match your model.
// In the viewer browser console, click an element then run:
//   viewer.getSelection()           → returns [dbId]
//   window.getBoundingBox(viewer.model, dbId)  → returns {min, max, center}
const SENSORS = {
    'sensor-1': {
        name: '施工區A',
        description: '感測器 A（請更新 objectId 與座標）',
        groupName: '地下層',
        location: { x: -60, y: -80, z: -10 },
        objectId: 1  // TODO: replace with actual dbId from viewer
    },
    'sensor-2': {
        name: '施工區B',
        description: '感測器 B（請更新 objectId 與座標）',
        groupName: '地下層',
        location: { x: -20, y: -80, z: -10 },
        objectId: 1  // TODO: replace with actual dbId from viewer
    },
    'sensor-3': {
        name: '施工區C',
        description: '感測器 C（請更新 objectId 與座標）',
        groupName: '1F',
        location: { x: -40, y: -40, z: 5 },
        objectId: 1  // TODO: replace with actual dbId from viewer
    },
    'sensor-4': {
        name: '施工區D',
        description: '感測器 D（請更新 objectId 與座標）',
        groupName: '1F',
        location: { x: -60, y: -40, z: 5 },
        objectId: 1  // TODO: replace with actual dbId from viewer
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
            'sensor-1': {
                'temp': generateRandomValues(18.0, 28.0, resolution, 1.0),
                'co2': generateRandomValues(540.0, 600.0, resolution, 5.0)
            },
            'sensor-2': {
                'temp': generateRandomValues(20.0, 24.0, resolution, 1.0),
                'co2': generateRandomValues(540.0, 600.0, resolution, 5.0)
            },
            'sensor-3': {
                'temp': generateRandomValues(24.0, 28.0, resolution, 1.0),
                'co2': generateRandomValues(500.0, 620.0, resolution, 5.0)
            },
            'sensor-4': {
                'temp': generateRandomValues(20.0, 24.0, resolution, 1.0),
                'co2': generateRandomValues(600.0, 640.0, resolution, 5.0)
            }
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
