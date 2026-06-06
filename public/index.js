import { initViewer, loadModel, adjustPanelStyle } from './viewer.js';
import {
    SensorListExtensionID,
    SensorSpritesExtensionID,
    SensorDetailExtensionID,
    SensorHeatmapsExtensionID
} from './viewer.js';
import { initTimeline } from './timeline.js';
import { MyDataView } from './dataview.js';
import {
    APS_MODEL_URN,
    APS_MODEL_VIEW,
    APS_MODEL_DEFAULT_FLOOR_NAME,
    APS_MODEL_DEFAULT_FLOOR_INDEX,
    DEFAULT_TIMERANGE_START,
    DEFAULT_TIMERANGE_END
} from './config.js';

const EXTENSIONS = [
    SensorListExtensionID,
    SensorSpritesExtensionID,
    SensorDetailExtensionID,
    SensorHeatmapsExtensionID,
    'Autodesk.AEC.LevelsExtension'
];

async function getRoomDbIdsAsync(model, categoryName = '房間') {
    return new Promise((resolve, reject) => {
        model.search(categoryName, resolve, reject, ['Category'], { searchHidden: true });
    });
}

async function getBulkPropertiesAsync(model, dbIds) {
    return new Promise((resolve, reject) => {
        model.getBulkProperties2(
            dbIds,
            { ignoreHidden: false, propFilter: ['viewable_in'] },
            resolve, reject
        );
    });
}

async function loadRoomsAsync(viewer, model) {
    const doc = model.getDocumentNode().getDocument();
    let roomDbIds;
    try {
        roomDbIds = await getRoomDbIdsAsync(model);
    } catch (e) {
        console.warn('[loadRoomsAsync] Category search failed:', e);
        return null;
    }
    if (!roomDbIds.length) {
        console.warn('[loadRoomsAsync] No room dbIds found. Check category name (try "Revit Rooms" if "房間" fails).');
        return null;
    }
    console.log(`[loadRoomsAsync] Found ${roomDbIds.length} room dbIds`);

    const result = await getBulkPropertiesAsync(model, roomDbIds);
    const roomInfoMap = {};
    result.forEach(r => {
        const viewableIds = r.properties.map(p => p.displayValue);
        for (const viewableId of viewableIds) {
            const bubble = doc.getRoot().findByGuid(viewableId);
            if (!bubble || bubble.is2D()) continue;
            if (roomInfoMap[viewableId]) {
                roomInfoMap[viewableId].dbIds.push(r.dbId);
            } else {
                roomInfoMap[viewableId] = { bubble, dbIds: [r.dbId] };
            }
        }
    });

    const data = Object.values(roomInfoMap);
    if (!data.length) {
        console.warn('[loadRoomsAsync] Rooms have no 3D viewable_in entries. fragCount will remain 0 — shadingObjectId fallback still active.');
        return null;
    }
    console.log(`[loadRoomsAsync] Loading rooms from ${data.length} 3D viewable(s)`);

    let roomModel = null;
    for (const info of data) {
        roomModel = await viewer.loadDocumentNode(doc, info.bubble, {
            ids: info.dbIds,
            modelNameOverride: 'Rooms',
            keepCurrentModels: true,
            globalOffset: new THREE.Vector3(),
            placementTransform: model.getModelToViewerTransform()
        });
        await viewer.waitForLoadDone();
    }
    console.log('[loadRoomsAsync] Room model loaded:', roomModel);
    return roomModel;
}

