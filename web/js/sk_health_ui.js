import { api } from "/scripts/api.js";
import { lang } from "./common/lang.js";
import { Icons } from "./common/icons.js";
import ToastManager from "./common/toast_manager.js";

export class SKHealthUI {
    constructor(mgr) {
        this.mgr = mgr; // Reference to LoraManagerDialog
        this.scanning = false;
        this.minimized = false;
        this.results = { duplicates: [], updates: [] };
        this.ui = null;
        this.minimizedIcon = null;
        this.checkTimer = null;
        this.currentTab = "duplicates"; // duplicates | updates
        
        this.createStyles();

        // 监听语言切换
        lang.addLocaleChangeListener(() => {
            this.refreshLanguage();
        });
    }

    refreshLanguage() {
        if (!this.ui) return;

        // 更新标题
        const titleSpan = this.ui.querySelector(".sk-health-title span");
        if (titleSpan) {
            titleSpan.textContent = `SK LoRA ${lang.t('health_center') || 'Asset Health Center'} `;
        }

        // 更新选项卡
        const tabDuplicates = this.ui.querySelector(".sk-health-tab[data-tab='duplicates']");
        if (tabDuplicates) {
            tabDuplicates.textContent = lang.t('health_tab_duplicates') || 'Duplicates';
        }
        const tabUpdates = this.ui.querySelector(".sk-health-tab[data-tab='updates']");
        if (tabUpdates) {
            tabUpdates.textContent = lang.t('health_tab_updates') || 'Updates';
        }

        // 更新最小化按钮 title
        const minimizeBtn = this.ui.querySelector(".sk-health-btn-minimize");
        if (minimizeBtn) {
            minimizeBtn.title = lang.t('minimize') || 'Minimize';
        }

        // 重新渲染内容以更新列表中的翻译（如果有）
        this.renderContent();
    }

