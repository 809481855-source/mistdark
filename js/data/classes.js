/* 职业注册表：新增角色只需在 data/classes/ 下新建一个文件并调用 registerClass */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.data.classes = {};
  DG.data.classList = [];

  // 功能图标：技能书等全职业共用（common）；装备图标按职业一一对应，放在 assets/ui/<职业id>/
  DG.data.commonIcons = {
    skill: 'assets/ui/common/func-skill.png'
  };

  // 取某个职业的功能图标：该职业有专属图就用专属图，否则回落到公共图
  DG.data.iconFor = function (clsId, key) {
    const cls = DG.data.classes[clsId];
    if (cls && cls.icons && cls.icons[key]) return cls.icons[key];
    return DG.data.commonIcons[key] || '';
  };

  /**
   * 注册一个可选角色。
   * @param {object} def   职业基础定义（id/name/base/skills/starterWeapon 等）
   * @param {object} parts 该角色独占内容：skills / skillTags / talents
   */
  DG.data.registerClass = function (def, parts) {
    if (!def || !def.id) throw new Error('registerClass 缺少职业 id');
    DG.data.classes[def.id] = def;
    DG.data.classList.push(def.id);
    if (parts) {
      if (parts.skills) Object.assign(DG.data.skills, parts.skills);
      if (parts.skillTags) Object.assign(DG.data.skillTags, parts.skillTags);
      if (parts.talents) DG.data.talents[def.id] = parts.talents;
    }
    return def;
  };
})();
