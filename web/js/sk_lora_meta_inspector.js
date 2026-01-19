import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";
import { Icons } from "./common/icons.js";

app.registerExtension({
    name: "SKNodes.LoraMetaInspector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SK_LoraMetaInspector") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                onExecuted?.apply(this, arguments);
                console.log("[SK-LoRA] [System] Inspector received message:", message);

                if (message && message.json && message.json[0]) {
                    try {
                        const data = JSON.parse(message.json[0]);
                        this.updateUI(data);
                    } catch (e) {
                        console.error("[SK-LoRA] [System] Failed to parse JSON", e);
                        this.updateUI(null);
                    }
                }
            };

            nodeType.prototype.onNodeCreated = function() {
                // 1. Info Display Widget
                const infoWidget = ComfyWidgets["STRING"](this, "model_info", ["STRING", { multiline: true }], app).widget;
                infoWidget.inputEl.readOnly = true;
                infoWidget.inputEl.style.fontSize = "11px";
                infoWidget.inputEl.style.textAlign = "center";
                infoWidget.inputEl.style.height = "50px";
                infoWidget.inputEl.style.color = "#aaa";
                infoWidget.inputEl.value = "Waiting for data...";
                infoWidget.serializeValue = () => undefined; // Don't save this widget's value

                // 2. LoRA List Widget
                const loraWidget = ComfyWidgets["STRING"](this, "lora_list", ["STRING", { multiline: true }], app).widget;
                loraWidget.inputEl.readOnly = true;
                loraWidget.inputEl.style.fontSize = "11px";
                loraWidget.inputEl.style.height = "120px";
                loraWidget.inputEl.style.backgroundColor = "rgba(0,0,0,0.2)";
                loraWidget.inputEl.value = "No LoRAs found.";
                loraWidget.serializeValue = () => undefined; // Don't save this widget's value

                // 3. Action Buttons
                this.addWidget("button", "View Details", null, () => {
                    this.showPopup();
                });

                // Hide the input widget for info_json if it exists
                setTimeout(() => {
                    const inputWidget = this.widgets?.find(w => w.name === "info_json");
                    if (inputWidget) {
                        inputWidget.type = "converted-widget"; // Hide it
                        if (inputWidget.element) inputWidget.element.style.display = "none";
                    }
                }, 100);
            };

            nodeType.prototype.updateUI = function(data) {
                this.lastData = data;
                
                if (!this.widgets) return;
                const infoWidget = this.widgets.find(w => w.name === "model_info");
                const loraWidget = this.widgets.find(w => w.name === "lora_list");

                if (!infoWidget || !loraWidget) {
                    console.warn("[SK-LoRA] [System] Inspector widgets not found during updateUI");
                    return;
                }

                if (data) {
                    // Update Info
                    const params = data.parameters || {};
                    const baseModelName = data.base_model ? data.base_model.split(/[/\\]/).pop() : "Unknown";
                    const sampler = params.sampler_name || params.sampler || "?";
                    const scheduler = params.scheduler || "?";
                    
                    infoWidget.value = `Base: ${baseModelName}\nSampler: ${sampler} | Scheduler: ${scheduler}\nSeed: ${data.seed}\nSteps: ${params.steps || "?"} | CFG: ${params.cfg || "?"}`;
                    
                    // Update LoRA List
                    if (data.loras && data.loras.length > 0) {
                        loraWidget.value = data.loras.map(l => {
                            const icon = l.local_path ? "✅" : "❌";
                            const cleanName = l.name ? l.name.split(/[/\\]/).pop() : "Unknown";
                            return `${icon} ${cleanName} (${l.weight})`;
                        }).join("\n");
                    } else {
                        loraWidget.value = "No LoRAs found.";
                    }
                } else {
                    infoWidget.value = "Invalid Data";
                    loraWidget.value = "";
                }

                this.setDirtyCanvas(true, true);
            };

            nodeType.prototype.showPopup = function() {
                if (!this.lastData) return;
                const data = this.lastData;

                const dialog = document.createElement("div");
                Object.assign(dialog.style, {
                    position: "fixed",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    backgroundColor: "rgba(30, 30, 30, 0.8)",
                    backdropFilter: "blur(15px)",
                    WebkitBackdropFilter: "blur(15px)",
                    padding: "25px",
                    borderRadius: "15px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    zIndex: "10001",
                    width: "85%",
                    maxWidth: "1200px",
                    maxHeight: "85vh",
                    overflowY: "auto",
                    overflowX: "hidden",
                    color: "#eee",
                    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                });

                const baseModelRaw = data.base_model || "Unknown";
                const baseModelName = typeof baseModelRaw === 'string' ? baseModelRaw.split(/[/\\]/).pop() : String(baseModelRaw);
                const fileInfo = data.image_info || {};
                const fileSizeKB = fileInfo.size_bytes ? (fileInfo.size_bytes / 1024).toFixed(2) : "0.00";
                const fileSpecStr = ` (${fileInfo.width || "?"}x${fileInfo.height || "?"} | ${fileSizeKB} KB | ${fileInfo.format || "Unknown"})`;
                
                // Determine Data Type Label
                let dataTypeLabel = "Unknown Format";
                let dataTypeColor = "#888";
                
                if (data.workflow_raw && Object.keys(data.workflow_raw).length > 0) {
                    dataTypeLabel = "可还原画布 (Workflow)";
                    dataTypeColor = "#4CAF50"; // Green
                } else if (data.api_raw && Object.keys(data.api_raw).length > 0) {
                    dataTypeLabel = "仅限参数 (API)";
                    dataTypeColor = "#FF9800"; // Orange
                }

                // Header
                const header = document.createElement("div");
                header.style.display = "flex";
                header.style.justifyContent = "space-between";
                header.style.alignItems = "center";
                header.style.marginBottom = "20px";
                
                const titleContainer = document.createElement("div");
                titleContainer.style.display = "flex";
                titleContainer.style.alignItems = "baseline";
                titleContainer.style.gap = "10px";

                const title = document.createElement("h2");
                title.innerText = "Metadata Details";
                title.style.margin = "0";
                title.style.fontSize = "20px";
                title.style.fontWeight = "600";
                title.style.color = "#fff";
                titleContainer.appendChild(title);

                const specs = document.createElement("span");
                specs.innerText = fileSpecStr;
                specs.style.fontSize = "12px";
                specs.style.color = "#888";
                specs.style.fontWeight = "400";
                titleContainer.appendChild(specs);

                header.appendChild(titleContainer);

                const closeBtn = document.createElement("button");
                closeBtn.innerHTML = Icons.get('x', '', 20);
                Object.assign(closeBtn.style, {
                    background: "none",
                    border: "none",
                    color: "#888",
                    fontSize: "20px",
                    cursor: "pointer",
                    padding: "5px",
                    transition: "color 0.2s"
                });
                closeBtn.onmouseover = () => closeBtn.style.color = "#fff";
                closeBtn.onmouseout = () => closeBtn.style.color = "#888";
                closeBtn.onclick = () => document.body.removeChild(dialog);

                const controlsContainer = document.createElement("div");
                controlsContainer.style.display = "flex";
                controlsContainer.style.alignItems = "center";
                controlsContainer.appendChild(closeBtn);

                header.appendChild(controlsContainer);
                dialog.appendChild(header);

                // Section Helper
                const createSection = (title, content, isCode = false, extraTag = null) => {
                    const section = document.createElement("div");
                    section.style.marginBottom = "20px";

                    const headerRow = document.createElement("div");
                    headerRow.style.display = "flex";
                    headerRow.style.justifyContent = "space-between";
                    headerRow.style.alignItems = "center";
                    headerRow.style.marginBottom = "8px";

                    const leftPart = document.createElement("div");
                    leftPart.style.display = "flex";
                    leftPart.style.alignItems = "center";
                    leftPart.style.gap = "8px";

                    const label = document.createElement("div");
                    label.innerText = title;
                    label.style.fontSize = "11px";
                    label.style.color = "#888";
                    label.style.textTransform = "uppercase";
                    label.style.letterSpacing = "1px";
                    leftPart.appendChild(label);

                    if (extraTag) {
                        leftPart.appendChild(extraTag);
                    }

                    headerRow.appendChild(leftPart);

                    // Small Copy Button
                    const copyBtn = document.createElement("button");
                    copyBtn.innerHTML = `${Icons.get('copy', '', 10)} COPY`;
                    Object.assign(copyBtn.style, {
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        color: "#aaa",
                        fontSize: "9px",
                        padding: "2px 6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                    });
                    copyBtn.onmouseover = () => {
                        copyBtn.style.background = "rgba(255,255,255,0.1)";
                        copyBtn.style.color = "#fff";
                    };
                    copyBtn.onmouseout = () => {
                        copyBtn.style.background = "rgba(255,255,255,0.05)";
                        copyBtn.style.color = "#aaa";
                    };
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(content).then(() => {
                            const original = copyBtn.innerHTML;
                            copyBtn.innerHTML = `${Icons.get('check', '', 10)} COPIED!`;
                            copyBtn.style.color = "#4CAF50";
                            setTimeout(() => {
                                copyBtn.innerHTML = original;
                                copyBtn.style.color = "#aaa";
                            }, 1000);
                        });
                    };
                    headerRow.appendChild(copyBtn);
                    section.appendChild(headerRow);

                    if (isCode) {
                        const pre = document.createElement("pre");
                        pre.innerText = content || "None";
                        Object.assign(pre.style, {
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "12px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            lineHeight: "1.5",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            maxHeight: "100px",
                            overflowY: "auto",
                            overflowX: "hidden",
                            margin: "0",
                            border: "1px solid rgba(255,255,255,0.05)",
                            color: "#ccc",
                            fontFamily: "Consolas, 'Courier New', monospace"
                        });
                        section.appendChild(pre);
                    } else {
                        const div = document.createElement("div");
                        div.innerText = content || "Unknown";
                        div.style.fontSize = "14px";
                        div.style.padding = "4px 0";
                        section.appendChild(div);
                    }
                    return section;
                };

                const params = data.parameters || {};
                const baseModelNameInGrid = typeof baseModelRaw === 'string' ? baseModelRaw.split(/[/\\]/).pop() : String(baseModelRaw);

                // Info Group 1: Basic (Base Model, Seed)
                const grid1 = document.createElement("div");
                grid1.style.display = "grid";
                grid1.style.gridTemplateColumns = "1fr 1fr";
                grid1.style.gap = "20px";
                grid1.appendChild(createSection("Base Model", baseModelNameInGrid));
                grid1.appendChild(createSection("Seed", (data.seed ?? "Unknown").toString()));
                dialog.appendChild(grid1);

                // Info Group 2: Sampler & Scheduler
                const grid2 = document.createElement("div");
                grid2.style.display = "grid";
                grid2.style.gridTemplateColumns = "1fr 1fr";
                grid2.style.gap = "20px";
                grid2.appendChild(createSection("Sampler", params.sampler_name || params.sampler || "Unknown"));
                grid2.appendChild(createSection("Scheduler", params.scheduler || "Unknown"));
                dialog.appendChild(grid2);

                // Info Group 3: LoRAs
                let loraContent = "None";
                if (data.loras && data.loras.length > 0) {
                    loraContent = data.loras.map(l => {
                        const cleanName = l.name ? l.name.split(/[/\\]/).pop() : "Unknown";
                        return `${cleanName} (${l.weight})`;
                    }).join("\n");
                }
                dialog.appendChild(createSection("LoRAs", loraContent, true));

                dialog.appendChild(document.createElement("hr")).style.border = "0.5px solid rgba(255,255,255,0.1)";

                // Info Group 4: Prompts
                const prompts = data.prompts || {};
                dialog.appendChild(createSection("Positive Prompt", prompts.positive || "", true));
                dialog.appendChild(createSection("Negative Prompt", prompts.negative || "", true));

                dialog.appendChild(document.createElement("hr")).style.border = "0.5px solid rgba(255,255,255,0.1)";

                // Info Group 5: Workflow, Raw
                const workflowData = (data.workflow_raw && Object.keys(data.workflow_raw).length > 0) ? data.workflow_raw : 
                                   (data.api_raw && Object.keys(data.api_raw).length > 0 ? data.api_raw : null);

                if (workflowData) {
                    const typeTag = document.createElement("span");
                    typeTag.innerText = dataTypeLabel;
                    Object.assign(typeTag.style, {
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        backgroundColor: dataTypeColor + "22", // 20% opacity
                        border: `1px solid ${dataTypeColor}`,
                        color: dataTypeColor,
                        fontWeight: "600",
                        textTransform: "uppercase",
                        lineHeight: "1"
                    });

                    const workflowStr = typeof workflowData === 'string' ? workflowData : JSON.stringify(workflowData, null, 2);
                    dialog.appendChild(createSection("Workflow", workflowStr, true, typeTag));
                }

                dialog.appendChild(createSection("Full Raw Metadata", data.raw_metadata, true));

                document.body.appendChild(dialog);
            };
        }
    }
});
