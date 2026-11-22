/* 美术 · 首领：两张设定图 + 程序化待机 / 蓄力 / 出手 / 受击表现
 * 用法：DG.art.bosses.draw(ctx, monster, { t, cast })
 *   ctx 已平移到首领中心；内部按“底部贴地”锚定绘制。
 * 所有贴图在首次加载后缓存为离屏画布，并额外缓存白色受击剪影与染色版本，
 * 运行时只做 drawImage，避免逐帧滤镜与像素操作。
 */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};
  const PI2 = Math.PI * 2;
  // 暗黑调色：贴图首领加载时烘焙暗色版本
  const DARK_FILTER_TEX = 'saturate(0.62) brightness(0.84) contrast(1.26) hue-rotate(-6deg)';

  // 25 位首领全部使用本轮新贴图（一一对应，无复用 / 无染色）
  const DEFS = {
    slimeking: { src: 'assets/bosses/slimeking.png', height: 250, kind: 'golem', glow: '#5fd0c0' },
    reaper: { parts: 'reaper', height: 260, kind: 'reaper', glow: '#8b5fd6' },
    goatbrute: { parts: 'goatbrute', height: 244, kind: 'goat', glow: '#c07be0' },
    mawfish: { src: 'assets/bosses/mawfish.png', height: 240, kind: 'maw', glow: '#e0666a' },
    croc: { parts: 'croc', height: 236, kind: 'croc', glow: '#93d47a' },
    mushroomgun: { parts: 'cactus', height: 240, kind: 'hierophant', glow: '#ffcf7a' },
    golem: { parts: 'icegolem', height: 264, kind: 'golem', glow: '#7fd8f0' },
    eyehorror: { parts: 'grimoire', height: 244, kind: 'eye', glow: '#f0d060' },
    mawflowerking: { parts: 'flowerking', height: 250, kind: 'maw', glow: '#e05a7a' },
    cauldron: { parts: 'potknight', height: 240, kind: 'cauldron', glow: '#ffa54a' },
    crystalcrab: { parts: 'crystalcrab', height: 232, kind: 'crystal', glow: '#b877e0' },
    pinkdemon: { parts: 'pinkdemon', height: 244, kind: 'demon', glow: '#ff7aa0' },
    pumpkinlord: { parts: 'pumpkinlord', height: 248, kind: 'cauldron', glow: '#ff9a3c' },
    octoking: { parts: 'octowing', height: 252, kind: 'octo', glow: '#b07ae0' },
    mummyking: { parts: 'banshee', height: 238, kind: 'mummy', glow: '#b8c0c8' },
    blueogre: { src: 'assets/bosses/blueogre.png', height: 262, kind: 'ogre', glow: '#6fb0e0' },
    hornedfiend: { src: 'assets/bosses/hornedfiend.png', height: 250, kind: 'demon', glow: '#c07ae0' },
    snakeking: { src: 'assets/bosses/snakeking.png', height: 256, kind: 'snake', glow: '#5fc8d8' },
    mushroommaw: { src: 'assets/bosses/mushroommaw.png', height: 252, kind: 'ogre', glow: '#d05a5a' },
    shadowdemon: { src: 'assets/bosses/shadowdemon.png', height: 238, kind: 'demon', glow: '#e0556a' },
    hierophant: { src: 'assets/bosses/hierophant.png', height: 252, kind: 'hierophant', glow: '#b46be0' },
    abysseye: { src: 'assets/bosses/abysseye.png', height: 246, kind: 'eye', glow: '#e0556a' },
    wormking: { src: 'assets/bosses/wormking.png', height: 250, kind: 'snake', glow: '#9fe08a' },
    silverknight: { src: 'assets/bosses/silverknight.png', height: 244, kind: 'knight', glow: '#c0c8d8' },
    piratecrab: { src: 'assets/bosses/piratecrab.png', height: 232, kind: 'crab', glow: '#7fd0d8' }
  };

  // ---------- 分件首领：拆件原画 + 骨骼式待机 / 行走 / 攻击 ----------
  // 坐标全部使用 PSD 像素空间（宽×高分别为 230×188 / 224×174 / 191×143），
  // 绘制时统一缩放到首领显示高度并把脚底对齐地面，分件之间按枢轴做局部摆动。
  const PART_DIR = 'assets/bosses/_parts/';
  const BONES = {
    goatbrute: {
      w: 230, h: 188,
      srcs: ['boss_a.png'],
      parts: {
        // 双脚是连在一起的一整块（中间有布带），整体做重心左右压步，避免撕开
        feet: { src: 'boss_a.png', x: 56, y: 155, w: 46, h: 33, px: 79, py: 160 },
        body: { src: 'boss_a.png', sx: 46, x: 44, y: 97, w: 66, h: 67, px: 77, py: 160 },
        armR: { src: 'boss_a.png', sx: 112, x: 0, y: 102, w: 60, h: 84, px: 56, py: 110 },
        armL: { src: 'boss_a.png', sx: 172, x: 100, y: 132, w: 42, h: 48, px: 121, py: 157 },
        weapon: { src: 'boss_a.png', sx: 214, x: 106, y: 96, w: 124, h: 84, px: 126, py: 161 },
        head: { src: 'boss_a.png', sx: 338, x: 40, y: 0, w: 116, h: 119, px: 78, py: 115 }
      },
      draw: drawGoat
    },
    reaper: {
      w: 224, h: 174,
      srcs: ['boss_b.png'],
      parts: {
        footL: { src: 'boss_b.png', x: 31, y: 158, w: 33, h: 14, sw: 33, sh: 14, px: 47, py: 160 },
        footR: { src: 'boss_b.png', x: 64, y: 158, w: 34, h: 14, sx: 33, sw: 34, sh: 14, px: 81, py: 160 },
        hand: { src: 'boss_b.png', sx: 67, x: 94, y: 105, w: 32, h: 40, px: 118, py: 136 },
        body: { src: 'boss_b.png', sx: 99, x: 3, y: 79, w: 102, h: 84, px: 55, py: 159 },
        head: { src: 'boss_b.png', sx: 201, x: 2, y: 0, w: 127, h: 103, px: 63, py: 101 },
        weapon: { src: 'boss_b.png', sx: 328, x: 110, y: 12, w: 110, h: 160, px: 122, py: 137 }
      },
      draw: drawReaper
    },
    croc: {
      w: 191, h: 143,
      srcs: ['boss_c.png'],
      parts: {
        leg0: { src: 'boss_c.png', x: 119, y: 118, w: 24, h: 25, px: 131, py: 120 },
        leg1: { src: 'boss_c.png', sx: 24, x: 92, y: 115, w: 31, h: 28, px: 107, py: 117 },
        leg2: { src: 'boss_c.png', sx: 55, x: 65, y: 116, w: 31, h: 27, px: 80, py: 118 },
        leg3: { src: 'boss_c.png', sx: 86, x: 41, y: 114, w: 28, h: 29, px: 55, py: 116 },
        body: { src: 'boss_c.png', sx: 114, x: 18, y: 0, w: 164, h: 129, px: 46, py: 118 },
        tail: { src: 'boss_c.png', sx: 278, x: 0, y: 90, w: 30, h: 21, px: 29, py: 100 },
        toothA: { src: 'boss_c.png', sx: 308, x: 170, y: 62, w: 21, h: 33, px: 180, py: 65 },
        toothB: { src: 'boss_c.png', sx: 329, x: 123, y: 64, w: 28, h: 32, px: 137, py: 67 }
      },
      draw: drawCroc
    },
    // 仙人掌枪手（boss_d 215×163）：双脚 / 双手 / 左轮 / 花帽
    cactus: {
      w: 215, h: 163,
      srcs: ['boss_d.png'],
      parts: {
        footL: { src: 'boss_d.png', sx: 66, x: 57, y: 94, w: 69, h: 69, px: 112, py: 97 },
        footR: { src: 'boss_d.png', x: 60, y: 94, w: 66, h: 68, px: 68, py: 97 },
        armR: { src: 'boss_d.png', sx: 135, x: 113, y: 85, w: 74, h: 31, px: 118, py: 101 },
        gun: { src: 'boss_d.png', sx: 209, x: 150, y: 70, w: 65, h: 45, px: 171, py: 104 },
        body: { src: 'boss_d.png', sx: 274, x: 40, y: 61, w: 97, h: 91, px: 88, py: 150 },
        armL: { src: 'boss_d.png', sx: 371, x: 0, y: 89, w: 53, h: 42, px: 49, py: 110 },
        head: { src: 'boss_d.png', sx: 424, x: 7, y: 0, w: 159, h: 68, px: 86, py: 64 }
      },
      draw: drawCactus
    },
    // 冰晶巨像（boss_e 202×155）：双脚 / 双臂 / 岩体 / 金冠
    icegolem: {
      w: 202, h: 155,
      srcs: ['boss_e.png'],
      parts: {
        footL: { src: 'boss_e.png', sx: 50, x: 39, y: 100, w: 42, h: 56, px: 60, py: 104 },
        footR: { src: 'boss_e.png', x: 114, y: 96, w: 50, h: 59, px: 139, py: 100 },
        armR: { src: 'boss_e.png', sx: 92, x: 148, y: 78, w: 54, h: 54, px: 153, py: 83 },
        body: { src: 'boss_e.png', sx: 146, x: 40, y: 13, w: 133, h: 131, px: 106, py: 142 },
        armL: { src: 'boss_e.png', sx: 279, x: 2, y: 28, w: 68, h: 115, px: 64, py: 34 },
        head: { src: 'boss_e.png', sx: 347, x: 58, y: 2, w: 98, h: 68, px: 107, py: 66 }
      },
      draw: drawIceGolem
    },
    // 魔法书（boss_f 241×153）：双翼 / 书身 / 小帽脸 / 红长舌
    grimoire: {
      w: 241, h: 153,
      srcs: ['boss_f.png'],
      parts: {
        wingL: { src: 'boss_f.png', sx: 123, x: 4, y: 17, w: 84, h: 48, px: 84, py: 30 },
        wingR: { src: 'boss_f.png', sx: 207, x: 171, y: 8, w: 69, h: 44, px: 175, py: 20 },
        body: { src: 'boss_f.png', x: 58, y: 0, w: 123, h: 135, px: 120, py: 131 },
        head: { src: 'boss_f.png', sx: 276, x: 110, y: 42, w: 44, h: 45, px: 132, py: 84 },
        tongue: { src: 'boss_f.png', sx: 320, x: 110, y: 92, w: 46, h: 60, px: 133, py: 94 }
      },
      draw: drawGrimoire
    },
    // 噬人花王（boss_g 216×177）：茎身 / 底座 / 双叶 / 巨口花头
    flowerking: {
      w: 216, h: 177,
      srcs: ['boss_g.png'],
      parts: {
        leafR: { src: 'boss_g.png', x: 124, y: 120, w: 92, h: 56, px: 128, py: 150 },
        foot: { src: 'boss_g.png', sx: 92, x: 36, y: 143, w: 54, h: 32, px: 63, py: 174 },
        leafL: { src: 'boss_g.png', sx: 146, x: 0, y: 124, w: 104, h: 44, px: 100, py: 150 },
        stem: { src: 'boss_g.png', sx: 250, x: 43, y: 80, w: 96, h: 96, px: 91, py: 176 },
        head: { src: 'boss_g.png', sx: 346, x: 44, y: 1, w: 154, h: 134, px: 121, py: 132 }
      },
      draw: drawFlowerKing
    },
    // 魔锅骑士（boss_h 205×171）：双脚 / 锅身 / 盾手 / 锅盖头 / 长矛
    potknight: {
      w: 205, h: 171,
      srcs: ['boss_h.png'],
      parts: {
        footR: { src: 'boss_h.png', x: 101, y: 111, w: 31, h: 48, px: 116, py: 115 },
        footL: { src: 'boss_h.png', sx: 31, x: 46, y: 120, w: 33, h: 39, px: 62, py: 124 },
        body: { src: 'boss_h.png', sx: 64, x: 31, y: 48, w: 115, h: 88, px: 88, py: 134 },
        shield: { src: 'boss_h.png', sx: 179, x: 1, y: 66, w: 57, h: 80, px: 52, py: 72 },
        head: { src: 'boss_h.png', sx: 236, x: 40, y: 2, w: 94, h: 60, px: 87, py: 60 },
        spear: { src: 'boss_h.png', sx: 330, x: 146, y: 10, w: 58, h: 152, px: 172, py: 100 }
      },
      draw: drawPotKnight
    },
    // 紫晶蟹王（boss_i 208×157）：四足 / 晶簇主体 / 右晶钳
    crystalcrab: {
      w: 208, h: 157,
      srcs: ['boss_i.png'],
      parts: {
        legR2: { src: 'boss_i.png', sx: 0, x: 94, y: 116, w: 51, h: 37, px: 98, py: 120 },
        legL1: { src: 'boss_i.png', sx: 51, x: 16, y: 114, w: 39, h: 38, px: 50, py: 118 },
        legL2: { src: 'boss_i.png', sx: 90, x: 53, y: 98, w: 23, h: 59, px: 74, py: 102 },
        legR1: { src: 'boss_i.png', sx: 113, x: 98, y: 103, w: 20, h: 47, px: 100, py: 106 },
        claw: { src: 'boss_i.png', sx: 133, x: 135, y: 57, w: 71, h: 75, px: 141, py: 90 },
        body: { src: 'boss_i.png', sx: 204, x: 3, y: 1, w: 161, h: 143, px: 83, py: 145 }
      },
      draw: drawCrystalCrab
    },
    // 粉角屠夫（boss_j 205×166）：肩斧 / 双脚 / 躯干 / 双臂 / 头
    pinkdemon: {
      w: 205, h: 166,
      srcs: ['boss_j.png'],
      parts: {
        axe: { src: 'boss_j.png', sx: 334, x: 16, y: 10, w: 66, h: 62, px: 76, py: 68 },
        feet: { src: 'boss_j.png', sx: 0, x: 49, y: 136, w: 97, h: 28, px: 97, py: 140 },
        body: { src: 'boss_j.png', sx: 97, x: 46, y: 48, w: 107, h: 104, px: 100, py: 148 },
        armR: { src: 'boss_j.png', sx: 272, x: 2, y: 60, w: 62, h: 74, px: 61, py: 70 },
        armL: { src: 'boss_j.png', sx: 204, x: 136, y: 72, w: 68, h: 50, px: 141, py: 90 },
        head: { src: 'boss_j.png', sx: 400, x: 82, y: 0, w: 76, h: 102, px: 120, py: 100 }
      },
      draw: drawPinkDemon
    },
    // 南瓜领主（boss_k 171×180）：双脚 / 袍身 / 两侧触手 / 南瓜头 / 顶部小手
    pumpkinlord: {
      w: 171, h: 180,
      srcs: ['boss_k.png'],
      parts: {
        footR: { src: 'boss_k.png', sx: 0, x: 87, y: 147, w: 31, h: 25, px: 100, py: 150 },
        footL: { src: 'boss_k.png', sx: 31, x: 66, y: 147, w: 21, h: 25, px: 76, py: 150 },
        tenL: { src: 'boss_k.png', sx: 52, x: 5, y: 89, w: 56, h: 76, px: 58, py: 100 },
        tenR: { src: 'boss_k.png', sx: 108, x: 125, y: 92, w: 46, h: 73, px: 128, py: 104 },
        body: { src: 'boss_k.png', sx: 154, x: 54, y: 101, w: 74, h: 59, px: 91, py: 158 },
        top: { src: 'boss_k.png', sx: 228, x: 62, y: 2, w: 70, h: 39, px: 97, py: 40 },
        head: { src: 'boss_k.png', sx: 298, x: 28, y: 28, w: 126, h: 84, px: 91, py: 110 }
      },
      draw: drawPumpkinLord
    },
    // 触手蠕虫王（boss_l 173×171）：左尾端 / 右尾段 / 分节躯干 / 上段 / 羽状触手
    octowing: {
      w: 173, h: 171,
      srcs: ['boss_l.png'],
      parts: {
        tailA: { src: 'boss_l.png', sx: 0, x: 0, y: 129, w: 84, h: 42, px: 80, py: 133 },
        tailB: { src: 'boss_l.png', sx: 84, x: 63, y: 136, w: 65, h: 35, px: 68, py: 140 },
        body: { src: 'boss_l.png', sx: 149, x: 17, y: 70, w: 112, h: 92, px: 73, py: 160 },
        torso: { src: 'boss_l.png', sx: 261, x: 16, y: 8, w: 83, h: 101, px: 58, py: 107 },
        plume: { src: 'boss_l.png', sx: 344, x: 50, y: 0, w: 123, h: 100, px: 58, py: 96 }
      },
      draw: drawOctoWorm
    },
    // 灰发女妖（boss_m 171×169）：双脚 / 躯干 / 双臂 / 长发遮面的头
    banshee: {
      w: 171, h: 169,
      srcs: ['boss_m.png'],
      parts: {
        footL: { src: 'boss_m.png', sx: 0, x: 100, y: 137, w: 30, h: 31, px: 115, py: 139 },
        footR: { src: 'boss_m.png', sx: 30, x: 49, y: 136, w: 38, h: 32, px: 68, py: 138 },
        body: { src: 'boss_m.png', sx: 68, x: 51, y: 86, w: 85, h: 73, px: 94, py: 157 },
        armL: { src: 'boss_m.png', sx: 153, x: 126, y: 101, w: 44, h: 63, px: 130, py: 105 },
        armR: { src: 'boss_m.png', sx: 197, x: 3, y: 57, w: 63, h: 107, px: 62, py: 62 },
        head: { src: 'boss_m.png', sx: 260, x: 43, y: 0, w: 108, h: 118, px: 97, py: 115 }
      },
      draw: drawHairBanshee
    }
  };

  // 绘制单件：o = { rot, x, y, px, py }，枢轴默认取分件自带的 PSD 坐标
  function part(ctx, m, bone, key, o) {
    const p = bone.parts[key];
    const s = source(PART_DIR + p.src);
    if (!s.ready) return;
    const px = (o && o.px != null) ? o.px : p.px;
    const py = (o && o.py != null) ? o.py : p.py;
    ctx.save();
    if (o && (o.rot || o.x || o.y)) {
      ctx.translate(px, py);
      if (o.rot) ctx.rotate(o.rot);
      ctx.translate(-px, -py);
    }
    if (o && (o.x || o.y)) ctx.translate(o.x || 0, o.y || 0);
    const sx = p.sx || 0, sy = p.sy || 0, sw = p.sw || p.w, sh = p.sh || p.h;
    const img = m.tint ? tinted(s, m.tint, true) : (s.dark || s.canvas);
    ctx.drawImage(img, sx, sy, sw, sh, p.x, p.y, p.w, p.h);
    if (m.flash > 0 && s.flash) {
      ctx.globalAlpha *= Math.min(0.8, m.flash / 0.16);
      ctx.drawImage(s.flash, sx, sy, sw, sh, p.x, p.y, p.w, p.h);
    }
    ctx.restore();
  }

  // 大剑恶魔：呼吸 / 走路摆臂 / 举剑过顶再下劈
  function drawGoat(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const ph = t * 9.2 + seed;
    const br = Math.sin(t * 2.1 + seed);
    const ws = a.moving ? Math.sin(ph) : 0;
    // 施法型招式只抬手不出刀，避免和吐息/弹幕特效打架
    const swing = (a.type === 'slash' || a.type === 'arc') ? 1 : 0.28;

    let bodyY = br * 1.1 + (a.moving ? Math.abs(ws) * 1.8 : 0);
    let bodyRot = br * 0.012 + (a.moving ? ws * 0.018 : 0);
    let headRot = Math.sin(t * 1.55 + seed) * 0.032 - (a.moving ? ws * 0.028 : 0);
    let headY = br * 0.5;
    let armR = Math.sin(t * 1.35 + seed) * 0.05 + (a.moving ? ws * 0.14 : 0);
    let armL = 0;
    let sword = Math.sin(t * 1.8 + seed) * 0.02 + (a.moving ? ws * 0.055 : 0);
    let lunge = 0;
    const feetY = a.moving ? -Math.abs(ws) * 1.2 : 0;
    const feetRot = a.moving ? ws * 0.04 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 2.4;
      headRot -= e * 0.1;
      headY -= e * 1.2;
      armR -= e * 0.22;
      armL -= e * 0.22;
      sword = sword * (1 - e) - 0.7 * e * swing;
      lunge = -e * 3;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.55) * Math.PI);
      bodyRot += e * 0.08;
      bodyY += e * 1.5;
      headRot += e * 0.12;
      headY += e;
      armR += e * 0.24;
      armL += e * 0.5 * swing;
      sword = -0.7 * swing + e * 1.45 * swing;
      lunge = e * 6 * swing;
    }

    part(ctx, m, bone, 'feet', { x: lunge, y: feetY, rot: feetRot });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armR', { x: lunge, y: bodyY * 0.7, rot: armR });
    part(ctx, m, bone, 'armL', { x: lunge, y: bodyY * 0.7, rot: armL * 0.5 });
    part(ctx, m, bone, 'weapon', { x: lunge, y: bodyY * 0.7, rot: sword });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY + headY, rot: headRot });
  }

  // 镰刀巫师：袍身浮动 / 小碎步 / 镰刀高举横斩
  function drawReaper(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.7 + seed);
    const ph = t * 8 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const swing = (a.type === 'slash' || a.type === 'arc') ? 1 : 0.3;

    let bodyRot = br * 0.01 + (a.moving ? ws * 0.02 : 0);
    let bodyY = 0;
    let headRot = Math.sin(t * 1.3 + seed) * 0.025 - (a.moving ? ws * 0.03 : 0);
    let armRot = Math.sin(t * 1.5 + seed) * 0.03;
    let scythe = Math.sin(t * 1.4 + seed) * 0.02 + (a.moving ? ws * 0.05 : 0);
    let lunge = 0;
    const liftL = a.moving ? Math.max(0, ws) * 2 : 0;
    const liftR = a.moving ? Math.max(0, -ws) * 2 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.04;
      bodyY -= e * 1.6;
      headRot -= e * 0.08;
      armRot -= e * 0.35;
      scythe = scythe * (1 - e) - 0.65 * e * swing;
      lunge = -e * 4;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.06;
      bodyY += e * 0.6;
      headRot += e * 0.1;
      armRot += e * 0.55 * swing;
      scythe = -0.65 * swing + e * 1.55 * swing;
      lunge = e * 7 * swing;
    }

    part(ctx, m, bone, 'footL', { x: lunge * 0.4, y: -liftL });
    part(ctx, m, bone, 'footR', { x: lunge * 0.4, y: -liftR });
    part(ctx, m, bone, 'hand', { x: lunge, y: bodyY, rot: armRot * 0.4 + scythe * 0.45 });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY, rot: headRot });
    part(ctx, m, bone, 'weapon', { x: lunge, y: bodyY, rot: scythe });
  }

  // 四足獠牙兽：身体起伏 / 对角步态 / 后退蓄力再前冲顶撞
  function drawCroc(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const ph = t * 10 + seed;
    const br = Math.sin(t * 2.4 + seed);
    const ws = a.moving ? Math.sin(ph) : 0;
    // 吐息/弹幕/召唤类不做过猛的顶撞，只有挥砍才全力前冲
    const melee = (a.type === 'slash' || a.type === 'arc');
    const hit = melee ? 1 : 0.5;
    let bodyY = br * 0.9 + (a.moving ? Math.abs(ws) * 1.5 : 0);
    let bodyRot = br * 0.008 + (a.moving ? ws * 0.012 : 0);
    let tail = Math.sin(t * 2.2 + seed) * 0.18 + (a.moving ? ws * 0.2 : 0);
    let tooth = 0;
    let lunge = 0;
    const lift = [0, 0, 0, 0];
    if (a.moving) {
      const s1 = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
      lift[0] = Math.max(0, s1) * 3;
      lift[3] = Math.max(0, s1) * 3;
      lift[1] = Math.max(0, s2) * 3;
      lift[2] = Math.max(0, s2) * 3;
    }
    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.1 * hit;
      bodyY += e * 1.2 * hit;
      tail -= e * 0.2;
      tooth -= e * 0.16;
      lunge = -e * 5 * hit;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.16 * hit;
      bodyY -= e * 1.2 * hit;
      tail += e * 0.28;
      tooth += e * 0.2;
      lunge = e * 10 * hit;
    }

    for (let i = 0; i < 4; i++) part(ctx, m, bone, 'leg' + i, { x: lunge * 0.6, y: -lift[i] });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'tail', { x: lunge * 0.4, y: bodyY * 0.5, rot: tail });
    // 獠牙跟随身体整体旋转，再叠加咬合位移
    part(ctx, m, bone, 'toothA', { x: lunge, y: bodyY - tooth * 2, rot: bodyRot, px: 46, py: 118 });
    part(ctx, m, bone, 'toothB', { x: lunge, y: bodyY - tooth * 2, rot: bodyRot, px: 46, py: 118 });
  }

  // 仙人掌枪手：呼吸 / 交替迈步 / 举枪瞄准再开火后坐
  function drawCactus(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 2.2 + seed);
    const ph = t * 8.6 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyY = br * 1.0 + (a.moving ? Math.abs(ws) * 1.6 : 0);
    let bodyRot = br * 0.01 + (a.moving ? ws * 0.02 : 0);
    let headRot = Math.sin(t * 1.6 + seed) * 0.03 - (a.moving ? ws * 0.03 : 0);
    let headY = br * 0.45;
    let armR = Math.sin(t * 1.5 + seed) * 0.04;
    let armL = Math.sin(t * 1.2 + seed) * 0.04;
    let gunRot = Math.sin(t * 1.7 + seed) * 0.02;
    let lunge = 0;
    const liftL = a.moving ? Math.max(0, ws) * 2 : 0;
    const liftR = a.moving ? Math.max(0, -ws) * 2 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.05;
      bodyY -= e * 1.4;
      headRot -= e * 0.07;
      armR -= e * 0.5;                 // 抬枪
      gunRot -= e * 0.35;
      armL -= e * 0.18;
      lunge = -e * 2.5;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.55) * Math.PI);
      bodyRot += melee ? e * 0.07 : e * 0.03;
      bodyY += e * 0.8;
      headRot += e * 0.05;
      // 开火后坐：枪口上跳；近战枪托则是向前抡
      gunRot += e * (melee ? 0.5 : -0.3);
      armR += e * (melee ? 0.4 : 0.15);
      lunge = e * (melee ? 5 : 2);
    }

    part(ctx, m, bone, 'footL', { y: -liftL });
    part(ctx, m, bone, 'footR', { y: -liftR });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armL', { x: lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY + headY, rot: headRot });
    part(ctx, m, bone, 'armR', { x: lunge, y: bodyY, rot: armR + gunRot * 0.25 });
    part(ctx, m, bone, 'gun', { x: lunge, y: bodyY, rot: gunRot });
  }

  // 冰晶巨像：沉重呼吸 / 交替跺步 / 双臂高举后砸地
  function drawIceGolem(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.8 + seed);
    const ph = t * 6.8 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const big = (a.type === 'arc' || a.type === 'slash');

    let bodyY = br * 1.4 + (a.moving ? Math.abs(ws) * 2.2 : 0);
    let bodyRot = br * 0.01 + (a.moving ? ws * 0.02 : 0);
    let headRot = Math.sin(t * 1.3 + seed) * 0.025;
    let armL = Math.sin(t * 1.4 + seed) * 0.05 + (a.moving ? ws * 0.1 : 0);
    let armR = -Math.sin(t * 1.4 + seed) * 0.05 - (a.moving ? ws * 0.1 : 0);
    let lunge = 0;
    const liftL = a.moving ? Math.max(0, ws) * 2.5 : 0;
    const liftR = a.moving ? Math.max(0, -ws) * 2.5 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.035;
      bodyY -= e * 1.8;
      headRot -= e * 0.05;
      armL += e * (big ? 0.75 : 0.3);
      armR -= e * (big ? 0.75 : 0.3);
      lunge = -e * 2.5;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * (big ? 0.08 : 0.03);
      bodyY += e * (big ? 2.2 : 0.9);
      headRot += e * 0.04;
      armL -= e * (big ? 0.55 : 0.2);
      armR += e * (big ? 0.55 : 0.2);
      lunge = e * (big ? 5 : 2);
    }

    part(ctx, m, bone, 'footL', { y: -liftL });
    part(ctx, m, bone, 'footR', { y: -liftR });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armL', { x: lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'armR', { x: lunge, y: bodyY, rot: armR });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY, rot: headRot });
  }

  // 魔法书：悬浮起伏 / 振翅 / 前倾吐舌
  function drawGrimoire(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const hover = Math.sin(t * 2.0 + seed);
    const flapSpeed = a.moving ? 7.5 : 4.6;
    const flap = Math.sin(t * flapSpeed + seed);

    let bodyY = hover * 2.2 - (a.moving ? 1.5 : 0);
    let bodyRot = Math.sin(t * 0.9 + seed) * 0.02;
    let wingL = 0.1 + flap * 0.22;
    let wingR = -0.1 - flap * 0.22;
    let tongue = Math.sin(t * 2.6 + seed) * 0.12;
    let headRot = Math.sin(t * 1.4 + seed) * 0.03;
    let lunge = 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.1;
      bodyY -= e * 3;
      wingL += e * 0.5;
      wingR -= e * 0.5;
      tongue -= e * 0.35;
      lunge = -e * 4;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.12;
      bodyY += e * 2;
      wingL += e * 0.75;
      wingR -= e * 0.75;
      tongue += e * 0.8;              // 长舌前甩
      lunge = e * 7;
    }

    part(ctx, m, bone, 'wingL', { x: lunge, y: bodyY, rot: wingL });
    part(ctx, m, bone, 'wingR', { x: lunge, y: bodyY, rot: wingR });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY, rot: headRot });
    part(ctx, m, bone, 'tongue', { x: lunge, y: bodyY + tongue * 3, rot: bodyRot + tongue });
  }

  // 噬人花王：花头摇晃 / 底座蹦跳 / 后仰再前咬
  function drawFlowerKing(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.9 + seed);
    const ph = t * 7.5 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyY = br * 0.9 + (a.moving ? Math.abs(ws) * 2 : 0);
    let bodyRot = br * 0.012 + (a.moving ? ws * 0.03 : 0);
    let headRot = Math.sin(t * 1.5 + seed) * 0.04 - (a.moving ? ws * 0.05 : 0);
    let headY = br * 0.6;
    let leafL = Math.sin(t * 1.7 + seed) * 0.1;
    let leafR = -Math.sin(t * 1.7 + seed) * 0.1;
    let lunge = 0;
    const hop = a.moving ? Math.abs(ws) * 1.4 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.05;
      bodyY -= e * 1.5;
      headRot -= e * (melee ? 0.28 : 0.12);   // 花头后仰蓄力
      headY -= e * 1.5;
      leafL -= e * 0.3;
      leafR += e * 0.3;
      lunge = -e * 3;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.07;
      bodyY += e * 1.2;
      headRot += e * (melee ? 0.42 : 0.16);   // 巨口前咬
      headY += e * 2;
      leafL += e * 0.45;
      leafR -= e * 0.45;
      lunge = e * (melee ? 7 : 3);
    }

    part(ctx, m, bone, 'stem', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'foot', { x: lunge * 0.6, y: -hop });
    part(ctx, m, bone, 'leafL', { x: lunge, y: bodyY, rot: leafL });
    part(ctx, m, bone, 'leafR', { x: lunge, y: bodyY, rot: leafR });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY + headY, rot: headRot });
  }

  // 魔锅骑士：锅身摇摆 / 交替迈步 / 举盾长矛前刺
  function drawPotKnight(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 2.1 + seed);
    const ph = t * 8.2 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const thrust = (a.type === 'arc' || a.type === 'slash');

    let bodyY = br * 1.1 + (a.moving ? Math.abs(ws) * 1.8 : 0);
    let bodyRot = br * 0.012 + (a.moving ? ws * 0.035 : 0);
    let headRot = Math.sin(t * 1.4 + seed) * 0.03 - (a.moving ? ws * 0.04 : 0);
    let shield = Math.sin(t * 1.5 + seed) * 0.05;
    let spear = Math.sin(t * 1.3 + seed) * 0.03;
    let lunge = 0;
    const liftL = a.moving ? Math.max(0, ws) * 2 : 0;
    const liftR = a.moving ? Math.max(0, -ws) * 2 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 1.4;
      headRot -= e * 0.06;
      shield -= e * 0.28;              // 举盾护身
      spear -= e * 0.55;               // 长矛后引
      lunge = -e * 3;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.55) * Math.PI);
      bodyRot += e * 0.08;
      bodyY += e * 1.2;
      headRot += e * 0.06;
      shield += e * 0.18;
      spear += e * (thrust ? 0.9 : 0.25);   // 长矛前刺
      lunge = e * (thrust ? 8 : 3);
    }

    part(ctx, m, bone, 'footL', { x: lunge * 0.5, y: -liftL });
    part(ctx, m, bone, 'footR', { x: lunge * 0.5, y: -liftR });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'shield', { x: lunge, y: bodyY, rot: shield });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY, rot: headRot });
    part(ctx, m, bone, 'spear', { x: lunge, y: bodyY, rot: spear });
  }

  // 紫晶蟹王：晶簇呼吸 / 四足交替爬行 / 晶钳开合夹击
  function drawCrystalCrab(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.9 + seed);
    const ph = t * 10.5 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const pinch = (a.type === 'arc' || a.type === 'slash');

    let bodyY = br * 1.2 + (a.moving ? Math.abs(ws) * 1.2 : 0);
    let bodyRot = br * 0.012 + (a.moving ? ws * 0.016 : 0);
    let claw = Math.sin(t * 1.6 + seed) * 0.05;
    let lunge = 0;
    const legs = [0, 1, 2, 3].map((i) => (a.moving ? Math.sin(ph + i * Math.PI * 0.5) * 2.2 : 0));

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.05;
      bodyY -= e * 1.3;
      claw -= e * 0.55;
      lunge = -e * 3;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.06;
      bodyY += e * 0.9;
      claw += e * (pinch ? 0.85 : 0.3);   // 晶钳开合
      lunge = e * (pinch ? 7 : 3);
    }

    part(ctx, m, bone, 'legL1', { y: -Math.max(0, legs[0]) });
    part(ctx, m, bone, 'legL2', { y: -Math.max(0, legs[1]) });
    part(ctx, m, bone, 'legR1', { y: -Math.max(0, legs[2]) });
    part(ctx, m, bone, 'legR2', { y: -Math.max(0, legs[3]) });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'claw', { x: lunge, y: bodyY, rot: claw });
  }

  // 粉角屠夫：厚重呼吸 / 左右摇摆 / 肩斧高举抡劈
  function drawPinkDemon(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.8 + seed);
    const ph = t * 7.6 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const heavy = (a.type === 'slash' || a.type === 'arc');

    let bodyY = br * 1.3 + (a.moving ? Math.abs(ws) * 1.6 : 0);
    let bodyRot = br * 0.012 + (a.moving ? ws * 0.03 : 0);
    let headRot = Math.sin(t * 1.35 + seed) * 0.03 - (a.moving ? ws * 0.03 : 0);
    let armL = Math.sin(t * 1.4 + seed) * 0.05;    // 画面右侧手臂
    let armR = -Math.sin(t * 1.4 + seed) * 0.05;   // 画面左侧手臂
    let axe = Math.sin(t * 1.2 + seed) * 0.03;
    let lunge = 0;
    const feetRot = a.moving ? ws * 0.03 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.05;
      bodyY -= e * 1.5;
      headRot -= e * 0.07;
      axe -= e * 0.8;                 // 肩斧高举
      armL -= e * 0.25;
      armR += e * 0.2;
      lunge = -e * 3;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.55) * Math.PI);
      bodyRot += e * 0.09;
      bodyY += e * 1.7;
      headRot += e * 0.09;
      axe += e * (heavy ? 1.3 : 0.35);   // 抡斧下劈
      armL += e * 0.35;
      armR -= e * 0.25;
      lunge = e * (heavy ? 6 : 2.5);
    }

    part(ctx, m, bone, 'axe', { x: lunge, y: bodyY, rot: axe });
    part(ctx, m, bone, 'feet', { x: lunge * 0.6, rot: feetRot });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armR', { x: lunge, y: bodyY, rot: armR });
    part(ctx, m, bone, 'armL', { x: lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY, rot: headRot });
  }

  // 南瓜领主：鬼火浮动 / 小步挪动 / 触手后引再前扑缠绕
  function drawPumpkinLord(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const hover = Math.sin(t * 1.7 + seed);
    const ph = t * 7.2 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyY = hover * 1.3 + (a.moving ? Math.abs(ws) * 1.5 : 0);
    let bodyRot = hover * 0.01 + (a.moving ? ws * 0.025 : 0);
    let headRot = Math.sin(t * 1.4 + seed) * 0.035 - (a.moving ? ws * 0.035 : 0);
    let headY = hover * 0.5;
    let tenL = Math.sin(t * 1.8 + seed) * 0.12;
    let tenR = -Math.sin(t * 1.8 + seed) * 0.12;
    let top = Math.sin(t * 2.2 + seed) * 0.08;
    let lunge = 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.05;
      bodyY -= e * 1.6;
      headRot -= e * (melee ? 0.22 : 0.1);
      tenL -= e * 0.45;
      tenR += e * 0.45;
      top -= e * 0.3;
      lunge = -e * 3;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.07;
      bodyY += e * 1.2;
      headRot += e * (melee ? 0.3 : 0.12);
      tenL += e * 0.6;                // 触手前缠
      tenR -= e * 0.6;
      top += e * 0.4;
      lunge = e * (melee ? 6 : 2.5);
    }

    part(ctx, m, bone, 'footL', { x: lunge * 0.5 });
    part(ctx, m, bone, 'footR', { x: lunge * 0.5 });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'tenL', { x: lunge, y: bodyY, rot: tenL });
    part(ctx, m, bone, 'tenR', { x: lunge, y: bodyY, rot: tenR });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY + headY, rot: headRot });
    part(ctx, m, bone, 'top', { x: lunge, y: bodyY + headY, rot: bodyRot + top });
  }

  // 触手蠕虫王：身体波浪起伏 / 尾段摆动爬行 / 羽状触手后引再前抽
  function drawOctoWorm(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.8 + seed);
    const ph = t * 7.0 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const big = (a.type === 'arc' || a.type === 'slash');

    let bodyY = br * 1.3 + (a.moving ? Math.abs(ws) * 2.2 : 0);
    let bodyRot = br * 0.015 + (a.moving ? ws * 0.03 : 0);
    let torsoRot = Math.sin(t * 1.5 + seed) * 0.03 - (a.moving ? ws * 0.04 : 0);
    let plumeRot = Math.sin(t * 1.6 + seed) * 0.06 + (a.moving ? ws * 0.08 : 0);
    let tailA = Math.sin(t * 1.9 + seed) * 0.12;
    let tailB = -Math.sin(t * 1.9 + seed) * 0.1;
    let lunge = 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 2;
      torsoRot -= e * 0.12;
      plumeRot -= e * 0.55;          // 羽状触手后引
      tailA += e * 0.2;
      tailB -= e * 0.2;
      lunge = -e * 4;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.08;
      bodyY += e * 1.5;
      torsoRot += e * 0.18;
      plumeRot += e * (big ? 1.0 : 0.45);   // 触手前抽
      tailA -= e * 0.3;
      tailB += e * 0.3;
      lunge = e * (big ? 8 : 4);
    }

    part(ctx, m, bone, 'tailA', { x: lunge * 0.3, rot: tailA });
    part(ctx, m, bone, 'tailB', { x: lunge * 0.5, rot: tailB });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'torso', { x: lunge, y: bodyY, rot: bodyRot + torsoRot });
    part(ctx, m, bone, 'plume', { x: lunge, y: bodyY, rot: bodyRot + plumeRot });
  }

  // 灰发女妖：灰发飘动 / 小碎步挪动 / 双臂后引再前扑爪击
  function drawHairBanshee(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.9 + seed);
    const ph = t * 8.4 + seed;
    const ws = a.moving ? Math.sin(ph) : 0;
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyY = br * 1.1 + (a.moving ? Math.abs(ws) * 1.6 : 0);
    let bodyRot = br * 0.012 + (a.moving ? ws * 0.022 : 0);
    let headRot = Math.sin(t * 1.5 + seed) * 0.045 - (a.moving ? ws * 0.04 : 0);
    let headY = br * 0.5;
    let armL = Math.sin(t * 1.6 + seed) * 0.06;    // 画面右侧手臂
    let armR = -Math.sin(t * 1.6 + seed) * 0.06;   // 画面左侧手臂
    let lunge = 0;
    const liftL = a.moving ? Math.max(0, ws) * 2 : 0;
    const liftR = a.moving ? Math.max(0, -ws) * 2 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.05;
      bodyY -= e * 1.6;
      headRot -= e * 0.12;
      headY -= e * 0.8;
      armL -= e * 0.45;
      armR += e * 0.45;
      lunge = -e * 3;
    } else if (a.strike) {
      const e = Math.sin(Math.pow(a.k, 0.5) * Math.PI);
      bodyRot += e * 0.08;
      bodyY += e * 1.2;
      headRot += e * (melee ? 0.22 : 0.1);   // 灰发前甩
      headY += e * 0.8;
      armL += e * (melee ? 0.7 : 0.25);      // 双爪前扑
      armR -= e * (melee ? 0.7 : 0.25);
      lunge = e * (melee ? 7 : 3);
    }

    part(ctx, m, bone, 'footL', { x: lunge * 0.5, y: -liftL });
    part(ctx, m, bone, 'footR', { x: lunge * 0.5, y: -liftR });
    part(ctx, m, bone, 'body', { x: lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armR', { x: lunge, y: bodyY, rot: armR });
    part(ctx, m, bone, 'armL', { x: lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'head', { x: lunge, y: bodyY + headY, rot: headRot });
  }

  const cache = {};
  const glows = {};

  // 近战型首领：挥击时身体压得更狠、前冲更远
  const MELEE_ACT = {
    reaper: 1, croc: 1, mummy: 1, crab: 1, maw: 1,
    goat: 1, knight: 1, snake: 1, demon: 1, ogre: 1, golem: 1
  };

  function rgba(hex, a) {
    if (hex.indexOf('rgb') === 0) {
      const p = hex.replace(/rgba?\(([^)]+)\)/, '$1').split(',');
      return `rgba(${p[0].trim()},${p[1].trim()},${p[2].trim()},${a})`;
    }
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function source(src) {
    let s = cache[src];
    if (s) return s;
    s = { src, img: new Image(), ready: false, failed: false, canvas: null, flash: null, tints: {} };
    s.img.onload = () => build(s);
    s.img.onerror = () => { s.failed = true; };
    DG.assets.assign(s.img, src);
    cache[src] = s;
    return s;
  }

  function build(s) {
    const w = s.img.naturalWidth;
    const h = s.img.naturalHeight;
    if (!w || !h) return;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(s.img, 0, 0);
    s.canvas = c;
    s.w = w;
    s.h = h;
    s.ready = true;

    // 暗色调一次性烘焙：运行时只 drawImage，避免逐帧走 ctx.filter 离屏滤镜
    const dc = document.createElement('canvas');
    dc.width = w;
    dc.height = h;
    const dg = dc.getContext('2d');
    dg.filter = DARK_FILTER_TEX;
    dg.drawImage(c, 0, 0);
    s.dark = dc;

    // 受击白闪：只保留贴图不透明区域
    const f = document.createElement('canvas');
    f.width = w;
    f.height = h;
    const fg = f.getContext('2d');
    fg.drawImage(c, 0, 0);
    fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = '#ffffff';
    fg.fillRect(0, 0, w, h);
    s.flash = f;
  }

  function tinted(s, color, dark) {
    const store = dark ? (s.darkTints || (s.darkTints = {})) : s.tints;
    let c = store[color];
    if (c) return c;
    const base = (dark && s.dark) || s.canvas;
    c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    store[color] = c;
    return c;
  }

  function glow(color) {
    let c = glows[color];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 4, 128, 128, 128);
    rg.addColorStop(0, rgba(color, 0.65));
    rg.addColorStop(0.4, rgba(color, 0.2));
    rg.addColorStop(1, rgba(color, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    glows[color] = c;
    return c;
  }

  function defOf(m) {
    return DEFS[m.art] || DEFS.eyehorror;
  }

  function displayHeight(m) {
    return defOf(m).height * (m.artScale || 1);
  }

  function drawPlaceholder(ctx, m, def, h, t) {
    const base = def.kind === 'reaper' ? '#6b5a8e' : '#7a4f9e';
    ctx.fillStyle = rgba(base, 0.55);
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.34, h * 0.24, h * 0.32, 0, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.42)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff5f5f';
    ctx.beginPath();
    ctx.arc(0, -h * 0.5, h * 0.085 + Math.sin(t * 4) * 1.5, 0, PI2);
    ctx.fill();
  }

  function draw(ctx, m, opts) {
    const def = defOf(m);
    const bone = def.parts ? BONES[def.parts] : null;
    const s = def.src ? source(def.src) : null;
    const t = (opts && opts.t) || 0;
    const cast = (opts && opts.cast) || m.cast;
    const seed = m.seed || 0;
    const h = displayHeight(m);
    const w = bone ? h * (bone.w / bone.h) : (s.ready ? h * (s.w / s.h) : h * 0.82);

    const k = cast
      ? (cast.phase === 'windup'
        ? Math.min(1, cast.t / Math.max(0.001, cast.atk.windup))
        : Math.min(1, cast.t / Math.max(0.001, cast.atk.recover || 0.45)))
      : 0;
    const windup = !!(cast && cast.phase === 'windup');
    const strike = !!(cast && cast.phase === 'recover');
    const moving = !!m.moving;
    const enraged = !!m.enraged;
    // 招式类型决定身体动作：近战挥砍扑得更狠，施法型蓄力更夸张
    const atkType = cast ? cast.atk.type : '';
    const meleeAct = !!(MELEE_ACT[def.kind] && (atkType === 'arc' || atkType === 'slash'));

    // ---- 待机呼吸 / 浮空 / 行走起伏 ----
    let bob = Math.sin(t * 2.0 + seed) * 2.4;
    let rot = Math.sin(t * 0.8 + seed) * 0.016;
    let sx = 1;
    let sy = 1;
    let dx = 0;
    if (def.kind === 'reaper') {
      bob = Math.sin(t * 1.7 + seed) * 4.2 - 2;
      rot += Math.sin(t * 1.1 + seed) * 0.012;
    }
    if (moving) {
      bob += Math.sin(t * 8.5) * 1.6;
      rot += Math.cos(m.facing || 0) * 0.018;
    }
    if (windup) {
      const e = Math.sin(k * Math.PI * 0.5);
      sy += e * (meleeAct ? 0.085 : 0.055);
      sx -= e * (meleeAct ? 0.05 : 0.03);
      rot -= Math.cos(m.facing || 0) * (meleeAct ? 0.048 : 0.02) * e;
      bob -= e * (meleeAct ? 4 : 2);
    } else if (strike) {
      const e = Math.sin(k * Math.PI);
      sx += e * (meleeAct ? 0.08 : 0.05);
      sy -= e * (meleeAct ? 0.035 : 0.02);
      dx = Math.cos(m.facing || 0) * e * (meleeAct ? 26 : 14);
      bob -= e * (meleeAct ? 5 : 3);
    }
    // 瞬移类招式：读条时淡出，落点后再淡入
    let alpha = 1;
    if (atkType === 'blink') {
      alpha = windup ? 1 - k * 0.8 : 0.2 + k * 0.8;
    }

    // ---- 背光光晕（狂暴 / 蓄力时更亮） ----
    const glowColor = m.glow || def.glow;
    const glowA = (0.16 + (enraged ? 0.18 : 0) + (windup ? 0.3 * k : 0) + Math.sin(t * 3 + seed) * 0.04) * alpha;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.85, glowA);
    ctx.drawImage(glow(glowColor), -h * 0.78, -h * 0.92, h * 1.56, h * 1.56);
    if (def.kind === 'eye') {
      const gx = w * 0.12;
      const gy = -h * 0.6;
      const ga = (0.2 + (windup ? 0.5 * k : 0) + (strike ? 0.28 : 0)) * alpha;
      ctx.globalAlpha = Math.min(0.9, ga * (enraged ? 1.2 : 1));
      const gs = h * (0.32 + (windup ? 0.12 * k : 0));
      ctx.drawImage(glow(enraged ? '#ff5a4d' : '#ff5f5f'), gx - gs / 2, gy - gs / 2, gs, gs);
    }
    ctx.restore();

    // ---- 本体 ----
    const flip = Math.cos(m.facing || 0) < -0.05;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx, (m.r || 30) * 0.62 + bob);
    ctx.rotate(rot);
    ctx.scale(sx * (flip ? -1 : 1), sy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (bone) {
      // 分件：换算到 PSD 像素空间，原点 = 脚底中心
      const sc = h / bone.h;
      ctx.scale(sc, sc);
      ctx.translate(-bone.w / 2, -bone.h);
      bone.draw(ctx, m, bone, t, { moving, windup, strike, k, type: atkType });
    } else if (s.ready) {
      const img = m.tint ? tinted(s, m.tint, true) : (s.dark || s.canvas);
      ctx.drawImage(img, -w / 2, -h, w, h);
      if (m.flash > 0 && s.flash) {
        ctx.globalAlpha = Math.min(0.8, m.flash / 0.16) * alpha;
        ctx.drawImage(s.flash, -w / 2, -h, w, h);
        ctx.globalAlpha = alpha;
      }
    } else {
      drawPlaceholder(ctx, m, def, h, t);
    }
    ctx.restore();

    // ---- 施法型蓄力：口部聚能光球 + 收束弧线 ----
    if (windup && (atkType === 'beam' || atkType === 'fan')) {
      const e = Math.sin(k * Math.PI * 0.5);
      const dir = Math.cos(m.facing || 0) < -0.05 ? -1 : 1;
      const mx = dir * w * 0.3;
      const my = -h * 0.6;
      const c = cast.atk.color || '#ffffff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const orb = 3 + e * 9;
      ctx.fillStyle = rgba(c, 0.32 * e);
      ctx.beginPath();
      ctx.arc(mx, my, orb * 1.7, 0, PI2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.65 * e);
      ctx.beginPath();
      ctx.arc(mx, my, orb * 0.55, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(c, 0.42 * e);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const rr = 10 + i * 8 + e * 10;
        ctx.beginPath();
        ctx.arc(mx - dir * (6 + i * 5), my, rr * 0.55, -0.85, 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- 出手速度线：从身体背后拉出，强化挥击/突进的重量感 ----
    if (strike && (atkType === 'arc' || atkType === 'slash' || atkType === 'blink' || atkType === 'beam')) {
      const e = Math.sin(k * Math.PI);
      const dir = Math.cos(m.facing || 0) < -0.05 ? -1 : 1;
      const c = cast.atk.color || '#ffffff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(c, 0.5 * e);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const l = (18 + i * 13) * e;
        const y0 = -h * (0.28 + i * 0.17);
        const x0 = -dir * w * (0.38 + i * 0.04);
        ctx.lineWidth = 3.6 - i * 0.7;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 - dir * l, y0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- 蓄力读条：招式名 + 进度 ----
    if (windup) {
      const label = cast.atk.label || '蓄力';
      const y = -h - 14;
      ctx.save();
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.72)';
      ctx.strokeText(label, 0, y);
      ctx.fillStyle = cast.atk.color || '#f2b7aa';
      ctx.fillText(label, 0, y);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(-34, y + 3, 68, 4);
      ctx.fillStyle = cast.atk.color || '#f2b7aa';
      ctx.fillRect(-34, y + 3, 68 * k, 4);
      ctx.restore();
    }
  }

  // ---------- 攻击特效 ----------
  function drawEffect(ctx, e) {
    const p = 1 - e.life / e.max;
    const fade = Math.max(0, e.life / e.max);

    if (e.kind === 'teleArc') {
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 10);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, e.radius, -e.arc / 2, e.arc / 2);
      ctx.closePath();
      ctx.fillStyle = rgba(e.color, 0.07 + pulse * 0.06 + p * 0.08);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, -e.arc / 2, e.arc / 2);
      ctx.strokeStyle = rgba(e.color, 0.42 + pulse * 0.32);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = rgba(e.color, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.62, -e.arc / 2, e.arc / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return true;
    }

    if (e.kind === 'teleBeam') {
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 12);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -p * 40;
      ctx.strokeStyle = rgba(e.color, 0.35 + pulse * 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(e.color, 0.18 + pulse * 0.12);
      ctx.lineWidth = e.width || 26;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.5 + pulse * 0.3);
      ctx.beginPath();
      ctx.arc(e.length, 0, 5 + pulse * 3, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    if (e.kind === 'teleCircle') {
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 10);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = rgba(e.color, 0.45 + pulse * 0.35);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = p * 30;
      ctx.strokeStyle = rgba(e.color, 0.3 + pulse * 0.25);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.62, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-e.radius * 0.32, 0);
      ctx.lineTo(e.radius * 0.32, 0);
      ctx.moveTo(0, -e.radius * 0.32);
      ctx.lineTo(0, e.radius * 0.32);
      ctx.strokeStyle = rgba(e.color, 0.55);
      ctx.stroke();
      ctx.restore();
      return true;
    }

    if (e.kind === 'arcSlash') {
      const sweep = Math.min(1, p * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.2 * fade);
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.92, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(e.color, (0.7 - i * 0.18) * fade);
        ctx.lineWidth = 10 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 3, a0, a1);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.8 * fade);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius - 2, a0, a1);
      ctx.stroke();
      const hx = Math.cos(a1) * e.radius;
      const hy = Math.sin(a1) * e.radius;
      ctx.fillStyle = rgba(e.color, 0.85 * fade);
      ctx.beginPath();
      ctx.arc(hx, hy, 5 + 4 * fade, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    if (e.kind === 'beam') {
      const k = Math.max(0, e.life / e.max);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = rgba(e.color, 0.75 * k);
      ctx.lineWidth = (e.width || 30) * (0.35 + 0.65 * k);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba('#ffffff', 0.85 * k);
      ctx.lineWidth = Math.max(2, (e.width || 30) * 0.3 * k);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.5 * k);
      ctx.beginPath();
      ctx.arc(e.length, 0, 14 * k, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    if (e.kind === 'crocWave') {
      const sweep = Math.min(1, p * 1.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(e.color, (0.55 - i * 0.15) * fade);
        ctx.lineWidth = 10 - i * 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (0.72 + i * 0.11), -e.arc / 2, -e.arc / 2 + e.arc * sweep);
        ctx.stroke();
      }
      ctx.fillStyle = rgba('#e6d9a8', 0.3 * fade);
      for (let i = 0; i < 6; i++) {
        if (i / 5 > sweep) break;
        const aa = -e.arc / 2 + e.arc * (i / 5) * sweep;
        const rr = e.radius * (0.78 + (i % 2) * 0.12);
        ctx.beginPath();
        ctx.ellipse(Math.cos(aa) * rr, Math.sin(aa) * rr, 9, 5, aa, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    if (e.kind === 'voidNova') {
      ctx.save();
      ctx.translate(e.x, e.y);
      const rr = e.radius * (0.2 + p * 0.95);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(e.color, 0.55 * fade);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, PI2);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.5 * fade);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.92, 0, PI2);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.7 * fade);
      for (let i = 0; i < 8; i++) {
        const aa = i / 8 * PI2 + p * 0.6;
        const x = Math.cos(aa) * rr * 0.8;
        const y = Math.sin(aa) * rr * 0.8;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(aa);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, rr * 0.9);
      g.addColorStop(0, rgba(e.color, 0.35 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.9, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    // 读条聚能：地面双环法阵 + 上升能量柱 + 胸口聚能球与收束光带
    if (e.kind === 'bossCharge') {
      const kk = 1 - Math.max(0, e.life) / e.max;
      const ff = Math.max(0, Math.min(1, e.life / e.max));
      const h = e.h || 200;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.scale(1, 0.5);
      // 地面光池：让法阵从巨大身体下透出来
      ctx.globalAlpha = ff * 0.5;
      const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, e.radius);
      pool.addColorStop(0, rgba(e.color, 0.35));
      pool.addColorStop(0.7, rgba(e.color, 0.12));
      pool.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, PI2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgba(e.color, 0.34 + 0.34 * ff);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (1 - kk * 0.24), kk * 4.6, kk * 4.6 + 2.1);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (0.7 - kk * 0.1), -kk * 4.2, -kk * 4.2 + 1.6);
      ctx.stroke();
      ctx.restore();
      const beamR = e.radius * 0.17 * (0.45 + kk);
      const grd = ctx.createLinearGradient(0, 0, 0, -h * 0.9);
      grd.addColorStop(0, rgba(e.color, 0.38 * ff));
      grd.addColorStop(0.6, rgba(e.color, 0.16 * ff));
      grd.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(-beamR, 0);
      ctx.lineTo(-beamR * 0.45, -h * 0.9);
      ctx.lineTo(beamR * 0.45, -h * 0.9);
      ctx.lineTo(beamR, 0);
      ctx.closePath();
      ctx.fill();
      // 柱心亮线
      ctx.strokeStyle = rgba('#ffffff', 0.22 * ff);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -h * 0.86);
      ctx.stroke();
      const cy = -h * 0.58;
      const orb = 5 + kk * 12;
      ctx.globalAlpha = ff;
      ctx.fillStyle = rgba(e.color, 0.38);
      ctx.beginPath();
      ctx.arc(0, cy, orb * 1.9, 0, PI2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.7);
      ctx.beginPath();
      ctx.arc(0, cy, orb * 0.62, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(e.color, 0.45);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + kk * 2.4;
        const rr = e.radius * (1.2 - kk * 0.8);
        const px = Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr * 0.6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px * 0.3, cy + (py - cy) * 0.3);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 近战落地冲击：地面扩散环 + 放射裂纹
    if (e.kind === 'quakeRing') {
      const k2 = Math.min(1, p * 1.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.scale(1, 0.42);
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = rgba(e.color, (0.5 - i * 0.18) * fade);
        ctx.lineWidth = 7 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (0.25 + k2 * (0.75 + i * 0.18)), 0, PI2);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(e.color, 0.45 * fade);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * PI2 + 0.3;
        const r0 = e.radius * 0.3 * (1 + k2);
        const r1 = e.radius * (0.5 + k2 * 0.6);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.42);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.42);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 影遁：收束环 + 竖向拖影
    if (e.kind === 'blinkWarp') {
      const k2 = Math.min(1, p * 1.4);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(e.color, 0.65 * fade);
      ctx.lineWidth = 5 * fade + 1;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (1 - k2 * 0.85), 0, PI2);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.4 * fade);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * PI2 + k2 * 1.2;
        const rr2 = e.radius * (0.5 + (i % 3) * 0.18);
        const px = Math.cos(a) * rr2;
        const py = Math.sin(a) * rr2 * 0.5;
        ctx.fillRect(px - 1.5, py - 16 * fade, 3, 32 * fade);
      }
      ctx.restore();
      return true;
    }

    // 召唤法阵：旋转符环 + 六个节点
    if (e.kind === 'summonCircle') {
      const kk = 1 - Math.max(0, e.life) / e.max;
      const ff = Math.max(0, Math.min(1, e.life / e.max));
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(e.color, 0.55 * ff);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([10, 12]);
      ctx.lineDashOffset = -kk * 60;
      ctx.strokeStyle = rgba(e.color, 0.35 * ff);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.72, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(e.color, 0.7 * ff);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * PI2 + kk * 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.radius * 0.86, Math.sin(a) * e.radius * 0.86, 3, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    return false;
  }

  DG.art.bosses = {
    draw, drawEffect, displayHeight, defs: DEFS,
    // 只加载指定首领贴图并烘焙暗色调：进副本时按当前首领池预热，避免全量解码
    preload: (ids) => {
      (ids || []).forEach((id) => {
        const d = DEFS[id];
        if (!d) return;
        if (d.src) source(d.src);
        const bone = d.parts && BONES[d.parts];
        if (bone) bone.srcs.forEach((f) => source(PART_DIR + f));
      });
    },
    // 预载进度：已进入缓存的贴图里，完成加载（成功或失败）的数量
    stats: () => {
      let total = 0, done = 0;
      for (const k in cache) {
        total++;
        const s = cache[k];
        if (s.ready || s.failed) done++;
      }
      return { total, done };
    },
    isReady: (art) => {
      const d = DEFS[art];
      if (!d) return false;
      if (d.src) return source(d.src).ready;
      const bone = d.parts && BONES[d.parts];
      if (!bone) return false;
      return bone.srcs.every((f) => source(PART_DIR + f).ready);
    }
  };
})();
