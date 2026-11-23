/* 副本战斗 · 战斗层：伤害结算、怪物 AI 与投射物 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  // 怪物分离网格：常量与邻居偏移表放在模块级，主循环里不再每帧新建
  const SEP_CELL = 112;
  const SEP_BIAS = 1024;
  const SEP_STRIDE = 4096;
  const SEP_NEAR = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 1]];

  // 分离两个重叠怪物：抽到模块级，避免每帧生成闭包
  function separateMonsters(self, a, b, ai, bi) {
    if (a.dead || b.dead) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    const minD = a.r + b.r + 10;
    if (Math.abs(dx) >= minD || Math.abs(dy) >= minD) return;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      const angle = ((ai * 17 + bi * 31) % 16) * Math.PI / 8;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      dist = 1;
    }
    if (dist >= minD) return;
    const gap = minD - dist;
    const ux = dx / dist, uy = dy / dist;
    if (a.boss && !b.boss) self.nudgeMonster(b, ux * gap, uy * gap);
    else if (b.boss && !a.boss) self.nudgeMonster(a, -ux * gap, -uy * gap);
    else if (!a.boss && !b.boss) {
      self.nudgeMonster(a, -ux * gap * 0.5, -uy * gap * 0.5);
      self.nudgeMonster(b, ux * gap * 0.5, uy * gap * 0.5);
    }
  }

  // 换色变体的专属出手特效（其余怪继续用 peaArc）
  const STRIKE_FX = {
    frostwolf: 'frostSlash',
    boneknight: 'soulSlash',
    frostslime: 'frostBurst',
    bat: 'bloodArc',
    beetle: 'shellSlam',
    urchin: 'shellSlam',
    bulwark: 'shellSlam',
    foxraider: 'bloodArc',
    venomlisk: 'soulSlash'
  };

  // 小怪近战模组：统一走「前摇 → 出手 → 收招」三段式，只靠参数区分手感。
  // 这样新增招式不增加每帧开销：突进只在出手瞬间算一次，特效统一走 effects 池。
  // lunge=突进距离 / hop=起跳高度 / arc=命中扇形 / reach=攻击距离倍率
  const MELEE_MOVES = {
    // 抓：前摇偏长，贴身后把玩家拽向自己
    grab:   { windup: 1.05, strike: 0.20, recover: 0.34, lunge: 34,  hop: 0,  arc: 0.9,  reach: 1.05, fx: 'grabArc',   fxScale: 2.6, fxLife: 0.34, pull: 30 },
    // 挠：快出快收，短突进 + 三道爪痕
    claw:   { windup: 0.72, strike: 0.16, recover: 0.26, lunge: 38,  hop: 0,  arc: 1.45, reach: 1.10, fx: 'clawArc',   fxScale: 2.8, fxLife: 0.30 },
    // 扑：起跳前冲，落点带冲击
    pounce: { windup: 1.00, strike: 0.24, recover: 0.38, lunge: 96,  hop: 30, arc: 1.25, reach: 1.15, fx: 'pounceArc', fxScale: 2.8, fxLife: 0.36, shake: 0.12 },
    // 撞：前摇最长，直线冲撞并击退玩家
    charge: { windup: 1.35, strike: 0.26, recover: 0.46, lunge: 124, hop: 0,  arc: 1.0,  reach: 1.10, fx: 'chargeArc', fxScale: 2.9, fxLife: 0.36, knock: 34, shake: 0.24 },
    // 刀光：原地挥砍，弧线最宽
    slash:  { windup: 1.00, strike: 0.18, recover: 0.30, lunge: 26,  hop: 0,  arc: 1.9,  reach: 1.15, fx: 'bladeArc',  fxScale: 2.9, fxLife: 0.38 },
    // 横扫：大幅侧身抡扫，覆盖身体两侧
    sweep:  { windup: 0.94, strike: 0.20, recover: 0.34, lunge: 30,  hop: 0,  arc: 2.6,  reach: 1.14, fx: 'sweepArc',  fxScale: 3.2, fxLife: 0.36, knock: 12,
      hit: { shake: 0.28, flash: 0.36, sparks: 9,  ring: 34, color: '#ffc178' } },
    // 连击：两段爪击，第一段轻、第二段补刀（第二段等无敌帧结束再落）
    rend:   { windup: 0.62, strike: 0.34, recover: 0.30, lunge: 44,  hop: 0,  arc: 1.5,  reach: 1.08, fx: 'rendArc',   fxScale: 2.7, fxLife: 0.24, double: 0.86, dmg2: 0.55,
      hit: { shake: 0.2,  flash: 0.3,  sparks: 5,  ring: 24, color: '#ff9aae' } },
    // 突刺：极窄角度长距离穿刺，专治正面站桩
    impale: { windup: 0.86, strike: 0.16, recover: 0.32, lunge: 76,  hop: 0,  arc: 0.34, reach: 1.45, fx: 'thrustArc', fxScale: 3.4, fxLife: 0.30,
      hit: { shake: 0.28, flash: 0.38, sparks: 7,  ring: 26, color: '#bfe8ff' } },
    // 旋斩：原地转体一周，命中四周
    spin:   { windup: 1.06, strike: 0.28, recover: 0.40, lunge: 22,  hop: 0,  arc: Math.PI * 2, reach: 1.02, fx: 'spinArc', fxScale: 3.1, fxLife: 0.42, uniqueFx: true,
      hit: { shake: 0.3,  flash: 0.36, sparks: 9,  ring: 36, color: '#d6a0ff' } },
    // 震地：砸地冲击波，贴身范围伤害并震屏
    slam:   { windup: 1.14, strike: 0.22, recover: 0.44, lunge: 14,  hop: 0,  arc: Math.PI * 2, reach: 0.92, fx: 'slamShock', fxScale: 3.3, fxLife: 0.5, uniqueFx: true, shock: true, knock: 18, shake: 0.16,
      hit: { shake: 0.4,  flash: 0.44, sparks: 12, ring: 44, color: '#ffcf7a', ground: true } }
  };

  // 各小怪按自身特色选招：支持单招或双招轮换，避免同一种小怪永远只做同一个动作
  // 狼/史莱姆扑咬，骷髅/镰手/医师挥砍与横扫，蝠/狐/鳍/蜥抓挠与突刺，
  // 甲虫/刺球/野猪/豌豆冲撞与震地，木乃伊与噬人蠕虫抓拽
  const MELEE_STYLE = {
    wolf: ['pounce', 'rend'], frostwolf: ['pounce', 'rend'],
    slime: ['pounce', 'slam'], frostslime: ['pounce', 'slam'],
    skeleton: ['slash', 'sweep'], boneknight: ['slash', 'sweep'], pumpkin: ['sweep', 'slash'],
    mummy: ['grab', 'sweep'], cowlbandit: ['slash', 'impale'], plaguedoc: ['slash', 'impale'],
    bat: ['claw', 'rend'], foxraider: ['claw', 'impale'], deepfin: ['claw', 'impale'],
    venomlisk: ['claw', 'impale'], angler: 'claw',
    pea: ['charge', 'slam'], beetle: ['charge', 'slam'], urchin: ['spin', 'slam'],
    fleece: ['charge', 'claw'], bulwark: ['charge', 'slam'],
    mawflower: ['grab', 'sweep']
  };

  // 专属特效皮肤：每种小怪在共用招式之上再叠一层自身主题碎屑/元素，
  // 绘制全部是纯色小图形（无渐变、无 shadowBlur），开销与一个 spark 相当。
  // bits=碎屑形态 / n=数量 / cast=远程读条时是否有聚能法阵
  const FX_SKINS = {
    wolf:        { bits: 'blood', n: 10, color: '#e0606a' },
    frostwolf:   { bits: 'ice', n: 9 },
    skeleton:    { bits: 'bone', n: 8 },
    boneknight:  { bits: 'soul', n: 9 },
    mistwalker:  { bits: 'mist', n: 8, cast: true },
    pea:         { bits: 'spore', n: 9 },
    musketeer:   { bits: 'muzzle', n: 8, cast: true },
    pumpkin:     { bits: 'ember', n: 10 },
    slime:       { bits: 'mucus', n: 9 },
    frostslime:  { bits: 'ice', n: 10 },
    mummy:       { bits: 'bone', n: 9 },
    bat:         { bits: 'blood', n: 8 },
    hornet:      { bits: 'needle', n: 8, cast: true },
    beetle:      { bits: 'shell', n: 9 },
    cinderraven: { bits: 'ash', n: 8, cast: true },
    candle:      { bits: 'flame', n: 8, cast: true },
    urchin:      { bits: 'spike', n: 10 },
    deepfin:     { bits: 'water', n: 9 },
    cowlbandit:  { bits: 'afterimage', n: 6 },
    angler:      { bits: 'lantern', n: 6, cast: true },
    fleece:      { bits: 'wool', n: 8 },
    foxraider:   { bits: 'afterimage', n: 6 },
    emberdrake:  { bits: 'flame', n: 9, cast: true },
    venomlisk:   { bits: 'toxin', n: 9 },
    bulwark:     { bits: 'shell', n: 9 },
    mawflower:   { bits: 'petal', n: 9 },
    plaguedoc:   { bits: 'toxin', n: 8 },
    warlock:     { bits: 'shadow', n: 8, color: '#b28bff', cast: true }
  };

  const MATERIALS = {
    wolf: 'flesh', frostwolf: 'ice', skeleton: 'bone', boneknight: 'bone',
    mistwalker: 'mist', pea: 'spore', musketeer: 'iron', pumpkin: 'iron',
    slime: 'mucus', frostslime: 'ice', mummy: 'cloth', bat: 'flesh',
    hornet: 'needle', beetle: 'shell', cinderraven: 'ash', candle: 'flame',
    urchin: 'spike', deepfin: 'water', cowlbandit: 'iron', angler: 'water',
    fleece: 'cloth', foxraider: 'flesh', emberdrake: 'flame', venomlisk: 'toxin',
    bulwark: 'shell', mawflower: 'petal', plaguedoc: 'toxin', warlock: 'shadow'
  };



  Object.assign(DG.scenes.dungeon.prototype, {
  nearestMonster(maxDist) {
    let best = null;
    let bestD = maxDist || Infinity;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = U.dist(this.player, m);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  },
  rollHit(mult, sk, target) {
    const tm = this.talentMods();
    let chance = this.stats.crit;
    if (target && target.slow > 0) chance += tm.stats.slowedCrit || 0;
    if (this.talentTimers.chargeCrit > 0) chance += 15;
    const crit = Math.random() * 100 < Math.min(75, chance);
    let dmg = this.stats.atk * mult * (crit ? this.stats.critDmg / 100 : 1);
    let bonus = tm.stats.damagePct || 0;
    if (tm.flags.bloodRage && this.player.hp / this.player.maxHp < 0.4) bonus += 35;
    if (sk) {
      DG.talents.skillTags(sk.id).forEach(tag => { bonus += tm.tags[tag] || 0; });
      // 技能树与流派词缀：该技能专属的伤害加成
      const mod = tm.skills && tm.skills[sk.id];
      if (mod && mod.dmgPct) bonus += mod.dmgPct;
    }
    dmg *= 1 + bonus / 100;
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  },
  hitMonster(m, dmg, crit, opts) {
    const quiet = !!(opts && opts.quiet);
    if (m.dead) return;
    // 闪避词缀：有概率完全避开本次伤害（持续伤害不闪避，避免出血等永远打不中）
    if (!quiet && m.affixes && m.affixes.indexOf('dodge') >= 0 && U.chance(0.2)) {
      m.hitT = 1.4;
      this.addFloater(m.x + U.rand(-6, 6), m.y - m.r - 18, '闪避', '#9fd0ff', 19);
      return;
    }
    const tm = this.talentMods();
    let executed = false;

    // 处决：普通敌人残血直接抹除；首领改为承受额外 30% 伤害
    if (tm.flags.execute) {
      if (m.boss) {
        dmg *= 1.3;
      } else if (m.hp / m.maxHp < 0.15) {
        dmg = Math.ceil(m.hp);
        executed = true;
      }
    }
    if (m.boss && tm.stats.bossDmgPct) dmg *= 1 + tm.stats.bossDmgPct / 100;
    if (m.hp / m.maxHp > 0.7 && tm.stats.highHpDmgPct) dmg *= 1 + tm.stats.highHpDmgPct / 100;
    if (m.slow > 0 && tm.stats.slowedDmgPct) dmg *= 1 + tm.stats.slowedDmgPct / 100;
    // 草丛伏击：隐匿状态下打出的第一击额外 80%，随后暴露
    let ambush = false;
    if (this.fieldStealth && !m.boss && !m.aggro) {
      dmg *= 1.8;
      ambush = true;
      this.fieldStealth = false;
      this.fieldReveal = 2.4;
    }
    dmg = Math.max(1, Math.round(dmg));

    // 精英护盾：先吸收伤害，破盾时留一圈碎光
    if (m.shield > 0) {
      const absorb = Math.min(m.shield, dmg);
      m.shield -= absorb;
      dmg -= absorb;
      if (!quiet) this.addFloater(m.x + U.rand(-6, 6), m.y - m.r - 34, `护盾 ${absorb}`, '#7fd0c0', 18);
      if (m.shield <= 0) {
        m.shield = 0;
        this.addRing(m.x, m.y, m.r, m.r * 3, '#7fd0c0', 0.4);
      }
      if (dmg <= 0) {
        m.hitT = 2.2;
        return;
      }
    }

    m.hp -= dmg;
    // 被击中才亮血条：持续命中会不断续时，停手后 2.2 秒自动隐藏
    m.hitT = 2.2;
    // 精英荆棘：按实际伤害的 18% 反弹，无需命中判定
    if (!quiet && m.affixes && m.affixes.indexOf('thorn') >= 0) {
      const back = Math.max(1, Math.round(dmg * 0.18));
      if (this.hurtPlayer(back)) {
        this.addFloater(this.player.x, this.player.y - 52, `荆棘 -${back}`, '#c98b5a', 17);
      }
    }
    if (!quiet) {
      m.flash = 0.13;
      // 血迹：按累计伤势分档铺在脚下，成堆怪物只保留最大一块
      this.addBlood(m);
      // 受击飞溅：血珠按伤害量向外抛散
      this.sprayBlood(m, dmg, crit);
      // 劈砍专属：沿刀锋切向再甩出一道血幕，与上面的受击喷溅叠加
      if (opts && opts.chop) this.slashBlood(m, opts.angle, dmg, crit);
      // 首领受击：额外的姿态回弹与冲击特效（火花 / 斩痕 / 冲击环）
      if (m.boss) this.bossHitReact(m, dmg, crit, opts);
      if (DG.audio) {
        DG.audio.play('barbHit', { vol: crit ? 0.85 : 0.6, rate: 0.94 + Math.random() * 0.12, gap: 0.05 });
      }
      this.addFloater(m.x + U.rand(-6, 6), m.y - m.r - 20,
        executed ? '处决' : (crit ? '暴击 ' : '') + U.fmt(dmg),
        executed ? '#ff7a5c' : (crit ? '#ffca6a' : '#f2ead9'), crit ? 30 : 21);
      if (ambush) this.addFloater(m.x, m.y - m.r - 46, '伏击', '#a8e0a0', 22);
    }
    // 严寒：命中时有概率把怪物冻住一小段
    if (this.wxRule && this.wxRule.chill && !m.boss && U.chance(this.wxRule.chill)) {
      m.slow = Math.max(m.slow || 0, 0.9);
      m.slowFactor = Math.max(m.slowFactor || 0.3, 0.35);
    }
    if (executed) {
      // 处决：命中方向划出赤红斩痕，配合收缩光环
      this.effects.push({
        kind: 'slash', x: m.x, y: m.y, angle: U.angle(this.player, m),
        radius: m.r + 16, arc: 2.1, color: '#ff8a6a', life: 0.2, max: 0.2
      });
      this.addRing(m.x, m.y, m.r * 2, 6, '#ffb08a', 0.26);
    }
    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      this.onMonsterDeath(m);
    } else if (opts && opts.chop) {
      // 未致死的中刀目标进入短时出血状态，在后续帧持续滴血
      m.bleedT = 1.4;
      m.bleedAcc = 0;
    }
  },
  hurtPlayer(raw) {
    if (this.player.invuln > 0 || this.finished || this.ending) return false;
    if (this.player.hp <= 0) return false;
    const tm = this.talentMods();
    const timers = this.talentTimers;

    // 连续受击判定：3 秒内再次被击中，削弱受击反馈并取消受击位移
    const chain = (this.player.hurtChainT > 0) ? (this.player.hurtChain || 0) + 1 : 1;
    const weakHurt = chain >= 2;
    this.player.hurtChain = chain;
    this.player.hurtChainT = 3;
    this.player.hurtWeak = weakHurt;

    let incoming = raw;
    if (timers.voidGuard > 0) incoming *= 0.75;
    let armor = this.stats.armor;
    if (tm.flags.fortify && timers.fortify > 0) armor *= 1.2;

    const taken = Math.max(1, Math.round(incoming * 100 / (100 + armor)));
    this.player.hp -= taken;
    if (tm.flags.fortify) timers.fortify = 2;
    if (tm.flags.postHurtMove) timers.postHurt = 2;
    // 连续受击时红闪、震屏与音效一并减弱，避免密集受击的反馈过载
    this.hurtFlash = weakHurt ? Math.max(0.06, Math.min(this.hurtFlash, 0.1))
      : Math.max(this.hurtFlash, 0.3);
    this.shake = Math.max(this.shake, weakHurt ? 0.06 : 0.18);
    if (DG.audio) {
      DG.audio.play(this.cls && this.cls.id === 'ranger' ? 'rangerBehit' : 'barbBehit',
        { vol: weakHurt ? 0.4 : 0.7, gap: 0.15 });
    }
    this.addFloater(this.player.x, this.player.y - 34, '-' + taken, '#ff8a80', 22);

    // 受击硬直 + 后退：朝背离伤害来源的方向弹开一小段
    // 旋风期间不可阻挡：不吃硬直、不被击退，移动不受影响
    if (!this.whirl) {
      if (weakHurt) {
        // 连续受击：取消击退位移，只保留极短的轻微后仰动作
        this.player.kbX = 0;
        this.player.kbY = 0;
        this.player.hurtT = 0.10;
      } else {
        let src = null, near = Infinity;
        for (const m of (this.monsters || [])) {
          if (m.dead) continue;
          const d = U.dist(m, this.player);
          if (d < near) { near = d; src = m; }
        }
        const back = src
          ? Math.atan2(this.player.y - src.y, this.player.x - src.x)
          : this.player.facing + Math.PI;
        this.player.hurtT = 0.30;
        this.player.kbX = Math.cos(back) * 230;
        this.player.kbY = Math.sin(back) * 230;
      }
    }
    // 硬直期间给一点无敌帧，避免被连击锁死
    this.player.invuln = Math.max(this.player.invuln, 0.28);

    // 不屈：致命伤害被免疫，并回复 25% 最大生命
    if (this.player.hp <= 0 && tm.flags.unyielding && timers.unyieldingCd <= 0) {
      this.player.hp = Math.round(this.player.maxHp * 0.25);
      timers.unyieldingCd = 60;
      this.player.invuln = Math.max(this.player.invuln, 0.8);
      this.addRing(this.player.x, this.player.y, 16, 80, '#ffd479', 0.5);
      this.addFloater(this.player.x, this.player.y - 44, '不屈', '#ffd479', 26);
    }

    // 自动战斗保险：濒死时触发「绝境反击」，回血并获得短暂无敌，
    // 避免自动战斗因为一次走位失误直接判负（手动操作不生效）
    if (this.player.hp <= 0 && this.autoMode && (this.autoRescueCd || 0) <= 0) {
      this.player.hp = Math.round(this.player.maxHp * 0.35);
      this.player.invuln = Math.max(this.player.invuln, 2);
      this.autoRescueCd = 30;
      this.talentTimers.postHurt = Math.max(this.talentTimers.postHurt || 0, 2);
      this.addRing(this.player.x, this.player.y, 18, 104, '#ffd479', 0.6);
      this.addBurst(this.player.x, this.player.y, '#ffd479', 16);
      this.addFloater(this.player.x, this.player.y - 46, '绝境反击', '#ffd479', 26);
      this.announce('自动战斗 · 绝境反击', 1400);
    }

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.onPlayerDeath();
      return true;
    }

    // 虚化：生命低于 30% 时自动脱离
    if (tm.flags.voidShift && this.player.hp / this.player.maxHp < 0.3 && timers.voidCd <= 0) {
      this.voidShift();
    }
    return true;
  },
  onPlayerDeath() {
    if (this.ending) return;
    this.defeat = true;
    this.victory = false;
    this.ending = true;
    this.finishTimer = 1.6;
    this.announce('你倒下了……', 1800);
    this.addBurst(this.player.x, this.player.y, '#c6554e', 18);
  },
  // 战斗内实时结算经验：击杀即入账，经验条满立刻升级，不再等副本结算
  gainXp(amount) {
    if (!amount || amount <= 0) return;
    this.xpEarned += amount;
    const levels = DG.character.addXp(this.char, amount);
    if (levels && levels.length) this.onLevelUp(levels);
  },
  // 升级表现：金色光环 + 上升光尘 + LV 飘字 + 顶部公告 + 等级牌弹跳 + 音效
  onLevelUp(levels) {
    const from = levels[0] - 1;
    const now = levels[levels.length - 1];
    for (const lv of levels) this.levelUps.push(lv);
    const p = this.player;
    // 角色脚下短暂的金色光环
    this.levelFx = 1.1;
    this.addRing(p.x, p.y, 10, 96, '#ffd166', 0.62);
    this.addRing(p.x, p.y, 4, 58, '#fff6d0', 0.44);
    // 上升光尘：从脚边向头顶飘散
    for (let i = 0; i < 24; i++) {
      const a = U.rand(0, Math.PI * 2);
      const rad = U.rand(4, p.r * 2.1);
      this.effects.push({
        kind: 'spark',
        x: p.x + Math.cos(a) * rad,
        y: p.y + Math.sin(a) * rad * 0.5,
        vx: Math.cos(a) * U.rand(6, 26),
        vy: U.rand(-150, -70),
        life: U.rand(0.5, 0.95),
        max: 1,
        r: U.rand(1.6, 3.4),
        color: i % 3 === 0 ? '#fff6d0' : '#ffd166'
      });
    }
    // 飘字：直接显示升到的等级，一次连升多级也显示最终等级
    this.addFloater(p.x, p.y - p.r - 48, `LV.${now}`, '#ffe08a', 30);
    this.addFloater(p.x, p.y - p.r - 20, now > from + 1 ? `等级提升 +${now - from}` : '等级提升', '#ffd166', 20);
    // 升级立刻重算属性并解锁新技能：新技能当帧进入技能栏并参与自动战斗
    const unlocked = this.refreshBuild();
    const unlockText = unlocked.length ? ` · 解锁 ${unlocked.map(sk => sk.name).join(' / ')}` : '';
    this.announce(`等级提升 · Lv.${now}${unlockText}`, unlocked.length ? 2600 : 1900);
    this.syncLevelBadge(now, true);
    if (DG.audio) {
      // 升级号角立刻起，清脆的 UI 升级音稍后叠上，两声错开避免糊在一起
      DG.audio.play('stageLevelup', { vol: 1 });
      setTimeout(() => {
        // 该音频本身峰值只有 0.21，必须给满音量才不会被战斗音压住
        if (!this.finished && DG.audio) DG.audio.play('uiLevelup', { vol: 1 });
      }, 110);
    }
  },
  onMonsterDeath(m) {
    // 分裂词缀：先裂成两个小体，再走结算（小体自身不再分裂、无掉落）
    if (m.affixes && m.affixes.indexOf('split') >= 0) this.splitElite(m);
    // 自爆词缀：尸体炸开，对附近玩家造成伤害
    if (m.affixes && m.affixes.indexOf('volatile') >= 0) this.volatileBurst(m);
    if (DG.audio) {
      DG.audio.play('monsterDeath', { vol: m.boss ? 1 : 0.5, rate: 0.9 + Math.random() * 0.15, gap: 0.08 });
      // 首领倒下后战斗音乐回落，避免首领曲一直播到撤离
      if (m.boss) DG.audio.playBgm('battle');
      if (m.gold > 0) DG.audio.play('stageCoin', { vol: 0.32, gap: 0.12 });
    }
    // 分裂出的小体不计击杀、不给经验金币，避免刷资源与提前触发首领
    if (!m.noLoot) {
      this.kills++;
      this.lastKillTime = this.time;
      this.gainXp(m.xp);
      this.goldEarned += m.gold;
      this.updateWaveText();
      // 任务进度：普通击杀 / 精英 / 首领分别计入悬赏
      if (DG.quests && this.char) {
        DG.quests.progress(this.char, 'kill', 1);
        if (m.boss) DG.quests.progress(this.char, 'boss', 1);
        else if (m.elite) DG.quests.progress(this.char, 'elite', 1);
      }
      this.addFloater(m.x, m.y - 28, `+${m.gold} 金币`, '#e3c88e', 20);
    }
    this.addBurst(m.x, m.y, m.color, m.boss ? 26 : 8);
    // 死亡爆炸：骨头四散弹跳
    this.spawnBoneBurst(m);

    // 分件小怪：孢子消散
    if (m.art && DG.art.monsters && DG.art.monsters.has(m.art)) {
      this.effects.push({
        kind: 'peaPuff', x: m.x, y: m.y - m.r * 0.5,
        r0: 6, r1: m.r * 3.1, color: m.fxColor,
        life: 0.5, max: 0.5
      });
      this.addRing(m.x, m.y, 8, m.r * 2.4, m.fxColor, 0.4);
    }

    // 区块清空：怪群已全部激活且该块再无存活怪物
    if (!m.boss && m.chunkIndex != null) {
      const packs = this.chunkPacks.filter(p => p.chunk === m.chunkIndex);
      const alive = this.monsters.some(o => !o.dead && o.chunkIndex === m.chunkIndex);
      const ch = this.chunks[m.chunkIndex];
      if (ch && !ch.cleared && packs.length && packs.every(p => p.spawned) && !alive) {
        ch.cleared = true;
        this.updateWaveText();
      }
    }

    // 天赋：击杀回复与击杀加速
    const tm = this.talentMods();
    if (tm.stats.killHealPct) {
      const heal = Math.round(this.player.maxHp * tm.stats.killHealPct / 100);
      if (heal > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.addFloater(this.player.x, this.player.y - 38, `+${heal}`, '#7fd08a', 20);
        // 汲取：回复时脚下浮起绿色生命微光
        this.addBurst(this.player.x, this.player.y - 10, '#7fd08a', 4);
      }
    }
    if (tm.flags.killRush) this.talentTimers.killRush = 3;

    const drop = m.noLoot
      ? { items: [], orb: false, rune: false }
      : DG.loot.roll(m, this.def.ilvl, this.char && this.char.cls);
    // 首领的战利品直接落在玩家脚下，避免结算前来不及拾取
    const bx = m.boss ? this.player.x : m.x;
    const by = m.boss ? this.player.y : m.y;
    // 掉落点吸附到可站立地面，避免掉进墙体
    const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
    const place = (x, y) => this.nearestFloorPoint(
      U.clamp(x, 40, aw - 40), U.clamp(y, 40, ah - 40), 3
    ) || { x: bx, y: by };
    let offset = 0;
    drop.items.forEach(item => {
      const pos = place(bx + U.rand(-24, 24) + (offset++ * 8), by + U.rand(-24, 24));
      this.drops.push({
        kind: 'item', item,
        x: pos.x, y: pos.y,
        r: 12, t: 0
      });
    });
    if (drop.orb) {
      const pos = place(bx + U.rand(-20, 20), by + U.rand(-16, 16));
      this.drops.push({ kind: 'orb', x: pos.x, y: pos.y, r: 10, t: 0 });
    }
    if (drop.rune) {
      const pos = place(bx + U.rand(-20, 20), by + U.rand(-16, 16));
      this.drops.push({ kind: 'rune', x: pos.x, y: pos.y, r: 11, t: 0 });
    }

    if (m.boss) {
      // 通关记录：解锁下一关，并推进悬赏的“通关”类任务
      if (DG.quests && this.char) DG.quests.onStageClear(this.char, this.def.id);
      // 首领倒下的瞬间就落盘，避免结局动画期间刷新或退出丢掉通关进度
      if (DG.game && DG.game.save) DG.game.save();
      this.victory = true;
      this.ending = true;
      this.finishTimer = 1.8;
      this.shake = 0.6;
      this.announce('首领已被击败', 2200);
      this.$bossWrap.classList.add('hidden');
      // 立即解除屏蔽，不让进度/小地图多隐藏 0.1 秒
      this.hud.classList.remove('boss-mode');
    } else if (this.phase === 'wave') {
      // 击杀数达到本图门槛，或怪群已全部刷出且场上再无小怪时兜底触发，
      // 避免刷怪上限截断导致击杀数永远差几只、首领无法出现
      const wiped = (this.chunkPacks || []).every(p => p.spawned) &&
        !this.monsters.some(o => !o.dead && !o.boss);
      if ((this.bossKillGoal && this.kills >= this.bossKillGoal) || wiped) {
        this.phase = 'bossIntro';
        this.phaseTimer = 1.5;
        this.announce('首领即将降临', 1600);
        this.updateWaveText();
      }
    }
  },
  // 分件小怪：攻击前摇 / 出手 / 收招，读条期间原地不动
  isArtMonster(m) {
    return !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
  },
  startMonsterAction(m, ang) {
    const tpl = DG.data.monsters[m.typeId] || {};
    const style = MELEE_STYLE[m.art] || 'claw';
    let mid;
    if (Array.isArray(style)) {
      // 双招小怪轮换出招，避免同一只怪从头到尾只重复一个动作
      mid = style[(Math.random() * style.length) | 0];
      if (style.length > 1 && mid === m._lastMelee) {
        mid = style[(style.indexOf(mid) + 1) % style.length];
      }
      m._lastMelee = mid;
    } else {
      mid = style;
    }
    const mv = MELEE_MOVES[mid];
    m.action = {
      phase: 'windup', t: 0, angle: ang, move: mid, mv,
      windup: (tpl.windup || 0.28) * mv.windup * (this.wxWindup || 1) * (m.windupMul || 1),
      strike: mv.strike,
      recover: mv.recover
    };
    m.facing = ang;
    m.moving = false;
    m.hop = 0;
    this.addGritFx('monsterTension', m.x, m.y - m.r * 0.54, {
      angle: ang, radius: m.r * 1.9, color: m.fxColor || '#847161',
      material: MATERIALS[m.art] || 'iron', life: Math.min(0.36, m.action.windup * 0.55), seed: m.seed || 0
    });
  },
  // 出手突进：分小步推进，避免一帧位移过大穿墙
  dashMonster(m, ang, dist) {
    if (!dist) return 0;
    const steps = Math.max(1, Math.ceil(dist / 22));
    const sx = Math.cos(ang) * dist / steps;
    const sy = Math.sin(ang) * dist / steps;
    let moved = 0;
    for (let i = 0; i < steps; i++) {
      const bx = m.x, by = m.y;
      this.moveWithCollision(m, sx, sy, Math.min(m.r, 26));
      const step = Math.hypot(m.x - bx, m.y - by);
      moved += step;
      if (step < 0.5) break;
    }
    return moved;
  },
  startMonsterCast(m, ang) {
    m.action = {
      phase: 'windup', t: 0, angle: ang, cast: true,
      windup: m.castTime || 0.6,
      strike: 0.12,
      recover: 0.36
    };
    m.facing = ang;
    m.moving = false;
    // 读条聚能：脚下专属法阵 + 头顶聚能球，生命与读条同步
    const skin = FX_SKINS[m.art];
    if (skin) {
      this.effects.push({
        kind: 'castCharge',
        x: m.x, y: m.y,
        angle: ang,
        radius: m.r * 2.8,
        color: m.projColor || '#9ff08a',
        life: m.action.windup, max: m.action.windup,
        skin
      });
    }
  },
  updateMonsterAction(m, dt) {
    const a = m.action;
    a.t += dt;
    if (a.phase === 'windup') {
      if (a.t >= a.windup) {
        a.phase = 'strike';
        a.t = 0;
        // 新增的大幅招式出手时补一层挥风声，听感上区分侧扫 / 直刺 / 旋转 / 砸地
        if (!a.cast && DG.audio && DG.audio.minionSwing) DG.audio.minionSwing(a.move);
        this.resolveMonsterStrike(m);
      }
      return;
    }
    if (a.phase === 'strike') {
      // 扑杀类：出手期间走一条起跳弧线，落地即收招
      if (a.mv && a.mv.hop) {
        m.hop = Math.sin(Math.min(1, a.t / Math.max(0.05, a.strike)) * Math.PI) * a.mv.hop;
      }
      // 连击类：第一段命中后，在出手相位的后段再补一次衰减伤害
      if (a.mv && a.mv.double && !a.hit2 && a.t >= a.strike * a.mv.double) {
        a.hit2 = true;
        this.resolveMonsterStrike(m, true);
      }
      if (a.t >= a.strike) {
        a.phase = 'recover';
        a.t = 0;
        m.hop = 0;
      }
      return;
    }
    if (a.t >= a.recover) {
      m.action = null;
      m.atkTimer = m.attackCd;
      m.hop = 0;
    }
  },
  resolveMonsterStrike(m, second) {
    const a = m.action;
    const p = this.player;
    // 精英法系：读条结束才放出弹道
    if (a.cast) {
      const c = m.projColor || '#9ff08a';
      const k = (m.artScale || 1) * (m.elite ? 1.18 : 1);
      const dir = Math.cos(a.angle) < 0 ? -1 : 1;
      this.projectiles.push({
        team: 'enemy', owner: m,
        x: m.x, y: m.y,
        vx: Math.cos(a.angle) * m.projSpeed,
        vy: Math.sin(a.angle) * m.projSpeed,
        r: 8, dmg: m.dmg, color: c,
        art: m.art,
        life: 3.2, maxLife: 3.2, pierce: 0
      });
      this.effects.push({
        kind: 'peaPuff', x: m.x + dir * 14 * k, y: m.y - 46 * k,
        angle: a.angle, skin: FX_SKINS[m.art],
        r0: 4, r1: 28 * k, radius: m.r * 2.4, color: c, life: 0.45, max: 0.45
      });
      this.addRing(m.x, m.y, 8, m.r * 2.4, c, 0.35);
      this.addBurst(m.x + dir * 18 * k, m.y - 46 * k, c, 10);
      return;
    }

    const mv = a.mv || {};
    const color = m.fxColor || '#cbe8a4';

    // 突进：抓/扑/撞在出手瞬间位移，命中判定按落点算（连击第二段不再位移）
    if (!second && mv.lunge) {
      const ox = m.x, oy = m.y;
      // 按与玩家的间距截断突进距离：贴身时若冲过玩家身后，命中扇形会朝反方向而落空
      const gap = U.dist(m, p);
      const dash = Math.min(mv.lunge, Math.max(0, gap - p.r * 0.5));
      const moved = this.dashMonster(m, a.angle, dash);
      if (moved > 3) {
        this.effects.push({
          kind: 'dashTrail',
          x0: ox, y0: oy - m.r * 0.8, x: m.x, y: m.y - m.r * 0.8,
          color, life: 0.26, max: 0.26
        });
      }
    }

    // 连击第二段：角度轻微偏转、特效略小，形成交叉连斩
    const ang = second ? a.angle + 0.45 : a.angle;
    const fx = m.x + Math.cos(ang) * m.r * 1.4;
    const fy = m.y + Math.sin(ang) * m.r * 1.4 - m.r * 1.2;

    // 旋斩/震地这类形状完全不同的招式优先用自身特效，其余保留各怪专属刀光
    const fxKind = mv.uniqueFx ? mv.fx : (STRIKE_FX[m.art] || mv.fx || 'peaArc');
    const radius = m.r * (mv.fxScale || 3.0) * (second ? 0.9 : 1);
    const arc = mv.arc || 1.5;
    const fxLife = (mv.fxLife || 0.32) * (second ? 0.85 : 1);
    const skin = FX_SKINS[m.art];
    if (fxKind === 'frostBurst' || fxKind === 'slamShock') {
      this.effects.push({
        kind: fxKind, x: m.x, y: m.y + m.r * 0.55,
        angle: ang, radius, arc, color, skin, life: fxLife, max: fxLife
      });
    } else {
      const cy = DG.art.monsters.displayHeight
        ? m.y - DG.art.monsters.displayHeight(m) * 0.52
        : m.y - m.r * 1.35;
      this.effects.push({
        kind: fxKind, x: m.x, y: cy, angle: ang,
        radius, arc, color, skin,
        life: fxLife, max: fxLife
      });
    }
    this.addBurst(fx, fy, color, second ? 5 : 7);
    this.addRing(m.x, m.y, 8, m.r * 2.2, color, second ? 0.24 : 0.3);
    this.addGritFx('monsterStrikeGrit', fx, fy, {
      angle: ang, radius: radius * 0.7, color, material: MATERIALS[m.art] || 'iron',
      life: second ? 0.17 : 0.25, seed: m.seed || 0
    });
    if (mv.shake && !second) this.shake = Math.max(this.shake, mv.shake);

    if (p.hp <= 0) return;
    const d = U.dist(m, p);
    let diff = U.angle(m, p) - ang;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const reach = m.attackRange * (mv.reach || 1) + p.r + 6;
    const halfArc = Math.max(0.6, arc / 2);
    const dmg = second ? Math.max(1, Math.round(m.dmg * (mv.dmg2 || 0.6))) : m.dmg;
    if (d <= reach && Math.abs(diff) <= halfArc) {
      const landed = this.hurtPlayer(dmg);
      if (landed) {
        this.affixOnHit(m);
        if (mv.hit) this.minionImpact(m, mv, ang, second);
      }
      this.addBurst(p.x, p.y, color, second ? 4 : 6);
      // 撞：击退玩家；抓：把玩家拖向怪物；连续受击期间取消这类受击位移
      if (!second && !p.hurtWeak) {
        if (mv.knock) {
          this.movePlayer(p, Math.cos(ang) * mv.knock, Math.sin(ang) * mv.knock, p.r);
        } else if (mv.pull) {
          this.movePlayer(p, -Math.cos(ang) * mv.pull, -Math.sin(ang) * mv.pull, p.r);
        }
      }
    }
  },
  // 小怪新招式的命中反馈：沿来击方向溅出定向火星 + 冲击环 + 专属震屏 / 红闪 / 音效。
  // 连续受击窗口内整体减弱，避免多只小怪围殴时反馈糊成一团。
  minionImpact(m, mv, ang, second) {
    const p = this.player;
    const pf = mv.hit;
    const weak = !!p.hurtWeak;
    const k = weak ? 0.45 : 1;
    const col = pf.color || m.fxColor || '#ffd2a0';
    const hx = p.x - Math.cos(ang) * 6;
    const hy = p.y - p.r * 1.1;
    // 定向火花：从命中点朝攻击来向的反侧溅开，交代打击方向
    const n = Math.max(2, Math.round((second ? pf.sparks * 0.5 : pf.sparks) * k));
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 1.1;
      const a = ang + Math.PI + spread;
      const sp = 120 + Math.random() * 190;
      this.effects.push({
        kind: 'spark', x: hx, y: hy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.22 + Math.random() * 0.22, max: 0.44,
        r: 1.6 + Math.random() * 2, color: i % 3 === 0 ? '#fff4dc' : col
      });
    }
    this.addRing(p.x, p.y - p.r * 0.4, 6, pf.ring * (weak ? 0.7 : 1), col, weak ? 0.2 : 0.28);
    // 震地：额外在脚下压出一圈地面冲击
    if (pf.ground) {
      this.effects.push({
        kind: 'quakeRing', x: p.x, y: p.y,
        radius: pf.ring * 1.9, color: col, life: 0.3, max: 0.3
      });
    }
    this.shake = Math.max(this.shake, weak ? 0.08 : pf.shake);
    this.hurtFlash = Math.max(this.hurtFlash, weak ? Math.max(0.1, this.hurtFlash) : pf.flash);
    if (DG.audio && DG.audio.minionHit) {
      DG.audio.minionHit(mv.fx === 'slamShock' ? 'slam' : (m.action && m.action.move) || 'claw',
        { vol: weak ? 0.45 : (second ? 0.75 : 1) });
    }
  },
  // 远程怪开火：弹道 + 开火表现（火枪为枪口闪光，法系为冷光汇聚）
  fireEnemyShot(m, ang) {
    const projColor = m.projColor || '#b79be0';
    this.projectiles.push({
      team: 'enemy', owner: m,
      x: m.x, y: m.y,
      vx: Math.cos(ang) * m.projSpeed,
      vy: Math.sin(ang) * m.projSpeed,
      r: m.castTime ? 8 : 6,
      dmg: m.dmg,
      color: projColor,
      art: m.art,
      life: 3.2, maxLife: 3.2,
      pierce: 0
    });
    if (!m.art) return;
    m.shotAnim = 0.2;
    m.facing = ang;
    const dir = Math.cos(ang) < 0 ? -1 : 1;
    const k = (m.artScale || 1) * (m.elite ? 1.18 : 1);
    if (m.art === 'musketeer') {
      // 火枪：枪口闪光
      this.effects.push({
        kind: 'muzzle',
        x: m.x + dir * 34 * k,
        y: m.y - 34 * k,
        angle: dir > 0 ? 0 : Math.PI,
        color: m.fxColor || '#e8c98a',
        life: 0.22, max: 0.22
      });
    } else {
      // 法系远程：袖口汇聚的冷光
      this.effects.push({
        kind: 'peaPuff',
        x: m.x + dir * 22 * k, y: m.y - 46 * k,
        r0: 2, r1: 16 * k, color: m.fxColor || '#a9d8ea',
        life: 0.28, max: 0.28
      });
    }
  },
  updateMonsters(dt) {
    const p = this.player;
    const curChunk = this.currentChunk();
    for (const m of this.monsters) {
      if (m.dead) continue;
      // 记录上一帧位移：自动战斗的远程预判需要目标速度
      if (dt > 0 && m._px != null) {
        m._vx = (m.x - m._px) / dt;
        m._vy = (m.y - m._py) / dt;
      }
      m._px = m.x;
      m._py = m.y;
      m.flash = Math.max(0, m.flash - dt);
      if (m.hitReact > 0) m.hitReact = Math.max(0, m.hitReact - dt * 5.2);
      m.atkTimer = Math.max(0, m.atkTimer - dt);
      m.shootTimer = Math.max(0, m.shootTimer - dt);
      m.shotAnim = Math.max(0, (m.shotAnim || 0) - dt);
      // 词缀持续效果：自然再生 / 闪现换位 / 引雷排程
      if (m.affixes && m.affixes.length) this.affixTick(m, dt);
      if (m.slow > 0) m.slow -= dt;
      if (m.fear > 0) m.fear -= dt;
      if (m.hitT > 0) m.hitT -= dt;
      // 出血状态：被劈砍命中后持续从伤口滴血（眩晕/出手期间也要继续）
      this.bleedTick(m, dt);
      // 眩晕：不移动、不出手，动作被打断
      if (m.stun > 0) {
        m.stun -= dt;
        m.moving = false;
        m.action = null;
        continue;
      }
      const speedMul = m.slow > 0 ? (1 - m.slowFactor) : 1;

      // 分件小怪：出手动作期间锁定朝向与位移
      if (m.action) {
        m.moving = false;
        this.updateMonsterAction(m, dt);
        continue;
      }

      const d = U.dist(m, p);
      const ang = U.angle(m, p);
      let vx = 0, vy = 0;
      // 天气影响小怪移速（首领不受影响，保证招式节奏）
      let speed = m.speed * (m.boss ? 1 : (this.wxMonSpeed || 1));

      // 脱战：玩家已离开相邻区块，怪物返回出生点附近
      const mch = m.chunkIndex != null ? this.chunks[m.chunkIndex] : null;
      const cch = this.chunks[curChunk];
      const chained = !m.boss && mch && cch &&
        Math.abs(mch.col - cch.col) + Math.abs(mch.row - cch.row) > 1;
      if (chained) m.aggro = false;
      // 探索感：刚刷出的怪有短暂“苏醒”延迟，给玩家反应时间；
      // 之后靠近或停留过久才循声追击
      if (!chained && !m.aggro && !m.boss && !this.fieldStealth &&
        d < 560 * (this.wxSightMul || 1) * (this.fieldSightMul || 1) &&
        this.time - m.spawnTime > 0.7) m.aggro = true;
      if (!chained && !m.aggro && !m.boss && this.time - m.spawnTime > 16) m.aggro = true;

      if (m.boss) {
        if (m.patterns && m.patterns.length) {
          this.updateBoss(m, dt, d, ang, speedMul);
          continue;
        }
        if (p.hp > 0) {
          if (d > m.attackRange) {
            const f = this.flowDirection(m.x, m.y);
            if (f) { vx = f.x; vy = f.y; }
            else { vx = Math.cos(ang); vy = Math.sin(ang); }
          } else if (m.atkTimer <= 0) {
            this.hurtPlayer(m.dmg);
            m.atkTimer = m.attackCd;
          }
          // 弹幕环
          m.ringTimer -= dt;
          if (m.ringTimer <= 0) {
            m.ringTimer = m.ringCd || 6;
            this.bossRing(m);
          }
          // 召唤
          m.summonTimer -= dt;
          if (m.summonTimer <= 0) {
            m.summonTimer = m.summonCd || 9;
            this.bossSummon(m);
          }
        }
      } else if (!m.aggro) {
        // 未发现玩家时在出生点附近缓慢游荡，不穿墙
        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = U.rand(1.2, 2.8);
          m.wanderAngle = U.rand(0, Math.PI * 2);
        }
        vx = Math.cos(m.wanderAngle);
        vy = Math.sin(m.wanderAngle);
        speed = m.speed * 0.26;
        const fromSpawn = U.dist2(m.x, m.y, m.spawnX, m.spawnY);
        if (fromSpawn > 130) {
          m.wanderAngle = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
          vx = Math.cos(m.wanderAngle);
          vy = Math.sin(m.wanderAngle);
        }
      } else if (m.ranged) {
        if (p.hp > 0) {
          if (d > 380) {
            const f = this.flowDirection(m.x, m.y);
            if (f) { vx = f.x; vy = f.y; }
            else { vx = Math.cos(ang); vy = Math.sin(ang); }
          } else if (d < 220) {
            vx = -Math.cos(ang);
            vy = -Math.sin(ang);
          }
          if (d < 450 && m.shootTimer <= 0) {
            m.shootTimer = m.shootCd;
            if (m.art && m.castTime) {
              // 精英法系：先读条再出手，读条期间站定
              this.startMonsterCast(m, ang);
            } else {
              this.fireEnemyShot(m, ang);
            }
          }
        }
      } else if (p.hp > 0) {
        if (d > m.attackRange) {
          const f = this.flowDirection(m.x, m.y);
          if (f) { vx = f.x; vy = f.y; }
          else { vx = Math.cos(ang); vy = Math.sin(ang); }
        } else if (m.atkTimer <= 0) {
          if (this.isArtMonster(m)) this.startMonsterAction(m, ang);
          else {
            if (this.hurtPlayer(m.dmg)) this.affixOnHit(m);
            m.atkTimer = m.attackCd;
          }
        }
      }

      if (vx || vy) {
        // 首领体型大，墙体碰撞半径略收窄，并允许绕墙转向，保证能穿过走廊
        const wallR = m.boss ? Math.min(m.r, 26) : m.r;
        if (m.art) {
          m.moving = true;
          // 分件远程怪始终面向玩家（倒退时也不背身）
          m.facing = (m.art && m.ranged) ? ang : Math.atan2(vy, vx);
          m.walkPhase = (m.walkPhase || 0) + dt * 9;
        }
        this.moveWithSteer(m, vx * speed * speedMul * dt, vy * speed * speedMul * dt, wallR);
      } else if (m.art) {
        m.moving = false;
        if (p.hp > 0) m.facing = ang;
      }
    }

    // 分离网格：数字键 + 复用桶（只改标记不新建数组），避免每帧产生大量短命对象
    const grid = this._separationGrid || (this._separationGrid = new Map());
    const monsters = this.monsters;
    for (let pass = 0; pass < 2; pass++) {
      const stamp = (this._sepStamp = (this._sepStamp || 0) + 1);
      for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (m.dead) continue;
        const key = (Math.floor(m.x / SEP_CELL) + SEP_BIAS) * SEP_STRIDE +
          (Math.floor(m.y / SEP_CELL) + SEP_BIAS);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = { stamp: stamp, items: [] };
          grid.set(key, bucket);
        } else if (bucket.stamp !== stamp) {
          bucket.stamp = stamp;
          bucket.items.length = 0;
        }
        bucket.items.push(i);
      }
      for (const entry of grid) {
        const bucket = entry[1];
        // 上一帧遗留、本帧未再使用的格子直接跳过
        if (bucket.stamp !== stamp) continue;
        const key = entry[0];
        const cx = Math.floor(key / SEP_STRIDE) - SEP_BIAS;
        const cy = (key % SEP_STRIDE) - SEP_BIAS;
        for (let n = 0; n < SEP_NEAR.length; n++) {
          const dx = SEP_NEAR[n][0], dy = SEP_NEAR[n][1];
          const other = grid.get((cx + dx + SEP_BIAS) * SEP_STRIDE + (cy + dy + SEP_BIAS));
          if (!other || other.stamp !== stamp) continue;
          const items = bucket.items, others = other.items;
          for (let i = 0; i < items.length; i++) {
            const start = dx || dy ? 0 : i + 1;
            for (let j = start; j < others.length; j++) {
              const ai = items[i], bi = others[j];
              if (ai !== bi) separateMonsters(this, monsters[ai], monsters[bi], ai, bi);
            }
          }
        }
      }
    }
  },
  // 怪物分离位移：先沿原方向推开，撞墙再斜向绕，避免每对重叠都新建闭包与临时数组
  nudgeMonster(m, sx, sy) {
    const r = m.r;
    if ((sx || sy) && !this.circleWall(m.x + sx, m.y + sy, r)) {
      m.x += sx; m.y += sy;
      return;
    }
    const ax = sx - sy * 0.45, ay = sy + sx * 0.45;
    if ((ax || ay) && !this.circleWall(m.x + ax, m.y + ay, r)) {
      m.x += ax; m.y += ay;
      return;
    }
    const bx = sx + sy * 0.45, by = sy - sx * 0.45;
    if ((bx || by) && !this.circleWall(m.x + bx, m.y + by, r)) {
      m.x += bx; m.y += by;
    }
  },
  bossRing(boss) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 / n) * i + U.rand(-0.1, 0.1);
      this.projectiles.push({
        team: 'enemy',
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * 195,
        vy: Math.sin(a) * 195,
        r: 7,
        dmg: Math.round(boss.dmg * 0.7),
        color: '#d98b9d',
        life: 4.5, maxLife: 4.5,
        pierce: 0
      });
    }
    this.addRing(boss.x, boss.y, 20, 90, '#d98b9d', 0.4);
    this.announce(`${boss.name} 释放腐化弹幕`, 1000);
  },
  bossSummon(boss, opt) {
    const alive = this.monsters.filter(m => !m.dead && !m.boss).length;
    if (alive >= 8) return;
    const minion = (opt && opt.minion) || DG.data.bossMinions[boss.typeId] || 'wolf';
    const count = (opt && opt.count) || 2;
    for (let i = 0; i < count; i++) {
      const a = U.rand(0, Math.PI * 2);
      const x = U.clamp(boss.x + Math.cos(a) * U.rand(60, 120), 40, (this.arenaW || ARENA_W) - 40);
      const y = U.clamp(boss.y + Math.sin(a) * U.rand(60, 120), 40, (this.arenaH || ARENA_H) - 40);
      const pos = this.nearestFloorPoint(x, y, 3) || { x: boss.x, y: boss.y };
      this.spawnMonster(minion, pos.x, pos.y, false);
    }
    this.addBurst(boss.x, boss.y, '#c98b9d', 12);
  },
  updateProjectiles(dt) {
    // 原地压缩，避免每帧新建数组
    const list = this.projectiles;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      // 强风天：敌方弹道会缓慢偏转，需要预判走位
      if (p.team === 'enemy' && this.wxProjDrift) {
        const a = this.wxProjDrift * dt;
        const ca = Math.cos(a), sa = Math.sin(a);
        const vx = p.vx * ca - p.vy * sa;
        p.vy = p.vx * sa + p.vy * ca;
        p.vx = vx;
      }
      // 记录移动前的位置：高速弹道按线段判定命中，避免贴脸目标被“跳帧”穿过
      const ox = p.x, oy = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20 || p.x > (this.arenaW || ARENA_W) + 20 ||
        p.y < -20 || p.y > (this.arenaH || ARENA_H) + 20) continue;
      // 投影撞墙即消散，墙体同时充当战斗掩体
      if (this.isWallAt(p.x, p.y)) {
        this.addBurst(p.x, p.y, p.color, 2);
        continue;
      }

      if (p.team === 'player') {
        this.breakPropsAt(p.x, p.y, p.r + 14, true);
        let consumed = false;
        const sx = p.x - ox, sy = p.y - oy;
        const segLen2 = sx * sx + sy * sy;
        for (const m of this.monsters) {
          if (m.dead || p.hit.indexOf(m) >= 0) continue;
          // 点到线段的最近距离：一帧跨过目标也能判定命中
          let t = segLen2 > 0 ? ((m.x - ox) * sx + (m.y - oy) * sy) / segLen2 : 0;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const cx = ox + sx * t, cy = oy + sy * t;
          if (Math.hypot(m.x - cx, m.y - cy) <= p.r + m.r) {
            const hit = this.rollHit(p.mult, p.skill, m);
            this.hitMonster(m, hit.dmg, hit.crit);
            this.addBurst(p.x, p.y, p.color, 3);
            if (p.skill && p.skill.classId === 'ranger') {
              const angle = Math.atan2(p.vy, p.vx);
              this.effects.push({
                kind: p.impact || 'arrowImpact', x: p.x, y: p.y, angle,
                color: p.skill.id === 'snipe' ? '#f6ffdf' : p.color, life: p.skill.id === 'snipe' ? 0.24 : 0.16,
                max: p.skill.id === 'snipe' ? 0.24 : 0.16
              });
            }
            // 穿云箭：命中处迸出贯穿白光
            if (p.skill && p.skill.id === 'snipe' && p.skill.classId === 'ranger') {
              this.effects.push({
                kind: 'beam', x: p.x, y: p.y,
                angle: Math.atan2(p.vy, p.vx), len: 72, width: 9,
                color: '#f6ffdf', life: 0.2, max: 0.2
              });
              this.addRing(p.x, p.y, 4, 22, '#f6ffdf', 0.22);
            }
            p.hit.push(m);
            if (p.pierce > 0) p.pierce--;
            else consumed = true;
            if (consumed) break;
          }
        }
        if (consumed) continue;
      } else {
        if (this.player.hp > 0 && this.player.invuln <= 0 &&
          Math.hypot(p.x - this.player.x, p.y - this.player.y) <= p.r + this.player.r) {
          if (this.hurtPlayer(p.dmg)) this.affixOnHit(p.owner);
          this.addBurst(p.x, p.y, p.color, 4);
          continue;
        }
      }
      list[n++] = p;
    }
    list.length = n;
  }
  });
})();
