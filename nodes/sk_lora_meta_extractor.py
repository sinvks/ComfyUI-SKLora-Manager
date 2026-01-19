import torch
import json
import re
import os
import io
import folder_paths
from PIL import Image, ImageOps
import numpy as np

class SK_LoraMetaExtractor:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
                "optimize_output": ("BOOLEAN", {"default": True}),
                "compress_level": ("INT", {"default": 4, "min": 0, "max": 9, "step": 1}),
            },
            "optional": {
            }
        }

    RETURN_TYPES = ("STRING", "IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("info_json", "clean_image", "workflow_raw", "prompt_raw")
    FUNCTION = "extract"
    CATEGORY = "🪄 SK LoRA Manager"
    OUTPUT_NODE = True

    def extract(self, image, optimize_output, compress_level):
        # 1. 加载图片
        image_path = folder_paths.get_annotated_filepath(image)
        img = Image.open(image_path)
        
        # 获取原始尺寸和大小
        original_size_bytes = os.path.getsize(image_path)
        original_dimensions = img.size # (width, height)
        
        # 提取元数据文本
        metadata_text = ""
        workflow_raw_obj = {}
        
        # 新增：原始数据字符串
        workflow_raw_str = ""
        prompt_raw_str = ""
        
        if img.info:
            # 1. 尝试提取 workflow (WebP 或 PNG)
            if "workflow" in img.info:
                raw_wf = img.info["workflow"]
                if raw_wf:
                    workflow_raw_str = str(raw_wf)
                    try:
                        workflow_raw_obj = json.loads(raw_wf)
                    except:
                        workflow_raw_obj = {}
            
            # 2. 尝试提取 prompt/parameters (优先 PNG prompt，其次 A1111 parameters)
            if "prompt" in img.info:
                metadata_text = img.info["prompt"]
                prompt_raw_str = str(metadata_text)
            elif "parameters" in img.info:
                metadata_text = img.info["parameters"]
                # A1111 parameters usually considered as prompt info in this context
            elif "workflow" in img.info and not metadata_text:
                # 如果只有 workflow，尝试从 workflow 中提取 prompt 信息作为 fallback
                pass

        # 2. 处理图片 (隐私清理 + 优化)
        # 必须处理旋转
        i = ImageOps.exif_transpose(img)
        
        # 如果开启优化，模拟保存压缩
        if optimize_output:
            # 使用 BytesIO 模拟保存过程
            buffer = io.BytesIO()
            # 强制转为 RGB 以支持 JPEG/PNG 压缩参数
            # 如果原图是 PNG，我们用 PNG 保存
            save_format = "PNG"
            kwargs = {"optimize": True, "compress_level": compress_level}
            
            # 如果原图不是 PNG，可能需要调整
            if img.format and img.format.upper() != "PNG":
                # WebP 也有 lossless/quality 参数，但用户明确指定了 compress_level
                # 这里我们假设用户总是想要 PNG 输出
                pass
                
            i.save(buffer, format=save_format, **kwargs)
            buffer.seek(0)
            i = Image.open(buffer) # 重新读取，此时元数据已丢失，且经过了压缩处理

        if i.mode == 'I':
            i = i.point(lambda i: i * (1/255))
        image_tensor = i.convert("RGB")
        image_tensor = np.array(image_tensor).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_tensor)[None,]

        # 3. 解析元数据并构造全量 JSON
        parsed_data = self._parse_metadata(metadata_text)
        
        # 如果从 info 中直接读取到了 workflow，覆盖 parsed_data 中的 workflow_raw (通常 parse_metadata 也会尝试解析)
        if workflow_raw_obj:
            parsed_data["workflow_raw"] = workflow_raw_obj
            
        # 匹配本地 LoRA
        local_loras = folder_paths.get_filename_list("loras")
        lora_list_for_json = []

        if parsed_data["loras"]:
            for lora in parsed_data["loras"]:
                name = lora["name"]
                weight = lora["weight"]
                model_hash = lora.get("hash", "")
                
                matched_path = self._match_local_lora(name, model_hash, local_loras)
                
                lora_info = {
                    "name": name,
                    "weight": weight,
                    "local_path": matched_path if matched_path else None
                }
                lora_list_for_json.append(lora_info)

        # 构造最终 JSON
        full_info = {
            "base_model": parsed_data.get("base_model", "Unknown"),
            "seed": parsed_data.get("seed", -1),
            "parameters": {
                "steps": parsed_data["params"].get("steps", 0),
                "sampler": parsed_data["params"].get("sampler", "Unknown"),
                "cfg": parsed_data["params"].get("cfg", 0.0),
                "scheduler": parsed_data["params"].get("scheduler", "Unknown")
            },
            "prompts": {
                "positive": parsed_data.get("prompt", ""),
                "negative": parsed_data.get("negative_prompt", "")
            },
            "loras": lora_list_for_json,
            "image_info": {
                "width": original_dimensions[0],
                "height": original_dimensions[1],
                "size_bytes": original_size_bytes,
                "format": img.format
            },
            "workflow_raw": parsed_data.get("workflow_raw", {}),
            "api_raw": parsed_data.get("api_raw", {}),
            "raw_metadata": metadata_text if metadata_text else "No metadata found."
        }
        
        info_json = json.dumps(full_info)
        
        return {
            "ui": {
                "json": [info_json],
                "images": [
                    {
                        "filename": image,
                        "type": "input",
                        "subfolder": ""
                    }
                ]
            },
            "result": (info_json, image_tensor, workflow_raw_str, prompt_raw_str)
        }

    def _parse_metadata(self, text):
        data = {
            "prompt": "", 
            "negative_prompt": "", 
            "params": {}, 
            "loras": [], 
            "base_model": "Unknown", 
            "seed": -1,
            "workflow_raw": {},
            "api_raw": {}
        }
        if not text:
            return data

        # 尝试 ComfyUI JSON 格式 (API 格式)
        try:
            js = json.loads(text)
            if isinstance(js, dict):
                data["api_raw"] = js # API Prompt 也是一种 JSON 结构，存入 api_raw
                # 注意：如果 metadata_text 是 prompt 字段，它实际上是 api 格式
                # workflow_raw 在 extract 函数中已经单独处理了，这里不需要覆盖
                
                # 递归提取 Prompts
                pos_prompts = []
                neg_prompts = []
                
                for node_id, node in js.items():
                    class_type = node.get("class_type", "")
                    inputs = node.get("inputs", {})
                    
                    # 1. 精准提取底模 (优先逻辑)
                    if class_type == "CheckpointLoaderSimple":
                        data["base_model"] = inputs.get("ckpt_name", data["base_model"])
                    elif class_type == "UNETLoader":
                        # 如果已经有了 ckpt_name，UNETLoader 通常是同级别的，可以更新
                        data["base_model"] = inputs.get("unet_name", data["base_model"])
                    elif class_type == "CLIPLoader":
                        # 只有在还没找到主模型时，才使用 CLIP 名称
                        if data["base_model"] == "Unknown":
                            data["base_model"] = inputs.get("clip_name", "Unknown")
                    elif "CheckpointLoader" in class_type:
                        # 兜底逻辑：如果是各类 Checkpoint 加载器且目前还是 Unknown，则赋值
                        if data["base_model"] == "Unknown":
                            data["base_model"] = inputs.get("ckpt_name", "Unknown")
                    
                    # 2. 提取采样参数 (KSampler)
                    if class_type == "KSampler":
                        data["seed"] = inputs.get("seed", data["seed"])
                        data["params"]["steps"] = inputs.get("steps", data["params"].get("steps", 20))
                        data["params"]["cfg"] = inputs.get("cfg", data["params"].get("cfg", 7.0))
                        data["params"]["sampler"] = inputs.get("sampler_name", data["params"].get("sampler", "Unknown"))
                        data["params"]["scheduler"] = inputs.get("scheduler", data["params"].get("scheduler", "Unknown"))
                    
                    # 3. 提取 LoRA 信息
                    if class_type in ["LoraLoader", "LoraLoaderModelOnly", "SK_LoraLoaderManager"]:
                        if "lora_name" in inputs:
                            data["loras"].append({
                                "name": inputs["lora_name"],
                                "weight": inputs.get("strength_model", 1.0)
                            })
                    
                    # 4. 提取 Prompt (CLIPTextEncode)
                    if class_type == "CLIPTextEncode":
                        text_val = inputs.get("text", "")
                        if isinstance(text_val, str):
                            # 简单启发式：包含 "negative" 或 "bad" 的可能是负向提示词
                            if "negative" in text_val.lower() or "bad" in text_val.lower():
                                neg_prompts.append(text_val)
                            else:
                                pos_prompts.append(text_val)

                data["prompt"] = "\n".join(pos_prompts)
                data["negative_prompt"] = "\n".join(neg_prompts)
                return data
        except:
            pass

        # A1111 格式解析
        parts = text.split("Negative prompt:")
        positive = parts[0].strip()
        negative = ""
        remaining = ""
        
        if len(parts) > 1:
            neg_parts = parts[1].split("\n")
            param_line_idx = -1
            for i in range(len(neg_parts)-1, -1, -1):
                if "Steps:" in neg_parts[i]:
                    param_line_idx = i
                    break
            
            if param_line_idx != -1:
                negative = "\n".join(neg_parts[:param_line_idx]).strip()
                remaining = "\n".join(neg_parts[param_line_idx:])
            else:
                negative = parts[1].strip()
        else:
            pos_parts = positive.split("\n")
            if "Steps:" in pos_parts[-1]:
                remaining = pos_parts[-1]
                positive = "\n".join(pos_parts[:-1]).strip()

        data["prompt"] = positive
        data["negative_prompt"] = negative

        # 正则提取 LoRA: <lora:name:weight>
        lora_matches = re.findall(r"<lora:([^:]+):([^>]+)>", positive)
        for name, weight in lora_matches:
            try:
                data["loras"].append({"name": name, "weight": float(weight)})
            except: pass
        
        # 解析参数行 (Steps: 20, Sampler: Euler a, CFG scale: 7, Seed: 123, Model: ...)
        if remaining:
            # 使用更稳健的正则分割参数
            # 参数通常以 "Key: Value" 形式出现，用逗号分隔，但 Value 内部可能也有逗号（如 Size）
            param_items = re.findall(r'([^:,]+):\s*([^,]+(?:,[^,:]+)*)', remaining)
            params = {}
            for k, v in param_items:
                k = k.strip()
                v = v.strip()
                params[k] = v
                
                if k == "Model": data["base_model"] = v
                if k == "Seed": data["seed"] = v
                if k == "Steps": data["params"]["steps"] = v
                if k == "Sampler": data["params"]["sampler"] = v
                if k == "CFG scale": data["params"]["cfg"] = v

            data["params"].update(params)

        return data

    def _match_local_lora(self, name, model_hash, local_list):
        # 1. 精确路径匹配
        if name in local_list:
            return name
            
        # 2. 文件名匹配 (忽略目录)
        name_no_ext = os.path.splitext(os.path.basename(name))[0]
        for local in local_list:
            local_no_ext = os.path.splitext(os.path.basename(local))[0]
            if name_no_ext == local_no_ext:
                return local
        return None

NODE_CLASS_MAPPINGS = {
    "SK_LoraMetaExtractor": SK_LoraMetaExtractor
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SK_LoraMetaExtractor": "SK Lora Meta Extractor"
}
