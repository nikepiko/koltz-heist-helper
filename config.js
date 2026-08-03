'use strict';

// -----------------------------------------------------------------------------
// 回収品カタログ
// -----------------------------------------------------------------------------
// キーは「地点番号 + 品目」を基本にし、設定箇所を見ただけで用途が分かるようにします。
// priceValues: 選択可能な金額を列挙します。
// min/max/step: 指定範囲から金額候補を自動生成します。
// iconType: バッグ分類と標準アイコンに使用します。
// icon: 標準アイコンを上書きする場合だけ指定します。
const LOOT_CATALOG = {
  // No.01 / No.27: コカールの卵（両地点で同一価格）
  egg_royal: { name: 'コカールの王家の卵', iconType: 'medium', weight: 20, priceValues: [49000, 50000] },
  egg_magic: { name: 'コカールの魔法の卵', iconType: 'medium', weight: 20, priceValues: [52000] },
  egg_colorful: { name: 'コカールの彩りの卵', iconType: 'medium', weight: 20, priceValues: [54000] },
  egg_abyss: { name: 'コカールの深淵の卵', iconType: 'medium', weight: 20, priceValues: [56000] },
  egg_verdant: { name: 'コカールの新緑の卵', iconType: 'medium', weight: 20, priceValues: [58000] },
  egg_wyvern: { name: 'コカールのワイバーンの卵', iconType: 'medium', weight: 20, priceValues: [60000] },
  egg_forest: { name: 'コカールの森の卵', iconType: 'medium', weight: 20, priceValues: [62000, 64000] },

  // No.02: カルカネット
  spot02_necklace_red_spinel: { name: 'コカールのカルカネット（レッドスピネル）', iconType: 'reinforced', weight: 30, priceValues: [77500, 80000] },
  spot02_necklace_emerald: { name: 'コカールのカルカネット（エメラルド）', iconType: 'reinforced', weight: 30, priceValues: [82500] },
  spot02_necklace_sapphire: { name: 'コカールのカルカネット（サファイア）', iconType: 'reinforced', weight: 30, priceValues: [85000] },
  spot02_necklace_imperial_topaz: { name: 'コカールのカルカネット（インペリアル・トパーズ）', iconType: 'reinforced', weight: 30, priceValues: [87500, 90000] },
  spot02_necklace_yellow_diamond: { name: 'コカールのカルカネット（イエローダイヤモンド）', iconType: 'reinforced', weight: 30, priceValues: [92500] },
  spot02_necklace_tanzanite: { name: 'コカールのカルカネット（タンザナイト）', iconType: 'reinforced', weight: 30, priceValues: [95000, 97500, 100000] },

  // No.03: 馬の像
  spot03_horse_marble_sabino: { icon: 'horse', name: 'マーブルサビーノ・クリオージョ', iconType: 'reinforced', weight: 30, priceValues: [77500, 80000] },
  spot03_horse_cremello: { icon: 'horse', name: 'クレメロ・ダッチウォームブラッド', iconType: 'reinforced', weight: 30, priceValues: [82500, 85000] },
  spot03_horse_gold_turkoman: { icon: 'horse', name: 'ゴールド・トルコマン', iconType: 'reinforced', weight: 30, priceValues: [87500] },
  spot03_horse_silver_dapple: { icon: 'horse', name: 'シルバーダップルピント', iconType: 'reinforced', weight: 30, priceValues: [90000, 92500] },
  spot03_horse_andalusian: { icon: 'horse', name: '佐目毛のアンダルシアン', iconType: 'reinforced', weight: 30, priceValues: [95000, 97500, 100000] },

  spot04_bracelet: { name: 'コカールのブレスレット', iconType: 'small', weight: 10, min: 28000, max: 35000, step: 1000 },
  spot05_painting_blueprint: { name: '確認必須の設計図', iconType: 'painting', weight: 50, min: 140000, max: 162500, step: 2500 },

  // No.06: 豊穣の女神像（No.25とは価格帯が異なるため別定義）
  spot06_goddess_mahogany: { icon: 'goddess', name: '豊穣の女神像（マホガニー）', iconType: 'goddess', weight: 20, priceValues: [70000, 72000, 74000] },
  spot06_goddess_gold: { icon: 'goddess', name: '豊穣の女神像（ゴールド）', iconType: 'goddess', weight: 20, priceValues: [76000, 78000] },
  spot06_goddess_silver: { icon: 'goddess', name: '豊穣の女神像（シルバー）', iconType: 'goddess', weight: 20, priceValues: [80000, 82000, 84000] },
  spot06_goddess_bronze: { icon: 'goddess', name: '豊穣の女神像（ブロンズ）', iconType: 'goddess', weight: 20, priceValues: [86000, 88000] },
  spot06_goddess_ivory: { icon: 'goddess', name: '豊穣の女神像（アイボリー）', iconType: 'goddess', weight: 20, priceValues: [90000, 92000, 94000, 96000] },

  spot07_painting_origin: { name: '大いなる原点回帰', iconType: 'painting', weight: 50, min: 140000, max: 162500, step: 2500 },

  // No.08: 宝石
  spot08_purple_sapphire: { name: 'パープルサファイア', iconType: 'reinforced', weight: 30, priceValues: [100000] },
  spot08_aquamarine: { name: 'アクアマリン', iconType: 'reinforced', weight: 30, priceValues: [102500, 105000] },
  spot08_yellow_topaz: { name: 'イエロートパーズ', iconType: 'reinforced', weight: 30, priceValues: [107500] },
  spot08_tanzanite: { name: 'タンザナイト', iconType: 'reinforced', weight: 30, priceValues: [110000, 112500] },
  spot08_ruby: { name: 'ルビー', iconType: 'reinforced', weight: 30, priceValues: [115000, 117500] },
  spot08_emerald: { name: 'エメラルド', iconType: 'reinforced', weight: 30, priceValues: [120000] },
  spot08_gray_spinel: { name: 'グレースピネル', iconType: 'reinforced', weight: 30, priceValues: [122500, 125000, 127500] },

  spot09_meteor_fragment: { icon: 'meteor', name: 'いん石破片', iconType: 'meteor', weight: 20, min: 70000, max: 96000, step: 2000 },

  // No.10: アルジャーノンのヴィーナス
  spot10_venus_gold: { icon: 'venus', name: 'アルジャーノンのヴィーナス（ゴールド）', iconType: 'venus', weight: 30, priceValues: [100000, 102500] },
  spot10_venus_silver: { icon: 'venus', name: 'アルジャーノンのヴィーナス（シルバー）', iconType: 'venus', weight: 30, priceValues: [105000, 107500] },
  spot10_venus_bronze: { icon: 'venus', name: 'アルジャーノンのヴィーナス（ブロンズ）', iconType: 'venus', weight: 30, priceValues: [110000, 112500] },
  spot10_venus_ivory: { icon: 'venus', name: 'アルジャーノンのヴィーナス（アイボリー）', iconType: 'venus', weight: 30, priceValues: [115000, 117500, 120000] },
  spot10_venus_marble: { icon: 'venus', name: 'アルジャーノンのヴィーナス（マーブル）', iconType: 'venus', weight: 30, priceValues: [122500, 125000, 127500] },

  spot11_deco_circlet: { name: 'アール・デコのサークレット', iconType: 'small', weight: 10, min: 42000, max: 53000, step: 1000 },

  // 絵画は地点番号をキー名へ含め、地図との対応を明示します。
  spot12_painting: { name: 'おしまいだ', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },
  spot13_painting: { name: '開けろ', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },
  spot14_painting: { name: '弱肉強食', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },
  spot15_painting: { name: '統べる者', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },
  spot16_painting: { name: 'オレンジの粉砕', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },

  spot17_deco_ring: { name: 'アール・デコのリング', iconType: 'small', weight: 10, min: 28000, max: 35000, step: 1000 },
  spot18_antique_band: { name: 'アンティークのバンド', iconType: 'small', weight: 10, min: 28000, max: 35000, step: 1000 },
  spot19_antique_ring: { name: 'アンティークのリング', iconType: 'small', weight: 10, min: 28000, max: 35000, step: 1000 },
  spot20_bracelet: { name: 'コカールのブレスレット', iconType: 'small', weight: 10, min: 28000, max: 35000, step: 1000 },
  spot21_painting: { name: '我を見ゆ', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },
  spot22_painting: { name: '公爵夫人', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },
  spot23_painting: { name: '釈明', iconType: 'painting', weight: 50, min: 102500, max: 122500, step: 2500 },
  spot24_pharaoh_bangle: { name: 'ファラオのバングル', iconType: 'small', weight: 10, min: 28000, max: 35000, step: 1000 },

  // No.25: 豊穣の女神像（No.06とは別価格）
  spot25_goddess_mahogany: { icon: 'goddess', name: '豊穣の女神像（マホガニー）', iconType: 'goddess', weight: 20, priceValues: [49000, 50000] },
  spot25_goddess_gold: { icon: 'goddess', name: '豊穣の女神像（ゴールド）', iconType: 'goddess', weight: 20, priceValues: [52000, 54000] },
  spot25_goddess_silver: { icon: 'goddess', name: '豊穣の女神像（シルバー）', iconType: 'goddess', weight: 20, priceValues: [56000] },
  spot25_goddess_bronze: { icon: 'goddess', name: '豊穣の女神像（ブロンズ）', iconType: 'goddess', weight: 20, priceValues: [58000, 60000] },
  spot25_goddess_ivory: { icon: 'goddess', name: '豊穣の女神像（アイボリー）', iconType: 'goddess', weight: 20, priceValues: [62000, 64000] },

  // No.26: メメント・ノン・モリ
  spot26_memento_emerald: { name: 'メメント・ノン・モリ（エメラルド）', iconType: 'skull', weight: 30, priceValues: [77500, 80000] },
  spot26_memento_ruby: { name: 'メメント・ノン・モリ（ルビー）', iconType: 'skull', weight: 30, priceValues: [82500] },
  spot26_memento_gold: { name: 'メメント・ノン・モリ（ゴールド）', iconType: 'skull', weight: 30, priceValues: [85000] },
  spot26_memento_amethyst: { name: 'メメント・ノン・モリ（アメジスト）', iconType: 'skull', weight: 30, priceValues: [87500, 90000] },
  spot26_memento_sapphire: { name: 'メメント・ノン・モリ（サファイア）', iconType: 'skull', weight: 30, priceValues: [92500] },
  spot26_memento_diamond: { name: 'メメント・ノン・モリ（ダイヤモンド）', iconType: 'skull', weight: 30, priceValues: [95000, 97500, 100000] },

  spot28_byzantine_hoops: { name: 'ビザンチンのフープス', iconType: 'small', weight: 10, min: 28000, max: 35000, step: 1000 },

  // 金庫室 No.29〜32: 地点ごとに作品名が固定
  spot29_vault_painting: { name: '友という名の', iconType: 'painting', weight: 50, min: 70000, max: 92500, step: 2500 },
  spot30_vault_painting: { name: '黄金の子犬', iconType: 'painting', weight: 50, min: 70000, max: 92500, step: 2500 },
  spot31_vault_painting: { name: '束縛なき情愛の習作', iconType: 'painting', weight: 50, min: 70000, max: 92500, step: 2500 },
  spot32_vault_painting: { name: 'ハンターがはく製になる', iconType: 'painting', weight: 50, min: 70000, max: 92500, step: 2500 },

  // No.34: アルファメール変装時のみ最適化候補へ入る搬入トラック
  spot34_delivery_truck_loot: { name: '略奪品', iconType: 'cargo', weight: 30, min: 105000, max: 140000, step: 5000 }
};

