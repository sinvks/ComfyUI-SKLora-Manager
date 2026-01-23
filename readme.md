# SK LoRA Manager - Powerful LoRA Assistant for ComfyUI

[![Version](https://img.shields.io/badge/version-1.0.2-blue)](https://github.com/sinvks/ComfyUI-SKLora-Manager)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

SK LoRA Manager is an advanced LoRA management plugin designed specifically for ComfyUI. It not only provides beautiful preview and category management functions but also integrates powerful LLM (Large Language Model) support to help you manage, search, and use your LoRA models more efficiently.

![](assets/sklora-manager.jpg)

![](assets/nodes.jpg)

## 🌟 Key Features

- **🎨 Deep Model Management**: Provides full LoRA previews, tag management, and categorization functions, supporting automatic metadata scraping from Civitai.
- **🤖 Intelligent LLM Integration**: Built-in support for multiple LLM providers (OpenAI, Gemini, DeepSeek, Groq, Zhipu AI, Xflow, etc.) for auto-generating trigger words, descriptions, and tags.
- **🖥️ Interactive Editor**: Integrated management panel supporting real-time search, one-click trigger word insertion, batch editing, etc.
- **📊 Prompt Matrix**: Built-in multiple Prompt Matrix nodes (V1/V2/V3) for easy model comparison testing.
- **🌐 Global Support**: Full support for Simplified Chinese, Traditional Chinese, and English interfaces.
- **📥 Civitai Assistant**: One-click synchronization of Civitai model information, automatic download of previews and trigger words.

## 🛠️ Installation

### Method 1: Via ComfyUI Manager
1. Open ComfyUI Manager
2. Click "Custom Nodes Manager"
3. Search for "SK LoRA Manager" and install
4. Restart ComfyUI

### Method 2: Manual Installation
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/sinvks/ComfyUI-SKLora-Manager.git
pip install -r requirements.txt
```

## 🚀 Quick Start

1. **Scan Models**: On the first run, the plugin will automatically scan your `models/loras` directory.

2. **Management Panel**: Click the "SK LoRA Manager" icon in the top menu to open the main panel.

3. **Parameters Settings**: Click "Parameters Settings" in the lower-left corner of the main panel to enter the settings panel. In "Basic Config", fill in your Civitai API Key (this is the basis for achieving Civitai synchronization and the "Sync Civitai" button).

4. **Sync Local**: The "Sync Local" button in the upper-right corner of the main panel scans the local `models\loras` directory and imports LoRA files into the database.

5. **Sync Civitai**: The "Sync Civitai" button in the upper-right corner should be executed after "Sync Local". It associates local models with Civitai and fetches relevant information (requires Civitai API Key; for AI analysis, refer to step 6).

6. **Advanced Settings**: To experience AI empowerment, go to the "Advanced Settings" in the "Parameters Settings" panel, configure "LLM Model Configuration" and enable it. The LLM configuration panel provides multiple mainstream providers. Select one, fill in your key, and after passing the test, save it to the selection list (you can set one as default). Tip: Choose providers based on your needs; some models may charge fees, subject to the provider. If conditions allow, local Ollama is recommended.

7. **Floating Menu**: The floating menu in the upper-right corner of the LoRA card in the main panel offers various operations. "Sync Civitai Data" requires Civitai API Key; "AI Analysis Data" requires enabled "LLM Model Configuration" and a model URL filled in the card; "Use this LoRA" injects the selected LoRA into the "SK LoRA Loader" in your workflow (located in nodes -> SK LoRA Manager).

8. **Base Model Settings**: Models fetched from Civitai usually have the base model set automatically. For others, please add or modify them yourself. "Parameters Settings" panel -> "Base Model Management" allows you to add preset base models and adjust their order. You can also manually add/delete custom base models on the LoRA card in the main panel.

   > AI models are for assistance only and are not omnipotent; some information may need to be filled in or modified manually.
   >
   > It is recommended to back up data before deleting or modifying (Manual backup: Parameters Settings -> Advanced Settings). When performing "Sync Civitai" and "Delete Duplicates", the plugin will automatically back up data in the `user\default\SKLoraManager-Data` directory.
   >
   > Please explore other features on your own and provide feedback if you have any questions.

## 📦 Included Nodes

- `SK LoRA Manager`: Core management node.
- `SK Interactive Editor`: Interactive Prompt editor.
- `SK LoRA Meta Extractor`: Model metadata extraction tool.
- `SK Prompt Matrix`: Nodes for generating test matrices.

## 📝 Changelog

### v1.0.2
- **🛡️ Data Protection Mechanism**: Implemented a new data initialization and smart merge logic. When updating the plugin, existing user data (LoRA database, configuration files, custom base models) will be fully preserved and no longer overwritten by initial templates.
- **🤖 LLM Functionality Optimization**: Added support for NVIDIA NIM services and optimized custom LLM functionality.
- **🔄 Sync Experience Optimization**: Modified the language setting rule for Civitai metadata import when LLM is enabled (follows plugin language settings).

### v1.0.1
- **📄 LLM Functionality Optimization**: Fixed global style conflict issues in non-Nodes 2.0 mode.

## 📄 License

This project is licensed under the [MIT](LICENSE) License.

## 🤝 Contributing

If you encounter any issues or have feature suggestions, feel free to open an [Issue](https://github.com/sinvks/ComfyUI-SKLora-Manager/issues) or submit a Pull Request.

---
*Created with ❤️ by [sinvks](https://github.com/sinvks)*
