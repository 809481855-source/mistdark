/* 技能注册表：职业技能定义按角色放在 data/classes/<id>.js，本文件只提供容器与公共工具 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.data = DG.data || {};

  DG.data.skills = DG.data.skills || {};
  DG.data.skillTags = DG.data.skillTags || {};

  // 技能描述里统一的百分比格式化
  DG.data.pct = (v) => `${U.round(v * 100, 0)}%`;

  // 主技能按角色等级解锁：未配置 unlock 的技能默认 1 级可用
  DG.data.skillUnlocked = (char, id) => {
    const sk = DG.data.skills[id];
    if (!sk) return false;
    return !sk.unlock || !char || char.level >= sk.unlock;
  };

  // 依据等级取技能描述；等级为 0 时按 1 级预览
  DG.data.skillDesc = (id, lv) => {
    const sk = DG.data.skills[id];
    if (!sk) return '';
    return sk.desc(Math.max(1, lv));
  };
})();
