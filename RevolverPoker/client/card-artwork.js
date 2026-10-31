// Fixed, bundled artwork: no system fonts or procedural card drawing at runtime.
export const CARD_ART_SIZE = { width: 384, height: 558 };
export const CARD_DISPLAY_TILE = { width: 132, height: 173, columns: 13 };
const images = new Map();
let loading = null;

export function cardArtURL(card) {
  const name = card === null ? 'back' : card === 'display' ? 'display' : String(card).padStart(2, '0');
  return new URL(`./assets/cards/${name}.png`, import.meta.url).href;
}

export function cardArtImage(card) {
  const key = card === null ? 'back' : card;
  if (!images.has(key)) {
    const image = document.createElement('img'); image.decoding = 'async';
    image.width = card === 'display' ? 1716 : CARD_ART_SIZE.width;
    image.height = card === 'display' ? 865 : CARD_ART_SIZE.height;
    images.set(key, image); image.src = cardArtURL(card);
  }
  return images.get(key);
}

export function cardDisplayImage() { return images.get('display') || null; }

export function loadCardArtwork() {
  if (loading) return loading;
  const cards = [...Array.from({ length: 52 }, (_, card) => card), null, 'display'];
  loading = Promise.all(cards.map(card => new Promise((resolve, reject) => {
    const image = cardArtImage(card);
    const ready = () => Promise.resolve(image.decode?.()).then(() => resolve(image), reject);
    if (image.complete && image.naturalWidth > 0) { ready(); return; }
    image.onload = ready;
    image.onerror = () => reject(new Error(`固定牌面贴图加载失败：${cardArtURL(card).split('/').at(-1)}，请检查完整游戏目录并重启服务器。`));
  }))).catch(error => { loading = null; throw error; });
  return loading;
}
