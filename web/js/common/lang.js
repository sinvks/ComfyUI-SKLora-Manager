// lang.js - 全局语言包服务
const translations = {
    "zh-CN": {
        title: "SK LoRA 资产库",
        all_lora: "所有 LoRA",
        favorites: "收藏夹",
        settings: "参数设置",
        search_placeholder: "搜索名称、标题、标签、触发词...",
        sync_local: "同步本地",
        sync_civit: "同步C站",
        sync_cancelled: "同步已取消",
        sync_cancelled_saved: "同步已取消，已保存 {count} 项数据",
        trigger_label: "触发词",
        tags_label: "分类标签",
        weight_label: "权重",
        sampler_label: "采样器",
        notes_placeholder: "输入模型备注信息...",
        link_label: "模型网址",
        added_date: "添加时间",
        published_date: "发布时间",
        copy_btn: "复制",
        open_btn: "打开",
        menu_apply: "应用此 LoRA",
        menu_sync: "同步C站数据",
        menu_fetch_url: "AI分析数据",
        enter_url_title: "请输入模型网址：",
        enter_url_desc: "比如 LibLib, HuggingFace, ModelScope...",
        fetch_url_btn: "AI分析",
        fetch_url_invalid: "无效的网址",
        fetch_url_title: "AI分析数据",
        ai_analysis: "AI 分析",
        ai_analysis_reference: "(AI分析获取，仅供参考)",
        open_link: "打开链接",
        menu_fav_add: "加入收藏",
        menu_fav_del: "取消收藏",
        menu_copy_dir: "复制 Lora 目录",
        menu_copy_path: "复制 Lora 地址",
        menu_copy_hash: "复制 HASH 值",
        copy_success: "已复制到剪贴板",
        no_hash_found: "未找到 HASH 值",
        save_success: "保存成功",
        save_error: "保存失败",
        invalid_url: "无效的网址格式",
        close_panel: "关闭面板",
        close: "关闭",
        edit: "编辑",
        enter_edit: "进入编辑",
        save: "保存",
        cancel: "取消",
        civitai_key: "Civitai API Key",
        civitai_key_placeholder: "输入 Civitai API Key",
        proxy_settings: "代理设置",
        proxy_placeholder: "例如: http://127.0.0.1:7890",
        proxy_tip: "设置网络代理，例如 http://127.0.0.1:7890 (用于访问 Civitai)。建议使用VPN的“TUN模式”，开启后此处无需填写。",
        image_mode: "图片下载模式",
        image_mode_tip: "请选择同步C站时图片的处理方式",
        image_mode_missing: "当本地图片缺失时下载C站预览图",
        image_mode_always: "总是下载C站预览图",
        image_mode_never: "从不下载C站预览图",
        settings_saved: "设置已保存",
        settings_save_error: "保存设置失败",
        get_settings_error: "获取设置失败",
        sync_progress: "同步进度",
        local_sync: "本地同步",
        civitai_sync: "Civitai同步",
        preparing: "准备中...",
        run_in_background: "后台运行",
        cancel_sync: "中断同步",
        sync_completed: "同步完成",
        sync_error: "同步出错",
        sync_in_background: "同步已在后台运行，完成后将通知您",
        confirm_cancel_sync: "确认中断同步",
        confirm_cancel: "确定中断",
        confirm_abort_q: "确认中断同步？",
        continue_sync: "继续同步",
        user_cancelled: "用户取消了同步",
        sync_failed: "同步失败",
        sync_failed_unknown: "同步失败：未知错误",
        sync_failed_network: "同步失败：网络错误",
        sync_failed_no_hash: "无法同步：缺少文件哈希值",
        syncing: "同步中...",
        civitai_syncing: "Civitai同步中...",
        processing: "正在处理: ",
        scanning: "扫描中... ({0}/{1})",
        start_scan: "开始扫描本地文件...",
        enter_tag_name: "请输入归类标签名称:",
        tag_too_long: "标签太长了",
        stats_total: "总计",
        stats_processed: "已处理",
        stats_success: "成功",
        stats_failed: "失败",
        details_log: "详情日志",
        abort: "中止",
        stopping: "正在停止...",
        lang_label: "简",
        switch_language: "切换语言",
        toggle_view_mode: "切换视图模式",
        local_sync_completed: "本地同步已完成",
        civitai_sync_completed: "Civitai同步已完成",
        init_library: "扫描Lora文件",
        update_library: "更新模型库",
        current_file: "当前文件",
        hash: "哈希值",
        status: "状态",
        preview: "预览图",
        date: "录入时间",
        searching: "搜索中...",
        waiting: "等待同步开始...",
        sync_complete: "同步完成",
        added_models: "新增模型",
        removed_invalid: "清理失效",
        duration: "耗时",
        complete_close: "完成并关闭",
        force_close: "强制关闭",
        yes: "是",
        no: "否",
        civitai_base_model_locked: "Civitai来源的模型不允许修改底模标签",
        delete_preset: "删除预设",
        confirm_delete_preset: "确定要删除预设 {0} 吗？",
        base_model_visibility: "底模显示管理",
        data_maintenance: "数据维护",
        backup_data: "备份数据",
        restore_data: "恢复数据",
        restore_success: "恢复成功，页面即将刷新",
        backup_success: "备份成功",
        confirm_restore: "确认要恢复此备份吗？",
        confirm_restore_q: "确认恢复? ({0})",
        confirm_delete_q: "确认删除? ({0})",
        delete_success: "预设已删除",
        total_loras: "总数: {0} （C站: {1}）<br>模型大小: {2}",
        new_version: "有更新",
        upload_title: "点击或拖拽上传",
        modify_base_model: "点击修改底模",
        base_model_locked: "Civitai 源模型不可修改底模",
        promote_to_base: "晋升为底模",
        delete: "删除",
        custom_placeholder: "自定义...",
        confirm_delete: "确定删除？",
        sync_weight: "是否抓取权重",
        sync_weight_desc: "从预览图获取权重（可能不准确）",
        sync_sampler: "是否抓取采样器",
        sync_sampler_desc: "从预览图分析采样器（可能不准确）",
        sync_triggers_mode: "触发词处理方式",
        replace_triggers: "替换现有的触发词",
        merge_triggers: "总是与现有触发词合并",
        sync_triggers_desc: "抓取数据时触发词的同步规则",
        model_title_source: "模型卡片标题设置",
        use_filename: "使用文件名",
        use_civitai_title: "使用C站标题",
        model_title_desc: "C站不同版本的模型标题可能会相同",
        nsfw_level_setting: "敏感内容允许等级",
        nsfw_pg: "PG - 适合所有人，无敏感内容",
        nsfw_pg13: "PG-13 - 包含轻微暴露或挑逗性暗示",
        nsfw_r: "R - 包含明显的性感内容或内衣图",
        nsfw_x: "X - 包含强烈感官刺激的内容",
        nsfw_xxx: "XXX - 包含最露骨或极端的敏感内容",
        diff_sync_title: "同步对比: {0}",
        field: "字段",
        local_value: "本地值",
        civitai_new_value: "C站 / 新值",
        use: "使用",
        apply_changes: "应用更改",
        retry: "重试",
        sync_timeout: "请求超时",
        no_changes: "未选择任何更改",
        saving: "保存中...",
        model_id: "模型 ID",
        sampler: "采样器",
        nsfw_level: "NSFW 等级",
        link: "链接",
        no_image: "无图片",
        no_new_image: "无法获取图片",
        image_invalid: "无法获取图片",
        new_image: "新图片",
        replace: "替换",
        merge: "合并",
        true_val: "是",
        false_val: "否",
        preview_image: "预览图",
        model_name: "模型名称",
        base_model: "底模",
        trigger_words: "触发词",
        weight: "权重",
        notes: "备注",
        published_at: "发布时间",
        fetch_weight: "是否抓取权重",
        fetch_weight_desc: "从预览图中获取权重，如果开启LLM设置则此设置默认为开启。",
        fetch_sampler: "是否抓取采样器",
        fetch_sampler_desc: "从预览图中分析采样器，如开启LLM设置，则此设置默认开启。",
        trigger_word_mode: "触发词处理方式",
        trigger_word_desc: "抓取数据时触发词的同步规则",
        model_title_setting: "模型卡片标题设置",
        model_title_setting_desc: "C站不同版本的模型标题可能会相同",
        nsfw_allow_level: "敏感内容允许等级",
        nsfw_level_desc: "级别越高，看到的内容越丰富，但也越容易接触敏感信息。",
        preview_img_mode: "预览图显示模式",
        preview_img_mode_desc: "超过设定等级时，预览图的处理方式。建议在工作环境使用“完全隐藏”。",
        show_directly: "直接显示",
        blur_mode: "毛玻璃模糊",
        hide_completely: "完全隐藏",
        check_new_version: "检查 Lora 新版本",
        check_new_version_desc: "如有更新则信息卡片会有“有更新”字样",
        video_frame_preview: "抽帧视频作为预览图",
        video_frame_preview_desc: "建议开启，否则模型仅有预览视频时，无法抓取预览图。",
        allow_edit_civitai_base: "允许修改 C 站底模",
        allow_edit_civitai_base_desc: "开启则可以自定义 C 站模型的底模",
        civitai_diff_panel: "C 站对比更新面板",
        civitai_diff_panel_desc: "建议开启（开启后可以手动选择抓取的数据）",
        image_models: "图像模型",
        video_models: "视频模型",

        // Settings Panel Tabs
        search: "搜索",
        none: "无",
        config: "配置",
        tab_basic_config: "基础配置",
        tab_scraping_rules: "采集规则",
        tab_card_settings: "卡片设置",
        tab_basemodel_mgr: "底模设置",
        tab_advanced_settings: "高级设置",

        // Settings Section Titles
        section_basic_info: "基础信息配置",
        section_scraping_rules: "采集规则配置",
        section_card_display: "卡片显示设置",
        section_basemodel_manage: "底模显示管理",
        section_data_maintenance: "数据维护与高级设置",
        
        // Custom Buttons
        base_model_mgr_btn: "底模设置",
        advanced_settings_title: "LLM设置及数据维护",
        advanced_settings_btn: "高级设置",

        // Tooltips
        tip_enable_disable: "点击切换启用/禁用状态",
        tip_drag_sort: "拖拽调整优先级",
        custom_models: "自定义模型",
        drag_to_sort: "（拖拽排序）",
        last_backup: "最近备份: {0}",
        last_backup_status: "备份状态",
        no_backup_history: "暂无备份记录",
        no_snapshots: "暂无备份记录",
        snapshot_manager: "备份快照管理",
        snapshot_filename: "文件名",
        snapshot_date: "日期",
        snapshot_size: "大小",

        // LLM
        llm_settings: "LLM 设置",
        llm_config_btn: "LLM大模型配置",
        llm_config_mgr: "LLM 配置管理",
        llm_add_config: "添加配置",
        llm_edit: "编辑配置",
        llm_default: "默认",
        llm_set_default: "设为默认",
        llm_delete: "删除",
        llm_delete_confirm: "确定要删除此配置吗？",
        llm_no_config: "暂无配置",
        llm_provider: "供应商",
        llm_alias: "配置别名",
        llm_alias_placeholder: "给这个配置起个名字...",
        llm_api_key: "API Key",
        llm_api_key_placeholder: "输入 API Key",
        llm_get_api_key: "开通 {name} 服务",
        llm_model_name: "模型名称",
        llm_model_placeholder: "输入或选择模型名称",
        llm_select_model: "选择模型",
        llm_custom_model: "自定义模型",
        llm_refresh_models: "刷新模型列表",
        llm_refresh_success: "模型列表已刷新",
        llm_refresh_failed: "刷新模型列表失败",
        llm_advanced_settings: "高级设置",
        llm_base_url: "API Base URL",
        llm_base_url_placeholder: "输入 API Base URL",
        llm_unlock_url: "解锁 URL",
        llm_lock_url: "锁定 URL",
        llm_min_interval: "请求间隔 (秒)",
        llm_min_interval_tip: "两次请求之间的最小等待时间",
        llm_min_interval_placeholder: "例如: 4.5",
        llm_ollama_interval_tip: "本地模型间隔用于防止 GPU 过载",
        llm_gemini_interval_tip: "提示：免费版 Gemini 建议间隔 > 4s",
        llm_test_connection: "测试连接",
        llm_testing: "测试中...",
        llm_connection_success: "连接成功",
        llm_connection_failed: "连接失败: {0}",
        llm_api_key_required: "API Key 不能为空",
        llm_alias_required: "配置别名不能为空",
        llm_model_required: "请选择或输入模型名称",
        llm_base_url_required: "API Base URL 不能为空",
        llm_recommended_models: "推荐模型",
        llm_save_success: "配置已保存",
        llm_default_badge: "默认",
        llm_view: "查看配置",
        llm_provider_locked: "编辑模式下不可更改供应商",
        llm_no_model: "未选择模型",
        llm_activate_label: "是否开启LLM相关功能（大模型分析）",
        llm_activate_tip: "在LLM大模型配置中添加设置才可开启，开启后，采集规则中权重和采样器设置失效，即默认会对权重和采样器进行AI分析",
        llm_activate_disabled_tip: "请先在 LLM 配置管理中设置一个默认配置",
        llm_activate_tooltip: "[LLM 功能说明]\n·智能辅助：分析模型信息，结果仅供参考。\n·在线模型：消耗 API Token（免费额度耗尽或产生费用）。\n·本地模型：同步扫描时会占用显存（建议跑图前完成）。\n·配置路径：请先在 [LLM 配置管理] 中添加模型。",
        llm_provider_gemini: "Gemini",
        llm_provider_openai: "OpenAI",
        llm_provider_deepseek: "DeepSeek",
        llm_provider_groq: "Groq",
        llm_provider_ollama: "Ollama",
        llm_provider_zhipu: "智谱 AI",
        llm_provider_xflow: "xFlow API 聚合",
        llm_provider_custom: "自定义 / 其他",
        llm_fetching_models: "正在获取模型...",
        llm_default_changed: "默认 LLM 已切换",
        llm_recommended: "推荐",
        llm_sync_tip: "提示：已开启 LLM 自动分析，批量同步耗时会显著增加，请耐心等待。",
        sync_ai_enabled: "✨ AI 增强已开启 ({0} - {1})：正在为您精炼模型备注...",
        sync_ai_disabled: "🤖 基础模式：建议开启 LLM 功能以获得更佳的模型分析效果。",

        // Snapshot
        loading: "加载中...",
        restore_btn: "恢复",
        delete_btn: "删除",
        confirm_delete_btn: "确定删除",
        auto_backup_marker: "自动备份",
        manual_backup_marker: "手动备份",
        remark_manual: "用户手动创建的备份",
        remark_sync_c_auto: "用户\"同步C站\"操作前自动备份",
        remark_duplicate_auto: "用户“删除重复项”操作前自动备份",
        unknown_error: "未知错误",

        // Card & Upload
        setting_show_btn: "显示顶部管理器按钮",
        tooltip_manager: "SK LoRA Manager",
        filename: "使用文件名",
        civitai_title: "使用 C 站标题",
        click_or_drag_upload: "点击或拖拽上传",
        click_to_edit_base: "点击修改底模",
        civitai_model_readonly: "Civitai 源模型不可修改底模",
        error_upload_image_type: "请上传图片文件",
        upload_failed_status: "上传失败，状态码: ",
        upload_failed_msg: "上传失败: ",
        preview_upload_success: "预览图上传成功",
        error: "错误",
        initializing: "初始化中...",
        sync_summary: "同步总结",
        completed: "已完成",
        minimize: "最小化",
        link_placeholder: "https://...",
        toggle_nsfw: "切换敏感内容可见性",
        system: "系统",

        // Node
        mgr_node_name: "LoRA 管理器",
        mgr_node_inject_to: "注入到 ",
        mgr_node_trigger_copied: "触发词已复制",
        mgr_node_distribute_success: "已成功分发到节点 #{0}",
        mgr_node_distribute_all: "分发到所有 LoRA 节点",
        mgr_node_warn_duplicate: "该 LoRA 已在 #{0} 列表中，跳过添加",
        mgr_node_add_partial: "成功添加 {0} 项，跳过 {1} 项重复",
        mgr_node_add_success: "成功添加 {0} 项",
        mgr_node_add_all_skipped: "全部 {0} 项已存在，未执行添加",
        mgr_node_weight_tip: "使用 ↑↓ 或滚轮微调调节 (步长0.01)，+ - 按钮 (步长0.05)",
        mgr_node_trigger_tip: "触发词: {0}",

        // Selector
        sel_title: "LoRA 选择器",
        sel_search_placeholder: "搜索 LoRA 模型...",
        sel_confirm_btn: "确认选择",
        sel_cancel_btn: "取消",
        sel_mode_toggle: "切换视图模式",
        sel_close: "关闭",
        sel_recent: "最近使用",
        sel_all: "全部 LoRA",
        sel_loading: "加载数据中...",
        sel_selected: "已选中",
        sel_all_models: "所有模型",
        sel_favorites: "收藏夹",
        sel_favorites_star: "收藏夹",
        sel_recent_icon: "最近使用",
        sel_recent_clear: "清空最近使用",
        sel_search_placeholder_full: "搜索名称、标签或触发词...",
        sel_search_placeholder_lora: "搜索 LoRA 模型...",
        sel_search_placeholder_simple: "搜索...",
        sel_no_matching: "未找到匹配的 LoRA",
        sel_favorite_label: "已收藏",
        sel_meta_path: "路径",
        sel_meta_no_tags: "无标签",
        sel_none: "无",
        sel_batch_selected_count: "已选 {0} 项",
        sel_batch_clear: "清空选择",
        sel_batch_view: "查看已选",
        sel_batch_confirm: "确认添加并关闭",
        sel_status_selected_count: "已选择 {0} 项",
        sel_status_selected_name: "已选择: {0}",
        sel_warn_added: "该 LoRA 已经添加到节点中，请选择其他项",
        sel_added_label: "已添加",
        sel_toggle_nsfw: "切换敏感内容可见性",
        mgr_node_selector_scheme: "选择器方案",
        mgr_node_scheme_side: "侧边抽屉",
        mgr_node_scheme_top: "顶部筛选",
        mgr_node_scheme_float: "悬浮工具",
        ready: "就绪",

        // Health Center
        health_center: "资产健康中心",
        health_tab_duplicates: "重复项清理",
        health_tab_updates: "版本更新",
        health_click_scan: "点击下方按钮开始扫描资产健康状况",
        health_start_scan: "开始全面扫描",
        health_rescan: "重新扫描",
        health_no_duplicates: "恭喜！未发现重复的 LoRA 资产",
        health_no_updates: "所有模型均为最新版本",
        health_files: "个文件",
        health_delete_selected: "删除选中项",
        health_ignore_update: "忽略此更新",
        health_deleting: "正在物理删除资产...",
        health_click_to_confirm: "确认删除？",
        health_empty_folder_fix: "同时删除空文件夹",
        health_delete_success: "成功删除资产: {0}",
        health_auto_backup_tip: "（已完成数据快照自动备份）",
        health_scan_complete: "扫描完成",
        health_scan_duplicates: "扫描重复项",
        health_scan_updates: "扫描版本更新",
        health_need_check_update: "此功能须在【参数设置】中开启lora版本检查才可使用",
        health_found_updates: "共发现",
        health_new_versions: "个新版本",
        health_found_duplicates: "共发现",
        health_duplicate_groups: "组重复项",
        health_scanning_busy: "系统正忙，扫描中...",

        // Tooltips
        tooltip_title: "标题",
        tooltip_weight: "权重",
        tooltip_sampler: "采样器",
        tooltip_base_model: "基础模型",
        tooltip_notes: "备注",
        tooltip_path: "文件路径",
        tag_filtering: "标签过滤",
        tag_filtering_desc: "",
        add_tag: "添加标签",
        add_tag_placeholder: "输入要过滤的标签（用于抓取时过滤无效tag）...",
        restore_preset: "恢复预设",
        confirm_restore_preset: "确认恢复预设标签列表吗？",
        tag_already_exists: "该标签已在黑名单中",
        tag_added: "已添加标签",
        tag_deleted: "已删除标签",
        press_and_hold: "点击确认删除",
        confirm_delete_q: "删除? %1",
        confirm_restore_q: "恢复? %1",
    },
    "zh-TW": {
        title: "SK LoRA 資產庫",
        all_lora: "所有 LoRA",
        favorites: "收藏夾",
        settings: "參數設置",
        search_placeholder: "搜尋名稱、標題、標籤、觸發詞...",
        sync_local: "同步本地",
        sync_civit: "同步C站",
        sync_cancelled: "同步已取消",
        sync_cancelled_saved: "同步已取消，已保存 {count} 項數據",
        trigger_label: "觸發詞",
        tags_label: "分類標籤",
        weight_label: "權重",
        sampler_label: "採樣器",
        notes_placeholder: "輸入模型備註信息...",
        link_label: "模型網址",
        added_date: "添加時間",
        published_date: "發佈時間",
        copy_btn: "複製",
        open_btn: "打開",
        menu_apply: "應用此 LoRA",
        menu_sync: "同步C站數據",
        menu_fetch_url: "AI分析獲取數據",
        enter_url_title: "請輸入模型網址：",
        enter_url_desc: "比如 LibLib, HuggingFace, ModelScope...",
        fetch_url_btn: "AI分析",
        fetch_url_invalid: "無效的網址",
        fetch_url_title: "AI分析獲取數據",
        ai_analysis: "AI 分析",
        ai_analysis_reference: "(AI分析獲取，僅供參考)",
        open_link: "打開連結",
        menu_fav_add: "加入收藏",
        menu_fav_del: "取消收藏",
        menu_copy_dir: "複製 Lora 目錄",
        menu_copy_path: "複製 Lora 地址",
        menu_copy_hash: "複製 HASH 值",
        copy_success: "已複製到剪貼簿",
        no_hash_found: "未找到 HASH 值",
        save_success: "保存成功",
        save_error: "保存失敗",
        invalid_url: "無效的網址格式",
        close_panel: "關閉面板",
        close: "關閉",
        edit: "編輯",
        enter_edit: "進入編輯",
        save: "保存",
        cancel: "取消",
        civitai_key: "Civitai API Key",
        civitai_key_placeholder: "輸入 Civitai API Key",
        proxy_settings: "代理設置",
        proxy_placeholder: "例如: http://127.0.0.1:7890",
        proxy_tip: "設置網絡代理，例如 http://127.0.0.1:7890 (用於訪問 Civitai)。建議使用VPN的“TUN模式”，開啟後此處無需填寫。",
        show_fetch_ai_btn: "是否顯示 AI 分析按鈕",
        show_fetch_ai_btn_tip: "在模型卡片菜單中顯示 AI 分析獲取數據按鈕",
        image_mode: "圖片下載模式",
        image_mode_tip: "請選擇同步C站時圖片的處理方式",
        image_mode_missing: "當本地圖片缺失時下載C站預覽圖",
        image_mode_always: "總是下載C站預覽圖",
        image_mode_never: "從不下載C站預覽圖",
        settings_saved: "設置已保存",
        settings_save_error: "保存設置失敗",
        get_settings_error: "獲取設置失敗",
        sync_progress: "同步進度",
        local_sync: "本地同步",
        civitai_sync: "Civitai同步",
        preparing: "準備中...",
        run_in_background: "後台運行",
        cancel_sync: "中斷同步",
        sync_completed: "同步完成",
        sync_error: "同步出錯",
        sync_in_background: "同步已在後台運行，完成後將通知您",
        confirm_cancel_sync: "確認中斷同步",
        confirm_cancel: "確定中斷",
        confirm_abort_q: "確認中斷同步？",
        continue_sync: "繼續同步",
        user_cancelled: "用戶取消了同步",
        sync_failed: "同步失敗",
        sync_failed_unknown: "同步失敗：未知錯誤",
        sync_failed_network: "同步失敗：網絡錯誤",
        sync_failed_no_hash: "無法同步：缺少文件哈希值",
        syncing: "同步中...",
        civitai_syncing: "Civitai同步中...",
        processing: "正在處理: ",
        scanning: "掃描中... ({0}/{1})",
        start_scan: "開始掃描本地文件...",
        enter_tag_name: "請輸入歸類標籤名稱:",
        tag_too_long: "標籤太長了",
        stats_total: "總計",
        stats_processed: "已處理",
        stats_success: "成功",
        stats_failed: "失敗",
        details_log: "詳情日誌",
        abort: "中止",
        stopping: "正在停止...",
        lang_label: "繁",
        switch_language: "切換語言",
        toggle_view_mode: "切換視圖模式",
        local_sync_completed: "本地同步已完成",
        civitai_sync_completed: "Civitai同步已完成",
        init_library: "掃描Lora文件",
        update_library: "更新模型庫",
        current_file: "當前文件",
        hash: "哈希值",
        status: "狀態",
        preview: "預覽圖",
        date: "錄入時間",
        searching: "搜索中...",
        waiting: "等待同步開始...",
        sync_complete: "同步完成",
        added_models: "新增模型",
        removed_invalid: "清理失效",
        duration: "耗時",
        complete_close: "完成並關閉",
        force_close: "強制關閉",
        yes: "是",
        no: "否",
        civitai_base_model_locked: "Civitai來源的模型不允許修改底模標籤",
        delete_preset: "刪除預設",
        confirm_delete_preset: "確定要刪除預設 {0} 嗎？",
        base_model_visibility: "底模顯示管理",
        data_maintenance: "數據維護",
        backup_data: "備份數據",
        restore_data: "恢復數據",
        restore_success: "恢復成功，請刷新頁面",
        backup_success: "備份成功",
        confirm_restore: "確認要恢復此備份嗎？",
        confirm_restore_q: "確認恢復? ({0})",
        confirm_delete_q: "確認刪除? ({0})",
        delete_success: "預設已刪除",
        total_loras: "總數: {0} （C站: {1}）<br>模型大小: {2}",
        new_version: "有更新",
        upload_title: "點擊或拖拽上傳",
        modify_base_model: "點擊修改底模",
        base_model_locked: "Civitai 源模型不可修改底模",
        promote_to_base: "晉升為底模",
        delete: "刪除",
        custom_placeholder: "自定義...",
        confirm_delete: "確定刪除？",
        sync_weight: "是否抓取權重",
        sync_weight_desc: "從預覽圖獲取權重（可能不準確）",
        sync_sampler: "是否抓取採樣器",
        sync_sampler_desc: "從預覽圖分析採樣器（可能不準確）",
        sync_triggers_mode: "觸發詞處理方式",
        replace_triggers: "替換現有的觸發詞",
        merge_triggers: "總是與現有觸發詞合併",
        sync_triggers_desc: "抓取數據時觸發詞的同步規則",
        model_title_source: "模型卡片標題設置",
        use_filename: "使用文件名",
        use_civitai_title: "使用C站標題",
        model_title_desc: "C站不同版本的模型標題可能會相同",
        nsfw_level_setting: "敏感內容允許等級",
        nsfw_pg: "PG - 適合所有人，無敏感內容",
        nsfw_pg13: "PG-13 - 包含輕微暴露或挑逗性暗示",
        nsfw_r: "R - 包含明顯的性感內容或內衣圖",
        nsfw_x: "X - 包含強烈感官刺激的内容",
        nsfw_xxx: "XXX - 包含最露骨或極端的敏感內容",
        diff_sync_title: "同步對比: {0}",
        field: "字段",
        local_value: "本地值",
        civitai_new_value: "C站 / 新值",
        use: "使用",
        apply_changes: "應用更改",
        retry: "重試",
        sync_timeout: "請求超時",
        no_changes: "未選擇任何更改",
        saving: "保存中...",
        model_id: "模型 ID",
        sampler: "採樣器",
        nsfw_level: "NSFW 等級",
        link: "鏈接",
        no_image: "無圖片",
        no_new_image: "無法獲取圖片",
        image_invalid: "無法獲取圖片",
        new_image: "新圖片",
        replace: "替換",
        merge: "合併",
        true_val: "是",
        false_val: "否",
        preview_image: "預覽圖",
        model_name: "模型名稱",
        base_model: "底模",
        trigger_words: "觸發詞",
        weight: "權重",
        notes: "備註",
        published_at: "發佈時間",
        fetch_weight: "是否抓取權重",
        fetch_weight_desc: "從預覽圖中獲取權重，如果開啟LLM設置則此設置默認為開啟。",
        fetch_sampler: "是否抓取採樣器",
        fetch_sampler_desc: "從預覽圖中分析採樣器，如開啟LLM設置，則此設置默認開啟。",
        trigger_word_mode: "觸發詞處理方式",
        trigger_word_desc: "抓取數據時觸發詞的同步規則",
        model_title_setting: "模型卡片標題設置",
        model_title_setting_desc: "C站不同版本的模型標題可能會相同",
        nsfw_allow_level: "敏感內容允许等級",
        nsfw_level_desc: "級別越高，看到的内容越豐富，但也越容易接觸敏感信息。",
        preview_img_mode: "預覽圖顯示模式",
        preview_img_mode_desc: "超過設定等級時，預覽圖的處理方式。建議在工作環境使用“完全隱藏”。",
        show_directly: "直接顯示",
        blur_mode: "毛玻璃模糊",
        hide_completely: "完全隱藏",
        check_new_version: "檢查 Lora 新版本",
        check_new_version_desc: "如有更新則信息卡片會有“有更新”字樣",
        video_frame_preview: "抽幀視頻作為預覽圖",
        video_frame_preview_desc: "建議開啟，否則模型僅有預覽視頻時，無法抓取預覽圖。",
        allow_edit_civitai_base: "允許修改 C 站底模",
        allow_edit_civitai_base_desc: "開啟則可以自定義 C 站模型的底模",
        civitai_diff_panel: "C 站對比更新面板",
        civitai_diff_panel_desc: "建議開啟（開啟後可以手動選擇抓取的數據）",
        image_models: "圖像模型",
        video_models: "視頻模型",

        // Settings Panel Tabs
        search: "搜索",
        none: "無",
        config: "配置",
        tab_basic_config: "基礎配置",
        tab_scraping_rules: "采集規則",
        tab_card_settings: "卡片設置",
        tab_basemodel_mgr: "底模管理",
        tab_advanced_settings: "高級設置",

        // Settings Section Titles
        section_basic_info: "基礎信息配置",
        section_scraping_rules: "采集規則配置",
        section_card_display: "卡片顯示設置",
        section_basemodel_manage: "底模顯示管理",
        section_data_maintenance: "數據維護與高級設置",

        // Custom Buttons
        base_model_mgr_btn: "底模設置",
        advanced_settings_title: "LLM設置及數據維護",
        advanced_settings_btn: "高級設置",

        // Tooltips
        tip_enable_disable: "點擊切換啟用/禁用狀態",
        tip_drag_sort: "拖拽調整優先級",
        custom_models: "自定義模型",
        drag_to_sort: "（拖拽排序）",
        last_backup: "最近備份: {0}",
        last_backup_status: "備份狀態",
        no_backup_history: "無歷史備份記錄",
        no_snapshots: "暫無備份記錄",
        snapshot_manager: "備份快照管理",
        snapshot_filename: "文件名",
        snapshot_date: "日期",
        snapshot_size: "大小",

        // LLM
        llm_settings: "LLM 設置",
        llm_config_btn: "LLM大模型配置",
        llm_config_mgr: "LLM 配置管理",
        llm_add_config: "新增配置",
        llm_edit: "編輯配置",
        llm_default: "預設",
        llm_set_default: "設為預設",
        llm_delete: "刪除",
        llm_delete_confirm: "確定要刪除此配置嗎？",
        llm_no_config: "暫無配置",
        llm_provider: "供應商",
        llm_alias: "配置別名",
        llm_alias_placeholder: "給這個配置起個名字...",
        llm_api_key: "API Key",
        llm_api_key_placeholder: "輸入 API Key",
        llm_get_api_key: "開通 {name} 服務",
        llm_model_name: "模型名稱",
        llm_model_placeholder: "輸入或選擇模型名稱",
        llm_select_model: "選擇模型",
        llm_custom_model: "自定義模型",
        llm_refresh_models: "刷新模型列表",
        llm_refresh_success: "模型列表已刷新",
        llm_refresh_failed: "刷新模型列表失敗",
        llm_advanced_settings: "高級設置",
        llm_base_url: "API Base URL",
        llm_base_url_placeholder: "輸入 API Base URL",
        llm_unlock_url: "解鎖 URL",
        llm_lock_url: "鎖定 URL",
        llm_min_interval: "請求間隔 (秒)",
        llm_min_interval_tip: "兩次請求之間的最小等待時間",
        llm_min_interval_placeholder: "例如: 4.5",
        llm_ollama_interval_tip: "本地模型間隔用於防止 GPU 過載",
        llm_gemini_interval_tip: "提示：免費版 Gemini 建議間隔 > 4s",
        llm_test_connection: "測試連接",
        llm_testing: "測試中...",
        llm_connection_success: "連接成功",
        llm_connection_failed: "連接失敗: {0}",
        llm_api_key_required: "API Key 不能為空",
        llm_alias_required: "配置別名不能為空",
        llm_model_required: "請選擇或輸入模型名稱",
        llm_base_url_required: "API Base URL 不能為空",
        llm_save_success: "配置已儲存",
        llm_default_badge: "預設",
        llm_view: "查看配置",
        llm_provider_locked: "編輯模式下不可更改供應商",
        llm_no_model: "未選擇模型",
        llm_activate_label: "是否開啟LLM相關功能（大模型分析）？",
        llm_activate_tip: "在LLM大模型配置中添加設置才可開啟，開啟後，採集規則中權重和採樣器設置失效，即默認會對權重和採樣器進行AI分析",
        llm_activate_disabled_tip: "請先在 LLM 配置管理中設置一個預設配置",
        llm_activate_tooltip: "[LLM 功能說明]\n·智能輔助：分析模型信息，結果僅供參考。\n·在線模型：消耗 API Token（免費額度耗盡或產生費用）。\n·本地模型：同步掃描時會占用顯存（建議跑圖前完成）。\n·配置路徑：請先在 [LLM 配置管理] 中添加模型。",
        llm_provider_gemini: "Google Gemini",
        llm_provider_openai: "OpenAI / Compatible",
        llm_provider_deepseek: "DeepSeek",
        llm_provider_groq: "Groq",
        llm_provider_ollama: "Ollama",
        llm_provider_zhipu: "智譜 AI",
        llm_provider_xflow: "xFlow API 聚合平台",
        llm_provider_custom: "自定義 / 其他",
        llm_fetching_models: "正在獲取模型...",
        llm_default_changed: "預設 LLM 已切換",
        llm_recommended: "推薦",
        llm_sync_tip: "提示：已開啟 LLM 自動分析，批量同步耗時會顯著增加，請耐心等待。",
        sync_ai_enabled: "✨ AI 增強已開啟 ({0} - {1})：正在為您精煉模型備註...",
        sync_ai_disabled: "🤖 基礎模式：建議開啟 LLM 功能以獲得更佳的模型分析效果。",

        // Snapshot
        loading: "加載中...",
        restore_btn: "恢復",
        delete_btn: "刪除",
        confirm_delete_btn: "確定刪除",
        auto_backup_marker: "自動備份",
        manual_backup_marker: "手動備份",
        remark_manual: "用戶手動創建的備份",
        remark_sync_c_auto: "用戶\"同步C站\"操作前自動備份",
        remark_duplicate_auto: "用戶“刪除重複項”操作前自動備份",
        unknown_error: "未知錯誤",

        // Card & Upload
        setting_show_btn: "顯示頂部管理器按鈕",
        tooltip_manager: "SK LoRA Manager",
        filename: "使用文件名",
        civitai_title: "使用 C 站標題",
        click_or_drag_upload: "點擊或拖拽上傳",
        click_to_edit_base: "點擊修改底模",
        civitai_model_readonly: "Civitai 源模型不可修改底模",
        error_upload_image_type: "請上傳圖片文件",
        upload_failed_status: "上傳失敗，狀態碼: ",
        upload_failed_msg: "上傳失敗: ",
        preview_upload_success: "預覽圖上傳成功",
        error: "錯誤",
        initializing: "初始化中...",
        sync_summary: "同步總結",
        completed: "已完成",
        minimize: "最小化",
        link_placeholder: "https://...",
        toggle_nsfw: "切換敏感內容可見性",
        system: "系統",

        // Node
        mgr_node_name: "LoRA 管理器",
        mgr_node_inject_to: "注入到 ",
        mgr_node_trigger_copied: "觸發詞已複製",
        mgr_node_distribute_success: "已成功分發到節點 #{0}",
        mgr_node_distribute_all: "分發到所有 LoRA 節點",
        mgr_node_warn_duplicate: "該 LoRA 已在 #{0} 列表中，跳過添加",
        mgr_node_add_partial: "成功添加 {0} 項，跳過 {1} 項重複",
        mgr_node_add_success: "成功添加 {0} 項",
        mgr_node_add_all_skipped: "全部 {0} 項已存在，未執行添加",
        mgr_node_weight_tip: "使用 ↑↓ 或滾輪微調調節 (步長0.01)，+ - 按鈕 (步長0.05)",
        mgr_node_trigger_tip: "觸發詞: {0}",

        // Selector
        sel_title: "LoRA 選擇器",
        sel_search_placeholder: "搜索 LoRA 模型...",
        sel_confirm_btn: "確認選擇",
        sel_cancel_btn: "取消",
        sel_mode_toggle: "切換視圖模式",
        sel_close: "關閉",
        sel_recent: "最近使用",
        sel_all: "全部 LoRA",
        sel_loading: "加載數據中...",
        sel_selected: "已選中",
        sel_all_models: "所有模型",
        sel_favorites: "收藏夾",
        sel_favorites_star: "收藏夾",
        sel_recent_icon: "最近使用",
        sel_recent_clear: "清空最近使用",
        sel_search_placeholder_full: "搜索名稱、標籤或觸發詞...",
        sel_search_placeholder_lora: "搜索 LoRA 模型...",
        sel_search_placeholder_simple: "搜索...",
        sel_no_matching: "未找到匹配的 LoRA",
        sel_favorite_label: "已收藏",
        sel_meta_path: "路徑",
        sel_meta_no_tags: "無標籤",
        sel_none: "無",
        sel_batch_selected_count: "已選 {0} 項",
        sel_batch_clear: "清空選擇",
        sel_batch_view: "查看已選",
        sel_batch_confirm: "確認添加並關閉",
        sel_status_selected_count: "已選擇 {0} 項",
        sel_status_selected_name: "已選擇: {0}",
        sel_warn_added: "該 LoRA 已經添加到節點中，請選擇其他項",
        sel_added_label: "已添加",
        sel_toggle_nsfw: "切換敏感內容可見性",
        mgr_node_selector_scheme: "選擇器方案",
        mgr_node_scheme_side: "側邊抽屜",
        mgr_node_scheme_top: "頂部篩選",
        mgr_node_scheme_float: "懸浮工具",
        ready: "就緒",

        // Health Center
        health_center: "資產健康中心",
        health_tab_duplicates: "重複項清理",
        health_tab_updates: "版本更新",
        health_click_scan: "點擊下方按鈕開始掃描資產健康狀況",
        health_start_scan: "開始全面掃描",
        health_rescan: "重新掃描",
        health_no_duplicates: "恭喜！未發現重複的 LoRA 資產",
        health_no_updates: "所有模型均為最新版本",
        health_files: "個文件",
        health_delete_selected: "刪除選中項",
        health_ignore_update: "忽略此更新",
        health_deleting: "正在物理刪除資產...",
        health_click_to_confirm: "確認刪除？",
        health_empty_folder_fix: "同時刪除空文件夾",
        health_delete_success: "成功刪除資產: {0}",
        health_auto_backup_tip: "（已完成數據快照自動備份）",
        health_scan_complete: "掃描完成",
        health_scan_duplicates: "掃描重複項",
        health_scan_updates: "掃描版本更新",
        health_need_check_update: "此功能須在【參數設置】中開啟lora版本檢查才可使用",
        health_found_updates: "共發現",
        health_new_versions: "個新版本",
        health_found_duplicates: "共發現",
        health_duplicate_groups: "組重複項",
        health_scanning_busy: "系統正忙，掃描中...",

        // Tooltips
        tooltip_title: "標題",
        tooltip_weight: "權重",
        tooltip_sampler: "採樣器",
        tooltip_base_model: "基礎模型",
        tooltip_notes: "備註",
        tooltip_path: "文件路徑",
        tag_filtering: "標籤過濾",
        tag_filtering_desc: "",
        add_tag: "添加標籤",
        add_tag_placeholder: "輸入要過濾的標籤（用於抓取時過濾無效tag）...",
        restore_preset: "恢復預設",
        confirm_restore_preset: "確認恢復預設標籤列表嗎？",
        tag_already_exists: "該標籤已在黑名單中",
        tag_added: "已添加標籤",
        tag_deleted: "已刪除標籤",
        press_and_hold: "點擊確認刪除",
        confirm_delete_q: "刪除? %1",
        confirm_restore_q: "恢復? %1",
    },
    "en-US": {
        title: "SK LoRA Assets",
        all_lora: "All LoRAs",
        favorites: "Favorites",
        settings: "Settings",
        search_placeholder: "Search name, title, tags, triggers ...",
        sync_local: "Sync Local",
        sync_civit: "Sync Civitai",
        sync_cancelled: "Sync cancelled",
        sync_cancelled_saved: "Sync cancelled. Saved {count} items.",
        trigger_label: "Triggers",
        tags_label: "Categories",
        weight_label: "Weight",
        sampler_label: "Sampler",
        notes_placeholder: "Enter notes...",
        link_label: "Model Link",
        added_date: "Added At",
        published_date: "Published",
        copy_btn: "Copy",
        open_btn: "Open",
        menu_apply: "Apply LoRA",
        menu_sync: "Sync Civitai",
        menu_fetch_url: "AI Analysis Fetch Data",
        enter_url_title: "Please enter Model URL:",
        enter_url_desc: "e.g., LibLib, HuggingFace, ModelScope...",
        fetch_url_btn: "AI Analysis",
        fetch_url_invalid: "Invalid URL",
        fetch_url_title: "AI Analysis Fetch Data",
        ai_analysis: "AI Analysis",
        ai_analysis_reference: "(From AI Analysis, for reference only)",
        open_link: "Open Link",
        menu_fav_add: "Favorite",
        menu_fav_del: "Unfavorite",
        menu_copy_dir: "Copy Lora Dir",
        menu_copy_path: "Copy Lora Path",
        menu_copy_hash: "Copy HASH Value",
        copy_success: "Copied!",
        no_hash_found: "No HASH found",
        save_success: "Saved",
        save_error: "Error",
        invalid_url: "Invalid URL format",
        close_panel: "Close Panel",
        close: "Close",
        edit: "Edit",
        enter_edit: "Enter Edit",
        save: "Save",
        cancel: "Cancel",
        civitai_key: "Civitai API Key",
        civitai_key_placeholder: "Enter Civitai API Key",
        proxy_settings: "Proxy Settings",
        proxy_placeholder: "e.g.: http://127.0.0.1:7890",
        proxy_tip: "Set network proxy, e.g., http://127.0.0.1:7890 (used to access Civitai). It is recommended to use 'TUN mode' in your VPN; once enabled, this field can be left blank.",
        image_mode: "Image Download Mode",
        image_mode_tip: "Please select how to handle images when syncing from Civitai",
        image_mode_missing: "Download Civitai preview when local image is missing",
        image_mode_always: "Always download Civitai preview image",
        image_mode_never: "Never download Civitai preview image",
        settings_saved: "Settings saved",
        settings_save_error: "Failed to save settings",
        get_settings_error: "Failed to get settings",
        sync_progress: "Sync Progress",
        local_sync: "Local Sync",
        civitai_sync: "Civitai Sync",
        preparing: "Preparing...",
        run_in_background: "Run in Background",
        cancel_sync: "Cancel Sync",
        sync_completed: "Sync completed",
        sync_error: "Sync error",
        sync_in_background: "Sync is running in background, you will be notified when complete",
        confirm_cancel_sync: "Confirm Cancel Sync",
        confirm_cancel: "Confirm Cancel",
        confirm_abort_q: "Confirm Abort?",
        continue_sync: "Continue Sync",
        user_cancelled: "User cancelled sync",
        sync_failed: "Sync failed",
        sync_failed_unknown: "Sync failed: Unknown error",
        sync_failed_network: "Sync failed: Network error",
        sync_failed_no_hash: "Cannot sync: Missing file hash",
        syncing: "Syncing...",
        civitai_syncing: "Civitai syncing...",
        processing: "Processing: ",
        scanning: "Scanning... ({0}/{1})",
        start_scan: "Starting to scan local files...",
        enter_tag_name: "Please enter tag name:",
        tag_too_long: "Tag is too long",
        stats_total: "Total",
        stats_processed: "Processed",
        stats_success: "Success",
        stats_failed: "Failed",
        details_log: "Details Log",
        abort: "Abort",
        stopping: "Stopping...",
        lang_label: "EN",
        switch_language: "Switch Language",
        toggle_view_mode: "Toggle View Mode",
        local_sync_completed: "Local sync completed",
        civitai_sync_completed: "Civitai sync completed",
        init_library: "Scan Lora Files",
        update_library: "Update Library",
        current_file: "Current File",
        hash: "Hash",
        status: "Status",
        preview: "Preview",
        date: "Date",
        searching: "Searching...",
        waiting: "Waiting for sync to start...",
        sync_complete: "Sync Complete",
        added_models: "Added Models",
        removed_invalid: "Removed Invalid",
        duration: "Duration",
        complete_close: "Done & Close",
        force_close: "Force Close",
        yes: "Yes",
        no: "No",
        civitai_base_model_locked: "Base model tag of Civitai models cannot be modified",
        delete_preset: "Delete Preset",
        confirm_delete_preset: "Are you sure you want to delete preset {0}?",
        base_model_visibility: "Base Model Visibility",
        data_maintenance: "Data Maintenance",
        backup_data: "Backup Data",
        restore_data: "Restore Data",
        restore_success: "Restore successful, please refresh page",
        backup_success: "Backup exported",
        confirm_restore: "Are you sure you want to restore this backup?",
        confirm_restore_q: "Confirm Restore? ({0})",
        confirm_delete_q: "Confirm Delete? ({0})",
        delete_success: "Preset deleted",
        total_loras: "Total: {0} (Civitai: {1})<br>Size: {2}",
        new_version: "New Ver",
        upload_title: "Click or drag to upload",
        modify_base_model: "Click to modify base model",
        base_model_locked: "Cannot modify base model for Civitai source",
        promote_to_base: "Promote to base model",
        delete: "Delete",
        custom_placeholder: "Custom...",
        confirm_delete: "Confirm delete?",
        sync_weight: "Fetch Weight",
        sync_weight_desc: "Analyze weight from preview image (may be inaccurate)",
        sync_sampler: "Fetch Sampler",
        sync_sampler_desc: "Analyze sampler from preview image (may be inaccurate)",
        sync_triggers_mode: "Trigger Words Mode",
        replace_triggers: "Replace existing triggers",
        merge_triggers: "Merge with existing triggers",
        sync_triggers_desc: "Sync rule for trigger words",
        model_title_source: "Card Title Source",
        use_filename: "Use Filename",
        use_civitai_title: "Use Civitai Title",
        model_title_desc: "Civitai versions might share the same title",
        nsfw_level_setting: "NSFW Allowed Level",
        nsfw_pg: "PG - Suitable for all",
        nsfw_pg13: "PG-13 - Lightly suggestive",
        nsfw_r: "R - Sexy or Lingerie",
        nsfw_x: "X - Sexual content",
        nsfw_xxx: "XXX - Explicit content",
        diff_sync_title: "Sync Comparison: {0}",
        field: "Field",
        local_value: "Local Value",
        civitai_new_value: "Civitai / New Value",
        use: "Use",
        apply_changes: "Apply Changes",
        retry: "Retry",
        sync_timeout: "Request Timeout",
        no_changes: "No changes selected",
        saving: "Saving...",
        model_id: "Model ID",
        sampler: "Sampler",
        nsfw_level: "NSFW Level",
        link: "Link",
        no_image: "No Image",
        no_new_image: "Unable to get image",
        image_invalid: "Unable to get image",
        new_image: "New Image",
        replace: "Replace",
        merge: "Merge",
        true_val: "True",
        false_val: "False",
        preview_image: "Preview Image",
        model_name: "Model Name",
        base_model: "Base Model",
        trigger_words: "Trigger Words",
        weight: "Weight",
        notes: "Notes",
        published_at: "Published At",
        fetch_weight: "Fetch Weight",
        fetch_weight_desc: "Fetch weight from preview image. This is enabled by default if LLM is active.",
        fetch_sampler: "Fetch Sampler",
        fetch_sampler_desc: "Analyze sampler from preview image. This is enabled by default if LLM is active.",
        trigger_word_mode: "Trigger Word Mode",
        trigger_word_desc: "Sync rules for trigger words when fetching data",
        model_title_setting: "Model Card Title",
        model_title_setting_desc: "Model titles for different versions on Civitai may be the same",
        nsfw_allow_level: "NSFW Allow Level",
        nsfw_level_desc: "Higher levels show more content but increase exposure to sensitive info.",
        preview_img_mode: "Preview Image Mode",
        preview_img_mode_desc: "How to handle preview images above the set level. 'Hide Completely' is recommended for work environments.",
        show_directly: "Show Directly",
        blur_mode: "Blur",
        hide_completely: "Hide Completely",
        check_new_version: "Check Lora Update",
        check_new_version_desc: "If an update is available, the card will show 'Update Available'",
        video_frame_preview: "Video Frame Preview",
        video_frame_preview_desc: "Recommended. Otherwise, if the model only has preview videos, preview images cannot be captured.",
        allow_edit_civitai_base: "Allow Edit Civitai Base",
        allow_edit_civitai_base_desc: "Enable to customize base models for Civitai models",
        civitai_diff_panel: "Civitai Sync Diff Panel",
        civitai_diff_panel_desc: "Recommended (allows manual selection of fetched data).",
        image_models: "Image Models",
        video_models: "Video Models",

        // Settings Panel Tabs
        search: "Search",
        none: "None",
        config: "Config",
        tab_basic_config: "Basic Config",
        tab_scraping_rules: "Scraping Rules",
        tab_card_settings: "Card Settings",
        tab_basemodel_mgr: "Base Model",
        tab_advanced_settings: "Advanced",

        // Settings Section Titles
        section_basic_info: "Basic Info",
        section_scraping_rules: "Scraping Rules",
        section_card_display: "Card Display",
        section_basemodel_manage: "Base Model Management",
        section_data_maintenance: "Maintenance & Advanced",

        // Custom Buttons
        base_model_mgr_btn: "Base Model Settings",
        advanced_settings_title: "LLM & Maintenance",
        advanced_settings_btn: "Advanced Settings",

        // Tooltips
        tip_enable_disable: "Click to toggle Enable/Disable",
        tip_drag_sort: "Drag to sort",
        custom_models: "Custom Models",
        drag_to_sort: "(Drag to sort)",
        last_backup: "Last Backup: {0}",
        last_backup_status: "Backup Status",
        no_backup_history: "No backup history",
        snapshot_manager: "Snapshot Manager",
        snapshot_filename: "Filename",
        snapshot_date: "Date",
        snapshot_size: "Size",

        // LLM
        llm_settings: "LLM Settings",
        llm_config_btn: "LLM Config",
        llm_config_mgr: "LLM Config Management",
        llm_add_config: "Add Config",
        llm_edit: "Edit Config",
        llm_default: "Default",
        llm_set_default: "Set Default",
        llm_delete: "Delete",
        llm_delete_confirm: "Are you sure you want to delete this config?",
        llm_no_config: "No Configurations",
        llm_provider: "Provider",
        llm_alias: "Config Alias",
        llm_alias_placeholder: "Name this config...",
        llm_api_key: "API Key",
        llm_api_key_placeholder: "Enter API Key",
        llm_get_api_key: "Get {name} API Key",
        llm_model_name: "Model Name",
        llm_model_placeholder: "Enter or select model name",
        llm_select_model: "Select Model",
        llm_custom_model: "Custom Model",
        llm_refresh_models: "Refresh Model List",
        llm_refresh_success: "Model list refreshed",
        llm_refresh_failed: "Failed to refresh model list",
        llm_advanced_settings: "Advanced Settings",
        llm_base_url: "API Base URL",
        llm_base_url_placeholder: "Enter API Base URL",
        llm_unlock_url: "Unlock URL",
        llm_lock_url: "Lock URL",
        llm_min_interval: "Min Interval (s)",
        llm_min_interval_tip: "Minimum wait time between requests",
        llm_min_interval_placeholder: "e.g.: 4.5",
        llm_ollama_interval_tip: "Local interval helps prevent GPU overload",
        llm_gemini_interval_tip: "Tip: Recommended interval > 4s for Gemini free tier",
        llm_test_connection: "Test Connection",
        llm_testing: "Testing...",
        llm_connection_success: "Connection Successful",
        llm_connection_failed: "Connection Failed: {0}",
        llm_api_key_required: "API Key is required",
        llm_alias_required: "Alias is required",
        llm_model_required: "Please select or enter a model name",
        llm_base_url_required: "API Base URL is required",
        llm_save_success: "Config Saved",
        llm_default_badge: "Default",
        llm_view: "View Config",
        llm_provider_locked: "Provider cannot be changed in edit mode",
        llm_no_model: "No model selected",
        llm_activate_label: "Enable LLM Features (LLM Analysis)?",
        llm_activate_tip: "Add a config in LLM Settings to enable. Once enabled, Weight and Sampler settings in Scraping Rules will be disabled, and AI analysis will be performed by default.",
        llm_activate_disabled_tip: "Please set a default LLM config first",
        llm_activate_tooltip: "[LLM Features]\n·Smart Assist: Analyze model info (results for reference only).\n·Online Models: Consumes API Tokens (may incur costs).\n·Local Models: Occupies VRAM during scanning (suggested before generating).\n·Setup: Add a model in [LLM Config Management] first.",
        llm_provider_gemini: "Google Gemini",
        llm_provider_openai: "OpenAI / Compatible",
        llm_provider_deepseek: "DeepSeek",
        llm_provider_groq: "Groq",
        llm_provider_ollama: "Ollama",
        llm_provider_zhipu: "Zhipu AI",
        llm_provider_xflow: "xFlow API Aggregation",
        llm_provider_custom: "Custom / Others",
        llm_fetching_models: "Fetching models...",
        llm_default_changed: "Default LLM changed",
        llm_recommended: "Recommended",
        llm_sync_tip: "Tip: LLM analysis is active. Batch sync will take significantly longer, please be patient.",
        sync_ai_enabled: "✨ AI Enhanced ({0} - {1}): Refining model notes for you...",
        sync_ai_disabled: "🤖 Base Mode: Enable LLM for better model analysis results.",

        // Snapshot
        loading: "Loading...",
        restore_btn: "Restore",
        delete_btn: "Delete",
        confirm_delete_btn: "Confirm Delete",
        auto_backup_marker: "Auto Backup",
        manual_backup_marker: "Manual Backup",
        remark_manual: "Manually created by user",
        remark_sync_c_auto: "Auto backup before 'Sync Civitai' operation",
        remark_duplicate_auto: "Auto backup before 'Delete Duplicates' operation",
        unknown_error: "Unknown Error",

        // Card & Upload
        setting_show_btn: "Show LoRA Manager Button",
        tooltip_manager: "SK LoRA Manager",
        filename: "Use Filename",
        civitai_title: "Use Civitai Title",
        click_or_drag_upload: "Click or Drag to Upload",
        click_to_edit_base: "Click to Edit Base Model",
        civitai_model_readonly: "Civitai Models cannot have base model edited",
        error_upload_image_type: "Please upload an image file",
        upload_failed_status: "Upload failed with status: ",
        upload_failed_msg: "Upload failed: ",
        preview_upload_success: "Preview image uploaded successfully",
        error: "Error",
        initializing: "Initializing...",
        sync_summary: "Sync Summary",
        completed: "Completed",
        minimize: "Minimize",
        link_placeholder: "https://...",
        toggle_nsfw: "Toggle NSFW Visibility",
        system: "System",

        // Node
        mgr_node_name: "LoRA Manager",
        mgr_node_inject_to: "Inject to ",
        mgr_node_trigger_copied: "Trigger word copied",
        mgr_node_distribute_success: "Successfully distributed to node #{0}",
        mgr_node_distribute_all: "Distribute to all LoRA nodes",
        mgr_node_warn_duplicate: "LoRA already exists in node #{0}, skipped",
        mgr_node_add_partial: "Added {0} items, skipped {1} duplicates",
        mgr_node_add_success: "Added {0} items successfully",
        mgr_node_add_all_skipped: "All {0} items already exist, nothing added",
        mgr_node_weight_tip: "Use wheel or ↑↓ to fine-tune (step 0.01), +/- buttons (step 0.05)",
        mgr_node_trigger_tip: "Triggers: {0}",

        // Selector
        sel_title: "LoRA Selector",
        sel_search_placeholder: "Search LoRA models...",
        sel_confirm_btn: "Confirm Selection",
        sel_cancel_btn: "Cancel",
        sel_mode_toggle: "Toggle View Mode",
        sel_close: "Close",
        sel_recent: "Recent",
        sel_all: "All LoRAs",
        sel_loading: "Loading data...",
        sel_selected: "Selected",
        sel_all_models: "All Models",
        sel_favorites: "Favorites",
        sel_favorites_star: "Favorites",
        sel_recent_icon: "Recent",
        sel_recent_clear: "Clear Recent",
        sel_search_placeholder_full: "Search by name, tags, or trigger words...",
        sel_search_placeholder_lora: "Search LoRA models...",
        sel_search_placeholder_simple: "Search...",
        sel_no_matching: "No matching LoRA found.",
        sel_favorite_label: "Favorite",
        sel_meta_path: "Path",
        sel_meta_no_tags: "No tags",
        sel_none: "None",
        sel_batch_selected_count: "Selected {0} items",
        sel_batch_clear: "Clear Selection",
        sel_batch_view: "View Selected",
        sel_batch_confirm: "Confirm Add & Close",
        sel_status_selected_count: "Selected {0} items",
        sel_status_selected_name: "Selected: {0}",
        sel_warn_added: "This LoRA is already in the list, please choose another",
        sel_added_label: "ADDED",
        sel_toggle_nsfw: "Toggle NSFW visibility",
        mgr_node_selector_scheme: "Selector Mode",
        mgr_node_scheme_side: "Side Drawer",
        mgr_node_scheme_top: "Top Panel",
        mgr_node_scheme_float: "Floating Tool",
        ready: "Ready",

        // Health Center
        health_center: "Asset Health Center",
        health_tab_duplicates: "Duplicates",
        health_tab_updates: "Updates",
        health_click_scan: "Click scan to start analysis",
        health_start_scan: "Start Full Scan",
        health_rescan: "Rescan",
        health_no_duplicates: "No duplicate LoRA assets found",
        health_no_updates: "All models are up to date",
        health_files: "files",
        health_delete_selected: "Delete Selected",
        health_ignore_update: "Ignore Update",
        health_deleting: "Deleting assets...",
        health_click_to_confirm: "Confirm Delete?",
        health_empty_folder_fix: "Delete empty folders as well",
        health_delete_success: "Successfully deleted assets: {0}",
        health_auto_backup_tip: "(Auto snapshot backup completed)",
        health_scan_complete: "Scan Complete",
        health_scan_duplicates: "Scan Duplicates",
        health_scan_updates: "Scan Updates",
        health_need_check_update: "This feature requires 'Check for new Lora versions' to be enabled in [Settings]",
        health_found_updates: "Found",
        health_new_versions: "new versions",
        health_found_duplicates: "Found",
        health_duplicate_groups: "duplicate groups",
        health_scanning_busy: "System busy, scanning...",

        // Tooltips
        tooltip_title: "Title",
        tooltip_weight: "Weight",
        tooltip_sampler: "Sampler",
        tooltip_base_model: "Base Model",
        tooltip_notes: "Notes",
        tooltip_path: "Path",
        tag_filtering: "Tag Filtering",
        tag_filtering_desc: "",
        add_tag: "Add Tag",
        add_tag_placeholder: "Enter tag to filter (Filters invalid tags during scraping)...",
        restore_preset: "Restore Preset",
        confirm_restore_preset: "Are you sure you want to restore the preset tag list?",
        tag_already_exists: "Tag already exists in blacklist",
        tag_added: "Tag added",
        tag_deleted: "Tag deleted",
        press_and_hold: "Click to confirm",
        confirm_delete_q: "Del? %1",
        confirm_restore_q: "Reset? %1",
    }
};

