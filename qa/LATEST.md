# 当前验证入口

本轮仍是 `1.1.0-preview.2` 写实迭代，不是照片级验收或正式发布。

## 当前：r57–r61 封闭院落与性能

2026-10-28，当前生产脚本 `workshop-DLf4owfc.js` / `three-CkcWMcEh.js`。用户要求移除屋外林地并封闭院门；当前游戏不显示玩家手部，工位使用鼠标光标。38 项单元测试与构建通过，详细改动和测量范围见 [封闭院落与性能修复](../docs/PERFORMANCE-ENCLOSED.md)。

| 内容 | 记录 | 范围 |
| --- | --- | --- |
| 原生尺寸连续行走 | [benchmark-r60.json](benchmark-r60.json) | 可见 Chrome，2560×1600 高画质，12 秒 RAF；59.89 FPS、P95 16.8ms |
| 院落、院门、辘轳、施釉 | [scene-r61-final.json](scene-r61-final.json) | 同尺寸四个视角各 7 秒，均约 59.89 FPS，无超过 33.5ms 的帧 |
| 门体、旧存档、离线与留影 | [enclosed-r57.json](enclosed-r57.json) | 10 项通过，确认无林地资源请求、PNG 与离线恢复可用 |
| 连续塑形 | [sculpt-r58.json](sculpt-r58.json) | 12 项通过，1080p 连续拖动、松手、提拉、撤回与帧耗时 |
| 彩绘、控温与导出 | [reference-r59.json](reference-r59.json) | 18 项通过，公开工位样本与真实鼠标输入；非从原料开始的完整链 |
| 闭合木门资产 | [closed-gate-asset.json](closed-gate-asset.json) / [model-compression.json](model-compression.json) | Blender 可编辑构件、4 材质组、无损 Meshopt |

实机近景：[闭合木门](scene-r61-final-gate.png)、[院内](scene-r61-final-courtyard.png)、[施釉反射](scene-r61-final-glaze.png)。下列旧轮次保留历史语境；院外林地与玩家手部已退出当前功能范围。

## 历史：r28

2026-10-24 实现提交 `52ea9db`，最终生产脚本 `index-wO9qQFTA.js`、Three.js `three-BV073Qur.js`。25 项单元测试与构建通过。手部继续暂缓。

| 内容 | 记录 | 范围 |
| --- | --- | --- |
| 当前工位画面 | [photographic-r28.json](photographic-r28.json) | 10 个视角，真实 E/Escape 操作、公开样本导入；非照片级通过 |
| 浸釉与刷釉 | [glaze-r28.json](glaze-r28.json) | 19 项通过；悬空不上釉、实际接液、长瓶限位、提起旋转补涂、形状资源保持不变；构建 `index-MqKjmEo4.js`，最终只另改冷却闪烁 |
| 当前手动窑炉 | [kiln-r28.json](kiln-r28.json) | 24 项通过；真实封门、引火、风门、添柴、升温、止火；验证冷窑与低温冷却不重画点光阴影 |
| 分开复审 | [visual-review-r28.md](visual-review-r28.md) | 接耳 GLB 哈希、UV/连接复核、反射源码检查、未通过项目 |
| 资产与无损压缩 | [model-compression.json](model-compression.json) / [资产说明](../docs/ASSETS.md) | 新釉缸源文件与无损解码比较；官方 4K 砖材来源及哈希 |

接下来的主要视觉任务是封窑砖构造、匣钵形制和耐火材质、火焰体积感、林地衔接及木材端纹。当前平面反射增加了渲染成本，本轮没有新的全场景帧率通过声明。

当前十视角总览：[photographic-r28-contact.jpg](photographic-r28-contact.jpg)。主线程已查看总览与釉缸、浸釉、刷釉、冷热窑近景；封窑砖和院外林地仍然明显缺乏真实感。

## 前一轮：r19–r22

应用实现：`d536294`（资产、材料、光照、保存）及 `5a8168e`（太阳阴影复用）。生产脚本为 `index-CBQZVoFj.js`，Three.js 脚本为 `three-BoEnYCZQ.js`。手部暂缓。

| 内容 | 记录 | 范围 |
| --- | --- | --- |
| 当前阴影前后对照 | [报告关闭缓存](shadow-cache-r22-off.json) / [报告启用缓存](shadow-cache-r22-on.json) / [并排图](shadow-cache-r22-contact.png) | 同一构建、固定曝光 4，四个视角；没有禁用阴影或简化资产 |
| 当前手动窑炉 | [kiln-r22.json](kiln-r22.json) | 公开导入干坯后真实拖动控件；拖风门期间阴影更新请求增加 |
| 当前性能 | [benchmark-r22.json](benchmark-r22.json) | 本机 1080p 高画质单路线、原始帧时间；不能外推全场景 |
| 连续行走与曝光 | [报告](walk-r21.json) / [录像](walk-r21-review.webm) / [抽帧](walk-r21-contact.png) / [采样复核](walk-r21-review.json) | 缓存修改前 r21；没有音频验收 |
| 碗、瓶完整工艺链 | [craft-chain-r19.json](craft-chain-r19.json) | 更早的 `index-BZnJF4xp.js`；空存档、真实输入、正常加速等待及辅助控火 |
| 实际下载模型与备份 | [导出结构复核](craft-chain-r19-exports.json) / [碗](exports/craft-chain-r19/bowl.glb) / [瓶](exports/craft-chain-r19/vase.glb) / [完整存档](exports/craft-chain-r19/workshop.json) | 重新解码验证结构，不代表自定义着色器在其他软件中完全等价 |

r13 保存刷新失败、r17 大模型下载失败及 r20 已撤回的叶片试验记录保留，用于追溯，不属于通过证据。详细修复与仍未通过的视觉项目见 [写实修订记录](../docs/PHOTOGRAPHIC-REVISION.md)。

当前阴影优化的分开复审见 [review](shadow-cache-r22-review.md)。
