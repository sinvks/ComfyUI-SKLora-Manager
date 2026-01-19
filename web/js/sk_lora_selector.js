import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { lang } from "./common/lang.js";
import { Icons } from "./common/icons.js";

/**
 * SK Lora Selector - 单例模式选择器组件
 * 专为 ComfyUI Nodes 2.0 设计，支持全屏/迷你两种视图模式
 */
export class SKLoraSelector {
    static instance = null;

    static getInstance() {
        if (!SKLoraSelector.instance) {
            new SKLoraSelector();
        }
        return SKLoraSelector.instance;
    }

    constructor() {
        if (SKLoraSelector.instance) {
            return SKLoraSelector.instance;
        }
        SKLoraSelector.instance = this;
        
        this.dialog = null;
        this.callback = null;
        this.currentMode = 'full'; // 'full' | 'mini'
        
        this.allData = [];       // 所有原始数据
        this.processedData = []; // 处理后的分类数据
        this.categories = new Set([lang.t("sel_all"), 'Favorites', 'Recent']);
        
        // 多选状态存储 Map<path, item>
        this.selectedItems = new Map();

        this.localSettings = {
            nsfw_img_mode: "blur",
            nsfw_allow_level: 1
        };

        this.defaultImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='36' viewBox='0 0 24 36' fill='none' stroke='%23444' stroke-width='1'%3E%3Crect width='18' height='18' x='3' y='9' rx='2'/%3E%3Ccircle cx='9' cy='15' r='2'/%3E%3Cpath d='m21 21-3-3a2 2 0 0 0-2 0L6 27'/%3E%3C/svg%3E";

        this.pageSize = 1000;    // 每页渲染数量 (增加以支持显示全部)
        this.currentPage = 1;    // 当前页码
        this.isLoadingMore = false;
        
        this.injectStyles();
        this.createDialog();
    }

