# Chrome 实机验证材料

## v1.1.0-preview.1 沉浸修订

- [本轮改动和验证范围](../docs/IMMERSION-REVISION.md)、[免费资产来源](../licenses/FAB-ASSETS.md)。
- `immersion-check.json`：真实鼠标输入验证七项工位操作；`immersion-wheel-check.json` 单独验证鼠标拖轮。
- `kiln-controls-check.json`：拖封砖、点火、添柴、风闸及冷却。
- `revision-smoke.json`：最终生产构建的 17 项启动、资产请求、署名、改键冲突、存档重载和离线启动检查。
- `walk-check.json`、[行走实录](walk-review.webm)：新工坊直接键鼠操作，记录起步、收步、转向、侧移、蹲下、快走和碰撞。
- [本轮截图目录](review/immersion/)：院落、Fab 陶罐及扫描柴堆、拉坯、入釉、窑火和成器。工位截图使用公开 JSON 存档定位；不代表从泥到成器的连续通关。

![新版免费资产与光影](review/immersion/realism-courtyard.png)

![Fab 挂陶罐](review/immersion/realism-supply.png)

![Fab 扫描柴堆](review/immersion/realism-kiln.png)

## v1.0.0-rc.1 历史验证

下列材料来自旧版，不能用于宣称新版已通过完整流程或达到旧版帧率。

- [验证结论、设备、方法和限制](../docs/VERIFICATION.md)
- [最终实机短录像](review/visual-replay-v04.webm)：有意使用已完成作品的存档重放，便于观察双手、几何、蘸釉、火光和包装。
- `playtest.json`：碗与瓶从原料到入藏的真实键鼠全流程记录。
- `release-check.json`：独立解压发布版的碰撞、拾放、恢复与离线结果。
- `performance.json`：1080p 固定路线的性能测量，未混入录像开销。
- `extracted-assets-check.json`：独立目录中的 Blender 源资产及 GLB 回读。
- `exports/`：完整游玩产生的实际 GLB、PNG、JSON 样品，可直接在游戏设置中导入 `workshop.json` 查看作品。

## 最终实机画面

![院落](review/02-courtyard-v04.png)

![湿泥与双手](review/03-wet-clay-replay-v04.png)

![青花落笔](review/04-paint-replay-v04.png)

![蘸釉](review/06-dip-submerged-replay-v04.png)

![窑火](review/07-kiln-replay-v04.png)

![出窑瓷器](review/08-porcelain-replay-v04.png)

## 前后对照

早期手部及木料：[v01](review/before-wheel-v01.png) → [v04](review/03-wet-clay-replay-v04.png)。

蘸釉出画：[v02](review/before-glaze-v02.png) → [v04](review/05-dip-lift-replay-v04.png)。

窑前构图：[v02](review/before-kiln-v02.png) → [v04](review/07-kiln-replay-v04.png)。

这些是不同版本和对应阶段的实机复核材料；镜头和作品可能不同，不作为固定机位的性能对比。未经项目所有者确认，不标记为已批准的写实视觉基准。
