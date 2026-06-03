const express = require('express');
const { getPublicToken } = require('./services/aps.js');
const iotService = process.env.IOT_SERVICE === 'thingspeak'
    ? require('./services/iot.thingspeak.js')
    : require('./services/iot.mocked.js');
const { getSensors, getChannels, getSamples } = iotService;
const { PORT } = require('./config.js');

let app = express();
app.use(express.static('public'));

app.get('/auth/token', async function (req, res, next) {
    try {
        res.json(await getPublicToken());
    } catch (err) {
        next(err);
    }
});

app.get('/iot/sensors', async function (req, res, next) {
    try {
        res.json(await getSensors());
    } catch (err) {
        next(err);
    }
});

app.get('/iot/channels', async function (req, res, next) {
    try {
        res.json(await getChannels());
    } catch (err) {
        next(err);
    }
});

app.get('/iot/samples', async function (req, res, next) {
    try {
        const resolution = req.query.resolution ? parseInt(req.query.resolution) : undefined;
        res.json(await getSamples({ start: new Date(req.query.start), end: new Date(req.query.end) }, resolution));
    } catch (err) {
        next(err);
    }
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send(err.message);
});

if (require.main === module) {
    app.listen(PORT, function () { console.log(`Server listening on port ${PORT}...`); });
}

module.exports = app;