    /**
     * 注入全局 CSS 变量与样式体系
     */
    injectStyles() {
        const styleId = 'sk-lora-selector-styles';
        if (document.getElementById(styleId)) return;

        const css = `
            :root { /* 主题色系 - 基于 #6366f1 */ --sk-primary: #6366f1; --sk-primary-hover: #4f46e5; --sk-primary-light: #818cf8; /* 暗黑工业风背景体系 */ --sk-bg-overlay: rgba(15, 23, 42, 0.85); /* Slate 900 with opacity */ --sk-bg-panel: #1e293b; /* Slate 800 */ --sk-bg-card: #334155;  /* Slate 700 */ --sk-bg-input: #0f172a; /* Slate 900 */ /* 文字颜色 */ --sk-text-main: #f8fafc; /* Slate 50 */ --sk-text-muted: #94a3b8; /* Slate 400 */ /* 边框与阴影 */ --sk-border: #475569; /* Slate 600 */ --sk-radius-lg: 12px; --sk-radius-md: 8px; --sk-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5); --sk-shadow-glow: 0 0 15px rgba(99, 102, 241, 0.3); /* 动画 */ --sk-ease-out: cubic-bezier(0.16, 1, 0.3, 1); }

            .sk-nsfw-blur { filter: blur(40px) brightness(0.6); transition: all 0.4s ease; }
            .sk-nsfw-hidden { opacity: 0; transition: all 0.4s ease; }
            .sk-card-image-wrapper { overflow: hidden; }

            /* 基础 Dialog 重置 */
            .sk-lora-dialog { border: 0 !important; padding: 0 !important; background: none !important; background-color: transparent !important; color: var(--sk-text-main); font-family: 'Segoe UI', Roboto, Helvetica, sans-serif; z-index: 10001; overflow: visible !important; outline: none !important; appearance: none; -webkit-appearance: none; box-shadow: none !important; max-width: none; max-height: none; margin: 0; }
            /* 强制提升 Toast z-index 以确保在 Dialog 之上 */
            .toast-container { z-index: 20000 !important; }

            .sk-lora-dialog:focus, .sk-lora-dialog:focus-visible, .sk-lora-dialog:active { outline: none !important; border: none !important; box-shadow: none !important; }

            /* 自定义 Backdrop */
            .sk-dialog-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: var(--sk-bg-overlay); backdrop-filter: blur(4px); z-index: 10000; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
            .sk-dialog-backdrop.visible { opacity: 1; pointer-events: auto; }

            /* 核心容器 */
            .sk-selector-container { background: var(--sk-bg-panel); border: 1px solid var(--sk-border); border-radius: var(--sk-radius-lg); box-shadow: var(--sk-shadow-xl); display: flex; flex-direction: column; overflow: hidden; transition: all 0.4s var(--sk-ease-out); box-sizing: border-box; position: relative; /* 确保子元素正确定位 */ }
            .sk-selector-container * { box-sizing: border-box; }

            /* --- 视图模式: Full (点选模式) --- */
            .sk-lora-dialog[data-mode="full"] { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 85vw; height: 85vh; max-width: 1400px; max-height: 900px; /* 稍微减小最大高度 */ margin: 0; /* 确保没有默认 margin */ border-radius: 0 !important; /* 彻底清除圆角，防止产生黑边 */ background: transparent !important; box-shadow: none !important; }
            .sk-lora-dialog[data-mode="full"] .sk-selector-container { width: 100%; height: 100%; }
            /* Full 模式下强制隐藏调整大小手柄 */
            .sk-lora-dialog[data-mode="full"] .sk-resize-handle { display: none !important; }

            /* --- 视图模式: Mini (拖拽模式) --- */
            .sk-lora-dialog[data-mode="mini"] { position: fixed; top: 80px; right: 20px; width: 340px; height: 650px; min-width: 340px; min-height: 650px; margin: 0; transform: none; left: auto; bottom: auto; pointer-events: none; /* 关键：允许点击背后画布 */ background: transparent; border: none; box-shadow: none; }
            .sk-lora-dialog[data-mode="mini"] .sk-selector-container { pointer-events: auto; height: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-left: 4px solid var(--sk-primary); position: relative; }

            /* 拖拽手柄样式 */
            .sk-resize-handle { position: absolute; width: 16px; height: 16px; z-index: 20; display: none; /* 默认隐藏，仅在 mini 模式显示 */ }
            .sk-lora-dialog[data-mode="mini"] .sk-resize-handle { display: block; }
            .sk-resize-sw { bottom: 0; left: 0; cursor: sw-resize; }
            .sk-resize-se { bottom: 0; right: 0; cursor: se-resize; }
            /* 可视化手柄角落 */
            .sk-resize-corner { position: absolute; width: 0; height: 0; border-style: solid; opacity: 0.5; pointer-events: none; }
            .sk-resize-sw .sk-resize-corner { bottom: 2px; left: 2px; border-width: 8px 0 0 8px; border-color: transparent transparent transparent var(--sk-text-muted); }
            .sk-resize-se .sk-resize-corner { bottom: 2px; right: 2px; border-width: 0 0 8px 8px; border-color: transparent transparent var(--sk-text-muted) transparent; }

            /* 头部区域 */
            .sk-selector-header { padding: 16px 20px; background: rgba(15, 23, 42, 0.4); border-bottom: 1px solid var(--sk-border); display: flex; justify-content: space-between; align-items: center; user-select: none; border-top-left-radius: var(--sk-radius-lg); border-top-right-radius: var(--sk-radius-lg); }
            .sk-lora-dialog[data-mode="mini"] .sk-selector-header { cursor: grab; }
            .sk-lora-dialog[data-mode="mini"] .sk-selector-header:active { cursor: grabbing; }
            .sk-selector-title { font-size: 1.1rem; font-weight: 700; color: var(--sk-primary); display: flex; align-items: center; gap: 8px; }
            .sk-header-controls { display: flex; gap: 8px; }

            /* 内容区域 */
            .sk-selector-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; /* 由内部 grid 处理滚动 */ background: linear-gradient(to bottom, var(--sk-bg-panel), var(--sk-bg-input)); min-height: 0; /* 重要：允许 flex 子项正确计算高度 */ /* Scrollbar styling */ scrollbar-width: thin; scrollbar-color: var(--sk-border) transparent; }

            /* 骨架屏动画 */
            @keyframes sk-skeleton-loading { 0% { background-color: rgba(255, 255, 255, 0.05); } 50% { background-color: rgba(255, 255, 255, 0.1); } 100% { background-color: rgba(255, 255, 255, 0.05); } }
            .sk-skeleton { animation: sk-skeleton-loading 1.5s infinite ease-in-out; }
            .sk-card-thumb.sk-skeleton { background-color: var(--sk-bg-input); border-radius: 4px; }

            .sk-selector-content::-webkit-scrollbar { width: 8px; }
            .sk-selector-content::-webkit-scrollbar-track { background: transparent; }
            .sk-selector-content::-webkit-scrollbar-thumb { background-color: var(--sk-border); border-radius: 4px; }

            /* 网格布局 */
            .sk-card-grid { display: grid; gap: 20px; /* 稍微增加间距 */ grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); grid-auto-rows: max-content; /* 确保行高由内容决定 */ align-content: start; align-items: stretch; /* 恢复 stretch 以确保卡片高度一致 */ padding: 20px; overflow-y: auto; flex: 1; }
            /* Mini 模式下的网格调整：固定卡片大小，自适应列数 (适用于所有方案) */
            .sk-lora-dialog[data-mode="mini"] .sk-card-grid, .sk-lora-dialog[data-mode="mini"] .sk-scheme3-grid { gap: 12px; padding: 12px; /* 固定列宽，允许自动换行，但不伸缩卡片宽度 */ grid-template-columns: repeat(auto-fill, 140px); justify-content: center; /* 居中对齐 */ display: grid; }

            /* 卡片样式 */
            .sk-lora-card { background: var(--sk-bg-card); border: 1px solid var(--sk-border); border-radius: var(--sk-radius-md); cursor: pointer; position: relative; overflow: hidden; transition: all 0.2s; display: flex; flex-direction: column; flex-shrink: 0; height: 100%; /* 在 grid 中占满行高 */ min-height: min-content; /* 确保不被压缩 */ }
            .sk-lora-card:hover { border-color: var(--sk-primary); transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.4); z-index: 10; /* 悬停时置顶，防止被下一行覆盖 */ }
            .sk-lora-card.selected { border-color: var(--sk-primary); background: rgba(99, 102, 241, 0.1); }
            .sk-card-thumb { width: 100%; aspect-ratio: 2/3; min-height: 120px; /* 增加最小高度防止塌陷 */ background: var(--sk-bg-input); border-radius: 4px; object-fit: cover; display: block; flex-shrink: 0; /* 关键：防止图片高度被压缩 */ }
            .sk-card-name { font-size: 0.9rem; font-weight: 600; color: var(--sk-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            /* 底部区域 */
            .sk-selector-footer { padding: 16px; background: var(--sk-bg-panel); border-top: 1px solid var(--sk-border); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: var(--sk-radius-lg); border-bottom-right-radius: var(--sk-radius-lg); }

            /* 按钮样式 */
            .sk-btn { background: var(--sk-primary); color: white; border: none; padding: 8px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
            /* 隐藏确认按钮 - 预留后续启用 */
            #sk-confirm-btn { display: none !important; }
            .sk-btn:hover { background: var(--sk-primary-hover); }
            .sk-input { background: #0F172A; border: 1px solid var(--sk-border); color: var(--sk-text-main); padding: 10px 18px; border-radius: 24px; /* 两端半圆形 */ outline: none; transition: all 0.2s; font-size: 0.9rem; box-sizing: border-box; width: 100%; }
            .sk-input:focus { border-color: var(--sk-primary); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
            .sk-search-bar { margin-bottom: 16px; position: relative; padding: 0 20px; /* 增加侧边边距以对齐网格 */ }
            .sk-btn-ghost { background: transparent; border: 1px solid var(--sk-border); color: var(--sk-text-muted); padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
            .sk-btn-ghost:hover { background: rgba(255,255,255,0.05); color: var(--sk-text-main); border-color: var(--sk-text-muted); }

            /* --- 侧边抽屉式布局 (Scheme 1) --- */
            .sk-scheme1-container { display: flex; flex-direction: row; /* 强制水平排列：侧边栏 + 主内容 */ height: 100%; overflow: hidden; }
            /* 左侧导航栏 */
            .sk-nav-sidebar { width: 260px; background: var(--sk-bg-input); border-right: 1px solid var(--sk-border); display: flex; flex-direction: column; transition: width 0.3s var(--sk-ease-out), opacity 0.3s ease; flex-shrink: 0; height: 100%; /* 确保撑满 */ }
            /* 右侧主内容区 */
            .sk-main-content { flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--sk-bg-panel); min-width: 0; /* 防止 grid 溢出 */ min-height: 0; /* 重要：允许 flex 子项正确计算高度 */ }
            .sk-scheme1-header { padding: 16px 20px; background: rgba(15, 23, 42, 0.4); border-bottom: 1px solid var(--sk-border); display: flex; gap: 12px; align-items: center; flex-shrink: 0; }
            /* 网格列表滚动容器 - 统一使用 .sk-card-grid */
            .sk-main-content #sk-lora-list { flex: 1; overflow-y: auto; }
            /* Mini 模式下隐藏侧边栏 */
            .sk-lora-dialog[data-mode="mini"] .sk-nav-sidebar { width: 0; opacity: 0; pointer-events: none; border: none; }
            /* 导航图标组 */
            .sk-nav-group { padding: 10px 12px; border-bottom: 1px solid var(--sk-border); }
            .sk-nav-item { display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--sk-text-muted); transition: all 0.2s; margin-bottom: 2px; font-size: 0.9rem; }
            .sk-nav-item:hover { background: rgba(255,255,255,0.05); color: var(--sk-text-main); }
            .sk-nav-item.active { background: var(--sk-primary); color: white; }
            .sk-nav-icon { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            /* 目录树区域 */
            .sk-folder-tree { flex: 1; overflow-y: auto; padding: 12px; }
            .sk-tree-node { margin-left: 12px; border-left: 1px solid rgba(255,255,255,0.1); }
            .sk-tree-label { padding: 6px 8px; cursor: pointer; color: var(--sk-text-muted); display: flex; align-items: center; gap: 6px; border-radius: 4px; font-size: 0.9rem; }
            .sk-tree-label:hover { color: var(--sk-text-main); background: rgba(255,255,255,0.03); }
            .sk-tree-label.active { color: var(--sk-primary-light); font-weight: 600; }
            .sk-lora-dialog[data-mode="mini"] .sk-card-thumb { aspect-ratio: 2/3; min-height: 120px; }
            .sk-card-info { padding: 10px; background: var(--sk-bg-card); height: 60px; display: flex; flex-direction: column; justify-content: space-between; flex-shrink: 0; /* 关键：防止信息栏被压缩 */ }
            .sk-card-title { font-size: 0.85rem; font-weight: 600; color: var(--sk-text-main); margin-bottom: 0px; /* 支持两行显示 */ display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; word-break: break-all; line-height: 1.3; height: 2.6em; /* 1.3 * 2 */ }
            .sk-card-title-suffix { font-size: 0.7rem; opacity: 0.5; font-weight: normal; margin-left: 2px; }

            /* Base Model 标签 (始终显示) */
            .sk-card-badge { position: absolute; top: 8px; left: 8px; /* 改为左侧 */ background: rgba(0,0,0,0.7); color: #fff; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; opacity: 1; pointer-events: none; backdrop-filter: blur(2px); border: 1px solid rgba(255,255,255,0.2); z-index: 5; }
            
            /* 多选框样式 - 调整为右下角圆形样式 */
            .sk-checkbox-container { position: absolute; top: unset; bottom: 6px; right: 6px; width: 24px; height: 24px; z-index: 20; cursor: pointer; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,0.6); transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .sk-checkbox-container:hover { background: rgba(0,0,0,0.7); border-color: #fff; transform: scale(1.1); }
            .sk-checkbox-container.checked { background: var(--sk-primary); border-color: var(--sk-primary); transform: scale(1.1); }
            .sk-checkbox-container.checked::after { content: "✓"; color: white; font-size: 14px; font-weight: 800; }

            /* 选中状态 (原单选选中样式调整，现在主要靠多选框标识) */
            .sk-lora-card.selected { border-color: var(--sk-primary); background: rgba(99, 102, 241, 0.1); }
            /* 移除原有的居中大勾选图标，改用右上角多选框 */
            .sk-lora-card.selected::after { display: none; }

            /* --- 方案二 (Filter-Header) 样式 --- */
            .sk-scheme2-header { padding: 16px 20px; background: var(--sk-bg-panel); border-bottom: 1px solid var(--sk-border); flex-shrink: 0; /* 防止头部被压缩 */ }
            .sk-tags-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .sk-filter-tag { padding: 4px 12px; border-radius: 20px; background: var(--sk-bg-input); border: 1px solid var(--sk-border); color: var(--sk-text-muted); font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
            .sk-filter-tag:hover { border-color: var(--sk-primary); color: var(--sk-text-main); }
            .sk-filter-tag.active { background: var(--sk-primary); color: white; border-color: var(--sk-primary); }

            /* Mini 模式下方案二的头部优化 */
            .sk-lora-dialog[data-mode="mini"] .sk-scheme2-header { padding: 10px 12px; }
            .sk-lora-dialog[data-mode="mini"] .sk-tags-row { margin-top: 8px; gap: 4px; }
            .sk-lora-dialog[data-mode="mini"] .sk-filter-tag { padding: 2px 8px; font-size: 0.75rem; border-radius: 12px; }

            /* --- 方案三 (Floating Toolset) 样式 --- */
            .sk-scheme3-container { display: flex; flex-direction: column; height: 100%; }
            /* 方案三网格布局 */
            .sk-scheme3-grid { padding: 10px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); grid-auto-rows: max-content; align-content: start; align-items: stretch; overflow-y: auto; }
            /* 极简模式：仅显示图片 */
            .sk-scheme3-container.minimal-mode .sk-card-info { display: none; }
            .sk-scheme3-container.minimal-mode .sk-lora-card { aspect-ratio: 2/3; min-height: 180px; /* 极简模式下确保有最小高度 */ border-radius: 8px; }
            .sk-scheme3-container.minimal-mode .sk-card-thumb { height: 100%; aspect-ratio: 2/3; object-fit: cover; }

            /* --- 元数据气泡 (Metadata Tooltip) --- */
            .sk-info-btn { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; background: rgba(0,0,0,0.6); border-radius: 50%; color: #ddd; font-size: 12px; display: flex; align-items: center; justify-content: center; cursor: help; opacity: 0.8; /* 改为默认可见，稍微透明 */ transition: all 0.2s; z-index: 20; }
            .sk-lora-card:hover .sk-info-btn { opacity: 1; background: var(--sk-primary); /* 悬停卡片时高亮按钮 */ }

            /* --- NSFW 眼睛图标 (Eye Button) --- */
            .sk-eye-btn { position: absolute; bottom: 6px; left: 6px; width: 22px; height: 22px; background: rgba(0,0,0,0.6); border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; z-index: 25; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.2); }
            .sk-eye-btn:hover { background: var(--sk-primary); transform: scale(1.1); }
            .sk-eye-btn svg { width: 13px; height: 13px; }
            .sk-nsfw-unblurred .sk-eye-btn { background: rgba(99, 102, 241, 0.8); }
            .sk-metadata-tooltip { position: fixed; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--sk-border); border-radius: 8px; padding: 12px; width: 280px; color: var(--sk-text-main); font-size: 0.85rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter: blur(8px); z-index: 10200; pointer-events: none; opacity: 0; transform: translateY(10px); transition: opacity 0.2s, transform 0.2s; }
            .sk-metadata-tooltip.visible { opacity: 1; transform: translateY(0); }
            .sk-meta-label { color: var(--sk-text-muted); font-size: 0.75rem; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
            .sk-meta-value { margin-bottom: 10px; line-height: 1.4; word-break: break-all; }
            .sk-meta-tag { display: inline-block; background: rgba(99, 102, 241, 0.2); color: #a5b4fc; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin: 0 4px 4px 0; }

            /* --- 底部批量操作条 (Batch Bar) --- */
            .sk-batch-bar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px); background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(10px); border: 1px solid var(--sk-primary); border-radius: 30px; padding: 10px 24px; display: flex; align-items: center; gap: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 1000; /* Ensure it is above other content */ transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); opacity: 0; pointer-events: none; }
            .sk-batch-bar.visible { opacity: 1; pointer-events: all; transform: translateX(-50%) translateY(0); }
            .sk-batch-info { color: var(--sk-text-main); font-weight: 600; font-size: 0.95rem; white-space: nowrap; }
            .sk-batch-actions { display: flex; gap: 10px; }

            /* --- 已添加状态 (Added State) --- */
            .sk-lora-card.is-added { border-color: rgba(99, 102, 241, 0.5); pointer-events: none; /* 禁用大多数交互 */ position: relative; }
            /* 恢复部分交互以便可以显示 tooltip 或响应无效点击 */
            .sk-lora-card.is-added { pointer-events: auto; cursor: not-allowed; }
            .sk-lora-card.is-added .sk-card-image-wrapper { opacity: 0.6; filter: grayscale(0.5); }
            .sk-added-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0, 0, 0, 0.75); color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; border: 1px solid rgba(255, 255, 255, 0.3); z-index: 30; pointer-events: none; white-space: nowrap; }
            /* 已添加状态下隐藏多选框 */
            .sk-lora-card.is-added .sk-checkbox-container { display: none; }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

    /**
     * 创建基础 HTML 结构
     */
    createDialog() {
        if (this.dialog) return;

        // 创建自定义 Backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'sk-dialog-backdrop';
        document.body.appendChild(this.backdrop);
        
        // 点击 Backdrop 关闭 (仅 Full 模式)
        this.backdrop.addEventListener('click', () => {
             if (this.currentMode === 'full') {
                 this.hide();
             }
        });

        this.dialog = document.createElement('dialog');
        this.dialog.className = 'sk-lora-dialog';
        this.dialog.setAttribute('data-mode', 'full');
        
        // 确保 dialog 在 body 中，避免受父级容器 transform 影响
        document.body.appendChild(this.dialog);

        this.dialog.innerHTML = `
            <div class="sk-selector-container">
                <div class="sk-selector-header">
                    <div class="sk-selector-title">
                        <span style="color: var(--sk-primary);">${Icons.get('zap', '', 16)}</span>
                        ${lang.t("sel_title")}
                    </div>
                    <div class="sk-header-controls">
                        <button class="sk-btn-ghost" id="sk-mode-toggle" title="${lang.t("sel_mode_toggle")}">
                            ${this.currentMode === 'full' ? Icons.get('minimize', '', 14) : Icons.get('maximize', '', 14)}
                        </button>
                        <button class="sk-btn-ghost" id="sk-close-btn" title="${lang.t("sel_close")}">${Icons.get('x', '', 16)}</button>
                    </div>
                </div>
                
                <div class="sk-selector-content">
                    <div class="sk-search-bar">
                        <input type="text" class="sk-input" placeholder="${lang.t("sel_search_placeholder")}" id="sk-search-input">
                    </div>
                    <div class="sk-card-grid" id="sk-lora-list">
                        <!-- Cards will be injected here -->
                        <div style="grid-column: 1/-1; text-align: center; color: var(--sk-text-muted); padding: 40px;">
                            ${lang.t("initializing")}
                        </div>
                    </div>
                </div>
                
                <div class="sk-selector-footer">
                    <div style="flex: 1; text-align: left; color: var(--sk-text-muted); font-size: 0.8rem; display: flex; align-items: center;">
                        <span id="sk-status-text">${lang.t("ready")}</span>
                    </div>
                    <button class="sk-btn-ghost" id="sk-recent-clear-btn" style="display: none; margin-right: 8px;">${lang.t("sel_recent_clear")}</button>
                    <button class="sk-btn-ghost" id="sk-cancel-btn">${lang.t("sel_cancel_btn")}</button>
                    <button class="sk-btn" id="sk-confirm-btn" style="margin-left: 8px; display: none !important;">${lang.t("sel_confirm_btn")}</button>
                </div>
                
                <!-- 调整大小手柄 -->
                <div class="sk-resize-handle sk-resize-sw">
                    <div class="sk-resize-corner"></div>
                </div>
                <div class="sk-resize-handle sk-resize-se">
                    <div class="sk-resize-corner"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialog);

