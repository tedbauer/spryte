// State
const state = {
    canvasW: 160,
    canvasH: 320,
    color: '#ff3366',
    tool: 'pencil',
    brushSize: 1,

    animations: [],
    currentAnimIndex: 0,
    frames: [],
    currentFrameIndex: 0,

    isPlaying: false,
    fps: 12,
    canvasZoom: 2,
    isDrawing: false,
    isNudging: false,
    onionSkin: false,
    undoStack: [],
    redoStack: [],
    selection: null,
    clipboard: null,
    marqueeStart: null
};

const defaultPalette = [
    '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'
];

let mainCtx, previewCtx;
let playInterval;

document.addEventListener('DOMContentLoaded', () => {
    state.canvasW = parseInt(document.getElementById('canvas-width').value) || 160;
    state.canvasH = parseInt(document.getElementById('canvas-height').value) || 320;

    initPalette();
    initCanvas();
    initPreview();
    initAnimations();
    setupEventListeners();
    updateUI();
});

function initPalette() {
    const grid = document.getElementById('palette-grid');
    grid.innerHTML = '';
    defaultPalette.forEach((col, index) => {
        const swatch = document.createElement('div');
        swatch.className = 'swatch' + (index === 0 ? ' active' : '');
        swatch.style.backgroundColor = col;
        swatch.dataset.color = col;
        swatch.addEventListener('click', () => {
            state.color = col;
            document.getElementById('color-picker').value = col;
            document.getElementById('color-hex').innerText = col;
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        });
        grid.appendChild(swatch);
    });
    state.color = defaultPalette[0];
    document.getElementById('color-picker').value = state.color;
    document.getElementById('color-hex').innerText = state.color;
}

function computeZoom() {
    const maxDim = Math.max(state.canvasW, state.canvasH);
    state.canvasZoom = Math.min(32, Math.max(1, Math.floor(400 / maxDim)));
}

function initCanvas() {
    const canvas = document.getElementById('main-canvas');
    mainCtx = canvas.getContext('2d');
    resizeCanvas(canvas);
}

function initPreview() {
    const canvas = document.getElementById('preview-canvas');
    previewCtx = canvas.getContext('2d');
    canvas.width = state.canvasW;
    canvas.height = state.canvasH;
}

function resizeCanvas(canvas) {
    canvas.width = state.canvasW;
    canvas.height = state.canvasH;

    computeZoom();

    const uiWidth = state.canvasW * state.canvasZoom;
    const uiHeight = state.canvasH * state.canvasZoom;

    const wrapper = document.querySelector('.canvas-wrapper');
    wrapper.style.width = `${uiWidth}px`;
    wrapper.style.height = `${uiHeight}px`;

    document.getElementById('grid-overlay').style.setProperty('--grid-cell-size', `${state.canvasZoom}px`);
    document.getElementById('grid-overlay').style.width = `${uiWidth}px`;
    document.getElementById('grid-overlay').style.height = `${uiHeight}px`;
}

function cloneImageData(imgData) {
    const copy = mainCtx.createImageData(imgData.width, imgData.height);
    copy.data.set(imgData.data);
    return copy;
}

function saveHistory() {
    state.undoStack.push({
        animIndex: state.currentAnimIndex,
        frameIndex: state.currentFrameIndex,
        data: cloneImageData(state.frames[state.currentFrameIndex]),
        selection: state.selection ? { ...state.selection } : null
    });
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
    state.isNudging = false;
    updateHistoryButtons();
}

function undo() {
    if (state.undoStack.length === 0) return;
    const lastState = state.undoStack.pop();

    state.redoStack.push({
        animIndex: state.currentAnimIndex,
        frameIndex: state.currentFrameIndex,
        data: cloneImageData(state.frames[state.currentFrameIndex]),
        selection: state.selection ? { ...state.selection } : null
    });

    if (state.currentAnimIndex !== lastState.animIndex) {
        selectAnimation(lastState.animIndex);
    }

    state.frames[lastState.frameIndex] = lastState.data;
    state.currentFrameIndex = lastState.frameIndex;
    state.selection = lastState.selection ? { ...lastState.selection } : null;
    state.isNudging = false;

    updateHistoryButtons();
    updateSelectionUI();
    renderTimeline();
    updateUI();
}

