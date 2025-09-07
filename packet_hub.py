#!/usr/bin/env python3
"""
PCAP-Nyan Hub Server
マルチプレイヤー対応のWebSocketハブサーバー
"""

import asyncio
import json
import time
import random
import socket
import struct
import threading
from typing import Dict, List, Optional, Any
from collections import deque
import websockets
from websockets.server import WebSocketServerProtocol
from dataclasses import dataclass, field, asdict
from enum import Enum

# 定数
WEBSOCKET_PORT = 8766
GAME_WIDTH = 800
GAME_HEIGHT = 600
UPDATE_RATE = 30  # fps
MAX_BULLETS = 500
MAX_HP = 3
INVULNERABILITY_TIME = 2.0  # 秒

# マルチキャスト検索設定
MULTICAST_GROUP = '239.255.42.99'  # プライベートマルチキャストアドレス
MULTICAST_PORT = 9999  # 独自ポート（mDNSと競合しない）
SERVICE_NAME = '_pcap-nyan-hub._tcp.local'

class ClientType(str, Enum):
    CAPTURE = 'capture'
    GAME = 'game'

class GameMode(str, Enum):
    PLAYER = 'player'
    SPECTATOR = 'spectator'

@dataclass
class PlayerState:
    id: str
    name: str
    x: float = GAME_WIDTH / 2
    y: float = GAME_HEIGHT - 100
    hp: int = MAX_HP
    alive: bool = True
    score: int = 0
    graze_count: int = 0
    invulnerable: bool = False
    invulnerable_until: float = 0
    death_time: Optional[float] = None
    avatar: str = 'nyan_cat'

@dataclass
class Bullet:
    id: str
    x: float
    y: float
    vx: float
    vy: float
    size: float
    protocol: str
    source: str
    port: int
    color: str
    created_at: float = field(default_factory=time.time)

@dataclass
class CaptureClient:
    id: str
    source_id: str
    source_name: str
    websocket: WebSocketServerProtocol
    ip_address: str = 'unknown'
    packet_rate: float = 0
    last_packet_time: float = field(default_factory=time.time)
    total_packets: int = 0

@dataclass
class GameClient:
    id: str
    mode: GameMode
    websocket: WebSocketServerProtocol
    player_state: Optional[PlayerState] = None

