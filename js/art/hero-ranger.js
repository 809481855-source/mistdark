(function () {
  const DG = window.DG;
  DG.art = DG.art || {};

  const BASE = 'assets/hero/ranger/current/';
  const VERSION = '?v=purple-ranger-20261120';
  const parts = {
    head: { file: 'head.png', x: -62, y: -155, w: 124, h: 94, img: null },
    body: { file: 'body.png', x: -35, y: -82, w: 70, h: 72, img: null },
    legL: { file: 'leg-left.png', x: -24, y: -34, w: 13, h: 34, px: -18, py: -31, img: null },
    legR: { file: 'leg-right.png', x: 11, y: -34, w: 13, h: 34, px: 18, py: -31, img: null },
    // 武器握柄（木质枪托末端）作为旋转轴，正好落在右手黄点上
    weapon: { file: 'weapon.png', x: -16, y: -83, w: 99, h: 70, px: -12, py: -41, img: null }
  };
  // 双手：身体左右两个黄色圆点；右手贴在握柄上，武器绕它旋转
  const HAND_X = 34, HAND_Y = -31, HAND_R = 7.8;
  const GRIP_DX = HAND_X - parts.weapon.px;
  const GRIP_DY = HAND_Y - parts.weapon.py;
  // 待机参考姿势：握柄在右手上，武器朝右上约 -37°
  const IDLE_WEAPON_ROTATION = -0.65;
  // 武器整体相对手点下移 2px：握柄压在黄点下方
  const WEAPON_DY = 2;
  const arrowSprite = { img: null, tilt: 43.5 * Math.PI / 180 };
  let pending = 0;
  let arrowPending = 1;

  Object.keys(parts).forEach(id => {
    const part = parts[id];
    pending++;
    const image = new Image();
    image.onload = () => { part.img = image; pending--; };
    image.onerror = () => { pending--; };
    DG.assets.assign(image, BASE + part.file + VERSION);
  });

  const arrowImage = new Image();
  arrowImage.onload = () => { arrowSprite.img = arrowImage; arrowPending--; };
  arrowImage.onerror = () => { arrowPending--; };
  DG.assets.assign(arrowImage, BASE + 'attack-arrow.png' + VERSION);

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const smooth = value => value * value * (3 - 2 * value);

  // 眼睛（head.png 的图像坐标）：近处左眼大、远处右眼小
  const EYES = [
    { x: 69.5, y: 62.0, rx: 15.2, ry: 8.0 },
    { x: 105.5, y: 62.4, rx: 8.6, ry: 5.8 }
  ];
  const BLINK_PERIOD = 3.2, BLINK_DUR = 0.18;

  // 眨眼节律：每 3.2s 一次，0.18s 内闭合再睁开
  function blinkOf(t) {
    const phase = t % BLINK_PERIOD;
    if (phase > BLINK_DUR) return 0;
    const k = phase / BLINK_DUR;
    return k < 0.45 ? smooth(k / 0.45) : smooth((1 - k) / 0.55);
  }

  // 眼皮遮罩：在眼睛位置盖黑色椭圆，纵向随眨眼进度张开/收拢
  function drawBlinkMask(ctx, dx, dy, k) {
    const part = parts.head;
    if (!part.img || k <= 0.01) return;
    const sx = part.w / (part.img.naturalWidth || part.w);
    const sy = part.h / (part.img.naturalHeight || part.h);
    ctx.save();
    ctx.fillStyle = '#0b0c10';
    for (let i = 0; i < EYES.length; i++) {
      const eye = EYES[i];
      ctx.save();
      ctx.translate(part.x + dx + eye.x * sx, part.y + dy + eye.y * sy);
      ctx.beginPath();
      ctx.ellipse(0, 0, eye.rx * sx, eye.ry * sy * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function key(time, frames) {
    if (time <= frames[0][0]) return frames[0][1];
    for (let index = 1; index < frames.length; index++) {
      if (time <= frames[index][0]) {
        const from = frames[index - 1];
        const to = frames[index];
        return from[1] + (to[1] - from[1]) * smooth((time - from[0]) / (to[0] - from[0]));
      }
    }
    return frames[frames.length - 1][1];
  }

  function drawPart(ctx, id, dx, dy, rotation, shiftX) {
    const part = parts[id];
    if (!part.img) return;
    ctx.save();
    if (rotation || shiftX) {
      ctx.translate(part.px + dx, part.py + dy);
      ctx.rotate(rotation);
      ctx.drawImage(part.img, part.x - part.px + (shiftX || 0), part.y - part.py, part.w, part.h);
    } else {
      ctx.drawImage(part.img, part.x + dx, part.y + dy, part.w, part.h);
    }
    ctx.restore();
  }

  // 手（黄点）：待机/攻击都画成实心黄圆，右手随武器移动
  function drawHandDot(ctx, x, y) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, HAND_R, 0, Math.PI * 2);
    ctx.fillStyle = '#f2ce68';
    ctx.fill();
    ctx.strokeStyle = '#141110';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
  }

  // 前伸拖影：在弓的真实位置后方补两层淡出残影，形成明显的速度感
  function drawWeaponTrail(ctx, dx, dy, rotation, thrust, fx) {
    const part = parts.weapon;
    if (!part.img || fx <= 0.01 || thrust <= 0.5) return;
    ctx.save();
    ctx.translate(part.px + dx, part.py + dy);
    ctx.rotate(rotation);
    const gx = part.x - part.px;
    const gy = part.y - part.py;
    ctx.globalAlpha = 0.2 * fx;
    ctx.drawImage(part.img, gx + thrust * 0.5, gy, part.w, part.h);
    ctx.globalAlpha = 0.36 * fx;
    ctx.drawImage(part.img, gx + thrust * 0.86, gy, part.w, part.h);
    ctx.restore();
  }

  // 出手风线：从弓梢向指向方向甩出三道收束的气浪，中线补一道亮芯
  function drawThrustWind(ctx, dx, dy, rotation, fx) {
    const part = parts.weapon;
    if (fx <= 0.01) return;
    ctx.save();
    ctx.translate(part.px + dx, part.py + dy);
    ctx.rotate(rotation);
    const tipX = part.x + part.w - part.px;
    const tipY = part.y + part.h * 0.45 - part.py;
    // 弓梢弹射光点：一团软光，强调弦松开的一瞬
    const glowR = 10 + 8 * fx;
    const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, glowR);
    glow.addColorStop(0, 'rgba(246,255,226,' + (0.55 * fx).toFixed(3) + ')');
    glow.addColorStop(0.55, 'rgba(222,242,190,' + (0.22 * fx).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(222,242,190,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tipX, tipY, glowR, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -1; i <= 1; i++) {
      const spread = i * 0.12;
      const y0 = tipY + i * 8.5;
      const len = (20 + 26 * fx) * (i === 0 ? 1 : 0.74);
      const nx = -Math.sin(spread) * 2.7;
      const ny = Math.cos(spread) * 2.7;
      ctx.beginPath();
      ctx.moveTo(tipX + nx, y0 + ny);
      ctx.lineTo(tipX + len * Math.cos(spread), y0 + len * Math.sin(spread));
      ctx.lineTo(tipX - nx, y0 - ny);
      ctx.closePath();
      ctx.fillStyle = 'rgba(236,246,216,' + (0.7 * fx).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,242,' + (0.8 * fx).toFixed(3) + ')';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tipX + 2, tipY);
    ctx.lineTo(tipX + 14 + 26 * fx, tipY);
    ctx.stroke();
    ctx.restore();
  }

  // 姿态计算：draw 与出手点（箭头尖端）共用同一份，保证箭从弓的箭头处飞出
  function computePose(options) {
    const state = options.state || 'idle';
    const time = options.t || 0;
    // 非战斗（选角/城镇）不传 aim，武器保持参考图的待机姿势
    const inBattle = options.aim != null;
    const pose = {
      bodyX: 0, bodyY: 0, headX: 0, headY: 0,
      weaponX: 0, weaponY: 0,
      weaponRotation: inBattle ? 0 : IDLE_WEAPON_ROTATION,
      weaponThrust: 0, thrustFx: 0, hop: 0,
      legL: 0, legR: 0, legLX: 0, legLY: 0, legRX: 0, legRY: 0,
      // 瞄准角：战斗内由移动方向/鼠标决定，局部坐标系下正为向下。
      // 上下接近垂直指向（±85°），左右由镜像处理；上瞄时弓会竖起，需要避让面部
      aim: clamp(options.aim == null ? 0 : options.aim, -1.48, 1.48)
    };

    if (state === 'walk') {
      const ph = options.walkPhase || 0;
      const stride = Math.sin(ph);
      // 走路腿部动作全职业统一（规则基准见 DG.art.walkLegPose）：
      // 两腿先收拢到中线成平行"筷子状"，再左右交替大幅交叉
      const legs = DG.art.walkLegPose(ph, 22, -9);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
      pose.bodyY = Math.abs(stride) * 0.55;
      pose.headY = -Math.abs(stride) * 0.35;
      pose.weaponY = Math.abs(stride) * 0.45;
      // 蹦跶：双腿并拢时整体离地最高，双腿张开时落地
      pose.hop = Math.cos(ph) ** 2 * 6;
      // 头部比身体晚 0.3rad 到达最高点，落地慢半拍
      pose.headY += Math.cos(ph - 0.3) ** 2 * 6 - pose.hop;
    } else if (state === 'attack') {
      const progress = clamp((options.attackT || 0) / 0.46, 0, 1);
      pose.weaponX = key(progress, [[0, 0], [0.38, 0], [0.62, 8], [1, 0]]);
      pose.weaponY = key(progress, [[0, 0], [0.38, -7], [0.62, -2], [1, 0]]);
      pose.weaponRotation += key(progress, [[0, 0], [0.38, -0.13], [0.62, 0.08], [1, 0]]);
      // 出手瞬间武器沿指向方向前伸，收招时回位
      pose.weaponThrust = key(progress, [[0, 0], [0.32, -5], [0.62, 13], [1, 0]]);
      pose.thrustFx = key(progress, [[0.30, 0], [0.62, 1], [0.92, 0]]);
    } else if (state === 'hurt') {
      // 受击硬直：上半身与头猛地后仰一顿，手和武器被带得一沉，腿微微踉跄
      // hurtT 为剩余硬直时间（0.30s 倒计时），脚的位移由场景的后退逻辑负责
      const hp = 1 - clamp((options.hurtT == null ? 0.3 : options.hurtT) / 0.3, 0, 1);
      pose.bodyX = key(hp, [[0, -9], [0.55, -3], [1, 0]]);
      pose.headX = key(hp, [[0, -13], [0.50, -4], [1, 0]]);
      pose.bodyY = key(hp, [[0, 3.6], [0.50, 1.0], [1, 0]]);
      pose.headY = key(hp, [[0, -2.6], [0.50, -0.6], [1, 0]]);
      pose.weaponX = pose.bodyX * 0.8;
      pose.weaponY = key(hp, [[0, -3.5], [0.5, 0], [1, 0]]);
      pose.weaponRotation += key(hp, [[0, 0.22], [0.5, 0.02], [1, 0]]);
      pose.legL = key(hp, [[0, -0.18], [0.45, 0], [1, 0]]);
      pose.legR = key(hp, [[0, 0.18], [0.45, 0], [1, 0]]);
    } else {
      // 待机呼吸：躯干慢速上下浮沉（周期 1.5s，±2px），
      // 头单独做点头式的上下浮动（周期 1.2s，±3px），持弓手跟随躯干
      pose.bodyY = Math.sin(time * (Math.PI * 2 / 1.5)) * 2.0;
      pose.headY = Math.sin(time * (Math.PI * 2 / 1.2)) * 3.0;
      pose.weaponY = pose.bodyY * 0.9;
    }
    // 武器呼吸：以右手黄点为圆心做扇形上下浮动（箭尖约 ±4px，周期 1.2s），
    // 攻击/受击时让位给动作本身
    if (state !== 'attack' && state !== 'hurt') {
      pose.weaponRotation += Math.sin(time * (Math.PI * 2 / 1.2)) * 0.042;
    }
    // 战斗内武器角度跟随移动方向；左右朝向由 mirror 处理，上下的仰俯在这里叠加
    if (inBattle) {
      pose.weaponRotation += pose.aim;
      // 接近垂直时略作让位：上瞄避开面部，下瞄少压地面
      if (pose.aim < 0) {
        const k = -pose.aim / 1.48;
        pose.weaponX += 30 * k;
        pose.weaponY -= 6 * k;
      } else if (pose.aim > 0) {
        const k = pose.aim / 1.48;
        pose.weaponX += 8 * k;
        pose.weaponY -= 30 * k;
      }
    }
    // 握柄基准点：始终落在右手黄点上
    pose.weaponX += GRIP_DX;
    pose.weaponY += GRIP_DY;
    // 统一规则：战斗中只要在移动，双腿一律播放与主城相同的走路动作，
    // 攻击/受击等任何状态都不得冻结或替换腿部动作
    if (options.moving) {
      const legs = DG.art.walkLegPose(options.walkPhase || 0, 22, -9);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
    }
    return pose;
  }

  // 箭尖出手点：当前姿态下弓上箭头的尖端局部坐标（与画面上看到的位置一致），
  // angle 为武器朝向。技能弹道应从这里起飞，并随武器转动/前伸而变化。
  function muzzleTip(options) {
    const pose = computePose(options || {});
    const part = parts.weapon;
    const lx = part.x + part.w - 4 - part.px + pose.weaponThrust;
    const ly = part.y + part.h * 0.45 - part.py;
    const c = Math.cos(pose.weaponRotation);
    const s = Math.sin(pose.weaponRotation);
    return {
      x: part.px + pose.weaponX + lx * c - ly * s,
      y: part.py + pose.weaponY + WEAPON_DY + lx * s + ly * c,
      angle: pose.weaponRotation
    };
  }

  function draw(ctx, x, y, opts) {
    if (pending) return;
    const options = opts || {};
    const ps = computePose(options);
    // 位移量化到半像素：呼吸这类慢速小幅位移如果落在任意小数上，浏览器每帧都会
    // 以新的采样相位重滤整张位图，边缘持续“爬行”，看起来发糊、不丝滑。
    // 量化到 0.5px 后同一档位内每帧位图完全一致，位移仍以 0.5px 台阶连续推进。
    const qv = (v) => Math.round(v * 2) / 2;
    const bx = qv(ps.bodyX), by = qv(ps.bodyY);
    const hx = qv(ps.headX), hy = qv(ps.headY);
    const wx = qv(ps.weaponX), wy = qv(ps.weaponY);

    const mirror = options.flip ? -1 : 1;
    const scale = options.scale == null ? 1 : options.scale;
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    ctx.scale(scale * mirror, scale);
    if (options.shadow) {
      // 腾空越高，影子越小越淡
      const hop = ps.hop || 0;
      const shrink = 1 - hop * 0.03;
      ctx.save();
      ctx.scale(1, 0.24);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.38 - hop * 0.012).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, 37 * shrink, 11 * shrink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 蹦跶：整体（含双脚）离地，影子留在原地
    if (ps.hop) ctx.translate(0, -qv(ps.hop));
    drawPart(ctx, 'legL', 2 + qv(ps.legLX), qv(ps.legLY), ps.legL);
    drawPart(ctx, 'legR', -2 + qv(ps.legRX), qv(ps.legRY), ps.legR);
    drawPart(ctx, 'body', bx, by, 0);
    drawPart(ctx, 'head', hx, hy, 0);
    drawBlinkMask(ctx, hx, hy, blinkOf(options.t || 0));
    // 左手黄点：身体另一侧，随呼吸/走路起伏
    drawHandDot(ctx, -HAND_X, HAND_Y + by);
    drawWeaponTrail(ctx, wx, wy + WEAPON_DY, ps.weaponRotation, ps.weaponThrust, ps.thrustFx);
    drawPart(ctx, 'weapon', wx, wy + WEAPON_DY, ps.weaponRotation, ps.weaponThrust);
    // 右手黄点：贴着握柄末端，武器前伸时跟着走
    const wr = ps.weaponRotation;
    drawHandDot(
      ctx,
      parts.weapon.px + wx + ps.weaponThrust * Math.cos(wr),
      parts.weapon.py + wy + ps.weaponThrust * Math.sin(wr)
    );
    drawThrustWind(ctx, wx, wy + WEAPON_DY, ps.weaponRotation, ps.thrustFx);
    ctx.restore();
  }

  DG.art.ranger = {
    draw,
    muzzleTip,
    parts,
    ready: () => pending === 0,
    arrowSprite,
    arrowReady: () => arrowPending === 0 && !!arrowSprite.img,
    equipmentSlots: ['head', 'body', 'legL', 'legR', 'weapon']
  };
})();
