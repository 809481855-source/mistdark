/* 屏幕常亮：进入游戏后申请 Wake Lock，避免手机游玩时自动息屏/锁屏 */
(function () {
  const DG = window.DG;
  let sentinel = null;
  let wanted = false;

  function canLock() {
    return !!(navigator.wakeLock && navigator.wakeLock.request);
  }

  function acquire() {
    if (!wanted || sentinel || !canLock()) return;
    // 页面不可见时系统必然拒绝申请，等回到前台再由 visibilitychange 触发
    if (document.visibilityState !== 'visible') return;
    let req;
    try {
      req = navigator.wakeLock.request('screen');
    } catch (e) {
      return;
    }
    if (!req || !req.then) return;
    req.then((s) => {
      sentinel = s;
      // 系统在切后台、省电模式等情况下会主动释放，这里同步状态以便重新申请
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
        if (wanted) setTimeout(acquire, 300);
      });
    }).catch(() => {
      // 浏览器不支持或被省电策略拒绝时静默降级，不影响游戏
      sentinel = null;
    });
  }

  DG.wake = {
    // 进入主城 / 副本等实际游玩界面时调用
    enable() {
      wanted = true;
      acquire();
    },
    // 回到登录页 / 选角页时释放，避免不必要的电量消耗
    disable() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      if (s) {
        try { s.release(); } catch (e) { /* 已释放则忽略 */ }
      }
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      acquire();
    } else {
      // 隐藏期间系统会自动释放；这里只清引用，回到前台再重新申请
      sentinel = null;
    }
  });
})();
