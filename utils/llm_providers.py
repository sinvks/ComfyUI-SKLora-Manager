import json
import os
import asyncio
import aiohttp
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Union

class BaseDrive(ABC):
    """LLM 供应商基础驱动类"""
    
    # 全局变量，用于限速调度
    _last_request_time = 0
    _lock = asyncio.Lock()
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.api_key = config.get("api_key", "")
        self.base_url = config.get("base_url", "").rstrip("/")
        self.selected_model = config.get("selected_model", "")
        
        # 易读名称属性，供 UI 显示
        # 如果用户定义了 alias 或 name 则使用，否则使用提供商类型
        self.provider_name = config.get("alias") or config.get("name") or config.get("provider", "Unknown")
        self.model_name = self.selected_model or "default"
        
        # 限速配置 (秒)
        try:
            self.min_interval = float(config.get("min_interval", 2.0))
        except (ValueError, TypeError):
            self.min_interval = 2.0
            
        # 容错处理：如果设为 0 或负数，自动重置为 0.1s
        if self.min_interval <= 0:
            self.min_interval = 0.1
            
    async def _wait_for_rate_limit(self):
        """实现限速调度器 (Rate Limiter) 逻辑"""
        async with BaseDrive._lock:
            now = asyncio.get_event_loop().time()
            elapsed = now - BaseDrive._last_request_time
            wait_time = max(0, self.min_interval - elapsed)
            
            if wait_time > 0:
                await asyncio.sleep(wait_time)
                # 更新时间为 sleep 之后的时间
                BaseDrive._last_request_time = asyncio.get_event_loop().time()
            else:
                BaseDrive._last_request_time = now

    @abstractmethod
    async def chat(self, prompt: str, system_prompt: str = "You are a helpful assistant.", keep_alive: Optional[Union[int, str]] = None) -> str:
        """发送对话请求"""
        pass

    @abstractmethod
    async def get_models(self) -> List[str]:
        """获取可用模型列表"""
        pass

