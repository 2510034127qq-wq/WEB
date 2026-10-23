# 资产与许可

所有运行资源均在 `public/assets/` 中，游戏无需远程热链。资源来源及文件哈希见 `public/assets/provenance.json`。

## 三维资产

- `art/workshop.blend` / `public/assets/workshop.glb`：为本项目用 Blender 脚本制作的木构、院墙、瓦片、辘轳、窑炉、架子、案台、罐钵及杂物。
- `art/hands.blend` / `public/assets/hands.glb`：为本项目制作的连续手部网格、16 骨手部骨架、指甲和布袖。
- 活动瓷器由玩家的 48 环剖面实时生成；纹样、釉层与缺陷来自作品数据。树叶、磨损、纸草包装、火焰及工具由程序构建。
- 声音通过 Web Audio 合成环境噪声、触泥、脚步和器具声，没有外部录音或音乐。
- 没有使用 AI 图片充当三维场景，也未将离线渲染图当作浏览器实机截图。

## PBR 贴图

下列 Poly Haven 资源按 [CC0 许可](https://polyhaven.com/license) 使用，每套保留 1K JPG 的颜色、粗糙度、OpenGL 法线三张图。SHA-256 和原始下载 URL 均进入来源清单。

| 本地前缀 | 来源 | 用途 |
| --- | --- | --- |
| `agedwood_` | [Weathered Brown Planks](https://polyhaven.com/a/weathered_brown_planks) | 旧木构与案台 |
| `wall_` | [Plastered Wall 02](https://polyhaven.com/a/plastered_wall_02) | 院墙 |
| `ground_` | [Cobblestone Floor 05](https://polyhaven.com/a/cobblestone_floor_05) | 院落石地 |
| `brick_` | [Red Brick 03](https://polyhaven.com/a/red_brick_03) | 窑砖 |
| `wood_` | [Wood Table 001](https://polyhaven.com/a/wood_table_001) | 早期版本木料，保留用于版本复现 |

## 软件

- Three.js：MIT，完整许可保存在 `licenses/three-MIT.txt`。
- Rapier JavaScript / WASM：Apache-2.0，完整许可保存在 `licenses/Apache-2.0.txt`。
- 开发依赖 Vite、Vitest、TypeScript、Playwright 等的确切版本由 `package-lock.json` 锁定，其许可随各安装包提供。

本说明仅记录第三方授权，不替项目所有者另行授予原创项目代码、美术或用户方案的公开发布许可。
