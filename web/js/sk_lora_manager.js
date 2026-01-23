(function() {
    // 全局变量声明
    let lang;
    let Icons;
    let globalLoraData = {}; // 缓存全局 LoRA 详情数据

    // 路径归一化工具：统一分隔符为 / 并去除首部斜杠
    const normalizePath = (path) => {
        if (!path) return "";
        return path.replace(/\\/g, "/").replace(/^\/+/, "");
    };

    // 防抖工具函数
    const debounce = (func, wait) => {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    };

    // 菜单显示封装
    const skShowMenu = (values, options, e) => {
        // 注入菜单美化样式 (仅注入一次)
        if (!document.getElementById("sk-menu-style") && lang) {
            const style = document.createElement('style');
            style.id = "sk-menu-style";
            style.textContent = `
                .sk-custom-menu { background: rgba(20, 20, 25, 0.9) !important; backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important; border: 1px solid rgba(255, 255, 255, 0.08) !important; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6) !important; padding: 6px !important; border-radius: 12px !important; overflow: visible !important; min-width: 180px !important; }
                .sk-custom-menu::before { content: "${lang.t("mgr_node_inject_to")}"; display: block; padding: 8px 12px; font-size: 11px; color: #666; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 4px; }
                .sk-custom-menu .litemenu-entry { height: 36px !important; line-height: 36px !important; margin: 2px 0 !important; padding: 0 12px 0 16px !important; border-left: 3px solid transparent !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; color: #aaa !important; font-size: 13px !important; border-radius: 4px !important; }
                .sk-custom-menu .litemenu-entry:hover { background: rgba(99, 102, 241, 0.15) !important; color: #fff !important; border-left-color: #6366f1 !important; transform: translateX(2px); }
                .sk-custom-menu .litemenu-entry.separator { height: 1px !important; background: rgba(255, 255, 255, 0.05) !important; margin: 4px 8px !important; padding: 0 !important; border: none !important; }
                .sk-menu-id { font-family: 'JetBrains Mono', monospace !important; background: rgba(99, 102, 241, 0.2); padding: 1px 6px; border-radius: 4px; margin-right: 8px; color: #a5b4fc; font-size: 11px; }
            `;
            document.head.appendChild(style);
        }

        // 1. 防御性 Event 处理
        const isMock = !e;
        const safeEvent = e || {
            clientX: window.innerWidth / 2,
            clientY: window.innerHeight / 2,
            target: document.body,
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        // 留出 Vue3 扩展接口
        if (window.SK_VUE_MENU_HANDLER) {
            return window.SK_VUE_MENU_HANDLER(values, options, safeEvent);
        }

        // 2. LiteGraph 默认菜单适配
        const menu = new LiteGraph.ContextMenu(values, {
            ...options,
            event: safeEvent,
            className: "sk-custom-menu dark"
        }, window);

        // 3. 智能定位方案
        if (menu.root) {
            document.body.appendChild(menu.root);
            menu.root.style.setProperty("z-index", "10001", "important");
            menu.root.style.setProperty("position", "fixed", "important");
            
            // 定位算法：若是真实点击，偏移 10px 侧边弹出；若是 Mock，居中。
            let x = isMock ? (window.innerWidth / 2 - 90) : (safeEvent.clientX + 10);
            let y = isMock ? (window.innerHeight / 2 - (values.length * 20)) : safeEvent.clientY;
            
            // 边界检查
            const menuWidth = 200;
            const menuHeight = values.length * 40 + 40; // 预估高度
            if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 20;
            if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 20;

            menu.root.style.setProperty("left", x + "px", "important");
            menu.root.style.setProperty("top", y + "px", "important");
        }
        return menu;
    };

    const setup = async () => {
        const { app } = await import("/scripts/app.js");
        const { api } = await import("/scripts/api.js");
        const langModule = await import("./common/lang.js");
        const toastModule = await import("./common/toast_manager.js");
        const iconsModule = await import("./common/icons.js");
        lang = langModule.lang;
        Icons = iconsModule.Icons;
        
        // 预加载全局 LoRA 数据
        try {
            const resp = await api.fetchApi("/sk_manager/get_lora_data");
            if (resp.ok) {
                const rawData = await resp.json();
                // 归一化所有键名
                globalLoraData = {};
                for (const [key, val] of Object.entries(rawData)) {
                    globalLoraData[normalizePath(key)] = val;
                }
            }
        } catch (e) {
            console.error("[SK-LoRA] [System] Failed to pre-fetch lora data:", e);
        }

        // 挂载全局 Toast 管理器 (如果尚未挂载)
        if (!window.SKToastManager) {
            window.SKToastManager = toastModule.default;
        }

        // --- 全局滚轮拦截器 (Nodes 2.0 缩放修复) ---
        if (!window._sk_lora_wheel_init) {
            window.addEventListener("wheel", (e) => {
                // 仅处理权重输入框或控制容器上的事件
                const input = e.target.closest(".sk-weight-input");
                const ctrl = e.target.closest(".sk-weight-ctrl");
                if (!input && !ctrl) return;

                // 找到实际的目标输入框
                const targetInput = input || ctrl.querySelector(".sk-weight-input");
                if (!targetInput) return;

                // 1. 核心拦截：阻止事件继续向下（或向上）传播，彻底屏蔽画布缩放
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                // 2. 获取上下文 (card, panel, node)
                const card = targetInput.closest(".sk-item-card");
                const panel = targetInput.closest(".sk-ui-panel");
                if (!card || !panel || !panel._node) return;

                const node = panel._node;
                const index = parseInt(card.dataset.index);
                const item = node.loraData[index];
                if (!item) return;

                // 3. 调值逻辑
                const step = e.shiftKey ? 0.1 : 0.01;
                const delta = e.deltaY < 0 ? step : -step;

                const isModel = targetInput.classList.contains("model");
                if (isModel) {
                    item.strength_model = Math.round((item.strength_model + delta) * 100) / 100;
                    targetInput.value = item.strength_model.toFixed(2);
                    if (item.linked) {
                        item.strength_clip = item.strength_model;
                        const clipInput = card.querySelector(".sk-weight-input.clip");
                        if (clipInput) clipInput.value = item.strength_clip.toFixed(2);
                    }
                } else {
                    item.strength_clip = Math.round((item.strength_clip + delta) * 100) / 100;
                    targetInput.value = item.strength_clip.toFixed(2);
                }
                if (node._forceUpdateWidget) node._forceUpdateWidget();
                    node.syncDataDebounced();
            }, { passive: false, capture: true });
            window._sk_lora_wheel_init = true;
        }

        // 更新菜单标题翻译
        const updateMenuTitle = () => {
            const styleId = "sk-menu-style";
            const existingStyle = document.getElementById(styleId);
            if (existingStyle) {
                const titleText = lang.t("mgr_node_inject_to");
                existingStyle.textContent = existingStyle.textContent.replace(/content: ".*";/, `content: "${titleText}";`);
            }
        };

        // 监听 SK_APPLY_LORA 事件
        window.addEventListener("SK_APPLY_LORA", (event) => {
            const { loraName, triggerWords, originalEvent } = event.detail;
            const nodes = app.graph.findNodesByType("SK_LoraLoaderManager");

            const handleAdd = (node) => {
                if (node.externalAddLora) {
                    const success = node.externalAddLora(loraName, triggerWords);
                    
                    if (success) {
                        // 1. Toast 提示
                        if (window.SKToastManager) {
                            window.SKToastManager.success(lang.t("mgr_node_distribute_success", [node.id]));
                        }
                        
                        // 2. 交互反馈：绿色闪烁
                        const oldColor = node.boxcolor;
                        node.boxcolor = "#22c55e";
                        setTimeout(() => {
                            node.boxcolor = oldColor;
                            app.canvas.draw(true, true);
                        }, 1000);
                        app.canvas.draw(true, true);
                    }
                    // 注意：失败情况（如重复添加）已由 node.externalAddLora 内部处理并弹出 Toast，此处无需冗余处理
                }
            };

            const createNew = () => {
                const node = LiteGraph.createNode("SK_LoraLoaderManager");
                if (app.canvas) {
                      const canvas = app.canvas;
                      const ds = canvas.ds;
                      const canvasRect = canvas.canvas.getBoundingClientRect();
                      
                      // 计算画布坐标系下的视野中心
                      const centerX = ( (canvasRect.width / 2) - ds.offset[0] ) / ds.scale;
                      const centerY = ( (canvasRect.height / 2) - ds.offset[1] ) / ds.scale;
                      
                      // 应用“中间偏上”偏移 (向上移动视口高度的 15%)
                      const verticalOffset = (canvasRect.height * 0.1) / ds.scale;
                      
                      // 设置节点位置，考虑节点自身宽度以实现水平居中
                      node.pos = [centerX - (node.size[0] / 2), centerY - verticalOffset];
                }
                app.graph.add(node);
                setTimeout(() => handleAdd(node), 150);
            };

            if (nodes.length === 0) {
                createNew();
            } else if (nodes.length === 1) {
                const node = nodes[0];
                const nodeName = node.title || lang.t("mgr_node_name");
                const menuOptions = [
                    { content: `<span class="sk-menu-id">#${node.id}</span> ${lang.t("mgr_node_inject_to")}${nodeName}`, callback: () => handleAdd(node) },
                    { content: `${Icons.get('plus', '', 14)} ${lang.t("init_library")}`, callback: () => createNew() }
                ];
                skShowMenu(menuOptions, { event: originalEvent });
            } else {
                const menuOptions = nodes.map(n => ({ 
                    content: `<span class="sk-menu-id">#${n.id}</span> ${lang.t("mgr_node_inject_to")}${n.title || lang.t("mgr_node_name")}`, 
                    callback: () => handleAdd(n)
                }));
                menuOptions.push(null); // 分隔线
                menuOptions.push({ content: `${Icons.get('rocket', '', 14)} ${lang.t("mgr_node_distribute_all", [""])}`, callback: () => nodes.forEach(n => handleAdd(n)) });
                menuOptions.push({ content: `${Icons.get('plus', '', 14)} ${lang.t("init_library")}`, callback: () => createNew() });

                skShowMenu(menuOptions, { event: originalEvent });
            }
        });
        
        // 尝试导入 ToastManager
        let toastManager = window.SKToastManager || null;
        if (!toastManager) {
            try {
                // 优先使用相对路径导入，这是目录名无关的
                const ToastManagerModule = await import("./common/toast_manager.js");
                toastManager = ToastManagerModule.default;
                window.SKToastManager = toastManager;
            } catch (e) {
                console.warn("[SK-LoRA] [System] ToastManager relative import failed, fallback to window object", e);
            }
        }
        
        // --- 1. 强制全局注入 CSS (只注入一次，防止样式丢失) ---
        if (!document.getElementById("sk-lora-style-global")) {
            const style = document.createElement('style');
            style.id = "sk-lora-style-global";
            style.textContent = `
                .sk-svg-icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }
                .sk-ui-panel { background: #1a1a1e !important; border: 1px solid #3e3e42; border-radius: 8px; padding: 10px; color: #e0e0e0; width: 100%; box-sizing: border-box; overflow: visible !important; display: flex; flex-direction: column; height: auto !important; }
                /* 确保 ComfyUI 的 DOMWidget 容器不会限制高度 (仅针对本插件) */
                .comfy-node-widget-content:has(.sk-ui-panel) { height: auto !important; }
                /* 滑动开关 */
                .sk-switch { position: relative; display: inline-block; width: 28px; height: 16px; cursor: pointer; flex-shrink: 0; vertical-align: middle; }
                .sk-switch input { opacity: 0; width: 0; height: 0; }
                .sk-slider { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .2s; border-radius: 16px; border: 1px solid #444; }
                .sk-slider:before { position: absolute; content: ""; height: 10px; width: 10px; left: 2px; bottom: 2px; background-color: #888; transition: .2s; border-radius: 50%; }
                input:checked + .sk-slider { background-color: #6366f1; border-color: #818cf8; }
                input:checked + .sk-slider:before { transform: translateX(12px); background-color: white; }
                /* 列表项 */
                .sk-item-card { display: flex; flex-direction: column; background: #252529; margin-top: 4px; padding: 6px 8px; border-radius: 6px; border: 1px solid #333; gap: 6px; transition: opacity 0.2s, transform 0.2s, background 0.2s; }
                .sk-item-card.is-muted { opacity: 0.35; filter: grayscale(0.8); background: #151518; border-style: dashed; }
                /* Master OFF 状态 */
                .sk-ui-panel.is-disabled { opacity: 0.5; pointer-events: none; filter: grayscale(0.5); }
                .sk-ui-panel.is-disabled .sk-card-header, .sk-ui-panel.is-disabled .sk-weight-container { opacity: 0.6; }
                .sk-card-header { display: flex; align-items: center; gap: 8px; width: 100%; }
                /* 权重控制区域 */
                .sk-weight-container { display: flex; flex-direction: column; gap: 4px; width: 100%; padding-left: 36px; box-sizing: border-box; position: relative; }
                .sk-weight-row { display: flex; align-items: center; gap: 4px; width: 100%; }
                /* 触发词图标 - 绝对定位到开关下方 */
                .sk-trigger-icon { position: absolute; left: 0; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 4px; color: #fbbf24; transition: all 0.2s; font-size: 10px; }
                .sk-trigger-icon:hover { background: rgba(251, 191, 36, 0.15); transform: scale(1.1); }
                /* 占位符 */
                .sk-weight-placeholder { width: 22px; height: 22px; flex-shrink: 0; }
                /* 权重控制组 */
                .sk-weight-ctrl { display: flex; align-items: center; background: #000; border-radius: 4px; border: 1px solid #444; overflow: hidden; height: 22px; flex: 1; transition: all 0.2s; }
                .sk-weight-ctrl:hover { cursor: ns-resize; border-color: #6366f1 !important; }
                .sk-step-btn { width: 18px; line-height: 20px; text-align: center; background: #333; cursor: pointer; user-select: none; font-weight: bold; font-size: 12px; }
                .sk-step-btn:hover { background: #444; color: #818cf8; }
                .sk-weight-input { width: 100%; flex:1; background: transparent; color: #fff; border: none; text-align: center; font-size: 10px; font-family: monospace; outline: none; }
                .sk-weight-input.model { color: #fbbf24; }
                .sk-weight-input.clip { color: #60a5fa; }
                .sk-weight-input::-webkit-inner-spin-button { -webkit-appearance: none; }
                /* 标签 */
                .sk-weight-label { font-size: 9px; font-weight: bold; width: 12px; text-align: center; }
                .sk-label-m { color: #fbbf24; }
                .sk-label-c { color: #60a5fa; }
                /* 联动图标 */
                .sk-link-icon { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 4px; color: #555; transition: all 0.2s; border: 1px solid transparent; }
                .sk-link-icon.active { color: #e0e7ff; background: #3730a3; border-color: #4338ca; }
                .sk-link-icon:hover { background: #333; }
                .sk-tag-text { font-size: 9px; color: #a855f7; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
                .sk-tag-text:hover { text-decoration: underline; color: #d8b4fe; }
                /* 自定义 Tooltip */
                .sk-tooltip { position: fixed; background: rgba(15, 15, 20, 0.98); border: 1px solid rgba(255, 255, 255, 0.15); color: #e0e0e0; padding: 8px 12px; border-radius: 8px; font-size: 11px; pointer-events: none; z-index: 10002; box-shadow: 0 8px 24px rgba(0,0,0,0.6); backdrop-filter: blur(8px); max-width: 380px; word-wrap: break-word; overflow-wrap: anywhere; opacity: 0; transition: opacity 0.15s ease; }
                .sk-tooltip.visible { opacity: 1; }
                .sk-tooltip-item { display: flex; gap: 6px; margin-bottom: 4px; line-height: 1.4; }
                .sk-tooltip-item:last-child { margin-bottom: 0; }
                .sk-tooltip-label { color: #999; font-size: 10px; font-weight: bold; white-space: nowrap; flex-shrink: 0; }
                .sk-tooltip-value { color: #eee; font-size: 10px; flex: 1; }
                .sk-tooltip-hr { border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 6px 0; }
                .sk-tooltip-title { color: #fbbf24; font-weight: bold; font-size: 12px; margin-bottom: 6px; line-height: 1.4; }
                /* 简单的展开动画 */
                @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                .sk-anim-enter { animation: slideDown 0.2s ease-out; }
            `;
            document.head.appendChild(style);
        }
        
        // 全局 Tooltip 管理器
        if (!window.SKTooltipManager) {
            window.SKTooltipManager = {
                el: null,
                init() {
                    this.el = document.createElement("div");
                    this.el.className = "sk-tooltip";
                    document.body.appendChild(this.el);
                },
                show(text, x, y) {
                    if (!this.el) this.init();
                    this.el.innerHTML = text.replace(/\n/g, "<br>");
                    this.el.classList.add("visible");
                    
                    // 边界检查
                    const rect = this.el.getBoundingClientRect();
                    const padding = 15;
                    
                    // 水平检查
                    if (x + rect.width + padding > window.innerWidth) {
                        x = window.innerWidth - rect.width - padding;
                    }
                    if (x < padding) x = padding;
                    
                    // 垂直检查
                    if (y + rect.height + padding > window.innerHeight) {
                        y = window.innerHeight - rect.height - padding;
                    }
                    if (y < padding) y = padding;
                    
                    this.el.style.left = x + "px";
                    this.el.style.top = y + "px";
                },
                hide() {
                    if (this.el) this.el.classList.remove("visible");
                }
            };
        }

        app.registerExtension({
            name: "SK.LoraLoaderManager",
            async nodeCreated(node) {
                if (node.comfyClass === "SK_LoraLoaderManager") {
                    node.loraData = node.loraData || [];
                    node.globalOn = node.globalOn ?? true;
                    
                    // --- 同步逻辑提取 ---
                    // [FIX] 辅助函数：强制立即更新 Widget 值，消除 ComfyUI 运行时的不同步延迟
                    node._forceUpdateWidget = function() {
                        const w = node.widgets?.find(w => w.name === "lora_stack");
                        if (w) {
                             w.value = JSON.stringify({
                                 global_on: !!node.globalOn,
                                 loras: node.loraData
                             }, null, 2);
                        }
                    };

                    node.syncData = function() {
                        const payload = {
                            global_on: !!node.globalOn,
                            loras: node.loraData
                        };
                        const jsonValue = JSON.stringify(payload, null, 2);
                        
                        const w = node.widgets?.find(w => w.name === "lora_stack");
                        if (w) {
                            // 移除值对比判断，强制刷新 Widget 值和回调，确保穿透缓存
                            w.value = jsonValue;
                            if (w.callback) w.callback(w.value);
                            // 触发图表变化，确保后端感知
                            if (node.onGraphChanged) node.onGraphChanged();
                        }
                        // 同时持久化到 properties
                        node.properties.lora_data = node.loraData;
                        node.properties.global_on = !!node.globalOn;
                        node.properties.current_scheme = node.currentScheme;
                        
                        // 同步完成后标记画布脏
                        if (node.graph) {
                            node.graph.setDirtyCanvas(true);
                        }
                    };

                    // 防抖同步
                    node.syncDataDebounced = debounce(() => {
                        node.syncData();
                    }, 300);

                    // 外部添加接口
                    node.externalAddLora = function(name, tags) {
                        const finalName = normalizePath(name);

                        // 查重逻辑
                        if (node.loraData.some(d => normalizePath(d.name) === finalName)) {
                            if (window.SKToastManager) {
                                window.SKToastManager.warn(lang.t("mgr_node_warn_duplicate", [finalName]));
                            }
                            return false; // 返回失败
                        }
                        
                        node.loraData.push({
                            name: finalName,
                            strength_model: 1.0,
                            strength_clip: 1.0,
                            linked: true,
                            on: true,
                            tags: tags || ""
                        });
                        
                        node.renderLoraUI();
                        if (node._forceUpdateWidget) node._forceUpdateWidget();
                        node.syncDataDebounced();
                        return true; // 返回成功
                    };

                    // 还原并美化原始 lora_stack widget
                    const stackWidget = node.widgets?.find(w => w.name === "lora_stack");
                    if (stackWidget) {
                        stackWidget.type = "text"; 
                        stackWidget.readOnly = true;
                    }

                    // Scheme 切换
                    node.currentScheme = 1; // 1 | 2 | 3
                    
                    // 增加 Widget 供用户切换 Scheme (固定语言格式: 英文 (中文))
                    const schemeValues = [
                        "Side Drawer (侧边抽屉)",
                        "Top Panel (顶部筛选)",
                        "Floating Tool (悬浮工具)"
                    ];

                    const schemeIdFromValue = (value) => {
                        if (typeof value === "number") {
                            const n = Math.floor(value);
                            return n >= 1 && n <= 3 ? n : null;
                        }
                        if (typeof value !== "string") return null;
                        const v = value.trim();
                        if (!v) return null;

                        // 匹配固定格式
                        const idx = schemeValues.indexOf(v);
                        if (idx >= 0) return idx + 1;

                        // 兼容旧版或不同语言的名称
                        const tryLocales = ["en-US", "zh-CN", "zh-TW"];
                        for (const loc of tryLocales) {
                            const vals = [
                                lang.tForLocale(loc, "mgr_node_scheme_side") || "Side Drawer",
                                lang.tForLocale(loc, "mgr_node_scheme_top") || "Top Panel",
                                lang.tForLocale(loc, "mgr_node_scheme_float") || "Floating Tool"
                            ];
                            const idx = vals.indexOf(v);
                            if (idx >= 0) return idx + 1;
                        }

                        const legacy = ["Side Drawer", "Top Panel", "Floating Tool", "Top Filter", "Floating Tools"];
                        const legacyIdx = legacy.indexOf(v);
                        if (legacyIdx >= 0) {
                            if (v === "Top Filter") return 2;
                            if (v === "Floating Tools") return 3;
                            if (legacyIdx <= 2) return legacyIdx + 1;
                        }

                        return null;
                    };

                    // 优先寻找从 Python INPUT_TYPES 生成的 selector_mode widget
                    let schemeWidget = node.widgets?.find(w => w.name === "selector_mode");
                    if (schemeWidget) {
                        schemeWidget.options.values = schemeValues;
                        // 确保值在合法范围内
                        const currentVal = schemeValues[node.currentScheme - 1] || schemeValues[0];
                        if (schemeWidget.value !== currentVal) {
                            schemeWidget.value = currentVal;
                        }
                    } else {
                        // 兜底：如果没找到，手动创建一个，内部名称设为 selector_mode
                        // 这样 nodeDefs.json 依然可以生效 (通过匹配 widget 名称)
                        schemeWidget = node.addWidget("combo", "selector_mode", schemeValues[node.currentScheme - 1] || schemeValues[0], (v) => {}, { values: schemeValues });
                    }

                    // 设置统一的 callback
                    schemeWidget.callback = (v) => {
                         const id = schemeIdFromValue(v);
                         node.currentScheme = id || 1;
                         node.properties.current_scheme = node.currentScheme;
                         schemeWidget.value = schemeValues[node.currentScheme - 1] || schemeValues[0];
                         
                         // 如果 Selector 已经打开，实时切换
                         const selector = window.SKLoraSelector?.instance;
                         if (selector && selector.dialog.open) {
                             if (node.currentScheme === 1) selector.renderScheme1();
                             else if (node.currentScheme === 2) selector.renderScheme2();
                             else if (node.currentScheme === 3) selector.renderScheme3();
                             // 重新渲染列表，切换 Scheme 时重置分类为 All，防止过滤状态残留
                             selector.renderList('', lang.t("sel_all"));
                         }
                    };

                    // 移除旧的定时器逻辑，现在标题由 nodeDefs.json 控制

                    let container = document.createElement("div");
                    container.className = "sk-ui-panel";
                    container._node = node; // 绑定节点引用，供全局滚轮拦截器使用

                    const domWidget = node.addDOMWidget("lora_ui", "UI", container);
                    domWidget.computeSize = (width) => {
                        // 测量 DOM 真实高度 (scrollHeight 相对 LiteGraph 单位最稳定)
                        const oldMaxH = container.style.maxHeight;
                        container.style.maxHeight = "none";
                        const h = container.scrollHeight || 0;
                         container.style.maxHeight = oldMaxH;
                         return [width, h + 10]; // 10px 底部缓冲，确保间距一致
                     };

                    // --- 拖拽支持 (Drop Zone) ---
                    container.addEventListener("dragover", (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                        container.style.borderColor = "#818cf8";
                        container.style.background = "#1e1e24";
                    });
                    container.addEventListener("dragleave", (e) => {
                        e.preventDefault();
                        container.style.borderColor = "#333";
                        container.style.background = "transparent";
                    });
                    container.addEventListener("drop", (e) => {
                        e.preventDefault();
                        container.style.borderColor = "#333";
                        container.style.background = "transparent";
                        
                        const text = e.dataTransfer.getData("text/plain");
                        if (text) {
                             node.loraData.push({ 
                                 name: text, 
                                 strength_model: 1.0,
                                 strength_clip: 1.0,
                                 linked: true,
                                 on: true, 
                                 tags: "" 
                             });
                             node.renderLoraUI();
                        }
                    });

                    // 内部渲染逻辑 (原 renderLoraUI)
                    const renderInternal = () => {
                        if (!container) return;
                        
                        // 确保数据是数组
                        if (!Array.isArray(node.loraData)) {
                            node.loraData = [];
                        }

                        // 调整 Master 禁用状态样式
                        if (node.globalOn) {
                            container.classList.remove("is-disabled");
                        } else {
                            container.classList.add("is-disabled");
                        }

                        // 调整 Widget 顺序：lora_stack 放在 selector_mode 上方
                        const widgets = node.widgets || [];
                        const stackIdx = widgets.findIndex(w => w.name === "lora_stack");
                        const schemeIdx = widgets.findIndex(w => w.name === "selector_mode");
                        
                        if (stackIdx !== -1 && schemeIdx !== -1) {
                            const [stackW] = widgets.splice(stackIdx, 1);
                            // 重新找到 scheme 的索引（因为 splice 改变了原数组）
                            const newSchemeIdx = widgets.findIndex(w => w.name === "selector_mode");
                            widgets.splice(newSchemeIdx, 0, stackW);
                        }

                        container.innerHTML = "";
                        
                        // 顶部控制栏
                        const header = document.createElement("div");
                        header.style.display = "flex";
                        header.style.justifyContent = "space-between";
                        header.style.alignItems = "center";
                        header.style.marginBottom = "8px";
                        
                        const masterSwitchWrap = document.createElement("div");
                        masterSwitchWrap.style.display = "flex";
                        masterSwitchWrap.style.alignItems = "center";
                        masterSwitchWrap.style.gap = "6px";
                        
                        const masterLabel = document.createElement("span");
                        masterLabel.innerText = "Master";
                        masterLabel.style.fontSize = "11px";
                        masterLabel.style.fontWeight = "bold";
                        masterLabel.style.color = node.globalOn ? "#818cf8" : "#666";
                        
                        const masterSwitch = document.createElement("label");
                        masterSwitch.className = "sk-switch";
                        // Master 开关不受 .sk-panel-disabled 影响
                        masterSwitch.style.pointerEvents = "auto"; 
                        masterSwitch.innerHTML = `<input type="checkbox" ${node.globalOn ? "checked" : ""}> <span class="sk-slider"></span>`;
                        masterSwitch.querySelector("input").onchange = (e) => {
                            node.globalOn = e.target.checked;
                            masterLabel.style.color = node.globalOn ? "#818cf8" : "#666";
                            // 仅通过 CSS 类切换禁用状态，避免全量重绘
                            if (node.globalOn) {
                                container.classList.remove("is-disabled");
                            } else {
                                container.classList.add("is-disabled");
                            }
                            // 强制立即同步，消除 300ms 延迟
                            node.syncData();
                        };
                        
                        masterSwitchWrap.appendChild(masterLabel);
                        masterSwitchWrap.appendChild(masterSwitch);
                        
                        const addBtn = document.createElement("button");
                        addBtn.innerText = "+ ADD";
                        addBtn.style.padding = "2px 8px";
                        addBtn.style.fontSize = "10px";
                        addBtn.style.cursor = "pointer";
                        addBtn.style.background = "#312e81";
                        addBtn.style.color = "#fff";
                        addBtn.style.border = "none";
                        addBtn.style.borderRadius = "4px";
                        addBtn.onclick = () => {
                            const targetScheme = node.currentScheme || 1;
                            if (window.SKLoraSelector) {
                                // 修正：从 window.SKLoraSelector 类获取单例实例再调用 show
                                const selector = window.SKLoraSelector.getInstance ? 
                                               window.SKLoraSelector.getInstance() : 
                                               (window.SKLoraSelector.instance || new window.SKLoraSelector());
                                
                                selector.show((input) => {
                                    if (!input) return;
                                    const items = Array.isArray(input) ? input : [input];
                                    
                                    let addedCount = 0;
                                    let skippedCount = 0;

                                    items.forEach(item => {
                                        // 优先使用 path (完整路径)，回退到 name
                                        const finalName = normalizePath(item.path || item.name);

                                        // 严格查重：基于归一化路径比对
                                        if (node.loraData.some(d => normalizePath(d.name) === finalName)) {
                                            skippedCount++;
                                            return;
                                        }

                                        let weight = 1.0;
                                        if (item.weight) {
                                            if (typeof item.weight === 'string' && item.weight.includes('-')) {
                                                weight = parseFloat(item.weight.split('-')[0]);
                                            } else {
                                                weight = parseFloat(item.weight);
                                            }
                                        }
                                        if (isNaN(weight)) weight = 1.0;
                                        
                                        const tags = item.triggerWords || "";
                                        
                                        node.loraData.push({
                                            name: finalName,
                                            strength_model: weight,
                                            strength_clip: weight,
                                            linked: true,
                                            on: true,
                                            tags: tags
                                        });
                                        addedCount++;
                                    });
                                    
                                    if (addedCount > 0) {
                                        node.renderLoraUI();
                                        if (node._forceUpdateWidget) node._forceUpdateWidget();
                                        node.syncDataDebounced();

                                        // 同步 Selector 状态
                                        if (selector && selector.updateAddedStatus) {
                                            const newNames = items.map(i => normalizePath(i.path || i.name));
                                            selector.updateAddedStatus(newNames);
                                        }

                                        if (window.SKToastManager) {
                                            if (skippedCount > 0) {
                                                window.SKToastManager.success(lang.t("mgr_node_add_partial", [addedCount, skippedCount]));
                                            } else {
                                                window.SKToastManager.success(lang.t("mgr_node_add_success", [addedCount]));
                                            }
                                        }
                                    } else if (skippedCount > 0) {
                                        if (window.SKToastManager) {
                                            window.SKToastManager.warn(lang.t("mgr_node_add_all_skipped", [skippedCount]));
                                        }
                                    }
                                    
                                }, { scheme: targetScheme, currentData: node.loraData }); 
                            }
                        };
                        
                        header.appendChild(masterSwitchWrap);
                        header.appendChild(addBtn);
                        container.appendChild(header);

                        const listContainer = document.createElement("div");
                        listContainer.style.display = "flex";
                        listContainer.style.flexDirection = "column";
                        listContainer.style.gap = "6px";
                        container.appendChild(listContainer);

                        // 富文本悬停提示逻辑
                        const getRichTooltip = (item) => {
                            const normalizedName = normalizePath(item.name);
                            
                            // 兜底：如果全局数据为空，尝试重新获取（处理可能的延迟加载）
                            if (Object.keys(globalLoraData).length === 0 && !window._sk_fetching_data) {
                                window._sk_fetching_data = true;
                                api.fetchApi("/sk_manager/get_lora_data").then(r => r.json()).then(d => {
                                    for (const [k, v] of Object.entries(d)) globalLoraData[normalizePath(k)] = v;
                                    window._sk_fetching_data = false;
                                }).catch(e => {
                                    console.error("[SK-LoRA] [System] 重新获取全局数据失败:", e);
                                    window._sk_fetching_data = false;
                                });
                            }

                            let info = globalLoraData[normalizedName];
                            
                            // 如果直接通过路径找不到，尝试模糊匹配（处理路径分隔符、后缀差异及大小写）
                            if (!info) {
                                const cleanName = normalizedName.split('/').pop().replace(/\.[^/.]+$/, "").toLowerCase();
                                for (const [path, data] of Object.entries(globalLoraData)) {
                                    const pathClean = path.split('/').pop().replace(/\.[^/.]+$/, "").toLowerCase();
                                    // 匹配条件：1. 文件名相同 2. 标题相同 3. 路径包含该名称
                                    if (pathClean === cleanName || 
                                        (data.title && data.title.toLowerCase() === cleanName) ||
                                        (path.toLowerCase().includes(cleanName) && cleanName.length > 3)) {
                                        info = data;
                                        break;
                                    }
                                }
                            }
                            
                            info = info || {};
                            let html = "";
                            
                            // 标题
                            const displayTitle = info.title || item.name.split(/[\\\/]/).pop().replace(/\.[^/.]+$/, "");
                            html += `<div class="sk-tooltip-title">${displayTitle}</div>`;
                            html += `<div class="sk-tooltip-hr"></div>`;
                            
                            const rows = [];
                            
                            // 1. 路径 (从 lora 目录开始)
                            rows.push({ label: lang.t("tooltip_path"), value: item.name });
                            
                            // 2. 权重
                            if (info.weight !== "" && info.weight !== undefined && info.weight !== null) {
                                rows.push({ label: lang.t("tooltip_weight"), value: info.weight });
                            }
                            
                            // 3. 采样器
                            if (info.sampler !== "" && info.sampler !== undefined && info.sampler !== null) {
                                rows.push({ label: lang.t("tooltip_sampler"), value: info.sampler });
                            }
                            
                            // 4. 基础模型
                            if (info.base_model && info.base_model !== "Unknown" && info.base_model !== lang.t("sel_none")) {
                                rows.push({ label: lang.t("tooltip_base_model"), value: info.base_model });
                            }
                            
                            // 5. 触发词
                            const triggers = Array.isArray(info.trigger_words) ? info.trigger_words.join(", ") : (info.trigger_words || item.tags || "");
                            if (triggers) rows.push({ label: lang.t("trigger_label"), value: triggers });
                            
                            // 6. 备注 (限定字数)
                            if (info.notes) {
                                let notes = info.notes;
                                if (notes.length > 300) notes = notes.substring(0, 300) + "...";
                                rows.push({ label: lang.t("tooltip_notes"), value: notes });
                            }
                            
                            // 渲染行
                            rows.forEach((row, idx) => {
                                if (idx > 0) {
                                    html += `<div class="sk-tooltip-hr"></div>`;
                                }
                                html += `<div class="sk-tooltip-item">`;
                                html += `<span class="sk-tooltip-label">${row.label}:</span>`;
                                html += `<span class="sk-tooltip-value">${row.value}</span>`;
                                html += `</div>`;
                            });
                            
                            return html;
                        };

                        node.loraData.forEach((item, index) => {
                            const card = document.createElement("div");
                            card.className = `sk-item-card sk-anim-enter ${item.on ? "" : "is-muted"}`;
                            card.dataset.index = index;
                            
                            // 第一行：开关 + 名字 + 删除
                            const row1 = document.createElement("div");
                            row1.className = "sk-card-header";
                            
                            const itemSwitch = document.createElement("label");
                            itemSwitch.className = "sk-switch";
                            itemSwitch.innerHTML = `<input type="checkbox" ${item.on ? "checked" : ""}> <span class="sk-slider"></span>`;
                            itemSwitch.querySelector("input").onchange = (e) => {
                                item.on = e.target.checked;
                                if (item.on) card.classList.remove("is-muted");
                                else card.classList.add("is-muted");
                                // 强制立即同步，消除 300ms 延迟
                                node.syncData();
                            };
                            
                            const nameSpan = document.createElement("span");
                            const cleanName = item.name.split(/[\\\/]/).pop().replace(/\.[^/.]+$/, "");
                            nameSpan.innerText = cleanName;
                            nameSpan.style.fontSize = "11px";
                            nameSpan.style.flex = "1";
                            nameSpan.style.whiteSpace = "nowrap";
                            nameSpan.style.overflow = "hidden";
                            nameSpan.style.textOverflow = "ellipsis";
                            
                            // 名称悬停提示
                            nameSpan.onmouseenter = (e) => {
                                const content = getRichTooltip(item);
                                window.SKTooltipManager.show(content, e.clientX + 10, e.clientY + 10);
                            };
                            nameSpan.onmousemove = (e) => {
                                const content = getRichTooltip(item);
                                window.SKTooltipManager.show(content, e.clientX + 10, e.clientY + 10);
                            };
                            nameSpan.onmouseleave = () => {
                                window.SKTooltipManager.hide();
                            };
                            
                            const delBtn = document.createElement("span");
                            delBtn.innerHTML = Icons.get('x', '', 14);
                            delBtn.style.cursor = "pointer";
                            delBtn.style.display = "flex";
                            delBtn.style.alignItems = "center";
                            delBtn.style.color = "#666";
                            delBtn.onmouseover = () => delBtn.style.color = "#ef4444";
                            delBtn.onmouseout = () => delBtn.style.color = "#666";
                            delBtn.onclick = () => {
                                const removedName = node.loraData[index].name;
                                node.loraData.splice(index, 1);
                                node.renderLoraUI(); // 删除项需要全量重绘
                                
                                // 同步 Selector 状态
                                if (window.SKLoraSelector && window.SKLoraSelector.instance) {
                                    window.SKLoraSelector.instance.removeAddedStatus([removedName]);
                                }
                            };
                            
                            row1.appendChild(itemSwitch);
                            row1.appendChild(nameSpan);

                            row1.appendChild(delBtn);
                            card.appendChild(row1);

                            // 第二行：权重控制区域
                            const weightContainer = document.createElement("div");
                            weightContainer.className = "sk-weight-container";

                            // 触发词图标 (绝对定位在开关下方)
                            if (item.tags && item.tags.length > 0) {
                                const triggerIcon = document.createElement("div");
                                triggerIcon.className = "sk-trigger-icon";
                                triggerIcon.innerHTML = Icons.get('lightbulb', '', 14);
                                
                                triggerIcon.onmouseenter = (e) => {
                                    window.SKTooltipManager.show(`${lang.t("mgr_node_trigger_tip", [item.tags])}`, e.clientX + 10, e.clientY + 10);
                                };
                                triggerIcon.onmousemove = (e) => {
                                    window.SKTooltipManager.show(`${lang.t("mgr_node_trigger_tip", [item.tags])}`, e.clientX + 10, e.clientY + 10);
                                };
                                triggerIcon.onmouseleave = () => {
                                    window.SKTooltipManager.hide();
                                };
                                triggerIcon.onclick = (e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(item.tags).then(() => {
                                         window.SKTooltipManager.show(`${Icons.get('check', '', 14)} ${lang.t("mgr_node_trigger_copied")}!`, e.clientX + 10, e.clientY + 10);
                                         setTimeout(() => window.SKTooltipManager.hide(), 1000);
                                    });
                                };
                                weightContainer.appendChild(triggerIcon);
                            }

                            // Model 权重行
                            const modelRow = document.createElement("div");
                            modelRow.className = "sk-weight-row";
                            
                            const labelM = document.createElement("span");
                            labelM.className = "sk-weight-label sk-label-m";
                            labelM.innerText = "M";

                            const ctrlM = document.createElement("div");
                            ctrlM.className = "sk-weight-ctrl";
                            
                            const inputM = document.createElement("input");
                            inputM.type = "text"; // 改为 text 防止浏览器默认行为干扰
                            inputM.className = "sk-weight-input model";
                            inputM.value = item.strength_model.toFixed(2);
                            inputM.style.pointerEvents = "auto"; // 显式确保可交互

                            // 权重操作提示
                            const weightTip = lang.t("mgr_node_weight_tip");
                            inputM.onmouseenter = (e) => window.SKTooltipManager.show(weightTip, e.clientX + 10, e.clientY + 10);
                            inputM.onmousemove = (e) => window.SKTooltipManager.show(weightTip, e.clientX + 10, e.clientY + 10);
                            inputM.onmouseleave = () => window.SKTooltipManager.hide();

                            const btnDownM = document.createElement("div");
                            btnDownM.className = "sk-step-btn";
                            btnDownM.innerText = "-";
                            btnDownM.onclick = () => {
                                item.strength_model = Math.round((item.strength_model - 0.05) * 100) / 100;
                                inputM.value = item.strength_model.toFixed(2);
                                if (item.linked) {
                                    item.strength_clip = item.strength_model;
                                    const inputC = card.querySelector(".sk-weight-input.clip");
                                    if (inputC) inputC.value = item.strength_clip.toFixed(2);
                                }
                                if (node._forceUpdateWidget) node._forceUpdateWidget();
                                node.syncDataDebounced();
                            };

                            inputM.onkeydown = (e) => {
                                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                    e.preventDefault();
                                    const delta = e.key === "ArrowUp" ? 0.01 : -0.01;
                                    item.strength_model = Math.round((item.strength_model + delta) * 100) / 100;
                                    inputM.value = item.strength_model.toFixed(2);
                                    if (item.linked) {
                                        item.strength_clip = item.strength_model;
                                        const inputC = card.querySelector(".sk-weight-input.clip");
                                        if (inputC) inputC.value = item.strength_clip.toFixed(2);
                                }
                                if (node._forceUpdateWidget) node._forceUpdateWidget();
                                node.syncDataDebounced();
                            }
                            };

                            inputM.onchange = (e) => {
                                    item.strength_model = parseFloat(e.target.value) || 0;
                                    inputM.value = item.strength_model.toFixed(2);
                                    if (item.linked) {
                                        item.strength_clip = item.strength_model;
                                        const inputC = card.querySelector(".sk-weight-input.clip");
                                        if (inputC) inputC.value = item.strength_clip.toFixed(2);
                                }
                                if (node._forceUpdateWidget) node._forceUpdateWidget();
                                node.syncDataDebounced();
                            };

                                const btnUpM = document.createElement("div");
                            btnUpM.className = "sk-step-btn";
                            btnUpM.innerText = "+";
                            btnUpM.onclick = () => {
                                item.strength_model = Math.round((item.strength_model + 0.05) * 100) / 100;
                                inputM.value = item.strength_model.toFixed(2);
                                if (item.linked) {
                                    item.strength_clip = item.strength_model;
                                    const inputC = card.querySelector(".sk-weight-input.clip");
                                    if (inputC) inputC.value = item.strength_clip.toFixed(2);
                                }
                                if (node._forceUpdateWidget) node._forceUpdateWidget();
                                node.syncDataDebounced();
                            };

                            ctrlM.appendChild(btnDownM);
                            ctrlM.appendChild(inputM);
                            ctrlM.appendChild(btnUpM);

                            const linkIcon = document.createElement("div");
                            linkIcon.className = `sk-link-icon ${item.linked ? "active" : ""}`;
                            linkIcon.innerHTML = item.linked ? "🔗" : "🔓";
                            linkIcon.title = item.linked ? "Linked: CLIP follows Model" : "Unlinked: Independent control";
                            linkIcon.onclick = () => {
                                item.linked = !item.linked;
                                if (item.linked) item.strength_clip = item.strength_model;
                                node.renderLoraUI(); // 切换联动状态涉及 UI 隐藏/显示，建议重绘
                            };

                            modelRow.appendChild(labelM);
                            modelRow.appendChild(ctrlM);
                            modelRow.appendChild(linkIcon);
                            weightContainer.appendChild(modelRow);

                            // CLIP 权重行 (linked=true 时隐藏)
                            if (!item.linked) {
                                const clipRow = document.createElement("div");
                                clipRow.className = "sk-weight-row sk-anim-enter";
                                
                                const labelC = document.createElement("span");
                                labelC.className = "sk-weight-label sk-label-c";
                                labelC.innerText = "C";

                                const ctrlC = document.createElement("div");
                                ctrlC.className = "sk-weight-ctrl";
                                
                                const inputC = document.createElement("input");
                                inputC.type = "text"; // 改为 text 防止浏览器默认行为干扰
                                inputC.className = "sk-weight-input clip";
                                inputC.value = item.strength_clip.toFixed(2);
                                inputC.style.pointerEvents = "auto"; // 显式确保可交互

                                // 权重操作提示
                                const weightTipC = lang.t("mgr_node_weight_tip");
                                inputC.onmouseenter = (e) => window.SKTooltipManager.show(weightTipC, e.clientX + 10, e.clientY + 10);
                                inputC.onmousemove = (e) => window.SKTooltipManager.show(weightTipC, e.clientX + 10, e.clientY + 10);
                                inputC.onmouseleave = () => window.SKTooltipManager.hide();

                                const btnDownC = document.createElement("div");
                                btnDownC.className = "sk-step-btn";
                                btnDownC.innerText = "-";
                                btnDownC.onclick = () => {
                                    item.strength_clip = Math.round((item.strength_clip - 0.05) * 100) / 100;
                                    inputC.value = item.strength_clip.toFixed(2);
                                    if (node._forceUpdateWidget) node._forceUpdateWidget();
                                    node.syncDataDebounced();
                                };

                                inputC.onkeydown = (e) => {
                                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                        e.preventDefault();
                                        const delta = e.key === "ArrowUp" ? 0.01 : -0.01;
                                        item.strength_clip = Math.round((item.strength_clip + delta) * 100) / 100;
                                        inputC.value = item.strength_clip.toFixed(2);
                                        if (node._forceUpdateWidget) node._forceUpdateWidget();
                                        node.syncDataDebounced();
                                    }
                                };

                                inputC.onchange = (e) => {
                                    item.strength_clip = parseFloat(e.target.value) || 0;
                                    inputC.value = item.strength_clip.toFixed(2);
                                    if (node._forceUpdateWidget) node._forceUpdateWidget();
                                    node.syncDataDebounced();
                                };

                                const btnUpC = document.createElement("div");
                                btnUpC.className = "sk-step-btn";
                                btnUpC.innerText = "+";
                                btnUpC.onclick = () => {
                                    item.strength_clip = Math.round((item.strength_clip + 0.05) * 100) / 100;
                                    inputC.value = item.strength_clip.toFixed(2);
                                    if (node._forceUpdateWidget) node._forceUpdateWidget();
                                    node.syncDataDebounced();
                                };

                                ctrlC.appendChild(btnDownC);
                                ctrlC.appendChild(inputC);
                                ctrlC.appendChild(btnUpC);

                                const placeholder = document.createElement("div");
                                placeholder.className = "sk-weight-placeholder";

                                clipRow.appendChild(labelC);
                                clipRow.appendChild(ctrlC);
                                clipRow.appendChild(placeholder);
                                weightContainer.appendChild(clipRow);
                            }

                            card.appendChild(weightContainer);
                            listContainer.appendChild(card);
                        });

                        // 初始同步
                        node.syncData();

                        // 自动调整节点尺寸 (通过 LiteGraph 内置计算)
                        const updateSize = () => {
                            const minSize = node.computeSize();
                            const targetH = Math.max(minSize[1], 100);
                            node.setSize([node.size[0], targetH]);
                            app.canvas.setDirty(true, true);
                        };

                        // 立即调整 (处理 DOM 插入)
                        updateSize();
                    };

                    // 监听节点缩放，防止遮挡内容
                    node.onResize = function(size) {
                        const minSize = node.computeSize();
                        if (size[1] < minSize[1]) {
                            size[1] = minSize[1];
                        }
                    };

                    // 应用防抖 (100ms)
                    node.renderLoraUI = debounce(renderInternal, 100);
                    
                    // 初始渲染
                    node.renderLoraUI();

                    node.onConfigure = function(o) {
                        // 1. 数据同步 (优先从 properties 读取，兜底从 widget 读取)
                        if (node.properties.lora_data) {
                            node.loraData = node.properties.lora_data;
                        } else {
                            const w = node.widgets?.find(w => w.name === "lora_stack");
                            if (w && w.value && typeof w.value === 'string') {
                                try {
                                    const data = JSON.parse(w.value);
                                    if (data && typeof data === 'object' && !Array.isArray(data)) {
                                        node.loraData = data.loras || [];
                                        node.globalOn = data.global_on ?? true;
                                    } else {
                                        node.loraData = data || [];
                                    }
                                } catch (e) {
                                    console.error("[SK-LoRA] [System] 解析 lora_stack widget 值失败:", e);
                                }
                            }
                        }
                        if (node.properties.global_on !== undefined) {
                            node.globalOn = node.properties.global_on;
                        }
                        const restoredScheme = Number(node.properties.current_scheme);
                        if (restoredScheme >= 1 && restoredScheme <= 3) {
                            node.currentScheme = restoredScheme;
                        } else if (schemeWidget && schemeWidget.value) {
                            const id = schemeIdFromValue(schemeWidget.value);
                            if (id) node.currentScheme = id;
                        }

                        if (schemeWidget) {
                            // 使用固定的 schemeValues
                            schemeWidget.options.values = schemeValues;
                            schemeWidget.value = schemeValues[node.currentScheme - 1] || schemeValues[0];
                        }
                        node.properties.current_scheme = node.currentScheme;
                        
                        // 2. 数据迁移/补全 (确保 linked 状态持久化)
                        node.loraData.forEach(item => {
                            if (item.strength_model === undefined) item.strength_model = item.strength || 1.0;
                            if (item.strength_clip === undefined) item.strength_clip = item.strength || 1.0;
                            if (item.linked === undefined) item.linked = true;
                        });

                        // 3. 立即触发一次同步，确保 Widget 值正确
                        node.syncData();

                        // 4. 稳定渲染，增加重试机制
                        const forceRender = () => {
                            if (container && container.isConnected) {
                                node.renderLoraUI();
                            } else {
                                setTimeout(forceRender, 50);
                            }
                        };
                        setTimeout(forceRender, 100);
                    };

                    node.onSerialize = function(o) {
                        // 显式将当前内存中的数据同步到 properties
                        node.properties.lora_data = JSON.parse(JSON.stringify(node.loraData));
                        node.properties.global_on = node.globalOn;
                        node.properties.current_scheme = node.currentScheme;
                        // 确保序列化时 widget 也是最新的
                        node.syncData();
                    };

                    // 初次渲染
                    setTimeout(() => node.renderLoraUI(), 50);
                }
            }
        });
    };

    setup();
})();
