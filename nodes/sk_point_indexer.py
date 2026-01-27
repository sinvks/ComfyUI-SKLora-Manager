import torch
import numpy as np
import json
import os
from PIL import Image, ImageDraw, ImageFont
import folder_paths
import hashlib

class SK_PointIndexer:
    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))] if os.path.exists(input_dir) else []
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
                "points_data": ("STRING", {"default": "[]"}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "json_points")
    FUNCTION = "annotate"
    CATEGORY = "🪄 SK LoRA Manager/Tools"

    @classmethod
    def IS_CHANGED(s, image, points_data):
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
        return m.hexdigest()

    def annotate(self, image, points_data):
        from PIL import ImageOps
        try:
            pts = json.loads(points_data)
        except:
            pts = []
        if not image:
            return (torch.zeros((1, 512, 512, 3)), "[]")
        
        img_path = folder_paths.get_annotated_filepath(image)
        img = Image.open(img_path)
        img = ImageOps.exif_transpose(img) # 修复旋转
        img = img.convert("RGB")
        draw = ImageDraw.Draw(img)
        w, h = img.size
        
        r = max(int(min(w, h) * 0.025), 15)
        font = None
        for f in ["arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"]:
            try:
                font = ImageFont.truetype(f, int(r * 1.3))
                break
            except: continue
        if not font: font = ImageFont.load_default()

        for i, p in enumerate(pts):
            px, py = p['x'], p['y']
            draw.ellipse([px-r, py-r, px+r, py+r], fill=(255, 0, 0), outline=(255, 255, 255), width=int(r*0.1))
            draw.text((px, py), str(i+1), fill=(255, 255, 255), font=font, anchor="mm")

        out = torch.from_numpy(np.array(img).astype(np.float32) / 255.0)[None,]
        return (out, json.dumps(pts))

NODE_CLASS_MAPPINGS = {"SK_PointIndexer": SK_PointIndexer}
NODE_DISPLAY_NAME_MAPPINGS = {"SK_PointIndexer": "SK Point Indexer"}
