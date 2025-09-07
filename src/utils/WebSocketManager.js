export default class WebSocketManager {
    constructor() {
        this.ws = null;
        this.callbacks = {
            onMapUpdate: null,
            onConnected: null,
            onDisconnected: null,
            onGameState: null,
            onPlayerEvent: null,
            onLeaderboard: null
        };
        this.packetStats = {
            count: 0,
            isCapturing: false,
            isReceivingPackets: false,
            packetsPerMinute: 0
        };
        this.playerId = null;
        this.playerName = 'Player' + Math.floor(Math.random() * 1000);
        this.gameMode = 'player'; // 'player' or 'spectator'
        this.connect();
    }

    getHubUrl() {
        // 同一ホストのHubサーバーに接続
        const protocol = 'ws:';
        const hostname = window.location.hostname || 'localhost';
        const port = 8766;
        return `${protocol}//${hostname}:${port}`;
    }

    connect() {
        const hubUrl = this.getHubUrl();
        // console.log(`Connecting to Hub: ${hubUrl}`);
        this.ws = new WebSocket(hubUrl);
        
        this.ws.onopen = () => {
            // console.log('WebSocket connected to Hub');
            this.updateStatus('connected');
            
            // Authenticate as game client
            this.authenticate();
            
            if (this.callbacks.onConnected) {
                this.callbacks.onConnected();
            }
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'auth_success':
                    this.playerId = data.player_id;
                    // console.log(`Authenticated as player: ${this.playerId}`);
                    break;
                    
                case 'game_state':
                    // Convert bullets to obstacles format for compatibility
                    const obstacles = (data.bullets || []).map(bullet => ({
                        x_percent: (bullet.x / 800) * 100, // Convert to percentage
                        size: bullet.size * 10, // Adjust size
                        protocol: bullet.protocol,
                        src_ip: bullet.src_ip || bullet.source,  // Use actual IP if available
                        dst_ip: bullet.dst_ip || '',
                        src_port: bullet.src_port || bullet.port,
                        dst_port: bullet.dst_port || bullet.port,
                        age: 0,
                        game_port: bullet.port,
                        source: bullet.source,
                        source_name: bullet.source_name,
                        src_name: bullet.src_name || bullet.source_name,  // Add src_name for label
                        source_id: bullet.source_id || bullet.source, // Add source_id for spawn position
                        color: bullet.color
                    }));
                    
                    // Update packet stats from capture sources
                    const sources = data.capture_sources || {};
                    const activeSourceCount = Object.values(sources).filter(s => s.active).length;
                    
                    this.packetStats = {
                        count: data.bullets ? data.bullets.length : 0,
                        isCapturing: activeSourceCount > 0,
                        isReceivingPackets: activeSourceCount > 0,
                        packetsPerMinute: 0
                    };
                    
                    this.updatePacketStats();
                    
                    if (this.callbacks.onMapUpdate) {
                        this.callbacks.onMapUpdate(obstacles);
                    }
                    
                    if (this.callbacks.onGameState) {
                        // Convert capture_sources object to active_sources array for SourceManager
                        const active_sources = [];
                        if (data.capture_sources) {
                            let sourceIndex = 0;
                            Object.entries(data.capture_sources).forEach(([id, source]) => {
                                if (source.active) {
                                    // Try different field names for IP address
                                    let ipAddress = source.ip || source.ip_address || source.host;
                                    
                                    // Check if IP looks like just the 4th octet (e.g., "100")
                                    if (ipAddress && !ipAddress.includes('.')) {
                                        // Convert single number to full IP
                                        ipAddress = `192.168.1.${ipAddress}`;
                                        // console.log(`Converted octet ${source.ip} to full IP: ${ipAddress}`);
                                    }
                                    
                                    // If still no valid IP, generate a test IP based on index for positioning
                                    if (!ipAddress || ipAddress === 'unknown') {
                                        // Generate test IP like 192.168.1.X where X varies
                                        const testOctet = 10 + (sourceIndex * 50); // Spread sources across screen
                                        ipAddress = `192.168.1.${testOctet % 256}`;
                                        // console.log(`Generated test IP for ${id}: ${ipAddress}`);
                                    }
                                    
                                    // console.log(`Source ${id}: IP=${ipAddress}, raw data:`, source);
                                    
                                    active_sources.push({
                                        source_id: id,
                                        source_name: source.name || id,
                                        ip_address: ipAddress,
                                        packet_rate: source.packets_per_second || 0
                                    });
                                    sourceIndex++;
                                }
                            });
                        }
                        
                        const gameStateWithSources = {
                            ...data,
                            active_sources: active_sources
                        };
                        
                        this.callbacks.onGameState(gameStateWithSources);
                    }
                    break;
                    
                case 'player_event':
                    if (this.callbacks.onPlayerEvent) {
                        this.callbacks.onPlayerEvent(data);
                    }
                    break;
                    
                case 'leaderboard':
                    if (this.callbacks.onLeaderboard) {
                        this.callbacks.onLeaderboard(data);
                    }
                    break;
                    
                case 'error':
                    console.error(`Hub error: ${data.code} - ${data.message}`);
                    break;
            }
        };
        
        this.ws.onclose = () => {
            // console.log('WebSocket disconnected');
            this.updateStatus('disconnected');
            if (this.callbacks.onDisconnected) {
                this.callbacks.onDisconnected();
            }
            setTimeout(() => this.connect(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    updateStatus(status) {
        const wsStatus = document.getElementById('ws-status');
        if (wsStatus) {
            wsStatus.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
            wsStatus.className = `status-indicator ${status === 'connected' ? 'connected' : 'disconnected'}`;
        }
    }
    
    updatePacketStats() {
        const captureStatus = document.getElementById('capture-status');
        const packetStatus = document.getElementById('packet-status');
        const packetTotal = document.getElementById('packet-total');
        const packetRate = document.getElementById('packet-rate');
        
        if (captureStatus) {
            if (this.packetStats.isCapturing) {
                captureStatus.textContent = 'Capturing';
                captureStatus.className = 'status-indicator capturing';
            } else {
                captureStatus.textContent = 'Stopped';
                captureStatus.className = 'status-indicator stopped';
            }
        }
        
        if (packetStatus) {
            let status, className;
            if (!this.packetStats.isCapturing) {
                status = 'STOPPED';
                className = 'stopped';
            } else if (this.packetStats.isReceivingPackets) {
                status = 'ACTIVE';
                className = 'active';
            } else {
                status = 'IDLE';
                className = 'idle';
            }
            packetStatus.textContent = status;
            packetStatus.className = className;
        }
        
        if (packetTotal) {
            packetTotal.textContent = this.packetStats.count;
        }
        
        if (packetRate) {
            packetRate.textContent = `${this.packetStats.packetsPerMinute}/min`;
        }
    }
    
    authenticate() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'game_auth',
                client_type: 'game',
                mode: this.gameMode,
                player_name: this.playerName,
                avatar: 'nyan_cat'
            }));
        }
    }
    
    sendPlayerMove(x, y) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.playerId) {
            this.ws.send(JSON.stringify({
                type: 'player_move',
                player_id: this.playerId,
                x: x,
                y: y
            }));
        }
    }
    
    sendPlayerHit(bulletId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.playerId) {
            this.ws.send(JSON.stringify({
                type: 'player_hit',
                player_id: this.playerId,
                bullet_id: bulletId
            }));
        }
    }
    
    sendPlayerGraze(bulletId, distance) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.playerId) {
            this.ws.send(JSON.stringify({
                type: 'player_graze',
                player_id: this.playerId,
                bullet_id: bulletId,
                distance: distance
            }));
        }
    }
    
    sendGameControl(action) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.playerId) {
            this.ws.send(JSON.stringify({
                type: 'game_control',
                action: action, // 'start', 'restart', 'pause'
                player_id: this.playerId
            }));
        }
    }
    
    // Legacy compatibility methods
    startCapture() {
        // No longer needed - capture is handled by separate clients
        // console.log('Capture is now handled by packet_capture_client.py');
    }
    
    stopCapture() {
        // No longer needed
        // console.log('Capture is now handled by packet_capture_client.py');
    }
    
    requestMap() {
        // No longer needed - Hub sends game_state automatically
    }
    
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
}