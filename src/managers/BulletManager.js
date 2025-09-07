import Phaser from 'phaser';

export default class BulletManager {
    constructor(scene) {
        this.scene = scene;
        this.bulletGroup = null;
        this.dodgedBullets = 0;
        this.grazeCount = 0;
        
        // Packet classification counters
        this.packetStats = {
            tcp: 0,
            udp: 0,
            icmp: 0,
            total: 0,
            http: 0,
            ssh: 0,
            dns: 0,
            wellknown: 0,
            ephemeral: 0,
            private: 0,
            broadcast: 0,
            loopback: 0
        };
    }
    
    create() {
        // Bullet group with increased capacity
        this.bulletGroup = this.scene.physics.add.group({
            maxSize: 500,
            runChildUpdate: true
        });
    }
    
    createPacketBullet(packet, difficulty = 1, targetX = null) {
        const { protocol, src_port, dst_port, size, src_ip, dst_ip, src_name, color: bulletColor, tcp_flags, spawn_x, spawn_y } = packet;
        const port = dst_port || src_port || 0;
        
        // Update statistics with both ports for better classification
        this.updatePacketStats(protocol, src_port, dst_port, src_ip);
        
        // Detect IP address type
        let ipType = 'global';
        if (src_ip) {
            if (src_ip.startsWith('192.168.') || src_ip.startsWith('10.') || src_ip.startsWith('172.')) {
                ipType = 'private';
            } else if (src_ip === '127.0.0.1' || src_ip.startsWith('127.')) {
                ipType = 'loopback';
            } else if (src_ip.endsWith('.255') || src_ip === '255.255.255.255') {
                ipType = 'broadcast';
            }
        }
        
        // Special handling for well-known ports (ITパスポート level)
        let specialPattern = null;
        let baseVy = 100;
        let baseVx = 0;
        
        // Well-known port patterns
        switch(port) {
            case 80:  // HTTP - straight down
                specialPattern = 'straight';
                baseVy = 140;
                break;
            case 443: // HTTPS - zigzag (encrypted)
                specialPattern = 'zigzag';
                baseVy = 120;
                break;
            case 20:  // FTP data
            case 21:  // FTP control - double bullet
                specialPattern = 'double';
                baseVy = 100;
                break;
            case 22:  // SSH - fast secure
                specialPattern = 'fast';
                baseVy = 200;
                break;
            case 25:  // SMTP - chain mail
                specialPattern = 'chain';
                baseVy = 110;
                break;
            case 53:  // DNS - seeking (name resolution)
                specialPattern = 'seeking';
                baseVy = 90;
                break;
            case 110: // POP3 - pulling mail
                specialPattern = 'pulling';
                baseVy = 100;
                break;
            case 67:  // DHCP server
            case 68:  // DHCP client - spreading
                specialPattern = 'spreading';
                baseVy = 80;
                break;
        }
        
        // Use spawn position from source circle if available, otherwise use port-based position
        let x, y;
        if (spawn_x !== undefined && spawn_y !== undefined) {
            // Bullet spawns from source circle
            x = spawn_x;
            y = spawn_y + 20; // Slightly below the source circle
        } else {
            // Default port-based positioning
            if (port <= 1023) {
                // Well-known ports get special positions
                x = 100 + ((port / 1023) * 600);
            } else {
                const normalizedPort = ((port - 1024) / (65535 - 1024));
                x = targetX !== null ? targetX : 100 + (normalizedPort * 600);
            }
            y = -20;
        }
        
        // Calculate velocities
        let vx = baseVx;
        let vy = baseVy;
        
        // If spawning from source, add slight spread for visual effect
        if (spawn_x !== undefined) {
            vx = (Math.random() - 0.5) * 30; // Slight random horizontal spread
        }
        
        // Apply special patterns
        if (specialPattern) {
            switch(specialPattern) {
                case 'straight':
                    vx = 0;
                    break;
                case 'zigzag':
                    vx = Math.sin(this.scene.time.now * 0.01 + port) * 250;  // Increased from 150
                    break;
                case 'fast':
                    vy = 200;
                    vx = 0;
                    break;
                case 'seeking':
                    // DNS tracking - stronger initial tracking
                    const dx = this.scene.playerManager.getPosition().x - x;
                    vx = dx * 0.01;  // Stronger initial tracking
                    break;
                case 'pulling':
                    vy = 100;
                    vx = (400 - x) * 0.4; // Stronger pull toward center (increased from 0.2)
                    break;
                case 'spreading':
                    vx = (Math.random() - 0.5) * 350; // Wider random spread (increased from 200)
                    break;
                case 'chain':
                    // Will create multiple bullets
                    break;
                case 'double':
                    // Create companion bullet
                    if (port === 20) {
                        this.createBulletWithInfo(x + 20, y, 10, vy, protocol, size, port, src_ip, src_name, bulletColor);
                    }
                    break;
            }
        } else {
            // Original pattern for non-well-known ports
            if (targetX !== null && targetX !== x) {
                const horizontalDistance = targetX - x;
                const timeToBottom = 600 / vy;
                vx = horizontalDistance / timeToBottom;
                
                if (port % 2 === 0) {
                    vx += 10 + (port % 50) * 0.3;
                } else {
                    vx -= 10 + (port % 50) * 0.3;
                }
            } else {
                if (port % 2 === 0) {
                    vx = 20 + (port % 100) * 0.5;
                } else {
                    vx = -20 - (port % 100) * 0.5;
                }
            }
            
            // Prime ports still get special treatment
            if (this.isPrime(port)) {
                vx = Math.sin(this.scene.time.now * 0.003 + port) * 100;
            }
        }
        
        // Protocol-specific base speeds (if not already set by special pattern)
        if (!specialPattern) {
            switch(protocol) {
                case 'TCP':
                    vy = 120;
                    break;
                case 'UDP':
                    vy = 150;
                    vx *= 1.5;
                    break;
                case 'ICMP':
                    vy = 180;
                    if (targetX === null) {
                        vx = 0;
                    }
                    break;
            }
        }
        
        // Apply IP type modifiers
        switch(ipType) {
            case 'private':
                // Private IP - slower internal traffic
                vy = vy * 0.7;
                break;
            case 'loopback':
                // Loopback - will U-turn
                specialPattern = 'loopback';
                break;
            case 'broadcast':
                // Broadcast - spreads horizontally
                specialPattern = 'broadcast';
                vx = 0; // Will be handled in update
                vy = vy * 0.8;
                break;
        }
        
        // Apply difficulty scaling to speed (8% increase per level, more gradual)
        vy = vy * (1 + (difficulty - 1) * 0.08);
        
        // Create the bullet with additional info
        const bulletData = { x, y, vx, vy, protocol, size, port, src_ip, src_name, bulletColor, tcp_flags, specialPattern, ipType, src_port, dst_port };
        this.createBulletWithInfo(bulletData);
    }
    
