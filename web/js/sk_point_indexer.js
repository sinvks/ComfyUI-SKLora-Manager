import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { Icons } from "./common/icons.js";

const style = document.createElement('style');
style.innerHTML = `
    .sk-indexer-mask { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 10001; display: none; flex-direction: column; align-items: center; justify-content: center; overflow: auto; }
    .sk-indexer-editor { background: #1e1e1e; border: 2px solid #555; display: flex; flex-direction: column; border-radius: 10px; box-shadow: 0 0 30px rgba(0,0,0,0.5); margin: auto; max-width: 98vw; max-height: 98vh; overflow: auto; }
    .sk-indexer-canvas { background: #000; cursor: crosshair; display: block; }
    .sk-indexer-tools { display: flex; gap: 15px; padding: 12px 25px; color: white; font-family: sans-serif; background: #222; align-items: center; flex-wrap: nowrap; flex-shrink: 0; min-width: max-content; }
    .sk-indexer-btn { padding: 6px 15px; cursor: pointer; border-radius: 4px; border: none; font-weight: bold; flex-shrink: 0; white-space: nowrap; }
    .sk-indexer-save-btn { background: #28a745; color: white; }
    .sk-indexer-clear-btn { background: #dc3545; color: white; }
    .sk-indexer-close-btn { background: #6c757d; color: white; }
`;
document.head.appendChild(style);

