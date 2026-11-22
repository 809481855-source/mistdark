/* 开始界面：登录成功后进入，点击「开始游戏」再进入选角 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  DG.scenes.entry = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('login');
      const screen = U.el('div', 'screen entry-screen');
      // 不套卡片框：只留两颗按钮浮在插画上
      screen.innerHTML = `
        <div class="entry-actions">
          <button class="btn primary entry-start" id="btn-start">开 始 游 戏</button>
          <button class="btn ghost entry-switch" id="btn-switch">切换账号</button>
        </div>
        <div class="login-version">基础框架 v0.1</div>`;

      root.replaceChildren(screen);

      screen.querySelector('#btn-start').addEventListener('click', () => DG.game.gotoCharacter());
      screen.querySelector('#btn-switch').addEventListener('click', () => DG.game.logout());
    }
  };
})();
