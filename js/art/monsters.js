/* 美术 · 小怪：矢量分件角色（固定规范见 docs/monster-pipeline.md）
 * 设计坐标系：脚底原点 (0,0)，向上为负 Y，总高 DESIGN_H。
 * 分件顺序：腿 → 长袍 → 胸饰 → 头（脸 → 头巾 → 角 → 耳 → 毛簇 → 眼 → 鼻嘴）
 * 动作由 m.moving / m.walkPhase / m.action 驱动：
 *   idle → walk → windup → strike → recover
 * 用法：DG.art.monsters.draw(ctx, m, { t })
 *   ctx 已平移到怪物中心（与首领一致），内部按脚底贴地锚定。
 */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};
  const PI2 = Math.PI * 2;

  const DESIGN_H = 104;   // 设计空间总高
  const ART_H = 82;       // 默认显示高度
  const NECK = -46;       // 颈部枢轴
  // 暗黑调色：矢量走调色板一次性压暗（见 dimPal），贴图在加载时烘焙暗色调
  const DARK_FILTER_TEX = 'saturate(0.66) brightness(0.84) contrast(1.26) hue-rotate(-6deg)';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  const PAL = {
    line: '#1b1a20',
    face: '#4f4d58', faceLo: '#403e49', faceHi: '#5d5b67',
    robe: '#d8cdb3', robeLo: '#bcb096', robeHi: '#e9e0cb',
    hood: '#ab9a7c', hoodLo: '#91816a', hoodHi: '#c1b294',
    bone: '#efe8d6', boneLo: '#cec5ae',
    earIn: '#c98f8c',
    nose: '#c07a76',
    eye: '#f5eedc',
    mouth: '#2a2830',
    strap: '#6a4a37', strapHi: '#8a6a4e'
  };

  // 受击剪影：所有槽位统一为白
  const FLASH_PAL = {};
  Object.keys(PAL).forEach((k) => { FLASH_PAL[k] = '#ffffff'; });

  // 性能：原来每帧给每只怪设置 ctx.filter 做整体调色，移动端会走离屏滤镜，
  // 怪物一多就明显掉帧。这里改成一次性把调色板压暗（效果与滤镜一致），运行期零开销。
  function dimHex(hex) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#') return hex;
    let s = hex.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length !== 6) return hex;
    const n = parseInt(s, 16);
    let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const sat = 0.50, bri = 0.66, con = 1.18;
    r = (lum + (r - lum) * sat) * bri;
    g = (lum + (g - lum) * sat) * bri;
    b = (lum + (b - lum) * sat) * bri;
    r = (r - 0.5) * con + 0.5;
    g = (g - 0.5) * con + 0.5;
    b = (b - 0.5) * con + 0.5;
    const to = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return '#' + ((1 << 24) | (to(r) << 16) | (to(g) << 8) | to(b)).toString(16).slice(1);
  }
  const dimPalCache = new WeakMap();
  function dimPal(pal) {
    if (!pal || typeof pal !== 'object') return pal;
    let d = dimPalCache.get(pal);
    if (d) return d;
    d = {};
    for (const k in pal) d[k] = dimHex(pal[k]);
    dimPalCache.set(pal, d);
    return d;
  }

  // ---------- 批次一：图鉴拆解出的三种怪 ----------
  const MUSH_PAL = {
    line: '#1b1a20',
    skin: '#7d9a5b', skinLo: '#61803f', skinHi: '#94b06f',
    coat: '#6c5a3f', coatLo: '#57482f', coatHi: '#877559',
    cap: '#cbb383', capLo: '#a99267', capHi: '#e0cc9f', spot: '#7b5f42',
    metal: '#4c4b55', metalHi: '#6b6a76', wood: '#5a3f2c',
    eye: '#f3d76a', mouth: '#241f1c', gold: '#d9b24a'
  };
  const PUMPKIN_PAL = {
    line: '#1b1a20',
    cloak: '#3f4436', cloakLo: '#2e3327', cloakHi: '#555b47',
    pumpkin: '#d2762f', pumpkinLo: '#a9571f', pumpkinHi: '#e89044',
    glow: '#ffd66a', stem: '#6b5a35',
    steel: '#c9c3ac', steelLo: '#8f8a76', wood: '#5a3f2c',
    eye: '#ffd66a', mouth: '#241f1c'
  };
  const SLIME_PAL = {
    line: '#1b1a20',
    body: '#58b3a6', bodyLo: '#3d8b80', bodyHi: '#7fd3c6',
    eye: '#f4f2e2', pupil: '#1f2a2a', mouth: '#233534',
    crown: '#d9b24a', crownLo: '#a9852e', gem: '#b65c5c'
  };
  function whitePal(p) {
    const o = {};
    Object.keys(p).forEach((k) => { o[k] = '#ffffff'; });
    return o;
  }
  const MUSH_FLASH = whitePal(MUSH_PAL);
  const PUMPKIN_FLASH = whitePal(PUMPKIN_PAL);
  const SLIME_FLASH = whitePal(SLIME_PAL);

  // ---------- 批次二：替换原有几何体小怪 ----------
  const WOLF_PAL = {
    line: '#1b1a20',
    fur: '#8a5a49', furLo: '#6b4335', furHi: '#a9745f', furBelly: '#c39a80',
    mane: '#5d3a2f', eye: '#ffd66a', pupil: '#26160f',
    claw: '#e8ddc4', nose: '#2a1a16', mouth: '#3a1f1a', tongue: '#b4706a'
  };
  const SKEL_PAL = {
    line: '#1b1a20',
    bone: '#b6ae94', boneLo: '#8f886f', boneHi: '#d8d1b8',
    cloth: '#4f4636', clothLo: '#393226', clothHi: '#6b5f49',
    steel: '#b9b3a2', steelLo: '#7d7666', wood: '#5a3f2c',
    eye: '#ffcf6a', socket: '#251f1a', rust: '#8a5a3a'
  };
  const MIST_PAL = {
    line: '#1b1a20',
    robe: '#6f8fae', robeLo: '#4c6885', robeHi: '#93b3cf',
    hood: '#54708d', hoodLo: '#3c546c', hoodHi: '#7b9ab8',
    wisp: '#b9d7e8', orb: '#a9e6ff', orbCore: '#e8fbff',
    eye: '#dff6ff', mouth: '#1d2a33', trim: '#c8d8e4'
  };
  const WOLF_FLASH = whitePal(WOLF_PAL);
  const SKEL_FLASH = whitePal(SKEL_PAL);
  const MIST_FLASH = whitePal(MIST_PAL);

  // ---------- 批次四：换色变体（复用同一组 pose/draw，只换调色板） ----------
  const FROSTWOLF_PAL = {
    line: '#1b1a20',
    fur: '#9fb6c9', furLo: '#7390a6', furHi: '#c4d8e6', furBelly: '#e2eef5',
    mane: '#4f6b80', eye: '#a9ecff', pupil: '#162530',
    claw: '#f2f9ff', nose: '#20303a', mouth: '#2b3c46', tongue: '#7f9fb2'
  };
  const BONEKNIGHT_PAL = {
    line: '#1b1a20',
    bone: '#cbb58e', boneLo: '#a08a62', boneHi: '#e8d7b0',
    cloth: '#3f4a36', clothLo: '#2b3327', clothHi: '#5d6b50',
    steel: '#c7a449', steelLo: '#8a6d2c', wood: '#4a3120',
    eye: '#a6ff8a', socket: '#1a2116', rust: '#7c5a38'
  };
  const FROSTSLIME_PAL = {
    line: '#1b1a20',
    body: '#7cc9e8', bodyLo: '#4f9fbf', bodyHi: '#b8e9f8',
    eye: '#f4feff', pupil: '#19303a', mouth: '#1f323b',
    crown: '#cfe8f2', crownLo: '#96b6c4', gem: '#7fe4ff'
  };
  const FROSTWOLF_FLASH = whitePal(FROSTWOLF_PAL);
  const BONEKNIGHT_FLASH = whitePal(BONEKNIGHT_PAL);
  const FROSTSLIME_FLASH = whitePal(FROSTSLIME_PAL);

  // ---------- 陷阱：宝箱怪（伪装成宝箱，开盖咬人） ----------
  const MIMIC_PAL = {
    line: '#1b1a20',
    wood: '#6b4a26', woodLo: '#4e3419', woodHi: '#7d572d',
    trim: '#8a6a3e', trimLo: '#5e4527', trimHi: '#b08a52',
    lock: '#2a1c10', maw: '#341418', gum: '#9c4b52',
    tongue: '#c4706a', tooth: '#f1e7cd',
    eye: '#ffd76a', pupil: '#241016', foot: '#4e3623'
  };
  const MIMIC_FLASH = whitePal(MIMIC_PAL);

  // ---------- 批次三：图鉴大造型（精英） ----------
  const MAW_PAL = {
    line: '#1b1a20',
    stem: '#5f7d43', stemLo: '#47612f', stemHi: '#7d9a58',
    leaf: '#6d8f4a', leafLo: '#4f6b34',
    petal: '#c0503f', petalLo: '#94382c', petalHi: '#dd6f57',
    maw: '#3a1d1e', tongue: '#c4706a', tooth: '#f1e7cd',
    eye: '#ffd66a', pupil: '#2a1410'
  };
  const DOC_PAL = {
    line: '#1b1a20',
    robe: '#4a4636', robeLo: '#343125', robeHi: '#635e49',
    cape: '#5d4a33', mask: '#e8e1cc', maskLo: '#c2bba4', beak: '#d8d0b6',
    goggle: '#2b2620', lens: '#ff9a5a', hat: '#39352a', hatHi: '#55503f',
    steel: '#c9c3ac', steelLo: '#8f8a76', wood: '#5a3f2c', belt: '#8a6a3e'
  };
  const WAR_PAL = {
    line: '#1b1a20',
    robe: '#5a3f78', robeLo: '#3f2c56', robeHi: '#7a5a9a',
    hood: '#4a3264', hoodLo: '#332246', hoodHi: '#6b4d8a',
    trim: '#d9b24a', orb: '#9ff08a', orbCore: '#eaffdf',
    eye: '#b9ff9a', bone: '#efe6cf', mouth: '#1c1424'
  };
  const MAW_FLASH = whitePal(MAW_PAL);
  const DOC_FLASH = whitePal(DOC_PAL);
  const WAR_FLASH = whitePal(WAR_PAL);


  function rgba(hex, a) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function fs(ctx, fill, pal, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = lw || 2.4;
    ctx.stroke();
  }

  // ---------- 部件 ----------
  function drawLeg(ctx, x, rot, lift, pal) {
    ctx.save();
    ctx.translate(x, -14 - lift);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.lineTo(-5.5, 8);
    ctx.quadraticCurveTo(-5.5, 13, -1.5, 14);
    ctx.lineTo(4, 14);
    ctx.quadraticCurveTo(6.5, 12, 5.5, 7);
    ctx.lineTo(4.5, 0);
    ctx.closePath();
    fs(ctx, pal.faceLo, pal, 2.2);
    // 脚趾分叉
    ctx.beginPath();
    ctx.moveTo(-1.5, 14);
    ctx.lineTo(-1.5, 16.4);
    ctx.moveTo(1.6, 14);
    ctx.lineTo(1.6, 16.4);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawRobe(ctx, pal) {
    ctx.beginPath();
    ctx.moveTo(-20, -13);
    ctx.bezierCurveTo(-23, -27, -19, -42, -12, -48);
    ctx.lineTo(12, -48);
    ctx.bezierCurveTo(19, -42, 23, -27, 20, -13);
    // 下摆：五段不规则弧
    ctx.quadraticCurveTo(16, -8, 12, -12.5);
    ctx.quadraticCurveTo(7, -7.5, 3, -12.5);
    ctx.quadraticCurveTo(-2, -7.5, -6, -12.5);
    ctx.quadraticCurveTo(-11, -7.5, -15, -12.5);
    ctx.quadraticCurveTo(-18, -8, -20, -13);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.6);

    // 右侧暗面
    ctx.beginPath();
    ctx.moveTo(10, -46);
    ctx.bezierCurveTo(16, -40, 20, -26, 18, -14);
    ctx.quadraticCurveTo(14, -8, 10, -12.5);
    ctx.quadraticCurveTo(14, -28, 10, -46);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeLo, 0.75);
    ctx.fill();

    // 布料褶皱
    ctx.strokeStyle = rgba(pal.robeLo, 0.7);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-6, -44);
    ctx.quadraticCurveTo(-8, -30, -6, -14);
    ctx.moveTo(2, -43);
    ctx.quadraticCurveTo(1, -30, 3, -15);
    ctx.stroke();

    // 领口
    ctx.beginPath();
    ctx.moveTo(-12, -45);
    ctx.quadraticCurveTo(0, -39.5, 12, -45);
    ctx.quadraticCurveTo(0, -35.5, -12, -45);
    ctx.closePath();
    fs(ctx, pal.robeHi, pal, 1.4);

    // 胸口 X 形束带
    ctx.save();
    ctx.translate(0, -32);
    ctx.rotate(0.62);
    roundBar(ctx, 3.2, 17, pal.strap, pal);
    ctx.rotate(-1.24);
    roundBar(ctx, 3.2, 17, pal.strap, pal);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, -32, 2.2, 0, PI2);
    ctx.fillStyle = pal.strapHi;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function roundBar(ctx, w, h, fill, pal) {
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    ctx.lineTo(w / 2, h / 2 - r);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();
    fs(ctx, fill, pal, 1.5);
  }

  function facePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-24, -37);
    ctx.bezierCurveTo(-31, -28, -32, -13, -27, -5);
    ctx.bezierCurveTo(-22, 2, -13, 6, 0, 6);
    ctx.bezierCurveTo(12, 6, 22, 1, 27, -7);
    ctx.bezierCurveTo(31, -15, 29, -27, 23, -35);
    ctx.bezierCurveTo(16, -44, 4, -47, -6, -45);
    ctx.bezierCurveTo(-14, -44, -21, -41, -24, -37);
    ctx.closePath();
  }

  function drawEye(ctx, cx, cy, rx, ry, rot, open, pal) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(1, Math.max(0.06, open));
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, PI2);
    fs(ctx, pal.eye, pal, 1.8);
    if (open > 0.5) {
      ctx.beginPath();
      ctx.ellipse(0.4, ry * 0.12, 2.3, 2.7, 0, 0, PI2);
      ctx.fillStyle = pal.mouth;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-0.6, ry * 0.12 - 1, 0.8, 0, PI2);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fill();
    }
    // 上眼睑
    ctx.beginPath();
    ctx.moveTo(-rx * 0.92, 1);
    ctx.quadraticCurveTo(0, -ry * 1.75, rx * 0.92, 1);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.restore();
  }

  function drawHead(ctx, pal, pose) {
    ctx.save();
    ctx.translate(pose.headDx, NECK + pose.headDy);
    ctx.rotate(pose.headRot);

    // 脸
    facePath(ctx);
    fs(ctx, pal.face, pal, 2.6);

    // 左上高光 / 右下暗面
    ctx.beginPath();
    ctx.ellipse(-14, -32, 10, 7, -0.5, 0, PI2);
    ctx.fillStyle = rgba(pal.faceHi, 0.22);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(17, -14, 9, 13, 0.25, 0, PI2);
    ctx.fillStyle = rgba(pal.faceLo, 0.35);
    ctx.fill();

    // 头巾（压住额头）
    ctx.save();
    ctx.translate(-4, -46);
    ctx.rotate(pose.hoodRot);
    ctx.translate(4, 46);
    ctx.beginPath();
    ctx.moveTo(-27, -27);
    ctx.bezierCurveTo(-33, -36, -31, -47, -21, -53);
    ctx.bezierCurveTo(-10, -60, 8, -59, 18, -52);
    ctx.bezierCurveTo(25, -47, 28, -40, 26, -33);
    ctx.lineTo(24, -35);
    ctx.bezierCurveTo(22, -39, 19, -41, 15, -41);
    ctx.bezierCurveTo(12, -37, 8, -41, 4, -39);
    ctx.bezierCurveTo(0, -42, -4, -37, -8, -40);
    ctx.bezierCurveTo(-12, -36, -16, -40, -20, -37);
    ctx.bezierCurveTo(-23, -34, -25, -31, -27, -27);
    ctx.closePath();
    fs(ctx, pal.hood, pal, 2.6);

    // 左垂布
    ctx.beginPath();
    ctx.moveTo(-26, -31);
    ctx.bezierCurveTo(-33, -24, -39, -16, -39, -12);
    ctx.bezierCurveTo(-38, -9, -34, -10, -32, -14);
    ctx.bezierCurveTo(-29, -19, -27, -25, -25, -29);
    ctx.closePath();
    fs(ctx, pal.hoodLo, pal, 2.2);

    // 头巾高光与接缝
    ctx.strokeStyle = rgba(pal.hoodHi, 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-22, -50);
    ctx.quadraticCurveTo(-8, -57, 8, -55);
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.hoodLo, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-24, -38);
    ctx.quadraticCurveTo(-2, -31, 22, -37);
    ctx.stroke();
    ctx.restore();

    // 白色弯角 + 小毛簇
    ctx.beginPath();
    ctx.moveTo(-12, -46);
    ctx.bezierCurveTo(-15, -52, -21, -57, -29, -60);
    ctx.bezierCurveTo(-25, -55, -22, -49, -20, -44);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 2.1);
    ctx.beginPath();
    ctx.moveTo(-19, -44);
    ctx.bezierCurveTo(-21, -49, -24, -52, -28, -54);
    ctx.bezierCurveTo(-26, -50, -25, -46, -24, -43);
    ctx.closePath();
    fs(ctx, pal.boneLo, pal, 1.6);

    // 右耳（在头巾之上）
    ctx.save();
    ctx.translate(21, -15);
    ctx.rotate(pose.earRot);
    ctx.beginPath();
    ctx.moveTo(-2, -4);
    ctx.bezierCurveTo(4, -9, 12, -17, 20, -22);
    ctx.bezierCurveTo(24, -24, 25, -20, 22, -13);
    ctx.bezierCurveTo(18, -5, 10, 2, 3, 4);
    ctx.bezierCurveTo(0, 4, -2, 0, -2, -4);
    ctx.closePath();
    fs(ctx, pal.face, pal, 2.2);
    ctx.beginPath();
    ctx.moveTo(3, -4);
    ctx.bezierCurveTo(9, -9, 15, -15, 19, -18);
    ctx.bezierCurveTo(20, -14, 16, -7, 11, -2);
    ctx.bezierCurveTo(8, 0, 5, 0, 3, -4);
    ctx.closePath();
    ctx.fillStyle = pal.earIn;
    ctx.fill();
    ctx.restore();

    // 白色毛簇：右脸颊与左额
    ctx.beginPath();
    ctx.moveTo(21, -4);
    ctx.bezierCurveTo(27, -7, 32, -7, 35, -4);
    ctx.bezierCurveTo(31, -2, 29, 2, 27, 5);
    ctx.bezierCurveTo(25, 2, 23, 0, 21, -4);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.7);
    ctx.beginPath();
    ctx.moveTo(-24, -34);
    ctx.bezierCurveTo(-28, -37, -32, -41, -36, -42);
    ctx.bezierCurveTo(-32, -37, -31, -33, -30, -29);
    ctx.bezierCurveTo(-28, -31, -26, -33, -24, -34);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.7);

    // 眼睛（半睁、眨眼）
    drawEye(ctx, -14, -23, 8.6, 5.4, -0.12, pose.eyeOpen, pal);
    drawEye(ctx, 11, -25, 8.2, 5.1, 0.09, pose.eyeOpen, pal);

    // 鼻子
    ctx.beginPath();
    ctx.ellipse(-12, -10, 7, 5.4, -0.08, 0, PI2);
    fs(ctx, pal.nose, pal, 2.1);
    ctx.beginPath();
    ctx.ellipse(-14.2, -11.8, 2, 1.3, -0.4, 0, PI2);
    ctx.fillStyle = 'rgba(255,225,215,.55)';
    ctx.fill();

    // 嘴
    ctx.beginPath();
    ctx.moveTo(-11, -2.6);
    ctx.quadraticCurveTo(-7, 0.4, -3, -3.4);
    ctx.strokeStyle = pal.mouth;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  function drawPea(ctx, pal, pose) {
    drawLeg(ctx, -8.5, pose.legL, pose.liftL, pal);
    drawLeg(ctx, 7.5, pose.legR, pose.liftR, pal);
    drawRobe(ctx, pal);
    drawHead(ctx, pal, pose);
  }

  // ---------- 批次一：菌帽枪手 ----------
  function poseMusketeer(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.3 + seed) * 1.2, rot: Math.sin(t * 0.8 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      capRot: Math.sin(t * 1.5 + seed) * 0.035, gunKick: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.7;
      p.rot = Math.sin(ph) * 0.04;
      p.legL = Math.sin(ph) * 0.5;
      p.legR = -Math.sin(ph) * 0.5;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.capRot += Math.sin(ph * 2) * 0.04;
    }
    const s = m.shotAnim || 0;
    if (s > 0) {
      const e = s / 0.2;
      p.dx -= 4.5 * e;
      p.rot -= 0.07 * e;
      p.sy -= 0.04 * e;
      p.gunKick = e;
      p.capRot -= 0.1 * e;
    }
    return p;
  }

  function drawStubLeg(ctx, x, rot, lift, fill, shade, pal) {
    ctx.save();
    ctx.translate(x, -12 - lift);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-4.5, 7);
    ctx.quadraticCurveTo(-4.5, 12, -1, 12);
    ctx.lineTo(3.5, 12);
    ctx.quadraticCurveTo(5.5, 10, 4.5, 6);
    ctx.lineTo(3.5, 0);
    ctx.closePath();
    fs(ctx, fill, pal, 2.2);
    ctx.beginPath();
    ctx.ellipse(0, 8, 2.4, 2.8, 0, 0, PI2);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();
  }

  function drawMusketeer(ctx, pal, p) {
    drawStubLeg(ctx, -8, p.legL, p.liftL, pal.skin, pal.skinLo, pal);
    drawStubLeg(ctx, 7, p.legR, p.liftR, pal.skin, pal.skinLo, pal);

    // 矮胖外套
    ctx.beginPath();
    ctx.moveTo(-17, -10);
    ctx.bezierCurveTo(-20, -24, -18, -37, -12, -43);
    ctx.lineTo(12, -43);
    ctx.bezierCurveTo(18, -37, 20, -24, 17, -10);
    ctx.quadraticCurveTo(12, -6, 8, -10);
    ctx.quadraticCurveTo(2, -6, -3, -10);
    ctx.quadraticCurveTo(-9, -6, -13, -10);
    ctx.quadraticCurveTo(-16, -7, -17, -10);
    ctx.closePath();
    fs(ctx, pal.coat, pal, 2.6);
    // 腰带与扣
    ctx.fillStyle = pal.coatLo;
    ctx.fillRect(-15, -25, 30, 5);
    ctx.beginPath();
    ctx.arc(0, -22.5, 2.4, 0, PI2);
    ctx.fillStyle = pal.gold;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 斜挎弹带
    ctx.save();
    ctx.translate(0, -31);
    ctx.rotate(-0.55);
    ctx.fillStyle = pal.coatLo;
    ctx.fillRect(-13, -2.2, 26, 4.4);
    ctx.fillStyle = pal.gold;
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 5 - 1, -1.4, 2, 2.8);
    ctx.restore();

    // 火枪
    ctx.save();
    ctx.translate(2 - p.gunKick * 2.5, -33);
    ctx.rotate(-0.26 + p.gunKick * 0.05);
    ctx.beginPath();
    ctx.moveTo(-21, -2);
    ctx.lineTo(2, -5);
    ctx.lineTo(4, 5);
    ctx.lineTo(-17, 9);
    ctx.closePath();
    fs(ctx, pal.wood, pal, 2.2);
    ctx.beginPath();
    ctx.rect(3, -3.2, 40, 6.4);
    fs(ctx, pal.metal, pal, 2);
    ctx.beginPath();
    ctx.rect(40, -5, 6, 10);
    fs(ctx, pal.metalHi, pal, 1.8);
    ctx.beginPath();
    ctx.moveTo(10, 3);
    ctx.quadraticCurveTo(12, 9, 18, 8);
    ctx.strokeStyle = pal.metal;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 手臂（压住枪身）
    ctx.beginPath();
    ctx.ellipse(-14, -33, 4.6, 7.5, 0.25, 0, PI2);
    fs(ctx, pal.skin, pal, 2);
    ctx.beginPath();
    ctx.ellipse(19, -29, 4.4, 7, -0.5, 0, PI2);
    fs(ctx, pal.skin, pal, 2);

    // 绿脸
    ctx.beginPath();
    ctx.ellipse(1, -50, 15, 13.5, 0, 0, PI2);
    fs(ctx, pal.skin, pal, 2.4);
    drawEye(ctx, -5, -51, 4.4, 3.6, -0.1, 0.9, pal);
    drawEye(ctx, 8, -50, 3.8, 3.2, 0.12, 0.9, pal);
    ctx.beginPath();
    ctx.moveTo(-2, -43);
    ctx.quadraticCurveTo(3, -40, 8, -43);
    ctx.strokeStyle = pal.mouth;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // 獠牙
    ctx.beginPath();
    ctx.moveTo(1, -43);
    ctx.lineTo(2, -39.5);
    ctx.lineTo(3.2, -43);
    ctx.closePath();
    ctx.fillStyle = '#efe8d6';
    ctx.fill();

    // 蘑菇帽
    ctx.save();
    ctx.translate(1, -56);
    ctx.rotate(p.capRot);
    ctx.translate(-1, 56);
    ctx.beginPath();
    ctx.moveTo(-35, -56);
    ctx.bezierCurveTo(-38, -72, -24, -86, -2, -88);
    ctx.bezierCurveTo(20, -88, 36, -74, 37, -57);
    ctx.bezierCurveTo(30, -52, 22, -56, 14, -54);
    ctx.bezierCurveTo(6, -51, -2, -55, -10, -53);
    ctx.bezierCurveTo(-18, -50, -27, -54, -35, -56);
    ctx.closePath();
    fs(ctx, pal.cap, pal, 2.6);
    // 帽褶暗边
    ctx.beginPath();
    ctx.moveTo(-33, -57);
    ctx.bezierCurveTo(-20, -51, 20, -51, 35, -57);
    ctx.bezierCurveTo(22, -48, -20, -48, -33, -57);
    ctx.closePath();
    ctx.fillStyle = pal.capLo;
    ctx.fill();
    // 斑点
    const spots = [[-18, -73, 6, 4], [10, -78, 5, 3.4], [24, -67, 4.6, 3], [-28, -64, 3.6, 2.6]];
    spots.forEach(([x, y, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, -0.25, 0, PI2);
      ctx.fillStyle = pal.spot;
      ctx.fill();
    });
    ctx.strokeStyle = rgba(pal.capHi, 0.85);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-24, -78);
    ctx.quadraticCurveTo(-8, -86, 8, -85);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 批次一：南瓜刈手 ----------
  function posePumpkin(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.9 + seed) * 1.0, rot: Math.sin(t * 0.7 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      scythe: 0.22 + Math.sin(t * 1.1 + seed) * 0.035,
      headRot: Math.sin(t * 0.9 + seed) * 0.03, glow: 1
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.6;
      p.rot = Math.sin(ph) * 0.035;
      p.scythe += Math.sin(ph) * 0.05;
      p.headRot += Math.sin(ph - 0.5) * 0.03;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.scythe -= 1.05 * e;
        p.rot -= 0.12 * e;
        p.dy += 1.5 * e;
        p.headRot -= 0.1 * e;
        p.glow = 1 + e * 0.6;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.scythe += 1.5 * e;
        p.dx += 7 * e;
        p.rot += 0.13 * e;
        p.headRot += 0.08 * e;
        p.glow = 1.6;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.scythe += 1.5 * r;
        p.dx += 7 * r;
        p.rot += 0.13 * r;
        p.headRot += 0.08 * r;
        p.glow = 1 + 0.6 * r;
      }
    }
    return p;
  }

  function drawPumpkin(ctx, pal, p) {
    // 细腿
    drawStubLeg(ctx, -7, p.legL, p.liftL, pal.cloakLo, pal.line, pal);
    drawStubLeg(ctx, 6, p.legR, p.liftR, pal.cloakLo, pal.line, pal);

    // 破边长袍
    ctx.beginPath();
    ctx.moveTo(-20, -8);
    ctx.bezierCurveTo(-24, -30, -20, -50, -12, -57);
    ctx.lineTo(12, -57);
    ctx.bezierCurveTo(20, -50, 24, -30, 20, -8);
    ctx.lineTo(16, -3);
    ctx.lineTo(12, -8);
    ctx.lineTo(7, -2);
    ctx.lineTo(2, -8);
    ctx.lineTo(-3, -2);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-13, -3);
    ctx.lineTo(-17, -8);
    ctx.closePath();
    fs(ctx, pal.cloak, pal, 2.6);
    // 褶皱
    ctx.strokeStyle = rgba(pal.cloakHi, 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, -54);
    ctx.quadraticCurveTo(-10, -30, -7, -9);
    ctx.moveTo(4, -54);
    ctx.quadraticCurveTo(3, -30, 5, -9);
    ctx.stroke();

    // 肩披
    ctx.beginPath();
    ctx.moveTo(-18, -54);
    ctx.quadraticCurveTo(0, -64, 18, -54);
    ctx.quadraticCurveTo(12, -47, 6, -51);
    ctx.quadraticCurveTo(0, -46, -6, -51);
    ctx.quadraticCurveTo(-12, -47, -18, -54);
    ctx.closePath();
    fs(ctx, pal.cloakHi, pal, 2.2);

    // 左臂
    ctx.beginPath();
    ctx.moveTo(-13, -51);
    ctx.quadraticCurveTo(-22, -39, -17, -28);
    ctx.strokeStyle = pal.cloakLo;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-16, -26, 3.2, 0, PI2);
    ctx.fillStyle = pal.cloakLo;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 镰刀
    ctx.save();
    ctx.translate(14, -45);
    ctx.rotate(p.scythe);
    ctx.beginPath();
    ctx.moveTo(-2.6, 12);
    ctx.quadraticCurveTo(-1, -20, 2.4, -56);
    ctx.lineTo(7.4, -55);
    ctx.quadraticCurveTo(4, -20, 2.6, 12);
    ctx.closePath();
    fs(ctx, pal.wood, pal, 2);
    // 刀刃
    ctx.beginPath();
    ctx.moveTo(4, -52);
    ctx.bezierCurveTo(18, -70, 38, -68, 47, -53);
    ctx.bezierCurveTo(36, -62, 20, -61, 7, -47);
    ctx.closePath();
    fs(ctx, pal.steel, pal, 2.2);
    ctx.beginPath();
    ctx.moveTo(9, -51);
    ctx.bezierCurveTo(22, -62, 34, -62, 43, -56);
    ctx.strokeStyle = rgba(pal.steelLo, 0.85);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();

    // 南瓜头
    ctx.save();
    ctx.translate(0, -74);
    ctx.rotate(p.headRot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 22, 0, 0, PI2);
    fs(ctx, pal.pumpkin, pal, 2.6);
    // 瓜棱
    ctx.strokeStyle = rgba(pal.pumpkinLo, 0.8);
    ctx.lineWidth = 2;
    [-13, 0, 13].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, -20);
      ctx.quadraticCurveTo(x * 1.25, 0, x, 20);
      ctx.stroke();
    });
    // 梗
    ctx.beginPath();
    ctx.moveTo(-3, -21);
    ctx.quadraticCurveTo(-8, -28, -3, -31);
    ctx.lineTo(2, -29);
    ctx.quadraticCurveTo(-1, -25, 2, -21);
    ctx.closePath();
    fs(ctx, pal.stem, pal, 1.8);
    // 鬼火眼
    ctx.save();
    ctx.globalAlpha = 0.28 * p.glow;
    ctx.fillStyle = pal.glow;
    ctx.beginPath();
    ctx.arc(-10, -3, 11, 0, PI2);
    ctx.arc(9, -3, 11, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.glow;
    [-10, 9].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x - 6, -8);
      ctx.lineTo(x + 6, -8);
      ctx.lineTo(x, 1);
      ctx.closePath();
      ctx.fill();
    });
    // 锯齿嘴
    ctx.beginPath();
    ctx.moveTo(-12, 9);
    ctx.lineTo(-7, 5);
    ctx.lineTo(-2, 9);
    ctx.lineTo(3, 5);
    ctx.lineTo(8, 9);
    ctx.lineTo(12, 6);
    ctx.quadraticCurveTo(0, 16, -12, 9);
    ctx.closePath();
    ctx.fillStyle = pal.glow;
    ctx.fill();
    ctx.restore();
  }

  // ---------- 批次一：王冠史莱姆 ----------
  function poseSlime(m, t, seed) {
    const p = { dx: 0, dy: Math.sin(t * 2.5 + seed) * 0.8, rot: 0, sx: 1, sy: 1, look: 0 };
    p.sy = 1 + Math.sin(t * 2.5 + seed) * 0.035;
    p.sx = 1 - Math.sin(t * 2.5 + seed) * 0.02;
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.sy = 1 + Math.sin(ph * 2) * 0.07;
      p.sx = 1 - Math.sin(ph * 2) * 0.05;
      p.dy = -Math.abs(Math.sin(ph * 2)) * 1.4;
      p.rot = Math.sin(ph) * 0.04;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.sy -= 0.16 * e;
        p.sx += 0.13 * e;
        p.dy += 1.6 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 8 * e;
        p.sx = 0.93;
        p.sy = 1.1;
        p.look = e;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 8 * r;
        p.sx = 0.93 + 0.07 * (1 - r);
        p.sy = 1.1 - 0.1 * (1 - r);
        p.look = r;
      }
    }
    return p;
  }

  function drawSlime(ctx, pal, p) {
    // 主体
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.bezierCurveTo(-41, -12, -40, -36, -27, -54);
    ctx.bezierCurveTo(-16, -68, 16, -68, 27, -54);
    ctx.bezierCurveTo(40, -36, 41, -12, 36, 0);
    ctx.quadraticCurveTo(18, 7, 0, 7);
    ctx.quadraticCurveTo(-18, 7, -36, 0);
    ctx.closePath();
    fs(ctx, pal.body, pal, 2.8);
    // 底部暗面
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.quadraticCurveTo(-18, 7, 0, 7);
    ctx.quadraticCurveTo(18, 7, 36, 0);
    ctx.quadraticCurveTo(20, -8, 0, -8);
    ctx.quadraticCurveTo(-20, -8, -36, 0);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.bodyLo, 0.65);
    ctx.fill();
    // 高光与气泡
    ctx.beginPath();
    ctx.ellipse(-16, -44, 9, 6, -0.5, 0, PI2);
    ctx.fillStyle = rgba('#e6fff8', 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(17, -30, 3.2, 0, PI2);
    ctx.strokeStyle = rgba(pal.bodyHi, 0.9);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(23, -22, 2, 0, PI2);
    ctx.stroke();

    // 王冠
    ctx.save();
    ctx.translate(0, -62);
    ctx.rotate(-0.06);
    ctx.beginPath();
    ctx.moveTo(-17, 4);
    ctx.lineTo(-20, -12);
    ctx.lineTo(-8, -4);
    ctx.lineTo(0, -18);
    ctx.lineTo(8, -4);
    ctx.lineTo(20, -12);
    ctx.lineTo(17, 4);
    ctx.closePath();
    fs(ctx, pal.crown, pal, 2.2);
    ctx.fillStyle = pal.crownLo;
    ctx.fillRect(-16, 1, 32, 3.4);
    ctx.beginPath();
    ctx.arc(0, -8, 2.1, 0, PI2);
    ctx.fillStyle = pal.gem;
    ctx.fill();
    ctx.restore();

    // 独眼
    ctx.beginPath();
    ctx.ellipse(0, -34, 11.5, 12.5, 0, 0, PI2);
    fs(ctx, pal.eye, pal, 2.2);
    ctx.beginPath();
    ctx.ellipse(p.look * 3.5, -32, 4.8, 5.6, 0, 0, PI2);
    ctx.fillStyle = pal.pupil;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.look * 3.5 - 1.6, -34.5, 1.4, 0, PI2);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
    // 眼睑
    ctx.beginPath();
    ctx.moveTo(-11, -39);
    ctx.quadraticCurveTo(0, -49, 11, -39);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 嘴
    ctx.beginPath();
    ctx.moveTo(-13, -15);
    ctx.quadraticCurveTo(0, -8, 13, -15);
    ctx.strokeStyle = pal.mouth;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -13);
    ctx.lineTo(-3, -9);
    ctx.lineTo(-1, -13);
    ctx.closePath();
    ctx.fillStyle = pal.mouth;
    ctx.fill();
  }

  // ---------- 批次二：腐化野狼 ----------
  function poseWolf(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.4 + seed) * 0.7, rot: 0, sx: 1, sy: 1,
      legL: 0, legR: 0, liftL: 0, liftR: 0,
      legL2: 0, legR2: 0, liftL2: 0, liftR2: 0,
      tail: Math.sin(t * 2.2 + seed) * 0.16,
      headRot: Math.sin(t * 1.4 + seed) * 0.04,
      ear: Math.sin(t * 3.1 + seed) * 0.05,
      jaw: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph * 2)) * 1.4;
      p.rot = Math.sin(ph) * 0.02;
      p.legL = Math.sin(ph) * 0.55;
      p.legR = -Math.sin(ph) * 0.55;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.legL2 = -Math.sin(ph) * 0.5;
      p.legR2 = Math.sin(ph) * 0.5;
      p.liftL2 = Math.max(0, -Math.sin(ph)) * 2;
      p.liftR2 = Math.max(0, Math.sin(ph)) * 2;
      p.tail = Math.sin(ph) * 0.2;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.dy += 3 * e;
        p.rot -= 0.05 * e;
        p.sy -= 0.05 * e;
        p.headRot -= 0.2 * e;
        p.jaw = 0.1 + 0.28 * e;
        p.ear -= 0.15 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 12 * e;
        p.dy -= 3 * e;
        p.rot += 0.06 * e;
        p.headRot += 0.1 * e;
        p.jaw = 0.62;
        p.sx += 0.06 * e;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 12 * r;
        p.dy -= 3 * r;
        p.rot += 0.06 * r;
        p.headRot += 0.1 * r;
        p.jaw = 0.62 * r;
        p.sx += 0.06 * r;
      }
    }
    return p;
  }

  function drawWolfLeg(ctx, x, swing, lift, fill, pal) {
    ctx.save();
    ctx.translate(x, -24 - lift);
    ctx.rotate(swing);
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.quadraticCurveTo(-6.5, 12, -4, 20);
    ctx.lineTo(2, 22);
    ctx.quadraticCurveTo(6, 14, 4.5, 0);
    ctx.closePath();
    fs(ctx, fill, pal, 2.2);
    ctx.strokeStyle = pal.claw;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3.4, 21); ctx.lineTo(-3.4, 25);
    ctx.moveTo(0.4, 22); ctx.lineTo(0.4, 26);
    ctx.moveTo(3.2, 21); ctx.lineTo(3.2, 25);
    ctx.stroke();
    ctx.restore();
  }

  function drawWolf(ctx, pal, p) {
    // 远侧腿（压暗）
    drawWolfLeg(ctx, -17, p.legL2, p.liftL2, pal.furLo, pal);
    drawWolfLeg(ctx, 19, p.legR2, p.liftR2, pal.furLo, pal);

    // 尾巴
    ctx.save();
    ctx.translate(-28, -40);
    ctx.rotate(p.tail);
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.bezierCurveTo(-10, -2, -20, -14, -27, -27);
    ctx.bezierCurveTo(-16, -18, -6, -8, 4, -4);
    ctx.closePath();
    fs(ctx, pal.mane, pal, 2.2);
    ctx.restore();

    // 躯干
    ctx.beginPath();
    ctx.moveTo(-30, -30);
    ctx.bezierCurveTo(-34, -44, -22, -52, -6, -52);
    ctx.bezierCurveTo(8, -52, 22, -50, 28, -42);
    ctx.bezierCurveTo(34, -36, 32, -28, 26, -24);
    ctx.bezierCurveTo(16, -20, 4, -22, -6, -21);
    ctx.bezierCurveTo(-16, -20, -26, -22, -30, -30);
    ctx.closePath();
    fs(ctx, pal.fur, pal, 2.6);
    // 腹部浅色
    ctx.beginPath();
    ctx.ellipse(-2, -26, 22, 5.5, 0.03, 0, PI2);
    ctx.fillStyle = rgba(pal.furBelly, 0.5);
    ctx.fill();
    // 背脊鬃毛
    ctx.beginPath();
    ctx.moveTo(-28, -42);
    const spikes = [[-20, -50], [-12, -46], [-4, -54], [4, -49], [12, -55], [20, -50], [26, -44]];
    for (const [sx, sy] of spikes) ctx.lineTo(sx, sy);
    ctx.quadraticCurveTo(-6, -44, -28, -42);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.mane, 0.9);
    ctx.fill();
    // 体侧高光
    ctx.strokeStyle = rgba(pal.furHi, 0.55);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, -40);
    ctx.quadraticCurveTo(0, -44, 14, -41);
    ctx.stroke();

    // 近侧腿
    drawWolfLeg(ctx, -23, p.legL, p.liftL, pal.fur, pal);
    drawWolfLeg(ctx, 22, p.legR, p.liftR, pal.fur, pal);

    // 颈部鬃毛
    ctx.beginPath();
    ctx.moveTo(16, -50);
    ctx.lineTo(26, -56);
    ctx.lineTo(24, -46);
    ctx.lineTo(32, -48);
    ctx.lineTo(26, -38);
    ctx.quadraticCurveTo(20, -42, 16, -50);
    ctx.closePath();
    fs(ctx, pal.mane, pal, 2);

    // 头
    ctx.save();
    ctx.translate(27, -47);
    ctx.scale(1.12, 1.12);
    ctx.rotate(p.headRot);
    // 下颌（绕咬合点张开）
    ctx.save();
    ctx.translate(4, 4);
    ctx.rotate(p.jaw);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(20, 3);
    ctx.lineTo(18, 9);
    ctx.lineTo(-2, 7);
    ctx.closePath();
    fs(ctx, pal.furLo, pal, 2);
    ctx.fillStyle = pal.claw;
    ctx.beginPath();
    ctx.moveTo(10, 3); ctx.lineTo(12, 7); ctx.lineTo(14.5, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 头骨与上颚
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.bezierCurveTo(-15, -16, -4, -21, 7, -18);
    ctx.bezierCurveTo(17, -16, 22, -10, 27, -5);
    ctx.quadraticCurveTo(30, 0, 26, 3);
    ctx.lineTo(8, 4);
    ctx.bezierCurveTo(-2, 5, -10, 3, -13, -6);
    ctx.closePath();
    fs(ctx, pal.fur, pal, 2.4);
    // 上排牙
    ctx.fillStyle = pal.claw;
    ctx.beginPath();
    ctx.moveTo(12, 3); ctx.lineTo(13.5, 7); ctx.lineTo(15.5, 3);
    ctx.moveTo(18, 2.6); ctx.lineTo(19.2, 6.4); ctx.lineTo(21.4, 2.8);
    ctx.fill();
    // 口鼻暗面
    ctx.beginPath();
    ctx.moveTo(14, -2); ctx.lineTo(27, -4); ctx.lineTo(26, 3); ctx.lineTo(10, 4);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.furLo, 0.55);
    ctx.fill();
    // 鼻头
    ctx.beginPath();
    ctx.ellipse(26, -3, 3.4, 2.6, -0.2, 0, PI2);
    ctx.fillStyle = pal.nose;
    ctx.fill();
    // 发光眼
    ctx.beginPath();
    ctx.ellipse(10, -9, 3.8, 2.8, -0.15, 0, PI2);
    ctx.fillStyle = pal.eye;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10.8, -9, 1.2, 2.2, 0, 0, PI2);
    ctx.fillStyle = pal.pupil;
    ctx.fill();
    // 耳
    ctx.save();
    ctx.translate(-6, -16);
    ctx.rotate(p.ear);
    ctx.beginPath();
    ctx.moveTo(-4.5, 3); ctx.lineTo(0, -18); ctx.lineTo(6.5, 1);
    ctx.closePath();
    fs(ctx, pal.mane, pal, 2);
    ctx.beginPath();
    ctx.moveTo(-1, 0); ctx.lineTo(0.6, -12); ctx.lineTo(3.6, 1);
    ctx.closePath();
    ctx.fillStyle = pal.furLo;
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---------- 批次二：骷髅战士 ----------
  function poseSkel(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.1 + seed) * 1.1, rot: Math.sin(t * 0.9 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      armRot: -0.35, headRot: Math.sin(t * 1.2 + seed) * 0.04,
      jaw: 0, glow: 0.85 + Math.sin(t * 2.6 + seed) * 0.15
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.8;
      p.rot = Math.sin(ph) * 0.04;
      p.legL = Math.sin(ph) * 0.5;
      p.legR = -Math.sin(ph) * 0.5;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.armRot = -0.35 + Math.sin(ph) * 0.22;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.armRot -= 1.25 * e;
        p.rot -= 0.1 * e;
        p.dy += 1.4 * e;
        p.headRot -= 0.1 * e;
        p.jaw = 0.12 * e;
        p.glow = 1.4;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.armRot += 1.55 * e;
        p.dx += 7 * e;
        p.rot += 0.13 * e;
        p.headRot += 0.1 * e;
        p.jaw = 0.3;
        p.glow = 1.5;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.armRot += 1.55 * r;
        p.dx += 7 * r;
        p.rot += 0.13 * r;
        p.headRot += 0.1 * r;
        p.jaw = 0.3 * r;
        p.glow = 1 + 0.4 * r;
      }
    }
    return p;
  }

  function drawSkeleton(ctx, pal, p) {
    drawStubLeg(ctx, -7, p.legL, p.liftL, pal.bone, pal.boneLo, pal);
    drawStubLeg(ctx, 7, p.legR, p.liftR, pal.bone, pal.boneLo, pal);

    // 骨盆
    ctx.save();
    ctx.translate(0, -20);
    roundBar(ctx, 16, 7, pal.bone, pal);
    ctx.restore();

    // 破布战裙
    ctx.beginPath();
    ctx.moveTo(-11, -18);
    ctx.lineTo(11, -18);
    ctx.lineTo(9, -34);
    ctx.lineTo(6, -27);
    ctx.lineTo(3, -36);
    ctx.lineTo(0, -29);
    ctx.lineTo(-3, -36);
    ctx.lineTo(-6, -27);
    ctx.lineTo(-9, -34);
    ctx.closePath();
    fs(ctx, pal.cloth, pal, 2.2);
    ctx.strokeStyle = rgba(pal.clothLo, 0.8);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-4, -30); ctx.lineTo(-3, -20);
    ctx.moveTo(4, -32); ctx.lineTo(3, -20);
    ctx.stroke();

    // 脊椎
    ctx.fillStyle = pal.bone;
    ctx.beginPath();
    ctx.rect(-2.6, -50, 5.2, 30);
    fs(ctx, pal.bone, pal, 1.8);

    // 肋骨
    ctx.strokeStyle = pal.bone;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const y = -46 + i * 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(11, y + 1, 9, y + 6);
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(-11, y + 1, -9, y + 6);
      ctx.stroke();
    }
    // 胸骨暗面
    ctx.strokeStyle = rgba(pal.boneLo, 0.75);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-9, -44); ctx.quadraticCurveTo(0, -41, 9, -44);
    ctx.stroke();

    // 肩甲骨
    ctx.beginPath();
    ctx.ellipse(0, -50, 14, 5, 0, 0, PI2);
    fs(ctx, pal.boneLo, pal, 1.8);

    // 左臂 + 圆盾
    ctx.strokeStyle = pal.bone;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-11, -49);
    ctx.quadraticCurveTo(-17, -42, -15, -36);
    ctx.stroke();
    ctx.save();
    ctx.translate(-16, -40);
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, 0, PI2);
    fs(ctx, pal.steel, pal, 2.2);
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, PI2);
    ctx.strokeStyle = pal.steelLo;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, PI2);
    ctx.fillStyle = pal.rust;
    ctx.fill();
    ctx.restore();

    // 头骨
    ctx.save();
    ctx.translate(0, -60);
    ctx.rotate(p.headRot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 11.5, 0, 0, PI2);
    fs(ctx, pal.bone, pal, 2.4);
    // 上颌
    ctx.beginPath();
    ctx.moveTo(-7, 7);
    ctx.lineTo(7, 7);
    ctx.lineTo(5.6, 13);
    ctx.lineTo(-5.6, 13);
    ctx.closePath();
    fs(ctx, pal.boneLo, pal, 1.8);
    // 下颌（张合）
    ctx.save();
    ctx.translate(0, 12);
    ctx.rotate(p.jaw);
    ctx.beginPath();
    ctx.moveTo(-5.4, 0);
    ctx.lineTo(5.4, 0);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    fs(ctx, pal.boneLo, pal, 1.6);
    // 牙缝
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 2.2, 1);
      ctx.lineTo(i * 2.2, 4);
      ctx.stroke();
    }
    ctx.restore();
    // 眼窝
    ctx.fillStyle = pal.socket;
    ctx.beginPath();
    ctx.ellipse(-4.6, -2, 3.4, 3.8, 0, 0, PI2);
    ctx.ellipse(4.6, -2, 3.4, 3.8, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = rgba(pal.eye, 0.9 * p.glow);
    ctx.beginPath();
    ctx.arc(-4.6, -2, 1.5, 0, PI2);
    ctx.arc(4.6, -2, 1.5, 0, PI2);
    ctx.fill();
    // 头顶裂缝
    ctx.strokeStyle = rgba(pal.boneLo, 0.9);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-1, -10);
    ctx.lineTo(2, -6);
    ctx.lineTo(-1, -3);
    ctx.stroke();
    ctx.restore();

    // 右臂 + 弯刀（出手时挥砍）
    ctx.save();
    ctx.translate(11, -49);
    ctx.strokeStyle = pal.bone;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(7, -6, 8, -13);
    ctx.stroke();
    ctx.translate(8, -13);
    ctx.rotate(p.armRot);
    // 护手
    ctx.fillStyle = pal.steelLo;
    ctx.fillRect(-6, -2, 12, 3.4);
    // 剑柄
    ctx.fillStyle = pal.wood;
    ctx.fillRect(-1.6, 0, 3.2, 7);
    // 剑身
    ctx.beginPath();
    ctx.moveTo(-2.2, -2);
    ctx.lineTo(-1.8, -30);
    ctx.lineTo(0, -35);
    ctx.lineTo(1.8, -30);
    ctx.lineTo(2.2, -2);
    ctx.closePath();
    fs(ctx, pal.steel, pal, 1.8);
    ctx.strokeStyle = rgba(pal.steelLo, 0.9);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(0, -30);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 批次二：迷雾行者 ----------
  function poseMist(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.8 + seed) * 2.2, rot: Math.sin(t * 0.8 + seed) * 0.03,
      sx: 1, sy: 1, cloak: Math.sin(t * 2.0 + seed) * 0.08,
      headRot: Math.sin(t * 1.1 + seed) * 0.03,
      arm: 0, glow: 0.85 + Math.sin(t * 3 + seed) * 0.15
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy -= 2;
      p.cloak += Math.sin(ph) * 0.12;
      p.rot += Math.sin(ph) * 0.05;
    }
    const s = m.shotAnim || 0;
    if (s > 0) {
      const e = s / 0.2;
      p.arm -= 0.5 * e;
      p.rot -= 0.04 * e;
      p.glow = 1.7;
    }
    return p;
  }

  function drawMistwalker(ctx, pal, p) {
    // 下方雾尾：几缕飘散的气流
    ctx.save();
    ctx.translate(0, -8);
    ctx.rotate(p.cloak);
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.bezierCurveTo(-30, 6, -18, 10, -10, 6);
    ctx.bezierCurveTo(-4, 12, 6, 10, 8, 5);
    ctx.bezierCurveTo(16, 11, 28, 7, 24, 1);
    ctx.lineTo(18, -6);
    ctx.lineTo(-18, -6);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeHi, 0.5);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.robeLo, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // 长袍
    ctx.beginPath();
    ctx.moveTo(-22, -10);
    ctx.bezierCurveTo(-26, -30, -20, -50, -12, -60);
    ctx.lineTo(12, -60);
    ctx.bezierCurveTo(20, -50, 26, -30, 22, -10);
    ctx.quadraticCurveTo(14, -5, 8, -9);
    ctx.quadraticCurveTo(0, -4, -8, -9);
    ctx.quadraticCurveTo(-15, -5, -22, -10);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.6);
    // 暗面
    ctx.beginPath();
    ctx.moveTo(10, -58);
    ctx.bezierCurveTo(16, -46, 20, -28, 18, -12);
    ctx.quadraticCurveTo(14, -6, 10, -10);
    ctx.quadraticCurveTo(14, -32, 10, -58);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeLo, 0.55);
    ctx.fill();
    // 下摆雾气高光
    ctx.strokeStyle = rgba(pal.wisp, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-12, -14);
    ctx.quadraticCurveTo(-4, -8, 4, -13);
    ctx.quadraticCurveTo(10, -9, 16, -14);
    ctx.stroke();
    // 胸襟
    ctx.beginPath();
    ctx.moveTo(-10, -58);
    ctx.quadraticCurveTo(0, -50, 10, -58);
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 左袖
    ctx.beginPath();
    ctx.moveTo(-16, -54);
    ctx.quadraticCurveTo(-24, -44, -19, -34);
    ctx.quadraticCurveTo(-15, -28, -12, -36);
    ctx.quadraticCurveTo(-14, -44, -12, -52);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.2);

    // 右袖 + 法球
    ctx.save();
    ctx.translate(16, -50);
    ctx.rotate(p.arm);
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(10, -2, 12, -10);
    ctx.quadraticCurveTo(10, -16, 5, -14);
    ctx.quadraticCurveTo(6, -8, -1, -8);
    ctx.closePath();
    fs(ctx, pal.robeHi, pal, 2.2);
    // 掌中法球
    ctx.save();
    ctx.translate(11, -10);
    ctx.globalCompositeOperation = 'lighter';
    const og = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    og.addColorStop(0, rgba(pal.orbCore, 0.85 * p.glow));
    og.addColorStop(0.35, rgba(pal.orb, 0.5 * p.glow));
    og.addColorStop(1, rgba(pal.orb, 0));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(11, -10, 5.2, 0, PI2);
    fs(ctx, pal.orb, pal, 1.6);
    ctx.beginPath();
    ctx.arc(9.6, -11.4, 1.8, 0, PI2);
    ctx.fillStyle = pal.orbCore;
    ctx.fill();
    ctx.restore();

    // 兜帽
    ctx.save();
    ctx.translate(0, -62);
    ctx.rotate(p.headRot);
    ctx.beginPath();
    ctx.moveTo(-20, 2);
    ctx.bezierCurveTo(-24, -12, -16, -28, 0, -30);
    ctx.bezierCurveTo(16, -28, 24, -12, 20, 2);
    ctx.quadraticCurveTo(12, -4, 6, 0);
    ctx.quadraticCurveTo(0, -5, -6, 0);
    ctx.quadraticCurveTo(-13, -4, -20, 2);
    ctx.closePath();
    fs(ctx, pal.hood, pal, 2.6);
    // 兜帽内阴影
    ctx.beginPath();
    ctx.ellipse(0, -10, 13, 14, 0, 0, PI2);
    ctx.fillStyle = pal.hoodLo;
    ctx.fill();
    // 发光双眼
    ctx.fillStyle = pal.eye;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * p.glow;
    ctx.beginPath();
    ctx.arc(-5, -11, 8, 0, PI2);
    ctx.arc(5.5, -11, 8, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(-5, -11, 3.2, 2.4, 0.1, 0, PI2);
    ctx.ellipse(5.5, -11, 3.2, 2.4, -0.1, 0, PI2);
    ctx.fill();
    // 兜帽高光
    ctx.strokeStyle = rgba(pal.hoodHi, 0.8);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-14, -22);
    ctx.quadraticCurveTo(0, -28, 14, -22);
    ctx.stroke();
    ctx.restore();

    // 下摆内衬的雾气
    ctx.fillStyle = rgba(pal.wisp, 0.22);
    ctx.beginPath();
    ctx.ellipse(0, -12, 16, 5, 0, 0, PI2);
    ctx.fill();
  }

  // ---------- 批次三：精英 · 噬人花 ----------
  function poseMaw(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.6 + seed) * 1.2, rot: Math.sin(t * 1.1 + seed) * 0.03,
      sx: 1, sy: 1,
      head: -0.06 + Math.sin(t * 1.3 + seed) * 0.05,
      jaw: 0.16 + Math.sin(t * 2.2 + seed) * 0.05,
      leaf: Math.sin(t * 1.8 + seed) * 0.1
    };
    if (m.moving) {
      p.dy -= 1.4;
      p.leaf += Math.sin(m.walkPhase || 0) * 0.14;
    }
    const a = m.action;
    if (a) {
      if (a.phase === 'windup') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.windup), 0, 1));
        p.head -= 0.34 * e;
        p.jaw = 0.16 + 0.78 * e;
        p.sy -= 0.05 * e;
        p.dy += 2 * e;
      } else if (a.phase === 'strike') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.strike), 0, 1));
        p.head += 0.3 * e;
        p.jaw = Math.max(0.02, 0.16 - 0.16 * e);
        p.dx += 10 * e;
        p.sx += 0.08 * e;
      } else {
        const r = 1 - easeOut(clamp(a.t / Math.max(0.01, a.recover), 0, 1));
        p.head += 0.3 * r;
        p.jaw = 0.16 * r;
        p.dx += 10 * r;
        p.sx += 0.08 * r;
      }
    }
    return p;
  }

  function drawMawLeaf(ctx, x, y, rot, fill, pal) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-14, -6, -24, -2, -30, 6);
    ctx.bezierCurveTo(-20, 10, -8, 8, 0, 0);
    ctx.closePath();
    fs(ctx, fill, pal, 2.2);
    ctx.strokeStyle = rgba(pal.leafLo, 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, 1);
    ctx.lineTo(-24, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawMaw(ctx, pal, p) {
    // 茎
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.bezierCurveTo(-10, -22, -7, -40, -4, -54);
    ctx.lineTo(4, -54);
    ctx.bezierCurveTo(8, -38, 10, -20, 5, 0);
    ctx.closePath();
    fs(ctx, pal.stem, pal, 2.6);
    ctx.strokeStyle = rgba(pal.stemLo, 0.7);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.quadraticCurveTo(-1, -26, -1, -48);
    ctx.stroke();

    // 叶
    drawMawLeaf(ctx, -4, -16, -0.2 + p.leaf, pal.leaf, pal);
    ctx.save();
    ctx.translate(4, -34);
    ctx.scale(-1, 1);
    drawMawLeaf(ctx, 0, 0, 0.3 - p.leaf, pal.leaf, pal);
    ctx.restore();

    // 花头
    ctx.save();
    ctx.translate(0, -60);
    ctx.rotate(p.head);

    // 花瓣
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -27, 13, 9, 0, 0, PI2);
      fs(ctx, i % 2 ? pal.petalLo : pal.petal, pal, 2);
      ctx.restore();
    }

    // 口腔
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, PI2);
    fs(ctx, pal.maw, pal, 2.4);

    // 上排牙
    ctx.fillStyle = pal.tooth;
    for (let i = 0; i < 5; i++) {
      const a = -2.5 + i * 0.62;
      const x = Math.cos(a) * 16;
      const y = Math.sin(a) * 16;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 1);
      ctx.lineTo(x + 3, y - 1);
      ctx.lineTo(x, y + 5);
      ctx.closePath();
      ctx.fill();
    }

    // 下颚（张嘴）
    ctx.save();
    ctx.translate(0, 5);
    ctx.rotate(p.jaw);
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI);
    ctx.closePath();
    fs(ctx, pal.petalLo, pal, 2.2);
    // 舌头
    ctx.beginPath();
    ctx.ellipse(0, 10, 9, 5, 0, 0, PI2);
    ctx.fillStyle = pal.tongue;
    ctx.fill();
    // 下排牙
    ctx.fillStyle = pal.tooth;
    for (let i = 0; i < 4; i++) {
      const a = 0.35 + i * 0.62;
      const x = Math.cos(a) * 15;
      const y = Math.sin(a) * 15;
      ctx.beginPath();
      ctx.moveTo(x - 2.6, y + 1);
      ctx.lineTo(x + 2.6, y + 1);
      ctx.lineTo(x, y - 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 眼睛
    for (const ex of [-10, 10]) {
      ctx.beginPath();
      ctx.ellipse(ex, -23, 4.2, 3.4, 0, 0, PI2);
      ctx.fillStyle = pal.eye;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex + 0.6, -23, 1.4, 2.6, 0, 0, PI2);
      ctx.fillStyle = pal.pupil;
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 批次三：精英 · 瘟疫医师 ----------
  function poseDoc(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.7 + seed) * 1.2, rot: Math.sin(t * 0.9 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      armRot: -0.5, headRot: Math.sin(t * 1.1 + seed) * 0.03, cloak: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.8;
      p.rot = Math.sin(ph) * 0.03;
      p.legL = Math.sin(ph) * 0.45;
      p.legR = -Math.sin(ph) * 0.45;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.cloak = Math.sin(ph) * 0.05;
    }
    const a = m.action;
    if (a) {
      if (a.phase === 'windup') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.windup), 0, 1));
        p.armRot -= 1.1 * e;
        p.rot -= 0.12 * e;
        p.cloak = -0.14 * e;
        p.headRot -= 0.08 * e;
      } else if (a.phase === 'strike') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.strike), 0, 1));
        p.armRot += 1.6 * e;
        p.dx += 8 * e;
        p.rot += 0.14 * e;
        p.cloak = 0.1 * e;
      } else {
        const r = 1 - easeOut(clamp(a.t / Math.max(0.01, a.recover), 0, 1));
        p.armRot += 1.6 * r;
        p.dx += 8 * r;
        p.rot += 0.14 * r;
        p.cloak = 0.1 * r;
      }
    }
    return p;
  }

  function drawPlaguedoc(ctx, pal, p) {
    // 腿脚
    drawStubLeg(ctx, -7, p.legL, p.liftL, pal.robeLo, pal.robe, pal);
    drawStubLeg(ctx, 7, p.legR, p.liftR, pal.robeLo, pal.robe, pal);

    // 长袍
    ctx.beginPath();
    ctx.moveTo(-17, -8);
    ctx.bezierCurveTo(-22, -32, -18, -54, -11, -64);
    ctx.lineTo(11, -64);
    ctx.bezierCurveTo(18, -54, 22, -32, 17, -8);
    ctx.quadraticCurveTo(12, -3, 8, -8);
    ctx.quadraticCurveTo(2, -2, -3, -8);
    ctx.quadraticCurveTo(-10, -3, -17, -8);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.6);
    // 袍面高光
    ctx.strokeStyle = rgba(pal.robeHi, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -58);
    ctx.quadraticCurveTo(-13, -34, -10, -14);
    ctx.stroke();
    // 腰带
    ctx.fillStyle = pal.belt;
    ctx.fillRect(-15, -40, 30, 4);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-15, -40, 30, 4);

    // 披肩（破损）
    ctx.beginPath();
    ctx.moveTo(-19, -62);
    ctx.quadraticCurveTo(0, -70, 19, -62);
    ctx.lineTo(16, -50);
    ctx.lineTo(11, -56);
    ctx.lineTo(6, -48);
    ctx.lineTo(0, -55);
    ctx.lineTo(-6, -48);
    ctx.lineTo(-11, -56);
    ctx.lineTo(-16, -50);
    ctx.closePath();
    fs(ctx, pal.cape, pal, 2.4);

    // 左臂
    ctx.strokeStyle = pal.robe;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -60);
    ctx.quadraticCurveTo(-21, -50, -17, -42);
    ctx.stroke();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-17, -41, 3.2, 0, PI2);
    ctx.stroke();

    // 头（鸟嘴面具）
    ctx.save();
    ctx.translate(0, -76);
    ctx.rotate(p.headRot);
    // 面具
    ctx.beginPath();
    ctx.ellipse(-1, 0, 11, 13, 0, 0, PI2);
    fs(ctx, pal.mask, pal, 2.4);
    // 鸟喙
    ctx.beginPath();
    ctx.moveTo(2, -6);
    ctx.quadraticCurveTo(20, -8, 30, -2);
    ctx.quadraticCurveTo(22, 3, 3, 6);
    ctx.closePath();
    fs(ctx, pal.beak, pal, 2.2);
    ctx.strokeStyle = rgba(pal.maskLo, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, -3);
    ctx.quadraticCurveTo(18, -5, 26, -2);
    ctx.stroke();
    // 护目镜
    ctx.beginPath();
    ctx.arc(-5, -2, 4.2, 0, PI2);
    ctx.arc(4.5, -2, 4.2, 0, PI2);
    fs(ctx, pal.goggle, pal, 1.6);
    ctx.fillStyle = rgba(pal.lens, 0.9);
    ctx.beginPath();
    ctx.arc(-5, -2, 2, 0, PI2);
    ctx.arc(4.5, -2, 2, 0, PI2);
    ctx.fill();
    ctx.restore();

    // 帽子
    ctx.save();
    ctx.translate(0, -86);
    ctx.rotate(p.headRot * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 6, 0, 0, PI2);
    fs(ctx, pal.hat, pal, 2.4);
    ctx.beginPath();
    ctx.moveTo(-11, -3);
    ctx.quadraticCurveTo(-8, -18, 0, -21);
    ctx.quadraticCurveTo(8, -18, 11, -3);
    ctx.closePath();
    fs(ctx, pal.hat, pal, 2.2);
    ctx.strokeStyle = rgba(pal.hatHi, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.quadraticCurveTo(0, -8, 9, -6);
    ctx.stroke();
    ctx.restore();

    // 右手 + 巨镰
    ctx.save();
    ctx.translate(13, -62);
    ctx.strokeStyle = pal.robe;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(6, -8, 7, -16);
    ctx.stroke();
    ctx.translate(7, -16);
    ctx.rotate(p.armRot);
    // 镰柄
    ctx.strokeStyle = pal.wood;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 18);
    ctx.lineTo(2, -52);
    ctx.stroke();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 镰刃
    ctx.beginPath();
    ctx.moveTo(2, -52);
    ctx.bezierCurveTo(16, -62, 30, -64, 34, -58);
    ctx.bezierCurveTo(24, -58, 12, -52, 3, -45);
    ctx.closePath();
    fs(ctx, pal.steel, pal, 1.8);
    ctx.strokeStyle = rgba(pal.steelLo, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, -50);
    ctx.quadraticCurveTo(20, -58, 31, -58);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 批次三：精英 · 深渊巫师（读条施法） ----------
  function poseWarlock(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.5 + seed) * 2.4, rot: Math.sin(t * 0.7 + seed) * 0.03,
      sx: 1, sy: 1, cloak: Math.sin(t * 1.9 + seed) * 0.09,
      headRot: Math.sin(t * 1.0 + seed) * 0.03,
      arm: 0, glow: 0.85 + Math.sin(t * 2.8 + seed) * 0.15
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy -= 2;
      p.cloak += Math.sin(ph) * 0.12;
      p.rot += Math.sin(ph) * 0.04;
    }
    const a = m.action;
    if (a) {
      if (a.phase === 'windup') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.windup), 0, 1));
        p.arm = -0.5 * e;
        p.glow = 0.9 + 1.3 * e;
        p.headRot -= 0.08 * e;
        p.dy += 1.5 * e;
      } else if (a.phase === 'strike') {
        p.arm = 0.5;
        p.glow = 2.2;
      } else {
        const r = 1 - easeOut(clamp(a.t / Math.max(0.01, a.recover), 0, 1));
        p.arm = 0.5 * r;
        p.glow = 1 + 1.2 * r;
      }
    }
    return p;
  }

  function drawWarlock(ctx, pal, p) {
    // 下方雾尾
    ctx.save();
    ctx.translate(0, -8);
    ctx.rotate(p.cloak);
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.bezierCurveTo(-34, 6, -20, 12, -11, 7);
    ctx.bezierCurveTo(-4, 14, 7, 12, 9, 6);
    ctx.bezierCurveTo(18, 13, 31, 8, 26, 1);
    ctx.lineTo(18, -7);
    ctx.lineTo(-18, -7);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeHi, 0.45);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.robeLo, 0.6);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // 长袍
    ctx.beginPath();
    ctx.moveTo(-24, -10);
    ctx.bezierCurveTo(-29, -32, -23, -54, -14, -66);
    ctx.lineTo(14, -66);
    ctx.bezierCurveTo(23, -54, 29, -32, 24, -10);
    ctx.quadraticCurveTo(15, -4, 9, -9);
    ctx.quadraticCurveTo(0, -3, -9, -9);
    ctx.quadraticCurveTo(-16, -4, -24, -10);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.8);
    // 暗面
    ctx.beginPath();
    ctx.moveTo(11, -64);
    ctx.bezierCurveTo(18, -50, 22, -30, 19, -12);
    ctx.quadraticCurveTo(15, -6, 11, -10);
    ctx.quadraticCurveTo(15, -34, 11, -64);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeLo, 0.55);
    ctx.fill();
    // 金色滚边
    ctx.strokeStyle = rgba(pal.trim, 0.8);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-13, -12);
    ctx.quadraticCurveTo(-4, -6, 4, -12);
    ctx.quadraticCurveTo(11, -7, 16, -13);
    ctx.stroke();
    // 胸襟
    ctx.beginPath();
    ctx.moveTo(-11, -64);
    ctx.quadraticCurveTo(0, -54, 11, -64);
    ctx.stroke();

    // 左袖
    ctx.beginPath();
    ctx.moveTo(-16, -60);
    ctx.quadraticCurveTo(-26, -48, -20, -36);
    ctx.quadraticCurveTo(-15, -29, -12, -38);
    ctx.quadraticCurveTo(-14, -48, -12, -58);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.2);

    // 右袖 + 法杖
    ctx.save();
    ctx.translate(17, -56);
    ctx.rotate(p.arm);
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(11, -4, 13, -13);
    ctx.quadraticCurveTo(10, -18, 5, -15);
    ctx.quadraticCurveTo(6, -8, -1, -8);
    ctx.closePath();
    fs(ctx, pal.robeHi, pal, 2.2);
    // 法杖
    ctx.strokeStyle = pal.robeLo;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, -2);
    ctx.lineTo(12, -42);
    ctx.stroke();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 顶端宝珠
    ctx.save();
    ctx.translate(12, -46);
    ctx.globalCompositeOperation = 'lighter';
    const og = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
    og.addColorStop(0, rgba(pal.orbCore, 0.9 * p.glow));
    og.addColorStop(0.35, rgba(pal.orb, 0.55 * p.glow));
    og.addColorStop(1, rgba(pal.orb, 0));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(12, -46, 6, 0, PI2);
    fs(ctx, pal.orb, pal, 1.8);
    ctx.beginPath();
    ctx.arc(10.4, -47.6, 2, 0, PI2);
    ctx.fillStyle = pal.orbCore;
    ctx.fill();
    ctx.restore();

    // 兜帽 + 双角
    ctx.save();
    ctx.translate(0, -68);
    ctx.rotate(p.headRot);
    // 角
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.bezierCurveTo(-22, -24, -26, -32, -22, -36);
    ctx.bezierCurveTo(-18, -30, -14, -24, -9, -20);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.8);
    ctx.beginPath();
    ctx.moveTo(14, -14);
    ctx.bezierCurveTo(22, -24, 26, -32, 22, -36);
    ctx.bezierCurveTo(18, -30, 14, -24, 9, -20);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.8);
    // 兜帽
    ctx.beginPath();
    ctx.moveTo(-22, 2);
    ctx.bezierCurveTo(-27, -14, -18, -32, 0, -34);
    ctx.bezierCurveTo(18, -32, 27, -14, 22, 2);
    ctx.quadraticCurveTo(13, -5, 6, 0);
    ctx.quadraticCurveTo(0, -6, -6, 0);
    ctx.quadraticCurveTo(-14, -5, -22, 2);
    ctx.closePath();
    fs(ctx, pal.hood, pal, 2.8);
    // 兜帽内部
    ctx.beginPath();
    ctx.ellipse(0, -11, 14, 15, 0, 0, PI2);
    ctx.fillStyle = pal.hoodLo;
    ctx.fill();
    // 双眼
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 * p.glow;
    ctx.fillStyle = pal.eye;
    ctx.beginPath();
    ctx.arc(-5.5, -12, 9, 0, PI2);
    ctx.arc(6, -12, 9, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.eye;
    ctx.beginPath();
    ctx.ellipse(-5.5, -12, 3.6, 2.8, 0.12, 0, PI2);
    ctx.ellipse(6, -12, 3.6, 2.8, -0.12, 0, PI2);
    ctx.fill();
    // 兜帽高光
    ctx.strokeStyle = rgba(pal.hoodHi, 0.8);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-15, -24);
    ctx.quadraticCurveTo(0, -31, 15, -24);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 动作 ----------
  function basePose(m, t, seed) {
    return {
      dx: 0, dy: Math.sin(t * 2.1 + seed) * 1.1,
      rot: Math.sin(t * 0.9 + seed) * 0.02,
      sx: 1, sy: 1,
      headDx: 0, headDy: Math.sin(t * 2.1 + seed - 0.5) * 0.8,
      headRot: Math.sin(t * 1.1 + seed) * 0.03,
      earRot: Math.sin(t * 1.7 + seed) * 0.1,
      hoodRot: Math.sin(t * 1.3 + seed) * 0.02,
      legL: 0, legR: 0, liftL: 0, liftR: 0,
      eyeOpen: 0.72
    };
  }

  function computePose(m, t, seed) {
    let p;
    if (m.moving) {
      const ph = m.walkPhase || 0;
      const step = Math.abs(Math.sin(ph));
      p = {
        dx: Math.sin(ph) * 1.6, dy: -step * 1.9,
        rot: Math.sin(ph) * 0.05,
        sx: 1 + step * 0.02, sy: 1 - step * 0.03,
        headDx: Math.sin(ph - 0.6) * 1.4, headDy: -step * 1.2 + Math.sin(ph - 0.5) * 0.8,
        headRot: Math.sin(ph - 0.4) * 0.045,
        earRot: Math.sin(ph * 2 + 0.3) * 0.14,
        hoodRot: Math.sin(ph * 2) * 0.035,
        legL: Math.sin(ph) * 0.55,
        legR: -Math.sin(ph) * 0.55,
        liftL: Math.max(0, Math.sin(ph)) * 2.2,
        liftR: Math.max(0, -Math.sin(ph)) * 2.2,
        eyeOpen: 0.78
      };
    } else {
      p = basePose(m, t, seed);
    }

    // 眨眼（4.3s 一次，0.16s 闭合）
    const cyc = (t + seed * 2.3) % 4.3;
    const blink = cyc < 0.16 ? 1 - Math.abs(cyc / 0.08 - 1) : 0;
    p.eyeOpen *= 1 - blink * 0.92;

    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.dy += 2.6 * e;
        p.rot -= 0.13 * e;
        p.sx += 0.10 * e;
        p.sy -= 0.13 * e;
        p.headDy += 2 * e;
        p.headRot -= 0.18 * e;
        p.earRot -= 0.35 * e;
        p.hoodRot -= 0.10 * e;
        p.eyeOpen *= 1 - 0.55 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 9 * e;
        p.rot += 0.16 * e;
        p.headRot += 0.12 * e;
        p.earRot += 0.5 * e;
        p.hoodRot += 0.12 * e;
        p.eyeOpen *= 0.35;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 9 * r;
        p.rot += 0.16 * r;
        p.headRot += 0.12 * r;
        p.earRot += 0.5 * r;
        p.hoodRot += 0.12 * r;
        p.eyeOpen *= 1 - 0.65 * r;
      }
    }
    return p;
  }

  // ---------- 陷阱：宝箱怪 ----------
  function poseMimic(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.2 + seed) * 0.7, rot: 0, sx: 1, sy: 1,
      maw: 0.06, look: 0, legL: 0, legR: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph * 2)) * 1.6;
      p.rot = Math.sin(ph) * 0.05;
      p.legL = Math.sin(ph) * 0.5;
      p.legR = -Math.sin(ph) * 0.5;
      p.maw = 0.18 + Math.max(0, Math.sin(ph * 2)) * 0.1;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        // 盖子缓缓掀开，箱体后仰蓄力
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.maw = 0.06 + 0.94 * e;
        p.rot -= 0.1 * e;
        p.dy += 1.2 * e;
        p.sx = 1 + 0.07 * e;
        p.sy = 1 - 0.05 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 10 * e;
        p.maw = 1;
        p.rot += 0.09 * e;
        p.sx = 1.05;
        p.sy = 0.95;
        p.look = e;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 10 * r;
        p.maw = 0.06 + 0.94 * r;
        p.rot += 0.09 * r;
        p.look = r;
      }
    }
    // 掀盖后体型膨胀：闭合时接近普通宝箱尺寸，现形后才显出怪物体型
    const grow = 1 + p.maw * 0.55;
    p.sx *= grow;
    p.sy *= grow;
    return p;
  }

  function mimicRound(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawMimic(ctx, pal, p) {
    const maw = clamp(p.maw, 0, 1);
    const open = maw * 22;          // 盖子抬起高度
    const seam = -40;               // 箱体顶边（上下盖咬合线）

    // 箱脚：走动时交替抬起
    [-18, 18].forEach((fx, i) => {
      ctx.save();
      ctx.translate(fx + (i ? p.legR : p.legL) * 2, -2);
      ctx.beginPath();
      ctx.ellipse(0, 2, 8.5, 5, 0, 0, PI2);
      fs(ctx, pal.foot, pal, 2.2);
      ctx.restore();
    });

    // 口腔暗腔：跨在咬合线上，上下被箱体与盖子遮住
    const cy = seam - open * 0.5;
    const ry = 6 + open * 0.5 + maw * 6;
    ctx.beginPath();
    ctx.ellipse(0, cy, 29, ry, 0, 0, PI2);
    ctx.fillStyle = pal.maw;
    ctx.fill();

    // 舌头
    if (maw > 0.25) {
      ctx.beginPath();
      ctx.ellipse(0, cy + ry * 0.32, 15, 4.5 + maw * 2.5, 0, 0, PI2);
      ctx.fillStyle = pal.tongue;
      ctx.fill();
    }

    // 腔内双眼：越张开越亮
    const eyeA = clamp((maw - 0.25) / 0.5, 0, 1);
    if (eyeA > 0.02) {
      [-11, 11].forEach((ex) => {
        const g = ctx.createRadialGradient(ex, cy - 1, 1, ex, cy - 1, 12);
        g.addColorStop(0, rgba(pal.eye, 0.45 * eyeA));
        g.addColorStop(1, rgba(pal.eye, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ex, cy - 1, 12, 0, PI2);
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.ellipse(ex, cy - 1, 4.6, 4, 0, 0, PI2);
        ctx.fillStyle = pal.eye;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ex + p.look * 1.4, cy - 0.6, 1.9, 2.6, 0, 0, PI2);
        ctx.fillStyle = pal.pupil;
        ctx.fill();
      });
    }

    // 上齿（倒挂在盖沿）→ 下齿（立在下沿）
    const tw = 6.4, gap = 8.4;
    ctx.fillStyle = pal.tooth;
    for (let i = -3; i <= 3; i++) {
      const x = i * gap;
      if (Math.abs(x) > 25) continue;
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, seam - open);
      ctx.lineTo(x + tw / 2, seam - open);
      ctx.lineTo(x, seam - open + 9.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - tw / 2 + 3, seam);
      ctx.lineTo(x + tw / 2 + 3, seam);
      ctx.lineTo(x + 3, seam - 9);
      ctx.closePath();
      ctx.fill();
    }
    // 牙龈
    ctx.fillStyle = pal.gum;
    ctx.fillRect(-25, seam - open - 2, 50, 2.6);
    ctx.fillRect(-25, seam - 0.6, 50, 2.6);

    // 箱体
    mimicRound(ctx, -32, seam, 64, 38, 5);
    fs(ctx, pal.wood, pal, 2.6);
    // 木纹
    ctx.strokeStyle = rgba(pal.woodLo, 0.75);
    ctx.lineWidth = 1.4;
    [-14, 0, 14].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, seam + 5);
      ctx.lineTo(x, seam + 32);
      ctx.stroke();
    });
    // 底部暗面
    ctx.fillStyle = rgba(pal.woodLo, 0.55);
    ctx.fillRect(-31, seam + 25, 62, 11);

    // 金属包边
    ctx.fillStyle = pal.trim;
    ctx.fillRect(-30, seam + 27, 60, 5);
    ctx.fillRect(-30, seam + 2, 60, 4);
    [-30, 25].forEach((x) => ctx.fillRect(x, seam + 2, 5, 30));
    // 锁扣
    mimicRound(ctx, -7, seam + 8, 14, 12, 3);
    fs(ctx, pal.trimLo, pal, 1.8);
    ctx.beginPath();
    ctx.arc(0, seam + 13, 2.4, 0, PI2);
    ctx.fillStyle = pal.lock;
    ctx.fill();

    // 盖子：绕后沿抬起
    ctx.save();
    ctx.translate(0, seam - open);
    ctx.rotate(-0.07 * maw);
    mimicRound(ctx, -34, -21, 68, 21, 6);
    fs(ctx, pal.woodHi, pal, 2.6);
    ctx.strokeStyle = rgba(pal.woodLo, 0.6);
    ctx.lineWidth = 1.4;
    [-14, 0, 14].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, -17);
      ctx.lineTo(x, -3);
      ctx.stroke();
    });
    ctx.fillStyle = pal.trim;
    ctx.fillRect(-30, -7, 60, 4.6);
    [-30, 25].forEach((x) => ctx.fillRect(x, -20, 5, 15));
    // 盖顶高光
    ctx.beginPath();
    ctx.ellipse(-11, -15, 9, 3.2, -0.16, 0, PI2);
    ctx.fillStyle = rgba(pal.trimHi, 0.35);
    ctx.fill();
    ctx.restore();
  }

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

  // 分件贴图：同一张图按部件矩形拆开绘制，绕接缝枢轴做微幅摆动。
  // 贴图本身不做任何修改；相邻部件在接缝处相互重叠，转动时不会露缝。
  function drawParts(ctx, s, parts, m, t, seed, w, h) {
    const kx = w / (s.w || 1);
    const ky = h / (s.h || 1);
    const bx = (s.bw || s.w) / (s.w || 1);
    const by = (s.bh || s.h) / (s.h || 1);
    const img = s.dark || s.canvas;
    const walking = !!m.moving;
    const a = m.action;
    const strike = (a && a.phase === 'strike' && a.t != null)
      ? Math.sin(Math.min(1, a.t / Math.max(0.001, a.strike || 0.14)) * Math.PI)
      : 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const r = p.r;
      const freq = p.freq || 2;
      const ph = (p.phase || 0) + seed;
      let ang = p.rot ? Math.sin(t * freq + ph) * p.rot : 0;
      let sx = p.swing ? Math.sin(t * freq * 0.9 + ph) * p.swing * (walking ? 1 : 0.45) : 0;
      if (walking && p.rot) ang += Math.sin(t * (p.wfreq || 9) + ph) * p.rot * 0.9;
      if (strike) {
        ang += strike * (p.strike || 0);
        sx += strike * (p.push || 0);
      }
      const px = -w / 2 + p.p[0] * kx;
      const py = -h + p.p[1] * ky;
      ctx.save();
      ctx.translate(px + sx, py);
      ctx.rotate(ang);
      ctx.translate(-px, -py);
      ctx.drawImage(img,
        r[0] * bx, r[1] * by, (r[2] - r[0]) * bx, (r[3] - r[1]) * by,
        -w / 2 + r[0] * kx, -h + r[1] * ky,
        (r[2] - r[0]) * kx, (r[3] - r[1]) * ky);
      ctx.restore();
    }
  }

  // 贴图小怪：脚底锚定，呼吸/行走起伏 + 蓄力下蹲 + 出手前冲，受击白闪
  function drawTex(ctx, m, d, t) {
    const s = texSource(d.src);
    const h = displayHeight(m);
    const seed = m.seed || 0;
    const a = m.action;
    const windup = !!(a && a.phase === 'windup');
    const strike = !!(a && a.phase === 'strike');

    let bob = Math.sin(t * 2.2 + seed) * 1.6;
    let rot = Math.sin(t * 0.9 + seed) * 0.012;
    let sx = 1;
    let sy = 1;
    let dx = 0;
    if (m.moving) {
      bob += Math.sin(t * 9 + seed) * 1.8;
      rot += Math.cos(m.facing || 0) * 0.018;
    }
    if (windup) {
      const k = Math.min(1, a.t / Math.max(0.001, a.windup));
      const e = Math.sin(k * Math.PI * 0.5);
      sx -= e * 0.05;
      sy += e * 0.06;
      rot -= Math.cos(m.facing || 0) * 0.03 * e;
      bob -= e * 1.5;
    } else if (strike) {
      const e = Math.sin(Math.min(1, a.t / Math.max(0.001, a.strike)) * Math.PI);
      sx += e * 0.06;
      sy -= e * 0.03;
      dx = Math.cos(m.facing || 0) * e * 9;
      bob -= e * 2;
    }

    const w = s.ready ? h * (s.w / s.h) : h * 0.9;
    const flip = Math.cos(m.facing || 0) < -0.05;
    ctx.save();
    ctx.translate(dx, m.r * 0.72 + bob - (m.hop || 0));
    ctx.rotate(rot);
    ctx.scale(sx * (flip ? -1 : 1), sy);
    ctx.imageSmoothingEnabled = true;
    if (s.ready) {
      if (d.parts) drawParts(ctx, s, d.parts, m, t, seed, w, h);
      else ctx.drawImage(s.dark || s.canvas, -w / 2, -h, w, h);
      if (m.flash > 0 && s.flash) {
        ctx.globalAlpha = Math.min(0.8, m.flash / 0.16);
        ctx.drawImage(s.flash, -w / 2, -h, w, h);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
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

  // 攻击 / 死亡特效：返回 true 表示已处理
  function drawEffect(ctx, e) {
    const k = 1 - e.life / Math.max(0.001, e.max);
    const fade = Math.max(0, e.life / e.max);

    if (e.kind === 'peaArc') {
      const sweep = Math.min(1, k * 1.55);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.26 * fade);
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.94, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(e.color, (0.85 - i * 0.2) * fade);
        ctx.lineWidth = 11 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 3, a0, a1);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.45 * fade);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius - 1.5, a0, a1);
      ctx.stroke();
      // 前端咬合闪光
      const hx = Math.cos(a1) * e.radius;
      const hy = Math.sin(a1) * e.radius;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 11);
      hg.addColorStop(0, rgba('#ffffff', 0.38 * fade));
      hg.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, 11, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    // 霜牙狼：冰霜爪痕（冷雾弧 + 沿弧冰棱 + 飘落冰晶）
    if (e.kind === 'frostSlash') {
      const sweep = Math.min(1, k * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.22 * fade);
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.94, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(i === 0 ? '#f2ffff' : e.color, (0.9 - i * 0.22) * fade);
        ctx.lineWidth = 12 - i * 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 3, a0, a1);
        ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const p = i / 7;
        if (p > sweep) break;
        const a = a0 + e.arc * p;
        const rr = e.radius - 5;
        const s = 7 + (i % 3) * 3 + k * 6;
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = rgba('#e8feff', 0.9 * fade);
        ctx.strokeStyle = rgba(e.color, 0.6 * fade);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.36, s * 0.34);
        ctx.lineTo(-s * 0.36, s * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 5; i++) {
        const a = a0 + e.arc * (0.2 + i * 0.16);
        const rr = e.radius + 6 + k * 10;
        ctx.fillStyle = rgba('#dffbff', (0.55 - i * 0.08) * fade);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.6 + (i % 2), 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 骸骨卫士：亡魂斩（暗绿弧 + 骨屑 + 上升魂火）
    if (e.kind === 'soulSlash') {
      const sweep = Math.min(1, k * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba('#1f3a22', 0.5 * fade);
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.92, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(i === 0 ? '#e8ffd4' : e.color, (0.85 - i * 0.22) * fade);
        ctx.lineWidth = 10 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 4, a0, a1);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const p = 0.15 + i * 0.22;
        if (p > sweep) break;
        const a = a0 + e.arc * p;
        const rr = e.radius + 2 + k * 8;
        ctx.fillStyle = rgba('#efe6cf', 0.8 * fade);
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a + i);
        ctx.fillRect(-2.2, -1.2, 5.2, 2.4);
        ctx.restore();
      }
      for (let i = 0; i < 4; i++) {
        const a = a0 + e.arc * (0.25 + i * 0.2);
        const rr = e.radius * (i % 2 ? 0.9 : 0.6);
        ctx.fillStyle = rgba('#b6e08a', (0.5 - i * 0.08) * fade);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr - k * 16, 2.2 + (i % 2), 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 霜晶史莱姆：冰晶炸裂（贴地冷雾冲击环 + 六向冰棱）
    if (e.kind === 'frostBurst') {
      const r = e.radius * (0.22 + 0.78 * k);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.58);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.7, rgba(e.color, 0.3 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba('#e8feff', 0.72 * fade);
      ctx.lineWidth = Math.max(2, 7 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i * (Math.PI / 3) + 0.26;
        const inner = r * 0.5;
        const outer = r * (1.02 + (i % 2) * 0.18);
        const w = 6 + (i % 3) * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = rgba('#dffbff', 0.95 * fade);
        ctx.beginPath();
        ctx.moveTo(inner, 0);
        ctx.lineTo(outer, -w);
        ctx.lineTo(outer, w);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(e.color, 0.65 * fade);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
      cg.addColorStop(0, rgba('#ffffff', 0.55 * fade * (1 - k)));
      cg.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    // 血翼蝠：暗红翼刃（双弧划过 + 血珠飘散）
    if (e.kind === 'bloodArc') {
      const sweep = Math.min(1, k * 1.6);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.16 * fade);
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.94, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(i === 0 ? '#ffd9dd' : e.color, (0.85 - i * 0.24) * fade);
        ctx.lineWidth = 10 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 4, a0, a1);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const a = a0 + e.arc * (0.16 + i * 0.15);
        const rr = e.radius + 4 + k * 9;
        ctx.fillStyle = rgba(e.color, (0.6 - i * 0.08) * fade);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.8 + (i % 2), 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 紫壳甲虫：甲壳重砸（贴地冲击环 + 紫晶碎屑）
    if (e.kind === 'shellSlam') {
      const r = e.radius * (0.55 + k * 0.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.6);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.68, rgba(e.color, 0.26 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(e.color, 0.7 * fade);
      ctx.lineWidth = Math.max(2, 8 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      ctx.strokeStyle = rgba('#f0dcff', 0.5 * fade);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, PI2);
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = i * 0.897 + 0.3;
        const rr = r * (0.62 + (i % 2) * 0.34);
        const s = 5 + (i % 3) * 3;
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a);
        ctx.fillStyle = rgba('#d8a8f0', 0.85 * fade);
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.5);
        ctx.lineTo(s, 0);
        ctx.lineTo(-s, s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return true;
    }

    // 挠：三道错开的爪痕，爪尖带高光，出手极快
    if (e.kind === 'clawArc') {
      const sweep = Math.min(1, k * 2.1);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // 底光：让细爪痕在小体型怪物身上也能看清
      ctx.strokeStyle = rgba(e.color, 0.16 * fade);
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius - 4, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const rr = e.radius - 4 + (i - 1) * 6;
        ctx.strokeStyle = rgba(i === 1 ? '#ffffff' : e.color, (0.9 - i * 0.15) * fade);
        ctx.lineWidth = i === 1 ? 4.2 : 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a1);
        ctx.stroke();
        const hx = Math.cos(a1) * rr;
        const hy = Math.sin(a1) * rr;
        ctx.fillStyle = rgba('#ffffff', 0.75 * fade);
        ctx.beginPath();
        ctx.arc(hx, hy, 2.6 - i * 0.4, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 刀光：宽幅月牙斩，亮刃 + 外圈虚影 + 火星
    if (e.kind === 'bladeArc') {
      const sweep = Math.min(1, k * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.15 * fade);
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = rgba(e.color, 0.6 * fade);
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = rgba('#fffdf0', 0.9 * fade);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.28 * fade);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 8, a0 + 0.04, a1);
      ctx.stroke();
      // 刀头亮斑
      const hx = Math.cos(a1) * e.radius;
      const hy = Math.sin(a1) * e.radius;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 15);
      hg.addColorStop(0, rgba('#ffffff', 0.8 * fade));
      hg.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, 15, 0, PI2);
      ctx.fill();
      // 火星
      for (let i = 0; i < 3; i++) {
        const a = a0 + e.arc * (0.32 + i * 0.2) * sweep;
        const rr = e.radius + 6;
        ctx.strokeStyle = rgba('#ffe9b0', (0.55 - i * 0.12) * fade);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a) * (rr + 10 + k * 8), Math.sin(a) * (rr + 10 + k * 8));
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 抓：两片爪钳对合，内侧拉丝收紧（命中会把玩家拽过来）
    if (e.kind === 'grabArc') {
      const close = Math.min(1, k * 1.5);
      const half = e.arc * 0.5 * (1 - close * 0.35);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // 底光：爪钳轮廓
      ctx.strokeStyle = rgba(e.color, 0.14 * fade);
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, -half, half);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, Math.PI - half, Math.PI + half);
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.strokeStyle = rgba(e.color, 0.72 * fade);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, s > 0 ? -half : Math.PI - half, s > 0 ? half : Math.PI + half);
        ctx.stroke();
        // 爪钩：弧端向内收
        const ea = s > 0 ? half : Math.PI - half;
        const ex = Math.cos(ea) * e.radius;
        const ey = Math.sin(ea) * e.radius;
        ctx.strokeStyle = rgba('#ffe3cc', 0.85 * fade);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(ea + s * 0.9) * 9, ey + Math.sin(ea + s * 0.9) * 9);
        ctx.stroke();
      }
      // 拉丝：从怪物向外收拢的细线
      for (let i = 0; i < 5; i++) {
        const a = -0.55 + i * 0.27;
        const inner = e.radius * (0.25 + close * 0.15);
        const outer = e.radius * (1.05 - close * 0.25);
        ctx.strokeStyle = rgba(e.color, (0.3 - i * 0.03) * fade);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner * 0.7);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer * 0.7);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 撞：贴地冲击环 + 前方冲撞楔形
    if (e.kind === 'chargeArc') {
      const r = e.radius * (0.45 + k * 0.75);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.62);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.7, rgba(e.color, 0.24 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba('#fff0d2', 0.75 * fade);
      ctx.lineWidth = Math.max(2, 7 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      ctx.restore();
      // 冲撞楔形：沿朝向拉出的三道速度线
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const yy = (i - 1) * 9;
        ctx.strokeStyle = rgba(e.color, (0.6 - i * 0.12) * fade);
        ctx.lineWidth = 3 - i * 0.5;
        ctx.beginPath();
        ctx.moveTo(r * 0.5, yy);
        ctx.lineTo(r * 1.25 + k * 12, yy * 0.6);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 扑：落地扬尘环 + 翻起的尘雾
    if (e.kind === 'pounceArc') {
      const r = e.radius * (0.4 + k * 0.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.5);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.72, rgba(e.color, 0.2 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(e.color, 0.6 * fade);
      ctx.lineWidth = Math.max(2, 6 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const a = -0.7 + i * 0.7;
        const rr = r * (0.55 + (i % 2) * 0.3);
        const px = e.x + Math.cos(a) * rr;
        const py = e.y + Math.sin(a) * rr * 0.4 - k * 10;
        const pr = 5 + k * 7;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0, rgba('#d8c8a8', 0.22 * fade));
        pg.addColorStop(1, rgba('#d8c8a8', 0));
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, PI2);
        ctx.fill();
      }
      return true;
    }

    // 突进拖影：出手瞬间从原位拉到落点的速度带（扑/撞/抓共用）
    if (e.kind === 'dashTrail') {
      const dx = e.x - e.x0;
      const dy = e.y - e.y0;
      const len = Math.hypot(dx, dy);
      if (len < 1) return true;
      ctx.save();
      ctx.translate(e.x0, e.y0);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const lg = ctx.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, rgba(e.color, 0));
      lg.addColorStop(1, rgba(e.color, 0.45 * fade));
      ctx.strokeStyle = lg;
      ctx.lineWidth = 14 * fade + 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.28 * fade);
      ctx.lineWidth = 1.6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(len * 0.15, i * 6 * fade);
        ctx.lineTo(len * (0.9 - Math.abs(i) * 0.15), i * 3.5);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    if (e.kind === 'peaPuff') {
      const r = e.r0 + (e.r1 - e.r0) * k;
      const g = ctx.createRadialGradient(e.x, e.y, r * 0.15, e.x, e.y, r);
      g.addColorStop(0, rgba(e.color, 0.34 * fade));
      g.addColorStop(0.55, rgba(e.color, 0.16 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, PI2);
      ctx.fill();
      // 孢子小点
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + e.max * 2;
        const rr = r * (0.35 + (i % 3) * 0.18);
        ctx.fillStyle = rgba(e.color, 0.5 * fade);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr * 0.8, 1.6 + (i % 3), 0, PI2);
        ctx.fill();
      }
      return true;
    }
    if (e.kind === 'muzzle') {
      // 远程开火：枪口闪光 + 火花 + 扩散的烟环
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      const f = Math.max(0, 1 - k * 1.7);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 * (0.6 + k));
      g.addColorStop(0, rgba('#fffbe8', 0.95 * f));
      g.addColorStop(0.32, rgba(e.color, 0.7 * f));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 30 * (0.6 + k), 0, PI2);
      ctx.fill();
      // 枪口火舌
      ctx.fillStyle = rgba('#fff4cf', 0.8 * f);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(22 - k * 4, -3, 34 + k * 10, 0);
      ctx.quadraticCurveTo(22 - k * 4, 3, 0, 6);
      ctx.closePath();
      ctx.fill();
      // 火药火花
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.24 + Math.sin(i * 2.1) * 0.1;
        const len = 12 + k * 30;
        ctx.strokeStyle = rgba(e.color, (0.9 - i * 0.12) * f);
        ctx.lineWidth = 2.6 - i * 0.3;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(5 + Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
      // 延迟的烟圈：柔光而非实心圆
      if (k > 0.25) {
        const sk = (k - 0.25) / 0.75;
        const sx = e.x + Math.cos(e.angle) * (10 + sk * 20);
        const sy = e.y + Math.sin(e.angle) * (10 + sk * 20);
        const sr = 7 + sk * 13;
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        sg.addColorStop(0, rgba('#efe9d8', 0.20 * (1 - sk)));
        sg.addColorStop(1, rgba('#efe9d8', 0));
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, PI2);
        ctx.fill();
      }
      return true;
    }

    // 远程读条：脚下聚能法阵 + 头顶聚能球（专属皮肤由 drawFxSkin 叠加）
    if (e.kind === 'castCharge') {
      const kk = 1 - Math.max(0, e.life) / e.max;
      const ff = Math.max(0, Math.min(1, e.life / e.max));
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      // 地面法阵：两圈反向旋转的弧
      ctx.save();
      ctx.scale(1, 0.5);
      ctx.strokeStyle = rgba(e.color, 0.35 + 0.3 * ff);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (1 - kk * 0.22), kk * 5, kk * 5 + 1.9);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (0.72 - kk * 0.12), -kk * 4.5, -kk * 4.5 + 1.5);
      ctx.stroke();
      ctx.restore();
      // 收束光点
      for (let i = 0; i < 6; i++) {
        const a2 = i * 1.047 + kk * 2.2;
        const rr = e.radius * (1.15 - kk * 0.75);
        ctx.globalAlpha = ff * 0.85;
        ctx.fillStyle = rgba(e.color, ff * 0.9);
        ctx.beginPath();
        ctx.arc(Math.cos(a2) * rr, Math.sin(a2) * rr * 0.45, 2, 0, PI2);
        ctx.fill();
      }
      // 头顶聚能球
      const orb = 2 + kk * 6;
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(e.color, 0.4 * ff);
      ctx.beginPath();
      ctx.arc(0, -e.radius * 0.62, orb, 0, PI2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.7 * ff);
      ctx.beginPath();
      ctx.arc(0, -e.radius * 0.62, orb * 0.55, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }
    return false;
  }

  // 专属特效皮肤：每个小怪在招式形状之上叠一层主题碎屑。
  // 位置用固定哈希生成，寿命内不抖动；全部是纯色小图形，不做渐变/shadowBlur。
  function bitRand(i, s) {
    const v = Math.sin((i + 1) * 127.1 + s * 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  function drawFxSkin(ctx, e) {
    const skin = e.skin;
    if (!skin) return;
    const fade = Math.max(0, Math.min(1, e.life / e.max));
    if (fade <= 0) return;
    const k = 1 - fade;
    const bits = skin.bits;
    const color = skin.color || e.color || '#ffffff';
    const n = skin.n || 8;
    const radius = e.radius || 36;
    const arc = e.arc || 1.4;
    const ang0 = e.angle != null ? e.angle : 0;
    const cx = e.x, cy = e.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const r1 = bitRand(i, 1);
      const r2 = bitRand(i, 2);
      const r3 = bitRand(i, 3);
      const ang = ang0 + (r1 - 0.5) * arc * 1.2;
      const dist = radius * (0.3 + r2 * 0.85) * (0.45 + k * 0.9);
      let px = cx + Math.cos(ang) * dist;
      let py = cy + Math.sin(ang) * dist * 0.75;
      const a = fade * (0.5 + r3 * 0.5);
      // 各主题的飘动差异：火星/灵魂上飘，水与碎屑下坠
      if (bits === 'ember' || bits === 'flame' || bits === 'soul' || bits === 'spore') {
        py -= k * (10 + r3 * 22);
      } else if (bits === 'mist' || bits === 'toxin') {
        py -= k * 12;
      } else if (bits === 'water' || bits === 'mucus' || bits === 'blood') {
        py += k * k * (10 + r3 * 16);
      } else if (bits === 'coin' || bits === 'shell' || bits === 'bone' || bits === 'wool') {
        py += k * k * (14 + r3 * 14);
      } else if (bits === 'sand' || bits === 'ink' || bits === 'rock') {
        py += k * k * (12 + r3 * 14);
      } else if (bits === 'bubble' || bits === 'holy' || bits === 'void') {
        py -= k * (14 + r3 * 18);
      } else if (bits === 'crystal') {
        px += Math.cos(ang) * k * 12;
        py += Math.sin(ang) * k * 8 - k * 4;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      switch (bits) {
        case 'blood': {
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - Math.cos(ang) * (4 + r1 * 5), py - Math.sin(ang) * (4 + r1 * 5));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, 1.4 + r2 * 1.2, 0, PI2);
          ctx.fill();
          break;
        }
        case 'bone': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 2);
          ctx.fillRect(-1.7, -1.7, 3.4, 3.4);
          ctx.restore();
          break;
        }
        case 'spore': {
          ctx.globalAlpha = a * 0.4;
          ctx.beginPath();
          ctx.arc(px, py, 3.4 + r2 * 2, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(px, py, 1.2 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'ember': {
          ctx.beginPath();
          ctx.arc(px, py, 1.5 + r3 * 1.4, 0, PI2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (r1 - 0.5) * 4, py - 5 - r2 * 6);
          ctx.stroke();
          break;
        }
        case 'flame': {
          ctx.beginPath();
          ctx.moveTo(px, py - 6 - r2 * 4);
          ctx.quadraticCurveTo(px + 3.4, py, px, py + 3);
          ctx.quadraticCurveTo(px - 3.4, py, px, py - 6 - r2 * 4);
          ctx.fill();
          break;
        }
        case 'mucus': {
          ctx.lineWidth = 2.4 - r1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang + 2.6) * (3 + r2 * 4), py + Math.sin(ang + 2.6) * (3 + r2 * 4));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, 1.8 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'ice': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(-4 - r1 * 2, 0);
          ctx.lineTo(0, -1.8);
          ctx.lineTo(4 + r1 * 2, 0);
          ctx.lineTo(0, 1.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'soul': {
          ctx.globalAlpha = a * 0.7;
          ctx.beginPath();
          ctx.arc(px, py, 2 + r2 * 2, 0, PI2);
          ctx.fill();
          break;
        }
        case 'shell': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 1.5);
          ctx.beginPath();
          ctx.moveTo(-3, 1.5);
          ctx.lineTo(3, 1.5);
          ctx.lineTo(0, -3 - r2 * 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'spike': {
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * (7 + r2 * 7), py + Math.sin(ang) * (7 + r2 * 7));
          ctx.stroke();
          break;
        }
        case 'water': {
          ctx.beginPath();
          ctx.arc(px, py, 1.6 + r1 * 1.2, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(px - Math.cos(ang) * 4, py - Math.sin(ang) * 4, 1, 0, PI2);
          ctx.fill();
          break;
        }
        case 'afterimage': {
          const span = 0.16 + r1 * 0.12;
          ctx.globalAlpha = a * 0.55;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, dist, ang - span, ang + span);
          ctx.stroke();
          break;
        }
        case 'wool': {
          ctx.globalAlpha = a * 0.85;
          ctx.lineWidth = 1.4;
          const wa = r1 * PI2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(wa) * (4 + r2 * 4), py + Math.sin(wa) * (4 + r2 * 4));
          ctx.stroke();
          break;
        }
        case 'coin': {
          ctx.beginPath();
          ctx.arc(px, py, 2 + r1, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.6;
          ctx.fillRect(px + 3, py + 3, 2, 2);
          break;
        }
        case 'petal': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.4 + r2 * 1.6, 1.7, 0, 0, PI2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'toxin': {
          ctx.beginPath();
          ctx.arc(px, py, 1.8 + r1, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(px + (r2 - 0.5) * 6, py - 4 - k * 8, 1 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'mist': {
          ctx.globalAlpha = a * 0.16;
          ctx.beginPath();
          ctx.arc(px, py, 5 + r2 * 4, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.55;
          ctx.beginPath();
          ctx.arc(px, py, 1.4 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'muzzle': {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * (8 + r1 * 8), py + Math.sin(ang) * (8 + r1 * 8));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px + Math.cos(ang) * 5, py + Math.sin(ang) * 5, 1.4 + r2, 0, PI2);
          ctx.fill();
          break;
        }
        case 'needle': {
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * (9 + r1 * 6), py + Math.sin(ang) * (9 + r1 * 6));
          ctx.stroke();
          break;
        }
        case 'lantern': {
          ctx.globalAlpha = a * 0.7;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(px, py, 3 + r2 * 3, ang - 1.1, ang + 1.1);
          ctx.stroke();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(px, py, 1.3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'shadow': {
          // 暗影：弧形残片 + 外圈虚光（lighter 下不能画纯黑）
          ctx.globalAlpha = a * 0.75;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 3 + r2 * 2, ang - 0.9, ang + 0.9);
          ctx.stroke();
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(px - Math.cos(ang) * 4, py - Math.sin(ang) * 4, 2.2 + r1 * 1.6, 0, PI2);
          ctx.fill();
          break;
        }
        case 'ash': {
          ctx.globalAlpha = a * 0.7;
          ctx.beginPath();
          ctx.arc(px, py, 1.4 + r2 * 1.3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'sand': {
          ctx.globalAlpha = a * 0.75;
          ctx.fillRect(px, py, 1.8 + r1, 1.8 + r2);
          break;
        }
        case 'ink': {
          ctx.globalAlpha = a * 0.72;
          ctx.beginPath();
          ctx.arc(px, py, 2.2 + r2 * 2.2, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.35;
          ctx.beginPath();
          ctx.arc(px - Math.cos(ang) * 5, py - 4 - k * 6, 1 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'bubble': {
          ctx.globalAlpha = a * 0.6;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(px, py, 2.4 + r2 * 2.4, 0, PI2);
          ctx.stroke();
          ctx.globalAlpha = a * 0.9;
          ctx.beginPath();
          ctx.arc(px - 1, py - 1, 0.9, 0, PI2);
          ctx.fill();
          break;
        }
        case 'holy': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + k * 0.8);
          ctx.globalAlpha = a * 0.85;
          ctx.fillRect(-1, -5 - r2 * 3, 2, 10 + r2 * 6);
          ctx.fillRect(-3.5, -2, 7, 2);
          ctx.restore();
          break;
        }
        case 'crystal': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 2);
          ctx.beginPath();
          ctx.moveTo(-3 - r2 * 2, 0);
          ctx.lineTo(0, -2);
          ctx.lineTo(3 + r2 * 2, 0);
          ctx.lineTo(0, 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'rock': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(r1 * PI2);
          ctx.beginPath();
          ctx.moveTo(-3, -1.5);
          ctx.lineTo(0, -3 - r2);
          ctx.lineTo(3, -0.5);
          ctx.lineTo(1.5, 2.5);
          ctx.lineTo(-2, 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'void': {
          // 虚空：中空菱形 + 外圈虚光（纯黑在 lighter 下不可见）
          ctx.globalAlpha = a * 0.6;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py - 4 - r2 * 3);
          ctx.lineTo(px + 3, py);
          ctx.lineTo(px, py + 4 + r2 * 3);
          ctx.lineTo(px - 3, py);
          ctx.closePath();
          ctx.stroke();
          ctx.globalAlpha = a * 0.35;
          ctx.beginPath();
          ctx.arc(px, py, 4 + r1 * 3, 0, PI2);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
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