function redo() {
    if (state.redoStack.length === 0) return;
    const nextState = state.redoStack.pop();

    state.undoStack.push({
        animIndex: state.currentAnimIndex,
        frameIndex: state.currentFrameIndex,
        data: cloneImageData(state.frames[state.currentFrameIndex]),
        selection: state.selection ? { ...state.selection } : null
    });

    if (state.currentAnimIndex !== nextState.animIndex) {
        selectAnimation(nextState.animIndex);
    }

    state.frames[nextState.frameIndex] = nextState.data;
    state.currentFrameIndex = nextState.frameIndex;
    state.selection = nextState.selection ? { ...nextState.selection } : null;
    state.isNudging = false;

    updateHistoryButtons();
    updateSelectionUI();
    renderTimeline();
    updateUI();
}

function updateHistoryButtons() {
    document.getElementById('btn-undo').disabled = state.undoStack.length === 0;
    document.getElementById('btn-redo').disabled = state.redoStack.length === 0;
}

function clearHistory() {
    state.undoStack = [];
    state.redoStack = [];
    state.isNudging = false;
    updateHistoryButtons();
}

// ------ Animation Track Logic ------

function initAnimations() {
    const imgData = mainCtx.createImageData(state.canvasW, state.canvasH);
    state.animations = [
        { name: 'idle', frames: [imgData] }
    ];
    selectAnimation(0);
    clearHistory();
}

function selectAnimation(index) {
    if (index < 0 || index >= state.animations.length) return;
    state.currentAnimIndex = index;
    state.frames = state.animations[index].frames;
    state.currentFrameIndex = 0;

    renderAnimationSelect();
    renderTimeline();
    updateUI();
}

function renderAnimationSelect() {
    const select = document.getElementById('animation-select');
    select.innerHTML = '';
    state.animations.forEach((anim, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.innerText = anim.name;
        if (idx === state.currentAnimIndex) option.selected = true;
        select.appendChild(option);
    });
}

function renderTimeline() {
    const container = document.getElementById('frames-container');
    container.innerHTML = '';
    state.frames.forEach((frame, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'frame-thumb' + (idx === state.currentFrameIndex ? ' active' : '');

        const aspect = state.canvasW / state.canvasH;
        if (aspect > 1) {
            thumb.style.width = `${60 * aspect}px`;
            thumb.style.height = `60px`;
        } else {
            thumb.style.width = `60px`;
            thumb.style.height = `${60 / aspect}px`;
        }

        const c = document.createElement('canvas');
        c.width = state.canvasW;
        c.height = state.canvasH;
        c.style.width = '100%';
        c.style.height = '100%';
        c.getContext('2d').putImageData(frame, 0, 0);

        const num = document.createElement('div');
        num.className = 'frame-number';
        num.innerText = idx + 1;

        thumb.appendChild(c);
        thumb.appendChild(num);

        thumb.addEventListener('click', () => {
            state.currentFrameIndex = idx;
            state.isNudging = false;
            renderTimeline();
            updateUI();
        });

        container.appendChild(thumb);
    });
}

// Drawing Logic
function hexToRgba(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return [r, g, b, 255];
}

function getPixelIndex(x, y) {
    return (y * state.canvasW + x) * 4;
}

function setPixel(imgData, x, y, colorRgba) {
    if (x < 0 || x >= state.canvasW || y < 0 || y >= state.canvasH) return;
    const idx = getPixelIndex(x, y);
    imgData.data[idx] = colorRgba[0];
    imgData.data[idx + 1] = colorRgba[1];
    imgData.data[idx + 2] = colorRgba[2];
    imgData.data[idx + 3] = colorRgba[3];
}

function drawBrush(imgData, cx, cy, colorRgba, size) {
    const offset = Math.floor(size / 2);
    for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
            setPixel(imgData, cx - offset + dx, cy - offset + dy, colorRgba);
        }
    }
}

function getPixel(imgData, x, y) {
    if (x < 0 || x >= state.canvasW || y < 0 || y >= state.canvasH) return null;
    const idx = getPixelIndex(x, y);
    return [
        imgData.data[idx],
        imgData.data[idx + 1],
        imgData.data[idx + 2],
        imgData.data[idx + 3]
    ];
}

