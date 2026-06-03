'use strict';

const { getSensors, getChannels, getSamples, fetchFeeds, resample, toThingSpeakDate } = require('../services/iot.thingspeak.js');

// --- helpers ---

function makeFeed(created_at, field1, field2) {
    return { created_at, field1: String(field1), field2: String(field2) };
}

function mockFetch(body, status = 200) {
    return jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    });
}

// --- toThingSpeakDate ---

describe('toThingSpeakDate', () => {
    test('formats a UTC date as YYYY-MM-DD HH:MM:SS', () => {
        expect(toThingSpeakDate(new Date('2026-04-10T08:30:00Z'))).toBe('2026-04-10 08:30:00');
    });
});

// --- resample ---

describe('resample', () => {
    const start = new Date('2026-04-10T00:00:00Z').getTime();
    const end = new Date('2026-04-10T01:00:00Z').getTime();

    test('returns all NaN when feeds are empty', () => {
        const result = resample([], 'field1', start, end, 5);
        expect(result).toHaveLength(5);
        result.forEach(v => expect(v).toBeNaN());
    });

    test('returns all NaN when field values are missing', () => {
        const feeds = [{ created_at: '2026-04-10T00:30:00Z', field1: null }];
        const result = resample(feeds, 'field1', start, end, 4);
        result.forEach(v => expect(v).toBeNaN());
    });

    test('uses nearest value when only one feed exists', () => {
        const feeds = [makeFeed('2026-04-10T00:00:00Z', 25, 60)];
        const result = resample(feeds, 'field1', start, end, 3);
        result.forEach(v => expect(v).toBe(25));
    });

    test('linearly interpolates between two feeds', () => {
        const feeds = [
            makeFeed('2026-04-10T00:00:00Z', 20, 50),
            makeFeed('2026-04-10T01:00:00Z', 30, 70)
        ];
        const result = resample(feeds, 'field1', start, end, 3);
        expect(result[0]).toBeCloseTo(20);
        expect(result[1]).toBeCloseTo(25);
        expect(result[2]).toBeCloseTo(30);
    });

    test('extrapolates last known value past the final feed', () => {
        const feeds = [makeFeed('2026-04-10T00:00:00Z', 22, 55)];
        const result = resample(feeds, 'field1', start, end, 4);
        result.forEach(v => expect(v).toBe(22));
    });

    test('output length equals requested count', () => {
        const feeds = [makeFeed('2026-04-10T00:30:00Z', 25, 60)];
        [1, 8, 32, 100].forEach(count => {
            expect(resample(feeds, 'field1', start, end, count)).toHaveLength(count);
        });
    });
});

// --- fetchFeeds ---

describe('fetchFeeds', () => {
    afterEach(() => jest.restoreAllMocks());

    test('returns feeds array from API response', async () => {
        const feeds = [makeFeed('2026-04-10T00:10:00Z', 25, 60)];
        mockFetch({ channel: {}, feeds });
        const result = await fetchFeeds('3027253', new Date('2026-04-10T00:00:00Z'), new Date('2026-04-10T01:00:00Z'));
        expect(result).toEqual(feeds);
    });

    test('returns empty array when feeds key is absent', async () => {
        mockFetch({ channel: {} });
        const result = await fetchFeeds('3027253', new Date('2026-04-10T00:00:00Z'), new Date('2026-04-10T01:00:00Z'));
        expect(result).toEqual([]);
    });

    test('throws on non-200 response', async () => {
        mockFetch({}, 429);
        await expect(fetchFeeds('3027253', new Date(), new Date())).rejects.toThrow('HTTP 429');
    });

    test('builds URL with encoded start and end params', async () => {
        const spy = mockFetch({ channel: {}, feeds: [] });
        const start = new Date('2026-04-10T00:00:00Z');
        const end = new Date('2026-04-10T01:00:00Z');
        await fetchFeeds('3027253', start, end);
        const calledUrl = spy.mock.calls[0][0];
        expect(calledUrl).toContain('channels/3027253/feeds.json');
        expect(calledUrl).toContain(encodeURIComponent('2026-04-10 00:00:00'));
        expect(calledUrl).toContain(encodeURIComponent('2026-04-10 01:00:00'));
    });
});

