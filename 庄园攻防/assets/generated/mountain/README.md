# 山体资源替换

使用内置 imagegen 工具，以现有石头图标为编辑目标，森林、远景山体和采石场为风格参考，生成连体三峰山体。source.png 是生成原图，before.png 是替换前备份。

最终文件：assets/tiles/resources/mountain.png。运行 `node scripts/prepare-mountain-resource.cjs` 可重新导出：64×64、透明背景、二值 Alpha、五色像素画，保持原有基底行和绘制接口。

运行 `node build.js` 同步离线版；运行 `node assets/generated/mountain/check.cjs` 检查网页版、离线版及截图。

## 生成提示词

Use case: style-transfer. Asset type: replacement transparent PNG mountain resource sprite for the existing Chinese manor strategy game. Reference image 1 (resources/mountain.png) is the EDIT TARGET: replace its boulders with actual miniature mountain terrain. Reference images 2 forest.png, 3 scenery/mountain-1.png, 4 scenery/mountain-2.png, 5 quarry/level-1.png are STYLE REFERENCES only. Make ONE isolated compact connected mountain massif, three clearly pointed uneven peaks, tallest near center, a smaller peak each side, continuous sloped foothills, simple two-tone faceted planes. It must read as mountains at extremely small pixel size, NOT rounded boulders or rock pile. Match the very simple retro pixel artwork: crisp stair-step edges, dark brown thin outline #4a2e20, desaturated sage stone #a0a890, pale grey-green lit left planes #c0c8a8, darker right planes #889880, small muted olive foot areas. No snowcaps, no trees, no water, no buildings, no text, no scenery backdrop, no realistic textures, no gradients, no detailed cracks, no soft shadows, no antialiasing. One single sprite on genuinely transparent canvas. Final intended 64x64 pixel sprite, so paint as roughly 32 pixels wide by 30 pixels tall in a centered canvas with large transparent margins, base at approximately 64 percent of canvas height and top at 17 percent. Simple large readable color areas and coherent ridge silhouettes, compatible with the forest reference, not a detailed illustration. Output square transparent PNG.
