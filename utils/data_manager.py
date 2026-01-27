import os
import json
import shutil
from pathlib import Path

def init_data():
    """
    初始化数据文件。
    确保 data 目录下的用户配置文件不会在更新时被覆盖。
    逻辑：
    1. 如果 data/xxx.json 不存在，从 data/initial_data/xxx.json 复制。
    2. 对于 basemodel_settings.json，尝试合并 system_presets 以确保用户获得最新的预设，同时保留 user_custom。
    """
    curr_dir = Path(__file__).parent.resolve()
    plugin_root = curr_dir.parent
    data_dir = plugin_root / "data"
    initial_data_dir = data_dir / "initial_data"

    if not data_dir.exists():
        data_dir.mkdir(parents=True)

    # 1. 处理普通配置文件 (直接复制，如果不存在；如果存在，则补充缺失的 key)
    simple_files = ["lora_trigger_words.json", "lora_manager_settings.json"]
    for file_name in simple_files:
        target_path = data_dir / file_name
        source_path = initial_data_dir / file_name
        
        if not target_path.exists() and source_path.exists():
            try:
                shutil.copy2(source_path, target_path)
                print(f"✅[SK-LoRA] [Data] Initialized {file_name} from defaults")
            except Exception as e:
                print(f"❌[SK-LoRA] [Data] Failed to initialize {file_name}: {e}")
        elif target_path.exists() and source_path.exists() and file_name == "lora_manager_settings.json":
            # 对于设置文件，尝试补充新版本中新增的 key
            try:
                with open(target_path, 'r', encoding='utf-8') as f:
                    user_settings = json.load(f)
                with open(source_path, 'r', encoding='utf-8') as f:
                    default_settings = json.load(f)
                
                updated = False
                for key, value in default_settings.items():
                    if key not in user_settings:
                        user_settings[key] = value
                        updated = True
                
                if updated:
                    with open(target_path, 'w', encoding='utf-8') as f:
                        json.dump(user_settings, f, indent=4, ensure_ascii=False)
                    print(f"✅[SK-LoRA] [Data] Updated {file_name} with new setting keys")
            except Exception as e:
                print(f"❌[SK-LoRA] [Data] Failed to update {file_name} keys: {e}")

    # 2. 处理 basemodel_settings.json (合并逻辑)
    basemodel_file = "basemodel_settings.json"
    target_basemodel = data_dir / basemodel_file
    source_basemodel = initial_data_dir / basemodel_file

    if not target_basemodel.exists():
        if source_basemodel.exists():
            try:
                shutil.copy2(source_basemodel, target_basemodel)
                print(f"✅[SK-LoRA] [Data] Initialized {basemodel_file} from defaults")
            except Exception as e:
                print(f"❌[SK-LoRA] [Data] Failed to initialize {basemodel_file}: {e}")
    else:
        # 如果已存在，进行合并
        if source_basemodel.exists():
            try:
                with open(target_basemodel, 'r', encoding='utf-8') as f:
                    user_data = json.load(f)
                with open(source_basemodel, 'r', encoding='utf-8') as f:
                    new_data = json.load(f)

                # 合并 system_presets
                # 我们认为 initial_data 中的 system_presets 是最新的官方预设
                user_data["system_presets"] = new_data.get("system_presets", [])
                
                # 确保 user_custom 字段存在（如果旧文件没有，则保留或初始化）
                if "user_custom" not in user_data:
                    user_data["user_custom"] = []

                with open(target_basemodel, 'w', encoding='utf-8') as f:
                    json.dump(user_data, f, indent=4, ensure_ascii=False)
                # print(f"✅[SK-LoRA] [Data] Merged system presets in {basemodel_file}")
            except Exception as e:
                print(f"❌[SK-LoRA] [Data] Failed to merge {basemodel_file}: {e}")

if __name__ == "__main__":
    init_data()
