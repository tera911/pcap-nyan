# PCAP Nyan

---
# まずはデモ

山口: 192.168.0.100:3000

一般の方(osxのみ windowsは知らん)
```bash
git clone https://github.com/tera911/pcap-nyan

cd pcap-nyan

brew install uv #python package manager
uv run python3 packet_capture_client.py

```


---

## 1. システム概要

### コンセプト
**ネットワークパケット使ったゲーム**

- パケットをキャプチャ
- パケットデータを「弾幕」として変換
- Nyan Catを操作して弾幕を回避

---

## 2. システムアーキテクチャ

### 全体構成

```
[ブラウザ (Client)]
    Phaser.js Game Engine
    ├─ DodgeScene (メインゲーム)
    └─ WebSocketManager (通信管理)
           ↓↑ WebSocket
    
[Hub Server :8766]
    WebSocket Hub (Python)
    ├─ マルチプレイヤー同期
    └─ ゲーム状態管理
           ↓↑ packet data
    
[Packet Capture Server :8765]
    Scapy (Python)
    ├─ ネットワーク監視
    └─ パケットフィルタリング
           ↓ pcap
```

---

### マルチキャスト自動検索

```
1. ブラウザ → mDNS (224.0.0.251:5353)
   "_pcap-nyan-hub._tcp.local" を検索

2. mDNS → ブラウザ
   Hub ServerのIP:ポート返却

3. ブラウザ → Hub Server
   WebSocket接続確立

4. 自動フォールバック機能
   接続失敗時は localhost:8766 へ
```

---

### WebSocket通信プロトコル

#### メッセージタイプ
```json
// プレイヤー参加
{
  "type": "player_join",
  "player_name": "Player1",
  "character": "nyancat"
}

// ゲーム状態同期 (30fps)
{
  "type": "game_state",
  "players": [{
    "id": "uuid",
    "position": {"x": 100, "y": 200},
    "score": 1500,
    "alive": true
  }],
  "packets": [{
    "id": "packet_123",
    "position": {"x": 300, "y": 0},
    "velocity": {"x": 0, "y": 150},
    "size": "medium",
    "protocol": "TCP"
  }]
}

// パケット受信
{
  "type": "packet",
  "protocol": "TCP",
  "src_port": 54321,
  "dst_port": 443,
  "size": 1500,
  "timestamp": 1234567890.123
}
```

---

## 3. パケット変換ルール

### プロトコル別の特性

| プロトコル | 色 | 基本速度 | 移動パターン | 特徴 |
|-----------|-----|---------|-------------|------|
| **TCP** | 🔴 赤 (#FF6666) | 120 | 直進 | 安定した動き、予測しやすい |
| **UDP** | 🔵 青 (#6666FF) | 150 (横1.5倍) | 横に広がる | 散弾パターン、回避が難しい |
| **ICMP** | 🟢 緑 (#66FF66) | 180 | 直進 | ping/traceroute時に出現 |

### ウェルノウンポート特殊パターン

| ポート | サービス | 色 | パターン | 動き |
|--------|---------|-----|---------|------|
| 80 | HTTP | 🔷 水色 (#00AAFF) | straight | 直進・安定 |
| 443 | HTTPS | 🟠 橙 (#FFAA00) | zigzag | ジグザグ移動 (sin波) |
| 22 | SSH | 🟣 紫 (#FF00FF) | fast | 高速直進 (速度200) |
| 53 | DNS | 🟢 黄緑 (#AAFF00) | seeking | プレイヤー追尾 |
| 25 | SMTP | 🟡 黄 (#FFFF00) | chain | 連鎖弾 |
| 110 | POP3 | - | pulling | 中央引き寄せ |
| 67/68 | DHCP | - | spreading | ランダム拡散 |
| 20/21 | FTP | - | double | 2発同時 |

### IPアドレスタイプ修飾

| IPタイプ | 効果 | 視覚効果 |
|----------|------|---------|
| Private (192.168.x.x等) | 速度70% | グレー枠 |
| Loopback (127.0.0.1) | Uターン動作 | マゼンタ枠 |
| Broadcast (x.x.x.255) | 横方向拡散 | シアン枠 |

### パケットサイズ変換

| パケットサイズ | 弾の半径 | 重力効果 | 特殊効果 |
|---------------|---------|---------|---------|
| 0-100 bytes | 3px | 0.5倍 | 制御パケット・高速 |
| 100-500 bytes | 5px | 1.0倍 | 通常データ |
| 500-1500 bytes | 7px | 1.5倍 | 大容量パケット |
| 1500+ bytes (MTU超) | 9px | 2.0倍 | フラグメント化・赤枠 |

### ポート番号による基本移動

| 条件 | 水平速度修正 |
|-----|-------------|
| 偶数ポート | 右寄り (+10〜+60) |
| 奇数ポート | 左寄り (-10〜-60) |
| 素数ポート | sin波ジグザグ |

### 経験値システムと難易度スケーリング

#### レベルアップシステム
- グレイズ（ニアミス）で経験値獲得
- コンボ数に応じて経験値倍率（最大50コンボで2倍）
- レベルアップで処理速度増加

#### パケット処理速度
| レベル | 処理間隔 | パケット/秒 |
|--------|---------|------------|
| Lv.1 | 160ms | 6/sec |
| Lv.5 | 110ms | 9/sec |
| Lv.10 | 50ms | 20/sec |
| Lv.15+ | 50ms | 20/sec (上限) |

計算式: `max(50, 160 - (Lv×10) - (floor(Lv/3)×5))`

#### 弾速度補正
- 基本速度 × (1 + (レベル-1) × 0.08)

