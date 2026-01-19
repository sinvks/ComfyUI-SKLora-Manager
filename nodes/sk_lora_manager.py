import json
import folder_paths
import comfy.sd
import comfy.utils

class SK_LoraLoaderManager:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
            },
            "optional": {
                "clip": ("CLIP",),
                # 将 lora_stack 移至 optional，防止 ComfyUI 强制要求外部连线
                # 取消 multiline 以保持前端显示为 1 行
                "lora_stack": ("STRING", {"default": "{}", "multiline": False, "forceInput": False}),
                "selector_mode": (
                    ["Side Drawer (侧边抽屉)", "Top Panel (顶部筛选)", "Floating Tool (悬浮工具)"],
                    {"default": "Side Drawer (侧边抽屉)"}
                ),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "trigger_words", "loaded_loras")
    FUNCTION = "execute"
    CATEGORY = "🪄 SK LoRA Manager"

    @classmethod
    def IS_CHANGED(s, lora_stack, **kwargs):
        # [FIX] 增强物理文件感知：除了哈希字符串，还需遍历文件修改时间
        import hashlib
        import os
        import json
        
        m = hashlib.sha256()
        m.update(lora_stack.encode('utf-8'))
        
        try:
            data = json.loads(lora_stack)
            items = []
            if isinstance(data, dict):
                items = data.get("loras", [])
            elif isinstance(data, list):
                items = data
            
            for item in items:
                if not item.get("on", True): continue
                name = item.get("name")
                if not name: continue
                
                # 获取物理路径
                path = folder_paths.get_full_path("loras", name)
                if path and os.path.exists(path):
                    # 加入文件修改时间，确保替换文件后能触发刷新
                    mtime = os.path.getmtime(path)
                    m.update(str(mtime).encode('utf-8'))
        except:
            pass
            
        return m.hexdigest()

    def execute(self, model, lora_stack="{}", clip=None, **kwargs):
        import os
        
        # [FIX] 解决模型污染：立即克隆以隔离状态
        current_model = model.clone()
        current_clip = clip.clone() if clip is not None else None
        
        # 预校验 lora_stack
        if not lora_stack or not isinstance(lora_stack, str) or lora_stack.strip() in ["", "[]", "{}"]:
            return (current_model, current_clip, "", "")

        try:
            data = json.loads(lora_stack)
            if isinstance(data, dict):
                global_on = data.get("global_on", True)
                items = data.get("loras", [])
            elif isinstance(data, list):
                global_on = True
                items = data
            else:
                return (current_model, current_clip, "", "")
        except Exception as e:
            print(f"\033[33m[SK-LoRA] [System] JSON 解析错误: {e}\033[0m")
            # 如果解析失败，可能是旧版数据或格式错误，返回原样
            return (current_model, current_clip, "", "")

        # --- 全局拦截逻辑 (Master Switch) ---
        if not global_on:
            print("[SK-LoRA] [System] 全局开关已关闭，跳过所有 LoRA。")
            return (current_model, current_clip, "", "")

        trigger_words = []
        lora_tags = []

        # 获取所有可用的 LoRA 列表用于校验
        available_loras = folder_paths.get_filename_list("loras")

        for i, item in enumerate(items):
            if not item.get("on", True): continue
            
            lora_name = item.get("name")
            if not lora_name: continue

            # 使用 os.path.normpath 处理路径宽容度
            lora_name = os.path.normpath(lora_name)

            # 校验文件是否存在
            lora_path = folder_paths.get_full_path("loras", lora_name)
            if not lora_path:
                # 尝试模糊匹配：如果用户只提供了文件名而没有后缀，或者路径斜杠不一致
                found = False
                for available in available_loras:
                    if os.path.normpath(available) == lora_name or os.path.basename(available) == lora_name:
                        lora_path = folder_paths.get_full_path("loras", available)
                        lora_name = available
                        found = True
                        break
                
                if not found:
                    print(f"\033[31m[SK-LoRA] [System] 未找到 LoRA: {lora_name}\033[0m")
                    continue

            strength_model = float(item.get("strength_model", item.get("strength", 1.0)))
            strength_clip = float(item.get("strength_clip", strength_model))
            tags = item.get("tags", "")
            
            # 确保 tags 是字符串
            if isinstance(tags, list):
                tags = ", ".join([str(t) for t in tags])
            elif not isinstance(tags, str):
                tags = str(tags) if tags is not None else ""

            # 加载 LoRA 并进行 Patch
            try:
                print(f"[SK-LoRA] [System] 正在注入 LoRA [{i+1}/{len(items)}]: {lora_name} (M:{strength_model}, C:{strength_clip})")
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                
                # 显式捕获 Patch 后的模型状态
                patched_model, patched_clip = comfy.sd.load_lora_for_models(
                    current_model, current_clip, lora, strength_model, strength_clip
                )
                
                if patched_model is None:
                    print(f"\033[31m[SK-LoRA] [System] 警告：模型注入失败 {lora_name}\033[0m")
                else:
                    current_model = patched_model
                
                if patched_clip is None and current_clip is not None:
                    print(f"\033[31m[SK-LoRA] [System] 警告：CLIP 注入失败 {lora_name}，保留上一个 CLIP 状态\033[0m")
                else:
                    current_clip = patched_clip

            except Exception as e:
                print(f"\033[31m[SK-LoRA] [System] 加载 {lora_name} 时发生运行时错误: {e}\033[0m")
                continue

            if tags: trigger_words.append(tags)
            clean_name = os.path.basename(lora_name).rsplit('.', 1)[0]
            # 格式化输出: <lora:name:model_weight:clip_weight>
            lora_tags.append(f"<lora:{clean_name}:{round(strength_model, 2)}:{round(strength_clip, 2)}>")

        return (current_model, current_clip, ", ".join(trigger_words), " ".join(lora_tags))
