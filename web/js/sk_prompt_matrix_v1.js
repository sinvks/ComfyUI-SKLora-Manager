import { app } from "../../../scripts/app.js";

/**
 * SK Prompt Matrix Sampler V1
 */

app.registerExtension({
    name: "SK.PromptMatrixV1.Tooltips",
    async nodeCreated(node) {
        if (node.comfyClass === "SK_PromptMatrix_V1") {
            const inputData = node.constructor.nodeData.input;
            if (!inputData) return;

            node.widgets.forEach(widget => {
                const widgetName = widget.name;
                let config = null;

                if (inputData.required && inputData.required[widgetName]) {
                    config = inputData.required[widgetName];
                } else if (inputData.optional && inputData.optional[widgetName]) {
                    config = inputData.optional[widgetName];
                }

                if (config && config[1] && config[1].tooltip) {
                    const tooltipText = config[1].tooltip;
                    if (widget.inputEl) {
                        widget.inputEl.title = tooltipText;
                    } else if (widget.element) {
                        widget.element.title = tooltipText;
                    } else if (widget.contentEl) {
                        widget.contentEl.title = tooltipText;
                    }
                }
            });
        }
    }
});
