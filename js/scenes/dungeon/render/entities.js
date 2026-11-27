/* 副本战斗 · 渲染实体：宝箱、掉落、怪物、玩家、投射物、血条、恐惧图标、特效与飘字
 * 方法仍挂在 DG.scenes.dungeon.prototype（原型方法名与签名不变）。
 */
(function () {
  const DG = window.DG;
  const {
    H, U, withAlpha, shapePath, RANGER_ARROW, TORNADO_SKIN, tornadoFx, buildTornadoWhite
  } = DG.scenes.dungeonRender;
  Object.assign(DG.scenes.dungeon.prototype, {
  drawChests(ctx) {
    const v = this.viewRect(80);
    for (const c of this.chests || []) {
      if (c.x < v.l || c.x > v.r || c.y < v.t || c.y > v.b) continue;
      ctx.save();
      ctx.translate(c.x, c.y);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 9, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!c.opened) {
        const pulse = 0.5 + Math.sin(this.time * 3 + c.x * 0.01) * 0.5;
        ctx.strokeStyle = `rgba(227,200,142,${0.16 + pulse * 0.24})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -2, 24 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 箱体
      ctx.fillStyle = c.opened ? '#3a2c1c' : '#6b4a26';
      ctx.strokeStyle = '#2a1c10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-16, -6, 32, 16);
      ctx.fill();
      ctx.stroke();

      // 箱盖：未开启是拱形盖，开启后向上翻开
      ctx.fillStyle = c.opened ? '#2f2418' : '#7d572d';
      ctx.beginPath();
      if (c.opened) {
        ctx.moveTo(-16, -6);
        ctx.lineTo(-13, -18);
        ctx.lineTo(17, -18);
        ctx.lineTo(16, -6);
      } else {
        ctx.moveTo(-16, -6);
        ctx.quadraticCurveTo(0, -19, 16, -6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 金属包边
      ctx.strokeStyle = c.opened ? 'rgba(160,130,80,.5)' : '#e3c88e';
      ctx.lineWidth = 2;
      const top = c.opened ? -18 : -13;
      ctx.beginPath();
      ctx.moveTo(-6, top);
      ctx.lineTo(-6, 10);
      ctx.moveTo(6, top);
      ctx.lineTo(6, 10);
      ctx.stroke();

      ctx.restore();
    }
  },
  drawDrops(ctx) {
    const v = this.viewRect(60);
    for (const d of this.drops) {
      if (d.x < v.l || d.x > v.r || d.y < v.t || d.y > v.b) continue;
      const bob = Math.sin(d.t * 4) * 3;
      if (d.kind === 'item') {
        const rar = DG.items.rarityInfo(d.item);
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        const gr = (d.item.rarity === 'legend' ? 26 : d.item.rarity === 'set' ? 22 : 18) *
          (d.item.ancient ? 1.2 : 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glowSprite(rar.color), -gr, -gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';
        // 品质框：常驻的方形描边，地上不用靠近也能一眼看出品质
        const half = 10 * (d.item.ancient ? 1.2 : 1);
        ctx.fillStyle = 'rgba(8,10,12,0.82)';
        ctx.fillRect(-half, -half, half * 2, half * 2);
        ctx.strokeStyle = rar.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-half, -half, half * 2, half * 2);
        // 框内菱形图标
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = rar.color;
        ctx.fillRect(-5, -5, 10, 10);
        ctx.fillStyle = 'rgba(10,12,14,0.75)';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      } else if (d.kind === 'orb') {
        // 血球：红色、大而醒目，靠近自动回血
        const pulse = 0.5 + Math.sin(d.t * 5) * 0.5;
        const coreR = 19 + Math.sin(d.t * 5) * 1.5;
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        // 地面血色光晕
        ctx.globalCompositeOperation = 'lighter';
        const gr = 46 + pulse * 10;
        ctx.drawImage(this.glowSprite('#ff3b30'), -gr, -gr, gr * 2, gr * 2);
        // 呼吸提示环：让血球在杂乱地面上一眼可见
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(255,86,72,${0.5 - pulse * 0.28})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 27 + pulse * 11, 0, Math.PI * 2);
        ctx.stroke();
        // 球体：内亮外暗的红色径向渐变
        const rg = ctx.createRadialGradient(-coreR * 0.35, -coreR * 0.4, coreR * 0.15, 0, 0, coreR);
        rg.addColorStop(0, '#ff8a7a');
        rg.addColorStop(0.45, '#e03024');
        rg.addColorStop(1, '#7d0b06');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fill();
        // 深色描边与高光：红地面上也能看清轮廓
        ctx.strokeStyle = 'rgba(60,2,0,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,220,210,0.75)';
        ctx.beginPath();
        ctx.ellipse(-coreR * 0.38, -coreR * 0.42, coreR * 0.28, coreR * 0.18, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (d.kind === 'rune') {
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glowSprite('#8fb4ea'), -20, -20, 40, 40);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#8fb4ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#c6ddff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('技', 0, 1);
        ctx.restore();
      }
    }
  },
  // 掉落物名字：常驻显示，字号按屏幕像素固定，不随镜头缩放变大变小
  drawDropLabels(ctx) {
    const v = this.viewRect(160);
    const z = this.zoom || 1;
    const fs = Math.max(9, Math.round(12 / z));
    ctx.save();
    ctx.font = '600 ' + fs + 'px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const d of this.drops) {
      if (d.kind !== 'item' || !d.item || !d.item.name) continue;
      if (d.x < v.l || d.x > v.r || d.y < v.t || d.y > v.b) continue;
      const rar = DG.items.rarityInfo(d.item);
      const bob = Math.sin(d.t * 4) * 3;
      const tx = d.x + 13 * (d.item.ancient ? 1.2 : 1);
      const ty = d.y + bob - 1;
      // 黑色描边：无论地面是血泊还是火圈，名字都能读清
      ctx.lineWidth = Math.max(2, 3 / z);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(d.item.name, tx, ty);
      ctx.fillStyle = rar.color;
      ctx.fillText(d.item.name, tx, ty);
    }
    ctx.restore();
  },
  // 每帧只排序一次，前后两层绘制复用同一列表
  sortMonstersForDraw() {
    const list = this._drawMonsters || (this._drawMonsters = []);
    list.length = 0;
    for (const m of this.monsters) if (!m.dead) list.push(m);
    list.sort((a, b) => a.y - b.y);
  },
  // maxY / minY 把列表拆成玩家身后（y<=maxY）与身前（y>minY）两层
  // v 由调用方传入复用，避免每次绘制都新建可视矩形对象
  drawMonsters(ctx, maxY, minY, v) {
    const view = v || this.viewRect(220);
    const sorted = !!this._drawMonsters;
    const list = this._drawMonsters || this.monsters;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.dead) continue;
      if (m.y > maxY) {
        // 排序后的列表里后面只会更靠前，可直接结束本轮
        if (sorted) break;
        continue;
      }
      if (m.y <= minY) continue;
      if (m.x < view.l || m.x > view.r || m.y < view.t || m.y > view.b) continue;
      const artBoss = !!(m.boss && m.art && DG.art.bosses);
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      ctx.save();
      ctx.translate(m.x, m.y);

      // 阴影
      if (artBoss) {
        ctx.fillStyle = 'rgba(0,0,0,0.40)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.72, m.r * 1.25, m.r * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (artMob) {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.72, m.r * 1.12, m.r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.85, m.r * 0.9, m.r * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (m.boss) {
        const pulse = 0.5 + Math.sin(this.time * 3) * 0.2;
        ctx.strokeStyle = `rgba(217, 139, 157, ${0.18 + pulse * 0.18})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 9 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (m.elite || (m.affixes && m.affixes.length)) {
        const affixes = m.affixes || [];
        const table = DG.scenes.dungeon.ELITE_AFFIXES || {};
        if (affixes.length) {
          // 词缀环：一条词缀一道色环，玩家看颜色就知道要防什么
          for (let i = 0; i < affixes.length; i++) {
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = (table[affixes[i]] && table[affixes[i]].color) || 'rgba(201,162,95,0.65)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, m.r + 5 + i * 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = 'rgba(201,162,95,0.65)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, m.r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // 护盾：沿精英外圈画一道青色弧，剩余量一目了然
      if (m.shield > 0 && m.maxShield) {
        const ratio = Math.max(0, Math.min(1, m.shield / m.maxShield));
        ctx.strokeStyle = 'rgba(127,208,192,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();
      }
      if (m.slow > 0) {
        ctx.strokeStyle = 'rgba(142,201,232,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (artBoss) {
        DG.art.bosses.draw(ctx, m, { t: this.time, cast: m.cast });
      } else if (artMob) {
        DG.art.monsters.draw(ctx, m, { t: this.time });
      } else {
        ctx.fillStyle = m.flash > 0 ? '#f5f0e6' : m.color;
        shapePath(ctx, m.shape, m.r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.42)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 眼睛朝向
        const ang = U.angle(m, this.player);
        ctx.fillStyle = 'rgba(255, 235, 200, 0.75)';
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * m.r * 0.36, Math.sin(ang) * m.r * 0.36, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 受击反馈：所有怪物统一补一圈白光。素材怪依赖各自的闪白贴图，
      // 部分分件/缺图素材不会变色，这里用轮廓光保证任何怪物、任何攻击都有清晰回馈
      if (m.flash > 0) {
        const fa = Math.min(1, m.flash / 0.13);
        const lit = artBoss || artMob;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fa * (lit ? 0.5 : 0.42);
        ctx.strokeStyle = lit ? '#fff0da' : '#fffdf2';
        ctx.lineWidth = lit ? 3 : 2.6;
        ctx.beginPath();
        ctx.ellipse(0, -m.r * 0.12, m.r * 0.92, m.r * 1.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  },
  // 血条单独一层：后排怪被前排轮廓遮住后，血量依然看得见
  drawMonsterBars(ctx) {
    const v = this.viewRect(220);
    for (const m of (this._drawMonsters || this.monsters)) {
      // 精英常驻血条与名字；普通怪只在受击后短暂显示
      if (m.dead || m.boss || (!m.elite && m.hitT <= 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      // 比角色头顶的状态条略小一号，拉高到 8px，便于看清
      const w = m.r * 2 + 10;
      const h = 8;
      const y = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      ctx.globalAlpha = m.elite ? 1 : U.clamp(m.hitT / 0.35, 0, 1);
      ctx.fillStyle = 'rgba(18,13,13,0.92)';
      ctx.fillRect(m.x - w / 2, y, w, h);
      ctx.fillStyle = m.elite ? '#d9b24a' : '#b8463f';
      ctx.fillRect(m.x - w / 2, y, w * U.clamp(m.hp / m.maxHp, 0, 1), h);
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(m.x - w / 2 - 1, y - 1, w + 2, h + 2);
      // 精英名字：字号随体型微调且不超过 11px，宽度严格限制在血条内
      if (m.elite) {
        const fs = Math.max(9, Math.min(11, m.r * 0.5));
        let label = (m.baseName || m.name || '').replace(/^精英\s*·\s*/, '');
        ctx.font = `600 ${fs}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        // 超宽时逐字裁掉并补省略号，避免压到旁边的怪
        if (ctx.measureText(label).width > w) {
          while (label.length > 1 && ctx.measureText(label + '…').width > w) {
            label = label.slice(0, -1);
          }
          label += '…';
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(label, m.x, y - 4);
        ctx.fillStyle = '#ead9a8';
        ctx.fillText(label, m.x, y - 4);
      }
      ctx.globalAlpha = 1;
    }
    // 眩晕图标：不受血条显隐限制，眩晕期间常驻头顶
    for (const m of (this._drawMonsters || this.monsters)) {
      if (m.dead || m.boss || !(m.stun > 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      const barY = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      // 精英头顶多了一行名字，眩晕星再上移一档，避免压住文字
      const cx = m.x, cy = barY - (m.elite ? 24 : 12);
      const rot = this.time * 5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#ffd45e';
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a = rot + i * Math.PI * 2 / 3;
        const sx = Math.cos(a) * 12, sy = Math.sin(a) * 4 - 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 1.6, sy - 1.6);
        ctx.lineTo(sx + 4, sy);
        ctx.lineTo(sx + 1.6, sy + 1.6);
        ctx.lineTo(sx, sy + 4);
        ctx.lineTo(sx - 1.6, sy + 1.6);
        ctx.lineTo(sx - 4, sy);
        ctx.lineTo(sx - 1.6, sy - 1.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  // 恐惧标记：被战吼震慑的敌人头顶浮出惊恐表情，随恐惧剩余时间淡出
  drawFearIcons(ctx) {
    const v = this.viewRect(220);
    const t = this.time || 0;
    for (const m of (this._drawMonsters || this.monsters)) {
      if (m.dead || !(m.fear > 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      const barY = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      // 轻微抖动：惊恐的样子；最后 0.4 秒淡出
      const a = U.clamp(m.fear / 0.4, 0, 1);
      const cx = m.x + Math.sin(t * 30 + m.x * 0.05) * 1.4;
      const cy = barY - 30 + Math.cos(t * 26 + m.y * 0.05) * 1.2;
      ctx.save();
      ctx.globalAlpha = a;
      // 白色气泡底
      ctx.fillStyle = 'rgba(245,240,232,0.95)';
      ctx.strokeStyle = 'rgba(30,20,16,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 惊恐大眼（黑眼珠上移）
      ctx.fillStyle = '#1b120d';
      ctx.beginPath();
      ctx.ellipse(cx - 3.6, cy - 1.6, 2.2, 2.9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 3.6, cy - 1.6, 2.2, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // 张大的嘴
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4.4, 2.1, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  drawPlayer(ctx) {
    const p = this.player;
    if (p.hp <= 0) return;
    // 角色美术由 art/heroes 注册表提供，新增角色无需改动战斗代码
    const hero = this.cls ? DG.art.heroFor(this.cls.id) : null;
    const useHero = !!(hero && hero.battle);
    ctx.save();
    ctx.translate(p.x, p.y);

    // 升级光环：脚下金色辉光。使用预渲染贴图，避免逐帧 shadowBlur
    if (this.levelFx > 0) {
      const k = Math.min(1, this.levelFx / 1.1);
      const R = 78 * (1 + (1 - k) * 0.45);
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      ctx.drawImage(this.glowSprite('#ffd166'), -R, -R * 0.6, R * 2, R * 1.2);
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.9, useHero ? p.r * 1.15 : p.r * 0.9, p.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.invuln > 0) {
      ctx.strokeStyle = 'rgba(160, 210, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (useHero) {
      hero.battle(ctx, p, this);
      if (hero.battleAura) hero.battleAura(ctx, p, this);
      this.drawPlayerStatus(ctx, -112);
      ctx.restore();
      return;
    }

    // 身体
    const color = this.cls.color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 朝向
    const ang = p.facing;
    ctx.fillStyle = '#f0e6d4';
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * (p.r + 12), Math.sin(ang) * (p.r + 12));
    ctx.lineTo(Math.cos(ang + 2.5) * (p.r + 2), Math.sin(ang + 2.5) * (p.r + 2));
    ctx.lineTo(Math.cos(ang - 2.5) * (p.r + 2), Math.sin(ang - 2.5) * (p.r + 2));
    ctx.closePath();
    ctx.fill();

    this.drawPlayerStatus(ctx, -p.r - 30);
    ctx.restore();
  },

  // 角色头顶的状态条：上为生命，下为精力（释放大技能消耗）
  drawPlayerStatus(ctx, top) {
    const p = this.player;
    const w = 68, hpH = 10, enH = 6, gap = 4;
    const hpY = top - hpH - gap - enH;

    const paint = (y, h, pct, color) => {
      ctx.fillStyle = 'rgba(18,14,14,0.92)';
      ctx.fillRect(-w / 2, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2, y, w * U.clamp(pct, 0, 1), h);
      // 灰色描边 + 外圈 2px 黑描
      ctx.strokeStyle = 'rgba(168,168,168,0.95)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-w / 2 + 0.8, y + 0.8, w - 1.6, h - 1.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2 - 1, y - 1, w + 2, h + 2);
    };

    paint(hpY, hpH, p.hp / p.maxHp, '#4e9e57');
    paint(hpY + hpH + gap, enH, p.stam / p.maxStam, this.energy.color);
  },
  drawProjectiles(ctx) {
    const v = this.viewRect(90);
    for (const p of this.projectiles) {
      if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
      // 游侠的箭矢用素材贴图绘制，不再画成光球
      if (p.team === 'player' && p.skill && p.skill.classId === 'ranger' &&
        DG.art.ranger && DG.art.ranger.arrowReady()) {
        this.drawArrowProjectile(ctx, p);
        continue;
      }
      ctx.save();
      const gr = p.r + 10;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glowSprite(p.color || '#ffffff'), p.x - gr, p.y - gr, gr * 2, gr * 2);
      ctx.restore();
      // 敌方弹道按施法者区分造型，避免所有远程怪都是同一种光球
      const art = p.art;
      const ang = Math.atan2(p.vy, p.vx);
      if (art === 'musketeer') {
        // 火枪：细长曳光弹
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(-p.r * 6, 0, p.r * 1.4, 0);
        g.addColorStop(0, withAlpha(p.color, 0));
        g.addColorStop(0.75, withAlpha(p.color, 0.45));
        g.addColorStop(1, withAlpha('#fff2cf', 0.95));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-p.r * 6, -1.1);
        ctx.lineTo(p.r * 1.4, 0);
        ctx.lineTo(-p.r * 6, 1.1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff8e2';
        ctx.beginPath();
        ctx.arc(p.r * 0.8, 0, p.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'hornet') {
        // 毒蜂：尖锐毒针 + 细尾迹
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.5);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-p.r * 4.5, 0);
        ctx.lineTo(-p.r * 0.6, 0);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.9);
        ctx.beginPath();
        ctx.moveTo(p.r * 2.1, 0);
        ctx.lineTo(-p.r * 0.6, -p.r * 0.62);
        ctx.lineTo(-p.r * 0.6, p.r * 0.62);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f4e2ff';
        ctx.beginPath();
        ctx.moveTo(p.r * 1.9, 0);
        ctx.lineTo(p.r * 0.2, -p.r * 0.22);
        ctx.lineTo(p.r * 0.2, p.r * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'cinderraven' || art === 'candle' || art === 'emberdrake') {
        // 火焰：抖动的火舌 + 火星尾
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        const flick = 0.85 + Math.sin((p.x + p.y) * 0.35 + (this.time || 0) * 22) * 0.15;
        ctx.fillStyle = withAlpha(p.color, 0.55);
        ctx.beginPath();
        ctx.moveTo(-p.r * 2.6 * flick, 0);
        ctx.quadraticCurveTo(0, -p.r * 1.5, p.r * 1.5, 0);
        ctx.quadraticCurveTo(0, p.r * 1.5, -p.r * 2.6 * flick, 0);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffe9a8', 0.9);
        ctx.beginPath();
        ctx.arc(p.r * 0.3, 0, p.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'mistwalker') {
        // 迷雾：外围柔雾 + 双层虚影
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.45);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.32);
        ctx.beginPath();
        ctx.arc(p.x - Math.cos(ang) * p.r * 1.6, p.y - Math.sin(ang) * p.r * 1.6, p.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha('#e8fbff', 0.75);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'angler') {
        // 渊灯：水泡实心球 + 高光
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.6);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.85);
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'warlock') {
        // 深渊：旋转虚空菱环
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((this.time || 0) * 4 + ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.4);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 1.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.85);
        ctx.beginPath();
        ctx.moveTo(0, -p.r * 1.35);
        ctx.lineTo(p.r * 0.9, 0);
        ctx.lineTo(0, p.r * 1.35);
        ctx.lineTo(-p.r * 0.9, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.7);
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // 游侠箭矢：木箭贴图按速度方向旋转，箭尾拖出渐隐光带与速度线
  drawArrowProjectile(ctx, p) {
    const sp = DG.art.ranger.arrowSprite;
    const cfg = RANGER_ARROW[p.skill.id] || RANGER_ARROW.arrow;
    const ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);

    // 拖尾光带：从箭尾向前收窄，尾部完全透明
    if (cfg.trail > 0) {
      const g = ctx.createLinearGradient(-cfg.trail, 0, 0, 0);
      g.addColorStop(0, withAlpha(cfg.color, 0));
      g.addColorStop(0.7, withAlpha(cfg.color, 0.16));
      g.addColorStop(1, withAlpha(cfg.color, 0.62));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail, 0);
      ctx.lineTo(0, -cfg.width * 1.7);
      ctx.lineTo(0, cfg.width * 1.7);
      ctx.closePath();
      ctx.fill();

      // 两道细速度线，强化飞行方向感
      ctx.strokeStyle = withAlpha(cfg.color, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 0.82, -cfg.width * 0.9);
      ctx.lineTo(-6, -cfg.width * 0.35);
      ctx.moveTo(-cfg.trail * 0.6, cfg.width * 0.95);
      ctx.lineTo(-4, cfg.width * 0.4);
      ctx.stroke();
    }

    if (p.variant === 'fan' || p.variant === 'rain') {
      ctx.strokeStyle = withAlpha(cfg.color, p.variant === 'rain' ? 0.48 : 0.36);
      ctx.lineWidth = p.variant === 'rain' ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 0.95, -cfg.width * 2.2);
      ctx.quadraticCurveTo(-cfg.trail * 0.48, -cfg.width * 1.3, -8, -cfg.width * 0.6);
      if (p.variant === 'rain') {
        ctx.moveTo(-cfg.trail * 0.72, cfg.width * 2.1);
        ctx.quadraticCurveTo(-cfg.trail * 0.35, cfg.width * 1.2, -6, cfg.width * 0.55);
      }
      ctx.stroke();
    } else if (p.variant === 'shadow') {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(194,237,224,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 1.2, 0);
      ctx.lineTo(-4, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 箭身：按素材倾角校正，箭尖对准飞行方向
    const s = cfg.scale;
    const w = sp.img.width * s, h = sp.img.height * s;
    ctx.rotate(sp.tilt);
    ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  },
  // 游走旋风：按 TORNADO_SKIN 选择序列帧或原矢量画法；
  // 序列帧未加载完成时自动回落到矢量版，不会出现空白
  drawTornado(ctx, t) {
    const img = tornadoFx.img;
    if (TORNADO_SKIN === 'thunderwind' && img && img.complete && img.naturalWidth) {
      this.drawTornadoSprite(ctx, t);
    } else {
      this.drawTornadoVector(ctx, t);
    }
  },
  // 白色龙卷序列帧：15fps 循环，出现 0.25 秒淡入、消失前 0.5 秒淡出
  drawTornadoSprite(ctx, t) {
    const fade = Math.min(1, t.t / 0.25, (t.life - t.t) / 0.5);
    if (fade <= 0) return;
    if (!tornadoFx.white) buildTornadoWhite();
    const f = Math.floor(t.t * tornadoFx.fps) % tornadoFx.frames;
    const c = tornadoFx.cell;
    const sx = (f % tornadoFx.cols) * c;
    const sy = Math.floor(f / tornadoFx.cols) * c;
    const W2 = tornadoFx.w, H2 = tornadoFx.h;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.76 * fade;
    ctx.drawImage(tornadoFx.white || tornadoFx.img, sx, sy, c, c, -W2 / 2, -H2 * tornadoFx.anchor, W2, H2);
    ctx.restore();
  },
  // 游走旋风（原矢量版）：写实龙卷风——底部收束、往上迅速张成宽阔的漏斗口，
  // 柱身随时间蜿蜒鼓胀，数股风带互相穿插盘旋，底部掀尘、顶部散入云底
  drawTornadoVector(ctx, t) {
    const H = 172;        // 尘柱高度
    const RTOP = 54;      // 顶部半宽：从云底张开的漏斗口
    const RBOT = 4;       // 底部收束点
    // 出现 0.25 秒淡入、消失前 0.5 秒淡出
    const fade = Math.min(1, t.t / 0.25, (t.life - t.t) / 0.5);
    if (fade <= 0) return;
    // 缓慢变形：整根柱身蜿蜒、鼓胀，不是标准锥形
    const morph = t.t * 0.9;
      // 轮廓：底部一团被吸起的尘、中段收腰、往上快速张开、顶部外翻成漏斗口
      const widthAt = (u) => {
        let w = RBOT + (RTOP - RBOT) * Math.pow(u, 1.42);
        w *= 1 + 0.16 * Math.sin(u * 4.1 - 1.0 + t.phase * 0.6 + morph * 0.5);
        if (u > 0.62) w *= 1 + Math.pow((u - 0.62) / 0.38, 1.4) * 0.42;
        w += 6 * Math.max(0, 0.16 - u) / 0.16;
        return w;
      };
      const lean = Math.sin(t.t * 1.9 + t.phase) * 7 + Math.sin(t.t * 0.7 + t.phase * 2) * 2.5;
      // 柱身像蛇一样扭动，越往上摆幅越大
      const bend = (u) => lean * Math.pow(u, 1.3) +
        Math.sin(u * 3.4 + t.phase * 1.3 + t.t * 1.1) * (2 + u * 14);
      // 每只体型略有差异，避免三只完全一样
      const S = 0.92 + (Math.sin(t.phase * 2.7) * 0.5 + 0.5) * 0.2;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(S, S);

      // 地面尘裙：几层压扁的尘雾向外扩散，边缘用渐变化开
      for (let s = 2; s >= 0; s--) {
        const rr = 26 + s * 12;
        ctx.save();
        ctx.globalAlpha = fade * (0.15 + s * 0.03);
        ctx.translate(Math.sin(t.spin * 0.7 + s * 1.7) * 5, 2 + s * 0.5);
        ctx.scale(1, 0.32);
        const dg = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
        dg.addColorStop(0, 'rgba(188,180,165,0.5)');
        dg.addColorStop(0.6, 'rgba(198,191,178,0.2)');
        dg.addColorStop(1, 'rgba(202,196,184,0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 尘柱本体：沿中轴堆一串软边尘团，不用矢量路径填充，
      // 左右边缘天生就是渐隐的尘雾，不可能出现硬切边
      const pufW = this.glowSprite('#e2dbcb');
      const pufC = this.glowSprite('#dde4e6');
      const SL = 20;
      const vh = H / SL * 1.7;
      for (let i = 0; i <= SL; i++) {
        const u = i / SL;
        const w = widthAt(u);
        const sp = u > 0.6 ? pufC : pufW;
        // 外圈：柱身本体
        ctx.globalAlpha = fade * (0.56 - 0.06 * u);
        ctx.drawImage(sp, bend(u) - w * 1.06, -H * u - vh, w * 2.12, vh * 2);
        // 内圈：偏左一点的浓尘芯，做出左亮右暗的体积
        ctx.globalAlpha = fade * (0.34 - 0.04 * u);
        ctx.drawImage(sp, bend(u) - w * 0.55, -H * u - vh * 0.9,
          w * 1.0, vh * 1.8);
      }
      // 几团鼓出的尘团：让柱身有粗细起伏，不是光滑的锥面
      for (let d = 0; d < 6; d++) {
        const u = 0.12 + d * 0.13 + Math.sin(t.spin * 0.6 + d * 1.9) * 0.03;
        const w = widthAt(u);
        const side = d % 2 ? 1 : -1;
        const sz = w * (0.55 + 0.2 * Math.sin(d * 2.3 + t.phase));
        ctx.globalAlpha = fade * 0.08;
        ctx.drawImage(d > 2 ? pufC : pufW,
          bend(u) + side * w * 0.42 - sz / 2, -H * u - sz * 0.55, sz, sz * 1.1);
      }
      // 右侧背光：淡淡压一层暗尘，让圆柱有受光/背光的体积
      const pufD = this.glowSprite('#6d777c');
      for (let i = 1; i <= SL; i += 2) {
        const u = i / SL;
        const w = widthAt(u);
        ctx.globalAlpha = fade * 0.05;
        ctx.drawImage(pufD, bend(u) + w * 0.22, -H * u - vh * 0.8, w * 1.05, vh * 1.6);
      }
      ctx.globalAlpha = fade;

      // 内部暗卷：两股偏暗的气流先压一层，把柱身分出前后层次
      ctx.lineCap = 'round';
      for (let d = 0; d < 2; d++) {
        const segs = 90;
        const turn = 2.2 + d * 0.7;
        const sp = t.spin * 0.82 + t.phase * 1.7 + d * 3.2;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          const th = u * turn * Math.PI * 2 + sp + Math.sin(u * 2.8 + d) * 1.1;
          const rx = widthAt(u) * (0.5 + 0.14 * Math.sin(u * 5 + d * 2));
          const ry = 4 + 9 * u;
          const x = Math.cos(th) * rx + bend(u);
          const y = -H * u + Math.sin(u * 17 + d * 2) * 2 - Math.sin(th) * ry;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.globalAlpha = fade * 0.2;
        ctx.strokeStyle = 'rgba(96,104,108,0.8)';
        ctx.lineWidth = 10 - d * 3;
        ctx.stroke();
      }

      // 内部湍流：五股灰白风带，圈数、粗细、明暗各不相同；
      // 每股在柱身上“进出”的节奏也不同，互相穿插才像被卷起的乱流
      const wg = ctx.createLinearGradient(0, 0, 0, -H);
      wg.addColorStop(0, 'rgba(242,246,247,0.5)');
      wg.addColorStop(0.14, 'rgba(244,248,249,0.62)');
      wg.addColorStop(0.45, 'rgba(238,242,243,0.52)');
      wg.addColorStop(0.68, 'rgba(236,241,242,0.4)');
      wg.addColorStop(0.86, 'rgba(235,240,241,0.16)');
      wg.addColorStop(1, 'rgba(235,240,241,0)');
      const strands = [
        { turn: 2.2, w: 9.0, a: 0.34, off: 0.0 },
        { turn: 2.9, w: 6.0, a: 0.28, off: 2.1 },
        { turn: 3.6, w: 4.0, a: 0.24, off: 4.2 },
        { turn: 1.8, w: 11.0, a: 0.18, off: 1.2 }
      ];
      for (let s = 0; s < strands.length; s++) {
        const st = strands[s];
        const segs = 110;
        const sp = t.spin * (0.9 + s * 0.09) + t.phase + st.off;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          // 螺距沿途伸缩：风带时而挤成一团、时而拉开，不再均匀如弹簧
          const th = u * st.turn * Math.PI * 2 + sp +
            Math.sin(u * 3.4 + t.phase + st.off) * 1.3;
          const rm = 0.54 + 0.2 * Math.sin(u * 6.4 + t.phase + st.off + morph * 0.3) +
            0.07 * Math.sin(u * 12.5 - morph * 1.8 + st.off * 0.7);
          const rx = widthAt(u) * rm;
          const ry = 5 + 11 * u;
          const x = Math.cos(th) * rx - Math.sin(th) * ry * 0.2 + bend(u) +
            Math.sin(u * 9 + t.phase + s) * 0.7;
          const y = -H * u + Math.sin(u * 21 + t.phase * 2 + s) * 1.2 - Math.sin(th) * ry;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        // 宽而淡的一层叠出“气流团”，再补一条细亮芯
        ctx.globalAlpha = fade * st.a * (0.85 + 0.15 * Math.sin(t.t * 2.4 + s));
        ctx.strokeStyle = wg;
        ctx.lineWidth = st.w;
        ctx.stroke();
        ctx.globalAlpha = fade * st.a * 0.35;
        ctx.lineWidth = Math.max(1, st.w * 0.2);
        ctx.stroke();
      }

      // 被撕开的短风絮：零散贴在柱身边缘，打断规整的螺旋线
      ctx.strokeStyle = 'rgba(240,245,246,0.55)';
      for (let wI = 0; wI < 9; wI++) {
        const u = 0.1 + ((wI * 0.107 + t.phase * 0.137) % 0.6);
        const w = widthAt(u);
        const dir = wI % 2 ? 1 : -1;
        const x0 = dir * w * 0.72 + bend(u);
        const y0 = -H * u + Math.sin(wI * 3.1 + t.spin) * 3;
        const len = 9 + (wI % 4) * 7;
        ctx.globalAlpha = fade * (0.14 + 0.2 * Math.abs(Math.sin(wI * 1.7 + t.spin)));
        ctx.lineWidth = 1.4 + (wI % 3) * 0.7;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + dir * len * 0.45, y0 - len * 0.55,
          x0 + dir * len, y0 - len * 1.1);
        ctx.stroke();
      }

      // 顶部散开的尘帽：补几团更淡的尘，让漏斗口自然散进云底
      for (let k = 1; k <= 5; k++) {
        const f = k / 6;
        const sz = 22 + (k % 3) * 8;
        ctx.globalAlpha = fade * 0.08;
        ctx.drawImage(pufC,
          bend(1) + (f - 0.5) * widthAt(1) * 1.3 - sz / 2 + Math.sin(k * 2.1 + t.phase) * 6,
          -H * 0.97 - sz * 0.3 + Math.cos(k * 1.7 + t.phase) * 5, sz, sz);
      }
      // 柱脚扬起的尘团：柔化底部的细亮杆
      for (let b = 0; b < 4; b++) {
        const sz = 26 + b * 10;
        ctx.globalAlpha = fade * (0.14 - b * 0.02);
        ctx.drawImage(pufW, Math.sin(t.spin * 0.5 + b) * 3 - sz / 2, -8 - sz / 2, sz, sz);
      }
      ctx.globalAlpha = fade * 0.2;
      ctx.fillStyle = '#d6d1c5';
      ctx.beginPath();
      ctx.ellipse(Math.sin(t.spin + t.phase) * 2, -5, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 底部贴地碎屑 + 沿柱身被卷起的浮尘
      for (let p = 0; p < 16; p++) {
        const ph = t.spin * 2.1 + p * 0.63 + t.phase;
        let px, py, sz;
        if (p < 8) {
          const rr = 17 + (p % 4) * 9;
          px = Math.cos(ph) * rr;
          py = Math.sin(ph) * rr * 0.3 - 1;
          sz = 1.7;
        } else {
          const kk = 0.1 + (p - 8) * 0.11;
          px = Math.cos(ph * 1.3) * widthAt(kk) * 0.95 + bend(kk) + Math.sin(ph * 2.1) * 4;
          py = -H * kk + Math.sin(ph * 1.7) * 4;
          sz = 1.1 + (p % 3) * 0.3;
        }
        ctx.globalAlpha = fade * (0.22 + 0.3 * Math.abs(Math.sin(ph)));
        ctx.fillStyle = p < 8 ? '#d9d2c4' : '#e4e1d8';
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 底部微亮的汇聚点：暗示风柱吸起尘土的源头
      ctx.globalCompositeOperation = 'lighter';
      const core = ctx.createRadialGradient(0, -6, 0, 0, -6, 14);
      core.addColorStop(0, 'rgba(245,248,247,0.1)');
      core.addColorStop(1, 'rgba(220,230,232,0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, -6, 14, 0, Math.PI * 2);
      ctx.fill();

      // 外侧薄雾：把轮廓和背景揉在一起
      const veil = ctx.createRadialGradient(0, -H * 0.45, 6, 0, -H * 0.45, H * 0.85);
      veil.addColorStop(0, 'rgba(206,214,217,0.09)');
      veil.addColorStop(0.6, 'rgba(198,208,212,0.045)');
      veil.addColorStop(1, 'rgba(190,200,205,0)');
      ctx.fillStyle = veil;
      ctx.fillRect(-H * 1.1, -H * 1.35, H * 2.2, H * 1.55);

      ctx.restore();
  },

  drawEffects(ctx, groundOnly) {
    for (const e of this.effects) {
      const ground = e.kind === 'teleArc' || e.kind === 'teleBeam' || e.kind === 'teleCircle' || e.kind === 'rollMark' || e.kind === 'arrowRainMarker' || e.kind === 'slamShock';
      if (ground !== !!groundOnly) continue;
      const t = 1 - e.life / e.max;
      if (e.kind === 'roarCore') {
        // 战吼核心闪光：胸口一团金白亮光快速膨胀后消失
        const k = 1 - e.life / e.max;
        const r = U.lerp(e.r0, e.r1, Math.sqrt(k));
        const a = (1 - k) * (1 - k) * 0.9;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, withAlpha(e.color, a));
        g.addColorStop(0.45, withAlpha(e.color, a * 0.5));
        g.addColorStop(1, withAlpha(e.color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'roarWave') {
        // 战吼光浪：一圈带厚度的黄色亮环向外推开，中心留空，靠加色混合发亮
        const k = 1 - e.life / e.max;
        const r = U.lerp(e.r0, e.r1, 1 - Math.pow(1 - k, 2));
        const band = Math.max(10, e.r1 * 0.20 * (1 - k * 0.45));
        const a = (1 - k) * 0.5;
        const g = ctx.createRadialGradient(e.x, e.y, Math.max(0, r - band), e.x, e.y, r + band);
        g.addColorStop(0, withAlpha(e.color, 0));
        g.addColorStop(0.55, withAlpha(e.color, a));
        g.addColorStop(1, withAlpha(e.color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + band, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'ring') {
        const r = U.lerp(e.r0, e.r1, t);
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'rollMark') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.34;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-e.len / 2, -5);
        ctx.quadraticCurveTo(0, 5, e.len / 2, -3);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'arrowRainMarker') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.5;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (1.1 - k * 0.25), -e.arc / 2, e.arc / 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'slash') {
        // 刀光：外层血雾带 + 血色主刃 + 白色刃芯，随进度外扩并整体淡出
        const fade = 1 - t;
        const rr = e.radius * (0.62 + t * 0.46);
        const a0 = -e.arc / 2, a1 = e.arc / 2;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.lineCap = 'round';
        // 加色混合让血刃在暗色地面和怪物身上都亮起来
        ctx.globalCompositeOperation = 'lighter';
        // 外层血雾
        ctx.globalAlpha = fade * 0.3;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 1.04, a0, a1);
        ctx.stroke();
        // 血色主刃
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = '#f0301f';
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a1);
        ctx.stroke();
        // 白色刃芯：贴主刃内侧，制造金属反光
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = 'rgba(255,244,236,0.95)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 0.96, a0, a1);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'spark') {
        ctx.globalAlpha = Math.max(0, e.life / e.max);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (e.life / e.max + 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'blood') {
        // 血珠：沿速度方向拉长，快消失时整体变淡
        const k = U.clamp(e.life / e.max, 0, 1);
        const sp = Math.hypot(e.vx, e.vy);
        const st = 1 + Math.min(2.4, sp / 160);
        ctx.globalAlpha = Math.min(0.85, k * 2.4);
        ctx.fillStyle = e.color;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.atan2(e.vy, e.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, e.r * st, e.r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'shard') {
        // 碎片：翻滚下落，最后 40% 生命逐渐淡出
        const k = U.clamp(e.life / e.max, 0, 1);
        const AD = DG.art && DG.art.terrainDecor;
        if (AD && AD.drawShard) {
          AD.drawShard(ctx, e.img, e.sx, e.sy, e.sw, e.sh,
            e.x, e.y, e.rot, e.scale, Math.min(1, k * 2.6));
        }
      } else if (e.kind === 'streak') {
        // 游侠翻滚的速度线：沿移动方向拖出细长光痕
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.75;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.w || 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-e.len * (0.4 + k * 0.6), 0);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'beam') {
        // 穿云箭贯穿光带：起点最亮，向前迅速消散
        const k = U.clamp(e.life / e.max, 0, 1);
        const len = e.len != null ? e.len : (e.length != null ? e.length : 72);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k;
        const half = (e.width || 6) / 2;
        const lg = ctx.createLinearGradient(0, 0, len, 0);
        lg.addColorStop(0, withAlpha(e.color, 0.9));
        lg.addColorStop(0.35, withAlpha(e.color, 0.45));
        lg.addColorStop(1, withAlpha(e.color, 0));
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(0, -half);
        ctx.lineTo(len, -half * 0.25);
        ctx.lineTo(len, half * 0.25);
        ctx.lineTo(0, half);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'snipeCharge') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.85;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8 + (1 - k) * 22, -0.65, 0.65);
        ctx.moveTo(-20 * k, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'arrowImpact' || e.kind === 'snipeImpact') {
        const k = U.clamp(e.life / e.max, 0, 1);
        const len = e.kind === 'snipeImpact' ? 54 : 30;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.kind === 'snipeImpact' ? 4.5 : 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-len * 0.35, 0);
        ctx.lineTo(len, 0);
        ctx.moveTo(len * 0.22, -len * 0.42);
        ctx.lineTo(len * 0.22, len * 0.42);
        if (e.kind === 'snipeImpact') {
          ctx.moveTo(-len * 0.05, -len * 0.45);
          ctx.lineTo(len * 0.54, len * 0.45);
        }
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'chargeGhost') {
        // 冲锋残影：暖色剪影用加色混合发光，按剩余生命快速淡出
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.pow(k, 1.5) * (e.alpha || 0.45);
        ctx.drawImage(e.img, e.x - e.img.width / 2, e.y - (e.img.height - 30));
        ctx.restore();
      } else if (e.kind === 'afterimage') {
        // 影步残影：翻滚路径上残留的半透明游侠残像
        const a = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = a * 0.32;
        DG.art.ranger.draw(ctx, e.x, e.y, {
          scale: 0.7273, flip: !!e.flip, state: 'walk',
          t: this.time, walkPhase: e.phase || 0
        });
        ctx.restore();
      } else if (DG.art.monsters && DG.art.monsters.drawEffect(ctx, e)) {
        // 分件小怪的咬击 / 孢子特效
      } else if (DG.art.bosses) {
        DG.art.bosses.drawEffect(ctx, e);
      }
      // 专属皮肤层：按小怪主题叠加碎屑/元素，增强每个怪物的辨识度
      if (e.skin && DG.art.monsters && DG.art.monsters.drawFxSkin) {
        DG.art.monsters.drawFxSkin(ctx, e);
      }
    }
  },
  drawFloaters(ctx) {
    for (const f of this.floaters) {
      const a = U.clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      // 数字出场时轻微放大再回落，让伤害数字更醒目
      const pop = f.life > f.max - 0.12 ? 1 + (f.life - (f.max - 0.12)) / 0.12 * 0.22 : 1;
      ctx.font = `bold ${Math.round(f.size * pop)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      // 描边随字号加粗，大号数字才不会糊成一团
      ctx.strokeStyle = 'rgba(0,0,0,0.78)';
      ctx.lineWidth = Math.max(4, f.size * 0.22);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  },
  });
})();
