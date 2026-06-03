'use strict';

// Integration tests for the Express API routes.
// Forces the mocked IoT service so tests never hit ThingSpeak.
process.env.IOT_SERVICE = 'mocked';

const request = require('supertest');

// Stub out APS authentication so the server starts without real credentials.
jest.mock('../services/aps.js', () => ({
    getPublicToken: jest.fn().mockResolvedValue({ access_token: 'test-token', expires_in: 3600 })
}));

let app;

beforeAll(() => {
    app = require('../server.js');
});

// --- /auth/token ---

describe('GET /auth/token', () => {
    test('returns access_token and expires_in', async () => {
        const res = await request(app).get('/auth/token');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('expires_in');
    });
});

// --- /iot/sensors ---

describe('GET /iot/sensors', () => {
    test('returns 200', async () => {
        const res = await request(app).get('/iot/sensors');
        expect(res.status).toBe(200);
    });

    test('response is a non-empty object', async () => {
        const res = await request(app).get('/iot/sensors');
        expect(typeof res.body).toBe('object');
        expect(Object.keys(res.body).length).toBeGreaterThan(0);
    });

    test('each sensor has name, groupName, location with x/y/z', async () => {
        const res = await request(app).get('/iot/sensors');
        for (const sensor of Object.values(res.body)) {
            expect(sensor).toHaveProperty('name');
            expect(sensor).toHaveProperty('groupName');
            expect(sensor.location).toHaveProperty('x');
            expect(sensor.location).toHaveProperty('y');
            expect(sensor.location).toHaveProperty('z');
        }
    });
});

// --- /iot/channels ---

describe('GET /iot/channels', () => {
    test('returns 200', async () => {
        const res = await request(app).get('/iot/channels');
        expect(res.status).toBe(200);
    });

    test('each channel has unit, min, max', async () => {
        const res = await request(app).get('/iot/channels');
        for (const channel of Object.values(res.body)) {
            expect(channel).toHaveProperty('unit');
            expect(typeof channel.min).toBe('number');
            expect(typeof channel.max).toBe('number');
        }
    });
});

// --- /iot/samples ---

describe('GET /iot/samples', () => {
    const start = '2026-04-10T00:00:00.000Z';
    const end = '2026-04-17T00:00:00.000Z';

    test('returns 200 with valid time range', async () => {
        const res = await request(app).get(`/iot/samples?start=${start}&end=${end}&resolution=8`);
        expect(res.status).toBe(200);
    });

    test('response has count, timestamps, and data', async () => {
        const res = await request(app).get(`/iot/samples?start=${start}&end=${end}&resolution=8`);
        expect(res.body).toHaveProperty('count');
        expect(res.body).toHaveProperty('timestamps');
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.timestamps)).toBe(true);
    });

    test('timestamps length matches requested resolution', async () => {
        const res = await request(app).get(`/iot/samples?start=${start}&end=${end}&resolution=16`);
        expect(res.body.timestamps).toHaveLength(16);
        expect(res.body.count).toBe(16);
    });

    test('data object contains at least one sensor', async () => {
        const res = await request(app).get(`/iot/samples?start=${start}&end=${end}&resolution=8`);
        expect(Object.keys(res.body.data).length).toBeGreaterThan(0);
    });

    test('default resolution is used when not specified', async () => {
        const res = await request(app).get(`/iot/samples?start=${start}&end=${end}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.timestamps)).toBe(true);
        expect(res.body.timestamps.length).toBeGreaterThan(0);
    });
});
