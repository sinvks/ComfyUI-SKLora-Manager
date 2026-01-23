import os
import sys
import json
import re
import hashlib
import asyncio
import zipfile
import io
import shutil
import folder_paths
from PIL import Image
from aiohttp import web
from server import PromptServer
import requests

# 导入 cv2 用于视频处理（可选依赖）
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

# 尝试导入 BeautifulSoup
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# 导入自定义模块
from . import lora_db_manager
from . import civitai_helper
from . import sk_health_manager
from . import llm_providers

db_manager = lora_db_manager.db_manager
CivitaiHelper = civitai_helper.CivitaiHelper
health_manager = sk_health_manager.SKHealthManager(db_manager)
routes = PromptServer.instance.routes

# 路径配置
current_dir = os.path.dirname(os.path.realpath(__file__))
# 建议将设置文件放在插件根目录下的 data 文件夹
SETTINGS_FILE = os.path.join(os.path.dirname(current_dir), "data", "lora_manager_settings.json")
BASEMODEL_SETTINGS_FILE = os.path.join(os.path.dirname(current_dir), "data", "basemodel_settings.json")

# --- 注册静态资源路由映射，解决预览图访问问题 ---
try:
    if hasattr(db_manager, 'lora_base_dir') and os.path.exists(db_manager.lora_base_dir):
        # 允许前端通过 /sk_view_lora/ 访问本地 LoRA 目录下的图片
        routes.static("/sk_view_lora/", db_manager.lora_base_dir, show_index=False)
        # print(f"[SK-LoRA] [System] 静态路由注册成功: /sk_view_lora/")
except Exception as e:
    print(f"[SK-LoRA] [System] 静态路由注册失败: {e}")

def get_local_settings():
    """
    获取插件的本地设置。

    返回:
        dict: 包含所有配置项的字典，如果文件不存在则返回默认值。
    """
    settings = {
        "civitai_key": "", 
        "proxy": "", 
        "img_mode": "missing",
        "nsfw_img_mode": "blur",
        "nsfw_allow_level": 1,
        "sync_weight": True,     # 默认开启权重同步
        "sync_sampler": True,    # 默认开启采样器同步
        "sync_triggers": "merge", # 默认使用合并模式
        "check_update": True,
        "video_frame": True,
        "allow_civitai_basemodel_edit": False,
        "model_card_title_source": "civitai",
        "visible_system_names": ["Qwen", "Z Image Turbo", "Flux.1 D", "Flux.1 Kontext", "Flux.1 Krea", "Flux.2 D", "NoobAI", "Pony", "Wan Video 2.2 T2V-A14B", "Wan Video 2.2 I2V-A14B", "Hunyuan Video", "SD 1.5", "Illustrious", "Other" ],
        "comparer": True,
        "llm_activate": False
    }
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                settings.update(json.load(f))
        except: pass
    return settings

def strip_html(html_str):
    """
    移除 HTML 标签并转换常见实体。

    参数:
        html_str: 需要处理的 HTML 字符串。
    返回:
        str: 纯文本字符串。
    """
    if not html_str:
        return ""
    # 替换 <br> 和 <p> 为换行
    s = re.sub(r"<(br|p|/p)[^>]*>", "\n", html_str)
    # 移除所有其他标签
    s = re.sub(r"<[^>]+>", "", s)
    # 实体转换 (简单处理)
    s = s.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"')
    # 压缩多余换行并去除首尾空白
    return "\n".join([line.strip() for line in s.splitlines() if line.strip()])

def save_local_settings(settings):
    """
    保存设置到本地 JSON 文件。

    参数:
        settings: 需要保存的设置字典。
    返回:
        bool: 是否保存成功。
    """
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        
        # 读取现有设置（如果存在）
        existing_settings = {}
        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                    existing_settings = json.load(f)
            except:
                pass
        
        # 更新设置
        existing_settings.update(settings)
        
        # 保存到文件
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(existing_settings, f, indent=2, ensure_ascii=False)
        
        return True
    except Exception as e:
        print(f"[SK-LoRA] [System] 设置保存失败: {e}")
        return False

# --- 辅助函数 ---

def is_path_safe(base_path, target_path):
    """
    校验 target_path 是否位于 base_path 内部，防止路径穿越攻击。

    参数:
        base_path: 基准根目录。
        target_path: 目标相对或绝对路径。
    返回:
        bool: 路径是否安全。
    """
    try:
        # 获取绝对路径
        base_abs = os.path.abspath(base_path)
        # 如果是相对路径，拼接到 base 后再取绝对路径
        if not os.path.isabs(target_path):
            target_abs = os.path.abspath(os.path.join(base_abs, target_path))
        else:
            target_abs = os.path.abspath(target_path)
        
        # 检查 target_abs 是否以 base_abs 开头
        return os.path.commonpath([base_abs, target_abs]) == base_abs
    except:
        return False

def get_or_create_thumbnail(img_rel_path, model_rel_path, model_hash):
    """
    内部辅助函数：获取或创建缩略图。如果缓存不存在，则从原图生成。

    参数:
        img_rel_path: 图片相对于 LoRA 根目录的路径。
        model_rel_path: 模型相对于 LoRA 根目录的路径。
        model_hash: 模型哈希值，用于缓存命名。
    返回:
        str: 缩略图文件路径或原图路径，失败返回 None。
    """
    try:
        if not img_rel_path:
            return None

        # 1. 定位原图
        base_dir = getattr(db_manager, 'lora_base_dir', None)
        if not base_dir:
            base_dir = folder_paths.get_folder_paths("loras")[0]
        
        # 安全性校验：确保 img_rel_path 不会跳出 base_dir
        if not is_path_safe(base_dir, img_rel_path):
            print(f"[SK-LoRA] [Security] 拦截到越权访问尝试: {img_rel_path}")
            return None

        full_img_path = os.path.join(base_dir, img_rel_path)
        if not os.path.exists(full_img_path):
            return None

        # 2. 定位缓存目录
        cache_dir = os.path.join(os.path.dirname(current_dir), "data", "cache", "thumbs")
        os.makedirs(cache_dir, exist_ok=True)
        
        # 3. 检查缓存
        # 命名规则订正: {hash[:12]}_{path_md5[:8]}.webp
        h12 = (model_hash or "unknown")[:12]
        p8 = hashlib.md5(model_rel_path.encode('utf-8')).hexdigest()[:8] if model_rel_path else "unknown"
        cache_filename = f"{h12}_{p8}.webp"
        cache_file = os.path.join(cache_dir, cache_filename)

        # 这里的 mtime 校验逻辑：如果缓存已存在，但原图修改时间晚于缓存修改时间，则重新生成
        if os.path.exists(cache_file):
            if os.path.getmtime(full_img_path) <= os.path.getmtime(cache_file):
                return cache_file
        
        # 4. 生成缩略图
        try:
            with Image.open(full_img_path) as img:
                w, h = img.size
                new_w = 300
                new_h = int(h * (new_w / w))
                thumb = img.resize((new_w, new_h), Image.LANCZOS)
                if thumb.mode in ("RGBA", "P"):
                    thumb = thumb.convert("RGBA")
                else:
                    thumb = thumb.convert("RGB")
                thumb.save(cache_file, "WEBP", quality=80)
            return cache_file
        except Exception as img_err:
            print(f"[SK-LoRA] [System] 缩略图生成失败: {img_err}")
            return full_img_path

    except Exception as e:
        print(f"[SK-LoRA] [System] 缩略图获取异常: {e}")
        return None

@routes.get("/api/sk_manager/get_thumb")
async def get_thumb(request):
    """
    API 接口: 获取 LoRA 缩略图。

    参数:
        request: aiohttp 请求对象，包含 query 参数 (path, model_path, hash)。
    返回:
        web.FileResponse: 缩略图文件响应。
    """
    try:
        img_rel_path = request.query.get("path", "")
        model_rel_path = request.query.get("model_path", "")
        model_hash = request.query.get("hash", "")
        
        if not img_rel_path:
            return web.Response(status=400)

        cache_file = get_or_create_thumbnail(img_rel_path, model_rel_path, model_hash)
        if cache_file and os.path.exists(cache_file):
            return web.FileResponse(cache_file)
        
        return web.Response(status=404)

    except Exception as e:
        print(f"[SK-LoRA] [System] 获取缩略图失败: {e}")
        return web.Response(status=500)

@routes.get("/api/sk_manager/get_lora_data")
async def get_lora_data(request):
    """
    API 接口: 获取所有 LoRA 的触发词、预览图及元数据。
    执行物理文件校验并将相对路径映射为静态资源 URL。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 包含所有 LoRA 数据的字典。
    """
    try:
        json_path = os.path.join(os.path.dirname(current_dir), "data", "lora_trigger_words.json")
        if not os.path.exists(json_path):
            print(f"[SK-LoRA] [System] 未找到数据文件: {json_path}")
            return web.json_response({})

        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        base_dir = getattr(db_manager, 'lora_base_dir', None)
        if not base_dir:
            try:
                base_dir = folder_paths.get_folder_paths("loras")[0]
            except:
                pass
        
        if base_dir and os.path.exists(base_dir):
            for lora_path, info in data.items():
                img_rel_path = info.get("img", "")
                final_url = None
                
                if img_rel_path:
                    full_img_path = os.path.join(base_dir, img_rel_path)
                    
                    if os.path.exists(full_img_path):
                        url_path = img_rel_path.replace("\\", "/")
                        final_url = f"/sk_view_lora/{url_path}"
                        info["mtime"] = int(os.path.getmtime(full_img_path))
                
                if not final_url:
                    final_url = "/sk_view_lora/__placeholder__" 
                
                info["img"] = final_url
                info["img_rel"] = img_rel_path

        return web.json_response(data)

    except Exception as e:
        print(f"[SK-LoRA] [System] 获取 LoRA 数据失败: {e}")
        return web.json_response({"error": str(e)}, status=500)

