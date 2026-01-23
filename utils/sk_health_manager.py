import os
import json
import asyncio
import hashlib
import zipfile
from datetime import datetime
import folder_paths
from . import civitai_helper

class SKHealthManager:
    def __init__(self, db_manager):
        self.db_manager = db_manager
        self.running = False
        self.stop_flag = False
        # 任务状态存储
        self.current_task = {
            "type": None,
            "status": "idle",
            "progress": 0,
            "total": 0,
            "result": None,
            "message": ""
        }

    def _update_status(self, status, progress=0, message="", result=None):
        self.current_task["status"] = status
        self.current_task["progress"] = progress
        self.current_task["message"] = message
        if result is not None:
            self.current_task["result"] = result

    async def scan(self, scan_type="all", settings=None):
        """执行扫描任务：重复项识别 / 更新项识别"""
        if self.running:
            return {"status": "busy"}
        
        if settings is None:
            settings = {}
        
        self.running = True
        self.stop_flag = False
        self.current_task["type"] = scan_type
        self._update_status("running", 0, "Initializing scan...")
        await asyncio.sleep(0.1) # 稍微延迟让前端捕获状态
        
        try:
            duplicates = []
            updates = []
            
            if scan_type in ["all", "duplicates"]:
                end_p = 40 if scan_type == "all" else 100
                self._update_status("running", 10, "Scanning for duplicates...")
                duplicates = await self._find_duplicates(start_progress=10, end_progress=end_p)
                
            if scan_type in ["all", "updates"]:
                # 检查设置是否允许版本更新
                if not settings.get("check_update", True):
                    print("[SK-LoRA] [Health] 已跳过版本更新扫描 (设置中已关闭)")
                    updates = []
                else:
                    start_progress = 40 if scan_type == "all" else 100
                    # 注意：如果 scan_type 是 updates, end_progress 应该是 100
                    # 如果 scan_type 是 all, duplicates 占 0-40, updates 占 40-100
                    start_p = 40 if scan_type == "all" else 10
                    self._update_status("running", start_p, "Checking for updates from Civitai...")
                    updates = await self._check_updates(start_progress=start_p)
            
            result = {
                "duplicates": duplicates,
                "updates": updates,
                "scan_type": scan_type
            }
            
            self._update_status("completed", 100, "Scan complete", result)
            return result

        except Exception as e:
            self._update_status("error", message=str(e))
            return {"status": "error", "message": str(e)}
        finally:
            self.running = False

    async def _find_duplicates(self, start_progress=10, end_progress=100):
        """识别重复项"""
        hash_map = {}
        metadata = self.db_manager.metadata
        total = len(metadata)
        processed = 0
        
        for path, info in metadata.items():
            if self.stop_flag: break
            
            file_hash = info.get("hash")
            if file_hash:
                if file_hash not in hash_map:
                    hash_map[file_hash] = []
                
                # 获取文件信息
                full_path = os.path.join(self.db_manager.lora_base_dir, path)
                file_info = {
                    "path": path,
                    "full_path": full_path,
                    "size": os.path.getsize(full_path) if os.path.exists(full_path) else 0,
                    "mtime": os.path.getmtime(full_path) if os.path.exists(full_path) else 0,
                    "name": os.path.basename(path)
                }
                hash_map[file_hash].append(file_info)
            
            processed += 1
            if processed % 50 == 0 or processed == total:
                progress = start_progress + int((processed / total) * (end_progress - start_progress))
                self._update_status("running", progress, f"Analyzing duplicates {processed}/{total}...")
                # 稍微让出控制权，让前端轮询能抓到中间状态
                await asyncio.sleep(0.005)

        # 过滤出有重复的
        duplicates = []
        for file_hash, items in hash_map.items():
            if len(items) > 1:
                duplicates.append({
                    "hash": file_hash,
                    "items": items
                })
        return duplicates

    async def _check_updates(self, start_progress=40):
        """识别更新项"""
        updates = []
        metadata = self.db_manager.metadata
        helper = civitai_helper.CivitaiHelper()
        loop = asyncio.get_event_loop()
        
        # 1. 收集可能来自 Civitai 的项 (不在这里做网络请求，避免 10% 卡顿)
        items_to_check = []
        for path, info in metadata.items():
            model_id = info.get("civitai_model_id")
            source = info.get("source")
            
            # 判断依据：显式声明来自 civitai，或者有 model_id
            if model_id or source == "civitai":
                items_to_check.append((path, info))
        
        total = len(items_to_check)
        if total == 0: return []
        processed = 0
        
        # 2. 在主循环中处理每个项
        for path, info in items_to_check:
            if self.stop_flag: break
            
            try:
                model_id = info.get("civitai_model_id")
                version_id = info.get("civitai_version_id")
                file_hash = info.get("hash")
                
                # 如果缺少 ID 但有 hash，尝试补全
                if not model_id and file_hash:
                    # 更新状态文字，让用户知道在做什么
                    self._update_status("running", start_progress + int((processed / total) * (100 - start_progress - 5)), 
                                      f"Looking up ID for {os.path.basename(path)}...")
                    try:
                        v_info = await loop.run_in_executor(None, helper.get_version_by_hash, file_hash)
                        if v_info:
                            model_id = str(v_info.get("modelId", ""))
                            version_id = str(v_info.get("id", ""))
                            # 自动补全到数据库
                            self.db_manager.update_item(path, {
                                "civitai_model_id": model_id,
                                "civitai_version_id": version_id,
                                "source": "civitai"
                            })
                    except: pass

                # 必须有 model_id 才能检查更新
                if model_id:
                    # 获取最新版本信息
                    model_info = await loop.run_in_executor(None, helper.get_model_details, model_id)
                    if model_info and "modelVersions" in model_info:
                        latest_version = model_info["modelVersions"][0]
                        latest_version_id = str(latest_version.get("id"))
                        
                        # 如果之前没 version_id，现在有了，先存一下
                        if not version_id and file_hash:
                            # 再次尝试匹配 hash 以确认当前版本
                            for v in model_info["modelVersions"]:
                                for f in v.get("files", []):
                                    if f.get("hashes", {}).get("SHA256", "").lower() == file_hash.lower():
                                        version_id = str(v.get("id"))
                                        self.db_manager.update_item(path, {"civitai_version_id": version_id})
                                        break
                                if version_id: break
                        
                        is_new = False
                        if version_id:
                            is_new = str(latest_version_id) != str(version_id)
                        
                        # 核心逻辑：比对最新版本 ID 与 忽略的版本 ID
                        ignored_id = info.get("ignored_version_id", "")
                        update_db_values = {}

                        if is_new and ignored_id and str(ignored_id) == str(latest_version_id):
                            # 依然是之前忽略的那个版本，所以不标记为新版本
                            is_new = False
                        elif is_new and ignored_id and str(ignored_id) != str(latest_version_id):
                            # 之前的忽略失效了，因为有了比之前忽略的版本更高级的版本
                            # 记录下需要清除旧忽略标记
                            update_db_values["ignored_version_id"] = ""

                        # 检查是否需要更新数据库中的新版本标记 (实时同步状态)
                        if metadata.get(path, {}).get("new_version_available") != is_new:
                            update_db_values["new_version_available"] = is_new

                        # 统一执行数据库更新，减少磁盘写入
                        if update_db_values:
                            self.db_manager.update_item(path, update_db_values)

                        if is_new:
                            updates.append({
                                "path": path,
                                "name": os.path.basename(path),
                                "current_version": version_id or "Unknown",
                                "new_version": latest_version_id,
                                "new_version_name": latest_version.get("name"),
                                "civitai_model_id": model_id,
                                "download_url": latest_version.get("downloadUrl")
                            })
            except Exception as e:
                print(f"[SK-LoRA] [System] 检查 {path} 更新时出错: {e}")
            
            processed += 1
            progress = start_progress + int((processed / total) * (100 - start_progress - 5))
            self._update_status("running", progress, f"Checking updates {processed}/{total}...")
            # 增加一点随机延迟，避免触发 API 限制
            await asyncio.sleep(0.02)
            
        return updates

    def _create_auto_backup(self):
        """创建自动备份并清理旧备份"""
        try:
            now = datetime.now()
            timestamp = now.strftime("%Y%m%d_%H%M%S")
            filename = f"auto_sync_{timestamp}.zip"
            
            # 获取快照目录
            user_dir = folder_paths.get_user_directory()
            snapshot_dir = os.path.join(user_dir, "default", "SKLoraManager-Data")
            os.makedirs(snapshot_dir, exist_ok=True)
            
            filepath = os.path.join(snapshot_dir, filename)
            
            # 准备文件列表
            db_path = self.db_manager.db_path
            current_dir = os.path.dirname(os.path.abspath(__file__))
            data_dir = os.path.join(os.path.dirname(current_dir), "data")
            settings_file = os.path.join(data_dir, "lora_manager_settings.json")
            basemodel_file = os.path.join(data_dir, "basemodel_settings.json")
            
            files_to_zip = []
            if os.path.exists(db_path): files_to_zip.append(db_path)
            if os.path.exists(settings_file): files_to_zip.append(settings_file)
            if os.path.exists(basemodel_file): files_to_zip.append(basemodel_file)
            
            with zipfile.ZipFile(filepath, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f_path in files_to_zip:
                    zf.write(f_path, os.path.basename(f_path))
                # 写入 manifest.json 以符合快照系统校验
                zf.writestr("manifest.json", json.dumps({
                    "backup_time": now.timestamp(), 
                    "version": "1.0.1",
                    "type": "auto_sync",
                    "signature": "sk-lora-manager",
                    "files": [os.path.basename(f) for f in files_to_zip]
                }, indent=2))
            
            print(f"[SK-LoRA] [Backup] 自动备份创建成功: {filename}")
            
            # 清理旧备份 (保留 5 个)
            try:
                backups = [f for f in os.listdir(snapshot_dir) if f.startswith("auto_sync_") and not f.startswith("auto_sync_c_")]
                if len(backups) > 5:
                    backups.sort()
                    for f in backups[:-5]:
                        os.remove(os.path.join(snapshot_dir, f))
                        print(f"[SK-LoRA] [Backup] 清理旧备份: {f}")
            except: pass
        except Exception as e:
            print(f"[SK-LoRA] [Backup] 自动备份失败: {e}")

    async def delete_items(self, items, delete_empty_folders=False):
        """删除项目及其关联文件"""
        if self.running: return {"status": "busy"}
        self.running = True
        self.stop_flag = False
        self.current_task["type"] = "delete_items"
        self._update_status("running", 0, "Deleting items...")
        
        success_list = []
        failed_list = []
        total = len(items)
        processed = 0

        try:
            for path in items:
                if self.stop_flag: break
                
                try:
                    full_path = os.path.normpath(os.path.join(self.db_manager.lora_base_dir, path))
                    base_path = os.path.splitext(full_path)[0]
                    folder_path = os.path.dirname(full_path)
                    
                    # 1. 获取元数据
                    info = self.db_manager.metadata.get(path)
                    
                    # 2. 删除主文件 (.safetensors / .ckpt)
                    if os.path.exists(full_path):
                        os.remove(full_path)
                    
                    # 3. 联动删除预览图 (.png / .jpg / .webp)
                    for ext in [".png", ".jpg", ".jpeg", ".webp", ".preview.png"]:
                        img_path = base_path + ext
                        if os.path.exists(img_path):
                            os.remove(img_path)
                    
                    # 4. 删除 .json 元数据
                    json_path = base_path + ".json"
                    if os.path.exists(json_path):
                        os.remove(json_path)
                        
                    # 5. 删除 .cache 缩略图
                    if info and info.get("hash"):
                        thumb_dir = os.path.join(os.path.dirname(self.db_manager.db_path), "cache", "thumbs")
                        if os.path.exists(thumb_dir):
                            for f in os.listdir(thumb_dir):
                                if f.startswith(info["hash"][:12]): # 匹配前12位 hash
                                    try:
                                        os.remove(os.path.join(thumb_dir, f))
                                    except: pass
                    
                    # 6. 可选：删除空文件夹
                    if delete_empty_folders:
                        # 仅处理当前 lora 所在的直接父目录
                        base_root = os.path.normpath(self.db_manager.lora_base_dir)
                        if folder_path != base_root and os.path.exists(folder_path):
                            # 只有当目录为空（即刚才删除的是唯一 Lora 且没有子目录）时才删除
                            if not os.listdir(folder_path):
                                try:
                                    os.rmdir(folder_path)
                                except: pass

                    # 7. 从数据库移除
                    if path in self.db_manager.metadata:
                        del self.db_manager.metadata[path]
                    
                    success_list.append(path)
                except Exception as e:
                    failed_list.append({"path": path, "error": str(e)})
                
                processed += 1
                self._update_status("running", int(processed / total * 100), f"Deleting {processed}/{total}...")
                await asyncio.sleep(0)

            # 保存元数据变更
            self.db_manager._write_to_disk()
            
            # 删除并同步完成后执行自动备份
            self._create_auto_backup()
            
            self._update_status("completed", 100, "Deletion complete", {"success": success_list, "failed": failed_list})
            return {"success": success_list, "failed": failed_list}

        except Exception as e:
            self._update_status("error", message=str(e))
        finally:
            self.running = False

    def cancel(self):
        if self.running:
            self.stop_flag = True
            return True
        return False
