import { useState, useRef } from "react";

// ── 픽셀 처리 유틸 (순수 함수, React 상태 없음) ──

// ── 픽셀 처리 유틸 (순수 함수, React 상태 없음) ──

function clampInt(min, max, v) {
  return v < min ? min : v > max ? max : v;
}

// ── Fast Marching Method 인페인팅 (Telea, 2004 알고리즘 기반 자체 구현) ──

const FMM_FAR = 1e6;
const FMM_KNOWN = 0, FMM_BAND = 1, FMM_UNKNOWN = 2;

function fmmCircleOffsets(radius) {
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const span = Math.floor(Math.sqrt(radius * radius - dy * dy));
    for (let dx = -span; dx <= span; dx++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push([dx, dy]);
    }
  }
  return offsets;
}

function fmmSolveEikonal(u1, known1, u2, known2) {
  if (known1 && known2) {
    const diff = u1 - u2;
    const disc = 2 - diff * diff;
    if (disc < 0) return Math.min(u1, u2) + 1;
    const root = Math.sqrt(disc);
    let s = (u1 + u2 - root) / 2;
    if (s >= u1 && s >= u2) return s;
    s += root;
    if (s >= u1 && s >= u2) return s;
    return Math.min(u1, u2) + 1;
  }
  if (known1) return u1 + 1;
  if (known2) return u2 + 1;
  return FMM_FAR;
}

function fmmGradient(field, state, x, y, width, height, dx, dy) {
  const here = y * width + x;
  const fx = x + dx, fy = y + dy;
  const bx = x - dx, by = y - dy;
  const fwdOk = fx >= 0 && fx < width && fy >= 0 && fy < height && state[fy * width + fx] !== FMM_UNKNOWN;
  const bwdOk = bx >= 0 && bx < width && by >= 0 && by < height && state[by * width + bx] !== FMM_UNKNOWN;
  if (fwdOk && bwdOk) return (field[fy * width + fx] - field[by * width + bx]) / 2;
  if (fwdOk) return field[fy * width + fx] - field[here];
  if (bwdOk) return field[here] - field[by * width + bx];
  return 0;
}

// Geometry-only pass: builds the marching-front fill order and per-pixel
// neighbor weights. This depends only on the mask shape, not on pixel
// colors, so it's computed once and reused for R, G, and B.
function fmmPlan(width, height, mask, radius) {
  const n = width * height;
  const state = new Uint8Array(n);
  const dist = new Float32Array(n);
  const offsets = fmmCircleOffsets(radius);

  for (let i = 0; i < n; i++) state[i] = mask[i] ? FMM_UNKNOWN : FMM_KNOWN;

  const heap = [];
  function heapPush(item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  }
  function heapPop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let smallest = i;
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (state[i] !== FMM_UNKNOWN) continue;
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (state[ni] === FMM_KNOWN) state[ni] = FMM_BAND;
      }
    }
  }
  for (let i = 0; i < n; i++) if (state[i] === FMM_BAND) heapPush([0, i]);

  const plan = [];

  while (heap.length) {
    const [, n0] = heapPop();
    const x0 = n0 % width, y0 = (n0 / width) | 0;
    state[n0] = FMM_KNOWN;
    if (x0 <= 1 || y0 <= 1 || x0 >= width - 2 || y0 >= height - 2) continue;

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x0 + dx, ny = y0 + dy;
      const ni = ny * width + nx;
      if (state[ni] === FMM_KNOWN) continue;

      const get = (gx, gy) => {
        const gi = gy * width + gx;
        return [dist[gi], state[gi] === FMM_KNOWN];
      };
      const [u1a, k1a] = get(nx - 1, ny), [u1b, k1b] = get(nx + 1, ny);
      const [u2a, k2a] = get(nx, ny - 1), [u2b, k2b] = get(nx, ny + 1);
      dist[ni] = Math.min(
        fmmSolveEikonal(u1a, k1a, u2a, k2a),
        fmmSolveEikonal(u1b, k1b, u2a, k2a),
        fmmSolveEikonal(u1a, k1a, u2b, k2b),
        fmmSolveEikonal(u1b, k1b, u2b, k2b)
      );

      if (state[ni] === FMM_UNKNOWN) {
        state[ni] = FMM_BAND;
        heapPush([dist[ni], ni]);

        const gx = fmmGradient(dist, state, nx, ny, width, height, 1, 0);
        const gy = fmmGradient(dist, state, nx, ny, width, height, 0, 1);
        const weighted = [];
        for (const [ox, oy] of offsets) {
          const sx = nx + ox, sy = ny + oy;
          if (sx < 1 || sy < 1 || sx >= width - 1 || sy >= height - 1) continue;
          const si = sy * width + sx;
          if (state[si] === FMM_UNKNOWN) continue;
          const geomDist = 1 / ((ox * ox + oy * oy) * Math.sqrt(ox * ox + oy * oy));
          const levelDist = 1 / (1 + Math.abs(dist[si] - dist[ni]));
          const direction = Math.abs(ox * gx + oy * gy) + 1e-6;
          weighted.push([si, geomDist * levelDist * direction]);
        }
        plan.push([ni, weighted]);
      }
    }
  }

  return plan;
}

