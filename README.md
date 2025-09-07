# PCAP Nyan - Packet Capture Dodge Game 🐱🌈

ネットワークパケットをリアルタイムでキャプチャし、それを弾幕として避けるゲームです。
Nyan Catを操作してパケット（弾）を避けながら高スコアを目指します。

## 特徴

- **リアルタイムパケット弾幕**: ネットワークトラフィックが弾丸に変換
- **プロトコル別パターン**: TCP/UDP/ICMPで異なる弾道と速度
- **難易度システム**: 経験値で難易度が上昇
- **グレイズボーナス**: ニアミスでボーナスポイント獲得
- **WebSocketリアルタイム通信**: パケット情報をブラウザにリアルタイム配信

## 技術スタック

- **フロントエンド**: Phaser.js (HTML5ゲームフレームワーク)
- **バックエンド**: 
  - Hub Server: WebSocketによるゲーム状態管理・配信
  - Packet Client: Scapyによるパケットキャプチャ
- **通信**: WebSocket (Hub: 8766, パケット配信: 8765)
- **ビルドツール**: Vite
- **パッケージ管理**: npm (JavaScript), uv (Python)

## 必要な環境

- Node.js 16+
- Python 3.8+ (uv経由でインストール)
- uv (Pythonパッケージマネージャー)
- 管理者権限（パケットキャプチャのため）
- モダンブラウザ（Chrome/Firefox/Safari推奨）

## セットアップ

### 1. 依存関係のインストール
```bash
# JavaScript
npm install

# Python (uvを使用)
uv pip install scapy websockets
# uvがない場合はインストール
curl -LsSf https://astral.sh/uv/install.sh | sh

# or brew
brew install uv
```

### 2. ゲームサーバーの起動

#### フロントエンド起動
```bash
# ターミナル1: ゲーム画面
npm run dev
# ブラウザで http://localhost:3000 を開く
```

#### Hubサーバー起動
```bash
# ターミナル2: ゲーム状態管理サーバー
uv run python packet_hub.py
# WebSocket Hubが ws://localhost:8766 で待機
```

### 3. パケット弾幕への参加（ローカルユーザー）

各ユーザーが自分のマシンでパケットキャプチャクライアントを起動することで、
ネットワークトラフィックがゲーム内の弾幕として共有されます。

```bash
# ターミナル3: あなたのパケットを弾幕として送信
uv run python packet_capture_client.py
# 自分のネットワークトラフィックがリアルタイムで弾幕に変換される
```

**注意**: そのままで起動できない場合はsudoをつけてください。
複数のユーザーが同時に参加可能で、それぞれのトラフィックが異なる弾幕パターンを生成します。

## 遊び方

### 操作方法
- **矢印キー**: 上下左右に移動
- **Shift**: 低速移動モード（精密回避用）
- **Space**: ゲーム開始
- **R**: リスタート（ゲームオーバー時）

### ゲームフロー
1. **START状態**: パケットは表示されるが当たり判定なし
2. **PLAYING状態**: SPACEキーで開始、当たり判定あり
3. **GAME OVER状態**: 被弾で終了、Rキーでリスタート

## パケット→弾の変換ルール

### プロトコル別の特性
- 🔴 **TCP** (赤): 遅め、安定した動き
- 🔵 **UDP** (青): 速い、横に広がる弾道
- 🟢 **ICMP** (緑): 最速、直進
- ⚫ **その他** (グレー): 標準的な動き

### 特殊パターン
- **素数ポート**: ジグザグ移動
- **偶数ポート**: 右寄り移動
- **奇数ポート**: 左寄り移動
- **パケットサイズ**: 弾の大きさに反映（小・中・大）

## スコアシステム

- **生存時間**: 100ミリ秒ごとに10ポイント×難易度
- **グレイズボーナス**: 弾のニアミスで100ポイント
- **最終スコア**: 通常スコア + (生存秒数×100) + (グレイズ数×50)
- **難易度上昇**: 8秒ごとに自動的に上昇

## アーキテクチャ

### Hub-Client構成
- **Hub Server** (`packet_hub.py`)
  - WebSocketサーバー（8766ポート）
  - ゲーム状態管理
  - クライアント間のメッセージ配信
  - マルチプレイヤー対応
  
- **Packet Capture Client** (`packet_capture_client.py`)
  - Scapyによるパケットキャプチャ
  - Hubへのパケットデータ送信
  - 非同期処理による効率的なキャプチャ

