(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.art.registerHero('ranger', {
    id: 'ranger',
    mode: 'canvas',

    canvasDraw(ctx, x, y, opts) {
      if (DG.art.ranger) DG.art.ranger.draw(ctx, x, y, opts);
    },

    battle(ctx, p, scene) {
      const hurt = (p.hurtT || 0) > 0;
      const state = hurt ? 'hurt'
        : (p.atkAnim || 0) > 0 ? 'attack'
        : (p.moving ? 'walk' : 'combat');
      DG.art.ranger.draw(ctx, 0, p.r * 0.92, {
        scale: 0.7273,
        flip: !!p.flip,
        state,
        t: scene.time,
        walkPhase: p.walkPhase || 0,
        moving: !!p.moving,
        attackT: 0.46 - (p.atkAnim || 0),
        hurtT: p.hurtT || 0,
        aim: Math.asin(U.clamp(Math.sin(p.facing), -0.996, 0.996))
      });
    },

    // 箭尖的局部偏移（相对玩家坐标，已含缩放与左右镜像），
    // 技能弹道从这里起飞，随武器转动与出手前伸一起变化
    muzzle(p, scene) {
      if (!DG.art.ranger || !DG.art.ranger.muzzleTip) return null;
      const hurt = (p.hurtT || 0) > 0;
      const state = hurt ? 'hurt'
        : (p.atkAnim || 0) > 0 ? 'attack'
        : (p.moving ? 'walk' : 'combat');
      const tip = DG.art.ranger.muzzleTip({
        state,
        t: scene ? scene.time : 0,
        walkPhase: p.walkPhase || 0,
        attackT: 0.46 - (p.atkAnim || 0),
        hurtT: p.hurtT || 0,
        aim: Math.asin(U.clamp(Math.sin(p.facing), -0.996, 0.996))
      });
      const mirror = p.flip ? -1 : 1;
      return {
        x: tip.x * 0.7273 * mirror,
        y: tip.y * 0.7273,
        angle: tip.angle
      };
    },

    battleAura(ctx, p, scene) {
      const tm = scene.talentTimers;
      if (!tm) return;

      if (tm.rollHaste > 0) {
        ctx.save();
        ctx.translate(0, 2);
        ctx.strokeStyle = 'rgba(160, 220, 170, .6)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const ph = scene.time * 5;
        for (let i = 0; i < 3; i++) {
          const a = ph + i * (Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.ellipse(0, 0, 19 + i * 3, 6.5 + i * 0.8, 0, a, a + 1.05);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (tm.postHurt > 0) {
        const bx = -Math.cos(p.facing), by = -Math.sin(p.facing);
        ctx.save();
        ctx.strokeStyle = 'rgba(190, 230, 200, .5)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.globalAlpha = Math.min(1, tm.postHurt);
        for (let i = -1; i <= 1; i++) {
          const ox = -by * i * 9, oy = bx * i * 7 - 4;
          const d0 = 20 + Math.abs(i) * 5, d1 = 44 + Math.abs(i) * 9;
          ctx.beginPath();
          ctx.moveTo(bx * d0 + ox, by * d0 + oy);
          ctx.lineTo(bx * d1 + ox, by * d1 + oy);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
})();
