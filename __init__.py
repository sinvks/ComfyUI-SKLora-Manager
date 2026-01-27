import os
import sys
import re
import logging
from pathlib import Path

# 1. 获取插件根目录
NODE_ROOT = Path(__file__).parent.resolve()

# 1.1 数据初始化 (防止更新覆盖用户数据)
try:
    from .utils import data_manager
    data_manager.init_data()
except Exception as e:
    print(f"❌[SK-LoRA] [Data] 数据初始化失败: {e}")

# 2. 版本管理
def get_version():
    """从 pyproject.toml 读取版本号"""
    try:
        toml_path = NODE_ROOT / "pyproject.toml"
        if toml_path.exists():
            with open(toml_path, "r", encoding='utf-8') as f:
                content = f.read()
                version_match = re.search(r'version\s*=\s*"([^"]+)"', content)
                if version_match:
                    return version_match.group(1)
        return "1.0.3"
    except Exception:
        return "1.0.3"

VERSION = get_version()

def inject_version_to_frontend():
    """将版本号注入前端全局变量"""
    try:
        js_dir = NODE_ROOT / "web" / "js"
        if not js_dir.exists():
            js_dir.mkdir(parents=True)
        
        version_file = js_dir / "version.js"
        js_code = f'window.SK_Lora_Manager_Version = "{VERSION}";\n'
        with open(version_file, "w", encoding='utf-8') as f:
            f.write(js_code)
    except Exception as e:
        print(f"❌[SK-LoRA] [System] 版本注入失败: {e}")

# 3. 加载后端 API 路由
try:
    # 直接使用相对导入，替代 importlib 动态加载
    from .utils import lora_manager_api
    print(f"✅[SK-LoRA] [System] API Server 注册成功 (v{VERSION})")
except Exception as e:
    print(f"❌[SK-LoRA] [System] API 加载异常: {e}")

# 4. 节点注册 (借鉴字典解包与批量注册方式)
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

def register_nodes():
    """集中注册所有节点"""
    try:
        # 静态导入所有节点类
        from .nodes.sk_lora_manager import SK_LoraLoaderManager
        from .nodes.sk_lora_meta_extractor import SK_LoraMetaExtractor
        from .nodes.sk_lora_meta_inspector import SK_LoraMetaInspector
        from .nodes.sk_prompt_matrix_v1 import SK_PromptMatrix_V1
        from .nodes.sk_prompt_matrix_v2 import SK_PromptMatrix_V2
        from .nodes.sk_prompt_matrix_v3 import SK_PromptMatrix_V3
        from .nodes.sk_merge_prompt import SK_MergePrompt
        from .nodes.sk_point_indexer import SK_PointIndexer
        from .nodes.sk_interactive_editor import SK_InteractiveEditor

        # 节点映射配置 (Internal Name -> (Class, Display Name))
        mappings = {
            "SK_LoraLoaderManager": (SK_LoraLoaderManager, "SK Lora Loader"),
            "SK_LoraMetaExtractor": (SK_LoraMetaExtractor, "SK Lora Meta Extractor"),
            "SK_LoraMetaInspector": (SK_LoraMetaInspector, "SK Lora Meta Inspector"),
            "SK_PromptMatrix_V1": (SK_PromptMatrix_V1, "SK Prompt Matrix Sampler V1"),
            "SK_PromptMatrix_V2": (SK_PromptMatrix_V2, "SK Prompt Matrix Sampler V2"),
            "SK_PromptMatrix_V3": (SK_PromptMatrix_V3, "SK Prompt Matrix Sampler V3"),
            "SK_MergePrompt": (SK_MergePrompt, "SK Merge Prompt"),
            "SK_PointIndexer": (SK_PointIndexer, "SK Point Indexer"),
            "SK_InteractiveEditor": (SK_InteractiveEditor, "SK Interactive Editor"),
        }

        # 批量注册
        for node_id, (node_class, display_name) in mappings.items():
            NODE_CLASS_MAPPINGS[node_id] = node_class
            NODE_DISPLAY_NAME_MAPPINGS[node_id] = display_name
            print(f"✅[SK-LoRA] [System] {node_id} 注册成功") # 静默注册，减少日志干扰
    except Exception as e:
        print(f"❌[SK-LoRA] [System] 节点注册过程发生异常: {e}")

# 执行注册操作
register_nodes()

# 5. 完成初始化
inject_version_to_frontend()

# 禁用第三方库日志污染
logging.getLogger("httpx").setLevel(logging.WARNING)

# 定义 Web 目录
WEB_DIRECTORY = "web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

# 打印启动成功信息
print(f"🚀[SK-LoRA] [System] LoRA Manager V{VERSION} 已成功启动")
