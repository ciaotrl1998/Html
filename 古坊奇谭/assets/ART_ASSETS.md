# 游戏美术资源

游戏运行时从以下目录读取 PNG，不再实时生成建筑、地图资源、道路或城墙图形。

## 建筑

路径：`assets/sprites/buildings/<建筑类型>/level-<外观等级>.png`

- 图片尺寸：`128x128`
- 地面锚点：`(64, 96)`
- `level-1.png`：游戏等级 1-3
- `level-2.png`：游戏等级 4-6
- `level-3.png`：游戏等级 7 及以上

城门也属于建筑，路径为 `assets/sprites/buildings/gate/`。

## 地图

- 基础地表：`assets/tiles/terrain/`，每张 `64x64`
- 地图资源装饰：`assets/tiles/resources/`
- 城墙：`assets/tiles/walls/`，每张 `64x64`
- 地面道路和水上桥梁：`assets/tiles/roads/`，每张 `64x64`

城墙和道路文件名中的十六进制数字是四方向连接掩码：

- `1`：上
- `2`：右
- `4`：下
- `8`：左

例如 `05.png` 表示上下连接，`0a.png` 表示左右连接，`0f.png` 表示四面连接。

## 修改生效

- 使用源码版 `index.html`：替换同名 PNG 后刷新页面即可。
- 使用 `dist/古坊奇谭.html`：替换 PNG 后执行 `npm run build`，图片会重新嵌入离线单文件。
- `node scripts/generate-art-assets.cjs` 会用原程序外观重新生成并覆盖全部建筑和地图 PNG，请勿在保留手工修改时运行。
