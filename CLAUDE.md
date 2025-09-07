# PCAP Nyan - Packet Capture Dodge Game

## プロジェクト概要
ネットワークパケットをリアルタイムでキャプチャし、それを弾幕として避けるゲームです。
Nyan Catを操作してパケット（弾）を避けながら高スコアを目指します。

## 技術スタック
- **フロントエンド**: Phaser.js (HTML5ゲームフレームワーク)
- **バックエンド**: Python (Scapy for packet capture)
- **通信**: WebSocket
- **ビルドツール**: Vite
- **パッケージ管理**: npm, uv (Python)

## セットアップと起動

### 1. 開発サーバーの起動
```bash
# フロントエンド (別ターミナル1)
npm run dev
# http://localhost:3000 でアクセス可能

# バックエンド (別ターミナル2) - 要sudo権限
sudo python3 packet_capture.py
# WebSocketサーバーが ws://localhost:8765 で起動
```

### 2. 依存関係のインストール（初回のみ）
```bash
# JavaScript
npm install

# Python
pip install scapy websockets
# または
uv pip install scapy websockets
```

## ゲームの仕様

### ゲームフロー
1. **START状態**: パケットは表示されるが当たり判定なし
2. **PLAYING状態**: SPACEキーで開始、当たり判定あり
3. **GAME OVER状態**: 被弾で終了、Rキーでリスタート

### 操作方法
- **矢印キー**: 移動
- **Shift**: 低速移動モード（精密回避用）
- **Space**: ゲーム開始
- **R**: リスタート（ゲームオーバー時）

### パケット→弾の変換ルール
- **ポート番号の正規化**: ウェルノウンポート(0-1023)を除外、他を画面幅0-100%に配置
- **プロトコル別の動き**:
  - TCP (赤): 遅め、安定した動き
  - UDP (青): 速い、横に広がる
  - ICMP (緑): 最速、直進
- **特殊パターン**:
  - 素数ポート: ジグザグ移動
  - 偶数ポート: 右寄り移動
  - 奇数ポート: 左寄り移動
- **パケットサイズ**: 弾の大きさ（小・中・大）

### スコアシステム
- 生存時間: 100ミリ秒ごとに10ポイント×難易度
- グレイズボーナス: 弾のニアミスで100ポイント
- 最終スコア = 通常スコア + (生存秒数×100) + (グレイズ数×50)

### 難易度システム
- 8秒ごとに難易度上昇
- 弾速が段階的に増加
- 同時処理パケット数が増加（8→15個）

## ファイル構成

### 主要ファイル
- `src/scenes/DodgeScene.js`: メインゲームシーン
- `src/main.js`: ゲーム初期化とWebSocket管理
- `src/WebSocketManager.js`: WebSocket通信処理
- `packet_capture.py`: パケットキャプチャとWebSocketサーバー
- `index.html`: ゲームのHTMLエントリーポイント

### 設定ファイル
- `package.json`: npm依存関係
- `vite.config.js`: Vite設定
- `pyproject.toml`: Python依存関係

## パフォーマンス設定

### 現在の設定値
- **パケット処理レート**: 33ms間隔（毎秒30パケット）
- **同時弾数上限**: 500個
- **パケットバッファ**: 200個
- **WebSocket更新頻度**: 0.2秒
- **パケット保持時間**: 15秒
- **ログ表示数**: 12件

### 調整可能なパラメータ
```javascript
// DodgeScene.js
this.lastPacketTime < 33  // パケット処理間隔（ミリ秒）
maxPackets = Math.min(8 + this.difficulty * 2, 15)  // 同時処理数
maxSize: 500  // 弾グループの最大容量

// packet_capture.py
deque(maxlen=200)  // パケットバッファサイズ
await asyncio.sleep(0.2)  // WebSocket更新間隔
current_time - packet['timestamp'] > 15  // パケット保持時間
```

## トラブルシューティング

### パケットキャプチャが動作しない
```bash
# 管理者権限で実行
sudo python3 packet_capture.py

# インターフェース名を確認して変更
# packet_capture.py の188行目
self.start_capture(interface='en0')  # macOSのデフォルト
# Linuxの場合は 'eth0' や 'wlan0' など
```

### WebSocket接続エラー
```bash
# ポート8765が使用中か確認
lsof -i :8765
# 使用中のプロセスを終了
kill -9 [PID]
```

### ゲームが重い場合
- `maxPackets` を減らす（DodgeScene.js 292行目）
- `maxSize` を減らす（DodgeScene.js 41行目）
- パケット処理間隔を増やす（DodgeScene.js 279行目）

## 開発のヒント

### デバッグモード
```javascript
// DodgeScene.js に追加
console.log('Packet received:', data);  // パケットデータ確認
this.hitboxIndicator.setVisible(true);  // 常に当たり判定表示
```

### パケットフィルタリング
```python
# packet_capture.py でフィルタ追加
if packet.haslayer(TCP) and packet[TCP].dport == 443:
    # HTTPS通信のみ処理
```

### 新しい弾パターン追加
```javascript
// DodgeScene.js のcreatePacketBullet()内
case 'NEW_PATTERN':
    vy = 100;
    vx = Math.sin(this.time.now * 0.01) * 50;
    break;
```

## よくある質問

**Q: パケットが流れてこない**
A: 
1. `sudo`で実行しているか確認
2. ネットワークインターフェース名を確認
3. 別タブでWebサイトを開いてトラフィックを生成

**Q: 難易度を調整したい**
A: `DodgeScene.js`の以下を変更:
- 214行目: `delay: 8000` → 難易度上昇間隔
- 342行目: `vy * (1 + this.difficulty * 0.15)` → 速度増加率

**Q: パケットログが見づらい**
A: `this.maxLogs = 12` を増減して表示数を調整（13行目）

## 今後の拡張アイデア
- [ ] スコアランキング機能
- [ ] 異なるキャラクター選択
- [ ] パワーアップアイテム
- [ ] ボス戦（特定IPからの集中攻撃）
- [ ] マルチプレイヤーモード
- [ ] パケット統計表示
- [ ] リプレイ機能

## WebSocket通信仕様

マルチプレイヤー対応のWebSocket通信仕様は `websocket-spec.md` に定義されています。
全ての開発者はこの仕様に従って実装してください。

### 重要な仕様
- **Hub WebSocketサーバー**: ポート8766
- **自動検索**: マルチキャスト 224.0.0.251:5353
- **メッセージ形式**: JSON (UTF-8)
- **更新レート**: 30fps (game_state)
- **サービス名**: `_pcap-nyan-hub._tcp.local`

### 実装時の参照
- TypeScript型定義: `websocket-spec.md#typescript型定義`
- Python型定義: `websocket-spec.md#python型定義`
- メッセージフロー: `websocket-spec.md#メッセージフロー`
- エラーコード: `websocket-spec.md#エラーコード`

## ライセンス
このプロジェクトは学習・研究目的で作成されています。
パケットキャプチャ機能は適切な権限と環境でのみ使用してください。