class HubServer:
    def __init__(self):
        self.capture_clients: Dict[str, CaptureClient] = {}
        self.game_clients: Dict[str, GameClient] = {}
        self.bullets: List[Bullet] = []
        self.bullet_id_counter = 0
        self.client_id_counter = 0
        self.start_time = time.time()
        self.high_score = 0
        
    def generate_client_id(self) -> str:
        """クライアントID生成"""
        self.client_id_counter += 1
        return f"client_{self.client_id_counter}"
    
    def generate_bullet_id(self) -> str:
        """弾幕ID生成"""
        self.bullet_id_counter += 1
        return f"b_{self.bullet_id_counter}"
    
    def get_local_ip(self) -> str:
        """ローカルIPアドレス取得"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "localhost"
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """クライアント接続処理"""
        client_id = None
        try:
            # クライアントのIPアドレスを取得
            client_ip = websocket.remote_address[0] if websocket.remote_address else 'unknown'
            
            # 最初のメッセージで認証
            auth_message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            auth_data = json.loads(auth_message)
            
            client_id = self.generate_client_id()
            
            if auth_data.get('type') == 'capture_auth':
                await self.handle_capture_client(client_id, websocket, auth_data, client_ip)
            elif auth_data.get('type') == 'game_auth':
                await self.handle_game_client(client_id, websocket, auth_data)
            else:
                await self.send_error(websocket, "INVALID_AUTH", "Invalid authentication type")
                
        except asyncio.TimeoutError:
            await self.send_error(websocket, "AUTH_TIMEOUT", "Authentication timeout")
        except json.JSONDecodeError:
            await self.send_error(websocket, "INVALID_MESSAGE", "Invalid JSON format")
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.handle_disconnect(client_id)
    
    async def handle_capture_client(self, client_id: str, websocket: WebSocketServerProtocol, auth_data: dict, client_ip: str):
        """キャプチャクライアント処理"""
        source_id = auth_data.get('source_id', client_id)
        source_name = auth_data.get('source_name', f'Capture {client_id}')
        
        client = CaptureClient(
            id=client_id,
            source_id=source_id,
            source_name=source_name,
            websocket=websocket,
            ip_address=client_ip
        )
        self.capture_clients[client_id] = client
        
        print(f"Capture client connected: {source_name} ({client_id}) from {client_ip}")
        
        # メッセージ処理ループ
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get('type') == 'packet_data':
                    await self.process_packet_data(client, data)
            except json.JSONDecodeError:
                continue
    
    async def handle_game_client(self, client_id: str, websocket: WebSocketServerProtocol, auth_data: dict):
        """ゲームクライアント処理"""
        try:
            mode = GameMode(auth_data.get('mode', 'player'))
            player_name = auth_data.get('player_name', f'Player {client_id}')
            avatar = auth_data.get('avatar', 'nyan_cat')
            
            client = GameClient(
                id=client_id,
                mode=mode,
                websocket=websocket
            )
            
            # プレイヤーモードの場合、プレイヤー状態を作成
            if mode == GameMode.PLAYER:
                client.player_state = PlayerState(
                    id=client_id,
                    name=player_name,
                    avatar=avatar
                )
            
            self.game_clients[client_id] = client
            
            # 認証成功メッセージ送信
            await self.send_json(websocket, {
                'type': 'auth_success',
                'player_id': client_id,
                'game_config': {
                    'max_bullets': MAX_BULLETS,
                    'game_width': GAME_WIDTH,
                    'game_height': GAME_HEIGHT,
                    'difficulty': 1
                }
            })
            
            # 参加イベント通知
            if mode == GameMode.PLAYER:
                await self.broadcast_player_event('join', client.player_state)
            
            print(f"Game client connected: {player_name} ({mode.value}) ({client_id})")
            
            # メッセージ処理ループ
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_game_message(client, data)
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(f"Error handling game message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            print(f"Game client disconnected during handling: {client_id}")
        except Exception as e:
            print(f"Error in game client handler: {e}")
    
    async def handle_game_message(self, client: GameClient, data: dict):
        """ゲームクライアントメッセージ処理"""
        msg_type = data.get('type')
        
        if msg_type == 'player_move' and client.player_state:
            x = max(0, min(GAME_WIDTH, data.get('x', client.player_state.x)))
            y = max(0, min(GAME_HEIGHT, data.get('y', client.player_state.y)))
            client.player_state.x = x
            client.player_state.y = y
            
        elif msg_type == 'player_hit' and client.player_state:
            await self.handle_player_hit(client, data.get('bullet_id'))
            
        elif msg_type == 'player_graze' and client.player_state:
            client.player_state.graze_count += 1
            client.player_state.score += 100
            
        elif msg_type == 'game_control':
            action = data.get('action')
            if action == 'restart' and client.player_state:
                await self.respawn_player(client)
        
        elif msg_type == 'chat':
            await self.broadcast_chat(client.id, client.player_state.name if client.player_state else 'Spectator', data.get('message', ''))
    
    async def handle_player_hit(self, client: GameClient, bullet_id: str):
        """プレイヤー被弾処理"""
        if not client.player_state or not client.player_state.alive:
            return
        
        # 無敵時間チェック
        if client.player_state.invulnerable:
            return
        
        client.player_state.hp -= 1
        
        if client.player_state.hp <= 0:
            # 死亡処理
            client.player_state.alive = False
            client.player_state.death_time = time.time()
            await self.broadcast_player_event('death', client.player_state)
            await self.update_leaderboard()
        else:
            # 無敵時間付与
            client.player_state.invulnerable = True
            client.player_state.invulnerable_until = time.time() + INVULNERABILITY_TIME
    
    async def respawn_player(self, client: GameClient):
        """プレイヤーリスポーン"""
        if not client.player_state:
            return
        
        client.player_state.alive = True
        client.player_state.hp = MAX_HP
        client.player_state.x = GAME_WIDTH / 2
        client.player_state.y = GAME_HEIGHT - 100
        client.player_state.invulnerable = True
        client.player_state.invulnerable_until = time.time() + INVULNERABILITY_TIME
        client.player_state.death_time = None
        
        await self.broadcast_player_event('respawn', client.player_state)
    
    async def process_packet_data(self, client: CaptureClient, data: dict):
        """パケットデータ処理"""
        packets = data.get('packets', [])
        new_bullets = []
        
        # ソースごとの色とパターンを割り当て
        source_index = list(self.capture_clients.keys()).index(client.id) if client.id in self.capture_clients else 0
        source_colors = [
            {'TCP': '#FF4444', 'UDP': '#4444FF', 'ICMP': '#44FF44', 'UNKNOWN': '#FFFF44'},  # Source 1: 明るい
            {'TCP': '#CC0000', 'UDP': '#0000CC', 'ICMP': '#00CC00', 'UNKNOWN': '#CCCC00'},  # Source 2: 濃い
            {'TCP': '#FF8888', 'UDP': '#8888FF', 'ICMP': '#88FF88', 'UNKNOWN': '#FFFF88'},  # Source 3: 薄い
            {'TCP': '#FF00FF', 'UDP': '#00FFFF', 'ICMP': '#FFFF00', 'UNKNOWN': '#FF8800'},  # Source 4: ネオン
        ]
        colors = source_colors[source_index % len(source_colors)]
        
        # Process only a subset of packets if too many
        max_packets_per_batch = 10  # Further reduced from 15 to 10
        if len(packets) > max_packets_per_batch:
            # Randomly sample to get more diversity
            packets = random.sample(packets, max_packets_per_batch)
        
        for i, packet in enumerate(packets):
            # ポート番号から位置決定
            port = packet.get('dst_port', 0) or packet.get('src_port', 0)
            
            # ICMPパケットの特別処理（ポート番号がない）
            protocol = packet.get('protocol', 'UNKNOWN')
            if protocol == 'ICMP':
                # ICMPパケットはランダムな位置に配置
                x = random.uniform(0.1, 0.9) * GAME_WIDTH
                port = 1  # ダミーのポート番号を設定
            elif not port or port <= 1023:  # ウェルノウンポートはスキップ（ICMP以外）
                continue
            else:
                # 位置正規化
                if port >= 49152:
                    x = ((port - 49152) / (65535 - 49152)) * GAME_WIDTH
                else:
                    x = ((port - 1024) / (49151 - 1024)) * GAME_WIDTH
            
            # プロトコル別の速度（ソースごとに少し変化）
            speed_modifier = 1 + (source_index * 0.1)  # ソースごとに10%速度変化
            velocities = {
                'TCP': {'vx': 0, 'vy': 100 * speed_modifier},
                'UDP': {'vx': random.uniform(-50, 50), 'vy': 150 * speed_modifier},
                'ICMP': {'vx': 0, 'vy': 200 * speed_modifier},
                'UNKNOWN': {'vx': random.uniform(-25, 25), 'vy': 120 * speed_modifier}
            }
            velocity = velocities.get(protocol, velocities['UNKNOWN'])
            
            # サイズ計算
            packet_size = packet.get('size', 100)
            if packet_size < 200:
                bullet_size = 5
            elif packet_size < 800:
                bullet_size = 10
            else:
                bullet_size = 15
            
            # Add slight time offset for bullets in same batch to spread them out
            y_offset = -20 * (i % 3)  # Stagger start positions
            x_offset = random.uniform(-20, 20) if i > 0 else 0  # Add horizontal spread
            
            bullet = Bullet(
                id=self.generate_bullet_id(),
                x=x + x_offset,
                y=y_offset,
                vx=velocity['vx'],
                vy=velocity['vy'],
                size=bullet_size,
                protocol=protocol,
                source=client.source_id,
                port=port,
                color=colors.get(protocol, '#FFFFFF')
            )
            
            new_bullets.append(bullet)
        
        # 弾幕追加
        self.bullets.extend(new_bullets)
        
        # 統計更新
        client.total_packets += len(packets)
        client.last_packet_time = time.time()
        
        # キャプチャ統計送信
        await self.send_json(client.websocket, {
            'type': 'capture_stats',
            'connected_players': len([c for c in self.game_clients.values() if c.mode == GameMode.PLAYER]),
            'active_players': len([c for c in self.game_clients.values() if c.player_state and c.player_state.alive]),
            'total_bullets': len(self.bullets),
            'bullets_from_source': len([b for b in self.bullets if b.source == client.source_id])
        })
    
    def update_bullets(self, delta_time: float):
        """弾幕位置更新"""
        current_time = time.time()
        updated_bullets = []
        
        for bullet in self.bullets:
            # 位置更新
            bullet.x += bullet.vx * delta_time
            bullet.y += bullet.vy * delta_time
            
            # 画面内チェック
            if (0 <= bullet.x <= GAME_WIDTH and 
                -50 <= bullet.y <= GAME_HEIGHT + 50 and
                current_time - bullet.created_at < 10):  # 10秒で削除
                updated_bullets.append(bullet)
        
        self.bullets = updated_bullets[:MAX_BULLETS]  # 最大数制限
        
        # 無敵時間更新
        for client in self.game_clients.values():
            if client.player_state and client.player_state.invulnerable:
                if time.time() >= client.player_state.invulnerable_until:
                    client.player_state.invulnerable = False
    
    def get_game_state(self) -> dict:
        """ゲーム状態取得"""
        players = {}
        for client in self.game_clients.values():
            if client.player_state:
                players[client.id] = {
                    'name': client.player_state.name,
                    'x': client.player_state.x,
                    'y': client.player_state.y,
                    'alive': client.player_state.alive,
                    'hp': client.player_state.hp,
                    'score': client.player_state.score,
                    'graze_count': client.player_state.graze_count,
                    'avatar': client.player_state.avatar,
                    'invulnerable': client.player_state.invulnerable,
                    'death_time': client.player_state.death_time
                }
        
        bullets = [
            {
                'id': b.id,
                'x': b.x,
                'y': b.y,
                'vx': b.vx,
                'vy': b.vy,
                'size': b.size,
                'protocol': b.protocol,
                'source': b.source,
                'source_name': self.capture_clients[next((k for k, v in self.capture_clients.items() if v.source_id == b.source), '')].source_name if b.source in [c.source_id for c in self.capture_clients.values()] else 'Unknown',
                'port': b.port,
                'color': b.color
            }
            for b in self.bullets
        ]
        
        capture_sources = {}
        for client in self.capture_clients.values():
            capture_sources[client.source_id] = {
                'name': client.source_name,
                'active': time.time() - client.last_packet_time < 5,
                'packet_rate': client.packet_rate,
                'ip_address': getattr(client, 'ip_address', 'unknown')
            }
        
        return {
            'type': 'game_state',
            'timestamp': int(time.time() * 1000),
            'players': players,
            'bullets': bullets,
            'capture_sources': capture_sources
        }
    
    async def update_leaderboard(self):
        """リーダーボード更新"""
        rankings = []
        for client in self.game_clients.values():
            if client.player_state:
                rankings.append({
                    'player_id': client.id,
                    'name': client.player_state.name,
                    'score': client.player_state.score,
                    'alive': client.player_state.alive
                })
        
        rankings.sort(key=lambda x: x['score'], reverse=True)
        
        # ランク付け
        for i, entry in enumerate(rankings):
            entry['rank'] = i + 1
        
        # 最高スコア更新
        if rankings and rankings[0]['score'] > self.high_score:
            self.high_score = rankings[0]['score']
        
        leaderboard = {
            'type': 'leaderboard',
            'rankings': rankings[:10],  # Top 10
            'high_score': self.high_score,
            'total_players': len(self.game_clients),
            'active_players': len([c for c in self.game_clients.values() if c.player_state and c.player_state.alive])
        }
        
        await self.broadcast_to_game_clients(leaderboard)
    
    async def broadcast_player_event(self, event: str, player_state: PlayerState):
        """プレイヤーイベント通知"""
        if not player_state:
            return
            
        message = {
            'type': 'player_event',
            'event': event,
            'player': {
                'id': player_state.id,
                'name': player_state.name,
                'avatar': player_state.avatar
            }
        }
        await self.broadcast_to_game_clients(message)
    
    async def broadcast_chat(self, player_id: str, player_name: str, message: str):
        """チャットメッセージ配信"""
        chat_message = {
            'type': 'chat_broadcast',
            'player_id': player_id,
            'player_name': player_name,
            'message': message,
            'timestamp': int(time.time() * 1000)
        }
        await self.broadcast_to_game_clients(chat_message)
    
    async def broadcast_to_game_clients(self, message: dict):
        """全ゲームクライアントに配信"""
        if not self.game_clients:
            return
            
        disconnected = []
        # リストのコピーを作成して反復中の変更を防ぐ
        clients = list(self.game_clients.items())
        
        for client_id, client in clients:
            try:
                await self.send_json(client.websocket, message)
            except (websockets.exceptions.ConnectionClosed, ConnectionResetError, BrokenPipeError):
                disconnected.append(client_id)
            except Exception as e:
                print(f"Error broadcasting to client {client_id}: {e}")
                disconnected.append(client_id)
        
        for client_id in disconnected:
            await self.handle_disconnect(client_id)
    
    async def game_update_loop(self):
        """ゲーム更新ループ（30fps）"""
        while True:
            start_time = time.time()
            
            # 弾幕更新
            self.update_bullets(1/UPDATE_RATE)
            
            # ゲーム状態配信
            game_state = self.get_game_state()
            await self.broadcast_to_game_clients(game_state)
            
            # FPS維持
            elapsed = time.time() - start_time
            await asyncio.sleep(max(0, 1/UPDATE_RATE - elapsed))
    
    async def handle_disconnect(self, client_id: str):
        """クライアント切断処理"""
        if not client_id:
            return
        
        try:
            if client_id in self.game_clients:
                client = self.game_clients.get(client_id)
                if client and client.player_state:
                    # 他のクライアントに通知（切断されたクライアント以外）
                    temp_clients = self.game_clients.copy()
                    del self.game_clients[client_id]
                    await self.broadcast_player_event('leave', client.player_state)
                    # 削除が完了していない場合のみ削除
                    if client_id in self.game_clients:
                        del self.game_clients[client_id]
                else:
                    # player_stateがない場合も削除
                    if client_id in self.game_clients:
                        del self.game_clients[client_id]
                print(f"Game client disconnected: {client_id}")
                
            elif client_id in self.capture_clients:
                del self.capture_clients[client_id]
                print(f"Capture client disconnected: {client_id}")
        except Exception as e:
            print(f"Error handling disconnect for {client_id}: {e}")
    
    async def send_json(self, websocket: WebSocketServerProtocol, data: dict):
        """JSON送信"""
        try:
            await websocket.send(json.dumps(data))
        except websockets.exceptions.ConnectionClosed:
            # 接続が閉じている場合は無視
            pass
        except Exception as e:
            print(f"Error sending JSON: {e}")
    
    async def send_error(self, websocket: WebSocketServerProtocol, code: str, message: str):
        """エラーメッセージ送信"""
        await self.send_json(websocket, {
            'type': 'error',
            'code': code,
            'message': message
        })
    
    def start_discovery_service(self):
        """マルチキャスト検索サービス開始"""
        def discovery_thread():
            # UDPソケット作成
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            
            # マルチキャストグループに参加
            try:
                sock.bind(('', MULTICAST_PORT))
            except OSError as e:
                if e.errno == 48:  # Address already in use
                    print(f"Warning: Port {MULTICAST_PORT} is in use. Trying alternative port...")
                    sock.bind(('', 0))  # OSに空きポートを選ばせる
                    actual_port = sock.getsockname()[1]
                    print(f"Discovery service using port {actual_port}")
                else:
                    raise
            
            mreq = struct.pack('4sl', socket.inet_aton(MULTICAST_GROUP), socket.INADDR_ANY)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            
            local_ip = self.get_local_ip()
            print(f"Discovery service listening on {MULTICAST_GROUP}:{MULTICAST_PORT}")
            
            while True:
                try:
                    data, addr = sock.recvfrom(1024)
                    message = json.loads(data.decode('utf-8'))
                    
                    if message.get('type') == 'DISCOVER' and message.get('service') == SERVICE_NAME:
                        # 検索リクエストに応答
                        response = {
                            'type': 'ANNOUNCE',
                            'service': SERVICE_NAME,
                            'host': local_ip,
                            'port': WEBSOCKET_PORT,
                            'name': 'PCAP-Nyan Hub Server',
                            'players_online': len([c for c in self.game_clients.values() if c.mode == GameMode.PLAYER]),
                            'captures_active': len(self.capture_clients),
                            'game_mode': 'multiplayer'
                        }
                        
                        sock.sendto(json.dumps(response).encode('utf-8'), addr)
                        print(f"Discovery response sent to {addr[0]}:{addr[1]}")
                        
                except Exception as e:
                    print(f"Discovery service error: {e}")
                    continue
        
        # デーモンスレッドとして起動
        discovery = threading.Thread(target=discovery_thread, daemon=True)
        discovery.start()
    
    async def start(self):
        """サーバー起動"""
        local_ip = self.get_local_ip()
        
        # マルチキャスト検索サービス開始
        self.start_discovery_service()
        
        print(f"""
========================================
PCAP-Nyan Hub Server Started!
========================================

WebSocket Server: ws://{local_ip}:{WEBSOCKET_PORT}
Discovery Service: {MULTICAST_GROUP}:{MULTICAST_PORT}

アクセス方法:
1. ブラウザで http://{local_ip}:3000 を開く
2. 自動的にHubに接続されます

他のマシンからの接続:
- Game: http://{local_ip}:3000
- Capture: python packet_capture_client.py
  (自動検索または --hub {local_ip}:{WEBSOCKET_PORT})

========================================
        """)
        
        # WebSocketサーバー起動
        async with websockets.serve(self.handle_client, '0.0.0.0', WEBSOCKET_PORT):
            # ゲーム更新ループ起動
            await self.game_update_loop()

async def main():
    hub = HubServer()
    await hub.start()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nHub server stopped.")