def get_basemodel_settings():
    """
    获取基础模型分类及别名配置。

    返回:
        dict: 包含系统预设和用户自定义配置。
    """
    settings = {
        "system_presets": [
            { "name": "SD 1.5", "category": "image", "aliases": ["1.5", "v1.5"] },
            { "name": "SDXL", "category": "image", "aliases": ["xl"] },
            { "name": "SD 3.5", "category": "image", "aliases": ["sd3"] },
            { "name": "Flux.1", "category": "image", "aliases": ["flux"] }
        ],
        "user_custom": []
    }
    if os.path.exists(BASEMODEL_SETTINGS_FILE):
        try:
            with open(BASEMODEL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                settings.update(json.load(f))
        except: pass
    return settings

def save_basemodel_settings(settings):
    """
    保存基础模型分类配置。

    参数:
        settings: 配置字典。
    返回:
        bool: 是否保存成功。
    """
    try:
        os.makedirs(os.path.dirname(BASEMODEL_SETTINGS_FILE), exist_ok=True)
        with open(BASEMODEL_SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[SK-LoRA] [System] 保存底模配置失败: {e}")
        return False

def save_video_first_frame(video_path, output_path):
    """
    提取视频文件的第一帧并保存为图片。

    参数:
        video_path: 视频文件路径。
        output_path: 输出图片保存路径。
    返回:
        bool: 是否提取成功。
    """
    if not HAS_CV2: return False
    try:
        cap = cv2.VideoCapture(video_path)
        success, frame = cap.read()
        if success:
            cv2.imwrite(output_path, frame)
            cap.release()
            return True
        cap.release()
    except Exception as e:
        print(f"[SK-LoRA] [System] 视频帧提取失败: {e}")
    return False

@routes.get("/sknodes/lora_mgr/get_all")
async def get_all_loras(request):
    """
    API 接口: 获取数据库中所有的 LoRA 元数据。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 包含元数据和根目录路径。
    """
    return web.json_response({
        "metadata": db_manager.load(),
        "base_dir": db_manager.lora_base_dir
    })

@routes.post("/sknodes/lora_mgr/sync_local")
async def sync_local_handler(request):
    """
    API 接口: 响应前端'同步本地'按钮，执行磁盘扫描。
    在后台线程中运行扫描任务，并更新同步状态。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 包含同步结果或错误信息。
    """
    try:
        # 创建同步状态对象
        sync_status = {
            "is_running": True,
            "is_cancelled": False,
            "progress": 0,
            "status": "初始化中...",
            "current_item": "",
            "hash": "",
            "has_preview": False,
            "date": 0,
            "stats": {
                "total": 0,
                "processed": 0,
                "success": 0,
                "failed": 0
            }
        }
        
        # 将同步状态存储到全局变量中
        if not hasattr(request.app, 'sync_status'):
            request.app.sync_status = {}
        request.app.sync_status['local'] = sync_status
        
        # 定义处理回调：同步过程中生成缩略图
        def on_lora_processed(rel_path, info):
            img_rel = info.get("img")
            model_hash = info.get("hash")
            if img_rel:
                # 触发缩略图生成逻辑
                get_or_create_thumbnail(img_rel, rel_path, model_hash)

        # 执行同步 - 在线程池中运行以避免阻塞主循环
        loop = asyncio.get_event_loop()
        settings = get_local_settings()
        result = await loop.run_in_executor(None, db_manager.refresh_scan_with_progress, sync_status, settings, on_lora_processed)
        
        # 同步完成后，将状态设置为idle
        sync_status["is_running"] = False
        sync_status["status"] = "idle"
        
        if sync_status.get("is_cancelled", False):
            return web.json_response({
                "status": "cancelled", 
                "message": "同步已取消",
                "stats": sync_status["stats"]
            })
        
        if result:
            return web.json_response({
                "status": "success", 
                "message": "同步完成",
                "added": result.get("added", 0),
                "removed": result.get("removed", 0),
                "duration": result.get("duration", 0),
                "stats": sync_status["stats"]
            })
        
        return web.json_response({
            "status": "error", 
            "message": "扫描失败",
            "stats": sync_status.get("stats", {})
        }, status=500)
    except Exception as e:
        return web.json_response({
            "status": "error", 
            "message": str(e),
            "stats": sync_status.get("stats", {})
        }, status=500)

@routes.post("/sknodes/lora_mgr/sync_local_cancel")
async def sync_local_cancel_handler(request):
    """
    API 接口: 取消当前正在进行的本地同步任务。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 操作状态。
    """
    try:
        if hasattr(request.app, 'sync_status') and 'local' in request.app.sync_status:
            request.app.sync_status['local']['is_cancelled'] = True
            return web.json_response({"status": "success", "message": "取消请求已发送"})
        return web.json_response({"status": "error", "message": "没有正在运行的同步任务"}, status=404)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# --- 从 URL 获取信息的实现 ---

def _normalize_base_model(model_str, settings_file):
    """
    根据配置文件归一化基础模型名称。

    参数:
        model_str: 待归一化的模型名称字符串。
        settings_file: 配置文件路径。
    返回:
        str: 归一化后的名称，未找到匹配项则返回空字符串。
    """
    if not model_str:
        return ""
    
    model_str = str(model_str).strip().lower()
    
    # 加载设置
    presets = []
    if os.path.exists(settings_file):
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                presets = data.get("system_presets", [])
        except:
            pass
            
    for preset in presets:
        p_name = preset.get("name", "")
        if p_name.lower() == model_str:
            return p_name
        for alias in preset.get("aliases", []):
            if alias.lower() == model_str:
                return p_name
                
    # 如果没找到匹配，检查部分匹配（类似模糊匹配）
    for preset in presets:
        p_name = preset.get("name", "")
        # 例如输入 "SDXL 1.0" 包含 "SDXL"
        if p_name.lower() in model_str:
            return p_name
            
    # 如果仍然没找到匹配，按要求返回空字符串
    return ""

@routes.post("/lora_manager/fetch_from_url")
async def fetch_from_url(request):
    """
    API 接口: 从指定的 URL 获取 LoRA 信息并使用 LLM 进行解析。

    参数:
        request: aiohttp 请求对象，包含 url, path, locale。
    返回:
        web.json_response: 解析后的 LoRA 数据或错误信息。
    """
    try:
        data = await request.json()
        url = data.get("url")
        path = data.get("path")
        locale = data.get("locale", "en-US") # 获取前端传递的语言设置
        
        if not url:
            return web.json_response({"status": "error", "message": "URL is required"}, status=400)

        # 映射 locale 到语言名称
        lang_name = "English"
        if locale == "zh-CN":
            lang_name = "Simplified Chinese"
        elif locale == "zh-TW":
            lang_name = "Traditional Chinese"

        # 1. 获取 HTML 内容
        print(f"[SK-LoRA] [LLM] 正在从 URL 获取数据: {url}")
        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
            resp = await asyncio.get_event_loop().run_in_executor(None, lambda: requests.get(url, headers=headers, timeout=30))
            resp.raise_for_status()
            html_content = resp.text
        except Exception as e:
            print(f"[SK-LoRA] [LLM] URL 获取失败: {e}")
            return web.json_response({"status": "error", "message": f"Failed to fetch URL: {str(e)}"}, status=500)

        # 2. 提取文本内容 (脱敏处理)
        text_content = ""
        if BeautifulSoup:
            try:
                soup = BeautifulSoup(html_content, 'html.parser')
                # 移除不需要的标签
                for tag in soup(["script", "style", "svg", "noscript", "iframe", "header", "footer", "nav", "aside"]):
                    tag.decompose()
                text_content = soup.get_text(separator=' ', strip=True)
            except Exception as e:
                print(f"[SK-LoRA] [LLM] 网页解析失败: {e}")
                text_content = ""
        
        if not text_content:
            # 备用正则提取
            text_content = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', html_content, flags=re.IGNORECASE)
            text_content = re.sub(r'<style\b[^>]*>[\s\S]*?</style>', '', text_content, flags=re.IGNORECASE)
            text_content = re.sub(r'<[^>]+>', ' ', text_content)
            text_content = re.sub(r'\s+', ' ', text_content).strip()
            
        # 截断超长内容
        text_content = text_content[:50000]

        # 3. LLM 分析
        settings = get_local_settings()
        active_llm_id = settings.get("active_llm_id")
        llm_activate = settings.get("llm_activate")
        if isinstance(llm_activate, str):
            llm_activate = llm_activate.lower() == "true"

        # 校验全局开关
        if not llm_activate:
             return web.json_response({"status": "error", "message": "请先在高级设置中开启 LLM 功能开关"}, status=400)
        
        if not active_llm_id:
             return web.json_response({"status": "error", "message": "请先在设置中激活 LLM 功能"}, status=400)
             
        provider = llm_providers.LLMProviderManager.get_provider(active_llm_id)
        if not provider:
             return web.json_response({"status": "error", "message": f"LLM Provider not found: {active_llm_id}"}, status=400)

        # 加载基础模型提示
        base_models_list = []
        if os.path.exists(BASEMODEL_SETTINGS_FILE):
             try:
                 with open(BASEMODEL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                     bm_data = json.load(f)
                     base_models_list = [p['name'] for p in bm_data.get('system_presets', [])]
             except: pass
        base_model_hint = ", ".join(base_models_list)

        system_prompt = f"""You are an AI assistant specialized in analyzing Stable Diffusion model metadata from web pages.
Extract the following information from the provided web page text and return it as a VALID JSON object.

Required Fields:
1. "title": Model name.
2. "base_model": Base model version. Match one of these if possible: {base_model_hint}.
3. "trigger_words": A list of strings (e.g. ["girl", "anime"]). Keep them in their original form (usually English).
4. "notes": A concise summary description including usage tips. 
   - TARGET LANGUAGE: {lang_name} (Locale: {locale}).
   - You MUST translate and summarize the core information into {lang_name}, regardless of the source language of the web page.
   - Word count: Strict limit of 200 words.
5. "weight": Recommended weight (float, e.g. 0.8).
6. "sampler": Recommended sampler and scheduler combination. 
   - FORMAT: "Sampler + Scheduler" (e.g., "DPM++ 2M + Karras", "Euler a + Simple").
7. "civitai_image_url": URL of the main preview image.
   - STRICT RULE: Only extract real image URLs ending in .jpg, .png, .jpeg, or .webp.
   - STRICT RULE: NEVER extract links containing 'modelinfo', 'version', or 'details' as they point to HTML pages.
   - PRIORITY: Look for URLs containing keywords like 'preview', 'cover', or 'main'.

Constraint: Respond with valid JSON only. No markdown formatting.
"""

        user_prompt = f"Web Page Content:\n{text_content}"
        
        # Keep Alive 逻辑 (显存驻留)
        keep_alive = None
        is_ollama = isinstance(provider, llm_providers.OllamaDrive)
        if not is_ollama and hasattr(provider, 'config'):
            is_ollama = provider.config.get("provider") == "ollama"
        
        if is_ollama:
            keep_alive = 0 # 单次请求模式

        print(f"[SK-LoRA] [LLM] 正在通过 {active_llm_id} 分析元数据...")
        try:
            # 120秒分析超时
            response_text = await asyncio.wait_for(provider.chat(user_prompt, system_prompt, keep_alive=keep_alive), timeout=120.0)
        except asyncio.TimeoutError:
             return web.json_response({"status": "error", "message": "LLM 分析超时 (120s)"}, status=504)
        except Exception as e:
             return web.json_response({"status": "error", "message": f"LLM Error: {str(e)}"}, status=500)

        # --- 解析 JSON (多级鲁棒提取逻辑) ---
        json_str = response_text.strip()
        llm_data = None
        
        # 1. 尝试一级提取：处理常见的 Markdown 代码块
        processed_str = json_str
        if json_str.startswith("```"):
            processed_str = re.sub(r"^```(json)?|```$", "", json_str, flags=re.MULTILINE | re.IGNORECASE).strip()
            
        try:
            llm_data = json.loads(processed_str)
        except json.JSONDecodeError:
            # 2. 一级提取失败，尝试二级提取：定位第一个 { 和最后一个 }
            # 这可以有效过滤掉 LLM 在 JSON 前后添加的解释性文字
            print(f"[SK-LoRA] [LLM] 一级 JSON 解析失败，尝试边界提取模式...")
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}')
            
            if start_idx != -1 and end_idx != -1:
                fallback_str = response_text[start_idx:end_idx + 1]
                try:
                    llm_data = json.loads(fallback_str)
                    print(f"[SK-LoRA] [LLM] 二级提取解析成功！")
                except json.JSONDecodeError as e:
                    print(f"[SK-LoRA] [LLM] 二级提取解析依然失败: {e}")
            
        # 如果所有提取尝试都失败
        if llm_data is None:
             print(f"[SK-LoRA] [LLM] 最终解析失败: 返回了无效的 JSON")
             # 在日志中记录原始输出的前 200 个字符方便排查
             print(f"[SK-LoRA] [LLM] 原始响应内容: {response_text[:200]}...")
             return web.json_response({"status": "error", "message": "LLM 返回了无效的 JSON 数据"}, status=500)
             
        # 后置处理
        if llm_data.get("base_model"):
             llm_data["base_model"] = _normalize_base_model(llm_data["base_model"], BASEMODEL_SETTINGS_FILE)
             
        # 确保触发词是列表格式
        if isinstance(llm_data.get("trigger_words"), str):
            llm_data["trigger_words"] = [t.strip() for t in llm_data["trigger_words"].split(",")]
            
        # 注入 LLM 信息
        llm_data["llm_info"] = {
            "status": "success",
            "provider": provider.provider_name,
            "model": provider.model_name
        }
        
        print(f"[SK-LoRA] [LLM] 分析成功: {llm_data.get('title')}")
        return web.json_response({"status": "success", "data": llm_data})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# --- LLM API ---

@routes.get("/sknodes/llm_mgr/get_templates")
async def api_get_llm_templates(request):
    """
    API 接口: 获取 LLM 预设配置模板。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: LLM 模板列表。
    """
    return web.json_response(llm_providers.LLM_TEMPLATES)

@routes.get("/sknodes/llm_mgr/get_configs")
async def api_get_llm_configs(request):
    """
    API 接口: 获取 LLM 配置列表。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 包含当前激活 ID 和所有配置列表。
    """
    settings = get_local_settings()
    return web.json_response({
        "active_llm_id": settings.get("active_llm_id", ""),
        "llm_configs": settings.get("llm_configs", [])
    })

@routes.post("/sknodes/llm_mgr/save_config")
async def api_save_llm_config(request):
    """
    API 接口: 保存或更新 LLM 配置。

    参数:
        request: aiohttp 请求对象，包含配置数据。
    返回:
        web.json_response: 操作状态。
    """
    try:
        data = await request.json()
        config = data.get("config")
        if not config or not config.get("id"):
            return web.json_response({"status": "error", "message": "Invalid config"}, status=400)
            
        settings = get_local_settings()
        configs = settings.get("llm_configs", [])
        
        # 检查是否存在，更新或追加
        existing_idx = next((i for i, c in enumerate(configs) if c["id"] == config["id"]), -1)
        if existing_idx >= 0:
            configs[existing_idx] = config
        else:
            configs.append(config)
            
        settings["llm_configs"] = configs
        
        # 如果当前没有激活的 LLM，且这是第一个添加的配置，则自动设为默认
        if not settings.get("active_llm_id") and len(configs) > 0:
            settings["active_llm_id"] = configs[0]["id"]
            
        if save_local_settings(settings):
            return web.json_response({"status": "success"})
        else:
            return web.json_response({"status": "error", "message": "Save failed"}, status=500)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/sknodes/llm_mgr/delete_config")
async def api_delete_llm_config(request):
    """
    API 接口: 删除 LLM 配置。

    参数:
        request: aiohttp 请求对象，包含要删除的 ID。
    返回:
        web.json_response: 操作状态。
    """
    try:
        data = await request.json()
        config_id = data.get("id")
        
        settings = get_local_settings()
        configs = settings.get("llm_configs", [])
        
        new_configs = [c for c in configs if c["id"] != config_id]
        if len(new_configs) == len(configs):
             return web.json_response({"status": "error", "message": "Config not found"}, status=404)
             
        settings["llm_configs"] = new_configs
        
        # 如果激活的配置被删除，则将第一个剩余配置设为激活，或者清空
        if settings.get("active_llm_id") == config_id:
            settings["active_llm_id"] = new_configs[0]["id"] if new_configs else ""
            
        if save_local_settings(settings):
            return web.json_response({"status": "success"})
        else:
             return web.json_response({"status": "error", "message": "Save failed"}, status=500)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/sknodes/llm_mgr/set_active")
async def api_set_active_llm(request):
    """
    API 接口: 设置激活的 LLM。

    参数:
        request: aiohttp 请求对象，包含配置 ID。
    返回:
        web.json_response: 操作状态。
    """
    try:
        data = await request.json()
        config_id = data.get("id")
        
        settings = get_local_settings()
        settings["active_llm_id"] = config_id
        
        if save_local_settings(settings):
            return web.json_response({"status": "success"})
        else:
             return web.json_response({"status": "error", "message": "Save failed"}, status=500)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/sknodes/llm_mgr/test_connection")
async def api_test_llm_connection(request):
    """
    API 接口: 测试 LLM 连接。

    参数:
        request: aiohttp 请求对象，包含配置信息。
    返回:
        web.json_response: 测试结果。
    """
    try:
        data = await request.json()
        config = data.get("config")
        
        result = await llm_providers.test_connection(config)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


@routes.get("/sknodes/lora_mgr/sync_local_status")
async def sync_local_status_handler(request):
    """
    API 接口: 获取本地同步状态。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 同步状态数据。
    """
    try:
        if hasattr(request.app, 'sync_status') and 'local' in request.app.sync_status:
            return web.json_response(request.app.sync_status['local'])
        return web.json_response({"status": "idle"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/sknodes/lora_mgr/scan")
async def scan_loras(request):
    """
    API 接口: 执行磁盘扫描以更新 LoRA 数据库（兼容旧版接口）。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 操作状态。
    """
    settings = get_local_settings()
    db_manager.refresh_scan(settings)
    return web.json_response({"status": "success"})

@routes.post("/sknodes/lora_mgr/update_item")
async def update_item(request):
    """
    API 接口: 更新单个 LoRA 的元数据（如备注、标题、权重等）。

    参数:
        request: aiohttp 请求对象，包含路径和更新值。
    返回:
        web.json_response: 操作状态。
    """
    data = await request.json()
    path = data.get("path")
    values = data.get("values")
    if path and values:
        db_manager.update_item(path, values)
        return web.json_response({"status": "success"})
    return web.json_response({"status": "error", "message": "Invalid parameters"}, status=400)


def clean_trigger_words(triggers):
    """
    清洗触发词列表。
    1. 分割逗号。
    2. 去除首尾空白。
    3. 有序去重。

    参数:
        triggers: 原始触发词列表或字符串。
    返回:
        list: 清洗后的触发词列表。
    """
    if not triggers:
        return []
    
    # 统一转换为列表
    if isinstance(triggers, str):
        triggers = [triggers]
        
    result = []
    for t in triggers:
        if not t: continue
        # 分割逗号 (处理 "tag1, tag2" 这种粘连情况)
        parts = str(t).split(',')
        for p in parts:
            clean_p = p.strip()
            # 过滤空字符串并去重
            if clean_p and clean_p not in result:
                result.append(clean_p)
                
    return result

async def process_lora_sync(path, file_hash, helper, settings, dry_run=False, keep_alive=None, locale="en-US"):
    """
    处理单个 LoRA 与 Civitai 的数据同步。

    参数:
        path (str): Lora 相对路径。
        file_hash (str): 文件 Hash。
        helper (CivitaiHelper): CivitaiHelper 实例。
        settings (dict): 设置字典。
        dry_run (bool): 如果为 True，则不下载图片，而是返回 C 站原始数据和预览图 URL。
        keep_alive (int): LLM (如 Ollama) 显存驻留时间。
    返回:
        dict: 同步后的元数据字典，如果失败则返回 None。
    """
    loop = asyncio.get_running_loop()
    
    # 使用 run_in_executor 将阻塞的 requests 调用放入线程池
    info = await loop.run_in_executor(None, helper.get_version_by_hash, file_hash)
    if not info: return None

    pass
    
    published_str = info.get("publishedAt", "")
    published_ts = 0
    if published_str:
        try:
            from datetime import datetime, timezone
            dt = datetime.strptime(published_str, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
            published_ts = dt.timestamp()
        except:
            try:
                from datetime import datetime, timezone
                dt = datetime.strptime(published_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                published_ts = dt.timestamp()
            except:
                published_ts = 0

    # 获取设置项
    img_mode = settings.get("img_mode", "missing")
    sync_weight = settings.get("sync_weight", True)
    sync_sampler = settings.get("sync_sampler", True)
    sync_triggers = settings.get("sync_triggers", "merge") # replace 或 merge
    
    # 核心逻辑：判断 LLM 状态以决定是否覆盖权重和采样器开关
    llm_active = settings.get("llm_activate")
    if isinstance(llm_active, str):
        llm_active = llm_active.lower() == "true"
    
    # 如果开启了 LLM 全局开关，则忽略 sync_weight/sampler 开关设置（视为 True）
    # 如果关闭了 LLM 全局开关，则遵循 sync_weight/sampler 的原始设置
    effective_sync_weight = True if llm_active else sync_weight
    effective_sync_sampler = True if llm_active else sync_sampler
    check_update = settings.get("check_update", True)
    video_frame_setting = settings.get("video_frame", True)

    current_meta = db_manager.metadata.get(path, {})
    
    llm_info = {"status": "disabled"}
    if llm_active:
        llm_info = {"status": "not_triggered"} # 默认已开启但未满足介入条件

    # 1. 处理触发词
    civitai_raw_triggers = info.get("trainedWords") or []
    # 使用清洗函数处理原始触发词
    civitai_triggers = clean_trigger_words(civitai_raw_triggers)
    
    final_triggers = civitai_triggers
    if sync_triggers == "merge":
        local_triggers = current_meta.get("trigger_words", [])
        if not isinstance(local_triggers, list): local_triggers = []
        # 合并并去重，保留本地顺序，新词追加在后
        seen = set(local_triggers)
        final_triggers = local_triggers + [t for t in civitai_triggers if t not in seen]

    # 获取模型详情以获取更多信息 (如 Tags, 完整描述)
    model_id = info.get("modelId")
    model_details = None
    if model_id:
        model_details = await loop.run_in_executor(None, helper.get_model_details, model_id)
    
    # 优先从模型详情中获取 tags 和描述
    model_info = model_details if model_details else (info.get("model") or {})
    
    # --- 标签深度合并逻辑 ---
    # 获取 C 站标签并处理可能的字典格式
    raw_civitai_tags = model_info.get("tags", [])
    if raw_civitai_tags and isinstance(raw_civitai_tags[0], dict):
        civitai_tags = [str(t.get("name", "")).lower().strip() for t in raw_civitai_tags if t.get("name")]
    else:
        civitai_tags = [str(t).lower().strip() for t in raw_civitai_tags if t]
    
    # 获取本地标签
    local_tags = current_meta.get("tags", [])
    if isinstance(local_tags, str):
        local_tags = [t.strip().lower() for t in local_tags.split(",") if t.strip()]
    elif isinstance(local_tags, list):
        local_tags = [str(t).lower().strip() for t in local_tags if t]
    else:
        local_tags = []

    # 无效关键词/系统级冗余标签过滤黑名单
    # 优先从设置中获取用户自定义黑名单，如果没有则使用内置预设
    tag_blacklist = settings.get("tag_blacklist", [])
    if not tag_blacklist:
        tag_blacklist = ["base model", "lora", "model", "style", "checkpoint", "stable diffusion", "sdxl", "sd1.5"]
    
    redundant_tags = set([str(t).lower().strip() for t in tag_blacklist])
    
    # 无损合并 (并集) 并剔除冗余
    merged_tags_set = set(civitai_tags) | set(local_tags)
    final_tags = sorted([t for t in merged_tags_set if t and t not in redundant_tags])

    # 0. 提取描述并存入 notes
    ver_desc = strip_html(info.get("description", ""))
    model_desc = strip_html(model_info.get("description", ""))
    full_notes = ""
    if ver_desc:
        full_notes += f"【版本说明】\n{ver_desc}\n"
    if model_desc:
        if full_notes: full_notes += "\n"
        full_notes += f"【模型介绍】\n{model_desc}"

    # 防御性赋值
    model_id = info.get("modelId")
    
    # --- 统计辅助函数 ---
    def get_mode(data_list):
        if not data_list: return None
        from collections import Counter
        return Counter(data_list).most_common(1)[0][0]

    def get_median(data_list):
        if not data_list: return None
        sorted_list = sorted(data_list)
        n = len(sorted_list)
        if n % 2 == 1:
            return sorted_list[n // 2]
        else:
            return (sorted_list[n // 2 - 1] + sorted_list[n // 2]) / 2

    # --- NSFW 等级提取与聚合逻辑 ---
    raw_version_nsfw = info.get("nsfwLevel", 0)
    sample_images = info.get("images", [])
    
    # 调用独立函数进行计算
    nsfw_level = _calculate_final_nsfw_level(raw_version_nsfw, sample_images)

    # --- 参数统计核心逻辑 (众数/中位数/JSON解析) ---
    # 提取当前 LoRA 文件名（不含后缀）用于 ComfyUI JSON 匹配
    current_filename = os.path.splitext(os.path.basename(path))[0]
    target_names = {current_filename.lower()}
    civitai_model_name = model_info.get("name", "").lower()
    if civitai_model_name: target_names.add(civitai_model_name)
    for f in info.get("files", []):
        fname = f.get("name", "")
        if fname: target_names.add(os.path.splitext(fname)[0].lower())

    weight_samples = []
    sampler_samples = []
    
    # 扫描前 15 张图片
    for img in sample_images[:15]:
        meta = img.get("meta")
        if not meta: continue

        # 增强鲁棒性：处理可能是 JSON 字符串的 meta
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except:
                meta = {}

        if not isinstance(meta, dict): continue
        
        # 1. 提取权重：优先从 ComfyUI JSON 解析 strength_model
        found_weight = False
        # 尝试定位 ComfyUI 节点数据
        prompt_data = meta.get("prompt")
        if isinstance(prompt_data, dict):
            # 遍历所有节点寻找 LoraLoader 类型的节点
            for node_id, node_info in prompt_data.items():
                class_type = node_info.get("class_type", "")
                if "LoraLoader" in class_type:
                    inputs = node_info.get("inputs", {})
                    lora_name = str(inputs.get("lora_name", "")).lower()
                    # 匹配文件名或 C 站记录的名称
                    if any(tn in lora_name for tn in target_names):
                        w = inputs.get("strength_model")
                        if w is not None:
                            try:
                                w_val = float(w)
                                if 0.1 <= w_val <= 2.0:
                                    weight_samples.append(w_val)
                                    found_weight = True
                                    break
                            except: pass
        
        # 2. 兜底：从 Prompt 文本中匹配 (A1111 格式 <lora:name:weight>)
        if not found_weight:
            prompt_text = str(meta.get("prompt", ""))
            if prompt_text:
                # 匹配 A1111 格式
                matches = re.findall(r"<lora:([^:>]+):([0-9.]+)>", prompt_text)
                for name, weight_str in matches:
                    if any(tn in name.lower() for tn in target_names):
                        try:
                            w_val = float(weight_str)
                            if 0.1 <= w_val <= 2.0:
                                weight_samples.append(w_val)
                                found_weight = True
                                break
                        except: pass

        # 3. 提取采样器：众数投票准备 (增强鲁棒性)
        s_name = meta.get("sampler") or meta.get("Sampler")
        s_sched = meta.get("scheduler") or meta.get("Scheduler")
        
        # 清洗逻辑：排除 "undefined", "null", "none" 等字符串
        def clean_param(val):
            if val is None: return None
            v_s = str(val).strip()
            if v_s.lower() in ["undefined", "null", "none", ""]:
                return None
            return v_s

        s_name = clean_param(s_name)
        s_sched = clean_param(s_sched)

        if s_name:
            combo = f"{s_name} + {s_sched}" if s_sched else s_name
            sampler_samples.append(combo)

    # 决策：权重取中位数，采样器取众数
    final_weight = get_median(weight_samples)
    final_sampler = get_mode(sampler_samples)

    # 兜底：如果新采集到的采样器为空，且旧采样器是无效字符，则清空
    old_sampler = current_meta.get("sampler", "")
    if old_sampler and str(old_sampler).lower() in ["undefined", "null", "none"]:
        old_sampler = ""

    update_data = {
        "title": model_info.get("name", current_meta.get("title", "")),
        "base_model": info.get("baseModel", current_meta.get("base_model", "Unknown")),
        "trigger_words": final_triggers,
        "tags": final_tags,
        "weight": str(round(final_weight, 2)) if (final_weight and effective_sync_weight) else current_meta.get("weight", ""),
        "sampler": final_sampler if (final_sampler and effective_sync_sampler) else old_sampler,
        "link": f"https://civitai.com/models/{model_id}" if model_id else current_meta.get("link", ""),
        "notes": full_notes if full_notes else current_meta.get("notes", ""),
        "source": "civitai",
        "civitai_model_id": str(model_id) if model_id else current_meta.get("civitai_model_id", ""),
        "civitai_version_id": str(info.get("id", "")),
        "nsfw_level": nsfw_level,
        "published": published_ts or current_meta.get("published", 0)
    }

    # --- LLM 自动化分析与增强逻辑 ---
    if llm_active:
        try:
            active_llm_id = settings.get("active_llm_id")
            if active_llm_id:
                provider = llm_providers.LLMProviderManager.get_provider(active_llm_id)
                if provider:
                    # 记录正在处理的信息
                    llm_info.update({
                        "status": "processing",
                        "provider": provider.provider_name,
                        "model": provider.model_name
                    })
                    
                    # 介入条件判断
                    curr_notes = current_meta.get("notes", "")
                    new_notes = update_data.get("notes", "")
                    
                    # 如果当前没有备注，或者备注中包含基础同步标记，或者备注看起来是原始 HTML (包含 <p> 等)
                    is_basic_sync = not curr_notes or "【版本说明】" in curr_notes or "【模型介绍】" in curr_notes or \
                                   "【版本说明】" in new_notes or "【模型介绍】" in new_notes or \
                                   ("<p>" in curr_notes and "</p>" in curr_notes)
                    
                    if is_basic_sync:
                        print(f"[SK-LoRA] [LLM] 正在通过 {provider.provider_name} ({provider.model_name}) 分析元数据...")
                        # 1. 准备 Prompt 数据
                        # 提取样图 Prompt 作为参考
                        ref_prompts = []
                        for img in sample_images[:3]: # 取前3张
                            if img.get("meta") and isinstance(img.get("meta"), dict):
                                p_text = img.get("meta").get("prompt", "")
                                if p_text: ref_prompts.append(str(p_text)[:200] + "...") # 截断
                        
                        lang_name = "English"
                        if locale == "zh-CN":
                            lang_name = "Simplified Chinese"
                        elif locale == "zh-TW":
                            lang_name = "Traditional Chinese"

                        system_prompt = (
                            "You are an SD model expert. Analyze the provided LoRA model information and output structured JSON:\n"
                            "1. **weight**: Extract author recommended weight (e.g., 0.7). If unknown, return null.\n"
                            "2. **sampler**: Extract recommended sampler. If unknown, return null.\n"
                            "3. **notes**: Rewrite the description, notes, and version info into a concise, professional summary.\n"
                            f"   - TARGET LANGUAGE: {lang_name} (Locale: {locale}).\n"
                            f"   - You MUST translate and summarize into {lang_name} regardless of source language.\n"
                            "   - Word limit: 150 words.\n"
                            "Constraint: Respond with valid JSON only: {\"weight\": float, \"sampler\": str, \"notes\": str}"
                        )
                        
                        user_prompt = f"""
                        Model Name: {model_info.get('name', 'Unknown')}
                        Description: {model_desc}
                        Version Info: {ver_desc}
                        Reference Prompts: {json.dumps(ref_prompts, ensure_ascii=False)}
                        """
                        
                        # 2. 调用 LLM (超时保护 15s)
                        response_text = await asyncio.wait_for(provider.chat(user_prompt, system_prompt, keep_alive=keep_alive), timeout=15.0)
                        
                        # 3. 解析 JSON
                        json_str = response_text.strip()
                        # 尝试清理 Markdown 代码块
                        if json_str.startswith("```"):
                            json_str = re.sub(r"^```(json)?|```$", "", json_str, flags=re.MULTILINE | re.IGNORECASE).strip()
                        
                        try:
                            llm_data = json.loads(json_str)
                            
                            # 4. 更新字段
                            # Notes: 总是更新
                            if llm_data.get("notes"):
                                update_data["notes"] = llm_data["notes"]
                            
                            # Weight: 如果当前是默认值 1.0 或空，且 LLM 提供了有效值
                            curr_w = update_data.get("weight")
                            if (not curr_w or str(curr_w) == "1.0" or str(curr_w) == "1") and llm_data.get("weight"):
                                 update_data["weight"] = str(llm_data["weight"])
                                 
                            # Sampler: 如果当前为空，且 LLM 提供了有效值
                            curr_s = update_data.get("sampler")
                            if (not curr_s) and llm_data.get("sampler"):
                                update_data["sampler"] = str(llm_data["sampler"])
                                
                            llm_info["status"] = "success"
                            print(f"[SK-LoRA] [LLM] 分析成功: {path}")
                        except json.JSONDecodeError:
                            llm_info.update({"status": "failed", "message": "JSON 解析失败"})
                            print(f"[SK-LoRA] [LLM] 解析失败: {path}")
                    else:
                        # 不满足介入条件（已有详细备注且非基础同步格式）
                        llm_info["status"] = "not_triggered"
                else:
                    llm_info.update({"status": "failed", "message": f"未找到服务商: {active_llm_id}"})
                    print(f"[SK-LoRA] [LLM] 未找到服务商: {active_llm_id}")
            else:
                llm_info.update({"status": "failed", "message": "未配置活跃 LLM"})
                    
        except asyncio.TimeoutError:
            llm_info.update({"status": "failed", "message": "请求超时 (15s)"})
            print(f"[SK-LoRA] [LLM] 分析超时: {path}")
        except Exception as e:
            llm_info.update({"status": "failed", "message": str(e)})
            print(f"[SK-LoRA] [LLM] 分析失败 ({path}): {e}")

    # 4. 检查新版本
    if check_update and model_details:
        versions = model_details.get("modelVersions", [])
        if versions:
            # 列表通常按时间倒序，取第一个
            latest_ver = versions[0]
            # 比较版本ID
            if str(latest_ver.get("id")) != str(info.get("id")):
                update_data["new_version_available"] = True
            else:
                update_data["new_version_available"] = False
                # 如果当前版本已经是最新版，说明之前的忽略标记已无意义，清除它
                update_data["ignored_version_id"] = ""
    elif not check_update:
        # 如果关闭检查更新，则同步时重置标记
        update_data["new_version_available"] = False
        update_data["ignored_version_id"] = ""

    # 5. 图片下载与抽帧逻辑
    # 检查本地是否已有预览图
    has_img = current_meta.get("img") and os.path.exists(os.path.join(db_manager.lora_base_dir, current_meta["img"]))

    # 获取 C 站预览图 URL
    images = info.get("images", [])
    civitai_img_url = ""
    civitai_img_type = "image"
    if images:
        civitai_img_url = images[0].get("url", "")
        if ".mp4" in civitai_img_url.lower() or images[0].get("type") == "video":
            civitai_img_type = "video"
            
    if dry_run:
        # 模拟运行模式：不下载图片，直接返回 URL
        if civitai_img_url:
            update_data["civitai_image_url"] = civitai_img_url
            update_data["civitai_image_type"] = civitai_img_type
        # 同时返回 C 站原始触发词和标签，供前端对比面板使用
        # 优化：标签返回前先经过黑名单过滤，确保用户在文本框中看不到冗余词
        update_data["civitai_triggers"] = civitai_triggers
        update_data["civitai_tags"] = [t for t in civitai_tags if t not in redundant_tags]
    else:
        # 根据设置决定是否下载预览图
        if img_mode == "always" or (img_mode == "missing" and not has_img):
            if civitai_img_url:
                    # 安全性校验：确保 path 不会跳出 lora_base_dir
                    if not is_path_safe(db_manager.lora_base_dir, path):
                        print(f"[SK-LoRA] [Security] 拦截到越权预览下载尝试: {path}")
                        return None

                    ext = ".png"
                    is_video = False
                    if ".mp4" in civitai_img_url.lower() or images[0].get("type") == "video":
                        ext = ".mp4"
                        is_video = True
                    
                    lora_full_path = os.path.join(db_manager.lora_base_dir, path)
                    save_name = os.path.splitext(lora_full_path)[0] + ext
                
                    # 下载图片 (阻塞操作，放入线程池)
                    download_success = await loop.run_in_executor(None, helper.download_image, civitai_img_url, save_name)
                
                    if download_success:
                        rel_img = os.path.relpath(save_name, db_manager.lora_base_dir).replace("\\", "/")
                        
                        if is_video and video_frame_setting: # 只有开启抽帧才进行处理
                            preview_img = os.path.splitext(save_name)[0] + ".png"
                            if save_video_first_frame(save_name, preview_img):
                                rel_img = os.path.relpath(preview_img, db_manager.lora_base_dir).replace("\\", "/")
                        
                        update_data["img"] = rel_img
                        # 同步生成缩略图
                        get_or_create_thumbnail(rel_img, path, file_hash)
                    else:
                        print(f"[SK-LoRA] [System] 预览图下载失败: {civitai_img_url}")

    update_data["llm_info"] = llm_info
    return update_data

@routes.post("/sknodes/lora_mgr/fetch_civitai")
async def fetch_civitai_info(request):
    """
    API 接口: 从 Civitai 获取单个模型的信息。

    参数:
        request: aiohttp 请求对象，包含 path 和 hash。
    返回:
        web.json_response: 包含同步结果或错误信息。
    """
    try:
        text = await request.text()
        data = json.loads(text)
    except Exception as e:
        error_msg = text[:100] if 'text' in locals() else str(e)
        print(f"[SK-LoRA] [System] JSON 解析失败: {error_msg}")
        return web.json_response({"status": "error", "message": "请求数据解析失败"}, status=400)

    path, file_hash = data.get("path"), data.get("hash")
    locale = data.get("locale", "en-US")
    if not file_hash: 
        return web.json_response({"status": "error", "message": "无 Hash"})

    settings = get_local_settings()
    if not settings.get("civitai_key"):
        return web.json_response({"status": "error", "message": "未配置 Civitai API Key"})
    
    helper = CivitaiHelper(api_key=settings.get("civitai_key"), proxy=settings.get("proxy"))
    
    create_snapshot_internal(prefix="auto_sync_c_")
    
    try:
        result = await process_lora_sync(path, file_hash, helper, settings, keep_alive=0, locale=locale)
        if result:
            db_manager.update_item(path, result)
            return web.json_response({"status": "success", "data": result})
        else:
            return web.json_response({"status": "failed", "message": "无法在 Civitai 上找到匹配的模型"})
    finally:
        try:
            active_llm_id = settings.get("active_llm_id")
            if active_llm_id:
                provider = llm_providers.LLMProviderManager.get_provider(active_llm_id)
                is_ollama = isinstance(provider, llm_providers.OllamaDrive)
                if not is_ollama and hasattr(provider, 'config'):
                    is_ollama = provider.config.get("provider") == "ollama"
                
                if is_ollama:
                    await provider.unload_model()
        except Exception as e:
            print(f"[SK-LoRA] [System] 显存释放异常: {e}")

def _calculate_final_nsfw_level(raw_nsfw, images):
    """
    深度纠偏与 5 档位收敛逻辑。

    参数:
        raw_nsfw (int): 模型版本的原始 nsfwLevel。
        images (list): 样图列表。
    返回:
        int: 收敛后的 5 档位值 (1, 2, 4, 8, 16)。
    """
    # 1. 聚合样图 NSFW 等级 (前 15 张)
    img_combined_mask = 0
    for img in images[:15]:
        img_combined_mask |= img.get("nsfwLevel", 0)
        
    # 2. 视觉证据纠偏逻辑
    final_mask = raw_nsfw
    
    # 提取样图综合掩码中的最高位
    # 档位从高到低：16(XXX), 8(X), 4(R), 2(PG13), 1(PG)
    img_max_level = 1
    for level in [16, 8, 4, 2, 1]:
        if img_combined_mask & level:
            img_max_level = level
            break
    
    # 纠偏场景：模型标了高敏感 (>=16)，但样图全都是 PG (1)
    # 此时强制采信视觉证据，判定为 1 (SFW)
    if raw_nsfw >= 16 and img_max_level == 1 and img_combined_mask > 0:
        final_mask = 1
    else:
        # 常规场景：取并集，保留所有可能的风险标记
        final_mask = raw_nsfw | img_combined_mask

    # 3. 标准 5 档位收敛 (映射优先级：16 > 8 > 4 > 2 > 1)
    converged_level = 1  # 默认为 PG
    if final_mask & 16:
        converged_level = 16
    elif final_mask & 8:
        converged_level = 8
    elif final_mask & 4:
        converged_level = 4
    elif final_mask & 2:
        converged_level = 2
    
    # 4. 健壮性处理：如果 API 没返回样图且标了 16，保持 16
    if not images and raw_nsfw == 16:
        converged_level = 16
        
    return converged_level

@routes.post("/sknodes/lora_mgr/batch_fetch_civitai")
async def batch_fetch_civitai(request):
    """
    API 接口: 批量同步所有 LoRA 的 Civitai 信息。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 包含同步成功的数量。
    """
    settings = get_local_settings()
    if not settings.get("civitai_key"):
        return web.json_response({"status": "error", "message": "请先配置 API Key"}, status=400)

    # 安全性：批量同步前强制创建自动备份
    print("[SK-LoRA] [Backup] 正在执行批量同步前的自动备份...")
    create_snapshot_internal(prefix="auto_sync_c_")

    all_loras = db_manager.metadata
    count = 0
    helper = CivitaiHelper(api_key=settings.get("civitai_key"), proxy=settings.get("proxy"))

    for path, info in all_loras.items():
        file_hash = info.get("hash")
        if file_hash:
            result = await process_lora_sync(path, file_hash, helper, settings)
            if result:
                db_manager.update_item(path, result)
                count += 1
    
    return web.json_response({"status": "success", "count": count})

@routes.post("/lora_manager/upload_preview")
async def upload_preview(request):
    """
    API 接口: 上传预览图。

    参数:
        request: aiohttp 请求对象，包含 model_path 和 image 文件。
    返回:
        web.json_response: 包含更新后的图片路径和状态。
    """
    try:
        data = await request.post()
        model_path = data.get("model_path")
        image_obj = data.get("image")
        
        if not model_path or not image_obj:
             return web.json_response({"status": "error", "message": "缺少必要参数"}, status=400)

        # 统一路径分隔符为正斜杠，确保与数据库 key 匹配
        model_path = model_path.replace("\\", "/")
        print(f"[SK-LoRA] [System] 正在上传预览图: {model_path}")

        filename = getattr(image_obj, 'filename', '')
        if not filename:
             return web.json_response({"status": "error", "message": "无效文件"}, status=400)
             
        if not any(filename.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp']):
             return web.json_response({"status": "error", "message": "无效的图片格式，仅支持 png, jpg, webp"}, status=400)

        # 安全性校验：确保 model_path 不会跳出 lora_base_dir
        if not is_path_safe(db_manager.lora_base_dir, model_path):
            print(f"[SK-LoRA] [Security] 拦截到越权上传尝试: {model_path}")
            return web.json_response({"status": "error", "message": "非法路径"}, status=403)

        # 构造目标路径
        lora_full_path = os.path.join(db_manager.lora_base_dir, model_path)
        base_name = os.path.splitext(lora_full_path)[0]
        
        # 强制保存为 .png 以保持一致性
        save_path = base_name + ".png"
        print(f"[SK-LoRA] [System] 正在保存预览图: {save_path}")
        
        content = image_obj.file.read()
        with open(save_path, 'wb') as f:
            f.write(content)
            
        # 更新数据库
        rel_path = os.path.relpath(save_path, db_manager.lora_base_dir).replace("\\", "/")
        print(f"[SK-LoRA] [System] 正在更新图片路径: {rel_path}")
        db_manager.update_item(model_path, {"img": rel_path})

        # 获取模型信息用于生成缩略图
        item_info = db_manager.metadata.get(model_path, {})
        model_hash = item_info.get("hash", "")
        mtime = int(os.path.getmtime(save_path))

        # 同步生成缩略图
        get_or_create_thumbnail(rel_path, model_path, model_hash)
        
        return web.json_response({
            "status": "success", 
            "path": rel_path,
            "mtime": mtime,
            "hash": model_hash
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[SK-LoRA] [System] 上传失败: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/lora_manager/fetch_civitai_diff")
async def fetch_civitai_diff(request):
    """
    API 接口: 获取 Civitai 数据用于差异对比 (不保存)。

    参数:
        request: aiohttp 请求对象，包含 path 和 hash。
    返回:
        web.json_response: 包含 Civitai 上的最新数据。
    """
    try:
        data = await request.json()
        path, file_hash = data.get("path"), data.get("hash")
        locale = data.get("locale", "en-US")
        
        if not file_hash: 
            return web.json_response({"status": "error", "message": "无Hash"})

        settings = get_local_settings()
        if not settings.get("civitai_key"):
            return web.json_response({"status": "error", "message": "未配置 Civitai API Key"})
        
        helper = CivitaiHelper(api_key=settings.get("civitai_key"), proxy=settings.get("proxy"))
        
        try:
            # dry_run=True: 不保存图片，只返回 URL
            # keep_alive=0: 对对比同步也立即释放
            result = await process_lora_sync(path, file_hash, helper, settings, dry_run=True, keep_alive=0, locale=locale)
            
            if result:
                return web.json_response({"status": "success", "data": result})
            else:
                return web.json_response({"status": "failed", "message": "无法在 Civitai 上找到匹配的模型"})
        finally:
            # 对比同步结束后的显存释放保障
            try:
                active_llm_id = settings.get("active_llm_id")
                if active_llm_id:
                    provider = llm_providers.LLMProviderManager.get_provider(active_llm_id)
                    # 只要是 OllamaDrive 或者配置中 provider 是 ollama 就尝试卸载
                    is_ollama = isinstance(provider, llm_providers.OllamaDrive)
                    if not is_ollama and hasattr(provider, 'config'):
                        is_ollama = provider.config.get("provider") == "ollama"
                    
                    if is_ollama:
                        await provider.unload_model()
            except:
                pass
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/lora_manager/update_lora_data")
async def update_lora_data(request):
    """
    API 接口: 保存用户在对比面板确认的数据。

    参数:
        request: aiohttp 请求对象，包含更新内容和可选图片。
    返回:
        web.json_response: 更新成功的状态。
    """
    try:
        # 处理 multipart/form-data (包含图片) 或 application/json
        if request.content_type.startswith('multipart/'):
            reader = await request.multipart()
            data_json = None
            image_field = None
            
            while True:
                part = await reader.next()
                if part is None: break
                
                if part.name == 'data':
                    text = await part.read(decode=True)
                    data_json = json.loads(text.decode('utf-8'))
                elif part.name == 'image':
                    image_field = part
                else:
                    await part.read() # 消耗掉不使用的部分
            
            if not data_json:
                return web.json_response({"status": "error", "message": "缺少数据字段"}, status=400)
            
            # 处理数据更新
            path = data_json.get("path")
            updates = data_json.get("updates", {})
            
            if not path:
                return web.json_response({"status": "error", "message": "缺少路径"}, status=400)
                
            # 处理图片
            # 1. 如果有上传的图片流
            if image_field and image_field.filename:
                filename = image_field.filename
                content = await image_field.read()
                
                lora_full_path = os.path.join(db_manager.lora_base_dir, path)
                base_name = os.path.splitext(lora_full_path)[0]
                save_path = base_name + ".png" # 强制 png
                
                if filename.lower().endswith('.mp4'):
                     save_path = base_name + ".mp4"

                with open(save_path, 'wb') as f:
                    f.write(content)
                
                # 更新 img 路径
                rel_path = os.path.relpath(save_path, db_manager.lora_base_dir).replace("\\", "/")
                updates["img"] = rel_path
                
                # 同步生成缩略图
                model_hash = db_manager.metadata.get(path, {}).get("hash", "")
                get_or_create_thumbnail(rel_path, path, model_hash)
            
            # 2. 如果没有上传图片，但选择了 Civitai 图片 (civitai_image_url 在 updates 中)
            elif updates.get("civitai_image_url"):
                url = updates.pop("civitai_image_url")
                img_type = updates.pop("civitai_image_type", "image")
                
                settings = get_local_settings()
                helper = CivitaiHelper(api_key=settings.get("civitai_key"), proxy=settings.get("proxy"))
                
                lora_full_path = os.path.join(db_manager.lora_base_dir, path)
                save_name = os.path.splitext(lora_full_path)[0]
                ext = ".mp4" if img_type == "video" else ".png"
                save_name += ext
                
                loop = asyncio.get_running_loop()
                download_success = await loop.run_in_executor(None, helper.download_image, url, save_name)
                
                if download_success:
                    # 如果是视频且开启抽帧 (这里简化，直接引用视频或图片)
                    rel_path = os.path.relpath(save_name, db_manager.lora_base_dir).replace("\\", "/")
                    updates["img"] = rel_path
                    
                    # 同步生成缩略图
                    model_hash = db_manager.metadata.get(path, {}).get("hash", "")
                    get_or_create_thumbnail(rel_path, path, model_hash)

            # 更新数据库
            db_manager.update_item(path, updates)
            
            return web.json_response({"status": "success", "updates": updates})
            
        else:
            # 纯 JSON 请求 (无新图片上传)
            data = await request.json()
            path = data.get("path")
            updates = data.get("updates", {})
            
            if not path:
                return web.json_response({"status": "error", "message": "缺少路径"}, status=400)
                
            # 检查是否有 civitai_image_url 需要下载
            if updates.get("civitai_image_url"):
                url = updates.pop("civitai_image_url")
                img_type = updates.pop("civitai_image_type", "image")
                
                settings = get_local_settings()
                helper = CivitaiHelper(api_key=settings.get("civitai_key"), proxy=settings.get("proxy"))
                
                lora_full_path = os.path.join(db_manager.lora_base_dir, path)
                save_name = os.path.splitext(lora_full_path)[0]
                ext = ".mp4" if img_type == "video" else ".png"
                save_name += ext
                
                loop = asyncio.get_running_loop()
                download_success = await loop.run_in_executor(None, helper.download_image, url, save_name)
                
                if download_success:
                    rel_path = os.path.relpath(save_name, db_manager.lora_base_dir).replace("\\", "/")
                    updates["img"] = rel_path
                    
                    # 同步生成缩略图
                    model_hash = db_manager.metadata.get(path, {}).get("hash", "")
                    get_or_create_thumbnail(rel_path, path, model_hash)
            
            db_manager.update_item(path, updates)
            return web.json_response({"status": "success", "updates": updates})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.get("/lora_manager/get_local_settings")
async def api_get_local_settings(request):
    """
    API 接口: 获取本地设置。
    
    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 本地设置数据。
    """
    return web.json_response(get_local_settings())

@routes.post("/lora_manager/save_local_settings")
async def api_save_local_settings(request):
    """
    API 接口: 保存本地设置。
    
    参数:
        request: aiohttp 请求对象，包含要保存的数据。
    返回:
        web.json_response: 保存结果。
    """
    try:
        data = await request.json()
        if save_local_settings(data):
            return web.json_response({"status": "success"})
        else:
            return web.json_response({"status": "error", "message": "保存失败"}, status=500)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.get("/lora_manager/get_basemodel_settings")
async def api_get_basemodel_settings(request):
    """
    API 接口: 获取底模设置。
    
    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 底模设置数据。
    """
    return web.json_response(get_basemodel_settings())

@routes.post("/lora_manager/update_basemodel_settings")
async def api_update_basemodel_settings(request):
    """
    API 接口: 更新底模设置（用于保存排序等）。
    
    参数:
        request: aiohttp 请求对象，包含更新内容。
    返回:
        web.json_response: 更新结果。
    """
    try:
        data = await request.json()
        settings = get_basemodel_settings()
        
        # 更新字段
        if "system_presets" in data:
            settings["system_presets"] = data["system_presets"]
        if "user_custom" in data:
            settings["user_custom"] = data["user_custom"]
            
        if save_basemodel_settings(settings):
            return web.json_response({"status": "success", "settings": settings})
        else:
            return web.json_response({"status": "error", "message": "保存失败"}, status=500)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/lora_manager/add_preset")
async def api_add_preset(request):
    """
    API 接口: 添加自定义底模预设。
    
    参数:
        request: aiohttp 请求对象，包含预设名称。
    返回:
        web.json_response: 更新后的底模设置。
    """
    try:
        data = await request.json()
        preset_name = data.get("preset")
        if not preset_name:
            return web.json_response({"status": "error", "message": "缺少预设名称"}, status=400)
        
        settings = get_basemodel_settings()
        user_custom = settings.get("user_custom", [])
        
        # 检查是否已存在
        exists = any((p if isinstance(p, str) else p.get("name")) == preset_name for p in user_custom)
        if not exists:
            user_custom.append({"name": preset_name, "category": "custom", "order": len(user_custom) + 1000})
            settings["user_custom"] = user_custom
            save_basemodel_settings(settings)
            
        return web.json_response({"status": "success", "settings": settings})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/lora_manager/remove_preset")
async def api_remove_preset(request):
    """
    API 接口: 移除自定义底模预设。

    参数:
        request: aiohttp 请求对象，包含预设名称。
    返回:
        web.json_response: 更新后的底模设置。
    """
    try:
        data = await request.json()
        preset_name = data.get("preset")
        if not preset_name:
            return web.json_response({"status": "error", "message": "缺少预设名称"}, status=400)
        
        settings = get_basemodel_settings()
        user_custom = settings.get("user_custom", [])
        
        # 过滤掉目标预设
        new_user_custom = [p for p in user_custom if (p if isinstance(p, str) else p.get("name")) != preset_name]
        
        if len(new_user_custom) != len(user_custom):
            settings["user_custom"] = new_user_custom
            save_basemodel_settings(settings)
            
        return web.json_response({"status": "success", "settings": settings})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


# --- 批量同步管理器 ---

class CivitaiBatchSyncManager:
    def __init__(self):
        self.is_running = False
        self.stop_flag = False
        self.semaphore = asyncio.Semaphore(3)
        self.current_task = {
            "total": 0, "processed": 0, "success": 0, "failed": 0,
            "current_item": "", "status": "idle", "details": []
        }

    async def start(self, items, helper, settings, locale="en-US"):
        """
        开始批量同步任务。

        参数:
            items: 要同步的项目列表。
            helper: CivitaiHelper 实例。
            settings: 本地设置数据。
        """
        if self.is_running: return
        self.is_running = True
        self.stop_flag = False
        self.current_task = {
            "total": len(items), "processed": 0, "success": 0, "failed": 0,
            "current_item": "", "status": "running", "details": []
        }
        
        # 启动后台任务
        asyncio.create_task(self._run_batch(items, helper, settings, locale))

    async def _run_batch(self, items, helper, settings, locale):
        """
        内部方法: 执行批量同步逻辑。

        参数:
            items: 项目列表。
            helper: CivitaiHelper 实例。
            settings: 本地设置数据。
        """
        print(f"[SK-LoRA] [System] 开始批量同步 {len(items)} 个项目")
        tasks = []
        
        try:
            for item in items:
                if self.stop_flag: break
                tasks.append(asyncio.create_task(self._worker(item, helper, settings, locale)))
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            self.is_running = False
            status = "cancelled" if self.stop_flag else "finished"
            self.current_task["status"] = status
            
            # 批量同步结束后的显存释放保障
            try:
                settings = get_local_settings()
                active_llm_id = settings.get("active_llm_id")
                if active_llm_id:
                    provider = llm_providers.LLMProviderManager.get_provider(active_llm_id)
                    # 兼容性判断
                    is_ollama = isinstance(provider, llm_providers.OllamaDrive)
                    if not is_ollama and hasattr(provider, 'config'):
                        is_ollama = provider.config.get("provider") == "ollama"
                    
                    if is_ollama:
                        print(f"[SK-LoRA] [System] 批量同步 {status}，正在尝试释放 Ollama 显存...")
                        # 批量同步可能在非主线程的 event loop 中运行，确保安全调用
                        try:
                            # 尝试在当前 loop 中执行
                            await provider.unload_model()
                        except Exception as inner_e:
                            print(f"[SK-LoRA] [System] 批量同步显存释放失败: {inner_e}")
                            # 备选方案：如果异步调用失败，尝试新起一个 loop (最后的手段)
                            try:
                                asyncio.run(provider.unload_model())
                            except: pass
                    else:
                        print(f"[SK-LoRA] [System] 批量同步 {status}")
                else:
                    print(f"[SK-LoRA] [System] 批量同步 {status}")
            except Exception as e:
                print(f"[SK-LoRA] [System] 批量同步显存释放异常: {e}")
                print(f"[SK-LoRA] [System] 批量同步 {status}")

    async def _worker(self, item, helper, settings, locale):
        """
        内部方法: 单个项目的同步工作者。

        参数:
            item: 项目路径或对象。
            helper: CivitaiHelper 实例。
            settings: 本地设置数据。
        """
        if self.stop_flag: return
        
        path = item
        if isinstance(item, dict):
            path = item.get('path')
        
        if not path: return

        # 从 DB 获取 Hash
        meta = db_manager.metadata.get(path)
        file_hash = meta.get('hash') if meta else None
        
        if not file_hash:
             self._update_status(path, "failed", "无 Hash 记录")
             return

        async with self.semaphore:
            if self.stop_flag: return
            self.current_task["current_item"] = path
            
            try:
                success = False
                error_msg = ""
                # 重试机制：最多2次
                for attempt in range(2):
                    if self.stop_flag: break
                    try:
                        result = await process_lora_sync(path, file_hash, helper, settings, locale=locale)
                        if result:
                            db_manager.update_item(path, result)
                            # db_manager.update_item 已包含 _write_to_disk 操作，无需重复调用
                            self._update_status(path, "success")
                            success = True
                        else:
                            error_msg = "未找到模型（该模型未收录或已被删除）"
                        break
                    except Exception as e:
                        error_msg = str(e)
                        if attempt == 0:
                            await asyncio.sleep(1) # 重试前等待
                            continue
                
                if not success and not self.stop_flag:
                    self._update_status(path, "failed", error_msg)
                    
            except Exception as e:
                self._update_status(path, "failed", str(e))

    def _update_status(self, path, status, msg=""):
        """
        内部方法: 更新批量同步进度状态。

        参数:
            path (str): 模型路径。
            status (str): 状态 (success/failed)。
            msg (str): 错误消息（如果有）。
        """
        self.current_task["processed"] += 1
        if status == "success":
            self.current_task["success"] += 1
        else:
            self.current_task["failed"] += 1
        
        self.current_task["details"].append({
            "name": path,
            "status": status,
            "msg": msg
        })
        # print(f"Syncing [{self.current_task['processed']}/{self.current_task['total']}]: {path} ... {status}")

    def cancel(self):
        """取消当前的批量同步任务。"""
        self.stop_flag = True

batch_sync_manager = CivitaiBatchSyncManager()

@routes.post("/sknodes/lora_mgr/sync_civitai_batch_start")
async def sync_civitai_batch_start(request):
    """
    API 接口: 开始批量从 Civitai 同步元数据。

    参数:
        request: aiohttp 请求对象，包含路径列表。
    返回:
        web.json_response: 启动结果。
    """
    try:
        data = await request.json()
        paths = data.get("paths", [])
        locale = data.get("locale", "en-US")
        if not paths:
             return web.json_response({"status": "error", "message": "未提供路径列表"})

        settings = get_local_settings()
        if not settings.get("civitai_key"):
            return web.json_response({"status": "error", "message": "Civitai API Key 缺失"})
            
        helper = CivitaiHelper(api_key=settings.get("civitai_key"), proxy=settings.get("proxy"))
        
        create_snapshot_internal(prefix="auto_sync_c_")
        
        await batch_sync_manager.start(paths, helper, settings, locale)
        
        return web.json_response({"status": "success", "message": "批量同步已开始"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.get("/sknodes/lora_mgr/sync_civitai_batch_status")
async def sync_civitai_batch_status(request):
    """
    API 接口: 获取批量同步任务的状态。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 任务进度和状态。
    """
    return web.json_response(batch_sync_manager.current_task)

@routes.post("/sknodes/lora_mgr/sync_civitai_batch_cancel")
async def sync_civitai_batch_cancel(request):
    """
    API 接口: 取消当前的批量同步任务。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 取消请求结果。
    """
    batch_sync_manager.cancel()
    return web.json_response({"status": "success", "message": "已请求取消批量同步"})


# --- 数据备份与恢复 ---

@routes.get("/lora_manager/backup_data")
async def api_backup_data(request):
    """
    API 接口: 备份插件数据（数据库及设置）并下载 ZIP。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.Response: 包含 ZIP 数据的响应。
    """
    try:
        print(f"[SK-LoRA] [Backup] 开始备份数据...")
        # 创建内存中的 ZIP 文件
        bio = io.BytesIO()
        with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as zf:
            # 添加数据库文件
            if os.path.exists(db_manager.db_path):
                zf.write(db_manager.db_path, os.path.basename(db_manager.db_path))
                print(f"[SK-LoRA] [Backup] 已添加数据库文件: {os.path.basename(db_manager.db_path)}")
            # 添加设置文件
            if os.path.exists(SETTINGS_FILE):
                zf.write(SETTINGS_FILE, os.path.basename(SETTINGS_FILE))
                print(f"[SK-LoRA] [Backup] 已添加设置文件: {os.path.basename(SETTINGS_FILE)}")
            # 添加底模设置文件
            if os.path.exists(BASEMODEL_SETTINGS_FILE):
                zf.write(BASEMODEL_SETTINGS_FILE, os.path.basename(BASEMODEL_SETTINGS_FILE))
                print(f"[SK-LoRA] [Backup] 已添加底模设置文件: {os.path.basename(BASEMODEL_SETTINGS_FILE)}")
        
        bio.seek(0)
        return web.Response(
            body=bio.getvalue(),
            content_type='application/zip',
            headers={
                'Content-Disposition': 'attachment; filename="lora_manager_backup.zip"'
            }
        )
    except Exception as e:
        print(f"[SK-LoRA] [Backup] 备份失败: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/lora_manager/restore_data")
async def api_restore_data(request):
    """
    API 接口: 从上传的 ZIP 备份中恢复插件数据。

    参数:
        request: aiohttp 请求对象，包含上传的文件。
    返回:
        web.json_response: 恢复结果。
    """
    try:
        print(f"[SK-LoRA] [Backup] 开始恢复数据...")
        post = await request.post()
        file = post.get('file')
        if not file:
            return web.json_response({"status": "error", "message": "未上传文件"}, status=400)
            
        # 读取 ZIP 内容
        bio = io.BytesIO(file.file.read())
        with zipfile.ZipFile(bio, 'r') as zf:
            # 检查 ZIP 内容
            namelist = zf.namelist()
            print(f"[SK-LoRA] [Backup] ZIP 文件内容: {namelist}")
            
            # 恢复数据库文件
            db_filename = os.path.basename(db_manager.db_path)
            if db_filename in namelist:
                with open(db_manager.db_path, 'wb') as f:
                    f.write(zf.read(db_filename))
                # 重新加载数据库
                db_manager.load()
                print(f"[SK-LoRA] [Backup] 已恢复数据库并重新加载")
            
            # 恢复设置文件
            settings_filename = os.path.basename(SETTINGS_FILE)
            if settings_filename in namelist:
                with open(SETTINGS_FILE, 'wb') as f:
                    f.write(zf.read(settings_filename))
                print(f"[SK-LoRA] [Backup] 已恢复设置文件")
            
            # 恢复底模设置文件
            bm_filename = os.path.basename(BASEMODEL_SETTINGS_FILE)
            if bm_filename in namelist:
                with open(BASEMODEL_SETTINGS_FILE, 'wb') as f:
                    f.write(zf.read(bm_filename))
                print(f"[SK-LoRA] [Backup] 已恢复底模设置文件")
                    
        return web.json_response({"status": "success"})
    except Exception as e:
        print(f"[SK-LoRA] [Backup] 恢复失败: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)


# --- 快照式数据维护系统 ---

def create_snapshot_internal(prefix="sk_backup_"):
    """
    内部逻辑: 创建数据快照 (ZIP 格式)。
    包含: lora_trigger_words.json, lora_manager_settings.json, basemodel_settings.json。

    参数:
        prefix (str): 快照文件名前缀。
    返回:
        dict: 包含状态和文件信息的字典。
    """
    try:
        from datetime import datetime
        now = datetime.now()
        timestamp = now.strftime("%Y%m%d_%H%M%S")
        filename = f"{prefix}{timestamp}.zip"
        snapshot_dir = get_snapshot_dir()
        filepath = os.path.join(snapshot_dir, filename)
        
        # 准备文件列表
        files_to_zip = []
        if os.path.exists(db_manager.db_path):
            files_to_zip.append(db_manager.db_path)
        if os.path.exists(SETTINGS_FILE):
            files_to_zip.append(SETTINGS_FILE)
        if os.path.exists(BASEMODEL_SETTINGS_FILE):
            files_to_zip.append(BASEMODEL_SETTINGS_FILE)
            
        # 创建 ZIP 文件
        with zipfile.ZipFile(filepath, 'w', zipfile.ZIP_DEFLATED) as zf:
            manifest_files = []
            for f_path in files_to_zip:
                arcname = os.path.basename(f_path)
                zf.write(f_path, arcname)
                manifest_files.append(arcname)
                
            # 生成 manifest.json
            manifest = {
                "backup_time": now.timestamp(),
                "version": "1.0.0",
                "files": manifest_files,
                "signature": "sk-lora-manager",
                "type": "auto" if prefix.startswith("auto_") else "manual"
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        
        # 更新 last_backup
        settings = get_local_settings()
        display_time = now.strftime("%Y-%m-%d %H:%M:%S")
        if not prefix.startswith("auto_"):
            settings["last_backup"] = display_time
            save_local_settings(settings)
        elif prefix == "auto_sync_c_":
            # 清理旧的 C 站自动备份，保留最近 6 个
            try:
                backups = []
                for f in os.listdir(snapshot_dir):
                    if f.startswith("auto_sync_c_") and f.endswith(".zip"):
                        backups.append(f)
                if len(backups) > 6:
                    backups.sort()
                    for f in backups[:-6]:
                        os.remove(os.path.join(snapshot_dir, f))
            except: pass
            
        return {
            "status": "success",
            "filename": filename,
            "display_time": display_time,
            "filepath": filepath,
            "size": os.path.getsize(filepath)
        }
    except Exception as e:
        print(f"[SK-LoRA] [Backup] 快照创建失败: {e}")
        return {"status": "error", "message": str(e)}

def get_snapshot_dir():
    """
    获取快照存储目录。

    返回:
        str: 快照目录的绝对路径。
    """
    user_dir = folder_paths.get_user_directory()
    snapshot_dir = os.path.join(user_dir, "default", "SKLoraManager-Data")
    os.makedirs(snapshot_dir, exist_ok=True)
    return snapshot_dir

def validate_snapshot(filepath):
    """
    校验快照文件的合法性。

    参数:
        filepath (str): 快照文件路径。
    返回:
        tuple: (是否合法, 错误消息)。
    """
    try:
        if not zipfile.is_zipfile(filepath):
            return False, "非法的 ZIP 文件 (Not a valid zip file)"
            
        with zipfile.ZipFile(filepath, 'r') as zf:
            namelist = zf.namelist()
            
            # 1. 检查 manifest.json 是否存在
            if "manifest.json" not in namelist:
                return False, "缺少 manifest 文件 (Missing manifest.json)"
                
            # 2. 读取 manifest.json
            try:
                manifest_data = json.loads(zf.read("manifest.json").decode('utf-8'))
            except:
                return False, "Manifest JSON 格式损坏 (Invalid JSON)"
                
            # 3. 验证 signature
            if manifest_data.get("signature") != "sk-lora-manager":
                return False, "签名不匹配 (Invalid signature)"
                
            # 4. 核对文件列表
            files_in_manifest = manifest_data.get("files", [])
            for f in files_in_manifest:
                if f not in namelist:
                    return False, f"文件缺失: {f} (Missing file)"
                    
            return True, ""
    except Exception as e:
        return False, f"校验异常: {str(e)}"


@routes.post("/api/lora_manager/health_scan")
async def api_health_scan(request):
    """
    API 接口: 启动健康检查扫描。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 启动状态。
    """
    data = await request.json()
    scan_type = data.get("type", "all")
    settings = get_local_settings()
    
    asyncio.create_task(health_manager.scan(scan_type, settings=settings))
    return web.json_response({"status": "started"})

@routes.get("/api/lora_manager/health_status")
async def api_health_status(request):
    """
    API 接口: 获取健康检查状态。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 任务进度和状态。
    """
    return web.json_response(health_manager.current_task)

@routes.post("/api/lora_manager/health_fix")
async def api_health_fix(request):
    """
    API 接口: 执行修复操作（如删除重复项）。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 启动状态。
    """
    data = await request.json()
    items = data.get("items", [])
    delete_empty_folders = data.get("delete_empty_folders", False)
    if not items:
        return web.json_response({"status": "error", "message": "未提供要删除的项目"}, status=400)
    
    asyncio.create_task(health_manager.delete_items(items, delete_empty_folders))
    return web.json_response({"status": "started"})

@routes.post("/api/lora_manager/health_ignore_update")
async def api_health_ignore_update(request):
    """
    API 接口: 忽略模型的更新。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 更新结果。
    """
    data = await request.json()
    path = data.get("path")
    version_id = data.get("version_id")
    if not path:
        return web.json_response({"status": "error", "message": "缺失路径"}, status=400)
    
    if path in db_manager.metadata:
        update_data = {"new_version_available": False}
        if version_id:
            update_data["ignored_version_id"] = str(version_id)
        db_manager.update_item(path, update_data)
        return web.json_response({"status": "success"})
    return web.json_response({"status": "error", "message": "未找到路径"}, status=404)

@routes.post("/api/lora_manager/health_cancel")
async def api_health_cancel(request):
    """
    API 接口: 取消当前的健康检查或修复任务。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 取消结果。
    """
    success = health_manager.cancel()
    return web.json_response({"status": "success" if success else "failed"})


@routes.post("/lora_manager/create_snapshot")
async def api_create_snapshot(request):
    """
    API 接口: 创建数据快照。

    参数:
        request: aiohttp 请求对象，可选包含前缀。
    返回:
        web.json_response: 创建结果和快照信息。
    """
    data = await request.json() if request.has_body else {}
    prefix = data.get("prefix", "sk_backup_")
    
    result = create_snapshot_internal(prefix)
    if result["status"] == "success":
        return web.json_response({
            "status": "success",
            "snapshot": {
                "filename": result["filename"],
                "display_time": result["display_time"],
                "size": result["size"]
            }
        })
    else:
        return web.json_response({"status": "error", "message": result["message"]}, status=500)

@routes.get("/lora_manager/list_snapshots")
async def api_list_snapshots(request):
    """
    API 接口: 获取所有可用的快照列表。

    参数:
        request: aiohttp 请求对象。
    返回:
        web.json_response: 快照列表。
    """
    try:
        snapshot_dir = get_snapshot_dir()
        snapshots = []
        if os.path.exists(snapshot_dir):
            for f in os.listdir(snapshot_dir):
                is_manual = f.startswith("sk_backup_")
                is_sync_c = f.startswith("auto_sync_c_")
                is_auto = f.startswith("auto_sync_") and not is_sync_c
                
                if (is_manual or is_auto or is_sync_c) and f.endswith(".zip"):
                    path = os.path.join(snapshot_dir, f)
                    try:
                        if is_manual:
                            prefix = "sk_backup_"
                        elif is_sync_c:
                            prefix = "auto_sync_c_"
                        else:
                            prefix = "auto_sync_"
                            
                        ts_str = f.replace(prefix, "").replace(".zip", "")
                        from datetime import datetime
                        dt = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
                        display_time = dt.strftime("%Y-%m-%d %H:%M:%S")
                        
                        is_valid, error_msg = validate_snapshot(path)
                        
                        remark = ""
                        if is_sync_c:
                            remark = "remark_sync_c_auto"
                        elif is_auto:
                            remark = "remark_duplicate_auto"
                        elif is_manual:
                            remark = "remark_manual"
                            
                        snapshots.append({
                            "filename": f,
                            "display_time": display_time,
                            "size": os.path.getsize(path),
                            "timestamp": dt.timestamp(),
                            "is_valid": is_valid,
                            "error_msg": error_msg,
                            "type": "manual" if is_manual else "auto",
                            "remark": remark
                        })
                    except:
                        continue
                        
        snapshots.sort(key=lambda x: x["timestamp"], reverse=True)
        return web.json_response({"status": "success", "snapshots": snapshots})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/lora_manager/restore_snapshot")
async def api_restore_snapshot(request):
    """
    API 接口: 从选定的快照恢复数据。

    参数:
        request: aiohttp 请求对象，包含文件名。
    返回:
        web.json_response: 恢复结果。
    """
    try:
        data = await request.json()
        filename = data.get("filename")
        if not filename:
            return web.json_response({"status": "error", "message": "缺失文件名"}, status=400)
            
        snapshot_dir = get_snapshot_dir()
        filepath = os.path.join(snapshot_dir, filename)
        if not os.path.exists(filepath):
            return web.json_response({"status": "error", "message": "未找到快照文件"}, status=404)
            
        is_valid, error_msg = validate_snapshot(filepath)
        if not is_valid:
            return web.json_response({"status": "error", "message": f"快照校验失败: {error_msg}"}, status=403)

        with zipfile.ZipFile(filepath, 'r') as zf:
            namelist = zf.namelist()
            
            db_filename = os.path.basename(db_manager.db_path)
            if db_filename in namelist:
                with open(db_manager.db_path, 'wb') as f:
                    f.write(zf.read(db_filename))
                db_manager.load()
            
            settings_filename = os.path.basename(SETTINGS_FILE)
            if settings_filename in namelist:
                with open(SETTINGS_FILE, 'wb') as f:
                    f.write(zf.read(settings_filename))
            
            bm_filename = os.path.basename(BASEMODEL_SETTINGS_FILE)
            if bm_filename in namelist:
                with open(BASEMODEL_SETTINGS_FILE, 'wb') as f:
                    f.write(zf.read(bm_filename))
                    
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@routes.post("/lora_manager/delete_snapshot")
async def api_delete_snapshot(request):
    """
    API 接口: 删除选定的快照文件。

    参数:
        request: aiohttp 请求对象，包含文件名。
    返回:
        web.json_response: 删除结果和最新的备份时间。
    """
    try:
        data = await request.json()
        filename = data.get("filename")
        if not filename:
            return web.json_response({"status": "error", "message": "缺失文件名"}, status=400)
            
        snapshot_dir = get_snapshot_dir()
        filepath = os.path.join(snapshot_dir, filename)
        
        # 检查是否删除的是最新备份
        settings = get_local_settings()
        last_backup_time = settings.get("last_backup")
        
        # 从文件名解析被删除的时间
        deleted_time = ""
        try:
            is_manual = filename.startswith("sk_backup_")
            is_sync_c = filename.startswith("auto_sync_c_")
            is_auto = filename.startswith("auto_sync_") and not is_sync_c
            
            if is_manual:
                prefix = "sk_backup_"
            elif is_sync_c:
                prefix = "auto_sync_c_"
            elif is_auto:
                prefix = "auto_sync_"
            else:
                prefix = ""
            
            if prefix:
                ts_str = filename.replace(prefix, "").replace(".zip", "")
                from datetime import datetime
                dt = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
                deleted_time = dt.strftime("%Y-%m-%d %H:%M:%S")
        except: pass

        if os.path.exists(filepath):
            os.remove(filepath)
            
            # 如果删除的是最新备份，则更新 last_backup
            if deleted_time and deleted_time == last_backup_time:
                # 重新获取剩余快照中的最新一个 (只看手动备份)
                snapshots = []
                for f in os.listdir(snapshot_dir):
                    if f.startswith("sk_backup_") and f.endswith(".zip"):
                        try:
                            t_str = f.replace("sk_backup_", "").replace(".zip", "")
                            d_t = datetime.strptime(t_str, "%Y%m%d_%H%M%S")
                            snapshots.append({"time": d_t.strftime("%Y-%m-%d %H:%M:%S"), "ts": d_t.timestamp()})
                        except: continue
                
                if snapshots:
                    snapshots.sort(key=lambda x: x["ts"], reverse=True)
                    settings["last_backup"] = snapshots[0]["time"]
                else:
                    settings["last_backup"] = ""
                
                save_local_settings(settings)
            
            return web.json_response({"status": "success", "last_backup": settings.get("last_backup", "")})
        else:
            return web.json_response({"status": "error", "message": "未找到快照文件"}, status=404)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

