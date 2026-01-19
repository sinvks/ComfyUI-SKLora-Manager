class SK_LoraMetaInspector:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "info_json": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "inspect"
    CATEGORY = "🪄 SK LoRA Manager"
    OUTPUT_NODE = True

    def inspect(self, info_json):
        # 直接透传 JSON 到前端
        return {"ui": {"json": [info_json]}}
