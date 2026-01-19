import { app } from "/scripts/app.js";

app.registerExtension({
    name: "SK.MergePrompt",
    async nodeCreated(node) {
        if (node.comfyClass !== "SK_MergePrompt") return;

        const countW = node.widgets.find(w => w.name === "input_count");
        if (!countW) return;

        // 核心函数：根据数量动态增减输入端口
        const ensureInputs = (target) => {
            const minCount = Math.max(2, Number(target) || 2);
            const existing = node.inputs?.map(i => i.name) || [];
            
            // 移除多余的输入端口
            for (let idx = existing.length - 1; idx >= 0; idx--) {
                const name = existing[idx];
                const m = /^string_(\d+)$/.exec(name);
                if (!m) continue;
                const n = Number(m[1]);
                if (n > minCount) {
                    node.removeInput(idx);
                }
            }
            
            // 添加缺少的输入端口 (从 1 开始)
            for (let i = 1; i <= minCount; i++) {
                const name = `string_${i}`;
                if (!existing.includes(name)) {
                    let insertIndex = node.inputs ? node.inputs.length : 0;
                    // 尝试找到最后一个 "string_" 端口的位置 + 1，保持顺序
                    for (let j = node.inputs.length - 1; j >= 0; j--) {
                        if (node.inputs[j].name.startsWith("string_")) {
                            insertIndex = j + 1;
                            break;
                        }
                    }
                    node.addInput(name, "STRING", null, insertIndex);
                }
            }
            
            node.setSize(node.computeSize());
            node.setDirtyCanvas(true);
        };
        
        // 初始化时确保端口数量正确
        ensureInputs(Number(countW.value || 2));

        const origCb = countW.callback;

        // 包裹原始回调函数，以兼容 Nodes 2.0 模式下的 widget.options 错误
        countW.callback = (v) => {
            // 调用原始回调函数 (保存值)，使用 try/catch 捕获 Nodes 2.0 错误
            try {
                if (origCb) origCb(v);
            } catch (e) {
                // 捕获并忽略 'options' 错误
                console.warn("[SK-LoRA] [System] 原始 ComfyUI widget 回调失败，已忽略错误:", e);
            }
            
            // 更新输入端口
            ensureInputs(Math.max(2, Number(v) || 2));
        };
    }
});
