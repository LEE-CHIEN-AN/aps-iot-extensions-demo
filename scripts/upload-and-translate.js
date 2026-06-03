// Upload a local RVT file to APS OSS, then translate it with generateMasterViews: true.
//
// Usage: node scripts/upload-and-translate.js
//
// After completion it prints the Base64 URN to put in public/config.js.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.error('Missing APS_CLIENT_ID or APS_CLIENT_SECRET in .env');
    process.exit(1);
}

// ── 設定區 ──────────────────────────────────────────────────────────────────
const LOCAL_FILE  = path.join(__dirname, '..', '土研2023.rvt');
const BUCKET_KEY  = 'ntucae-soil-2023';   // 全小寫、英數字+連字號，3~128字元
const OBJECT_NAME = '土研2023.rvt';
// ────────────────────────────────────────────────────────────────────────────

async function getToken() {
    const resp = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: APS_CLIENT_ID,
            client_secret: APS_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'data:read data:write bucket:read bucket:create'
        })
    });
    if (!resp.ok) throw new Error(`Auth failed: ${resp.status} ${await resp.text()}`);
    const { access_token } = await resp.json();
    return access_token;
}

async function ensureBucket(token) {
    // Try to get bucket info first
    const check = await fetch(
        `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/details`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (check.ok) {
        console.log(`Bucket "${BUCKET_KEY}" already exists.`);
        return;
    }
    // Create bucket
    const resp = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketKey: BUCKET_KEY, policyKey: 'persistent' })
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(`Create bucket failed: ${resp.status} ${JSON.stringify(body)}`);
    console.log(`Bucket "${BUCKET_KEY}" created.`);
}

async function uploadFile(token) {
    const fileBuffer = fs.readFileSync(LOCAL_FILE);
    const sizeMB = (fileBuffer.length / 1024 / 1024).toFixed(1);
    console.log(`Uploading ${OBJECT_NAME} (${sizeMB} MB) via Direct-to-S3...`);

    const encodedName = encodeURIComponent(OBJECT_NAME);
    const base = `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/objects/${encodedName}`;

    // Step 1: get signed S3 upload URL
    const initResp = await fetch(`${base}/signeds3upload?parts=1`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const initBody = await initResp.json();
    if (!initResp.ok) throw new Error(`Init upload failed: ${initResp.status} ${JSON.stringify(initBody)}`);
    const { uploadKey, urls } = initBody;
    console.log('  Got signed URL. Uploading to S3...');

    // Step 2: PUT file directly to S3 (no Authorization header)
    const s3Resp = await fetch(urls[0], {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: fileBuffer
    });
    if (!s3Resp.ok) throw new Error(`S3 upload failed: ${s3Resp.status} ${await s3Resp.text()}`);
    console.log('  S3 upload done. Completing...');

    // Step 3: notify APS the upload is complete
    const completeResp = await fetch(`${base}/signeds3upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadKey })
    });
    const completeBody = await completeResp.json();
    if (!completeResp.ok) throw new Error(`Complete upload failed: ${completeResp.status} ${JSON.stringify(completeBody)}`);
    console.log('Upload complete.');
    return completeBody.objectId; // urn:adsk.objects:os.object:bucket/name
}

function toBase64Urn(objectId) {
    // URL-safe Base64, no padding
    return Buffer.from(objectId).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function submitTranslation(token, urn) {
    const resp = await fetch('https://developer.api.autodesk.com/modelderivative/v2/designdata/job', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-ads-force': 'true'
        },
        body: JSON.stringify({
            input: { urn },
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
    console.log('Translation job submitted:', body.result || body.urn);
}

async function pollStatus(token, urn) {
    process.stdout.write('Polling');
    while (true) {
        await new Promise(r => setTimeout(r, 8000));
        const resp = await fetch(
            `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const body = await resp.json();
        const status = body.status;
        const progress = body.progress || '';
        process.stdout.write(`\r  Status: ${status.padEnd(10)} ${progress.padEnd(20)}`);
        if (status === 'success') { console.log('\n  Translation done!'); return; }
        if (status === 'failed') {
            console.error('\n  Translation failed:', JSON.stringify(body, null, 2));
            process.exit(1);
        }
    }
}

(async () => {
    if (!fs.existsSync(LOCAL_FILE)) {
        console.error(`File not found: ${LOCAL_FILE}`);
        process.exit(1);
    }

    const token = await getToken();
    console.log('Token OK.');

    await ensureBucket(token);
    const objectId = await uploadFile(token);
    const urn = toBase64Urn(objectId);

    console.log('\n=== Base64 URN ===');
    console.log(urn);
    console.log('==================\n');
    console.log('raw objectId:', objectId);

    await submitTranslation(token, urn);
    console.log('\nPolling for translation (generateMasterViews: true)...');
    await pollStatus(token, urn);

    console.log('\n====================================================');
    console.log('All done! Update public/config.js:');
    console.log(`  APS_MODEL_URN = '${urn}'`);
    console.log('Also update scripts/retranslate.js MODEL_URN to the same value.');
    console.log('====================================================');
})();
