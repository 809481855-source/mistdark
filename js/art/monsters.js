/* 美术 · 小怪：矢量分件角色（固定规范见 docs/monster-pipeline.md）
 * 设计坐标系：脚底原点 (0,0)，向上为负 Y，总高 DESIGN_H。
 * 分件顺序：腿 → 长袍 → 胸饰 → 头（脸 → 头巾 → 角 → 耳 → 毛簇 → 眼 → 鼻嘴）
 * 动作由 m.moving / m.walkPhase / m.action 驱动：
 *   idle → walk → windup → strike → recover
 * 用法：DG.art.monsters.draw(ctx, m, { t })
 *   ctx 已平移到怪物中心（与首领一致），内部按脚底贴地锚定。
 * 拆分说明：调色板与公共绘制工具在 monsters/art.js，各怪物 pose/draw 与特效在 monsters/draw.js，
 * 本文件保留对外接口（defs、贴图缓存烘焙、draw / preload / stats）。
 */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};
  const {
    PI2, DESIGN_H, ART_H, DARK_FILTER_TEX, clamp, easeOut, PAL, FLASH_PAL, dimPal, rgba
  } = DG.art.monsterArt;
  const { drawTex, drawEffect, drawFxSkin } = DG.art.monsterDraw;
  // ---------- 批次五：图鉴裁切贴图小怪 ----------
  // 直接使用参考图鉴中的角色，不重绘；首次加载缓存画布与白闪剪影，运行时只做 drawImage。
  const texCache = {};

  function texSource(src) {
    let s = texCache[src];
    if (s) return s;
    s = {
      src, img: new Image(), ready: false, failed: false,
      canvas: null, flash: null, w: 0, h: 0, bw: 0, bh: 0
    };
    s.img.onload = () => {
      const w = s.img.naturalWidth;
      const h = s.img.naturalHeight;
      if (!w || !h) return;
      s.w = w;
      s.h = h;
      s.ready = true;
      // 运行时显示高度约 82~120px，原始素材往往大得多。这里把暗色调与白闪
      // 一次性烘焙到接近显示尺寸（每帧只需一次小图 drawImage，成本极低）。
      const MAXH = 192;
      const sc = Math.min(1, MAXH / h);
      const bw = Math.max(1, Math.round(w * sc));
      const bh = Math.max(1, Math.round(h * sc));
      s.bw = bw;
      s.bh = bh;
      // 暗色调只烘焙一次，运行时不再逐帧走 ctx.filter 离屏滤镜
      const dc = document.createElement('canvas');
      dc.width = bw;
      dc.height = bh;
      const dg = dc.getContext('2d');
      dg.imageSmoothingQuality = 'high';   // 仅烘焙时用高质量，运行时零成本
      dg.filter = DARK_FILTER_TEX;
      dg.drawImage(s.img, 0, 0, w, h, 0, 0, bw, bh);
      s.dark = dc;
      const f = document.createElement('canvas');
      f.width = bw;
      f.height = bh;
      const fg = f.getContext('2d');
      fg.drawImage(dc, 0, 0);
      fg.globalCompositeOperation = 'source-atop';
      fg.fillStyle = '#ffffff';
      fg.fillRect(0, 0, bw, bh);
      s.flash = f;
    };
    s.img.onerror = () => { s.failed = true; };
    DG.assets.assign(s.img, src);
    texCache[src] = s;
    return s;
  }


  // ---------- 对外接口 ----------
  // 全部小怪统一使用本轮新贴图：src 走 drawTex（脚底锚定 + 呼吸 / 前冲 / 受击白闪）
  const defs = {
    wolf: { h: 62, name: '腐化野狼', src: 'assets/monsters/wolf.png' },
    skeleton: { h: 80, name: '骷髅战士', src: 'assets/monsters/skeleton.png' },
    mistwalker: { h: 82, name: '迷雾行者', src: 'assets/monsters/mistwalker.png' },
    pea: { h: 52, name: '孢帽菌人', src: 'assets/monsters/pea.png' },
    musketeer: { h: 66, name: '菌帽枪手', src: 'assets/monsters/musketeer.png' },
    pumpkin: { h: 62, name: '裂口刈手', src: 'assets/monsters/pumpkin.png' },
    slime: { h: 54, name: '赤红史莱姆', src: 'assets/monsters/slime.png' },
    frostwolf: { h: 64, name: '霜牙狼', src: 'assets/monsters/frostwolf.png' },
    boneknight: { h: 84, name: '缠尸卫士', src: 'assets/monsters/boneknight.png' },
    frostslime: { h: 66, name: '霜颅骸骨', src: 'assets/monsters/frostslime.png' },
    bat: { h: 44, name: '血翼蝠', src: 'assets/monsters/bat.png' },
    hornet: { h: 44, name: '毒刺蜂', src: 'assets/monsters/hornet.png' },
    beetle: { h: 54, name: '青壳甲虫', src: 'assets/monsters/beetle.png' },
    cinderraven: { h: 52, name: '黑焰蝠', src: 'assets/monsters/cinderraven.png' },
    candle: { h: 74, name: '魔锅炉怪', src: 'assets/monsters/candle.png' },
    urchin: { h: 66, name: '棘刺仙人掌', src: 'assets/monsters/urchin.png' },
    deepfin: { h: 54, name: '幽蓝喙兽', src: 'assets/monsters/deepfin.png' },
    cowlbandit: { h: 62, name: '游荡菌人', src: 'assets/monsters/cowlbandit.png' },
    angler: { h: 46, name: '渊灯兽', src: 'assets/monsters/angler.png' },
    fleece: { h: 60, name: '绷带猫', src: 'assets/monsters/fleece.png' },
    foxraider: { h: 64, name: '灰狐掠手', src: 'assets/monsters/foxraider.png' },
    emberdrake: { h: 62, name: '赤棘龙', src: 'assets/monsters/emberdrake.png' },
    venomlisk: { h: 58, name: '绿鳞蛇', src: 'assets/monsters/venomlisk.png' },
    bulwark: { h: 58, name: '铁背野猪', src: 'assets/monsters/bulwark.png' },
    mummy: { h: 86, name: '墓穴木乃伊', src: 'assets/monsters/mummy.png' },
    mawflower: { h: 92, name: '噬人蠕虫', src: 'assets/monsters/mawflower.png' },
    plaguedoc: { h: 96, name: '瘟疫医师', src: 'assets/monsters/plaguedoc.png' },
    warlock: { h: 86, name: '深渊巫师', src: 'assets/monsters/warlock.png' }
  };

  function displayHeight(m) {
    const d = defs[m.art];
    const base = (d ? d.h : ART_H) * (m.artScale || 1);
    // 体型偏小的小怪统一放大 10%：按原始美术高度判定，精英加成不参与
    const small = base <= 52 ? 1.1 : 1;
    return base * small * (m.elite ? 1.18 : 1);
  }

  function draw(ctx, m, opts) {
    const d = defs[m.art];
    if (!d) return;
    const t = (opts && opts.t) || 0;
    if (d.src) {
      drawTex(ctx, m, d, t);
      return;
    }
    const seed = m.seed || 0;
    const h = displayHeight(m);
    const k = h / (d.designH || DESIGN_H);
    const pose = (d.pose || computePose)(m, t, seed);
    const flip = Math.cos(m.facing || 0) < -0.05;

    ctx.save();
    ctx.translate(pose.dx, m.r * 0.72 + pose.dy - (m.hop || 0));
    ctx.rotate(pose.rot);
    ctx.scale(k * (flip ? -1 : 1) * pose.sx, k * pose.sy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    d.draw(ctx, dimPal(d.pal || PAL), pose);
    if (m.flash > 0) {
      ctx.globalAlpha = Math.min(0.62, m.flash / 0.13);
      d.draw(ctx, d.flashPal || FLASH_PAL, pose);
      ctx.globalAlpha = 1;
    }

    // 出手瞬间：近战怪嘴/武器前的亮光，让咬击在不看特效时也能读出
    const g0 = d.strikeGlow;
    if (g0 && m.action && m.action.phase === 'strike') {
      const e = easeOut(clamp(m.action.t / Math.max(0.01, m.action.strike), 0, 1));
      const gx = g0.x + e * g0.dx;
      const gy = g0.y;
      const gr = g0.r + e * g0.dr;
      const g = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
      g.addColorStop(0, rgba(m.fxColor || '#cbe8a4', 0.26 * e));
      g.addColorStop(1, rgba(m.fxColor || '#cbe8a4', 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, PI2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function preload(ids) {
    const list = ids && ids.length ? ids : Object.keys(defs);
    for (const id of list) {
      const d = defs[id];
      if (d && d.src) texSource(d.src);
    }
  }

  // 预载进度：已进入缓存的贴图里，完成加载（成功或失败）的数量
  function stats() {
    let total = 0, done = 0;
    for (const k in texCache) {
      total++;
      const s = texCache[k];
      if (s.ready || s.failed) done++;
    }
    return { total, done };
  }

  // 绘制层（monsters/draw.js）运行时需要取用贴图缓存与显示高度：回填到共享对象
  DG.art.monsterDraw.texSource = texSource;
  DG.art.monsterDraw.displayHeight = displayHeight;

  DG.art.monsters = {
    defs,
    has: (id) => !!defs[id],
    displayHeight,
    draw,
    drawEffect,
    drawFxSkin,
    preload,
    stats
  };
})();
