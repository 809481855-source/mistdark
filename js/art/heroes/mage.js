/* 角色美术 · 术士：法杖 + 奥术宝石 */
(function () {
  const DG = window.DG;

  DG.art.registerHero('mage', {
    id: 'mage',
    mode: 'svg',
    svg(cls) {
      const accent = cls.color;
      const weapon = `
        <path d="M206 200 L242 246 L230 260 L196 218 Z" fill="#3b414d"/>
        <path d="M258 166 L266 452" stroke="#6b5334" stroke-width="7" stroke-linecap="round"/>
        <circle cx="259" cy="138" r="32" fill="${accent}" opacity=".18"/>
        <circle cx="259" cy="138" r="19" fill="${accent}" opacity=".8"/>
        <circle cx="259" cy="138" r="9" fill="#eef3ff" opacity=".9"/>`;
      return DG.art.buildHeroSvg(cls, weapon);
    }
  });
})();
