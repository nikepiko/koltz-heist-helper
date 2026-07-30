'use strict';

// 地点ごとのターゲット種類。
// 使用可能な値: painting / medium / small / reinforced / main
// このファイルを書き換えるだけで、アイコン・バッグ重量・最適化へ反映されます。
const SPOT_TYPES = {
  // ===== 2F =====
  '2f-01': 'medium',
  '2f-02': 'medium',
  '2f-03': 'medium',
  '2f-04': 'small',
  '2f-05': 'painting',
  '2f-06': 'painting',
  '2f-07': 'medium',
  '2f-08': 'reinforced',
  '2f-09': 'medium',
  '2f-10': 'medium',
  '2f-11': 'small',
  '2f-12': 'painting',
  '2f-13': 'painting',

  // ===== 1F（仮設定: 全地点 small） =====
  '1f-01': 'medium',
  '1f-02': 'small',
  '1f-03': 'small',
  '1f-04': 'small',
  '1f-05': 'painting',
  '1f-06': 'painting',
  '1f-07': 'painting',
  '1f-08': 'painting',
  '1f-09': 'small',
  '1f-10': 'painting',
  '1f-11': 'painting',
  '1f-12': 'painting',

  // ===== B1 =====
  'b1-01': 'small',
  'b1-02': 'medium',
  'b1-03': 'reinforced',

  // ===== 金庫室 =====
  'vault-main': 'main',
  'vault-p1': 'painting',
  'vault-p2': 'painting',
  'vault-p3': 'painting',
  'vault-p4': 'painting'
};

// 中型ターゲットのバッグ使用率。必要になった場合だけ変更してください。
const MEDIUM_WEIGHT = 25;
