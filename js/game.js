/* 游戏入口：场景切换与主循环 */
(function () {
  const DG = window.DG;

  // 场景固定按最大尺寸 810×1680 绘制：舞台比它小就等比裁边，始终不会露出空白
  const SCENE_W = 810;
  const SCENE_H = 1680;

  const game = DG.game = {
    canvas: null,
    ctx: null,
    ui: null,
    db: null,
    accountName: null,
    charIndex: -1,
    char: null,
    dungeon: null,
    lastTs: 0,
    _saveWarned: false,
    // 渲染分辨率倍率：画布后备像素 = 720×倍率。
    // 手机屏幕的物理像素远多于 720p，若按 1 倍渲染再被浏览器放大，角色边缘会发糊，
    // 因此默认按设备物理像素渲染（上限 1.5 倍），掉帧时自适应回落但不低于 1 倍。
    renderScale: 1,

    init() {
      this.canvas = document.getElementById('game');
      // alpha:false：画面每帧全量覆盖，不需要透明通道，省掉整屏混合开销
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.ui = document.getElementById('ui');
      this.db = DG.storage.load();

      // 主城 / 战斗贴图约 2MB：等 load 之后再预载，先保证登录首屏拿到满带宽
      this.deferPreload();

      this.fitStage();
      window.addEventListener('resize', () => this.fitStage());
      window.addEventListener('orientationchange', () => setTimeout(() => this.fitStage(true), 200));
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => this.fitStage());
      }
      // 键盘收起后复位页面并重新适配：微信里输入法可能把页面顶偏
      document.addEventListener('focusout', (e) => {
        const t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        setTimeout(() => {
          if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
          this.fitStage(true);
        }, 120);
      });
      // 微信长按图片会弹出「保存图片 / 识别二维码」，统一拦掉
      document.addEventListener('contextmenu', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'IMG' || t.tagName === 'CANVAS')) e.preventDefault();
      });
      document.addEventListener('dragstart', (e) => {
        if (e.target && e.target.tagName === 'IMG') e.preventDefault();
      });
      window.addEventListener('beforeunload', () => {
        if (this.db) DG.storage.save(this.db);
      });

      requestAnimationFrame((ts) => this.loop(ts));
      this.gotoLogin();
      // 登录界面已经渲染，撤掉静态启动画面（背景图若未到还有渐变兜底，不会黑屏）
      requestAnimationFrame(() => this.hideBoot());
      this.registerServiceWorker();
    },

    // 注册本地缓存：线上服务器对所有资源返回 no-store，浏览器不会缓存，
    // 重复打开都要重新下载；Service Worker 用 Cache Storage 把这部分兜住。
    registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      const host = location.hostname;
      // Service Worker 只能在 https 或本机调试时使用，file:// 双击打开时自动跳过
      if (location.protocol !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
      const start = () => {
        navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
          // 首屏已完成：让 SW 在后台把未访问过的资源按清单补进本地缓存
          if (!reg || !reg.active) return;
          setTimeout(() => {
            if (reg.active) reg.active.postMessage({ type: 'warm', delay: 3000 });
          }, 600);
        }).catch(() => { /* 缓存不可用不影响游戏 */ });
      };
      if (document.readyState === 'complete') start();
      else window.addEventListener('load', start);
    },

    // 首屏资源（CSS / JS / 登录背景）就绪后再预热战斗贴图：
    // 之前一进页面就抢连接，登录背景反而要排队，弱网首屏明显变慢。
    deferPreload() {
      const run = () => setTimeout(() => {
        if (DG.art && DG.art.preloadAssets) DG.art.preloadAssets();
      }, 1200);
      if (document.readyState === 'complete') run();
      else window.addEventListener('load', run, { once: true });
    },

    // 撤掉 index.html 中的静态启动画面
    hideBoot() {
      if (this._bootHidden) return;
      this._bootHidden = true;
      const el = document.getElementById('boot');
      if (!el) return;
      el.classList.add('boot-out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    },

    // 当前布局下 1 个逻辑像素对应的物理像素数：舞台缩放 × 设备像素比。
    // 用它渲染可以避免「720p 画布被拉伸到整屏」导致的角色发糊。
    nativeRenderScale() {
      const doc = document.documentElement;
      const width = doc.clientWidth || window.innerWidth || SCENE_W;
      const height = doc.clientHeight || window.innerHeight || SCENE_H;
      const fit = Math.max(width / SCENE_W, height / SCENE_H) || 1;
      const dpr = window.devicePixelRatio || 1;
      // 手机端封顶 1.25 倍：810×1680 逻辑画布放大后约 1012×2100，
      // 已高于多数手机的实际显示分辨率，再往上只是白白多画像素、拖低帧率
      // 指针类型不会在运行中变化，缓存一次即可，避免反复创建 MediaQueryList
      if (this._coarse == null) {
        this._coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      }
      const cap = this._coarse ? 1.25 : 2;
      return Math.max(1, Math.min(cap, fit * dpr));
    },

    // 调整画布后备分辨率；CSS 尺寸不变，画面由浏览器缩放显示。
    // 下限 1 倍：低于原生分辨率会让战斗角色明显发糊，任何情况下都不允许。
    setRenderScale(r) {
      const v = Math.max(1, Math.min(2, Math.round(r * 100) / 100));
      const w = Math.round(SCENE_W * v);
      const h = Math.round(SCENE_H * v);
      if (Math.abs(v - this.renderScale) < 0.01 && this.canvas.width === w && this.canvas.height === h) return;
      this.renderScale = v;
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx = this.canvas.getContext('2d', { alpha: false });
    },

    // 屏幕尺寸预设：竖版手机三档，只影响舞台显示窗口，场景始终按 810×1680 绘制
    stageSize() {
      const key = (DG.settings && DG.settings.get().screen) || 'std';
      if (key === 'max') return { key, w: 810, h: 1680 };
      if (key === 'short') return { key, w: 720, h: 1680 };
      return { key: 'std', w: 720, h: 1440 };
    },

    // 设置面板切换屏幕尺寸后立即应用
    applyScreen() {
      this.fitStage(true);
      if (this.dungeon && this.dungeon.updateHud) this.dungeon.updateHud();
    },

    // 适配手机 / 微信：按布局视口等比缩放，输入法弹出期间不跟随可视视口缩放，
    // 否则点输入框时整个游戏画面会突然缩小、键盘收起后又大小异常
    fitStage(force) {
      const stage = document.getElementById('stage');
      if (!stage) return;
      const ae = document.activeElement;
      const editing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      if (editing && !force) return;
      const doc = document.documentElement;
      const width = doc.clientWidth || window.innerWidth;
      const height = doc.clientHeight || window.innerHeight;
      if (!width || !height) return;
      const screen = this.stageSize();
      // 屏幕比例接近竖版时不再留黑边：舞台提升到场景画幅 810×1680 并铺满屏幕，
      // 多出的部分由 #stage 裁掉，露出的是真实场景；UI 层反向缩放，
      // 物理尺寸与 720×1440 时完全一致，布局、按钮位置和字号都不变。
      // 超过 0.60（横屏窗口）或低于 0.36（极窄）时仍按原逻辑完整显示，避免裁掉过多画面。
      const aspect = width / height;
      const fill = aspect >= 0.36 && aspect <= 0.60;
      const sw = fill ? SCENE_W : screen.w;
      const sh = fill ? SCENE_H : screen.h;
      stage.style.width = sw + 'px';
      stage.style.height = sh + 'px';
      // UI 固定 720×1440 居中，场景层要按舞台原点铺开：这两个偏移供场景元素（主城地图）使用
      stage.style.setProperty('--ui-ox', ((720 - sw) / 2) + 'px');
      stage.style.setProperty('--ui-oy', ((1440 - sh) / 2) + 'px');
      stage.style.setProperty('--stage-w', sw + 'px');
      stage.style.setProperty('--stage-h', sh + 'px');
      // 等比缩放，绝不横向 / 纵向拉伸（拉伸会让插画和 UI 明显变形）：
      // 铺满模式下按 cover 裁切，其余情况按 fit 完整显示
      const uiScale = Math.min(width / screen.w, height / screen.h);
      const scale = fill ? Math.max(width / sw, height / sh) : uiScale;
      stage.style.transform = `scale(${scale})`;
      // UI 反向缩放抵消舞台放大，保证界面物理尺寸与原来一致
      if (this.ui) this.ui.style.transform = fill ? `scale(${(uiScale / scale).toFixed(4)})` : '';
      // 场景固定 810×1680：等比放大到刚好盖住舞台，多出的边缘由 #stage 裁掉
      const coverScale = Math.max(sw / SCENE_W, sh / SCENE_H);
      const cw = SCENE_W * coverScale;
      const ch = SCENE_H * coverScale;
      this.canvas.style.width = cw + 'px';
      this.canvas.style.height = ch + 'px';
      this.canvas.style.left = ((sw - cw) / 2) + 'px';
      this.canvas.style.top = ((sh - ch) / 2) + 'px';
      // 画布后备像素跟随设备物理像素，避免拉伸显示导致角色模糊
      this.setRenderScale(this.nativeRenderScale());
    },

    account() {
      return DG.storage.getAccount(this.db, this.accountName);
    },

    save() {
      const ok = DG.storage.save(this.db);
      if (!ok && !this._saveWarned) {
        this._saveWarned = true;
        DG.ui.toast('本地存档不可用，本次进度仅在页面内有效', 'danger');
      }
      return ok;
    },

    setAccount(name) {
      this.accountName = name;
      const acc = this.account();
      if (!acc) return;
      const idx = Number.isInteger(acc.activeChar) ? acc.activeChar : 0;
      this.charIndex = idx;
      this.char = DG.character.normalize(acc.characters[idx] || null);
    },

    logout() {
      this.gotoLogin();
    },

    gotoLogin() {
      this.stopDungeon();
      this.hideAssetMask();
      if (DG.wake) DG.wake.disable();
      this.accountName = null;
      this.charIndex = -1;
      this.char = null;
      DG.scenes.town.reset();
      DG.scenes.login.render(this.ui);
    },

    gotoCharacter() {
      this.stopDungeon();
      if (DG.wake) DG.wake.disable();
      if (!this.account()) {
        this.gotoLogin();
        return;
      }
      // 野蛮人等图片拼装角色在贴图未到齐时会缺头，先等角色资源就绪再渲染
      if (DG.art && DG.art.heroesReady && DG.art.onHeroesReady && !DG.art.heroesReady()) {
        this.showAssetMask('正在准备角色…');
        let entered = false;
        const showCharacter = () => {
          if (entered) return;
          entered = true;
          clearTimeout(fallback);
          requestAnimationFrame(() => {
            DG.scenes.character.render(this.ui);
            requestAnimationFrame(() => this.hideAssetMask());
          });
        };
        // 兜底：个别贴图异常时最多等 6 秒，避免一直卡在加载层
        const fallback = setTimeout(showCharacter, 6000);
        DG.art.onHeroesReady(showCharacter);
        return;
      }
      DG.scenes.character.render(this.ui);
    },

    // 登录成功后的开始界面：确认账号后再进入选角
    gotoEntry() {
      this.stopDungeon();
      if (!this.account()) {
        this.gotoLogin();
        return;
      }
      DG.scenes.entry.render(this.ui);
    },

    enterCharacter(index) {
      const acc = this.account();
      if (!acc) return;
      const char = acc.characters[index];
      if (!char) return;
      acc.activeChar = index;
      this.charIndex = index;
      this.char = DG.character.normalize(char);
      char.lastPlayed = Date.now();
      this.save();
      this.gotoTown();
    },

    gotoTown() {
      this.stopDungeon();
      if (!this.account()) {
        this.gotoLogin();
        return;
      }
      if (!this.char) {
        this.gotoCharacter();
        return;
      }
      // 镇内提示只在本次登录首次进入时出现，避免反复刷屏
      if (DG.wake) DG.wake.enable();
      this.readyThen(() => DG.scenes.town.render(this.ui), '正在准备资源…');
    },

    // 资源就绪后再执行场景切换：没就绪时先显示加载遮罩，避免进入时黑屏
    readyThen(fn, text) {
      if (!DG.art || !DG.art.assetsReady || DG.art.assetsReady()) { fn(); return; }
      this.showAssetMask(text);
      DG.art.onAssetsReady(() => {
        // 先让遮罩画出来，再同步创建场景；建完等一帧再撤，避免露出空画布
        requestAnimationFrame(() => {
          try {
            fn();
          } finally {
            requestAnimationFrame(() => this.hideAssetMask());
          }
        });
      });
    },

    showAssetMask(text) {
      this.hideAssetMask();
      const mask = document.createElement('div');
      mask.className = 'asset-mask';
      mask.innerHTML =
        '<div class="asset-box"><span class="asset-spinner"></span>' +
        '<b></b><i></i></div>';
      mask.querySelector('b').textContent = text || '正在准备资源…';
      // 挂在舞台层：副本初始化会重写 #ui，遮罩不能被一起清掉
      const host = document.getElementById('stage') || this.ui;
      host.appendChild(mask);
      this._assetMask = mask;
      const tick = () => {
        if (!this._assetMask) return;
        const pct = DG.art && DG.art.assetsProgress ? DG.art.assetsProgress() : 100;
        const el = mask.querySelector('i');
        if (el) el.textContent = pct + '%';
        this._assetTimer = setTimeout(tick, 150);
      };
      tick();
    },

    hideAssetMask() {
      if (this._assetTimer) { clearTimeout(this._assetTimer); this._assetTimer = null; }
      if (this._assetMask) { this._assetMask.remove(); this._assetMask = null; }
    },

    startDungeon(def) {
      if (!this.char || !def) return;
      this.stopDungeon();
      // 战斗中同样保持屏幕常亮
      if (DG.wake) DG.wake.enable();
      // 每次进战斗都按当前设备像素比重置渲染倍率：
      // 既保证首帧角色清晰，也让上一次掉帧降档不会一直沿用
      this.setRenderScale(this.nativeRenderScale());
      this.char.lastPlayed = Date.now();
      this.save();
      // 地图生成与地形烘焙是同步的重活：先让遮罩画出来再开始构建，
      // 构建完等两帧（主循环已画出首帧）再撤遮罩，避免进副本瞬间黑屏
      this.showAssetMask('正在进入副本…');
      const build = () => {
        try {
          this.dungeon = new DG.scenes.dungeon({
            char: this.char,
            def,
            root: this.ui,
            onFinish: (result) => this.finishDungeon(result)
          });
        } catch (e) {
          // 构建异常时不能让遮罩一直挡着，退回营地并提示
          this.hideAssetMask();
          if (DG.ui && DG.ui.toast) DG.ui.toast('进入副本失败，请重试');
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => this.hideAssetMask()));
        // 首领贴图在副本真正跑起来后再后台下载，不拖慢登录页与进镇
        if (DG.art && DG.art.preloadBosses) DG.art.preloadBosses();
      };
      if (DG.art && DG.art.assetsReady && !DG.art.assetsReady()) {
        DG.art.onAssetsReady(() => requestAnimationFrame(build));
      } else {
        requestAnimationFrame(build);
      }
    },

    finishDungeon(result) {
      const char = this.char;
      this.dungeon = null;
      if (!char) {
        this.gotoCharacter();
        return;
      }

      // 撤退/重伤：金币与经验打折结算，装备保留。
      // 避免「打不过就撤」变成零风险刷取，同时不给玩家过重的挫败感
      const keep = result.victory ? 1 : (result.retreat ? 0.7 : 0.4);
      result.keepRate = keep;
      if (keep < 1) {
        // 经验在战斗中已实时入账（升级也已在战斗内完成），
        // 这里只扣回未保留的那部分，且不扣到负数、不掉级
        const lostXp = Math.round(result.xp * (1 - keep));
        char.xp = Math.max(0, (char.xp || 0) - lostXp);
        result.gold = Math.round(result.gold * keep);
        result.xp = Math.max(0, result.xp - lostXp);
      }

      char.gold = (char.gold || 0) + result.gold;
      result.levels = result.levels || [];
      // 每 3 级才发 1 点技能点，结算文案按实际发放数量显示
      result.skillPoints = result.levels.filter(lv => lv % 3 === 0).length;
      result.level = char.level;
      this.save();

      // 结算面板出现时切回主城音乐，避免战斗音乐停掉后出现长时间静音
      if (DG.audio) DG.audio.playBgm('lobby');
      DG.ui.showSettlement(result, () => this.gotoTown());
    },

    stopDungeon() {
      if (this.dungeon) {
        this.dungeon.dispose();
        this.dungeon = null;
      }
    },

    // 自适应画质统一由副本场景的 tickRenderQuality 负责：
    // 两套降档逻辑并行会互相拉扯，导致画布反复重建、帧率更低。
    loop(ts) {
      const dt = Math.min(0.05, this.lastTs ? (ts - this.lastTs) / 1000 : 0);
      this.lastTs = ts;
      if (this.dungeon && !this.dungeon.finished) {
        this.dungeon.frame(dt);
      }
      requestAnimationFrame((t) => this.loop(t));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => game.init());
  } else {
    game.init();
  }
})();
