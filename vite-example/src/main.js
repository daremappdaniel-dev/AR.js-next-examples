// Import Three.js from node_modules
import * as THREE from "three";

import {
    Engine,
    CaptureSystem,
    FramePumpSystem,
    SOURCE_TYPES,
    webcamPlugin,
    defaultProfilePlugin,
} from "ar.js-core";

import  {ArtoolkitPlugin} from  "@ar-js-org/arjs-plugin-artoolkit";

import {ThreeJSRendererPlugin} from "@ar-js-org/arjs-plugin-threejs"

// Example: AR.js Core ECS + ArtoolkitPlugin + ThreeJSRendererPlugin

// UI
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const loadBtn = document.getElementById("loadBtn");
const viewport = document.getElementById("viewport");

function log(message) {
    const ts = new Date().toISOString();
    const el = document.createElement("div");
    el.textContent = `[${ts}] ${message}`;
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    console.log(message);
}

function setStatus(msg, type = "normal") {
    statusEl.textContent = msg;
    statusEl.className = "status";
    if (type === "success") statusEl.classList.add("success");
    if (type === "error") statusEl.classList.add("error");
}

// Attach webcam <video> into the viewport without removing other children (like the Three.js canvas)
function attachVideoToViewport(ctx) {
    const frameSource = CaptureSystem.getFrameSource(ctx);
    const videoEl = frameSource?.element;
    if (!videoEl || !viewport) return;

    try {
        if (videoEl.parentNode && videoEl.parentNode !== viewport) {
            videoEl.parentNode.removeChild(videoEl);
        }
    } catch {}

    try {
        videoEl.setAttribute("playsinline", "");
        videoEl.setAttribute("autoplay", "");
        videoEl.muted = true;
        videoEl.controls = false;
    } catch {}

    Object.assign(videoEl.style, {
        position: "relative",
        top: "0px",
        left: "0px",
        zIndex: "1", // video under the ThreeJS renderer
        width: "100%",
        height: "auto",
        display: "block",
    });

    // Do NOT clear viewport; preserve plugin canvas
    if (!viewport.contains(videoEl)) {
        viewport.appendChild(videoEl);
    }
}

// Engine/plugin state
let engine;
let ctx;
let artoolkit;
let threePlugin;
let pumping = false;
let cameraStarted = false;

const cameraParamsUrl = new URL("./data/camera_para.dat", import.meta.url).href;
const hiroUrl = new URL("./data/patt.hiro", import.meta.url).href;

async function bootstrap() {
    engine = new Engine();

    // Register core/source plugins
    engine.pluginManager.register(defaultProfilePlugin.id, defaultProfilePlugin);
    engine.pluginManager.register(webcamPlugin.id, webcamPlugin);

    const enableLoadBtn = () => {
        loadBtn.disabled = false;
        setStatus(
            "Worker ready. You can start the webcam and load the marker.",
            "success",
        );
    };

    // Event bus
    const bus = engine.eventBus;

    // DEBUG: log all eventBus emits
    if (bus && typeof bus.emit === "function") {
        const _emit = bus.emit.bind(bus);
        bus.emit = (name, payload) => {
            //console.debug('[eventBus.emit]', name, payload);
            return _emit(name, payload);
        };
    }

    // Event listeners before enabling
    bus.on("ar:workerReady", () => {
        log("Worker ready");
        setStatus(
            "Worker ready. You can start the webcam and load the marker.",
            "success",
        );
        //loadBtn.disabled = false;
        enableLoadBtn();
        try {
            const proj = artoolkit?.getProjectionMatrix?.();
            const arr = proj?.toArray ? proj.toArray() : proj;
            if (Array.isArray(arr) && arr.length === 16) {
                bus.emit("ar:camera", { projectionMatrix: arr });
            }
        } catch {}
    });
    //engine.eventBus.on('ar:ready', enableLoadBtn);
    //engine.eventBus.on('ar:initialized', enableLoadBtn);
    bus.on("ar:workerError", (e) => {
        log(`workerError: ${JSON.stringify(e)}`);
        setStatus("Worker error (see console)", "error");
    });

    bus.on("ar:getMarker", (d) => {
        //const id = String(extractMarkerId(d));
        const id = String(
            d?.marker?.markerId ??
            d?.marker?.id ??
            d?.marker?.pattHandle ??
            d?.marker?.uid ??
            d?.marker?.index ??
            "0",
        );
        setTimeout(() => {
            const anchor = threePlugin.getAnchor(id);
            if (anchor && !anchor.userData._content) {
                anchor.userData._content = true;
                const cube = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.5, 0.5),
                    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
                );
                cube.position.y = 0.25;
                anchor.add(cube);
                console.log("[example] Added cube to anchor", id);
            }
        }, 0);

        const matrix = d?.matrix;
        if (Array.isArray(matrix) && matrix.length === 16) {
            bus.emit("ar:marker", {
                id,
                matrix,
                visible: true,
                source: "bridge:getMarker",
            });
        }
    });
    // Marker events for logging only (the Three plugin manages anchors and visibility)
    // Bridge legacy marker events => unified ar:marker for ThreeJSRendererPlugin
    bus.on("ar:markerFound", (d) => {
        bus.emit("ar:marker", {
            id: d?.markerId ?? d?.id,
            matrix: d?.matrix ?? d?.transformationMatrix,
            visible: true,
        });
    });
    bus.on("ar:markerUpdated", (d) => {
        bus.emit("ar:marker", {
            id: d?.markerId ?? d?.id,
            matrix: d?.matrix ?? d?.transformationMatrix,
            visible: true,
        });
    });
    bus.on("ar:markerLost", (d) => {
        bus.emit("ar:marker", { id: d?.markerId ?? d?.id, visible: false });
    });

    // Enable core plugins
    ctx = engine.getContext();
    await engine.pluginManager.enable(defaultProfilePlugin.id, ctx);
    await engine.pluginManager.enable(webcamPlugin.id, ctx);

    // Tracking plugin
    artoolkit = new ArtoolkitPlugin({
        worker: true,
        cameraParametersUrl: cameraParamsUrl,
        minConfidence: 0.6,
    });

    try {
        await artoolkit.init(ctx);
        await artoolkit.enable();
        console.log('done!')
    } catch (e) {
        console.error("[ArtoolkitPlugin] init/enable failed:", e);
        setStatus("ARToolKit plugin failed to initialize (see console)", "error");
        return;
    }

    // Three.js renderer plugin
    threePlugin = new ThreeJSRendererPlugin({
        container: viewport, // mount renderer here
        alpha: true, // transparent canvas over video
        antialias: true,
        preserveDrawingBuffer: false,
        useLegacyAxisChain: true,
        changeMatrixMode: "modelViewMatrix", // or 'cameraTransformMatrix'
        preferRAF: true,
    });
    await threePlugin.init(engine);
    await threePlugin.enable();

    const r = threePlugin.getRenderer();
    if (r) {
        // Force canvas to fill the viewport
        r.domElement.style.position = "absolute";
        r.domElement.style.inset = "0";
        r.domElement.style.width = "100%";
        r.domElement.style.height = "100%";
        // use this line below for testing
        // r.domElement.style.background = 'rgba(255,0,0,0.5)';
    }

    const cam = threePlugin.getCamera();
    cam.near = 0.01;
    cam.far = 5000;
    cam.updateProjectionMatrix();

    // Start ECS loop (systems/plugins tick)
    engine.start();

    // Fallback: if worker was already ready
    if (artoolkit.workerReady) {
        log("Worker was already ready (post-enable).");
        setStatus(
            "Worker ready. You can start the webcam and load the marker.",
            "success",
        );
        loadBtn.disabled = false;
    } else {
        setStatus("Plugin initialized. Waiting for worker…", "normal");
    }

    // UI initial state
    startBtn.disabled = false;
    stopBtn.disabled = true;
}

