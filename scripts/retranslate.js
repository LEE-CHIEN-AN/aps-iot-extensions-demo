// Re-translate the model with generateMasterViews: true so that
// Revit Room elements become available for DataViz heatmap volume shading.
//
// Usage: node scripts/retranslate.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.error('Missing APS_CLIENT_ID or APS_CLIENT_SECRET in .env');
    process.exit(1);
}

// Same URN as public/config.js APS_MODEL_URN
const MODEL_URN = 'dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6bnR1Y2FlLXNvaWwtMjAyMy8lRTUlOUMlOUYlRTclQTAlOTQyMDIzLnJ2dA';

async function getToken() {
    const resp = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: APS_CLIENT_ID,
            client_secret: APS_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'data:read data:write'
        })
    });
    if (!resp.ok) throw new Error(`Auth failed: ${resp.status} ${await resp.text()}`);
    const { access_token } = await resp.json();
    return access_token;
}

async function submitJob(token) {
    const resp = await fetch('https://developer.api.autodesk.com/modelderivative/v2/designdata/job', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-ads-force': 'true'  // force re-translate even if already translated
        },
        body: JSON.stringify({
            input: { urn: MODEL_URN },
            output: {
                formats: [{
                    type: 'svf2',
                    views: ['2d', '3d'],
                    advanced: { generateMasterViews: true }
                }]
            }
        })
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(`Translation job failed: ${resp.status} ${JSON.stringify(body)}`);
    return body;
}

async function pollStatus(token) {
    while (true) {
        const resp = await fetch(
            `https://developer.api.autodesk.com/modelderivative/v2/designdata/${MODEL_URN}/manifest`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const body = await resp.json();
        const status = body.status;
        const progress = body.progress || '';
        process.stdout.write(`\r  Status: ${status} ${progress}           `);
        if (status === 'success') { console.log('\n  Done.'); break; }
        if (status === 'failed') { console.error('\n  Translation failed:', JSON.stringify(body, null, 2)); process.exit(1); }
        await new Promise(r => setTimeout(r, 5000));
    }
}

(async () => {
    try {
        console.log('Getting access token...');
        const token = await getToken();
        console.log('Submitting translation job (generateMasterViews: true)...');
        const job = await submitJob(token);
        console.log('Job submitted:', job.result || job.urn || JSON.stringify(job));
        console.log('Polling for completion (may take a few minutes)...');
        await pollStatus(token);
        console.log('\nTranslation complete! Now:');
        console.log('1. Restart the server: yarn start (with IOT_SERVICE=thingspeak)');
        console.log('2. Open browser and run in Console:');
        console.log("   NOP_VIEWER.search('Revit Rooms', ids => { ids.forEach(id => NOP_VIEWER.model.getProperties(id, p => { if (p.name?.includes('604') || p.name?.includes('V-Lab')) console.log(id, p.name); })); }, e => console.error(e), ['Category'], { searchHidden: true });");
        console.log('3. Use the Room 604 dbId to update objectId in services/iot.thingspeak.js');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
