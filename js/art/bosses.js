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
    reaper: { src: 'assets/bosses/reaper.png', height: 260, kind: 'reaper', glow: '#8b5fd6' },
    goatbrute: { src: 'assets/bosses/goatbrute.png', height: 244, kind: 'goat', glow: '#c07be0' },
    mawfish: { src: 'assets/bosses/mawfish.png', height: 240, kind: 'maw', glow: '#e0666a' },
    croc: { src: 'assets/bosses/croc.png', height: 236, kind: 'croc', glow: '#93d47a' },
    mushroomgun: { src: 'assets/bosses/mushroomgun.png', height: 240, kind: 'hierophant', glow: '#ffcf7a' },
    golem: { src: 'assets/bosses/golem.png', height: 264, kind: 'golem', glow: '#7fd8f0' },
    eyehorror: { src: 'assets/bosses/eyehorror.png', height: 244, kind: 'eye', glow: '#f0d060' },
    mawflowerking: { src: 'assets/bosses/mawflowerking.png', height: 250, kind: 'maw', glow: '#e05a7a' },
    cauldron: { src: 'assets/bosses/cauldron.png', height: 240, kind: 'cauldron', glow: '#ffa54a' },
    crystalcrab: { src: 'assets/bosses/crystalcrab.png', height: 232, kind: 'crystal', glow: '#b877e0' },
    pinkdemon: { src: 'assets/bosses/pinkdemon.png', height: 244, kind: 'demon', glow: '#ff7aa0' },
    pumpkinlord: { src: 'assets/bosses/pumpkinlord.png', height: 248, kind: 'cauldron', glow: '#ff9a3c' },
    octoking: { src: 'assets/bosses/octoking.png', height: 252, kind: 'octo', glow: '#b07ae0' },
    mummyking: { src: 'assets/bosses/mummyking.png', height: 238, kind: 'mummy', glow: '#b8c0c8' },
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
    s.img.src = src;
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
    const s = def.src ? source(def.src) : null;
    const t = (opts && opts.t) || 0;
    const cast = (opts && opts.cast) || m.cast;
    const seed = m.seed || 0;
    const h = displayHeight(m);
    const w = s.ready ? h * (s.w / s.h) : h * 0.82;

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
    if (s.ready) {
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
        if (d && d.src) source(d.src);
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
      return !!(d && d.src && source(d.src).ready);
    }
  };
})();
