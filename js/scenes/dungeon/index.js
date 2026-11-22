/* 副本战斗 · 场景核心：状态初始化、生命周期、主循环与结算 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  // 场景按最大屏 810×1680 绘制，小尺寸屏幕由舞台裁边显示，保证边缘永远有背景
  const W = 810;
  const H = 1680;
  // 网格秘境：5×3 个地块（每块 18×32 格，720×1280px）拼成整体近方形
  // 地图 3600×3840（0.94:1），横向 5 块即到边，路线更短更直
  const ARENA_W = 3600;
  const ARENA_H = 3840;

  // 消耗条：不同职业颜色与回复速度不同，只有带 energy 的技能才会消耗
  // 野蛮人为怒气条（橙色），游侠为精力（绿），术士为法力（蓝）
  const ENERGY_BY_CLASS = {
    ranger: { color: '#7ec97f', regen: 16 },
    warrior: { color: '#e9782b', regen: 12 },
    mage: { color: '#7fa8e6', regen: 14 }
  };

  class DungeonScene {
    constructor(opts) {
      this.char = opts.char;
      this.def = opts.def;
      this.onFinish = opts.onFinish;
      this.root = opts.root;
      this.canvas = DG.game.canvas;
      // 战斗场景整体提亮约 10%（CSS 滤镜在线性空间计算，1.15 对应画面亮度 +10%）
      this.canvas.style.filter = 'brightness(1.15)';
      this.ctx = this.canvas.getContext('2d');

      this.stats = DG.stats.compute(this.char);
      this.cls = DG.data.classes[this.char.cls];
      const es = ENERGY_BY_CLASS[this.cls.id] || { color: '#7ec97f', regen: 12 };
      const ENERGY = { max: 100, color: es.color, regen: es.regen };
      this.basicSkill = DG.data.skills[this.cls.autoSkill];
      // 关卡设计：waves 表示本关期望的怪群规模，越靠后的关卡每群多放 0~2 只
      const wv = this.def.waves || [6, 8];
      this.extraPerPack = Math.max(0, Math.round(((wv[0] + wv[1]) / 2 - 8) * 0.6));
      // 技能栏：普攻 + 已解锁的主动技能（主技能按角色等级解锁）
      this.activeSkills = this.cls.skills
        .filter(id => DG.data.skillUnlocked(this.char, id))
        .map(id => DG.data.skills[id]);
      this.skillList = [this.basicSkill, ...this.activeSkills];

      // 先生成随机房间走廊地图，玩家出生在首个房间中央
      this.generateMap();
      this.loadMapArt(this.def.mapStyle || 'grove');
      // 只预载本副本会用到的怪物贴图，避免每进一次副本就解码全部小怪资源
      if (DG.art && DG.art.monsters && DG.art.monsters.preload) {
        const warmIds = [];
        const minions = DG.data.bossMinions || {};
        [].concat(this.def.pool || [], this.def.elitePool || [], this.def.bossPool || []).forEach((id) => {
          if (id) warmIds.push(id);
        });
        warmIds.push('mimic');
        const bosses = [].concat(this.def.bossPool || [], this.def.bossId ? [this.def.bossId] : []);
        bosses.forEach((id) => {
          if (minions[id]) warmIds.push(minions[id]);
        });
        const artIds = [];
        warmIds.forEach((id) => {
          const mon = DG.data.monsters[id];
          if (mon && mon.art && !mon.boss && artIds.indexOf(mon.art) < 0) artIds.push(mon.art);
        });
        DG.art.monsters.preload(artIds);
      }
      // 只预热本副本首领池的贴图，避免进一次副本就把全部首领解码进内存
      if (DG.art && DG.art.bosses && DG.art.bosses.preload) {
        DG.art.bosses.preload([].concat(this.def.bossPool || [], this.def.bossId ? [this.def.bossId] : []).filter(Boolean));
      }
      // 死亡骨头图集：进副本时就解码切片，避免首次击杀时才卡一下
      if (DG.art && DG.art.bones) DG.art.bones.load();
      // 出生在被标记为 entrance 的地块中央：该块不刷怪，保证开局安全
      const startChunk = this.chunks.find(ch => ch.id === 'entrance') || this.chunks[0];
      const startRoom = this.rooms[startChunk.index] || { cx: this.chunks[0].px + this.chunkW / 2, cy: this.chunks[0].py + this.chunkH / 2 };
      this.player = {
        x: startRoom.cx, y: startRoom.cy, r: 14,
        hp: this.stats.maxHp, maxHp: this.stats.maxHp,
        // 精力/消耗条：只用带 energy 消耗的技能才会扣减，游侠为绿色
        stam: ENERGY.max, maxStam: ENERGY.max,
        facing: 0, invuln: 0,
        // 角色动作：移动 / 朝向 / 出手
        moving: false, walkPhase: 0, flip: false, atkAnim: 0,
        // 受击硬直与后退：hurtT 剩余硬直时间，kbX/kbY 后退速度
        hurtT: 0, kbX: 0, kbY: 0,
        // 冰缓：精英「冰冻」词缀命中后短暂减速
        chillT: 0
      };
      this.energy = ENERGY;
      this.camera = { x: this.player.x, y: this.player.y };
      // 记录出生点：开局附近要留出安全区，让玩家先走一段再遭遇战斗
      this.spawnPoint = { x: this.player.x, y: this.player.y };
      // 战斗视角：视野放宽到约 655×1309 世界像素，一屏可并排容纳两只首领
      this.zoom = 1.1;
      this.revealAt(this.player.x, this.player.y, 8);
      this.updateFogTexture();
      this.computeFlow(this.player.x, this.player.y);

      this.monsters = [];
      this.projectiles = [];
      this.effects = [];
      this.tornadoes = [];
      this.dangerZones = [];
      this.floaters = [];
      this.drops = [];
      this.bones = [];
      // 天气：进入副本时掷一次，整局不变
      this.rollWeather();
      // 精英词缀与场地机制：词缀每关 1~2 条，场地机制只在 5 的倍数关出现
      this.rollStageAffixes();
      this.rollField();
      // 血迹：本图随机一组美术序列，受伤时铺在怪物脚下
      this.initBlood();

      this.keys = {};
      this.mouse = { x: W / 2 + 120, y: H / 2, moved: false };
      this.attackHeld = false;
      this.moveTarget = null;              // 左键点地走位目标
      this.moveVec = { x: 0, y: 0 };       // 虚拟摇杆方向（-1..1）
      this.moveDirAngle = null;            // 本帧移动方向（未移动为 null）
      this.stickId = null;
      this.lastInput = 'mouse';            // mouse | touch
      this.autoMode = false;
      this.autoTarget = null;
      this.autoGoal = null;
      this.autoPack = null;
      this.autoSteer = null;
      this.autoEvade = null;
      this.autoHoldingRange = false;
      this.autoBlocked = 0;
      this.autoDetour = null;
      this.autoDecision = null;

      this.attackCd = 0;
      // 索引与 skillList 对齐；0 号位（普攻）沿用 attackCd，其余为主动技能冷却
      this.skillCd = this.skillList.map(() => 0);

      this.phase = 'wave';
      this.phaseTimer = 0;

      this.time = 0;
      this.kills = 0;
      this.goldEarned = 0;
      this.xpEarned = 0;
      this.items = [];
      this.skillUps = [];

      this.paused = false;
      this.finished = false;
      this.ending = false;
      this.finishTimer = 0;
      this.victory = false;
      this.defeat = false;
      this.shake = 0;
      this.hurtFlash = 0;
      this.bossFlash = 0;
      this.hudTimer = 0;
      this.bagWarnCd = 0;

      // 天赋：进入副本时固化一次，战斗内不再变化
      this.talents = this.stats.talents || DG.talents.mods(this.char);
      this.talentTimers = {
        killRush: 0, chargeHaste: 0, chargeCrit: 0, rollHaste: 0, postHurt: 0,
        fortify: 0, voidGuard: 0, unyieldingCd: 0, voidCd: 0
      };
      this.basicCount = 0;
      this.overloadCount = 0;
      this._overloadCast = false;

      this.decor = this.makeDecor();
      // 按块内容：先定怪群配置（含密室随机方案），再据此放宝箱
      this.chunkPacks = this.makeChunkPacks();
      // 首领降临门槛 = 本图计划刷出的全部小怪（含密室精英与天气/关卡加成）。
      // 顶部进度条按击杀数推进，杀满后首领才现身。
      this.bossKillGoal = this.chunkPacks.reduce((n, p) => {
        const base = p.count > 0
          ? p.count + (this.wxPackBonus || 0) + (this.extraPerPack || 0)
          : 0;
        return n + Math.max(0, base) + (p.elite || 0);
      }, 0);
      this.chests = this.makeChests();
      // 动态装饰：角色之上的可破坏路线装饰，以及地图外黑域装饰
      this.sceneProps = this.makeSceneProps();
      // 校验宝箱 / 怪群 / 首领场地未被立件碰撞体封死（极窄布局会放弃道具碰撞）
      this.ensureCriticalReachable();
      // 地形整体烘焙成静态贴图，运行时只做一次贴图拷贝
      this.bakeTerrain();
      this.buildHud();
      this.bind();
      if (DG.audio) {
        DG.audio.playBgm('battle');
        // 进副本即预热本职业技能音效，保证第一击就有声
        DG.audio.preloadClass(this.cls.id);
      }
      this.announce(`${this.def.name} · 开始探索`, 2000);
      if (this.wxRule && this.wxRule.desc) {
        // 天气带来玩法变化，入场时明确告知；计时器需在离场时清理，避免回调落到已销毁场景
        this._wxTimer = setTimeout(() => {
          if (!this.finished && this.hud) this.announce(`天气 · ${this.weatherName}｜${this.wxRule.desc}`, 2600);
        }, 2300);
      }
      if (this.eliteAffixText) {
        this._affixTimer = setTimeout(() => {
          if (!this.finished && this.hud) this.announce(`精英词缀 · ${this.eliteAffixText}`, 2400);
        }, 4600);
      }
      if (this.field) {
        this._fieldTimer = setTimeout(() => {
          if (!this.finished && this.hud) this.announce(`场地 · ${this.field.name}｜${this.field.desc}`, 2800);
        }, 6600);
      }
      this.updateHud();
    }

    retreat() {
      if (this.finished) return;
      this.setPaused(false);
      this.ending = true;
      this.victory = false;
      this.finishTimer = 0.25;
      this.attackHeld = false;
      this.moveTarget = null;
      this.moveVec.x = 0;
      this.moveVec.y = 0;
      this.announce('正在撤离……', 900);
    }

    buildResult() {
      return {
        victory: this.victory,
        retreat: !this.victory && !this.defeat,
        defeat: this.defeat,
        kills: this.kills,
        time: Math.round(this.time),
        xp: Math.round(this.xpEarned),
        gold: Math.round(this.goldEarned),
        items: this.items.slice(),
        skillUps: this.skillUps.slice(),
        levels: []
      };
    }

    finishNow() {
      if (this.finished) return;
      this.finished = true;
      // 兜底补记通关：首领倒下时已记录过一次，这里只在缺失时补写，
      // 防止任何异常路径导致「打赢了却没解锁下一关」
      if (this.victory && DG.quests && this.char && this.def &&
        !(this.char.cleared && this.char.cleared[this.def.id])) {
        DG.quests.onStageClear(this.char, this.def.id);
        if (DG.game && DG.game.save) DG.game.save();
      }
      const result = this.buildResult();
      this.dispose();
      if (this.onFinish) this.onFinish(result);
    }

    dispose() {
      // 离开副本时只淡出天气环境音并解除暂停压低；
      // BGM 由后续场景或结算流程接管，避免出现无声空档
      if (DG.audio) {
        DG.audio.setBattlePaused(false);
        DG.audio.stop();
      }
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('mouseup', this._onMouseUp);
      window.removeEventListener('blur', this._onBlur);
      if (this._unsubSettings) {
        this._unsubSettings();
        this._unsubSettings = null;
      }
      if (this.canvas) {
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        if (this._onContextMenu) this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        this.canvas.style.cursor = 'default';
        this.canvas.style.touchAction = '';
        // 离开副本恢复画布亮度，避免影响城镇与菜单
        this.canvas.style.filter = '';
      }
      this.attackHeld = false;
      this.moveVec.x = 0;
      this.moveVec.y = 0;
      clearTimeout(this._annTimer);
      clearTimeout(this._wxTimer);
      clearTimeout(this._affixTimer);
      clearTimeout(this._fieldTimer);
      if (this._stick) {
        this._stick.destroy();
        this._stick = null;
      }
      if (this.hud && this.hud.parentNode) this.hud.remove();
      this.hud = null;
      // 释放地块贴图与烘焙用画布，避免离场后仍占着显存
      if (this._chunkCache) this._chunkCache.clear();
      this._chunkCache = null;
      this._warmCanvas = null;
      this._warmCtx = null;
      const toastWrap = document.getElementById('toast-wrap');
      if (toastWrap) toastWrap.classList.remove('in-battle');
    }

    update(dt) {
      if (this.paused || this.finished) return;

      this.time += dt;
      this.attackCd = Math.max(0, this.attackCd - dt);
      for (let i = 1; i < this.skillCd.length; i++) {
        this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
      }
      this.player.invuln = Math.max(0, this.player.invuln - dt);
      this.player.chillT = Math.max(0, this.player.chillT - dt);
      this.player.atkAnim = Math.max(0, (this.player.atkAnim || 0) - dt);
      // 受击硬直：按当前后退速度位移并衰减
      if (this.player.hurtT > 0) {
        this.player.hurtT = Math.max(0, this.player.hurtT - dt);
        this.movePlayer(this.player, this.player.kbX * dt, this.player.kbY * dt, this.player.r);
        const damp = Math.max(0, 1 - dt * 7);
        this.player.kbX *= damp;
        this.player.kbY *= damp;
        if (this.player.hurtT <= 0) { this.player.kbX = 0; this.player.kbY = 0; }
      }
      this.shake = Math.max(0, this.shake - dt * 2);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
      this.bossFlash = Math.max(0, this.bossFlash - dt);
      this.bagWarnCd = Math.max(0, this.bagWarnCd - dt);
      this.tickTalentTimers(dt);
      this.hudTimer -= dt;

      if (this.ending) {
        this.finishTimer -= dt;
        this.updateDrops(dt);
        this.updateEffects(dt);
        this.updateFloaters(dt);
        this.updateBlood(dt);
        this.updateBones(dt);
        this.updateWeather(dt);
        this.updateCamera(dt);
        if (this.finishTimer <= 0) this.finishNow();
        return;
      }

      // 回复
      if (this.player.hp > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stats.hpRegen * dt);
        this.player.stam = Math.min(this.player.maxStam, this.player.stam + this.energy.regen * dt);
      }

      // 移动：手动输入优先；未输入时自动模式追击最近敌人
      const k = this.keys;
      let mx = 0, my = 0, moveFactor = 1;
      const kx = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
      const ky = (k['KeyS'] || k['ArrowDown'] ? 1 : 0) - (k['KeyW'] || k['ArrowUp'] ? 1 : 0);
      if (kx || ky) {
        if (this.autoMode) {
          this.autoMode = false;
          this.autoTarget = null;
          this.syncAutoButton();
        }
        this.moveTarget = null;
        const len = Math.hypot(kx, ky);
        mx = kx / len;
        my = ky / len;
      } else {
        const mag = Math.hypot(this.moveVec.x, this.moveVec.y);
        if (mag > 0.15) {
          if (this.autoMode) {
            this.autoMode = false;
            this.autoTarget = null;
            this.syncAutoButton();
          }
          this.moveTarget = null;
          mx = this.moveVec.x / mag;
          my = this.moveVec.y / mag;
          moveFactor = Math.min(1, (mag - 0.15) / 0.6);
        } else if (this.moveTarget) {
          if (this.autoMode) {
            this.autoMode = false;
            this.autoTarget = null;
            this.syncAutoButton();
          }
          const dx = this.moveTarget.x - this.player.x;
          const dy = this.moveTarget.y - this.player.y;
          const d = Math.hypot(dx, dy);
          if (d <= 6) {
            this.moveTarget = null;
          } else {
            mx = dx / d;
            my = dy / d;
          }
        } else if (this.autoMode) {
          const auto = this.autoMoveDirection();
          mx = auto.x;
          my = auto.y;
        }
      }
      if (this.player.hurtT > 0) { mx = 0; my = 0; moveFactor = 0; }
      if (mx || my) {
        const step = this.moveSpeedNow() * moveFactor * dt;
        const beforeX = this.player.x, beforeY = this.player.y;
        this.movePlayer(this.player, mx * step, my * step, this.player.r);
        if (this.autoMode) {
          const moved = Math.hypot(this.player.x - beforeX, this.player.y - beforeY);
          this.autoBlocked = moved < Math.min(1.5, step * 0.16) ? this.autoBlocked + dt : 0;
        }
      } else if (this.autoMode) {
        this.autoBlocked = Math.max(0, this.autoBlocked - dt * 2);
      }
      this.breakPropsAt(this.player.x, this.player.y, this.player.r + 8);
      // 记录移动方向：自动出手只朝这个方向索敌，避免转身向后放技能
      this.moveDirAngle = (mx || my) ? Math.atan2(my, mx) : null;
      this.updateExploration(dt);
      this.updateFlow(dt);

      // 朝向：移动时始终朝向移动方向，避免倒着跑；静止时键鼠跟随鼠标
      if (this.moveDirAngle != null) {
        this.player.facing = this.moveDirAngle;
      } else if (!DG.settings.touchEnabled() && this.mouse.moved) {
        this.player.facing = U.angle(this.player, this.aimPos());
      }

      // 动作状态：移动时走路，静止时待机；左右翻转带迟滞，避免正上/正下瞄准时闪烁
      this.player.moving = !!(mx || my);
      if (this.player.moving) {
        // 步频与实际移速成正比：330px/s 对应 11rad/s（步幅 30px/rad），
        // 保证任何移速下步幅不变、只改变迈步频率；战斗基础移速与主城同源
        const ratio = this.moveSpeedNow() * moveFactor / 330;
        this.player.walkPhase += dt * 11 * ratio;
      }
      const sideways = Math.cos(this.player.facing);
      if (sideways > 0.18) this.player.flip = false;
      else if (sideways < -0.18) this.player.flip = true;

      // 普攻与 5 个技能统一自动释放（自动索敌）；硬直期间无法出手
      if (this.player.hurtT <= 0) this.autoCast();

      // 键鼠模式保留右键手动补普攻（自动无目标时仍可手动出手）
      if (!DG.settings.touchEnabled() && this.attackHeld && this.attackCd <= 0 && this.player.hp > 0 && this.player.hurtT <= 0) {
        this.doBasic(U.angle(this.player, this.aimPos()));
      }

      this.updateWhirl(dt);
      this.updateTornadoes(dt);
      this.updateRoar(dt);
      this.updateMonsters(dt);
      this.updateProjectiles(dt);
      this.updateDrops(dt);
      this.updateEffects(dt);
      this.updateFloaters(dt);
      this.updateBlood(dt);
      this.updateBones(dt);
      this.updateWeather(dt);
      this.updateField(dt);
      this.updateChunkSpawns();
      this.updateChests(dt);
      this.updateWaves(dt);
      this.updateCamera(dt);

      this.compactMonsters();

      this.tickRenderQuality(dt);

      if (this.hudTimer <= 0) {
        this.updateHud();
        this.hudTimer = 0.1;
      }
    }

    // 原地压缩死亡怪物，避免每帧 filter 产生新数组触发 GC
    compactMonsters() {
      const list = this.monsters;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        if (!list[i].dead) list[n++] = list[i];
      }
      list.length = n;
    }

    updateCamera(dt) {
      // 镜头不做边界钳制：走到地图边缘也保持角色居中，
      // 场景外由 drawGround 的纯黑底铺满，形成扩大的黑色留白
      const t = Math.min(1, dt * 9);
      this.camera.x = U.lerp(this.camera.x, this.player.x, t);
      this.camera.y = U.lerp(this.camera.y, this.player.y, t);
    }

    // 自适应画质：连续掉帧时降低画布像素量（CSS 尺寸不变）优先保证流畅。
    // 下限固定为 1 倍原生分辨率，绝不再往下降——低于 1 倍会让角色边缘明显发糊。
    // 帧率有余量时再逐步升回设备原生倍率，避免一次降档后整局都糊。
    tickRenderQuality(dt) {
      // 开局资源解码与地形烘焙阶段不参与判定，避免误降
      if (this.time < 3) return;
      const q = this._rq || (this._rq = { n: 0, sum: 0, slow: 0, fast: 0 });
      q.n++;
      q.sum += dt;
      if (q.n < 45) return;
      const avg = (q.sum / q.n) * 1000;
      q.n = 0;
      q.sum = 0;
      const G = DG.game;
      if (!G || !G.setRenderScale) return;
      const cur = G.renderScale || 1;
      const native = G.nativeRenderScale ? G.nativeRenderScale() : 1;
      if (avg > 18.2) {
        // 连续两个观察窗都不到 55fps 才降档，避免偶发卡顿误判
        q.slow++;
        q.fast = 0;
        if (q.slow >= 2 && cur > 1) {
          G.setRenderScale(Math.max(1, cur - 0.15));
          q.slow = 0;
        }
      } else {
        q.slow = 0;
        // 稳定 69fps 以上连续三个观察窗，才尝试升回原生倍率
        if (avg < 14.5 && cur < native - 0.01) {
          q.fast++;
          if (q.fast >= 3) {
            G.setRenderScale(Math.min(native, cur + 0.15));
            q.fast = 0;
          }
        } else {
          q.fast = 0;
        }
      }
    }

    frame(dt) {
      if (!this.finished) {
        this.update(dt);
        this.maybePrefetchChunk(dt);
      }
      this.draw();
    }
  }

  DG.scenes.dungeon = DungeonScene;
  // 竞技场尺寸等常量，供拆分后的子模块共享
  DG.scenes.dungeon.size = { W, H, ARENA_W, ARENA_H };
})();
