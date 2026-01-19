import re

class SK_MergePrompt:
    @classmethod
    def INPUT_TYPES(s):
        optional_inputs = {f"string_{i}": ("STRING", {"forceInput": True}) for i in range(3, 21)}
        return {
            "required": {
                "string_1": ("STRING", {"forceInput": True}),
                "string_2": ("STRING", {"forceInput": True}),
            },
            "optional": {
                **optional_inputs,
                "input_count": ("INT", {"default": 2, "min": 2, "max": 20, "tooltip": "修改接入提示词的数量。使用时先修改数量，再点击底部的【修改提示词接入数量】。"}),
                
                # 预设分隔符下拉菜单
                "preset_sep": (
                    ["Comma (逗号 ,)", "Period (句号 .)", "Pipe (竖线 |)", "Newline (换行 \\n)"],
                    {"default": "Pipe (竖线 |)", "tooltip": "选择一个预设分隔符。若自定义分隔符不为空，则此选项被忽略。"},
                ),
                
                # 自定义分隔符输入框
                "custom_sep": ("STRING", {"default": "", "multiline": False, "tooltip": "输入自定义分隔符。若此项不为空，则使用此分隔符。"}),
                
                "remove_newlines": ("BOOLEAN", {"default": False, "label_on": "Yes", "label_off": "No", "tooltip": "移除换行符"}),
                "remove_empty_lines": ("BOOLEAN", {"default": False, "label_on": "Yes", "label_off": "No", "tooltip": "移除空行"}),
                
                # 选项名称：分隔符独立成段
                "sep_as_segment": ("BOOLEAN", {"default": False, "label_on": "Yes", "label_off": "No", "tooltip": "如果勾选，合并后的每个【提示词输入框】片段将由换行符 + 分隔符 + 换行符连接。此时，输入框内部的分隔符将不会被用于拆分。如果分隔符本身是换行，则使用双换行符连接（\\n\\n）。"}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "merge"
    CATEGORY = "🪄 SK LoRA Manager/Prompt"

    def merge(
        self,
        string_1,
        string_2,
        input_count=2, 
        preset_sep="Pipe (竖线 |)",
        custom_sep="", 
        remove_newlines=False,
        remove_empty_lines=False,
        sep_as_segment=False,
        **kwargs,
    ):
        # 1. 确定最终使用的分隔符 (sep)
        separator_map = {
            "Comma (逗号 ,)": ",",
            "Period (句号 .)": ".",
            "Pipe (竖线 |)": "|",
            "Newline (换行 \\n)": "\n",
        }
        
        if custom_sep:
            selected_sep = custom_sep
        else:
            selected_sep = separator_map.get(preset_sep, "|") 

        sep = selected_sep or "" 
        
        # 2. 预处理前两个提示词
        t1 = string_1 or ""
        t2 = string_2 or ""
        
        # 将 分隔符独立成段 标志传入 split_by，以控制是否进行内部拆分
        def split_by(value, is_independent_segment):
            items = value if isinstance(value, (list, tuple)) else [value]
            out = []
            for item in items:
                s = "" if item is None else str(item)
                
                # 统一换行符 (跨平台兼容性)
                s = s.replace("\r\n", "\n").replace("\r", "\n") 
                
                # 先移除空行（仅删除纯空白行，保留非空行）
                if remove_empty_lines:
                    s = "\n".join([ln for ln in s.split("\n") if ln.strip()])
                
                # 再根据需求移除换行符 (转换为 ' ')
                if remove_newlines:
                    s = s.replace("\n", " ")

                # 核心处理逻辑：
                if is_independent_segment:
                    # 将整个输入视为一个 Token，清理首尾空白
                    s_stripped = s.strip()
                    if s_stripped or not remove_empty_lines:
                        out.append(s_stripped)
                else:
                    # 默认逻辑：按分隔符进行拆分
                    # 改进：如果分隔符是逗号或句号，同时支持中英文全半角格式
                    if sep == ",":
                        parts = re.split(r"[,，]", s)
                    elif sep == ".":
                        parts = re.split(r"[.。]", s)
                    else:
                        parts = s.split(sep) if sep else s.split()
                    for p in parts:
                        p = p.strip()
                        if p or not remove_empty_lines:
                            out.append(p)
            return out

        # 3. 收集所有提示词片段
        tokens = []
        tokens.extend(split_by(t1, sep_as_segment))
        tokens.extend(split_by(t2, sep_as_segment))
        
        for i in range(3, 21):
            key = f"string_{i}"
            if key in kwargs:
                val = kwargs.get(key, "") or ""
                tokens.extend(split_by(val, sep_as_segment))

        if remove_empty_lines:
            # 最终清理，移除任何空字符串
            tokens = [x for x in tokens if x.strip()]

        # 4. 执行合并
        if sep_as_segment: 
            if sep == "\n":
                 # 特殊情况：分隔符是换行，使用双换行符 (\n\n) 隔离段落
                 joiner = "\n\n"
            else:
                 # 否则，使用 换行 + 分隔符 + 换行 (\nsep\n)
                 joiner = "\n" + sep + "\n"
        else:
             # 默认行为：只使用分隔符本身
             joiner = sep or " " 
             
        result = joiner.join(tokens)
        
        return (result,)

NODE_CLASS_MAPPINGS = {"SK_MergePrompt": SK_MergePrompt}
NODE_DISPLAY_NAME_MAPPINGS = {"SK_MergePrompt": "SK Merge Prompt"}
