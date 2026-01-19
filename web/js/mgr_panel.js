import { api } from "/scripts/api.js";
import { app } from "/scripts/app.js";
import { lang } from "./common/lang.js";
import { Icons } from "./common/icons.js";
import ToastManager from "./common/toast_manager.js";
import { SKHealthUI } from "./sk_health_ui.js";

// 导出全局实例供其他脚本使用
window.SKToastManager = ToastManager;

// 定义来源常量与视觉配置
const MODEL_SOURCE = {
    CIVITAI: 'civitai',
    LIBLIB: 'liblib',
    MODELSCOPE: 'modelscope',
    HUGGINGFACE: 'huggingface',
    OTHER: 'other',
    LOCAL: 'local'
};

/**
 * 同步进度对话框类
 * 用于展示和管理模型同步的进度界面
 */
class SyncProgressDialog {
    constructor() {
        this.dialog = null;
        this.minimizedIcon = null;
        this.onCancel = null;
        this.onBackground = null;
        this.isMinimized = false;
        this.lang = lang;
        this.confirmTimer = null;
    }

    /**
     * 创建并初始化同步进度对话框
     * 
     * @param {string} type - 同步类型
     * @param {function} onCancel - 取消回调
     * @param {function} onBackground - 后台运行回调
     * @param {boolean} llmActive - 是否启用 LLM
     * @param {object} llmInfo - LLM 配置信息 { provider, alias, model }
     */
    create(type, onCancel, onBackground, llmActive = false, llmInfo = null) {
        this.onCancel = onCancel;
        this.onBackground = onBackground;
        
        const existing = document.querySelector('.sync-modal-overlay');
        if (existing) existing.remove();
        const existingIcon = document.querySelector('.sync-minimized-icon');
        if (existingIcon) existingIcon.remove();

        const title = this.lang.t('sync_civit');

        this.dialog = document.createElement('div');
        this.dialog.className = 'sync-modal-overlay';

        let llmTipHtml = '';
        if (llmActive && llmInfo) {
            const providerName = this.lang.t('llm_provider_' + llmInfo.provider) || llmInfo.provider;
            const displayName = llmInfo.alias || providerName;
            const modelName = llmInfo.model || 'Unknown';
            
            llmTipHtml = `
                <div class="sync-llm-tip active">
                    <span class="tip-icon">${Icons.get('bot', '', 16)}</span>
                    <span class="tip-text">${this.lang.t('sync_ai_enabled', [displayName, modelName])}</span>
                </div>
            `;
        } else if (!llmActive) {
            llmTipHtml = `
                <div class="sync-llm-tip disabled">
                    <span class="tip-icon">${Icons.get('bot', '', 16)}</span>
                    <span class="tip-text">${this.lang.t('sync_ai_disabled')}</span>
                </div>
            `;
        } else {
            // llmActive but no info yet
            llmTipHtml = `
                <div class="sync-llm-tip">
                    <span class="tip-icon">${Icons.get('bot', '', 16)}</span>
                    <span class="tip-text">${this.lang.t('llm_sync_tip')}</span>
                </div>
            `;
        }

        this.dialog.innerHTML = `
            <div class="sync-modal-dialog">
                <div class="sync-modal-header">
                    <span class="sync-modal-icon spin-animation">${Icons.get('hourglass', '', 24)}</span>
                    <span class="sync-modal-title">${title}</span>
                    <div class="sync-window-controls">
                        <button class="sync-btn-minimize" title="${this.lang.t('minimize')}">${Icons.get('minimize', '', 18)}</button>
                    </div>
                </div>
                ${llmTipHtml}
                <div class="sync-modal-dashboard">
                    <div class="sync-stats-row">
                         <div class="stat-item"><span class="stat-label">${this.lang.t('stats_total')}:</span> <span class="stat-val" id="sync-total">-</span></div>
                         <div class="stat-item"><span class="stat-label">${this.lang.t('stats_success')}:</span> <span class="stat-val success" id="sync-success">0</span></div>
                         <div class="stat-item"><span class="stat-label">${this.lang.t('stats_failed')}:</span> <span class="stat-val error" id="sync-failed">0</span></div>
                    </div>
                    <div class="dashboard-card">
                        <div class="dashboard-label">${this.lang.t('processing') || 'Processing'}:</div>
                        <div class="dashboard-value dashboard-filename" id="sync-filename">-</div>
                    </div>
                </div>
                
                <div class="sync-modal-progress">
                    <div class="progress-bar indeterminate"></div>
                    <div class="progress-text">${this.lang.t('preparing')}</div>
                </div>

                <div class="sync-list-header">${this.lang.t('details_log')}</div>
                <div class="sync-modal-logs" id="sync-logs"></div>

                <div class="sync-modal-footer">
                    <button class="sync-btn-abort">${this.lang.t('abort')}</button>
                    <button class="sync-btn-close" style="display: none;">${this.lang.t('close')}</button>
                </div>
            </div>
        `;

        this.dialog.querySelector('.sync-btn-minimize').onclick = () => this.minimize();
        this.dialog.querySelector('.sync-btn-abort').onclick = () => this.handleAbort();
        this.dialog.querySelector('.sync-btn-close').onclick = () => this.close();

        document.body.appendChild(this.dialog);
        
        this.minimizedIcon = document.createElement('div');
        this.minimizedIcon.className = 'sync-minimized-icon';
        this.minimizedIcon.style.display = 'none';
        this.minimizedIcon.innerHTML = `
            <div class="sync-mini-spinner"></div>
            <div class="sync-mini-text">0%</div>
        `;
        this.minimizedIcon.onclick = () => this.restore();
        document.body.appendChild(this.minimizedIcon);
    }