function colorsMatch(c1, c2) {
    if (!c1 || !c2) return false;
    return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2] && c1[3] === c2[3];
}

function floodFill(imgData, startX, startY, targetColorRgba, replacementColorRgba) {
    if (colorsMatch(targetColorRgba, replacementColorRgba)) return;

    const stack = [[startX, startY]];

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const currentColor = getPixel(imgData, x, y);

        if (currentColor && colorsMatch(currentColor, targetColorRgba)) {
            setPixel(imgData, x, y, replacementColorRgba);
            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }
    }
}

let lastDrawX = null;
let lastDrawY = null;
let lastHoverX = null;
let lastHoverY = null;

function bresenhamLine(imgData, x0, y0, x1, y1, colorRgba, size) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = (x0 < x1) ? 1 : -1;
    const sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    while (true) {
        drawBrush(imgData, x0, y0, colorRgba, size);

        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
}

function updateSelectionUI() {
    const box = document.getElementById('selection-box');
    if (!state.selection || state.selection.w === 0 || state.selection.h === 0) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    box.style.left = (state.selection.x * state.canvasZoom) + 'px';
    box.style.top = (state.selection.y * state.canvasZoom) + 'px';
    box.style.width = (state.selection.w * state.canvasZoom) + 'px';
    box.style.height = (state.selection.h * state.canvasZoom) + 'px';
}

function handlePointer(e) {
    const canvas = document.getElementById('main-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const imgData = state.frames[state.currentFrameIndex];

    if (e.type === 'pointerdown') {
        if (state.tool !== 'marquee') {
            state.selection = null;
            updateSelectionUI();
        }
        if (state.tool === 'pencil' || state.tool === 'eraser' || state.tool === 'fill' || state.tool === 'paste') {
            saveHistory();
        }
        lastDrawX = x;
        lastDrawY = y;

        if (state.tool === 'marquee') {
            state.marqueeStart = { x, y };
            state.selection = { x, y, w: 0, h: 0 };
            updateSelectionUI();
        }
    }

    if (state.tool === 'pencil' || state.tool === 'eraser') {
        const color = state.tool === 'pencil' ? hexToRgba(state.color) : [0, 0, 0, 0];
        if (e.type === 'pointermove' && lastDrawX !== null && lastDrawY !== null) {
            bresenhamLine(imgData, lastDrawX, lastDrawY, x, y, color, state.brushSize);
        } else {
            drawBrush(imgData, x, y, color, state.brushSize);
        }
        lastDrawX = x;
        lastDrawY = y;
    } else if (state.tool === 'fill' && e.type === 'pointerdown') {
        const targetColor = getPixel(imgData, x, y);
        const replacementColor = hexToRgba(state.color);
        if (targetColor) {
            floodFill(imgData, x, y, targetColor, replacementColor);
        }
    } else if (state.tool === 'marquee') {
        if (e.type === 'pointermove' && state.isDrawing && state.marqueeStart) {
            const minX = Math.min(state.marqueeStart.x, x);
            const minY = Math.min(state.marqueeStart.y, y);
            const maxX = Math.max(state.marqueeStart.x, x) + 1;
            const maxY = Math.max(state.marqueeStart.y, y) + 1;
            state.selection = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            updateSelectionUI();
        }
    }

    if (e.type === 'pointerup') {
        lastDrawX = null;
        lastDrawY = null;
    }

    updateUI();
}

function copyToClipboard() {
    if (!state.selection || state.selection.w <= 0 || state.selection.h <= 0) return;
    const { x, y, w, h } = state.selection;

    const src = state.frames[state.currentFrameIndex];
    const dest = mainCtx.createImageData(w, h);

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const sx = x + dx;
            const sy = y + dy;
            if (sx >= 0 && sx < state.canvasW && sy >= 0 && sy < state.canvasH) {
                const sIdx = (sy * state.canvasW + sx) * 4;
                const dIdx = (dy * w + dx) * 4;
                dest.data[dIdx] = src.data[sIdx];
                dest.data[dIdx + 1] = src.data[sIdx + 1];
                dest.data[dIdx + 2] = src.data[sIdx + 2];
                dest.data[dIdx + 3] = src.data[sIdx + 3];
            }
        }
    }
    state.clipboard = { data: dest, origX: x, origY: y };
    const box = document.getElementById('selection-box');
    box.style.borderColor = '#ff3366';
    setTimeout(() => { box.style.borderColor = '#fff'; }, 200);
}

