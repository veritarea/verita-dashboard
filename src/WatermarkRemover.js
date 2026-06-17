import { useState, useRef } from "react";
import JSZip from "jszip";

// ── 픽셀 처리 유틸 (순수 함수, React 상태 없음) ──

function clampInt(min, max, v) {
  return v < min ? min : v > max ? max : v;
}

function diffuseSmallRegion(data, w, h, bx0, by0, bw, bh, iterations) {
  const n = bw * bh;
  let cur = new Float32Array(n * 3);
  let nxt = new Float32Array(n * 3);
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const idx = ((by0 + j) * w + (bx0 + i)) * 4;
      const k = (j * bw + i) * 3;
      cur[k] = data[idx]; cur[k + 1] = data[idx + 1]; cur[k + 2] = data[idx + 2];
    }
  }
  function outside(x, y, c) {
    const gx = clampInt(0, w - 1, bx0 + x);
    const gy = clampInt(0, h - 1, by0 + y);
    return data[(gy * w + gx) * 4 + c];
  }
  for (let it = 0; it < iterations; it++) {
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const k = (j * bw + i) * 3;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          sum += i - 1 >= 0 ? cur[(j * bw + (i - 1)) * 3 + c] : outside(i - 1, j, c);
          sum += i + 1 < bw ? cur[(j * bw + (i + 1)) * 3 + c] : outside(i + 1, j, c);
          sum += j - 1 >= 0 ? cur[((j - 1) * bw + i) * 3 + c] : outside(i, j - 1, c);
          sum += j + 1 < bh ? cur[((j + 1) * bw + i) * 3 + c] : outside(i, j + 1, c);
          nxt[k + c] = sum / 4;
        }
      }
    }
    const tmp = cur; cur = nxt; nxt = tmp;
  }
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const idx = ((by0 + j) * w + (bx0 + i)) * 4;
      const k = (j * bw + i) * 3;
      data[idx] = cur[k]; data[idx + 1] = cur[k + 1]; data[idx + 2] = cur[k + 2]; data[idx + 3] = 255;
    }
  }
}

function meanColor3(data) {
  let r = 0, g = 0, b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return [r / n, g / n, b / n];
}