function fmmApply(channel, plan) {
  for (const [target, weighted] of plan) {
    if (weighted.length === 0) continue;
    let sumW = 0, sumV = 0;
    for (const [src, w] of weighted) {
      sumW += w;
      sumV += w * channel[src];
    }
    if (sumW > 0) channel[target] = sumV / sumW;
  }
}

function inpaintWatermark(canvas, ctx, x0, y0, boxW, boxH) {
  const W = canvas.width, H = canvas.height;
  const originalBox = ctx.getImageData(x0, y0, boxW, boxH);

  // crop a padded window so the marching front has real context to grow
  // from, without paying the cost of running over the whole photo
  const padX = Math.round(boxW * 0.6), padY = Math.round(boxH * 0.6);
  const ex0 = clampInt(0, W, x0 - padX), ey0 = clampInt(0, H, y0 - padY);
  const ex1 = clampInt(0, W, x0 + boxW + padX), ey1 = clampInt(0, H, y0 + boxH + padY);
  const extW = ex1 - ex0, extH = ey1 - ey0;

  const cropData = ctx.getImageData(ex0, ey0, extW, extH);
  const n = extW * extH;
  const rCh = new Uint8ClampedArray(n), gCh = new Uint8ClampedArray(n), bCh = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    rCh[i] = cropData.data[i * 4];
    gCh[i] = cropData.data[i * 4 + 1];
    bCh[i] = cropData.data[i * 4 + 2];
  }

  const mask = new Uint8Array(n);
  const lx0 = x0 - ex0, ly0 = y0 - ey0;
  for (let y = ly0; y < ly0 + boxH; y++) {
    for (let x = lx0; x < lx0 + boxW; x++) {
      mask[y * extW + x] = 1;
    }
  }

  const plan = fmmPlan(extW, extH, mask, 3);
  fmmApply(rCh, plan);
  fmmApply(gCh, plan);
  fmmApply(bCh, plan);

  const filled = new Uint8ClampedArray(boxW * boxH * 4);
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const srcI = (ly0 + y) * extW + (lx0 + x);
      const dstI = (y * boxW + x) * 4;
      filled[dstI] = rCh[srcI];
      filled[dstI + 1] = gCh[srcI];
      filled[dstI + 2] = bCh[srcI];
      filled[dstI + 3] = 255;
    }
  }

  // feather the result into the original box edges so the treated area
  // doesn't read as a hard-edged rectangle
  const half = Math.floor(Math.min(boxW, boxH) / 2);
  let fw = Math.min(half - 1, Math.round(Math.min(boxW, boxH) * 0.12));
  if (fw < 1) fw = 0;
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const dx = Math.min(x, boxW - 1 - x);
      const dy = Math.min(y, boxH - 1 - y);
      const d = Math.min(dx, dy);
      const alpha = fw <= 0 ? 1 : Math.min(1, d / fw);
      const idx = (y * boxW + x) * 4;
      for (let c = 0; c < 3; c++) {
        originalBox.data[idx + c] = originalBox.data[idx + c] * (1 - alpha) + filled[idx + c] * alpha;
      }
      originalBox.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(originalBox, x0, y0);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function processFile(file, xPct, yPct, wPct, hPct, quality) {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const boxW = Math.max(2, Math.round(canvas.width * wPct));
  const boxH = Math.max(2, Math.round(canvas.height * hPct));
  const x0 = clampInt(0, canvas.width - boxW, Math.round(canvas.width * xPct - boxW / 2));
  const y0 = clampInt(0, canvas.height - boxH, Math.round(canvas.height * yPct - boxH / 2));

  inpaintWatermark(canvas, ctx, x0, y0, boxW, boxH);

  return await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}

