// Sensors mapped to 6F IFC spaces in 土研2023.ifc.
// 3 sensors per room (window / center / door) to enable IDW gradient heatmap.
const SENSORS = {
    // 601 教授室：SE角(外牆右) / 中央 / NW角(走廊左)
    '601-se':     { name: '601 外牆右', description: '601 教授室 東南角', groupName: '6F', location: { x: 750, y: -295, z: -920 }, objectId: 2366 },
    '601-center': { name: '601 中央',   description: '601 教授室 中央',   groupName: '6F', location: { x: 605, y: -219, z: -920 }, objectId: 2366 },
    '601-nw':     { name: '601 走廊左', description: '601 教授室 西北角', groupName: '6F', location: { x: 460, y: -148, z: -920 }, objectId: 2366 },

    // 604 特殊教室：NE角(走廊右) / 中央 / SW角(外牆左)
    '604-ne':     { name: '604 走廊右', description: '604 特殊教室 東北角', groupName: '6F', location: { x: -445, y: -148, z: -929 }, objectId: 2370 },
    '604-center': { name: '604 中央',   description: '604 特殊教室 中央',   groupName: '6F', location: { x: -613, y: -221, z: -929 }, objectId: 2370 },
    '604-sw':     { name: '604 外牆左', description: '604 特殊教室 西南角', groupName: '6F', location: { x: -780, y: -295, z: -929 }, objectId: 2370 },

    // 611 學生研究室：SW角(走廊側) / 中央 / NE角(外牆右)
    '611-sw':     { name: '611 走廊側', description: '611 學生研究室 西南角', groupName: '6F', location: { x: -1650, y: 515, z: -929 }, objectId: 2389 },
    '611-center': { name: '611 中央',   description: '611 學生研究室 中央',   groupName: '6F', location: { x: -1488, y: 606, z: -929 }, objectId: 2389 },
    '611-ne':     { name: '611 外牆右', description: '611 學生研究室 東北角', groupName: '6F', location: { x: -1330, y: 695, z: -929 }, objectId: 2389 },

    // 612 學生研究室：NW角(外牆左) / 中央 / SE角(走廊右)
    '612-nw':     { name: '612 外牆左', description: '612 學生研究室 西北角', groupName: '6F', location: { x: -600, y: 695, z: -929 }, objectId: 2391 },
    '612-center': { name: '612 中央',   description: '612 學生研究室 中央',   groupName: '6F', location: { x: -438, y: 606, z: -929 }, objectId: 2391 },
    '612-se':     { name: '612 走廊右', description: '612 學生研究室 東南角', groupName: '6F', location: { x: -280, y: 515, z: -929 }, objectId: 2391 },
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
            // 601：外牆右角涼(18-21°C) / 中央 / 走廊左角熱(25-28°C)
            '601-se':     { 'temp': generateRandomValues(18.0, 21.0, resolution, 0.5), 'co2': generateRandomValues(590.0, 630.0, resolution, 4.0) },
            '601-center': { 'temp': generateRandomValues(21.0, 24.0, resolution, 0.5), 'co2': generateRandomValues(550.0, 590.0, resolution, 4.0) },
            '601-nw':     { 'temp': generateRandomValues(25.0, 28.0, resolution, 0.5), 'co2': generateRandomValues(500.0, 540.0, resolution, 4.0) },
            // 604：走廊右角熱(24-27°C) / 中央 / 外牆左角涼(19-22°C)
            '604-ne':     { 'temp': generateRandomValues(24.0, 27.0, resolution, 0.5), 'co2': generateRandomValues(500.0, 545.0, resolution, 4.0) },
            '604-center': { 'temp': generateRandomValues(21.0, 24.0, resolution, 0.5), 'co2': generateRandomValues(545.0, 580.0, resolution, 4.0) },
            '604-sw':     { 'temp': generateRandomValues(19.0, 22.0, resolution, 0.5), 'co2': generateRandomValues(580.0, 620.0, resolution, 4.0) },
            // 611：走廊側角熱(25-28°C) / 中央 / 外牆右角涼(20-23°C)
            '611-sw':     { 'temp': generateRandomValues(25.0, 28.0, resolution, 0.5), 'co2': generateRandomValues(505.0, 545.0, resolution, 4.0) },
            '611-center': { 'temp': generateRandomValues(22.0, 25.0, resolution, 0.5), 'co2': generateRandomValues(555.0, 595.0, resolution, 4.0) },
            '611-ne':     { 'temp': generateRandomValues(18.0, 22.0, resolution, 0.5), 'co2': generateRandomValues(600.0, 638.0, resolution, 4.0) },
            // 612：外牆左角涼(18-21°C) / 中央 / 走廊右角熱(24-27°C)
            '612-nw':     { 'temp': generateRandomValues(18.0, 21.0, resolution, 0.5), 'co2': generateRandomValues(595.0, 635.0, resolution, 4.0) },
            '612-center': { 'temp': generateRandomValues(21.0, 24.0, resolution, 0.5), 'co2': generateRandomValues(555.0, 595.0, resolution, 4.0) },
            '612-se':     { 'temp': generateRandomValues(24.0, 27.0, resolution, 0.5), 'co2': generateRandomValues(505.0, 555.0, resolution, 4.0) },
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
