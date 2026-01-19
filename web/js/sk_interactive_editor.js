import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { Icons } from "./common/icons.js";

// --- 样式定义 ---
const style = document.createElement('style');
style.innerHTML = `
    .sk-ie-mask { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 10001; display: none; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; overflow: auto; }
    .sk-ie-editor-container { position: relative; background: #111; border: 2px solid #444; box-shadow: 0 0 50px rgba(0,0,0,0.8); display: flex; flex-direction: column; }
    .sk-ie-canvas-wrapper { position: relative; overflow: hidden; background: #000; cursor: none; }
    .sk-ie-canvas-wrapper canvas { position: absolute; top: 0; left: 0; pointer-events: none; }
    .sk-ie-canvas-wrapper #sk_ie_canvas_points { pointer-events: auto; }
    .sk-ie-toolbar { padding: 15px; background: #222; display: flex; gap: 20px; align-items: center; border-bottom: 1px solid #333; color: white; }
    .sk-ie-group { display: flex; align-items: center; gap: 8px; border-right: 1px solid #444; padding-right: 15px; }
    .sk-ie-btn { padding: 6px 12px; cursor: pointer; border-radius: 4px; border: 1px solid #555; background: #333; color: #eee; font-weight: bold; font-size: 13px; }
    .sk-ie-btn:hover { background: #444; border-color: #777; }
    .sk-ie-btn.active { background: #3a6ea5; border-color: #4a90e2; }
    .sk-ie-btn.save { background: #28a745; border-color: #34ce57; }
    .sk-ie-btn.clear { background: #dc3545; border-color: #ff4d4d; }
    .sk-ie-btn.close { background: #6c757d; border-color: #888; }
    .sk-ie-status { position: absolute; bottom: 10px; right: 15px; color: #888; font-size: 11px; pointer-events: none; }
    .sk-ie-color-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
    .sk-ie-color-dot.active { border-color: white; transform: scale(1.2); }
`;
document.head.appendChild(style);