async function processFileAI(file, xPct, yPct, wPct, hPct, quality, spaceUrl) {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const W = canvas.width, H = canvas.height;
  const boxW = Math.max(2, Math.round(W * wPct));
  const boxH = Math.max(2, Math.round(H * hPct));
  const x0 = clampInt(0, W - boxW, Math.round(W * xPct - boxW / 2));
  const y0 = clampInt(0, H - boxH, Math.round(H * yPct - boxH / 2));

  // send a padded crop (not the whole photo) to keep the upload small
  const padX = Math.round(boxW * 1.0), padY = Math.round(boxH * 1.0);
  const ex0 = clampInt(0, W, x0 - padX), ey0 = clampInt(0, H, y0 - padY);
  const ex1 = clampInt(0, W, x0 + boxW + padX), ey1 = clampInt(0, H, y0 + boxH + padY);
  const extW = ex1 - ex0, extH = ey1 - ey0;

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = extW; cropCanvas.height = extH;
  cropCanvas.getContext("2d").drawImage(canvas, ex0, ey0, extW, extH, 0, 0, extW, extH);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = extW; maskCanvas.height = extH;
  const mctx = maskCanvas.getContext("2d");
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, extW, extH);
  mctx.fillStyle = "#fff";
  mctx.fillRect(x0 - ex0, y0 - ey0, boxW, boxH);

  const cropBlob = await new Promise((res) => cropCanvas.toBlob(res, "image/png"));
  const maskBlob = await new Promise((res) => maskCanvas.toBlob(res, "image/png"));

  const form = new FormData();
  form.append("image", cropBlob, "crop.png");
  form.append("mask", maskBlob, "mask.png");

  const res = await fetch(spaceUrl.replace(/\/$/, "") + "/inpaint", { method: "POST", body: form });
  if (!res.ok) throw new Error("AI 서버 오류 (" + res.status + ")");
  const resultBlob = await res.blob();
  const resultImg = await loadImage(resultBlob);

  // composite just the masked box back into the original canvas, with the
  // same edge feathering used in local mode
  const originalBox = ctx.getImageData(x0, y0, boxW, boxH);
  const boxCanvas = document.createElement("canvas");
  boxCanvas.width = boxW; boxCanvas.height = boxH;
  boxCanvas.getContext("2d").drawImage(resultImg, x0 - ex0, y0 - ey0, boxW, boxH, 0, 0, boxW, boxH);
  const filled = boxCanvas.getContext("2d").getImageData(0, 0, boxW, boxH).data;

  const half = Math.floor(Math.min(boxW, boxH) / 2);
  let fw = Math.min(half - 1, Math.round(Math.min(boxW, boxH) * 0.12));
  if (fw < 1) fw = 0;
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const dx = Math.min(x, boxW - 1 - x);
      const dy = Math.min(y, boxH - 1 - y);
      const d = Math.min(dx, dy);
      const alpha = fw <= 0 ? 1 : Math.min(1, d / fw);
      const idx = (y * boxW + x) * 4;
      for (let c = 0; c < 3; c++) {
        originalBox.data[idx + c] = originalBox.data[idx + c] * (1 - alpha) + filled[idx + c] * alpha;
      }
      originalBox.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(originalBox, x0, y0);

  return await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}

