import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";
import { api } from "../../../scripts/api.js";

app.registerExtension({
    name: "SKNodes.LoraMetaExtractor",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SK_LoraMetaExtractor") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                const imageWidget = this.widgets.find((w) => w.name === "image");
                
                // 当图片选择改变时，更新预览 (参考 LoadImage 官方逻辑)
                const callback = imageWidget.callback;
                imageWidget.callback = (value) => {
                    if (callback) {
                        callback.call(imageWidget, value);
                    }
                    this.updatePreview(value);
                };

                // 初始化预览
                if (imageWidget.value) {
                    this.updatePreview(imageWidget.value);
                }

                return r;
            };

            // 核心逻辑：使用官方的 onExecuted 处理返回的预览图
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                if (message?.images) {
                    this.updatePreview(message.images[0].filename, message.images[0].type, message.images[0].subfolder);
                }
                return r;
            };

            nodeType.prototype.updatePreview = function(filename, type = "input", subfolder = "") {
                if (!filename) {
                    this.imgs = null;
                    this.setDirtyCanvas(true, true);
                    return;
                }
                
                // Handle subfolder in filename (mirroring LoadImage behavior)
                if (filename.includes('/') || filename.includes('\\')) {
                    const parts = filename.replace(/\\/g, '/').split('/');
                    filename = parts.pop();
                    const sub = parts.join('/');
                    if (subfolder) {
                        subfolder = sub + '/' + subfolder;
                    } else {
                        subfolder = sub;
                    }
                }
                
                // Add timestamp to prevent browser caching
                const timestamp = new Date().getTime();
                const url = api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=${type}&subfolder=${subfolder}&t=${timestamp}`);
                
                const img = new Image();
                img.onload = () => {
                    this.imgs = [img];
                    this.setDirtyCanvas(true, true);
                    // 强制触发一次尺寸计算，确保边框自适应
                    this.setSize(this.computeSize());
                };
                img.onerror = () => {
                    console.error("[SK-LoRA] [System] 加载预览图失败:", url);
                };
                img.src = url;
            };

            // 修正 computeSize 以包含图片预览的高度
            const origComputeSize = nodeType.prototype.computeSize;
            nodeType.prototype.computeSize = function() {
                const size = origComputeSize.apply(this, arguments);
                if (this.imgs && this.imgs.length > 0 && this.imgs[0].complete) {
                    const img = this.imgs[0];
                    const margin = 20;
                    const w = size[0] - margin;
                    const h = (img.naturalHeight / img.naturalWidth) * w;
                    size[1] += h + margin;
                }
                return size;
            };
        }
    }
});