const viewer = await initViewer(document.getElementById('preview'), EXTENSIONS);
// Expose viewer for troubleshooting & sensor placement helpers.
window.NOP_VIEWER = viewer;
try {
    await loadModel(viewer, APS_MODEL_URN, APS_MODEL_VIEW);
} catch (err) {
    console.error('Failed to load APS model.', err);
    const msg = (err && (err.message || err.msg)) ? (err.message || err.msg) : '';
    const is401 = msg.includes('401') || err?.errors === 401 || err?.code === 401;
    alert([
        '模型載入失敗。',
        is401 ? '原因多半是 APS 回傳 401（未授權）：請確認 `public/config.js` 的 URN/VIEW 是你自己的、且該模型已完成 Derivative 轉檔，並且你的 APS App 有權限存取。' : '請查看瀏覽器 Console 的詳細錯誤訊息。'
    ].join('\n'));
    throw err;
}
viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, async (event) => {
    // Guard: only initialize once, for the primary model. Aggregated room models also fire this event.
    if (event.model !== viewer.model) return;
    // Initialize the timeline with the correct date range so that the
    // 'tscreated' event fires with the same range as the data, not 2022.
    initTimeline(document.getElementById('timeline'), onTimeRangeChanged, onTimeMarkerChanged, DEFAULT_TIMERANGE_START, DEFAULT_TIMERANGE_END);

    // Initialize our data view
    const dataView = new MyDataView();
    await dataView.init({ start: DEFAULT_TIMERANGE_START, end: DEFAULT_TIMERANGE_END });

    // Hide Revit Room volumes so they don't clutter the 3D view.
    // DataViz surface shading still works with hidden room geometry.
    viewer.search('Room', ids => { if (ids.length) viewer.hide(ids, viewer.model); }, () => {}, null, { searchHidden: true });

    // Try to load Revit rooms as an aggregated model so DataViz can shade room volumes directly.
    // Falls back to shadingObjectId (floor slab) if rooms have no 3D viewable_in entries.
    const roomModel = await loadRoomsAsync(viewer, viewer.model);
    if (roomModel) {
        // Hide room geometry visually; DataViz still uses the mesh for heatmap bounds.
        const roomTree = roomModel.getInstanceTree();
        if (roomTree) {
            const allRoomIds = [];
            roomTree.enumNodeChildren(roomTree.getRootId(), id => allRoomIds.push(id), true);
            if (allRoomIds.length) viewer.hide(allRoomIds, roomModel);
        }
        viewer.getExtension(SensorHeatmapsExtensionID).shadingModel = roomModel;
    }

    // Configure and activate our custom IoT extensions
    const extensions = [SensorListExtensionID, SensorSpritesExtensionID, SensorDetailExtensionID, SensorHeatmapsExtensionID].map(id => viewer.getExtension(id));
    for (const ext of extensions) {
        ext.dataView = dataView;
        ext.activate();
    }
    adjustPanelStyle(viewer.getExtension(SensorListExtensionID).panel, { right: '10px', top: '10px', width: '500px', height: '300px' });
    adjustPanelStyle(viewer.getExtension(SensorDetailExtensionID).panel, { right: '10px', top: '320px', width: '500px', height: '300px' });
    adjustPanelStyle(viewer.getExtension(SensorHeatmapsExtensionID).panel, { left: '10px', top: '320px', width: '300px', height: '150px' });

    // Configure and activate the levels extension
    const levelsExt = viewer.getExtension('Autodesk.AEC.LevelsExtension');
    levelsExt.levelsPanel.setVisible(true);
    levelsExt.floorSelector.addEventListener(Autodesk.AEC.FloorSelector.SELECTED_FLOOR_CHANGED, onLevelChanged);
    const allFloors = levelsExt.floorSelector.floorData;
    console.log('[Floor] Available floors:', allFloors.map((f, i) => `${i}:${f.name} z=[${f.zMin?.toFixed(0)},${f.zMax?.toFixed(0)}]`).join(' | '));
    const namedIndex = APS_MODEL_DEFAULT_FLOOR_NAME
        ? allFloors.findIndex(f => f.name === APS_MODEL_DEFAULT_FLOOR_NAME)
        : -1;
    const floorIndex = namedIndex !== -1 ? namedIndex : APS_MODEL_DEFAULT_FLOOR_INDEX;
    if (floorIndex >= 0) {
        console.log(`[Floor] Selecting '${APS_MODEL_DEFAULT_FLOOR_NAME}': index=${floorIndex}`);
        levelsExt.floorSelector.selectFloor(floorIndex, true);
    } else {
        console.log('[Floor] No default floor configured, showing all sensors');
    }
    adjustPanelStyle(levelsExt.levelsPanel, { left: '10px', top: '10px', width: '300px', height: '300px' });

    viewer.getExtension(SensorListExtensionID).onSensorClicked = (sensorId) => onCurrentSensorChanged(sensorId);
    viewer.getExtension(SensorSpritesExtensionID).onSensorClicked = (sensorId) => onCurrentSensorChanged(sensorId);
    viewer.getExtension(SensorHeatmapsExtensionID).onChannelChanged = (channelId) => onCurrentChannelChanged(channelId);
    // Seed timeline time so heatmap/sensor values use the sample date range, not "now".
    extensions.forEach(ext => { ext.currentTime = DEFAULT_TIMERANGE_START; });
    onTimeRangeChanged(DEFAULT_TIMERANGE_START, DEFAULT_TIMERANGE_END);
    // Focus 604 floor slab after load (has mesh; room dbId 11405 has fragCount 0).
    viewer.fitToView([11531]);

    async function onTimeRangeChanged(start, end) {
        await dataView.refresh({ start, end });
        extensions.forEach(ext => ext.dataView = dataView);
    }

    function onLevelChanged({ target, levelIndex }) {
        dataView.floor = levelIndex !== undefined ? target.floorData[levelIndex] : null;
        extensions.forEach(ext => ext.dataView = dataView);
    }

    function onTimeMarkerChanged(time) {
        extensions.forEach(ext => ext.currentTime = time);
    }

    function onCurrentSensorChanged(sensorId) {
        const sensor = dataView.getSensors().get(sensorId);
        if (sensor) {
            const fitId = sensor.shadingObjectId ?? sensor.objectId;
            if (fitId) {
                viewer.fitToView([fitId]);
            }
        }
        extensions.forEach(ext => ext.currentSensorID = sensorId);
    }

    function onCurrentChannelChanged(channelId) {
        extensions.forEach(ext => ext.currentChannelID = channelId);
    }
});