class LangManager {
    constructor() {
        const savedMode = localStorage.getItem("sk-lora-locale-mode");
        const savedLocale = localStorage.getItem("sk-lora-locale");

        this.mode = savedMode || (savedLocale ? "manual" : "system");
        this.locale = this.mode === "manual" && translations[savedLocale] ? savedLocale : this.getSystemLocale();
        this._lastSystemLocale = this.getSystemLocale();
        this._comfyLocaleKey = null;

        this.listeners = [];

        const sync = () => {
            if (this.mode !== "system") return;
            const sys = this.getSystemLocale();
            if (sys === this._lastSystemLocale) return;
            const oldLocale = this.locale;
            this.locale = sys;
            this._lastSystemLocale = sys;
            this.notifyLocaleChange(oldLocale, sys);
        };

        if (typeof window !== "undefined") {
            window.addEventListener("storage", (e) => {
                if (!e || typeof e.key !== "string") return;
                const k = e.key.toLowerCase();
                if (k.includes("locale") || k.includes("language")) sync();
            });
            setInterval(sync, 1000);
        }
    }

    normalizeLocale(code) {
        if (!code || typeof code !== "string") return null;
        const raw = code.trim();
        if (!raw) return null;
        const lc = raw.toLowerCase().replaceAll("_", "-");

        if (lc === "zh" || lc.startsWith("zh-cn") || lc.includes("hans")) return "zh-CN";
        if (lc.startsWith("zh-tw") || lc.startsWith("zh-hk") || lc.includes("hant")) return "zh-TW";
        if (lc.startsWith("en")) return "en-US";

        if (lc.startsWith("zh")) return "zh-CN";
        return null;
    }

