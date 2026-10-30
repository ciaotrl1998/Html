export const EMPTY_LAYOUT = { version: 1, objects: {} };

export function validateLayout(input) {
  if (!input || input.version !== 1 || !input.objects || typeof input.objects !== 'object' || Array.isArray(input.objects)) throw new Error('场景文件格式无效');
  const entries = Object.entries(input.objects);
  if (entries.length > 2000) throw new Error('场景物件数量超出限制');
  const objects = {};
  for (const [id, transform] of entries) {
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(id) || !transform) throw new Error('物件编号无效');
    const value = {};
    for (const key of ['position', 'rotation', 'scale']) {
      const a = transform[key];
      if (!Array.isArray(a) || a.length !== 3 || a.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('变换必须包含三个有限数字');
      if (a.some(n => key === 'scale' ? n < .01 || n > 100 : Math.abs(n) > 1000)) throw new Error('变换数值超出范围');
      value[key] = [...a];
    }
    if (transform.camera !== undefined) {
      const lens = transform.camera;
      if (!['player-camera', 'board-camera'].includes(id) || !lens || ![lens.fov, lens.near, lens.far].every(n => typeof n === 'number' && Number.isFinite(n)) || lens.fov < 15 || lens.fov > 120 || lens.near < .01 || lens.near > 10 || lens.far < 1 || lens.far > 1000 || lens.far <= lens.near) throw new Error('摄像机视野或裁剪距离无效');
      value.camera = { fov: lens.fov, near: lens.near, far: lens.far };
    }
    objects[id] = value;
  }
  return { version: 1, objects };
}

export function parseLayoutModule(source) {
  const match = source.trim().match(/^export default\s+(\{[\s\S]*\});?$/);
  if (!match) throw new Error('无法读取场景配置');
  return validateLayout(JSON.parse(match[1]));
}

export function layoutModule(layout) { return `export default ${JSON.stringify(validateLayout(layout), null, 2)};\n`; }