class GeminiDrive(BaseDrive):
    """Google Gemini API 驱动"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        if not self.base_url:
            self.base_url = "https://generativelanguage.googleapis.com"

    async def chat(self, prompt: str, system_prompt: str = "", keep_alive: Optional[Union[int, str]] = None) -> str:
        await self._wait_for_rate_limit()
        url = f"{self.base_url}/v1beta/models/{self.selected_model}:generateContent?key={self.api_key}"
        
        # Gemini 的 system_prompt 处理方式略有不同，这里简化合并到 prompt
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        
        payload = {
            "contents": [{
                "parts": [{"text": full_prompt}]
            }]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    try:
                        return data['candidates'][0]['content']['parts'][0]['text']
                    except (KeyError, IndexError):
                        return f"Error: Unexpected response format from Gemini"
                else:
                    text = await resp.text()
                    return f"Error: {resp.status} - {text}"

    async def get_models(self) -> List[str]:
        """尝试从 API 获取模型列表以验证 Key，如果失败则返回预设列表"""
        if not self.api_key:
            return []
            
        url = f"{self.base_url}/v1beta/models?key={self.api_key}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=5) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if 'models' in data:
                            return [m['name'].split('/')[-1] for m in data['models'] if 'generateContent' in m.get('supportedGenerationMethods', [])]
                    else:
                        # 如果 Key 无效，resp.status 会是 400 或 403
                        print(f"[SK-LoRA] [LLM] Gemini API Key 验证失败: {resp.status}")
                        return []
        except Exception as e:
            print(f"[SK-LoRA] [LLM] 获取 Gemini 模型列表失败: {e}")
            return []
            
        # 默认返回常用模型列表 (仅当 API 调用成功但没返回模型时，虽然理论上不会)
        return [
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-2.0-flash-exp",
            "gemini-1.5-pro",
            "gemini-1.5-flash"
        ]

class OllamaDrive(BaseDrive):
    """Ollama 本地驱动"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        if not self.base_url:
            self.base_url = "http://localhost:11434"

    async def chat(self, prompt: str, system_prompt: str = "", keep_alive: Union[int, str, None] = None) -> str:
        await self._wait_for_rate_limit()
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.selected_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "stream": False
        }
        
        if keep_alive is not None:
            payload["keep_alive"] = keep_alive
            # print(f"[SK-LoRA] [LLM] Ollama chat with keep_alive: {keep_alive}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("message", {}).get("content", "")
                else:
                    text = await resp.text()
                    return f"Error: {resp.status} - {text}"

    async def unload_model(self):
        """发送 keep_alive=0 以卸载当前模型并释放显存"""
        if not self.selected_model:
            return
            
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.selected_model,
            "messages": [],
            "keep_alive": 0
        }
        
        # print(f"[SK-LoRA] [LLM] 正在卸载 Ollama 模型 '{self.selected_model}'...")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=5) as resp:
                    if resp.status == 200:
                        # print(f"[SK-LoRA] [LLM] Ollama 模型 '{self.selected_model}' 卸载成功")
                        pass
                    else:
                        text = await resp.text()
                        print(f"[SK-LoRA] [LLM] Ollama 模型卸载失败: {resp.status} - {text}")
        except Exception as e:
            print(f"[SK-LoRA] [LLM] Ollama 模型卸载异常: {e}")

    async def get_models(self) -> List[str]:
        """从本地 Ollama 服务获取模型列表"""
        url = f"{self.base_url}/api/tags"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=5) as resp:
                    if resp.status == 200:
                        text = await resp.text()
                        try:
                            # 尝试解析标准 JSON
                            data = json.loads(text)
                            if isinstance(data, dict) and 'models' in data:
                                return [m['name'] for m in data['models']]
                            elif isinstance(data, list):
                                return [m['name'] if isinstance(m, dict) and 'name' in m else str(m) for m in data]
                        except json.JSONDecodeError:
                            pass
                        
                        # 尝试处理 NDJSON 或多个 JSON 对象连在一起的情况
                        models = []
                        # 使用正则提取所有的 { ... } 块，这比简单的 split('\n') 更健壮
                        import re
                        json_blocks = re.findall(r'\{.*?\}', text, re.DOTALL)
                        for block in json_blocks:
                            try:
                                m_data = json.loads(block)
                                if 'name' in m_data:
                                    models.append(m_data['name'])
                                elif 'models' in m_data and isinstance(m_data['models'], list):
                                    for m in m_data['models']:
                                        if isinstance(m, dict) and 'name' in m:
                                            models.append(m['name'])
                            except:
                                continue
                        
                        if models:
                            return list(set(models)) # 去重
                        
                        # 如果正则也失败了，最后尝试按行分割
                        for line in text.strip().split('\n'):
                            if not line.strip(): continue
                            try:
                                m_data = json.loads(line)
                                if 'name' in m_data:
                                    models.append(m_data['name'])
                            except: continue
                        return list(set(models))
                    else:
                        print(f"[SK-LoRA] [LLM] 获取 Ollama 模型列表失败: {resp.status}")
        except Exception as e:
            print(f"[SK-LoRA] [LLM] 获取 Ollama 模型列表异常: {e}")
        return []

class OpenAIDrive(BaseDrive):
    """通用 OpenAI 兼容接口驱动"""
    
    async def chat(self, prompt: str, system_prompt: str = "", keep_alive: Optional[Union[int, str]] = None) -> str:
        await self._wait_for_rate_limit()
        url = f"{self.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        payload = {
            "model": self.selected_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data['choices'][0]['message']['content']
                else:
                    text = await resp.text()
                    return f"Error: {resp.status} - {text}"

    async def get_models(self) -> List[str]:
        if not self.api_key: return []
        
        url = f"{self.base_url}/models"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=5) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return [m['id'] for m in data.get('data', [])]
        except Exception as e:
            print(f"[SK-LoRA] [LLM] 获取 OpenAI 模型列表失败: {e}")
        return []

