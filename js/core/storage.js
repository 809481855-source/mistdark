/* 本地存档：账号 / 角色数据（localStorage） */
(function () {
  const DG = window.DG;
  const KEY = 'mistdark_save_v1';

  const emptyDB = () => ({ version: 1, accounts: {} });

  const storage = DG.storage = {
    KEY,
    available: true,

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return emptyDB();
        const db = JSON.parse(raw);
        if (!db || typeof db !== 'object' || !db.accounts) return emptyDB();
        return db;
      } catch (e) {
        storage.available = false;
        console.warn('[存档] 读取失败，本次使用临时存档', e);
        return emptyDB();
      }
    },

    save(db) {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
        return true;
      } catch (e) {
        storage.available = false;
        console.warn('[存档] 写入失败，本次进度仅在页面内有效', e);
        return false;
      }
    },

    getAccount(db, name) {
      return (db.accounts && db.accounts[name]) || null;
    },

    validateName(name) {
      if (!name) return '请输入账号';
      if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,12}$/.test(name)) return '账号需 2-12 位字母 / 数字 / 下划线 / 中文';
      return '';
    },

    createAccount(db, name, pass) {
      const nameErr = storage.validateName(name);
      if (nameErr) return { ok: false, msg: nameErr };
      if (!/^\d{3,12}$/.test(pass || '')) return { ok: false, msg: '密码需为 3-12 位数字' };
      if (db.accounts[name]) return { ok: false, msg: '该账号已存在，可直接登录' };
      db.accounts[name] = {
        password: pass,
        createdAt: Date.now(),
        characters: [null, null, null],
        activeChar: 0
      };
      return { ok: true };
    },

    login(db, name, pass) {
      if (!name) return { ok: false, msg: '请输入账号' };
      const acc = storage.getAccount(db, name);
      if (!acc) return { ok: false, msg: '账号不存在，请先注册' };
      if (acc.password !== pass) return { ok: false, msg: '密码错误' };
      // 兼容旧存档
      if (!Array.isArray(acc.characters)) acc.characters = [null, null, null];
      while (acc.characters.length < 3) acc.characters.push(null);
      return { ok: true, account: acc };
    }
  };
})();