function pasteInPlace() {
    if (!state.clipboard) return;
    saveHistory();

    const imgData = state.frames[state.currentFrameIndex];
    const { data: clipData, origX, origY } = state.clipboard;
    const w = clipData.width;
    const h = clipData.height;

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const px = origX + dx;
            const py = origY + dy;
            if (px >= 0 && px < state.canvasW && py >= 0 && py < state.canvasH) {
                const cIdx = (dy * w + dx) * 4;
                const alpha = clipData.data[cIdx + 3];
                if (alpha > 0) {
                    const idx = (py * state.canvasW + px) * 4;
                    imgData.data[idx] = clipData.data[cIdx];
                    imgData.data[idx + 1] = clipData.data[cIdx + 1];
                    imgData.data[idx + 2] = clipData.data[cIdx + 2];
                    imgData.data[idx + 3] = alpha;
                }
            }
        }
    }

    // Switch to marquee so user can immediately nudge the pasted data
    state.tool = 'marquee';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="marquee"]').classList.add('active');

    state.selection = { x: origX, y: origY, w, h };
    updateSelectionUI();
    updateUI();
    renderTimeline();
}

function deleteSelection() {
    if (!state.selection || state.selection.w <= 0 || state.selection.h <= 0) return;
    saveHistory();
    const { x, y, w, h } = state.selection;
    const imgData = state.frames[state.currentFrameIndex];

    for (let sy = 0; sy < h; sy++) {
        for (let sx = 0; sx < w; sx++) {
            const px = x + sx;
            const py = y + sy;
            if (px >= 0 && px < state.canvasW && py >= 0 && py < state.canvasH) {
                const idx = (py * state.canvasW + px) * 4;
                imgData.data[idx] = 0;
                imgData.data[idx + 1] = 0;
                imgData.data[idx + 2] = 0;
                imgData.data[idx + 3] = 0;
            }
        }
    }
    updateUI();
    renderTimeline();
}

function nudgeSelection(dx, dy) {
    if (!state.isNudging) {
        saveHistory();
        state.isNudging = true;
    }

    const { x, y, w, h } = state.selection;
    const imgData = state.frames[state.currentFrameIndex];

    const extracted = new Uint8ClampedArray(w * h * 4);
    for (let sy = 0; sy < h; sy++) {
        for (let sx = 0; sx < w; sx++) {
            const srcX = x + sx;
            const srcY = y + sy;
            const destIdx = (sy * w + sx) * 4;
            if (srcX >= 0 && srcX < state.canvasW && srcY >= 0 && srcY < state.canvasH) {
                const srcIdx = (srcY * state.canvasW + srcX) * 4;
                extracted[destIdx] = imgData.data[srcIdx];
                extracted[destIdx + 1] = imgData.data[srcIdx + 1];
                extracted[destIdx + 2] = imgData.data[srcIdx + 2];
                extracted[destIdx + 3] = imgData.data[srcIdx + 3];
                imgData.data[srcIdx] = 0;
                imgData.data[srcIdx + 1] = 0;
                imgData.data[srcIdx + 2] = 0;
                imgData.data[srcIdx + 3] = 0;
            }
        }
    }

    state.selection.x += dx;
    state.selection.y += dy;

    for (let sy = 0; sy < h; sy++) {
        for (let sx = 0; sx < w; sx++) {
            const destX = state.selection.x + sx;
            const destY = state.selection.y + sy;
            const srcIdx = (sy * w + sx) * 4;

            if (destX >= 0 && destX < state.canvasW && destY >= 0 && destY < state.canvasH) {
                const destIdx = (destY * state.canvasW + destX) * 4;
                imgData.data[destIdx] = extracted[srcIdx];
                imgData.data[destIdx + 1] = extracted[srcIdx + 1];
                imgData.data[destIdx + 2] = extracted[srcIdx + 2];
                imgData.data[destIdx + 3] = extracted[srcIdx + 3];
            }
        }
    }

    updateSelectionUI();
    updateUI();
    renderTimeline();
}

