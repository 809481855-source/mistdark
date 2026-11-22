/* 登录场景 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  // 记住密码：本地做一次 base64 编码，避免以明文形式躺在 localStorage 里
  const KEY_REMEMBER = 'mistdark_remember_pass';
  const KEY_PASS = 'mistdark_saved_pass';
  const enc = (s) => {
    try {
      const bytes = new TextEncoder().encode(s);
      let bin = '';
      bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin);
    } catch (e) { return ''; }
  };
  const dec = (s) => {
    try {
      const bin = atob(s);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) { return ''; }
  };

  DG.scenes.login = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('login');
      const screen = U.el('div', 'screen login-screen ui-kit');
      screen.innerHTML = `
        <div class="ui-mask login-mask"></div>
        <section class="ui-dialog login-dialog" role="dialog" aria-label="登录游戏">
          <div class="ui-dialog-title">登录游戏</div>
          <div class="ui-inset login-inset">
            <div class="ui-label login-label-account">账号</div>
            <input id="login-name" class="ui-input login-input-account" type="text"
                   maxlength="12" autocomplete="off" placeholder="角色名字">
            <div class="ui-label login-label-pass">密码</div>
            <input id="login-pass" class="ui-input login-input-pass" type="password"
                   inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" placeholder="输入数字">
            <label class="ui-check login-remember">
              <input id="login-remember" type="checkbox">
              <span class="ui-check-box"></span>
              <span class="ui-check-tick"></span>
              <span class="ui-check-text">记住密码，仅保持本机浏览器</span>
            </label>
          </div>
          <button class="ui-btn ui-btn-brown login-btn-register" id="btn-register" type="button"><span>注册</span></button>
          <button class="ui-btn ui-btn-red login-btn-login" id="btn-login" type="button"><span>登录</span></button>
        </section>`;

      root.replaceChildren(screen);

      const nameEl = screen.querySelector('#login-name');
      const passEl = screen.querySelector('#login-pass');
      const rememberEl = screen.querySelector('#login-remember');

      try {
        const last = localStorage.getItem('mistdark_last_account');
        if (last) nameEl.value = last;
        if (localStorage.getItem(KEY_REMEMBER) === '1') {
          const saved = dec(localStorage.getItem(KEY_PASS) || '');
          if (saved) {
            passEl.value = saved;
            rememberEl.checked = true;
          }
        }
      } catch (e) { /* 忽略 */ }

      // 密码只接受数字：输入时直接过滤掉非数字字符，中文输入法也一并拦截
      passEl.addEventListener('input', () => {
        const clean = passEl.value.replace(/\D/g, '').slice(0, 12);
        if (clean !== passEl.value) passEl.value = clean;
      });

      const showErr = (msg) => {
        if (msg && DG.ui && DG.ui.toast) DG.ui.toast(msg);
      };

      function afterLogin(name) {
        try {
          localStorage.setItem('mistdark_last_account', name);
          if (rememberEl.checked && passEl.value) {
            localStorage.setItem(KEY_REMEMBER, '1');
            localStorage.setItem(KEY_PASS, enc(passEl.value));
          } else {
            localStorage.removeItem(KEY_REMEMBER);
            localStorage.removeItem(KEY_PASS);
          }
        } catch (e) { /* 忽略 */ }
        DG.game.setAccount(name);
        DG.game.save();
        DG.game.gotoEntry();
      }

      function doLogin() {
        const name = nameEl.value.trim();
        const pass = passEl.value.replace(/\D/g, '');
        const res = DG.storage.login(DG.game.db, name, pass);
        if (!res.ok) { showErr(res.msg); return; }
        afterLogin(name);
      }

      function doRegister() {
        const name = nameEl.value.trim();
        const pass = passEl.value.replace(/\D/g, '');
        const res = DG.storage.createAccount(DG.game.db, name, pass);
        if (!res.ok) { showErr(res.msg); return; }
        DG.game.save();
        if (DG.ui && DG.ui.toast) DG.ui.toast('注册成功，已自动登录', 'gold');
        afterLogin(name);
      }

      screen.querySelector('#btn-login').addEventListener('click', doLogin);
      screen.querySelector('#btn-register').addEventListener('click', doRegister);
      [nameEl, passEl].forEach(el => {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doLogin();
        });
      });
      // 桌面端自动聚焦方便直接输入；手机上不自动聚焦，避免一进登录页就弹键盘把画面顶小
      if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
        if (!nameEl.value) nameEl.focus();
        else if (!passEl.value) passEl.focus();
        else screen.querySelector('#btn-login').focus();
      }
    }
  };
})();
