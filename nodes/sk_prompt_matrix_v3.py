import random
import re

class SK_PromptMatrix_V3:
    """
    SK Prompt Matrix Sampler V3
    功能：精确索引控制版提示词矩阵采样节点。
    支持通过行号（pick_ids）精确选择参与组合的行。
    """
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pick_ids": ("STRING", {
                    "default": "0", 
                    "tooltip": "所选行/段序号，格式为“1,2,3”，输入0表示所有行/段"
                }),
                "sort_mode": (["Sequential (顺序)", "Random (随机)"], {
                    "default": "Sequential (顺序)",
                    "tooltip": "默认为Sequential（按pick_ids顺序组合），Random表示按随机顺序组合"
                }),
                "input_sep": ("STRING", {
                    "default": "|",
                    "tooltip": "输入文本的分隔符"
                }),
                "output_sep": ("STRING", {
                    "default": ", ",
                    "tooltip": "输出文本的分隔符"
                }),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "raw_text": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "execute"
    CATEGORY = "🪄 SK LoRA Manager/Prompt"

    def execute(self, pick_ids, sort_mode, input_sep, output_sep, seed, raw_text):
        # 步骤 1: 文本预处理 - 按行切分并剔除空行
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        N = len(lines)
        
        if N == 0:
            return ("",)

        # 步骤 2: 解析 pick_ids
        # 使用正则表达式提取所有数字，支持中英文逗号、空格、分号等分隔符
        id_strings = re.findall(r'\d+', pick_ids)
        user_indices = [int(i) for i in id_strings]

        # 逻辑处理
        selected_indices = []
        if 0 in user_indices or not user_indices:
            # 逻辑 A: 包含 0 或解析为空，则选定所有索引
            selected_indices = list(range(N))
        else:
            # 逻辑 B: 过滤无效索引（1-based 转换为 0-based）
            for idx in user_indices:
                if 1 <= idx <= N:
                    selected_indices.append(idx - 1)
            
            # 如果过滤后为空，回退到全选
            if not selected_indices:
                selected_indices = list(range(N))

        # 步骤 3: 排序与采样
        rng = random.Random(seed)
        if sort_mode.startswith("Sequential"):
            # 顺序模式：保持用户输入的 pick_ids 原始顺序
            pass
        else:
            # 随机模式：随机打乱选定的行顺序
            rng.shuffle(selected_indices)

        # 步骤 4: 段内随机选词
        final_selected_words = []
        for idx in selected_indices:
            line_content = lines[idx]
            
            # 按分隔符切分备选项并清洗
            if input_sep:
                options = [opt.strip() for opt in line_content.split(input_sep) if opt.strip()]
            else:
                options = [line_content]

            if options:
                # 从该行的备选项中随机抽取一个词（使用 rng 保证可复现）
                chosen_word = rng.choice(options)
                final_selected_words.append(chosen_word)

        # 步骤 5: 组装拼接
        result = output_sep.join(final_selected_words).strip()

        return (result,)

NODE_CLASS_MAPPINGS = {
    "SK_PromptMatrix_V3": SK_PromptMatrix_V3
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SK_PromptMatrix_V3": "SK Prompt Matrix Sampler V3"
}
