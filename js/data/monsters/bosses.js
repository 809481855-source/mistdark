/* 怪物模块 · 首领与召唤物映射 */
(function () {
  const DG = window.DG;
  Object.assign(DG.data.monsters, {
    eyehorror: {
      id: 'eyehorror', name: '噬人魔典', art: 'eyehorror', artScale: 1,
      shape: 'hex', color: '#8a6a4a', r: 40,
      hp: 520, dmg: 16, speed: 56, attackRange: 108, attackCd: 2.2,
      xp: 120, gold: [60, 90], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '触须横扫', range: 195, windup: 0.75, recover: 0.5, cd: 4.5,
          radius: 168, arc: 2.5, dmgMul: 1.05, color: '#b06be0'
        },
        {
          type: 'beam', label: '凝视射线', range: 520, windup: 1.0, recover: 0.5, cd: 7.0,
          width: 34, dmgMul: 1.25, color: '#ff5f5f'
        },
        {
          type: 'summon', label: '迷雾低语', windup: 0.7, recover: 0.5, cd: 13,
          minion: 'wolf', count: 2, color: '#9b7bd0'
        }
      ]
    },

    /* 首领 · 幽镰收割者：勾魂镰 + 影遁收割 + 亡魂弹幕 */
    reaper: {
      id: 'reaper', name: '幽镰收割者', art: 'reaper', artScale: 1,
      shape: 'hex', color: '#6b5a8e', r: 40,
      hp: 900, dmg: 23, speed: 78, attackRange: 112, attackCd: 1.8,
      xp: 200, gold: [110, 160], boss: true, preferRange: 110,
      patterns: [
        {
          type: 'slash', label: '勾魂镰', range: 175, windup: 0.6, recover: 0.45, cd: 3.8,
          radius: 152, arc: 2.2, dmgMul: 1.1, color: '#b76be0'
        },
        {
          type: 'blink', label: '影遁收割', range: 900, windup: 0.55, recover: 0.6, cd: 8.5,
          radius: 152, arc: 2.4, dmgMul: 1.0, color: '#8f5ed0'
        },
        {
          type: 'fan', label: '亡魂弹幕', range: 620, windup: 0.75, recover: 0.5, cd: 5.5,
          count: 5, spread: 0.62, projSpeed: 230, dmgMul: 0.7, color: '#a97be0'
        },
        {
          type: 'summon', label: '亡者应召', windup: 0.8, recover: 0.5, cd: 14,
          minion: 'skeleton', count: 2, color: '#8f7fc0'
        }
      ]
    },

    /* 首领 · 深渊之瞳：噬瞳之眼的高阶形态（复用贴图 + 暗红染色） */
    abysseye: {
      id: 'abysseye', name: '暗渊史莱姆', art: 'abysseye', artScale: 1.14,
      glow: '#e0556a',
      shape: 'hex', color: '#2f3a44', r: 46,
      hp: 1500, dmg: 30, speed: 62, attackRange: 122, attackCd: 2.0,
      xp: 330, gold: [180, 260], boss: true, preferRange: 165,
      patterns: [
        {
          type: 'arc', label: '深渊触须', range: 215, windup: 0.7, recover: 0.5, cd: 4.0,
          radius: 188, arc: 2.8, dmgMul: 1.15, color: '#e0609a'
        },
        {
          type: 'beam', label: '湮灭凝视', range: 620, windup: 0.9, recover: 0.5, cd: 6.0,
          width: 44, dmgMul: 1.35, color: '#ff4d5e'
        },
        {
          type: 'fan', label: '腐化喷吐', range: 560, windup: 0.7, recover: 0.5, cd: 5.2,
          count: 7, spread: 0.9, projSpeed: 215, dmgMul: 0.7, color: '#d06fa8'
        },
        {
          type: 'summon', label: '深渊呼唤', windup: 0.8, recover: 0.5, cd: 12,
          minion: 'mistwalker', count: 3, color: '#c07bb8'
        }
      ]
    },

    /* 首领批次一 · 腐沼獠兽：巨尾横扫 / 腐蚀吐息 / 沼底潜袭 / 泥沼孵化 */
    croc: {
      id: 'croc', name: '腐沼獠兽', art: 'croc', artScale: 1,
      shape: 'hex', color: '#5f8f52', r: 44,
      hp: 780, dmg: 21, speed: 66, attackRange: 120, attackCd: 2.0,
      xp: 180, gold: [90, 140], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '巨尾横扫', range: 200, windup: 0.65, recover: 0.5, cd: 4.2,
          radius: 190, arc: 2.6, dmgMul: 1.1, color: '#9fd07a', fx: 'crocWave'
        },
        {
          type: 'beam', label: '腐蚀吐息', range: 500, windup: 0.9, recover: 0.5, cd: 6.5,
          width: 40, dmgMul: 1.2, color: '#a8d96b'
        },
        {
          type: 'blink', label: '沼底潜袭', range: 900, windup: 0.55, recover: 0.6, cd: 9,
          radius: 168, arc: 2.4, dmgMul: 1.0, color: '#7fae6a'
        },
        {
          type: 'summon', label: '泥沼孵化', windup: 0.8, recover: 0.5, cd: 14,
          minion: 'pea', count: 2, color: '#9bcf7a'
        }
      ]
    },

    /* 首领批次一 · 深渊主教：虚空弹幕 / 湮灭凝视 / 深渊之握 / 信徒应召 */
    hierophant: {
      id: 'hierophant', name: '深渊主教', art: 'hierophant', artScale: 1,
      shape: 'hex', color: '#6a4a8f', r: 42,
      hp: 1350, dmg: 27, speed: 58, attackRange: 130, attackCd: 2.0,
      xp: 300, gold: [160, 230], boss: true, preferRange: 190,
      patterns: [
        {
          type: 'fan', label: '虚空弹幕', range: 620, windup: 0.75, recover: 0.5, cd: 5.0,
          count: 7, spread: 0.72, projSpeed: 225, dmgMul: 0.72, color: '#c07be0'
        },
        {
          type: 'beam', label: '湮灭凝视', range: 640, windup: 0.95, recover: 0.55, cd: 6.8,
          width: 46, dmgMul: 1.3, color: '#e055d0'
        },
        {
          type: 'arc', label: '深渊之握', range: 210, windup: 0.6, recover: 0.5, cd: 4.4,
          radius: 196, arc: 2.9, dmgMul: 1.15, color: '#a45fe0', fx: 'voidNova'
        },
        {
          type: 'summon', label: '信徒应召', windup: 0.85, recover: 0.5, cd: 13,
          minion: 'mistwalker', count: 3, color: '#b07ad8'
        }
      ]
    },

    /* 首领批次二 · 灰发女妖：灰发横扫 / 诅咒凝视 / 影中潜行 / 亡者应召 */
    mummyking: {
      id: 'mummyking', name: '灰发女妖', art: 'mummyking', artScale: 1,
      shape: 'hex', color: '#9aa4ac', r: 42,
      hp: 980, dmg: 22, speed: 62, attackRange: 118, attackCd: 2.0,
      xp: 220, gold: [110, 170], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '灰发横扫', range: 195, windup: 0.6, recover: 0.5, cd: 4.0,
          radius: 186, arc: 2.5, dmgMul: 1.05, color: '#d9c9a0', fx: 'crocWave'
        },
        {
          type: 'beam', label: '诅咒凝视', range: 560, windup: 0.85, recover: 0.5, cd: 6.2,
          width: 38, dmgMul: 1.15, color: '#9fd8c0'
        },
        {
          type: 'blink', label: '影中潜行', range: 900, windup: 0.5, recover: 0.6, cd: 8.5,
          radius: 152, arc: 2.2, dmgMul: 1.0, color: '#c9b98c'
        },
        {
          type: 'summon', label: '亡者应召', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'skeleton', count: 2, color: '#d8cfae'
        }
      ]
    },

    /* 首领批次二 · 触手蠕虫王：触须横扫 / 深渊墨弹 / 蚀骨毒液 / 虫群唤潮 */
    octoking: {
      id: 'octoking', name: '触手蠕虫王', art: 'octoking', artScale: 1,
      shape: 'hex', color: '#8a5fb0', r: 46,
      hp: 1600, dmg: 28, speed: 56, attackRange: 132, attackCd: 2.0,
      xp: 340, gold: [180, 260], boss: true, preferRange: 175,
      patterns: [
        {
          type: 'arc', label: '触须横扫', range: 215, windup: 0.6, recover: 0.5, cd: 4.6,
          radius: 208, arc: 2.9, dmgMul: 1.1, color: '#5f9fe0', fx: 'voidNova'
        },
        {
          type: 'fan', label: '深渊墨弹', range: 640, windup: 0.8, recover: 0.5, cd: 5.4,
          count: 9, spread: 0.95, projSpeed: 208, dmgMul: 0.68, color: '#7fb8f0'
        },
        {
          type: 'beam', label: '蚀骨毒液', range: 600, windup: 1.0, recover: 0.55, cd: 7.0,
          width: 44, dmgMul: 1.25, color: '#5fd8d0'
        },
        {
          type: 'summon', label: '虫群唤潮', windup: 0.85, recover: 0.5, cd: 13,
          minion: 'bat', count: 3, color: '#8fc4ea'
        }
      ]
    },

    /* ===== 首领批次三 · 图鉴裁切贴图 ===== */

    /* 海盗巨蟹：弯刀横斩 / 巨螯夹击 / 散落弹片 / 招潮蟹群 */
    piratecrab: {
      id: 'piratecrab', name: '海盗巨蟹', art: 'piratecrab', artScale: 1,
      shape: 'hex', color: '#3f8f96', r: 42,
      hp: 640, dmg: 19, speed: 72, attackRange: 116, attackCd: 2.0,
      xp: 140, gold: [70, 105], boss: true, preferRange: 130,
      patterns: [
        {
          type: 'arc', label: '弯刀横斩', range: 190, windup: 0.6, recover: 0.5, cd: 3.9,
          radius: 178, arc: 2.4, dmgMul: 1.05, color: '#7fd0d8'
        },
        {
          type: 'arc', label: '巨螯夹击', range: 176, windup: 0.5, recover: 0.45, cd: 4.6,
          radius: 152, arc: 1.5, dmgMul: 1.25, color: '#5fb8c8'
        },
        {
          type: 'fan', label: '散落弹片', range: 480, windup: 0.7, recover: 0.5, cd: 5.4,
          count: 5, spread: 0.8, projSpeed: 235, dmgMul: 0.65, color: '#a8e8e0'
        },
        {
          type: 'summon', label: '招潮蟹群', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'deepfin', count: 2, color: '#8fd8d0'
        }
      ]
    },

    /* 血口刺兽：噬咬 / 腥红吐息 / 潜游突袭 / 鱼群 */
    mawfish: {
      id: 'mawfish', name: '血口刺兽', art: 'mawfish', artScale: 1,
      shape: 'hex', color: '#b0474f', r: 41,
      hp: 560, dmg: 18, speed: 86, attackRange: 112, attackCd: 2.0,
      xp: 130, gold: [65, 100], boss: true, preferRange: 120,
      patterns: [
        {
          type: 'arc', label: '血盆噬咬', range: 180, windup: 0.5, recover: 0.45, cd: 3.6,
          radius: 152, arc: 1.7, dmgMul: 1.15, color: '#e0666a'
        },
        {
          type: 'beam', label: '腥红吐息', range: 480, windup: 0.8, recover: 0.5, cd: 6.0,
          width: 34, dmgMul: 1.1, color: '#ff6a6a'
        },
        {
          type: 'blink', label: '潜游突袭', range: 900, windup: 0.5, recover: 0.6, cd: 8.5,
          radius: 150, arc: 2.2, dmgMul: 1.0, color: '#c0506a'
        },
        {
          type: 'summon', label: '鱼群涌至', windup: 0.8, recover: 0.5, cd: 12.5,
          minion: 'deepfin', count: 3, color: '#e08a8a'
        }
      ]
    },

    /* 巨剑恶魔：裂地重斩 / 獠牙横扫 / 战吼震荡 / 野猪群 */
    goatbrute: {
      id: 'goatbrute', name: '巨剑恶魔', art: 'goatbrute', artScale: 1,
      shape: 'hex', color: '#7a5a7a', r: 42,
      hp: 720, dmg: 21, speed: 88, attackRange: 118, attackCd: 2.0,
      xp: 150, gold: [75, 110], boss: true, preferRange: 125,
      patterns: [
        {
          type: 'slash', label: '裂地重斩', range: 200, windup: 0.7, recover: 0.5, cd: 4.2,
          radius: 186, arc: 2.2, dmgMul: 1.2, color: '#c9a0e0'
        },
        {
          type: 'arc', label: '獠牙横扫', range: 186, windup: 0.55, recover: 0.45, cd: 3.8,
          radius: 176, arc: 2.6, dmgMul: 1.0, color: '#a98fd0'
        },
        {
          type: 'fan', label: '战吼震荡', range: 460, windup: 0.7, recover: 0.5, cd: 6.2,
          count: 5, spread: 0.7, projSpeed: 210, dmgMul: 0.6, color: '#c8b0e8'
        },
        {
          type: 'summon', label: '野猪群', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'bulwark', count: 2, color: '#c8b0e8'
        }
      ]
    },

    /* 狼人领主：裂肉利爪 / 血月咆哮 / 狼影突进 / 狼群 */
    silverknight: {
      id: 'silverknight', name: '狼人领主', art: 'silverknight', artScale: 1,
      shape: 'hex', color: '#7a6a62', r: 42,
      hp: 980, dmg: 24, speed: 76, attackRange: 120, attackCd: 2.0,
      xp: 220, gold: [120, 175], boss: true, preferRange: 125,
      patterns: [
        {
          type: 'slash', label: '裂肉利爪', range: 205, windup: 0.55, recover: 0.45, cd: 3.8,
          radius: 190, arc: 2.3, dmgMul: 1.15, color: '#cfe0f0'
        },
        {
          type: 'beam', label: '血月咆哮', range: 560, windup: 0.9, recover: 0.5, cd: 6.4,
          width: 38, dmgMul: 1.2, color: '#ff8a8a'
        },
        {
          type: 'blink', label: '狼影突进', range: 900, windup: 0.5, recover: 0.6, cd: 8.8,
          radius: 160, arc: 2.3, dmgMul: 1.05, color: '#9fb8d8'
        },
        {
          type: 'summon', label: '狼群', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'wolf', count: 2, color: '#c9d6e6'
        }
      ]
    },

    /* 魔锅骑士：沸火弹 / 熔金射线 / 护盾爆发 / 炉渣爬虫 */
    cauldron: {
      id: 'cauldron', name: '魔锅骑士', art: 'cauldron', artScale: 1,
      shape: 'hex', color: '#4a4f8f', r: 42,
      hp: 880, dmg: 22, speed: 56, attackRange: 124, attackCd: 2.0,
      xp: 210, gold: [115, 170], boss: true, preferRange: 190,
      patterns: [
        {
          type: 'fan', label: '沸火弹', range: 600, windup: 0.75, recover: 0.5, cd: 5.0,
          count: 7, spread: 0.85, projSpeed: 220, dmgMul: 0.7, color: '#ffa54a'
        },
        {
          type: 'beam', label: '熔金射线', range: 600, windup: 1.0, recover: 0.55, cd: 6.8,
          width: 42, dmgMul: 1.3, color: '#ffcf7a'
        },
        {
          type: 'arc', label: '护盾爆发', range: 190, windup: 0.65, recover: 0.5, cd: 4.6,
          radius: 178, arc: 2.9, dmgMul: 1.1, color: '#ff8a3c', fx: 'voidNova'
        },
        {
          type: 'summon', label: '炉渣爬虫', windup: 0.8, recover: 0.5, cd: 13.5,
          minion: 'beetle', count: 2, color: '#ffb066'
        }
      ]
    },

    /* 蓝鳞蛇王：毒颚撕咬 / 鳞毒喷散 / 盘身扫尾 / 毒蛇从属 */
    snakeking: {
      id: 'snakeking', name: '蓝鳞蛇王', art: 'snakeking', artScale: 1,
      shape: 'hex', color: '#3f7f96', r: 43,
      hp: 1050, dmg: 25, speed: 70, attackRange: 120, attackCd: 2.0,
      xp: 250, gold: [135, 195], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '毒颚撕咬', range: 195, windup: 0.55, recover: 0.45, cd: 3.6,
          radius: 172, arc: 1.9, dmgMul: 1.2, color: '#5fc8d8'
        },
        {
          type: 'fan', label: '鳞毒喷散', range: 520, windup: 0.7, recover: 0.5, cd: 5.2,
          count: 7, spread: 0.9, projSpeed: 215, dmgMul: 0.68, color: '#7fe0c8'
        },
        {
          type: 'arc', label: '盘身扫尾', range: 206, windup: 0.65, recover: 0.5, cd: 4.4,
          radius: 200, arc: 2.9, dmgMul: 1.05, color: '#5fa0d0'
        },
        {
          type: 'summon', label: '毒蛇从属', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'venomlisk', count: 2, color: '#7fd8d0'
        }
      ]
    },

    /* 紫晶蟹王：晶钳夹击 / 晶棱折射 / 碎晶迸射 / 晶簇幼体 */
    crystalcrab: {
      id: 'crystalcrab', name: '紫晶蟹王', art: 'crystalcrab', artScale: 1,
      shape: 'hex', color: '#7a4f9e', r: 44,
      hp: 1320, dmg: 27, speed: 60, attackRange: 126, attackCd: 2.0,
      xp: 300, gold: [175, 250], boss: true, preferRange: 165,
      patterns: [
        {
          type: 'arc', label: '晶钳夹击', range: 205, windup: 0.6, recover: 0.5, cd: 4.0,
          radius: 190, arc: 1.8, dmgMul: 1.2, color: '#c080f0'
        },
        {
          type: 'beam', label: '晶棱折射', range: 600, windup: 0.95, recover: 0.55, cd: 6.6,
          width: 42, dmgMul: 1.25, color: '#d8a0ff'
        },
        {
          type: 'fan', label: '碎晶迸射', range: 600, windup: 0.8, recover: 0.5, cd: 5.4,
          count: 9, spread: 1.0, projSpeed: 225, dmgMul: 0.7, color: '#b877e0'
        },
        {
          type: 'summon', label: '晶簇幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'urchin', count: 3, color: '#c88ff0'
        }
      ]
    },

    /* 暗角魔：暗爪横扫 / 腐化凝视 / 影匿扑袭 / 暗影仆从 */
    shadowdemon: {
      id: 'shadowdemon', name: '暗角魔', art: 'shadowdemon', artScale: 1,
      shape: 'hex', color: '#8a3a4a', r: 44,
      hp: 1420, dmg: 29, speed: 74, attackRange: 124, attackCd: 2.0,
      xp: 320, gold: [185, 265], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '暗爪横扫', range: 200, windup: 0.55, recover: 0.45, cd: 3.9,
          radius: 186, arc: 2.7, dmgMul: 1.15, color: '#ff5a6a'
        },
        {
          type: 'beam', label: '腐化凝视', range: 580, windup: 0.85, recover: 0.5, cd: 6.2,
          width: 40, dmgMul: 1.25, color: '#e0556a'
        },
        {
          type: 'blink', label: '影匿扑袭', range: 900, windup: 0.5, recover: 0.6, cd: 8.2,
          radius: 166, arc: 2.5, dmgMul: 1.05, color: '#8a3a4a'
        },
        {
          type: 'summon', label: '暗影仆从', windup: 0.8, recover: 0.5, cd: 12.5,
          minion: 'bat', count: 3, color: '#e07080'
        }
      ]
    },

    /* 蓝毛食人魔：巨拳砸地 / 横扫骨棒 / 震地裂痕 / 食人魔走卒 */
    blueogre: {
      id: 'blueogre', name: '蓝毛食人魔', art: 'blueogre', artScale: 1,
      shape: 'hex', color: '#3f6fa0', r: 46,
      hp: 1580, dmg: 31, speed: 66, attackRange: 130, attackCd: 2.0,
      xp: 340, gold: [200, 280], boss: true, preferRange: 135,
      patterns: [
        {
          type: 'arc', label: '巨拳砸地', range: 210, windup: 0.75, recover: 0.5, cd: 4.6,
          radius: 200, arc: 2.9, dmgMul: 1.3, color: '#6fb0e0', fx: 'voidNova'
        },
        {
          type: 'arc', label: '横扫骨棒', range: 200, windup: 0.6, recover: 0.5, cd: 4.0,
          radius: 188, arc: 2.4, dmgMul: 1.1, color: '#8fc8f0'
        },
        {
          type: 'beam', label: '震地裂痕', range: 520, windup: 0.9, recover: 0.55, cd: 6.8,
          width: 44, dmgMul: 1.2, color: '#9fd8ff'
        },
        {
          type: 'summon', label: '食人魔走卒', windup: 0.85, recover: 0.5, cd: 14,
          minion: 'bulwark', count: 2, color: '#8fc0e8'
        }
      ]
    },

    /* 冰晶魔像：冰臂横扫 / 寒晶射线 / 碎冰齐射 / 冰卫 */
    golem: {
      id: 'golem', name: '冰晶魔像', art: 'golem', artScale: 1,
      shape: 'hex', color: '#7fc0d8', r: 46,
      hp: 1700, dmg: 30, speed: 48, attackRange: 132, attackCd: 2.0,
      xp: 360, gold: [210, 290], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '冰臂横扫', range: 215, windup: 0.8, recover: 0.5, cd: 4.8,
          radius: 205, arc: 2.8, dmgMul: 1.25, color: '#a8e0f0'
        },
        {
          type: 'beam', label: '寒晶射线', range: 560, windup: 1.05, recover: 0.55, cd: 7.0,
          width: 46, dmgMul: 1.3, color: '#8fe0ff'
        },
        {
          type: 'fan', label: '碎冰齐射', range: 560, windup: 0.8, recover: 0.5, cd: 5.6,
          count: 7, spread: 0.85, projSpeed: 205, dmgMul: 0.72, color: '#c0f0ff'
        },
        {
          type: 'summon', label: '冰卫苏醒', windup: 0.85, recover: 0.5, cd: 14.5,
          minion: 'frostslime', count: 2, color: '#c8f0ff'
        }
      ]
    },

    /* ===== 本轮新增首领（全部使用新贴图） ===== */

    /* 王冠史莱姆王：黏液压顶 / 黏液喷射 / 王冠震波 / 史莱姆分裂 */
    slimeking: {
      id: 'slimeking', name: '王冠史莱姆王', art: 'slimeking', artScale: 1,
      shape: 'hex', color: '#3f9a8f', r: 44,
      hp: 620, dmg: 18, speed: 58, attackRange: 118, attackCd: 2.0,
      xp: 150, gold: [70, 105], boss: true, preferRange: 135,
      patterns: [
        {
          type: 'arc', label: '王冠碾压', range: 195, windup: 0.7, recover: 0.5, cd: 4.2,
          radius: 185, arc: 2.5, dmgMul: 1.15, color: '#7fe0d0'
        },
        {
          type: 'beam', label: '黏液喷射', range: 520, windup: 0.9, recover: 0.5, cd: 6.4,
          width: 38, dmgMul: 1.15, color: '#5fd0c0'
        },
        {
          type: 'arc', label: '王冠震波', range: 210, windup: 0.75, recover: 0.5, cd: 5.0,
          radius: 200, arc: 2.9, dmgMul: 1.0, color: '#8fe8d8', fx: 'voidNova'
        },
        {
          type: 'summon', label: '史莱姆分裂', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'slime', count: 2, color: '#7fe0d0'
        }
      ]
    },

    /* 仙人掌枪王：六连发 / 枪火射线 / 枪托横扫 / 菌兵应召 */
    mushroomgun: {
      id: 'mushroomgun', name: '仙人掌枪王', art: 'mushroomgun', artScale: 1,
      shape: 'hex', color: '#4a6f9e', r: 40,
      hp: 860, dmg: 22, speed: 72, attackRange: 122, attackCd: 2.0,
      xp: 210, gold: [115, 170], boss: true, preferRange: 185,
      patterns: [
        {
          type: 'fan', label: '六连发', range: 620, windup: 0.7, recover: 0.5, cd: 4.8,
          count: 6, spread: 0.8, projSpeed: 260, dmgMul: 0.62, color: '#ffcf7a'
        },
        {
          type: 'beam', label: '枪火射线', range: 620, windup: 0.95, recover: 0.55, cd: 6.6,
          width: 40, dmgMul: 1.25, color: '#ffb648'
        },
        {
          type: 'arc', label: '枪托横扫', range: 180, windup: 0.5, recover: 0.45, cd: 4.6,
          radius: 160, arc: 2.0, dmgMul: 1.0, color: '#ffd88a'
        },
        {
          type: 'summon', label: '菌兵应召', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'musketeer', count: 2, color: '#ffcf7a'
        }
      ]
    },

    /* 噬人花王：藤鞭横扫 / 酸液喷吐 / 巨口吞噬 / 花藤幼体 */
    mawflowerking: {
      id: 'mawflowerking', name: '噬人花王', art: 'mawflowerking', artScale: 1,
      shape: 'hex', color: '#8a3a4a', r: 43,
      hp: 1080, dmg: 25, speed: 60, attackRange: 124, attackCd: 2.0,
      xp: 250, gold: [135, 195], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '藤鞭横扫', range: 205, windup: 0.6, recover: 0.5, cd: 3.9,
          radius: 190, arc: 2.7, dmgMul: 1.1, color: '#e05a7a'
        },
        {
          type: 'beam', label: '酸液喷吐', range: 520, windup: 0.85, recover: 0.5, cd: 6.2,
          width: 40, dmgMul: 1.2, color: '#a7e06a'
        },
        {
          type: 'arc', label: '巨口吞噬', range: 180, windup: 0.7, recover: 0.5, cd: 5.2,
          radius: 150, arc: 1.6, dmgMul: 1.35, color: '#ff7a8a'
        },
        {
          type: 'summon', label: '花藤幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'mawflower', count: 2, color: '#e08aa0'
        }
      ]
    },

    /* 腐沼巨蠕虫王：毒颚撕咬 / 腐液喷散 / 土中潜行 / 蠕虫幼体 */
    wormking: {
      id: 'wormking', name: '腐沼巨蠕虫王', art: 'wormking', artScale: 1,
      shape: 'hex', color: '#6a8f4a', r: 44,
      hp: 1150, dmg: 26, speed: 66, attackRange: 122, attackCd: 2.0,
      xp: 260, gold: [140, 200], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '毒颚撕咬', range: 195, windup: 0.55, recover: 0.45, cd: 3.7,
          radius: 172, arc: 1.9, dmgMul: 1.2, color: '#9fe08a'
        },
        {
          type: 'fan', label: '腐液喷散', range: 540, windup: 0.75, recover: 0.5, cd: 5.2,
          count: 7, spread: 0.9, projSpeed: 215, dmgMul: 0.68, color: '#7fc06a'
        },
        {
          type: 'blink', label: '土中潜行', range: 900, windup: 0.5, recover: 0.6, cd: 8.4,
          radius: 165, arc: 2.4, dmgMul: 1.0, color: '#6f9a4a'
        },
        {
          type: 'summon', label: '蠕虫幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'venomlisk', count: 2, color: '#a7e06a'
        }
      ]
    },

    /* 粉角屠夫：屠刀重斩 / 骨刃横扫 / 血刃飞散 / 角魔仆从 */
    pinkdemon: {
      id: 'pinkdemon', name: '粉角屠夫', art: 'pinkdemon', artScale: 1,
      shape: 'hex', color: '#a04a62', r: 44,
      hp: 1450, dmg: 29, speed: 80, attackRange: 124, attackCd: 2.0,
      xp: 320, gold: [185, 265], boss: true, preferRange: 135,
      patterns: [
        {
          type: 'slash', label: '屠刀重斩', range: 200, windup: 0.6, recover: 0.45, cd: 3.8,
          radius: 185, arc: 2.1, dmgMul: 1.2, color: '#ff7aa0'
        },
        {
          type: 'arc', label: '骨刃横扫', range: 195, windup: 0.55, recover: 0.45, cd: 4.2,
          radius: 185, arc: 2.7, dmgMul: 1.05, color: '#ff9ab8'
        },
        {
          type: 'fan', label: '血刃飞散', range: 560, windup: 0.7, recover: 0.5, cd: 5.4,
          count: 7, spread: 0.8, projSpeed: 240, dmgMul: 0.65, color: '#ff5a80'
        },
        {
          type: 'summon', label: '角魔仆从', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'skeleton', count: 2, color: '#ff7aa0'
        }
      ]
    },

    /* 南瓜领主：鬼火弹 / 南瓜射线 / 触须缠绕 / 烛火仆从 */
    pumpkinlord: {
      id: 'pumpkinlord', name: '南瓜领主', art: 'pumpkinlord', artScale: 1,
      shape: 'hex', color: '#8a5a3a', r: 42,
      hp: 1380, dmg: 27, speed: 56, attackRange: 126, attackCd: 2.0,
      xp: 310, gold: [180, 260], boss: true, preferRange: 185,
      patterns: [
        {
          type: 'fan', label: '鬼火弹', range: 620, windup: 0.75, recover: 0.5, cd: 5.0,
          count: 7, spread: 0.85, projSpeed: 220, dmgMul: 0.7, color: '#ff9a3c'
        },
        {
          type: 'beam', label: '南瓜射线', range: 600, windup: 0.95, recover: 0.55, cd: 6.8,
          width: 44, dmgMul: 1.3, color: '#ffb648'
        },
        {
          type: 'arc', label: '触须缠绕', range: 200, windup: 0.65, recover: 0.5, cd: 4.6,
          radius: 185, arc: 2.7, dmgMul: 1.05, color: '#d06a2a'
        },
        {
          type: 'summon', label: '烛火仆从', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'candle', count: 2, color: '#ffb648'
        }
      ]
    },

    /* 紫角魔将：角刃横扫 / 邪能射线 / 影角突袭 / 角魔从属 */
    hornedfiend: {
      id: 'hornedfiend', name: '紫角魔将', art: 'hornedfiend', artScale: 1,
      shape: 'hex', color: '#5a3f78', r: 44,
      hp: 1520, dmg: 30, speed: 72, attackRange: 124, attackCd: 2.0,
      xp: 330, gold: [195, 275], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '角刃横扫', range: 205, windup: 0.55, recover: 0.45, cd: 3.8,
          radius: 190, arc: 2.7, dmgMul: 1.15, color: '#c07ae0'
        },
        {
          type: 'beam', label: '邪能射线', range: 580, windup: 0.9, recover: 0.5, cd: 6.4,
          width: 42, dmgMul: 1.25, color: '#a45fe0'
        },
        {
          type: 'blink', label: '影角突袭', range: 900, windup: 0.5, recover: 0.6, cd: 8.2,
          radius: 165, arc: 2.4, dmgMul: 1.05, color: '#8a5ec0'
        },
        {
          type: 'summon', label: '角魔从属', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'cinderraven', count: 2, color: '#c07ae0'
        }
      ]
    },

    /* 巨帽吞噬者：巨口吞噬 / 菌盖重压 / 孢子吐息 / 孢子幼体 */
    mushroommaw: {
      id: 'mushroommaw', name: '巨帽吞噬者', art: 'mushroommaw', artScale: 1,
      shape: 'hex', color: '#7a3a3a', r: 46,
      hp: 1620, dmg: 31, speed: 50, attackRange: 130, attackCd: 2.0,
      xp: 345, gold: [205, 285], boss: true, preferRange: 145,
      patterns: [
        {
          type: 'arc', label: '巨口吞噬', range: 210, windup: 0.75, recover: 0.5, cd: 4.6,
          radius: 200, arc: 2.9, dmgMul: 1.3, color: '#d05a5a', fx: 'voidNova'
        },
        {
          type: 'arc', label: '菌盖重压', range: 205, windup: 0.65, recover: 0.5, cd: 4.2,
          radius: 190, arc: 2.4, dmgMul: 1.1, color: '#b04a4a'
        },
        {
          type: 'beam', label: '孢子吐息', range: 520, windup: 0.9, recover: 0.55, cd: 6.6,
          width: 44, dmgMul: 1.2, color: '#a7e06a'
        },
        {
          type: 'summon', label: '孢子幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'cowlbandit', count: 2, color: '#d08a6a'
        }
      ]
    }
  });
  // 首领会召唤的小怪（未在攻击模组里指定时的兜底）
  Object.assign(DG.data.bossMinions, {
    eyehorror: 'wolf',
    reaper: 'skeleton',
    abysseye: 'mistwalker',
    croc: 'pea',
    hierophant: 'mistwalker',
    mummyking: 'skeleton',
    octoking: 'bat',
    piratecrab: 'deepfin',
    mawfish: 'deepfin',
    goatbrute: 'bulwark',
    silverknight: 'wolf',
    cauldron: 'beetle',
    snakeking: 'venomlisk',
    crystalcrab: 'urchin',
    shadowdemon: 'bat',
    blueogre: 'bulwark',
    golem: 'frostslime',
    slimeking: 'slime',
    mushroomgun: 'musketeer',
    mawflowerking: 'mawflower',
    wormking: 'venomlisk',
    pinkdemon: 'skeleton',
    pumpkinlord: 'candle',
    hornedfiend: 'cinderraven',
    mushroommaw: 'cowlbandit'
  });
})();