function inpaintWatermark(canvas, ctx, x0, y0, boxW, boxH, strength) {
  const W = canvas.width, H = canvas.height;
  const originalBox = ctx.getImageData(x0, y0, boxW, boxH);

  const padX = Math.round(boxW * 0.8), padY = Math.round(boxH * 0.8);
  const ex0 = clampInt(0, W, x0 - padX), ey0 = clampInt(0, H, y0 - padY);
  const ex1 = clampInt(0, W, x0 + boxW + padX), ey1 = clampInt(0, H, y0 + boxH + padY);
  const extW = ex1 - ex0, extH = ey1 - ey0;

  const targetLong = 140;
  const scale = Math.min(1, targetLong / Math.max(extW, extH));
  const smallW = Math.max(8, Math.round(extW * scale));
  const smallH = Math.max(8, Math.round(extH * scale));

  const smallCanvas = document.createElement("canvas");
  smallCanvas.width = smallW; smallCanvas.height = smallH;
  const sctx = smallCanvas.getContext("2d");
  sctx.drawImage(canvas, ex0, ey0, extW, extH, 0, 0, smallW, smallH);
  const smallImgData = sctx.getImageData(0, 0, smallW, smallH);

  let sbx0 = clampInt(0, smallW - 1, Math.round((x0 - ex0) * scale));
  let sby0 = clampInt(0, smallH - 1, Math.round((y0 - ey0) * scale));
  let sbw = Math.min(Math.max(1, Math.round(boxW * scale)), smallW - sbx0);
  let sbh = Math.min(Math.max(1, Math.round(boxH * scale)), smallH - sby0);

  diffuseSmallRegion(smallImgData.data, smallW, smallH, sbx0, sby0, sbw, sbh, 120);
  sctx.putImageData(smallImgData, 0, 0);

  const fbCanvas = document.createElement("canvas");
  fbCanvas.width = boxW; fbCanvas.height = boxH;
  const fctx = fbCanvas.getContext("2d");
  fctx.drawImage(smallCanvas, sbx0, sby0, sbw, sbh, 0, 0, boxW, boxH);
  const fbData = fctx.getImageData(0, 0, boxW, boxH);

  const candidates = [];
  if (x0 - boxW >= 0) candidates.push([x0 - boxW, y0]);
  if (x0 + boxW * 2 <= W) candidates.push([x0 + boxW, y0]);
  if (y0 - boxH >= 0) candidates.push([x0, y0 - boxH]);
  if (y0 + boxH * 2 <= H) candidates.push([x0, y0 + boxH]);

  const out = new Uint8ClampedArray(boxW * boxH * 4);
  if (candidates.length === 0 || strength <= 0) {
    out.set(fbData.data);
  } else {
    const fbMean = meanColor3(fbData.data);
    let bestPatch = null, bestMean = null, bestDist = Infinity;
    candidates.forEach(([sx, sy]) => {
      const patch = ctx.getImageData(sx, sy, boxW, boxH);
      const m = meanColor3(patch.data);
      const dist = (m[0] - fbMean[0]) ** 2 + (m[1] - fbMean[1]) ** 2 + (m[2] - fbMean[2]) ** 2;
      if (dist < bestDist) { bestDist = dist; bestPatch = patch; bestMean = m; }
    });
    const shift = [fbMean[0] - bestMean[0], fbMean[1] - bestMean[1], fbMean[2] - bestMean[2]];
    const pd = bestPatch.data;
    for (let i = 0; i < out.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const cloned = pd[i + c] + shift[c];
        out[i + c] = fbData.data[i + c] * (1 - strength) + cloned * strength;
      }
      out[i + 3] = 255;
    }
  }

  const half = Math.floor(Math.min(boxW, boxH) / 2);
  let fw = Math.min(half - 1, Math.round(Math.min(boxW, boxH) * 0.18));
  if (fw < 1) fw = 0;
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const dx = Math.min(x, boxW - 1 - x);
      const dy = Math.min(y, boxH - 1 - y);
      const d = Math.min(dx, dy);
      const alpha = fw <= 0 ? 1 : Math.min(1, d / fw);
      const idx = (y * boxW + x) * 4;
      for (let c = 0; c < 3; c++) {
        originalBox.data[idx + c] = originalBox.data[idx + c] * (1 - alpha) + out[idx + c] * alpha;
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

async function processFile(file, xPct, yPct, wPct, hPct, strength, quality) {
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

  inpaintWatermark(canvas, ctx, x0, y0, boxW, boxH, strength);

  return await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}

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
  const [xPct, setXPct] = useState(0.5);
  const [yPct, setYPct] = useState(0.5);
  const [wPct, setWPct] = useState(0.25);
  const [hPct, setHPct] = useState(0.12);
  const [strength, setStrength] = useState(0.7);
  const [quality, setQuality] = useState(0.92);
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

  async function handleApply() {
    if (files.length === 0) return;
    setProcessing(true);
    setResults([]);
    const out = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`처리 중... (${i + 1}/${files.length})`);
      const file = files[i];
      try {
        const blob = await processFile(file, xPct, yPct, wPct, hPct, strength, quality);
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

  async function handleZip() {
    const ok = results.filter((r) => !r.error);
    if (ok.length === 0) return;
    const zip = new JSZip();
    ok.forEach((r) => zip.file(r.name, r.blob));
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url; a.download = "watermark_removed.zip";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function handleReset() {
    setFiles([]); setResults([]); setCalibSrc(null); setCalibDims(null); setProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const labelStyle = { fontSize: 10, color: "#6e7681", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 };
  const cardStyle = { background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: 16, marginBottom: 14 };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20, maxWidth: 640 }}>
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
            if (fl.length) handleFiles(fl);
          }}
          style={{ border: `1.5px dashed ${dragOver ? "#f48c06" : "#30363d"}`, borderRadius: 8, padding: "26px 14px", textAlign: "center", cursor: "pointer", background: dragOver ? "#1a1206" : "transparent" }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3", marginBottom: 4 }}>탭하여 사진 선택</div>
          <div style={{ fontSize: 11, color: "#6e7681" }}>여러 장 한 번에 선택 가능 (JPEG/PNG)</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleFiles(Array.from(e.target.files || []))}
        />
        {files.length > 0 && (
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#f48c06", marginTop: 10, textAlign: "center" }}>
            {files.length}장 선택됨
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
            { label: "세로 크기", value: hPct, set: setHPct, min: 5, max: 70, fmt: (v) => Math.round(v * 100) + "%" },
            { label: "텍스처 복원 강도", value: strength, set: setStrength, min: 0, max: 100, fmt: (v) => v.toFixed(2) },
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={labelStyle}>결과</div>
            {results.some((r) => !r.error) && (
              <button onClick={handleZip} style={{ background: "transparent", border: "1px solid #30363d", color: "#8b949e", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                ZIP 전체 다운로드
              </button>
            )}
          </div>
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
