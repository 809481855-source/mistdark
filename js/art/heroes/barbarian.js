/* 角色美术 · 野蛮人（独立模块）：
 * 头 + 身体 + 全职业公用脚 + 武器（双斧）+ 圆点手
 * 层级：双脚 → 身体 → 头 → 武器 → 手（最前）
 * 待机呼吸/眨眼与游侠保持同一套节奏；脚不浮动
 */
(function () {
  const DG = window.DG;
  const BASE = 'assets/hero/barbarian/';
  const VERSION = '?v=barbarian-compose-20261120';

  // 分件落点（脚底为原点：脚底 = y 0）
  // 头 / 身体 / 武器按资源原始尺寸等比放大 30%；手、脚保持与游侠一致不放大
  const parts = {
    // px/py 为旋转支点：头绕颈部、身体绕髋部
    head: { file: 'head.png', x: -64.85, y: -190.7, w: 139.7, h: 117.7, px: 0, py: -85, img: null },
    body: { file: 'body.png', x: -49.5, y: -103, w: 99, h: 91, px: 0, py: -20, img: null },
    legL: { file: 'leg.png', x: -23, y: -34, w: 13, h: 34, px: -18, py: -31, img: null },
    legR: { file: 'leg.png', x: 10, y: -34, w: 13, h: 34, px: 18, py: -31, img: null }
  };
  // 武器：gx/gy 为握持点（斧柄中段），武器绕该点旋转；图片尺寸保持原图，缩放见 HANDS.scale
  const weapon = { file: 'weapon.png', w: 86, h: 42, gx: 30, gy: 18, img: null };
  const hand = { file: 'hand.png', w: 20, h: 22, img: null };

  // 双手与两把斧子（对照角色拼接效果图：右手斧朝右上、斧头在颊侧，
  // 左手斧垂向右下、斧头落到腿边）
  // 手点位置随身体放大 30%，手本身尺寸不变；斧子等比放大 30%
  const HANDS = {
    right: { x: 58.5, y: -49.5, rot: -0.98, scale: 1.30 },
    left: { x: -52, y: -52, rot: 1.00, scale: 1.30 }
  };

  // 赶路（走路）姿态：两手同一水平线（比待机下移 15px）、各自向中间收 20px，
  // 沿弧线左右摆 ±5°；双斧朝向统一并跟手一起摆
  const WALK_HAND_Y = -45;
  const WALK_HAND_X_R = 38.5;
  const WALK_HAND_X_L = -32;
  // 走路时双斧朝向（左右可分别微调）：0° = 朝右，-90° = 竖直朝上，90° = 竖直朝下，180° = 朝左
  const WALK_ROT_R = -25 * Math.PI / 180;
  const WALK_ROT_L = -25 * Math.PI / 180;
  const WALK_SWAY = 8 * Math.PI / 180;
  // 旋风时身体与斧头绕身体中心旋转，头部与双脚不参与
  const BODY_CY = -57.5;

  let pending = 0;
  // 单个部件加载失败时重试一次：微信弱网或缓存半包很容易只丢一张图，
  // 重试仍失败则放弃，draw 会拒绝绘制缺头/缺身体的半成品
  function loadImg(p, url) {
    pending++;
    const img = new Image();
    img.onload = () => { p.img = img; pending--; };
    img.onerror = () => {
      if (p._retried) { pending--; return; }
      p._retried = true;
      img.src = url + '&retry=1';
    };
    img.src = url;
  }
  Object.keys(parts).forEach(id => loadImg(parts[id], BASE + parts[id].file + VERSION));
  [weapon, hand].forEach(p => loadImg(p, BASE + p.file + VERSION));

  // 劈砍刀光：不用贴图，直接按斧刃末端真实扫过的圆弧生成月牙形刀光。
  // 右手斧的手点始终绕"两手中点"旋转，刃尖到该点的距离恒定，
  // 所以斧刃轨迹就是一段标准圆弧——刀光画在同一条圆弧上，天然贴合、不会错位。
  const TIP_IMG = { x: 79, y: 35 };   // 斧刃尖端在武器图上的像素位置（86×42，握持点 30,18）
  const SLASH_A0 = -2.95;             // 起弧角（与蓄力最高点对齐，整刀扫过约 271°）
  const SLASH_A1 = 1.78;              // 收弧角（略过挥砍末端，收势更长）
  const SLASH_FADE = 0.16;            // 收弧后的淡出时长（秒）
  const SLASH_R = 1.00;               // 外弧半径 = 斧刃末端轨迹本身（刀光从斧刃末梢挥出，不外扩）
  const SLASH_THICK = 0.30;           // 刀光最大厚度（相对圆弧半径）
  let slashGeo = null;                // 当前月牙几何（收弧后冻结，淡出期间不跳变）
  let slashFadeAt = -1;               // 开始淡出的时刻，-1 表示还在画弧

  // 左手斧刀光：左手不绕中点转，斧头绕自己的手点旋转，所以刃尖轨迹是一个正圆；
  // 比右手小一号（更细、更淡、收弧略早），不抢主手的视觉
  const SLASH_L_A0 = 0.50;            // 左手起弧（斧刃在右下，向上撩）
  const SLASH_L_A1 = -1.80;           // 左手收弧（斧刃到右上，与右手下劈交叉成 X）
  const SLASH_L_R = 1.00;             // 外弧同样贴刃尖
  const SLASH_L_THICK = 0.28;         // 刀光厚度（右手 0.30）
  const SLASH_L_ALPHA = 0.95;         // 整体不透明度（右手 1）
  let slashGeoL = null, slashFadeAtL = -1, slashAlphaL = 0;

  // 旋风刀光素材：512×512 透明图，弧线圆心在 (0.5186, 0.4738)、半径 0.4279（实测拟合）
  const whirlFx = { img: null, cx: 0.5186, cy: 0.4738, r: 0.4279, tip: 1.50 };
  pending++;
  {
    const img = new Image();
    img.onload = () => { whirlFx.img = img; pending--; };
    img.onerror = () => { pending--; };
    img.src = 'assets/fx/barb-whirl.png?v=white-20261122b';
  }

  // 头部眼睛位置（head.png 图像坐标，头部当前按 1.43 倍绘制），眨眼时用暗色椭圆遮住
  const EYES = { x: 77, y: 75.9, rx: 18.7, ry: 6.27 };
  const BLINK_PERIOD = 3.2, BLINK_DUR = 0.18;
  // 状态切换过渡时长（秒）与上一帧显示值缓存：腿、手一起参与过渡，避免切换瞬间单点瞬跳
  const TRANS_TIME = 0.12;
  const disp = {
    bodyX: 0, bodyY: 0, bodyRot: 0, headX: 0, headY: 0, headRot: 0, hop: 0,
    legL: 0, legR: 0, legLX: 0, legLY: 0, legRX: 0, legRY: 0,
    handRX: 0, handRY: 0, handLX: 0, handLY: 0, rotR: 0
  };
  const trans = {
    t: 1, bodyX: 0, bodyY: 0, bodyRot: 0, headX: 0, headY: 0, headRot: 0, hop: 0,
    legL: 0, legR: 0, legLX: 0, legLY: 0, legRX: 0, legRY: 0,
    handRX: 0, handRY: 0, handLX: 0, handLY: 0
  };
  let lastState = null, lastT = null, lastWasWhirl = false, dispInited = false, lastAtkT = -1;
  // 旋风出入接力：记录离开轨道瞬间的双手中点、朝向与旋身角，退出后 0.12 秒滑回手心
  const WHIRL_OUT = 0.12;
  const whirlExit = { t: 1, x: 0, y: 0, rot: 0, lx: 0, ly: 0, lrot: 0, spin: 0 };
  let whirlLast = { x: 0, y: 0, rot: 0 };
  let whirlLastL = { x: 0, y: 0 };
  let whirlSpin = 0;
  // 战吼收势后接回旋风：重新用 0.2 秒从手心滑入轨道，避免从举斧姿态一帧跳回旋身
  let whirlReenterT = 1;
  // 双斧惯性：斧头朝向以指数方式追赶手部朝向，快速挥砍时产生拖尾与过冲
  const AXE_TAU = 0.016, AXE_MAX = 0.2;
  const axeFollow = { r: 0, l: 0, ready: false };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // 角度归一化到 (-π, π]：旋身角会累加很多圈，收尾时必须走最短弧收势，
  // 否则斧头会在 0.12 秒内倒转好几圈，看着就是"收尾时乱转/卡一下"
  const wrapPi = (a) => {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  };
  const smooth = k => k * k * (3 - 2 * k);

  function blinkOf(t) {
    const phase = t % BLINK_PERIOD;
    if (phase > BLINK_DUR) return 0;
    const k = phase / BLINK_DUR;
    return k < 0.45 ? smooth(k / 0.45) : smooth((1 - k) / 0.55);
  }

  // 连击节奏：本轮第一刀命中冻结 28ms；两刀间隔 < 1.3 秒视为连击，后续刀缩到 12ms
  let comboStart = -99, comboPrevStart = -99, comboLastRaw = -1;
  function comboFreeze(raw, t) {
    if (comboLastRaw < 0 || raw + 0.02 < comboLastRaw) { comboPrevStart = comboStart; comboStart = t; }
    comboLastRaw = raw;
    return (t - comboPrevStart) < 1.3 ? 0.012 / 0.46 : 0.028 / 0.46;
  }

  // Catmull-Rom 样条：速度在关键帧处连续，不会像 smoothstep 那样每个关键帧都刹停
  function key(t, frames) {
    const n = frames.length;
    if (t <= frames[0][0]) return frames[0][1];
    if (t >= frames[n - 1][0]) return frames[n - 1][1];
    let i = 0;
    while (i < n - 2 && t > frames[i + 1][0]) i++;
    const p1 = frames[i], p2 = frames[i + 1];
    const dt = p2[0] - p1[0];
    const k = (t - p1[0]) / dt;
    // 首尾切线取 0（起止不甩尾）；两键等值时视为停顿段，整段静止
    const flat = p1[1] === p2[1];
    const p0 = frames[Math.max(0, i - 1)], p3 = frames[Math.min(n - 1, i + 2)];
    const m1 = flat || i === 0 ? 0 : (p2[1] - p0[1]) / (p2[0] - p0[0]);
    const m2 = flat || i + 2 >= n ? 0 : (p3[1] - p1[1]) / (p3[0] - p1[0]);
    const k2 = k * k, k3 = k2 * k;
    return (2 * k3 - 3 * k2 + 1) * p1[1] + (k3 - 2 * k2 + k) * dt * m1
      + (-2 * k3 + 3 * k2) * p2[1] + (k3 - k2) * dt * m2;
  }

  function drawPart(ctx, id, dx, dy, rot) {
    const p = parts[id];
    if (!p.img) return;
    if (rot) {
      ctx.save();
      ctx.translate(p.px + dx, p.py + dy);
      ctx.rotate(rot);
      ctx.drawImage(p.img, p.x - p.px, p.y - p.py, p.w, p.h);
      ctx.restore();
    } else {
      ctx.drawImage(p.img, p.x + dx, p.y + dy, p.w, p.h);
    }
  }

  // 斧子：以握持点为轴旋转、缩放
  function drawWeapon(ctx, cfg, x, y, rot) {
    if (!weapon.img) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(cfg.scale, cfg.scale);
    ctx.drawImage(weapon.img, -weapon.gx, -weapon.gy, weapon.w, weapon.h);
    ctx.restore();
  }

  function drawHand(ctx, x, y) {
    if (!hand.img) return;
    ctx.drawImage(hand.img, x - hand.w / 2, y - hand.h / 2, hand.w, hand.h);
  }

  // 刃尖扫过的圆弧：圆心就是手点的旋转中心（两手中点反解回来），
  // 半径取"圆心→斧刃尖端"的实际距离，画出来的弧必然压在斧刃末端上
  function slashArc(rhx, rhy, wrot, sr) {
    const mx = (HANDS.right.x + HANDS.left.x) / 2;
    const my = (HANDS.right.y + HANDS.left.y) / 2;
    const dx = HANDS.right.x - mx, dy = HANDS.right.y - my;
    const cs = Math.cos(sr), sn = Math.sin(sr);
    const cx = rhx - (dx * cs - dy * sn);
    const cy = rhy - (dx * sn + dy * cs);
    const sc = HANDS.right.scale;
    const ox = (TIP_IMG.x - weapon.gx) * sc, oy = (TIP_IMG.y - weapon.gy) * sc;
    const tx = rhx + ox * Math.cos(wrot) - oy * Math.sin(wrot);
    const ty = rhy + ox * Math.sin(wrot) + oy * Math.cos(wrot);
    return { cx, cy, r: (Math.hypot(tx - cx, ty - cy) || 1) * SLASH_R, ang: Math.atan2(ty - cy, tx - cx) };
  }

  // 左手斧刃末端轨迹：斧头绕左手点自转，刃尖到手的距离恒定，轨迹就是一整圆
  function slashArcL(lhx, lhy, wrot) {
    const sc = HANDS.left.scale;
    const ox = (TIP_IMG.x - weapon.gx) * sc, oy = (TIP_IMG.y - weapon.gy) * sc;
    return { cx: lhx, cy: lhy, r: Math.hypot(ox, oy) * SLASH_L_R, ang: wrot + Math.atan2(oy, ox) };
  }

  // 刀光：只画武器扫过的那道弧——尾端收成针尖、刃口一侧白热、外层宽弧柔光。
  // 参考成熟 2D 动作游戏的做法：加色高光 + 低透明度宽弧，避免出现“固体红帆”的塑料感。
  function drawSlash(ctx, g, a0, a1, alpha, thick) {
    if (Math.abs(a1 - a0) < 0.05) return;
    thick = thick || SLASH_THICK;
    const N = 34, span = a1 - a0, absSpan = Math.abs(span);
    // 弧太短时先不画：刃口刚开始移动时若立刻留痕，会变成头后一坨红色光斑
    if (absSpan < 0.5) return;
    // 起手阶段按已扫过的角度渐显，刃口压下来后才是一条完整刀光
    const grow = Math.pow(Math.min(1, (absSpan - 0.5) / 0.75), 0.85);
    // 越靠近刃尖越宽、越亮；尾部迅速收细到几乎为零
    const taper = (k) => Math.pow(k, 1.35) * (1 - 0.85 * Math.pow(k, 6));
    const fade = (k) => 0.02 + 0.98 * Math.pow(k, 1.25);
    // out：0.5 表示外缘正好贴住刃尖轨迹；大于 0.5 时向外溢出，形成柔光
    const band = (wMul, comp, style, alphaMul, out) => {
      ctx.save();
      ctx.globalCompositeOperation = comp;
      ctx.lineCap = 'round';
      for (let i = 0; i < N; i++) {
        const k0 = i / N, k1 = (i + 1) / N, k = (k0 + k1) * 0.5;
        const w = g.r * thick * grow * wMul * taper(k);
        if (w < 0.3) continue;
        const rr = g.r + w * (out - 0.5);
        ctx.globalAlpha = alpha * alphaMul * fade(k) * grow;
        ctx.strokeStyle = style(k);
        ctx.lineWidth = w;
        ctx.beginPath();
        const s0 = a0 + span * k0 - 0.004, s1 = a0 + span * k1 + 0.004;
        // 反向挥砍时角度递减，统一按小角→大角画短弧，避免绕远路
        ctx.arc(g.cx, g.cy, rr, Math.min(s0, s1), Math.max(s0, s1));
        ctx.stroke();
      }
      ctx.restore();
    };
    // 1 外层柔光：宽而淡，让刀光边缘融进地面
    band(2.6, 'source-over', () => 'rgb(206,42,18)', 0.10, 0.72);
    band(1.6, 'source-over', () => 'rgb(236,58,26)', 0.15, 0.62);
    // 2 主体：暗红 → 亮橙红，尾部随弧长渐隐
    band(1.0, 'source-over', (k) => {
      const t = Math.min(1, k / 0.85);
      const r = Math.round(150 + 105 * Math.pow(t, 1.4));
      const gg = Math.round(12 + 106 * Math.pow(t, 1.7));
      const b = Math.round(8 + 54 * Math.pow(t, 2));
      return `rgb(${r},${gg},${b})`;
    }, 0.62, 0.5);
    // 3 刃口白热芯：贴着外缘走，加色发光；越靠近尾部越淡，避免整条变成霓虹管
    band(0.24, 'lighter', (k) => {
      const t = Math.min(1, k / 0.9);
      const gg = Math.round(170 + 70 * t);
      const b = Math.round(110 + 120 * t);
      return `rgb(255,${gg},${b})`;
    }, 0.5, 0.5);
    band(0.10, 'lighter', () => 'rgb(255,246,232)', 0.45, 0.5);
    // 4 刃尖小爆点：只留一点点亮芯，不做大光球
    const hx = g.cx + Math.cos(a1) * g.r, hy = g.cy + Math.sin(a1) * g.r;
    const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, g.r * 0.10);
    rg.addColorStop(0, 'rgba(255,226,196,0.42)');
    rg.addColorStop(0.45, 'rgba(255,96,44,0.22)');
    rg.addColorStop(1, 'rgba(200,20,10,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * grow * grow;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(hx, hy, g.r * 0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 姿态：与游侠同一套呼吸（躯干 1.5s ±2px / 头 1.2s ±3px），脚始终不动
  function computePose(o) {
    const state = o.state || 'idle';
    const t = o.t || 0;
    const pose = {
      bodyX: 0, bodyY: 0, headX: 0, headY: 0,
      handX: 0, handY: 0, legL: 0, legR: 0,
      swing: 0, sway: 0, fanL: 0, fanR: 0,
      thrust: 0, atkRotR: 0, atkRotL: 0, liftY: 0, hop: 0,
      bodyRot: 0, headRot: 0,
      legLX: 0, legLY: 0, legRX: 0, legRY: 0,
      handRX: HANDS.right.x, handRY: HANDS.right.y,
      armSwayX: 0, armSwayY: 0, weaponSway: 0,
      roarDX_R: 0, roarDX_L: 0, roarRotR: 0, roarRotL: 0
    };
    if (state === 'whirl') {
      // 旋风：双腿保持与主城完全一致的走路动作，仅步频随移速提升而加快
      const ph = o.walkPhase || 0;
      const stride = Math.sin(ph);
      const legs = DG.art.walkLegPose(ph, 23, -10);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
      pose.bodyY = Math.abs(stride) * 0.55;
      pose.headY = -Math.abs(stride) * 0.35;
      // 旋身时风压把影子撑开、略淡
      pose.shadowScale = 1.1;
      pose.shadowAlpha = 0.82;
    } else if (state === 'walk') {
      const ph = o.walkPhase || 0;
      const stride = Math.sin(ph);
      // 台步式走法：两腿先向身体中线收拢并成平行"筷子状"，再左右交替越过中线交叉迈步
      // 动作参数统一由 DG.art.walkLegPose 提供，全职业以此为准
      const legs = DG.art.walkLegPose(ph, 23, -10);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
      // 躯干：每步一次下沉 + 左右重心偏移 + 轻微前倾，并随步幅小幅起伏
      // 用 sin² 代替 |sin|，触地相位不再有速度尖角
      pose.bodyY = Math.sin(ph) ** 2 * 1.1;
      pose.bodyX = stride * 1.6;
      pose.bodyRot = 0.038 + Math.sin(ph * 2 + 0.7) * 0.013;
      // 蹦跶：双腿并拢（ph=0/π）时腾空最高，双腿张开时落地
      pose.hop = Math.cos(ph) ** 2 * 6;
      // 头部：反向下沉稳住视线，横向位移与俯仰都滞后躯干约 0.4rad
      pose.headY = -(Math.sin(ph - 0.35) ** 2) * 0.9;
      // 头部比身体晚 0.3rad 到达最高点，落地时略慢半拍
      pose.headY += Math.cos(ph - 0.3) ** 2 * 6 - pose.hop;
      pose.headX = Math.sin(ph - 0.45) * 1.0;
      pose.headRot = -0.55 * pose.bodyRot + Math.sin(ph * 2 - 0.4) * 0.008;
      // 赶路：两手左右同步摆动（弧线位移），双斧朝统一方向随手摆 ±5°
      const ang = stride * WALK_SWAY;
      pose.armSwayX = Math.sin(ang) * 52;
      pose.armSwayY = (1 - Math.cos(ang)) * 52;
      pose.weaponSway = ang;
    } else if (state === 'attack') {
      // 旋风刚收尾时直接从"已抬手"的相位起手：不再先把手收回身侧、再重新抬一次
      const kick = whirlExit.t < 1 ? 0.16 * (1 - smooth(whirlExit.t)) : 0;
      const raw = clamp((o.attackT || 0) / (o.atkDur || 0.46) + kick, 0, 1);
      // 命中冻结：本轮第一刀停 28ms，连击中的后续刀缩到 12ms，避免连打时"顿顿顿"
      const fz = comboFreeze(raw, o.t || 0);
      const f0 = 0.60, f1 = f0 + fz;
      const p = raw <= f0 ? raw
        : raw <= f1 ? f0
          : f0 + (raw - f1) * ((1 - f0) / (1 - f1));
      // 头部比躯干滞后约 1~2 帧：整条头部曲线后移 0.04
      const hp = clamp(p - 0.04, 0, 1);
      // 抬手蓄力（略后撤并短暂停顿）→ 向前挥砍（手与斧同时前伸 16px）→ 复原
      pose.thrust = key(p, [[0, 0], [0.30, -6], [0.36, -6], [0.56, 24], [0.70, 22], [1, 0]]);
      // 起手先整体抬高双手与斧子并顿一帧，随后随弧线大幅往下砍
      pose.liftY = key(p, [[0, 0], [0.18, -28], [0.30, -42], [0.36, -42], [0.46, -18], [0.56, 0], [1, 0]]);
      // 躯干：蓄力拔高后坐 → 命中下沉前送 → 收势回弹
      //（负值 = 向上/向后，正值 = 向下/向前）
      pose.bodyY = key(p, [[0, 0], [0.12, -1], [0.30, -4], [0.44, 0], [0.56, 6], [0.62, 8], [0.74, 4], [0.86, -1.5], [1, 0]]);
      pose.bodyX = key(p, [[0, 0], [0.12, -1], [0.30, -2], [0.44, 1], [0.56, 3], [0.62, 4], [0.74, 2], [0.86, -0.5], [1, 0]]);
      // 躯干俯仰：后仰 4° → 前倾 5.7° → 轻微回摆
      pose.bodyRot = key(p, [[0, 0], [0.12, -0.04], [0.30, -0.14], [0.44, 0.06], [0.56, 0.21], [0.62, 0.245], [0.74, 0.11], [0.86, -0.025], [1, 0]]);
      // 头部：位移跟随躯干并迟 0.04 追上来，命中后再压一下形成过冲
      const headDY = key(hp, [[0, 0], [0.12, 0.6], [0.30, 1.5], [0.44, 0.5], [0.56, -2.5], [0.64, -1], [0.70, 1.5], [0.82, 0.4], [1, 0]]);
      pose.headY = pose.bodyY + headDY;
      pose.headX = pose.bodyX + key(hp, [[0, 0], [0.30, -1], [0.44, 0], [0.56, 1], [0.62, 3], [0.74, 1], [0.86, -0.5], [1, 0]]);
      // 头部相对躯干的俯仰：蓄力时反向补偿（头比背更直立），命中时略微领先
      pose.headRot = key(hp, [[0, 0], [0.12, 0.02], [0.30, 0.087], [0.44, 0.06], [0.56, 0.04], [0.62, 0.035], [0.74, 0.018], [0.86, -0.006], [1, 0]]);
      // 右手：以两手连线中点为圆点扇形挥砍约 270°，弧线拆成多段走"甩鞭"曲线，末端带过冲
      const sr = key(p, [[0, 0], [0.18, -2.10], [0.30, -2.90], [0.36, -2.90],
        [0.42, -0.70], [0.48, 0.72], [0.52, 1.32], [0.56, 1.72], [0.66, 1.81], [0.78, 1.30], [1, 0]]);
      // 左手：反向向上撩砍（右下起手 → 右上方收势），与右手下劈交叉成 X 形刀锋
      const sl = key(p, [[0, 0], [0.18, 0.30], [0.30, 0.50], [0.36, 0.50],
        [0.42, -0.20], [0.48, -0.90], [0.52, -1.40], [0.56, -1.75], [0.66, -1.80], [0.78, -1.30], [1, 0]]);
      // 右手额外前伸：挥砍时整条手臂再向外探出一截，刀锋扫得更开
      pose.reachR = key(p, [[0, 0], [0.18, 2], [0.30, 4], [0.36, 4], [0.46, 12], [0.56, 16], [0.70, 12], [0.86, 3], [1, 0]]);
      // 左手整体上提并向内交叉：与右手形成 X 形刀锋
      pose.liftL = key(p, [[0, 0], [0.18, -18], [0.30, -30], [0.36, -30], [0.44, -28], [0.56, -40], [0.66, -36], [0.78, -14], [1, 0]]);
      pose.crossL = key(p, [[0, 0], [0.18, 4], [0.30, 8], [0.36, 8], [0.46, 26], [0.56, 46], [0.70, 34], [0.86, 8], [1, 0]]);
      pose.atkRotR = sr;
      pose.atkRotL = sl;
      // 右手点绕两手中点旋转后的位置（圆点即两手中间）
      const mx = (HANDS.right.x + HANDS.left.x) / 2;
      const my = (HANDS.right.y + HANDS.left.y) / 2;
      const dx = HANDS.right.x - mx, dy = HANDS.right.y - my;
      const cs = Math.cos(sr), sn = Math.sin(sr);
      pose.handRX = mx + dx * cs - dy * sn;
      pose.handRY = my + dx * sn + dy * cs;
    } else if (state === 'roar') {
      // 战吼：先双手把双斧举过头顶蓄力（斧刃朝上），释放瞬间双手向外炸开、身体前顶，
      // 最后整体收势回待机基础姿态；全程由场景 roar.t 驱动的连续曲线，不跳帧
      const ch = o.roarCharge || 0.42;
      const tot = o.roarTotal || 0.95;
      const rt = o.roarT || 0;
      // 蓄力：0→1 平滑举到顶点
      const cq = smooth(clamp(rt / ch, 0, 1));
      // 爆发：跨过 charge 后 0.12 秒冲开
      const bs = rt > ch ? smooth(clamp((rt - ch) / 0.12, 0, 1)) : 0;
      // 收势：0.72 秒后回落到基础姿态
      const rec = smooth(clamp((rt - 0.72) / Math.max(0.08, tot - 0.72), 0, 1));
      const act = cq * (1 - rec);
      const burst = bs * (1 - rec);
      // 蓄力到顶的轻微颤抖（约 11Hz）：只抖手与躯干，脚钉地
      const shiver = Math.sin(t * 68) * cq * (1 - bs) * 0.9;
      // 双手：上举并向中间收拢；爆发时向下、向外张开
      pose.liftY = -108 * act + 24 * burst + shiver * 1.2;
      pose.roarDX_R = -26 * act + 50 * burst;
      pose.roarDX_L = 24 * act - 48 * burst;
      // 躯干：蓄力下沉后仰，爆发前顶
      pose.bodyY = 4 * act - 2 * burst;
      pose.bodyX = -2 * act + 3 * burst + shiver * 0.5;
      pose.bodyRot = -0.15 * act + 0.27 * burst;
      // 头部：蓄力微仰、爆发后甩，比躯干更稳
      pose.headY = pose.bodyY - 2 * act + shiver * 0.5;
      pose.headX = pose.bodyX;
      pose.headRot = -0.02 * act - 0.30 * burst;
      // 双腿撑开，配合下蹲
      pose.legLX = -3 * act;
      pose.legRX = 3 * act;
      // 双斧：蓄力竖直朝上（略呈 V 字），爆发向外甩开
      pose.roarRotR = HANDS.right.rot - 0.34 * act + 0.58 * burst;
      pose.roarRotL = HANDS.left.rot - 2.57 * act - 0.58 * burst;
    } else {
      pose.bodyY = Math.sin(t * (Math.PI * 2 / 1.5)) * 2.0;
      pose.headY = Math.sin(t * (Math.PI * 2 / 1.2)) * 3.0;
      // 武器随手小幅摆动，箭尖量级的呼吸幅度
      pose.sway = Math.sin(t * (Math.PI * 2 / 1.5)) * 0.021;
      // 双斧各绕手点扇形上下浮动：左手 ±10°、周期 1.2s；右手 ±20°、周期 1.5s
      const DEG = Math.PI / 180;
      pose.fanL = Math.sin(t * (Math.PI * 2 / 1.2)) * (10 * DEG);
      pose.fanR = Math.sin(t * (Math.PI * 2 / 1.5)) * (20 * DEG);
    }
    // 统一规则：战斗中只要在移动，双腿一律播放与主城相同的走路动作，
    // 攻击/战吼/旋风/震动波等任何状态都不得冻结或替换腿部动作
    if (o.moving) {
      const legs = DG.art.walkLegPose(o.walkPhase || 0, 23, -10);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
    }
    return pose;
  }

  function draw(ctx, x, y, opts) {
    // 头或身体还没到位时整只不画，绝不出现“有身体没头”的半成品
    if (pending || !parts.head.img || !parts.body.img) return;
    const o = opts || {};
    const pose = computePose(o);
    const state = o.state || 'idle';
    // 状态切换过渡：把切换瞬间的旧姿态差值在 TRANS_TIME 内衰减掉，避免走路/待机/出刀之间硬切
    const nowT = o.t || 0;
    let dts = lastT === null ? 0 : nowT - lastT;
    if (!(dts > 0) || dts > 0.1) dts = 0;
    lastT = nowT;
    let justSwitched = false;
    // 攻击时间轴回卷：攻速较高时新一刀会在上一刀收势前出手，attackT 归零。
    // 若不做过渡，手与斧会在一帧内跳回起手位，看起来就是"顿一下"。
    const atkNow = o.attackT || 0;
    const rewound = state === 'attack' && lastState === 'attack' && atkNow + 0.05 < lastAtkT;
    lastAtkT = atkNow;
    if (lastState === null) {
      // 首次绘制直接对齐，不做过渡
      lastState = state;
      trans.t = 1;
    } else if (state !== lastState || rewound) {
      trans.t = 0;
      justSwitched = true;
      trans.bodyX = disp.bodyX - pose.bodyX;
      trans.bodyY = disp.bodyY - pose.bodyY;
      trans.bodyRot = disp.bodyRot - pose.bodyRot;
      trans.headX = disp.headX - pose.headX;
      trans.headY = disp.headY - pose.headY;
      trans.headRot = disp.headRot - pose.headRot;
      trans.hop = disp.hop - pose.hop;
      // 双腿同样参与过渡（走路↔待机↔旋风之间不再换腿型瞬跳）
      trans.legL = disp.legL - pose.legL;
      trans.legR = disp.legR - pose.legR;
      trans.legLX = disp.legLX - pose.legLX;
      trans.legLY = disp.legLY - pose.legLY;
      trans.legRX = disp.legRX - pose.legRX;
      trans.legRY = disp.legRY - pose.legRY;
      if (state !== 'whirl' && lastWasWhirl) {
        whirlExit.t = 0;
        whirlExit.x = whirlLast.x;
        whirlExit.y = whirlLast.y;
        whirlExit.rot = whirlLast.rot;
        // 左手从旋身轨道位置收出，而不是凭空跳回左侧手心
        whirlExit.lx = whirlLastL.x;
        whirlExit.ly = whirlLastL.y;
        whirlExit.lrot = whirlLast.rot;
        whirlExit.spin = whirlSpin;
      }
      // 战吼结束、旋风还在持续：手从举斧位置重新滑入旋身轨道
      if (state === 'whirl' && lastState === 'roar') whirlReenterT = 0;
      lastWasWhirl = state === 'whirl';
      lastState = state;
    }
    trans.t = Math.min(1, trans.t + (dts || 1 / 60) / (rewound ? 0.08 : TRANS_TIME));
    whirlExit.t = Math.min(1, whirlExit.t + (dts || 1 / 60) / WHIRL_OUT);
    whirlReenterT = Math.min(1, whirlReenterT + (dts || 1 / 60) / 0.2);
    const ew = 1 - smooth(trans.t);
    pose.bodyX += trans.bodyX * ew;
    pose.bodyY += trans.bodyY * ew;
    pose.bodyRot += trans.bodyRot * ew;
    pose.headX += trans.headX * ew;
    pose.headY += trans.headY * ew;
    pose.headRot += trans.headRot * ew;
    pose.hop += trans.hop * ew;
    pose.legL += trans.legL * ew;
    pose.legR += trans.legR * ew;
    pose.legLX += trans.legLX * ew;
    pose.legLY += trans.legLY * ew;
    pose.legRX += trans.legRX * ew;
    pose.legRY += trans.legRY * ew;
    disp.bodyX = pose.bodyX; disp.bodyY = pose.bodyY; disp.bodyRot = pose.bodyRot;
    disp.headX = pose.headX; disp.headY = pose.headY; disp.headRot = pose.headRot;
    disp.hop = pose.hop;
    disp.legL = pose.legL; disp.legR = pose.legR;
    disp.legLX = pose.legLX; disp.legLY = pose.legLY;
    disp.legRX = pose.legRX; disp.legRY = pose.legRY;
    // 位移量化到四分之一像素，避免慢速呼吸时位图反复重采样发糊
    const qv = v => Math.round(v * 4) / 4;
    const by = qv(pose.bodyY);
    const hx = qv(pose.handX), hyy = qv(pose.handY);
    const scale = o.scale == null ? 1 : o.scale;
    const mirror = o.flip ? -1 : 1;

    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    ctx.scale(scale * mirror, scale);

    if (o.shadow) {
      // 腾空越高，影子越小越淡
      const hop = pose.hop || 0;
      const shrink = (1 - hop * 0.03) * (pose.shadowScale || 1);
      ctx.save();
      ctx.scale(1, 0.26);
      ctx.fillStyle = 'rgba(0,0,0,' + ((0.38 - hop * 0.012) * (pose.shadowAlpha || 1)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, 46 * shrink, 12 * shrink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 蹦跶：整体（含双脚）离地，影子留在原地
    if (pose.hop) ctx.translate(0, -qv(pose.hop));

    // 手点（随身体浮动、攻击前伸与赶路摆动一起移动）
    const walking = o.state === 'walk';
    const attacking = o.state === 'attack';
    const roaring = o.state === 'roar';
    const swayX = pose.armSwayX, swayY = pose.armSwayY;
    const thrust = attacking ? pose.thrust : 0;
    // 举斧蓄力同样需要整体抬手：吼叫与普攻共用 liftY 通道
    const lift = attacking || roaring ? pose.liftY : 0;
    // 躯干绕髋部旋转时颈部落点会横向偏移，头部按该位移跟随，避免头身分离
    const br = pose.bodyRot || 0;
    const neckDY = parts.head.py - parts.body.py;
    const nx = -neckDY * Math.sin(br);
    const ny = -neckDY * (1 - Math.cos(br));
    const bx = qv(pose.bodyX);
    const rHand = {
      x: (walking ? WALK_HAND_X_R : attacking ? pose.handRX : HANDS.right.x) + hx + bx + swayX + thrust + (attacking ? pose.reachR : 0) + (roaring ? pose.roarDX_R : 0),
      y: (walking ? WALK_HAND_Y : attacking ? pose.handRY : HANDS.right.y) + by + hyy + swayY + lift
    };
    const lHand = {
      x: (walking ? WALK_HAND_X_L : HANDS.left.x) + hx + bx + swayX + thrust + (attacking ? pose.crossL : 0) + (roaring ? pose.roarDX_L : 0),
      y: (walking ? WALK_HAND_Y : HANDS.left.y) + by + hyy + swayY + lift + (attacking ? pose.liftL : 0)
    };
    // 手点过渡：切换瞬间把手从上一姿态的位置滑到新姿态，攻击被打断也不会瞬跳
    if (justSwitched) {
      trans.handRX = disp.handRX - rHand.x;
      trans.handRY = disp.handRY - rHand.y;
      trans.handLX = disp.handLX - lHand.x;
      trans.handLY = disp.handLY - lHand.y;
    }
    rHand.x += trans.handRX * ew; rHand.y += trans.handRY * ew;
    lHand.x += trans.handLX * ew; lHand.y += trans.handLY * ew;
    disp.handRX = rHand.x; disp.handRY = rHand.y;
    disp.handLX = lHand.x; disp.handLY = lHand.y;
    // 赶路：双斧统一朝向随手摆；攻击：各绕自己的圆点扇挥；其余：呼吸浮动
    const rRot = walking
      ? WALK_ROT_R + pose.weaponSway
      : attacking
        ? HANDS.right.rot + pose.atkRotR
        : roaring
          ? pose.roarRotR
          : HANDS.right.rot + pose.sway + pose.fanR;
    const lRot = walking
      ? WALK_ROT_L + pose.weaponSway
      : attacking
        ? HANDS.left.rot + pose.atkRotL
        : roaring
          ? pose.roarRotL
          : HANDS.left.rot + pose.sway + pose.fanL;
    // 斧头惯性跟随：实际朝向以指数方式追赶手部朝向，快挥时斧刃自然拖后并过冲
    if (!axeFollow.ready) { axeFollow.r = rRot; axeFollow.l = lRot; axeFollow.ready = true; }
    else {
      const ak = 1 - Math.exp(-(dts > 0 ? dts : 1 / 60) / AXE_TAU);
      axeFollow.r += (rRot - axeFollow.r) * ak;
      axeFollow.l += (lRot - axeFollow.l) * ak;
    }
    let wRotR = rRot + Math.max(-AXE_MAX, Math.min(AXE_MAX, axeFollow.r - rRot));
    let wRotL = lRot + Math.max(-AXE_MAX, Math.min(AXE_MAX, axeFollow.l - lRot));

    // 旋风退场接力：0.12 秒内把双手与双斧从轨道位置滑回手心，
    // 并保留一小段切向惯性，收尾走弧线而不是直线急停
    if (whirlExit.t < 1) {
      const wk = smooth(whirlExit.t);
      const sw = (1 - wk) * (1 - wk);
      const tx = -Math.sin(whirlExit.spin) * 22 * sw;
      const ty = Math.cos(whirlExit.spin) * 7 * sw;
      rHand.x = whirlExit.x + (rHand.x - whirlExit.x) * wk + tx;
      rHand.y = whirlExit.y + (rHand.y - whirlExit.y) * wk + ty;
      lHand.x = whirlExit.lx + (lHand.x - whirlExit.lx) * wk + tx;
      lHand.y = whirlExit.ly + (lHand.y - whirlExit.ly) * wk + ty;
      wRotR = whirlExit.rot + wrapPi(wRotR - whirlExit.rot) * wk;
      // 左斧旋身期间隐藏，收尾时从同一条轨道滑出，避免整只手"凭空出现"
      wRotL = whirlExit.lrot + wrapPi(wRotL - whirlExit.lrot) * wk;
      disp.handRX = rHand.x; disp.handRY = rHand.y;
      disp.handLX = lHand.x; disp.handLY = lHand.y;
    }
    disp.rotR = wRotR;
    dispInited = true;

    // 旋风：躯干不做整身翻转，只做偏航挤压；斧头绕身体中心画椭圆轨迹，带刀光拖尾
    if (o.state === 'whirl') {
      const sp = o.spin || 0;
      // 起手 0.2 秒内从手心向外展开，和普通姿态无缝衔接（战吼后接回旋风同样重走这段展开）
      const bt = Math.min(1, Math.min(o.spinT || 0, whirlReenterT) / 0.2);
      const blend = bt * bt * (3 - 2 * bt);
      const cy = -45;                            // 轨迹中心压到腰腹，避免斧头钻到头盔后面
      const R = 118 * blend;
      const ax = Math.cos(sp) * R;
      const ay = cy + Math.sin(sp) * R * 0.32;
      // 斧刃比轨迹位置滞后约 22°，像被身体甩着走（0.15~0.35 之间可调）
      const DRAG = 0.38;
      const rt = sp - DRAG;
      const hpx = Math.sin(rt) * 5, hpy = Math.cos(rt) * 2.5;

      // 刀光：椭圆轨道直接按"手轨道 + 刃长"推出，亮头正好压在斧刃末端上
      // 刃尖相对斧柄不是纯径向（图内还有个 y 分量），必须把横向偏移和相位一起算进来：
      // 只取 x 分量会让刃尖轨迹被算成一个倾斜椭圆，看起来像斜着转。
      const tipDX = (TIP_IMG.x - weapon.gx) * HANDS.right.scale;   // 刃尖相对握持点的 x 偏移
      const tipDY = (TIP_IMG.y - weapon.gy) * HANDS.right.scale;   // 刃尖相对握持点的 y 偏移
      const reach = Math.hypot(tipDX, tipDY);                      // 握持点到刃尖的实际长度
      const tipPhase = Math.atan2(tipDY, tipDX);                   // 刃尖相对斧柄方向的相位
      // 净滞后 = 斧向拖后量 - 刃尖相位；接近 0 时刃尖轨迹就是标准水平椭圆
      const lag = DRAG - tipPhase;
      // 刃尖轨迹 = 手轨道（椭圆） + 刃长（圆）的合成，直接用仿射矩阵精确还原
      const csd = Math.cos(lag), snd = Math.sin(lag);
      const mA = R + reach * csd, mB = reach * snd;
      const mC = -reach * snd, mD = R * 0.32 + reach * csd;
      ctx.save();
      ctx.translate(0, cy);
      if (mA > 40 && whirlFx.img) {
        ctx.transform(mA, mC, mB, mD, 0, 0);
        const S = 1 / whirlFx.r;                     // 单位空间里让素材弧半径正好等于 1
        const ox = -whirlFx.cx * S, oy = -whirlFx.cy * S;
        // 亮头压在斧刃末端：素材亮头实测在 1.50 rad
        ctx.rotate(sp - whirlFx.tip);
        // 淡白外发光：以弧心为原点把同一张弧光素材外扩两层低透明度副本，
        // 只露出弧线外侧一小圈，形成柔和外发光，不额外加宽刀光本体
        ctx.globalAlpha = 0.16 * blend;
        ctx.drawImage(whirlFx.img, ox * 1.035, oy * 1.035, S * 1.035, S * 1.035);
        ctx.globalAlpha = 0.09 * blend;
        ctx.drawImage(whirlFx.img, ox * 1.07, oy * 1.07, S * 1.07, S * 1.07);
        ctx.globalAlpha = 0.95 * blend;
        ctx.drawImage(whirlFx.img, ox, oy, S, S);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 斧头残影：沿轨迹后方补三帧，让旋转是连续扫过而不是跳格
      for (let i = 1; i <= 5; i++) {
        const ga = sp - i * 0.095;
        ctx.globalAlpha = (0.28 - i * 0.042) * blend;
        drawWeapon(ctx, HANDS.right, Math.cos(ga) * R, cy + Math.sin(ga) * R * 0.32, ga - DRAG);
      }
      ctx.globalAlpha = 1;

      drawPart(ctx, 'legL', qv(pose.legLX), qv(pose.legLY), pose.legL);
      drawPart(ctx, 'legR', qv(pose.legRX), qv(pose.legRY), pose.legR);

      // 进场接力：位置与朝向从"上一帧实际手点/斧向"lerp 到轨道，配合半径展开，起手不再硬切
      const srcX = dispInited ? disp.handRX : HANDS.right.x;
      const srcY = dispInited ? disp.handRY : HANDS.right.y;
      const srcRot = dispInited ? disp.rotR : HANDS.right.rot;
      const px = srcX + (ax - srcX) * blend;
      const py = srcY + (ay - srcY) * blend;
      const prot = srcRot + (rt - srcRot) * blend;
      whirlLast = { x: px, y: py, rot: prot };
      whirlLastL.x = px - hpx;
      whirlLastL.y = py + hpy;
      whirlSpin = sp;

      const drawBlade = () => {
        // 斧刃角度比位置稍滞后，像被甩着走
        drawWeapon(ctx, HANDS.right, px, py, prot);
        drawHand(ctx, px - hpx, py + hpy);
        drawHand(ctx, px + hpx, py - hpy);
      };

      // 躯干：水平挤压模拟转身朝向，加一点离心倾斜，不做旋转
      const sx = 0.86 + 0.14 * Math.abs(Math.cos(sp));
      ctx.save();
      ctx.translate(0, cy);
      ctx.rotate(Math.sin(sp) * 0.05);
      ctx.scale(sx, 1);
      ctx.translate(0, -cy);
      drawPart(ctx, 'body', bx, by, 0);
      ctx.restore();

      drawBlade();

      const whx = qv(pose.headX), why = qv(pose.headY);
      const whr = pose.headRot || 0;
      drawPart(ctx, 'head', whx, why, whr);
      const wb = blinkOf(o.t || 0);
      if (wb > 0.01) {
        ctx.save();
        ctx.translate(parts.head.px + whx, parts.head.py + why);
        ctx.rotate(whr);
        ctx.fillStyle = '#1b120d';
        ctx.beginPath();
        ctx.ellipse(EYES.x + parts.head.x - parts.head.px,
          EYES.y + parts.head.y - parts.head.py,
          EYES.rx, EYES.ry * wb, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    // 1 右手斧的手（垫在斧子下方）
    drawHand(ctx, rHand.x, rHand.y);
    // 2 右手斧
    drawWeapon(ctx, HANDS.right, rHand.x, rHand.y, wRotR);
    // 3 双脚（走路时脚下带前后位移与抬脚）
    drawPart(ctx, 'legL', qv(pose.legLX), qv(pose.legLY), pose.legL);
    drawPart(ctx, 'legR', qv(pose.legRX), qv(pose.legRY), pose.legR);
    // 4 身体（绕髋部俯仰）
    drawPart(ctx, 'body', bx, by, br);
    // 5 劈砍刀光：压在身体之上、头之下，扫过头脸时被头挡住
    slashAlphaL = 0;
    if (o.t != null) {
      const ap = o.atkDur ? clamp((o.attackT || 0) / o.atkDur, 0, 1) : 0;
      const sr = pose.atkRotR || 0;
      const sl = pose.atkRotL || 0;
      // 新一刀起手：清掉上一刀的淡出进度，重新画弧
      if (attacking && ap < 0.3) { slashFadeAt = -1; slashFadeAtL = -1; }
      let alpha = 0;
      // 蓄力阶段不画；下劈过程中弧线随斧刃推进，越过收弧角后冻结成完整月牙
      if (attacking && ap >= 0.3 && slashFadeAt < 0 && sr >= SLASH_A0) {
        const g = slashArc(rHand.x, rHand.y, wRotR, sr);
        slashGeo = {
          cx: g.cx, cy: g.cy, r: g.r,
          a0: g.ang + SLASH_A0 - sr,
          a1: sr >= SLASH_A1 ? g.ang + SLASH_A1 - sr : g.ang
        };
        alpha = 1;
        if (sr >= SLASH_A1) slashFadeAt = o.t;
      } else if (slashFadeAt >= 0) {
        alpha = clamp(1 - (o.t - slashFadeAt) / SLASH_FADE, 0, 1);
        if (alpha <= 0) { slashFadeAt = -1; slashGeo = null; }
      }
      if (slashGeo && alpha > 0) drawSlash(ctx, slashGeo, slashGeo.a0, slashGeo.a1, alpha);
      // 左手刀光：反向撩砍，弧更短、更细、更淡（压在身体之上、头之下）
      if (attacking && ap >= 0.3 && slashFadeAtL < 0 && sl <= SLASH_L_A0) {
        const gl = slashArcL(lHand.x, lHand.y, wRotL);
        slashGeoL = {
          cx: gl.cx, cy: gl.cy, r: gl.r,
          a0: gl.ang + SLASH_L_A0 - sl,
          a1: sl <= SLASH_L_A1 ? gl.ang + SLASH_L_A1 - sl : gl.ang
        };
        slashAlphaL = SLASH_L_ALPHA;
        if (sl <= SLASH_L_A1) slashFadeAtL = o.t;
      } else if (slashFadeAtL >= 0) {
        slashAlphaL = SLASH_L_ALPHA * clamp(1 - (o.t - slashFadeAtL) / SLASH_FADE, 0, 1);
        if (slashAlphaL <= 0) { slashFadeAtL = -1; slashGeoL = null; slashAlphaL = 0; }
      }
    }
    // 左手刀光：压在身体之上、头之下，挥到脸前时被头部挡住
    if (slashGeoL && slashAlphaL > 0) {
      drawSlash(ctx, slashGeoL, slashGeoL.a0, slashGeoL.a1, slashAlphaL, SLASH_L_THICK);
    }
    // 6 头（跟随颈部实际位移，并叠加相对躯干的俯仰）
    const hdx = qv(pose.headX + nx), hdy = qv(pose.headY + ny);
    const hrot = (pose.headRot || 0) + br;
    drawPart(ctx, 'head', hdx, hdy, hrot);

    // 眨眼：遮住面甲上的双眼（随头部的位移与旋转一起变换）
    const blink = blinkOf(o.t || 0);
    if (blink > 0.01 && o.state !== 'attack') {
      ctx.save();
      ctx.translate(parts.head.px + hdx, parts.head.py + hdy);
      ctx.rotate(hrot);
      ctx.fillStyle = '#1b120d';
      ctx.beginPath();
      ctx.ellipse(EYES.x + parts.head.x - parts.head.px,
        EYES.y + parts.head.y - parts.head.py,
        EYES.rx, EYES.ry * blink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7 左脚斧（压在头与身体之上）
    drawWeapon(ctx, HANDS.left, lHand.x, lHand.y, wRotL);
    // 8 左脚斧的手（压在最上层）
    drawHand(ctx, lHand.x, lHand.y);

    ctx.restore();
  }

  const hero = {
    draw,
    parts,
    weapon,
    hand,
    ready: () => pending === 0 && !!(parts.head.img && parts.body.img),
    equipmentSlots: ['head', 'body', 'legL', 'legR', 'weapon', 'hand']
  };
  DG.art.barbarian = hero;

  DG.art.registerHero('warrior', {
    id: 'warrior',
    mode: 'canvas',
    ready: () => hero.ready(),
    canvasDraw(ctx, x, y, opts) { hero.draw(ctx, x, y, opts); },
    battle(ctx, p, scene) {
      const w = scene && scene.whirl;
      const roar = scene && scene.roar;
      const atkDur = p.atkDur || 0.46;
      hero.draw(ctx, 0, p.r * 0.92, {
        scale: 0.7273,
        flip: !!p.flip,
        // 战吼优先级最高：蓄力与释放期间整套动作独占，不被普攻/旋风姿态打断
        state: roar ? 'roar' : (w ? 'whirl' : ((p.atkAnim || 0) > 0 ? 'attack' : (p.moving ? 'walk' : 'idle'))),
        t: scene.time,
        walkPhase: p.walkPhase || 0,
        // 是否在移动：决定双腿是否播放走路动作（与状态无关）
        moving: !!p.moving,
        // 攻击时间轴按实际挥砍时长归一：攻速高时动作缩短但完整播完
        attackT: atkDur - (p.atkAnim || 0),
        atkDur: atkDur,
        // 战吼时间轴：蓄力 charge 秒后释放，total 秒收完
        roarT: roar ? roar.t : 0,
        roarCharge: roar ? roar.charge : 0.42,
        roarTotal: roar ? roar.total : 0.95,
        // 旋风：角度由场景持续累加，连续施放时衔接不跳
        spin: w ? (scene.whirlSpin || 0) : 0,
        spinT: w ? (scene.whirlChainT || 0) : 0
      });
    }
  });
})();