    readLocaleValue(rawValue) {
        if (!rawValue) return null;

        // 如果看起来像 JSON，跳过直接匹配，进入下方的解析逻辑
        if (!rawValue.trim().startsWith("{")) {
            const direct = this.normalizeLocale(rawValue);
            if (direct) return direct;
        }

        try {
            const parsed = JSON.parse(rawValue);
            if (typeof parsed === "string") return this.normalizeLocale(parsed);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

            const directKeys = [
                "locale",
                "lang",
                "language",
                "value",
                "comfy_locale",
                "comfyLocale",
                "Comfy.Locale",
                "ComfyUI.Locale"
            ];

            for (const k of directKeys) {
                if (typeof parsed[k] === "string") {
                    const v = this.normalizeLocale(parsed[k]);
                    if (v) return v;
                }
            }

            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === "string" && k.toLowerCase().includes("locale")) {
                    const vv = this.normalizeLocale(v);
                    if (vv) return vv;
                }
            }
        } catch (_) {
        }

        return null;
    }

    readComfyLocale() {
        if (typeof window !== "undefined") {
            try {
                const v = window?.app?.i18n?.locale || window?.app?.i18n?.language;
                const n = this.normalizeLocale(v);
                if (n) return n;
            } catch (_) {
            }

            try {
                const getSettingValue = window?.app?.ui?.settings?.getSettingValue;
                if (typeof getSettingValue === "function") {
                    const keys = ["Comfy.Locale", "ComfyUI.Locale", "ComfyUI.Language", "Comfy.Language"];
                    for (const k of keys) {
                        const v = getSettingValue.call(window.app.ui.settings, k);
                        const n = this.normalizeLocale(v);
                        if (n) return n;
                    }
                }
            } catch (_) {
            }
        }

        if (this._comfyLocaleKey) {
            const cached = this.readLocaleValue(localStorage.getItem(this._comfyLocaleKey));
            if (cached) return cached;
            this._comfyLocaleKey = null;
        }

        const knownKeys = [
            "comfy_locale",
            "comfyui_locale",
            "Comfy.Locale",
            "ComfyUI.Locale",
            "ComfyUI_Locale",
            "i18n_locale",
            "locale",
            "language"
        ];

        for (const k of knownKeys) {
            const v = this.readLocaleValue(localStorage.getItem(k));
            if (v) {
                this._comfyLocaleKey = k;
                return v;
            }
        }

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            const lower = key.toLowerCase();
            if (!lower.includes("locale") && !lower.includes("language")) continue;
            const v = this.readLocaleValue(localStorage.getItem(key));
            if (v) {
                this._comfyLocaleKey = key;
                return v;
            }
        }

        return null;
    }

    getSystemLocale() {
        const comfy = this.readComfyLocale();
        if (comfy) return comfy;
        return navigator.language.startsWith('zh') ? (navigator.language === 'zh-TW' || navigator.language === 'zh-HK' ? 'zh-TW' : 'zh-CN') : "en-US";
    }

    isSystemMode() {
        return this.mode === "system";
    }

    getLangButtonLabel() {
        if (this.mode === "system") return "系";
        if (this.locale === "zh-CN") return "简";
        if (this.locale === "zh-TW") return "繁";
        return "EN";
    }

    // 添加语言切换监听器
    addLocaleChangeListener(callback) {
        this.listeners.push(callback);
    }

    // 移除语言切换监听器
    removeLocaleChangeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    // 通知所有监听器语言已切换
    notifyLocaleChange(oldLocale, newLocale) {
        this.listeners.forEach(callback => {
            try {
                callback(oldLocale, newLocale);
            } catch (error) {
                console.error('[SK-LoRA] [System] 语言切换监听器错误:', error);
            }
        });
    }

    t(key, params = []) {
        const set = translations[this.locale] || translations["en-US"];
        let text = set[key] || key;

        // 如果有参数，替换字符串中的占位符
        if (params && params.length > 0) {
            for (let i = 0; i < params.length; i++) {
                const val = params[i] === undefined || params[i] === null ? '' : params[i];
                // 使用正则表达式替换所有出现的占位符，更加稳健
                const regex = new RegExp(`\\{${i}\\}`, 'g');
                text = text.replace(regex, val);
            }
        }

        return text;
    }

    tForLocale(locale, key, params = []) {
        const set = translations[locale] || translations["en-US"];
        let text = set[key] || key;

        if (params && params.length > 0) {
            for (let i = 0; i < params.length; i++) {
                const val = params[i] === undefined || params[i] === null ? '' : params[i];
                const regex = new RegExp(`\\{${i}\\}`, 'g');
                text = text.replace(regex, val);
            }
        }

        return text;
    }

    tSystem(key, params = []) {
        return this.tForLocale(this.getSystemLocale(), key, params);
    }

    // 提供一个方法方便外部切换语言
    setLocale(langCode, opts = {}) {
        if (translations[langCode]) {
            const oldLocale = this.locale;
            this.locale = langCode;
            const persist = opts.persist !== undefined ? opts.persist : this.mode !== "system";
            if (persist) {
                localStorage.setItem("sk-lora-locale", langCode);
            }

            // 通知所有监听器语言已切换
            this.notifyLocaleChange(oldLocale, langCode);
        }
    }

    // 循环切换语言
    nextLocale() {
        const order = ["zh-CN", "en-US", "zh-TW"];

        if (this.mode === "system") {
            this.mode = "manual";
            localStorage.setItem("sk-lora-locale-mode", "manual");
            this.setLocale("zh-CN", { persist: true });
            return;
        }

        const currentIndex = order.indexOf(this.locale);
        if (currentIndex === -1) {
            this.setLocale("zh-CN", { persist: true });
            return;
        }

        if (currentIndex === order.length - 1) {
            const oldLocale = this.locale;
            this.mode = "system";
            localStorage.setItem("sk-lora-locale-mode", "system");
            const sys = this.getSystemLocale();
            this.locale = sys;
            this._lastSystemLocale = sys;
            this.notifyLocaleChange(oldLocale, sys);
            return;
        }

        this.setLocale(order[currentIndex + 1], { persist: true });
    }

    // 检测系统语言
    detectSystemLanguage() {
        const sys = this.getSystemLocale();
        if (this.mode === "system") {
            this.setLocale(sys, { persist: false });
        }
        return sys;
    }
}
export const lang = new LangManager();