    createStyles() {
        if (document.getElementById("sk-health-style")) return;
        const style = document.createElement("style");
        style.id = "sk-health-style";
        style.textContent = `
            .sk-health-modal { position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:12000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); font-family:'PingFang SC',sans-serif; }
            .sk-health-dialog { width:70%; height:80%; background:#1e293b; border:1px solid #334155; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden; animation:sk-health-fadein 0.3s cubic-bezier(0.16,1,0.3,1); }
            @keyframes sk-health-fadein { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
            .sk-health-header { padding:12px 24px; background:#0f172a; border-bottom:1px solid #334155; display:flex; align-items:center; justify-content:space-between; position:relative; z-index:20; }
            .sk-health-title { display:flex; align-items:center; gap:12px; font-size:16px; font-weight:600; color:#f1f5f9; }
            .sk-health-header-btns { display:flex; align-items:center; gap:8px; }
            .sk-health-header-btn { background:none; border:none; color:#94a3b8; cursor:pointer; font-size:20px; padding:4px; display:flex; align-items:center; justify-content:center; border-radius:4px; transition:all 0.2s; }
            .sk-health-header-btn:hover { background:rgba(255,255,255,0.1); color:#f1f5f9; }
            .sk-health-close { font-size:24px; }
            .sk-health-body { flex:1; overflow:hidden; display:flex; flex-direction:column; background:#0f172a; position:relative; }
            .sk-health-tabs { display:flex; padding:0 24px; background:#0f172a; border-bottom:1px solid #1e293b; }
            .sk-health-tab { padding:12px 20px; color:#94a3b8; cursor:pointer; font-size:14px; position:relative; }
            .sk-health-tab.active { color:#6366f1; font-weight:600; }
            .sk-health-tab.active::after { content:''; position:absolute; bottom:0; left:20px; right:20px; height:2px; background:#6366f1; }
            .sk-health-content { flex:1; overflow-y:auto; padding:24px; }
            .sk-health-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#64748b; gap:16px; }
            .sk-health-empty i { font-size:48px; }
            .sk-health-footer { padding:16px 24px; background:#0f172a; border-top:1px solid #334155; display:flex; justify-content:space-between; align-items:center; }
            .sk-health-footer-left { color:#64748b; font-size:13px; display:flex; align-items:center; gap:8px; }
            .sk-health-summary-count { color:#6366f1; font-weight:600; }
            .sk-health-footer-right { display:flex; align-items:center; gap:12px; }
            .sk-health-btn { display:flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-size:14px; transition:all 0.2s; white-space:nowrap; }
            .sk-health-btn-primary { background:#6366f1; color:white; }
            .sk-health-btn-primary:hover { background:#4f46e5; }
            .sk-health-btn-secondary { background:#334155; color:#cbd5e1; }
            .sk-health-btn-secondary:hover { background:#475569; }
            .sk-health-btn-danger { background:#ef4444; color:white; }
            .sk-health-btn-danger:hover { background:#dc2626; }
            .sk-health-btn-danger.confirming { background:#ef4444; position:relative; overflow:hidden; }
            .sk-health-btn-danger.confirming::after { content:''; position:absolute; bottom:0; left:0; height:3px; background:rgba(255,255,255,0.5); width:100%; animation:sk-health-countdown 3s linear forwards; }
            @keyframes sk-health-countdown { from { width:100%; } to { width:0%; } }
            .sk-health-progress-overlay { position:absolute; inset:0; background:rgba(15,23,42,0.9); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; z-index:10; }
            .sk-health-progress-circle { position:relative; width:120px; height:120px; }
            .sk-health-progress-svg { transform: rotate(-90deg); }
            .sk-health-progress-bg { fill:none; stroke:#1e293b; stroke-width:8; }
            .sk-health-progress-val { fill:none; stroke:#6366f1; stroke-width:8; stroke-linecap:round; transition: stroke-dashoffset 0.3s; }
            .sk-health-progress-text { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:bold; color:white; }
            .sync-minimized-icon.pulse { animation: sk-health-pulse 1s infinite; }
            @keyframes sk-health-pulse { 0% { box-shadow:0 0 0 0 rgba(99,102,241,0.4); } 70% { box-shadow:0 0 0 15px rgba(99,102,241,0); } 100% { box-shadow:0 0 0 0 rgba(99,102,241,0); } }
            .sk-health-list { display:flex; flex-direction:column; gap:20px; }
            .sk-health-group { background:rgba(30,41,59,0.5); border:1px solid #334155; border-radius:12px; overflow:hidden; }
            .sk-health-group-header { padding:10px 16px; background:rgba(15,23,42,0.5); border-bottom:1px solid #334155; display:flex; align-items:center; justify-content:space-between; font-size:13px; color:#94a3b8; }
            .sk-health-hash-badge { background:#334155; color:#cbd5e1; padding:2px 8px; border-radius:4px; font-family:monospace; font-size:12px; border:1px solid #475569; }
            .sk-health-item { display:flex; align-items:center; gap:16px; padding:12px 16px; border-bottom:1px solid #1e293b; transition:all 0.2s; }
            .sk-health-item:last-child { border-bottom:none; }
            .sk-health-item:hover { background:rgba(255,255,255,0.02); }
            .sk-health-item.to-delete { background:rgba(239,68,68,0.1); }
            .sk-health-item.to-delete .sk-health-item-name { text-decoration:line-through; color:#ef4444; }
            .sk-health-checkbox { width:20px; height:20px; border:2px solid #475569; border-radius:4px; cursor:pointer; position:relative; flex-shrink:0; }
            .sk-health-checkbox.checked { background:#ef4444; border-color:#ef4444; }
            .sk-health-checkbox.checked::after { content:'✓'; position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:white; font-size:14px; }
            .sk-health-item-info { flex:1; overflow:hidden; }
            .sk-health-item-name { font-weight:500; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .sk-health-item-path { font-size:12px; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .sk-health-item-meta { display:flex; gap:12px; font-size:11px; color:#475569; margin-top:4px; }
            .sk-health-badge { padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; line-height:1.4; display:inline-flex; align-items:center; }
            .sk-health-badge-new { background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); margin-left:8px; }
            .sk-health-ignore-btn { font-size:12px; color:#64748b; cursor:pointer; text-decoration:underline; transition:color 0.2s; }
            .sk-health-ignore-btn:hover { color:#94a3b8; }
        `;
        document.head.appendChild(style);
    }

