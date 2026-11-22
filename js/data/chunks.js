/* 地块库：模块化秘境地图块
   每块固定 18×32 格（TILE=40 → 720×1280），比战斗镜头视野更大，
   保证房间与走廊有充足的走位空间（参考《迷雾大陆》的地块比例）。
   地图按 6×3 网格拼贴（整体 4320×3840，近方形），块与块之间的接口
   由地块在网格中的位置决定（左右固定在中线、上下固定在正中），
   path 为主通路折线，branches 为支路，rooms 为开阔区域（椭圆）。 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.data.chunks = {
    W: 18,
    H: 32,
    // 主体块（按 weight 加权抽取）
    list: [
      {
        id: 'entrance', weight: 0, tags: ['room'],
        left: null, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [{ x: 8, y: 16, rx: 8.2, ry: 14.2 }]
      },
      {
        id: 'straight', weight: 10, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: []
      },
      {
        id: 'straight_wave', weight: 8, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [5, 14.5], [11, 17.5], [18, 16]],
        rooms: []
      },
      {
        id: 'bend_up', weight: 7, tags: ['corridor'],
        left: 18, right: 14,
        path: [[0, 18], [5, 18], [11, 14], [18, 14]],
        rooms: []
      },
      {
        id: 'bend_down', weight: 7, tags: ['corridor'],
        left: 14, right: 18,
        path: [[0, 14], [5, 14], [11, 18], [18, 18]],
        rooms: []
      },
      {
        // 上下蛇形：来回折返路线太长，暂不参与随机（保留定义备查）
        id: 'weave_up', weight: 0, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [5, 16], [9, 6], [13, 16], [18, 16]],
        rooms: []
      },
      {
        id: 'weave_down', weight: 0, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [5, 16], [9, 26], [13, 16], [18, 16]],
        rooms: []
      },
      {
        // 回型：中间保留一整块实心岩体，左右接口各通向两条环道，可自选绕行方向
        id: 'loop', weight: 5, tags: ['room', 'loop'],
        left: 16, right: 16,
        path: null,
        rings: [{ x: 9, y: 16, rx: 9.2, ry: 13.4, t: 6.8 }],
        anchor: [9, 5.6],
        rooms: []
      },
      {
        // 交叉：横向主路与窄纵向支路十字相交，上下各接一间边房
        id: 'crossroad', weight: 5, tags: ['junction', 'room', 'cross'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]], branchR: 4.2,
        branches: [[[9, 16], [9, 4.8]], [[9, 16], [9, 27.2]]],
        rooms: [
          { x: 9, y: 4.6, rx: 6.4, ry: 4.0 },
          { x: 9, y: 27.4, rx: 6.6, ry: 4.0 }
        ]
      },
      {
        // 密室：主路折出窄支路通往独立大房间，留给精英守卫
        id: 'secret_vault', weight: 0, tags: ['room', 'secret'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]], branchR: 3.2,
        branches: [[[5, 16], [5, 7]]],
        rooms: [{ x: 5, y: 4.8, rx: 5.8, ry: 4.6 }]
      },
      {
        id: 'room_small', weight: 9, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [{ x: 9, y: 16, rx: 8.2, ry: 14.0 }]
      },
      {
        id: 'room_large', weight: 6, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [{ x: 9, y: 16, rx: 8.7, ry: 15.5 }]
      },
      {
        id: 'room_double', weight: 5, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [
          { x: 6.5, y: 9, rx: 7.2, ry: 6.8 },
          { x: 11.5, y: 23, rx: 7.2, ry: 6.8 }
        ]
      },
      {
        id: 'junction_up', weight: 4, tags: ['junction'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        branches: [[[9, 16], [9, 6]]],
        rooms: [{ x: 9, y: 6, rx: 6.4, ry: 6.2 }]
      },
      {
        id: 'junction_down', weight: 4, tags: ['junction'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        branches: [[[9, 16], [9, 26]]],
        rooms: [{ x: 9, y: 26, rx: 6.4, ry: 6.2 }]
      },
      {
        id: 'alcove', weight: 5, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        branches: [[[4.5, 16], [4.5, 9]]],
        rooms: [{ x: 4.5, y: 8.5, rx: 5.2, ry: 5.6 }]
      }
    ],
    // 首领场地块：固定在右下角，房间几乎铺满整块，开阔到足以绕首领走位
    arena: {
      id: 'arena', weight: 0, tags: ['arena'],
      left: 16, right: null,
      path: [[0, 16], [6, 16]],
      rooms: [{ x: 10, y: 16, rx: 8.8, ry: 15.7 }]
    }
  };
  // 支路默认宽度（半径，格）；密室等特殊块可单独指定 branchR
  DG.data.chunks.branchR = 4.8;
})();
