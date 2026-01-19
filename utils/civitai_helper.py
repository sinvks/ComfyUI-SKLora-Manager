import os
import requests
import re

class CivitaiHelper:
    def __init__(self, api_key="", proxy=""):
        self.api_key = api_key
        self.proxy = proxy
        self.base_url = "https://civitai.com/api/v1"

    def get_headers(self):
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def get_proxies(self):
        if self.proxy:
            return {"http": self.proxy, "https": self.proxy}
        return None

    # 修改时间：2025-12-30 20:15:45 - 优化：提取 HTML 清理逻辑，用于处理模型介绍
    def clean_html(self, raw_html):
        if not raw_html: return ""
        cleanr = re.compile('<.*?>')
        cleantext = re.sub(cleanr, '', raw_html)
        return cleantext.strip()

    def get_version_by_hash(self, file_hash):
        # 深度权限穿透：强制增加 nsfw=true 和 browsingLevel=31 (位掩码全开 1+2+4+8+16)
        # 解决 API 返回屏蔽码 16 的问题
        url = f"{self.base_url}/model-versions/by-hash/{file_hash}?nsfw=true&browsingLevel=31"
        print(f"[SK-LoRA] [System] 正在获取模型信息 (Hash: {file_hash[:8]})...")
        try:
            response = requests.get(url, headers=self.get_headers(), proxies=self.get_proxies(), timeout=15)
            if response.status_code == 200:
                print(f"[SK-LoRA] [System] 模型信息获取成功")
                try:
                    return response.json()
                except Exception as e:
                    print(f"[SK-LoRA] [System] JSON 解析失败")
                    return None
            else:
                if response.status_code == 401:
                    print("[SK-LoRA] [System] API Key 可能无效或已过期")
                elif response.status_code == 403:
                    print("[SK-LoRA] [System] API Key 权限不足")
                elif response.status_code == 404:
                    print(f"[SK-LoRA] [System] 未找到模型 (Hash: {file_hash[:8]})，该模型未被收录或已删除")
                else:
                    print(f"[SK-LoRA] [System] API 请求失败，状态码: {response.status_code}")
                return None
        except Exception as e:
            print(f"[SK-LoRA] [System] 网络请求异常: {str(e)}")
            return None

    def get_model_details(self, model_id):
        """获取模型的详细信息，包括所有版本列表"""
        # 深度权限穿透：强制增加 nsfw=true 和 browsingLevel=31
        url = f"{self.base_url}/models/{model_id}?nsfw=true&browsingLevel=31"
        try:
            response = requests.get(url, headers=self.get_headers(), proxies=self.get_proxies(), timeout=15)
            if response.status_code == 200:
                try:
                    return response.json()
                except Exception as e:
                    print(f"[SK-LoRA] [System] 模型详情解析失败")
                    return None
            return None
        except Exception as e:
            print(f"[SK-LoRA] [System] 获取模型详情失败: {str(e)}")
            return None

    def download_image(self, url, save_path):
        try:
            response = requests.get(url, proxies=self.get_proxies(), timeout=30, stream=True)
            if response.status_code == 200:
                with open(save_path, 'wb') as f:
                    for chunk in response.iter_content(1024):
                        f.write(chunk)
                return True
        except:
            pass
        return False