    createBulletWithInfo(bulletData) {
        // Destructure bullet data
        const { x, y, vx, vy, protocol, size, port, src_ip: source, src_name: sourceName, 
                bulletColor, tcp_flags, specialPattern, ipType, src_port, dst_port } = bulletData;
        
        // Set bullet color
        let color = 0x808080;
        if (bulletColor) {
            color = parseInt(bulletColor.replace('#', ''), 16);
        } else {
            // Special colors for well-known ports
            if (specialPattern) {
                switch(port) {
                    case 80: color = 0x00AAFF; break;   // HTTP - light blue
                    case 443: color = 0xFFAA00; break;  // HTTPS - orange
                    case 22: color = 0xFF00FF; break;   // SSH - magenta
                    case 53: color = 0xAAFF00; break;   // DNS - lime
                    case 25: color = 0xFFFF00; break;   // SMTP - yellow
                    default:
                        switch(protocol) {
                            case 'TCP': color = 0xFF6666; break;
                            case 'UDP': color = 0x6666FF; break;
                            case 'ICMP': color = 0x66FF66; break;
                        }
                }
            } else {
                switch(protocol) {
                    case 'TCP': color = 0xFF6666; break;
                    case 'UDP': color = 0x6666FF; break;
                    case 'ICMP': color = 0x66FF66; break;
                }
            }
        }
        
        // Bullet size and physics based on packet size
        let bulletRadius = 4;
        let gravityScale = 1;
        let fragmentOnMTU = false;
        
        if (size < 100) {
            // Small control packets - fast and small
            bulletRadius = 3;
            gravityScale = 0.5; // Less gravity effect
        } else if (size < 500) {
            // Normal data packets
            bulletRadius = 5;
            gravityScale = 1;
        } else if (size < 1500) {
            // Large packets
            bulletRadius = 7;
            gravityScale = 1.5; // More gravity effect
        } else {
            // MTU exceeded - will fragment
            bulletRadius = 9;
            gravityScale = 2;
            fragmentOnMTU = true;
        }
        
        // Create the bullet
        const bullet = this.scene.add.circle(x, y, bulletRadius, color);
        
        // Add trail effect for better visibility
        const trail = this.scene.add.circle(x, y, bulletRadius * 0.7, color, 0.3);
        bullet.trail = trail;
        
        // Special visual effects based on pattern
        if (specialPattern) {
            switch(specialPattern) {
                case 'zigzag':
                    bullet.setStrokeStyle(3, 0xFFAA00, 1); // Orange stroke for encrypted
                    break;
                case 'fast':
                    bullet.setStrokeStyle(2, 0xFFFF00, 1); // Yellow stroke for fast
                    break;
                case 'seeking':
                    bullet.setStrokeStyle(2, 0x00FF00, 0.8); // Green stroke for tracking
                    break;
                case 'loopback':
                    bullet.setStrokeStyle(3, 0xFF00FF, 1); // Magenta for loopback
                    break;
                case 'broadcast':
                    bullet.setStrokeStyle(3, 0x00FFFF, 1); // Cyan for broadcast
                    break;
                default:
                    bullet.setStrokeStyle(2, 0xFFFFFF, 0.8);
            }
        } else if (ipType === 'private') {
            bullet.setStrokeStyle(2, 0x808080, 0.8); // Gray for internal
        } else if (fragmentOnMTU) {
            bullet.setStrokeStyle(3, 0xFF0000, 1); // Red stroke for MTU exceeded
        } else if (sourceName && sourceName !== 'Unknown') {
            bullet.setStrokeStyle(2, 0xFFFFFF, 0.8);
        } else {
            bullet.setStrokeStyle(1, 0xFFFFFF);
        }
        
        // Add source indicator if available (extremely transparent)
        if (sourceName && sourceName !== 'Unknown') {
            const sourceLabel = this.scene.add.text(x, y - 25, sourceName.substring(0, 8), {
                fontSize: '5px',
                color: '#FFD700',
                backgroundColor: 'rgba(0,0,0,0.05)',  // Almost invisible
                padding: { x: 0, y: 0 }
            });
            sourceLabel.setOrigin(0.5);
            sourceLabel.setAlpha(0.15);  // Extremely transparent (was 0.3)
            bullet.sourceLabel = sourceLabel;
        }
        
        // No port number label anymore
        // const label = this.scene.add.text(x, y, `${port}`, {
        //     fontSize: '7px',
        //     color: '#FFFFFF',
        //     backgroundColor: 'rgba(0,0,0,0.4)',
        //     padding: { x: 1, y: 0 }
        // });
        // label.setOrigin(0.5);
        
        // Add application-level service name for all bullets
        let serviceText = '';
        
        // First check for special patterns (well-known services)
        if (specialPattern) {
            switch(specialPattern) {
                case 'straight': serviceText = 'HTTP'; break;
                case 'zigzag': serviceText = 'HTTPS'; break;
                case 'fast': serviceText = 'SSH'; break;
                case 'seeking': serviceText = 'DNS'; break;
                case 'pulling': serviceText = 'POP3'; break;
                case 'spreading': serviceText = 'DHCP'; break;
                case 'chain': serviceText = 'SMTP'; break;
                case 'double': serviceText = 'FTP'; break;
                case 'loopback': serviceText = 'LOOP'; break;
                case 'broadcast': serviceText = 'BCAST'; break;
            }
        } else {
            // Map common ports to services
            switch(port) {
                // Web services
                case 8080: serviceText = 'HTTP-ALT'; break;
                case 8443: serviceText = 'HTTPS-ALT'; break;
                case 3000: serviceText = 'DEV-SRV'; break;
                case 4000: serviceText = 'DEV-APP'; break;
                case 5000: serviceText = 'FLASK'; break;
                case 8000: serviceText = 'HTTP-DEV'; break;
                case 9000: serviceText = 'PHP-FPM'; break;
                
                // Database services
                case 3306: serviceText = 'MySQL'; break;
                case 5432: serviceText = 'PostgreSQL'; break;
                case 27017: serviceText = 'MongoDB'; break;
                case 6379: serviceText = 'Redis'; break;
                case 11211: serviceText = 'Memcached'; break;
                
                // Messaging & Communication
                case 5672: serviceText = 'RabbitMQ'; break;
                case 9092: serviceText = 'Kafka'; break;
                case 1883: serviceText = 'MQTT'; break;
                case 5222: serviceText = 'XMPP'; break;
                case 6667: serviceText = 'IRC'; break;
                
                // Remote access & File transfer
                case 23: serviceText = 'Telnet'; break;
                case 3389: serviceText = 'RDP'; break;
                case 5900: serviceText = 'VNC'; break;
                case 445: serviceText = 'SMB'; break;
                case 139: serviceText = 'NetBIOS'; break;
                case 2049: serviceText = 'NFS'; break;
                
                // Email & Calendar
                case 143: serviceText = 'IMAP'; break;
                case 993: serviceText = 'IMAPS'; break;
                case 587: serviceText = 'SMTP-SUB'; break;
                case 465: serviceText = 'SMTPS'; break;
                
                // Network services
                case 123: serviceText = 'NTP'; break;
                case 161: serviceText = 'SNMP'; break;
                case 162: serviceText = 'SNMP-TRAP'; break;
                case 514: serviceText = 'Syslog'; break;
                
                // Container & Cloud
                case 2375: serviceText = 'Docker'; break;
                case 2376: serviceText = 'Docker-TLS'; break;
                case 6443: serviceText = 'K8s-API'; break;
                case 10250: serviceText = 'Kubelet'; break;
                case 2379: serviceText = 'etcd'; break;
                
                // Gaming & Streaming
                case 25565: serviceText = 'Minecraft'; break;
                case 27015: serviceText = 'Source'; break;
                case 7777: serviceText = 'GameSrv'; break;
                case 1935: serviceText = 'RTMP'; break;
                case 8554: serviceText = 'RTSP'; break;
                
                // VPN & Proxy
                case 1194: serviceText = 'OpenVPN'; break;
                case 1723: serviceText = 'PPTP'; break;
                case 500: serviceText = 'IKE'; break;
                case 4500: serviceText = 'IPSec'; break;
                case 1080: serviceText = 'SOCKS'; break;
                case 3128: serviceText = 'Squid'; break;
                case 8888: serviceText = 'Proxy'; break;
                
                // Default fallback based on port range
                default:
                    if (port >= 49152) {
                        // Ephemeral port - try to identify based on the other port
                        const otherPort = (port === src_port) ? dst_port : src_port;
                        if (otherPort) {
                            switch(otherPort) {
                                case 80: serviceText = 'HTTP-Client'; break;
                                case 443: serviceText = 'HTTPS-Client'; break;
                                case 22: serviceText = 'SSH-Client'; break;
                                case 3306: serviceText = 'MySQL-Client'; break;
                                case 5432: serviceText = 'PgSQL-Client'; break;
                                case 6379: serviceText = 'Redis-Client'; break;
                                case 27017: serviceText = 'Mongo-Client'; break;
                                case 25: serviceText = 'SMTP-Client'; break;
                                case 110: serviceText = 'POP3-Client'; break;
                                case 143: serviceText = 'IMAP-Client'; break;
                                case 3389: serviceText = 'RDP-Client'; break;
                                case 5900: serviceText = 'VNC-Client'; break;
                                default: serviceText = 'Client'; break;
                            }
                        } else {
                            serviceText = 'Ephemeral';
                        }
                    } else if (port >= 1024 && port < 5000) {
                        serviceText = 'App';  // User applications
                    } else if (port >= 5000 && port < 10000) {
                        serviceText = 'Service';  // Various services
                    } else if (port >= 10000 && port < 30000) {
                        serviceText = 'Custom';  // Custom applications
                    } else if (port >= 30000 && port < 49152) {
                        serviceText = 'Dynamic';  // Dynamic/private ports
                    } else if (protocol === 'ICMP') {
                        serviceText = 'Ping';
                    } else {
                        // Very rare to get here, but fallback to protocol
                        serviceText = protocol || 'Unknown';
                    }
            }
        }
        
        // Add the service label with port number (extremely transparent)
        if (serviceText && serviceText !== 'Unknown') {
            // Add port number to service text
            const labelText = `${serviceText}:${port}`;
            
            const typeLabel = this.scene.add.text(x, y - 15, labelText, {
                fontSize: '8px',  // Even smaller
                color: '#FFD700',
                fontStyle: 'normal',
                backgroundColor: 'rgba(0,0,0,0.1)',  // Almost invisible background
                padding: { x: 1, y: 0 },
                stroke: '#000000',
                strokeThickness: 0.3  // Very thin stroke
            });
            typeLabel.setOrigin(0.5);
            typeLabel.setDepth(10);
            typeLabel.setAlpha(0.25);  // Very transparent (was 0.4)
            bullet.typeLabel = typeLabel;
        }
        
        // Store references
        // bullet.label = label;  // No label anymore
        bullet.port = port;
        bullet.source = source;
        bullet.sourceName = sourceName;
        bullet.protocol = protocol;
        bullet.specialPattern = specialPattern;
        bullet.tcp_flags = tcp_flags;
        bullet.ipType = ipType;
        bullet.gravityScale = gravityScale;
        bullet.fragmentOnMTU = fragmentOnMTU;
        bullet.size = size;
        
        // Add to physics group
        this.bulletGroup.add(bullet);
        
        // Set physics properties
        this.scene.physics.add.existing(bullet);
        bullet.body.setVelocity(vx, vy);
        bullet.body.setCircle(bulletRadius);
        
        bullet.grazed = false;
        bullet.counted = false;
        
        // Update label position in update loop
        bullet.updateLabel = () => {
            // if (bullet.label) {  // No port label anymore
            //     bullet.label.x = bullet.x;
            //     bullet.label.y = bullet.y;
            // }
            if (bullet.sourceLabel) {
                bullet.sourceLabel.x = bullet.x;
                bullet.sourceLabel.y = bullet.y - 25;  // Above the service label
            }
            if (bullet.typeLabel) {
                bullet.typeLabel.x = bullet.x;
                bullet.typeLabel.y = bullet.y - 12;  // Closer to bullet
            }
            
            // Update trail position
            if (bullet.trail) {
                bullet.trail.x = bullet.x;
                bullet.trail.y = bullet.y - 8;  // Slightly behind the bullet
                bullet.trail.setAlpha(0.2);  // Fade trail
            }
        };
    }
    
