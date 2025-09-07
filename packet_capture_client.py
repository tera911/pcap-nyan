#!/usr/bin/env python3
"""
PCAP-Nyan Packet Capture Client
Hubサーバーにパケットデータを送信するクライアント
"""

import asyncio
import json
import time
import argparse
import sys
import socket
import struct
from typing import Optional, List, Dict, Any, Tuple
from collections import deque
from scapy.all import *
import websockets
from websockets.client import WebSocketClientProtocol

# マルチキャスト検索設定
MULTICAST_GROUP = '239.255.42.99'  # プライベートマルチキャストアドレス
MULTICAST_PORT = 9999  # 独自ポート（mDNSと競合しない）
SERVICE_NAME = '_pcap-nyan-hub._tcp.local'

class PacketCaptureClient:
    def __init__(self, hub_url: str = None, source_name: str = None):
        self.hub_url = hub_url or 'ws://localhost:8766'
        self.source_name = source_name or f'{socket.gethostname()}_capture'
        self.source_id = f'capture_{int(time.time())}'
        self.ws: Optional[WebSocketClientProtocol] = None
        self.is_capturing = False
        self.packet_buffer = deque(maxlen=200)
        self.packet_count = 0
        self.last_send_time = time.time()
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 10
        # Deduplication and rate limiting
        self.connection_cache = {}  # Stores last packet time per connection
        self.connection_rate_limit = 0.3  # Minimum seconds between packets from same connection (300ms)
        self.cache_cleanup_interval = 5.0  # Clean cache every 5 seconds
        self.last_cache_cleanup = time.time()
        self.skipped_packets = 0  # Debug counter
        
    def packet_handler(self, packet):
        """パケットキャプチャハンドラ"""
        if not self.is_capturing:
            return
        
        packet_info = {
            'timestamp': time.time(),
            'size': len(packet),
            'protocol': None,
            'src_ip': None,
            'dst_ip': None,
            'src_port': None,
            'dst_port': None,
            'is_fragment': False
        }
        
        if packet.haslayer(IP):
            ip_layer = packet[IP]
            packet_info['src_ip'] = ip_layer.src
            packet_info['dst_ip'] = ip_layer.dst
            
            # Check for IP fragmentation
            # MF (More Fragments) flag or Fragment Offset > 0 indicates fragmentation
            is_fragmented = (ip_layer.flags & 0x1) or (ip_layer.frag > 0)
            packet_info['is_fragment'] = is_fragmented
            
            # Skip non-first fragments (they don't have port info)
            if is_fragmented and ip_layer.frag > 0:
                # This is not the first fragment, skip it
                return
            
            if packet.haslayer(TCP):
                packet_info['protocol'] = 'TCP'
                packet_info['src_port'] = packet[TCP].sport
                packet_info['dst_port'] = packet[TCP].dport
                # Check for retransmission (simplified check)
                tcp_layer = packet[TCP]
                # Skip retransmissions and duplicates (RST, duplicate ACKs)
                if tcp_layer.flags & 0x04:  # RST flag
                    return
            elif packet.haslayer(UDP):
                packet_info['protocol'] = 'UDP'
                packet_info['src_port'] = packet[UDP].sport
                packet_info['dst_port'] = packet[UDP].dport
            elif packet.haslayer(ICMP):
                packet_info['protocol'] = 'ICMP'
        
        if packet_info['protocol']:  # プロトコルが識別できた場合のみ
            current_time = time.time()
            
            # Create connection identifier (bidirectional)
            # Sort IPs and ports to handle bidirectional traffic
            if packet_info['src_ip'] < packet_info['dst_ip']:
                conn_id = f"{packet_info['src_ip']}:{packet_info['src_port']}-" \
                         f"{packet_info['dst_ip']}:{packet_info['dst_port']}-" \
                         f"{packet_info['protocol']}"
            else:
                conn_id = f"{packet_info['dst_ip']}:{packet_info['dst_port']}-" \
                         f"{packet_info['src_ip']}:{packet_info['src_port']}-" \
                         f"{packet_info['protocol']}"
            
            # Clean up old connections periodically
            if current_time - self.last_cache_cleanup > self.cache_cleanup_interval:
                # Remove connections older than cleanup interval
                self.connection_cache = {
                    k: v for k, v in self.connection_cache.items()
                    if current_time - v < self.cache_cleanup_interval
                }
                self.last_cache_cleanup = current_time
            
            # Check rate limit for this connection
            if conn_id in self.connection_cache:
                last_packet_time = self.connection_cache[conn_id]
                time_since_last = current_time - last_packet_time
                
                # Skip if too soon since last packet from this connection
                if time_since_last < self.connection_rate_limit:
                    self.skipped_packets += 1
                    if self.skipped_packets % 100 == 0:  # Log every 100 skipped packets
                        print(f"Rate limited: Skipped {self.skipped_packets} packets (last: {conn_id[:30]}...)")
                    return  # Rate limited
            
            # Update last packet time for this connection
            self.connection_cache[conn_id] = current_time
            
            # Add to buffer
            self.packet_buffer.append(packet_info)
            self.packet_count += 1
    
    def start_capture(self, interface: str = None):
        """パケットキャプチャ開始"""
        self.is_capturing = True
        
        # インターフェース自動検出
        if not interface:
            if sys.platform == 'darwin':
                interface = 'en0'  # macOS default
            elif sys.platform.startswith('linux'):
                interface = 'eth0'  # Linux default
            else:
                interface = None  # Windows - auto
        
        print(f"Starting packet capture on interface: {interface or 'auto'}")
        
        try:
            sniff(iface=interface, prn=self.packet_handler, store=False)
        except Exception as e:
            print(f"Capture error: {e}")
            print("Try running with sudo/administrator privileges")
            self.is_capturing = False
    
    async def connect_to_hub(self) -> bool:
        """Hubサーバーに接続"""
        try:
            print(f"Connecting to Hub: {self.hub_url}")
            self.ws = await websockets.connect(self.hub_url)
            
            # 認証メッセージ送信
            auth_message = {
                'type': 'capture_auth',
                'client_type': 'capture',
                'source_name': self.source_name,
                'source_id': self.source_id
            }
            await self.ws.send(json.dumps(auth_message))
            
            print(f"Connected to Hub as '{self.source_name}'")
            self.reconnect_attempts = 0
            return True
            
        except Exception as e:
            print(f"Connection failed: {e}")
            return False
    
    async def send_packet_batch(self):
        """パケットデータをバッチ送信"""
        last_stats_time = time.time()
        stats_interval = 10.0  # Show stats every 10 seconds
        
        while True:
            try:
                current_time = time.time()
                
                # Show statistics periodically
                if current_time - last_stats_time > stats_interval:
                    active_connections = len(self.connection_cache)
                    print(f"[Stats] Captured: {self.packet_count}, Skipped: {self.skipped_packets}, "
                          f"Active connections: {active_connections}, Buffer: {len(self.packet_buffer)}")
                    last_stats_time = current_time
                
                # 200ms毎または30パケット溜まったら送信（間隔を延ばして分散）
                if (current_time - self.last_send_time > 0.2 or len(self.packet_buffer) >= 30) and self.packet_buffer:
                    
                    if self.ws:
                        # バッファからパケット取得（同一接続の連続パケットを更に制限）
                        packets_to_send = []
                        sent_connections = {}  # Track connections sent in this batch
                        temp_buffer = []  # Packets to put back in buffer
                        
                        while self.packet_buffer and len(packets_to_send) < 15:  # Balanced at 15
                            packet = self.packet_buffer.popleft()
                            
                            # Create connection identifier for batch deduplication
                            if packet['src_ip'] < packet['dst_ip']:
                                conn_id = f"{packet['src_ip']}:{packet['src_port']}-" \
                                         f"{packet['dst_ip']}:{packet['dst_port']}-" \
                                         f"{packet['protocol']}"
                            else:
                                conn_id = f"{packet['dst_ip']}:{packet['dst_port']}-" \
                                         f"{packet['src_ip']}:{packet['src_port']}-" \
                                         f"{packet['protocol']}"
                            
                            # Allow up to 2 packets per connection in a batch for better flow
                            if conn_id in sent_connections and sent_connections[conn_id] >= 2:
                                # Already sent 2 packets from this connection
                                temp_buffer.append(packet)
                                continue
                            
                            # Count this connection
                            sent_connections[conn_id] = sent_connections.get(conn_id, 0) + 1
                            
                            # タイムスタンプを除外して送信
                            packets_to_send.append({
                                'protocol': packet['protocol'],
                                'src_port': packet['src_port'],
                                'dst_port': packet['dst_port'],
                                'size': packet['size'],
                                'src_ip': packet['src_ip'],
                                'dst_ip': packet['dst_ip']
                            })
                        
                        # Put temporary buffer packets back
                        for packet in temp_buffer:
                            self.packet_buffer.append(packet)
                        
                        if packets_to_send:
                            message = {
                                'type': 'packet_data',
                                'source_id': self.source_id,
                                'packets': packets_to_send
                            }
                            
                            await self.ws.send(json.dumps(message))
                            self.last_send_time = current_time
                            
                            # Debug: Show connection diversity in batch
                            unique_connections = len(sent_connections)
                            print(f"\n[Batch] Sent {len(packets_to_send)} packets from {unique_connections} unique connections")
                            
                            # Show top connections if mostly from same source
                            if unique_connections < len(packets_to_send) / 2:
                                print(f"  Warning: Low connection diversity ({unique_connections}/{len(packets_to_send)})")
                                # Show first few connections for debugging
                                for i, conn in enumerate(list(sent_connections.keys())[:3]):
                                    parts = conn.split('-')
                                    if len(parts) >= 2:
                                        print(f"    - {parts[0]} -> {parts[1]}")
                
                await asyncio.sleep(0.05)  # 50ms間隔でチェック
                
            except websockets.exceptions.ConnectionClosed:
                print("\nConnection to Hub lost. Reconnecting...")
                await self.reconnect()
            except Exception as e:
                print(f"\nError sending packets: {e}")
                await asyncio.sleep(1)
    
    async def receive_messages(self):
        """Hubからのメッセージ受信"""
        while True:
            try:
                if self.ws:
                    message = await self.ws.recv()
                    data = json.loads(message)
                    
                    if data.get('type') == 'capture_stats':
                        # 統計情報表示（別行で）
                        print(f"\n[Stats] Players: {data.get('connected_players', 0)} | "
                              f"Active: {data.get('active_players', 0)} | "
                              f"Total Bullets: {data.get('total_bullets', 0)} | "
                              f"Your Bullets: {data.get('bullets_from_source', 0)}")
                        # カーソルを元の位置に戻す
                        print(f"\rPackets captured: {self.packet_count}", end='')
                else:
                    await asyncio.sleep(1)
                    
            except websockets.exceptions.ConnectionClosed:
                await asyncio.sleep(1)
            except Exception as e:
                print(f"\nError receiving message: {e}")
                await asyncio.sleep(1)
    
    async def reconnect(self):
        """再接続処理"""
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            print("\nMax reconnection attempts reached. Exiting...")
            return False
        
        self.reconnect_attempts += 1
        wait_time = min(2 ** self.reconnect_attempts, 30)  # 指数バックオフ（最大30秒）
        
        print(f"\nReconnection attempt {self.reconnect_attempts}/{self.max_reconnect_attempts} in {wait_time}s...")
        await asyncio.sleep(wait_time)
        
        if await self.connect_to_hub():
            print("Reconnected successfully!")
            return True
        return False
    
    def discover_hub(self, timeout: float = 5.0) -> Optional[Tuple[str, int]]:
        """マルチキャストでHubを検索"""
        try:
            print(f"Searching for Hub server... (timeout: {timeout}s)")
            
            # UDPソケット作成
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(timeout)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            
            # 検索メッセージ送信
            discover_msg = {
                'type': 'DISCOVER',
                'service': SERVICE_NAME,
                'client_type': 'capture'
            }
            
            sock.sendto(
                json.dumps(discover_msg).encode('utf-8'),
                (MULTICAST_GROUP, MULTICAST_PORT)
            )
            
            # 応答待機
            data, addr = sock.recvfrom(1024)
            response = json.loads(data.decode('utf-8'))
            
            if response.get('type') == 'ANNOUNCE':
                host = response.get('host')
                port = response.get('port')
                name = response.get('name', 'Unknown Hub')
                players = response.get('players_online', 0)
                captures = response.get('captures_active', 0)
                
                print(f"\nHub found: {name}")
                print(f"  Address: {host}:{port}")
                print(f"  Players online: {players}")
                print(f"  Active captures: {captures}")
                
                sock.close()
                return (host, port)
                
        except socket.timeout:
            print("No Hub found via multicast discovery")
        except Exception as e:
            print(f"Discovery error: {e}")
        
        if sock:
            sock.close()
        return None
    
    async def run(self, auto_discover: bool = True):
        """メインループ"""
        # 自動検索が有効な場合
        if auto_discover and not self.hub_url.startswith('ws://localhost'):
            discovered = self.discover_hub()
            if discovered:
                host, port = discovered
                self.hub_url = f'ws://{host}:{port}'
                print(f"\nUsing discovered Hub: {self.hub_url}")
            else:
                print(f"\nUsing default/configured Hub: {self.hub_url}")
        
        # Hubに接続
        if not await self.connect_to_hub():
            print("Failed to connect to Hub. Please check if Hub is running.")
            return
        
        # パケットキャプチャスレッド開始
        import threading
        capture_thread = threading.Thread(target=self.start_capture, daemon=True)
        capture_thread.start()
        
        # 非同期タスク起動
        try:
            await asyncio.gather(
                self.send_packet_batch(),
                self.receive_messages()
            )
        except KeyboardInterrupt:
            print("\nShutting down...")
        finally:
            self.is_capturing = False
            if self.ws:
                await self.ws.close()