// -----------------------------------------------------------------------------
// 攻略資料の地点番号ごとの出現候補
// -----------------------------------------------------------------------------
const LOOT_OPTIONS_BY_SPOT_NUMBER = {
  1: ['egg_royal','egg_magic','egg_colorful','egg_abyss','egg_verdant','egg_wyvern','egg_forest'],
  2: ['spot02_necklace_red_spinel','spot02_necklace_emerald','spot02_necklace_sapphire','spot02_necklace_imperial_topaz','spot02_necklace_yellow_diamond','spot02_necklace_tanzanite'],
  3: ['spot03_horse_marble_sabino','spot03_horse_cremello','spot03_horse_gold_turkoman','spot03_horse_silver_dapple','spot03_horse_andalusian'],
  4: ['spot04_bracelet'],
  5: ['spot05_painting_blueprint'],
  6: ['spot06_goddess_mahogany','spot06_goddess_gold','spot06_goddess_silver','spot06_goddess_bronze','spot06_goddess_ivory'],
  7: ['spot07_painting_origin'],
  8: ['spot08_purple_sapphire','spot08_aquamarine','spot08_yellow_topaz','spot08_tanzanite','spot08_ruby','spot08_emerald','spot08_gray_spinel'],
  9: ['spot09_meteor_fragment'],
  10: ['spot10_venus_gold','spot10_venus_silver','spot10_venus_bronze','spot10_venus_ivory','spot10_venus_marble'],
  11: ['spot11_deco_circlet'],
  12: ['spot12_painting'], 13: ['spot13_painting'], 14: ['spot14_painting'],
  15: ['spot15_painting'], 16: ['spot16_painting'], 17: ['spot17_deco_ring'],
  18: ['spot18_antique_band'], 19: ['spot19_antique_ring'], 20: ['spot20_bracelet'],
  21: ['spot21_painting'], 22: ['spot22_painting'], 23: ['spot23_painting'],
  24: ['spot24_pharaoh_bangle'],
  25: ['spot25_goddess_mahogany','spot25_goddess_gold','spot25_goddess_silver','spot25_goddess_bronze','spot25_goddess_ivory'],
  26: ['spot26_memento_emerald','spot26_memento_ruby','spot26_memento_gold','spot26_memento_amethyst','spot26_memento_sapphire','spot26_memento_diamond'],
  27: ['egg_royal','egg_magic','egg_colorful','egg_abyss','egg_verdant','egg_wyvern','egg_forest'],
  28: ['spot28_byzantine_hoops']
};