app.registerExtension({
    name: "SK.PointIndexer",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SK_PointIndexer") {
            
            nodeType.prototype.onNodeCreated = function() {
                this.points = [];
                this.img = null;
                this.imgs = []; 
                this.img_name = "";
                this.draggingPoint = null;
                this.size = [400, 500];

                this.addWidget("button", "🖼️ Open Editor", null, () => this.openEditor());
                this.addWidget("button", "🗑️ Clear All", null, () => {
                    this.points = [];
                    this.syncAll();
                });

                const pWidget = this.widgets.find(w => w.name === "points_data");
                if (pWidget) pWidget.type = "text";

                const imageWidget = this.widgets.find(w => w.name === "image");
                if (imageWidget) {
                    const self = this;
                    const orgCallback = imageWidget.callback;
                    imageWidget.callback = function(value) {
                        if (orgCallback) orgCallback.apply(this, arguments);
                        if (value && self.img_name !== value) {
                            self.img_name = value;
                            self.points = [];
                            self.loadNodeImage(value);
                        }
                    };
                }
            };

            nodeType.prototype.loadNodeImage = function(name) {
                if (!name) return;
                
                const params = new URLSearchParams();
                if (typeof name === "string") {
                    if (name.includes("/") || name.includes("\\")) {
                        const sep = name.includes("/") ? "/" : "\\";
                        const parts = name.split(sep);
                        params.append("filename", parts.pop());
                        params.append("subfolder", parts.join(sep));
                    } else {
                        params.append("filename", name);
                    }
                    params.append("type", "input");
                } else if (typeof name === "object") {
                    for (const key in name) {
                        if (name[key] !== undefined && name[key] !== null) {
                            params.append(key, name[key]);
                        }
                    }
                    if (!params.has("type")) params.append("type", "input");
                }
                params.append("t", Date.now());
                const url = api.apiURL(`/view?${params.toString()}`);

                const img = new Image();
                img.src = url;
                img.onload = () => { 
                    this.img = img; 
                    this.imgs = [img]; 
                    this.syncAll();
                    if (this.onResize) this.onResize(this.size);
                };
            };

            nodeType.prototype.syncAll = function() {
                const w = this.widgets.find(w => w.name === "points_data");
                if (w && this.img) {
                    const raw = this.points.map(p => ({
                        x: Math.round(p.x * this.img.naturalWidth),
                        y: Math.round(p.y * this.img.naturalHeight)
                    }));
                    const val = JSON.stringify(raw);
                    w.value = val;
                    this.setProperty("points_data", val);
                    if (w.callback) w.callback(val);
                }
                
                if (this.img) {
                    this.imgs = [this.img];
                    if (this.img.src && !this.img.src.includes("&rand=")) {
                         this.img.src = this.img.src + `&rand=${Math.random()}`;
                    }
                }
                
                this.setDirtyCanvas(true); 
                if (app.canvas && app.canvas.graph_canvas) {
                    app.canvas.graph_canvas.setDirty(true, true);
                }
            };

            nodeType.prototype.getPreviewRect = function() {
                let yOffset = 30;
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
                    ctx.beginPath(); 
                    ctx.moveTo(hx-3, hy-3); ctx.lineTo(hx+3, hy+3); 
                    ctx.moveTo(hx+3, hy-3); ctx.lineTo(hx-3, hy+3);
                    ctx.strokeStyle = "white"; ctx.stroke();
                });
                ctx.restore();
            };
            
            nodeType.prototype.onDrawBackground = function(ctx) {
                if (this.flags.collapsed || !this.img) return;
                const rect = this.getPreviewRect();
                ctx.drawImage(this.img, rect.x, rect.y, rect.w, rect.h);
            };

            nodeType.prototype.onMouseDown = function(e, localPos) {
                const rect = this.getPreviewRect();
                const x = (localPos[0] - rect.x) / rect.w;
                const y = (localPos[1] - rect.y) / rect.h;
                if (x < 0 || x > 1 || y < 0 || y > 1) return;
                const isRightClick = e.button === 2;
                const delHandleIdx = this.points.findIndex(p => {
                    const hx = rect.x + p.x * rect.w + 9, hy = rect.y + p.y * rect.h - 9;
                    return Math.hypot(localPos[0] - hx, localPos[1] - hy) < 8;
                });
                if (isRightClick || delHandleIdx !== -1) {
                    const target = isRightClick ? this.points.findIndex(p => Math.hypot(p.x-x, p.y-y) < (20/rect.w)) : delHandleIdx;
                    if (target !== -1) {
                        this.points.splice(target, 1);
                        this.syncAll();
                        return true;
                    }
                    if (isRightClick) return true;
                }
                if (e.button === 0) {
                    const hit = this.points.findIndex(p => Math.hypot(p.x-x, p.y-y) < (15/rect.w));
                    if (hit !== -1) {
                        this.draggingPoint = hit;
                    } else {
                        this.points.push({x, y});
                        this.syncAll();
                    }
                    return true;
                }
            };

            nodeType.prototype.onMouseMove = function(e, localPos) {
                if (this.draggingPoint !== null) {
                    const rect = this.getPreviewRect();
                    this.points[this.draggingPoint].x = Math.max(0, Math.min(1, (localPos[0] - rect.x) / rect.w));
                    this.points[this.draggingPoint].y = Math.max(0, Math.min(1, (localPos[1] - rect.y) / rect.h));
                    this.syncAll();
                }
            };

            nodeType.prototype.onMouseUp = function() { this.draggingPoint = null; };

            nodeType.prototype.openEditor = function() {
                const imgW = this.widgets.find(w => w.name === "image");
                if (!imgW || !imgW.value) return alert("Please upload an image first");
                let mask = document.getElementById("sk_indexer_mask") || document.createElement("div");
                if (!mask.id) { mask.id = "sk_indexer_mask"; mask.className = "sk-indexer-mask"; document.body.appendChild(mask); }
                mask.innerHTML = `
                    <div class="sk-indexer-editor">
                        <div class="sk-indexer-content"><canvas id="sk_indexer_canvas" class="sk-indexer-canvas"></canvas></div>
                        <div class="sk-indexer-tools">
                            <span style="color:#aaa; font-size:12px; align-self:center; flex:1;">Left click: Add/Drag | Right click/X: Delete</span>
                            <button id="sk_indexer_clear_btn" class="sk-indexer-btn sk-indexer-clear-btn">${Icons.get('trash', '', 14)} Clear</button>
                            <button id="sk_indexer_save_btn" class="sk-indexer-btn sk-indexer-save-btn">${Icons.get('save', '', 14)} Save</button>
                            <button id="sk_indexer_close_btn" class="sk-indexer-btn sk-indexer-close-btn">${Icons.get('x', '', 14)} Cancel</button>
                        </div>
                    </div>`;
                const canvas = document.getElementById("sk_indexer_canvas"), ctx = canvas.getContext("2d");
                const editImg = new Image();
                let tempPoints = JSON.parse(JSON.stringify(this.points)), dIdx = null;
                
                const params = new URLSearchParams();
                const name = imgW.value;
                if (typeof name === "string") {
                    if (name.includes("/") || name.includes("\\")) {
                        const sep = name.includes("/") ? "/" : "\\";
                        const parts = name.split(sep);
                        params.append("filename", parts.pop());
                        params.append("subfolder", parts.join(sep));
                    } else {
                        params.append("filename", name);
                    }
                    params.append("type", "input");
                } else if (typeof name === "object") {
                    for (const key in name) {
                        if (name[key] !== undefined && name[key] !== null) {
                            params.append(key, name[key]);
                        }
                    }
                    if (!params.has("type")) params.append("type", "input");
                }
                params.append("t", Date.now());
                editImg.src = api.apiURL(`/view?${params.toString()}`);

                editImg.onload = () => {
                    const r = Math.min((window.innerWidth*0.85)/editImg.width, (window.innerHeight*0.75)/editImg.height);
                    canvas.width = editImg.width * r; canvas.height = editImg.height * r;
                    const draw = () => {
                        ctx.drawImage(editImg, 0, 0, canvas.width, canvas.height);
                        tempPoints.forEach((p, i) => {
                            const px = p.x*canvas.width, py = p.y*canvas.height;
                            ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI*2);
                            ctx.fillStyle = "red"; ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
                            ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(i+1, px, py+5);
                            const hx = px+13, hy = py-13;
                            ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI*2); ctx.fillStyle = "#333"; ctx.fill();
                            ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(hx-4, hy-4); ctx.lineTo(hx+4, hy+4); ctx.moveTo(hx+4, hy-4); ctx.lineTo(hx-4, hy+4);
                            ctx.strokeStyle = "white"; ctx.stroke();
                        });
                    };
                    canvas.onmousedown = (e) => {
                        const b = canvas.getBoundingClientRect(), x = (e.clientX-b.left)/canvas.width, y = (e.clientY-b.top)/canvas.height;
                        const delHandle = tempPoints.findIndex(p => Math.hypot((e.clientX-b.left)-(p.x*canvas.width+13), (e.clientY-b.top)-(p.y*canvas.height-13)) < 12);
                        if (e.button === 2 || delHandle !== -1) {
                            const target = e.button === 2 ? tempPoints.findIndex(p => Math.hypot(p.x-x, p.y-y) < (25/canvas.width)) : delHandle;
                            if (target !== -1) { tempPoints.splice(target, 1); draw(); }
                            return;
                        }
                        const hit = tempPoints.findIndex(p => Math.hypot(p.x-x, p.y-y) < (25/canvas.width));
                        if (hit !== -1) dIdx = hit; else { tempPoints.push({x,y}); draw(); }
                    };
                    canvas.onmousemove = (e) => { if (dIdx !== null) { 
                        const b = canvas.getBoundingClientRect();
                        tempPoints[dIdx].x = Math.max(0, Math.min(1, (e.clientX-b.left)/canvas.width));
                        tempPoints[dIdx].y = Math.max(0, Math.min(1, (e.clientY-b.top)/canvas.height));
                        draw(); 
                    }};
                    canvas.onmouseup = () => dIdx = null;
                    canvas.oncontextmenu = (e) => e.preventDefault();
                    document.getElementById("sk_indexer_save_btn").onclick = () => {
                        this.points = tempPoints;
                        if (editImg && editImg.complete && editImg.width > 0) {
                            this.img = editImg;
                            if (this.img.src && !this.img.src.includes("&rand=")) {
                                this.img.src = this.img.src + `&rand=${Math.random()}`;
                            }
                            this.imgs = [this.img];
                        }
                        this.syncAll();
                        mask.style.display = "none";
                        setTimeout(() => { 
                             this.setDirtyCanvas(true); 
                             if (app.canvas && app.canvas.graph_canvas) {
                                app.canvas.graph_canvas.setDirty(true, true);
                             }
                        }, 50);
                    };
                    document.getElementById("sk_indexer_clear_btn").onclick = () => { tempPoints = []; draw(); };
                    document.getElementById("sk_indexer_close_btn").onclick = () => mask.style.display="none";
                    draw();
                };
                mask.style.display = "flex";
            };

            nodeType.prototype.onConfigure = function(o) {
                if (o.properties?.saved_points) this.points = o.properties.saved_points;
                const imgW = this.widgets.find(w => w.name === "image");
                if (imgW && imgW.value) {
                    this.img_name = imgW.value;
                    setTimeout(() => this.loadNodeImage(imgW.value), 100);
                }
            };
            nodeType.prototype.onSerialize = function(o) {
                o.properties = o.properties || {};
                o.properties.saved_points = this.points;
            };
        }
    }
});