### フロントエンド (JavaScript)
- **Phaser.js**: ゲームエンジン
- **WebSocket API**: Hubサーバーとの通信
- **Vite**: 高速開発サーバー
- **ES6 Modules**: モジュラー設計

## ファイル構成

```
pcap-nyan/
├── src/
│   ├── main.js              # ゲーム初期化とエントリーポイント
│   ├── managers/            # ゲーム管理モジュール
│   │   ├── BulletManager.js    # 弾幕管理
│   │   ├── EffectsManager.js   # エフェクト管理
│   │   ├── PlayerManager.js    # プレイヤー管理
│   │   ├── SourceManager.js    # パケットソース管理
│   │   └── UIManager.js        # UI管理
│   ├── scenes/
│   │   └── DodgeScene.js    # メインゲームシーン
│   └── utils/
│       └── WebSocketManager.js  # WebSocket通信管理
├── public/
│   ├── nyancat.svg         # Nyan Catスプライト
│   └── style.css           # スタイル
├── packet_hub.py           # WebSocket Hubサーバー (ポート8766)
├── packet_capture_client.py # パケットキャプチャクライアント
├── index.html              # HTMLエントリーポイント
├── vite.config.js          # Vite設定
├── package.json            # npm依存関係
├── pyproject.toml          # Python依存関係(uv)
├── websocket-spec.md       # WebSocket通信仕様書
├── CLAUDE.md               # 開発者向け詳細ドキュメント
└── README.md               # このファイル
```

## クイックスタート

```bash
# リポジトリをクローン
git clone <repository-url>
cd pcap-nyan

# uvをインストール（未インストールの場合）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 依存関係をインストール
npm install
uv pip sync

# 3つのターミナルで起動
npm run dev                                    # ターミナル1
uv run python packet_hub.py                    # ターミナル2
sudo uv run python packet_capture_client.py    # ターミナル3
```

## セキュリティ注意事項

⚠️ **注意**: このツールは教育・研究目的で作成されています。
- 自分のネットワークでのみ使用してください
- 他人のネットワークでの無断使用は法的問題となる可能性があります
- キャプチャしたパケット情報は適切に管理してください

## トラブルシューティング

### パケットキャプチャが動作しない
```bash
# 管理者権限で実行
sudo uv run python packet_capture_client.py

# インターフェース名を確認して変更
# packet_capture_client.py 内で指定
interface='en0'  # macOSのデフォルト
# Linuxの場合は 'eth0' や 'wlan0' など
```

### Hubサーバーに接続できない
```bash
# Hubサーバーが起動しているか確認
uv run python packet_hub.py

# ポート8766が使用可能か確認
lsof -i :8766
```

### WebSocket接続エラー
```bash
# Hub用ポート8766が使用中か確認
lsof -i :8766
# 使用中のプロセスを終了
kill -9 [PID]
```

### ゲームが重い場合
- `DodgeScene.js` の設定を調整:
  - `maxPackets` を減らす（292行目）
  - `maxSize` を減らす（41行目）
  - パケット処理間隔を増やす（279行目）

### パケットが流れてこない
1. `sudo`で実行しているか確認
2. 別タブでWebサイトを開いてトラフィックを生成
3. ネットワークインターフェース名を確認

## パフォーマンス調整

### 現在の設定値
- **パケット処理レート**: 33ms間隔（毎秒30パケット）
- **同時弾数上限**: 500個
- **パケットバッファ**: 200個
- **Hub更新レート**: 30fps (game_state配信)
- **WebSocketポート**: Hub(8766), レガシー(8765)

詳細な調整方法は `CLAUDE.md` を参照してください。

## 今後の拡張アイデア

- [ ] スコアランキング機能
- [ ] 異なるキャラクター選択
- [ ] パワーアップアイテム
- [ ] ボス戦（特定IPからの集中攻撃）
- [　] マルチプレイヤーモード（Hub-Client構成で実装済み）

## 開発者向け情報

### WebSocket通信仕様
マルチプレイヤー対応のHub-Client構成の詳細は `websocket-spec.md` に定義されています。
- メッセージ形式とプロトコル
- 自動サービス検索（mDNS）
- エラーコード定義

### 詳細ドキュメント
技術仕様、設定パラメータ、デバッグ方法については `CLAUDE.md` を参照してください。

---

楽しいゲーム体験をお楽しみください！ 🎮✨