LLM_TEMPLATES = {
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com",
        "min_interval": 4.5,
        "models": [
            {"name": "gemini-2.5-flash", "recommended": True},
            {"name": "gemini-2.5-pro", "recommended": True},
            {"name": "gemini-2.0-flash-exp", "recommended": False},
            {"name": "gemini-1.5-flash", "recommended": False},
            {"name": "gemini-1.5-pro", "recommended": False}
        ]
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "min_interval": 6.5,
        "models": [
            {"name": "gpt-4o", "recommended": True},
            {"name": "gpt-4o-mini", "recommended": True},
            {"name": "o1-preview", "recommended": False},
            {"name": "gpt-4-turbo", "recommended": False}
        ]
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "min_interval": 3.0,
        "models": [
            {"name": "deepseek-chat", "recommended": True},
            {"name": "deepseek-reasoner", "recommended": True}
        ]
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "min_interval": 2.0,
        "models": [
            {"name": "llama-3.3-70b-versatile", "recommended": True},
            {"name": "llama-3.1-70b-versatile", "recommended": False},
            {"name": "mixtral-8x7b-32768", "recommended": False}
        ]
    },
    "ollama": {
        "base_url": "http://127.0.0.1:11434",
        "min_interval": 0.5,
        "models": [] # 动态获取
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4/",
        "min_interval": 4.0,
        "models": [
            {"name": "glm-4-flash", "recommended": True},
            {"name": "glm-4", "recommended": False},
            {"name": "glm-4v", "recommended": False}
        ]
    },
    "xflow": {
        "base_url": "https://api.xflow.cc/v1",
        "min_interval": 4.0,
        "models": [
            {"name": "gpt-4o-mini", "recommended": True},
            {"name": "gpt-4o", "recommended": False},
            {"name": "claude-3-5-sonnet", "recommended": False}
        ]
    },
    "custom": {
        "base_url": "",
        "min_interval": 2.0,
        "models": []
    },
    "nvidia": {
        "base_url": "https://integrate.api.nvidia.com/v1",
        "min_interval": 2.0,
        "models": [
            {"name": "nvidia/llama-3.1-405b-instruct", "recommended": True},
            {"name": "meta/llama-3.1-70b-instruct", "recommended": True},
            {"name": "meta/llama-3.1-8b-instruct", "recommended": False},
            {"name": "mistralai/mixtral-8x7b-instruct-v0.1", "recommended": False}
        ]
    }
}

class LLMProviderManager:
    """LLM 供应商管理器"""
    
    # 路径订正：设置文件在 data 目录下
    _config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lora_manager_settings.json")
    
    @staticmethod
    def create_provider(config: Dict[str, Any]) -> Optional[BaseDrive]:
        """根据配置创建驱动实例"""
        p_type = config.get("provider", "").lower()
        if p_type == "gemini":
            return GeminiDrive(config)
        elif p_type == "ollama":
            return OllamaDrive(config)
        elif p_type in ["openai", "deepseek", "groq", "zhipu", "xflow", "custom", "nvidia"]:
            return OpenAIDrive(config)
        return None

    @staticmethod
    def get_provider(provider_id: str) -> Optional[BaseDrive]:
        """根据 ID 获取驱动实例"""
        try:
            if not os.path.exists(LLMProviderManager._config_path):
                # 尝试备用路径（兼容旧版或未加 data 的情况）
                alt_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "lora_manager_settings.json")
                if os.path.exists(alt_path):
                    path = alt_path
                else:
                    return None
            else:
                path = LLMProviderManager._config_path
                
            with open(path, "r", encoding='utf-8') as f:
                settings = json.load(f)
                
            providers = settings.get("llm_configs", [])
            target = next((p for p in providers if p.get("id") == provider_id), None)
            
            if not target:
                return None
                
            return LLMProviderManager.create_provider(target)
                
        except Exception as e:
            print(f"[SK-LoRA] [LLM] 加载 LLM 配置失败: {e}")
        return None

async def test_connection(config: Dict[str, Any]) -> Dict[str, Any]:
    """测试连接性"""
    try:
        provider = LLMProviderManager.create_provider(config)
    except AttributeError as e:
        print(f"[SK-LoRA] [LLM] Create provider failed: {e}")
        return {"status": "error", "message": f"AttributeError: {e}. Please restart ComfyUI to ensure code is reloaded."}
        
    if not provider:
        return {"status": "error", "message": f"Unsupported provider: {config.get('provider')}"}
    
    try:
        # 尝试获取模型列表作为连通性测试
        models = await provider.get_models()
        if models:
            return {"status": "success", "models": models}
        else:
            return {"status": "error", "message": "Could not fetch models, check your URL/API Key or Base URL"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