function setupEventListeners() {
    // Project Importing
    document.getElementById('btn-import-project').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });

    document.getElementById('import-file-input').addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let jsonFile = files.find(f => f.name.endsWith('.json'));
        let pngFile = files.find(f => f.type.startsWith('image/'));

        if (!jsonFile || !pngFile) {
            alert("Please select BOTH the .json metadata file AND the .png spritesheet image at the same time to import into the editor.");
            return;
        }

        try {
            const jsonText = await jsonFile.text();
            const metadata = JSON.parse(jsonText);

            const w = metadata.tile_size[0];
            const h = metadata.tile_size[1];
            const cols = metadata.columns;

            const imgUrl = URL.createObjectURL(pngFile);
            const img = new Image();
            img.onload = () => {
                const tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = img.width;
                tmpCanvas.height = img.height;
                const tmpCtx = tmpCanvas.getContext('2d');
                tmpCtx.drawImage(img, 0, 0);

                const newAnimations = [];
                for (const [animName, range] of Object.entries(metadata.animations)) {
                    const startIdx = range[0];
                    const endIdx = range[1];
                    const numFrames = endIdx - startIdx + 1;
                    const frames = [];
                    for (let i = 0; i < numFrames; i++) {
                        const globalIdx = startIdx + i;
                        const col = globalIdx % cols;
                        const row = Math.floor(globalIdx / cols);
                        const frameData = tmpCtx.getImageData(col * w, row * h, w, h);
                        frames.push(frameData);
                    }
                    newAnimations.push({ name: animName, frames: frames });
                }

                // Inject payload
                state.canvasW = w;
                state.canvasH = h;
                state.animations = newAnimations;

                // Reboot UI
                document.getElementById('canvas-width').value = w;
                document.getElementById('canvas-height').value = h;
                initCanvas();
                initPreview();
                selectAnimation(0);
                clearHistory();
                URL.revokeObjectURL(imgUrl);
            };
            img.src = imgUrl;

        } catch (err) {
            alert("Error importing project: " + err.message);
        }
    });


    // Tools
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.tool = btn.dataset.tool;
            if (state.tool !== 'marquee') {
                state.selection = null;
                updateSelectionUI();
            }
            updateUI();
        });
    });

    document.getElementById('color-picker').addEventListener('input', (e) => {
        state.color = e.target.value;
        document.getElementById('color-hex').innerText = e.target.value;
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    });

    document.getElementById('brush-size').addEventListener('input', (e) => {
        state.brushSize = parseInt(e.target.value);
        document.getElementById('brush-size-label').innerText = `${state.brushSize}px`;
    });

    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);

    document.getElementById('onion-skin-toggle').addEventListener('change', (e) => {
        state.onionSkin = e.target.checked;
        updateUI();
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (state.selection && state.selection.w > 0 && state.selection.h > 0) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelection();
                return;
            }

            let dx = 0, dy = 0;
            if (e.key === 'ArrowUp') dy = -1;
            else if (e.key === 'ArrowDown') dy = 1;
            else if (e.key === 'ArrowLeft') dx = -1;
            else if (e.key === 'ArrowRight') dx = 1;

            if (dx !== 0 || dy !== 0) {
                e.preventDefault();
                nudgeSelection(dx, dy);
                return;
            }
        }

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? e.metaKey : e.ctrlKey;

        if (modKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        } else if (modKey && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
        } else if (modKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copyToClipboard();
        } else if (modKey && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            pasteInPlace();
        }
    });

    const wrapper = document.querySelector('.canvas-wrapper');
    wrapper.addEventListener('pointerdown', (e) => {
        if (state.isPlaying) return;
        state.isDrawing = true;
        handlePointer(e);
        wrapper.setPointerCapture(e.pointerId);
    });

    wrapper.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        lastHoverX = Math.floor((e.clientX - rect.left) * scaleX);
        lastHoverY = Math.floor((e.clientY - rect.top) * scaleY);

        if (!state.isDrawing || state.isPlaying) return;
        handlePointer(e);
    });

    wrapper.addEventListener('pointerup', (e) => {
        if (!state.isDrawing) return;
        handlePointer(e);
        state.isDrawing = false;
        wrapper.releasePointerCapture(e.pointerId);
        renderTimeline();
    });

    // Resize
    document.getElementById('btn-resize').addEventListener('click', () => {
        const newW = parseInt(document.getElementById('canvas-width').value) || 160;
        const newH = parseInt(document.getElementById('canvas-height').value) || 320;
        if (confirm('Applying a new canvas size will clear your frames. Continue?')) {
            state.canvasW = newW;
            state.canvasH = newH;
            initCanvas();
            initPreview();
            initAnimations();
            updateUI();
        } else {
            document.getElementById('canvas-width').value = state.canvasW;
            document.getElementById('canvas-height').value = state.canvasH;
        }
    });

    // Animation Tracks Controls
    document.getElementById('animation-select').addEventListener('change', (e) => {
        selectAnimation(parseInt(e.target.value));
    });

    document.getElementById('btn-add-animation').addEventListener('click', () => {
        const name = prompt("Animation Name:", "run");
        if (name) {
            const imgData = mainCtx.createImageData(state.canvasW, state.canvasH);
            state.animations.push({ name: name, frames: [imgData] });
            selectAnimation(state.animations.length - 1);
        }
    });

    document.getElementById('btn-rename-animation').addEventListener('click', () => {
        const anim = state.animations[state.currentAnimIndex];
        const newName = prompt("Rename Animation:", anim.name);
        if (newName) {
            anim.name = newName;
            renderAnimationSelect();
        }
    });

    document.getElementById('btn-delete-animation').addEventListener('click', () => {
        if (state.animations.length > 1) {
            if (confirm('Delete this animation track?')) {
                state.animations.splice(state.currentAnimIndex, 1);
                selectAnimation(Math.max(0, state.currentAnimIndex - 1));
            }
        } else {
            alert('Cannot delete the last animation track!');
        }
    });

    // Frame Controls
    document.getElementById('btn-add-frame').addEventListener('click', () => {
        const newFrame = mainCtx.createImageData(state.canvasW, state.canvasH);
        state.frames.push(newFrame);
        state.currentFrameIndex = state.frames.length - 1;
        state.isNudging = false;
        renderTimeline();
        updateUI();
    });

    document.getElementById('btn-duplicate-frame').addEventListener('click', () => {
        const currentFrame = state.frames[state.currentFrameIndex];
        const newFrame = mainCtx.createImageData(state.canvasW, state.canvasH);
        newFrame.data.set(currentFrame.data);
        state.frames.splice(state.currentFrameIndex + 1, 0, newFrame);
        state.currentFrameIndex++;
        state.isNudging = false;
        renderTimeline();
        updateUI();
    });

    document.getElementById('btn-delete-frame').addEventListener('click', () => {
        if (state.frames.length > 1) {
            state.frames.splice(state.currentFrameIndex, 1);
            if (state.currentFrameIndex >= state.frames.length) {
                state.currentFrameIndex = state.frames.length - 1;
            }
            state.isNudging = false;
            renderTimeline();
            updateUI();
        } else {
            const empty = mainCtx.createImageData(state.canvasW, state.canvasH);
            state.frames[0] = empty;
            renderTimeline();
            updateUI();
        }
    });

    document.getElementById('btn-play-pause').addEventListener('click', (e) => {
        state.isPlaying = !state.isPlaying;
        e.target.innerText = state.isPlaying ? 'Pause' : 'Play';
        if (state.isPlaying) {
            playAnimation();
        } else {
            clearTimeout(playInterval);
            updateUI();
        }
    });

    document.getElementById('fps-range').addEventListener('input', (e) => {
        state.fps = parseInt(e.target.value);
        document.getElementById('fps-label').innerText = state.fps;
    });

    // Unity/Bevy JSON Exporter
    document.getElementById('btn-export-spritesheet').addEventListener('click', async () => {
        let maxFrames = 0;
        state.animations.forEach(anim => {
            if (anim.frames.length > maxFrames) maxFrames = anim.frames.length;
        });

        if (maxFrames === 0) return;

        const cols = maxFrames;
        const rows = state.animations.length;

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = state.canvasW * cols;
        tmpCanvas.height = state.canvasH * rows;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);

        const metadata = {
            image: "spryte_spritesheet.png",
            tile_size: [state.canvasW, state.canvasH],
            columns: cols,
            rows: rows,
            animations: {}
        };

        state.animations.forEach((anim, rowIdx) => {
            if (anim.frames.length === 0) return;
            const startIndex = rowIdx * cols;
            const endIndex = startIndex + anim.frames.length - 1;
            metadata.animations[anim.name] = [startIndex, endIndex];

            anim.frames.forEach((frame, colIdx) => {
                tmpCtx.putImageData(frame, colIdx * state.canvasW, rowIdx * state.canvasH);
            });
        });

        const usePicker = !!window.showSaveFilePicker;

        if (usePicker) {
            try {
                const pngHandle = await window.showSaveFilePicker({
                    suggestedName: 'spryte_spritesheet.png',
                    types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
                });

                metadata.image = pngHandle.name;

                let suggestedJsonName = pngHandle.name;
                if (suggestedJsonName.endsWith('.png')) {
                    suggestedJsonName = suggestedJsonName.replace('.png', '.json');
                } else {
                    suggestedJsonName += '.json';
                }

                const jsonHandle = await window.showSaveFilePicker({
                    suggestedName: suggestedJsonName,
                    types: [{ description: 'JSON Metadata', accept: { 'application/json': ['.json'] } }],
                });

                // Write PNG
                tmpCanvas.toBlob(async (blob) => {
                    const pngWritable = await pngHandle.createWritable();
                    await pngWritable.write(blob);
                    await pngWritable.close();
                }, 'image/png');

                // Write JSON
                const jsonWritable = await jsonHandle.createWritable();
                await jsonWritable.write(JSON.stringify(metadata, null, 2));
                await jsonWritable.close();

            } catch (e) {
                console.log("Save cancelled or failed", e);
                return;
            }
        } else {
            // Fallback for browsers without File System API
            // Save PNG
            const dataUrl = tmpCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = metadata.image;
            link.href = dataUrl;
            link.click();

            // Save JSON
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metadata, null, 2));
            const jsonLink = document.createElement('a');
            jsonLink.download = "spryte_metadata.json";
            jsonLink.href = dataStr;
            setTimeout(() => jsonLink.click(), 100);
        }
    });
}

