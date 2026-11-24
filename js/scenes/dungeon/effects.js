/* 副本战斗 · 表现层：飘字、粒子与冲击波 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
  addFloater(x, y, text, color, size) {
    this.floaters.push({ x, y, text, color, size: size || 20, life: 1, max: 1, vy: -52 });
  },
  addBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = U.rand(0, Math.PI * 2);
      const sp = U.rand(50, 200);
      this.effects.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: U.rand(0.25, 0.55), max: 0.55,
        r: U.rand(1.5, 3.5), color
      });
    }
  },
  addRing(x, y, r0, r1, color, dur) {
    this.effects.push({ kind: 'ring', x, y, r0, r1, color, life: dur || 0.45, max: dur || 0.45 });
  },
  // 首领受击：沿来击方向后退回弹 + 白热火花 / 冲击环 / 斩痕，
  // 普通怪物不走这里，避免杂兵互殴时特效刷屏
  bossHitReact(m, dmg, crit, opts) {
    const ang = (opts && opts.angle != null) ? opts.angle : U.angle(this.player, m);
    m.hitDir = ang;                       // 击退方向：背离攻击者
    m.hitReact = Math.max(m.hitReact || 0, crit ? 1 : 0.78);
    if (crit) m.flash = Math.max(m.flash || 0, 0.18);
    const art = DG.art && DG.art.bosses;
    const def = art && art.defs ? art.defs[m.art] : null;
    const tint = m.glow || (def && def.glow) || '#ffd27a';
    const h = art ? art.displayHeight(m) : m.r * 4;
    // 受击音效：体型越大音高越低沉；暴击更重，劈砍额外叠一道划痕声
    if (DG.audio && DG.audio.bossHit) {
      DG.audio.bossHit(crit, !!(opts && opts.chop), Math.max(0.8, Math.min(1.2, 250 / h)));
    }
    // 命中点落在身体中段，按首领体高换算而不是用碰撞半径
    const hx = m.x - Math.cos(ang) * m.r * 0.4;
    const hy = m.y - h * 0.46;
    const n = crit ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = ang + Math.PI + U.rand(-0.95, 0.95);
      const sp = U.rand(90, 250) * (crit ? 1.3 : 1);
      this.effects.push({
        kind: 'spark', x: hx, y: hy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 45,
        life: U.rand(0.16, 0.38), max: 0.38,
        r: U.rand(1.6, 3.4), color: crit ? '#ffe6a8' : '#fff2d6'
      });
    }
    // 命中斩痕：沿来击角度切过身体，暴击时更宽；颜色跟随首领辉光，避免被闪白吃掉
    this.effects.push({
      kind: 'slash', x: hx, y: hy, angle: ang,
      radius: Math.max(24, h * (crit ? 0.3 : 0.22)),
      arc: crit ? 1.6 : 1.15, color: crit ? '#fff3cc' : tint,
      life: 0.14, max: 0.14
    });
    this.addRing(hx, hy, 6, Math.max(26, h * (crit ? 0.4 : 0.28)), tint, crit ? 0.34 : 0.24);
    if (crit) {
      this.addRing(hx, hy, 4, Math.max(44, h * 0.62), '#fff4cf', 0.46);
      this.shake = Math.max(this.shake || 0, 0.05);
    }
  },
  updateEffects(dt) {
    // 升级光环倒计时：与粒子分开维护，绘制时按剩余比例淡出
    if (this.levelFx > 0) this.levelFx = Math.max(0, this.levelFx - dt);
    if (this.dangerZones && this.dangerZones.length) {
      let n = 0;
      for (let i = 0; i < this.dangerZones.length; i++) {
        const z = this.dangerZones[i];
        z.life -= dt;
        if (z.life > 0) this.dangerZones[n++] = z;
      }
      this.dangerZones.length = n;
    }
    // 视觉粒子只影响表现：超过上限时丢弃最旧的一批，防止长时间战斗后线性变慢
    const MAX_EFFECTS = 420;
    if (this.effects.length > MAX_EFFECTS) this.effects.splice(0, this.effects.length - MAX_EFFECTS);
    // 原地压缩：每帧新建数组会在长时间战斗里持续制造垃圾，交给 GC 反而更卡
    const list = this.effects;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.life -= dt;
      if (e.kind === 'spark') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.94;
        e.vy *= 0.94;
      }
      if (e.kind === 'blood') {
        // 血珠：抛物线飞溅，横向速度轻微衰减
        e.vy += 760 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.985;
      }
      if (e.kind === 'shard') {
        // 破碎碎片：重力下落 + 翻滚
        e.vy += 880 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.99;
        e.rot += e.vr * dt;
      }
      if (e.life > 0) list[n++] = e;
    }
    list.length = n;
  },
  updateFloaters(dt) {
    const MAX_FLOATERS = 80;
    if (this.floaters.length > MAX_FLOATERS) this.floaters.splice(0, this.floaters.length - MAX_FLOATERS);
    const list = this.floaters;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.97;
      if (f.life > 0) list[n++] = f;
    }
    list.length = n;
  }
  });
})();
