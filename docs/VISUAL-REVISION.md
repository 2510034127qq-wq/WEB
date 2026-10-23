# 纹理与光影修订记录

本轮是针对旧版均匀发灰、近景材质缺乏尺度、环境道具过于简陋的具体修订。画面仍需用户验收，不能以技术清单代替“以假乱真”的判断。

## 实际接入的资产

所有贴图在本地发布包内加载，没有运行时外链。`public/assets/realism-provenance.json` 记录下载网址、SHA-256、实际字节数。下载脚本为 `scripts/fetch-realism-assets.py`。

| 用途 | 原资产 | 本地规格 |
| --- | --- | --- |
| 木架、桌板 | [Weathered Brown Planks](https://polyhaven.com/a/weathered_brown_planks) | 2K 色彩、粗糙度、OpenGL 法线、AO、高度 |
| 抹灰墙 | [Plastered Wall](https://polyhaven.com/a/plastered_wall) | 2K 五通道；替换旧版带竖向接缝的墙图 |
| 院落石面 | [Cobblestone Floor 05](https://polyhaven.com/a/cobblestone_floor_05) | 2K 五通道；高度驱动可见网格起伏 |
| 窑砖 | [Red Brick 03](https://polyhaven.com/a/red_brick_03) | 2K 五通道 |
| 天光 | [Kloofendal 48d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | 2K HDR，保留高动态范围 |
| 叶片 | [Tree Small 02](https://polyhaven.com/a/tree_small_02) | 1K 原叶面色彩、透明轮廓与法线；不再用无贴图的菱形片 |
| 门外土地 | [Forest Ground 04](https://polyhaven.com/a/forest_ground_04) | 1K 色彩、法线与粗糙度；南侧树带后接有起伏的土地 |

以上来源遵循 [Poly Haven CC0 许可](https://polyhaven.com/license)。树形仍由本项目生成；使用的是源资产的叶图，不是导入了整棵五百万面树。叶片仅用于环境外观，不构成景德镇植物物种考证。

用户建议的 Fab 资产已用于环境道具；作者和具体 CC BY 4.0 条件见 `licenses/FAB-ASSETS.md`，没有把环境模型当作玩家制作的陶瓷。

## 渲染改动

- 移除室内默认反射环境和高亮半球填光，使用真实 HDRI 天光、较弱的地面反弹填光和有方向的太阳阴影。太阳方向从 HDRI 最亮位置计算，并与天空旋转保持一致。
- 高画质太阳阴影升到 4096；保留屏幕空间接触遮蔽。光源曝光、材质颜色与显示色彩空间分别处理。
- 基础色按 sRGB 读取，粗糙度、AO 和法线保持线性。各向异性过滤上限 16，受设备能力约束。
- 木梁 UV 随构件长轴排列，修正木柱横向纹理；桌板保留实际几何接缝和倒角。编辑源 `art/workshop.blend` 与运行 GLB 同步重建。
- 石面样本按 2.8 米重复，240×240 细分网格读取源高度图，起伏范围约 16 毫米，最高点距原碰撞平面不到 12 毫米。角色仍使用稳定的地面碰撞体。
- 北侧工位、东侧、成器堂各捕捉一张静态局部反射环境。釉面反射可看到场内木架与天空，而不是通用摄影棚白条。
- 湿泥、干坯、烧成釉面使用不同粗糙度与微表面幅度；烧成釉面保留细小粗糙度变化，不把高强度随机噪声当成真实釉面。
- 原手部短衣袖与前臂接筒改为从袖口到手肘的一片连续曲面，避免重叠截断；仍为简化手臂模型。

## 验证范围与尚存差距

浏览器内检查了庭院、原料台、湿坯与成器近景；使用公开 JSON 导入摆放用于视觉观察的存档，这些截图不是完整游玩流程证明。完整交互由单独的实际鼠标测试验证。

场景建筑仍是项目自建的规则木构，未完成实地摄影测量；部分水缸、手部与布料仍是简化模型。光照使用实时阴影、HDR 环境和静态反射探针，没有实时全局光照或路径追踪。采集素材的质量提升不等于整幅画面已达到摄影级真实。
