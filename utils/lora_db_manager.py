import os
import json
import hashlib
import time

class LoraDBManager:
    def __init__(self):
        curr_dir = os.path.dirname(os.path.realpath(__file__))
        plugin_root = os.path.dirname(curr_dir)
        self.db_path = os.path.join(plugin_root, "data", "lora_trigger_words.json")
        # 自动定位模型目录
        parent_dir = os.path.dirname(os.path.dirname(plugin_root))
        self.lora_base_dir = os.path.normpath(os.path.join(parent_dir, "models", "loras"))
        self.metadata = {}
        self.load()

    def load(self):
        if not os.path.exists(self.db_path):
            self.metadata = {}
            return {}
        try:
            with open(self.db_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 核心改动：在加载时进行数据迁移和清洗
                self.metadata = self._migrate_schema(data)
            return self.metadata
        except Exception as e:
            print(f"[SK-LoRA] [System] 数据库加载失败: {e}")
            return {}

    def _migrate_schema(self, data):
        """
        数据结构平滑迁移逻辑。
        作用：当数据库中缺少某个字段时，自动按照规则补齐，避免前端出现 undefined。
        """
        updated = False
        for path, info in data.items():
            # 1. 处理新增的 source 字段 (civitai/local)
            if "source" not in info:
                link = info.get("link", "")
                # 如果有 C 站链接，自动标记来源为 civitai，否则为 local
                if link and "civitai.com" in link:
                    info["source"] = "civitai"
                else:
                    info["source"] = "local"
                updated = True
            
            # 3. 处理收藏夹字段（确保存在）
            if "is_fav" not in info:
                info["is_fav"] = False
                updated = True
                
            # 4. 处理 published 字段（新增字段）
            if "published" not in info:
                # 对于本地模型，默认为未知发布时间
                # 对于C站模型，可以后续通过API获取发布时间
                info["published"] = ""
                updated = True
                
            # 5. 处理 civitai_model_id 字段（新增字段）
            if "civitai_model_id" not in info:
                # 默认为空字符串，表示未获取到C站模型ID
                info["civitai_model_id"] = ""
                updated = True

            # 6. 处理 nsfw_level 字段（新增字段）
            if "nsfw_level" not in info:
                # 默认为 1 (None/Soft)
                info["nsfw_level"] = 1
                updated = True

            # 7. 处理 base_model 字段
            if "base_model" not in info:
                info["base_model"] = ""
                updated = True

            # 8. 处理 new_version_available 字段
            if "new_version_available" not in info:
                info["new_version_available"] = False
                updated = True

            # 9. 处理 ignored_version_id 字段
            if "ignored_version_id" not in info:
                info["ignored_version_id"] = ""
                updated = True

            # 10. 处理 sampler 字段
            if "sampler" not in info:
                info["sampler"] = ""
                updated = True

        # 如果数据发生了补全，立即写回磁盘，确保 JSON 文件是最新的
        if updated:
            print("[SK-LoRA] [System] 数据库结构已自动升级并同步")
            self.metadata = data
            self._write_to_disk()
        
        return data

    def get_all(self):
        return self.metadata

    def update_item(self, path, values):
        if path not in self.metadata:
            self.metadata[path] = {}
        self.metadata[path].update(values)
        return self._write_to_disk()

    def _write_to_disk(self):
        try:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            with open(self.db_path, 'w', encoding='utf-8') as f:
                json.dump(self.metadata, f, indent=4, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"[SK-LoRA] [System] 写入失败: {e}")
            return False

    def refresh_scan(self, settings=None):
        """扫描本地 Lora 目录并同步数据库"""
        if not os.path.exists(self.lora_base_dir):
            return False
            
        # 检查是否开启更新检查
        check_update = True
        if settings:
            check_update = settings.get("check_update", True)
            
        new_metadata = {}
        try:
            for root, dirs, files in os.walk(self.lora_base_dir):
                for f in files:
                    if f.endswith((".safetensors", ".ckpt")):
                        full_path = os.path.join(root, f)
                        rel_path = os.path.relpath(full_path, self.lora_base_dir).replace("\\", "/")
                        
                        mtime = int(os.path.getmtime(full_path))
                        size = os.path.getsize(full_path)
                        
                        old_info = self.metadata.get(rel_path, {})
                        old_hash = old_info.get("hash", "")
                        old_mtime = old_info.get("mtime", 0)
                        old_size = old_info.get("size", 0)
                        
                        # TSH Strategy: Check mtime and size to skip hash calculation
                        if not old_hash or len(old_hash) == 10 or mtime != old_mtime or size != old_size:
                            # 计算哈希（用于识别）- 使用完整文件的SHA256值
                            with open(full_path, "rb") as f_obj:
                                # 创建SHA256哈希对象
                                sha256_hash = hashlib.sha256()
                                # 分块读取文件以避免内存问题  每块读取 4MB
                                for byte_block in iter(lambda: f_obj.read(4096000), b""):
                                    sha256_hash.update(byte_block)
                                curr_hash = sha256_hash.hexdigest()
                                print(f"[SK-LoRA] [System] Re-calculated hash for {rel_path}: {curr_hash}")
                        else:
                            curr_hash = old_hash
                        
                        # 自动寻找同名预览图
                        img_rel = ""
                        base_no_ext = os.path.splitext(full_path)[0]
                        for ext in [".png", ".jpg", ".jpeg", ".webp", ".preview.png"]:
                            if os.path.exists(base_no_ext + ext):
                                img_rel = os.path.relpath(base_no_ext + ext, self.lora_base_dir).replace("\\", "/")
                                break

                        # 核心改动：在扫描新文件时，继承或初始化 source 字段
                        old_img = old_info.get("img", "")
                        # 物理校验：如果旧数据中有预览图路径，但物理文件已不存在，则清空
                        if old_img and not os.path.exists(os.path.join(self.lora_base_dir, old_img)):
                            old_img = ""

                        new_metadata[rel_path] = {
                            "img": img_rel or old_img,
                            "hash": curr_hash,
                            "mtime": mtime,
                            "size": size,
                            "source": old_info.get("source", "local"), # 默认为 local
                            "link": old_info.get("link", ""),
                            "title": old_info.get("title", ""),
                            "weight": old_info.get("weight", ""),
                            "trigger_words": old_info.get("trigger_words", []),
                            "tags": old_info.get("tags", []),
                            "is_fav": old_info.get("is_fav", False),
                            "base_model": old_info.get("base_model", "Unknown"),
                            "sampler": old_info.get("sampler", ""),
                            "nsfw_level": old_info.get("nsfw_level", 1), # 新增 nsfw_level 字段
                            "notes": old_info.get("notes", ""),
                            "version_id": old_info.get("version_id", ""),
                            "custom_props": old_info.get("custom_props", {}),
                            "published": old_info.get("published", ""), # 新增published字段
                            "new_version_available": old_info.get("new_version_available", False) if check_update else False # 新增 new_version_available 字段
                        }
            
            self.metadata = new_metadata
            return self._write_to_disk()
        except Exception as e:
            print(f"[SK-LoRA] [System] 同步过程中出错: {e}")
            import traceback
            traceback.print_exc()
            return False

    def sync_local_disk(self):
        """核心功能：扫描磁盘 LoRA 文件并同步数据库，支持多格式预览图匹配"""
        if not os.path.exists(self.lora_base_dir):
            print(f"[SK-LoRA] [System] 错误：LoRA 目录不存在: {self.lora_base_dir}")
            return {"added": 0, "removed": 0, "status": "error"}
            
        new_metadata = {}
        added_count = 0
        
        # 定义您要求的图片匹配后缀优先级
        img_exts = ['.png', '.jpg', '.jpeg', '.webp']
        
        try:
            for root, dirs, files in os.walk(self.lora_base_dir):
                for f in files:
                    if f.endswith((".safetensors", ".ckpt")):
                        full_path = os.path.join(root, f)
                        # 统一使用正斜杠作为相对路径 Key
                        rel_path = os.path.relpath(full_path, self.lora_base_dir).replace("\\", "/")
                        base_name_path = os.path.splitext(full_path)[0]
                        
                        # --- 1. 预览图智能匹配逻辑 ---
                        preview_img_rel = ""
                        # 构建优先级清单：[同名+后缀] > [同名+.preview+后缀]
                        check_list = []
                        for ext in img_exts: check_list.append(base_name_path + ext)
                        for ext in img_exts: check_list.append(base_name_path + ".preview" + ext)
                        
                        for p in check_list:
                            if os.path.exists(p):
                                preview_img_rel = os.path.relpath(p, self.lora_base_dir).replace("\\", "/")
                                break

                        # --- 2. 物理信息获取 ---
                        mtime = int(os.path.getmtime(full_path))
                        size = os.path.getsize(full_path)
                        
                        # --- 2.5. 数据合并与保护 ---
                        old_info = self.metadata.get(rel_path, {})
                        if not old_info:
                            added_count += 1
                        
                        old_img = old_info.get("img", "")
                        # 物理校验：如果数据库记录了预览图但磁盘上已不存在，则清空
                        if old_img and not os.path.exists(os.path.join(self.lora_base_dir, old_img)):
                            old_img = ""
                            
                        # --- 2.6. 计算完整文件的SHA256哈希值 (TSH 优化) ---
                        curr_hash = ""
                        old_hash = old_info.get("hash", "")
                        old_mtime = old_info.get("mtime", 0)
                        old_size = old_info.get("size", 0)
                        
                        # TSH Check: 重新计算条件 = 无哈希 OR 旧格式 OR 修改时间变了 OR 大小变了
                        should_rehash = (not old_hash) or (len(old_hash) == 10) or (mtime != old_mtime) or (size != old_size)

                        if should_rehash:
                            if mtime != old_mtime or size != old_size:
                                print(f"[SK-LoRA] [System] 检测到文件变更 (离线修改): {rel_path}")
                            else:
                                print(f"[SK-LoRA] [System] 正在计算 {rel_path} 的完整SHA256哈希值...")
                                
                            try:
                                with open(full_path, "rb") as f_obj:
                                    sha256_hash = hashlib.sha256()
                                    # 分块读取文件以避免内存问题
                                    for byte_block in iter(lambda: f_obj.read(4096000), b""):
                                        sha256_hash.update(byte_block)
                                    curr_hash = sha256_hash.hexdigest()
                                    # print(f"[SK-LoRA] [System] 文件 {rel_path} 的完整SHA256哈希值: {curr_hash[:16]}...")
                            except Exception as e:
                                print(f"[SK-LoRA] [System] 计算 {rel_path} 哈希值时出错: {e}")
                                curr_hash = old_hash  # 使用旧哈希值作为备选
                        else:
                            # 使用已有的完整SHA256哈希值
                            curr_hash = old_hash
                        
                        # 组装数据条目：优先保留用户手动填写的字段
                        new_metadata[rel_path] = {
                            "img": preview_img_rel or old_img,
                            "mtime": mtime,
                            "size": size,
                            # 以下字段如果旧数据里有则保留，没有则初始化
                            "title": old_info.get("title", os.path.splitext(f)[0]),
                            "source": old_info.get("source", "local"),
                            "weight": old_info.get("weight", ""),
                            "notes": old_info.get("notes", ""),
                            "link": old_info.get("link", ""),
                            "base_model": old_info.get("base_model", ""),
                            "sampler": old_info.get("sampler", ""),
                            "is_fav": old_info.get("is_fav", False),
                            "trigger_words": old_info.get("trigger_words", []),
                            "tags": old_info.get("tags", []),
                            "hash": curr_hash, # 使用计算或保留的完整SHA256哈希值
                            "nsfw_level": old_info.get("nsfw_level", 1), # 新增 nsfw_level 字段
                            "custom_props": old_info.get("custom_props", {}),
                            "published": old_info.get("published", ""), # 新增published字段
                            "civitai_model_id": old_info.get("civitai_model_id", ""), # 新增civitai_model_id字段
                            "new_version_available": old_info.get("new_version_available", False) # 新增 new_version_available 字段
                        }
            
            # 计算被移除的文件数量
            removed_count = len([k for k in self.metadata if k not in new_metadata])
            
            # 更新内存并写入磁盘
            self.metadata = new_metadata
            self._write_to_disk()
            
            return {
                "status": "success",
                "added": added_count,
                "removed": removed_count
            }
            
        except Exception as e:
            print(f"[SK-LoRA] [System] 同步出错: {e}")
            return {"status": "error", "message": str(e)}
    
    def update_all_hashes(self):
        """更新所有旧格式（10字符）的哈希值为完整SHA256值"""
        if not os.path.exists(self.lora_base_dir):
            print(f"[SK-LoRA] [System] 错误：LoRA 目录不存在: {self.lora_base_dir}")
            return {"status": "error", "message": "LoRA目录不存在"}
        
        updated_count = 0
        error_count = 0
        
        try:
            for rel_path, info in self.metadata.items():
                old_hash = info.get("hash", "")
                if len(old_hash) == 10:  # 检测旧格式哈希
                    full_path = os.path.join(self.lora_base_dir, rel_path)
                    if os.path.exists(full_path):
                        try:
                            print(f"[SK-LoRA] [System] 正在更新 {rel_path} 的哈希值...")
                            # 使用完整文件计算SHA256
                            with open(full_path, "rb") as f_obj:
                                sha256_hash = hashlib.sha256()
                                # 分块读取文件以避免内存问题
                                for byte_block in iter(lambda: f_obj.read(4096), b""):
                                    sha256_hash.update(byte_block)
                                new_hash = sha256_hash.hexdigest()
                                
                            self.metadata[rel_path]["hash"] = new_hash
                            print(f"[SK-LoRA] [System] {rel_path} 哈希值已更新: {old_hash} -> {new_hash[:16]}...")
                            updated_count += 1
                        except Exception as e:
                            print(f"[SK-LoRA] [System] 更新 {rel_path} 哈希值时出错: {e}")
                            error_count += 1
                    else:
                        print(f"[SK-LoRA] [System] 警告：文件不存在 {full_path}")
                        error_count += 1
            
            # 保存更新后的数据
            if updated_count > 0:
                self._write_to_disk()
                print(f"[SK-LoRA] [System] 哈希值更新完成，共更新 {updated_count} 个文件")
            
            return {
                "status": "success",
                "updated": updated_count,
                "errors": error_count
            }
            
        except Exception as e:
            print(f"[SK-LoRA] [System] 批量更新哈希值时出错: {e}")
            return {"status": "error", "message": str(e)}
    
    def refresh_scan_with_progress(self, sync_status, settings=None, on_processed=None):
        """
        扫描本地 Lora 目录并同步数据库，支持进度报告和取消操作
        Args:
            sync_status: 用于跟踪同步状态和进度的字典对象
            settings: 可选的设置对象，用于检查 check_update 状态
            on_processed: 每个文件处理完后的回调函数 (rel_path, info)
        Returns:
            dict: 包含同步结果和统计信息的字典
        """
        if not os.path.exists(self.lora_base_dir):
            return False
        
        # 检查是否开启更新检查
        check_update = True
        if settings:
            check_update = settings.get("check_update", True)
         
        
        start_time = time.time()
        
        new_metadata = {}
        added_count = 0
        processed_count = 0
        error_count = 0
        
        try:
            # 首先收集所有需要处理的文件
            sync_status["status"] = "正在扫描目录..."
            sync_status["current_item"] = ""
            sync_status["hash"] = ""
            sync_status["has_preview"] = False
            sync_status["date"] = 0
            all_files = []
            for root, dirs, files in os.walk(self.lora_base_dir):
                for f in files:
                    if f.endswith((".safetensors", ".ckpt")):
                        full_path = os.path.join(root, f)
                        all_files.append(full_path)
            
            # 更新总文件数
            sync_status["stats"]["total"] = len(all_files)
            sync_status["status"] = "开始扫描本地文件..."
            sync_status["progress"] = 0
            
            # 处理每个文件
            for i, full_path in enumerate(all_files):
                # 检查是否已取消
                if sync_status.get("is_cancelled", False):
                    print(f"[SK-LoRA] [System] 同步已取消，已处理 {processed_count} 个文件")
                    return {"status": "cancelled", "processed": processed_count}
                
                try:
                    rel_path = os.path.relpath(full_path, self.lora_base_dir).replace("\\", "/")
                    f = os.path.basename(full_path)
                    
                    mtime = int(os.path.getmtime(full_path))
                    size = os.path.getsize(full_path)
                    
                    # 自动寻找同名预览图
                    img_rel = ""
                    base_no_ext = os.path.splitext(full_path)[0]
                    for ext in [".png", ".jpg", ".jpeg", ".webp", ".preview.png"]:
                        if os.path.exists(base_no_ext + ext):
                            img_rel = os.path.relpath(base_no_ext + ext, self.lora_base_dir).replace("\\", "/")
                            break
                    
                    old_info = self.metadata.get(rel_path, {})
                    old_img = old_info.get("img", "")
                    # 物理校验：如果数据库记录了预览图但磁盘上已不存在，则清空
                    if old_img and not os.path.exists(os.path.join(self.lora_base_dir, old_img)):
                        old_img = ""

                    # 更新进度 - 在计算哈希之前更新，以便前端能显示当前文件信息
                    sync_status["current_item"] = f"正在处理: {f}"
                    sync_status["has_preview"] = bool(img_rel or old_img)
                    sync_status["date"] = mtime
                    sync_status["progress"] = int((i / len(all_files)) * 100)
                    sync_status["status"] = f"正在计算哈希... ({i+1}/{len(all_files)})"
                    
                    # TSH Check for Progress Scan
                    old_hash = old_info.get("hash", "")
                    old_mtime = old_info.get("mtime", 0)
                    old_size = old_info.get("size", 0)
                    
                    if not old_hash or len(old_hash) == 10 or mtime != old_mtime or size != old_size:
                        # 计算哈希（用于识别）- 使用完整文件的SHA256值
                        sync_status["status"] = f"正在计算哈希... ({i+1}/{len(all_files)})"
                        with open(full_path, "rb") as f_obj:
                            # 创建SHA256哈希对象
                            sha256_hash = hashlib.sha256()
                            # 分块读取文件以避免内存问题  每块读取 4MB
                            for byte_block in iter(lambda: f_obj.read(4096000), b""):
                                sha256_hash.update(byte_block)
                            curr_hash = sha256_hash.hexdigest()
                    else:
                        curr_hash = old_hash
                        sync_status["status"] = f"快速验证通过 ({i+1}/{len(all_files)})"

                    # 哈希计算完成后更新哈希值
                    sync_status["hash"] = curr_hash
                    sync_status["status"] = f"扫描中... ({i+1}/{len(all_files)})"
                    
                    old_info = self.metadata.get(rel_path, {})

                    # 核心改动：在扫描新文件时，继承或初始化信息
                    new_metadata[rel_path] = {
                        "img": img_rel or old_img,
                        "hash": curr_hash,
                        "mtime": mtime,
                        "size": size,
                        "source": old_info.get("source", "local"), # 默认为 local
                        "link": old_info.get("link", ""),
                        "title": old_info.get("title", ""),
                        "weight": old_info.get("weight", ""),
                        "trigger_words": old_info.get("trigger_words", []),
                        "tags": old_info.get("tags", []),
                        "is_fav": old_info.get("is_fav", False),
                        "base_model": old_info.get("base_model", ""),
                        "sampler": old_info.get("sampler", ""),
                        "nsfw_level": old_info.get("nsfw_level", 1), # 新增 nsfw_level 字段
                        "custom_props": old_info.get("custom_props", {}),
                        "published": old_info.get("published", ""), # 新增published字段
                        "civitai_model_id": old_info.get("civitai_model_id", ""), # 新增civitai_model_id字段
                        "new_version_available": old_info.get("new_version_available", False) if check_update else False, # 新增 new_version_available 字段
                        "notes": old_info.get("notes", "")
                    }
                    
                    # 如果是新文件，增加计数
                    if rel_path not in self.metadata:
                        added_count += 1
                    
                    # 执行回调 (例如生成缩略图)
                    if on_processed:
                        try:
                            on_processed(rel_path, new_metadata[rel_path])
                        except Exception as cb_err:
                            print(f"[SK-LoRA] [System] Callback error for {rel_path}: {cb_err}")

                    processed_count += 1
                    sync_status["stats"]["processed"] = processed_count
                    sync_status["stats"]["success"] = processed_count - error_count
                    
                except Exception as e:
                    print(f"[SK-LoRA] [System] 处理文件 {full_path} 时出错: {e}")
                    error_count += 1
                    sync_status["stats"]["failed"] = error_count
            
            # 计算被移除的文件数量
            removed_count = len([k for k in self.metadata if k not in new_metadata])
            
            # 更新最终状态
            sync_status["status"] = "正在保存数据..."
            sync_status["progress"] = 95
            
            # 更新内存并写入磁盘
            self.metadata = new_metadata
            self._write_to_disk()
            
            # 更新最终状态
            sync_status["status"] = "同步完成"
            sync_status["progress"] = 100
            sync_status["current_item"] = ""
            
            # 计算耗时
            duration = round(time.time() - start_time, 1)
            
            return {
                "status": "success",
                "added": added_count,
                "removed": removed_count,
                "processed": processed_count,
                "errors": error_count,
                "duration": duration
            }
            
        except Exception as e:
            print(f"[SK-LoRA] [System] 同步出错: {e}")
            sync_status["status"] = f"同步出错: {str(e)}"
            return {"status": "error", "message": str(e)}

# 导出单例
db_manager = LoraDBManager()