        // 绑定基础事件
        this.bindEvents();
    }

    /**
     * 渲染方案一：侧边抽屉式布局
     */
    renderScheme1() {
        const contentArea = this.dialog.querySelector('.sk-selector-content');
        contentArea.innerHTML = '';
        contentArea.className = 'sk-selector-content sk-scheme1-container'; // 替换默认样式

        // 1. 构建侧边栏
        const sidebar = document.createElement('div');
        sidebar.className = 'sk-nav-sidebar';
        sidebar.innerHTML = `
            <div class="sk-nav-group">
                <div class="sk-nav-item active" data-cat="${lang.t("sel_all")}">
                    <div class="sk-nav-icon">${Icons.get('grid', '', 14)}</div>
                    <div>${lang.t("sel_all_models")}</div>
                </div>
                <div class="sk-nav-item" data-cat="Favorites">
                    <div class="sk-nav-icon">${Icons.get('star', '', 14)}</div>
                    <div>${lang.t("sel_favorites")}</div>
                </div>
                <div class="sk-nav-item" data-cat="Recent">
                    <div class="sk-nav-icon">${Icons.get('rotate_ccw', '', 14)}</div>
                    <div>${lang.t("sel_recent")}</div>
                </div>
            </div>
            <div class="sk-folder-tree" id="sk-folder-tree">
                <!-- 目录树挂载点 -->
            </div>
        `;

        // 2. 构建主区域
        const mainContent = document.createElement('div');
        mainContent.className = 'sk-main-content';
        mainContent.innerHTML = `
            <div class="sk-scheme1-header">
                <div style="position: relative; flex: 1;">
                    <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); opacity: 0.5; display: flex;">${Icons.get('search', '', 14)}</span>
                    <input type="text" class="sk-input" style="padding-left: 36px;" placeholder="${lang.t("sel_search_placeholder_full")}" id="sk-scheme1-search">
                </div>
            </div>
            <div class="sk-card-grid" id="sk-lora-list">
                <!-- 网格列表 -->
            </div>
        `;

        contentArea.appendChild(sidebar);
        contentArea.appendChild(mainContent);

        // 绑定侧边栏事件
        const navItems = sidebar.querySelectorAll('.sk-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                
                // 清除目录树选中状态
                const treeLabels = sidebar.querySelectorAll('.sk-tree-label');
                treeLabels.forEach(l => l.classList.remove('active'));
                
                this.renderList('', item.dataset.cat);
            });
        });

        // 绑定搜索事件
        const searchInput = mainContent.querySelector('#sk-scheme1-search');
        searchInput.addEventListener('input', (e) => {
            // 简单的防抖
            if (this._searchTimer) clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
                this.renderList(e.target.value, this.currentCategory);
            }, 300);
        });
        
        // 渲染目录树
        this.renderFolderTree();
    }

    /**
     * 渲染方案二：Filter-Header 顶部标签式
     */
    renderScheme2() {
        const contentArea = this.dialog.querySelector('.sk-selector-content');
        contentArea.innerHTML = '';
        contentArea.className = 'sk-selector-content sk-scheme2-container';

        // 1. 构建头部 (搜索 + 标签)
        const header = document.createElement('div');
        header.className = 'sk-scheme2-header';
        
        header.innerHTML = `
            <div class="sk-search-bar">
                <input type="text" class="sk-input" placeholder="${lang.t("sel_search_placeholder_lora")}" id="sk-scheme2-search">
            </div>
            <div class="sk-tags-row">
                <!-- 标签将在此处动态生成 -->
            </div>
        `;

        // 2. 构建网格区域
        const grid = document.createElement('div');
        grid.className = 'sk-card-grid';
        grid.id = 'sk-lora-list';

        contentArea.appendChild(header);
        contentArea.appendChild(grid);

        // 渲染标签
        this.renderScheme2Tags();

        // 绑定搜索
        const searchInput = header.querySelector('#sk-scheme2-search');
        searchInput.addEventListener('input', (e) => {
             if (this._searchTimer) clearTimeout(this._searchTimer);
             this._searchTimer = setTimeout(() => {
                 this.renderList(e.target.value, this.currentCategory);
             }, 300);
        });
    }

    /**
     * 专门渲染方案二的标签行
     */
    renderScheme2Tags() {
        const tagsRow = this.dialog.querySelector('.sk-tags-row');
        if (!tagsRow) return;

        // 兜底逻辑：如果 categories 只有基础几项但 allData 有数据，重新从 allData 提取分类
        if (this.categories.size <= 3 && this.allData.length > 0) {
            this.allData.forEach(item => {
                if (item.baseModel) this.categories.add(item.baseModel);
            });
        }

        let tagsHtml = `<div class="sk-filter-tag ${this.currentCategory === lang.t("sel_all") ? 'active' : ''}" data-cat="${lang.t("sel_all")}">${lang.t("sel_all")}</div>`;
        
        // 确保 categories 包含基础模型
        this.categories.forEach(cat => {
            if (cat !== lang.t("sel_all") && cat !== 'Favorites' && cat !== 'Recent') {
                tagsHtml += `<div class="sk-filter-tag ${this.currentCategory === cat ? 'active' : ''}" data-cat="${cat}">${cat}</div>`;
            }
        });
        
        tagsHtml += `<div class="sk-filter-tag ${this.currentCategory === 'Favorites' ? 'active' : ''}" data-cat="Favorites">${Icons.get('star', '', 12)} ${lang.t("sel_favorites_star")}</div>`;
        tagsHtml += `<div class="sk-filter-tag ${this.currentCategory === 'Recent' ? 'active' : ''}" data-cat="Recent">${Icons.get('rotate_ccw', '', 12)} ${lang.t("sel_recent_icon")}</div>`;

        tagsRow.innerHTML = tagsHtml;

        // 绑定点击事件
        const tags = tagsRow.querySelectorAll('.sk-filter-tag');
        tags.forEach(tag => {
            tag.addEventListener('click', () => {
                tags.forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
                this.renderList('', tag.dataset.cat);
            });
        });
    }

    /**
     * 渲染方案三：Floating Toolset 悬浮工具组 (响应式极简流)
     */
    renderScheme3() {
        const contentArea = this.dialog.querySelector('.sk-selector-content');
        contentArea.innerHTML = '';
        contentArea.className = 'sk-selector-content sk-scheme3-container';

        // 1. 顶部极简搜索
        const header = document.createElement('div');
        header.style.padding = '12px';
        header.style.background = 'var(--sk-bg-panel)';
        header.style.borderBottom = '1px solid var(--sk-border)';
        header.innerHTML = `
            <input type="text" class="sk-input" placeholder="${lang.t("sel_search_placeholder_simple")}" id="sk-scheme3-search">
        `;

        // 2. 网格区域
        const grid = document.createElement('div');
        grid.className = 'sk-scheme3-grid'; // 使用专用 grid class
        grid.id = 'sk-lora-list';

        contentArea.appendChild(header);
        contentArea.appendChild(grid);

        // 3. 绑定搜索
        header.querySelector('input').addEventListener('input', (e) => {
             if (this._searchTimer) clearTimeout(this._searchTimer);
             this._searchTimer = setTimeout(() => {
                 this.renderList(e.target.value, this.currentCategory);
             }, 300);
        });

        // 4. ResizeObserver 逻辑
        // 监听 contentArea 宽度，如果小于 260px (比如手动缩窄窗口)，切换到 minimal 模式
        if (this._resizeObserver) this._resizeObserver.disconnect();
        
        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                if (width < 300) {
                    contentArea.classList.add('minimal-mode');
                } else {
                    contentArea.classList.remove('minimal-mode');
                }
            }
        });
        
        this._resizeObserver.observe(contentArea);
    }

    /**
     * 渲染目录树 (基于路径)
     */
    renderFolderTree() {
        const treeContainer = this.dialog.querySelector('#sk-folder-tree');
        if (!treeContainer) return;

        treeContainer.innerHTML = ''; // 清空

        // --- 增加虚拟分类：已选中 (Selected) (仅在 Full 模式下显示) ---
        if (this.currentMode !== 'mini') {
            const selectedNode = document.createElement('div');
            selectedNode.className = 'sk-tree-node';
            selectedNode.style.marginBottom = '8px'; // 与下方文件夹稍微隔开
            selectedNode.innerHTML = `
                <div class="sk-tree-label" data-folder="::selected::" style="font-weight: 600; color: var(--sk-primary-light);">
                    <span style="margin-right: 6px; display: flex; align-items: center;">${Icons.get('star', '', 14)}</span>${lang.t("sel_selected")}
                </div>
            `;
            
            selectedNode.querySelector('.sk-tree-label').addEventListener('click', (e) => {
                const target = e.currentTarget;
                this.dialog.querySelectorAll('.sk-nav-item, .sk-tree-label').forEach(el => el.classList.remove('active'));
                target.classList.add('active');
                
                // 渲染已选中的项目
                this.renderList('', 'Special:Selected');
            });
            treeContainer.appendChild(selectedNode);
        }
        // ------------------------------------

        // 提取所有目录结构
        const folders = new Set();
        this.allData.forEach(item => {
            const parts = item.path.split(/[\\/]/);
            if (parts.length > 1) {
                parts.pop(); 
                let currentPath = "";
                parts.forEach(part => {
                    currentPath = currentPath ? `${currentPath}/${part}` : part;
                    folders.add(currentPath);
                });
            }
        });

        const sortedFolders = Array.from(folders).sort();
        
        sortedFolders.forEach(folder => {
            const node = document.createElement('div');
            node.className = 'sk-tree-node';
            node.style.paddingLeft = (folder.split('/').length * 10) + 'px'; // 简单的层级缩进
            node.innerHTML = `
                <div class="sk-tree-label" data-folder="${folder}">
                    <span style="opacity:0.5; margin-right: 6px; display: flex; align-items: center;">${Icons.get('folder', '', 14)}</span>${folder.split('/').pop()}
                </div>
            `;
            
            node.querySelector('.sk-tree-label').addEventListener('click', (e) => {
                const target = e.currentTarget;
                this.dialog.querySelectorAll('.sk-nav-item, .sk-tree-label').forEach(el => el.classList.remove('active'));
                target.classList.add('active');
                
                this.renderList('', 'Folder:' + folder);
            });
            
            treeContainer.appendChild(node);
        });
    }

    bindDragAndResizeEvents() {
        const header = this.dialog.querySelector('.sk-selector-header');
        
        // --- 拖拽逻辑 ---
        let isDragging = false;
        let dragStartX, dragStartY;
        let initialLeft, initialTop;
        
        header.addEventListener('mousedown', (e) => {
            if (this.currentMode !== 'mini') return;
            // 只有点击头部本身或标题时才触发，避免点到按钮
            if (e.target.closest('button') || e.target.closest('input')) return;
            
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            const rect = this.dialog.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            // 确保 dialog 使用 left/top 定位而不是 right/bottom
            this.dialog.style.right = 'auto';
            this.dialog.style.bottom = 'auto';
            this.dialog.style.left = initialLeft + 'px';
            this.dialog.style.top = initialTop + 'px';
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            
            this.dialog.style.left = (initialLeft + dx) + 'px';
            this.dialog.style.top = (initialTop + dy) + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        // --- 调整大小逻辑 ---
        const handleSW = this.dialog.querySelector('.sk-resize-sw');
        const handleSE = this.dialog.querySelector('.sk-resize-se');
        
        const initResize = (e, direction) => {
            if (this.currentMode !== 'mini') return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startRect = this.dialog.getBoundingClientRect();
            
            const onMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                let newWidth = startRect.width;
                let newHeight = startRect.height;
                let newLeft = startRect.left;
                
                // 最小尺寸限制
                const MIN_WIDTH = 340;
                const MIN_HEIGHT = 650;
                
                if (direction === 'se') {
                    // 右下角：调整宽和高
                    newWidth = Math.max(MIN_WIDTH, startRect.width + dx);
                    newHeight = Math.max(MIN_HEIGHT, startRect.height + dy);
                } else if (direction === 'sw') {
                    // 左下角：调整宽、高和左边距
                    const potentialWidth = startRect.width - dx;
                    if (potentialWidth >= MIN_WIDTH) {
                        newWidth = potentialWidth;
                        newLeft = startRect.left + dx;
                    } else {
                        newWidth = MIN_WIDTH;
                        newLeft = startRect.right - MIN_WIDTH;
                    }
                    
                    newHeight = Math.max(MIN_HEIGHT, startRect.height + dy);
                }
                
                this.dialog.style.width = newWidth + 'px';
                this.dialog.style.height = newHeight + 'px';
                if (direction === 'sw') {
                    this.dialog.style.left = newLeft + 'px';
                }
            };
            
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        
        if (handleSW) handleSW.addEventListener('mousedown', (e) => initResize(e, 'sw'));
        if (handleSE) handleSE.addEventListener('mousedown', (e) => initResize(e, 'se'));
    }

    bindEvents() {
        const closeBtn = this.dialog.querySelector('#sk-close-btn');
        const cancelBtn = this.dialog.querySelector('#sk-cancel-btn');
        const confirmBtn = this.dialog.querySelector('#sk-confirm-btn'); // 获取确认按钮
        const modeBtn = this.dialog.querySelector('#sk-mode-toggle');
        const recentClearBtn = this.dialog.querySelector('#sk-recent-clear-btn');

        const closeHandler = () => this.hide();

        closeBtn.addEventListener('click', closeHandler);
        cancelBtn.addEventListener('click', closeHandler);

        // 绑定清空最近使用事件
        if (recentClearBtn) {
            recentClearBtn.addEventListener('click', () => {
                localStorage.removeItem('sk_lora_recent');
                this.recentPaths = new Set();
                // 如果当前在最近使用分类，则刷新列表
                if (this.currentCategory === 'Recent') {
                    this.renderList('', 'Recent');
                }
            });
        }
        
        // 绑定确认按钮事件
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (this.selectedItems.size > 0) {
                    // 如果有多选，返回数组
                    const items = Array.from(this.selectedItems.values());
                    // 批量添加到最近使用
                    items.forEach(item => this.addToRecent(item.path));
                    
                    if (this.callback) {
                        this.callback(items);
                    }
                    this.hide();
                } else {
                    // 没有选中项，提示或关闭
                    this.hide();
                }
            });
        }
        
        modeBtn.addEventListener('click', () => {
            const wasOpen = this.dialog.open;
            if (wasOpen) this.dialog.close();
            
            this.currentMode = this.currentMode === 'full' ? 'mini' : 'full';
            this.dialog.setAttribute('data-mode', this.currentMode);
            modeBtn.innerHTML = this.currentMode === 'full' ? Icons.get('minimize', '', 14) : Icons.get('maximize', '', 14);

            // 更新 Backdrop
            if (this.currentMode === 'full') {
                this.backdrop.classList.add('visible');
            } else {
                this.backdrop.classList.remove('visible');
            }

            // 切换到 Full 模式时，清除 mini 模式可能设置的内联样式
            if (this.currentMode === 'full') {
                this.dialog.style.left = '';
                this.dialog.style.top = '';
                this.dialog.style.width = '';
                this.dialog.style.height = '';
                this.dialog.style.right = '';
                this.dialog.style.bottom = '';
            }

            // 切换模式时清空多选
            if (this.currentMode === 'mini') {
                this.selectedItems.clear();
                this.updateBatchBar();
            }

            // 根据模式显示/隐藏底部确认按钮 (当前全局隐藏)
            /*
            if (confirmBtn) {
                confirmBtn.style.display = this.currentMode === 'mini' ? 'none' : 'block';
            }
            */
            
            if (wasOpen) {
                // 根据当前方案刷新 UI 结构
                const container = this.dialog.querySelector('.sk-selector-content');
                if (container) {
                    if (container.classList.contains('sk-scheme2-container')) {
                        // 方案二只需刷新标签行，不需要重绘整个 grid 避免闪烁
                        this.renderScheme2Tags();
                    } else if (container.classList.contains('sk-scheme3-container')) {
                        this.renderScheme3();
                    }
                }

                // 重新渲染目录树和列表，以应用 mini 模式的限制
            this.renderFolderTree();
            this.renderList('', this.currentCategory || lang.t("sel_all"));

            if (this.currentMode === 'mini') {
                    this.dialog.show();
                } else {
                    this.dialog.showModal();
                }
            }
        });

        // ESC 关闭支持
        this.dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            this.hide();
        });
        
        // 点击 Backdrop 关闭 (仅 Full 模式)
        this.dialog.addEventListener('click', (e) => {
            if (this.currentMode === 'full' && e.target === this.dialog) {
                this.hide();
            }
        });

        // 绑定拖拽和调整大小事件
        this.bindDragAndResizeEvents();
    }

    /**
     * 显示选择器
     * @param {Function} callback - 回调函数 (selectedLoraItem) => void
     * @param {Object} options - 配置项 { currentScheme: [], scheme: 'scheme1' }
     */
    async show(callback, options = {}) {
        this.callback = callback;
        
        // 存储当前节点已有的 LoRA 数据，用于状态标记
        // 预处理为 Set 以提高查找效率 (归一化路径)
        this.currentDataMap = new Set();
        if (options.currentData && Array.isArray(options.currentData)) {
            options.currentData.forEach(d => {
                if (d.name) {
                    this.currentDataMap.add(d.name.replace(/\\/g, '/').replace(/^\/+/, ''));
                }
            });
        }

        // 确保样式已注入
        this.injectStyles();
        
        // 渲染 UI 结构 (在显示前渲染，避免布局闪烁)
        const targetScheme = options.scheme || 'scheme1';
        if (targetScheme === 'scheme2') this.renderScheme2();
        else if (targetScheme === 'scheme3') this.renderScheme3();
        else this.renderScheme1();
        
        // 初始根据模式显示/隐藏底部确认按钮 (当前全局隐藏，预留逻辑)
        /*
        const confirmBtn = this.dialog.querySelector('#sk-confirm-btn');
        if (confirmBtn) {
            confirmBtn.style.display = this.currentMode === 'mini' ? 'none' : 'block';
        }
        */

        // 显示 Dialog
        if (!this.dialog.open) {
            this.dialog.show(); // 始终使用 show()，不再使用 showModal
        }
        
        // 控制 Backdrop
        if (this.currentMode === 'full') {
            this.backdrop.classList.add('visible');
        } else {
            this.backdrop.classList.remove('visible');
        }
        
        // 加载数据
        if (this.allData.length === 0) {
            await this.fetchData();
        } 
        
        // 渲染列表 (初始显示 All)
        this.renderList('', lang.t("sel_all"));
    }

    /**
     * 清除数据缓存，下次显示时将重新获取
     */
    refreshData() {
        this.allData = [];
    }

    /**
     * 获取 LoRA 数据
     */
    async fetchLocalSettings() {
        try {
            const resp = await api.fetchApi("/lora_manager/get_local_settings");
            if (resp.status === 200) {
                const data = await resp.json();
                this.localSettings = { ...this.localSettings, ...data };
            }
        } catch (e) { console.error("[SK-LoRA] [System] 获取本地设置失败:", e); }
    }

    async fetchData() {
        const listContainer = this.dialog.querySelector('#sk-lora-list');
        listContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--sk-text-muted); padding: 40px;">${lang.t("sel_loading")}</div>`;

        try {
            // 先获取本地设置以确定 NSFW 逻辑
            await this.fetchLocalSettings();

            const response = await api.fetchApi('/sk_manager/get_lora_data');
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            
            this.processData(data);
            
            // 数据加载后，如果当前是方案二，直接刷新标签行即可，无需重新渲染整个方案
            this.renderScheme2Tags();

            this.renderFolderTree();
            this.renderList();
        } catch (error) {
            console.error('[SK-LoRA] [System] 获取 LoRA 数据失败:', error);
            listContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 40px;">${lang.t("error")}: ${error.message}</div>`;
        }
    }

    /**
     * 数据预处理
     * @param {Object} rawData - 后端返回的 JSON 对象 { path: {data...} }
     */
    processData(rawData) {
        this.allData = [];
        this.categories = new Set([lang.t("sel_all"), 'Favorites', 'Recent']);
        
        for (const [path, info] of Object.entries(rawData)) {
            // 提取基础模型作为分类
            let baseModel = info.base_model || lang.t("sel_none");
            
            this.categories.add(baseModel);

            this.allData.push({
                    path: path,
                    hash: info.hash || '', // 存储模型哈希
                    name: path.split(/[\\/]/).pop(), // 默认使用文件名
                    title: info.title || '', // Civitai 标题
                    baseModel: baseModel,
                    img: info.img, // 包含 /sk_view_lora/ 前缀的 URL
                    imgRel: info.img_rel, // 增加相对路径字段供缩略图 API 使用
                    mtime: info.mtime,     // 增加修改时间用于缓存校验
                    tags: Array.isArray(info.tags) ? info.tags.join(', ') : (info.tags || ''),
                    triggerWords: Array.isArray(info.trigger_words) ? info.trigger_words.join(', ') : (info.trigger_words || ''),
                    weight: (info.weight !== "" && info.weight !== undefined) ? info.weight : "",
                    isFav: !!info.is_fav,
                    nsfw_level: parseInt(info.nsfw_level || 1),
                    notes: info.notes || '',
                    sampler: info.sampler || '',
                    versionName: info.version_name || '',
                    civitaiId: info.civitai_model_id || null
                });
        }
        
        // 初始按名称排序
        this.allData.sort((a, b) => a.name.localeCompare(b.name));
        
        // 更新最近使用列表 (从 localStorage 读取并标记)
        this.loadRecent();
    }

    /**
     * 加载最近使用记录
     */
    loadRecent() {
        try {
            const recent = JSON.parse(localStorage.getItem('sk_lora_recent') || '[]');
            this.recentPaths = new Set(recent);
            // 可以在界面上增加 "Recent" 分类
            if (this.recentPaths.size > 0) {
                this.categories.add('Recent');
            }
        } catch (e) {
            console.warn('[SK-LoRA] [System] 加载最近历史失败:', e);
            this.recentPaths = new Set();
        }
    }

    /**
     * 添加到最近使用
     */
    addToRecent(path) {
        this.recentPaths.add(path);
        // 保持最近 20 条
        let recent = Array.from(this.recentPaths);
        if (recent.length > 20) recent = recent.slice(-20);
        
        localStorage.setItem('sk_lora_recent', JSON.stringify(recent));
        
        // 重新加载以更新分类状态
        this.loadRecent();
    }

    /**
     * 渲染列表
     * @param {string} query - 搜索关键词
     * @param {string} category - 过滤分类
     */
    renderList(query = '', category = null) {
        const listContainer = this.dialog.querySelector('#sk-lora-list');
        if(!listContainer) return; 
        
        // 重置分页
        this.currentPage = 1;
        listContainer.innerHTML = '';
        
        // 如果是 Scheme 1，可能需要从特定的 search input 获取值
        const searchInput = this.dialog.querySelector('#sk-scheme1-search') || 
                           this.dialog.querySelector('#sk-scheme2-search') || 
                           this.dialog.querySelector('#sk-scheme3-search');
        const currentQuery = query || (searchInput ? searchInput.value : '');
        
        if (category) this.currentCategory = category;
        
        // 增强容错：定义什么是“全部”
        const isAllCategory = (cat) => {
            return !cat || cat === 'All' || cat === lang.t("sel_all") || cat === '全部 LoRA';
        };
        
        // 容错处理：统一转换为标准翻译文本
        if (isAllCategory(this.currentCategory)) {
            this.currentCategory = lang.t("sel_all");
        }
        
        const targetCategory = this.currentCategory || lang.t("sel_all");
        const isTargetAll = isAllCategory(targetCategory);

        // 更新清空最近使用按钮显示状态
        const recentClearBtn = this.dialog.querySelector('#sk-recent-clear-btn');
        if (recentClearBtn) {
            recentClearBtn.style.display = targetCategory === 'Recent' ? 'block' : 'none';
        }

        // 如果是 Scheme 2，更新标签栏的 active 状态
        if (this.dialog.getAttribute('data-scheme') === 'scheme2') {
            const tags = this.dialog.querySelectorAll('.sk-filter-tag');
            tags.forEach(tag => {
                const cat = tag.getAttribute('data-cat');
                if (cat === targetCategory) {
                    tag.classList.add('active');
                } else {
                    tag.classList.remove('active');
                }
            });
        }

        let sourceList = this.allData;

        // 如果是特殊分类：已选中
        if (targetCategory === 'Special:Selected') {
            sourceList = Array.from(this.selectedItems.values());
        }

        // 过滤数据
        this.filteredList = sourceList.filter(item => {
            // 1. 分类过滤
            if (!isTargetAll && targetCategory !== 'Special:Selected') {
                if (targetCategory === 'Favorites') {
                    if (!item.isFav) return false;
                }
                else if (targetCategory === 'Recent') {
                    if (!this.recentPaths.has(item.path)) return false;
                }
                else if (targetCategory.startsWith('Folder:')) {
                    const targetFolder = targetCategory.substring(7);
                    const normalizedPath = item.path.replace(/\\/g, '/');
                    // 确保是该文件夹下的文件（匹配路径前缀）
                    if (!normalizedPath.startsWith(targetFolder + '/')) return false;
                }
                else if (item.baseModel !== targetCategory) {
                    return false;
                }
            }
            
            // 2. 模糊搜索 (名称、标题、标签、触发词)
            if (currentQuery) {
                const q = currentQuery.toLowerCase();
                const searchStr = `${item.name} ${item.title || ''} ${item.tags || ''} ${item.triggerWords || ''}`.toLowerCase();
                return searchStr.includes(q);
            }
            
            return true;
        });

        if (this.filteredList.length === 0) {
            listContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--sk-text-muted); padding: 40px;">${lang.t("sel_no_matching")}</div>`;
            return;
        }

        this.renderNextPage();

        // 绑定滚动事件进行瀑布流加载
        listContainer.onscroll = () => {
            if (this.isLoadingMore) return;
            const threshold = 200; // 距离底部 200px 时加载
            if (listContainer.scrollHeight - listContainer.scrollTop - listContainer.clientHeight < threshold) {
                this.renderNextPage();
            }
        };
    }

    /**
     * 渲染下一页数据
     */
    renderNextPage() {
        const listContainer = this.dialog.querySelector('#sk-lora-list');
        if (!listContainer || !this.filteredList) return;

        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageItems = this.filteredList.slice(start, end);

        if (pageItems.length === 0) return;

        this.isLoadingMore = true;
        
        const fragment = document.createDocumentFragment();
        pageItems.forEach(item => {
            const card = document.createElement('div');
            
            // 归一化路径比对
            const normalizedPath = item.path.replace(/\\/g, '/').replace(/^\/+/, '');
            const isAdded = this.currentDataMap && this.currentDataMap.has(normalizedPath);

            card.className = `sk-lora-card ${item.isFav ? 'fav' : ''} ${isAdded ? 'is-added' : ''}`;
            card.dataset.path = normalizedPath; // 绑定归一化路径，便于后续更新状态
            card._item = item; // 挂载原始数据对象，便于状态恢复时重新绑定事件
            
            if (isAdded) {
                // 已添加状态：点击弹出提示
                card.onclick = (e) => {
                    e.stopPropagation();
                    if (window.SKToastManager) {
                        window.SKToastManager.warn(lang.t("sel_warn_added"));
                    }
                };
            } else {
                // 未添加状态：正常选择
                card.onclick = () => this.selectItem(item);
            }
            
            // 优先使用缩略图 API，如果没有相对路径则回退到原始 URL
                const v = item.mtime ? `?v=${item.mtime}` : '';
                const thumbUrl = item.imgRel ? `/api/sk_manager/get_thumb?path=${encodeURIComponent(item.imgRel)}&model_path=${encodeURIComponent(item.path)}&hash=${item.hash}${v.replace('?', '&')}` : `${item.img}${v}`;
             
             // 构建图片 URL
            let imgHtml = `<img src="${this.defaultImg}" class="sk-card-thumb" style="object-fit: contain; padding: 10%; background: #222;">`;
            
            // NSFW 逻辑
            const userLevel = parseInt(this.localSettings.nsfw_allow_level || 1);
            const itemLevel = parseInt(item.nsfw_level || 1);
            const nsfwMode = this.localSettings.nsfw_img_mode || 'blur';
            let filterClass = "";
            if (nsfwMode !== 'show' && itemLevel > userLevel) {
                if (nsfwMode === 'hide') {
                    filterClass = "sk-nsfw-hidden";
                } else {
                    filterClass = "sk-nsfw-blur";
                }
            }

            if (item.img && item.img !== '/sk_view_lora/__placeholder__') {
                 imgHtml = `<img src="${thumbUrl}" class="sk-card-thumb sk-skeleton ${filterClass}" loading="lazy" 
                             onload="this.classList.remove('sk-skeleton')"
                             onerror="this.src='${this.defaultImg.replace(/'/g, "\\'")}'; this.style.objectFit='contain'; this.style.padding='10%'; this.classList.remove('sk-skeleton');">`;
            }

            // 构建 Badge
            const badge = `<div class="sk-card-badge">${item.baseModel}</div>`;

            // 构建已添加遮罩
            let addedOverlay = null;
            if (isAdded) {
                const overlay = document.createElement('div');
                overlay.className = 'sk-added-overlay';
                overlay.innerText = lang.t("sel_added_label"); // 需确保 lang.js 中有此 key，或者暂时硬编码
                if (!lang.t("sel_added_label") || lang.t("sel_added_label") === "sel_added_label") {
                     overlay.innerText = "ADDED";
                }
                addedOverlay = overlay;
            }

            // 构建 Info Button
            const infoBtn = document.createElement('div');
            infoBtn.className = 'sk-info-btn';
            infoBtn.innerHTML = 'i';
            
            // 鼠标移入显示详情
            infoBtn.onmouseenter = (e) => {
                e.stopPropagation();
                this.showMetadataTooltip(e, item);
            };
            
            // 阻止点击事件穿透到卡片
            infoBtn.onclick = (e) => e.stopPropagation();

            // 构建标题 (处理后缀)
            let rawTitle = item.name;
            // 标题显示逻辑：统一使用面板逻辑
            if (this.localSettings.model_card_title_source === 'civitai' && item.civitaiId) {
                if (item.title) {
                    rawTitle = item.title;
                    if (item.versionName) {
                        rawTitle += ` - ${item.versionName}`;
                    }
                }
            }

            let displayName = rawTitle;
            if (displayName.toLowerCase().endsWith('.safetensors')) {
                const name = displayName.slice(0, -12);
                displayName = `${name}<span class="sk-card-title-suffix">.safetensors</span>`;
            } else if (displayName.toLowerCase().endsWith('.pt')) {
                const name = displayName.slice(0, -3);
                displayName = `${name}<span class="sk-card-title-suffix">.pt</span>`;
            } else if (displayName.toLowerCase().endsWith('.ckpt')) {
                const name = displayName.slice(0, -5);
                displayName = `${name}<span class="sk-card-title-suffix">.ckpt</span>`;
            }

            // 检查选中状态
            const isSelected = this.selectedItems.has(item.path);
            if (isSelected) {
                card.classList.add('selected');
            }

            // 构建多选 Checkbox (仅在 Full 模式下显示)
            let checkbox = null;
            if (this.currentMode !== 'mini') {
                checkbox = document.createElement('div');
                checkbox.className = `sk-checkbox-container ${isSelected ? 'checked' : ''}`;
                // 绑定事件并阻止冒泡
                checkbox.onclick = (e) => {
                    e.stopPropagation();
                    this.toggleMultiSelect(item, e);
                };
            }
            
            // 为了让 checkbox 位于图片区域右下角，我们需要将其包裹进图片容器，或者确保父容器定位
            // 目前结构是 card -> [img/div(sk-card-thumb), badge, card-info, infoBtn, checkbox]
            // card 是 relative 定位，所以 absolute 的 checkbox 会相对于 card 定位
            // 我们希望它在图片区域内。图片的容器没有专门的 div 只有 img 标签本身，
            // 但我们可以利用 top/bottom 调整。图片高度是不定的吗？不，前面 CSS 设定了 aspect-ratio。
            // sk-card-info 高度固定。
            // 为了让它准确位于图片区域右下角，我们可以修改 HTML 结构，包裹图片区域。
            // 或者简单点，card 是 flex column。
            // 图片在上方。我们可以设置 checkbox bottom 为 (card-info height + padding) ?
            // 不够优雅。
            // 更好的方式：包裹图片区域。
            
            // 重新组织 HTML 结构
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'sk-card-image-wrapper';
            imageWrapper.style.position = 'relative';
            imageWrapper.style.width = '100%';
            
            // 修正：将 imgHtml 转为 DOM 节点
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = imgHtml;
            const imgNode = tempDiv.firstElementChild;

            // NSFW 逻辑优化：添加眼睛图标用于切换可见性
            if (filterClass && imgNode) {
                const eyeBtn = document.createElement('div');
                eyeBtn.className = 'sk-eye-btn';
                eyeBtn.innerHTML = Icons.get('eye', '', 13);
                eyeBtn.title = lang.t("sel_toggle_nsfw") || "Toggle NSFW visibility";

                eyeBtn.onclick = (e) => {
                    e.stopPropagation();
                    const isBlurred = imgNode.classList.contains("sk-nsfw-blur") || imgNode.classList.contains("sk-nsfw-hidden");
                    if (isBlurred) {
                        imgNode.classList.remove("sk-nsfw-blur", "sk-nsfw-hidden");
                        eyeBtn.innerHTML = Icons.get('eye_off', '', 13);
                        imageWrapper.classList.add('sk-nsfw-unblurred');
                    } else {
                        imgNode.classList.add(filterClass);
                        eyeBtn.innerHTML = Icons.get('eye', '', 13);
                        imageWrapper.classList.remove('sk-nsfw-unblurred');
                    }
                };
                imageWrapper.appendChild(eyeBtn);
            }
            
            // 修正：将 badge 转为 DOM 节点
            const tempBadge = document.createElement('div');
            tempBadge.innerHTML = badge;
            const badgeNode = tempBadge.firstElementChild;
            
            imageWrapper.appendChild(imgNode);
            imageWrapper.appendChild(badgeNode);
            if (addedOverlay) imageWrapper.appendChild(addedOverlay); // 插入已添加遮罩
            if (checkbox) imageWrapper.appendChild(checkbox); // Checkbox 放入图片区域 (如果有)
            
            card.innerHTML = ''; // 清空
            card.appendChild(imageWrapper);
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'sk-card-info';
            infoDiv.innerHTML = `
                <div class="sk-card-title">${displayName}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    ${item.isFav ? `<span style="color: #fbbf24; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">${Icons.get('star', '', 12)} ${lang.t("sel_favorite_label")}</span>` : ''}
                </div>
            `;

            // 为名称文本添加富文本提示
            const titleEl = infoDiv.querySelector('.sk-card-title');
            if (titleEl) {
                const handleHover = (e) => {
                    if (window.SKTooltipManager) {
                        const content = this.getRichTooltip(item);
                        window.SKTooltipManager.show(content, e.clientX + 10, e.clientY + 10);
                    }
                };
                titleEl.onmouseenter = handleHover;
                titleEl.onmousemove = handleHover;
                titleEl.onmouseleave = () => {
                    if (window.SKTooltipManager) window.SKTooltipManager.hide();
                };
            }
            
            card.appendChild(infoDiv);
            card.appendChild(infoBtn); // Info button 依然在右上角 (相对于 card)
            fragment.appendChild(card);
        });

        listContainer.appendChild(fragment);
        this.currentPage++;
        this.isLoadingMore = false;
    }

    /**
     * 获取富文本提示内容
     */
    getRichTooltip(item) {
        let html = "";
        
        // 标题
        const displayTitle = item.title || item.name.replace(/\.[^/.]+$/, "");
        html += `<div class="sk-tooltip-title">${displayTitle}</div>`;
        html += `<div class="sk-tooltip-hr"></div>`;
        
        const rows = [];
        
        // 1. 路径 (从 lora 目录开始)
        rows.push({ label: lang.t("tooltip_path"), value: item.path || item.name });
        
        // 2. 权重
        if (item.weight !== "" && item.weight !== undefined && item.weight !== null) {
            rows.push({ label: lang.t("tooltip_weight"), value: item.weight });
        }
        
        // 3. 采样器
        if (item.sampler !== "" && item.sampler !== undefined && item.sampler !== null) {
            rows.push({ label: lang.t("tooltip_sampler"), value: item.sampler });
        }
        
        // 4. 基础模型
        const baseModel = item.baseModel || item.base_model;
        if (baseModel && baseModel !== "Unknown" && baseModel !== lang.t("sel_none")) {
            rows.push({ label: lang.t("tooltip_base_model"), value: baseModel });
        }
        
        // 5. 触发词
        const triggers = item.triggerWords || item.trigger_words || item.tags || "";
        const displayTriggers = Array.isArray(triggers) ? triggers.join(", ") : triggers;
        if (displayTriggers) rows.push({ label: lang.t("trigger_label"), value: displayTriggers });
        
        // 6. 备注 (限定字数)
        if (item.notes) {
            let notes = item.notes;
            if (notes.length > 50) notes = notes.substring(0, 50) + "...";
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
    }

    /**
     * 显示元数据气泡
     */
    showMetadataTooltip(event, item) {
        // 移除旧 tooltip (在 body 中查找)
        const oldTooltip = document.querySelector('.sk-metadata-tooltip');
        if (oldTooltip) oldTooltip.remove();

        const tooltip = document.createElement('div');
        tooltip.className = 'sk-metadata-tooltip';
        
        // 格式化 Trigger Words
        const tags = item.triggerWords ? item.triggerWords.split(',').map(t => `<span class="sk-meta-tag">${t.trim()}</span>`).join('') : `<span style="color:#666">${lang.t("sel_none")}</span>`;
        
        let displayTitle = item.name;
        if (this.localSettings.model_card_title_source === 'civitai' && item.civitaiId && item.title) {
            displayTitle = item.title;
            if (item.versionName) displayTitle += ` - ${item.versionName}`;
        }

        tooltip.innerHTML = `
            <div class="sk-meta-label">${lang.t("model_name")}</div>
            <div class="sk-meta-value" style="font-weight:600; color:var(--sk-primary-light)">${displayTitle}</div>
            
            <div class="sk-meta-label">${lang.t("sel_meta_path")}</div>
            <div class="sk-meta-value" style="font-size:0.75rem; opacity:0.8;">${item.path}</div>
            
            <div class="sk-meta-label">${lang.t("base_model")}</div>
            <div class="sk-meta-value">${item.baseModel}</div>
            
            <div class="sk-meta-label">${lang.t("trigger_words")}</div>
            <div class="sk-meta-value">${tags}</div>
            
            <div class="sk-meta-label">${lang.t("tags_label")}</div>
            <div class="sk-meta-value" style="font-size:0.8rem; color:var(--sk-text-muted)">${item.tags || lang.t("sel_meta_no_tags")}</div>
        `;

        // 挂载到 body 以免受 dialog 位移或 transform 影响，并确保在最顶层
        document.body.appendChild(tooltip);

        // 计算位置 (直接使用视口坐标，因为 tooltip 是 position: fixed)
        // 初始位置
        let left = event.clientX + 15;
        let top = event.clientY + 15;

        // 获取 tooltip 尺寸用于溢出检测
        const tooltipWidth = 280; // 匹配 CSS 中的 width
        const tooltipHeight = tooltip.offsetHeight || 250; 

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 防溢出处理
        if (left + tooltipWidth > viewportWidth - 10) {
            left = event.clientX - tooltipWidth - 15;
        }
        if (top + tooltipHeight > viewportHeight - 10) {
            top = event.clientY - tooltipHeight - 15;
        }

        // 确保不超出视口左侧和顶部
        if (left < 10) left = 10;
        if (top < 10) top = 10;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';

        // 动画显示
        setTimeout(() => {
            tooltip.classList.add('visible');
        }, 10);

        // 鼠标离开卡片或图标时关闭
        const closeHandler = () => {
            if (!tooltip.parentElement) return;
            tooltip.classList.remove('visible');
            setTimeout(() => tooltip.remove(), 200);
        };
        
        // 这里我们可以稍微改一下逻辑，因为是在外部 append 的
        // 我们可以通过监听一次 mouseleave 来清理
        event.target.addEventListener('mouseleave', closeHandler, { once: true });
    }

    /**
     * 更新底部批量操作条
     */
    updateBatchBar() {
        if (this.currentMode === 'mini') {
            const bar = this.dialog.querySelector('.sk-batch-bar');
            if (bar) bar.classList.remove('visible');
            return;
        }

        let bar = this.dialog.querySelector('.sk-batch-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'sk-batch-bar';
            bar.innerHTML = `
                <div class="sk-batch-info">${lang.t("sel_batch_selected_count", [0])}</div>
                <div class="sk-batch-actions">
                    <button class="sk-btn-ghost" id="sk-batch-clear" style="padding: 4px 12px; font-size: 0.85rem;">${lang.t("sel_batch_clear")}</button>
                    <button class="sk-btn-ghost" id="sk-batch-view" style="padding: 4px 12px; font-size: 0.85rem;">${lang.t("sel_batch_view")}</button>
                    <button class="sk-btn" id="sk-batch-confirm" style="padding: 4px 12px; font-size: 0.85rem;">${lang.t("sel_batch_confirm")}</button>
                </div>
            `;
            this.dialog.appendChild(bar);
            
            // 绑定事件
            bar.querySelector('#sk-batch-clear').onclick = () => {
                this.selectedItems.clear();
                // 更新所有卡片状态
                this.dialog.querySelectorAll('.sk-checkbox-container.checked').forEach(el => el.classList.remove('checked'));
                this.dialog.querySelectorAll('.sk-lora-card.selected').forEach(el => el.classList.remove('selected'));
                this.updateBatchBar();
            };

            bar.querySelector('#sk-batch-view').onclick = () => {
                // 模拟点击左侧“已选中”菜单
                const selectedLabel = this.dialog.querySelector('.sk-tree-label[data-folder="::selected::"]');
                if (selectedLabel) {
                    this.dialog.querySelectorAll('.sk-nav-item, .sk-tree-label').forEach(el => el.classList.remove('active'));
                    selectedLabel.classList.add('active');
                }
                this.renderList('', 'Special:Selected');
            };
            
            bar.querySelector('#sk-batch-confirm').onclick = () => {
                this.confirmBatchAdd();
            };
        }
        
        const count = this.selectedItems.size;
        bar.querySelector('.sk-batch-info').textContent = lang.t("sel_batch_selected_count", [count]);
        
        if (count > 0) {
            bar.classList.add('visible');
        } else {
            bar.classList.remove('visible');
        }
    }

    /**
     * 批量确认添加
     */
    confirmBatchAdd() {
        if (this.selectedItems.size === 0) return;
        
        if (this.callback) {
            for (const item of this.selectedItems.values()) {
                this.callback(item);
            }
        }
        
        this.selectedItems.clear();
        this.updateBatchBar(); // 隐藏工具条
        this.hide();
    }

    /**
     * 更新已添加状态 (用于外部通知 Selector 某些项目已被添加)
     * @param {Array<string>} addedNames - 新添加的 LoRA 名称列表 (原始名称，内部会自动归一化)
     */
    updateAddedStatus(addedNames) {
        if (!addedNames || !Array.isArray(addedNames)) return;
        
        let hasChanges = false;
        addedNames.forEach(name => {
            if (!name) return;
            const normalizedPath = name.replace(/\\/g, '/').replace(/^\/+/, '');
            if (!this.currentDataMap.has(normalizedPath)) {
                this.currentDataMap.add(normalizedPath);
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            this.refreshAddedStatus();
        }
    }

    /**
     * 仅刷新列表项的已添加状态 (避免完全重绘)
     */
    refreshAddedStatus() {
        const listContainer = this.dialog.querySelector('#sk-lora-list');
        if (!listContainer) return;
        
        // 查找所有未标记为 is-added 的卡片
        const cards = listContainer.querySelectorAll('.sk-lora-card:not(.is-added)');
        cards.forEach(card => {
            const path = card.dataset.path;
            if (path && this.currentDataMap.has(path)) {
                card.classList.add('is-added');
                
                // 覆盖点击事件
                card.onclick = (e) => {
                    e.stopPropagation();
                    if (window.SKToastManager) {
                        window.SKToastManager.warn(lang.t("sel_warn_added"));
                    }
                };
                
                // 添加 Overlay (确保插入到 image-wrapper 中)
                const wrapper = card.querySelector('.sk-card-image-wrapper');
                if (wrapper && !wrapper.querySelector('.sk-added-overlay')) {
                     const overlay = document.createElement('div');
                     overlay.className = 'sk-added-overlay';
                     overlay.innerText = (lang.t("sel_added_label") && lang.t("sel_added_label") !== "sel_added_label") ? lang.t("sel_added_label") : "ADDED";
                     wrapper.appendChild(overlay);
                }
                
                // 隐藏 Checkbox (如果有)
                const checkbox = card.querySelector('.sk-checkbox-container');
                if (checkbox) checkbox.style.display = 'none';
            }
        });
    }

    /**
     * 移除已添加状态 (用于外部通知 Selector 某些项目已被删除)
     * @param {Array<string>} removedNames - 被删除的 LoRA 名称列表
     */
    removeAddedStatus(removedNames) {
        if (!removedNames || !Array.isArray(removedNames)) return;
        
        let hasChanges = false;
        removedNames.forEach(name => {
            if (!name) return;
            const normalizedPath = name.replace(/\\/g, '/').replace(/^\/+/, '');
            if (this.currentDataMap.has(normalizedPath)) {
                this.currentDataMap.delete(normalizedPath);
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            this.refreshRemovedStatus();
        }
    }
    
    /**
     * 刷新被移除项目的状态 (恢复为可用)
     */
    refreshRemovedStatus() {
        const listContainer = this.dialog.querySelector('#sk-lora-list');
        if (!listContainer) return;
        
        // 查找所有标记为 is-added 的卡片
        const cards = listContainer.querySelectorAll('.sk-lora-card.is-added');
        cards.forEach(card => {
            const path = card.dataset.path;
            // 如果不在 currentDataMap 中，说明被删除了，需要恢复
            if (path && !this.currentDataMap.has(path)) {
                card.classList.remove('is-added');
                
                // 移除 Overlay
                const wrapper = card.querySelector('.sk-card-image-wrapper');
                const overlay = wrapper?.querySelector('.sk-added-overlay');
                if (overlay) overlay.remove();
                
                // 恢复 Checkbox
                const checkbox = card.querySelector('.sk-checkbox-container');
                if (checkbox) checkbox.style.display = '';
                
                // 恢复点击事件
                if (card._item) {
                    card.onclick = () => this.selectItem(card._item);
                }
            }
        });
    }

    /**
     * 切换多选状态
     */
    toggleMultiSelect(item, event) {
        event.stopPropagation(); // 防止触发卡片点击（单选）

        const checkbox = event.currentTarget;
        const card = checkbox.closest('.sk-lora-card');

        if (this.selectedItems.has(item.path)) {
            // 取消选中
            this.selectedItems.delete(item.path);
            checkbox.classList.remove('checked');
            if (card) card.classList.remove('selected');
        } else {
            // 选中
            this.selectedItems.set(item.path, item);
            checkbox.classList.add('checked');
            if (card) card.classList.add('selected');
        }
        
        // 更新底部状态栏 (可选)
        const statusText = this.dialog.querySelector('#sk-status-text');
        if (statusText) {
            const count = this.selectedItems.size;
            statusText.textContent = count > 0 ? lang.t("sel_status_selected_count", [count]) : lang.t("ready");
        }

        // 更新批量操作条
        this.updateBatchBar();
    }

    /**
     * 选中项目 (单选逻辑 - 保持不变，或者修改为确认当前单选并返回)
     */
    selectItem(item) {
        this.addToRecent(item.path);
        
        // 如果有多选项目，单选点击是否应该清空多选？
        // 这里的逻辑是：点击卡片本身 = 确认选择这一个并关闭窗口 (原逻辑)
        // 如果用户想多选，应该点击复选框，最后点 Confirm (需要增加 Confirm 按钮)
        // 目前需求没提到 Confirm 按钮，暂保持单选点击即返回
        
        // 但为了兼容多选返回，如果 selectedItems 不为空，也许应该一起返回？
        // 根据通常习惯，单选点击就是“只选这一个”。
        
        if (this.callback) {
            this.callback(item);
        }
        // 如果是 mini 模式，不自动关闭；Full 模式自动关闭
        if (this.currentMode === 'full') {
            this.hide();
        } else {
            // Mini 模式下给个反馈
            const statusText = this.dialog.querySelector('#sk-status-text');
            if (statusText) {
                statusText.textContent = lang.t("sel_status_selected_name", [item.name]);
                setTimeout(() => statusText.textContent = lang.t("ready"), 2000);
            }
        }
    }

    /**
     * 隐藏选择器
     */
    hide() {
        this.dialog.close();
        if (this.backdrop) this.backdrop.classList.remove('visible');
        
        // 移除可能存在的详情浮窗
        const tooltip = document.querySelector('.sk-metadata-tooltip');
        if (tooltip) tooltip.remove();

        this.callback = null;
    }
}

// 自动注册实例到 window 以便调试或全局调用
window.SKLoraSelector = SKLoraSelector;