def get_local_ip() -> str:
    """ローカルIPアドレス取得"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"

def main():
    parser = argparse.ArgumentParser(description='PCAP-Nyan Packet Capture Client')
    parser.add_argument('--hub', type=str, help='Hub server URL (default: auto-discover or ws://localhost:8766)')
    parser.add_argument('--name', type=str, help='Source name for identification')
    parser.add_argument('--interface', type=str, help='Network interface to capture')
    parser.add_argument('--no-discover', action='store_true', help='Disable auto-discovery')
    
    args = parser.parse_args()
    
    # Hub URL構築
    hub_url = None
    auto_discover = not args.no_discover
    
    if args.hub:
        hub_url = args.hub
        if not hub_url.startswith('ws://'):
            # ホスト:ポート形式の場合
            hub_url = f'ws://{hub_url}'
        auto_discover = False  # 明示的に指定された場合は自動検索しない
    
    print(f"""
========================================
PCAP-Nyan Packet Capture Client
========================================

Discovery: {'Enabled' if auto_discover else 'Disabled'}
Hub Server: {hub_url or 'Auto-discover or ws://localhost:8766'}
Source Name: {args.name or f'{socket.gethostname()}_capture'}
Local IP: {get_local_ip()}

Note: Run with sudo/administrator privileges for packet capture

Press Ctrl+C to stop
========================================
    """)
    
    client = PacketCaptureClient(
        hub_url=hub_url,
        source_name=args.name
    )
    
    try:
        asyncio.run(client.run(auto_discover=auto_discover))
    except KeyboardInterrupt:
        print("\nCapture client stopped.")

if __name__ == '__main__':
    main()