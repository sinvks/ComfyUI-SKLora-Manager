import { app } from "../../../scripts/app.js";

/**
 * SK Prompt Matrix Sampler V3 - Tooltip 映射扩展
 * 功能：将 Python 端定义的 tooltip 字段自动绑定到前端 Widget 的 title 属性上。
 */

app.registerExtension({
    name: "SK.PromptMatrixV3.Tooltips",
    async nodeCreated(node) {
        if (node.comfyClass === "SK_PromptMatrix_V3") {
            // 获取节点定义的输入数据
            const inputData = node.constructor.nodeData.input;
            if (!inputData) return;

            // 遍历所有 widget
            node.widgets.forEach(widget => {
                // 查找对应 widget 在 Python 端定义的配置
                const widgetName = widget.name;
                let config = null;

                if (inputData.required && inputData.required[widgetName]) {
                    config = inputData.required[widgetName];
                } else if (inputData.optional && inputData.optional[widgetName]) {
                    config = inputData.optional[widgetName];
                }

                // 如果找到了配置且包含 tooltip 字段
                if (config && config[1] && config[1].tooltip) {
                    const tooltipText = config[1].tooltip;

                    // 绑定到输入框元素或下拉菜单元素
                    if (widget.inputEl) {
                        widget.inputEl.title = tooltipText;
                    } else if (widget.element) {
                        widget.element.title = tooltipText;
                    } else if (widget.contentEl) {
                        // 兜底处理
                        widget.contentEl.title = tooltipText;
                    }
                }
            });
        }
    }
});
