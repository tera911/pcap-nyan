#!/usr/bin/env python3
import time
import json
import threading
import asyncio
import websockets
from scapy.all import *
from collections import deque
import hashlib

class PacketCapture:
    def __init__(self):
        self.packets = deque(maxlen=200)  # Increased to 200 for higher throughput
        self.is_capturing = False
        self.map_data = []
        self.connected_clients = set()
        self.packet_count = 0
        self.last_packet_time = None
        
    def packet_handler(self, packet):
        if not self.is_capturing:
            return
            
        packet_info = {
            'timestamp': time.time(),
            'size': len(packet),
            'protocol': None,
            'src_ip': None,
            'dst_ip': None
        }
        
        if packet.haslayer(IP):
            packet_info['src_ip'] = packet[IP].src
            packet_info['dst_ip'] = packet[IP].dst
            
            if packet.haslayer(TCP):
                packet_info['protocol'] = 'TCP'
                packet_info['src_port'] = packet[TCP].sport
                packet_info['dst_port'] = packet[TCP].dport
            elif packet.haslayer(UDP):
                packet_info['protocol'] = 'UDP'
                packet_info['src_port'] = packet[UDP].sport
                packet_info['dst_port'] = packet[UDP].dport
            elif packet.haslayer(ICMP):
                packet_info['protocol'] = 'ICMP'
        
        self.packets.append(packet_info)
        self.packet_count += 1
        self.last_packet_time = time.time()
        self.update_map()
    
    def update_map(self):
        self.map_data = []
        current_time = time.time()
        
        # Process more recent packets (within last 15 seconds for more bullets)
        for packet in self.packets:
            if not packet or current_time - packet['timestamp'] > 15:  # Was 10, now 15
                continue
            
            # Smart port selection - prefer service ports
            game_port = self.select_game_port(packet)
            
            # For ICMP packets, we need special handling since they don't have ports
            if packet.get('protocol') == 'ICMP':
                # ICMP uses type and code instead of ports
                # We'll assign a random port in the well-known range for visualization
                import random
                game_port = random.randint(1, 1023)  # Random position in well-known range
            elif not game_port or game_port <= 0:
                continue
            
            # Normalize port number to 0-100% range
            # Include all port ranges now
            if game_port < 1024:
                # Well-known ports: normalize to 0-30%
                normalized_x = (game_port / 1023) * 30
            elif game_port >= 49152:
                # Ephemeral ports: normalize to 70-100%
                normalized_x = 70 + ((game_port - 49152) / (65535 - 49152)) * 30
            else:
                # Dynamic/registered ports: normalize to 30-70%
                normalized_x = 30 + ((game_port - 1024) / (49151 - 1024)) * 40
            
            obstacle = {
                'x_percent': normalized_x,  # Send as percentage (0-100)
                'size': packet.get('size', 100),  # Send raw packet size
                'protocol': packet.get('protocol', 'UNKNOWN'),
                'src_ip': packet.get('src_ip', 'Unknown'),
                'dst_ip': packet.get('dst_ip', 'Unknown'),
                'src_port': packet.get('src_port', 0),
                'dst_port': packet.get('dst_port', 0),
                'age': current_time - packet['timestamp'],
                'game_port': game_port
            }
            
            self.map_data.append(obstacle)
    
    def select_game_port(self, packet):
        """Select port number prioritizing service ports for educational value"""
        if not packet:
            import random
            return random.randint(1024, 10000)
            
        src_port = packet.get('src_port', 0)
        dst_port = packet.get('dst_port', 0)
        
        # Prioritize service ports (lower numbers) over ephemeral ports
        # This makes the game more educational by showing actual services
        
        # First, check for well-known service ports (< 1024)
        if dst_port and dst_port < 1024:
            return dst_port
        elif src_port and src_port < 1024:
            return src_port
        
        # Then check for registered service ports (1024-10000)
        elif dst_port and dst_port < 10000:
            return dst_port
        elif src_port and src_port < 10000:
            return src_port
        
        # Then check for any dst_port (likely the service side)
        elif dst_port and dst_port > 0:
            return dst_port
        elif src_port and src_port > 0:
            return src_port
        else:
            # Fallback to random service range port
            import random
            return random.randint(1024, 10000)
    
    def normalize_port_to_percentage(self, port):
        """Normalize port number to 0-100% range, including all ports"""
        if not port or port <= 0:
            return None  # Skip invalid ports
        
        if port < 1024:
            # Well-known ports: normalize to 0-30%
            return (port / 1023) * 30
        elif port >= 49152:
            # Ephemeral port range (49152-65535): normalize to 70-100%
            return 70 + ((port - 49152) / (65535 - 49152)) * 30
        else:
            # Dynamic/registered port range (1024-49151): normalize to 30-70%
            return 30 + ((port - 1024) / (49151 - 1024)) * 40
    
    def get_port_effect(self, port):
        """Determine special effect based on port number characteristics"""
        if not port:
            return 'normal'
        
        last_digit = port % 10
        effects = {
            0: 'normal',
            1: 'bounce',
            2: 'speed',
            3: 'slow',
            4: 'spring',
            5: 'coin',
            6: 'moving_h',
            7: 'moving_v',
            8: 'crumble',
            9: 'bonus'
        }
        
        # Check for special patterns
        if self.is_prime(port):
            return 'golden'
        
        # Check for repeating digits (e.g., 55555)
        port_str = str(port)
        if len(set(port_str)) == 1:
            return 'rainbow'
        
        return effects.get(last_digit, 'normal')
    
    def get_platform_type(self, port, size):
        """Determine platform visual type based on port and size"""
        if size < 200:
            return 'small'
        elif size < 800:
            return 'medium'
        else:
            return 'large'
    
    def is_prime(self, n):
        """Check if a number is prime"""
        if n < 2:
            return False
        for i in range(2, int(n ** 0.5) + 1):
            if n % i == 0:
                return False
        return True
    
    def ip_to_x_coordinate(self, ip_str):
        if not ip_str:
            return 400
        hash_obj = hashlib.md5(ip_str.encode())
        return int(hash_obj.hexdigest()[:4], 16) % 800
    
    def packet_size_to_y_coordinate(self, size):
        return (size % 500) + 50
    
    def start_capture(self, interface='en0'):
        self.is_capturing = True
        print(f"Starting packet capture on {interface}...")
        sniff(iface=interface, prn=self.packet_handler, store=False)
    
    def stop_capture(self):
        self.is_capturing = False
        print("Packet capture stopped.")
    
    async def websocket_handler(self, websocket):
        print(f"Client connected: {websocket}")
        self.connected_clients.add(websocket)
        
        try:
            await websocket.send(json.dumps({
                'type': 'connected',
                'message': 'Connected to packet capture server'
            }))
            
            async for message in websocket:
                data = json.loads(message)
                
                if data['type'] == 'start_capture':
                    if not self.is_capturing:
                        threading.Thread(target=self.start_capture, daemon=True).start()
                    
                elif data['type'] == 'stop_capture':
                    self.stop_capture()
                    
                elif data['type'] == 'get_map':
                    await websocket.send(json.dumps({
                        'type': 'map_update',
                        'obstacles': self.map_data
                    }))
                    
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.discard(websocket)
            print(f"Client disconnected: {websocket}")
    
    async def broadcast_map_updates(self):
        while True:
            if self.connected_clients:
                current_time = time.time()
                is_receiving_packets = (
                    self.last_packet_time and 
                    current_time - self.last_packet_time < 5
                )
                
                message = json.dumps({
                    'type': 'map_update',
                    'obstacles': self.map_data,
                    'packet_count': self.packet_count,
                    'is_capturing': self.is_capturing,
                    'is_receiving_packets': is_receiving_packets,
                    'packets_per_minute': len([p for p in self.packets if current_time - p['timestamp'] < 60])
                })
                
                disconnected = set()
                for client in self.connected_clients:
                    try:
                        await client.send(message)
                    except websockets.exceptions.ConnectionClosed:
                        disconnected.add(client)
                
                for client in disconnected:
                    self.connected_clients.discard(client)
            
            await asyncio.sleep(0.2)  # Faster updates: was 0.5, now 0.2
    
    async def start_server(self):
        print("Starting WebSocket server on ws://localhost:8765")
        
        server = await websockets.serve(
            self.websocket_handler, 
            "localhost", 
            8765
        )
        
        await asyncio.gather(
            server.wait_closed(),
            self.broadcast_map_updates()
        )

if __name__ == "__main__":
    capture = PacketCapture()
    
    try:
        asyncio.run(capture.start_server())
    except KeyboardInterrupt:
        print("\nShutting down server...")
        capture.stop_capture()