(function () {
  var root = typeof window !== 'undefined' ? window : globalThis;

  var GOODS = {
    wood: { name: '木头', char: '木', color: '#b07b45', sell: 3 },
    stone: { name: '石头', char: '石', color: '#9aa2a9', sell: 3 },
    grain: { name: '谷物', char: '谷', color: '#d8b83e', sell: 4 },
    egg: { name: '鸡蛋', char: '鸡', color: '#f2ddb8', sell: 6 },
    duckEgg: { name: '鸭蛋', char: '鸭', color: '#cfe0ea', sell: 5 },
    feather: { name: '鸭毛', char: '羽', color: '#e8eef2', sell: 5 },
    woolRaw: { name: '兔毛', char: '兔', color: '#efe3d8', sell: 6 },
    manure: { name: '粪便', char: '粪', color: '#7a5c3a', sell: 1 },
    fertilizer: { name: '肥料', char: '肥', color: '#5e7d3a', sell: 10 },
    preservedEgg: { name: '皮蛋', char: '皮', color: '#4a4a4a', sell: 30 },
    saltedEgg: { name: '咸鸭蛋', char: '咸', color: '#e08a3c', sell: 20 },
    down: { name: '羽绒', char: '绒', color: '#f5f9fc', sell: 28 },
    wool: { name: '毛绒', char: '毛', color: '#cbb49a', sell: 32 },
    coat: { name: '冬衣', char: '衣', color: '#8a5a9a', sell: 95 }
  };

  function UP(gold, mat) {
    var a = [];
    for (var i = 0; i < 4; i++) a.push([gold * Math.pow(2, i), mat * Math.pow(2, i)]);
    return a;
  }

  var BUILD = {
    manor: {
      name: '里正宅', icon: '🏯', size: [3, 3], buildable: false, unique: true,
      desc: '每秒产生金币，不可拆除',
      palette: { wall: '#e3c98f', roof: '#a8352a' },
      income: [1.0, 1.2, 1.4, 1.6, 1.8],
      upgrade: UP(120, 12)
    },
    lumber: {
      name: '伐木场', icon: '🪵', size: [2, 2], buildable: true, cost: { gold: 30 },
      desc: '持续产出木头',
      palette: { wall: '#c9a06a', roof: '#6f7f4a' },
      cycle: [8, 7, 6, 5, 4],
      outputs: { wood: [2, 3, 4, 5, 6] },
      inCap: [0, 0, 0, 0, 0],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(30, 3)
    },
    quarry: {
      name: '采石场', icon: '🪨', size: [2, 2], buildable: true, cost: { gold: 30 },
      desc: '持续产出石头',
      palette: { wall: '#b8b2a4', roof: '#7d766c' },
      cycle: [10, 9, 8, 7, 6],
      outputs: { stone: [2, 3, 4, 5, 6] },
      inCap: [0, 0, 0, 0, 0],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(30, 3)
    },
    workshop: {
      name: '工坊', icon: '🔨', size: [2, 2], buildable: true, cost: { gold: 40 },
      desc: '木头或石头混合转化为材料，直接入账',
      palette: { wall: '#c9976a', roof: '#8a5a3a' },
      cycle: [8, 7, 6, 5, 4],
      mixedGoods: ['wood', 'stone'],
      mixedTotal: [2, 2, 4, 4, 6],
      material: [1, 1, 2, 2, 3],
      inCap: [10, 15, 20, 25, 30],
      outCap: [0, 0, 0, 0, 0],
      upgrade: UP(40, 4)
    },
    farm: {
      name: '农田', icon: '🌾', size: [3, 2], buildable: true, cost: { gold: 25 },
      desc: '产出谷物，可用肥料增产',
      palette: { wall: '#8aa34a', roof: '#7d9a3e' },
      cycle: [8, 8, 7, 7, 6],
      variants: [
        { in: 'fertilizer', inQty: [1, 1, 1, 1, 1], out: 'grain', outQty: [5, 6, 7, 8, 9] },
        { out: 'grain', outQty: [3, 4, 5, 6, 7] }
      ],
      inCap: [5, 5, 10, 10, 15],
      outCap: [15, 20, 25, 30, 35],
      upgrade: UP(25, 2)
    },
    chicken: {
      name: '养鸡棚', icon: '🐔', size: [2, 2], buildable: true, cost: { gold: 40 },
      desc: '吃谷物，产鸡蛋与鸡粪',
      palette: { wall: '#e0c48c', roof: '#c06a3a' },
      cycle: [10, 10, 10, 10, 10],
      inputs: { grain: [1, 2, 3, 4, 5] },
      outputs: { egg: [1, 2, 3, 4, 5], manure: [1, 2, 3, 4, 5] },
      inCap: [10, 15, 20, 25, 30],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(45, 4)
    },
    duck: {
      name: '养鸭棚', icon: '🦆', size: [2, 2], buildable: true, cost: { gold: 50 },
      desc: '吃谷物，产鸭蛋、鸭毛与鸭粪',
      palette: { wall: '#cfe0ea', roof: '#4a7a9a' },
      cycle: [14, 14, 14, 14, 14],
      inputs: { grain: [2, 4, 6, 8, 10] },
      outputs: { duckEgg: [1, 2, 3, 4, 5], feather: [1, 2, 3, 4, 5], manure: [1, 2, 3, 4, 5] },
      inCap: [10, 15, 20, 25, 30],
      outCap: [15, 20, 25, 30, 35],
      upgrade: UP(50, 5)
    },
    rabbit: {
      name: '兔棚', icon: '🐰', size: [2, 2], buildable: true, cost: { gold: 45 },
      desc: '吃谷物，产兔毛与兔粪',
      palette: { wall: '#efe3d8', roof: '#9a8a7a' },
      cycle: [12, 12, 12, 12, 12],
      inputs: { grain: [1, 2, 3, 4, 5] },
      outputs: { woolRaw: [1, 2, 3, 4, 5], manure: [1, 2, 3, 4, 5] },
      inCap: [10, 15, 20, 25, 30],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(45, 4)
    },
    compost: {
      name: '堆肥厂', icon: '🌱', size: [2, 2], buildable: true, cost: { gold: 30 },
      desc: '粪便变肥料',
      palette: { wall: '#8a7a4a', roof: '#5e7d3a' },
      cycle: [8, 7, 6, 5, 4],
      inputs: { manure: [2, 2, 4, 4, 6] },
      outputs: { fertilizer: [1, 1, 2, 2, 3] },
      inCap: [10, 15, 20, 25, 30],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(35, 3)
    },
    pickling: {
      name: '腌制厂', icon: '🧺', size: [2, 2], buildable: true, cost: { gold: 30, material: 10 },
      desc: '鸡蛋制皮蛋，鸭蛋制咸鸭蛋，配方独立',
      palette: { wall: '#d9c0a0', roof: '#7a5a4a' },
      cycle: [10, 9, 8, 7, 6],
      inQty: [2, 2, 4, 4, 6],
      outQty: [1, 1, 2, 2, 3],
      variants: [
        { in: 'egg', out: 'preservedEgg' },
        { in: 'duckEgg', out: 'saltedEgg' }
      ],
      inCap: [10, 15, 20, 25, 30],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(50, 5)
    },
    textile: {
      name: '纺织厂', icon: '🧶', size: [2, 2], buildable: true, cost: { gold: 40, material: 15 },
      desc: '鸭毛制羽绒，兔毛制毛绒，配方独立',
      palette: { wall: '#d8cbe0', roof: '#7a5a9a' },
      cycle: [10, 9, 8, 7, 6],
      inQty: [2, 2, 4, 4, 6],
      outQty: [1, 1, 2, 2, 3],
      variants: [
        { in: 'feather', out: 'down' },
        { in: 'woolRaw', out: 'wool' }
      ],
      inCap: [10, 15, 20, 25, 30],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(60, 6)
    },
    dyeing: {
      name: '织染坊', icon: '🧥', size: [2, 2], buildable: true, cost: { gold: 50, material: 25 },
      desc: '用羽绒或毛绒制作冬衣',
      palette: { wall: '#c9a0b8', roof: '#6a3a6a' },
      cycle: [12, 11, 10, 9, 8],
      inQty: [2, 2, 4, 4, 6],
      outQty: [1, 1, 2, 2, 3],
      variants: [
        { in: 'down', out: 'coat' },
        { in: 'wool', out: 'coat' }
      ],
      inCap: [10, 15, 20, 25, 30],
      outCap: [10, 15, 20, 25, 30],
      upgrade: UP(80, 8)
    },
    market: {
      name: '市场', icon: '🏪', size: [8, 2], buildable: false,
      desc: '场外销售点，可指派村民专职售卖，不升级',
      palette: { wall: '#c94a3a', roof: '#e8d3a9' }
    }
  };

  var CFG = {
    GOODS: GOODS,
    BUILD: BUILD,
    BUILD_ORDER: ['lumber', 'quarry', 'workshop', 'farm', 'chicken', 'duck', 'rabbit', 'compost', 'pickling', 'textile', 'dyeing'],
    SEAL: {
      manor: '里', lumber: '木', quarry: '石', workshop: '工', farm: '田',
      chicken: '鸡', duck: '鸭', rabbit: '兔', compost: '肥',
      pickling: '腌', textile: '纺', dyeing: '染', market: '市'
    },
    UNLOCK: {
      lumber: [], quarry: [], workshop: [], farm: [],
      chicken: ['quarry'], duck: ['lumber'], rabbit: ['workshop'],
      compost: ['chicken', 'duck', 'rabbit'],
      pickling: ['chicken', 'duck'],
      textile: ['duck', 'rabbit'],
      dyeing: ['textile']
    },
    RENT: {
      interval: 180,
      table: [70, 110, 170, 250, 340, 450, 580, 740, 930, 1150],
      graceFirst: 30,
      graceLater: 10,
      landPrice: 1000,
      initialGold: 180,
      hireBase: 25,
      hireStep: 12
    },
    VILLAGER: {
      carry: [5, 7, 9, 12, 15],
      speed: [1, 1.15, 1.3, 1.45, 1.6],
      upgrade: UP(60, 6),
      baseSpeed: 4.0,
      names: ['阿福', '小翠', '阿牛', '阿满', '石头', '阿香', '柱儿', '喜儿', '铁蛋', '巧儿', '大壮', '小满', '阿贵', '春妮']
    },
    MAP: {
      W: 20, H: 28,
      fence: { x1: 1, y1: 1, x2: 18, y2: 24 },
      gap: { x: 9, w: 2 },
      plot: { x: 2, y: 2, w: 16, h: 22 },
      market: { x: 6, y: 26, w: 8, h: 2 },
      marketDrop: { x: 9, y: 25 },
      manorAt: { x: 8, y: 2 }
    },
    REFUND: 0.5,
    TILE: 32,
    SAVE_KEY: 'zhuangtianji_save_v1'
  };

  root.CFG = CFG;
  if (typeof module !== 'undefined') module.exports = CFG;
})();
