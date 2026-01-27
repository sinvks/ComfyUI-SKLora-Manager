import torch
import numpy as np
import json
import base64
import io
import os
from PIL import Image, ImageDraw, ImageFont
import folder_paths

class SK_InteractiveEditor:
    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = []
        if os.path.exists(input_dir):
            for root, dirs, filenames in os.walk(input_dir):
                for f in filenames:
                    if os.path.isfile(os.path.join(root, f)):
                        rel_path = os.path.relpath(os.path.join(root, f), input_dir)
                        rel_path = rel_path.replace("\\", "/")
                        files.append(rel_path)
        
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
                "points_data": ("STRING", {"default": "[]"}),
                "mask_data": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "IMAGE", "IMAGE", "STRING")
    RETURN_NAMES = ("images", "mask", "image_doodle", "image_points", "json_points")
    FUNCTION = "process"
    CATEGORY = "🪄 SK LoRA Manager/Tools"

    def process(self, image, points_data, mask_data):
        from PIL import ImageOps
        if not image:
            empty_img = torch.zeros((1, 512, 512, 3))
            empty_mask = torch.zeros((1, 512, 512))
            return (empty_img, empty_mask, empty_img, empty_img, "[]")

        image_path = folder_paths.get_annotated_filepath(image)
        base_pil = Image.open(image_path)
        base_pil = ImageOps.exif_transpose(base_pil) # 修复旋转
        base_pil = base_pil.convert("RGB")
        w, h = base_pil.size

        # 1. 准备涂鸦层和 Mask 层
        doodle_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        mask_only = Image.new("L", (w, h), 0)
        
        if mask_data and "," in mask_data:
            try:
                # 兼容不同格式的 Base64 头部
                encoded = mask_data.split(",")[1]
                m_bytes = base64.b64decode(encoded)
                m_layer = Image.open(io.BytesIO(m_bytes)).convert("RGBA")
                if m_layer.size != (w, h):
                    m_layer = m_layer.resize((w, h), Image.Resampling.LANCZOS)
                
                doodle_layer = m_layer
                # 将 Alpha 通道作为标准 Mask
                mask_only = m_layer.split()[3]
            except Exception as e:
                pass

        # 2. 准备点位绘制函数
        def draw_points(img_pil, pts_list):
            if not pts_list:
                return img_pil
            
            # 确保在 RGB 上绘制
            if img_pil.mode != "RGB":
                img_pil = img_pil.convert("RGB")
                
            draw = ImageDraw.Draw(img_pil)
            r = max(int(min(w, h) * 0.015), 10)
            
            # 字体大小根据半径动态调整
            f_size = int(r * 1.3)
            try:
                # 尝试加载中文字体
                font = ImageFont.truetype("arial.ttf", f_size)
            except:
                try:
                    font = ImageFont.load_default(size=f_size)
                except:
                    font = ImageFont.load_default()
            
            for i, pt in enumerate(pts_list):
                try:
                    # 整数像素坐标
                    px, py = float(pt['x']), float(pt['y'])
                    # 绘制红圈 (填充红色)
                    draw.ellipse([px-r, py-r, px+r, py+r], fill=(255, 0, 0), outline=(255, 255, 255), width=2)
                    # 绘制序号
                    draw.text((px, py), str(i+1), fill=(255, 255, 255), font=font, anchor="mm")
                except Exception as e:
                    pass
            return img_pil

        # 解析点位
        try:
            pts = json.loads(points_data)
        except:
            pts = []

        # --- 合成输出 1: images (原图 + 标注点 + 涂鸦) ---
        img_all = base_pil.copy()
        img_all.paste(doodle_layer, (0, 0), doodle_layer)
        img_all = draw_points(img_all, pts)

        # --- 输出 2: mask (ComfyUI 标准 MASK) ---
        mask_tensor = torch.from_numpy(np.array(mask_only).astype(np.float32) / 255.0)[None,]

        # --- 合成输出 3: image_doodle (原图 + 涂鸦) ---
        img_doodle = base_pil.copy()
        img_doodle.paste(doodle_layer, (0, 0), doodle_layer)

        # --- 合成输出 4: image_points (原图 + 标注点) ---
        img_points = draw_points(base_pil.copy(), pts)

        # --- 辅助转换函数 ---
        def pil_to_tensor(pil_img):
            return torch.from_numpy(np.array(pil_img).astype(np.float32) / 255.0)[None,]

        return (
            pil_to_tensor(img_all),
            mask_tensor,
            pil_to_tensor(img_doodle),
            pil_to_tensor(img_points),
            json.dumps(pts)
        )

    @classmethod
    def IS_CHANGED(s, image, points_data, mask_data):
        import hashlib
        import folder_paths
        import time
        import os

        m = hashlib.sha256()
        try:
            image_path = folder_paths.get_annotated_filepath(image)
            if os.path.exists(image_path):
                for _ in range(3):
                    try:
                        with open(image_path, 'rb') as f:
                            m.update(f.read())
                        break
                    except PermissionError:
                        time.sleep(0.1)
            else:
                m.update(image.encode())
        except Exception:
            m.update(image.encode())

        m.update(points_data.encode())
        m.update(mask_data.encode())
        return m.hexdigest()

NODE_CLASS_MAPPINGS = {"SK_InteractiveEditor": SK_InteractiveEditor}
NODE_DISPLAY_NAME_MAPPINGS = {"SK_InteractiveEditor": "SK Interactive Editor"}