    updateBullets(gameStarted, gameOver) {
        let bulletsDodged = 0;
        
        this.bulletGroup.children.entries.forEach(bullet => {
            if (!bullet.active) return;
            
            // Update label position
            if (bullet.updateLabel) {
                bullet.updateLabel();
            }
            
            // Apply special pattern behaviors during update
            if (bullet.specialPattern) {
                switch(bullet.specialPattern) {
                    case 'zigzag':
                        // HTTPS encrypted motion - matching initial amplitude
                        bullet.body.velocity.x = Math.sin(this.scene.time.now * 0.01 + bullet.port) * 250;  // Increased to match initial
                        break;
                    case 'seeking':
                        // DNS seeking behavior - track player more aggressively
                        if (this.scene.playerManager) {
                            const playerPos = this.scene.playerManager.getPosition();
                            const dx = playerPos.x - bullet.x;
                            bullet.body.velocity.x += dx * 0.005; // Stronger tracking (increased from 0.002)
                            bullet.body.velocity.x = Math.max(-250, Math.min(250, bullet.body.velocity.x)); // Higher speed limit
                        }
                        break;
                    case 'spreading':
                        // DHCP spread continues
                        bullet.body.velocity.x *= 1.01; // Gradually spread more
                        break;
                    case 'loopback':
                        // Loopback U-turn behavior - more dramatic
                        if (bullet.y > 250 && !bullet.hasUTurned) {  // Earlier U-turn
                            bullet.hasUTurned = true;
                            bullet.body.velocity.y = -bullet.body.velocity.y * 1.2; // Stronger reverse
                            bullet.body.velocity.x = (400 - bullet.x) * 0.8; // Stronger center pull (increased from 0.5)
                        }
                        break;
                    case 'broadcast':
                        // Broadcast spreads horizontally
                        if (bullet.y > 200 && !bullet.hasBroadcast) {
                            bullet.hasBroadcast = true;
                            // Create horizontal spread
                            for (let i = -2; i <= 2; i++) {
                                if (i !== 0) {
                                    const spreadBullet = {
                                        x: bullet.x,
                                        y: bullet.y,
                                        vx: i * 80,
                                        vy: bullet.body.velocity.y * 0.5,
                                        protocol: bullet.protocol,
                                        size: 60,
                                        port: bullet.port,
                                        src_ip: bullet.source,
                                        src_name: bullet.sourceName
                                    };
                                    this.createBulletWithInfo(spreadBullet);
                                }
                            }
                        }
                        break;
                }
            } else if (bullet.port && this.isPrime(bullet.port)) {
                // Wave motion for prime port bullets - more dramatic
                const waveAmplitude = 5;  // Increased from 2
                bullet.body.velocity.x += Math.cos(this.scene.time.now * 0.005 + bullet.port) * waveAmplitude;
            }
            
            // Apply gravity acceleration for large packets
            if (bullet.gravityScale && bullet.gravityScale > 1) {
                // Accelerate downward for heavy packets
                bullet.body.velocity.y += bullet.gravityScale * 0.5;
            }
            
            // MTU fragmentation for oversized packets
            if (bullet.fragmentOnMTU && bullet.y > 150 && !bullet.hasFragmented) {
                bullet.hasFragmented = true;
                // Fragment into smaller packets
                for (let i = 0; i < 3; i++) {
                    const angle = (-60 + i * 60) * Math.PI / 180; // -60, 0, 60 degrees
                    const fragmentBullet = {
                        x: bullet.x,
                        y: bullet.y,
                        vx: Math.sin(angle) * 100,
                        vy: Math.cos(angle) * 150,
                        protocol: bullet.protocol,
                        size: 500, // Fragmented size
                        port: bullet.port,
                        src_ip: bullet.source,
                        src_name: bullet.sourceName
                    };
                    this.createBulletWithInfo(fragmentBullet);
                }
                // Destroy original oversized packet
                // if (bullet.label) bullet.label.destroy();  // No port label anymore
                if (bullet.sourceLabel) bullet.sourceLabel.destroy();
                if (bullet.typeLabel) bullet.typeLabel.destroy();
                if (bullet.trail) bullet.trail.destroy();
                bullet.destroy();
                return; // Skip further processing
            }
            
            // Small packets affected by "wind" (stronger horizontal drift)
            if (bullet.size < 100) {
                const windEffect = Math.sin(this.scene.time.now * 0.002 + bullet.y * 0.01) * 2;  // Increased from 0.5
                bullet.body.velocity.x += windEffect;
            }
            
            // TCP flags behavior (if available)
            if (bullet.tcp_flags) {
                if (bullet.tcp_flags.includes('SYN') && !bullet.tcp_flags.includes('ACK')) {
                    // SYN packet - split into three after some time
                    if (bullet.y > 100 && !bullet.hasSplit) {
                        bullet.hasSplit = true;
                        // Create two additional bullets for 3-way handshake visualization
                        const leftBullet = { 
                            x: bullet.x - 30, 
                            y: bullet.y,
                            vx: bullet.body.velocity.x - 50,
                            vy: bullet.body.velocity.y,
                            protocol: bullet.protocol,
                            size: 100,
                            port: bullet.port,
                            src_ip: bullet.source,
                            src_name: bullet.sourceName
                        };
                        const rightBullet = { 
                            x: bullet.x + 30,
                            y: bullet.y,
                            vx: bullet.body.velocity.x + 50,
                            vy: bullet.body.velocity.y,
                            protocol: bullet.protocol,
                            size: 100,
                            port: bullet.port,
                            src_ip: bullet.source,
                            src_name: bullet.sourceName
                        };
                        this.createBulletWithInfo(leftBullet);
                        this.createBulletWithInfo(rightBullet);
                    }
                } else if (bullet.tcp_flags && bullet.tcp_flags.includes('FIN')) {
                    // FIN packet - explode before disappearing
                    if (bullet.y > 500 && !bullet.hasExploded) {
                        bullet.hasExploded = true;
                        // Create explosion effect
                        for (let i = 0; i < 4; i++) {
                            const angle = (Math.PI * 2 / 4) * i;
                            const explodeBullet = {
                                x: bullet.x,
                                y: bullet.y,
                                vx: Math.cos(angle) * 100,
                                vy: Math.sin(angle) * 100,
                                protocol: bullet.protocol,
                                size: 50,
                                port: bullet.port,
                                src_ip: bullet.source,
                                src_name: bullet.sourceName
                            };
                            this.createBulletWithInfo(explodeBullet);
                        }
                        bullet.destroy();
                    }
                }
            }
            
            // Remove off-screen bullets (tighter margins for performance)
            if (bullet.y > 620 || bullet.x < -30 || bullet.x > 830) {
                // Count as dodged if game is active
                if (gameStarted && !gameOver && bullet.y > 620 && !bullet.counted) {
                    bulletsDodged++;
                    this.dodgedBullets++;
                    bullet.counted = true;
                }
                
                // Clean up
                // if (bullet.label) {  // No port label anymore
                //     bullet.label.destroy();
                // }
                if (bullet.sourceLabel) {
                    bullet.sourceLabel.destroy();
                }
                if (bullet.typeLabel) {
                    bullet.typeLabel.destroy();
                }
                if (bullet.trail) {
                    bullet.trail.destroy();
                }
                bullet.destroy();
            }
        });
        
        return bulletsDodged;
    }
    