async function startWebcam() {
    if (cameraStarted) return;
    try {
        startBtn.disabled = true;
        stopBtn.disabled = true;
        setStatus("Starting webcam…", "normal");
        log("Initializing webcam capture");

        await CaptureSystem.initialize(
            {
                sourceType: SOURCE_TYPES.WEBCAM,
                sourceWidth: 640,
                sourceHeight: 480,
            },
            ctx,
        );

        attachVideoToViewport(ctx);

        if (!pumping) {
            FramePumpSystem.start(ctx);
            pumping = true;
        }

        cameraStarted = true;
        setStatus("Webcam started. You can now show the marker.", "success");
        log("Webcam started.");
        stopBtn.disabled = false;
        loadBtn.disabled = false;
    } catch (err) {
        log("Camera error: " + (err?.message || err));
        setStatus("Camera error (see console)", "error");
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

async function stopWebcam() {
    if (!cameraStarted) return;
    try {
        setStatus("Stopping webcam…", "normal");
        log("Stopping frame pump and capture");

        if (pumping) {
            FramePumpSystem.stop(ctx);
            pumping = false;
        }
        await CaptureSystem.dispose(ctx);

        // Remove only videos; keep ThreeJS canvas from the plugin
        if (viewport) {
            [...viewport.querySelectorAll("video")].forEach((v) => v.remove());
        }

        cameraStarted = false;
        setStatus("Webcam stopped.", "success");
        log("Webcam stopped.");
        startBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (err) {
        log("Stop error: " + (err?.message || err));
        setStatus("Stop error (see console)", "error");
    }
}

async function loadMarker() {
    if (!artoolkit) return;
    try {
        loadBtn.disabled = true;
        setStatus("Loading marker…", "normal");

        const res = await artoolkit.loadMarker(hiroUrl, 1);
        const markerId = res.markerId;
        log(`loadMarker result: ${JSON.stringify(res)}`);
        setStatus(
            `Marker loaded (id=${markerId}). Show the marker to the camera.`,
            "success",
        );
        // Note: anchor content is added on ar:getMarker events.
    } catch (err) {
        log("loadMarker failed: " + (err?.message || err));
        setStatus("Failed to load marker", "error");
    } finally {
        loadBtn.disabled = false;
    }
}

// Wire up UI events
startBtn.addEventListener("click", () => startWebcam());
stopBtn.addEventListener("click", () => stopWebcam());
loadBtn.addEventListener("click", () => loadMarker());

// Bootstrap on load
bootstrap().catch((e) => {
    console.error("[artoolkit+three] bootstrap error:", e);
    setStatus("Initialization error", "error");
});