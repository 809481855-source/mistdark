/* 角色美术注册表：每个角色在 art/heroes/<id>.js 内独立注册绘制方式
 * 注册项字段：
 *   mode        'svg' | 'canvas'
 *   svg(cls)    SVG 立绘（mode=svg）
 *   canvasDraw  canvas 立绘 / 待机动画（mode=canvas）
 *   battle(ctx, player, scene)  战斗内绘制（可选）
 *   battleAura(ctx, player, scene) 战斗内被动特效（可选）
 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.art = DG.art || {};
  DG.art.heroes = DG.art.heroes || {};

  DG.art.registerHero = function (id, def) {
    DG.art.heroes[id] = def;
    return def;
  };

  DG.art.heroFor = function (id) {
    return DG.art.heroes[id] || null;
  };

  // 全职业走路腿部动作唯一基准（以野蛮人为准）：
  // 两腿先向身体中线收拢并成平行"筷子状"，再左右交替大幅越过中线交叉迈步。
  // ph 为走路相位；centerL / centerR 为各角色腿位对齐中线所需的水平平移量。
  // 返回：legLX/legRX 水平位移、legL/legR 大腿旋转、legLY/legRY 抬脚高度（负值 = 离地）。
  DG.art.walkLegPose = function (ph, centerL, centerR) {
    const stride = Math.sin(ph || 0);
    const lc = Math.cos(ph || 0);
    return {
      legLX: (centerL == null ? 23 : centerL) + stride * 18,
      legRX: (centerR == null ? -10 : centerR) - stride * 18,
      legL: -stride * 0.22,
      legR: stride * 0.22,
      legLY: -Math.max(0, lc) * 6,
      legRY: -Math.max(0, -lc) * 6
    };
  };

  // 通用矢量立绘：身体与配色固定，武器由各角色模块传入
  DG.art.buildHeroSvg = function (cls, weapon) {
    const accent = cls.color;
    return `
    <svg class="hero-svg" viewBox="0 0 340 520" role="img" aria-label="${U.escapeHtml(cls.name)}形象">
      <ellipse cx="170" cy="490" rx="98" ry="16" fill="rgba(0,0,0,.55)"/>
      <path d="M126 180 C 100 280, 100 380, 112 452 L 228 452 C 240 380, 240 280, 214 180 Z"
            fill="${accent}" opacity=".16"/>
      <path d="M146 340 L140 466 L164 466 L168 342 Z" fill="#23262d"/>
      <path d="M174 340 L178 466 L202 466 L198 340 Z" fill="#262a32"/>
      <path d="M136 458 L164 458 L164 478 L130 478 Z" fill="#14161b"/>
      <path d="M176 458 L204 458 L210 478 L176 478 Z" fill="#14161b"/>
      <path d="M128 168 C 120 210, 122 270, 132 342 L 208 342 C 218 270, 220 210, 212 168 Z" fill="#353b46"/>
      <path d="M142 190 L198 190 L206 262 L170 300 L134 262 Z" fill="${accent}" opacity=".5"/>
      <path d="M142 190 L134 262 L170 300 L206 262 L198 190" fill="none" stroke="rgba(201,162,95,.6)" stroke-width="1.6"/>
      <path d="M118 178 C 114 150, 140 138, 156 144 L 156 170 Z" fill="#454c59"/>
      <path d="M222 178 C 226 150, 200 138, 184 144 L 184 170 Z" fill="#4a5160"/>
      <rect x="160" y="150" width="20" height="24" fill="#d9c8ad"/>
      <circle cx="170" cy="118" r="34" fill="#d9c8ad"/>
      <path d="M134 118 C 132 84, 208 84, 206 118 L 206 102 C 198 80, 142 80, 134 102 Z" fill="#1e2128"/>
      <rect x="142" y="112" width="56" height="9" fill="rgba(0,0,0,.22)"/>
      <ellipse cx="158" cy="132" rx="4" ry="5" fill="#2b2b30"/>
      <ellipse cx="182" cy="132" rx="4" ry="5" fill="#2b2b30"/>
      <path d="M164 146 Q170 150 176 146" stroke="rgba(70,58,50,.75)" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="170" cy="212" r="7" fill="${accent}"/>
      ${weapon || ''}
    </svg>`;
  };

  // 兼容旧调用：按职业 id 取 SVG 立绘
  DG.art.heroSvg = function (cls) {
    const hero = cls && DG.art.heroes[cls.id];
    return hero && hero.svg ? hero.svg(cls) : '';
  };
})();
