/* 美术 · 统一预载：登录阶段就把主城 / 战斗要用的贴图全部下载并烘焙，
   避免点击进入场景后才开始加载，出现黑屏等待 */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};

  // 超时兜底：个别资源异常时也不让玩家一直卡在加载遮罩上
  const TIMEOUT_MS = 20000;

  const state = {
    started: false,
    ready: false,
    percent: 0,
    total: 0,
    done: 0,
    waiters: []
  };
  let timer = null;
  let timeout = null;
  const heroWaiters = [];
  let heroTimer = null;

  // 角色贴图（野蛮人由头/身体/武器等图片拼装）也要纳入就绪判定，
  // 否则刚进场景时会画出没头的角色
  function heroesReady() {
    const list = DG.art.heroes || {};
    return Object.keys(list).every((id) => {
      const h = list[id];
      return !h || !h.ready || h.ready();
    });
  }

  function checkHeroes() {
    if (!heroesReady()) return;
    if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
    const list = heroWaiters.splice(0);
    list.forEach((fn) => {
      try { fn(); } catch (e) { /* 单个回调失败不影响其它 */ }
    });
  }

  function finish() {
    if (state.ready) return;
    state.ready = true;
    state.percent = 100;
    if (timer) { clearInterval(timer); timer = null; }
    if (timeout) { clearTimeout(timeout); timeout = null; }
    const list = state.waiters;
    state.waiters = [];
    list.forEach((fn) => {
      try { fn(); } catch (e) { /* 单个回调失败不影响其它 */ }
    });
  }

  // 进度来自各美术模块自己的缓存：贴图只会下载一次，这里只统计不重复请求
  function measure() {
    const m = DG.art.monsters && DG.art.monsters.stats ? DG.art.monsters.stats() : { total: 0, done: 0 };
    const b = DG.art.bosses && DG.art.bosses.stats ? DG.art.bosses.stats() : { total: 0, done: 0 };
    const terrain = DG.art.terrainDecor && DG.art.terrainDecor.ready && DG.art.terrainDecor.ready() ? 1 : 0;
    const bones = DG.art.bones && DG.art.bones.ready ? 1 : 0;
    const heroes = heroesReady() ? 1 : 0;
    state.total = m.total + b.total + 3;
    state.done = m.done + b.done + terrain + bones + heroes;
    state.percent = state.total ? Math.min(100, Math.round(state.done / state.total * 100)) : 100;
    return state.done >= state.total;
  }

  function preloadAssets() {
    if (state.started) return;
    state.started = true;

    // 先让登录页完成首帧绘制，再开始下载贴图：
    // 贴图总量约 2MB，若在脚本仍未下载完时就开始拉，会和登录背景抢带宽，
    // 反而让首屏更慢（浏览器对每域名只有 6 个并发连接）。
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(begin, 200)));
  }

  function begin() {
    // 全部小怪贴图（内部按 src 去重，并顺带烘焙暗色调 / 白闪）
    if (DG.art.monsters && DG.art.monsters.preload) DG.art.monsters.preload();
    // 全部首领贴图
    if (DG.art.bosses && DG.art.bosses.preload) {
      DG.art.bosses.preload(Object.keys(DG.art.bosses.defs || {}));
    }
    // 地图内路线装饰与地图外黑域装饰图集
    if (DG.art.terrainDecor && DG.art.terrainDecor.load) DG.art.terrainDecor.load();
    // 死亡骨头图集：提前切片，避免首次击杀时卡顿
    if (DG.art.bones && DG.art.bones.load) DG.art.bones.load();

    if (measure()) { finish(); return; }
    timer = setInterval(() => {
      if (measure()) finish();
    }, 120);
    timeout = setTimeout(finish, TIMEOUT_MS);
  }

  DG.art.preloadAssets = preloadAssets;
  DG.art.assetsReady = () => state.ready;
  DG.art.assetsProgress = () => state.percent;
  DG.art.onAssetsReady = (fn) => {
    if (state.ready) { fn(); return; }
    state.waiters.push(fn);
  };
  DG.art.heroesReady = heroesReady;
  DG.art.onHeroesReady = (fn) => {
    if (heroesReady()) { fn(); return; }
    heroWaiters.push(fn);
    if (!heroTimer) heroTimer = setInterval(checkHeroes, 120);
  };
})();
