import { Icons } from "./icons.js";

/**
 * 全局Toast管理器
 * 提供统一的提示消息显示功能
 */
class ToastManager {
    constructor() {
        // 单例模式
        if (ToastManager.instance) {
            return ToastManager.instance;
        }
        
        this.toasts = [];
        this.container = null;
        this.maxToasts = 5; // 最大同时显示的toast数量
        this.defaultDuration = 3000; // 默认显示时间（毫秒）
        
        this._init();
        ToastManager.instance = this;
    }
    
    /**
     * 初始化Toast容器
     * @private
     */
    _init() {
        // 创建容器元素
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .toast-container { position: fixed; top: 20px; left: 20px; z-index: 10001; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
            .toast { min-width: 250px; max-width: 400px; padding: 12px 16px; border-radius: 8px; color: white; font-size: 14px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); opacity: 0; transform: translateX(-100%); transition: all 0.3s ease; pointer-events: auto; display: flex; align-items: center; gap: 10px; }
            .toast.show { opacity: 1; transform: translateX(0); }
            .toast.hide { opacity: 0; transform: translateX(-100%); }
            .toast-icon { flex-shrink: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
            .toast-message { flex-grow: 1; }
            .toast-close { flex-shrink: 0; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255, 255, 255, 0.1); }
            .toast-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.2); }
            .toast.success { background-color: #10b981; }
            .toast.error { background-color: #ef4444; }
            .toast.warning { background-color: #f59e0b; }
            .toast.info { background-color: #3b82f6; }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.container);
    }
    
    /**
     * 显示Toast消息
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 (success, error, warning, info)
     * @param {number} duration - 显示时间（毫秒），0表示不自动关闭
     * @returns {Object} Toast对象
     */
    show(message, type = 'info', duration = this.defaultDuration) {
        // 检查是否超过最大显示数量
        if (this.toasts.length >= this.maxToasts) {
            this.toasts[0].close();
        }
        
        // 创建Toast元素
        const toastElement = document.createElement('div');
        toastElement.className = `toast ${type}`;
        
        // 添加图标
        const iconElement = document.createElement('div');
        iconElement.className = 'toast-icon';
        iconElement.innerHTML = this._getIcon(type);
        
        // 添加消息
        const messageElement = document.createElement('div');
        messageElement.className = 'toast-message';
        messageElement.textContent = message;
        
        // 添加关闭按钮
        const closeElement = document.createElement('div');
        closeElement.className = 'toast-close';
        closeElement.innerHTML = Icons.get('x', '', 14);
        closeElement.addEventListener('click', () => {
            toast.close();
        });
        
        // 组装元素
        toastElement.appendChild(iconElement);
        toastElement.appendChild(messageElement);
        toastElement.appendChild(closeElement);
        
        // 添加到容器
        this.container.appendChild(toastElement);
        
        // 创建Toast对象
        const toast = {
            element: toastElement,
            type,
            message,
            close: () => {
                this._removeToast(toast);
            }
        };
        
        // 添加到列表
        this.toasts.push(toast);
        
        // 显示动画
        setTimeout(() => {
            toastElement.classList.add('show');
        }, 10);
        
        // 自动关闭
        if (duration > 0) {
            setTimeout(() => {
                toast.close();
            }, duration);
        }
        
        return toast;
    }
    
    /**
     * 获取类型对应的图标
     * @param {string} type - 消息类型
     * @returns {string} 图标HTML
     * @private
     */
    _getIcon(type) {
        const icons = {
            success: Icons.get('check', '', 18),
            error: Icons.get('x', '', 18),
            warning: Icons.get('alert_triangle', '', 18),
            info: Icons.get('info', '', 18)
        };
        return icons[type] || icons.info;
    }
    
    /**
     * 移除Toast
     * @param {Object} toast - Toast对象
     * @private
     */
    _removeToast(toast) {
        const index = this.toasts.indexOf(toast);
        if (index > -1) {
            this.toasts.splice(index, 1);
        }
        
        // 添加隐藏动画
        toast.element.classList.add('hide');
        
        // 动画结束后移除元素
        setTimeout(() => {
            if (toast.element.parentNode) {
                toast.element.parentNode.removeChild(toast.element);
            }
        }, 300);
    }
    
    /**
     * 显示成功消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时间（毫秒）
     */
    success(message, duration = this.defaultDuration) {
        return this.show(message, 'success', duration);
    }
    
    /**
     * 显示错误消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时间（毫秒）
     */
    error(message, duration = this.defaultDuration) {
        return this.show(message, 'error', duration);
    }
    
    /**
     * 显示警告消息 (兼容别名)
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时间（毫秒）
     */
    warning(message, duration = this.defaultDuration) {
        return this.show(message, 'warning', duration);
    }
    
    warn(message, duration = this.defaultDuration) {
        return this.warning(message, duration);
    }
    
    /**
     * 显示信息消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时间（毫秒）
     */
    info(message, duration = this.defaultDuration) {
        return this.show(message, 'info', duration);
    }
    
    /**
     * 清除所有Toast
     */
    clearAll() {
        // 复制数组以避免在迭代过程中修改
        const toasts = [...this.toasts];
        toasts.forEach(toast => {
            toast.close();
        });
    }
    
    /**
     * 获取单例实例
     * @returns {ToastManager} Toast管理器实例
     */
    static getInstance() {
        if (!ToastManager.instance) {
            ToastManager.instance = new ToastManager();
        }
        return ToastManager.instance;
    }
}

// 导出单例实例
export default ToastManager.getInstance();