// --- getSensors / getChannels ---

describe('getSensors', () => {
    test('returns 604-window and 604-center', async () => {
        const sensors = await getSensors();
        expect(sensors).toHaveProperty('604-window');
        expect(sensors).toHaveProperty('604-center');
    });

    test('each sensor has required fields', async () => {
        const sensors = await getSensors();
        for (const sensor of Object.values(sensors)) {
            expect(sensor).toHaveProperty('name');
            expect(sensor).toHaveProperty('groupName');
            expect(sensor).toHaveProperty('location');
            expect(sensor.location).toHaveProperty('x');
            expect(sensor.location).toHaveProperty('y');
            expect(sensor.location).toHaveProperty('z');
        }
    });
});

describe('getChannels', () => {
    test('returns temp and humidity channels', async () => {
        const channels = await getChannels();
        expect(channels).toHaveProperty('temp');
        expect(channels).toHaveProperty('humidity');
    });

    test('each channel has unit, min, max', async () => {
        const channels = await getChannels();
        for (const ch of Object.values(channels)) {
            expect(ch).toHaveProperty('unit');
            expect(typeof ch.min).toBe('number');
            expect(typeof ch.max).toBe('number');
            expect(ch.max).toBeGreaterThan(ch.min);
        }
    });
});

// --- getSamples ---

describe('getSamples', () => {
    const timerange = { start: new Date('2026-04-10T00:00:00Z'), end: new Date('2026-04-10T01:00:00Z') };
    const feeds = [
        makeFeed('2026-04-10T00:00:00Z', 25, 60),
        makeFeed('2026-04-10T00:30:00Z', 27, 65),
        makeFeed('2026-04-10T01:00:00Z', 26, 62)
    ];

    afterEach(() => jest.restoreAllMocks());

    test('timestamps array has requested resolution', async () => {
        mockFetch({ channel: {}, feeds });
        const result = await getSamples(timerange, 16);
        expect(result.timestamps).toHaveLength(16);
        expect(result.count).toBe(16);
    });

    test('data contains both sensors and both channels', async () => {
        mockFetch({ channel: {}, feeds });
        const result = await getSamples(timerange, 8);
        expect(result.data).toHaveProperty('604-window');
        expect(result.data).toHaveProperty('604-center');
        expect(result.data['604-window']).toHaveProperty('temp');
        expect(result.data['604-window']).toHaveProperty('humidity');
        expect(result.data['604-center']).toHaveProperty('temp');
        expect(result.data['604-center']).toHaveProperty('humidity');
    });

    test('each channel array has correct length', async () => {
        mockFetch({ channel: {}, feeds });
        const result = await getSamples(timerange, 8);
        for (const sensorData of Object.values(result.data)) {
            for (const values of Object.values(sensorData)) {
                expect(values).toHaveLength(8);
            }
        }
    });

    test('timestamps are Date objects in ascending order', async () => {
        mockFetch({ channel: {}, feeds });
        const { timestamps } = await getSamples(timerange, 4);
        timestamps.forEach(t => expect(t).toBeInstanceOf(Date));
        for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i].getTime()).toBeGreaterThan(timestamps[i - 1].getTime());
        }
    });

    test('handles empty feeds (all NaN)', async () => {
        mockFetch({ channel: {}, feeds: [] });
        const result = await getSamples(timerange, 4);
        for (const sensorData of Object.values(result.data)) {
            for (const values of Object.values(sensorData)) {
                values.forEach(v => expect(v).toBeNaN());
            }
        }
    });

    test('fetches both channels in parallel', async () => {
        const spy = mockFetch({ channel: {}, feeds });
        await getSamples(timerange, 4);
        expect(spy).toHaveBeenCalledTimes(2);
        const urls = spy.mock.calls.map(c => c[0]);
        expect(urls.some(u => u.includes('3027253'))).toBe(true);
        expect(urls.some(u => u.includes('3022873'))).toBe(true);
    });
});
