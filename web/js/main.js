import { api } from "/scripts/api.js";
import { app } from "/scripts/app.js";
import { ComfyButton } from "/scripts/ui/components/button.js";
import { LoraManagerDialog } from "./mgr_panel.js";
import { lang } from "./common/lang.js";
import { Icons } from "./common/icons.js";
import ToastManager from "./common/toast_manager.js";
import "./version.js";

const PLUGIN_ID = "SKNodes.SKLoraManager";

app.registerExtension({
    name: PLUGIN_ID,
    async setup() {
        try {
            const loraManager = new LoraManagerDialog();
            await loraManager.init();

            let isInitializing = true;

            const getSettingId = (section, name) => {
                const sectionOrder = {
                    'tab_version_info': '🪄 ',
                    'tab_basic_config': '1. ',
                    'tab_scraping_rules': '2. ',
                    'tab_card_settings': '3. ',
                    'tab_basemodel_mgr': '4. ',
                    'tab_advanced_settings': '5. '
                };
                
                const prefix = sectionOrder[section] || '';
                const title = section === 'tab_version_info' ? 'SKLoRA Manager' : lang.t(section);
                
                // 将前缀中的点号替换为全角点号（．），防止 ComfyUI 将其误认为 ID 层级分隔符导致标题显示异常
                const cleanPrefix = prefix.replace('.', '．');
                const sectionTitle = `${cleanPrefix}${title}`;
                
                return `SK-LoRA.${sectionTitle}.${name}`;
            };

            const settingVersionId = getSettingId('tab_version_info', 'Version');
            
            const settingCivitaiKeyId = getSettingId('tab_basic_config', 'CivitaiKey');

            // 注入 CSS 隐藏版本号输入框，并修复自定义 SVG 图标显示
            const style = document.createElement("style");
            style.innerHTML = `
                input[id="${settingVersionId}"] { display: none !important; }
                .sk-manager-btn { 
                    display: flex !important; 
                    align-items: center !important; 
                    gap: 6px !important; 
                    padding: 0 10px !important; 
                    height: 28px !important; 
                    background: #353535 !important; 
                    border: 1px solid #454545 !important; 
                    border-radius: 6px !important; 
                    transition: all 0.2s ease !important; 
                    cursor: pointer !important; 
                    color: white !important; 
                    box-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
                    margin: 0 4px !important;
                }
                .sk-manager-btn:hover { 
                    background: #454545 !important; 
                    border-color: #555555 !important;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important; 
                }
                .sk-manager-btn .comfy-ui-icon { 
                    display: flex !important; 
                    align-items: center; 
                    justify-content: center; 
                    background: transparent !important; 
                    mask: none !important; 
                    -webkit-mask: none !important; 
                    width: 16px !important; 
                    height: 16px !important; 
                }
                .sk-manager-btn .comfy-ui-icon svg { width: 16px; height: 16px; fill: currentColor; }
                .sk-manager-btn-text { 
                    font-size: 12px; 
                    font-weight: 500; 
                    color: #eee !important; 
                    white-space: nowrap; 
                    letter-spacing: 0.2px; 
                }
                
                /* 响应式：当窗口较窄时，隐藏文字，只保留图标，进一步节省空间 */
                @media screen and (max-width: 1280px) {
                    .sk-manager-btn-text { display: none !important; }
                    .sk-manager-btn { padding: 0 !important; width: 28px !important; justify-content: center !important; gap: 0 !important; }
                }

                /* 覆盖 ComfyUI 默认按钮样式可能带来的干扰 */
                .sk-manager-btn::after, .sk-manager-btn::before { display: none !important; }
            `;
            document.head.appendChild(style);

            const settingProxyId = getSettingId('tab_basic_config', 'Proxy');
            const settingShowBtnId = getSettingId('tab_basic_config', 'ShowButton');
            
            const settingImgModeId = getSettingId('tab_scraping_rules', 'ImgMode');
            const settingSyncWeightId = getSettingId('tab_scraping_rules', 'SyncWeight');
            const settingSyncSamplerId = getSettingId('tab_scraping_rules', 'SyncSampler');
            const settingSyncTriggersId = getSettingId('tab_scraping_rules', 'SyncTriggers');
            const settingCheckUpdateId = getSettingId('tab_scraping_rules', 'CheckUpdate');
            const settingVideoFrameId = getSettingId('tab_scraping_rules', 'VideoFrame');
            
            const settingNsfwLevelId = getSettingId('tab_card_settings', 'NsfwLevel');
            const settingNsfwImgModeId = getSettingId('tab_card_settings', 'NsfwImgMode');
            const settingTitleSourceId = getSettingId('tab_card_settings', 'TitleSource');
            const settingAllowEditId = getSettingId('tab_card_settings', 'AllowEdit');
            const settingDiffSyncId = getSettingId('tab_card_settings', 'DiffSync');
            
            const settingBaseModelMgrId = getSettingId('tab_basemodel_mgr', 'BaseModelMgr');
            
            const settingAdvancedSettingsId = getSettingId('tab_advanced_settings', 'AdvancedSettings');

            // 1. 创建按钮组 (提前创建以防 onChange 报错)
            this.btnGroup = document.createElement("div");
            this.btnGroup.className = "comfyui-button-group";
            this.btnGroup.style.display = "none";

            this.managerBtn = new ComfyButton({
                icon: "package-variant-closed",
                tooltip: lang.t('tooltip_manager'),
                action: () => loraManager.show(),
                classList: "comfyui-button primary sk-manager-btn"
            });

            this.btnGroup.appendChild(this.managerBtn.element);

            // 替换为自定义 SVG 图标并添加文字
            const updateBtnIcon = () => {
                if (!this.managerBtn || !this.managerBtn.element) return;
                
                const btnEl = this.managerBtn.element;
                const iconEl = btnEl.querySelector(".comfy-ui-icon");
                
                // 确保图标容器存在
                if (iconEl) {
                    // 直接注入 SVG 内容
                    iconEl.innerHTML = Icons.get('sk_logo_layers', '', 16);
                    // 强制清除可能干扰的样式
                    iconEl.style.background = "transparent";
                    iconEl.style.mask = "none";
                    iconEl.style.webkitMask = "none";
                    iconEl.style.display = "flex";
                    iconEl.style.width = "16px";
                    iconEl.style.height = "16px";
                    
                    // 确保内部 SVG 也是白色的且正确显示
                    const svg = iconEl.querySelector("svg");
                    if (svg) {
                        svg.style.stroke = "white";
                        svg.style.fill = "none";
                    }
                }

                // 添加文字内容 (如果不存在)
                let textSpan = btnEl.querySelector(".sk-manager-btn-text");
                if (!textSpan) {
                    textSpan = document.createElement("span");
                    textSpan.className = "sk-manager-btn-text";
                    textSpan.innerText = "SKLoRA";
                    btnEl.appendChild(textSpan);
                }
            };
            
            // 使用 MutationObserver 持续监控按钮，防止被 ComfyUI 还原
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' || mutation.type === 'attributes') {
                        updateBtnIcon();
                    }
                }
            });

            // 当按钮元素可用时开始观察
            const startObserving = () => {
                if (this.managerBtn && this.managerBtn.element) {
                    updateBtnIcon();
                    observer.observe(this.managerBtn.element, { 
                        childList: true, 
                        attributes: true, 
                        subtree: true 
                    });
                } else {
                    setTimeout(startObserving, 100);
                }
            };
            startObserving();

            // --- 版本信息 ---
            app.ui.settings.addSetting({
                id: settingVersionId,
                name: "Version: " + (window.SK_Lora_Manager_Version || "1.0.1"),
                type: "text",
                defaultValue: "",
                onChange: () => {} // 只读
            });

            // --- 基础配置 ---
            app.ui.settings.addSetting({
                id: settingCivitaiKeyId,
                name: lang.t('civitai_key'),
                tooltip: lang.t('civitai_key_placeholder'),
                type: "text",
                defaultValue: loraManager.localSettings.civitai_key || "",
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.civitai_key !== v) {
                        loraManager.localSettings.civitai_key = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingProxyId,
                name: lang.t('proxy_settings'),
                tooltip: lang.t('proxy_tip'),
                type: "text",
                defaultValue: loraManager.localSettings.proxy || "",
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.proxy !== v) {
                        loraManager.localSettings.proxy = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            /* 暂时隐藏设置项，默认开启
            app.ui.settings.addSetting({
                id: settingShowBtnId,
                name: lang.t('setting_show_btn'),
                type: "boolean",
                defaultValue: true,
                onChange: (v) => {
                    if (this.btnGroup) this.btnGroup.style.display = v ? "flex" : "none";
                }
            });
            */

            // --- 采集规则 ---
            app.ui.settings.addSetting({
                id: settingImgModeId,
                name: lang.t('image_mode'),
                tooltip: lang.t('image_mode_tip'),
                type: "combo",
                options: [
                    { value: "missing", text: lang.t('image_mode_missing') },
                    { value: "always", text: lang.t('image_mode_always') },
                    { value: "never", text: lang.t('image_mode_never') }
                ],
                defaultValue: loraManager.localSettings.img_mode || "missing",
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.img_mode !== v) {
                        loraManager.localSettings.img_mode = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingSyncWeightId,
                name: lang.t('fetch_weight'),
                tooltip: lang.t('fetch_weight_desc'),
                type: "boolean",
                defaultValue: loraManager.localSettings.sync_weight !== false,
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.sync_weight !== v) {
                        loraManager.localSettings.sync_weight = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingSyncSamplerId,
                name: lang.t('fetch_sampler'),
                tooltip: lang.t('fetch_sampler_desc'),
                type: "boolean",
                defaultValue: loraManager.localSettings.sync_sampler !== false,
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.sync_sampler !== v) {
                        loraManager.localSettings.sync_sampler = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingSyncTriggersId,
                name: lang.t('trigger_word_mode'),
                tooltip: lang.t('trigger_word_desc'),
                type: "combo",
                options: [
                    { value: "replace", text: lang.t('replace') },
                    { value: "merge", text: lang.t('merge') }
                ],
                defaultValue: loraManager.localSettings.sync_triggers || "replace",
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.sync_triggers !== v) {
                        loraManager.localSettings.sync_triggers = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingCheckUpdateId,
                name: lang.t('check_new_version'),
                tooltip: lang.t('check_new_version_desc'),
                type: "boolean",
                defaultValue: loraManager.localSettings.check_update !== false,
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.check_update !== v) {
                        loraManager.localSettings.check_update = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingVideoFrameId,
                name: lang.t('video_frame_preview'),
                tooltip: lang.t('video_frame_preview_desc'),
                type: "boolean",
                defaultValue: loraManager.localSettings.video_frame !== false,
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.video_frame !== v) {
                        loraManager.localSettings.video_frame = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            // --- 卡片设置 ---
            app.ui.settings.addSetting({
                id: settingNsfwLevelId,
                name: lang.t('nsfw_allow_level'),
                tooltip: lang.t('nsfw_level_desc'),
                type: "combo",
                options: [
                    { value: "1", text: lang.t('nsfw_pg') },
                    { value: "2", text: lang.t('nsfw_pg13') },
                    { value: "4", text: lang.t('nsfw_r') },
                    { value: "8", text: lang.t('nsfw_x') },
                    { value: "16", text: lang.t('nsfw_xxx') }
                ],
                defaultValue: String(loraManager.localSettings.nsfw_allow_level || "1"),
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (String(loraManager.localSettings.nsfw_allow_level) !== String(v)) {
                        loraManager.localSettings.nsfw_allow_level = parseInt(v);
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingNsfwImgModeId,
                name: lang.t('preview_img_mode'),
                tooltip: lang.t('preview_img_mode_desc'),
                type: "combo",
                options: [
                    { value: "show", text: lang.t('show_directly') },
                    { value: "blur", text: lang.t('blur_mode') },
                    { value: "hide", text: lang.t('hide_completely') }
                ],
                defaultValue: loraManager.localSettings.nsfw_img_mode || "blur",
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.nsfw_img_mode !== v) {
                        loraManager.localSettings.nsfw_img_mode = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingTitleSourceId,
                name: lang.t('model_title_setting'),
                tooltip: lang.t('model_title_setting_desc'),
                type: "combo",
                options: [
                    { value: "filename", text: lang.t('filename') },
                    { value: "civitai", text: lang.t('civitai_title') }
                ],
                defaultValue: loraManager.localSettings.model_card_title_source || "civitai",
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.model_card_title_source !== v) {
                        loraManager.localSettings.model_card_title_source = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingAllowEditId,
                name: lang.t('allow_edit_civitai_base'),
                tooltip: lang.t('allow_edit_civitai_base_desc'),
                type: "boolean",
                defaultValue: loraManager.localSettings.allow_civitai_basemodel_edit === true,
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.allow_civitai_basemodel_edit !== v) {
                        loraManager.localSettings.allow_civitai_basemodel_edit = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            app.ui.settings.addSetting({
                id: settingDiffSyncId,
                name: lang.t('civitai_diff_panel'),
                tooltip: lang.t('civitai_diff_panel_desc'),
                type: "boolean",
                defaultValue: loraManager.localSettings.use_diff_sync !== false,
                onChange: async (v) => {
                    if (isInitializing) return;
                    if (loraManager.localSettings.use_diff_sync !== v) {
                        loraManager.localSettings.use_diff_sync = v;
                        await loraManager.saveLocalSettings();
                    }
                }
            });

            // --- 底模管理 ---
            app.ui.settings.addSetting({
                id: settingBaseModelMgrId,
                name: lang.t('section_basemodel_manage'),
                tooltip: lang.t('tip_enable_disable'),
                type: () => {
                    const btn = document.createElement("button");
                    btn.innerText = lang.t('base_model_mgr_btn');
                    btn.className = "comfyui-button";
                    btn.style.width = "100%";
                    // 模仿图片中的蓝色按钮样式
                    btn.style.backgroundColor = "#4a90e2";
                    btn.style.color = "white";
                    btn.style.border = "none";
                    btn.style.padding = "8px 16px";
                    btn.style.borderRadius = "4px";
                    btn.style.cursor = "pointer";
                    btn.style.fontSize = "14px";
                    
                    btn.onmouseover = () => {
                        btn.style.backgroundColor = "#357abd";
                    };
                    btn.onmouseout = () => {
                        btn.style.backgroundColor = "#4a90e2";
                    };

                    btn.onclick = () => loraManager.showSettingsModal('basemodel');
                    
                    return btn;
                }
            });

            // --- 高级设置 ---
            app.ui.settings.addSetting({
                id: settingAdvancedSettingsId,
                name: lang.t('advanced_settings_title'),
                tooltip: lang.t('llm_activate_tooltip'),
                type: () => {
                    const btn = document.createElement("button");
                    btn.innerText = lang.t('advanced_settings_btn');
                    btn.className = "comfyui-button";
                    btn.style.width = "100%";
                    // 模仿图片中的蓝色按钮样式
                    btn.style.backgroundColor = "#4a90e2";
                    btn.style.color = "white";
                    btn.style.border = "none";
                    btn.style.padding = "8px 16px";
                    btn.style.borderRadius = "4px";
                    btn.style.cursor = "pointer";
                    btn.style.fontSize = "14px";

                    btn.onmouseover = () => {
                        btn.style.backgroundColor = "#357abd";
                    };
                    btn.onmouseout = () => {
                        btn.style.backgroundColor = "#4a90e2";
                    };

                    btn.onclick = () => loraManager.showSettingsModal('advanced');
                    
                    return btn;
                }
            });

            // 4. 初始化完成后，以后端配置为准强制更新 ComfyUI 缓存，并结束初始化状态
            const forceSyncToComfyUI = () => {
                app.ui.settings.setSettingValue(settingCivitaiKeyId, loraManager.localSettings.civitai_key || "");
                app.ui.settings.setSettingValue(settingProxyId, loraManager.localSettings.proxy || "");
                app.ui.settings.setSettingValue(settingImgModeId, loraManager.localSettings.img_mode || "missing");
                app.ui.settings.setSettingValue(settingSyncWeightId, loraManager.localSettings.sync_weight !== false);
                app.ui.settings.setSettingValue(settingSyncSamplerId, loraManager.localSettings.sync_sampler !== false);
                app.ui.settings.setSettingValue(settingSyncTriggersId, loraManager.localSettings.sync_triggers || "replace");
                app.ui.settings.setSettingValue(settingCheckUpdateId, loraManager.localSettings.check_update !== false);
                app.ui.settings.setSettingValue(settingVideoFrameId, loraManager.localSettings.video_frame !== false);
                app.ui.settings.setSettingValue(settingNsfwLevelId, String(loraManager.localSettings.nsfw_allow_level || "1"));
                app.ui.settings.setSettingValue(settingNsfwImgModeId, loraManager.localSettings.nsfw_img_mode || "blur");
                app.ui.settings.setSettingValue(settingTitleSourceId, loraManager.localSettings.model_card_title_source || "civitai");
                app.ui.settings.setSettingValue(settingAllowEditId, loraManager.localSettings.allow_civitai_basemodel_edit === true);
                app.ui.settings.setSettingValue(settingDiffSyncId, loraManager.localSettings.use_diff_sync !== false);
            };

            forceSyncToComfyUI();
            isInitializing = false;

            const tryInsert = () => {
                // 尝试多个可能的挂载点，适配不同版本的 ComfyUI (包括 V1 和 V2)
                const target = app.menu?.settingsGroup?.element || 
                             document.querySelector(".comfy-menu-btns") || 
                             document.querySelector(".comfyui-menu-right") ||
                             document.querySelector(".comfy-menu .comfy-list") ||
                             document.querySelector(".comfyui-header-right");
                
                if (target) {
                    if (!this.btnGroup.parentElement) {
                        // 如果是 V2 的 header-right，我们用 appendChild
                        if (target.classList.contains("comfyui-header-right") || target.classList.contains("comfyui-menu-right")) {
                            target.appendChild(this.btnGroup);
                        } else {
                            target.before(this.btnGroup);
                        }
                    }
                    
                    // 强制显示按钮，因为设置项已被隐藏且要求默认开启
                    this.btnGroup.style.display = "flex";
                    this.btnGroup.style.alignItems = "center";
                    this.btnGroup.style.gap = "4px";
                    this.btnGroup.style.visibility = "visible";
                    this.btnGroup.style.opacity = "1";
                    
                    // 确保按钮内容正确
                    updateBtnIcon();
                    
                    return true;
                }
                return false;
            };

            if (!tryInsert()) {
                const timer = setInterval(() => { if (tryInsert()) clearInterval(timer); }, 500);
            }
        } catch (e) { console.error("[SK-LoRA] [System] Failed to initialize:", e); }
    }
});