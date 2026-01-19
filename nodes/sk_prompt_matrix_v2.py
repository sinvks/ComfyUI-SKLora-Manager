import random

class SK_PromptMatrix_V2:
    """
    SK Prompt Matrix Sampler V2
    功能：内置文本区域的提示词矩阵采样节点。
    每行代表一个维度，支持维度采样（顺序或随机）与段内词组随机抽取。
    """
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pick_count": ("INT", {
                    "default": 0, 
                    "min": 0, 
                    "max": 100,
                    "tooltip": "选取的行/段数，默认为0，表示选取所有"
                }),
                "sort_mode": (["Sequential (顺序)", "Random (随机)"], {
                    "default": "Sequential (顺序)",
                    "tooltip": "默认为Sequential（按行/段顺序组合），Random表示按随机顺序组合"
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

    def execute(self, pick_count, sort_mode, input_sep, output_sep, seed, raw_text):
        # 步骤 A: 预处理 - 按行切分并剔除空行
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        N = len(lines)
        
        if N == 0:
            return ("",)

        # 步骤 B: 确定实际采样数量
        # 逻辑：如果 pick_count 为 0 或超过总行数 N，则自动封顶为 N
        if pick_count <= 0 or pick_count > N:
            actual_count = N
        else:
            actual_count = pick_count

        # 步骤 C: 索引采样与排序
        # 使用传入的 seed 初始化局部随机数生成器，确保结果确定性
        rng = random.Random(seed)
        
        if sort_mode.startswith("Sequential"):
            # 顺序模式：直接选取前 actual_count 个索引
            selected_indices = list(range(actual_count))
        else:
            # 随机模式：从 0..N-1 的索引中随机抽取 actual_count 个不重复的索引
            selected_indices = rng.sample(range(N), actual_count)

        # 步骤 D: 段内随机选词
        final_selected_words = []
        for idx in selected_indices:
            line_content = lines[idx]
            
            # 按分隔符切分备选项并清洗
            if input_sep:
                options = [opt.strip() for opt in line_content.split(input_sep) if opt.strip()]
            else:
                options = [line_content]

            if options:
                # 从该行的备选项中随机抽取一个词
                chosen_word = rng.choice(options)
                final_selected_words.append(chosen_word)

        # 步骤 E: 组装拼接
        result = output_sep.join(final_selected_words).strip()

        return (result,)

NODE_CLASS_MAPPINGS = {
    "SK_PromptMatrix_V2": SK_PromptMatrix_V2
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SK_PromptMatrix_V2": "SK Prompt Matrix Sampler V2"
}