    checkGraze(playerPos, playerGrazeArea) {
        let grazed = false;
        
        this.bulletGroup.children.entries.forEach(bullet => {
            if (!bullet.active || bullet.grazed) return;
            
            const dist = Phaser.Math.Distance.Between(
                bullet.x, bullet.y,
                playerPos.x, playerPos.y
            );
            
            // Check if bullet is in graze range but not hitting
            if (dist > 8 && dist < 40) {
                bullet.grazed = true;
                this.grazeCount++;
                grazed = true;
            }
        });
        
        return grazed;
    }
    
    clearAllBullets() {
        this.bulletGroup.children.entries.forEach(bullet => {
            // if (bullet.label) {  // No port label anymore
            //     bullet.label.destroy();
            // }
            if (bullet.sourceLabel) {
                bullet.sourceLabel.destroy();
            }
            if (bullet.typeLabel) {
                bullet.typeLabel.destroy();
            }
            if (bullet.trail) {
                bullet.trail.destroy();
            }
        });
        this.bulletGroup.clear(true, true);
    }
    
    isPrime(n) {
        if (n < 2) return false;
        for (let i = 2; i <= Math.sqrt(n); i++) {
            if (n % i === 0) return false;
        }
        return true;
    }
    
    updatePacketStats(protocol, src_port, dst_port, src_ip) {
        // Total counter
        this.packetStats.total++;
        
        // Protocol counters
        if (protocol === 'TCP') {
            this.packetStats.tcp++;
        } else if (protocol === 'UDP') {
            this.packetStats.udp++;
        } else if (protocol === 'ICMP') {
            this.packetStats.icmp++;
        }
        
        // Service counters - check both ports for services
        if (src_port === 80 || src_port === 443 || src_port === 8080 || src_port === 8443 ||
            dst_port === 80 || dst_port === 443 || dst_port === 8080 || dst_port === 8443) {
            this.packetStats.http++;
        }
        if (src_port === 22 || dst_port === 22) {
            this.packetStats.ssh++;
        }
        if (src_port === 53 || dst_port === 53) {
            this.packetStats.dns++;
        }
        
        // Port range classification - smart detection
        // Check if this is actually an ephemeral connection (one side ephemeral, other side service)
        const srcIsEphemeral = src_port >= 49152;
        const dstIsEphemeral = dst_port >= 49152;
        const srcIsWellKnown = src_port > 0 && src_port < 1024;
        const dstIsWellKnown = dst_port > 0 && dst_port < 1024;
        
        // Only count as ephemeral if it's a client connection (ephemeral -> service)
        if ((srcIsEphemeral && (dstIsWellKnown || (dst_port >= 1024 && dst_port < 49152))) ||
            (dstIsEphemeral && (srcIsWellKnown || (src_port >= 1024 && src_port < 49152)))) {
            this.packetStats.ephemeral++;
        }
        
        // Count well-known ports (either side)
        if (srcIsWellKnown || dstIsWellKnown) {
            this.packetStats.wellknown++;
        }
        
        // IP type classification
        if (src_ip) {
            if (src_ip.startsWith('192.168.') || src_ip.startsWith('10.') || src_ip.startsWith('172.')) {
                this.packetStats.private++;
            } else if (src_ip === '127.0.0.1' || src_ip.startsWith('127.')) {
                this.packetStats.loopback++;
            } else if (src_ip.endsWith('.255') || src_ip === '255.255.255.255') {
                this.packetStats.broadcast++;
            }
        }
    }
    
    reset() {
        this.clearAllBullets();
        this.dodgedBullets = 0;
        this.grazeCount = 0;
        
        // Reset statistics
        Object.keys(this.packetStats).forEach(key => {
            this.packetStats[key] = 0;
        });
    }
    
    getStats() {
        return {
            dodgedBullets: this.dodgedBullets,
            grazeCount: this.grazeCount,
            activeBullets: this.bulletGroup.children.entries.length
        };
    }
    
    getPacketStats() {
        return this.packetStats;
    }
}