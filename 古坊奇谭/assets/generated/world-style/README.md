# 重墨像素场景制作

最终资源仍在 `assets/sprites/buildings/`、`assets/tiles/`、`assets/scenery/`、`assets/ui/`、`assets/overlays/` 和 `assets/effects/`，文件名和尺寸沿用原规范。完整清单见 [manifest.json](manifest.json)。

统一基准为已确认的士兵：清晰像素边缘、深焦棕 `#4a2e20` 细外轮廓、保留材质色块，避免棕色内描边覆盖细节。场景的屋瓦／木材／叶片／石材提高对比和色块饱和度；背景地表降低灰白感，仍与可操作图素区分。

**211 张非士兵 PNG** 已处理。建筑 75 张沿用原有结构与三级外观；庭院地台不圈成矩形框。树石、城墙、桥梁和图标仅用一像素实体外边；草地、水面、岸滩、泥路不画格子边。连接瓦片边缘视为拼接裁口，不增加封口线。UI 切片仍为 6px。范围圈旧有的半透明抗锯齿像素已硬化为二值 Alpha，填充透明度由游戏控制。

`title-town-source-v1.png` 是内置 image_gen 的重绘源图，提示词见 [title-town-prompt.txt](title-town-prompt.txt)。打包后的首页是 `assets/ui/backgrounds/title-town.png`（256×128、二值透明）。原始建筑、地形、UI 的本地绘制源保留；`scripts/restyle-world-assets.cjs` 是像素风格后处理器，不在游戏运行时执行。

`before/assets/` 保存本次处理前的原图。脚本每次都从该备份读取，避免反复叠加调色；因此后续若手工修改成品，不应再次运行该脚本，以免覆盖。士兵图集不会参与处理，脚本以 SHA-256 验证六张图集在处理前后一致。

重建命令（会覆盖成品图）：

```sh
npm run art:world-style
node scripts/preview-world-style.cjs
npm run build
```

预览位于 `assets/generated/qa/world-style/`：`assets-before-after.png` 为分类对照，`scene-before-after.png` 为实际渲染对照。所有资源也可在 `assets/ART_CATALOG.html` 浏览并逐个修改。
