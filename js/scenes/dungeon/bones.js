/* 副本战斗 · 死亡骨头：怪物爆炸后骨头四散、旋转、落地反弹，静止 1 秒后淡出 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  const MAX_BONES = 180;
  const GRAV = 1500;      // 离地高度方向的重力
  const REST = 0.42;      // 落地反弹系数
  const REST_TIME = 1.0;  // 停稳后停留时间
  const FADE_TIME = 0.5;  // 淡出时长

  Object.assign(DG.scenes.dungeon.prototype, {
    // 死亡爆炸：骨色尘环 + 碎屑 + 4~12 根旋转四散的骨头
    spawnBoneBurst(m) {
      const art = DG.art && DG.art.bones;
      if (!art || !this.bones) return;
      if (!art.started) art.load();
      if (!art.ready || !art.list.length) return;
      const n = m.boss ? U.randInt(12, 15) : (m.elite ? U.randInt(8, 10) : U.randInt(6, 8));
      this.addRing(m.x, m.y, 6, m.r * 3.2, '#cfc0a0', 0.3);
      this.addBurst(m.x, m.y - m.r * 0.3, '#cfc0a0', m.boss ? 14 : 8);

      const list = art.list;
      for (let i = 0; i < n; i++) {
        // 大件概率低、小骨碎屑多，散落更自然
        const sp = U.chance(0.35)
          ? list[U.randInt(0, Math.min(3, list.length - 1))]
          : U.pick(list);
        const a = U.rand(0, Math.PI * 2);
        const spd = U.rand(90, 260);
        // 统一按怪物大小缩放：大骨仍然更大，小碎骨保持细碎
        const scale = U.clamp(m.r / 26, 0.5, 1.15) * U.rand(0.85, 1.12);
        this.bones.push({
          img: sp.img,
          w: sp.w, h: sp.h, scale,
          x: m.x, y: m.y + U.rand(-4, 10),
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd * 0.62,
          z: m.r * 0.45 + U.rand(2, 10),
          vz: U.rand(170, 400),
          rot: U.rand(0, Math.PI * 2),
          spin: U.rand(-12, 12),
          alpha: 1,
          grounded: false,
          bounces: 0,
          rest: 0,
          dead: false
        });
      }
      if (this.bones.length > MAX_BONES) {
        this.bones.splice(0, this.bones.length - MAX_BONES);
      }
    },
    updateBones(dt) {
      const list = this.bones;
      if (!list || !list.length) return;
      const keep = [];
      for (const b of list) {
        if (b.rest > 0) {
          // 停稳：1 秒后开始淡出
          b.spin *= 0.86;
          b.rot += b.spin * dt;
          b.rest += dt;
          if (b.rest > REST_TIME) {
            b.alpha -= dt / FADE_TIME;
            if (b.alpha <= 0) continue;
          }
          keep.push(b);
          continue;
        }
        b.rot += b.spin * dt;
        if (!b.grounded) {
          // 飞行：水平滑行 + 离地高度受重力
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          b.vz -= GRAV * dt;
          b.vx *= 1 - 0.8 * dt;
          b.vy *= 1 - 0.8 * dt;
          if (b.z <= 0) {
            b.z = 0;
            if (b.bounces < 2 && b.vz < -70) {
              // 落地反弹：弹起变低、转速与横速衰减
              b.bounces++;
              b.vz = -b.vz * REST;
              b.vx *= 0.55;
              b.vy *= 0.55;
              b.spin *= 0.58;
            } else {
              b.grounded = true;
              b.vz = 0;
            }
          }
        } else {
          // 贴地滑行：摩擦到停住再进入停留计时
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vx *= 1 - 6 * dt;
          b.vy *= 1 - 6 * dt;
          b.spin *= 1 - 7 * dt;
          if (Math.hypot(b.vx, b.vy) < 16) {
            b.vx = 0;
            b.vy = 0;
            b.rest = 0.0001;
          }
        }
        keep.push(b);
      }
      if (keep.length !== list.length) this.bones = keep;
    },
    // 统一画在血迹层之上、所有实体之下：飞行中的骨头也不会遮挡怪物
    drawBones(ctx) {
      const list = this.bones;
      if (!list || !list.length) return;
      const v = this.viewRect(90);
      for (const b of list) {
        if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
        const w = b.w * b.scale, h = b.h * b.scale;
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.alpha) * 0.96;
        ctx.translate(b.x, b.y - b.z);
        ctx.rotate(b.rot);
        ctx.drawImage(b.img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  });
})();
