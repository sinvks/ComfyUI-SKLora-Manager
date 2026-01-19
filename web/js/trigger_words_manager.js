// 修改时间：2025-12-30 22:57:15 - 修复：完全补全截断与长度逻辑
import ToastManager from "./common/toast_manager.js";
import { lang } from "./common/lang.js";

export const TagManager = {
    escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>\"']/g, m => ({'&': '&amp;','<': '&lt;','>': '&gt;','\"': '&quot;',"'": '&#39;'})[m]);
    },

    getCharLength(str) {
        return str.replace(/[^\x00-\xff]/g, "xx").length;
    },

    truncate(str, limit = 16) {
        if (this.getCharLength(str) <= limit) return str;
        let len = 0, result = "";
        for (let char of str) {
            len += /[^\x00-\xff]/.test(char) ? 2 : 1;
            if (len > limit) break;
            result += char;
        }
        return result + "...";
    },

    renderUserTags(container, path, tagsArray, onUpdate) {
        const tags = Array.isArray(tagsArray) ? tagsArray : [];
        tags.forEach((tag, index) => {
            const span = document.createElement("span");
            span.className = "lora-tag tag-user";
            span.innerHTML = `${this.escapeHTML(this.truncate(tag))} <i style="cursor:pointer;margin-left:4px;opacity:0.6">×</i>`;
            span.title = tag;
            span.querySelector("i").onclick = (e) => {
                e.stopPropagation();
                onUpdate(path, { tags: tags.filter((_, i) => i !== index) });
            };
            container.appendChild(span);
        });

        const addBtn = document.createElement("span");
        addBtn.className = "lora-tag";
        addBtn.style.cssText = "border:1px dashed #475569; color:#94a3b8; cursor:pointer";
        addBtn.innerText = "+";
        addBtn.onclick = (e) => {
            e.stopPropagation();
            const val = prompt(lang.t('enter_tag_name'));
            if (val && val.trim()) {
                const trimmed = val.trim();
                if (this.getCharLength(trimmed) > 52) { 
                    ToastManager.error(lang.t('tag_too_long')); 
                    return; 
                }
                onUpdate(path, { tags: [...tags, trimmed] });
            }
        };
        container.appendChild(addBtn);
    },


};