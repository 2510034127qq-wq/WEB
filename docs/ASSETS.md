# 资产与许可

所有运行资源均在 `public/assets/` 中，游戏无需远程热链。资源来源及文件哈希见 `public/assets/provenance.json`。

## 三维资产

- `art/workshop.blend` / `public/assets/workshop.glb`：为本项目用 Blender 脚本制作的木构、院墙、瓦片、辘轳、窑炉、架子、案台、罐钵及杂物。
- `art/hands.blend` / `public/assets/hands.glb`：基于 Fab 作者 Store Page 的 **hands** 改编，CC BY 4.0；保留原作者 UV、皮肤贴图和指骨，裁剪单手、重定坐标/骨名、细分近景网格，再镜像为右手。详情见 `licenses/FAB-ASSETS.md`。
- 活动瓷器由玩家的 48 环剖面实时细分生成；纹样、釉层与缺陷来自作品数据。`art/craft-tools.blend` 为本项目可编辑工具源文件。
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

## 2026-10-24 新增资产

逐文件下载网址、字节数与 SHA-256 分别见 `public/assets/scan-provenance.json`、`craft-surface-provenance.json` 和 `clay-surface-provenance.json`。贴图保留颜色 sRGB、法线/粗糙度/高度线性的区分。

Poly Haven [CC0](https://polyhaven.com/license) 模型：Chinese Console Table、Chinese Stool、Wicker Basket 01、Ceramic Pot、Wooden Bucket 01、Wooden Stool 01，以及林地的 Pine Tree 01、Fern 02、Grass Bermuda 01、Shrub 03、Tree Stump 01。松树 4K 贴图保留，围墙外树冠使用距离 LOD；原始网格和可编辑处理文件留存。

Poly Haven 4K 材质：Rough Linen、Wooden Planks、Grey Roof Tiles、Bamboo Veneer、Metal Plate。Clay Plaster 用于粗陶/灰泥类环境表面，已停止作为主角瓷胎法线；Worn Plaster Wall 因重复图案未用于整面墙。

ambientCG [CC0](https://docs.ambientcg.com/license/)：Clay005 和 Clay006 的 4K Color、NormalGL、Roughness、Displacement；官方标注采样宽度 20cm。它们是通用泥土材质，不是景德镇瓷石的现场化学测量结果。

`public/assets/lighting/` 为项目自建场景的 Cycles 光照结果；源 HDRI 按原有 Poly Haven 授权使用。清单记录样本数、通道、尺寸和是否降噪。

地表新增 [Brown Mud 02](https://polyhaven.com/a/brown_mud_02)（1.3m）与 [Forest Leaves 03](https://polyhaven.com/a/forest_leaves_03)（2.3m）4K 全通道，来源与哈希见 `terrain-provenance.json`。松针与草的独立透明度贴图来自相同资产的官方文件，见 `vegetation-alpha-provenance.json`。

松树的完整下载缓存不进入运行包，当前使用的编辑模型为 `art/woodland-pine.blend`，其中已打包依赖贴图。`scripts/prepare-vegetation.py` 保留重建流程。Meshopt 的运行解码器来自 Three.js，压缩器许可另保存在 `licenses/meshoptimizer-MIT.txt`；编码没有改变模型或图片分辨率。

实木柱、架板与陶车使用 Poly Haven [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood) 的原始 4K Albedo、Roughness、NormalGL、AO。采用 API 中 600mm 的尺寸字段；旧元数据另列 30×30cm，两者冲突已写入来源清单，不将当前尺寸称为独立测量结果。端面仍需专门的端纹材质。林地增加 [Grass Medium 01](https://polyhaven.com/a/grass_medium_01) 的原始 LOD0 网格、4K 材质与官方透明度贴图。

`art/potters-wheel.blend` / `public/assets/potters-wheel.glb`：项目原创分件模型，结构参考吴军明等《明代景德镇制瓷陶车研究》，《故宫博物院院刊》2023 年第 5 期，[图 14–16，32–33 页](https://www.dpm.org.cn/Uploads/File/2023/05/19/u6466da5a467d9.pdf)。包括单木盘、固定立柱、陶质承重/径向轴承、四腿笼架和缠绳；直径 1.1m，游戏中抬高的工作位置属于解释性复原。文献图片仅供观察结构，未作为贴图或随游戏分发。

2026-10-24：Red Brick 03 升级为官方原始 4K Diffuse / NormalGL / Rough / AO / Displacement。作者 Rob Tuytel，CC0，官方尺寸 1m。`scripts/fetch-kiln-brick.py` 以 API MD5 验证下载，SHA-256 和具体 URL 写入 `realism-provenance.json`。它仍是砖墙样本，不能据此把现有封窑砖模型称为实物扫描模型。

釉缸在 `art/craft-tools.blend` 中保留可编辑实体，接耳布尔连接、卷口、底厚和 20cm UV 已重做；不是购买或扫描所得的成品器物。表面使用现有 [ambientCG Clay005](https://ambientcg.com/a/Clay005) 的 4K PBR 通道，并添加按液位和流淌路径设计的使用遮罩。2026-10-24 的官方 API 同时返回 `creationMethod=PBRProcedural` 与 `creationMethodName=Height field photogrammetry`，来源方法字段不一致，因此不将其称为独立核实的纯扫描材料；20×20cm 与下载文件来源已核对。粗陶连通岛在运行时修正物理尺度 UV，不改位置、法线与烘焙 LightUV。

本轮也检索了 Fab 的免费 Terracotta pot /1、Poly Haven Planter Pot Clay 与地方匣钵工艺资料。园艺盆的苔痕、器形不适合直接冒充历史釉缸，未宣称已采用这些候选模型。检索、已有 Fab 资产、摄影测量资产、纹理库和 Blender 工作分别记录，不能用一项代替其他项。
