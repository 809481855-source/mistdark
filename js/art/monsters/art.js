/* 美术 · 小怪绘制基础：调色板与公共绘制工具（自 js/art/monsters.js 拆出）
 * 统一挂到 DG.art.monsterArt，供 monsters/draw.js 与 monsters.js 取用。
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

  DG.art.monsterArt = {
    PI2, DESIGN_H, ART_H, NECK, DARK_FILTER_TEX, clamp, easeOut,
    PAL, FLASH_PAL, MUSH_PAL, PUMPKIN_PAL, SLIME_PAL, MUSH_FLASH, PUMPKIN_FLASH, SLIME_FLASH,
    WOLF_PAL, SKEL_PAL, MIST_PAL, WOLF_FLASH, SKEL_FLASH, MIST_FLASH,
    FROSTWOLF_PAL, BONEKNIGHT_PAL, FROSTSLIME_PAL, FROSTWOLF_FLASH, BONEKNIGHT_FLASH, FROSTSLIME_FLASH,
    MIMIC_PAL, MIMIC_FLASH, MAW_PAL, DOC_PAL, WAR_PAL, MAW_FLASH, DOC_FLASH, WAR_FLASH,
    dimHex, dimPal, whitePal, rgba, fs,
    drawLeg, drawRobe, roundBar, facePath, drawEye, drawHead, drawPea, drawStubLeg, drawWolfLeg
  };
})();