const DEFAULT_LAMA_SPACE_URL = "https://1bt-verita-watermark-inpaint.hf.space";

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + "KB";
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
}

// ── 결과 카드 ──
function ResultCard({ r }) {
  const [showOrig, setShowOrig] = useState(false);
  return (
    <div style={{ border: "1px solid #21262d", borderRadius: 8, overflow: "hidden", background: "#0d1117" }}>
      <div style={{ position: "relative", cursor: "pointer" }} onClick={() => setShowOrig((v) => !v)}>
        <span style={{ position: "absolute", top: 6, left: 6, fontFamily: "monospace", fontSize: 10, background: "rgba(0,0,0,0.65)", color: "#f48c06", padding: "2px 6px", borderRadius: 3 }}>
          {showOrig ? "원본" : "보정 후"}
        </span>
        <img src={showOrig ? r.origUrl : r.url} alt={r.name} style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover" }} />
      </div>
      <div style={{ padding: "8px 9px 10px" }}>
        <div style={{ fontSize: 11, color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>{r.name}</div>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6e7681", marginBottom: 8 }}>{fmtSize(r.origSize)} → {fmtSize(r.newSize)}</div>
        <a href={r.url} download={r.name} style={{ display: "block", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#0d1117", background: "linear-gradient(135deg,#e85d04,#f48c06)", borderRadius: 5, padding: "6px 0", textDecoration: "none" }}>
          다운로드
        </a>
      </div>
    </div>
  );
}

// ── 메인 패널 ──
export default function WatermarkRemoverPanel() {
  const [files, setFiles] = useState([]);
  const [calibSrc, setCalibSrc] = useState(null);
  const [calibDims, setCalibDims] = useState(null);
  const [xPct, setXPct] = useState(0.49);
  const [yPct, setYPct] = useState(0.50);
  const [wPct, setWPct] = useState(0.25);
  const [hPct, setHPct] = useState(0.05);
  const [quality, setQuality] = useState(0.92);
  const [aiMode, setAiMode] = useState(false);
  const [spaceUrl, setSpaceUrl] = useState(() => {
    try { return localStorage.getItem("verita_lama_space_url") || DEFAULT_LAMA_SPACE_URL; } catch { return DEFAULT_LAMA_SPACE_URL; }
  });
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  function handleFiles(fl) {
    if (!fl || fl.length === 0) return;
    setFiles(fl);
    setResults([]);
    setProgress("");
    setCalibSrc(URL.createObjectURL(fl[0]));
  }

  function updateSpaceUrl(v) {
    setSpaceUrl(v);
    try { localStorage.setItem("verita_lama_space_url", v); } catch {}
  }

  async function handleApply() {
    if (files.length === 0) return;
    if (aiMode && !spaceUrl.trim()) {
      alert("AI 모드를 쓰려면 Hugging Face Space 주소를 먼저 입력해주세요.");
      return;
    }
    setProcessing(true);
    setResults([]);
    const out = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(
        aiMode
          ? `AI 서버 처리 중... (${i + 1}/${files.length}) — 서버가 잠들어 있었다면 첫 장은 1분 가까이 걸릴 수 있어요`
          : `처리 중... (${i + 1}/${files.length})`
      );
      const file = files[i];
      try {
        const blob = aiMode
          ? await processFileAI(file, xPct, yPct, wPct, hPct, quality, spaceUrl.trim())
          : await processFile(file, xPct, yPct, wPct, hPct, quality);
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const r = {
          name: baseName + "_clean.jpg",
          blob,
          url: URL.createObjectURL(blob),
          origUrl: URL.createObjectURL(file),
          origSize: file.size,
          newSize: blob.size,
        };
        out.push(r);
        setResults((prev) => [...prev, r]);
      } catch (e) {
        console.error(e);
        out.push({ error: true, name: file.name });
        setResults((prev) => [...prev, { error: true, name: file.name }]);
      }
    }
    setProgress(`완료: ${out.filter((r) => !r.error).length}/${files.length}장 처리됨`);
    setProcessing(false);
  }

  function handleReset() {
    setFiles([]); setResults([]); setCalibSrc(null); setCalibDims(null); setProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const labelStyle = { fontSize: 10, color: "#6e7681", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 };
  const cardStyle = { background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: 16, marginBottom: 14 };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20, maxWidth: 640, marginLeft: "auto", marginRight: "auto", width: "100%" }}>
      <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 16, lineHeight: 1.6 }}>
        소유자가 직접 올린 매물 사진에서 사이트 공통 워터마크를 지우고 JPEG로 내려받습니다. 워터마크가 항상 중앙에 있다는 전제로 같은 비율을 모든 사진에 적용해요. 처리는 브라우저 안에서만 일어나고 서버에는 저장되지 않습니다.
      </div>

      <div style={cardStyle}>
        <div style={labelStyle}>01 · 사진 선택</div>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const fl = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
            if (fl.length) handleFiles(fl.slice(0, 1));
          }}
          style={{ border: `1.5px dashed ${dragOver ? "#f48c06" : "#30363d"}`, borderRadius: 8, padding: "26px 14px", textAlign: "center", cursor: "pointer", background: dragOver ? "#1a1206" : "transparent" }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3", marginBottom: 4 }}>탭하여 사진 선택</div>
          <div style={{ fontSize: 11, color: "#6e7681" }}>한 번에 한 장씩 처리됩니다 (JPEG/PNG)</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(Array.from(e.target.files || []).slice(0, 1))}
        />
        {files.length > 0 && (
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#f48c06", marginTop: 10, textAlign: "center" }}>
            {files[0].name}
          </div>
        )}
      </div>

      {calibSrc && (
        <div style={cardStyle}>
          <div style={labelStyle}>02 · 워터마크 위치 탭하기</div>
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = (e.clientX - rect.left) / rect.width;
              const py = (e.clientY - rect.top) / rect.height;
              setXPct(Math.min(1, Math.max(0, px)));
              setYPct(Math.min(1, Math.max(0, py)));
            }}
            style={{ position: "relative", width: "100%", background: "#000", borderRadius: 6, overflow: "hidden", marginBottom: 8, cursor: "crosshair" }}
          >
            <img src={calibSrc} alt="미리보기" onLoad={(e) => setCalibDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })} style={{ display: "block", width: "100%", height: "auto" }} />
            <div style={{ position: "absolute", left: `${xPct * 100}%`, top: `${yPct * 100}%`, transform: "translate(-50%,-50%)", width: `${wPct * 100}%`, height: `${hPct * 100}%`, pointerEvents: "none" }}>
              <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 6, fontFamily: "monospace", fontSize: 11, color: "#f48c06", background: "rgba(0,0,0,0.65)", padding: "2px 8px", borderRadius: 3, whiteSpace: "nowrap" }}>
                {calibDims ? `${Math.round(calibDims.w * wPct)} × ${Math.round(calibDims.h * hPct)} px` : "..."}
              </div>
              {["tl", "tr", "bl", "br"].map((pos) => (
                <div key={pos} style={{
                  position: "absolute", width: 16, height: 16,
                  top: pos[0] === "t" ? 0 : "auto", bottom: pos[0] === "b" ? 0 : "auto",
                  left: pos[1] === "l" ? 0 : "auto", right: pos[1] === "r" ? 0 : "auto",
                  borderTop: pos[0] === "t" ? "2px solid #f48c06" : "none",
                  borderBottom: pos[0] === "b" ? "2px solid #f48c06" : "none",
                  borderLeft: pos[1] === "l" ? "2px solid #f48c06" : "none",
                  borderRight: pos[1] === "r" ? "2px solid #f48c06" : "none",
                }} />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#6e7681", marginBottom: 16 }}>사진에서 워터마크가 있는 자리를 탭하면 박스가 그 자리로 옮겨가요. 정중앙이 아니어도 괜찮아요.</div>

          {[
            { label: "가로 위치", value: xPct, set: setXPct, min: 0, max: 100, fmt: (v) => Math.round(v * 100) + "%" },
            { label: "세로 위치", value: yPct, set: setYPct, min: 0, max: 100, fmt: (v) => Math.round(v * 100) + "%" },
            { label: "가로 크기", value: wPct, set: setWPct, min: 5, max: 70, fmt: (v) => Math.round(v * 100) + "%" },
            { label: "세로 크기", value: hPct, set: setHPct, min: 2, max: 70, fmt: (v) => Math.round(v * 100) + "%" },
            { label: "JPEG 품질", value: quality, set: setQuality, min: 50, max: 100, fmt: (v) => Math.round(v * 100) + "%" },
          ].map((f) => (
            <div key={f.label} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#e6edf3" }}>{f.label}</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#f48c06" }}>{f.fmt(f.value)}</span>
              </div>
              <input
                type="range"
                min={f.min}
                max={f.max}
                value={Math.round(f.value * 100)}
                onChange={(e) => f.set(Number(e.target.value) / 100)}
                style={{ width: "100%" }}
              />
            </div>
          ))}
        </div>
      )}

      {calibSrc && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: aiMode ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: 13, color: "#e6edf3", marginBottom: 2 }}>AI 모드 (LaMa, 서버 처리)</div>
              <div style={{ fontSize: 11, color: "#6e7681" }}>복잡한 배경에서 더 자연스럽지만, 느리고 별도 서버가 필요해요</div>
            </div>
            <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, flexShrink: 0, marginLeft: 12 }}>
              <input type="checkbox" checked={aiMode} onChange={(e) => setAiMode(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: "absolute", inset: 0, background: aiMode ? "#f48c06" : "#30363d", borderRadius: 12, cursor: "pointer", transition: "background 0.15s" }}>
                <span style={{ position: "absolute", top: 3, left: aiMode ? 23 : 3, width: 18, height: 18, background: "#fff", borderRadius: "50%", transition: "left 0.15s" }} />
              </span>
            </label>
          </div>
          {aiMode && (
            <div>
              <div style={{ fontSize: 11, color: "#6e7681", marginBottom: 6 }}>Hugging Face Space 주소</div>
              <input
                value={spaceUrl}
                onChange={(e) => updateSpaceUrl(e.target.value)}
                placeholder="https://your-username-verita-watermark-inpaint.hf.space"
                style={{ width: "100%", boxSizing: "border-box", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 10px", color: "#e6edf3", fontSize: 12, outline: "none", fontFamily: "monospace" }}
              />
            </div>
          )}
        </div>
      )}

      {calibSrc && (
        <button
          onClick={handleApply}
          disabled={processing}
          style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700, cursor: processing ? "not-allowed" : "pointer", background: processing ? "#21262d" : "linear-gradient(135deg,#e85d04,#f48c06)", color: "#fff", marginBottom: 6 }}
        >
          {processing ? "처리 중..." : "전체 사진에 적용"}
        </button>
      )}
      {progress && <div style={{ fontFamily: "monospace", fontSize: 12, color: "#6e7681", textAlign: "center", marginBottom: 14 }}>{progress}</div>}

      {results.length > 0 && (
        <div style={cardStyle}>
          <div style={labelStyle}>결과</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
            {results.map((r, i) =>
              r.error ? (
                <div key={i} style={{ border: "1px solid #7f1d1d", borderRadius: 8, padding: 10, fontSize: 11, color: "#fca5a5", background: "#2d0f0f" }}>{r.name} — 처리 실패</div>
              ) : (
                <ResultCard key={i} r={r} />
              )
            )}
          </div>
        </div>
      )}

      {(files.length > 0 || results.length > 0) && (
        <button onClick={handleReset} style={{ width: "100%", background: "none", border: "1px solid #30363d", color: "#8b949e", borderRadius: 6, padding: "8px 0", fontSize: 12, cursor: "pointer" }}>
          초기화
        </button>
      )}
    </div>
  );
}
