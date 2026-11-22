/* 副本战斗 · 天气层：每局一种纯视觉天气，屏幕空间粒子 + 缓存色调
   性能约束：粒子对象一次创建、循环复用；同类粒子合并成一次 stroke/fill；
   所有渐变只创建一次，逐帧只改 globalAlpha */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H } = DG.scenes.dungeon.size;

  // 每种天气的表现参数：粒子形态、数量、速度、色调
  // rain/sand/wind 用线段，snow 用小方块
  const WEATHERS = {
    rain: {
      name: '细雨', kind: 'rain', count: 150,
      speed: [900, 1250], angle: 0.22, len: [12, 22],
      color: 'rgba(178,202,226,0.42)', tint: 'rgba(28,40,62,0.14)'
    },
    storm: {
      name: '雷雨', kind: 'rain', count: 175,
      speed: [1150, 1600], angle: 0.3, len: [16, 26],
      color: 'rgba(170,196,226,0.46)', tint: 'rgba(18,26,46,0.26)', flash: true
    },
    snow: {
      name: '落雪', kind: 'snow', count: 72,
      speed: [55, 130], drift: [14, 34], r: [1.2, 2.8], wind: 20,
      color: 'rgba(232,240,250,0.62)', tint: 'rgba(150,176,208,0.10)'
    },
    wind: {
      name: '疾风', kind: 'wind', count: 58,
      speed: [700, 1050], len: [40, 100],
      color: 'rgba(206,196,172,0.21)', tint: 'rgba(72,64,48,0.06)'
    },
    sandstorm: {
      name: '沙尘暴', kind: 'sand', count: 130,
      speed: [900, 1350], len: [30, 70],
      color: 'rgba(216,182,120,0.30)', tint: 'rgba(96,70,34,0.26)'
    },
    // —— 主题场景专属天气 ——
    purplewind: {
      name: '紫焰风', kind: 'emberwind', count: 64,
      speed: [620, 980], len: [34, 88], ambient: 'wind',
      color: 'rgba(198,140,246,0.26)', tint: 'rgba(58,16,88,0.17)'
    },
    blizzard: {
      name: '暴雪', kind: 'snow', count: 132,
      speed: [150, 300], drift: [26, 62], r: [1.4, 3.2], wind: 90, ambient: 'snow',
      color: 'rgba(236,244,255,0.68)', tint: 'rgba(120,164,214,0.17)'
    },
    bloodrain: {
      name: '血雨', kind: 'rain', count: 168,
      speed: [1000, 1450], angle: 0.18, len: [16, 28], ambient: 'rain',
      color: 'rgba(196,54,44,0.46)', tint: 'rgba(72,10,8,0.22)',
      splash: 'rgba(214,66,54,0.55)'
    },
    grasswind: {
      name: '飞草', kind: 'grass', count: 110,
      speed: [520, 920], tint: 'rgba(44,110,86,0.10)', ambient: 'wind',
      colors: ['rgba(150,220,150,0.55)', 'rgba(108,190,160,0.5)', 'rgba(212,226,142,0.45)']
    },
    maplefall: {
      name: '枫落', kind: 'maple', count: 64,
      vy: [55, 120], vx: [24, 80], size: [5, 10], ambient: 'wind',
      tint: 'rgba(120,56,14,0.14)',
      colors: ['#d9822b', '#c85a28', '#e0a03a', '#a8471e']
    }
  };

  // 地图风格 → 天气权重：森林少沙尘，墓穴多风暴，深渊多风暴与沙尘
  const STYLE_POOL = {
    grove: [
      { id: 'rain', weight: 32 }, { id: 'storm', weight: 22 },
      { id: 'wind', weight: 22 }, { id: 'snow', weight: 12 },
      { id: 'sandstorm', weight: 12 }
    ],
    crypt: [
      { id: 'storm', weight: 34 }, { id: 'wind', weight: 24 },
      { id: 'rain', weight: 24 }, { id: 'sandstorm', weight: 18 }
    ],
    abyss: [
      { id: 'storm', weight: 30 }, { id: 'sandstorm', weight: 26 },
      { id: 'wind', weight: 22 }, { id: 'rain', weight: 22 }
    ],
    // 主题场景固定标志性天气，保证一眼能认出场景
    inferno: [{ id: 'purplewind', weight: 100 }],
    snowfield: [{ id: 'blizzard', weight: 100 }],
    hell: [{ id: 'bloodrain', weight: 100 }],
    savanna: [{ id: 'grasswind', weight: 100 }],
    autumn: [{ id: 'maplefall', weight: 100 }]
  };

  // 天气的战斗规则与怪物倾向
  // monSpeed=怪物移速倍率 / windup=起手倍率 / sight=索敌半径倍率 / chill=命中冰缓概率
  // projDrift=敌方弹道每秒偏转角 / packBonus=每群额外怪 / spread=怪群散布倍率
  const RULES = {
    rain: {
      desc: '泥泞：水洼会拖慢怪物，可把怪引进水洼风筝',
      monSpeed: 0.9, windup: 1.15, packBonus: 1,
      bias: ['slime', 'frostslime', 'deepfin', 'angler', 'pea']
    },
    storm: {
      desc: '落雷：周期性天雷轰击，飞行与远程怪增多',
      eliteChance: 0.42, strike: true,
      bias: ['bat', 'cinderraven', 'hornet', 'mistwalker', 'musketeer']
    },
    snow: {
      desc: '严寒：积雪会拖住怪物脚步，命中附加冰缓',
      monSpeed: 0.86, chill: 0.3,
      bias: ['frostwolf', 'frostslime', 'wolf', 'fleece']
    },
    wind: {
      desc: '强风：风带会把你推快、把怪物拖慢',
      monSpeed: 1.06, projDrift: 0.3, spread: 1.7,
      bias: ['foxraider', 'cowlbandit', 'wolf', 'hornet']
    },
    sandstorm: {
      desc: '沙尘蔽目：流沙会陷住怪物，视野同时缩短',
      monSpeed: 0.95, sight: 0.62, spread: 0.85,
      bias: ['skeleton', 'bat', 'foxraider', 'mimic', 'beetle']
    },
    purplewind: {
      desc: '紫焰狂风：余烬地火会灼伤怪物，焰属怪增多',
      monSpeed: 1.05, projDrift: 0.28, spread: 1.5,
      bias: ['candle', 'cinderraven', 'beetle', 'emberdrake', 'warlock']
    },
    blizzard: {
      desc: '暴雪：视野与索敌被压低，雪地会拖慢怪物，可借机脱战',
      monSpeed: 0.82, chill: 0.38,
      bias: ['frostwolf', 'frostslime', 'wolf', 'fleece', 'bulwark']
    },
    bloodrain: {
      desc: '血雨：血泊会减速并腐蚀怪物，嗜血怪增多',
      monSpeed: 1.02, windup: 0.9,
      bias: ['bat', 'hornet', 'foxraider', 'skeleton', 'mimic']
    },
    grasswind: {
      desc: '草原疾风：高草可以藏身，怪群更分散',
      monSpeed: 1.04, spread: 1.6,
      bias: ['wolf', 'foxraider', 'fleece', 'venomlisk']
    },
    maplefall: {
      desc: '枫落：枫叶堆会被踩爆，可把怪物引上去',
      sight: 0.7, spread: 1.15,
      bias: ['wolf', 'mistwalker', 'pumpkin', 'musketeer']
    }
  };

  Object.assign(DG.scenes.dungeon.prototype, {
  // 进入副本时掷一次天气，整局不变
  rollWeather() {
    const pool = STYLE_POOL[this.def && this.def.mapStyle] || STYLE_POOL.grove;
    this.weather = U.weighted(pool).id;
    this.weatherName = WEATHERS[this.weather].name;
    this.wxFlash = 0;
    this.wxNextFlash = U.rand(2.4, 6.5);
    this.wxParticles = [];
    const p = WEATHERS[this.weather];
    for (let i = 0; i < p.count; i++) this.wxParticles.push(this.makeWxParticle(p));

    // 附加表现：雨点溅落 / 疾风落叶 / 沙尘滚滚 / 雷电折线
    this.wxSplashAcc = 0;
    this.wxSplashIdx = 0;
    this.wxSplash = [];
    if (p.kind === 'rain') {
      for (let i = 0; i < 26; i++) this.wxSplash.push({ x: 0, y: 0, life: 0, r: 1 });
    }
    this.wxLeaves = [];
    if (this.weather === 'wind') {
      for (let i = 0; i < 18; i++) this.wxLeaves.push(this.makeLeaf());
    }
    // 紫焰风：风线之外再叠一层随风漂移的余烬
    this.wxEmbers = [];
    if (p.kind === 'emberwind') {
      for (let i = 0; i < 38; i++) {
        this.wxEmbers.push({
          x: U.rand(-W, W), y: U.rand(0, H),
          vx: U.rand(120, 340), vy: U.rand(24, 78),
          r: U.rand(1.1, 2.6), ph: U.rand(0, 6.28)
        });
      }
    }
    this.wxGust = 0;
    this.wxGustT = U.rand(0, 6);
    this.wxBolt = null;

    // 战斗规则：数值倍率与怪物倾向，供战斗/刷怪层直接读取
    const rule = RULES[this.weather] || {};
    this.wxRule = rule;
    this.wxMonSpeed = rule.monSpeed || 1;
    this.wxWindup = rule.windup || 1;
    this.wxSightMul = rule.sight || 1;
    this.wxProjDrift = rule.projDrift || 0;
    this.wxPackBonus = rule.packBonus || 0;
    this.wxSpreadMul = rule.spread || 1;
    // 雷雨额外提升精英出现率；基础概率由关卡难度曲线决定
    this.wxEliteBonus = rule.eliteChance ? Math.max(0, rule.eliteChance - 0.3) : 0;
    this.wxSpawnBias = rule.bias || null;
    // 雷雨天雷：先画预警圈，0.85 秒后落雷
    this.wxStrikes = [];
    this.wxStrikeT = U.rand(9, 14);

    // 天气环境音：未解锁时会先记住，首次点击/按键后自动补播
    if (DG.audio) DG.audio.setAmbient(p.ambient || this.weather);
  },
  makeLeaf() {
    return {
      x: U.rand(-W, W), y: U.rand(0, H),
      vx: U.rand(420, 760), vy: U.rand(-40, 40),
      s: U.rand(4.5, 8.5), rot: U.rand(0, 6.28), spin: U.rand(-6, 6),
      color: U.chance(0.5) ? '#b0a06a' : '#8a7a4e'
    };
  },
  // 雷电视觉：主干 + 一条分叉，生命 0.18 秒
  makeBolt() {
    const pts = [];
    let x = U.rand(W * 0.18, W * 0.82);
    pts.push({ x: x, y: -10 });
    for (let i = 1; i <= 8; i++) {
      x += U.rand(-46, 46);
      pts.push({ x: U.clamp(x, 10, W - 10), y: (H * 0.5) * (i / 8) });
    }
    const bi = 3 + U.randInt(0, 2);
    const branch = [{ x: pts[bi].x, y: pts[bi].y }];
    let bx = pts[bi].x, by = pts[bi].y;
    for (let i = 0; i < 3; i++) {
      bx += U.rand(18, 52) * (U.chance(0.5) ? 1 : -1);
      by += U.rand(20, 46);
      branch.push({ x: bx, y: by });
    }
    this.wxBolt = { pts: pts, branch: branch, life: 0.18, max: 0.18 };
  },
  // 天雷落地：玩家与怪物都会被劈到，是危险也是清怪机会
  strikeLightning(x, y) {
    this.addBurst(x, y, '#bcd9ff', 16);
    this.addRing(x, y, 12, 112, '#dceaff', 0.34);
    this.makeBolt();
    this.wxFlash = Math.max(this.wxFlash, 0.9);
    this.shake = Math.max(this.shake, 0.2);
    if (DG.audio) DG.audio.thunder(0.85);

    const R = 92;
    if (U.dist(this.player, { x: x, y: y }) < R + this.player.r) {
      this.hurtPlayer(Math.round(this.player.maxHp * 0.07));
      this.addFloater(this.player.x, this.player.y - 40, '雷击', '#bcd9ff', 24);
    }
    for (const m of this.monsters) {
      if (m.dead || m.boss) continue;
      if (U.dist(m, { x: x, y: y }) < R + m.r) {
        this.hitMonster(m, Math.max(10, Math.round(m.maxHp * 0.18)), false);
      }
    }
  },
  makeWxParticle(p) {
    const q = { kind: p.kind, ph: U.rand(0, 6.28) };
    if (p.kind === 'rain') {
      const sp = U.rand(p.speed[0], p.speed[1]);
      const len = U.rand(p.len[0], p.len[1]);
      q.vy = Math.cos(p.angle) * sp;
      q.vx = Math.sin(p.angle) * sp;
      q.dx = Math.sin(p.angle) * len;
      q.dy = Math.cos(p.angle) * len;
      q.x = U.rand(-120, W + 60);
      q.y = U.rand(-H, H);
    } else if (p.kind === 'sand' || p.kind === 'wind' || p.kind === 'emberwind') {
      const sp = U.rand(p.speed[0], p.speed[1]);
      const len = U.rand(p.len[0], p.len[1]);
      q.vx = sp;
      q.vy = 0;
      q.dx = len;
      q.dy = p.kind === 'sand' ? len * 0.14 : len * 0.06;
      q.x = U.rand(-W, W);
      q.y = U.rand(0, H);
      if (p.kind !== 'sand') q.amp = U.rand(6, 18);
    } else if (p.kind === 'grass') {
      q.vx = U.rand(p.speed[0], p.speed[1]);
      q.len = U.rand(10, 22);
      q.rot = U.rand(-0.5, 0.5);
      q.spin = U.rand(-5, 5);
      q.ci = U.randInt(0, p.colors.length - 1);
      q.x = U.rand(-W, W);
      q.y = U.rand(0, H);
    } else if (p.kind === 'maple') {
      q.vy = U.rand(p.vy[0], p.vy[1]);
      q.vx = U.rand(p.vx[0], p.vx[1]);
      q.s = U.rand(p.size[0], p.size[1]);
      q.rot = U.rand(0, 6.28);
      q.spin = U.rand(-3.5, 3.5);
      q.color = p.colors[U.randInt(0, p.colors.length - 1)];
      q.x = U.rand(0, W);
      q.y = U.rand(-H, H);
    } else if (p.kind === 'snow') {
      q.vy = U.rand(p.speed[0], p.speed[1]);
      q.drift = U.rand(p.drift[0], p.drift[1]);
      q.r = U.rand(p.r[0], p.r[1]);
      q.x = U.rand(0, W);
      q.y = U.rand(0, H);
      q.glint = U.chance(0.28);   // 少数雪片闪一下，避免整屏死板
    }
    return q;
  },
  updateWeather(dt) {
    const p = WEATHERS[this.weather];
    if (!p) return;
    const list = this.wxParticles;
    if (list) {
      for (const q of list) {
        if (q.kind === 'rain') {
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          if (q.y > H + 26) {
            q.y = -26 - U.rand(0, 180);
            q.x = U.rand(-120, W + 60);
          }
        } else if (q.kind === 'sand' || q.kind === 'wind' || q.kind === 'emberwind') {
          q.x += q.vx * dt;
          if (q.x > W + 120) {
            q.x = -120 - U.rand(0, 260);
            q.y = U.rand(0, H);
          }
          if (q.amp) {
            q.ph += dt * 2.2;
            q.y += Math.sin(q.ph) * q.amp * dt;
          }
        } else if (q.kind === 'grass') {
          q.x += q.vx * dt * (1 + this.wxGust * 0.7);
          q.ph += dt * 3.4;
          q.y += (Math.sin(q.ph) * 26 + 16) * dt;
          q.rot = Math.sin(q.ph) * 0.65;
          if (q.x > W + 40) {
            q.x = -40 - U.rand(0, 260);
            q.y = U.rand(0, H);
          }
          if (q.y > H + 20) q.y = -20;
        } else if (q.kind === 'maple') {
          q.ph += dt * 2.1;
          q.x += (q.vx + Math.sin(q.ph) * 42) * dt * (1 + this.wxGust * 0.3);
          q.y += q.vy * dt;
          q.rot += q.spin * dt;
          if (q.y > H + 20) {
            q.y = -20;
            q.x = U.rand(0, W);
          }
          if (q.x > W + 24) q.x = -24;
        } else if (q.kind === 'snow') {
          q.ph += dt * 1.6;
          q.x += (Math.sin(q.ph) * q.drift + p.wind) * dt;
          q.y += q.vy * dt;
          if (q.y > H + 8) { q.y = -8; q.x = U.rand(0, W); }
          if (q.x > W + 10) q.x -= W + 20;
          else if (q.x < -10) q.x += W + 20;
        }
      }
    }
    // 雨点溅落：按频率从对象池里取一个空闲水花
    if (this.wxSplash.length) {
      this.wxSplashAcc += dt * (p.flash ? 64 : 44);
      let guard = 4;
      while (this.wxSplashAcc >= 1 && guard-- > 0) {
        this.wxSplashAcc -= 1;
        this.wxSplashIdx = (this.wxSplashIdx + 1) % this.wxSplash.length;
        const s = this.wxSplash[this.wxSplashIdx];
        if (s.life <= 0) {
          s.x = U.rand(0, W);
          s.y = U.rand(H * 0.12, H);
          s.life = 0.34;
          s.r = U.rand(1, 2.2);
        }
      }
      for (const s of this.wxSplash) {
        if (s.life > 0) s.life -= dt;
      }
    }

    // 余烬：随风向右上飘，越界后从左侧重新吹入
    if (this.wxEmbers && this.wxEmbers.length) {
      for (const e of this.wxEmbers) {
        e.ph += dt * 3;
        e.x += e.vx * dt * (1 + this.wxGust * 0.9);
        e.y -= (e.vy + Math.sin(e.ph) * 18) * dt;
        if (e.x > W + 20 || e.y < -12) {
          e.x = -20 - U.rand(0, 120);
          e.y = U.rand(H * 0.1, H);
        }
      }
    }

    // 阵风：疾风与沙尘暴每隔几秒来一阵，短时加强
    if (this.weather === 'wind' || this.weather === 'sandstorm' ||
      this.weather === 'purplewind' || this.weather === 'grasswind') {
      this.wxGustT += dt;
      this.wxGust = Math.max(0, this.wxGust - dt * 0.9);
      if (this.wxGustT > 6.2) {
        this.wxGustT = 0;
        this.wxGust = 1;
      }
    }

    // 落叶：飞出右侧后回收重置
    if (this.wxLeaves.length) {
      for (const q of this.wxLeaves) {
        q.x += q.vx * dt * (1 + this.wxGust * 0.7);
        q.y += (q.vy + Math.sin(q.rot) * 60) * dt;
        q.rot += q.spin * dt;
        if (q.x > W + 24 || q.y < -30 || q.y > H + 30) {
          const n = this.makeLeaf();
          q.x = -24;
          q.y = n.y;
          q.vx = n.vx;
          q.vy = n.vy;
          q.s = n.s;
          q.color = n.color;
        }
      }
    }

    // 落雷：在玩家附近预警，随后对范围内玩家与怪物同时造成伤害
    if (this.wxRule && this.wxRule.strike && !this.ending && !this.finished) {
      this.wxStrikeT -= dt;
      if (this.wxStrikeT <= 0) {
        this.wxStrikeT = U.rand(10, 15);
        const a = U.rand(0, Math.PI * 2);
        const r = U.rand(100, 240);
        const x = U.clamp(this.player.x + Math.cos(a) * r, 60, (this.arenaW || 3600) - 60);
        const y = U.clamp(this.player.y + Math.sin(a) * r, 60, (this.arenaH || 3840) - 60);
        this.addRing(x, y, 8, 92, '#9fd0ff', 0.85);
        this.wxStrikes.push({ x: x, y: y, t: 0.85 });
      }
      for (let i = this.wxStrikes.length - 1; i >= 0; i--) {
        const s = this.wxStrikes[i];
        s.t -= dt;
        if (s.t > 0) continue;
        this.wxStrikes.splice(i, 1);
        this.strikeLightning(s.x, s.y);
      }
    }

    if (p.flash) {
      this.wxNextFlash -= dt;
      if (this.wxNextFlash <= 0) {
        this.wxNextFlash = U.rand(2.6, 7);
        this.wxFlash = U.rand(0.55, 1);
        this.shake = Math.max(this.shake, 0.05 + this.wxFlash * 0.1);
        this.makeBolt();
        if (DG.audio) DG.audio.thunder(this.wxFlash);
      }
      if (this.wxFlash > 0) this.wxFlash = Math.max(0, this.wxFlash - dt * 5.5);
      if (this.wxBolt) {
        this.wxBolt.life -= dt;
        if (this.wxBolt.life <= 0) this.wxBolt = null;
      }
    }
  },
  // 天气画在实体与世界特效之上、暗角/受击红闪与 HUD 之下；
  // 首领在场时整体降到 70% 强度，保证战斗信息可读
  drawWeather(ctx) {
    const p = WEATHERS[this.weather];
    if (!p || !this.wxParticles) return;
    let calm = 1;
    for (const m of this.monsters) {
      if (m.boss && !m.dead) { calm = 0.7; break; }
    }

    ctx.save();
    // 1) 全局色调（沙尘暴随阵风轻微加深）
    const tintK = this.weather === 'sandstorm' ? 1 + this.wxGust * 0.3 : 1;
    ctx.globalAlpha = Math.min(1, calm * tintK);
    ctx.fillStyle = p.tint;
    ctx.fillRect(0, 0, W, H);

    // 2) 粒子：同一形态合并成一次 draw call
    ctx.globalAlpha = calm;
    const list = this.wxParticles;

    // 雨点溅落：地面小水花（逐个小圆环，数量有限）
    if (this.wxSplash.length) {
      ctx.strokeStyle = p.splash || 'rgba(190,214,236,0.5)';
      ctx.lineWidth = 1;
      for (const s of this.wxSplash) {
        if (s.life <= 0) continue;
        const k = 1 - s.life / 0.34;
        ctx.globalAlpha = calm * (1 - k) * 0.5;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 2 + k * 7, (2 + k * 7) * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = calm;
    }
    if (p.kind === 'rain') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const q of list) {
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.dx, q.y - q.dy);
      }
      ctx.stroke();
    } else if (p.kind === 'sand' || p.kind === 'wind' || p.kind === 'emberwind') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.kind === 'sand' ? 1.4 : 1.1;
      ctx.beginPath();
      for (const q of list) {
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.dx, q.y - q.dy);
      }
      ctx.stroke();
    } else if (p.kind === 'grass') {
      // 草叶按颜色分三批绘制，避免逐片切换样式
      for (let ci = 0; ci < p.colors.length; ci++) {
        ctx.strokeStyle = p.colors[ci];
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (const q of list) {
          if (q.ci !== ci) continue;
          const c = Math.cos(q.rot), s = Math.sin(q.rot);
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x + c * q.len, q.y + s * q.len * 0.5);
          ctx.moveTo(q.x + 2, q.y + 2);
          ctx.lineTo(q.x + c * q.len * 0.7 + 3, q.y + s * q.len * 0.35 - 2);
        }
        ctx.stroke();
      }
    } else if (p.kind === 'maple') {
      for (const q of list) {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.globalAlpha = calm * 0.85;
        ctx.beginPath();
        ctx.ellipse(0, 0, q.s, q.s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = calm;
    } else if (p.kind === 'snow') {
      ctx.fillStyle = p.color;
      for (const q of list) ctx.fillRect(q.x, q.y, q.r, q.r);
      // 闪烁的雪片单独一批，做出反光感
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const q of list) {
        if (q.glint) ctx.fillRect(q.x - 0.4, q.y - 0.4, q.r + 0.8, q.r + 0.8);
      }
    }

    // 紫焰余烬：外圈柔光 + 亮芯两批绘制
    if (this.wxEmbers && this.wxEmbers.length) {
      ctx.fillStyle = 'rgba(188,116,255,0.28)';
      for (const e of this.wxEmbers) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(246,222,255,0.85)';
      for (const e of this.wxEmbers) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 落叶：小幅旋转，数量少，开销可忽略
    if (this.wxLeaves.length) {
      ctx.globalAlpha = calm * 0.78;
      for (const q of this.wxLeaves) {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.fillRect(-q.s / 2, -q.s * 0.18, q.s, q.s * 0.36);
        ctx.restore();
      }
      ctx.globalAlpha = calm;
    }

    // 3) 雷雨白闪 + 闪电折线
    if (this.wxFlash > 0) {
      ctx.globalAlpha = this.wxFlash * 0.16;
      ctx.fillStyle = '#e8eeff';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.wxBolt) {
      const b = this.wxBolt;
      ctx.globalAlpha = Math.max(0, b.life / b.max);
      ctx.strokeStyle = '#eaf2ff';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(176,210,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.branch[0].x, b.branch[0].y);
      for (let i = 1; i < b.branch.length; i++) ctx.lineTo(b.branch[i].x, b.branch[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
  });
})();
