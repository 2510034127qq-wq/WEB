# 当前验证入口

本轮仍是 `1.1.0-preview.2` 写实迭代，不是照片级验收或正式发布。

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