window.getBoundingBox = function (model, dbid) {
    const tree = model.getInstanceTree();
    const frags = model.getFragmentList();
    const bounds = new THREE.Box3();
    const result = new THREE.Box3();
    tree.enumNodeFragments(dbid, function (fragid) {
        frags.getWorldBounds(fragid, bounds);
        result.union(bounds);
    }, true);
    return result;
};

// Helper: click an element in the viewer, then run this in DevTools console
// to get its dbId, name, and world-space center for use in iot.mocked.js
window.inspectSelection = function () {
    const sel = viewer.getSelection();
    if (!sel.length) { console.log('Select an element first'); return; }
    const dbid = sel[0];
    const bb = window.getBoundingBox(viewer.model, dbid);
    const center = bb.getCenter ? bb.getCenter(new THREE.Vector3()) : { x: (bb.min.x+bb.max.x)/2, y: (bb.min.y+bb.max.y)/2, z: (bb.min.z+bb.max.z)/2 };
    viewer.model.getProperties(dbid, p => {
        console.log(`objectId: ${dbid}`);
        console.log(`name: ${p.name}`);
        console.log(`location: { x: ${center.x.toFixed(1)}, y: ${center.y.toFixed(1)}, z: ${center.z.toFixed(1)} }`);
    });
};

// Determine whether "Room" results include 3D geometry fragments (volumes) or are just tags/lines/reports.
window.checkRoomVolumes = async function (searchText = '房間', sampleSize = 25) {
    const v = window.NOP_VIEWER;
    const model = v?.model;
    if (!v || !model) {
        console.warn('Viewer not ready yet.');
        return null;
    }

    const tree = model.getInstanceTree();
    const frags = model.getFragmentList();
    const getFragCount = (dbId) => new Promise(resolve => {
        let count = 0;
        try {
            tree.enumNodeFragments(dbId, () => { count++; }, true);
        } catch {}
        resolve(count);
    });
    const getProps = (dbId) => new Promise(resolve => {
        model.getProperties(dbId, props => resolve(props), () => resolve(null));
    });
    const getBounds = (dbId) => new Promise(resolve => {
        try {
            const bb = window.getBoundingBox(model, dbId);
            resolve(bb || null);
        } catch {
            resolve(null);
        }
    });

    const ids = await new Promise(resolve => {
        v.search(searchText, resolve, () => resolve([]), null, { searchHidden: true });
    });

    const sample = ids.slice(0, Math.max(0, sampleSize));
    const rows = await Promise.all(sample.map(async (dbId) => {
        const [fragCount, props, bb] = await Promise.all([getFragCount(dbId), getProps(dbId), getBounds(dbId)]);
        const propList = props?.properties || [];
        const cat = propList.find(p => p.displayName === 'Category' || p.displayName === '類別')?.displayValue;
        const volume = propList.find(p => p.displayName === 'Volume' || p.displayName === '體積')?.displayValue;
        const area = propList.find(p => p.displayName === 'Area' || p.displayName === '面積')?.displayValue;
        const size = bb ? { x: (bb.max.x - bb.min.x), y: (bb.max.y - bb.min.y), z: (bb.max.z - bb.min.z) } : null;
        return { dbId, name: props?.name, category: cat, fragCount, volume, area, size };
    }));

    const withGeometry = rows.filter(r => r.fragCount > 0);
    const withoutGeometry = rows.filter(r => r.fragCount === 0);
    const summary = {
        searchText,
        totalMatches: ids.length,
        sampled: rows.length,
        sampledWithGeometry: withGeometry.length,
        sampledWithoutGeometry: withoutGeometry.length,
        sampleWithGeometry: withGeometry.slice(0, 10),
        sampleWithoutGeometry: withoutGeometry.slice(0, 10)
    };
    console.log('[checkRoomVolumes] summary:', summary);
    return summary;
};