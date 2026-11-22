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
  updateEffects(dt) {
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