const canvas = document.getElementById('main-canvas');
const tmpOverlayCanvas = document.createElement('canvas');

function playAnimation() {
    if (!state.isPlaying) return;
    state.currentFrameIndex = (state.currentFrameIndex + 1) % state.frames.length;
    renderTimeline();

    if (state.frames[state.currentFrameIndex]) {
        updateUI();
    }

    playInterval = setTimeout(playAnimation, 1000 / state.fps);
}

function updateUI() {
    if (state.frames[state.currentFrameIndex]) {
        if (tmpOverlayCanvas.width !== state.canvasW) tmpOverlayCanvas.width = state.canvasW;
        if (tmpOverlayCanvas.height !== state.canvasH) tmpOverlayCanvas.height = state.canvasH;
        const tmpCtx = tmpOverlayCanvas.getContext('2d');

        mainCtx.clearRect(0, 0, state.canvasW, state.canvasH);

        if (state.onionSkin && state.currentFrameIndex > 0 && !state.isPlaying) {
            tmpCtx.putImageData(state.frames[state.currentFrameIndex - 1], 0, 0);
            mainCtx.globalAlpha = 0.35;
            mainCtx.imageSmoothingEnabled = false;
            mainCtx.drawImage(tmpOverlayCanvas, 0, 0);
            mainCtx.globalAlpha = 1.0;
        }

        tmpCtx.putImageData(state.frames[state.currentFrameIndex], 0, 0);
        mainCtx.drawImage(tmpOverlayCanvas, 0, 0);

        previewCtx.putImageData(state.frames[state.currentFrameIndex], 0, 0);
    }
}