// -----------------------------------------------------------------------------
// 地図内部IDと攻略資料上の地点番号・階層名
// -----------------------------------------------------------------------------
const SPOT_REFERENCE_NUMBERS = {
  '2f-01': 1,  '2f-02': 2,  '2f-03': 3,  '2f-04': 4,
  '2f-05': 7,  '2f-06': 5,  '2f-07': 6,  '2f-08': 8,
  '2f-09': 9,  '2f-10': 10, '2f-11': 11, '2f-12': 12, '2f-13': 13,

  '1f-01': 25, '1f-02': 19, '1f-03': 17, '1f-04': 18,
  '1f-05': 15, '1f-06': 14, '1f-07': 16, '1f-08': 21,
  '1f-09': 20, '1f-10': 22, '1f-11': 23, '1f-12': 24,

  'b1-01': 28, 'b1-02': 27, 'b1-03': 26,
  'vault-p1': 29, 'vault-p2': 30, 'vault-p3': 31, 'vault-p4': 32,
  'vault-main': 33, 'vault-truck': 34
};

const SPOT_REFERENCE_FLOORS = {
  ...Object.fromEntries(Object.keys(SPOT_REFERENCE_NUMBERS).filter(id => id.startsWith('2f-')).map(id => [id, '3F'])),
  ...Object.fromEntries(Object.keys(SPOT_REFERENCE_NUMBERS).filter(id => id.startsWith('1f-')).map(id => [id, '2F'])),
  ...Object.fromEntries(Object.keys(SPOT_REFERENCE_NUMBERS).filter(id => id.startsWith('b1-')).map(id => [id, '1F'])),
  'vault-p1': '金庫室', 'vault-p2': '金庫室', 'vault-p3': '金庫室', 'vault-p4': '金庫室',
  'vault-main': '金庫室', 'vault-truck': '搬入トラック'
};

