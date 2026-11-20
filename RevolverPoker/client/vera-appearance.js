const hairstyles = ['swept', 'bob', 'braid'];
const hairColors = [0x512638, 0x362f3b, 0x725039, 0xa26446, 0xbf965c, 0x4b394f];
const outfitColors = [0x8b243c, 0x316d67, 0x405a8a, 0x9b5b33, 0x576e3c, 0x784c80];

export const DEFAULT_VERA_APPEARANCE = Object.freeze({ hairstyle: hairstyles[0], hairColor: hairColors[0], outfitColor: outfitColors[0] });

function pick(options, seed) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash ^= hash >>> 13;
  return options[(hash >>> 0) % options.length];
}

// Room and player identity stay stable across camera changes and reconnects.
export function veraAppearance(roomCode, seat) {
  const seed = `${roomCode}:${seat.id ?? seat.seat}`;
  return {
    hairstyle: seat.kind === 'ai' && hairstyles.includes(seat.hairstyle) ? seat.hairstyle : pick(hairstyles, `style:${seed}`),
    hairColor: pick(hairColors, `hair:${seed}`),
    outfitColor: pick(outfitColors, `outfit:${seed}`),
  };
}

export function veraAppearanceKey({ hairstyle, hairColor, outfitColor }) {
  return `${hairstyle}:${hairColor}:${outfitColor}`;
}