app.registerExtension({
    name: "SK.InteractiveEditor",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SK_InteractiveEditor") {
            
            // 页面加载时恢复数据
            nodeType.prototype.onConfigure = function(config) {
                if (this.widgets) {
                    const pw = this.widgets.find(w => w.name === "points_data");
                    const mw = this.widgets.find(w => w.name === "mask_data");
                    const imgW = this.widgets.find(w => w.name === "image");

                    // 优先从序列化的 config 或 widget value 中恢复
                    let pData = pw ? pw.value : null;
                    if (!pData && this.properties) pData = this.properties["points_data"];
                    
                    if (pData) {
                        try {
                            const parsed = JSON.parse(pData);
                            // 判断标准：只要有任何一个坐标值 > 1.0，就认为是像素坐标
                            const isPixel = parsed.length > 0 && parsed.some(p => p.x > 1.0 || p.y > 1.0);
                            if (isPixel) {
                                this._pending_pixel_points = parsed;
                            } else {
                                this.points = parsed;
                            }
                        } catch (e) {
                            console.error("[SK-LoRA] [System] 配置过程中解析 points_data 失败:", e);
                            this.points = [];
                        }
                    }

                    if (mw && mw.value) {
                        this.setProperty("mask_data", mw.value);
                    }

                    // 恢复图片显示
                    if (imgW && imgW.value) {
                        this.loadNodeImage(imgW.value);
                    }
                }
                this.syncAll();
            };

            nodeType.prototype.onNodeCreated = function() {
                this.points = [];
                this.img = null;
                this.mask_img = null; 
                this.img_name = "";
                this.size = [400, 500];

                // 隐藏状态数据 Widget
                const pWidget = this.widgets.find(w => w.name === "points_data");
                if (pWidget) { pWidget.type = "text"; }
                
                const mWidget = this.widgets.find(w => w.name === "mask_data");
                if (mWidget) { mWidget.type = "text"; }

                const imageWidget = this.widgets.find(w => w.name === "image");
                if (imageWidget) {
                    const self = this;
                    const orgCallback = imageWidget.callback;
                    imageWidget.callback = function(v) {
                        if (orgCallback) orgCallback.apply(this, arguments);
                        
                        // 如果图片路径确实发生了变化，则清空旧数据
                        if (v && v !== self.img_name) {
                            self.points = [];
                            self.mask_img = null;
                            
                            const mw = self.widgets.find(w => w.name === "mask_data");
                            if (mw) mw.value = "";
                            self.setProperty("mask_data", "");
                            
                            const pw = self.widgets.find(w => w.name === "points_data");
                            if (pw) pw.value = "[]";
                            self.setProperty("points_data", "[]");
                            
                            self.img_name = v;
                            self.loadNodeImage(v);
                            self.syncAll();
                        }
                    };
                }
                this.addWidget("button", "🖼️ Open Editor", null, () => this.openEditor());
                this.addWidget("button", "🗑️ Clear All", null, () => {
                    this.points = [];
                    const mw = this.widgets.find(w => w.name === "mask_data");
                    if (mw) {
                        mw.value = "";
                        this.setProperty("mask_data", "");
                    }
                    this.mask_img = null;
                    this.syncAll();
                });
            };

            // 深度刷新逻辑
            nodeType.prototype.loadNodeImage = function(name) {
                if (!name) return;
                const url = api.apiURL(`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`);
                const img = new Image();
                img.src = url;
                img.onload = () => { 
                    this.img = img; 
                    this.imgs = [img]; 
                    
                    if (this._pending_pixel_points && img.naturalWidth > 0) {
                        this.points = this._pending_pixel_points.map(p => ({
                            x: p.x / img.naturalWidth,
                            y: p.y / img.naturalHeight
                        }));
                        delete this._pending_pixel_points;
                    }

                    this.setDirtyCanvas(true);
                    if (app.canvas && app.canvas.graph_canvas) app.canvas.graph_canvas.setDirty(true, true);
                };
            };

            // 数据同步逻辑
            nodeType.prototype.syncAll = function() {
                const pw = this.widgets.find(w => w.name === "points_data");
                const mw = this.widgets.find(w => w.name === "mask_data");
                
                let pixelPoints = this.points || [];
                if (this.img && this.img.naturalWidth > 0) {
                    pixelPoints = pixelPoints.map(p => ({
                        x: Math.round(p.x * this.img.naturalWidth),
                        y: Math.round(p.y * this.img.naturalHeight)
                    }));
                }
                const pointsJson = JSON.stringify(pixelPoints);
                const maskData = (mw ? mw.value : null) || this.properties["mask_data"] || "";
                
                if (pw) {
                    pw.value = pointsJson;
                    this.setProperty("points_data", pointsJson);
                    if (pw.callback) pw.callback(pointsJson);
                }

                if (mw) {
                    mw.value = maskData;
                    this.setProperty("mask_data", maskData);
                    if (mw.callback) mw.callback(maskData);
                }

                if (this.widgets && this.widgets_values) {
                    const pwIdx = this.widgets.findIndex(w => w.name === "points_data");
                    if (pwIdx !== -1) this.widgets_values[pwIdx] = pointsJson;
                    
                    const mwIdx = this.widgets.findIndex(w => w.name === "mask_data");
                    if (mwIdx !== -1) this.widgets_values[mwIdx] = maskData;
                }

                if (app.graph) {
                    app.graph._version++; 
                    if (app.graph.setDirtyCanvas) app.graph.setDirtyCanvas(true, true);
                }
                if (app.canvas && app.canvas.setDirty) app.canvas.setDirty(true, true);

                if (maskData && maskData.startsWith("data:image")) {
                    if (!this.mask_img || this.mask_img._base64 !== maskData) {
                        const mImg = new Image();
                        mImg.onload = () => {
                            this.mask_img = mImg;
                            this.mask_img._base64 = maskData;
                            this.setDirtyCanvas(true);
                        };
                        mImg.src = maskData;
                    }
                } else {
                    this.mask_img = null;
                }

                this.setDirtyCanvas(true);
            };

            nodeType.prototype.getPreviewRect = function() {
                let yOffset = 40;
                if (this.widgets) {
                    const visible = this.widgets.filter(w => w.type !== "hidden");
                    const last = visible[visible.length - 1];
                    if (last && last.last_y !== undefined) {
                        yOffset = last.last_y + (last.computeSize ? last.computeSize(this.size[0])[1] : 24);
                    }
                }
                yOffset += 15;
                const margin = 20;
                const area = { x: margin/2, y: yOffset, w: this.size[0]-margin, h: this.size[1]-yOffset-margin };
                if (!this.img || !this.img.complete) return area;
                const r = Math.min(area.w / this.img.width, area.h / this.img.height);
                return { 
                    x: area.x + (area.w - this.img.width * r) / 2, 
                    y: area.y + (area.h - this.img.height * r) / 2, 
                    w: this.img.width * r, h: this.img.height * r 
                };
            };

            nodeType.prototype.onDrawForeground = function(ctx) {
                if (this.flags.collapsed || !this.img) return;
                
                const rect = this.getPreviewRect();
                ctx.save();
                this.points.forEach((p, i) => {
                    const px = rect.x + p.x * rect.w, py = rect.y + p.y * rect.h;
                    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI*2);
                    ctx.fillStyle = "#FF0000"; ctx.fill();
                    ctx.strokeStyle = "white"; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.fillStyle = "white"; ctx.font = "bold 10px Arial";
                    ctx.textAlign = "center"; ctx.textBaseline = "middle"; 
                    ctx.fillText(i+1, px, py);

                    const hx = px + 9, hy = py - 9;
                    ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI*2);
                    ctx.fillStyle = "#333"; ctx.fill();
                    ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(hx-3, hy-3); ctx.lineTo(hx+3, hy+3); 
                    ctx.moveTo(hx+3, hy-3); ctx.lineTo(hx-3, hy+3);
                    ctx.strokeStyle = "white"; ctx.stroke();
                });
                
                 if (this.img && this.img.naturalWidth > 0) {
                     const sizeText = `${this.img.naturalWidth} × ${this.img.naturalHeight}`;
                     ctx.font = "12px Arial";
                     ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                     ctx.textAlign = "right";
                     ctx.textBaseline = "bottom";
                     const margin = 20;
                     const areaBottom = this.size[1] - margin/2;
                     const areaRight = this.size[0] - margin/2;
                     ctx.fillText(sizeText, areaRight, areaBottom);
                 }

                 ctx.restore();
            };

            nodeType.prototype.onDrawBackground = function(ctx) {
                if (this.flags.collapsed || !this.img) return;
                
                const rect = this.getPreviewRect();
                ctx.drawImage(this.img, rect.x, rect.y, rect.w, rect.h);
                if (this.mask_img) {
                    ctx.save();
                    ctx.globalAlpha = 0.7;
                    ctx.drawImage(this.mask_img, rect.x, rect.y, rect.w, rect.h);
                    ctx.restore();
                }
            };

            nodeType.prototype.onMouseDown = function(e, localPos) {
                if (app.canvas && app.canvas.graph_canvas && app.canvas.graph_canvas.is_nodes2_0) return;

                const rect = this.getPreviewRect();
                const x = (localPos[0] - rect.x) / rect.w, y = (localPos[1] - rect.y) / rect.h;
                if (x < 0 || x > 1 || y < 0 || y > 1) return;

                const delIdx = this.points.findIndex(p => {
                    const hx = rect.x + p.x * rect.w + 9, hy = rect.y + p.y * rect.h - 9;
                    return Math.hypot(localPos[0] - hx, localPos[1] - hy) < 8;
                });

                if (e.button === 2 || delIdx !== -1) {
                    const target = e.button === 2 ? this.points.findIndex(p => Math.hypot(p.x-x, p.y-y) < (20/rect.w)) : delIdx;
                    if (target !== -1) { this.points.splice(target, 1); this.syncAll(); return true; }
                }

                if (e.button === 0) {
                    const hit = this.points.findIndex(p => Math.hypot(p.x-x, p.y-y) < (15/rect.w));
                    if (hit !== -1) { this.draggingPoint = hit; } 
                    else { this.points.push({x, y}); this.syncAll(); }
                    return true;
                }
            };

             nodeType.prototype.onMouseMove = function(e, localPos) {
                  if (app.canvas && app.canvas.canvas) {
                      const canvas = app.canvas.canvas;
                      canvas.style.cursor = "crosshair";
                  }
  
                  const is_nodes2_0 = app.canvas.graph_canvas && app.canvas.graph_canvas.is_nodes2_0;
                  if (is_nodes2_0) return;
                 
                 if (this.draggingPoint !== null) {
                     const rect = this.getPreviewRect();
                     this.points[this.draggingPoint].x = Math.max(0, Math.min(1, (localPos[0] - rect.x) / rect.w));
                     this.points[this.draggingPoint].y = Math.max(0, Math.min(1, (localPos[1] - rect.y) / rect.h));
                     this.syncAll();
                 }
             };

            nodeType.prototype.onMouseUp = function() { this.draggingPoint = null; };

            // --- 弹窗编辑器 ---
            nodeType.prototype.openEditor = function() {
                const imgW = this.widgets.find(w => w.name === "image");
                if (!imgW || !imgW.value) return alert("Please upload an image first.");
                
                let mask = document.getElementById("sk_ie_mask") || document.createElement("div");
                if (!mask.id) { mask.id = "sk_ie_mask"; mask.className = "sk-ie-mask"; document.body.appendChild(mask); }
                
                mask.innerHTML = `
                    <div class="sk-ie-editor">
                        <style>
                            .sk-ie-editor { 
                                position: relative;
                                width: fit-content; max-width: 98vw; max-height: 98vh;
                                background:#1e1e1e; border:2px solid #555; display:flex; flex-direction:column; z-index:10000; 
                                box-shadow:0 0 20px rgba(0,0,0,0.8); border-radius: 8px; overflow: auto;
                                margin: auto;
                            }
                            .sk-ie-toolbar { 
                                display:flex; gap:10px; padding:10px 15px; background:#2b2b2b; border-bottom:1px solid #444; 
                                align-items:center; flex-wrap: nowrap; flex-shrink: 0;
                                min-width: max-content; user-select: none;
                            }
                            .sk-ie-btn { 
                                padding:6px 12px; border:1px solid #555; background:#333; color:#eee; cursor:pointer; 
                                border-radius:4px; white-space: nowrap; font-size: 13px; transition: all 0.2s;
                                flex-shrink: 0; font-weight: bold;
                            }
                            .sk-ie-btn.active { background:#4a4a4a; border-color:#00f2ff; box-shadow: 0 0 5px rgba(0,242,255,0.3); }
                            .sk-ie-btn:hover { background:#444; border-color: #777; }
                            .sk-ie-btn.save { background:#2e7d32; border-color:#4caf50; margin-left: 10px; }
                            .sk-ie-btn.close { background:#c62828; border-color:#ef5350; }
                            .sk-ie-group { 
                                display:flex; align-items:center; gap:8px; padding-right:15px; border-right: 1px solid #444; flex-shrink: 0;
                            }
                            .sk-ie-group:last-of-type { border-right: none; }
                            .sk-ie-canvas-wrapper { 
                                flex: 0 0 auto; background:#111; position:relative; overflow:hidden; 
                                display:flex; justify-content:center; align-items:center; cursor:none; 
                            }
                            .sk-ie-canvas-wrapper canvas { position:absolute; }
                            .sk-ie-color-dot { width:20px; height:20px; border-radius:50%; border:2px solid #555; cursor:pointer; }
                            .sk-ie-color-dot.active { border-color:#fff; transform:scale(1.2); }
                            .sk-ie-status { position: absolute; bottom: 10px; right: 10px; padding: 4px 8px; background: rgba(0,0,0,0.5); color: #aaa; font-size: 11px; border-radius: 4px; pointer-events: none; z-index: 101; }
                            .sk-ie-coords { position:absolute; top:10px; left:10px; pointer-events:none; z-index:100; font-family:monospace; color:#0f0; text-shadow:1px 1px 1px #000; font-size:14px; background:rgba(0,0,0,0.5); padding:5px; border-radius:4px; max-height: 90%; overflow: hidden; }
                        </style>
                        <div class="sk-ie-toolbar">
                            <div class="sk-ie-group">
                                <button id="sk_ie_tool_point" class="sk-ie-btn active">${Icons.get('map_pin', '', 14)} Point</button>
                                <button id="sk_ie_tool_brush" class="sk-ie-btn">${Icons.get('brush', '', 14)} Brush</button>
                                <button id="sk_ie_tool_eraser" class="sk-ie-btn">${Icons.get('broom', '', 14)} Eraser</button>
                            </div>
                            <div class="sk-ie-group">
                                <span>Size:</span>
                                <input type="range" id="sk_ie_brush_size" min="1" max="100" value="20" style="width:80px">
                                <span id="sk_ie_size_val">20</span>
                            </div>
                            <div class="sk-ie-group" id="sk_ie_color_group">
                                <div class="sk-ie-color-dot active" style="background:#000" data-color="#000"></div>
                                <div class="sk-ie-color-dot" style="background:#fff" data-color="#fff"></div>
                                <div class="sk-ie-color-dot" style="background:#f00" data-color="#f00"></div>
                                <div class="sk-ie-color-dot" style="background:#0f0" data-color="#0f0"></div>
                                <div class="sk-ie-color-dot" style="background:#00f" data-color="#00f"></div>
                            </div>
                            <div class="sk-ie-group">
                                <button id="sk_ie_clear_doodle" class="sk-ie-btn">Clear Doodle</button>
                                <button id="sk_ie_clear_points" class="sk-ie-btn">Clear Points</button>
                            </div>
                            <div style="flex:1"></div>
                            <button id="sk_ie_save_btn" class="sk-ie-btn save">Save</button>
                            <button id="sk_ie_close_btn" class="sk-ie-btn close">Cancel</button>
                        </div>
                        <div class="sk-ie-canvas-wrapper" id="sk_ie_wrapper">
                            <div id="sk_ie_coords_list" class="sk-ie-coords"></div>
                            <canvas id="sk_ie_canvas_bg"></canvas>
                            <canvas id="sk_ie_canvas_doodle"></canvas>
                            <canvas id="sk_ie_canvas_points"></canvas>
                            <div class="sk-ie-status" id="sk_ie_status">Ready</div>
                        </div>
                    </div>
                `;
                mask.style.display = "flex";

                const wrapper = document.getElementById("sk_ie_wrapper");
                const bgC = document.getElementById("sk_ie_canvas_bg"), bgCtx = bgC.getContext("2d");
                const ddC = document.getElementById("sk_ie_canvas_doodle"), ddCtx = ddC.getContext("2d");
                ddC.style.opacity = "0.7";
                const ptC = document.getElementById("sk_ie_canvas_points"), ptCtx = ptC.getContext("2d");
                
                let currentMode = "point";
                let brushSize = 20;
                let brushColor = "#000";
                let tempPoints = JSON.parse(JSON.stringify(this.points));
                let isDrawing = false;
                let dragIdx = null;

                const editImg = new Image();
                let baseImage = imgW.value;
                
                editImg.src = api.apiURL(`/view?filename=${encodeURIComponent(baseImage)}&type=input&t=${Date.now()}`);
                editImg.onload = () => {
                    const editor = mask.querySelector(".sk-ie-editor");
                    const toolbar = mask.querySelector(".sk-ie-toolbar");
                    const status = mask.querySelector(".sk-ie-status");
                    
                    const toolbarH = toolbar ? toolbar.offsetHeight : 60;
                    const maxEditorH = window.innerHeight * 0.9;
                    const H_minus_h = maxEditorH - toolbarH; 
                    
                    const r = H_minus_h / editImg.naturalHeight;
                    let W = editImg.naturalWidth * r;
                    let H = H_minus_h;

                    const maxCanvasW = window.innerWidth * 0.9;
                    if (W > maxCanvasW) {
                        const r2 = maxCanvasW / W;
                        W *= r2;
                        H *= r2;
                    }
                    
                    [bgC, ddC, ptC].forEach(c => { 
                        c.width = W; c.height = H; 
                        c.style.width = W + "px";
                        c.style.height = H + "px";
                    });
                    wrapper.style.width = W + "px"; 
                    wrapper.style.height = H + "px"; 
                    
                    if (editor) {
                        editor.style.width = "";
                        editor.style.height = "";
                    }
                    
                    if (status) {
                        status.innerText = `Ready size: ${editImg.naturalWidth} × ${editImg.naturalHeight}`;
                    }
                    
                    bgCtx.drawImage(editImg, 0, 0, W, H);
                    
                    const existingMask = this.widgets.find(w => w.name === "mask_data")?.value;
                    if (existingMask && existingMask.startsWith("data:image")) {
                        const mImg = new Image();
                        mImg.onload = () => ddCtx.drawImage(mImg, 0, 0, W, H);
                        mImg.src = existingMask;
                    }
                    
                    const drawPoints = () => {
                        ptCtx.clearRect(0, 0, W, H);
                        
                        const coordsList = document.getElementById("sk_ie_coords_list");
                        if (coordsList) {
                            if (tempPoints.length === 0) {
                                coordsList.style.display = "none";
                            } else {
                                coordsList.style.display = "block";
                                coordsList.innerHTML = tempPoints.map((p, i) => {
                                    const rx = Math.round(p.x * editImg.naturalWidth);
                                    const ry = Math.round(p.y * editImg.naturalHeight);
                                    return `<div>Point ${i+1}: (${rx}, ${ry})</div>`;
                                }).join("");
                            }
                        }

                        tempPoints.forEach((p, i) => {
                            const px = p.x*W, py = p.y*H;
                            ptCtx.beginPath(); ptCtx.arc(px, py, 15, 0, Math.PI*2);
                            ptCtx.fillStyle = "red"; ptCtx.fill(); ptCtx.strokeStyle = "white"; ptCtx.lineWidth = 2; ptCtx.stroke();
                            ptCtx.fillStyle = "white"; ptCtx.font = "bold 14px Arial"; ptCtx.textAlign = "center"; ptCtx.fillText(i+1, px, py+5);
                            const hx = px+13, hy = py-13;
                            ptCtx.beginPath(); ptCtx.arc(hx, hy, 8, 0, Math.PI*2); ptCtx.fillStyle = "#333"; ptCtx.fill();
                            ptCtx.strokeStyle = "white"; ptCtx.lineWidth = 1; ptCtx.stroke();
                            ptCtx.beginPath(); ptCtx.moveTo(hx-4, hy-4); ptCtx.lineTo(hx+4, hy+4); ptCtx.moveTo(hx+4, hy-4); ptCtx.lineTo(hx-4, hy+4);
                            ptCtx.strokeStyle = "white"; ptCtx.stroke();
                        });
                        
                        if (mousePos) {
                            ptCtx.save();
                            if (currentMode === "point") {
                                ptCtx.strokeStyle = "white"; ptCtx.lineWidth = 1;
                                ptCtx.beginPath();
                                ptCtx.moveTo(mousePos.x - 10, mousePos.y); ptCtx.lineTo(mousePos.x + 10, mousePos.y);
                                ptCtx.moveTo(mousePos.x, mousePos.y - 10); ptCtx.lineTo(mousePos.x, mousePos.y + 10);
                                ptCtx.stroke();
                            } else {
                                ptCtx.beginPath();
                                ptCtx.arc(mousePos.x, mousePos.y, brushSize / 2, 0, Math.PI * 2);
                                ptCtx.strokeStyle = "white"; ptCtx.lineWidth = 1; ptCtx.stroke();
                                if (currentMode === "eraser") {
                                    ptCtx.setLineDash([2, 2]);
                                    ptCtx.stroke();
                                }
                            }
                            ptCtx.restore();
                        }
                    };
                    
                    let mousePos = null;
                    drawPoints();

                    ptC.onmouseenter = () => wrapper.style.cursor = "none";
                    ptC.onmouseleave = () => { mousePos = null; drawPoints(); };

                    ptC.onmousedown = (e) => {
                        const b = ptC.getBoundingClientRect(), x = (e.clientX-b.left)/W, y = (e.clientY-b.top)/H;
                        if (currentMode === "point") {
                            const delIdx = tempPoints.findIndex(p => Math.hypot((e.clientX-b.left)-(p.x*W+13), (e.clientY-b.top)-(p.y*H-13)) < 12);
                            if (e.button === 2 || delIdx !== -1) {
                                const target = e.button === 2 ? tempPoints.findIndex(p => Math.hypot(p.x-x, p.y-y) < (25/W)) : delIdx;
                                if (target !== -1) { tempPoints.splice(target, 1); drawPoints(); }
                                return;
                            }
                            const hit = tempPoints.findIndex(p => Math.hypot(p.x-x, p.y-y) < (25/W));
                            if (hit !== -1) dragIdx = hit; else { tempPoints.push({x,y}); drawPoints(); }
                        } else {
                            isDrawing = true;
                            ddCtx.save();
                            ddCtx.globalAlpha = 0.7;
                            ddCtx.beginPath();
                            ddCtx.moveTo(e.clientX-b.left, e.clientY-b.top);
                        }
                    };

                    ptC.onmousemove = (e) => {
                        const b = ptC.getBoundingClientRect();
                        const mx = e.clientX-b.left, my = e.clientY-b.top;
                        mousePos = { x: mx, y: my };
                        
                        if (isDrawing) {
                            ddCtx.globalCompositeOperation = currentMode === "eraser" ? "destination-out" : "source-over";
                            ddCtx.strokeStyle = brushColor; ddCtx.lineWidth = brushSize; ddCtx.lineCap = "round";
                            ddCtx.lineTo(mx, my); ddCtx.stroke();
                        } else if (dragIdx !== null) {
                            tempPoints[dragIdx].x = Math.max(0, Math.min(1, mx/W));
                            tempPoints[dragIdx].y = Math.max(0, Math.min(1, my/H));
                        }
                        drawPoints();
                    };

                    ptC.onmouseup = () => { 
                        if (isDrawing) ddCtx.restore();
                        isDrawing = false; dragIdx = null; 
                    };
                    ptC.oncontextmenu = (e) => e.preventDefault();

                    document.getElementById("sk_ie_tool_brush").onclick = () => { currentMode = "brush"; updateTools(); drawPoints(); };
                    document.getElementById("sk_ie_tool_eraser").onclick = () => { currentMode = "eraser"; updateTools(); drawPoints(); };
                    document.getElementById("sk_ie_tool_point").onclick = () => { currentMode = "point"; updateTools(); drawPoints(); };
                    document.getElementById("sk_ie_brush_size").oninput = (e) => { brushSize = e.target.value; document.getElementById("sk_ie_size_val").innerText = brushSize; drawPoints(); };
                    document.querySelectorAll(".sk-ie-color-dot").forEach(dot => {
                        dot.onclick = () => {
                            brushColor = dot.dataset.color;
                            document.querySelectorAll(".sk-ie-color-dot").forEach(d => d.classList.remove("active"));
                            dot.classList.add("active");
                            currentMode = "brush"; updateTools(); drawPoints();
                        };
                    });
                    document.getElementById("sk_ie_clear_doodle").onclick = () => { ddCtx.clearRect(0, 0, W, H); };
                    document.getElementById("sk_ie_clear_points").onclick = () => { tempPoints = []; drawPoints(); };
                    
                    const updateTools = () => {
                        ["sk_ie_tool_brush", "sk_ie_tool_eraser", "sk_ie_tool_point"].forEach(id => document.getElementById(id).classList.remove("active"));
                        document.getElementById(`sk_ie_tool_${currentMode}`).classList.add("active");
                    };

                    document.getElementById("sk_ie_close_btn").onclick = () => mask.style.display = "none";
                    
                    document.getElementById("sk_ie_save_btn").onclick = () => {
                        const maskData = ddC.toDataURL("image/png");
                        const pixelPoints = tempPoints.map(p => ({
                            x: Math.round(p.x * editImg.naturalWidth),
                            y: Math.round(p.y * editImg.naturalHeight)
                        }));
                        const pointsJson = JSON.stringify(pixelPoints);
                        
                        this.points = tempPoints;
                        
                        const pw = this.widgets.find(w => w.name === "points_data");
                        if (pw) {
                            pw.value = pointsJson;
                            if (pw.callback) pw.callback(pointsJson);
                        }
                        this.setProperty("points_data", pointsJson);
                        
                        const mw = this.widgets.find(w => w.name === "mask_data");
                        if (mw) {
                            mw.value = maskData;
                            if (mw.callback) mw.callback(maskData);
                        }
                        this.setProperty("mask_data", maskData);
                        
                        this.syncAll();
                        this.graph.setDirtyCanvas(true, true);
                        if (app.graph) app.graph.change(); 
                        
                        mask.style.display = "none";
                    };
                };
            };
        }
    }
});