    /**
     * 更新同步进度状态
     * 
     * @param {object} status - 进度状态数据
     */
    update(status) {
        if (!this.dialog) return;

        const total = status.total || 0;
        const processed = status.processed || 0;
        const success = status.success || 0;
        const failed = status.failed || 0;
        
        this.dialog.querySelector('#sync-total').textContent = total;
        this.dialog.querySelector('#sync-success').textContent = success;
        this.dialog.querySelector('#sync-failed').textContent = failed;

        const filename = status.current_item ? status.current_item.split(/[\\/]/).pop() : '-';
        this.dialog.querySelector('#sync-filename').textContent = filename;

        const progressBar = this.dialog.querySelector('.progress-bar');
        const progressText = this.dialog.querySelector('.progress-text');
        
        let percentage = 0;
        if (total > 0) {
            percentage = Math.round((processed / total) * 100);
            progressBar.className = 'progress-bar determinate';
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${processed}/${total} (${percentage}%)`;
        } else {
             progressBar.className = 'progress-bar indeterminate';
        }

        if (this.minimizedIcon) {
            this.minimizedIcon.querySelector('.sync-mini-text').textContent = `${percentage}%`;
        }

        if (status.details && status.details.length > 0) {
             const logsContainer = this.dialog.querySelector('#sync-logs');
             logsContainer.innerHTML = '';
             status.details.slice().reverse().forEach(item => {
                 const div = document.createElement('div');
                 div.className = `log-entry ${item.status}`;
                 div.innerHTML = `<span class="log-status">[${item.status.toUpperCase()}]</span> <span class="log-name">${item.name}</span> <span class="log-msg">${item.msg || ''}</span>`;
                 logsContainer.appendChild(div);
             });
        }
    }
    
    /**
     * 最小化对话框
     */
    minimize() {
        this.isMinimized = true;
        this.dialog.style.display = 'none';
        this.minimizedIcon.style.display = 'flex';
        if (this.onBackground) this.onBackground();
    }

    /**
     * 还原对话框
     */
    restore() {
        this.isMinimized = false;
        this.dialog.style.display = 'flex';
        this.minimizedIcon.style.display = 'none';
    }
    
    /**
     * 处理中断请求，包含二次确认逻辑
     */
    handleAbort() {
        const btn = this.dialog.querySelector('.sync-btn-abort');
        if (!btn) return;

        // 第二次点击：确认中断
        if (this.confirmTimer) {
            clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
            
            if (this.onCancel) this.onCancel();
            
            btn.classList.remove('confirming');
            btn.disabled = true;
            btn.textContent = this.lang.t('stopping');
            return;
        }

        // 第一次点击：进入确认状态
        const originalText = btn.textContent;
        btn.classList.add('confirming');
        btn.textContent = this.lang.t('confirm_abort_q') || 'Confirm Abort?';

        // 3秒倒计时重置
        this.confirmTimer = setTimeout(() => {
            this.confirmTimer = null;
            if (this.dialog && btn) {
                btn.classList.remove('confirming');
                btn.textContent = originalText;
            }
        }, 3000);
    }

    /**
     * 显示完成状态汇总
     * 
     * @param {object} stats - 统计数据
     */
    showComplete(stats) {
        if (this.minimizedIcon) this.minimizedIcon.remove();
        this.restore();
        
        const progressBar = this.dialog.querySelector('.progress-bar');
        progressBar.className = 'progress-bar complete';
        progressBar.style.width = '100%';
        this.dialog.querySelector('.progress-text').textContent = this.lang.t('completed');
        
        this.dialog.querySelector('.sync-btn-abort').style.display = 'none';
        const closeBtn = this.dialog.querySelector('.sync-btn-close');
        closeBtn.style.display = 'inline-block';
        
        const logs = this.dialog.querySelector('#sync-logs');
        const summary = document.createElement('div');
        summary.className = 'sync-final-summary';
        summary.style.padding = '10px';
        summary.style.background = 'rgba(16, 185, 129, 0.1)';
        summary.style.borderRadius = '8px';
        summary.style.marginBottom = '10px';
        summary.innerHTML = `
            <h3 style="margin:0 0 5px 0; color:#10b981">${this.lang.t('sync_summary')}</h3>
            <div style="display:flex; gap:15px; font-size:13px">
                <span>${this.lang.t('stats_total')}: <b>${stats.total}</b></span>
                <span style="color:#10b981">${this.lang.t('stats_success')}: <b>${stats.success}</b></span>
                <span style="color:#ef4444">${this.lang.t('stats_failed')}: <b>${stats.failed}</b></span>
            </div>
        `;
        logs.insertBefore(summary, logs.firstChild);
    }

    /**
     * 显示错误信息
     * 
     * @param {string} msg - 错误信息内容
     */
    showError(msg) {
        if (this.minimizedIcon) this.minimizedIcon.remove();
        this.restore();
        
        const progressBar = this.dialog.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.className = 'progress-bar error';
            progressBar.style.width = '100%';
        }
        
        const progressText = this.dialog.querySelector('.progress-text');
        if (progressText) progressText.textContent = this.lang.t('error') || 'Error';
        
        const abortBtn = this.dialog.querySelector('.sync-btn-abort');
        if (abortBtn) abortBtn.style.display = 'none';
        
        const closeBtn = this.dialog.querySelector('.sync-btn-close');
        if (closeBtn) closeBtn.style.display = 'inline-block';
        
        const logs = this.dialog.querySelector('#sync-logs');
        if (logs) {
            const errDiv = document.createElement('div');
            errDiv.className = 'log-entry failed';
            errDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            errDiv.innerHTML = `<span class="log-status">[${(this.lang.t('error') || 'ERROR').toUpperCase()}]</span> <span class="log-name">${this.lang.t('system')}</span> <span class="log-msg" style="white-space:normal">${msg}</span>`;
            logs.innerHTML = '';
            logs.appendChild(errDiv);
        }
    }

    /**
     * 关闭并销毁对话框
     */
    close() {
        if (this.confirmTimer) {
            clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
        if (this.dialog) this.dialog.remove();
        if (this.minimizedIcon) this.minimizedIcon.remove();
        this.dialog = null;
        this.minimizedIcon = null;
    }
}

/**
 * Lora 管理器对话框主类
 * 负责 UI 渲染、数据同步及用户交互逻辑
 */
export class LoraManagerDialog {
    constructor() {
        this.uiRoot = null;
        this.loraData = {};
        this.currentFolder = "All";
        this.searchTerm = "";
        this.defaultImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='36' viewBox='0 0 24 36' fill='none' stroke='%23444' stroke-width='1'%3E%3Crect width='18' height='18' x='3' y='9' rx='2'/%3E%3Ccircle cx='9' cy='15' r='2'/%3E%3Cpath d='m21 21-3-3a2 2 0 0 0-2 0L6 27'/%3E%3C/svg%3E";
        
        this.baseModelSettings = {
            base_model_presets: ["SD 1.5", "SDXL", "SD 3.5", "Flux.1"],
            base_model_aliases: { "sd3": "SD 3.5", "xl": "SDXL", "1.5": "SD 1.5" }
        };
        
        this.localSettings = {
            civitai_key: "",
            proxy: "",
            img_mode: "missing",
            nsfw_img_mode: "blur",
            nsfw_allow_level: 1,
            sync_weight: true,
            sync_sampler: true,
            sync_triggers: "replace",
            check_update: true,
            video_frame: true,
            allow_civitai_basemodel_edit: false,
            model_card_title_source: "civitai",
            visible_system_names: ["SD 1.5", "SDXL", "SD 3.5", "Flux.1 D", "Flux.1 S"],
            active_llm_id: "",
            llm_configs: []
        };
        
        this.viewMode = localStorage.getItem('sk_lora_view_mode') || 'default';
        this.isSavingSettings = false;

        this.healthUI = new SKHealthUI(this);
    }

    /**
     * 从后端获取底模配置
     */
    async fetchBaseModelSettings() {
        try {
            const resp = await api.fetchApi("/lora_manager/get_basemodel_settings");
            if (resp.status === 200) {
                const data = await resp.json();
                this.baseModelSettings = { ...this.baseModelSettings, ...data };
            }
        } catch (e) { console.error("[SK-LoRA] [System] 获取底模配置失败", e); }
    }

    /**
     * 从后端获取本地设置
     */
    async fetchLocalSettings() {
        try {
            const resp = await api.fetchApi("/lora_manager/get_local_settings");
            if (resp.status === 200) {
                const data = await resp.json();
                this.localSettings = { ...this.localSettings, ...data };
                
                // 初始化标签黑名单
                if (!this.localSettings.tag_blacklist) {
                    this.localSettings.tag_blacklist = ["base model", "lora", "model", "style", "checkpoint", "stable diffusion", "sdxl", "sd1.5", "character", "clothing", "object"];
                }
            }
        } catch (e) { console.error("[SK-LoRA] [System] 获取本地设置失败", e); }
    }

    /**
     * 保存本地设置到后端
     */
    async saveLocalSettings() {
        try {
            const resp = await api.fetchApi("/lora_manager/save_local_settings", {
                method: "POST",
                body: JSON.stringify(this.localSettings)
            });
            return resp.status === 200;
        } catch (e) {
            console.error("[SK-LoRA] [System] 保存本地设置失败", e);
            return false;
        }
    }

    /**
     * 初始化管理器，获取设置并创建样式
     */
    async init() {
        await this.fetchBaseModelSettings();
        await this.fetchLocalSettings();
        this.createStyles();
    }

    /**
     * 获取文件名（不包含路径和后缀）
     * 
     * @param {string} path - 文件完整路径
     * @returns {string} 文件名
     */
    getFileName(path) {
        if (!path) return "";
        const fileName = path.split(/[\\/]/).pop();
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
        return nameWithoutExt;
    }

    /**
     * 更新侧边栏的统计数据展示
     */
    updateStatisticsDisplay() {
        if (!this.uiRoot) return;
        const sidebarTitle = this.uiRoot.querySelector(".sidebar-title");
        if (!sidebarTitle) return;
        
        let statsEl = sidebarTitle.querySelector(".sidebar-stats");
        if (!statsEl) {
            statsEl = document.createElement("div");
            statsEl.className = "sidebar-stats";
            sidebarTitle.appendChild(statsEl);
        }
        
        const num = this.localSettings.lora_num || 0;
        const cNum = this.localSettings.lora_c_num || 0;
        const size = this.localSettings.lora_total_size || "0M";
        
        statsEl.innerHTML = lang.t('total_loras', [num, cNum, size]);
    }

    /**
     * 切换卡片视图模式（默认/大图）
     */
    toggleViewMode() {
        this.viewMode = this.viewMode === 'default' ? 'large' : 'default';
        localStorage.setItem('sk_lora_view_mode', this.viewMode);
        this.updateViewModeUI();
    }

    /**
     * 根据当前视图模式更新 UI 状态
     */
    updateViewModeUI() {
        if (!this.uiRoot) return;
        const grid = this.uiRoot.querySelector(".lora-grid");
        const btn = this.uiRoot.querySelector(".btn-view-mode");
        
        if (this.viewMode === 'large') {
            if (grid) grid.classList.add('force-expand');
            if (btn) {
                btn.innerHTML = Icons.get('package_check', '', 16); 
            }
        } else {
            if (grid) grid.classList.remove('force-expand');
            if (btn) {
                btn.innerHTML = Icons.get('package_x', '', 16); 
            }
        }
    }

    /**
     * 计算模型统计数据（数量、大小等）并同步至后端
     */
    async calculateAndSaveStatistics() {
        const loras = Object.values(this.loraData || {});
        
        // 1. Lora总数
        const lora_num = loras.length;
        
        // 2. C站 Lora 数量
        const lora_c_num = loras.filter(l => 
            (l.civitai_model_id && String(l.civitai_model_id).length > 0) || (l.source && l.source.toLowerCase() === 'civitai')
        ).length;
        
        // 3. 总大小
        let totalBytes = 0;
        loras.forEach(l => {
            if (l.size) totalBytes += Number(l.size);
        });
        
        let lora_total_size = "0M";
        const MB = 1024 * 1024;
        const GB = 1024 * MB;
        
        if (totalBytes >= GB) {
            totalBytes = (totalBytes / GB).toFixed(2) + "G";
        } else {
            totalBytes = (totalBytes / MB).toFixed(2) + "M";
        }
        
        this.localSettings.lora_num = lora_num;
        this.localSettings.lora_c_num = lora_c_num;
        this.localSettings.lora_total_size = totalBytes;
        
        try {
            await api.fetchApi("/lora_manager/save_local_settings", {
                method: "POST",
                body: JSON.stringify(this.localSettings)
            });
            
            this.updateStatisticsDisplay();
            
        } catch (e) {
            console.error("[SK-LoRA] [System] 保存统计数据失败", e);
        }
    }

    /**
     * 更新 UI 中所有多语言文本
     */
    updateUITexts() {
        if (!this.uiRoot) return;

        const titleEl = this.uiRoot.querySelector(".sidebar-title");
        titleEl.innerHTML = `${lang.t('title')}`;
        this.updateStatisticsDisplay();

        const settingsBtn = this.uiRoot.querySelector(".btn-settings");
        settingsBtn.innerHTML = `${Icons.get('settings', '', 16)} ${lang.t('settings')}`;
        settingsBtn.onclick = () => this.showSettingsModal();

        const langBtn = this.uiRoot.querySelector(".btn-lang");
        if (langBtn) {
            const label = typeof lang.getLangButtonLabel === "function" ? lang.getLangButtonLabel() : (lang.t('lang_label') || Icons.get('globe', '', 16));
            langBtn.innerHTML = label;
            langBtn.title = `${lang.t('switch_language')} (系→简→EN→繁→系)`;
            
            langBtn.onclick = (e) => {
                e.stopPropagation();
                lang.nextLocale();
            };
        }

        this.uiRoot.querySelector(".search-input").placeholder = lang.t('search_placeholder');

        const viewBtn = this.uiRoot.querySelector(".btn-view-mode");
        if (viewBtn) {
            viewBtn.title = lang.t('toggle_view_mode');
        }

        const healthBtn = this.uiRoot.querySelector(".btn-health");
        if (healthBtn) {
            healthBtn.title = lang.t('health_center') || 'Health Center';
        }

        this.uiRoot.querySelector(".btn-local").innerHTML = `<span class="hourglass-icon">${Icons.get('hourglass', '', 14)}</span>${lang.t('sync_local')}`;
        this.uiRoot.querySelector(".btn-civit").innerHTML = `<span class="hourglass-icon">${Icons.get('hourglass', '', 14)}</span>${lang.t('sync_civit')}`;

        this.uiRoot.querySelector(".btn-close").title = lang.t('close_panel');

        this.renderContent();

        if (this.healthUI) {
            this.healthUI.refreshLanguage();
        }
    }

    /**
     * 上传预览图并更新 UI 和数据库
     * 
     * @param {string} path - 模型相对路径
     * @param {File} file - 图片文件对象
     * @param {HTMLElement} imgElement - 目标图片 DOM 元素
     */
    async uploadPreviewImage(path, file, imgElement) {
        if (!file || !path) return;
        console.log(`[SK-LoRA] [System] 正在上传预览图: ${path}`);

        const formData = new FormData();
        formData.append("model_path", path);
        formData.append("image", file);

        try {
            const resp = await api.fetchApi("/lora_manager/upload_preview", {
                method: "POST",
                body: formData
            });
            
            if (resp.status === 200) {
                const data = await resp.json();
                if (data.status === "success") {
                    console.log(`[SK-LoRA] [System] 上传成功，新路径: ${data.path}`);
                    if (this.loraData[path]) {
                        this.loraData[path].img = data.path;
                        this.loraData[path].mtime = data.mtime;
                        this.loraData[path].hash = data.hash;
                    } else {
                        console.warn(`[SK-LoRA] [System] 未在 loraData 中找到路径: ${path}`);
                    }

                    if (window.SKLoraSelector) {
                        window.SKLoraSelector.getInstance().refreshData();
                    }
                    
                    if (imgElement) {
                        const v = data.mtime ? `?v=${data.mtime}` : `?t=${Date.now()}`;
                        const h12 = (data.hash || "").substring(0, 12);
                        // 如果有 hash，尝试使用缩略图 API 刷新
                        let newSrc;
                        if (data.hash) {
                             newSrc = `/api/sk_manager/get_thumb?path=${encodeURIComponent(data.path)}&model_path=${encodeURIComponent(path)}&hash=${data.hash}${v.replace('?', '&')}`;
                        } else {
                             const encodedPath = data.path.replace(/\\/g, '/').split('/').map(part => encodeURIComponent(part)).join('/');
                             newSrc = `/sk_view_lora/${encodedPath}${v}`;
                        }
                        
                        console.log(`[SK-LoRA] [System] Updating imgElement.src to: ${newSrc}`);
                        imgElement.src = newSrc;
                        
                        // 如果之前是被隐藏的（hide模式），现在应该显示出来
                        const wrapper = imgElement.closest('.lora-img-wrapper');
                        if (wrapper) {
                            wrapper.classList.remove('is-hidden');
                            imgElement.classList.remove('sk-nsfw-hidden');
                        }
                    }
                    
                    ToastManager.success(lang.t('preview_upload_success'));
                    return true;
                } else {
                    ToastManager.error(data.message || lang.t('upload_failed_msg'));
                }
            } else {
                ToastManager.error(lang.t('upload_failed_status') + resp.status);
            }
        } catch (e) {
            console.error(`[SK-LoRA] [System] 上传失败: ${e}`);
            ToastManager.error(lang.t('upload_failed_msg') + e.message);
        }
        return false;
    }

    // 网址合法性检查工具
    _isValidUrl(str) {
        if (!str) return false;
        const pattern = new RegExp('^(https?:\\/\\/)' +
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
            '((\\d{1,3}\\.){3}\\d{1,3}))' +
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
            '(\\?[;&a-z\\d%_.~+=-]*)?' +
            '(\\#[-a-z\\d_]*)?$', 'i');
        return !!pattern.test(str);
    }

    // 从 URL 或 info 中提取模型来源
    _extractSourceFromUrl(url, info = null) {
        if (info && info.civitai_model_id) return MODEL_SOURCE.CIVITAI;
        if (!url) return MODEL_SOURCE.LOCAL;
        let hostname = "";
        try {
            let tempUrl = url;
            if (!url.startsWith('http')) {
                tempUrl = 'https://' + url;
            }
            const urlObj = new URL(tempUrl);
            hostname = urlObj.hostname.toLowerCase();
        } catch (e) {
            hostname = url.split('/')[0].toLowerCase();
        }

        // 匹配逻辑
        if (hostname.includes('civitai')) return MODEL_SOURCE.CIVITAI;
        if (hostname.includes('liblib')) return MODEL_SOURCE.LIBLIB;
        if (hostname.includes('modelscope')) return MODEL_SOURCE.MODELSCOPE;
        if (hostname.includes('huggingface') || hostname.includes('hf-mirror')) return MODEL_SOURCE.HUGGINGFACE;
        
        return MODEL_SOURCE.OTHER;
    }

    async updateFields(path, values) {
        try {
            await api.fetchApi("/sknodes/lora_mgr/update_item", {
                method: "POST",
                body: JSON.stringify({ path, values })
            });
            Object.assign(this.loraData[path], values);
            ToastManager.success(lang.t('save_success'));
            return true;
        } catch (e) { ToastManager.error(lang.t('save_error')); return false; }
    }

    // 日期格式化辅助方法
    _formatDate(val) {
        if (!val) return "0000.00.00";
        const date = new Date(typeof val === 'number' ? (val < 10000000000 ? val * 1000 : val) : val);
        if (isNaN(date.getTime())) return "0000.00.00";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}.${m}.${d}`;
    }

    // 权重格式化：强制浮点数格式 (如 1.0)
    _formatWeight(val) {
        if (val === undefined || val === null || val === "") return "";
        let clean = String(val).replace(/[~—]/g, '-').replace(/[^\d\.\-]/g, '');
        const toFixedNum = (s) => {
            const n = parseFloat(s);
            if (isNaN(n)) return "";

            // 检查原始字符串的小数位数
            const decimalMatch = s.match(/^[-+]?\d*\.(\d+)$/);
            if (decimalMatch) {
                const decimalDigits = decimalMatch[1].length;
                // 如果小数点后只有1位或2位，保持原样
                if (decimalDigits <= 2) {
                    return s;
                }
            }

            // 如果是整数，显示一位小数；否则显示两位小数
            return Number.isInteger(n) ? n.toFixed(1) : n.toFixed(2);
        };
        if (clean.includes('-')) {
            const parts = clean.split('-').filter(p => p.length > 0);
            if (parts.length >= 2) return `${toFixedNum(parts[0])}-${toFixedNum(parts[1])}`;
            else if (parts.length === 1) return toFixedNum(parts[0]);
        }
        return toFixedNum(clean);
    }

    _getNsfwLabel(level) {
        level = parseInt(level || 1);
        switch(level) {
            case 1: return "PG";
            case 2: return "PG-13";
            case 4: return "R";
            case 8: return "X";
            case 16: return "XXX";
            default: return "PG";
        }
    }

    /**
     * 显示美化后的提示窗
     */
    showTooltip(event, path, title, baseModel) {
        // 移除旧 tooltip
        this.hideTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'sk-mgr-tooltip';
        
        const shortPath = "\\loras\\" + path.replace(/\//g, '\\');
        const displayBaseModel = this.normalizeBaseModel(baseModel) || lang.t("sel_none") || "None";
        
        tooltip.innerHTML = `
            <div class="tooltip-label">${lang.t('model_name') || 'Model Name'}</div>
            <div class="tooltip-value" style="font-weight:600; color:#3b82f6;">${title}</div>
            <div class="tooltip-label">${lang.t('base_model') || 'Base Model'}</div>
            <div class="tooltip-value">${displayBaseModel}</div>
            <div class="tooltip-label">${lang.t('sel_meta_path') || 'Path'}</div>
            <div class="tooltip-value tooltip-path">${shortPath}</div>
        `;

        document.body.appendChild(tooltip);

        // 计算位置
        const rect = event.target.getBoundingClientRect();
        let left = event.clientX + 15;
        let top = event.clientY + 15;

        // 获取 tooltip 尺寸用于溢出检测
        const tooltipWidth = Math.min(500, tooltip.offsetWidth || 300);
        const tooltipHeight = tooltip.offsetHeight || 100; 

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 防溢出处理
        if (left + tooltipWidth > viewportWidth - 10) {
            left = event.clientX - tooltipWidth - 15;
        }
        if (top + tooltipHeight > viewportHeight - 10) {
            top = event.clientY - tooltipHeight - 15;
        }

        if (left < 10) left = 10;
        if (top < 10) top = 10;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';

        // 动画显示
        requestAnimationFrame(() => {
            tooltip.classList.add('visible');
        });
    }

    /**
     * 隐藏提示窗
     */
    hideTooltip() {
        const oldTooltips = document.querySelectorAll('.sk-mgr-tooltip');
        oldTooltips.forEach(tooltip => {
            tooltip.classList.remove('visible');
            setTimeout(() => tooltip.remove(), 200);
        });
    }

    // 归一化底模名称
    normalizeBaseModel(name) {
        if (!name) return "";
        const lower = name.toLowerCase().replace(/\s+/g, '');
        
        // 1. 检查系统预设
        const systemPresets = this.baseModelSettings.system_presets || [];
        for (const p of systemPresets) {
            // 检查名称
            if (p.name.toLowerCase().replace(/\s+/g, '') === lower) return p.name;
            // 检查别名
            if (p.aliases && Array.isArray(p.aliases)) {
                for (const alias of p.aliases) {
                    if (alias.toLowerCase().replace(/\s+/g, '') === lower) return p.name;
                }
            }
        }

        // 2. 检查用户自定义
        const userCustom = this.baseModelSettings.user_custom || [];
        for (const p of userCustom) {
            const pName = typeof p === 'string' ? p : p.name;
            if (pName.toLowerCase().replace(/\s+/g, '') === lower) return pName;
            // 如果是对象，也检查别名
            if (typeof p !== 'string' && p.aliases && Array.isArray(p.aliases)) {
                for (const alias of p.aliases) {
                    if (alias.toLowerCase().replace(/\s+/g, '') === lower) return pName;
                }
            }
        }

        return name; // 否则返回原名
    }

    async addNewPreset(name) {
        try {
            const resp = await api.fetchApi("/lora_manager/add_preset", {
                method: "POST",
                body: JSON.stringify({ preset: name })
            });
            if (resp.status === 200) {
                const data = await resp.json();
                if (data.status === "success") {
                    this.baseModelSettings = { ...this.baseModelSettings, ...data.settings };
                    return true;
                }
            }
        } catch (e) { console.error("[SK-LoRA] [System] 添加预设失败:", e); }
        return false;
    }

    async removePreset(name) {
        try {
            const resp = await api.fetchApi("/lora_manager/remove_preset", {
                method: "POST",
                body: JSON.stringify({ preset: name })
            });
            if (resp.status === 200) {
                const data = await resp.json();
                if (data.status === "success") {
                    this.baseModelSettings = { ...this.baseModelSettings, ...data.settings };
                    return true;
                }
            }
        } catch (e) { console.error("[SK-LoRA] [System] 移除预设失败:", e); }
        return false;
    }

    createStyles() {
        if (document.getElementById("sk-lora-style")) return;
        const style = document.createElement("style");
        style.id = "sk-lora-style";
        style.textContent = `
            .lora-manager-dialog { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; font-family: 'PingFang SC', sans-serif; color: #f8fafc; }
            .sk-svg-icon { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
            .sk-svg-icon svg { display: block; }
            .spin-animation .sk-svg-icon { animation: spin 2s linear infinite; }
            .lora-manager-content { width: 96%; height: 92%; background: #0f172a; display: flex; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b; pointer-events: auto; }
            .lora-sidebar { width: 240px; background: #1a1f2e; border-right: 1px solid #2d3748; display: flex; flex-direction: column; }
            .sidebar-title { padding: 30px 20px 15px; color: #f8fafc; font-size: 20px; font-weight: bold; border-bottom: 0px solid #2d3748; letter-spacing: 1px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
            .sidebar-stats { font-size: 11px; color: #cbd5e1; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 8px; text-align: center; width: 100%; border: 1px solid rgba(255,255,255,0.05); line-height: 1.6; }
            .folder-list { flex: 1; overflow-y: auto; padding: 15px 10px; }
            .folder-item { padding: 12px 15px; color: #94a3b8; cursor: pointer; border-radius: 8px; font-size: 14px; margin-bottom: 4px; transition: all 0.2s; display: flex; align-items: center; gap: 10px; }
            .folder-item:hover { background: rgba(255,255,255,0.05); color: #f8fafc; }
            .folder-item.active { background: #3b82f6; color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
            .sidebar-separator { height: 1px; background: linear-gradient(90deg, transparent, #2d3748, transparent); margin: 15px 15px; opacity: 0.6; }
            .sidebar-footer { padding: 20px; border-top: 1px solid #2d3748; display: flex; align-items: center; justify-content: space-between; }
            .btn-settings { display: flex; align-items: center; gap: 6px; color: #64748b; cursor: pointer; font-size: 14px; transition: color 0.2s; margin-right: auto; line-height: 1; }
            .btn-settings:hover { color: #3b82f6; }
            .btn-settings .sk-svg-icon { display: flex; align-items: center; }
            .btn-lang { cursor: pointer; font-size: 14px; color: #64748b; transition: all 0.2s; border: 1px solid #2d3748; padding: 0; border-radius: 4px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; }
            .btn-lang:hover { color: #3b82f6; border-color: #3b82f6; background: rgba(59, 130, 246, 0.1); transform: scale(1.05); }
            .btn-view-mode { cursor: pointer; font-size: 14px; color: #64748b; transition: all 0.2s; border: 1px solid #2d3748; padding: 0; border-radius: 4px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; margin-right: 6px; }
            .btn-view-mode:hover { color: #3b82f6; border-color: #3b82f6; background: rgba(59, 130, 246, 0.1); transform: scale(1.05); }
            .btn-health { cursor: pointer; font-size: 14px; color: #64748b; transition: all 0.2s; border: 1px solid #2d3748; padding: 0; border-radius: 4px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; margin-right: 6px; }
            .btn-health:hover { color: #6366f1; border-color: #6366f1; background: rgba(99, 102, 241, 0.1); transform: scale(1.05); }
            .lora-main { flex: 1; display: flex; flex-direction: column; background: #0b0f1a; position: relative; }
            .lora-header { padding: 15px 25px; background: #1a1f2e; display: flex; gap: 15px; align-items: center; border-bottom: 1px solid #2d3748; }
            .search-wrapper { position: relative; width: 50%; min-width: 200px; }
            .search-input { width: 100%; background: #0f172a; border: 1px solid #334155; color: white; padding: 10px 18px; border-radius: 20px; outline: none; font-size: 13px; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
            .btn-sync { padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 12px; color: white; white-space: nowrap; min-width: 80px; flex-shrink: 0; transition: all 0.2s ease; font-weight: 500; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
            .btn-local { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
            .btn-civit { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
            .btn-sync:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
            .btn-sync.syncing { opacity: 0.7; cursor: not-allowed; }
            .btn-sync.syncing:hover { transform: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
            .sync-btn-abort { padding: 6px 16px; border-radius: 6px; border: none; background: #475569; color: #f1f5f9; cursor: pointer; font-size: 13px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; }
            .sync-btn-abort:hover { background: #334155; }
            .sync-btn-abort.confirming { background-color: #ef4444; color: white; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3); }
            .sync-btn-abort.confirming::after { content: ''; position: absolute; bottom: 0; left: 0; height: 3px; background: rgba(255,255,255,0.5); width: 100%; animation: countdown 3s linear forwards; }
            @keyframes countdown { from { width: 100%; } to { width: 0%; } }
            .hourglass-icon { display: inline-block; margin-right: 5px; }
            .hourglass-icon.spinning { animation: spin 2s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .btn-close { background: rgba(107, 114, 128, 0.8); color: white; border: none; width: 36px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; margin-left: auto; flex-shrink: 0; font-weight: 300; line-height: 1; }
            .btn-close:hover { background: rgba(75, 85, 99, 0.9); transform: translateY(-1px); }
            .button-group { display: flex; gap: 10px; align-items: center; margin-left: auto; }
            .source-badge { position: absolute; top: 0; left: 0; color: white; font-size: 10px; font-weight: bold; padding: 3px 8px; border-top-left-radius: 12px; border-bottom-right-radius: 8px; z-index: 10; pointer-events: none; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 2px 2px 5px rgba(0,0,0,0.3); }
            .source-badge.civitai { background: #2563eb; }
            .source-badge.liblib { background: #ef4444; }
            .source-badge.modelscope { background: #6366f1; }
            .source-badge.huggingface { background: #ffbd2e; color: #000; }
            .source-badge.other { background: #64748b; }
            .source-badge.local { background: #10b981; }
            .sync-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 12000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); font-family: 'PingFang SC', sans-serif; }
            .sync-modal-dialog { width: 60%; background: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); display: flex; flex-direction: column; max-height: 85vh; }
            .sync-modal-header { padding: 20px; background: #0f172a; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 12px; }
            .sync-llm-tip { padding: 8px 20px; background: rgba(59, 130, 246, 0.1); border-bottom: 1px solid rgba(59, 130, 246, 0.2); color: #93c5fd; font-size: 12px; display: flex; align-items: center; gap: 8px; }
            .sync-llm-tip.active { background: rgba(16, 185, 129, 0.1); border-bottom-color: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
            .sync-llm-tip.disabled { background: rgba(100, 116, 139, 0.1); border-bottom-color: rgba(100, 116, 139, 0.2); color: #94a3b8; }
            .sync-modal-icon { font-size: 24px; }
            .sync-modal-title { font-size: 18px; font-weight: 600; color: #f8fafc; flex: 1; }
            .sync-window-controls { display: flex; gap: 8px; }
            .sync-btn-minimize { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; padding: 4px 8px; border-radius: 4px; transition: all 0.2s; line-height: 1; }
            .sync-btn-minimize:hover { background: rgba(255,255,255,0.1); color: #fff; }
            .sync-modal-dashboard { padding: 20px; background: #1e293b; }
            .sync-stats-row { display: flex; gap: 15px; margin-bottom: 15px; }
            .stat-item { flex: 1; background: rgba(15, 23, 42, 0.6); padding: 10px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid #334155; }
            .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            .stat-val { font-size: 18px; font-weight: bold; color: #f8fafc; font-variant-numeric: tabular-nums; }
            .stat-val.success { color: #10b981; }
            .stat-val.error { color: #ef4444; }
            .sync-modal-progress { padding: 0 20px 20px 20px; }
            .sync-list-header { padding: 10px 20px; background: #0f172a; font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid #334155; border-bottom: 1px solid #334155; }
            .sync-modal-logs { flex: 1; overflow-y: auto; background: #0b0f1a; min-height: 150px; padding: 10px; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 12px; }
            .log-entry { padding: 6px 10px; border-radius: 4px; margin-bottom: 2px; display: flex; gap: 8px; align-items: center; }
            .log-entry:hover { background: rgba(255,255,255,0.03); }
            .log-entry.success { color: #10b981; }
            .log-entry.failed { color: #ef4444; }
            .log-entry.pending { color: #94a3b8; }
            .log-status { font-weight: bold; opacity: 0.8; font-size: 10px; min-width: 55px; }
            .log-name { color: #e2e8f0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .log-msg { color: #64748b; font-size: 11px; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .sync-modal-footer { padding: 15px 20px; background: #0f172a; border-top: 1px solid #334155; display: flex; justify-content: flex-end; gap: 10px; }
            .sync-btn-abort { padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; }
            .sync-btn-abort:hover { background: #dc2626; }
            .sync-btn-abort:disabled { background: #94a3b8; cursor: not-allowed; }
            .sync-btn-close { padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; }
            .sync-btn-close:hover { background: #2563eb; }
            .sync-minimized-icon { position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; background: #1e293b; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 12000; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border: 2px solid #3b82f6; transition: all 0.3s; animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            .sync-minimized-icon:hover { transform: scale(1.1); }
            .sync-mini-spinner { width: 24px; height: 24px; border: 2px solid rgba(59, 130, 246, 0.3); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 2px; }
            .sync-mini-text { font-size: 10px; color: #f8fafc; font-weight: bold; }
            @keyframes popIn { from { transform: scale(0) rotate(-180deg); opacity: 0; } to { transform: scale(1) rotate(0deg); opacity: 1; } }
            .new-version-badge { position: absolute; top: 6px; right: 45px; background: #ef4444; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; z-index: 1001; box-shadow: 0 2px 4px rgba(0,0,0,0.3); animation: pulse 2s infinite; pointer-events: none; }
            @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.9; } 100% { transform: scale(1); opacity: 1; } }
            .lora-grid { flex: 1; overflow-y: auto; padding: 25px; display: grid; grid-template-columns: repeat(auto-fill, minmax(600px, 1fr)); gap: 20px; align-content: start; }
            .lora-card-container { height: 210px; position: relative; } 
            .lora-card { background: #1e293b; border-radius: 12px; border: 1px solid #334155; position: absolute; width: 100%; height: 210px; max-height: 210px; transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s, border-color 0.3s; display: flex; flex-direction: column; overflow: hidden; z-index: 1; }
            .lora-card:hover, .lora-card:focus-within, .lora-card.has-popup, .lora-card.manual-expand { height: auto; max-height: 800px; z-index: 1000; box-shadow: 0 20px 40px rgba(0,0,0,0.6); border-color: #3b82f6; }
            .settings-wrapper { position: absolute; top: 9px; right: 15px; width: 30px; height: 30px; z-index: 1002; display: flex; align-items: center; justify-content: center; }
            .settings-icon { cursor: pointer; color: #64748b; font-size: 18px; display: flex; align-items: center; justify-content: center; }
            .floating-menu { position: absolute; top: 0; right: 0; background: #1f2937; border: 1px solid #374151; border-radius: 8px; display: none; flex-direction: column; min-width: 140px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); padding: 4px; }
            .settings-wrapper:hover .floating-menu { display: flex; }
            .menu-item { padding: 8px 12px; font-size: 12px; color: #d1d5db; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease; }
            .menu-item svg { opacity: 0.7; transition: all 0.2s ease; flex-shrink: 0; }
            .menu-item:hover { background: #3b82f6; color: white; }
            .menu-item:hover svg { opacity: 1; transform: scale(1.05); }
            .menu-divider { height: 1px; background: #374151; margin: 4px 0; }
            .title-suffix { font-size: 11px; opacity: 0.5; margin-left: 2px; font-weight: normal; vertical-align: baseline; }
            .card-body-section { display: flex; gap: 18px; padding: 18px; height: 160px; max-height: 160px; box-sizing: border-box; transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
            .lora-card:hover .card-body-section, .lora-card:focus-within .card-body-section, .lora-card.has-popup .card-body-section, .lora-card.manual-expand .card-body-section { height: auto; max-height: 500px; }
            .lora-grid.force-expand { grid-auto-rows: min-content !important; align-items: start !important; }
            .lora-grid.force-expand .lora-card-container { height: auto !important; min-height: 0 !important; margin-bottom: 0 !important; position: relative !important; display: flex !important; flex-direction: column !important; }
            .lora-grid.force-expand .lora-card { position: relative !important; height: auto !important; max-height: none !important; border-color: #475569 !important; z-index: 1 !important; box-shadow: none !important; transition: none !important; overflow: visible !important; width: 100% !important; inset: auto !important; flex: 1 0 auto !important; }
            .lora-grid.force-expand .card-body-section { height: auto !important; max-height: none !important; display: flex !important; }
            .lora-grid.force-expand .lora-params-right { height: auto !important; max-height: none !important; overflow: visible !important; }
            .lora-grid.force-expand .notes-area { opacity: 1 !important; transform: none !important; display: flex !important; pointer-events: auto !important; padding-bottom: 10px !important; }
            .lora-grid.force-expand .lora-card:hover { z-index: 5 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important; border-color: #3b82f6 !important; transform: translateY(-2px); }
            .lora-img-wrapper { width: 124px; height: 124px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: #000; position: relative; }
            .lora-img-wrapper img { width: 100%; height: 100%; object-fit: cover; position: relative; z-index: 1; }
            .lora-img-wrapper img[src^="data:image/svg+xml"] { object-fit: contain; padding: 10%; }
            .sk-toggle-view { position: absolute; top: 8px; left: 8px; z-index: 100; width: 28px; height: 28px; border-radius: 50%; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #f8fafc; font-size: 14px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            .sk-toggle-view:hover { background: #3b82f6; color: white; transform: scale(1.1); border-color: rgba(255,255,255,0.3); }
            .sk-upload-btn { position: absolute; bottom: 8px; right: 8px; z-index: 100; width: 28px; height: 28px; border-radius: 50%; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #f8fafc; font-size: 14px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); opacity: 0; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            .lora-img-wrapper:hover .sk-upload-btn { opacity: 1; transform: translateY(0); }
            .sk-upload-btn:hover { background: #3b82f6; color: white; transform: scale(1.1); border-color: rgba(255,255,255,0.3); }
            .sk-nsfw-btn { width: 20px; height: 20px; border-radius: 4px; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; transition: all 0.2s; border: 1px solid #334155; position: relative; }
            .sk-nsfw-btn:hover { background: #334155; color: #ef4444; border-color: #ef4444; }
            .sk-nsfw-btn.active { color: #ef4444; border-color: #ef4444; background: rgba(239, 68, 68, 0.1); }
            .sk-nsfw-menu { position: absolute; bottom: calc(100% + 8px); left: 0; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 4px; display: none; flex-direction: row; gap: 2px; z-index: 1005; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
            .sk-nsfw-menu.visible { display: flex; }
            .sk-nsfw-item { padding: 3px 6px; font-size: 10px; color: #cbd5e1; cursor: pointer; border-radius: 4px; white-space: nowrap; transition: all 0.2s; }
            .sk-nsfw-item:hover { background: #334155; color: white; }
            .sk-nsfw-item.active { color: white; font-weight: bold; background: #ef4444; }
            @keyframes slideUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            .sk-nsfw-blur { filter: blur(40px) brightness(0.6); transition: all 0.4s ease; }
            .sk-nsfw-hidden { opacity: 0; transition: all 0.4s ease; }
            .sk-hidden-placeholder { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #111 url('https://liblib-api.liblib.art/img/nsfw_safe.webp') center/cover no-repeat; z-index: 1; pointer-events: none; opacity: 0; transition: opacity 0.4s; }
            .lora-img-wrapper.is-hidden .sk-hidden-placeholder { opacity: 1; }
            /* 自定义提示框样式 */
            .sk-mgr-tooltip { position: fixed; background: rgba(15, 23, 42, 0.95); border: 1px solid #334155; border-radius: 8px; padding: 12px; max-width: 500px; color: #f8fafc; font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter: blur(8px); z-index: 11000; pointer-events: none; opacity: 0; transform: translateY(10px); transition: opacity 0.2s, transform 0.2s; word-break: break-all; line-height: 1.4; }
            .sk-mgr-tooltip.visible { opacity: 1; transform: translateY(0); }
            .sk-mgr-tooltip .tooltip-label { color: #94a3b8; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
            .sk-mgr-tooltip .tooltip-value { margin-bottom: 8px; color: #f1f5f9; }
            .sk-mgr-tooltip .tooltip-value:last-child { margin-bottom: 0; }
            .sk-mgr-tooltip .tooltip-path { font-family: monospace; font-size: 12px; color: #3b82f6; }
            .lora-params-right { flex: 1; display: flex; flex-direction: column; height: 124px; max-height: 124px; overflow: hidden; justify-content: flex-start; transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
            .lora-card:hover .lora-params-right, .lora-card:focus-within .lora-params-right, .lora-card.has-popup .lora-params-right, .lora-card.manual-expand .lora-params-right { height: auto; max-height: 400px; overflow: visible; }
            .trigger-zone { flex: 0 1 auto; margin-bottom: 10px; align-self: flex-start; width: 100%; }
            .input-group-row { display: flex; gap: 12px; align-items: center; }
            .label-hint { font-size: 11px; color: #64748b; white-space: nowrap; }
            .sk-input-capsule { background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 5px 12px; border-radius: 20px; outline: none; font-size: 12px; }
            .sk-input-capsule.weight-v, .sk-input-capsule.sampler-v { text-align: center; }
            .sk-input-capsule:focus { border-color: #3b82f6; }
            .sk-input-capsule.invalid { border-color: #ef4444 !important; }
            .tags-container { display: flex; flex-wrap: wrap; gap: 8px; }
            .lora-tag-item, .lora-trigger-item { display: inline-flex; align-items: center; padding: 3px 4px 3px 4px; border-radius: 4px; font-size: 11px; color: white; gap: 6px; cursor: pointer; transition: transform 0.1s; position: relative; }
            .lora-tag-item:active, .lora-trigger-item:active { transform: scale(0.95); }
            .lora-tag-item { background: #4f46e5; }
            .lora-trigger-item { background: #2563eb; }
            .lora-tag-item .tag-x, .lora-trigger-item .tag-x { display: none; }
            .lora-tag-item, .lora-trigger-item { position: relative; }
            .tag-hover-tools { position: absolute; top: -28px; right: 0; background: #1c1c1c; border: 1px solid #444; border-radius: 4px; padding: 4px; display: flex; gap: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: all 0.2s ease; z-index: 100; white-space: nowrap; }
            /* 创建一个透明的连接区域，防止鼠标从标签移向工具条时工具条消失 */
            .tag-hover-tools::after { content: ''; position: absolute; bottom: -10px; left: 0; width: 100%; height: 10px; background: transparent; }
            .lora-tag-item:hover .tag-hover-tools, .lora-trigger-item:hover .tag-hover-tools { opacity: 1; pointer-events: auto; top: -32px; }
            .tag-tool-btn { width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; transition: all 0.2s; }
            .tag-tool-btn.promote { background: rgba(181, 228, 140, 0.2); color: #b5e48c; }
            .tag-tool-btn.promote:hover { background: #b5e48c; color: #000; }
            .tag-tool-btn.delete { background: rgba(255, 149, 149, 0.2); color: #ff9595; }
            .tag-tool-btn.delete:hover { background: #ff9595; color: #000; }
            .tag-add-btn { color: #3b82f6; cursor: pointer; font-size: 12px; border: 1px dashed #3b82f6; padding: 2px 8px; border-radius: 4px; }
            .lora-tag-item.base-model-tag { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border: 1px solid #f59e0b; font-weight: 500; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3); }
            .lora-tag-item { position: relative; overflow: visible; }
            .set-bm-btn { position: absolute; top: 0; left: -18px; width: 20px; height: 100%; background: #4f46e5; color: white; border-radius: 4px 0 0 4px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transform: translateX(-5px); transition: all 0.2s ease; box-shadow: -2px 0 4px rgba(0, 0, 0, 0.2); z-index: 10; }
            .lora-tag-item:hover .set-bm-btn { opacity: 1; transform: translateX(0); }
            .set-bm-btn:hover { background: #4338ca; box-shadow: -2px 0 6px rgba(0, 0, 0, 0.3); }
            .notes-area { padding: 0 18px 18px 18px; display: flex; flex-direction: column; gap: 10px; opacity: 0; transform: translateY(10px); transition: opacity 0.4s ease 0.1s, transform 0.4s ease 0.1s; }
            .lora-card:hover .notes-area, .lora-card:focus-within .notes-area, .lora-card.has-popup .notes-area, .lora-card.manual-expand .notes-area { opacity: 1; transform: translateY(0); }
            .notes-input { width: 100%; height: 70px; background: rgba(0,0,0,0.2); border: 1px solid #334155; color: #94a3b8; border-radius: 8px; padding: 10px; font-size: 12px; resize: none; outline: none; }
            .link-row { display: flex; align-items: center; gap: 8px; }
            .btn-copy { background: #3b82f6; color: white; border: none; padding: 4px 12px; border-radius: 15px; font-size: 11px; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
            .btn-copy:hover { background: #2563eb; }
            .btn-copy:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
            .btn-open { background: #10b981; color: white; border: none; padding: 4px 12px; border-radius: 15px; font-size: 11px; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
            .btn-open:hover { background: #059669; }
            .btn-open:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
            .info-divider { height: 1px; background: #2d3748; margin: 3px 0; }
            .info-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; font-size: 11px; color: #475569; margin-top: 4px; }
            .sk-toast { position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); background: #1e293b; color: white; padding: 10px 24px; border-radius: 30px; border: 1px solid #3b82f6; z-index: 10001; font-size: 13px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
             /* 同步弹窗样式 */
            .sync-modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px); z-index: 10000; display: flex; align-items: center; justify-content: center; font-family: 'PingFang SC', sans-serif; }
            .sync-modal-dialog { background: #1e293b; border-radius: 12px; padding: 24px; min-width: 660px; max-width: 1200px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); }
            .sync-modal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
            .sync-modal-icon { font-size: 24px; }
            .sync-modal-title { font-size: 18px; font-weight: 600; color: #f8fafc; }
            .sync-modal-dashboard { display: grid; grid-template-columns: 1fr; grid-template-rows: repeat(3, auto); gap: 12px; margin-bottom: 20px; }
            .dashboard-card { background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; }
            .dashboard-label { font-size: 11px; color: #64748b; margin-bottom: 0; min-width: 80px; }
            .dashboard-value { font-size: 13px; color: #f8fafc; text-align: right; flex: 1; overflow: hidden; text-overflow: ellipsis; }
            .dashboard-filename { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .dashboard-hash { font-family: 'Courier New', monospace; }
            .dashboard-status { display: flex; gap: 12px; justify-content: flex-end; }
            .sync-modal-progress { margin-bottom: 16px; }
            .progress-bar { height: 6px; background: #334155; border-radius: 3px; overflow: hidden; transition: width 0.3s ease; }
            .progress-bar.indeterminate { background: linear-gradient(90deg, #333 25%, #4facfe 50%, #333 75%); background-size: 200% 100%; animation: loading 1.5s infinite; }
            .progress-bar.determinate { background: linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%); }
            .progress-bar.complete { background: linear-gradient(90deg, #10b981 0%, #059669 100%); }
            .progress-bar.error { background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%); }
            .progress-text { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 6px; }
            .sync-modal-logs { background: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 12px; min-height: 60px; max-height: 100px; overflow-y: auto; margin-bottom: 16px; }
            /* Smart Base Model Slot Styles 卡片*/
            .base-model-slot { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 4px; font-size: 11px; gap: 6px; position: relative; transition: all 0.2s; user-select: none; border: 1px solid transparent; }
            .base-model-slot.empty { border: 1.5px dashed #555; color: #888; cursor: pointer; background: transparent; }
            .base-model-slot.empty:hover { border-color: #3b82f6; color: #3b82f6; }
            .base-model-slot.active { background: linear-gradient(135deg, #3a7bd5, #00d2ff); color: white; font-weight: bold; cursor: pointer; }
            .base-model-slot.active:hover { box-shadow: 0 0 8px rgba(0, 210, 255, 0.4); }
            .base-model-slot.readonly { cursor: default; opacity: 0.9; }
            .base-model-slot.readonly:hover { box-shadow: none; }
            .promote-btn { position: absolute; top: 0; left: -18px; width: 20px; height: 100%; background: linear-gradient(135deg, #3a7bd5, #00d2ff); color: white; border-radius: 4px 0 0 4px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transform: translateX(-5px); transition: all 0.2s ease; box-shadow: -2px 0 4px rgba(0, 0, 0, 0.2); z-index: 10; }
            .lora-tag-item:hover .promote-btn { opacity: 1; transform: translateX(0); }
            .promote-btn:hover { filter: brightness(1.1); }
            /** 快速/底模选择器样式 */
            .quick-picker { position: absolute; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 11000; display: flex; flex-direction: column; gap: 8px; max-width: 600px; box-sizing: border-box; font-family: sans-serif; }
            .quick-picker::before { content: ''; position: absolute; top: -6px; left: 15px; width: 10px; height: 10px; background: #0f172a; border-left: 1px solid #334155; border-top: 1px solid #334155; transform: rotate(45deg); }
            .picker-group { margin-bottom: 4px; width: 100%; box-sizing: border-box; }
            .picker-group:last-child { margin-bottom: 0; }
            .picker-grid { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; }
            .picker-btn { position: relative; background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; flex: 0 1 auto; max-width: 100%; display: inline-flex; align-items: center; justify-content: center; min-height: 24px; box-sizing: border-box; }
            .picker-btn.is-user-custom { border-left: 3px solid #6366f1; color: #c7d2fe; padding-right: 20px; }
            .picker-btn:hover { background: #334155; color: #fff; border-color: #6366f1; }
            .picker-del-btn { position: absolute; top: 0; right: 0; bottom: 0; width: 18px; background: rgba(0,0,0,0.2); color: #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer; opacity: 0; transition: all 0.1s; border-radius: 0 3px 3px 0; }
            .picker-btn:hover .picker-del-btn { opacity: 1; }
            .picker-del-btn:hover { background: #ef4444; color: white; }
            .picker-del-btn.confirming { position: absolute; top: 0; left: 0; width: 100%; height: 100%; min-width: 80px; background: #ef4444 !important; color: white !important; opacity: 1 !important; border-radius: 3px; z-index: 10; font-weight: bold; font-size: 10px; display: flex; justify-content: center; align-items: center; white-space: nowrap; animation: picker-pulse 1.5s infinite; }
            .picker-input-wrapper { display: flex; gap: 4px; margin-top: 4px; padding-top: 8px; border-top: 1px solid #1e293b; width: 100%; box-sizing: border-box; }
            .picker-input { flex: 1; min-width: 0; background: #020617; border: 1px solid #334155; color: #fff; padding: 5px 8px; border-radius: 4px; font-size: 11px; outline: none; box-sizing: border-box; }
            .picker-input:focus { border-color: #6366f1; }
            @keyframes picker-pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
            .log-entry { font-size: 11px; color: #94a3b8; margin-bottom: 4px; animation: fadeIn 0.3s ease; }
            .log-entry:first-child { color: #f8fafc; }
            .sync-summary { background: rgba(16, 185, 129, 0.1); border-radius: 8px; padding: 12px; margin-top: 12px; display: flex; align-items: center; justify-content: space-around; }
            .sync-summary div { font-size: 14px; font-weight: bold; color: #10b981; margin-bottom: 0; }
            .sync-modal-footer { display: flex; justify-content: flex-end; }
            .sync-modal-close-btn { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; transition: background 0.2s; }
            .sync-modal-close-btn:hover { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); }
            /* 系统 参数设置 */
            .settings-modal-dialog { background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 24px; width: 600px; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6); color: #ccc; }
            .settings-section { margin-bottom: 24px; }
            .settings-section-title { font-size: 14px; font-weight: bold; color: #f8fafc; margin-bottom: 12px; border-bottom: 1px solid #333; padding-bottom: 8px; }
            .settings-tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
            .settings-tag { padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; transition: all 0.2s; border: 1px solid #333; background: #333; color: #888; }
            .settings-tag:hover { background: #444; border-color: #555; }
            .settings-tag.active { background: #2d3748; color: #00d2ff; border-color: #00d2ff; font-weight: 500; box-shadow: 0 0 5px rgba(0, 210, 255, 0.2); }
            .maintenance-row { display: flex; gap: 12px; align-items: center; margin-top: 12px; }
            .btn-action { background: #333; color: #ccc; border: 1px solid #444; padding: 8px 16px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
            .btn-action:hover { background: #444; color: white; border-color: #666; }
            .file-input-wrapper { position: relative; overflow: hidden; display: inline-block; }
            .file-input-wrapper input[type=file] { font-size: 100px; position: absolute; left: 0; top: 0; opacity: 0; cursor: pointer; }
            .spin-animation { animation: rotate 2s linear infinite; }
            @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        `;
        document.head.appendChild(style);
    }


    async updateField(path, field, value) {
        if (field === "weight") value = this._formatWeight(value);
        try {
            await api.fetchApi("/sknodes/lora_mgr/update_item", {
                method: "POST",
                body: JSON.stringify({ path, values: { [field]: value } })
            });
            this.loraData[path][field] = value;
            ToastManager.success(lang.t('save_success'));
            return true;
        } catch (e) { ToastManager.error(lang.t('save_error')); return false; }
    }

    renderContent() {
        if (!this.uiRoot) return;
        const grid = this.uiRoot.querySelector(".lora-grid");
        grid.innerHTML = "";
        Object.entries(this.loraData).filter(([path, info]) => {
            let inFolder = this.currentFolder === "All" ? true : (this.currentFolder === "Favorites" ? !!info.is_fav : path.startsWith(this.currentFolder));

            // 增强搜索功能：搜索文件名、标题、标签、触发词等字段
            const searchTerm = this.searchTerm.toLowerCase();
            const inSearch = !searchTerm ||
                this.getFileName(path).toLowerCase().includes(searchTerm) ||
                (info.title && info.title.toLowerCase().includes(searchTerm)) ||
                (info.tags && info.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
                (info.trigger_words && info.trigger_words.some(word => word.toLowerCase().includes(searchTerm)));

            return inFolder && inSearch;
        }).forEach(([path, info]) => {
            let source = (info.civitai_model_id) ? MODEL_SOURCE.CIVITAI : (info.source ? info.source.toLowerCase() : this._extractSourceFromUrl(info.link, info));
            let badgeHtml = `<div class="source-badge ${Object.values(MODEL_SOURCE).includes(source) ? source : "other"}">${source.toUpperCase()}</div>`;
            if (info.new_version_available) {
                badgeHtml += `<div class="new-version-badge">${lang.t('new_version')}</div>`;
            }

            const container = document.createElement("div");
            container.className = "lora-card-container";
            
            // 修复路径编码：按 / 分割路径，对每段单独编码后再组合，保留路径层级结构
            let imgSrc = this.defaultImg;
            if (info.img) {
                const encodedPath = info.img.replace(/\\/g, '/').split('/').map(part => encodeURIComponent(part)).join('/');
                imgSrc = `/sk_view_lora/${encodedPath}?t=${Date.now()}`;
            }
            
            const filename = path.split('/').pop();
            let rawTitle = filename; // 默认使用文件名
            
            // 标题显示逻辑：
            // 如果设置为“使用C站标题”，且是C站模型，且有C站标题数据，则优先显示
            // 否则（设置为文件名、不是C站模型、没有C站标题）显示文件名
            if (this.localSettings.model_card_title_source === 'civitai' && source === 'civitai') {
                if (info.title) {
                    rawTitle = info.title;
                    if (info.version_name) {
                        rawTitle += ` - ${info.version_name}`;
                    }
                }
            }

            // 处理 .safetensors 后缀，用更小的字号显示
            let formattedTitle = rawTitle;
            if (formattedTitle.toLowerCase().endsWith('.safetensors')) {
                const base = formattedTitle.slice(0, -12);
                const suffix = formattedTitle.slice(-12);
                formattedTitle = `${base}<span class="title-suffix">${suffix}</span>`;
            }
            
            const displayTitle = info.is_fav ? `${Icons.get('star', 'sk-fav-icon', 14)} ${formattedTitle}` : formattedTitle;
            const isUrlValid = this._isValidUrl(info.link);

            // NSFW 过滤逻辑
            // userLevel: 面板设置等级 (1, 2, 4, 8, 16)
            // itemLevel: Lora的nsfw_level等级 (1, 2, 4, 8, 16)
            const userLevel = parseInt(this.localSettings.nsfw_allow_level || 1);
            const itemLevel = parseInt(info.nsfw_level || 1);
            const nsfwMode = this.localSettings.nsfw_img_mode || 'blur';

            let isFiltered = false;
            let filterClass = "";
            let isHidden = false;

            // 核心逻辑优化：如果模式是直接显示，则永远不触发过滤
            if (nsfwMode !== 'show' && itemLevel > userLevel) {
                isFiltered = true;
                if (nsfwMode === 'hide') {
                    isHidden = true;
                    filterClass = "sk-nsfw-hidden";
                } else {
                    filterClass = "sk-nsfw-blur";
                }
            }

            const shortPath = "\\loras\\" + path.replace(/\//g, '\\');

            container.innerHTML = `
                <div class="lora-card">
                    ${badgeHtml}
                    <div style="padding: 15px 18px 5px 18px; position:relative;">
                        <div class="lora-card-title" style="font-weight:bold; font-size:15px; margin-bottom:10px; padding-right:30px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor: help;">${displayTitle}</div>
                        <div class="settings-wrapper">
                            <div class="settings-icon">${Icons.get('settings', '', 18)}</div>
                            <div class="floating-menu">
                                <div class="menu-item action-apply">${Icons.get('menu_apply', '', 16)} ${lang.t('menu_apply')}</div>
                                <div class="menu-item action-fav">${info.is_fav ? Icons.get('menu_fav_remove', '', 16) : Icons.get('menu_fav_add', '', 16)} ${info.is_fav ? lang.t('menu_fav_del') : lang.t('menu_fav_add')}</div>
                                <div class="menu-divider"></div>
                                <div class="menu-item action-sync">${Icons.get('menu_sync', '', 16)} ${lang.t('menu_sync')}</div>
                                ${this.localSettings.llm_activate ? `<div class="menu-item action-fetch-url">${Icons.get('menu_ai', '', 16)} ${lang.t('menu_fetch_url')}</div>` : ''}
                                ${info.link ? `<div class="menu-item action-open-link">${Icons.get('menu_link', '', 16)} ${lang.t('open_link')}</div>` : ''}
                                <div class="menu-divider"></div>
                                <div class="menu-item action-copy-hash">${Icons.get('menu_hash', '', 16)} ${lang.t('menu_copy_hash')}</div>
                                <div class="menu-item action-copy-dir">${Icons.get('menu_folder', '', 16)} ${lang.t('menu_copy_dir')}</div>
                                <div class="menu-item action-copy-path">${Icons.get('menu_copy', '', 16)} ${lang.t('menu_copy_path')}</div>
                            </div>
                        </div>
                        <div style="height:0; border-top:1px solid #000; border-bottom:1px solid #334155;"></div>
                    </div>
                    <div class="card-body-section">
                        <div class="lora-img-wrapper ${isHidden ? 'is-hidden' : ''}">
                            <div class="sk-hidden-placeholder"></div>
                            <img class="lora-img ${filterClass}" src="${imgSrc}" loading="lazy" onerror="this.onerror=null; this.src='${this.defaultImg.replace(/'/g, "\\'")}'; this.style.objectFit='contain'; this.style.padding='10%';">
                            ${isFiltered ? `<div class="sk-toggle-view" data-state="filtered" title="${lang.t('toggle_nsfw')}">
                                <svg class="eye-icon-closed" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                            </div>` : ''}
                            
                            <div class="sk-upload-btn" title="${lang.t('click_or_drag_upload')}">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                            </div>
                            <input type="file" class="sk-file-input" style="display:none" accept="image/*">
                        </div>
                        <div class="lora-params-right">
                            <div class="label-hint" style="margin-bottom:6px;">${lang.t('trigger_label')}:</div>
                            <div class="trigger-zone tags-container" id="trig-p-${path.replace(/\W/g, '_')}"></div>
                            <div class="input-group-row">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <span class="label-hint">${lang.t('weight_label')}:</span>
                                    <input type="text" class="sk-input-capsule weight-v" style="width:70px" value="${this._formatWeight(info.weight)}">
                                </div>
                                <div style="display:flex; align-items:center; gap:5px; flex:1">
                                    <span class="label-hint">${lang.t('sampler_label')}:</span>
                                    <input type="text" class="sk-input-capsule sampler-v" style="width:100%" value="${info.sampler || ''}">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="notes-area">
                        <div class="label-hint" style="margin-bottom:8px;">${lang.t('tags_label')}:</div>
                        <div class="tags-container" id="tags-p-${path.replace(/\W/g, '_')}" style="margin-bottom:15px;"></div>
                        <textarea class="notes-input" placeholder="${lang.t('notes_placeholder')}">${info.notes || ''}</textarea>
                        
                        <div class="link-row">
                            <span class="label-hint">${lang.t('link_label')}:</span>
                            <input type="text" class="sk-input-capsule link-v ${info.link && !isUrlValid ? 'invalid' : ''}" style="flex:1" value="${info.link || ''}" placeholder="${lang.t('link_placeholder')}">
                            <button class="btn-copy" ${!isUrlValid ? 'disabled' : ''}>${lang.t('copy_btn')}</button>
                            <button class="btn-open" ${!isUrlValid ? 'disabled' : ''}>${lang.t('open_btn')}</button>
                        </div>

                        <div class="info-divider"></div>
                        <div class="info-footer">
                            <div class="sk-nsfw-wrapper" style="position: relative; display: flex; align-items: center; margin-right: auto;">
                                <!-- NSFW 分级按钮 -->
                                <div class="sk-nsfw-btn ${info.nsfw_level > 1 ? 'active' : ''}" title="NSFW 等级: ${this._getNsfwLabel(info.nsfw_level)}">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                </div>
                                <!-- 悬浮菜单 -->
                                <div class="sk-nsfw-menu">
                                    <div class="sk-nsfw-item ${info.nsfw_level == 1 ? 'active' : ''}" data-val="1">PG</div>
                                    <div class="sk-nsfw-item ${info.nsfw_level == 2 ? 'active' : ''}" data-val="2">PG-13</div>
                                    <div class="sk-nsfw-item ${info.nsfw_level == 4 ? 'active' : ''}" data-val="4">R</div>
                                    <div class="sk-nsfw-item ${info.nsfw_level == 8 ? 'active' : ''}" data-val="8">X</div>
                                    <div class="sk-nsfw-item ${info.nsfw_level == 16 ? 'active' : ''}" data-val="16">XXX</div>
                                </div>
                            </div>
                            ${info.published ? `<span>${lang.t('published_date')}：${this._formatDate(info.published)}</span>` : ""}
                            <span>${lang.t('added_date')}：${this._formatDate(info.mtime)}</span>
                        </div>
                    </div>
                </div>`;

            this.renderTags(container.querySelector(`#trig-p-${path.replace(/\W/g, '_')}`), path, info.trigger_words || [], "trigger_words", "bg-trigger");
            this.renderTags(container.querySelector(`#tags-p-${path.replace(/\W/g, '_')}`), path, info.tags || [], "tags", "bg-custom");

            // 绑定标题美化提示窗
            const titleEl = container.querySelector(".lora-card-title");
            if (titleEl) {
                titleEl.onmouseenter = (e) => this.showTooltip(e, path, rawTitle, info.base_model);
                titleEl.onmouseleave = () => this.hideTooltip();
            }

            // 输入绑定
            const bindInput = (selector, field) => {
                const el = container.querySelector(selector);
                el.onblur = (e) => { if (e.target.value !== (info[field] || '')) this.updateField(path, field, e.target.value); };
                el.onkeydown = (e) => { if (e.key === 'Enter') el.blur(); };
            };
            bindInput(".weight-v", "weight");
            bindInput(".sampler-v", "sampler");
            bindInput(".notes-input", "notes");

            // 链接框特殊处理：实时校验+保存
            const linkInput = container.querySelector(".link-v");
            const copyBtn = container.querySelector(".btn-copy");
            const openBtn = container.querySelector(".btn-open");

            // NSFW 按钮和菜单事件
            const nsfwBtn = container.querySelector(".sk-nsfw-btn");
            const nsfwMenu = container.querySelector(".sk-nsfw-menu");
            
            if (nsfwBtn && nsfwMenu) {
                // 切换菜单
                nsfwBtn.onclick = (e) => {
                    e.stopPropagation();
                    // 先关闭其他菜单
                    document.querySelectorAll('.sk-nsfw-menu.visible').forEach(m => {
                        if (m !== nsfwMenu) m.classList.remove('visible');
                    });
                    nsfwMenu.classList.toggle("visible");
                };

                // 点击外部关闭
                const closeMenu = (e) => {
                    if (!nsfwMenu.contains(e.target) && e.target !== nsfwBtn) {
                        nsfwMenu.classList.remove("visible");
                    }
                };
                document.addEventListener('click', closeMenu);

                // 菜单项点击
                nsfwMenu.querySelectorAll(".sk-nsfw-item").forEach(item => {
                    item.onclick = async (e) => {
                        e.stopPropagation();
                        const val = parseInt(item.getAttribute("data-val"));
                        if (val !== info.nsfw_level) {
                            const success = await this.updateField(path, "nsfw_level", val);
                            if (success) {
                                // 立即更新 UI
                                info.nsfw_level = val;
                                nsfwBtn.title = `NSFW 等级: ${this._getNsfwLabel(val)}`;
                                
                                // 更新按钮激活状态
                                if (val > 1) {
                                    nsfwBtn.classList.add("active");
                                } else {
                                    nsfwBtn.classList.remove("active");
                                }
                                
                                // 更新菜单项激活状态
                                nsfwMenu.querySelectorAll(".sk-nsfw-item").forEach(i => i.classList.remove("active"));
                                item.classList.add("active");
                                
                                nsfwMenu.classList.remove("visible");
                                
                                // 重新应用过滤和眼睛图标逻辑
                                const userLevel = parseInt(this.localSettings.nsfw_allow_level || 1);
                                const nsfwMode = this.localSettings.nsfw_img_mode || 'blur';
                                const img = container.querySelector(".lora-img");
                                const imgWrapper = container.querySelector(".lora-img-wrapper");
                                
                                if (img && imgWrapper && nsfwMode !== 'show') {
                                    // 移除现有眼睛图标（如果有）
                                    const oldEye = imgWrapper.querySelector(".sk-toggle-view");
                                    if (oldEye) oldEye.remove();

                                    if (val > userLevel) {
                                        // 添加眼睛图标
                                        const eyeDiv = document.createElement("div");
                                        eyeDiv.className = "sk-toggle-view";
                                        eyeDiv.dataset.state = "filtered";
                                        eyeDiv.title = lang.t('toggle_nsfw');
                                        eyeDiv.innerHTML = `<svg class="eye-icon-closed" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
                                        
                                        // 绑定眼睛图标切换逻辑
                                        eyeDiv.onclick = (e) => {
                                            e.stopPropagation();
                                            const isFiltered = eyeDiv.dataset.state === "filtered";
                                            if (isFiltered) {
                                                eyeDiv.dataset.state = "visible";
                                                eyeDiv.innerHTML = `<svg class="eye-icon-open" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                                                img.classList.remove("sk-nsfw-blur", "sk-nsfw-hidden");
                                                imgWrapper.classList.remove("is-hidden");
                                            } else {
                                                eyeDiv.dataset.state = "filtered";
                                                eyeDiv.innerHTML = `<svg class="eye-icon-closed" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
                                                if (nsfwMode === 'hide') {
                                                    imgWrapper.classList.add('is-hidden');
                                                    img.classList.add("sk-nsfw-hidden");
                                                } else {
                                                    img.classList.add("sk-nsfw-blur");
                                                }
                                            }
                                        };
                                        imgWrapper.appendChild(eyeDiv);

                                        // 应用初始过滤
                                        if (nsfwMode === 'hide') {
                                            imgWrapper.classList.add('is-hidden');
                                            img.classList.add("sk-nsfw-hidden");
                                            img.classList.remove("sk-nsfw-blur");
                                        } else {
                                            imgWrapper.classList.remove('is-hidden');
                                            img.classList.add("sk-nsfw-blur");
                                            img.classList.remove("sk-nsfw-hidden");
                                        }
                                    } else {
                                        // 等级安全，移除所有过滤
                                        imgWrapper.classList.remove('is-hidden');
                                        img.classList.remove("sk-nsfw-hidden", "sk-nsfw-blur");
                                    }
                                }
                            }
                        } else {
                            nsfwMenu.classList.remove("visible");
                        }
                    };
                });
            }

            linkInput.oninput = (e) => {
                const val = e.target.value.trim();
                const valid = this._isValidUrl(val);
                if (val === "") { 
                    linkInput.classList.remove("invalid"); 
                    copyBtn.disabled = true; 
                    openBtn.disabled = true;
                }
                else if (valid) { 
                    linkInput.classList.remove("invalid"); 
                    copyBtn.disabled = false; 
                    openBtn.disabled = false;
                }
                else { 
                    linkInput.classList.add("invalid"); 
                    copyBtn.disabled = true; 
                    openBtn.disabled = true;
                }

                // 实时更新来源徽章
                const inferredSource = this._extractSourceFromUrl(val, info);
                let badge = container.querySelector(".source-badge");
                if (!badge) {
                    badge = document.createElement("div");
                    container.querySelector(".lora-card").prepend(badge);
                }
                badge.innerText = inferredSource.toUpperCase();
                badge.className = `source-badge ${inferredSource}`;
            };
            linkInput.onblur = (e) => {
                const val = e.target.value.trim();
                if (val !== (info.link || '')) {
                    const inferredSource = this._extractSourceFromUrl(val, info);
                    const updates = { link: val };
                    
                    // 如果识别到来源且与当前不同，则一并更新
                    if (inferredSource && inferredSource !== info.source) {
                        updates.source = inferredSource;
                    }
                    
                    this.updateFields(path, updates);
                }
            };

            copyBtn.onclick = () => {
                if (this._isValidUrl(linkInput.value)) {
                    navigator.clipboard.writeText(linkInput.value).then(() => ToastManager.success(lang.t('copy_success')));
                }
            };

            openBtn.onclick = () => {
                const url = linkInput.value.trim();
                if (this._isValidUrl(url)) {
                    window.open(url, '_blank');
                }
            };

            // container.querySelector(".action-apply").onclick = (e) => {
            //     e.preventDefault();
            //     e.stopPropagation();
            //     // 构造 payload 并发送自定义事件
            //     const payload = {
            //         loraName: path,
            //         triggerWords: info.trigger_words || [],
            //         originalEvent: e
            //     };
            //     window.dispatchEvent(new CustomEvent("SK_APPLY_LORA", { detail: payload }));
            // };
// 在卡片右上角菜单点击事件中
const applyBtn = container.querySelector('.menu-item.action-apply');
applyBtn.onclick = (e) => {
    window.dispatchEvent(new CustomEvent("SK_APPLY_LORA", {
        detail: {
            loraName: path,
            triggerWords: info.trigger_words || [],
            originalEvent: e // 必须传入点击事件 e
        }
    }));
};


            container.querySelector(".action-fav").onclick = () => this.updateField(path, "is_fav", !info.is_fav).then(() => this.refresh());
            
            const syncBtn = container.querySelector(".action-sync");
            if (syncBtn) syncBtn.onclick = () => this.syncSingleItem(path, info.hash);

            const fetchUrlBtn = container.querySelector(".action-fetch-url");
            if (fetchUrlBtn) fetchUrlBtn.onclick = () => this.fetchFromUrl(path);

            const openLinkBtn = container.querySelector(".action-open-link");
            if (openLinkBtn) openLinkBtn.onclick = () => window.open(info.link, '_blank');

            container.querySelector(".action-copy-hash").onclick = () => {
                if (info.hash) {
                    navigator.clipboard.writeText(info.hash).then(() => ToastManager.success(lang.t('copy_success')));
                } else {
                    ToastManager.error(lang.t('no_hash_found') || "No HASH found");
                }
            };
            
            // 复制目录和路径
            const fullPath = this.baseDir ? `${this.baseDir}/${path}`.replace(/\\/g, '/') : path;
            const dirPath = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/')) : "";
            
            // 计算简短路径供 Toast 显示
            const shortPathFile = "\\loras\\" + path.replace(/\//g, '\\');
            const shortPathDir = shortPathFile.includes('\\') ? shortPathFile.substring(0, shortPathFile.lastIndexOf('\\')) : "\\loras";
            
            container.querySelector(".action-copy-dir").onclick = () => {
                const targetPath = dirPath.replace(/\//g, '\\') || this.baseDir.replace(/\//g, '\\');
                navigator.clipboard.writeText(targetPath);
                ToastManager.success((lang.t('copy_success') || "Copied") + "：" + shortPathDir);
            };
            
            container.querySelector(".action-copy-path").onclick = () => {
                const targetPath = fullPath.replace(/\//g, '\\');
                navigator.clipboard.writeText(targetPath);
                ToastManager.success((lang.t('copy_success') || "Copied") + "：" + shortPathFile);
            };

            // NSFW 过滤切换
            const toggleBtn = container.querySelector(".sk-toggle-view");
            if (toggleBtn) {
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    const img = container.querySelector(".lora-img");
                    const state = toggleBtn.getAttribute("data-state");
                    
                    if (state === "filtered") {
                        // 切换为可见
                        toggleBtn.setAttribute("data-state", "visible");
                        toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                        if (img) {
                            img.classList.remove("sk-nsfw-blur");
                            img.classList.remove("sk-nsfw-hidden");
                        }
                        const wrapper = container.querySelector(".lora-img-wrapper");
                        if (wrapper) wrapper.classList.remove("is-hidden");
                    } else {
                        // 切换回过滤状态
                        toggleBtn.setAttribute("data-state", "filtered");
                        toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                        // 根据设置重新应用过滤
                        const currentMode = this.localSettings.nsfw_img_mode || 'blur';
                        if (img) {
                            if (currentMode === 'hide') {
                                img.classList.add("sk-nsfw-hidden");
                                const wrapper = container.querySelector(".lora-img-wrapper");
                                if (wrapper) wrapper.classList.add("is-hidden");
                            } else {
                                img.classList.add("sk-nsfw-blur");
                            }
                        }
                    }
                };
            }

            // 图片上传处理
            const uploadBtn = container.querySelector(".sk-upload-btn");
            const fileInput = container.querySelector(".sk-file-input");
            const imgWrapper = container.querySelector(".lora-img-wrapper");
            const imgEl = container.querySelector(".lora-img");

            if (uploadBtn && fileInput && imgWrapper) {
                // 点击上传
                uploadBtn.onclick = (e) => {
                    e.stopPropagation();
                    fileInput.click();
                };

                // 文件已选择
                fileInput.onchange = async (e) => {
                    if (e.target.files && e.target.files[0]) {
                        await this.uploadPreviewImage(path, e.target.files[0], imgEl);
                    }
                };

                // 拖拽上传
                imgWrapper.ondragover = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    imgWrapper.style.border = "2px dashed #3b82f6";
                };

                imgWrapper.ondragleave = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    imgWrapper.style.border = "none";
                };

                imgWrapper.ondrop = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    imgWrapper.style.border = "none";
                    
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        if (file.type.startsWith('image/')) {
                            await this.uploadPreviewImage(path, file, imgEl);
                        } else {
                            ToastManager.error(lang.t('error_upload_image_type'));
                        }
                    }
                };
            }

            grid.appendChild(container);
        });
    }

    renderTags(pElem, path, tags, field, bgColor) {
        pElem.innerHTML = "";

        // 如果是tags字段，显示Base Model Slot
        if (field === "tags") {
            const info = this.loraData[path];
            const baseModel = info.base_model;
            const isCivitai = info.source === 'civitai';
            const canEdit = !isCivitai || this.localSettings.allow_civitai_basemodel_edit;
            
            const slot = document.createElement("div");
            if (baseModel && baseModel !== "Unknown") {
                slot.className = `base-model-slot active ${canEdit ? '' : 'readonly'}`;
                slot.innerHTML = `<span>${baseModel}</span>`;
            } else {
                slot.className = `base-model-slot empty ${canEdit ? '' : 'readonly'}`;
                slot.innerHTML = `<span>+ ${lang.t('base_model')}</span>`;
            }

            if (canEdit) {
                slot.onclick = (e) => {
                    e.stopPropagation();
                    this.handleBaseModelClick(path, e, slot);
                };
                slot.title = lang.t('click_to_edit_base');
            } else {
                slot.title = lang.t('civitai_model_readonly');
                slot.onclick = (e) => {
                    e.stopPropagation();
                    ToastManager.info(lang.t('civitai_model_readonly'));
                };
            }
            pElem.appendChild(slot);
        }

        tags.forEach((t, i) => {
            const pill = document.createElement("div");
            
            // 1. 构建基础结构
            const textSpan = document.createElement("span");
            textSpan.innerText = t;
            
            const tools = document.createElement("div");
            tools.className = "tag-hover-tools";
            
            // 2. 根据类型组装工具条
            if (field === "tags") {
                const info = this.loraData[path];
                const isCivitai = info.source === 'civitai';
                const canEdit = !isCivitai || this.localSettings.allow_civitai_basemodel_edit;

                pill.className = `lora-tag-item ${bgColor}`;
                
                // 晋升按钮
                if (canEdit) {
                    const promoteBtn = document.createElement("div");
                    promoteBtn.className = "tag-tool-btn promote";
                    promoteBtn.innerHTML = Icons.get('rocket', '', 16);
                    promoteBtn.title = lang.t('promote_to_base');
                    promoteBtn.onclick = (e) => {
                        e.stopPropagation(); // 关键：阻止冒泡
                        this.handlePromoteTag(path, t, tags, i);
                    };
                    tools.appendChild(promoteBtn);
                }
            } else {
                pill.className = `lora-trigger-item ${bgColor}`;
            }

            // 删除按钮 (通用)
            const delBtn = document.createElement("div");
            delBtn.className = "tag-tool-btn delete";
            delBtn.innerHTML = Icons.get('x', '', 14);
            delBtn.title = lang.t('delete');
            delBtn.onclick = (e) => {
                e.stopPropagation(); // 关键：阻止冒泡
                const next = tags.filter((_, idx) => idx !== i);
                this.updateField(path, field, next).then(ok => ok && this.renderTags(pElem, path, next, field, bgColor));
            };
            tools.appendChild(delBtn);

            // 3. 组装DOM
            pill.appendChild(textSpan);
            pill.appendChild(tools);

            // 4. 绑定复制事件到父容器
            pill.onclick = () => {
                navigator.clipboard.writeText(t).then(() => ToastManager.success(lang.t('copy_success')));
            };

            pElem.appendChild(pill);
        });
        
        const add = document.createElement("div");
        add.className = "tag-add-btn"; add.innerText = "+";
        add.onclick = () => {
            add.style.display = "none";
            const inp = document.createElement("input");
            inp.className = "sk-input-capsule"; inp.style.width = "80px";
            pElem.appendChild(inp); inp.focus();
            
            // 锁定卡片展开状态
            const card = pElem.closest('.lora-card');
            if (card) card.classList.add('manual-expand');

            const finish = () => {
                const raw = inp.value.trim();
                
                // 解锁卡片展开状态
                if (card) card.classList.remove('manual-expand');

                if (raw) {
                    const items = raw.split(/[,，]/).map(v => v.trim()).filter(v => v && !tags.includes(v));
                    if (items.length > 0) {
                        const next = [...tags, ...items];
                        this.updateField(path, field, next).then(ok => ok && this.renderTags(pElem, path, next, field, bgColor));
                        return;
                    }
                }
                this.renderTags(pElem, path, tags, field, bgColor);
            };
            inp.onblur = finish;
            inp.onkeydown = (e) => { if (e.key === 'Enter') finish(); };
        };
        pElem.appendChild(add);
    }

    async handleBaseModelClick(path, event, slotElem) {
        // 移除已有的picker
        const existing = document.querySelector(".quick-picker");
        if (existing) existing.remove();

        // 确保获取最新的设置
        await Promise.all([
            this.fetchBaseModelSettings(),
            this.fetchLocalSettings()
        ]);

        // 锁定卡片展开状态
        const card = slotElem.closest('.lora-card');
        if (card) card.classList.add('has-popup');

        const picker = document.createElement("div");
        picker.className = "quick-picker";
        
        // 准备数据
        let systemPresets = this.baseModelSettings.system_presets || [];
        let userCustom = this.baseModelSettings.user_custom || [];
        const visibleNames = this.localSettings.visible_system_names || [];

        // 规范化 userCustom
        userCustom = userCustom.map((p, i) => {
            if (typeof p === 'string') return { name: p, category: 'custom', order: i + 999, aliases: [] };
            return { ...p, category: 'custom' };
        });

        // 过滤可见性 (System presets need to be checked against visibleNames, User custom always visible)
        const visibleSystem = systemPresets.filter(p => visibleNames.includes(p.name));
        
        // 分组并排序
        const sortedImage = visibleSystem.filter(p => p.category === 'image').sort((a, b) => a.order - b.order);
        const sortedVideo = visibleSystem.filter(p => p.category === 'video').sort((a, b) => a.order - b.order);
        const sortedCustom = userCustom.sort((a, b) => a.order - b.order);

        const createGroup = (title, items, isCustom = false) => {
            if (items.length === 0) return null;
            
            const wrapper = document.createElement("div");
            wrapper.className = "picker-group";
            
            const header = document.createElement("div");
            header.innerText = title;
            header.style.cssText = "font-size: 10px; color: #888; margin: 6px 0 4px 0; padding-left: 2px; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 2px;";
            wrapper.appendChild(header);

            const grid = document.createElement("div");
            grid.className = "picker-grid";

            items.forEach(p => {
                const pName = p.name;
                const btn = document.createElement("div");
                btn.className = "picker-btn";
                
                if (isCustom) btn.classList.add('is-user-custom');
                
                btn.innerText = pName;
                
                // 点击选择
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (e.target.classList.contains('picker-del-btn')) return;

                    this.updateField(path, "base_model", pName).then(() => {
                        const tagsElem = this.uiRoot.querySelector(`#tags-p-${path.replace(/\W/g, '_')}`);
                        if (tagsElem) {
                            const currentTags = this.loraData[path].tags || [];
                            this.renderTags(tagsElem, path, currentTags, "tags", "bg-custom");
                        } else {
                            this.renderContent();
                        }
                        picker.remove();
                        if (card) setTimeout(() => card.classList.remove('has-popup'), 800);
                    });
                };

                // 如果是用户自定义预设，添加删除按钮
                if (isCustom) {
                    const delBtn = document.createElement("div");
                    delBtn.className = "picker-del-btn";
                    delBtn.innerText = "×";
                    delBtn.title = lang.t('delete_preset');
                    
                    let confirmTimer = null;
                    delBtn.onclick = async (e) => {
                        e.stopPropagation();
                        
                        if (delBtn.classList.contains('confirming')) {
                            // 二次点击：执行删除
                            if (confirmTimer) {
                                clearInterval(confirmTimer);
                                confirmTimer = null;
                            }
                            const success = await this.removePreset(pName);
                            if (success) {
                                ToastManager.success(lang.t('delete_success'));
                                // 仅移除当前按钮，不关闭整个选择器
                                btn.remove();
                                // 如果该分组已空，移除整个分组包装器
                                if (grid.children.length === 0) {
                                    wrapper.remove();
                                }
                            }
                        } else {
                            // 首次点击：进入确认状态
                            if (confirmTimer) clearInterval(confirmTimer);
                            
                            let countdown = 3;
                            delBtn.classList.add('confirming');
                            delBtn.innerText = lang.t('confirm_delete_q', [countdown]);
                            
                            confirmTimer = setInterval(() => {
                                countdown--;
                                if (countdown > 0) {
                                    delBtn.innerText = lang.t('confirm_delete_q', [countdown]);
                                } else {
                                    clearInterval(confirmTimer);
                                    confirmTimer = null;
                                    delBtn.classList.remove('confirming');
                                    delBtn.innerText = "×";
                                }
                            }, 1000);
                        }
                    };
                    btn.appendChild(delBtn);
                }

                grid.appendChild(btn);
            });
            
            wrapper.appendChild(grid);
            return wrapper;
        };

        const imgGroup = createGroup(lang.t('image_models'), sortedImage);
        if (imgGroup) picker.appendChild(imgGroup);

        const vidGroup = createGroup(lang.t('video_models'), sortedVideo);
        if (vidGroup) picker.appendChild(vidGroup);
        
        const customGroup = createGroup(lang.t('custom_models'), sortedCustom, true);
        if (customGroup) picker.appendChild(customGroup);

        // 输入框
        const inputWrapper = document.createElement("div");
        inputWrapper.className = "picker-input-wrapper";
        inputWrapper.style.marginTop = "8px";
        const input = document.createElement("input");
        input.className = "picker-input";
        input.placeholder = lang.t('custom_placeholder');
        
        const apply = async () => {
            const raw = input.value.trim();
            if (!raw) return;
            const normalized = this.normalizeBaseModel(raw);
            
            // 检查是否已存在
            const currentSystemNames = (this.baseModelSettings.system_presets || []).map(s => s.name);
            const currentUserCustom = this.baseModelSettings.user_custom || [];
            const currentUserCustomNames = currentUserCustom.map(u => typeof u === 'string' ? u : u.name);
            
            const exists = currentSystemNames.includes(normalized) || currentUserCustomNames.includes(normalized);
            
            // 如果不存在，添加为新预设
            if (!exists) {
                await this.addNewPreset(normalized);
            }
            
            await this.updateField(path, "base_model", normalized);
            
            const tagsElem = this.uiRoot.querySelector(`#tags-p-${path.replace(/\W/g, '_')}`);
            if (tagsElem) {
                 const currentTags = this.loraData[path].tags || [];
                 this.renderTags(tagsElem, path, currentTags, "tags", "bg-custom");
            } else {
                this.renderContent(); 
            }
            
            picker.remove();
            if (card) setTimeout(() => card.classList.remove('has-popup'), 800);
        };

        input.onkeydown = (e) => { if (e.key === 'Enter') apply(); };
        inputWrapper.appendChild(input);
        picker.appendChild(inputWrapper);

        // 定位
        document.body.appendChild(picker);
        const rect = slotElem.getBoundingClientRect();
        picker.style.top = (rect.bottom + window.scrollY + 8) + "px";
        picker.style.left = (rect.left + window.scrollX) + "px";

        // 自动关闭逻辑：鼠标移出且输入框无焦点时关闭
        const isMouseInArea = () => picker.matches(':hover') || slotElem.matches(':hover');
        const tryClose = () => {
            if (!isMouseInArea() && document.activeElement !== input) {
                picker.remove();
                if (card) card.classList.remove('has-popup');
            }
        };

        picker.onmouseleave = () => { setTimeout(tryClose, 300); };
        slotElem.onmouseleave = () => { setTimeout(tryClose, 300); };
        input.onblur = () => { setTimeout(tryClose, 300); };

        input.focus();
    }

    async handlePromoteTag(path, tag, tags, index) {
        const normalized = this.normalizeBaseModel(tag);
        const newTags = tags.filter((_, i) => i !== index);
        
        // 如果是新词，添加到预设
        const systemPresets = this.baseModelSettings.system_presets || [];
        const userCustom = this.baseModelSettings.user_custom || [];
        const isSystem = systemPresets.some(p => p.name === normalized);
        const isCustom = userCustom.some(p => (typeof p === 'string' ? p : p.name) === normalized);

        if (!isSystem && !isCustom) {
            await this.addNewPreset(normalized);
        }

        try {
             const resp = await api.fetchApi("/sknodes/lora_mgr/update_item", {
                method: "POST",
                body: JSON.stringify({
                    path,
                    values: {
                        base_model: normalized,
                        tags: newTags
                    }
                })
            });
            
            if (resp.status !== 200) throw new Error("Update failed");

            this.loraData[path].base_model = normalized;
            this.loraData[path].tags = newTags;
            
            // 优化：仅刷新标签区域，不刷新整个Grid，保持卡片状态
            const tagsElem = this.uiRoot.querySelector(`#tags-p-${path.replace(/\W/g, '_')}`);
            if (tagsElem) {
                this.renderTags(tagsElem, path, newTags, "tags", "bg-custom");
            } else {
                this.renderContent();
            }
            
            ToastManager.success(lang.t('save_success'));
        } catch (e) {
            ToastManager.error(lang.t('save_error'));
        }
    }

    showSyncModal(type) {
        const isInitial = Object.keys(this.loraData).length === 0;
        const title = isInitial ? lang.t('init_library') : lang.t('update_library');

        const modal = document.createElement('div');
        modal.className = 'sync-modal-overlay';
        modal.innerHTML = `
            <div class="sync-modal-dialog">
                <div class="sync-modal-header">
                    <span class="sync-modal-icon spin-animation">${Icons.get('hourglass', '', 32)}</span>
                    <span class="sync-modal-title">${title}</span>
                </div>
                <div class="sync-modal-dashboard">
                    <div class="dashboard-card">
                        <div class="dashboard-label">${lang.t('current_file')}</div>
                        <div class="dashboard-value dashboard-filename">-</div>
                    </div>
                    <div class="dashboard-card">
                        <div class="dashboard-label">${lang.t('hash')}</div>
                        <div class="dashboard-value dashboard-hash">-</div>
                    </div>
                    <div class="dashboard-card">
                        <div class="dashboard-label">${lang.t('status')}</div>
                        <div class="dashboard-value dashboard-status">
                            <span>${lang.t('preview')}: <span class="preview-status">-</span></span>
                            <span>${lang.t('date')}: <span class="date-status">-</span></span>
                        </div>
                    </div>
                </div>
                <div class="sync-modal-progress">
                    <div class="progress-bar indeterminate"></div>
                    <div class="progress-text">${lang.t('searching')}</div>
                </div>
                <div class="sync-modal-logs">
                    <div class="log-entry" data-initial="true">${lang.t('waiting')}</div>
                </div>
                <div class="sync-modal-footer">
                    <button class="sync-modal-close-btn" style="display: none;">${lang.t('complete_close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.syncModal = modal;
    }

    updateSyncModalProgress(data) {
        if (!this.syncModal) return;
        const progressBar = this.syncModal.querySelector('.progress-bar');
        const progressText = this.syncModal.querySelector('.progress-text');
        const filename = this.syncModal.querySelector('.dashboard-filename');
        const hash = this.syncModal.querySelector('.dashboard-hash');
        const previewStatus = this.syncModal.querySelector('.preview-status');
        const dateStatus = this.syncModal.querySelector('.date-status');
        const logs = this.syncModal.querySelector('.sync-modal-logs');

        if (data.filename !== undefined) {
            if (data.filename === '') {
                filename.textContent = '-';
            } else {
                filename.textContent = data.filename.length > 52 ? data.filename.substring(0, 52) + '...' : data.filename;
            }
        }

        if (data.hash !== undefined) {
            hash.textContent = data.hash === '' ? '-' : data.hash.substring(0, 64);
        }

        if (data.has_preview !== undefined) {
            previewStatus.textContent = data.has_preview ? lang.t('yes') : lang.t('no');
        } else {
            previewStatus.textContent = '-';
        }

        if (data.date !== undefined) {
            if (data.date === 0 || data.date === null) {
                dateStatus.textContent = '-';
            } else {
                const date = new Date(data.date * 1000);
                dateStatus.textContent = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
            }
        } else {
            dateStatus.textContent = '-';
        }

        if (data.total !== undefined && data.current !== undefined) {
            const percentage = Math.round((data.current / data.total) * 100);
            progressBar.className = 'progress-bar determinate';
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${data.current}/${data.total} (${percentage}%)`;
        }

        if (data.log) {
            // 检查最新的日志是否与当前日志相同，如果相同则不添加
            const firstLog = logs.firstChild;
            if (!firstLog || firstLog.textContent !== data.log) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry';
                logEntry.textContent = data.log;
                logs.insertBefore(logEntry, logs.firstChild);

                const logEntries = logs.querySelectorAll('.log-entry');
                if (logEntries.length > 3) {
                    logs.removeChild(logEntries[logEntries.length - 1]);
                }
            }
        }
    }

    updateSyncModalComplete(result) {
        if (!this.syncModal) return;
        const progressBar = this.syncModal.querySelector('.progress-bar');
        const progressText = this.syncModal.querySelector('.progress-text');
        const closeBtn = this.syncModal.querySelector('.sync-modal-close-btn');
        const logs = this.syncModal.querySelector('.sync-modal-logs');

        if (logs) {
            logs.style.display = 'none';
        }

        progressBar.className = 'progress-bar complete';
        progressBar.style.width = '100%';
        
        if (result.message) {
            progressText.textContent = result.message;
        } else {
            progressText.textContent = lang.t('sync_complete');
        }

        // 移除旧的summary（如果存在）
        const oldSummary = this.syncModal.querySelector('.sync-summary');
        if (oldSummary) {
            oldSummary.remove();
        }

        const summary = document.createElement('div');
        summary.className = 'sync-summary';
        summary.innerHTML = `
            <div>${Icons.get('sparkles', '', 14)} ${lang.t('added_models')}: ${result.added || 0}</div>
            <div>${Icons.get('trash', '', 14)} ${lang.t('removed_invalid')}: ${result.removed || 0}</div>
            <div>${Icons.get('clock', '', 14)} ${lang.t('duration')}: ${result.duration || 0}s</div>
        `;

        const dashboard = this.syncModal.querySelector('.sync-modal-dashboard');
        dashboard.appendChild(summary);

        closeBtn.style.display = 'block';
        closeBtn.onclick = () => {
            document.body.removeChild(this.syncModal);
            this.syncModal = null;
        };
    }

    updateSyncModalError(error) {
        if (!this.syncModal) return;
        const progressBar = this.syncModal.querySelector('.progress-bar');
        const progressText = this.syncModal.querySelector('.progress-text');
        const closeBtn = this.syncModal.querySelector('.sync-modal-close-btn');

        progressBar.className = 'progress-bar error';
        progressBar.style.width = '100%';
        progressText.textContent = `${lang.t('sync_error')}: ${error}`;

        closeBtn.style.display = 'block';
        closeBtn.textContent = lang.t('force_close');
        closeBtn.onclick = () => {
            document.body.removeChild(this.syncModal);
            this.syncModal = null;
        };
    }

    applyToNode(path) {
        const node = app.canvas.selected_nodes?.find(n => n.type === "LoraTagNode") || app.canvas.graph._nodes.find(n => n.type === "LoraTagNode");
        if (node) {
            const w = node.widgets.find(w => w.name === "lora_name");
            if (w) { w.value = path; if (w.callback) w.callback(path); this.hide(); }
        }
    }

    createUI() {
        if (this.uiRoot) return;
        this.createStyles();
        this.uiRoot = document.createElement("div");
        this.uiRoot.className = "lora-manager-dialog";
        this.uiRoot.style.display = "none";
        this.uiRoot.innerHTML = `
        <div class="lora-manager-content">
            <div class="lora-sidebar">
                <div class="sidebar-title">${lang.t('title')}</div>
                <div class="folder-list"></div>
                <div class="sidebar-footer">
                    <div class="btn-settings">${Icons.get('settings', '', 16)} ${lang.t('settings')}</div>
                    <div class="btn-view-mode" title="${lang.t('toggle_view_mode') || 'Toggle View Mode'}"></div>
                    <div class="btn-health" title="${lang.t('health_center') || 'Health Center'}"></div>
                    <div class="btn-lang"></div>
                </div>
            </div>
            <div class="lora-main">
                <div class="lora-header">
                    <div class="search-wrapper">
                        <input type="text" class="search-input" placeholder="${lang.t('search_placeholder')}">
                    </div>
                    <div class="button-group">
                        <button class="btn-sync btn-local"><span class="hourglass-icon">${Icons.get('hourglass', '', 14)}</span>${lang.t('sync_local')}</button>
                        <button class="btn-sync btn-civit"><span class="hourglass-icon">${Icons.get('hourglass', '', 14)}</span>${lang.t('sync_civit')}</button>
                        <button class="btn-close" title="${lang.t('close_panel')}">×</button>
                    </div>
                </div>
                <div class="lora-grid"></div>
            </div>
        </div>`;

        // 添加语言切换监听器
        lang.addLocaleChangeListener((oldLocale, newLocale) => {
            this.updateUITexts();
        });

        // 绑定关闭点击事件
        this.uiRoot.onclick = (e) => { if (e.target === this.uiRoot) this.hide(); };

        // 绑定搜索框事件（增加 200ms 防抖）
        let searchTimer = null;
        this.uiRoot.querySelector(".search-input").oninput = (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.renderContent();
            }, 200);
        };

        // 绑定设置按钮点击事件
        this.uiRoot.querySelector(".btn-settings").onclick = () => {
            this.showSettingsModal();
        };

        // 绑定关闭按钮点击事件
        this.uiRoot.querySelector(".btn-close").onclick = () => {
            this.hide();
        };

        // 绑定视图切换按钮
        const viewBtn = this.uiRoot.querySelector(".btn-view-mode");
        viewBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleViewMode();
        };
        this.updateViewModeUI();

        // 绑定健康中心按钮
        const healthBtn = this.uiRoot.querySelector(".btn-health");
        healthBtn.innerHTML = Icons.get('shield', '', 16);
        healthBtn.onclick = (e) => {
            e.stopPropagation();
            this.healthUI.show();
        };

        // --- 新增：绑定同步本地按钮 ---
        this.uiRoot.querySelector(".btn-local").onclick = () => this.syncLocal();

        // --- 新增：绑定同步Civitai按钮 ---
        this.uiRoot.querySelector(".btn-civit").onclick = () => this.syncCivitai();

        document.body.appendChild(this.uiRoot);
    }
    // 显示差异对比面板
    showDiffModal(path, localData, civitaiData, retryFetchFn = null, columnTitle = null, sourceUrl = null, llmInfo = null) {
        const modal = document.createElement('div');
        modal.className = 'sync-modal-overlay diff-modal';
        
        const targetTitle = columnTitle || lang.t('civitai_new_value');

        let stagedData = {};
        
        // 如果 civitaiData 存在，初始化 stagedData
        if (civitaiData) {
            stagedData = { ...civitaiData };
            // 修复：stagedData 中的 trigger_words 也应该是原始数据，确保 Replace 模式下替换的是原始 C 站数据
            if (civitaiData.civitai_triggers) {
                stagedData.trigger_words = civitaiData.civitai_triggers;
            }
            if (civitaiData.civitai_tags) {
                stagedData.tags = civitaiData.civitai_tags;
            }
        }

        // 特殊处理：图片和触发词的模式
        let triggerMode = this.localSettings.sync_triggers || 'replace'; // 替换 | 合并
        let tagsMode = 'merge'; // 默认合并，但允许修改

        // 字段定义
        let fields = [
            { key: 'civitai_model_id', label: Icons.get('id', '', 18) + lang.t('model_id'), type: 'readonly' },
            { key: 'img', label: Icons.get('image', '', 18) + lang.t('preview_image'), type: 'image' },
            { key: 'title', label: Icons.get('info', '', 18) + lang.t('model_name'), type: 'text' },
            { key: 'base_model', label: Icons.get('component', '', 18) + lang.t('base_model'), type: 'base_model' },
            { key: 'trigger_words', label: Icons.get('zap', '', 18) + lang.t('trigger_words'), type: 'tags' },
            { key: 'tags', label: Icons.get('tag', '', 18) + lang.t('tags_label'), type: 'tags' },
            { key: 'weight', label: Icons.get('scale', '', 18) + lang.t('weight'), type: 'number' },
            { key: 'sampler', label: Icons.get('cpu', '', 18) + lang.t('sampler'), type: 'text' },
            { key: 'nsfw_level', label: Icons.get('shield', '', 18) + lang.t('nsfw_level'), type: 'select', options: [1, 2, 4, 8, 16] }, 
            { key: 'new_version_available', label: Icons.get('rotate_ccw', '', 18) + lang.t('new_version'), type: 'boolean' },
            { key: 'link', label: Icons.get('globe', '', 18) + lang.t('link'), type: 'text' },
            { key: 'notes', label: Icons.get('file_text', '', 18) + lang.t('notes'), type: 'textarea' },
            { key: 'published', label: Icons.get('clock', '', 18) + lang.t('published_at'), type: 'date' }
        ];

        // 如果是“从网址获取数据”模式（通过 columnTitle 判断），只显示特定字段
        if (columnTitle) {
            // 用户要求删除发布时间 (published)
            const allowedKeys = ['img', 'title', 'base_model', 'trigger_words', 'tags', 'weight', 'sampler', 'notes'];
            fields = fields.filter(f => allowedKeys.includes(f.key));
        }

        // 准备底模列表
        const visibleSystemNames = this.localSettings.visible_system_names || [];
        const userCustom = (this.baseModelSettings.user_custom || []).map(p => typeof p === 'string' ? p : p.name);
        const allBaseModels = [...new Set([...visibleSystemNames, ...userCustom])];

        // 动态注入 Tag 样式
        if (!document.getElementById('sk-tag-style')) {
            const style = document.createElement('style');
            style.id = 'sk-tag-style';
            style.textContent = `
                .sk-tag { display: inline-flex; align-items: center; background: #334155; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #fff; }
                .sk-tag .remove { margin-left: 6px; cursor: pointer; color: #94a3b8; font-weight: bold; }
                .sk-tag .remove:hover { color: #ef4444; }
                .diff-input.tags-container { cursor: text; }
                .llm-footer-note { font-size: 11px; color: #64748b; flex: 1; display: flex; align-items: center; gap: 5px; opacity: 0.8; }
                .llm-footer-note.error { color: #f87171; }
                .llm-footer-note.disabled { color: #94a3b8; }
                .diff-modal-footer { gap: 10px; }
            `;
            document.head.appendChild(style);
        }

        // 构建行 HTML
        const buildRow = (field) => {
            const localVal = localData[field.key];
            let civitaiVal = civitaiData ? civitaiData[field.key] : undefined;
            
            // 加载状态
            if (!civitaiData) {
                const localHtml = `<div class="diff-cell local readonly">${this.formatValue(field, localVal)}</div>`;
                const loadingHtml = `<div class="diff-cell civitai"><div class="sync-mini-spinner" style="border-color: #64748b; border-top-color: #fff;"></div></div>`;
                return `
                    <div class="diff-row" data-key="${field.key}">
                        <div class="diff-cell label">${field.label}</div>
                        ${localHtml}
                        ${loadingHtml}
                        <div class="diff-cell check"><input type="checkbox" disabled></div>
                    </div>
                `;
            }

            // 修复：trigger_words/tags 应显示来自 C 站的原始数据，而非处理后的
            if (field.key === 'trigger_words' && civitaiData.civitai_triggers) {
                civitaiVal = civitaiData.civitai_triggers;
            } else if (field.key === 'tags' && civitaiData.civitai_tags) {
                civitaiVal = civitaiData.civitai_tags;
            }
            
            // 简单比较，对象/数组需特殊处理
            let isDiff = false;
            if (field.key === 'trigger_words' || field.key === 'tags') {
                const t1 = JSON.stringify((localVal || []).map(v => String(v).toLowerCase().trim()).sort());
                const t2 = JSON.stringify((civitaiVal || []).map(v => String(v).toLowerCase().trim()).sort());
                isDiff = t1 !== t2;
            } else if (field.key === 'img') {
                // 图片总是认为不同，除非没有新图片
                isDiff = !!civitaiData.civitai_image_url; 
            } else {
                isDiff = localVal != civitaiVal;
            }

            const rowClass = isDiff ? 'diff-row highlight' : 'diff-row';
            let checked = isDiff ? 'checked' : '';

            // 1. 安全保护：如果 C 站获取的值为空，而本地已有值，则默认不勾选，防止意外覆盖掉本地有效数据
            if (isDiff && (civitaiVal === '' || civitaiVal === null || civitaiVal === undefined || (Array.isArray(civitaiVal) && civitaiVal.length === 0))) {
                if (localVal !== '' && localVal !== null && localVal !== undefined && (Array.isArray(localVal) ? localVal.length > 0 : true)) {
                    checked = '';
                }
            }
            
            // 2. 特殊逻辑：如果 Sampler 的值为 "more"，默认不勾选
            if (isDiff && field.key === 'sampler' && (civitaiVal === 'more' || civitaiVal === 'More')) {
                checked = '';
            }

            // 3. 用户新要求：weight, sampler, tags 只标记颜色（isDiff 为 true），但不默认勾选复选框
            if (field.key === 'weight' || field.key === 'sampler' || field.key === 'tags') {
                checked = '';
            }

            // 4. 用户新要求：Model ID 和 published_at 始终默认勾选且不可修改
            if (field.key === 'civitai_model_id' || field.key === 'published') {
                checked = 'checked';
            }

            // 5. 如果本地值为空且新值存在，自动勾选
            if ((!localVal || localVal === '' || (Array.isArray(localVal) && localVal.length === 0)) && 
                (civitaiVal && civitaiVal !== '' && (Array.isArray(civitaiVal) ? civitaiVal.length > 0 : true))) {
                // 如果是“从网址获取数据”模式 (columnTitle 存在)，默认不勾选，让用户自己选择
                if (columnTitle) {
                    checked = '';
                } else {
                    checked = 'checked';
                }
            }

            // “从网址获取”模式的最终覆盖：所有字段默认不勾选，让用户自行选择
            if (columnTitle) {
                checked = '';
            }

            let localHtml = `<div class="diff-cell local readonly">${this.formatValue(field, localVal)}</div>`;
            let civitaiHtml = '';

            if (field.type === 'image') {
                // 图片特殊处理
                let localImg = '';
                if (localVal) {
                    const encodedPath = localVal.replace(/\\/g, '/').split('/').map(part => encodeURIComponent(part)).join('/');
                    localImg = `/sk_view_lora/${encodedPath}?t=${Date.now()}`;
                }
                const civitaiImg = civitaiData.civitai_image_url || '';
                const placeholderImg = `data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22100%22%20height%3D%22100%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23334155%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%22%20font-size%3D%2210%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3E${encodeURIComponent(lang.t('no_new_image'))}%3C%2Ftext%3E%3C%2Fsvg%3E`;
                const invalidImgPlaceholder = `data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22100%22%20height%3D%22100%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23334155%22%2F%3E%3Cpath%20d%3D%22M35%2035%20L65%2065%20M65%2035%20L35%2065%22%20stroke%3D%22%23ef4444%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2285%25%22%20font-family%3D%22Arial%22%20font-size%3D%229%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%3E${encodeURIComponent(lang.t('image_invalid'))}%3C%2Ftext%3E%3C%2Fsvg%3E`;
                
                localHtml = `<div class="diff-cell local readonly">
                    ${localImg ? `<img src="${localImg}" class="diff-thumb" title="${localVal}">` : lang.t('no_image')}
                </div>`;
                
                civitaiHtml = `<div class="diff-cell civitai">
                    ${civitaiImg ? `<img src="${civitaiImg}" class="diff-thumb new-img" title="${lang.t('new_image')}" onerror="this.onerror=null; this.src='${invalidImgPlaceholder}'; this.title='${lang.t('image_invalid')}';">` : `<img src="${placeholderImg}" class="diff-thumb new-img" title="${lang.t('no_new_image')}">`}
                </div>`;
            } else if (field.type === 'tags') {
                // 触发词和标签特殊处理
                let mode = field.key === 'tags' ? tagsMode : triggerMode;
                // 分类标签强制使用 merge
                if (field.key === 'tags') mode = 'merge';

                const tagList = Array.isArray(civitaiVal) ? civitaiVal : (civitaiVal ? String(civitaiVal).split(',').map(s=>s.trim()) : []);
                
                // 渲染标签
                const tagsHtml = tagList.map(t => 
                    `<span class="sk-tag" data-val="${t}">${t}<span class="remove" onclick="this.parentElement.remove();">×</span></span>`
                ).join('');

                const isTags = field.key === 'tags';

                civitaiHtml = `<div class="diff-cell civitai">
                    <div class="diff-input tags-container" data-key="${field.key}" style="min-height: 30px; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border: 1px solid #475569; border-radius: 4px; background: #1e293b;">
                        ${tagsHtml}
                    </div>
                    
                    ${isTags ? '' : `
                    <div class="trigger-controls">
                        <label><input type="radio" name="${field.key}_mode" value="replace" ${mode==='replace'?'checked':''}> ${lang.t('replace')}</label>
                        <label><input type="radio" name="${field.key}_mode" value="merge" ${mode==='merge'?'checked':''}> ${lang.t('merge')}</label>
                    </div>
                    `}
                </div>`;
            } else if (field.type === 'select') {
                // 确保 civitaiVal 是数字，以便与 options 匹配
                const numericVal = parseInt(civitaiVal);
                
                // 建筑师优化：支持复合位掩码 (如 7, 15)
                // 如果 numericVal 是复合值，我们寻找最接近的单项选项（取最高位）用于 UI 显示
                const getHighestBit = (val) => {
                    if (val >= 16) return 16;
                    if (val >= 8) return 8;
                    if (val >= 4) return 4;
                    if (val >= 2) return 2;
                    return 1;
                };
                
                const displayVal = getHighestBit(numericVal);
                const exists = field.options.some(o => o == displayVal);
                const actualVal = exists ? displayVal : (field.options.length > 0 ? field.options[0] : '');
                
                // 只有当 stagedData 中没有该值时才更新
                // 注意：这里 stagedData 存储的是原始的复合位掩码 (numericVal)
                if (!stagedData[field.key]) {
                    stagedData[field.key] = numericVal;
                }

                const options = field.options.map(o => `<option value="${o}" ${actualVal == o ? 'selected' : ''}>${o}</option>`).join('');
                civitaiHtml = `<div class="diff-cell civitai">
                    <select class="diff-input" data-key="${field.key}" data-initial="${numericVal}">${options}</select>
                </div>`;
            } else if (field.type === 'base_model') {
                // 如果是“从网址获取数据”模式，使用文本框显示
                if (columnTitle) {
                    civitaiHtml = `<div class="diff-cell civitai">
                        <input type="text" class="diff-input readonly" data-key="${field.key}" value="${civitaiVal || ''}" readonly>
                    </div>`;
                } else {
                    // 选项从 visible_system_names 和 user_custom 获取 (已在 allBaseModels 准备好)
                    const displayModels = [...allBaseModels];
                    let selectedVal = civitaiVal;

                    if (civitaiVal) {
                        if (!displayModels.includes(civitaiVal)) {
                            // 1. 如果获取的值不在列表中，则将其放入首位并选中
                            displayModels.unshift(civitaiVal);
                            
                            // 2. 自动将其添加到 basemodel_settings.json 的 user_custom 中
                            console.log(`[SK-LoRA] [System] New base model detected: ${civitaiVal}, adding to user_custom...`);
                            
                            const newModel = {
                                "name": civitaiVal,
                                "category": "custom",
                                "order": Math.floor(Math.random() * 1000)
                            };

                            // 避免重复添加 (尽管上面 displayModels.includes 已经检查过一次)
                            const userCustomList = this.baseModelSettings.user_custom || [];
                            const exists = userCustomList.some(p => (typeof p === 'string' ? p : p.name) === civitaiVal);
                            
                            if (!exists) {
                                userCustomList.push(newModel);
                                this.baseModelSettings.user_custom = userCustomList;
                                
                                // 异步调用 API 保存到数据库
                                api.fetchApi("/lora_manager/update_basemodel_settings", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ user_custom: userCustomList })
                                }).then(res => res.json()).then(data => {
                                    if (data.status === 'success') {
                                        console.log(`[SK-LoRA] [System] Successfully added ${civitaiVal} to basemodel_settings.json`);
                                    } else {
                                        console.error(`[SK-LoRA] [System] Failed to save new base model: ${data.message}`);
                                    }
                                }).catch(err => {
                                    console.error(`[SK-LoRA] [System] Error saving new base model: ${err}`);
                                });
                            }
                        }
                    } else {
                        // 如果从 C 站获取的值为空，则默认显示第一个预设值
                        if (displayModels.length > 0) {
                            selectedVal = displayModels[0];
                            stagedData[field.key] = selectedVal;
                        }
                    }

                    const options = displayModels.map(m => `<option value="${m}" ${selectedVal === m ? 'selected' : ''}>${m}</option>`).join('');
                    civitaiHtml = `<div class="diff-cell civitai">
                        <select class="diff-input" data-key="${field.key}" data-initial="${selectedVal}">${options}</select>
                    </div>`;
                }
            } else if (field.type === 'textarea') {
                const initialVal = civitaiVal || '';
                civitaiHtml = `<div class="diff-cell civitai" style="height: 100%;">
                    <textarea class="diff-input" data-key="${field.key}" data-initial="${initialVal}" style="height: 100%; min-height: 80px; resize: vertical;">${initialVal}</textarea>
                </div>`;
            } else if (field.type === 'boolean') {
                 civitaiHtml = `<div class="diff-cell civitai">
                    <select class="diff-input" data-key="${field.key}" data-initial="${civitaiVal}">
                        <option value="true" ${civitaiVal === true ? 'selected' : ''}>${lang.t('true_val')}</option>
                        <option value="false" ${civitaiVal === false ? 'selected' : ''}>${lang.t('false_val')}</option>
                    </select>
                </div>`;
            } else if (field.type === 'date') {
                const dateStr = civitaiVal ? new Date(civitaiVal * 1000).toLocaleDateString() + ' ' + new Date(civitaiVal * 1000).toLocaleTimeString() : '';
                civitaiHtml = `<div class="diff-cell civitai">
                    <input type="text" class="diff-input readonly" data-key="${field.key}" value="${dateStr}" readonly>
                </div>`;
            } else if (field.type === 'readonly') {
                civitaiHtml = `<div class="diff-cell civitai">
                    <input type="text" class="diff-input readonly" data-key="${field.key}" value="${civitaiVal || ''}" readonly>
                </div>`;
            } else {
                const initialVal = civitaiVal || '';
                civitaiHtml = `<div class="diff-cell civitai">
                    <input type="text" class="diff-input" data-key="${field.key}" data-initial="${initialVal}" value="${initialVal}">
                </div>`;
            }

            const isReadOnlyRow = field.key === 'civitai_model_id' || field.key === 'published';

            return `
                <div class="${rowClass}" data-key="${field.key}">
                    <div class="diff-cell label">${field.label}</div>
                    ${localHtml}
                    ${civitaiHtml}
                    <div class="diff-cell check">
                        <input type="checkbox" class="row-checkbox" ${checked} ${isReadOnlyRow ? 'disabled' : ''}>
                    </div>
                </div>
            `;
        };

        const rowsHtml = fields.map(f => buildRow(f)).join('');

        // 构建 LLM 提示文字
        let llmNote = "";
        if (civitaiData && llmInfo) {
            if (llmInfo.status === 'success') {
                llmNote = `<div class="llm-footer-note">${Icons.get('sparkles', '', 12)} 本次分析结果由 ${llmInfo.provider} (${llmInfo.model}) 提供服务</div>`;
            } else if (llmInfo.status === 'failed') {
                llmNote = `<div class="llm-footer-note error">${Icons.get('alert_triangle', '', 12)} LLM 分析失败: ${llmInfo.message || '未知错误'}，已回退至基础采集</div>`;
            } else if (llmInfo.status === 'disabled') {
                llmNote = `<div class="llm-footer-note disabled">${Icons.get('info', '', 12)} LLM 未启用，本次为基础数据采集</div>`;
            } else if (llmInfo.status === 'not_triggered') {
                llmNote = `<div class="llm-footer-note disabled">${Icons.get('info', '', 12)} 本次为基础数据采集 (LLM 未介入)</div>`;
            }
        }

        modal.innerHTML = `
            <style>
                .diff-modal .sync-modal-dialog { width: 90%; max-width: 1200px; max-height: 90vh; position: relative; }
                .diff-grid { display: flex; flex-direction: column; gap: 0; overflow-y: auto; max-height: 60vh; border: 1px solid #334155; }
                .diff-row { display: grid; grid-template-columns: 150px 1fr 1fr 40px; gap: 0; border-bottom: 1px solid #334155; align-items: stretch; }
                .diff-row.highlight { background: rgba(251, 146, 60, 0.15); } /* 浅橙色色调 */
                .diff-cell { padding: 10px; border-right: 1px solid #334155; display: flex; align-items: center; word-break: break-all; font-size: 14px; }
                .diff-cell.check { justify-content: center; border-right: none; }
                .diff-cell.label { font-weight: bold; color: #94a3b8; gap: 10px; }
                .diff-cell.label .sk-svg-icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; }
                .diff-cell.local { color: #94a3b8; background: rgba(0,0,0,0.2); }
                .diff-cell.civitai { background: rgba(0,0,0,0.1); flex-direction: column; align-items: flex-start; gap: 5px; }
                .diff-input { width: 100%; background: #0f172a; border: 1px solid #475569; color: #f8fafc; padding: 5px; border-radius: 4px; }
                .diff-input.readonly { background: #1e293b; color: #94a3b8; border-color: #334155; cursor: default; }
                .diff-thumb { max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 4px; }
                .img-controls, .trigger-controls { display: flex; gap: 10px; font-size: 12px; margin-top: 5px; }
                .diff-modal-footer { padding: 20px; display: flex; justify-content: flex-end; align-items: center; gap: 10px; border-top: 1px solid #334155; background: #0f172a; }
                .btn-apply { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
                .btn-apply:disabled { background: #64748b; cursor: not-allowed; opacity: 0.6; }
                .btn-cancel { background: #64748b; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
                .diff-header { padding: 15px; font-size: 18px; font-weight: bold; border-bottom: 1px solid #334155; background: #0f172a; color: white; display: flex; justify-content: space-between; align-items: center; }
                .retry-btn { margin-left: auto; margin-right: auto; padding: 5px 15px; background: #eab308; color: black; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; display: none; }
                .diff-close-x { cursor: pointer; font-size: 24px; color: #94a3b8; line-height: 1; padding: 0 5px; }
                .diff-close-x:hover { color: #f8fafc; }
                .footer-source-link { display: flex; align-items: center; gap: 5px; margin-right: auto; font-size: 12px; color: #94a3b8; max-width: 50%; }
                .footer-source-link input { flex: 1; height: 24px; font-size: 11px; background: #1e293b; border-color: #334155; }
                .footer-source-link button { height: 24px; padding: 0 8px; font-size: 11px; white-space: nowrap; background: #334155; color: white; border: 1px solid #475569; border-radius: 4px; cursor: pointer; }
                .footer-source-link button:hover { background: #475569; }
                .llm-footer-note { display: flex; align-items: center; gap: 5px; margin-right: auto; font-size: 11px; color: #64748b; }
                .llm-footer-note.error { color: #ef4444; }
                .llm-footer-note.disabled { color: #475569; }
                .llm-footer-note .sk-svg-icon { opacity: 0.7; }
            </style>
            <div class="sync-modal-dialog">
                <div class="diff-header">
                    <div style="display: flex; align-items: baseline; gap: 6px;">
                        <span>${columnTitle ? lang.t('ai_analysis') : lang.t('diff_sync_title', ['']).replace(/[:：]\s*$/, '')}</span>
                        <span style="font-size: 12px; color: #94a3b8; font-weight: normal;">(${path.split(/[\\/]/).pop()})</span>
                    </div>
                    <div class="diff-close-x">×</div>
                </div>
                <div class="diff-grid">
                    <div class="diff-row header" style="background: #1e293b; font-weight: bold; position: sticky; top: 0; z-index: 10;">
                        <div class="diff-cell">${lang.t('field')}</div>
                        <div class="diff-cell">${lang.t('local_value')}</div>
                        <div class="diff-cell">
                            ${targetTitle}
                            ${columnTitle ? `<span style="font-size: 10px; font-weight: normal; color: #94a3b8; margin-left: 5px;">${lang.t('ai_analysis_reference')}</span>` : ''}
                        </div>
                        <div class="diff-cell">${lang.t('use')}</div>
                    </div>
                    ${rowsHtml}
                </div>
                <div class="diff-modal-footer">
                    ${sourceUrl ? `
                        <div class="footer-source-link">
                            <input type="text" class="diff-input" value="${sourceUrl}" readonly>
                            <button class="sk-btn sk-btn-secondary" onclick="window.open('${sourceUrl}', '_blank')">${lang.t('open_link')}</button>
                        </div>
                    ` : ''}
                    ${llmNote}
                    <button class="retry-btn">${lang.t('retry')}</button>
                    <button class="btn-cancel">${lang.t('cancel')}</button>
                    <button class="btn-apply" ${!civitaiData ? 'disabled' : ''}>${lang.t('apply_changes')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 如果是 loading 状态，执行 fetch
        if (!civitaiData && retryFetchFn) {
            const doFetch = async () => {
                try {
                    modal.querySelector('.retry-btn').style.display = 'none';
                    // 重置网格为加载状态
                    modal.querySelector('.diff-grid').innerHTML = `
                        <div class="diff-row header" style="background: #1e293b; font-weight: bold; position: sticky; top: 0; z-index: 10;">
                            <div class="diff-cell">${lang.t('field')}</div>
                            <div class="diff-cell">${lang.t('local_value')}</div>
                            <div class="diff-cell">${targetTitle}</div>
                            <div class="diff-cell">${lang.t('use')}</div>
                        </div>
                        ${fields.map(f => buildRow(f)).join('')}
                    `;
                    
                    const data = await retryFetchFn();
                    if (data.status === 'success') {
                        modal.remove();
                        this.showDiffModal(path, localData, data.data, retryFetchFn, columnTitle, sourceUrl, data.data?.llm_info);
                    } else {
                        throw new Error(data.message || (lang.t('error') || 'Error'));
                    }
                } catch (e) {
                    console.error("[SK-LoRA] [System] 数据对比获取失败", e);
                    // 在右侧列显示错误
                    modal.querySelectorAll('.diff-cell.civitai').forEach(cell => {
                        cell.innerHTML = `<span style="color: #ef4444;">${e.message === "TIMEOUT" ? lang.t('sync_timeout') : e.message}</span>`;
                    });
                    
                    // 如果超时显示重试按钮
                    if (e.message === "TIMEOUT" || e.message.includes("timeout")) {
                        const retryBtn = modal.querySelector('.retry-btn');
                        retryBtn.style.display = 'block';
                        retryBtn.onclick = doFetch;
                    }
                }
            };
            doFetch();
        }

        // 事件绑定
        
        // 1. 输入框修改更新 stagedData
        modal.querySelectorAll('.diff-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const row = e.target.closest('.diff-row');
                const key = row.dataset.key;
                const checkbox = row.querySelector('.row-checkbox');
                const initialValue = e.target.dataset.initial;
                const currentValue = e.target.value;
                
                // 当内容改变且不等于初始值时，自动勾选；如果改回初始值，则取消勾选
                if (checkbox && !checkbox.disabled) {
                    if (currentValue !== initialValue) {
                        checkbox.checked = true;
                    } else {
                        checkbox.checked = false;
                    }
                }

                let val = currentValue;
                if (key === 'trigger_words' || key === 'tags') {
                    val = val.split(',').map(t => t.trim()).filter(t => t);
                } else if (key === 'new_version_available') {
                    val = val === 'true';
                }
                stagedData[key] = val;
            });
        });

        // 2. 图片 Toggle 逻辑已取消，改用 Use 列单选框控制
        
        // 3. 触发词模式 Toggle
        modal.querySelectorAll('input[name="trigger_words_mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                triggerMode = e.target.value;
            });
        });
        
        // 4. 标签模式 Toggle
        modal.querySelectorAll('input[name="tags_mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                tagsMode = e.target.value;
            });
        });

        // 5. Cancel
        modal.querySelector('.btn-cancel').onclick = () => {
            modal.remove();
        };

        // 6. Close X
        const closeX = modal.querySelector('.diff-close-x');
        if (closeX) {
            closeX.onclick = () => modal.remove();
        }

        // 7. Apply
        modal.querySelector('.btn-apply').onclick = async () => {
            const updates = {};
            const checkboxes = modal.querySelectorAll('.row-checkbox:checked');
            
            checkboxes.forEach(cb => {
                const row = cb.closest('.diff-row');
                const key = row.dataset.key;
                
                if (key === 'img') {
                    // 传递 C 站图片 URL
                    updates.civitai_image_url = civitaiData.civitai_image_url;
                    updates.civitai_image_type = civitaiData.civitai_image_type;
                } else if (key === 'trigger_words') {
                    // 从 DOM 获取最新的 tag 列表 (处理删除后的情况)
                    const container = row.querySelector('.tags-container');
                    let triggers = [];
                    if (container) {
                        container.querySelectorAll('.sk-tag').forEach(tagEl => {
                            if (tagEl.dataset.val) triggers.push(tagEl.dataset.val);
                        });
                    } else {
                        triggers = stagedData.trigger_words || [];
                    }
                    
                    if (triggerMode === 'merge') {
                        // 合并逻辑：本地 + 新的 (去重)
                        const localTriggers = localData.trigger_words || [];
                        const newTriggers = triggers;
                        const seen = new Set(localTriggers);
                        triggers = [...localTriggers, ...newTriggers.filter(t => !seen.has(t))];
                    }
                    updates.trigger_words = triggers;
                } else if (key === 'tags') {
                    // 从 DOM 获取最新的 tag 列表
                    const container = row.querySelector('.tags-container');
                    let tags = [];
                    if (container) {
                        container.querySelectorAll('.sk-tag').forEach(tagEl => {
                            if (tagEl.dataset.val) tags.push(tagEl.dataset.val);
                        });
                    } else {
                        tags = stagedData.tags || [];
                    }

                    if (tagsMode === 'merge') {
                        // 合并逻辑：本地 + 新的 (去重)
                        const localTags = localData.tags || [];
                        const newTags = tags;
                        const seen = new Set(localTags.map(t => String(t).toLowerCase()));
                        tags = [...localTags, ...newTags.filter(t => !seen.has(String(t).toLowerCase()))];
                    }
                    updates.tags = tags;
                } else {
                    updates[key] = stagedData[key];
                }
            });

            if (Object.keys(updates).length === 0) {
                ToastManager.info(lang.t('no_changes'));
                return;
            }

            // 发送更新请求
            try {
                const btn = modal.querySelector('.btn-apply');
                btn.disabled = true;
                btn.innerText = lang.t('saving');

                const response = await api.fetchApi("/lora_manager/update_lora_data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        path: path,
                        updates: updates
                    })
                });

                const res = await response.json();
                if (res.status === 'success') {
                    ToastManager.success(lang.t('save_success'));
                    this.refresh();
                    modal.remove();
                } else {
                    ToastManager.error(lang.t('save_error') + ': ' + res.message);
                    btn.disabled = false;
                    btn.innerText = lang.t('apply_changes');
                }
            } catch (e) {
                ToastManager.error((lang.t('error') || 'Error') + ': ' + e.message);
                modal.querySelector('.btn-apply').disabled = false;
            }
        };
    }

    formatValue(field, value) {
        if (value === undefined || value === null) return '-';
        if (field.type === 'date') {
            if (!value) return '-';
            try {
                return new Date(value * 1000).toLocaleDateString();
            } catch(e) { return value; }
        }
        if (field.type === 'tags') {
            return Array.isArray(value) ? value.join(', ') : value;
        }
        return value.toString();
    }

    // 同步单个 LoRA 项目
    async syncSingleItem(path, hash) {

        if (!hash) {
            ToastManager.error(lang.t('sync_failed_no_hash'));
            return;
        }

        // 检查设置
        if (this.localSettings.use_diff_sync) {
            // 新逻辑：差异同步
            const localData = this.loraData[path] || {};
            
            // 1. 即时弹出面板，传入 null 作为 civitaiData 表示 loading 状态
            // 并传入 fetch 函数用于重试逻辑
            const fetchFn = async () => {
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 20000));
                const fetchPromise = api.fetchApi("/lora_manager/fetch_civitai_diff", {
                    method: "POST",
                    body: JSON.stringify({ path, hash })
                });

                try {
                    const response = await Promise.race([fetchPromise, timeout]);
                    return await response.json();
                } catch (e) {
                    throw e; // 抛出给 showDiffModal 处理
                }
            };

            this.showDiffModal(path, localData, null, fetchFn, null, null, null);

        } else {
            // 原始逻辑
            try {
                // 显示加载状态
                ToastManager.info(lang.t('syncing'));

                const response = await api.fetchApi("/sknodes/lora_mgr/fetch_civitai", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path, hash })
                });

                const result = await response.json();
                
                // 调试：打印同步结果


                if (result.status === "success") {
                    ToastManager.success(lang.t('sync_completed'));
                    this.refresh(); // 刷新显示
                } else {
                    ToastManager.error(lang.t('sync_failed_unknown') + (result.message || ''));
                }
            } catch (error) {
                console.error('[SK-LoRA] [System] 同步错误:', error);
                ToastManager.error(lang.t('sync_failed_network'));
            }
        }
    }

    // AI分析数据
    async fetchFromUrl(path) {
        const localData = this.loraData[path] || {};
        let url = localData.link;

        const startFetch = (targetUrl) => {
             // 1. Fetch function for showDiffModal
            const fetchFn = async () => {
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 120000)); // 2 mins timeout for LLM
                const fetchPromise = api.fetchApi("/lora_manager/fetch_from_url", {
                    method: "POST",
                    body: JSON.stringify({ 
                        url: targetUrl, 
                        path: path,
                        locale: lang.locale // 传递当前语言
                    })
                });

                try {
                    const response = await Promise.race([fetchPromise, timeout]);
                    return await response.json();
                } catch (e) {
                    throw e;
                }
            };

            this.showDiffModal(path, localData, null, fetchFn, lang.t('ai_analysis'), targetUrl, null); // 初始 loading 状态，llm_info 为空
        };

        if (!url) {
            // 提示输入网址
            this.showUrlInputModal(path, (newUrl) => {
                if (newUrl) {
                    // 异步更新本地链接，不等待
                    this.updateField(path, 'link', newUrl);
                    startFetch(newUrl);
                }
            });
        } else {
            startFetch(url);
        }
    }

    showUrlInputModal(path, callback) {
        const modal = document.createElement('div');
        modal.className = 'sk-modal-overlay';
        modal.style.zIndex = '12000'; 
        
        modal.innerHTML = `
            <style>
                .sk-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); font-family: sans-serif; }
                .sk-modal-overlay .sk-modal-container { width: 400px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
                .sk-modal-overlay .sk-modal-header { padding: 16px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; background: #0f172a; }
                .sk-modal-overlay .sk-modal-title { font-size: 16px; font-weight: bold; color: #f8fafc; }
                .sk-modal-overlay .sk-modal-close { font-size: 24px; color: #94a3b8; cursor: pointer; line-height: 1; }
                .sk-modal-overlay .sk-modal-close:hover { color: #f8fafc; }
                .sk-modal-overlay .sk-modal-body { padding: 20px; color: #e2e8f0; }
                .sk-modal-overlay .sk-modal-footer { padding: 16px 20px; border-top: 1px solid #334155; display: flex; justify-content: flex-end; gap: 12px; background: #0f172a; }
                .sk-modal-overlay .sk-input-capsule { background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 8px 12px; border-radius: 6px; outline: none; font-size: 13px; transition: border-color 0.2s; }
                .sk-modal-overlay .sk-input-capsule:focus { border-color: #3b82f6; }
                .sk-modal-overlay .sk-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #475569; background: #334155; color: #f8fafc; cursor: pointer; font-size: 13px; transition: all 0.2s; }
                .sk-modal-overlay .sk-btn:hover { background: #475569; }
                .sk-modal-overlay .sk-btn-primary { background: #3b82f6; border-color: #2563eb; color: white; font-weight: bold; }
                .sk-modal-overlay .sk-btn-primary:hover { background: #2563eb; }
            </style>
            <div class="sk-modal-container">
                <div class="sk-modal-header">
                    <div class="sk-modal-title">${lang.t('menu_fetch_url')}</div>
                    <div class="sk-modal-close">×</div>
                </div>
                <div class="sk-modal-body">
                    <div style="margin-bottom: 10px; font-size: 14px; font-weight: 500;">${lang.t('enter_url_title') || '请输入模型网址：'}</div>
                    <input type="text" class="sk-input-capsule url-input" style="width: 100%; box-sizing: border-box;" placeholder="https://...">
                    <div style="margin-top: 10px; font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 6px; opacity: 0.8;">
                        ${Icons.get('info', '', 14)}
                        <span>${lang.t('enter_url_desc') || '比如 LibLib, HuggingFace, ModelScope...'}</span>
                    </div>
                </div>
                <div class="sk-modal-footer">
                    <button class="sk-btn btn-cancel">${lang.t('cancel')}</button>
                    <button class="sk-btn sk-btn-primary btn-confirm">${lang.t('fetch_url_btn') || 'Fetch'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        const input = modal.querySelector('.url-input');
        input.focus();
        
        const close = () => modal.remove();
        
        modal.querySelector('.sk-modal-close').onclick = close;
        modal.querySelector('.btn-cancel').onclick = close;
        
        modal.querySelector('.btn-confirm').onclick = () => {
            const val = input.value.trim();
            if (val) {
                callback(val);
                close();
            } else {
                ToastManager.error(lang.t('fetch_url_invalid') || 'Invalid URL');
            }
        };
        
        input.onkeydown = (e) => {
            if (e.key === 'Enter') modal.querySelector('.btn-confirm').click();
        };
    }

    // 新增 syncLocal 方法
    async syncLocal() {
        const btn = this.uiRoot.querySelector(".btn-local");
        const oldText = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = `<span class="hourglass-icon spin-animation">${Icons.get('hourglass', '', 14)}</span>${lang.t('syncing')}`;

            this.showSyncModal('local');

            // 启动同步请求
            const syncPromise = api.fetchApi("/sknodes/lora_mgr/sync_local", {
                method: "POST"
            });

            // 启动轮询获取同步状态
            const pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await api.fetchApi("/sknodes/lora_mgr/sync_local_status");
                    const status = await statusResponse.json();



                    if (status.status === 'idle') {
                        clearInterval(pollInterval);
                        return;
                    }

                    // 更新弹窗进度 - 始终更新，即使没有 current_item
                    let filename = '';
                    if (status.current_item !== undefined && status.current_item !== null) {
                        const prefix = lang.t('processing');
                        filename = status.current_item.startsWith(prefix) 
                            ? status.current_item.substring(prefix.length) 
                            : status.current_item.replace(prefix, '');
                    }

                    this.updateSyncModalProgress({
                        filename: filename,
                        hash: status.hash !== undefined ? status.hash : '',
                        has_preview: status.has_preview,
                        date: status.date,
                        total: status.stats?.total,
                        current: status.stats?.processed,
                        log: status.status
                    });
                } catch (e) {
                    console.error("[SK-LoRA] [System] 轮询状态错误:", e);
                }
            }, 300);

            // 等待同步完成
            const response = await syncPromise;
            clearInterval(pollInterval);

            const result = await response.json();

            if (result.status === "success") {
                await this.refresh();
                await this.calculateAndSaveStatistics();
                this.updateSyncModalComplete(result);
            } else if (result.status === "cancelled") {
                this.updateSyncModalComplete({
                    message: lang.t('sync_cancelled'),
                    stats: result.stats
                });
            } else {
                throw new Error(result.message || (lang.t('error') || 'Error'));
            }
        } catch (e) {
            console.error("[SK-LoRA] [System] 本地同步错误:", e);
            this.updateSyncModalError(e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    }

    // 新增 syncCivitai 方法
    async syncCivitai() {
        const btn = this.uiRoot.querySelector(".btn-civit");
        const hourglassIcon = btn.querySelector('.hourglass-icon');
        const oldText = btn.innerHTML;
        let syncDialog = null;

        try {
            btn.disabled = true;
            btn.classList.add('syncing');
            hourglassIcon.classList.add('spinning');
            btn.innerHTML = `<span class="hourglass-icon spinning">${Icons.get('hourglass', '', 14)}</span>${lang.t('civitai_syncing')}`;

            const paths = Object.keys(this.loraData);
            if (paths.length === 0) {
                ToastManager.info(lang.t('no_lora_found') || "No LoRA files found");
                return;
            }

            syncDialog = new SyncProgressDialog();
            let isCancelled = false;
            
            const onCancel = async () => {
                isCancelled = true;
                try {
                    await api.fetchApi("/sknodes/lora_mgr/sync_civitai_batch_cancel", { method: "POST" });
                } catch (e) { console.error("[SK-LoRA] [System] 取消失败:", e); }
            };

            const onBackground = () => {
                // 后台模式仅隐藏弹窗，逻辑继续运行
            };

            // 获取当前活跃的 LLM 配置信息
            let llmInfo = null;
            if (this.localSettings.llm_activate) {
                try {
                    const resp = await api.fetchApi("/sknodes/llm_mgr/get_configs");
                    const data = await resp.json();
                    if (data && data.active_llm_id) {
                        const activeCfg = data.llm_configs.find(c => c.id === data.active_llm_id);
                        if (activeCfg) {
                            llmInfo = {
                                provider: activeCfg.provider,
                                alias: activeCfg.alias,
                                model: activeCfg.selected_model
                            };
                        }
                    }
                } catch (e) {
                    console.error("[SK-LoRA] [LLM] 获取同步弹窗 LLM 信息失败:", e);
                }
            }

            syncDialog.create('civitai', onCancel, onBackground, this.localSettings.llm_activate, llmInfo);

            const startResp = await api.fetchApi("/sknodes/lora_mgr/sync_civitai_batch_start", {
                method: "POST",
                body: JSON.stringify({ paths: paths })
            });
            const startResult = await startResp.json();
            
            if (startResult.status !== "success") {
                throw new Error(startResult.message || (lang.t('error') || 'Error'));
            }

            // 轮询 Promise
            await new Promise((resolve, reject) => {
                const pollInterval = setInterval(async () => {
                    try {
                        const statusResp = await api.fetchApi("/sknodes/lora_mgr/sync_civitai_batch_status");
                        const status = await statusResp.json();
                        
                        // 处理来自后端的取消状态
                    if (isCancelled && (status.status === 'cancelled' || status.status === 'finished' || status.status === 'idle')) {
                        clearInterval(pollInterval);
                        syncDialog.showComplete({
                            total: status.total,
                            success: status.success,
                            failed: status.failed
                        });
                        
                        // 显示已保存项目数量
                        const savedCount = status.success;
                        ToastManager.info(lang.t('sync_cancelled_saved').replace('{count}', savedCount) || `Sync cancelled. Saved ${savedCount} items.`);
                        
                        resolve();
                        return;
                    }

                    if ((status.status === 'finished' || status.status === 'idle') && status.total > 0 && !isCancelled) {
                         // 自然结束
                        clearInterval(pollInterval);
                        syncDialog.update(status); // 最终更新
                        syncDialog.showComplete({
                            total: status.total,
                            success: status.success,
                            failed: status.failed
                        });
                        resolve();
                        return;
                    }
                        
                        // 正常更新
                        syncDialog.update(status);
                        
                    } catch (e) {
                        console.error("[SK-LoRA] [System] 轮询错误:", e);
                        // 轮询出错时不要立即拒绝，重试
                    }
                }, 1000);
            });

            await this.refresh();
            await this.calculateAndSaveStatistics();

        } catch (e) {
            console.error("[SK-LoRA] [System] C站同步错误:", e);
            // 如果弹窗打开，显示错误
            if (syncDialog && syncDialog.dialog) {
                syncDialog.showError(e.message || lang.t('save_error'));
            } else {
                ToastManager.error(lang.t('save_error'));
            }
        } finally {
            btn.disabled = false;
            btn.classList.remove('syncing');
            btn.innerHTML = oldText;
        }
    }

    async refresh() {
        const res = await api.fetchApi("/sknodes/lora_mgr/get_all");
        const data = await res.json();
        this.loraData = data.metadata || data; // 兼容旧格式
        this.baseDir = data.base_dir || "";

        // 通知 Selector 刷新缓存
        if (window.SKLoraSelector) {
            window.SKLoraSelector.getInstance().refreshData();
        }

        // 同步设置数据
        await Promise.all([
            this.fetchBaseModelSettings(),
            this.fetchLocalSettings()
        ]);

        if (this.uiRoot) {
            this.renderSidebar();
            this.renderContent();
        }
    }

    renderSidebar() {
        if (!this.uiRoot) return;
        const list = this.uiRoot.querySelector(".folder-list");
        list.innerHTML = "";
        const addItem = (id, icon, label) => {
            const item = document.createElement("div");
            item.className = `folder-item ${this.currentFolder === id ? 'active' : ''}`;
            item.innerHTML = `<span>${icon}</span> <span>${label}</span>`;
            item.onclick = () => { this.currentFolder = id; this.renderSidebar(); this.renderContent(); };
            list.appendChild(item);
        };
        addItem("All", Icons.get('package', '', 14), lang.t('all_lora'));
        addItem("Favorites", Icons.get('star', '', 14), lang.t('favorites'));
        const sep = document.createElement("div"); sep.className = "sidebar-separator"; list.appendChild(sep);
        const folders = [];
        Object.keys(this.loraData).forEach(p => { if (p.includes('/')) folders.push(p.split('/')[0]); });
        [...new Set(folders)].sort().forEach(f => addItem(f, Icons.get('folder', '', 14), f));
    }

    async show() { 
        this.createUI(); 
        this.uiRoot.style.display = "flex"; 
        this.updateUITexts(); // 确保文本和绑定已更新
        await this.refresh(); 
        await this.calculateAndSaveStatistics();
        this.updateStatisticsDisplay(); 
    }
    hide() { if (this.uiRoot) this.uiRoot.style.display = "none"; }

    // 显示设置面板
    // 注入全局 UI 样式
    injectGlobalStyles() {
        if (document.getElementById('sk-mgr-global-styles')) return;
        const style = document.createElement('style');
        style.id = 'sk-mgr-global-styles';
        style.innerHTML = `
            :root { --sk-bg-color: #1a1a1b; --sk-sidebar-bg: #111111; --sk-accent-color: #3a8ee6; --sk-text-color: #e2e8f0; --sk-border-color: #334155; --sk-glass-bg: rgba(30, 41, 59, 0.7); }
            .sk-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 11000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px); font-family: sans-serif; color: var(--sk-text-color); }
            .sk-modal-container { display: flex; flex-direction: row; width: 950px; height: 650px; max-width: 95vw; max-height: 90vh; background: var(--sk-bg-color); border-radius: 16px; overflow: hidden; border: 1px solid #444; box-shadow: 0 30px 60px rgba(0,0,0,0.6); }
            .sk-modal-container.sk-modal-sm { width: 450px; height: auto; flex-direction: column; }
            .sk-modal-container.sk-modal-md { width: 550px; height: auto; flex-direction: column; }
            .sk-modal-sidebar { width: 180px; min-width: 180px; background: var(--sk-sidebar-bg); display: flex; flex-direction: column; border-right: 1px solid #222; flex-shrink: 0; height: 100%; box-sizing: border-box; }
            .sk-sidebar-header { padding: 20px 10px; text-align: center; border-bottom: 1px solid #222; flex-shrink: 0; }
            .sk-sidebar-title { font-weight: bold; color: #fff; font-size: 15px; letter-spacing: 1px; }
            .sk-sidebar-nav { flex: 1; padding: 12px 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; scrollbar-width: thin; }
            .sk-nav-item { padding: 14px 20px !important; color: #888; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s; font-size: 14px; border-left: 3px solid transparent; font-weight: 500; min-height: 52px !important; height: 52px; flex-shrink: 0 !important; box-sizing: border-box; white-space: nowrap; }
            .sk-nav-item:hover { color: #ccc; background: rgba(255,255,255,0.02); }
            .sk-nav-item.active { background: rgba(58, 142, 230, 0.08); color: var(--sk-accent-color); border-left-color: var(--sk-accent-color); font-weight: 600; }
            .sk-nav-item .icon { font-size: 20px; width: 24px; display: flex; align-items: center; justify-content: center; }
            .sk-modal-content { flex: 1; display: flex; flex-direction: column; background: var(--sk-bg-color); min-width: 0; }
            .sk-modal-header-mobile { display: none; padding: 16px; border-bottom: 1px solid #333; justify-content: space-between; align-items: center; }
            .sk-modal-header { padding: 15px 20px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); flex-shrink: 0; }
            .sk-modal-title { font-weight: bold; color: #fff; font-size: 16px; display: flex; align-items: center; gap: 8px; }
            .sk-modal-close { font-size: 24px; color: #666; cursor: pointer; transition: 0.2s; line-height: 1; }
            .sk-modal-close:hover { color: #fff; }
            .sk-modal-body { flex: 1; padding: 25px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #444 transparent; }
            .sk-modal-footer { padding: 20px; border-top: 1px solid #222; display: flex; justify-content: flex-end; gap: 12px; background: rgba(0,0,0,0.2); flex-shrink: 0; }
            .sk-tab-pane { display: none; animation: skFadeIn 0.3s ease; }
            .sk-tab-pane.active { display: block; }
            @keyframes skFadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            .sk-modal-container .sk-btn { padding: 8px 20px; border-radius: 6px; border: 1px solid #444; background: #333; color: #ccc; cursor: pointer; font-size: 13px; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; outline: none; }
            .sk-modal-container .sk-btn:hover { background: #444; color: #fff; border-color: #555; }
            .sk-modal-container .sk-btn-primary { background: var(--sk-accent-color); color: #fff; border: none; font-weight: 500; }
            .sk-modal-container .sk-btn-primary:hover { filter: brightness(1.1); transform: scale(1.02); }
            .sk-modal-container .sk-btn-primary:disabled { background: #444; color: #666; cursor: not-allowed; transform: none; filter: none; }
            .sk-modal-container .sk-btn-sm { padding: 4px 10px; font-size: 11px; }
            .sk-modal-container .sk-btn-secondary { background: #1e293b; border: 1px solid #334155; color: #94a3b8; }
            .sk-modal-container .sk-btn-secondary:hover { background: #334155; color: #fff; }
            .sk-modal-container .sk-btn-orange { background: #f97316; color: #fff; border: none; border-radius: 12px; font-weight: 500; transition: all 0.2s; }
            .sk-modal-container .sk-btn-orange:hover { background: #fb923c; color: #fff; }
            .sk-modal-container .sk-input, .sk-modal-container .sk-select { background: #090909; border: 1px solid #334155; color: #fff; padding: 8px 12px; border-radius: 6px; outline: none; width: 100%; box-sizing: border-box; transition: 0.2s; font-size: 13px; }
            .sk-modal-container .sk-input:focus, .sk-modal-container .sk-select:focus { border-color: var(--sk-accent-color); box-shadow: 0 0 0 2px rgba(58, 142, 230, 0.2); }
            .sk-modal-container .sk-input-sm { padding: 6px 10px; font-size: 12px; width: 180px; }
            .sk-modal-container .sk-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin-bottom: 20px; backdrop-filter: blur(10px); }
            .sk-modal-container .sk-card-header { font-size: 14px; font-weight: bold; color: #ccc; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: center; }
            .sk-modal-container .sk-form-group { margin-bottom: 15px; }
            .sk-modal-container .sk-form-group label { display: block; color: #aaa; font-size: 12px; margin-bottom: 6px; }
            .sk-modal-container .sk-form-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.02); }
            .sk-modal-container .sk-form-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
            .sk-modal-container .sk-form-row label { color: #ccc; font-size: 13px; display: flex; align-items: center; gap: 6px; }
            .sk-modal-container .sk-switch { position: relative; display: inline-block; width: 40px; height: 20px; }
            .sk-modal-container .sk-switch input { opacity: 0; width: 0; height: 0; }
            .sk-modal-container .sk-slider { position: absolute; cursor: pointer; inset: 0; background-color: #334155; transition: .3s; border-radius: 20px; }
            .sk-modal-container .sk-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
            .sk-modal-container input:checked + .sk-slider { background-color: var(--sk-accent-color); }
            .sk-modal-container input:checked + .sk-slider:before { transform: translateX(20px); }
            .sk-modal-container .sk-info-icon { width: 15px; height: 15px; background: rgba(255,255,255,0.1); color: #94a3b8; border: 1px solid #475569; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; cursor: help; transition: 0.2s; position: relative; margin-left: 4px; font-family: "Times New Roman", serif; font-weight: normal; }
            .sk-modal-container .sk-info-icon:hover { background: var(--sk-accent-color); color: #fff; border-color: var(--sk-accent-color); z-index: 100; }
            .sk-modal-container .sk-info-icon:hover::after { content: attr(data-tooltip); position: absolute; bottom: 120%; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.95); padding: 10px 14px; border-radius: 8px; font-size: 12px; white-space: pre-wrap; width: max-content; max-width: 450px; text-align: left; pointer-events: none; border: 1px solid #444; box-shadow: 0 5px 15px rgba(0,0,0,0.5); z-index: 11100; line-height: 1.5; color: #fff; }
            .sk-modal-container .sk-info-icon.sk-tooltip-right:hover::after { left: auto; right: 0; transform: none; }
            .sk-modal-container .sk-info-icon.sk-tooltip-left:hover::after { left: 0; transform: none; }
            .sk-modal-container .sk-bm-section { margin-bottom: 20px; }
            .sk-modal-container .sk-bm-title { font-size: 13px; color: #94a3b8; margin-bottom: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
            .sk-modal-container .sk-bm-title svg { opacity: 0.8; color: var(--sk-accent-color); }
            .sk-modal-container .sk-capsule-list { display: flex; flex-wrap: wrap; gap: 8px; min-height: 40px; max-height: 250px; overflow-y: auto; scrollbar-width: thin; padding-right: 5px; }
            .sk-modal-container .sk-capsule { border: 1px solid #444; color: #666; padding: 0 12px; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 12px; user-select: none; background: rgba(0,0,0,0.2); transition: all 0.2s; height: 28px; line-height: 28px; box-sizing: border-box; }
            .sk-modal-container .sk-capsule:hover { border-color: #666; color: #999; }
            .sk-modal-container .sk-capsule.active { border-color: var(--sk-accent-color); color: var(--sk-accent-color); background: rgba(58, 142, 230, 0.05); text-shadow: 0 0 5px rgba(58, 142, 230, 0.4); }
            .sk-modal-container .sk-capsule.active:hover { background: rgba(58, 142, 230, 0.1); box-shadow: 0 0 8px rgba(58, 142, 230, 0.2); }
            .sk-modal-container .sk-drag-handle { cursor: grab; opacity: 0.3; font-size: 10px; letter-spacing: -1px; margin-right: 2px; height: 100%; display: flex; align-items: center; }
            .sk-modal-container .sk-capsule:hover .sk-drag-handle { opacity: 0.7; }
            .sk-modal-container .sk-capsule.dragging { opacity: 0.5; transform: scale(0.95); }
            .sk-modal-container .sk-capsule-name { display: inline-block; vertical-align: middle; }
            .sk-modal-container .sk-llm-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
            .sk-modal-container .sk-llm-card { display: flex; align-items: center; background: rgba(255,255,255,0.05); border: 1px solid #334155; padding: 12px; border-radius: 8px; transition: all 0.2s; position: relative; overflow: hidden; }
            .sk-modal-container .sk-llm-card:hover { background: rgba(255,255,255,0.08); border-color: #475569; }
            .sk-modal-container .sk-llm-card.active { border-color: var(--sk-accent-color); background: rgba(58, 142, 230, 0.1); }
            .sk-modal-container .sk-llm-card.is-default { border-color: #fbbf24; overflow: visible; }
            .sk-modal-container .sk-llm-badge-default { position: absolute; top: -6px; left: -6px; background: #fbbf24; color: #000; font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 3px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.3); letter-spacing: 0.5px; }
            .sk-modal-container .sk-llm-icon { display: flex; align-items: center; justify-content: center; margin-right: 15px; width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,0.05); flex-shrink: 0; }
            .sk-modal-container .sk-llm-icon svg { width: 24px; height: 24px; }
            .sk-modal-container .sk-llm-info { flex: 1; overflow: hidden; min-width: 0; padding-right: 20px; }
            .sk-modal-container .sk-llm-name { font-weight: bold; color: #e2e8f0; display: flex; align-items: center; gap: 8px; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sk-modal-container .sk-llm-model { font-size: 11px; color: #64748b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sk-modal-container .sk-llm-tag { background: var(--sk-accent-color); color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
            .sk-modal-container .sk-llm-actions { position: absolute; right: 0; top: 0; bottom: 0; display: flex; align-items: center; gap: 6px; opacity: 0; transition: 0.2s; background: linear-gradient(to left, #0f172a 70%, transparent); padding-left: 24px; padding-right: 12px; pointer-events: none; }
            .sk-modal-container .sk-llm-card:hover .sk-llm-actions, .sk-modal-container .sk-llm-card.active .sk-llm-actions { opacity: 1; pointer-events: auto; }
            .sk-modal-container .sk-llm-btn { background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 5px; border-radius: 6px; cursor: pointer; transition: 0.2s; font-size: 12px; line-height: 1; display: flex; align-items: center; justify-content: center; }
            .sk-modal-container .sk-llm-btn:hover { background: #334155; color: #f8fafc; border-color: #475569; }
            .sk-modal-container .sk-llm-btn.delete:hover { background: #ef4444; color: white; border-color: #ef4444; }
            .sk-modal-container .sk-llm-btn.default:hover { color: #fbbf24; }
            .sk-modal-container .sk-llm-modal-body { padding: 20px; max-height: 70vh; overflow-y: auto; }
            .sk-modal-container .sk-llm-provider-select { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
            .sk-modal-container .sk-llm-provider-select.is-locked .sk-provider-option { cursor: default; }
            .sk-modal-container .sk-provider-option { position: relative; flex: 1; min-width: 80px; padding: 12px 8px; background: #090909; border: 1px solid #334155; border-radius: 8px; text-align: center; cursor: pointer; transition: 0.2s; }
            .sk-modal-container .sk-provider-option:hover { background: #111111; border-color: #475569; }
            .sk-modal-container .sk-provider-option.selected { border-color: var(--sk-accent-color); background: rgba(58, 142, 230, 0.1); }
            .sk-modal-container .sk-provider-option.is-disabled { opacity: 0.4; cursor: not-allowed; filter: grayscale(0.8); }
            .sk-modal-container .sk-provider-option.is-disabled:hover { background: #090909; border-color: #334155; }
            .sk-modal-container .sk-provider-icon { position: relative; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; height: 32px; }
            .sk-modal-container .sk-provider-lock-badge { position: absolute; top: 4px; left: 4px; background: #ef4444; color: #fff; border-radius: 4px; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 5; }
            .sk-modal-container .sk-provider-icon svg { width: 24px; height: 24px; }
            .sk-modal-container .sk-provider-name { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .sk-modal-container .sk-provider-option.selected .sk-provider-name { color: #fff; font-weight: bold; }
            .sk-modal-container .sk-llm-form-group { margin-bottom: 15px; }
            .sk-modal-container .sk-llm-form-label { display: block; color: #aaa; font-size: 12px; margin-bottom: 6px; font-weight: 500; }
            .sk-modal-container .sk-llm-input { background: #090909; border: 1px solid #334155; color: #fff; padding: 10px 12px; border-radius: 6px; outline: none; width: 100%; box-sizing: border-box; transition: 0.2s; font-size: 13px; }
            .sk-modal-container .sk-llm-input:read-only { background: #111; color: #94a3b8; cursor: default; }
            .sk-modal-container .sk-llm-input:disabled { background: #111; color: #64748b; cursor: not-allowed; }
            .sk-modal-container .sk-llm-input[type="number"]::-webkit-inner-spin-button, .sk-modal-container .sk-llm-input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: inner-spin-button !important; opacity: 0; height: 28px; width: 28px; cursor: pointer; margin: 0 4px 0 0; transition: opacity 0.2s ease; }
            .sk-modal-container .sk-llm-input[type="number"]:hover::-webkit-inner-spin-button, .sk-modal-container .sk-llm-input[type="number"]:hover::-webkit-outer-spin-button { opacity: 1; }
            .sk-modal-container .sk-llm-input:focus { border-color: var(--sk-accent-color); box-shadow: 0 0 0 2px rgba(58, 142, 230, 0.2); }
            .sk-modal-container .sk-llm-input.locked { background: #111111; color: #64748b; cursor: not-allowed; }
            .sk-modal-container .sk-llm-input-wrapper { position: relative; display: flex; align-items: center; }
            .sk-modal-container .sk-pwd-toggle, .sk-modal-container .sk-llm-input-icon { position: absolute; right: 10px; color: #64748b; cursor: pointer; font-size: 14px; user-select: none; display: flex; align-items: center; justify-content: center; top: 50%; transform: translateY(-50%); transition: 0.2s; }
            .sk-modal-container .sk-pwd-toggle:hover, .sk-modal-container .sk-llm-input-icon:hover { color: var(--sk-accent-color); }
            .sk-modal-container .sk-llm-input-group { display: flex; gap: 8px; align-items: center; }
            .sk-modal-container .sk-llm-refresh-btn { background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 8px; border-radius: 6px; cursor: pointer; transition: 0.2s; line-height: 1; }
            .sk-modal-container .sk-llm-refresh-btn:hover { background: #334155; color: #fff; }
            .sk-modal-container .sk-llm-checkbox-group { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
            .sk-modal-container .sk-llm-checkbox { width: 14px; height: 14px; cursor: pointer; accent-color: var(--sk-accent-color); }
            .sk-modal-container .sk-llm-checkbox-label { font-size: 12px; color: #94a3b8; cursor: pointer; }
            .sk-modal-container .sk-llm-warning { padding: 8px 12px; border-radius: 6px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); margin-top: 10px; }
            .sk-modal-container .sk-llm-warning-text { font-size: 11px; margin-top: 4px; display: block; }
            .sk-modal-container .sk-llm-tip { font-size: 10px; color: #94a3b8; font-weight: normal; margin-left: 5px; }
            .sk-modal-container .sk-llm-empty { text-align: center; color: #64748b; padding: 20px; font-size: 13px; }
            .sk-modal-container .sk-llm-get-key-link { display: flex; align-items: center; gap: 4px; color: var(--sk-accent-color); font-size: 11px; text-decoration: none; padding: 2px 6px; border-radius: 4px; background: rgba(58, 142, 230, 0.1); transition: 0.2s; white-space: nowrap; max-width: 60%; overflow: hidden; text-overflow: ellipsis; border: 1px solid transparent; }
            .sk-modal-container .sk-llm-get-key-link:hover { background: rgba(58, 142, 230, 0.2); border-color: rgba(58, 142, 230, 0.3); color: #fff; }
            .sk-modal-container .sk-llm-get-key-link svg { flex-shrink: 0; opacity: 0.8; }
            .sk-modal-container .sk-llm-get-key-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sk-modal-container.sk-llm-center { width: 1120px; height: 780px; max-width: 97vw; max-height: 94vh; flex-direction: column; }
            .sk-llm-center-body { flex: 1; display: flex; min-height: 0; }
            .sk-llm-center-left { width: 320px; border-right: 1px solid #222; display: flex; flex-direction: column; min-height: 0; }
            .sk-llm-center-left-header { height: 60px; padding: 0 16px; border-bottom: 1px solid #222; background: rgba(0,0,0,0.15); flex-shrink: 0; display: flex; align-items: center; box-sizing: border-box; }
            .sk-llm-center-left-list { padding: 14px 16px 16px; overflow-y: auto; min-height: 0; }
            .sk-llm-center-right { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
            .sk-llm-center-right-header { height: 60px; padding: 0 20px; border-bottom: 1px solid #222; background: rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; box-sizing: border-box; }
            .sk-llm-center-right-title { font-weight: 600; color: #e2e8f0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sk-llm-center-right-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
            .sk-llm-center-form { flex: 1; overflow-y: auto; min-height: 0; }
            .sk-modal-container.sk-llm-center .sk-llm-modal-body { max-height: none; overflow-y: visible; padding: 18px 20px; }

            .sk-modal-container.sk-llm-center .sk-llm-provider-select { flex-wrap: nowrap; gap: 8px; margin-bottom: 16px; }
            .sk-modal-container.sk-llm-center .sk-provider-option { min-width: 0; padding: 10px 6px; }
            .sk-modal-container.sk-llm-center .sk-provider-icon { font-size: 22px; margin-bottom: 5px; }

            .sk-modal-container.sk-modal-sm .sk-llm-provider-select { gap: 8px; margin-bottom: 16px; }
            .sk-modal-container.sk-modal-sm .sk-provider-option { flex: 1 1 calc(25% - 8px); min-width: 0; padding: 10px 6px; }
            .sk-modal-container.sk-modal-sm .sk-provider-icon { font-size: 22px; margin-bottom: 5px; }
            .sk-modal-container.sk-modal-sm .sk-provider-name { font-size: 10px; }
            .sk-modal-container .sk-llm-card.active { border-color: var(--sk-accent-color); background: rgba(58, 142, 230, 0.1); }
            .sk-modal-container .sk-llm-card.is-default { box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.25); }
            /* Snapshot Modal Styles */
            .sk-snapshot-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 12000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
            .sk-snapshot-modal-container { background: var(--sk-bg-color); border: 1px solid #444; border-radius: 12px; width: 600px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .sk-snapshot-modal-container .sk-modal-header { padding: 16px 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); }
            .sk-snapshot-modal-container .sk-modal-title { font-size: 16px; font-weight: bold; color: #ccc; }
            .sk-snapshot-modal-container .sk-modal-close { font-size: 24px; color: #666; cursor: pointer; line-height: 1; }
            .sk-snapshot-modal-container .sk-modal-close:hover { color: #fff; }
            .sk-snapshot-list { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
            .sk-snapshot-card { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid #333; border-radius: 8px; transition: 0.2s; min-width: 0; }
            .sk-snapshot-card:hover { border-color: #444; background: rgba(255,255,255,0.05); }
            .sk-snapshot-info { flex: 1; min-width: 0; overflow: hidden; }
            .sk-snapshot-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
            .sk-snapshot-filename { font-size: 13px; color: #eee; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sk-snapshot-meta { font-size: 11px; color: #666; display: flex; gap: 10px; white-space: nowrap; align-items: center; }
            .sk-snapshot-remark { font-size: 11px; color: #94a3b8; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #333; }
            .sk-snapshot-actions { margin-left: 15px; display: flex; gap: 8px; flex-shrink: 0; }
            .sk-snapshot-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #334155; color: #94a3b8; flex-shrink: 0; }
            .sk-snapshot-tag.auto { background: rgba(58, 142, 230, 0.15); color: var(--sk-accent-color); border: 1px solid rgba(58, 142, 230, 0.2); }
            .sk-snapshot-tag.manual { background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); }
            .sk-snapshot-warning { color: #f59e0b; cursor: help; margin-left: 5px; }
            .sk-snapshot-card.invalid { opacity: 0.6; }
            .sk-snapshot-card.invalid .sk-snapshot-filename { color: #666; }
            .sk-snapshot-remark-icon { margin-left: 8px; font-size: 12px; opacity: 0.8; cursor: help; }
            
            /* Button States */
            .sk-btn-danger { background: #7f1d1d; color: #fecaca; border: 1px solid #991b1b; }
            .sk-btn-danger:hover { background: #991b1b; color: #fff; }
            .sk-btn.confirming, .sk-llm-btn.confirming { background: #f59e0b; color: #000; border-color: #d97706; }
            .sk-btn-sm { padding: 4px 10px; font-size: 11px; }
            
            /* New UI Elements */
            .sk-modal-container .sk-input-group { position: relative; display: flex; align-items: center; width: 100%; }
            .sk-modal-container .sk-input-group input { padding-right: 30px; }
            .sk-modal-container .sk-input-eye { position: absolute; right: 8px; cursor: pointer; color: #666; font-size: 14px; user-select: none; z-index: 10; }
            .sk-modal-container .sk-input-eye:hover { color: #ccc; }
            .sk-modal-container .sk-form-group label, .sk-modal-container .sk-form-row label, .sk-modal-container .sk-settings-row label { white-space: nowrap; }
            .sk-modal-container .sk-snapshot-remark-icon { margin-left: 8px; font-size: 12px; opacity: 0.8; cursor: help; }
            
            /* Unified width for settings inputs */
            .sk-modal-container .sk-form-row .sk-input:not(.sk-input-sm), 
            .sk-modal-container .sk-form-row .sk-select, 
            .sk-modal-container .sk-form-row .sk-input-group,
            .sk-modal-container .sk-settings-row .sk-input:not(.sk-input-sm),
            .sk-modal-container .sk-settings-row .sk-select,
            .sk-modal-container .sk-settings-row .sk-input-group { width: 500px !important; flex-shrink: 0; }

            /* Backup Info Beautification */
            .sk-last-backup-container { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(58, 142, 230, 0.05); border: 1px solid rgba(58, 142, 230, 0.15); border-radius: 8px; margin: 2px 0 12px 0; color: #e2e8f0; font-size: 12px; transition: all 0.3s ease; box-shadow: inset 0 0 5px rgba(0,0,0,0.1); }
            .sk-last-backup-container:hover { background: rgba(58, 142, 230, 0.08); border-color: rgba(58, 142, 230, 0.3); transform: translateY(-1px); }
            .sk-last-backup-container .backup-icon { font-size: 14px; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: rgba(58, 142, 230, 0.15); border-radius: 4px; color: var(--sk-accent-color); flex-shrink: 0; }
            .sk-last-backup-container .backup-info { display: flex; flex-direction: row; align-items: center; gap: 8px; flex: 1; }
            .sk-last-backup-container .backup-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; white-space: nowrap; }
            .sk-last-backup-container .backup-time { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-weight: 500; font-size: 11px; color: #94a3b8; }

            /* Tag Filtering Styles */
            .sk-tag-filter-desc { font-size: 12px; color: #64748b; margin-bottom: 12px; line-height: 1.4; }
            .sk-tag-blacklist-container { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; min-height: 40px; }
            .sk-tag-item { position: relative; display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(58, 142, 230, 0.1); border: 1px solid rgba(58, 142, 230, 0.3); border-radius: 16px; color: #e2e8f0; font-size: 13px; overflow: hidden; user-select: none; transition: all 0.2s ease; }
            .sk-tag-item.confirming { border-color: #f87171; background: rgba(248, 113, 113, 0.1); }
            .sk-tag-item .tag-del { cursor: pointer; color: #94a3b8; font-size: 14px; transition: all 0.2s; z-index: 2; width: auto; min-width: 18px; padding: 0 4px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 9px; }
            .sk-tag-item .tag-del:hover { color: #f87171; background: rgba(248, 113, 113, 0.2); }
            .sk-tag-item.confirming .tag-del { color: #fff; background: #ef4444; font-weight: bold; font-size: 11px; padding: 0 8px; }
            .sk-tag-item .tag-del-progress { position: absolute; left: 0; bottom: 0; height: 100%; width: 0; background: rgba(248, 113, 113, 0.2); z-index: 1; pointer-events: none; }
            .sk-tag-add-row { display: flex; gap: 10px; align-items: center; }
            .sk-tag-add-row .sk-input { flex: 1; }
            #sk-btn-tag-restore { min-width: 80px; transition: all 0.3s ease; }
            #sk-btn-tag-restore.confirming { background: #ef4444 !important; color: white !important; border-color: #ef4444 !important; }
        `;
        document.head.appendChild(style);
    }

    // 显示设置面板
    async showSettingsModal(tab = 'basic') {
        this.injectGlobalStyles();
        // 1. Fetch Data
        await Promise.all([
            this.fetchBaseModelSettings(),
            this.fetchLocalSettings()
        ]);

        // 2. Verify Backup
        try {
            const resp = await api.fetchApi("/lora_manager/list_snapshots");
            const res = await resp.json();
            if (res.status === 'success') {
                const latestSnapshot = res.snapshots.length > 0 ? res.snapshots[0].display_time : "";
                if (this.localSettings.last_backup !== latestSnapshot) {
                    this.localSettings.last_backup = latestSnapshot;
                    await api.fetchApi("/lora_manager/save_local_settings", {
                        method: "POST",
                        body: JSON.stringify(this.localSettings)
                    });
                }
            }
        } catch (e) { console.error("[SK-LoRA] [Backup] 备份验证失败:", e); }

        // 3. Create Modal
        const modal = document.createElement('div');
        modal.className = 'sk-modal-overlay';
        let draggedItem = null;
        let currentTab = tab; // 使用传入的 tab 追踪当前标签页

        const updateContent = () => {
            const visibleNames = this.localSettings.visible_system_names || [];
            let systemPresets = this.baseModelSettings.system_presets || [];
            let userCustom = this.baseModelSettings.user_custom || [];
            
            // 标准化自定义项
            userCustom = userCustom.map((p, i) => ({
                ...p, 
                category: 'custom', 
                order: p.order || (i + 999),
                name: typeof p === 'string' ? p : p.name
            }));
            this.baseModelSettings.user_custom = userCustom;

            const categories = {
                image: systemPresets.filter(p => p.category === 'image').sort((a, b) => a.order - b.order),
                video: systemPresets.filter(p => p.category === 'video').sort((a, b) => a.order - b.order),
                custom: userCustom.sort((a, b) => a.order - b.order)
            };

            const createSwitch = (id, checked) => `
                <label class="sk-switch">
                    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
                    <span class="sk-slider"></span>
                </label>
            `;
            
            const createTooltip = (text, cls = "") => `
                <span class="sk-info-icon ${cls}" data-tooltip="${text}">i</span>
            `;

            const renderCapsule = (p, visibleList, isUser = false) => {
                const isActive = visibleList.includes(p.name) || isUser;
                const activeClass = isActive ? 'active' : '';
                const userClass = isUser ? 'is-user' : '';
                return `
                    <div class="sk-capsule ${activeClass} ${userClass}" data-name="${p.name}" draggable="true">
                        <span class="sk-drag-handle">::</span>
                        <span class="sk-capsule-name">${p.name}</span>
                    </div>
                `;
            };

            modal.innerHTML = `
                <div class="sk-modal-container">
                    <div class="sk-modal-sidebar">
                        <div class="sk-sidebar-header">
                            <div class="sk-sidebar-title">${lang.t('settings')}</div>
                        </div>
                        <div class="sk-sidebar-nav">
                            <div class="sk-nav-item ${currentTab === 'basic' ? 'active' : ''}" data-tab="basic">
                                <span class="icon">${Icons.get('settings', '', 14)}</span> ${lang.t('tab_basic_config')}
                            </div>
                            <div class="sk-nav-item ${currentTab === 'scraping' ? 'active' : ''}" data-tab="scraping">
                                <span class="icon">${Icons.get('search', '', 14)}</span> ${lang.t('tab_scraping_rules')}
                            </div>
                            <div class="sk-nav-item ${currentTab === 'card' ? 'active' : ''}" data-tab="card">
                                <span class="icon">${Icons.get('file_text', '', 14)}</span> ${lang.t('tab_card_settings')}
                            </div>
                            <div class="sk-nav-item ${currentTab === 'basemodel' ? 'active' : ''}" data-tab="basemodel">
                                <span class="icon">${Icons.get('tag', '', 14)}</span> ${lang.t('tab_basemodel_mgr')}
                            </div>
                            <div class="sk-nav-item ${currentTab === 'advanced' ? 'active' : ''}" data-tab="advanced">
                                <span class="icon">${Icons.get('bot', '', 14)}</span> ${lang.t('tab_advanced_settings')}
                            </div>
                        </div>
                    </div>

                    <div class="sk-modal-content">
                        <div class="sk-modal-header-mobile">
                            <div class="sk-modal-title">${lang.t('settings')}</div>
                            <div class="sk-modal-close">&times;</div>
                        </div>

                        <div class="sk-modal-body">
                            <!-- 选项卡 1: 基础设置 -->
                            <div class="sk-tab-pane ${currentTab === 'basic' ? 'active' : ''}" id="pane-basic">
                                <div class="sk-card">
                                    <div class="sk-card-header">${lang.t('section_basic_info')}</div>
                                    <div class="sk-form-row">
                                        <label>${lang.t('civitai_key')}</label>
                                        <div class="sk-input-group">
                                            <input type="password" id="sk-civitai-key" value="${this.localSettings.civitai_key || ''}" class="sk-input">
                                            <span class="sk-input-eye" id="sk-civitai-key-eye">${Icons.get('eye', '', 14)}</span>
                                        </div>
                                    </div>
                                    <div class="sk-form-row">
                                        <label>${lang.t('proxy_settings')} ${createTooltip(lang.t('proxy_tip'), 'sk-tooltip-left')}</label>
                                        <input type="text" id="sk-proxy" value="${this.localSettings.proxy || ''}" class="sk-input" placeholder="${lang.t('proxy_placeholder')}">
                                    </div>
                                </div>
                            </div>

                            <!-- 选项卡 2: 采集规则 -->
                            <div class="sk-tab-pane ${currentTab === 'scraping' ? 'active' : ''}" id="pane-scraping">
                                <div class="sk-card">
                                    <div class="sk-card-header">${lang.t('section_scraping_rules')}</div>
                                    
                                    <div class="sk-form-row">
                                        <label>${lang.t('image_mode')} ${createTooltip(lang.t('image_mode_tip'), 'sk-tooltip-left')}</label>
                                        <select id="sk-img-mode" class="sk-select">
                                            <option value="missing" ${this.localSettings.img_mode === 'missing' ? 'selected' : ''}>${lang.t('image_mode_missing')}</option>
                                            <option value="always" ${this.localSettings.img_mode === 'always' ? 'selected' : ''}>${lang.t('image_mode_always')}</option>
                                            <option value="never" ${this.localSettings.img_mode === 'never' ? 'selected' : ''}>${lang.t('image_mode_never')}</option>
                                        </select>
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('fetch_weight')} ${createTooltip(lang.t('fetch_weight_desc'), 'sk-tooltip-left')}</label>
                                        ${createSwitch('sk-sync-weight', this.localSettings.sync_weight === true)}
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('fetch_sampler')} ${createTooltip(lang.t('fetch_sampler_desc'), 'sk-tooltip-left')}</label>
                                        ${createSwitch('sk-sync-sampler', this.localSettings.sync_sampler === true)}
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('trigger_word_mode')} ${createTooltip(lang.t('trigger_word_desc'), 'sk-tooltip-left')}</label>
                                        <select id="sk-sync-triggers" class="sk-select">
                                            <option value="replace" ${this.localSettings.sync_triggers == 'replace' ? 'selected' : ''}>${lang.t('replace')}</option>
                                            <option value="merge" ${this.localSettings.sync_triggers === 'merge' ? 'selected' : ''}>${lang.t('merge')}</option>
                                        </select>
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('check_new_version')} ${createTooltip(lang.t('check_new_version_desc'), 'sk-tooltip-left')}</label>
                                        ${createSwitch('sk-check-update', this.localSettings.check_update !== false)}
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('video_frame_preview')} ${createTooltip(lang.t('video_frame_preview_desc'), 'sk-tooltip-left')}</label>
                                        ${createSwitch('sk-video-frame', this.localSettings.video_frame !== false)}
                                    </div>
                                </div>
                            </div>

                            <!-- 选项卡 3: 卡片设置 -->
                            <div class="sk-tab-pane ${currentTab === 'card' ? 'active' : ''}" id="pane-card">
                                <div class="sk-card">
                                    <div class="sk-card-header">${lang.t('section_card_display')}</div>
                                    
                                    <div class="sk-form-row">
                                        <label>${lang.t('nsfw_allow_level')} ${createTooltip(lang.t('nsfw_level_desc'), 'sk-tooltip-left')}</label>
                                        <select id="sk-nsfw-level" class="sk-select">
                                            <option value="1" ${this.localSettings.nsfw_allow_level == 1 ? 'selected' : ''}>${lang.t('nsfw_pg')}</option>
                                            <option value="2" ${this.localSettings.nsfw_allow_level == 2 ? 'selected' : ''}>${lang.t('nsfw_pg13')}</option>
                                            <option value="4" ${this.localSettings.nsfw_allow_level == 4 ? 'selected' : ''}>${lang.t('nsfw_r')}</option>
                                            <option value="8" ${this.localSettings.nsfw_allow_level == 8 ? 'selected' : ''}>${lang.t('nsfw_x')}</option>
                                            <option value="16" ${this.localSettings.nsfw_allow_level == 16 ? 'selected' : ''}>${lang.t('nsfw_xxx')}</option>
                                        </select>
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('preview_img_mode')} ${createTooltip(lang.t('preview_img_mode_desc'), 'sk-tooltip-left')}</label>
                                        <select id="sk-nsfw-img-mode" class="sk-select">
                                            <option value="show" ${this.localSettings.nsfw_img_mode === 'show' ? 'selected' : ''}>${lang.t('show_directly')}</option>
                                            <option value="blur" ${this.localSettings.nsfw_img_mode === 'blur' ? 'selected' : ''}>${lang.t('blur_mode')}</option>
                                            <option value="hide" ${this.localSettings.nsfw_img_mode === 'hide' ? 'selected' : ''}>${lang.t('hide_completely')}</option>
                                        </select>
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('model_title_setting')} ${createTooltip(lang.t('model_title_setting_desc'), 'sk-tooltip-left')}</label>
                                        <select id="sk-model-card-title-source" class="sk-select">
                                            <option value="filename" ${this.localSettings.model_card_title_source === 'filename' ? 'selected' : ''}>${lang.t('filename')}</option>
                                            <option value="civitai" ${this.localSettings.model_card_title_source === 'civitai' ? 'selected' : ''}>${lang.t('civitai_title')}</option>
                                        </select>
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('allow_edit_civitai_base')} ${createTooltip(lang.t('allow_edit_civitai_base_desc'), 'sk-tooltip-left')}</label>
                                        ${createSwitch('sk-allow-edit', this.localSettings.allow_civitai_basemodel_edit)}
                                    </div>

                                    <div class="sk-form-row">
                                        <label>${lang.t('civitai_diff_panel')} ${createTooltip(lang.t('civitai_diff_panel_desc'), 'sk-tooltip-left')}</label>
                                        ${createSwitch('sk-diff-sync', this.localSettings.use_diff_sync !== false)}
                                    </div>
                                </div>
                            </div>

                            <!-- 选项卡 4: 基础模型 -->
                            <div class="sk-tab-pane ${currentTab === 'basemodel' ? 'active' : ''}" id="pane-basemodel">
                                <div class="sk-card">
                                    <div class="sk-card-header">
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            ${lang.t('section_basemodel_manage')}
                                            ${createTooltip(lang.t('tip_enable_disable') + ' / ' + lang.t('tip_drag_sort'), 'sk-tooltip-left')}
                                        </div>
                                        <div class="sk-search-wrapper">
                                            <input type="text" id="sk-bm-search" placeholder="${lang.t('search')}..." class="sk-input-sm">
                                        </div>
                                    </div>
                                    
                                    <div class="sk-bm-section">
                                        <div class="sk-bm-title" style="display:flex; align-items:center; gap:6px;">${Icons.get('image_plus', '', 16)} ${lang.t('image_models')}</div>
                                        <div class="sk-capsule-list" id="sk-cloud-image" data-category="image">
                                            ${categories.image.map(p => renderCapsule(p, visibleNames)).join('')}
                                        </div>
                                    </div>

                                    <div class="sk-bm-section">
                                        <div class="sk-bm-title" style="display:flex; align-items:center; gap:6px;">${Icons.get('clapperboard', '', 16)} ${lang.t('video_models')}</div>
                                        <div class="sk-capsule-list" id="sk-cloud-video" data-category="video">
                                            ${categories.video.map(p => renderCapsule(p, visibleNames)).join('')}
                                        </div>
                                    </div>

                                    <div class="sk-bm-section">
                                        <div class="sk-bm-title" style="display:flex; align-items:center; gap:6px;">${Icons.get('settings_2', '', 16)} ${lang.t('custom_models')}</div>
                                        <div class="sk-capsule-list" id="sk-cloud-custom" data-category="custom">
                                            ${categories.custom.map(p => renderCapsule(p, visibleNames, true)).join('')}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 选项卡 5: 高级设置 -->
                            <div class="sk-tab-pane ${currentTab === 'advanced' ? 'active' : ''}" id="pane-advanced">
                                <div class="sk-card">
                                    <div class="sk-card-header">${lang.t('section_data_maintenance')}</div>
                                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                                        <div class="sk-last-backup-container" style="margin:0; flex:1;">
                                            <div class="backup-icon">${Icons.get('clock', '', 12)}</div>
                                            <div class="backup-info">
                                                <div class="backup-label">${lang.t('last_backup_status') || 'Backup Status'}</div>
                                                <div class="backup-time">
                                                    ${this.localSettings.last_backup 
                                                        ? lang.t('last_backup', [this.localSettings.last_backup]) 
                                                        : lang.t('no_backup_history')}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="sk-action-row" style="margin:0; flex-shrink:0;">
                                            <button class="sk-btn" id="sk-btn-backup">${Icons.get('download', '', 14)} ${lang.t('backup_data')}</button>
                                            <button class="sk-btn" id="sk-btn-restore">${Icons.get('upload', '', 14)} ${lang.t('restore_data')}</button>
                                        </div>
                                    </div>
                                </div>

                                <div class="sk-card">
                                    <div class="sk-card-header">${lang.t('llm_settings')}</div>
                                    <div class="sk-form-row">
                                        <label>${lang.t('llm_activate_label')} ${createTooltip(lang.t('llm_activate_tooltip'), 'sk-tooltip-left')}</label>
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <button class="sk-btn sk-btn-sm sk-btn-orange" id="sk-btn-llm-settings" style="cursor: pointer;">${Icons.get('settings', '', 14)} ${lang.t('llm_config_btn')}</button>
                                            <div id="sk-llm-activate-wrapper" style="display:flex; align-items:center; gap:5px;">
                                                ${createSwitch('sk-llm-activate', this.localSettings.llm_activate)}
                                                ${createTooltip(lang.t('llm_activate_tip'), 'sk-tooltip-right')}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="sk-card">
                                    <div class="sk-card-header">${lang.t('tag_filtering')}</div>
                                    <div class="sk-tag-blacklist-container" id="sk-tag-blacklist">
                                        ${this.localSettings.tag_blacklist.map(tag => `
                                            <div class="sk-tag-item" data-tag="${tag}">
                                                <span class="tag-text">${tag}</span>
                                                <span class="tag-del" title="${lang.t('press_and_hold')}">&times;</span>
                                                <div class="tag-del-progress"></div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="sk-tag-add-row">
                                        <input type="text" id="sk-tag-add-input" class="sk-input" placeholder="${lang.t('add_tag_placeholder')}">
                                        <button class="sk-btn sk-btn-primary" id="sk-btn-tag-add">${lang.t('add_tag')}</button>
                                        <button class="sk-btn" id="sk-btn-tag-restore">${lang.t('restore_preset')}</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="sk-modal-footer">
                            <button class="sk-btn sk-btn-primary" id="sk-btn-save">${lang.t('save')}</button>
                            <button class="sk-btn" id="sk-btn-cancel">${lang.t('cancel')}</button>
                        </div>
                    </div>
                </div>
            `;

            // 绑定事件
            modal.querySelector('.sk-modal-close').onclick = () => { modal.remove(); lang.removeLocaleChangeListener(updateContent); };
            modal.querySelector('#sk-btn-cancel').onclick = () => { modal.remove(); lang.removeLocaleChangeListener(updateContent); };

            // 选项卡
            const tabs = modal.querySelectorAll('.sk-nav-item');
            const panes = modal.querySelectorAll('.sk-tab-pane');
            tabs.forEach(tab => {
                tab.onclick = () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    panes.forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    currentTab = tab.dataset.tab;
                    modal.querySelector(`#pane-${currentTab}`).classList.add('active');
                };
            });

            // LLM 设置
            const updateLLMActivateState = async () => {
                const llmActivateSwitch = modal.querySelector('#sk-llm-activate');
                const llmActivateWrapper = modal.querySelector('#sk-llm-activate-wrapper');
                if (!llmActivateSwitch || !llmActivateWrapper) return;

                try {
                    const resp = await api.fetchApi("/sknodes/llm_mgr/get_configs");
                    const res = await resp.json();
                    
                    if (res) {
                        if (res.active_llm_id !== undefined) this.localSettings.active_llm_id = res.active_llm_id;
                        if (res.llm_configs !== undefined) this.localSettings.llm_configs = res.llm_configs;
                    }
                    
                    const hasDefault = res && res.active_llm_id;
                    if (!hasDefault) {
                        llmActivateSwitch.checked = false;
                        llmActivateSwitch.disabled = true;
                        this.localSettings.llm_activate = false;
                        llmActivateWrapper.style.opacity = '0.5';
                        llmActivateWrapper.style.pointerEvents = 'none'; // 禁止点击
                    } else {
                        llmActivateSwitch.disabled = false;
                        llmActivateWrapper.style.opacity = '1';
                        llmActivateWrapper.style.pointerEvents = 'auto';
                    }
                } catch (e) {
                    console.error("[SK-LoRA] [LLM] 更新激活状态失败:", e);
                }
            };

            // LLM 配置弹窗回调
            modal.querySelector('#sk-btn-llm-settings').onclick = () => {
                this.showLLMConfigModal(() => {
                    updateLLMActivateState();
                    updateContent();
                });
            };

            // 初始 LLM 检查
            updateLLMActivateState();

            // 开关逻辑 (通用)
            const bindSwitch = (id, key) => {
                const el = modal.querySelector(`#${id}`);
                if(el) el.onchange = (e) => {
                    this.localSettings[key] = e.target.checked;
                    if (id === 'sk-llm-activate') {
                        // 如果是 LLM 开关，我们可能想立即执行某些操作
                    }
                };
            };
            bindSwitch('sk-sync-weight', 'sync_weight');
            bindSwitch('sk-sync-sampler', 'sync_sampler');
            bindSwitch('sk-check-update', 'check_update');
            bindSwitch('sk-video-frame', 'video_frame');
            bindSwitch('sk-allow-edit', 'allow_civitai_basemodel_edit');
            bindSwitch('sk-diff-sync', 'use_diff_sync');
            bindSwitch('sk-llm-activate', 'llm_activate');

            // 下拉框逻辑
            const bindSelect = (id, key) => {
                const el = modal.querySelector(`#${id}`);
                if(el) el.onchange = (e) => this.localSettings[key] = e.target.value;
            };
            bindSelect('sk-img-mode', 'img_mode');
            bindSelect('sk-sync-triggers', 'sync_triggers');
            bindSelect('sk-nsfw-level', 'nsfw_allow_level');
            bindSelect('sk-nsfw-img-mode', 'nsfw_img_mode');
            bindSelect('sk-model-card-title-source', 'model_card_title_source');

            // 输入逻辑
            modal.querySelector('#sk-civitai-key').onchange = (e) => this.localSettings.civitai_key = e.target.value;
            modal.querySelector('#sk-proxy').onchange = (e) => this.localSettings.proxy = e.target.value;

            // 眼睛图标逻辑
            const eyeIcon = modal.querySelector('#sk-civitai-key-eye');
            if(eyeIcon) {
                eyeIcon.onclick = () => {
                    const input = modal.querySelector('#sk-civitai-key');
                    if (input.type === 'password') {
                        input.type = 'text';
                        eyeIcon.style.color = '#00d2ff';
                    } else {
                        input.type = 'password';
                        eyeIcon.style.color = '';
                    }
                };
            }

            // 搜索逻辑
            const searchInput = modal.querySelector('#sk-bm-search');
            if(searchInput) {
                searchInput.oninput = (e) => {
                    const term = e.target.value.toLowerCase();
                    modal.querySelectorAll('.sk-capsule').forEach(cap => {
                        const name = cap.dataset.name.toLowerCase();
                        cap.style.display = name.includes(term) ? 'flex' : 'none';
                    });
                };
            }

            // 胶囊组件逻辑
            modal.querySelectorAll('.sk-capsule').forEach(cap => {
                cap.onclick = (e) => {
                    // 如果正在拖拽则忽略
                    if(cap.classList.contains('dragging')) return;
                    
                    const name = cap.dataset.name;
                    const isUser = cap.classList.contains('is-user');
                    
                    if (isUser) return; // 自定义模型始终激活或以不同方式处理？用户在之前的代码中说过：“用户自定义模型始终可见”，但要求了胶囊行为。
                    // 假设系统预设可以切换。
                    
                    const idx = this.localSettings.visible_system_names.indexOf(name);
                    if (idx > -1) {
                        this.localSettings.visible_system_names.splice(idx, 1);
                        cap.classList.remove('active');
                    } else {
                        this.localSettings.visible_system_names.push(name);
                        cap.classList.add('active');
                    }
                };
            });

            // 拖拽逻辑
            const setupDragDrop = (selector) => {
                const container = modal.querySelector(selector);
                if (!container) return;

                container.addEventListener('dragstart', (e) => {
                    const cap = e.target.closest('.sk-capsule');
                    if (cap) {
                        draggedItem = cap;
                        cap.classList.add('dragging');
                        e.dataTransfer.effectAllowed = 'move';
                    }
                });

                container.addEventListener('dragend', (e) => {
                    const cap = e.target.closest('.sk-capsule');
                    if (cap) cap.classList.remove('dragging');
                    draggedItem = null;
                    
                    // 更新设置中的排序
                    const items = [...container.querySelectorAll('.sk-capsule')];
                    items.forEach((item, index) => {
                        const name = item.dataset.name;
                        let preset = systemPresets.find(p => p.name === name);
                        if (preset) preset.order = index + 1;
                        else {
                            preset = userCustom.find(p => p.name === name);
                            if (preset) preset.order = index + 1;
                        }
                    });
                });

                container.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (!draggedItem) return;
                    const target = e.target.closest('.sk-capsule');
                    if (target && target !== draggedItem && container.contains(target)) {
                        const box = target.getBoundingClientRect();
                        const next = (e.clientX - box.left) > (box.width / 2);
                        if (next) container.insertBefore(draggedItem, target.nextSibling);
                        else container.insertBefore(draggedItem, target);
                    }
                });
            };
            setupDragDrop('#sk-cloud-image');
            setupDragDrop('#sk-cloud-video');
            setupDragDrop('#sk-cloud-custom');

            // 保存
            modal.querySelector('#sk-btn-save').onclick = async () => {
                if (this.isSavingSettings) return;
                
                const btn = modal.querySelector('#sk-btn-save');
                const originalText = btn.innerText;
                btn.innerText = lang.t('saving');
                btn.disabled = true;
                this.isSavingSettings = true;
                
                try {
                    // 保存基础模型设置 (排序)
                    const basemodelResp = await api.fetchApi("/lora_manager/update_basemodel_settings", {
                        method: "POST",
                        body: JSON.stringify(this.baseModelSettings)
                    });
                    if (!basemodelResp.ok) throw new Error("Failed to save base model settings");

                    // 保存本地设置
                    const localResp = await api.fetchApi("/lora_manager/save_local_settings", {
                        method: "POST",
                        body: JSON.stringify(this.localSettings)
                    });
                    if (!localResp.ok) throw new Error("Failed to save local settings");

                    // 同步到 ComfyUI 全局设置 (如果存在)
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

                    if (app.ui.settings.setSettingValue) {
                        app.ui.settings.setSettingValue(getSettingId('tab_basic_config', 'CivitaiKey'), this.localSettings.civitai_key);
                        app.ui.settings.setSettingValue(getSettingId('tab_basic_config', 'Proxy'), this.localSettings.proxy);
                        app.ui.settings.setSettingValue(getSettingId('tab_scraping_rules', 'ImgMode'), this.localSettings.img_mode);
                        app.ui.settings.setSettingValue(getSettingId('tab_scraping_rules', 'SyncWeight'), this.localSettings.sync_weight);
                        app.ui.settings.setSettingValue(getSettingId('tab_scraping_rules', 'SyncSampler'), this.localSettings.sync_sampler);
                        app.ui.settings.setSettingValue(getSettingId('tab_scraping_rules', 'SyncTriggers'), this.localSettings.sync_triggers);
                        app.ui.settings.setSettingValue(getSettingId('tab_scraping_rules', 'CheckUpdate'), this.localSettings.check_update);
                        app.ui.settings.setSettingValue(getSettingId('tab_scraping_rules', 'VideoFrame'), this.localSettings.video_frame);
                        app.ui.settings.setSettingValue(getSettingId('tab_card_settings', 'NsfwLevel'), String(this.localSettings.nsfw_allow_level));
                        app.ui.settings.setSettingValue(getSettingId('tab_card_settings', 'NsfwImgMode'), this.localSettings.nsfw_img_mode);
                        app.ui.settings.setSettingValue(getSettingId('tab_card_settings', 'TitleSource'), this.localSettings.model_card_title_source);
                        app.ui.settings.setSettingValue(getSettingId('tab_card_settings', 'AllowEdit'), this.localSettings.allow_civitai_basemodel_edit);
                        app.ui.settings.setSettingValue(getSettingId('tab_card_settings', 'DiffSync'), this.localSettings.use_diff_sync);
                        // tag_blacklist 不需要同步到 ComfyUI 全局设置，仅保存在 lora_manager_settings.json
                    }
                    
                    // 刷新并关闭
                    await this.refresh();
                    modal.remove();
                    lang.removeLocaleChangeListener(updateContent);
                    ToastManager.success(lang.t('save_success'));
                } catch (e) {
                    console.error("[SK-LoRA] [System] 保存设置失败:", e);
                    ToastManager.error(lang.t('save_error') + ": " + e.message);
                    btn.innerText = originalText;
                    btn.disabled = false;
                } finally {
                    this.isSavingSettings = false;
                }
            };

            // 备份
             modal.querySelector('#sk-btn-backup').onclick = async () => {
                try {
                    const resp = await api.fetchApi("/lora_manager/create_snapshot", { method: "POST" });
                    const res = await resp.json();
                    if (res.status === 'success') {
                        ToastManager.success(lang.t('backup_success'));
                        this.localSettings.last_backup = res.snapshot.display_time;
                        // 刷新视图
                        updateContent();
                    }
                } catch(e) { ToastManager.error(e.message); }
            };
            
            // 还原按钮
             modal.querySelector('#sk-btn-restore').onclick = () => {
                 this.showSnapshotModal();
             };

            // --- 标签过滤逻辑 ---
            const tagContainer = modal.querySelector('#sk-tag-blacklist');
            const tagInput = modal.querySelector('#sk-tag-add-input');
            const tagAddBtn = modal.querySelector('#sk-btn-tag-add');
            const tagRestoreBtn = modal.querySelector('#sk-btn-tag-restore');

            const renderTagItem = (tag) => {
                const item = document.createElement('div');
                item.className = 'sk-tag-item';
                item.dataset.tag = tag;
                item.innerHTML = `
                    <span class="tag-text">${tag}</span>
                    <span class="tag-del" title="${lang.t('press_and_hold')}">&times;</span>
                    <div class="tag-del-progress"></div>
                `;
                bindTagEvents(item);
                return item;
            };

            const bindTagEvents = (item) => {
                const delBtn = item.querySelector('.tag-del');
                const progress = item.querySelector('.tag-del-progress');
                let delTimer = null;
                let delInterval = null;
                const HOLD_TIME = 3000;

                const startCountdown = (e) => {
                    e.stopPropagation();
                    
                    if (item.classList.contains('confirming')) {
                        // 第二次点击，执行删除
                        const tag = item.dataset.tag;
                        this.localSettings.tag_blacklist = this.localSettings.tag_blacklist.filter(t => t !== tag);
                        item.remove();
                        this.saveLocalSettings(); // 保存到文件
                        ToastManager.success(lang.t('tag_deleted'));
                        cleanup();
                        return;
                    }

                    // 第一次点击，进入确认状态
                    item.classList.add('confirming');
                    let count = 3;
                    delBtn.innerText = lang.t('confirm_delete_q').replace('%1', count);
                    
                    progress.style.width = '100%';
                    progress.style.transition = 'none';
                    progress.offsetHeight; // 强制重绘
                    progress.style.transition = `width ${HOLD_TIME}ms linear`;
                    progress.style.width = '0%';

                    delInterval = setInterval(() => {
                        count--;
                        if (count > 0) {
                            delBtn.innerText = lang.t('confirm_delete_q').replace('%1', count);
                        } else {
                            clearInterval(delInterval);
                        }
                    }, 1000);

                    delTimer = setTimeout(() => {
                        cleanup();
                    }, HOLD_TIME);
                };

                const cleanup = () => {
                    if (delTimer) clearTimeout(delTimer);
                    if (delInterval) clearInterval(delInterval);
                    delTimer = null;
                    delInterval = null;
                    
                    if (item.parentNode) {
                        item.classList.remove('confirming');
                        delBtn.innerText = '×';
                        progress.style.transition = 'width 0.2s ease-out';
                        progress.style.width = '0%';
                    }
                };

                delBtn.onclick = startCountdown;
            };

            // 绑定初始标签事件
            tagContainer.querySelectorAll('.sk-tag-item').forEach(bindTagEvents);

            // 添加标签
            const addTag = () => {
                const tag = tagInput.value.trim().toLowerCase();
                if (!tag) return;
                
                if (this.localSettings.tag_blacklist.includes(tag)) {
                    ToastManager.warn(lang.t('tag_already_exists'));
                    return;
                }

                this.localSettings.tag_blacklist.push(tag);
                tagContainer.appendChild(renderTagItem(tag));
                tagInput.value = '';
                this.saveLocalSettings(); // 保存到文件
                ToastManager.success(lang.t('tag_added'));
            };

            tagAddBtn.onclick = addTag;
            tagInput.onkeydown = (e) => { if (e.key === 'Enter') addTag(); };

            // 恢复预设 (倒计时模式)
            let restoreTimer = null;
            let restoreInterval = null;
            tagRestoreBtn.onclick = () => {
                if (tagRestoreBtn.classList.contains('confirming')) {
                    // 第二次点击，执行恢复
                    const presets = ["base model", "lora", "model", "style", "checkpoint", "stable diffusion", "sdxl", "sd1.5", "character", "clothing", "object"];
                    this.localSettings.tag_blacklist = [...presets];
                    tagContainer.innerHTML = presets.map(tag => `
                        <div class="sk-tag-item" data-tag="${tag}">
                            <span class="tag-text">${tag}</span>
                            <span class="tag-del" title="${lang.t('press_and_hold')}">&times;</span>
                            <div class="tag-del-progress"></div>
                        </div>
                    `).join('');
                    tagContainer.querySelectorAll('.sk-tag-item').forEach(bindTagEvents);
                    this.saveLocalSettings();
                    ToastManager.success(lang.t('save_success'));
                    cleanupRestore();
                    return;
                }

                // 第一次点击，进入确认状态
                tagRestoreBtn.classList.add('confirming');
                const originalText = tagRestoreBtn.innerText;
                let count = 3;
                tagRestoreBtn.innerText = lang.t('confirm_restore_q').replace('%1', count);

                restoreInterval = setInterval(() => {
                    count--;
                    if (count > 0) {
                        tagRestoreBtn.innerText = lang.t('confirm_restore_q').replace('%1', count);
                    } else {
                        clearInterval(restoreInterval);
                    }
                }, 1000);

                restoreTimer = setTimeout(() => {
                    cleanupRestore(originalText);
                }, 3000);

                function cleanupRestore(text = originalText) {
                    if (restoreTimer) clearTimeout(restoreTimer);
                    if (restoreInterval) clearInterval(restoreInterval);
                    restoreTimer = null;
                    restoreInterval = null;
                    tagRestoreBtn.classList.remove('confirming');
                    tagRestoreBtn.innerText = text;
                }
            };
        };

        updateContent();
        
        // --- 修复：语言更改时强制刷新 ---
        const refreshConfigUI = () => {
            updateContent();
            
            // 强制重新渲染当前打开的配置弹窗 (如果有)
            const existingModal = document.querySelector('.sk-modal-overlay');
            if (existingModal) {
                // 1. 尝试找到当前正在编辑的配置（简单做法：先关闭再打开，或者局部更新）
                // 这里的局部更新比较复杂，因为涉及状态保持。
                // 考虑到语言切换是低频操作，我们可以尝试更新标题和标签
                
                // 更新标题
                const title = existingModal.querySelector('.sk-modal-title');
                if (title) {
                    const isEdit = title.innerText !== lang.t('llm_add_config'); // 简单的状态推断
                    title.innerText = isEdit ? lang.t('llm_edit') : lang.t('llm_add_config');
                }
                
                // 更新标签
                const labels = {
                    '#llm-alias': 'llm_alias',
                    '#llm-api-key': 'llm_api_key',
                    '#llm-model': 'llm_model_name',
                    '#llm-base-url': 'llm_base_url',
                    '#llm-min-interval': 'llm_min_interval'
                };
                
                for (const [selector, key] of Object.entries(labels)) {
                    const input = existingModal.querySelector(selector);
                    if (input) {
                        const label = input.closest('.sk-llm-form-group')?.querySelector('.sk-llm-form-label');
                        if (label) {
                             // 保留可能存在的 tip
                            const tip = label.querySelector('.sk-llm-tip');
                            label.firstChild.textContent = lang.t(key); 
                            if (tip && key === 'llm_min_interval') {
                                // 重新渲染 tip
                                if (existingModal.querySelector('[data-provider="ollama"].selected')) {
                                     label.innerHTML = `${lang.t(key)} <span class="sk-llm-tip">(${lang.t('llm_ollama_interval_tip')})</span>`;
                                }
                            }
                        }
                        // 更新 placeholder
                        if (input.placeholder) {
                             input.placeholder = lang.t(key + '_placeholder') || input.placeholder;
                        }
                    }
                }
                
                // 更新 Provider 名字
                existingModal.querySelectorAll('.sk-provider-option').forEach(el => {
                    const p = el.dataset.provider;
                    const nameEl = el.querySelector('.sk-provider-name');
                    if (nameEl) nameEl.textContent = lang.t('llm_provider_' + p) || p;
                });

                // 更新按钮
                const saveBtn = existingModal.querySelector('#sk-save-config');
                if (saveBtn) saveBtn.textContent = lang.t('save');
                
                const testBtn = existingModal.querySelector('#sk-test-conn');
                if (testBtn) testBtn.textContent = lang.t('llm_test_connection');
            }
        };
        
        lang.addLocaleChangeListener(refreshConfigUI);
        document.body.appendChild(modal);
    }

    // 快照弹窗辅助函数 (移出或内联)
    async showSnapshotModal() {
        const snapOverlay = document.createElement("div");
        snapOverlay.className = "sk-snapshot-modal-overlay";
        snapOverlay.innerHTML = `
            <div class="sk-snapshot-modal-container">
                <div class="sk-modal-header">
                    <div class="sk-modal-title">${Icons.get('package', '', 18)} ${lang.t('snapshot_manager')}</div>
                    <div class="sk-modal-close">&times;</div>
                </div>
                <div class="sk-snapshot-list" id="sk-snap-list">
                    <div style="padding:20px; text-align:center; color:#666;">${lang.t('loading')}</div>
                </div>
            </div>
        `;
        document.body.appendChild(snapOverlay);

        const snapList = snapOverlay.querySelector('#sk-snap-list');
        const closeBtn = snapOverlay.querySelector('.sk-modal-close');
        closeBtn.onclick = () => snapOverlay.remove();

        const loadSnapshots = async () => {
            snapList.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">${lang.t('loading')}</div>`;
            try {
                const resp = await api.fetchApi("/lora_manager/list_snapshots");
                const res = await resp.json();
                
                if (res.status === 'success' && res.snapshots.length > 0) {
                    snapList.innerHTML = '';
                    res.snapshots.forEach(snap => {
                        const card = document.createElement("div");
                        card.className = "sk-snapshot-card";
                        if (snap.is_valid === false) {
                            card.classList.add('invalid');
                        }
                        
                        const sizeMB = (snap.size / 1024 / 1024).toFixed(2);
                        
                        let warningHtml = '';
                        if (snap.is_valid === false) {
                            warningHtml = `<span class="sk-snapshot-warning" title="${snap.error_msg}">${Icons.get('alert_triangle', '', 14)}</span>`;
                        }

                        let typeHtml = '';
                        if (snap.type === 'auto') {
                            typeHtml = `<span class="sk-snapshot-tag auto">${lang.t('auto_backup_marker')}</span>`;
                        } else {
                            typeHtml = `<span class="sk-snapshot-tag manual">${lang.t('manual_backup_marker')}</span>`;
                        }

                        let remarkHtml = '';
                        let remarkIconHtml = '';
                        if (snap.remark === 'remark_sync_c_auto' || snap.remark === '同步C站 自动备份') {
                            remarkIconHtml = `<span class="sk-snapshot-remark-icon" title="${lang.t('remark_sync_c_auto')}">${Icons.get('refresh', '', 14)}</span>`;
                        } else if (snap.remark === 'remark_duplicate_auto' || snap.remark === '删除重复项 自动备份') {
                            remarkIconHtml = `<span class="sk-snapshot-remark-icon" title="${lang.t('remark_duplicate_auto')}">${Icons.get('trash', '', 14)}</span>`;
                        } else if (snap.remark) {
                            // 将所有其他备注也显示为图标样式
                            const remarkText = lang.t(snap.remark) || snap.remark;
                            remarkIconHtml = `<span class="sk-snapshot-remark-icon" title="${remarkText}">${Icons.get('edit', '', 14)}</span>`;
                        }

                        card.innerHTML = `
                            <div class="sk-snapshot-info">
                                <div class="sk-snapshot-top">
                                    ${typeHtml}
                                    <div class="sk-snapshot-filename" title="${snap.filename}">${snap.filename}</div>
                                    ${warningHtml}
                                </div>
                                <div class="sk-snapshot-meta">
                                    <span>${Icons.get('calendar', '', 12)} ${snap.display_time}</span>
                                    <span>${Icons.get('database', '', 12)} ${sizeMB} MB</span>
                                    ${remarkIconHtml}
                                </div>
                                ${remarkHtml}
                            </div>
                            <div class="sk-snapshot-actions">
                                <button class="sk-btn sk-btn-sm sk-btn-primary restore-btn" ${snap.is_valid === false ? 'disabled' : ''}>
                                    ${lang.t('restore_btn')}
                                </button>
                                <button class="sk-btn sk-btn-sm sk-btn-danger delete-btn">
                                    ${lang.t('delete_btn')}
                                </button>
                            </div>
                        `;

                        // 恢复逻辑
                        const restoreBtn = card.querySelector('.restore-btn');
                        restoreBtn.onclick = async () => {
                            if (snap.is_valid === false) return;
                            
                            // 使用 ToastManager 确认（如果可用），否则暂时使用简单确认。
                            // 实际上，我们在模态框或 ToastManager 中使用更简单的确认 UI。
                            // ToastManager 还没有确认功能。让我们使用临时的内联确认 UI。
                            
                            const originalContent = restoreBtn.innerHTML;
                            restoreBtn.innerHTML = `${Icons.get('alert_triangle', '', 14)} ${lang.t('confirm_restore') || 'Confirm?'}`;
                            restoreBtn.classList.add('confirming');
                            
                            const resetBtn = () => {
                                restoreBtn.innerHTML = originalContent;
                                restoreBtn.classList.remove('confirming');
                                restoreBtn.onclick = restoreHandler;
                            };

                            const restoreHandler = async () => {
                                try {
                                    restoreBtn.disabled = true;
                                    restoreBtn.innerHTML = `${Icons.get('hourglass', 'spin-animation', 14)} ${lang.t('restoring') || 'Restoring...'}`;
                                    
                                    const resp = await api.fetchApi("/lora_manager/restore_snapshot", {
                                        method: "POST",
                                        body: JSON.stringify({ filename: snap.filename })
                                    });
                                    const res = await resp.json();
                                    
                                    if (res.status === 'success') {
                                        ToastManager.success(lang.t('restore_success'));
                                        setTimeout(() => location.reload(), 1500);
                                    } else {
                                        ToastManager.error(res.message || "Restore failed");
                                        resetBtn();
                                    }
                                } catch (e) {
                                    ToastManager.error(e.message);
                                    resetBtn();
                                }
                            };

                            restoreBtn.onclick = restoreHandler;
                            
                            // 3秒后自动重置
                            setTimeout(() => {
                                if (restoreBtn.classList.contains('confirming')) {
                                    resetBtn();
                                }
                            }, 3000);
                        };

                        // 删除逻辑
                        const deleteBtn = card.querySelector('.delete-btn');
                        const originalDeleteContent = deleteBtn.innerHTML;

                        const resetDeleteBtn = () => {
                            deleteBtn.innerHTML = originalDeleteContent;
                            deleteBtn.classList.remove('confirming');
                            deleteBtn.disabled = false;
                            deleteBtn.onclick = startDeleteFlow;
                            if (deleteBtn._timer) clearTimeout(deleteBtn._timer);
                            if (deleteBtn._interval) clearInterval(deleteBtn._interval);
                        };

                        const startDeleteFlow = async () => {
                            let count = 3;
                            deleteBtn.innerHTML = `❓ ${lang.t('confirm_delete_q', [count])}`;
                            deleteBtn.classList.add('confirming');

                            if (deleteBtn._timer) clearTimeout(deleteBtn._timer);
                            if (deleteBtn._interval) clearInterval(deleteBtn._interval);

                            deleteBtn._interval = setInterval(() => {
                                count--;
                                if (count > 0) {
                                    deleteBtn.innerHTML = `❓ ${lang.t('confirm_delete_q', [count])}`;
                                } else {
                                    clearInterval(deleteBtn._interval);
                                    deleteBtn.innerHTML = `${Icons.get('alert_triangle', '', 14)} ${lang.t('delete')}`;
                                }
                            }, 1000);

                            const performDelete = async () => {
                                try {
                                    deleteBtn.disabled = true;
                                    const resp = await api.fetchApi("/lora_manager/delete_snapshot", {
                                        method: "POST",
                                        body: JSON.stringify({ filename: snap.filename })
                                    });
                                    const res = await resp.json();
                                    if (res.status === 'success') {
                                        ToastManager.success(lang.t('delete_success') || "Deleted");
                                        loadSnapshots();
                                        if (res.last_backup !== undefined) {
                                            this.localSettings.last_backup = res.last_backup;
                                        }
                                    } else {
                                        ToastManager.error(res.message || "Delete failed");
                                        resetDeleteBtn();
                                    }
                                } catch (e) {
                                    ToastManager.error(e.message);
                                    resetDeleteBtn();
                                }
                            };

                            deleteBtn.onclick = performDelete;

                            deleteBtn._timer = setTimeout(() => {
                                if (deleteBtn.classList.contains('confirming')) {
                                    resetDeleteBtn();
                                }
                            }, 4000);
                        };

                        deleteBtn.onclick = startDeleteFlow;

                        snapList.appendChild(card);
                    });
                } else {
                    snapList.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">${lang.t('no_snapshots')}</div>`;
                }
            } catch (e) {
                snapList.innerHTML = `<div style="color:#ef4444; text-align:center; padding:20px;">${lang.t('error') || 'Error'}: ${e.message}</div>`;
            }
        };

        loadSnapshots();
    }

    async showSettingsModal_deprecated() {

        // 确保获取最新设置
        await Promise.all([
            this.fetchBaseModelSettings(),
            this.fetchLocalSettings()
        ]);

        // 校验本地备份文件与 last_backup 是否吻合
        try {
            const resp = await api.fetchApi("/lora_manager/list_snapshots");
            const res = await resp.json();
            if (res.status === 'success') {
                const latestSnapshot = res.snapshots.length > 0 ? res.snapshots[0].display_time : "";
                if (this.localSettings.last_backup !== latestSnapshot) {
                    console.log(`[SK-LoRA] [Backup] 更新最后备份记录: ${this.localSettings.last_backup} -> ${latestSnapshot}`);
                    this.localSettings.last_backup = latestSnapshot;
                    // 保存同步后的设置
                    await api.fetchApi("/lora_manager/save_local_settings", {
                        method: "POST",
                        body: JSON.stringify(this.localSettings)
                    });
                }
            }
        } catch (e) {
            console.error("[SK-LoRA] [Backup] 验证最后备份失败:", e);
        }

        const modal = document.createElement('div');
        modal.className = 'sk-modal-overlay';
        
        let draggedItem = null;

        const updateContent = () => {
            const visibleNames = this.localSettings.visible_system_names || [];
            let systemPresets = this.baseModelSettings.system_presets || [];
            let userCustom = this.baseModelSettings.user_custom || [];

            // 规范化 userCustom
            userCustom = userCustom.map((p, i) => {
                if (typeof p === 'string') return { name: p, category: 'custom', order: i + 999, aliases: [] };
                return { ...p, category: 'custom' };
            });
            // 更新引用
            this.baseModelSettings.user_custom = userCustom;

            // 按类别分组
            const categories = {
                image: systemPresets.filter(p => p.category === 'image').sort((a, b) => a.order - b.order),
                video: systemPresets.filter(p => p.category === 'video').sort((a, b) => a.order - b.order),
                custom: userCustom.sort((a, b) => a.order - b.order)
            };

            modal.innerHTML = `
                <div class="sk-modal-container">
                    <div class="sk-modal-header">
                        <div class="sk-modal-title">${Icons.get('settings', '', 18)} ${lang.t('settings')}</div>
                        <div class="sk-modal-close">&times;</div>
                    </div>
                    <div class="sk-modal-body">
                        <!-- 通用设置 -->
                        <div class="sk-settings-section">
                            <div class="sk-settings-grid">
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('civitai_key')}</label>
                                        <input type="password" id="sk-civitai-key" value="${this.localSettings.civitai_key || ''}" placeholder="${lang.t('civitai_key_placeholder')}">
                                    </div>
                                </div>
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('proxy_settings')}</label>
                                        <input type="text" id="sk-proxy" value="${this.localSettings.proxy || ''}" placeholder="${lang.t('proxy_placeholder')}">
                                    </div>
                                </div>
                            </div>
                            <div class="sk-settings-row">
                                <label>${lang.t('image_mode')}</label>
                                <select id="sk-img-mode">
                                    <option value="missing" ${this.localSettings.img_mode === 'missing' ? 'selected' : ''}>${lang.t('image_mode_missing')}</option>
                                    <option value="always" ${this.localSettings.img_mode === 'always' ? 'selected' : ''}>${lang.t('image_mode_always')}</option>
                                    <option value="never" ${this.localSettings.img_mode === 'never' ? 'selected' : ''}>${lang.t('image_mode_never')}</option>
                                </select>
                            </div>

                            <!-- 新设置 1 & 2：同步权重和同步采样器 -->
                            <div class="sk-settings-grid">
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('fetch_weight')}</label>
                                        <div class="sk-radio-group">
                                            <label><input type="radio" name="sync_weight" value="true" ${this.localSettings.sync_weight === true ? 'checked' : ''}> ${lang.t('true_val')}</label>
                                            <label><input type="radio" name="sync_weight" value="false" ${this.localSettings.sync_weight !== true ? 'checked' : ''}> ${lang.t('false_val')}</label>
                                        </div>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('fetch_weight_desc')}</div>
                                </div>
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('fetch_sampler')}</label>
                                        <div class="sk-radio-group">
                                            <label><input type="radio" name="sync_sampler" value="true" ${this.localSettings.sync_sampler === true ? 'checked' : ''}> ${lang.t('true_val')}</label>
                                            <label><input type="radio" name="sync_sampler" value="false" ${this.localSettings.sync_sampler !== true ? 'checked' : ''}> ${lang.t('false_val')}</label>
                                        </div>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('fetch_sampler_desc')}</div>
                                </div>
                            </div>

                            <!-- 新设置 3 & 标题设置：触发词处理和模型卡片标题 -->
                            <div class="sk-settings-grid">
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('trigger_word_mode')}</label>
                                        <select id="sk-sync-triggers">
                                            <option value="replace" ${this.localSettings.sync_triggers == 'replace' ? 'selected' : ''}>${lang.t('replace')}</option>
                                            <option value="merge" ${this.localSettings.sync_triggers === 'merge' ? 'selected' : ''}>${lang.t('merge')}</option>
                                        </select>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('trigger_word_desc')}</div>
                                </div>
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('model_title_setting')}</label>
                                        <select id="sk-model-card-title-source">
                                            <option value="filename" ${this.localSettings.model_card_title_source === 'filename' ? 'selected' : ''}>${lang.t('filename')}</option>
                                            <option value="civitai" ${this.localSettings.model_card_title_source === 'civitai' ? 'selected' : ''}>${lang.t('civitai_title')}</option>
                                        </select>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('model_title_setting_desc')}</div>
                                </div>
                            </div>
                            
                             <!-- NSFW 和图片模式设置 -->
                             <div class="sk-settings-grid">
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('nsfw_allow_level')}</label>
                                        <select id="sk-nsfw-level">
                                            <option value="1" ${this.localSettings.nsfw_allow_level == 1 ? 'selected' : ''}>${lang.t('nsfw_pg')}</option>
                                            <option value="2" ${this.localSettings.nsfw_allow_level == 2 ? 'selected' : ''}>${lang.t('nsfw_pg13')}</option>
                                            <option value="4" ${this.localSettings.nsfw_allow_level == 4 ? 'selected' : ''}>${lang.t('nsfw_r')}</option>
                                            <option value="8" ${this.localSettings.nsfw_allow_level == 8 ? 'selected' : ''}>${lang.t('nsfw_x')}</option>
                                            <option value="16" ${this.localSettings.nsfw_allow_level == 16 ? 'selected' : ''}>${lang.t('nsfw_xxx')}</option>
                                        </select>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('nsfw_level_desc')}</div>
                                </div>
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('preview_img_mode')}</label>
                                        <select id="sk-nsfw-img-mode">
                                            <option value="show" ${this.localSettings.nsfw_img_mode === 'show' ? 'selected' : ''}>${lang.t('show_directly')}</option>
                                            <option value="blur" ${this.localSettings.nsfw_img_mode === 'blur' ? 'selected' : ''}>${lang.t('blur_mode')}</option>
                                            <option value="hide" ${this.localSettings.nsfw_img_mode === 'hide' ? 'selected' : ''}>${lang.t('hide_completely')}</option>
                                        </select>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('preview_img_mode_desc')}</div>
                                </div>
                             </div>

                            <!-- 新设置 4 & 5：检查更新和视频帧 -->
                            <div class="sk-settings-grid">
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('check_new_version')}</label>
                                        <div class="sk-radio-group">
                                            <label><input type="radio" name="check_update" value="true" ${this.localSettings.check_update !== false ? 'checked' : ''}> ${lang.t('true_val')}</label>
                                            <label><input type="radio" name="check_update" value="false" ${this.localSettings.check_update === false ? 'checked' : ''}> ${lang.t('false_val')}</label>
                                        </div>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('check_new_version_desc')}</div>
                                </div>
                                <div class="sk-settings-col">
                                     <div class="sk-settings-row">
                                         <label>${lang.t('video_frame_preview')}</label>
                                         <div class="sk-radio-group">
                                             <label><input type="radio" name="video_frame" value="true" ${this.localSettings.video_frame !== false ? 'checked' : ''}> ${lang.t('true_val')}</label>
                                             <label><input type="radio" name="video_frame" value="false" ${this.localSettings.video_frame === false ? 'checked' : ''}> ${lang.t('false_val')}</label>
                                         </div>
                                     </div>
                                     <div class="sk-settings-desc">${lang.t('video_frame_preview_desc')}</div>
                                 </div>
                             </div>


                             <!-- Civitai 底模编辑设置 & 差异同步设置 -->
                             <div class="sk-settings-grid">
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('allow_edit_civitai_base')}</label>
                                        <div class="sk-radio-group">
                                            <label><input type="radio" name="allow_civitai_basemodel_edit" value="true" ${this.localSettings.allow_civitai_basemodel_edit ? 'checked' : ''}> ${lang.t('true_val')}</label>
                                            <label><input type="radio" name="allow_civitai_basemodel_edit" value="false" ${!this.localSettings.allow_civitai_basemodel_edit ? 'checked' : ''}> ${lang.t('false_val')}</label>
                                        </div>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('allow_edit_civitai_base_desc')}</div>
                                </div>
                                <div class="sk-settings-col">
                                    <div class="sk-settings-row">
                                        <label>${lang.t('civitai_diff_panel')}</label>
                                        <div class="sk-radio-group">
                                            <label><input type="radio" name="use_diff_sync" value="true" ${this.localSettings.use_diff_sync !== false ? 'checked' : ''}> ${lang.t('true_val')}</label>
                                            <label><input type="radio" name="use_diff_sync" value="false" ${this.localSettings.use_diff_sync === false ? 'checked' : ''}> ${lang.t('false_val')}</label>
                                        </div>
                                    </div>
                                    <div class="sk-settings-desc">${lang.t('civitai_diff_panel_desc')}</div>
                                </div>
                             </div>
                         </div>

                         <!-- 底模显示管理 -->
                        <div class="sk-settings-section">
                            <div class="sk-section-title">${lang.t('base_model_visibility')}</div>
                            
                            <!-- 图片模型 -->
                            <div class="sk-tag-cloud-group">
                                <div class="sk-tag-cloud-label">${lang.t('image_models')} ${lang.t('drag_to_sort')}</div>
                                <div class="sk-tag-cloud" id="sk-cloud-image" data-category="image">
                                    ${categories.image.map(p => `
                                        <div class="sk-tag-item ${visibleNames.includes(p.name) ? 'active' : ''}" 
                                             data-name="${p.name}" draggable="true">
                                            ${p.name}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <!-- 视频模型 -->
                            <div class="sk-tag-cloud-group">
                                <div class="sk-tag-cloud-label">${lang.t('video_models')} ${lang.t('drag_to_sort')}</div>
                                <div class="sk-tag-cloud" id="sk-cloud-video" data-category="video">
                                    ${categories.video.map(p => `
                                        <div class="sk-tag-item ${visibleNames.includes(p.name) ? 'active' : ''}" 
                                             data-name="${p.name}" draggable="true">
                                            ${p.name}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- 自定义模型 -->
                            <div class="sk-tag-cloud-group">
                                <div class="sk-tag-cloud-label">${lang.t('custom_models')} ${lang.t('drag_to_sort')}</div>
                                <div class="sk-tag-cloud" id="sk-cloud-custom" data-category="custom">
                                    ${categories.custom.map(p => `
                                        <div class="sk-tag-item is-user active" 
                                             data-name="${p.name}" draggable="true">
                                            ${p.name}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- 数据维护 & LLM 设置 -->
                        <div class="sk-settings-grid">
                            <div class="sk-settings-col">
                                <div class="sk-section-title">
                                    ${lang.t('data_maintenance')}
                                    <span class="sk-last-backup" style="font-size: 12px; color: #888; font-weight: normal; margin-left: 10px;">
                                        ${this.localSettings.last_backup ? lang.t('last_backup', [this.localSettings.last_backup]) : lang.t('no_backup_history')}
                                    </span>
                                </div>
                                <div class="sk-maintenance-btns" style="margin-top: 15px;">
                                    <button class="sk-btn sk-btn-secondary" id="sk-btn-backup">${Icons.get('download', '', 14)} ${lang.t('backup_data')}</button>
                                    <button class="sk-btn sk-btn-secondary" id="sk-btn-restore">${Icons.get('upload', '', 14)} ${lang.t('restore_data')}</button>
                                </div>
                            </div>
                            <div class="sk-settings-col">
                                <div class="sk-section-title">${lang.t('llm_settings')}</div>
                                <div class="sk-maintenance-btns" style="margin-top: 15px; align-items: center; gap: 20px;">
                                    <button class="sk-btn sk-btn-secondary" id="sk-btn-llm-settings" style="width: auto;">${Icons.get('bot', '', 14)} ${lang.t('llm_config_mgr')}</button>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span style="font-size: 12px; color: #aaa;">${lang.t('llm_activate_label')}</span>
                                        <span class="sk-info-icon" data-tooltip="${lang.t('llm_activate_tooltip')}">i</span>
                                        <label class="sk-switch" id="sk-llm-activate-switch" title="${lang.t('llm_activate_tip') || 'Enable LLM features (Requires default config)'}">
                                            <input type="checkbox" id="sk-llm-activate" ${this.localSettings.llm_activate ? 'checked' : ''}>
                                            <span class="sk-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="sk-modal-footer">
                        <button class="sk-btn sk-btn-primary" id="sk-btn-save">${lang.t('save')}</button>
                        <button class="sk-btn" id="sk-btn-cancel">${lang.t('cancel')}</button>
                    </div>
                </div>
                <style>
                    .sk-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 11000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); font-family: sans-serif; }
                    .sk-modal-container { width: 60%; max-width: 95vw; background: #1e293b; border: 1px solid #334155; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
                    .sk-modal-header { padding: 16px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
                    .sk-modal-title { font-size: 16px; font-weight: bold; color: #ccc; }
                    .sk-modal-close { font-size: 24px; color: #666; cursor: pointer; }
                    .sk-modal-close:hover { color: #fff; }
                    .sk-modal-body { padding: 20px; overflow-y: auto; max-height: 70vh; }
                    .sk-settings-section { margin-bottom: 24px; }
                    .sk-section-title { font-size: 14px; font-weight: bold; color: #888; margin-bottom: 12px; border-left: 3px solid #00d2ff; padding-left: 8px; }
                    .sk-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 12px; }
                    .sk-settings-col { display: flex; flex-direction: column; }
                    .sk-settings-row { display: flex; align-items: center; margin-bottom: 8px; }
                    .sk-settings-row label { width: 120px; color: #aaa; font-size: 13px; flex-shrink: 0; }
                    .sk-settings-row input, .sk-settings-row select { flex: 1; background: #0f172a; border: 1px solid #334155; color: #ffffffff; padding: 8px 12px; border-radius: 6px; outline: none; width: 100%; box-sizing: border-box; }
                    .sk-snapshot-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 12000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
                    .sk-snapshot-modal-container { width: 50%; height: 70%; background: #1e293b; border: 1px solid #334155; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
                    .sk-snapshot-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
                    .sk-snapshot-card { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border: 1px solid #334155; transition: all 0.2s; }
                    .sk-snapshot-card:hover { background: rgba(255,255,255,0.08); border-color: #475569; }
                    .sk-snapshot-info { display: flex; flex-direction: column; gap: 4px; }
                    .sk-snapshot-filename { color: #e2e8f0; font-weight: bold; font-size: 14px; }
                    .sk-snapshot-meta { color: #94a3b8; font-size: 12px; }
                    .sk-snapshot-actions { display: flex; gap: 10px; }
                    .sk-btn-restore { background: #334155; color: #ccc; border: 1px solid #475569; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.3s; transform-origin: center; }
                    .sk-btn-restore.confirming { background: #22c55e; color: #fff; transform: scale(1.05); border-color: #16a34a; }
                    .sk-btn-delete-snap { background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.3s; }
                    .sk-btn-delete-snap.confirming { background: #991b1b; color: #fff; transform: scale(1.05); border-color: #7f1d1d; }
                    .sk-btn-delete-snap:hover:not(.confirming) { background: #ef4444; color: #fff; }
                    .sk-settings-row input[type="radio"] { flex: 0; width: auto; margin-right: 4px; }
                    .sk-radio-group { flex: 1; display: flex; gap: 20px; align-items: center; color: #ddd; font-size: 13px; }
                    .sk-radio-group label { width: auto; display: flex; align-items: center; cursor: pointer; color: #ddd; }
                    .sk-settings-desc { font-size: 11px; color: #666; margin-top: -8px; margin-bottom: 12px; margin-left: 120px; }
                    .sk-settings-row input:focus { border-color: #00d2ff; }
                    .sk-tag-cloud-group { margin-bottom: 16px; }
                    .sk-tag-cloud-label { font-size: 12px; color: #666; margin-bottom: 8px; }
                    .sk-tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; min-height: 10px; }
                    .sk-tag-item { padding: 3px 6px; background: #334155; color: #888; border: 1px solid transparent; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s; user-select: none; }
                    .sk-tag-item:hover { background: #445566; color: #ccc; }
                    .sk-tag-item.active { background: #0f172a; color: #00d2ff; border-color: #334155; }
                    .sk-tag-item.dragging { opacity: 0.5; border: 1px dashed #00d2ff; }
                    .sk-tag-item.is-user { border-left: 0px solid #b18cff; }
                    .sk-maintenance-btns { display: flex; gap: 12px; }
                    .sk-btn { padding: 8px 20px; border-radius: 6px; border: 1px solid #444; background: #333; color: #ccc; cursor: pointer; font-size: 13px; transition: all 0.2s; }
                    .sk-btn:hover { background: #444; color: #fff; }
                    .sk-btn-primary { background: #00d2ff; color: #000; border: none; font-weight: bold; }
                    .sk-btn-primary:hover { background: #00b8e6; }
                    .sk-modal-footer { padding: 16px 20px; border-top: 1px solid #334155; display: flex; justify-content: flex-end; gap: 12px; background: #0f172a; }
                    .sk-snapshot-card.invalid { opacity: 0.7; border-left: 3px solid #ef4444; }
                    .sk-snapshot-warning { margin-left: 8px; cursor: help; font-size: 14px; }
                    .sk-btn-restore:disabled { background: #1e293b; color: #555; border-color: #333; cursor: not-allowed; opacity: 0.6; }
                    .sk-btn-restore:disabled:hover { transform: none; box-shadow: none; }
                    .sk-snapshot-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; font-weight: normal; }
                    .sk-snapshot-tag.auto { background: rgba(51, 65, 85, 0.5); color: #94a3b8; border: 1px solid #475569; }
                    .sk-switch { position: relative; display: inline-block; width: 40px; height: 20px; }
                    .sk-switch input { opacity: 0; width: 0; height: 0; }
                    .sk-slider { position: absolute; cursor: pointer; inset: 0; background-color: #334155; transition: .4s; border-radius: 20px; }
                    .sk-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                    input:checked + .sk-slider { background-color: #00d2ff; }
                    input:focus + .sk-slider { box-shadow: 0 0 1px #00d2ff; }
                    input:checked + .sk-slider:before { transform: translateX(20px); }
                    input:disabled + .sk-slider { background-color: #1e293b; cursor: not-allowed; opacity: 0.5; }
                    .sk-info-icon { width: 15px; height: 15px; background: rgba(255,255,255,0.1); color: #94a3b8; border: 1px solid #475569; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; cursor: help; transition: 0.2s; position: relative; margin-left: 4px; font-family: "Times New Roman", serif; font-style: italic; font-weight: bold; }
                    .sk-info-icon:hover { background: var(--sk-accent-color); color: #fff; border-color: var(--sk-accent-color); opacity: 1; z-index: 100; }
                    .sk-info-icon:hover::after { content: attr(data-tooltip); position: absolute; bottom: 120%; right: 0; background: rgba(0,0,0,0.95); padding: 10px 14px; border-radius: 8px; font-size: 12px; white-space: pre-wrap; width: max-content; max-width: 450px; text-align: left; pointer-events: none; border: 1px solid #444; box-shadow: 0 5px 15px rgba(0,0,0,0.5); z-index: 11100; line-height: 1.5; color: #fff; }
                </style>
            `;

            // 绑定事件
            const close = () => {
                modal.remove();
                lang.removeLocaleChangeListener(updateContent);
            };

            modal.querySelector('.sk-modal-close').onclick = close;
            modal.querySelector('#sk-btn-cancel').onclick = close;

            // 标签点击切换
            modal.querySelectorAll('.sk-tag-item').forEach(item => {
                item.onclick = (e) => {
                    // Prevent click when dragging
                    if (item.classList.contains('dragging')) return;
                    
                    const name = item.dataset.name;
                    // 系统预设才允许切换可见性，用户自定义总是可见
                    // 检查是否为系统预设
                    const isSystem = systemPresets.some(p => p.name === name);
                    if (isSystem) {
                        const idx = this.localSettings.visible_system_names.indexOf(name);
                        if (idx > -1) {
                            this.localSettings.visible_system_names.splice(idx, 1);
                            item.classList.remove('active');
                        } else {
                            this.localSettings.visible_system_names.push(name);
                            item.classList.add('active');
                        }
                    } else {
                         // 用户自定义点击无操作（或提示无法隐藏？）
                    }
                };
            });

            // 拖拽排序逻辑
            const setupDragDrop = (selector) => {
                const container = modal.querySelector(selector);
                if (!container) return;

                container.addEventListener('dragstart', (e) => {
                    if (e.target.classList.contains('sk-tag-item')) {
                        draggedItem = e.target;
                        e.target.classList.add('dragging');
                        e.dataTransfer.effectAllowed = 'move';
                    }
                });

                container.addEventListener('dragend', (e) => {
                    if (e.target.classList.contains('sk-tag-item')) {
                        e.target.classList.remove('dragging');
                        draggedItem = null;
                    }
                });

                container.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    
                    // 防止跨容器拖动
                    if (draggedItem && !container.contains(draggedItem)) {
                        e.dataTransfer.dropEffect = 'none';
                        return;
                    }

                    e.dataTransfer.dropEffect = 'move';
                    
                    const target = e.target.closest('.sk-tag-item');
                    if (target && target !== draggedItem && container.contains(target)) {
                        const box = target.getBoundingClientRect();
                        const next = (e.clientX - box.left) > (box.width / 2);
                        if (next) {
                            container.insertBefore(draggedItem, target.nextSibling);
                        } else {
                            container.insertBefore(draggedItem, target);
                        }
                    }
                });

                container.addEventListener('drop', (e) => {
                    e.preventDefault();
                    
                    // 安全检查
                    if (draggedItem && !container.contains(draggedItem)) return;

                    // 更新内部顺序
                    const items = [...container.querySelectorAll('.sk-tag-item')];
                    items.forEach((item, index) => {
                        const name = item.dataset.name;
                        
                        // Try to find in systemPresets
                        let preset = systemPresets.find(p => p.name === name);
                        if (preset) {
                            preset.order = index + 1;
                        } else {
                            // 尝试在 userCustom 中查找
                            preset = userCustom.find(p => p.name === name);
                            if (preset) {
                                preset.order = index + 1;
                            }
                        }
                    });
                });
            };

            setupDragDrop('#sk-cloud-image');
            setupDragDrop('#sk-cloud-video');
            setupDragDrop('#sk-cloud-custom');

            // LLM 设置按钮
            const llmBtn = modal.querySelector('#sk-btn-llm-settings');
            const llmActivateSwitch = modal.querySelector('#sk-llm-activate');
            
            const updateLLMActivateState = async () => {
                try {
                    const resp = await api.fetchApi("/sknodes/llm_mgr/get_configs");
                    const res = await resp.json();
                    
                    // 同步到 localSettings，防止保存主设置时覆盖已更新的 LLM 配置
                    if (res) {
                        if (res.active_llm_id !== undefined) this.localSettings.active_llm_id = res.active_llm_id;
                        if (res.llm_configs !== undefined) this.localSettings.llm_configs = res.llm_configs;
                    }
                    
                    const hasDefault = res && res.active_llm_id;
                    
                    if (!hasDefault) {
                        llmActivateSwitch.checked = false;
                        llmActivateSwitch.disabled = true;
                        modal.querySelector('#sk-llm-activate-switch').style.opacity = '0.5';
                        modal.querySelector('#sk-llm-activate-switch').title = lang.t('llm_activate_disabled_tip') || 'Please set a default LLM first';
                    } else {
                        llmActivateSwitch.disabled = false;
                        modal.querySelector('#sk-llm-activate-switch').style.opacity = '1';
                        modal.querySelector('#sk-llm-activate-switch').title = lang.t('llm_activate_tip') || 'Enable LLM features';
                    }
                } catch (e) {
                    console.error("[SK-LoRA] [LLM] 更新激活状态失败:", e);
                }
            };

            if (llmBtn) {
                llmBtn.onclick = () => {
                    this.showLLMConfigModal(() => {
                        updateLLMActivateState();
                    });
                };
            }

            // 初始状态检查
            updateLLMActivateState();

            // 处理切换更改
            if (llmActivateSwitch) {
                llmActivateSwitch.onchange = () => {
                    this.localSettings.llm_activate = llmActivateSwitch.checked;
                };
            }

            // 备份
            modal.querySelector('#sk-btn-backup').onclick = async () => {
                try {
                    const resp = await api.fetchApi("/lora_manager/create_snapshot", { method: "POST" });
                    const res = await resp.json();
                    if (res.status === 'success') {
                        ToastManager.success(lang.t('backup_success'));
                        // 更新UI上的时间
                        const timeSpan = modal.querySelector('.sk-last-backup');
                        if (timeSpan) {
                            timeSpan.innerText = lang.t('last_backup', [res.snapshot.display_time]);
                            this.localSettings.last_backup = res.snapshot.display_time;
                        }
                    } else {
                        ToastManager.error(res.message);
                    }
                } catch (e) {
                    ToastManager.error(e.message);
                }
            };

            // 恢复 (快照面板)
            modal.querySelector('#sk-btn-restore').onclick = async () => {
                // 创建快照列表 Modal
                const snapOverlay = document.createElement("div");
                snapOverlay.className = "sk-snapshot-modal-overlay";
                
                const snapContainer = document.createElement("div");
                snapContainer.className = "sk-snapshot-modal-container";
                
                // 头部
                const snapHeader = document.createElement("div");
                snapHeader.className = "sk-modal-header";
                snapHeader.innerHTML = `
                    <div class="sk-modal-title">${lang.t('snapshot_manager')}</div>
                    <div class="sk-modal-close">×</div>
                `;
                snapHeader.querySelector('.sk-modal-close').onclick = () => snapOverlay.remove();
                
                // List
                const snapList = document.createElement("div");
                snapList.className = "sk-snapshot-list";
                snapList.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">${lang.t('loading')}</div>`;
                
                snapContainer.appendChild(snapHeader);
                snapContainer.appendChild(snapList);
                snapOverlay.appendChild(snapContainer);
                document.body.appendChild(snapOverlay);

                const loadSnapshots = async () => {
                    snapList.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">${lang.t('loading')}</div>`;
                    try {
                        const resp = await api.fetchApi("/lora_manager/list_snapshots");
                        const res = await resp.json();
                        
                        if (res.status === 'success' && res.snapshots.length > 0) {
                            snapList.innerHTML = '';
                            res.snapshots.forEach(snap => {
                                const card = document.createElement("div");
                                card.className = "sk-snapshot-card";
                                if (snap.is_valid === false) {
                                    card.classList.add('invalid');
                                }
                                
                                const sizeMB = (snap.size / 1024 / 1024).toFixed(2);
                                
                                let warningHtml = '';
                                if (snap.is_valid === false) {
                                    warningHtml = `<span class="sk-snapshot-warning" title="${snap.error_msg}">${Icons.get('alert_triangle', '', 14)}</span>`;
                                }

                                let typeHtml = '';
                                if (snap.type === 'auto') {
                                    const label = snap.remark || 'auto_backup_marker';
                                    typeHtml = `<span class="sk-snapshot-tag auto">${lang.t(label)}</span>`;
                                }

                                card.innerHTML = `
                                    <div class="sk-snapshot-info">
                                        <div class="sk-snapshot-filename">${snap.filename} ${warningHtml} ${typeHtml}</div>
                                        <div class="sk-snapshot-meta">${snap.display_time} · ${sizeMB} MB</div>
                                    </div>
                                    <div class="sk-snapshot-actions">
                                        <button class="sk-btn-restore" ${snap.is_valid === false ? 'disabled' : ''}>${lang.t('restore_btn')}</button>
                                        <button class="sk-btn-delete-snap">${lang.t('delete_btn')}</button>
                                    </div>
                                `;
                                
                                const restoreBtn = card.querySelector('.sk-btn-restore');
                                const delBtn = card.querySelector('.sk-btn-delete-snap');
                                
                                // 恢复操作
                                let restoreTimer = null;
                                let restoreInterval = null;
                                restoreBtn.onclick = async () => {
                                    // 互斥检查：如果删除按钮正在倒计时，则恢复按钮失效
                                    if (delBtn.classList.contains('confirming')) return;

                                    if (restoreBtn.classList.contains('confirming')) {
                                        if (restoreTimer) clearTimeout(restoreTimer);
                                        if (restoreInterval) clearInterval(restoreInterval);
                                        
                                        try {
                                            const rResp = await api.fetchApi("/lora_manager/restore_snapshot", {
                                                method: "POST",
                                                body: JSON.stringify({ filename: snap.filename })
                                            });
                                            const rRes = await rResp.json();
                                            if (rRes.status === 'success') {
                                                ToastManager.success(lang.t('restore_success'));
                                                setTimeout(() => window.location.reload(), 1500);
                                            } else {
                                                ToastManager.error(rRes.message);
                                                // 失败可能是文件不存在，刷新列表
                                                loadSnapshots();
                                            }
                                        } catch (e) {
                                            ToastManager.error(e.message);
                                            loadSnapshots();
                                        }
                                    } else {
                                        if (restoreTimer) clearTimeout(restoreTimer);
                                        if (restoreInterval) clearInterval(restoreInterval);

                                        let count = 3;
                                        restoreBtn.classList.add('confirming');
                                        restoreBtn.innerText = lang.t('confirm_restore_q', [count]);
                                        
                                        restoreInterval = setInterval(() => {
                                            count--;
                                            if (count > 0) {
                                                restoreBtn.innerText = lang.t('confirm_restore_q', [count]);
                                            } else {
                                                clearInterval(restoreInterval);
                                            }
                                        }, 1000);

                                        restoreTimer = setTimeout(() => {
                                            restoreBtn.classList.remove('confirming');
                                            restoreBtn.innerText = lang.t('restore_btn');
                                            restoreTimer = null;
                                            if (restoreInterval) clearInterval(restoreInterval);
                                        }, 3000);
                                    }
                                };
                                
                                // 删除操作
                                let delTimer = null;
                                let delInterval = null;
                                delBtn.onclick = async () => {
                                    // 互斥检查：如果恢复按钮正在倒计时，则删除按钮失效
                                    if (restoreBtn.classList.contains('confirming')) return;

                                    if (delBtn.classList.contains('confirming')) {
                                        if (delTimer) clearTimeout(delTimer);
                                        if (delInterval) clearInterval(delInterval);
                                        
                                        try {
                                            const dResp = await api.fetchApi("/lora_manager/delete_snapshot", {
                                                method: "POST",
                                                body: JSON.stringify({ filename: snap.filename })
                                            });
                                            const dRes = await dResp.json();
                                            if (dRes.status === 'success') {
                                                card.remove();
                                                
                                                // 更新 UI 上的 last_backup 显示
                                                if (dRes.last_backup !== undefined) {
                                                    this.localSettings.last_backup = dRes.last_backup;
                                                    const timeSpan = modal.querySelector('.sk-last-backup');
                                                    if (timeSpan) {
                                                        timeSpan.innerText = dRes.last_backup ? lang.t('last_backup', [dRes.last_backup]) : lang.t('no_backup_history');
                                                    }
                                                }

                                                if (snapList.children.length === 0) {
                                                    snapList.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">${lang.t('no_snapshots')}</div>`;
                                                }
                                            } else {
                                                ToastManager.error(dRes.message);
                                                loadSnapshots();
                                            }
                                        } catch (e) {
                                            ToastManager.error(e.message);
                                            loadSnapshots();
                                        }
                                    } else {
                                        if (delTimer) clearTimeout(delTimer);
                                        if (delInterval) clearInterval(delInterval);

                                        let count = 3;
                                        delBtn.classList.add('confirming');
                                        delBtn.innerText = lang.t('confirm_delete_q', [count]);

                                        delInterval = setInterval(() => {
                                            count--;
                                            if (count > 0) {
                                                delBtn.innerText = lang.t('confirm_delete_q', [count]);
                                            } else {
                                                clearInterval(delInterval);
                                            }
                                        }, 1000);

                                        delTimer = setTimeout(() => {
                                            delBtn.classList.remove('confirming');
                                            delBtn.innerText = lang.t('delete_btn');
                                            delTimer = null;
                                            if (delInterval) clearInterval(delInterval);
                                        }, 3000);
                                    }
                                };
                                
                                snapList.appendChild(card);
                            });
                        } else {
                            snapList.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">${lang.t('no_snapshots')}</div>`;
                        }
                    } catch (e) {
                        snapList.innerHTML = `<div style="color:#ef4444; text-align:center; padding:20px;">${lang.t('error') || 'Error'}: ${e.message}</div>`;
                    }
                };

                // Initial load
                loadSnapshots();
            };

            // 保存设置
            modal.querySelector('#sk-btn-save').onclick = async () => {
                this.localSettings.civitai_key = modal.querySelector('#sk-civitai-key').value.trim();
                this.localSettings.proxy = modal.querySelector('#sk-proxy').value.trim();
                this.localSettings.img_mode = modal.querySelector('#sk-img-mode').value;
                this.localSettings.nsfw_img_mode = modal.querySelector('#sk-nsfw-img-mode').value;
                this.localSettings.nsfw_allow_level = parseInt(modal.querySelector('#sk-nsfw-level').value);
                this.localSettings.model_card_title_source = modal.querySelector('#sk-model-card-title-source').value;

                // 保存新设置
                const getRadioVal = (name) => {
                    const el = modal.querySelector(`input[name="${name}"]:checked`);
                    return el ? (el.value === 'true') : false;
                };

                this.localSettings.sync_weight = getRadioVal('sync_weight');
                this.localSettings.sync_sampler = getRadioVal('sync_sampler');
                this.localSettings.sync_triggers = modal.querySelector('#sk-sync-triggers').value;
                this.localSettings.check_update = getRadioVal('check_update');
                this.localSettings.video_frame = getRadioVal('video_frame');
                this.localSettings.allow_civitai_basemodel_edit = getRadioVal('allow_civitai_basemodel_edit');
                this.localSettings.use_diff_sync = getRadioVal('use_diff_sync');
                
                const llmActivateEl = modal.querySelector('#sk-llm-activate');
                if (llmActivateEl) {
                    this.localSettings.llm_activate = llmActivateEl.checked;
                }

                try {
                    // 保存本地设置
                    const p1 = api.fetchApi("/lora_manager/save_local_settings", {
                        method: "POST",
                        body: JSON.stringify(this.localSettings)
                    });
                    
                    // 保存底模设置 (排序)
                    const p2 = api.fetchApi("/lora_manager/update_basemodel_settings", {
                        method: "POST",
                        body: JSON.stringify({ 
                            system_presets: this.baseModelSettings.system_presets,
                            user_custom: this.baseModelSettings.user_custom 
                        })
                    });
                    
                    await Promise.all([p1, p2]);
                    
                    ToastManager.success(lang.t('settings_saved'));
                    await this.refresh();
                    close();
                } catch (e) {
                    ToastManager.error(lang.t('save_error'));
                }
            };
        };

        updateContent();
        lang.addLocaleChangeListener(updateContent);
        document.body.appendChild(modal);
    }

    // Show LLM Configuration Manager
    async showLLMConfigModal(onClose) {
        this.injectGlobalStyles();
        const loadConfigs = async () => {
            try {
                const resp = await api.fetchApi("/sknodes/llm_mgr/get_configs");
                const res = await resp.json();
                if (res) {
                    if (res.active_llm_id !== undefined) this.localSettings.active_llm_id = res.active_llm_id;
                    if (res.llm_configs !== undefined) this.localSettings.llm_configs = res.llm_configs;
                }
                return res;
            } catch (e) {
                console.error("[SK-LoRA] [LLM] 获取配置失败:", e);
                return { active_llm_id: "", llm_configs: [] };
            }
        };

        const modal = document.createElement('div');
        modal.className = 'sk-modal-overlay';

        const loadTemplates = async () => {
            try {
                const resp = await api.fetchApi("/sknodes/llm_mgr/get_templates");
                return await resp.json();
            } catch (e) {
                console.error("[SK-LoRA] [LLM] 获取模版失败:", e);
                return {};
            }
        };

        const getApiKeyLink = (provider) => {
            const urls = {
                'openai': 'https://platform.openai.com/api-keys',
                'gemini': 'https://aistudio.google.com/app/apikey',
                'deepseek': 'https://platform.deepseek.com/api_keys',
                'groq': 'https://console.groq.com/keys',
                'zhipu': 'https://www.bigmodel.cn/invite?icode=Am7KEICpjnpIHR61kKuza0jPr3uHog9F4g5tjuOUqno%3D',
                'xflow': 'https://api.xflow.cc/register?aff=PKb3'
            };
            const url = urls[provider];
            if (!url) return '';
            
            const providerName = lang.t('llm_provider_' + provider) || provider.charAt(0).toUpperCase() + provider.slice(1);
            const linkText = lang.t('llm_get_api_key').replace('{name}', providerName);
            
            return `
                <a href="${url}" target="_blank" class="sk-llm-get-key-link" title="${linkText}">
                    ${Icons.get('external_link', '', 14)}
                    <span>${linkText}</span>
                </a>
            `;
        };

        let templates = await loadTemplates();
        let data = await loadConfigs();
        let selectedId = null;

        let isEditing = true; // 始终处于编辑状态，区别在于是否有 state.id

        const buildStateFromConfig = (cfg) => {
            const provider = cfg?.provider || 'gemini';
            const tpl = templates[provider] || {};
            const presetModels = tpl.models || [];
            const defaultModels = {
                'deepseek': 'deepseek-chat',
                'openai': 'gpt-4o-mini',
                'groq': 'llama-3.1-70b-versatile',
                'zhipu': 'glm-4-flash',
                'xflow': 'gpt-4o-mini'
            };

            let selectedModel = cfg?.selected_model || '';
            if (!selectedModel) {
                if (presetModels.length > 0) {
                    const recommended = presetModels.find(m => m.recommended);
                    selectedModel = recommended ? recommended.name : presetModels[0].name;
                } else {
                    selectedModel = defaultModels[provider] || '';
                }
            }

            const minInterval = cfg?.min_interval !== undefined
                ? cfg.min_interval
                : (tpl.min_interval !== undefined ? tpl.min_interval : 2.0);

            const baseUrl = (cfg?.base_url || tpl.base_url || '');
            const isCustomModel = !!selectedModel && presetModels.length > 0 ? !presetModels.some(m => m.name === selectedModel) : false;

            return {
                id: cfg?.id,
                provider,
                alias: cfg?.alias || '',
                api_key: cfg?.api_key || '',
                base_url: baseUrl,
                selected_model: selectedModel,
                min_interval: minInterval,
                is_custom_model: isCustomModel,
                is_url_locked: true
            };
        };

        let state = buildStateFromConfig(null);
        isEditing = true; // 初始为“添加配置”状态，允许编辑

        const updateStateFromDOM = () => {
            const aliasEl = modal.querySelector('#llm-alias');
            if (aliasEl) state.alias = aliasEl.value;

            const apiKeyEl = modal.querySelector('#llm-api-key');
            if (apiKeyEl) state.api_key = apiKeyEl.value;

            const baseUrlEl = modal.querySelector('#llm-base-url');
            if (baseUrlEl) state.base_url = baseUrlEl.value;

            const modelEl = modal.querySelector('#llm-model');
            if (modelEl) state.selected_model = modelEl.value;

            const intervalEl = modal.querySelector('#llm-min-interval');
            if (intervalEl) state.min_interval = parseFloat(intervalEl.value) || 2.0;

            const customCheck = modal.querySelector('#llm-custom-check');
            if (customCheck) state.is_custom_model = customCheck.checked;
        };

        const renderList = () => {
            const listEl = modal.querySelector('#sk-llm-list');
            if (!listEl) return;

            const { active_llm_id, llm_configs } = data;
            listEl.innerHTML = llm_configs.map(cfg => {
                const isDefault = cfg.id === active_llm_id;
                const isSelected = cfg.id === selectedId;
                const providerIcon = this.getProviderIcon(cfg.provider);
                return `
                <div class="sk-llm-card ${isSelected ? 'active' : ''} ${isDefault ? 'is-default' : ''}" data-id="${cfg.id}">
                    ${isDefault ? `<div class="sk-llm-badge-default">${lang.t('llm_default_badge') || 'Default'}</div>` : ''}
                    <div class="sk-llm-icon">${providerIcon}</div>
                    <div class="sk-llm-info">
                        <div class="sk-llm-name">
                            ${cfg.alias || cfg.provider}
                        </div>
                        <div class="sk-llm-model">${cfg.selected_model || lang.t('llm_no_model')}</div>
                    </div>
                    <div class="sk-llm-actions">
                        <button class="sk-llm-btn edit" title="${lang.t('llm_edit')}" data-id="${cfg.id}">${Icons.get('edit', '', 14)}</button>
                        ${!isDefault ? `<button class="sk-llm-btn default" title="${lang.t('llm_set_default')}" data-id="${cfg.id}">${Icons.get('check_circle', '', 14)}</button>` : ''}
                        <button class="sk-llm-btn delete" title="${lang.t('llm_delete')}" data-id="${cfg.id}">${Icons.get('trash', '', 14)}</button>
                    </div>
                </div>`;
            }).join('') || `<div class="sk-llm-empty">${lang.t('llm_no_config')}</div>`;

            listEl.querySelectorAll('.sk-llm-card').forEach(card => {
                card.onclick = () => {
                    const id = card.dataset.id;
                    if (id === selectedId && state.id === null) return;
                    selectedId = id;
                    // 点击卡片不进入编辑模式，而是重置为“添加配置”状态，并高亮该卡片
                    state = buildStateFromConfig(null);
                    renderAll();
                };
            });

            listEl.querySelectorAll('.edit').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    selectedId = id;
                    isEditing = true; // 点击编辑图标进入编辑模式
                    const cfg = data.llm_configs.find(c => c.id === selectedId) || null;
                    state = buildStateFromConfig(cfg);
                    renderAll();
                };
            });

            listEl.querySelectorAll('.default').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    await api.fetchApi("/sknodes/llm_mgr/set_active", { method: "POST", body: JSON.stringify({ id }) });
                    data = await loadConfigs();
                    renderAll();
                    ToastManager.success(lang.t('llm_save_success'));
                };
            });

            listEl.querySelectorAll('.delete').forEach(btn => {
                let delTimer = null;
                let delInterval = null;
                const originalHTML = btn.innerHTML;

                const resetBtn = () => {
                    btn.classList.remove('confirming');
                    btn.innerHTML = originalHTML;
                    btn.style.width = '';
                    btn.style.paddingLeft = '';
                    btn.style.paddingRight = '';
                    if (delTimer) clearTimeout(delTimer);
                    if (delInterval) clearInterval(delInterval);
                };

                btn.onclick = async (e) => {
                    e.stopPropagation();
                    if (btn.classList.contains('confirming')) {
                        const id = btn.dataset.id;
                        if (delTimer) clearTimeout(delTimer);
                        if (delInterval) clearInterval(delInterval);
                        
                        await api.fetchApi("/sknodes/llm_mgr/delete_config", { method: "POST", body: JSON.stringify({ id }) });
                        data = await loadConfigs();
                        // 无论删除的是否是当前选中项，都重置为“添加配置”状态
                        selectedId = null;
                        isEditing = true;
                        state = buildStateFromConfig(null);
                        renderAll();
                    } else {
                        btn.classList.add('confirming');
                        let count = 3;
                        btn.innerHTML = `${lang.t('confirm_delete_btn')}(${count})`;
                        // 确保确认状态下有足够宽度显示文字
                        btn.style.width = 'auto';
                        btn.style.paddingLeft = '10px';
                        btn.style.paddingRight = '10px';

                        delInterval = setInterval(() => {
                            count--;
                            if (count > 0) {
                                btn.innerHTML = `${lang.t('confirm_delete_btn')}(${count})`;
                            } else {
                                clearInterval(delInterval);
                            }
                        }, 1000);

                        delTimer = setTimeout(() => {
                            resetBtn();
                        }, 3000);
                    }
                };
            });
        };

        const updateSaveButtonState = () => {
            const saveBtn = modal.querySelector('#sk-save-config');
            if (!saveBtn) return;
            
            updateStateFromDOM();
            
            let isValid = true;
            // 虽然 state.alias 在逻辑上是必填，但我们可以智能生成，所以这里只检查其他核心项
            if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) isValid = false;
            if (!state.base_url) isValid = false;
            if (!state.selected_model) isValid = false;
            
            if (isValid) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
            } else {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
            }
        };

        const renderForm = () => {
            const titleEl = modal.querySelector('#sk-llm-form-title');
            if (titleEl) {
                const title = state.id 
                    ? lang.t('llm_edit')
                    : lang.t('llm_add_config');
                titleEl.innerText = title;
            }

            const formEl = modal.querySelector('#sk-llm-form');
            if (!formEl) return;

            const providers = ['gemini', 'openai', 'deepseek', 'groq', 'ollama', 'zhipu', 'xflow', 'custom'];
            const currentTemplate = templates[state.provider] || {};

            if (!state.base_url && currentTemplate.base_url) {
                state.base_url = currentTemplate.base_url;
            }

            let intervalWarning = '';
            if (state.provider === 'gemini') {
                const isWarning = state.min_interval < 4.0;
                intervalWarning = `<div class="sk-llm-warning-text" style="color: ${isWarning ? '#fbbf24' : '#94a3b8'}">
                    ${isWarning ? Icons.get('alert_triangle', '', 14) : Icons.get('info', '', 14)} ${lang.t('llm_gemini_interval_tip')}
                </div>`;
            }

            const recommendedModels = (currentTemplate.models || [])
                .filter(m => m.recommended)
                .map(m => m.name);

            const tipContent = recommendedModels.length > 0
                ? recommendedModels.join(', ')
                : (currentTemplate.models || []).slice(0, 3).map(m => m.name).join(', ');

            formEl.innerHTML = `
                <div class="sk-modal-body sk-llm-modal-body">
                    <div class="sk-llm-provider-select ${state.id ? 'is-locked' : ''}">
                        ${providers.map(p => `
                            <div class="sk-provider-option ${state.provider === p ? 'selected' : ''} ${state.id && state.provider !== p ? 'is-disabled' : ''}" 
                                data-provider="${p}" 
                                title="${state.id && state.provider !== p ? lang.t('llm_provider_locked') || '该模式下不可更改供应商' : (lang.t('llm_provider_' + p) || p)}">
                                ${state.id && state.provider === p ? `<span class="sk-provider-lock-badge">${Icons.get('lock', '', 10)}</span>` : ''}
                                <div class="sk-provider-icon">
                                    ${this.getProviderIcon(p)}
                                </div>
                                <div class="sk-provider-name">${lang.t('llm_provider_' + p) || p.charAt(0).toUpperCase() + p.slice(1)}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="sk-llm-form-group">
                        <label class="sk-llm-form-label">${lang.t('llm_alias')}</label>
                        <input type="text" class="sk-llm-input" id="llm-alias" value="${state.alias}" placeholder="${lang.t('llm_alias_placeholder')}">
                    </div>

                    ${state.provider !== 'ollama' ? `
                    <div class="sk-llm-form-group">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <label class="sk-llm-form-label" style="margin-bottom: 0;">${lang.t('llm_api_key')}</label>
                            ${getApiKeyLink(state.provider)}
                        </div>
                        <div class="sk-llm-input-wrapper">
                            <input type="password" class="sk-llm-input" id="llm-api-key" value="${state.api_key}" placeholder="${lang.t('llm_api_key_placeholder')}">
                            <span class="sk-pwd-toggle">${Icons.get('eye', '', 14)}</span>
                        </div>
                    </div>
                    ` : ''}

                    <div class="sk-llm-form-group">
                        <label class="sk-llm-form-label">
                            ${lang.t('llm_model_name')}
                            ${tipContent ? `<span class="sk-llm-help-icon" title="${lang.t('llm_recommended_models')}: ${tipContent}">ⓘ</span>` : ''}
                        </label>
                        <div class="sk-llm-input-group">
                            ${state.is_custom_model || state.provider === 'custom' ? `
                                <input type="text" class="sk-llm-input" id="llm-model" value="${state.selected_model}" placeholder="${lang.t('llm_model_placeholder')}">
                            ` : `
                                <select class="sk-llm-input" id="llm-model">
                                    <option value="">${lang.t('llm_select_model')}</option>
                                    ${(currentTemplate.models || []).map(m => `
                                        <option value="${m.name}" ${m.name === state.selected_model ? 'selected' : ''}>
                                            ${m.name}${m.recommended ? ' ' + Icons.get('star', '', 12) : ''}
                                        </option>
                                    `).join('')}
                                    ${state.selected_model && !(currentTemplate.models || []).some(m => m.name === state.selected_model) ? `
                                        <option value="${state.selected_model}" selected>${state.selected_model}</option>
                                    ` : ''}
                                </select>
                            `}
                            <div class="sk-llm-refresh-btn" title="${lang.t('llm_refresh_models')}">${Icons.get('refresh', '', 14)}</div>
                        </div>
                        ${state.provider !== 'custom' ? `
                        <div class="sk-llm-checkbox-group" id="llm-custom-toggle">
                            <input type="checkbox" class="sk-llm-checkbox" id="llm-custom-check" ${state.is_custom_model ? 'checked' : ''}>
                            <label class="sk-llm-checkbox-label" for="llm-custom-check">${lang.t('llm_custom_model')}</label>
                        </div>
                        ` : ''}
                    </div>

                    <div class="sk-llm-form-group">
                        <label class="sk-llm-form-label">${lang.t('llm_base_url')}</label>
                        <div class="sk-llm-input-wrapper">
                            <input type="text" class="sk-llm-input ${state.is_url_locked ? 'locked' : ''}" id="llm-base-url"
                                value="${state.base_url}"
                                ${state.is_url_locked ? 'readonly' : ''}
                                placeholder="${lang.t('llm_base_url_placeholder')}">
                            <span class="sk-llm-input-icon" id="llm-url-lock" title="${state.is_url_locked ? lang.t('llm_unlock_url') : lang.t('llm_lock_url')}">
                                ${state.is_url_locked ? Icons.get('lock', '', 14) : Icons.get('unlock', '', 14)}
                            </span>
                        </div>
                    </div>

                    <div class="sk-llm-form-group">
                        <label class="sk-llm-form-label">
                            ${lang.t('llm_min_interval')}
                            ${state.provider === 'ollama' ? `<span class="sk-llm-tip">(${lang.t('llm_ollama_interval_tip')})</span>` : ''}
                        </label>
                        <input type="number" step="0.1" min="0.1" class="sk-llm-input" id="llm-min-interval" value="${state.min_interval}" placeholder="${lang.t('llm_min_interval_placeholder')}">
                        ${intervalWarning}
                    </div>
                </div>
                <div class="sk-modal-footer" style="justify-content: space-between;">
                    <button class="sk-btn sk-btn-secondary" id="sk-test-conn">${lang.t('llm_test_connection')}</button>
                    <div style="display:flex; gap: 12px;">
                        ${state.id ? `<button class="sk-btn sk-btn-secondary" id="sk-cancel-edit">${lang.t('cancel')}</button>` : ''}
                        <button class="sk-btn sk-btn-primary" id="sk-save-config">${lang.t('save')}</button>
                    </div>
                </div>
            `;

            // 事件绑定
            const cancelBtn = modal.querySelector('#sk-cancel-edit');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    // 取消编辑，回到“添加配置”状态
                    state = buildStateFromConfig(null);
                    renderForm();
                };
            }

            const intervalInput = modal.querySelector('#llm-min-interval');
            if (intervalInput) {
                intervalInput.oninput = () => {
                    const val = parseFloat(intervalInput.value);
                    const warningEl = modal.querySelector('.sk-llm-warning-text');
                    if (state.provider === 'gemini') {
                        if (warningEl) {
                            const isWarning = val < 4.0;
                            warningEl.style.color = isWarning ? '#fbbf24' : '#94a3b8';
                            warningEl.innerHTML = `${isWarning ? Icons.get('alert_triangle', '', 14) : Icons.get('info', '', 14)} ${lang.t('llm_gemini_interval_tip')}`;
                        }
                    }
                };
            }

            modal.querySelectorAll('.sk-provider-option').forEach(el => {
                el.onclick = () => {
                    if (state.id) return; // 编辑模式下禁用切换
                    
                    updateStateFromDOM();
                    const newProvider = el.dataset.provider;
                    if (state.provider !== newProvider) {
                        state.provider = newProvider;
                        state.api_key = '';
                        const tpl = templates[newProvider] || {};
                        state.base_url = tpl.base_url || '';
                        state.min_interval = tpl.min_interval !== undefined ? tpl.min_interval : 2.0;

                        if (tpl.models && tpl.models.length > 0) {
                            const recommended = tpl.models.find(m => m.recommended);
                            state.selected_model = recommended ? recommended.name : tpl.models[0].name;
                        } else {
                            const defaultModels = {
                                'deepseek': 'deepseek-chat',
                                'openai': 'gpt-4o-mini',
                                'groq': 'llama-3.1-70b-versatile',
                                'zhipu': 'glm-4-flash',
                                'xflow': 'gpt-4o-mini'
                            };
                            state.selected_model = defaultModels[newProvider] || '';
                        }

                        state.is_custom_model = false;
                        state.is_url_locked = true;
                    }
                    renderForm();
                };
            });

            const urlLock = modal.querySelector('#llm-url-lock');
            if (urlLock) {
                urlLock.onclick = () => {
                    state.is_url_locked = !state.is_url_locked;
                    const input = modal.querySelector('#llm-base-url');
                    input.readOnly = state.is_url_locked;
                    if (state.is_url_locked) {
                        input.classList.add('locked');
                        urlLock.innerHTML = Icons.get('lock', '', 14);
                        urlLock.title = lang.t('llm_unlock_url');
                    } else {
                        input.classList.remove('locked');
                        urlLock.innerHTML = Icons.get('unlock', '', 14);
                        urlLock.title = lang.t('llm_lock_url');
                    }
                };
            }

            const customCheck = modal.querySelector('#llm-custom-check');
            if (customCheck) {
                customCheck.onchange = () => {
                    updateStateFromDOM();
                    state.is_custom_model = customCheck.checked;
                    renderForm();
                };
            }

            const pwdToggle = modal.querySelector('.sk-pwd-toggle');
            if (pwdToggle) {
                pwdToggle.onclick = () => {
                    const input = modal.querySelector('#llm-api-key');
                    if (input.type === 'password') {
                        input.type = 'text';
                        pwdToggle.innerHTML = Icons.get('eye_off', '', 14);
                    } else {
                        input.type = 'password';
                        pwdToggle.innerHTML = Icons.get('eye', '', 14);
                    }
                };
            }

            const refreshBtn = modal.querySelector('.sk-llm-refresh-btn');
            if (refreshBtn) {
                refreshBtn.onclick = async () => {
                    updateStateFromDOM();
                    if (!state.base_url) {
                        ToastManager.error(lang.t('llm_base_url_placeholder'));
                        return;
                    }
                    if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) {
                        ToastManager.error(lang.t('llm_api_key_required'));
                        return;
                    }

                    refreshBtn.classList.add('spinning');
                    try {
                        const tempConfig = {
                            provider: state.provider,
                            base_url: state.base_url,
                            api_key: state.api_key
                        };
                        const resp = await api.fetchApi("/sknodes/llm_mgr/test_connection", {
                            method: "POST",
                            body: JSON.stringify({ config: tempConfig })
                        });
                        const res = await resp.json();

                        if (res.status === 'success' && res.models) {
                            if (!templates[state.provider]) templates[state.provider] = { base_url: state.base_url, models: [] };
                            templates[state.provider].models = res.models.map(m => ({ name: m, recommended: false }));
                            state.is_custom_model = false;
                            ToastManager.success(lang.t('llm_refresh_success'));
                            renderForm();
                        } else {
                            ToastManager.error(res.message || lang.t('llm_refresh_failed'));
                        }
                    } catch (e) {
                        ToastManager.error(e.message);
                    } finally {
                        refreshBtn.classList.remove('spinning');
                    }
                };
            }

            const testBtn = modal.querySelector('#sk-test-conn');
            if (testBtn) {
                testBtn.onclick = async () => {
                    updateStateFromDOM();

                    if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) {
                        ToastManager.error(lang.t('llm_api_key_required'));
                        return;
                    }
                    if (!state.base_url) {
                        ToastManager.error(lang.t('llm_base_url_required'));
                        return;
                    }

                    const originalText = testBtn.innerText;
                    testBtn.innerText = lang.t('llm_testing');
                    testBtn.disabled = true;

                    try {
                        const resp = await api.fetchApi("/sknodes/llm_mgr/test_connection", {
                            method: "POST",
                            body: JSON.stringify({ config: state })
                        });
                        const res = await resp.json();
                        if (res.status === 'success') {
                            ToastManager.success(lang.t('llm_connection_success'));
                        } else {
                            ToastManager.error(lang.t('llm_connection_failed', [res.message || 'Unknown error']));
                        }
                    } catch (e) {
                        ToastManager.error(e.message);
                    } finally {
                        testBtn.innerText = originalText;
                        testBtn.disabled = false;
                    }
                };
            }

            const saveBtn = modal.querySelector('#sk-save-config');
            if (saveBtn) {
                saveBtn.onclick = async () => {
                    updateStateFromDOM();

                    // 智能别名生成：如果别名为空，则自动生成一个
                    if (!state.alias || !state.alias.trim()) {
                        const providerName = lang.t('llm_provider_' + state.provider) || state.provider;
                        state.alias = `${providerName} - ${state.selected_model}`;
                    }

                    // 表单校验
                    if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) {
                        ToastManager.error(lang.t('llm_api_key_required'));
                        return;
                    }
                    if (!state.base_url) {
                        ToastManager.error(lang.t('llm_base_url_required'));
                        return;
                    }
                    if (!state.selected_model) {
                        ToastManager.error(lang.t('llm_model_required'));
                        return;
                    }

                    const isNew = !state.id;
                    if (isNew) state.id = Date.now().toString();

                    try {
                        await api.fetchApi("/sknodes/llm_mgr/save_config", {
                            method: "POST",
                            body: JSON.stringify({ config: state })
                        });
                        ToastManager.success(lang.t('llm_save_success'));
                        data = await loadConfigs();
                        // 保存成功后重置为“添加配置”状态
                        selectedId = null;
                        isEditing = true;
                        state = buildStateFromConfig(null);
                        renderAll();
                    } catch (e) {
                        ToastManager.error(e.message);
                        if (isNew) state.id = undefined;
                    }
                };
            }

            // 初始检查按钮状态
            updateSaveButtonState();
            
            // 绑定输入监听，实现动态按钮状态
            formEl.querySelectorAll('input, select').forEach(el => {
                el.addEventListener('input', updateSaveButtonState);
                el.addEventListener('change', updateSaveButtonState);
            });
        };

        const renderAll = () => {
            modal.innerHTML = `
                <div class="sk-modal-container sk-llm-center">
                    <div class="sk-modal-header">
                        <div class="sk-modal-title">${Icons.get('bot', '', 18)} ${lang.t('llm_config_mgr')}</div>
                        <div class="sk-modal-close">&times;</div>
                    </div>
                    <div class="sk-llm-center-body">
                        <div class="sk-llm-center-left">
                            <div class="sk-llm-center-left-header">
                                <button class="sk-btn sk-btn-primary" id="sk-llm-new" style="width: 100%;">+ ${lang.t('llm_add_config')}</button>
                            </div>
                            <div class="sk-llm-center-left-list">
                                <div class="sk-llm-list" id="sk-llm-list"></div>
                            </div>
                        </div>
                        <div class="sk-llm-center-right">
                            <div class="sk-llm-center-right-header">
                                <div class="sk-llm-center-right-title" id="sk-llm-form-title"></div>
                                <div class="sk-llm-center-right-actions">
                                    ${state.id && data.active_llm_id !== state.id ? `<button class="sk-btn sk-btn-secondary sk-btn-sm" id="sk-llm-set-default">${Icons.get('check_circle', '', 14)} ${lang.t('llm_set_default')}</button>` : ''}
                                </div>
                            </div>
                            <div class="sk-llm-center-form" id="sk-llm-form"></div>
                        </div>
                    </div>
                </div>
            `;

            modal.querySelector('.sk-modal-close').onclick = () => { modal.remove(); if (onClose) onClose(); };

            const newBtn = modal.querySelector('#sk-llm-new');
            if (newBtn) {
                newBtn.onclick = () => {
                    selectedId = null;
                    isEditing = true;
                    state = buildStateFromConfig(null);
                    renderAll();
                };
            }

            const setDefaultBtn = modal.querySelector('#sk-llm-set-default');
            if (setDefaultBtn) {
                setDefaultBtn.onclick = async () => {
                    if (!state.id) return;
                    await api.fetchApi("/sknodes/llm_mgr/set_active", { method: "POST", body: JSON.stringify({ id: state.id }) });
                    data = await loadConfigs();
                    renderAll();
                    ToastManager.success(lang.t('llm_save_success'));
                };
            }

            renderList();
            renderForm();
        };

        renderAll();
        document.body.appendChild(modal);

        const refreshUI = async () => {
            if (!document.contains(modal)) {
                lang.removeLocaleChangeListener(refreshUI);
                return;
            }
            updateStateFromDOM();
            data = await loadConfigs();
            renderAll();
        };
        lang.addLocaleChangeListener(refreshUI);
    }

    getProviderIcon(provider) {
        switch(provider.toLowerCase()) {
            case 'gemini': return Icons.get('gemini', '', 20);
            case 'openai': return Icons.get('bot', '', 20);
            case 'ollama': return Icons.get('brain', '', 20);
            case 'deepseek': return Icons.get('deepseek', '', 20);
            case 'groq': return Icons.get('zap', '', 20);
            case 'zhipu': return Icons.get('sparkles', '', 20);
            case 'xflow': return Icons.get('network', '', 20);
            case 'custom': return Icons.get('cpu', '', 20);
            default: return Icons.get('plug', '', 20);
        }
    }

    // 显示 LLM 编辑/添加弹窗
    async showLLMEditModal(config, onSave) {
        this.injectGlobalStyles();
        const isEdit = !!config;
        const modal = document.createElement('div');
        modal.className = 'sk-modal-overlay';
        modal.style.zIndex = '11000';

        // 获取模板
        let templates = {};
        try {
            const resp = await api.fetchApi("/sknodes/llm_mgr/get_templates");
            templates = await resp.json();
        } catch (e) {
            console.error("[SK-LoRA] [LLM] 获取模版失败:", e);
        }

        // 状态
        let state = {
            provider: config?.provider || 'gemini',
            alias: config?.alias || '',
            api_key: config?.api_key || '',
            base_url: config?.base_url || '',
            selected_model: config?.selected_model || '',
            min_interval: config?.min_interval !== undefined ? config.min_interval : (templates[config?.provider || 'gemini']?.min_interval || 2.0),
            is_custom_model: false,
            is_url_locked: true
        };

        // 如果是编辑，检查模型是否为自定义
        if (isEdit && state.provider && templates[state.provider]) {
            const presetModels = templates[state.provider].models || [];
            state.is_custom_model = !presetModels.some(m => m.name === state.selected_model);
        }

        const updateStateFromDOM = () => {
            const aliasEl = modal.querySelector('#llm-alias');
            if (aliasEl) state.alias = aliasEl.value;
            
            const apiKeyEl = modal.querySelector('#llm-api-key');
            if (apiKeyEl) state.api_key = apiKeyEl.value;
            
            const baseUrlEl = modal.querySelector('#llm-base-url');
            if (baseUrlEl) state.base_url = baseUrlEl.value;
            
            const modelEl = modal.querySelector('#llm-model');
            if (modelEl) state.selected_model = modelEl.value;

            const intervalEl = modal.querySelector('#llm-min-interval');
            if (intervalEl) state.min_interval = parseFloat(intervalEl.value) || 2.0;

            const customCheck = modal.querySelector('#llm-custom-check');
            if (customCheck) state.is_custom_model = customCheck.checked;
        };

        const updateSaveButtonState = () => {
            const saveBtn = modal.querySelector('#sk-save-config');
            if (!saveBtn) return;
            
            updateStateFromDOM();
            
            let isValid = true;
            if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) isValid = false;
            if (!state.base_url) isValid = false;
            if (!state.selected_model) isValid = false;
            
            if (isValid) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
            } else {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
            }
        };

        const renderForm = () => {
            const providers = ['gemini', 'openai', 'deepseek', 'groq', 'ollama', 'zhipu', 'xflow', 'custom'];
            const currentTemplate = templates[state.provider] || {};
            
            // Default Base URLs logic if not set
            if (!state.base_url && currentTemplate.base_url) {
                state.base_url = currentTemplate.base_url;
            }

            // 间隔提示逻辑
            let intervalWarning = '';
            if (state.provider === 'gemini') {
                const isWarning = state.min_interval < 4.0;
                intervalWarning = `<div class="sk-llm-warning-text" style="color: ${isWarning ? '#fbbf24' : '#94a3b8'}">
                    ${isWarning ? Icons.get('alert_triangle', '', 14) : Icons.get('info', '', 14)} ${lang.t('llm_gemini_interval_tip')}
                </div>`;
            }

            // 获取推荐模型列表作为提示内容
            const recommendedModels = (currentTemplate.models || [])
                .filter(m => m.recommended)
                .map(m => m.name);
            
            // 如果没有推荐模型，则列出前几个常用模型
            const tipContent = recommendedModels.length > 0 
                ? recommendedModels.join(', ') 
                : (currentTemplate.models || []).slice(0, 3).map(m => m.name).join(', ');

            modal.innerHTML = `
                <div class="sk-modal-container sk-modal-sm">
                    <div class="sk-modal-header">
                        <div class="sk-modal-title">${isEdit ? lang.t('llm_edit') : lang.t('llm_add_config')}</div>
                        <div class="sk-modal-close">&times;</div>
                    </div>
                    <div class="sk-modal-body sk-llm-modal-body">
                        <!-- Provider Selection -->
                        <div class="sk-llm-provider-select">
                            ${providers.map(p => `
                                <div class="sk-provider-option ${state.provider === p ? 'selected' : ''}" data-provider="${p}" title="${lang.t('llm_provider_' + p) || p}">
                                    <div class="sk-provider-icon">${this.getProviderIcon(p)}</div>
                                    <div class="sk-provider-name">${lang.t('llm_provider_' + p) || p.charAt(0).toUpperCase() + p.slice(1)}</div>
                                </div>
                            `).join('')}
                        </div>

                        <!-- Form Fields -->
                        <div class="sk-llm-form-group">
                            <label class="sk-llm-form-label">${lang.t('llm_alias')}</label>
                            <input type="text" class="sk-llm-input" id="llm-alias" value="${state.alias}" placeholder="${lang.t('llm_alias_placeholder')}">
                        </div>

                        ${state.provider !== 'ollama' ? `
                        <div class="sk-llm-form-group">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <label class="sk-llm-form-label" style="margin-bottom: 0;">${lang.t('llm_api_key')}</label>
                                ${getApiKeyLink(state.provider)}
                            </div>
                            <div class="sk-llm-input-wrapper">
                                <input type="password" class="sk-llm-input" id="llm-api-key" value="${state.api_key}" placeholder="${lang.t('llm_api_key_placeholder')}">
                                <span class="sk-pwd-toggle">${Icons.get('eye', '', 14)}</span>
                            </div>
                        </div>
                        ` : ''}

                        <div class="sk-llm-form-group">
                            <label class="sk-llm-form-label">
                                ${lang.t('llm_model_name')}
                                ${tipContent ? `<span class="sk-llm-help-icon" title="${lang.t('llm_recommended_models')}: ${tipContent}">ⓘ</span>` : ''}
                            </label>
                            <div class="sk-llm-input-group">
                                ${state.is_custom_model || state.provider === 'custom' ? `
                                    <input type="text" class="sk-llm-input" id="llm-model" value="${state.selected_model}" placeholder="${lang.t('llm_model_placeholder')}">
                                ` : `
                                    <select class="sk-llm-input" id="llm-model">
                                        <option value="">${lang.t('llm_select_model')}</option>
                                        ${(currentTemplate.models || []).map(m => `
                                            <option value="${m.name}" ${m.name === state.selected_model ? 'selected' : ''}>
                                                ${m.name}${m.recommended ? ' ' + Icons.get('star', '', 12) : ''}
                                            </option>
                                        `).join('')}
                                        ${state.selected_model && !(currentTemplate.models || []).some(m => m.name === state.selected_model) ? `
                                            <option value="${state.selected_model}" selected>${state.selected_model}</option>
                                        ` : ''}
                                    </select>
                                `}
                                <div class="sk-llm-refresh-btn" title="${lang.t('llm_refresh_models')}">${Icons.get('refresh', '', 14)}</div>
                            </div>
                            ${state.provider !== 'custom' ? `
                            <div class="sk-llm-checkbox-group" id="llm-custom-toggle">
                                <input type="checkbox" class="sk-llm-checkbox" id="llm-custom-check" ${state.is_custom_model ? 'checked' : ''}>
                                <label class="sk-llm-checkbox-label" for="llm-custom-check">${lang.t('llm_custom_model')}</label>
                            </div>
                            ` : ''}
                        </div>

                        <div class="sk-llm-form-group">
                            <label class="sk-llm-form-label">${lang.t('llm_base_url')}</label>
                            <div class="sk-llm-input-wrapper">
                                <input type="text" class="sk-llm-input ${state.is_url_locked ? 'locked' : ''}" id="llm-base-url" 
                                    value="${state.base_url}" 
                                    ${state.is_url_locked ? 'readonly' : ''} 
                                    placeholder="${lang.t('llm_base_url_placeholder')}">
                                <span class="sk-llm-input-icon" id="llm-url-lock" title="${state.is_url_locked ? lang.t('llm_unlock_url') : lang.t('llm_lock_url')}">
                                    ${state.is_url_locked ? Icons.get('lock', '', 14) : Icons.get('unlock', '', 14)}
                                </span>
                            </div>
                        </div>

                        <div class="sk-llm-form-group">
                            <label class="sk-llm-form-label">
                                ${lang.t('llm_min_interval')}
                                ${state.provider === 'ollama' ? `<span class="sk-llm-tip">(${lang.t('llm_ollama_interval_tip')})</span>` : ''}
                            </label>
                            <input type="number" step="0.1" min="0.1" class="sk-llm-input" id="llm-min-interval" value="${state.min_interval}" placeholder="${lang.t('llm_min_interval_placeholder')}">
                            ${intervalWarning}
                        </div>
                    </div>
                    <div class="sk-modal-footer">
                        <button class="sk-btn sk-btn-secondary" id="sk-test-conn">${lang.t('llm_test_connection')}</button>
                        <button class="sk-btn sk-btn-primary" id="sk-save-config">${lang.t('save')}</button>
                    </div>
                </div>
            `;

            // 绑定事件
            modal.querySelector('.sk-modal-close').onclick = () => modal.remove();

            // 间隔警告实时更新
            const intervalInput = modal.querySelector('#llm-min-interval');
            if (intervalInput) {
                intervalInput.oninput = () => {
                    const val = parseFloat(intervalInput.value);
                    const warningEl = modal.querySelector('.sk-llm-warning-text');
                    if (state.provider === 'gemini') {
                        if (warningEl) {
                            const isWarning = val < 4.0;
                            warningEl.style.color = isWarning ? '#fbbf24' : '#94a3b8';
                            warningEl.innerHTML = `${isWarning ? Icons.get('alert_triangle', '', 14) : Icons.get('info', '', 14)} ${lang.t('llm_gemini_interval_tip')}`;
                        }
                    }
                };
            }

            // Provider switch
            modal.querySelectorAll('.sk-provider-option').forEach(el => {
                el.onclick = () => {
                    updateStateFromDOM();
                    const newProvider = el.dataset.provider;
                    if (state.provider !== newProvider) {
                        state.provider = newProvider;
                        state.api_key = ''; // 切换供应商时清空 API Key
                        const tpl = templates[newProvider] || {};
                        state.base_url = tpl.base_url || '';
                        state.min_interval = tpl.min_interval !== undefined ? tpl.min_interval : 2.0;
                        
                        // 自动选择推荐模型或第一个模型
                        if (tpl.models && tpl.models.length > 0) {
                            const recommended = tpl.models.find(m => m.recommended);
                            state.selected_model = recommended ? recommended.name : tpl.models[0].name;
                        } else {
                            // 针对没有模板但有常用名称的服务
                            const defaultModels = {
                                'deepseek': 'deepseek-chat',
                                'openai': 'gpt-4o-mini',
                                'groq': 'llama-3.1-70b-versatile',
                                'zhipu': 'glm-4-flash',
                                'xflow': 'gpt-4o-mini'
                            };
                            state.selected_model = defaultModels[newProvider] || '';
                        }
                        
                        state.is_custom_model = false;
                        state.is_url_locked = true;
                    }
                    renderForm();
                };
            });

            // URL 锁定切换
            const urlLock = modal.querySelector('#llm-url-lock');
            if (urlLock) {
                urlLock.onclick = () => {
                    state.is_url_locked = !state.is_url_locked;
                    const input = modal.querySelector('#llm-base-url');
                    input.readOnly = state.is_url_locked;
                    if (state.is_url_locked) {
                        input.classList.add('locked');
                        urlLock.innerHTML = Icons.get('lock', '', 14);
                        urlLock.title = lang.t('llm_unlock_url');
                    } else {
                        input.classList.remove('locked');
                        urlLock.innerHTML = Icons.get('unlock', '', 14);
                        urlLock.title = lang.t('llm_lock_url');
                    }
                };
            }

            // Custom model toggle
            const customCheck = modal.querySelector('#llm-custom-check');
            if (customCheck) {
                customCheck.onchange = () => {
                    updateStateFromDOM();
                    state.is_custom_model = customCheck.checked;
                    renderForm();
                };
            }

            // 密码切换
            const pwdToggle = modal.querySelector('.sk-pwd-toggle');
            if (pwdToggle) {
                pwdToggle.onclick = () => {
                    const input = modal.querySelector('#llm-api-key');
                    if (input.type === 'password') {
                        input.type = 'text';
                        pwdToggle.innerHTML = Icons.get('eye_off', '', 14);
                    } else {
                        input.type = 'password';
                        pwdToggle.innerHTML = Icons.get('eye', '', 14);
                    }
                };
            }

            // 刷新模型
            const refreshBtn = modal.querySelector('.sk-llm-refresh-btn');
            if (refreshBtn) {
                refreshBtn.onclick = async () => {
                    updateStateFromDOM();
                    if (!state.base_url) {
                        ToastManager.error(lang.t('llm_base_url_placeholder'));
                        return;
                    }

                    // 如果不是 Ollama，对 API Key 进行基础验证
                    if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) {
                        ToastManager.error(lang.t('llm_api_key_required'));
                        return;
                    }
                    
                    refreshBtn.classList.add('spinning');
                    try {
                        const tempConfig = {
                            provider: state.provider,
                            base_url: state.base_url,
                            api_key: state.api_key
                        };
                        const resp = await api.fetchApi("/sknodes/llm_mgr/test_connection", {
                            method: "POST",
                            body: JSON.stringify({ config: tempConfig })
                        });
                        const res = await resp.json();
                        
                        if (res.status === 'success' && res.models) {
                            // 使用当前提供商的新模型更新模板
                            if (!templates[state.provider]) templates[state.provider] = { base_url: state.base_url, models: [] };
                            templates[state.provider].models = res.models.map(m => ({ name: m, recommended: false }));
                            
                            state.is_custom_model = false;
                            ToastManager.success(lang.t('llm_refresh_success'));
                            renderForm();
                        } else {
                            ToastManager.error(res.message || lang.t('llm_refresh_failed'));
                        }
                    } catch (e) {
                        ToastManager.error(e.message);
                    } finally {
                        refreshBtn.classList.remove('spinning');
                    }
                };
            }

            // Test Connection
            modal.querySelector('#sk-test-conn').onclick = async () => {
                updateStateFromDOM();
                
                // 基础验证
                if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) {
                    ToastManager.error(lang.t('llm_api_key_required'));
                    return;
                }
                if (!state.base_url) {
                    ToastManager.error(lang.t('llm_base_url_required'));
                    return;
                }

                const btn = modal.querySelector('#sk-test-conn');
                const originalText = btn.innerText;
                btn.innerText = lang.t('llm_testing');
                btn.disabled = true;

                try {
                    const resp = await api.fetchApi("/sknodes/llm_mgr/test_connection", {
                        method: "POST",
                        body: JSON.stringify({ config: state })
                    });
                    const res = await resp.json();
                    if (res.status === 'success') {
                        ToastManager.success(lang.t('llm_connection_success'));
                    } else {
                        ToastManager.error(lang.t('llm_connection_failed', [res.message || 'Unknown error']));
                    }
                } catch (e) {
                    ToastManager.error(e.message);
                } finally {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            };

            // 保存
            modal.querySelector('#sk-save-config').onclick = async () => {
                updateStateFromDOM();

                // 智能别名生成：如果别名为空，则自动生成一个
                if (!state.alias || !state.alias.trim()) {
                    const providerName = lang.t('llm_provider_' + state.provider) || state.provider;
                    state.alias = `${providerName} - ${state.selected_model}`;
                }

                // 表单校验
                if (state.provider !== 'ollama' && state.provider !== 'custom' && !state.api_key) {
                    ToastManager.error(lang.t('llm_api_key_required'));
                    return;
                }
                if (!state.base_url) {
                    ToastManager.error(lang.t('llm_base_url_required'));
                    return;
                }
                if (!state.selected_model) {
                    ToastManager.error(lang.t('llm_model_required'));
                    return;
                }

                if (config) {
                    state.id = config.id;
                } else {
                    state.id = Date.now().toString();
                }

                try {
                    await api.fetchApi("/sknodes/llm_mgr/save_config", {
                        method: "POST",
                        body: JSON.stringify({ config: state })
                    });
                    ToastManager.success(lang.t('llm_save_success'));
                    modal.remove();
                    if (onSave) onSave();
                } catch (e) {
                    ToastManager.error(e.message);
                }
            };

            // 初始检查按钮状态
            updateSaveButtonState();
            
            // 绑定输入监听，实现动态按钮状态
            modal.querySelectorAll('input, select').forEach(el => {
                el.addEventListener('input', updateSaveButtonState);
                el.addEventListener('change', updateSaveButtonState);
            });
        };

        renderForm();
        document.body.appendChild(modal);

        // --- Fix: Refresh on Language Change ---
        const refreshEditUI = () => {
            if (!document.contains(modal)) {
                lang.removeLocaleChangeListener(refreshEditUI);
                return;
            }
            updateStateFromDOM();
            renderForm();
        };
        lang.addLocaleChangeListener(refreshEditUI);
    }

}
