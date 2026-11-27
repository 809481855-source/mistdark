/* 全局配置：稀有度、属性表、关卡、背包 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.CONFIG = {
    BAG_SIZE: 32,
    MAX_SKILL_LEVEL: 10,
    MAX_LEVEL: 60,
    // 装备槽位：与装备界面 PSD 的 10 个格子一一对应
    SLOTS: [
      { id: 'weapon', name: '武器', glyph: '刃' },
      { id: 'offhand', name: '武器', glyph: '盾' },
      { id: 'helm', name: '头盔', glyph: '盔' },
      { id: 'armor', name: '胸甲', glyph: '甲' },
      { id: 'shoulder', name: '护肩', glyph: '肩' },
      { id: 'gloves', name: '手套', glyph: '手' },
      { id: 'pants', name: '裤子', glyph: '裤' },
      { id: 'boots', name: '鞋子', glyph: '履' },
      { id: 'ring', name: '戒指', glyph: '戒' },
      { id: 'amulet', name: '项链', glyph: '链' }
    ],
    STAT_META: {
      atk: { label: '攻击力', suffix: '', decimals: 0 },
      atkPct: { label: '攻击力提升', suffix: '%', decimals: 0 },
      hp: { label: '最大生命', suffix: '', decimals: 0 },
      armor: { label: '护甲', suffix: '', decimals: 0 },
      crit: { label: '暴击率', suffix: '%', decimals: 1 },
      critDmg: { label: '暴击伤害', suffix: '%', decimals: 0 },
      moveSpeed: { label: '移动速度', suffix: '%', decimals: 1 },
      attackSpeed: { label: '攻击速度', suffix: '%', decimals: 1 },
      hpRegen: { label: '生命回复', suffix: '/秒', decimals: 1 }
    }
  };

  // 品质（对应掉落权重 / 词缀数量）：白 → 蓝 → 紫 → 绿（套装）→ 橙（暗金）
  // 套装与暗金有概率roll出「远古」版本，基础属性与词缀数值更高
  DG.data.rarity = [
    { id: 'normal', name: '普通', color: '#cfc9bb', weight: 52, affix: [0, 0] },
    { id: 'magic', name: '魔法', color: '#5b8bd6', weight: 31, affix: [1, 2] },
    { id: 'rare', name: '稀有', color: '#b06fd8', weight: 12, affix: [3, 4] },
    { id: 'set', name: '套装', color: '#5fae5a', weight: 3, affix: [3, 4] },
    { id: 'legend', name: '暗金', color: '#e8853c', weight: 2, affix: [4, 5] }
  ];

  DG.data.rarityById = {};
  DG.data.rarity.forEach(r => { DG.data.rarityById[r.id] = r; });

  // 四大章节 · 每章 20 个连续关卡（共 80 关）
  // ilvl 决定怪物强度与装备物品等级；reqLevel 为等级门槛，同时要求通关上一关。
  DG.data.acts = [
    { id: 1, name: '迷雾边境', desc: '雾从林地深处漫上来，先活下来。' },
    { id: 2, name: '腐化荒野', desc: '灰烬、裂隙与疫病，腐化正在扩散。' },
    { id: 3, name: '黑潮之上', desc: '沿着沉船与潮汐，追到腐化的源头。' },
    { id: 4, name: '王座终局', desc: '世界之痕裂开，终焉之门就在眼前。' }
  ];

  DG.data.dungeons = [
    // ---------- 第一章 · 迷雾边境 ----------
    {
      id: 'grove', act: 1, name: '迷雾林地',
      subtitle: '野兽与亡骸', ilvl: 1, reqLevel: 1,
      waves: [6, 8],
      pool: ['wolf', 'skeleton', 'pea', 'fleece', 'foxraider', 'deepfin', 'bat', 'hornet'],
      elitePool: ['mawflower'],
      bossId: 'eyehorror',
      bossPool: ['eyehorror', 'croc', 'mawfish', 'slimeking'],
      mapStyle: 'grove',
      map: { minRooms: 10, maxRooms: 13 },
      desc: '被迷雾吞没的林地，腐化野狼与游荡骸骨在树影间徘徊，血翼蝠与毒刺蜂穿梭其间。'
    },
    {
      id: 'thicket', act: 1, name: '荆棘林径',
      subtitle: '群兽围猎', ilvl: 2, reqLevel: 3,
      waves: [6, 9],
      pool: ['wolf', 'skeleton', 'pea', 'musketeer', 'foxraider', 'hornet', 'bat', 'fleece'],
      elitePool: ['mawflower'],
      bossId: 'croc',
      bossPool: ['croc', 'mawfish', 'mummyking', 'slimeking'],
      mapStyle: 'grove',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '荆棘封住的小径上，菌帽枪手占据高处，灰狐掠手成群结队，沼泽巨鳄在泥水中伺机而动。'
    },
    {
      id: 'fen', act: 1, name: '腐朽沼泽',
      subtitle: '毒雾与水鬼', ilvl: 3, reqLevel: 5,
      waves: [7, 9],
      pool: ['deepfin', 'angler', 'mistwalker', 'bat', 'hornet', 'pea', 'fleece', 'mawflower'],
      elitePool: ['mawflower'],
      bossId: 'mawfish',
      bossPool: ['mawfish', 'eyehorror', 'croc', 'slimeking'],
      mapStyle: 'grove',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '腐水没膝，渊灯兽在水下亮起幽光，迷雾行者拖着自己的影子在雾里游走。'
    },
    {
      id: 'crypt', act: 1, name: '沉沦墓穴',
      subtitle: '更密集的亡者', ilvl: 4, reqLevel: 8,
      waves: [7, 10],
      pool: ['frostwolf', 'skeleton', 'mistwalker', 'pea', 'pumpkin', 'frostslime', 'beetle', 'cinderraven', 'candle', 'cowlbandit', 'angler', 'mummy'],
      elitePool: ['plaguedoc'],
      bossId: 'mummyking',
      bossPool: ['mummyking', 'croc', 'mawfish', 'slimeking'],
      mapStyle: 'crypt',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '墓穴深处渗出寒气，黑焰蝠在远处盘旋，青壳甲虫在石棺间爬行，灰发女妖守着更深的墓道。'
    },
    {
      id: 'catacomb', act: 1, name: '幽影墓道',
      subtitle: '骸骨军团', ilvl: 5, reqLevel: 10,
      waves: [7, 10],
      pool: ['skeleton', 'mistwalker', 'boneknight', 'beetle', 'cinderraven', 'candle', 'frostslime', 'cowlbandit', 'mummy'],
      elitePool: ['plaguedoc'],
      bossId: 'eyehorror',
      bossPool: ['eyehorror', 'mummyking', 'croc', 'slimeking'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '窄长的墓道里缠尸卫士排成阵列，火烛无风自动，深处有什么东西在阴影里拖出一道长痕。'
    },

    // ---------- 第二章 · 腐化荒野 ----------
    {
      id: 'ashlands', act: 2, name: '灰烬荒原',
      subtitle: '烈焰与黑鸦', ilvl: 6, reqLevel: 12,
      waves: [8, 10],
      pool: ['cinderraven', 'candle', 'emberdrake', 'boneknight', 'cowlbandit', 'beetle', 'urchin'],
      elitePool: ['warlock'],
      bossId: 'cauldron',
      bossPool: ['cauldron', 'golem', 'blueogre', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '灰烬没到脚踝，赤棘龙在余烬中穿行，远处的药汤一直在翻滚，冒出紫色气泡。'
    },
    {
      id: 'abyss', act: 2, name: '腐化深渊',
      subtitle: '精英与首领', ilvl: 7, reqLevel: 15,
      waves: [8, 11],
      pool: ['boneknight', 'mistwalker', 'frostwolf', 'pumpkin', 'frostslime', 'musketeer', 'beetle', 'cinderraven', 'bulwark', 'emberdrake', 'venomlisk', 'urchin'],
      elitePool: ['warlock', 'plaguedoc'],
      bossId: 'abysseye',
      bossPool: ['abysseye', 'cauldron', 'goatbrute', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '深渊的裂隙不断涌出腐化之物，裂隙另一侧有什么在注视着你，一动不动。'
    },
    {
      id: 'rift', act: 2, name: '裂隙回廊',
      subtitle: '空间错位', ilvl: 8, reqLevel: 17,
      waves: [8, 11],
      pool: ['boneknight', 'mistwalker', 'cinderraven', 'cowlbandit', 'urchin', 'venomlisk', 'bulwark', 'candle'],
      elitePool: ['warlock'],
      bossId: 'golem',
      bossPool: ['golem', 'blueogre', 'goatbrute', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '回廊在眼前折叠，脚下的石板翻出另一片天空，错位的尽头有巨大的影子缓缓抬头。'
    },
    {
      id: 'furnace', act: 2, name: '熔火工坊',
      subtitle: '灼热与重甲', ilvl: 9, reqLevel: 19,
      waves: [8, 11],
      pool: ['emberdrake', 'cinderraven', 'candle', 'bulwark', 'beetle', 'urchin', 'blueogre'],
      elitePool: ['warlock'],
      bossId: 'blueogre',
      bossPool: ['blueogre', 'cauldron', 'golem', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '熔炉昼夜不熄，铁背野猪的甲片被炉火烤得发亮，炉口的药汤一刻不停地翻滚。'
    },
    {
      id: 'plague', act: 2, name: '疫病巢穴',
      subtitle: '毒与腐化', ilvl: 10, reqLevel: 22,
      waves: [9, 11],
      pool: ['urchin', 'venomlisk', 'frostslime', 'beetle', 'pumpkin', 'mistwalker', 'cowlbandit', 'plaguedoc'],
      elitePool: ['plaguedoc', 'warlock'],
      bossId: 'goatbrute',
      bossPool: ['goatbrute', 'cauldron', 'blueogre', 'mushroomgun'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '巢穴里连空气都是绿的，棘刺仙人掌的尖刺上挂着毒液，蓝鳞蛇王的鳞片在暗处反光。'
    },

    // ---------- 第三章 · 黑潮之上 ----------
    {
      id: 'shipwreck', act: 3, name: '沉船海滩',
      subtitle: '潮声与劫掠', ilvl: 11, reqLevel: 24,
      waves: [9, 12],
      pool: ['deepfin', 'angler', 'musketeer', 'cowlbandit', 'fleece', 'urchin', 'piratecrab'],
      elitePool: ['plaguedoc'],
      bossId: 'piratecrab',
      bossPool: ['piratecrab', 'octoking', 'silverknight', 'mawflowerking'],
      mapStyle: 'grove',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '搁浅的船骸排成一片，海盗巨蟹在残帆间横行，游荡菌人把这里当成了他们的地盘。'
    },
    {
      id: 'tidecave', act: 3, name: '潮汐洞窟',
      subtitle: '幽蓝深水', ilvl: 12, reqLevel: 27,
      waves: [9, 12],
      pool: ['deepfin', 'angler', 'frostslime', 'mistwalker', 'urchin', 'venomlisk', 'cowlbandit'],
      elitePool: ['warlock'],
      bossId: 'octoking',
      bossPool: ['octoking', 'piratecrab', 'silverknight', 'wormking'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '潮水在洞窟里涨落，幽蓝喙兽贴着水面滑行，深处的触须在黑暗里缓慢张开。'
    },
    {
      id: 'frostkeep', act: 3, name: '霜封要塞',
      subtitle: '寒铁与誓约', ilvl: 13, reqLevel: 29,
      waves: [9, 12],
      pool: ['frostwolf', 'frostslime', 'boneknight', 'cinderraven', 'beetle', 'candle', 'mistwalker'],
      elitePool: ['plaguedoc'],
      bossId: 'silverknight',
      bossPool: ['silverknight', 'snakeking', 'octoking', 'wormking'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '要塞的旗帜冻成硬片，霜牙狼在垛口间游荡，狼人领主的爪痕刻满了整面冰墙。'
    },
    {
      id: 'sanctum', act: 3, name: '遗忘圣所',
      subtitle: '祷声与骸骨', ilvl: 14, reqLevel: 32,
      waves: [9, 12],
      pool: ['skeleton', 'boneknight', 'mistwalker', 'candle', 'cinderraven', 'beetle', 'pumpkin'],
      elitePool: ['warlock'],
      bossId: 'snakeking',
      bossPool: ['snakeking', 'silverknight', 'octoking', 'mawflowerking'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '圣所的祷声早已停歇，长明灯却还亮着，穿法袍的骸骨仍在原地重复着跪拜。'
    },
    {
      id: 'voidgate', act: 3, name: '虚空之门',
      subtitle: '暗影穿行', ilvl: 15, reqLevel: 34,
      waves: [9, 12],
      pool: ['mistwalker', 'urchin', 'venomlisk', 'cinderraven', 'bulwark', 'emberdrake', 'pumpkin'],
      elitePool: ['warlock', 'plaguedoc'],
      bossId: 'snakeking',
      bossPool: ['snakeking', 'piratecrab', 'octoking', 'wormking'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '门框里没有门，只有一片会呼吸的黑。蓝鳞蛇王盘在门框的阴影里，鳞片比黑暗更深。'
    },

    // ---------- 第四章 · 王座终局 ----------
    {
      id: 'bonehall', act: 4, name: '骸骨大殿',
      subtitle: '万骨为阶', ilvl: 16, reqLevel: 37,
      waves: [10, 13],
      pool: ['boneknight', 'skeleton', 'pumpkin', 'candle', 'beetle', 'mistwalker', 'frostslime'],
      elitePool: ['plaguedoc'],
      bossId: 'reaper',
      bossPool: ['reaper', 'crystalcrab', 'shadowdemon', 'pinkdemon'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '整座大殿由骸骨砌成，台阶是肋骨，穹顶是颅骨，幽镰收割者在最深处磨着镰刃。'
    },
    {
      id: 'emberthrone', act: 4, name: '烬火王座',
      subtitle: '余烬不熄', ilvl: 17, reqLevel: 40,
      waves: [10, 13],
      pool: ['emberdrake', 'cinderraven', 'candle', 'bulwark', 'venomlisk', 'mistwalker'],
      elitePool: ['warlock'],
      bossId: 'crystalcrab',
      bossPool: ['crystalcrab', 'hierophant', 'shadowdemon', 'pumpkinlord'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '王座下的火池从未冷却，赤棘龙的鳞片像烧红的铁，紫晶蟹王的甲壳在火池边反光。'
    },
    {
      id: 'shadowcourt', act: 4, name: '暗影回廊',
      subtitle: '影中之影', ilvl: 18, reqLevel: 43,
      waves: [10, 13],
      pool: ['mistwalker', 'cowlbandit', 'urchin', 'venomlisk', 'boneknight', 'bulwark', 'cinderraven'],
      elitePool: ['warlock'],
      bossId: 'shadowdemon',
      bossPool: ['shadowdemon', 'hierophant', 'crystalcrab', 'hornedfiend'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '回廊两侧站满石像，每一尊的影子里都多站着一个影子，尽头有什么在等你抬头。'
    },
    {
      id: 'worldscar', act: 4, name: '世界之痕',
      subtitle: '地裂天倾', ilvl: 19, reqLevel: 46,
      waves: [10, 13],
      pool: ['bulwark', 'emberdrake', 'venomlisk', 'mistwalker', 'cinderraven', 'urchin', 'boneknight', 'beetle'],
      elitePool: ['warlock', 'plaguedoc'],
      bossId: 'hierophant',
      bossPool: ['hierophant', 'shadowdemon', 'crystalcrab', 'mushroommaw'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '大地在这里裂开一道看不到底的痕，有什么从裂缝里走出，袍角还挂着别的世界。'
    },
    {
      id: 'finalgate', act: 4, name: '终焉之门',
      subtitle: '最后一战', ilvl: 20, reqLevel: 48,
      waves: [10, 14],
      pool: ['bulwark', 'emberdrake', 'venomlisk', 'mistwalker', 'cinderraven', 'urchin', 'boneknight', 'pumpkin', 'beetle'],
      elitePool: ['warlock', 'plaguedoc', 'mawflower'],
      bossId: 'reaper',
      bossPool: ['reaper', 'hierophant', 'shadowdemon', 'crystalcrab', 'pumpkinlord', 'mushroommaw'],
      mapStyle: 'abyss',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '所有腐化的尽头都收束在这扇门前，幽镰收割者守在门后，注视着走进来的每一个人。'
    }
  ];

  // 每章补足到 20 关：原有 5 关保持不动，追加 15 个主题关卡。
  // 主题：紫焰炼狱 / 蓝白雪原 / 赤红地狱 / 青绿草原 / 橘色深秋
  const EXTRA_STAGES = {
    1: [
      ['青芒草原', '草浪没膝', 'savanna', '草浪没膝，兽群在风里穿行，草叶被踩断会发出细响。'],
      ['落枫林道', '橘叶伏兵', 'autumn', '枫叶铺满小径，伏击者把自己埋进叶堆，只露出一双眼睛。'],
      ['雾嚎丘陵', '狼群低语', 'grove', '雾气沿丘陵翻涌，狼嚎从四面八方围过来，分不清远近。'],
      ['雪线林缘', '初雪寒狼', 'snowfield', '初雪压弯枝头，寒狼沿着雪线游荡，脚印很快被新雪填平。'],
      ['苔石旧道', '石缝风声', 'grove', '苔藓吞掉旧石道，只剩风穿过石缝，像有人在里面换气。'],
      ['灰枫坟场', '无人扫墓', 'autumn', '枫叶落在无名墓碑上，一层又一层，没人来扫。'],
      ['白桦低地', '游荡者营地', 'savanna', '白桦与芒草围出低地，游荡者在这里歇脚，留下半冷的火堆。'],
      ['冻土小径', '薄冰细响', 'snowfield', '薄冰在脚下裂开细响，霜从土里冒出来，贴着脚踝往上爬。'],
      ['枯叶回廊', '叶下骸骨', 'autumn', '枯叶堆到膝盖，骸骨在下面翻身，声音闷得像叹气。'],
      ['深绿腹地', '无路之林', 'grove', '密林深处没有路，只有被反复踩出来的痕，通向更密的地方。'],
      ['芒草风口', '风如刀刃', 'savanna', '风从草原尽头灌进来，草叶像刀，割在护甲上沙沙作响。'],
      ['暮色墓园', '影子移动', 'crypt', '暮色落下时，墓碑的影子开始移动，比太阳走得快。'],
      ['雪掩林道', '半埋脚印', 'snowfield', '雪把林道埋了一半，另一半留着脚印，脚印只有去没有回。'],
      ['枫火营地', '熄灭的篝火', 'autumn', '营地只剩熄掉的篝火和被翻乱的箱子，主人走得很急。'],
      ['边界哨站', '守旗无人', 'grove', '边境哨站的旗子还挂着，守旗的人不在，旗绳一直响。']
    ],
    2: [
      ['紫焰裂谷', '地缝喷火', 'inferno', '紫色火焰从地缝里喷出，风都带着焦味，呼吸像吞刀片。'],
      ['血雾洼地', '没过脚踝', 'hell', '血雾沉在洼地底部，踩进去会没过脚踝，抬脚时带起黏稠的丝。'],
      ['腐骨矿坑', '骨与矿石', 'crypt', '矿车翻倒，骨与矿石混在一起，分不清哪些是会动的东西。'],
      ['焦土林场', '黑树橘叶', 'autumn', '树烧成黑色，只有枫叶还是橘的，风一吹就落一层灰。'],
      ['炼狱风眼', '火在呼吸', 'inferno', '风眼中心很安静，安静得能听见火在呼吸，一进一出。'],
      ['赤雨沼地', '红雨落沼', 'hell', '红雨落在沼泽上，水面像被搅开的内脏，气泡一个接一个破。'],
      ['断脊峡谷', '骨缝过风', 'abyss', '峡谷像一截断掉的脊骨，风从骨缝里过，发出低沉的哨音。'],
      ['锈叶荒径', '铁锈与叶', 'autumn', '铁锈和落叶铺在一起，踩上去沙沙响，像踩碎很多小骨头。'],
      ['紫烬祭坛', '供品难辨', 'inferno', '祭坛上供着什么已经看不清，只剩紫烬，风一吹就亮一下。'],
      ['血河浅滩', '半截残旗', 'hell', '河水是红的，浅滩上插着半截旗，旗面已经没有颜色。'],
      ['灰烬兽穴', '白灰覆林', 'grove', '兽穴周围的树全白了，像落了一层灰雪，兽毛上也全是灰。'],
      ['腐化温室', '不该结果', 'crypt', '藤蔓从墓室里长出来，结着不该结的果，果皮下面是骨头。'],
      ['紫雾回廊', '火把不燃', 'inferno', '紫雾贴着地面走，火把点不着，只能靠火石擦出的火星辨路。'],
      ['血月高地', '影子过长', 'hell', '月亮是红的，高地上的影子比人长，影子的动作总慢半拍。'],
      ['荒野尽头', '更深的荒野', 'abyss', '荒野在这里断掉，前面是更深的荒野，没有边界也没有方向。']
    ],
    3: [
      ['雪潮海岸', '浪推冰回', 'snowfield', '雪落在黑潮上，浪把冰推回岸，冰里冻着看不清的东西。'],
      ['白桦渡口', '冻住的船', 'grove', '渡口的船冻在河里，白桦落满雪，船桨还保持着划动的姿势。'],
      ['潮下冰窟', '头顶潮声', 'snowfield', '冰窟里能听见潮水在头顶走，每走一步，顶上就掉一层冰屑。'],
      ['枫落海岬', '红叶入潮', 'autumn', '枫叶被海风卷过悬崖，落进黑潮，像一小片一小片的火。'],
      ['紫焰灯塔', '照不远', 'inferno', '灯塔烧着紫色的火，照不远，海面上的黑比光更厚。'],
      ['盐风草原', '灰绿草浪', 'savanna', '盐风把草吹成灰绿，兽群在远处，背上的毛结着盐晶。'],
      ['雾锁冰湖', '脚印中断', 'snowfield', '冰湖上雾不散，脚印走两步就断，断口整齐得像被切掉。'],
      ['黑潮墓园', '盐结碑面', 'crypt', '海水漫过墓园，墓碑上结了盐，名字被盐重新描了一遍。'],
      ['虚空风口', '不落之物', 'abyss', '风口对着虚空，扔进去的东西不会落地，也没有回声。'],
      ['赤叶峡湾', '水面亦红', 'autumn', '峡湾两侧全是红枫，水面也是红的，分不清哪边是天。'],
      ['雪原残堡', '缺口灌雪', 'snowfield', '残堡的墙塌了一半，雪从缺口灌进去，把大厅填成斜坡。'],
      ['紫潮祭坛', '半水半火', 'inferno', '祭坛一半泡在黑潮里，一半烧着紫火，水与火交界处冒着白汽。'],
      ['沉没林道', '树冠浮水', 'grove', '林道沉进水里，树冠还浮着，水下的路比水上更清楚。'],
      ['寒潮尽头', '风里冰晶', 'snowfield', '寒潮从尽头推过来，风里全是冰晶，睁眼就会流泪。'],
      ['黑潮之眼', '洞下潮声', 'abyss', '潮水的中心是一个洞，洞下面还有潮声，一层比一层远。']
    ],
    4: [
      ['紫烬王庭', '地砖下火', 'inferno', '王庭的地砖下还在烧，紫焰从缝里舔出来，照亮空着的王座。'],
      ['血雨长阶', '阶上淌血', 'hell', '长阶上淌着血雨，每走一步都打滑，阶缝里长着暗红的花。'],
      ['霜骨回廊', '冰里冻骨', 'snowfield', '骨头冻在冰里，走廊尽头有霜在落，落得很慢，像在等人。'],
      ['炼狱风牢', '开门即扑', 'inferno', '风牢里关着烧不完的风，门一开就往外扑，带着紫色的火星。'],
      ['赤潮深渊', '无声涨落', 'hell', '深渊底部是红色的潮，涨落没有声音，只有颜色在动。'],
      ['万骨雪原', '雪下有骨', 'snowfield', '雪下面全是骨，踩重了会陷，陷下去能听见骨与骨相碰。'],
      ['紫焰祭殿', '烧红的骨柱', 'inferno', '祭殿的柱子是烧红的骨，紫焰绕着往上爬，爬到顶就散成烟。'],
      ['血月回廊', '影子流血', 'hell', '血月从回廊的窗格里照进来，影子在地面流血，流得很慢。'],
      ['寒鸦王陵', '一动不动', 'snowfield', '寒鸦停在王陵的雪顶上，一动不动，像是在等雪把它埋掉。'],
      ['深紫裂隙', '会收缩的黑', 'inferno', '裂隙深处是紫的，看久了会觉得它在收缩，像一只缓慢合上的眼。'],
      ['血河王座', '河水很慢', 'hell', '王座立在血河中央，河水流得很慢，绕过王座时也没有声音。'],
      ['风雪绝壁', '横抽的雪', 'snowfield', '绝壁上挂着冰，风把雪横着抽过来，打在岩壁上像细小的骨裂。'],
      ['紫焰核心', '无影之火', 'inferno', '核心的温度不高，但紫色的火没有影子，站在旁边也照不出人。'],
      ['血雨终庭', '雨从未停', 'hell', '终庭的雨一直下，地面已经分不清是血还是水，靴子陷进去拔不出来。'],
      ['终焉之座', '影子皆跪', 'abyss', '座上空着，但所有影子都朝着那个方向跪，包括你自己的。']
    ]
  };

  // 每章 3 套刷怪模板轮换使用；所有 id 均已存在于怪物数据中
  const ACT_TEMPLATES = {
    1: [
      { pool: ['wolf', 'skeleton', 'mistwalker', 'pea', 'foxraider'], elitePool: ['mawflower'], bossPool: ['eyehorror', 'croc', 'mawfish', 'slimeking'] },
      { pool: ['skeleton', 'musketeer', 'pumpkin', 'slime', 'frostwolf', 'bat', 'cowlbandit', 'mummy'], elitePool: ['plaguedoc'], bossPool: ['mummyking', 'eyehorror', 'croc', 'slimeking'] },
      { pool: ['wolf', 'fleece', 'foxraider', 'cowlbandit', 'bat'], elitePool: ['mawflower', 'plaguedoc'], bossPool: ['croc', 'mummyking', 'mawfish', 'slimeking'] }
    ],
    2: [
      { pool: ['beetle', 'cinderraven', 'candle', 'urchin', 'bat'], elitePool: ['warlock'], bossPool: ['cauldron', 'golem', 'blueogre', 'mushroomgun'] },
      { pool: ['skeleton', 'boneknight', 'mistwalker', 'venomlisk', 'slime', 'urchin', 'cinderraven', 'mummy'], elitePool: ['plaguedoc'], bossPool: ['abysseye', 'goatbrute', 'cauldron', 'mushroomgun'] },
      { pool: ['wolf', 'pumpkin', 'foxraider', 'bulwark', 'deepfin'], elitePool: ['mawflower'], bossPool: ['golem', 'blueogre', 'goatbrute', 'mushroomgun'] }
    ],
    3: [
      { pool: ['deepfin', 'angler', 'urchin', 'frostslime', 'bat'], elitePool: ['warlock'], bossPool: ['piratecrab', 'octoking', 'silverknight', 'mawflowerking'] },
      { pool: ['frostwolf', 'frostslime', 'fleece', 'bulwark', 'mistwalker', 'cowlbandit', 'deepfin'], elitePool: ['plaguedoc'], bossPool: ['snakeking', 'silverknight', 'octoking', 'wormking'] },
      { pool: ['cowlbandit', 'deepfin', 'venomlisk', 'bat', 'skeleton'], elitePool: ['warlock'], bossPool: ['octoking', 'piratecrab', 'snakeking', 'wormking'] }
    ],
    4: [
      { pool: ['bulwark', 'emberdrake', 'venomlisk', 'mistwalker', 'cinderraven'], elitePool: ['warlock', 'plaguedoc'], bossPool: ['reaper', 'crystalcrab', 'hierophant', 'pinkdemon'] },
      { pool: ['boneknight', 'skeleton', 'pumpkin', 'candle', 'beetle', 'cinderraven', 'urchin', 'mummy'], elitePool: ['plaguedoc'], bossPool: ['shadowdemon', 'hierophant', 'crystalcrab', 'pumpkinlord'] },
      { pool: ['frostwolf', 'frostslime', 'fleece', 'bulwark', 'wolf', 'emberdrake', 'cinderraven'], elitePool: ['warlock'], bossPool: ['crystalcrab', 'reaper', 'shadowdemon', 'hornedfiend', 'mushroommaw'] }
    ]
  };
  // 追加关卡的临时强度上限（随后会按 80 关统一重排为单调曲线）
  const ACT_CAP = {
    1: { ilvl: 10, reqLevel: 20 },
    2: { ilvl: 15, reqLevel: 30 },
    3: { ilvl: 20, reqLevel: 42 },
    4: { ilvl: 25, reqLevel: 58 }
  };
  const byAct = { 1: [], 2: [], 3: [], 4: [] };
  DG.data.dungeons.forEach(d => byAct[d.act].push(d));
  for (const act of [1, 2, 3, 4]) {
    const list = byAct[act];
    const prev = list[list.length - 1];
    const cap = ACT_CAP[act];
    const rows = EXTRA_STAGES[act];
    rows.forEach((row, j) => {
      const t = (j + 1) / rows.length;
      const ilvl = Math.min(cap.ilvl, Math.round(prev.ilvl + (cap.ilvl - prev.ilvl) * t));
      const reqLevel = Math.min(cap.reqLevel, Math.round(prev.reqLevel + (cap.reqLevel - prev.reqLevel) * t));
      const tpl = ACT_TEMPLATES[act][j % ACT_TEMPLATES[act].length];
      list.push({
        id: `act${act}-lv${j + 6}`, act, name: row[0], subtitle: row[1],
        ilvl, reqLevel,
        waves: [7 + Math.floor(ilvl / 5), 9 + Math.floor(ilvl / 5)],
        pool: tpl.pool.slice(),
        elitePool: tpl.elitePool.slice(),
        bossId: tpl.bossPool[j % tpl.bossPool.length],
        bossPool: tpl.bossPool.slice(),
        mapStyle: row[2],
        map: { minRooms: 8, maxRooms: 11 },
        desc: row[3]
      });
    });
  }
  DG.data.dungeons = [].concat(byAct[1], byAct[2], byAct[3], byAct[4]);
  // 80 关统一重排强度与门槛：保证整条主线单调递增，
  // 最终关 ilvl 25 / 推荐等级 58，与等级上限 60 对齐
  const span = Math.max(1, DG.data.dungeons.length - 1);
  DG.data.dungeons.forEach((d, i) => {
    d.ilvl = 1 + Math.round(i * 24 / span);
    d.reqLevel = 1 + Math.round(i * 57 / span);
  });

  // 关卡索引与章节索引，供 UI 与解锁判断快速使用
  DG.data.dungeonById = {};
  DG.data.dungeons.forEach((d, i) => {
    d.index = i + 1;
    d.actName = (DG.data.acts[d.act - 1] || {}).name || '';
    DG.data.dungeonById[d.id] = d;
  });

  // 首领投放：每章按固定顺序轮换已拆件重做的首领，逐关穿插，
  // 保证相邻关卡不会出现同一个首领，也不会出现连续多关只有一个首领的情况。
  // 首领名与新版拆件美术一一对应（见 js/data/monsters/bosses.js）。
  const BOSS_ROTATION = {
    1: ['mummyking', 'croc', 'eyehorror'],
    2: ['golem', 'mushroomgun', 'goatbrute', 'cauldron'],
    3: ['octoking', 'mawflowerking', 'crystalcrab', 'mummyking'],
    4: ['reaper', 'crystalcrab', 'pinkdemon', 'pumpkinlord']
  };
  const actCursor = {};
  DG.data.dungeons.forEach((d) => {
    const rot = BOSS_ROTATION[d.act];
    if (!rot || !rot.length) return;
    const k = actCursor[d.act] || 0;
    actCursor[d.act] = k + 1;
    const boss = rot[k % rot.length];
    d.bossId = boss;
    // 首领池只保留本关首领，避免旧配置继续被随机逻辑选中
    d.bossPool = [boss];
  });

  // 关卡解锁：等级达标 + 通关上一关
  // 最远通关进度：返回已通关关卡在全局列表中的最大下标，没有通关过返回 -1
  DG.data.progressIndex = function (char) {
    if (!char || !char.cleared) return -1;
    let max = -1;
    const list = DG.data.dungeons;
    for (let i = 0; i < list.length; i++) {
      if (char.cleared[list[i].id]) max = i;
    }
    return max;
  };

  // 解锁规则：进度之前的关卡一律视为已开启（连续前缀）。
  // 只要上一关已通关，下一关（含跨章的第一关）立即开放，等级只作为推荐值展示；
  // 等级门槛仅在「上一关尚未通关」时兜底，避免经验曲线调整或旧存档造成
  // 「已经通关却被等级卡在下一章」的死锁。
  DG.data.stageUnlocked = function (char, def) {
    if (!char || !def) return false;
    const idx = DG.data.dungeons.indexOf(def);
    if (idx < 0) return false;
    const max = DG.data.progressIndex(char);
    if (idx <= max) return true;
    const prev = DG.data.dungeons[idx - 1];
    if (prev && char.cleared && char.cleared[prev.id]) return true;
    if (idx > max + 1) return false;
    return char.level >= (def.reqLevel || 1);
  };

  DG.data.nextStage = function (id) {
    const idx = DG.data.dungeons.findIndex(d => d.id === id);
    return idx >= 0 ? DG.data.dungeons[idx + 1] || null : null;
  };

  // 关卡难度曲线：怪物数量完全不改，只重排数值成长与首领节奏。
  // 设计目标：
  //   1. 新号前 10 关击杀干脆、挨打不疼，第一只首领 20 秒内能打完；
  //   2. 中期平滑抬升，让装备与技能开始接管强度；
  //   3. 后期伤害二次增长，保留精英/首领的压迫感，避免变成无脑割草。
  DG.data.stageTuning = function (def) {
    const list = DG.data.dungeons || [];
    const idx = Math.max(1, (def && def.index) || (list.indexOf(def) + 1) || 1);
    const n = Math.max(1, list.length);
    const p = Math.min(1, (idx - 1) / Math.max(1, n - 1));
    const ilvl = Math.max(1, (def && def.ilvl) || 1);
    const q = ilvl - 1;
    // 新手保护：前 11 关逐级减弱，之后完全消失
    const rookie = Math.max(0, 1 - (idx - 1) / 11);
    return {
      index: idx,
      progress: p,
      rookie,
      // 小怪：血量增长放缓；伤害前期低、后期重新变陡
      mobHp: (1 + q * 0.26 + q * q * 0.003) * (1 - rookie * 0.12),
      mobDmg: (1 + q * 0.16 + q * q * 0.006) * (1 - rookie * 0.22),
      // 首领：血量单独走更缓的曲线，缩短单场首领耗时；伤害保留后期压力
      bossHp: (1 + q * 0.14 + q * q * 0.0035) * (1 - rookie * 0.3),
      bossDmg: (1 + q * 0.14 + q * q * 0.006) * (1 - rookie * 0.2),
      // 精英：前期更轻、出现率略低，后期回到原来的威胁（怪物总数不变）
      eliteHp: 1.45 + 0.75 * p,
      eliteDmg: 1.28 + 0.12 * p,
      eliteChance: 0.2 + 0.12 * p,
      randomElite: 0.05 + 0.04 * p,
      // 经验：让新号正常推图就能跟上技能解锁与推荐等级
      xp: (1 + q * 0.18) * (1 + rookie * 0.35)
    };
  };
})();
