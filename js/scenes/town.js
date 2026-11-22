/* 主城场景：营地地图 + 可自由走动的角色 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  // 角色立绘走公共绘制资源（js/art/heroes/）
  const heroArt = (cls) => DG.art.heroSvg(cls);

  // ---------- 营地地图参数 ----------
  const MAP_W = 2504, MAP_H = 1680;               // 原图尺寸
  const VIEW_W = 720, VIEW_H = 1440;              // 舞台逻辑尺寸
  const WORLD_W = Math.round(MAP_W * VIEW_H / MAP_H); // 地图按屏高铺满后的世界宽度
  const WORLD_H = VIEW_H;
  const ACTOR_W = 240, ACTOR_H = 256;
  // 步幅基准：330px/s 对应 11rad/s（30px/rad），主城与战斗共用同一换算
  const WALK_REF_SPEED = 330;
  // 进入主城（含从副本返回）固定落点：屏幕水平正中、篝火下方空地
  const START = [0.50, 0.695];

  // 可行走区域：参考图二，取营地中央空地，边缘避开帐篷、木箱、篝火与岩石
  const WALK = [
    [0.27, 0.49], [0.34, 0.455], [0.47, 0.415], [0.58, 0.40], [0.665, 0.435],
    [0.665, 0.62], [0.735, 0.665], [0.82, 0.685], [0.845, 0.705], [0.76, 0.755],
    [0.66, 0.83], [0.56, 0.87], [0.44, 0.885], [0.34, 0.875], [0.315, 0.80],
    [0.315, 0.68], [0.30, 0.58]
  ].map(([x, y]) => [x * WORLD_W, y * WORLD_H]);

  // 空地里的固定障碍（篝火），避免角色直接从火堆上穿过
  const OBSTACLES = [
    { x: 0.745 * WORLD_W, y: 0.565 * WORLD_H, r: 150 }
  ];

  // 射线法判断点是否在可行走多边形内（不含障碍物）
  function insidePoly(x, y) {
    let hit = false;
    for (let i = 0, j = WALK.length - 1; i < WALK.length; j = i++) {
      const xi = WALK[i][0], yi = WALK[i][1];
      const xj = WALK[j][0], yj = WALK[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  // 角色脚部半径：角色中心与边界保持一点距离，避免贴图压进边缘
  const SKIN = 4;

  // 预计算每条边的“朝内”法线：贴边时用固定法线，不会因为点正好落在边界上而退化
  const EDGES = WALK.map((a, i) => {
    const b = WALK[(i + 1) % WALK.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    let nx = -ey / l, ny = ex / l;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (!insidePoly(mx + nx * 3, my + ny * 3)) { nx = -nx; ny = -ny; }
    return { ax: a[0], ay: a[1], bx: b[0], by: b[1], nx, ny };
  });

  // 最近边界信息：返回距离、最近点与平滑的“朝内”法线
  // 顶点附近会融合相邻两条边的法线，斜着顶住拐角时才能顺着滑出去，而不是被弹停
  function boundaryInfo(x, y) {
    let bestD2 = Infinity, bx = x, by = y, bestEdge = null;
    for (let i = 0; i < EDGES.length; i++) {
      const e = EDGES[i];
      const vx = e.bx - e.ax, vy = e.by - e.ay;
      const l2 = vx * vx + vy * vy || 1;
      let t = ((x - e.ax) * vx + (y - e.ay) * vy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = e.ax + vx * t, qy = e.ay + vy * t;
      const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 < bestD2) { bestD2 = d2; bx = qx; by = qy; bestEdge = e; }
    }
    // 障碍圆：最近点在圆周上，法线由圆心指向角色
    for (let i = 0; i < OBSTACLES.length; i++) {
      const o = OBSTACLES[i];
      const ddx = x - o.x, ddy = y - o.y;
      const d = Math.hypot(ddx, ddy) || 0.0001;
      const sd = d - o.r;
      const d2 = sd * sd;
      if (d2 < bestD2) {
        bestD2 = d2;
        bx = o.x + ddx / d * o.r;
        by = o.y + ddy / d * o.r;
        return { d: sd, x: bx, y: by, nx: ddx / d, ny: ddy / d };
      }
    }
    // 汇总与最近点几乎等距的边法线：平直边只有一条，顶点处两条一起参与
    let nx = 0, ny = 0;
    const near = Math.sqrt(bestD2) + 2;
    for (let i = 0; i < EDGES.length; i++) {
      const e = EDGES[i];
      const vx = e.bx - e.ax, vy = e.by - e.ay;
      const l2 = vx * vx + vy * vy || 1;
      let t = ((x - e.ax) * vx + (y - e.ay) * vy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = e.ax + vx * t, qy = e.ay + vy * t;
      if (Math.hypot(x - qx, y - qy) <= near) { nx += e.nx; ny += e.ny; }
    }
    const nl = Math.hypot(nx, ny);
    if (nl > 0.2 && (!bestEdge || insidePoly(bx + nx / nl * 3, by + ny / nl * 3))) {
      nx /= nl; ny /= nl;
    } else if (bestEdge) {
      // 凹角处合成法线可能指向区域外，退回最近那条边的法线
      nx = bestEdge.nx; ny = bestEdge.ny;
    } else {
      nx = 0; ny = -1;
    }
    return { d: Math.sqrt(bestD2), x: bx, y: by, nx, ny };
  }

  // 可站立判定：多边形内且与边界保持脚部半径
  function walkable(x, y) {
    return insidePoly(x, y) && boundaryInfo(x, y).d >= SKIN;
  }

  // 把点击/存档点收进可行走区域：贴边时沿内法线推入，点击边缘外也能走到边上
  function clampIntoWalk(x, y) {
    if (walkable(x, y)) return { x, y };
    const inside = insidePoly(x, y);
    const c = boundaryInfo(x, y);
    const push = inside ? (SKIN + 0.6 - c.d) : (c.d + SKIN + 0.6);
    let px = (inside ? x : c.x) + c.nx * push;
    let py = (inside ? y : c.y) + c.ny * push;
    if (!insidePoly(px, py)) return null;
    const c2 = boundaryInfo(px, py);
    if (c2.d < SKIN) {
      px += c2.nx * (SKIN - c2.d + 0.2);
      py += c2.ny * (SKIN - c2.d + 0.2);
    }
    return { x: px, y: py };
  }

  DG.scenes.town = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('lobby');
      const char = DG.game.char;
      const cls = DG.data.classes[char.cls];
      // 主城阶段提前解码本职业技能音效，进副本第一击即可出声
      if (DG.audio && DG.audio.preloadClass) DG.audio.preloadClass(cls.id);
      const screen = U.el('div', 'screen town-screen');
      const touch = DG.settings.touchEnabled();
      // 角色美术由 art/heroes 注册表提供，新增角色无需改动本文件
      const hero = DG.art.heroFor(cls.id);
      const heroIsCanvas = !!(hero && hero.mode === 'canvas' && hero.canvasDraw);

      // 技能图标全职业共用，装备图标按职业取用（当前职业未配置时回落到文字标识）
      const skillIcon = DG.data.iconFor(cls.id, 'skill');
      const equipIcon = DG.data.iconFor(cls.id, 'equip');
      const need = DG.character.xpNeed(char.level);
      const xpPct = Math.round(DG.character.levelProgress(char) * 100);
      // 底部技能条与战斗内一致：普攻 + 4 个主动技能
      const skillList = [DG.data.skills[cls.autoSkill]]
        .concat(cls.skills.map(id => DG.data.skills[id]));
      const stripSlots = skillList.map((sk, i) =>
        `<button class="strip-slot" data-skill="${i}" title="${U.escapeHtml(sk.name)}">` +
          (sk.icon
            ? `<img src="${sk.icon}" alt="">`
            : `<span class="strip-glyph">${sk.glyph}</span>`) +
        `</button>`
      ).join('');

      screen.innerHTML = `
        <div class="town-world" data-world>
          <div class="town-map" data-map>
            <div class="town-actor" data-actor>
              ${heroIsCanvas ? '' : '<div class="town-actor-shadow"></div>'}
              <div class="town-actor-art" data-art>${heroIsCanvas
                ? '<canvas class="town-hero-canvas" data-hero-canvas width="480" height="512"></canvas>'
                : heroArt(cls)}</div>
            </div>
          </div>
        </div>

        <header class="town-top">
          <div class="town-zone">
            <button class="town-corner-btn" data-act="settings" aria-label="设置">
              <img src="assets/ui/common/func-settings.png" alt="">
            </button>
            <div class="town-tools">
              <button class="plate-btn pick" id="town-switch">选角</button>
              <button class="plate-btn logout" id="town-logout">登出</button>
            </div>
          </div>
        </header>

        ${DG.ui.combatBarHtml({
          barClass: 'town-combat combat-bar',
          equipIcon, equipAttrs: 'data-act="equipment"',
          skillIcon, skillAttrs: 'data-act="skills"',
          badgeAttrs: 'data-act="character"',
          level: char.level,
          slotsHtml: stripSlots,
          expFill: `<i class="exp-fill" data-xp-fill style="width:${xpPct}%"></i>`,
          expText: `${U.fmt(char.xp)} / ${U.fmt(need)}`
        })}

        <button class="town-portal" data-act="portal" aria-label="秘境副本">
          <img src="assets/ui/func-dungeon.png" alt="">
          <span class="portal-fx" aria-hidden="true">
            <span class="portal-fire"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <svg class="portal-bolt" viewBox="0 0 200 200">
              <g class="pb pb-a">
                <path class="pb-glow" d="M26 60 L42 78 L32 86 L50 100 L38 108 L54 122"/>
                <path class="pb-glow" d="M42 78 L33 70"/>
                <path class="pb-core" d="M26 60 L42 78 L32 86 L50 100 L38 108 L54 122"/>
                <path class="pb-core" d="M42 78 L33 70"/>
              </g>
              <g class="pb pb-b">
                <path class="pb-glow" d="M174 60 L158 78 L168 86 L150 100 L162 108 L146 122"/>
                <path class="pb-glow" d="M158 78 L167 70"/>
                <path class="pb-core" d="M174 60 L158 78 L168 86 L150 100 L162 108 L146 122"/>
                <path class="pb-core" d="M158 78 L167 70"/>
              </g>
              <g class="pb pb-c">
                <path class="pb-glow" d="M96 16 L108 38 L96 48 L108 66 L98 76"/>
                <path class="pb-glow" d="M108 38 L118 30"/>
                <path class="pb-core" d="M96 16 L108 38 L96 48 L108 66 L98 76"/>
                <path class="pb-core" d="M108 38 L118 30"/>
              </g>
            </svg>
          </span>
          <span class="tp-label" data-label="秘境副本">秘境副本</span>
        </button>

        <button class="combat-medal quest-medal" data-act="quests" aria-label="任务">
          <span class="medal-glyph">令</span>
          <span class="medal-label" data-label="任务">任务</span>
          <i class="medal-dot${DG.quests && DG.quests.claimableCount(char) > 0 ? '' : ' hidden'}" data-quest-dot></i>
        </button>

        <div class="touch-ui${touch ? '' : ' hidden'}" data-touch>
          <div class="stick-base"></div>
          <div class="stick-knob" data-knob></div>
        </div>`;

      root.replaceChildren(screen);

      // ---------- 地图与角色 ----------
      const world = screen.querySelector('[data-world]');
      const mapEl = screen.querySelector('[data-map]');
      const actor = screen.querySelector('[data-actor]');
      const art = screen.querySelector('[data-art]');
      const heroCanvas = screen.querySelector('[data-hero-canvas]');
      const heroCtx = heroCanvas ? heroCanvas.getContext('2d') : null;
      world.style.width = WORLD_W + 'px';
      world.style.height = WORLD_H + 'px';

      // 进入主城：回到上次离开时的位置（从副本/面板返回也一样），首次进入落在篝火下方
      const saved = DG.game.townPos;
      const savedPos = saved ? clampIntoWalk(saved.x, saved.y) : null;
      const pos = savedPos || { x: WORLD_W * START[0], y: WORLD_H * START[1] };
      let camX = 0, dir = 1, target = null, moving = false, phase = 0;
      const keys = Object.create(null);
      const stick = { x: 0, y: 0 };

      const clampCam = () => Math.max(0, Math.min(WORLD_W - VIEW_W, pos.x - VIEW_W / 2));
      const drawHeroArt = (now) => {
        heroCtx.setTransform(2, 0, 0, 2, 0, 0);
        heroCtx.clearRect(0, 0, 240, 256);
        DG.art.heroFor(cls.id).canvasDraw(heroCtx, 120, 240, {
          scale: 0.8,
          flip: dir < 0,
          state: moving ? 'walk' : 'idle',
          t: now / 1000,
          walkPhase: phase,
          shadow: true
        });
      };
      const paint = (now) => {
        if (heroCtx) {
          art.style.transform = 'none';
          drawHeroArt(now);
        } else {
          const bob = moving ? Math.abs(Math.sin(phase)) * 5 : Math.sin(now / 900) * 1.2;
          art.style.transform = `translateY(${-bob}px) scaleX(${dir})`;
        }
        actor.style.transform = `translate3d(${Math.round(pos.x - ACTOR_W / 2)}px, ${Math.round(pos.y - ACTOR_H)}px, 0)`;
        mapEl.style.transform = `translate3d(${-Math.round(camX)}px, 0, 0)`;
      };
      camX = clampCam();
      paint(0);

      // ---------- 移动解算：直接走 → 贴边切向滑行 → 贴边回推，避免边缘卡脚 ----------
      const vel = { x: 0, y: 0 };
      const tryMove = (sx, sy) => {
        if (!sx && !sy) return false;
        const nx = pos.x + sx, ny = pos.y + sy;
        if (walkable(nx, ny)) { pos.x = nx; pos.y = ny; return true; }

        const want = Math.hypot(sx, sy) || 0.0001;

        // 目标点碰到边界：去掉朝墙的法向分量，只保留切向，沿边缘滑行
        const hit = boundaryInfo(nx, ny);
        const into = sx * hit.nx + sy * hit.ny;
        if (into < 0) {
          const tx = sx - hit.nx * into, ty = sy - hit.ny * into;
          if (walkable(pos.x + tx, pos.y + ty)) { pos.x += tx; pos.y += ty; return true; }
        }

        // 已贴住边界：先让出脚部半径，再沿着新的切线滑一小步，避免原地顶墙
        const here = boundaryInfo(pos.x, pos.y);
        if (here.d < SKIN) {
          const px = pos.x + here.nx * (SKIN - here.d + 0.08);
          const py = pos.y + here.ny * (SKIN - here.d + 0.08);
          if (walkable(px, py)) {
            pos.x = px; pos.y = py;
            const into2 = sx * here.nx + sy * here.ny;
            if (into2 < 0) {
              const tx = sx - here.nx * into2, ty = sy - here.ny * into2;
              if (walkable(px + tx, py + ty)) { pos.x += tx; pos.y += ty; }
            }
            return true;
          }
        }
        const into3 = sx * here.nx + sy * here.ny;
        if (into3 < 0) {
          const tx = sx - here.nx * into3, ty = sy - here.ny * into3;
          if (walkable(pos.x + tx, pos.y + ty)) { pos.x += tx; pos.y += ty; return true; }
        }

        // 尖角处左右各探一点，找到能走的方向，避免完全停住
        // 先按大半步找绕角方向，再按小半步补一次，贴着拐角也能一点点挪出去
        const base = Math.atan2(sy, sx);
        for (let pass = 0; pass < 2; pass++) {
          const scale = pass ? 0.34 : 0.7;
          for (let i = 0; i < 4; i++) {
            const a = base + (i < 2 ? 1 : -1) * (i % 2 ? 0.75 : 0.38);
            const px = Math.cos(a) * want * scale, py = Math.sin(a) * want * scale;
            if (walkable(pos.x + px, pos.y + py)) { pos.x += px; pos.y += py; return true; }
          }
        }
        return false;
      };
      const moveBy = (sx, sy) => {
        // 拆成 ≤4px 的子步，转弯与贴边时逐段修正，轨迹更顺滑
        const steps = Math.max(1, Math.ceil(Math.hypot(sx, sy) / 4));
        const ux = sx / steps, uy = sy / steps;
        for (let i = 0; i < steps; i++) {
          if (!tryMove(ux, uy)) {
            // 被墙吃掉的法向速度清零，避免下一帧继续顶着同一面墙
            const c = boundaryInfo(pos.x, pos.y);
            const d = vel.x * c.nx + vel.y * c.ny;
            if (d < 0) { vel.x -= c.nx * d; vel.y -= c.ny * d; }
            break;
          }
        }
      };

      const KEY_DIR = {
        KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
        KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0]
      };
      const onKeyDown = (e) => {
        if (!KEY_DIR[e.code]) return;
        if (!screen.isConnected) return;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (screen.querySelector('.modal-mask') || document.querySelector('.modal-mask')) return;
        e.preventDefault();
        keys[e.code] = 1;
        target = null;
      };
      const onKeyUp = (e) => {
        if (KEY_DIR[e.code]) keys[e.code] = 0;
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // 点击地面自动走过去（键鼠模式下最顺手；触屏改用浮动摇杆）
      world.addEventListener('pointerdown', (ev) => {
        if (DG.settings.touchEnabled()) return;
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        if (document.querySelector('.modal-mask')) return;
        const rect = screen.getBoundingClientRect();
        const scale = rect.width / VIEW_W;
        const x = (ev.clientX - rect.left) / scale + camX;
        const y = (ev.clientY - rect.top) / scale;
        // 点在地图边缘外也能走：把落点收进可站立区域，避免点了没反应
        const p = clampIntoWalk(x, y);
        if (p) target = p;
      });

      // 浮动摇杆：与战斗共用同一套交互（js/ui/stick.js）
      DG.ui.stick(screen, {
        ignore: '.town-top, .combat-bar, .quest-medal, .town-portal, .town-foot, .toast-wrap',
        onMove(x, y) {
          stick.x = x;
          stick.y = y;
          target = null;
        },
        onEnd() {
          stick.x = 0;
          stick.y = 0;
        }
      });

      let raf = 0, last = 0;
      const tick = (now) => {
        if (!screen.isConnected) {
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onKeyUp);
          cancelAnimationFrame(raf);
          return;
        }
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;

        let dx = 0, dy = 0;
        const busy = !!document.querySelector('.modal-mask');
        if (!busy) {
          for (const code in KEY_DIR) {
            if (keys[code]) { dx += KEY_DIR[code][0]; dy += KEY_DIR[code][1]; }
          }
          dx += stick.x;
          dy += stick.y;
          if (!dx && !dy && target) {
            const tx = target.x - pos.x, ty = target.y - pos.y;
            const d = Math.hypot(tx, ty);
            if (d < 8) { target = null; vel.x = 0; vel.y = 0; }
            else {
              // 接近目标点前线性减速，避免平滑速度冲过头
              const sp = Math.min(1, d / 42);
              dx = tx / d * sp;
              dy = ty / d * sp;
            }
          }
        }
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        const wantMove = len > 0.03;

        // 主城移速固定取职业基础移速：不读取装备/天赋加成，与战斗基础移速保持一致
        const walkSpeed = cls.base.moveSpeed;
        // 速度指数平滑：起步与刹车都有极短的加速/减速，避免一键一停的顿挫
        const accel = dt > 0 ? 1 - Math.exp(-dt / 0.07) : 0;
        vel.x += (dx * walkSpeed - vel.x) * accel;
        vel.y += (dy * walkSpeed - vel.y) * accel;
        if (!wantMove && Math.hypot(vel.x, vel.y) < 10) { vel.x = 0; vel.y = 0; }
        const vlen = Math.hypot(vel.x, vel.y);

        const beforeX = pos.x, beforeY = pos.y;
        if (dt > 0 && vlen > 0.5) {
          moveBy(vel.x * dt, vel.y * dt);
          if (vel.x > 12) dir = 1;
          else if (vel.x < -12) dir = -1;
        }
        // 是否有真实位移：顶死在墙角时不再原地踏步
        const stepped = Math.hypot(pos.x - beforeX, pos.y - beforeY);
        moving = stepped > 0.2;
        // 记录当前位置，下次回到主城时从这里续上
        if (moving) DG.game.townPos = { x: pos.x, y: pos.y };
        // 步频与实际移速成正比：与战斗同一公式，保证同一角色两边走路完全一致
        if (moving) phase += dt * 11 * walkSpeed / WALK_REF_SPEED;
        else if (vlen < 1) phase = 0;

        const camTarget = clampCam();
        if (dt <= 0) camX = camTarget;
        else camX += (camTarget - camX) * (1 - Math.exp(-dt / 0.06));
        paint(now);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      // ---------- 面板操作后局部刷新 ----------
      const refresh = () => {
        const set = (sel, val) => {
          const el = screen.querySelector(sel);
          if (el) el.textContent = val;
        };
        const pct = Math.round(DG.character.levelProgress(char) * 100);
        set('[data-xp-num]', `${U.fmt(char.xp)} / ${U.fmt(DG.character.xpNeed(char.level))}`);
        const fill = screen.querySelector('[data-xp-fill]');
        if (fill) fill.style.width = pct + '%';
        const touchUI = screen.querySelector('[data-touch]');
        if (touchUI) touchUI.classList.toggle('hidden', !DG.settings.touchEnabled());
      };

      screen.querySelector('#town-logout').addEventListener('click', () => DG.game.logout());
      screen.querySelector('#town-switch').addEventListener('click', () => DG.game.gotoCharacter());
      // 底部技能条：点击任意技能格查看 / 升级技能
      screen.querySelectorAll('[data-skill]').forEach(btn => {
        btn.addEventListener('click', () => DG.ui.openSkills(char, refresh));
      });

      screen.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-act');
          if (act === 'portal') {
            DG.ui.openDungeonSelect(char, (def) => {
              DG.game.startDungeon(def);
            });
          } else if (act === 'character') {
            DG.ui.openCharacterInfo(char);
          } else if (act === 'equipment') {
            DG.ui.openEquipment(char, refresh);
          } else if (act === 'skills') {
            DG.ui.openSkills(char, refresh);
          } else if (act === 'quests') {
            DG.ui.openQuests(char, refresh);
          } else if (act === 'settings') {
            DG.ui.openControls(refresh);
          }
        });
      });

      if (!DG.scenes.town._welcomed) {
        DG.scenes.town._welcomed = true;
        setTimeout(() => DG.ui.toast('在营地内走动看看，点击右侧的「秘境副本」或底部图标打开功能', 'gold'), 400);
      }
    },

    reset() {
      DG.scenes.town._welcomed = false;
    }
  };
})();