    show() {
        if (this.ui) {
            this.ui.style.display = "flex";
            return;
        }

        this.ui = document.createElement("div");
        this.ui.className = "sk-health-modal";
        this.ui.innerHTML = `
            <div class="sk-health-dialog">
                <div class="sk-health-header">
                    <div class="sk-health-title">
                        <span style="color:#6366f1; display:flex;">${Icons.get('shield', '', 20)}</span>
                        <span>SK LoRA ${lang.t('health_center') || 'Asset Health Center'} </span>
                    </div>
                    <div class="sk-health-header-btns">
                        <button class="sk-health-header-btn sk-health-btn-minimize" title="${lang.t('minimize') || 'Minimize'}">
                            ${Icons.get('minimize', '', 18)}
                        </button>
                        <button class="sk-health-header-btn sk-health-close">${Icons.get('x', '', 24)}</button>
                    </div>
                </div>
                <div class="sk-health-body">
                    <div class="sk-health-tabs">
                        <div class="sk-health-tab active" data-tab="duplicates">${lang.t('health_tab_duplicates') || 'Duplicates'}</div>
                        <div class="sk-health-tab" data-tab="updates">${lang.t('health_tab_updates') || 'Updates'}</div>
                    </div>
                    <div class="sk-health-content">
                        <div class="sk-health-empty">
                            ${Icons.get('search', '', 48)}
                            <span>${lang.t('health_click_scan') || 'Click scan to start analysis'}</span>
                            <button class="sk-health-btn sk-health-btn-primary sk-health-btn-scan" style="margin-top:10px">
                                ${Icons.get('zap', '', 14)} ${lang.t('health_start_scan') || 'Start Scan'}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="sk-health-footer">
                    <div class="sk-health-footer-left"></div>
                    <div class="sk-health-footer-right">
                        <button class="sk-health-btn sk-health-btn-primary sk-health-btn-scan">
                            ${Icons.get('zap', '', 14)} ${lang.t('health_start_scan') || 'Start Scan'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.ui);
        this.initEvents();
        this.restoreState();
        this.renderContent();
    }

    initEvents() {
        this.ui.querySelector(".sk-health-close").onclick = () => this.hide();
        this.ui.querySelector(".sk-health-btn-scan").onclick = () => this.startScan();
        this.ui.querySelector(".sk-health-btn-minimize").onclick = () => this.minimizeUI();
        
        this.ui.querySelectorAll(".sk-health-tab").forEach(tab => {
            tab.onclick = () => {
                if (this.scanning) return;
                this.currentTab = tab.dataset.tab;
                this.ui.querySelectorAll(".sk-health-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                this.renderContent();
            };
        });
    }

    hide() {
        if (this.scanning) {
            this.minimizeUI();
            return;
        }
        if (this.ui) {
            this.ui.style.display = "none";
            // 彻底销毁数据（只有在手动点击关闭且不在扫描时调用）
            this.results = { duplicates: [], updates: [] };
            this.renderContent();
        }
    }

    async startScan() {
        if (this.scanning) return;
        this.scanning = true;
        
        // 禁用相关按钮
        this.toggleButtons(true);
        
        // 开始扫描前只清空当前 Tab 的旧结果，保留另一 Tab 的结果
        if (this.currentTab === "duplicates") {
            this.results.duplicates = [];
        } else {
            this.results.updates = [];
        }
        
        this.renderProgress(0, lang.t('preparing') || 'Preparing...');
        
        try {
            const resp = await api.fetchApi("/api/lora_manager/health_scan", {
                method: "POST",
                body: JSON.stringify({ type: this.currentTab })
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Server error: ${resp.status} ${text}`);
            }
            const data = await resp.json();
            if (data.status === "started") {
                this.startMonitoring();
            } else {
                throw new Error(data.message || "Failed to start scan task");
            }
        } catch (e) {
            this.scanning = false;
            ToastManager.error("Scan failed: " + e.message);
        }
    }

    startMonitoring() {
        if (this.checkTimer) clearInterval(this.checkTimer);
        this.checkTimer = setInterval(async () => {
            try {
                const resp = await api.fetchApi("/api/lora_manager/health_status");
                if (!resp.ok) return;
                const status = await resp.json();
                
                if (status.status === "running") {
                    this.renderProgress(status.progress, status.message);
                } else if (status.status === "completed") {
                    this.finishScan(status.result);
                } else if (status.status === "error") {
                    this.errorScan(status.message);
                }
            } catch (e) {
                console.error("[SK-LoRA] [Health] 状态检查失败:", e);
            }
        }, 400); // 缩短轮询间隔，让进度显示更平滑
    }

    renderProgress(percent, message) {
        let overlay = this.ui.querySelector(".sk-health-progress-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "sk-health-progress-overlay";
            // 移出 dialog，直接挂在 body 上，这样最小化后依然可以看到进度
            // 修正：挂在 body 但设置 z-index 略低于 header，或者挂在 body 但只在非最小化时显示
            this.ui.querySelector(".sk-health-body").appendChild(overlay);
        }
        
        // 如果已最小化，更新最小化图标的进度
        if (this.minimized && this.minimizedIcon) {
            const miniText = this.minimizedIcon.querySelector(".sync-mini-text");
            if (miniText) miniText.innerText = percent + "%";
        }

        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;

        overlay.innerHTML = `
            <div class="sk-health-progress-circle">
                <svg class="sk-health-progress-svg" width="120" height="120">
                    <circle class="sk-health-progress-bg" cx="60" cy="60" r="${radius}"></circle>
                    <circle class="sk-health-progress-val" cx="60" cy="60" r="${radius}" 
                        style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}"></circle>
                </svg>
                <div class="sk-health-progress-text">${percent}%</div>
            </div>
            <div style="color:#94a3b8;font-size:14px">${message}</div>
            <button class="sk-health-btn sk-health-btn-secondary sk-health-btn-cancel-scan">
                ${lang.t('cancel') || 'Cancel'}
            </button>
        `;

        overlay.querySelector(".sk-health-btn-cancel-scan").onclick = () => this.cancelScan();
    }

    async cancelScan() {
        try {
            await api.fetchApi("/api/lora_manager/health_cancel", { method: "POST" });
            this.scanning = false;
            clearInterval(this.checkTimer);
            this.toggleButtons(false);
            const overlay = this.ui.querySelector(".sk-health-progress-overlay");
            if (overlay) overlay.remove();
            this.renderContent();
        } catch (e) {
            console.error("[SK-LoRA] [Health] 取消失败:", e);
        }
    }

    async finishScan(result) {
        this.scanning = false;
        clearInterval(this.checkTimer);
        this.toggleButtons(false);
        
        // 如果是删除任务，更新本地结果列表
        if (result && result.success && Array.isArray(result.success)) {
            const deletedPaths = new Set(result.success);
            if (this.results && this.results.duplicates) {
                this.results.duplicates = this.results.duplicates.map(group => {
                    return {
                        ...group,
                        items: group.items.filter(item => !deletedPaths.has(item.path))
                    };
                }).filter(group => group.items.length > 1); // 如果组内只剩一个或没有，则移除该组
            }
            const successMsg = lang.t('health_delete_success', [result.success.length]);
            const backupTip = lang.t('health_auto_backup_tip') || '';
            ToastManager.success(successMsg + (backupTip ? ' ' + backupTip : ''));
        } else if (result) {
            // 合并扫描结果
            if (result.scan_type === "duplicates") {
                this.results.duplicates = result.duplicates || [];
            } else if (result.scan_type === "updates") {
                this.results.updates = result.updates || [];
            } else {
                // 全量扫描
                this.results = {
                    duplicates: result.duplicates || [],
                    updates: result.updates || []
                };
            }
            ToastManager.success(lang.t('health_scan_complete') || 'Scan Complete');
        }

        const overlay = this.ui.querySelector(".sk-health-progress-overlay");
        if (overlay) overlay.remove();

        if (this.minimized) {
            this.restoreUI();
            this.minimizedIcon.classList.add("pulse");
            setTimeout(() => this.minimizedIcon.classList.remove("pulse"), 3000);
        }

        this.renderContent();
        
        // 无感刷新：如果扫描出了新东西，或者修复了旧东西，刷新主界面
        if (this.mgr && this.mgr.refresh) {
            await this.mgr.refresh();
            if (this.mgr.calculateAndSaveStatistics) {
                await this.mgr.calculateAndSaveStatistics();
            }
        }
    }

    errorScan(msg) {
        this.scanning = false;
        clearInterval(this.checkTimer);
        this.toggleButtons(false);
        const overlay = this.ui.querySelector(".sk-health-progress-overlay");
        if (overlay) overlay.remove();
        ToastManager.error("Scan Error: " + msg);
        if (this.minimized) this.restoreUI();
    }

    minimizeUI() {
        this.minimized = true;
        this.ui.style.display = "none";
        
        if (!this.minimizedIcon) {
            this.minimizedIcon = document.createElement("div");
            this.minimizedIcon.className = "sync-minimized-icon";
            document.body.appendChild(this.minimizedIcon);
            this.minimizedIcon.onclick = () => this.restoreUI();
        }
        
        this.minimizedIcon.style.display = "flex";
        const percent = this.scanning ? (this.ui.querySelector(".sk-health-progress-text")?.innerText.replace('%','') || 0) : 100;

        this.minimizedIcon.innerHTML = `
            <div class="sync-mini-spinner"></div>
            <div class="sync-mini-text">${percent}%</div>
        `;
    }

    restoreUI() {
        this.minimized = false;
        if (this.minimizedIcon) {
            this.minimizedIcon.style.display = "none";
            this.minimizedIcon.classList.remove("pulse");
        }
        this.ui.style.display = "flex";
    }

    renderContent() {
        const content = this.ui.querySelector(".sk-health-content");
        const footerLeft = this.ui.querySelector(".sk-health-footer-left");
        const footerRight = this.ui.querySelector(".sk-health-footer-right");

        const isUpdateCheckDisabled = this.currentTab === "updates" && this.mgr.localSettings.check_update === false;

        // 汇总统计
        if (this.currentTab === "updates" && this.results.updates.length > 0) {
            const count = this.results.updates.length;
            footerLeft.innerHTML = `
                ${Icons.get('info', '', 14)}
                <span>${lang.t('health_found_updates') || 'Found'} <span class="sk-health-summary-count">${count}</span> ${lang.t('health_new_versions') || 'new versions'}</span>
            `;
        } else if (this.currentTab === "duplicates" && this.results.duplicates.length > 0) {
            const groupCount = this.results.duplicates.length;
            const fileCount = this.results.duplicates.reduce((acc, g) => acc + g.items.length, 0);
            footerLeft.innerHTML = `
                ${Icons.get('info', '', 14)}
                <span>${lang.t('health_found_duplicates') || 'Found'} <span class="sk-health-summary-count">${groupCount}</span> ${lang.t('health_duplicate_groups') || 'groups'} (${fileCount} ${lang.t('health_files') || 'files'})</span>
            `;
        } else {
            footerLeft.innerHTML = '';
        }
        
        // 根据 Tab 显示不同的扫描按钮文本
        const scanText = this.currentTab === "duplicates" 
            ? (lang.t('health_scan_duplicates') || 'Scan Duplicates')
            : (lang.t('health_scan_updates') || 'Scan Updates');

        const disabledAttr = isUpdateCheckDisabled ? 'disabled' : '';
        const titleAttr = isUpdateCheckDisabled ? `title="${lang.t('health_need_check_update')}"` : '';
        const opacityStyle = isUpdateCheckDisabled ? 'style="opacity: 0.5; cursor: not-allowed;"' : '';

        footerRight.innerHTML = `
            <button class="sk-health-btn sk-health-btn-primary sk-health-btn-scan" ${disabledAttr} ${titleAttr} ${opacityStyle}>
                ${Icons.get('zap', '', 14)} ${scanText}
            </button>
        `;
        if (!isUpdateCheckDisabled) {
            footerRight.querySelector(".sk-health-btn-scan").onclick = () => this.startScan();
        }

        // 检查当前 Tab 是否有结果
        const hasResults = (this.currentTab === "duplicates" && this.results.duplicates.length > 0) ||
                           (this.currentTab === "updates" && this.results.updates.length > 0);

        if (!hasResults) {
            let emptyMsg = lang.t('health_click_scan') || 'Click scan to start analysis';
            let emptyIconName = 'search';
            
            if (isUpdateCheckDisabled) {
                emptyMsg = `<span style="color: #ef4444;">${lang.t('health_need_check_update')}</span>`;
                emptyIconName = 'alert_triangle';
            }

            content.innerHTML = `
                <div class="sk-health-empty">
                    ${Icons.get(emptyIconName, '', 48)}
                    <span>${emptyMsg}</span>
                </div>
            `;
            return;
        }

        if (this.currentTab === "duplicates") {
            this.renderDuplicates(content);
        } else {
            this.renderUpdates(content);
        }
    }

    renderDuplicates(container) {
        const dups = this.results.duplicates || [];
        if (dups.length === 0) {
            container.innerHTML = `<div class="sk-health-empty">${Icons.get('check', '', 48)}<span>${lang.t('health_no_duplicates') || 'No duplicate items found'}</span></div>`;
            return;
        }

        let html = `<div class="sk-health-list">`;
        dups.forEach((group, gIdx) => {
            html += `
                <div class="sk-health-group">
                    <div class="sk-health-group-header">
                        <div class="sk-health-hash-badge">HASH: ${group.hash}</div>
                        <span>${group.items.length} ${lang.t('health_files') || 'files'}</span>
                    </div>
                    ${group.items.map((item, iIdx) => `
                        <div class="sk-health-item" data-path="${item.path}">
                            <div class="sk-health-checkbox" data-g="${gIdx}" data-i="${iIdx}"></div>
                            <div class="sk-health-item-info">
                                <div class="sk-health-item-name">${item.name}</div>
                                <div class="sk-health-item-path">${item.path}</div>
                                <div class="sk-health-item-meta">
                                    <span>${(item.size / 1024 / 1024).toFixed(2)} MB</span>
                                    <span>${new Date(item.mtime * 1000).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        });
        html += `</div>`;
        
        container.innerHTML = html;
        
        // Footer buttons
        const footerLeft = this.ui.querySelector(".sk-health-footer-left");
        footerLeft.innerHTML = `
            <label class="sk-health-empty-folder-fix" style="display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:13px;cursor:pointer">
                <input type="checkbox" class="sk-health-empty-folder-checkbox" style="width:16px;height:16px;cursor:pointer">
                ${lang.t('health_empty_folder_fix') || 'Delete empty folders'}
            </label>
        `;

        const footerRight = this.ui.querySelector(".sk-health-footer-right");
        const scanText = lang.t('health_scan_duplicates') || 'Scan Duplicates';

        footerRight.innerHTML = `
            <button class="sk-health-btn sk-health-btn-danger sk-health-btn-delete-dups">
                ${Icons.get('trash', '', 14)} ${lang.t('health_delete_selected') || 'Delete Selected'}
            </button>
            <button class="sk-health-btn sk-health-btn-secondary sk-health-btn-scan">
                ${Icons.get('refresh', '', 14)} ${scanText}
            </button>
        `;
        
        const deleteBtn = footerRight.querySelector(".sk-health-btn-delete-dups");
        deleteBtn.onclick = () => this.confirmDelete(deleteBtn);
        footerRight.querySelector(".sk-health-btn-scan").onclick = () => this.startScan();

        // Checkbox events
        container.querySelectorAll(".sk-health-checkbox").forEach(cb => {
            cb.onclick = () => {
                cb.classList.toggle("checked");
                cb.closest(".sk-health-item").classList.toggle("to-delete");
            };
        });
    }

    renderUpdates(container) {
        const updates = this.results.updates || [];
        if (updates.length === 0) {
            container.innerHTML = `<div class="sk-health-empty">${Icons.get('check', '', 48)}<span>${lang.t('health_no_updates') || 'All models are up to date'}</span></div>`;
            return;
        }

        let html = `<div class="sk-health-list">`;
        updates.forEach(item => {
            html += `
                <div class="sk-health-group">
                    <div class="sk-health-item">
                        <div class="sk-health-item-info">
                            <div class="sk-health-item-name">
                                ${item.name}
                                <span class="sk-health-badge sk-health-badge-new">NEW: ${item.new_version_name}</span>
                            </div>
                            <div class="sk-health-item-path">${item.path}</div>
                            <div class="sk-health-item-meta">
                                <a href="https://civitai.red/models/${item.civitai_model_id}" target="_blank" style="color:#6366f1;text-decoration:none">
                                    ${Icons.get('link', '', 12)} Civitai
                                </a>
                                <span class="sk-health-ignore-btn" data-path="${item.path}" data-version="${item.new_version}">${lang.t('health_ignore_update') || 'Ignore'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;

        // Footer for updates
        const footerRight = this.ui.querySelector(".sk-health-footer-right");
        const scanText = lang.t('health_scan_updates') || 'Scan Updates';
        const isUpdateCheckDisabled = this.mgr.localSettings.check_update === false;
        const disabledAttr = isUpdateCheckDisabled ? 'disabled' : '';
        const titleAttr = isUpdateCheckDisabled ? `title="${lang.t('health_need_check_update')}"` : '';
        const opacityStyle = isUpdateCheckDisabled ? 'style="opacity: 0.5; cursor: not-allowed;"' : '';

        footerRight.innerHTML = `
            <button class="sk-health-btn sk-health-btn-secondary sk-health-btn-rescan" ${disabledAttr} ${titleAttr} ${opacityStyle}>
                ${Icons.get('refresh', '', 14)} ${scanText}
            </button>
        `;
        if (!isUpdateCheckDisabled) {
            footerRight.querySelector(".sk-health-btn-rescan").onclick = () => this.startScan();
        }

        container.querySelectorAll(".sk-health-ignore-btn").forEach(btn => {
            btn.onclick = () => this.ignoreUpdate(btn.dataset.path, btn.dataset.version);
        });
    }

    async ignoreUpdate(path, versionId) {
        if (!path) return;
        try {
            const resp = await api.fetchApi("/api/lora_manager/health_ignore_update", {
                method: "POST",
                body: JSON.stringify({ path, version_id: versionId })
            });
            if (resp.ok) {
                // 更新本地结果
                this.results.updates = this.results.updates.filter(u => u.path !== path);
                this.renderContent();
                ToastManager.success(lang.t('save_success') || 'Saved successfully');
                
                // 无感刷新主界面，同步角标状态
                if (this.mgr && this.mgr.refresh) {
                    this.mgr.refresh();
                }
            }
        } catch (e) {
            console.error("[SK-LoRA] [Health] 忽略更新失败:", e);
        }
    }

    resetDeleteBtn(btn, originalHtml) {
        if (this.confirmTimer) {
            clearInterval(this.confirmTimer);
            this.confirmTimer = null;
        }
        btn.classList.remove("confirming");
        if (originalHtml) {
            btn.innerHTML = originalHtml;
        } else {
            btn.innerHTML = `${Icons.get('trash', '', 14)} ${lang.t('health_delete_selected') || 'Delete Selected'}`;
        }
    }

    async confirmDelete(btn) {
        const selected = Array.from(this.ui.querySelectorAll(".sk-health-item.to-delete")).map(el => el.dataset.path);
        if (selected.length === 0) return;

        if (!btn.classList.contains("confirming")) {
            btn.classList.add("confirming");
            const originalHtml = btn.innerHTML;
            let count = 3;
            btn.innerHTML = `${Icons.get('alert_triangle', '', 14)} ${lang.t('health_click_to_confirm') || 'Confirm?'} (${count}s)`;
            
            this.confirmTimer = setInterval(() => {
                count--;
                if (count > 0) {
                    btn.innerHTML = `${Icons.get('alert_triangle', '', 14)} ${lang.t('health_click_to_confirm') || 'Confirm?'} (${count}s)`;
                } else {
                    this.resetDeleteBtn(btn, originalHtml);
                }
            }, 1000);
            return;
        }

        // 确认删除逻辑
        this.resetDeleteBtn(btn);
        const delete_empty_folders = this.ui.querySelector(".sk-health-empty-folder-checkbox")?.checked || false;

        this.scanning = true;
        this.toggleButtons(true);
        this.renderProgress(0, lang.t('health_deleting') || 'Deleting...');
        
        try {
            const resp = await api.fetchApi("/api/lora_manager/health_fix", {
                method: "POST",
                body: JSON.stringify({ items: selected, delete_empty_folders })
            });
            const data = await resp.json();
            if (data.status === "started") {
                this.startMonitoring();
            } else {
                throw new Error(data.message || "Failed to start deletion task");
            }
        } catch (e) {
            this.errorScan(e.message);
        }
    }

    toggleButtons(disabled) {
        // 1. 禁用健康中心内部的扫描按钮
        const scanBtn = this.ui.querySelector(".sk-health-btn-scan");
        const rescanBtn = this.ui.querySelector(".sk-health-btn-rescan");
        const deleteBtn = this.ui.querySelector(".sk-health-btn-delete");
        
        [scanBtn, rescanBtn, deleteBtn].forEach(btn => {
            if (btn) {
                btn.disabled = disabled;
                btn.style.opacity = disabled ? "0.5" : "1";
                btn.style.cursor = disabled ? "not-allowed" : "pointer";
            }
        });

        // 2. 禁用主面板上的“同步本地”和“同步C站”按钮
        // 匹配用户指定的 btn-sync btn-local 和 btn-sync btn-civit 类
        if (this.mgr && this.mgr.uiRoot) {
            const syncLocalBtn = this.mgr.uiRoot.querySelector(".btn-sync.btn-local");
            const syncCivitaiBtn = this.mgr.uiRoot.querySelector(".btn-sync.btn-civit");
            
            [syncLocalBtn, syncCivitaiBtn].forEach(btn => {
                if (btn) {
                    btn.disabled = disabled;
                    btn.style.opacity = disabled ? "0.5" : "1";
                    btn.style.cursor = disabled ? "not-allowed" : "pointer";
                    // 如果正在扫描，增加一个提示
                    btn.title = disabled ? (lang.t('health_scanning_busy') || 'System busy, scanning...') : '';
                }
            });
        }
    }

    restoreState() {
        // Check if a scan is already running on load
         api.fetchApi("/api/lora_manager/health_status").then(async r => {
             if (r.ok) {
                 const s = await r.json();
                 if (s.status === 'running') {
                     this.scanning = true;
                     this.toggleButtons(true);
                     this.currentTab = s.type === 'update_check' ? 'updates' : 'duplicates';
                     // Update tab UI
                     this.ui.querySelectorAll(".sk-health-tab").forEach(t => {
                        t.classList.toggle("active", t.dataset.tab === this.currentTab);
                     });
                     this.startMonitoring(); // Resume monitoring
                 }
             }
         }).catch(()=>{});
    }
}