// 地図内部IDから、その地点で選べるカタログIDを引けるようにします。
const SPOT_LOOT_OPTIONS = Object.fromEntries(
  Object.entries(SPOT_REFERENCE_NUMBERS).map(([spotId, spotNumber]) => {
    if (spotId === 'vault-main') return [spotId, []];
    if (spotId === 'vault-truck') return [spotId, ['spot34_delivery_truck_loot']];
    if (spotId === 'vault-p1') return [spotId, ['spot29_vault_painting']];
    if (spotId === 'vault-p2') return [spotId, ['spot30_vault_painting']];
    if (spotId === 'vault-p3') return [spotId, ['spot31_vault_painting']];
    if (spotId === 'vault-p4') return [spotId, ['spot32_vault_painting']];
    return [spotId, LOOT_OPTIONS_BY_SPOT_NUMBER[spotNumber] || []];
  })
);

// メインターゲット。easyBase / hardBase から週内初回（4倍）・未発覚（3倍）・発覚（0.75倍）を計算します。
const MAIN_TARGETS = [
  ['デルニエール・デボージュ',481250,529375], ['努力の成果',365000,401500], ['我が近接攻撃',317000,348700],
  ['メロンについての考察',316000,347600], ['死が二人をわかつまで',315500,347050], ['信用',315000,346500],
  ['シャウエッセン',314500,345950], ['曲がりくねった家路',314000,345400], ['みなぎる果汁',313500,344850],
  ['行き過ぎた成功',313000,344300], ['生殺し',312500,343750], ['アイ、フルーツ',312000,343200],
  ['スタックの研究V',311500,342650], ['異なる双子',311000,342100], ['パンプキン',310500,341550],
  ['チャット・オン・フルーツ',310000,341000], ['真珠の首飾り少女',309500,340450], ['冬、目的地なし',309000,339900],
  ['声が聞こえる',308500,339350], ['絞り尽くされた肉体',308000,338800], ['息をのむ',307500,338250],
  ['トゥルー・ラヴ',307000,337700], ['満開の後',306500,337150], ['人々のスケッチ',306000,336600],
  ['ブラザー・ブラザー',305500,336050], ['ローマの堕落',305000,335500], ['黙想中の長い耳',304500,334950]
].map(([name,easyBase,hardBase], index) => ({ id:`main-${index+1}`, name, easyBase, hardBase }));


const SPOT_TYPES = Object.fromEntries(
  Object.entries(SPOT_REFERENCE_NUMBERS).map(([id, no]) => {
    if (id === 'vault-main') return [id, 'main'];
    if (id === 'vault-truck') return [id, 'cargo'];
    if (id.startsWith('vault-p')) return [id, 'painting'];
    const firstItemId = (LOOT_OPTIONS_BY_SPOT_NUMBER[no] || [])[0];
    return [id, firstItemId ? (LOOT_CATALOG[firstItemId].icon || LOOT_CATALOG[firstItemId].iconType) : 'none'];
  })
);
