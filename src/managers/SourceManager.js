import Phaser from 'phaser';

export default class SourceManager {
    constructor(scene) {
        this.scene = scene;
        this.sourceCircles = new Map();
        this.sourceStats = new Map();
        this.sourceColors = new Map();
        this.activeSources = new Set();
        this.colorPalette = [
            0xFF6B6B, 0x4ECDC4, 0x45B7D1, 0xFECA57,
            0xA55EEA, 0x26DE81, 0xFD79A8, 0x00B894
        ];
    }
    
    updateCaptureSources(state) {
        if (!state || !state.active_sources) return;
        
        const currentSources = new Set(state.active_sources.map(s => s.source_id));
        
        // Add new sources
        state.active_sources.forEach(source => {
            if (!this.sourceCircles.has(source.source_id)) {
                this.createSourceCircle(
                    source.source_id,
                    source.source_name,
                    source.ip_address
                );
            }
            
            // Update active state
            const circle = this.sourceCircles.get(source.source_id);
            if (circle) {
                const isActive = source.packet_rate > 0;
                
                if (isActive) {
                    circle.container.setAlpha(1);
                } else {
                    circle.container.setAlpha(0.5);  // More visible even when inactive
                }
            }
        });
        
        // Remove disconnected sources
        this.sourceCircles.forEach((circle, sourceId) => {
            if (!currentSources.has(sourceId)) {
                this.removeSourceCircle(sourceId);
            }
        });
    }
    
    createSourceCircle(sourceId, sourceName, ipAddress = null) {
        // Position sources in a rotating circle
        const centerX = 640;  // Center of 1280 width screen
        const centerY = 50;
        const radiusX = 300; // Horizontal radius
        const radiusY = 35;  // Vertical radius for ellipse
        
        let octet = '';
        
        // Calculate initial angle based on source count
        const sourceIndex = this.sourceCircles.size;
        let baseAngle = (sourceIndex * (Math.PI * 2 / 8)); // Max 8 sources evenly distributed
        
        if (ipAddress && ipAddress !== 'unknown' && ipAddress !== null) {
            const octets = ipAddress.split('.');
            if (octets.length === 4) {
                octet = octets[3];
                const fourthOctet = parseInt(octet);
                if (!isNaN(fourthOctet)) {
                    // Add variation based on IP
                    baseAngle += (fourthOctet / 255) * (Math.PI / 4);
                }
            }
        } else if (sourceId) {
            // Use sourceId hash for angle
            let hash = 0;
            for (let i = 0; i < sourceId.length; i++) {
                hash = ((hash << 5) - hash) + sourceId.charCodeAt(i);
                hash = hash & hash;
            }
            baseAngle += (Math.abs(hash) % 360) * (Math.PI / 180);
        }
        
        // Store the base angle for rotation
        const rotationSpeed = 0.0003; // Rotation speed
        const currentRotation = (this.scene.time.now * rotationSpeed) % (Math.PI * 2);
        const angle = baseAngle + currentRotation;
        
        // Calculate position on ellipse
        const x = centerX + Math.cos(angle) * radiusX;
        const y = centerY + Math.sin(angle) * radiusY;
        
        // Get color for this source
        const color = this.getSourceColor(sourceName);
        const colorNum = parseInt(color.replace('#', ''), 16);
        
        // Container for the source indicator
        const container = this.scene.add.container(x, y);
        
        // Main circle - more opaque for better visibility
        const circle = this.scene.add.circle(0, 0, 22, colorNum);
        circle.setStrokeStyle(3, 0xFFFFFF);
        circle.setAlpha(0.95);
        
        // Inner glow - also more visible
        const glow = this.scene.add.circle(0, 0, 17, colorNum, 0.5);
        
        // Extract hostname
        let hostname = sourceName;
        if (sourceName.includes('_capture')) {
            hostname = sourceName.split('_capture')[0];
        }
        if (hostname.length > 12) {
            hostname = hostname.substring(0, 11) + '..';
        }
        
        // Note: octet was already extracted above in positioning logic
        
        // Display octet (4th part of IP) - larger and clearer
        const octetText = this.scene.add.text(0, 0, octet || '?', {
            fontSize: '16px',
            color: '#FFFFFF',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        });
        octetText.setOrigin(0.5);
        
        // Display hostname below the circle
        const displayText = octet ? hostname : `${hostname} (${sourceId.substring(0, 6)})`;
        const hostnameText = this.scene.add.text(0, 35, displayText, {
            fontSize: '10px',
            color: '#FFFFFF',
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: { x: 3, y: 1 },
            stroke: '#000000',
            strokeThickness: 1
        });
        hostnameText.setOrigin(0.5);
        
        // Source name label (packet count will be added later)
        const label = this.scene.add.text(0, 48, '', {
            fontSize: '9px',
            color: color,
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: { x: 3, y: 1 }
        });
        label.setOrigin(0.5);
        
        // Add all elements to container
        container.add([glow, circle, octetText, hostnameText, label]);
        
        // Store reference with rotation info
        this.sourceCircles.set(sourceId, {
            container: container,
            circle: circle,
            glow: glow,
            label: label,
            hostnameText: hostnameText,
            pulseTimer: null,
            sourceName: sourceName,
            packetCount: 0,
            x: x,
            y: y,
            baseAngle: baseAngle, // Store base angle for rotation
            centerX: 640,
            centerY: 50,
            radiusX: 300,
            radiusY: 35
        });
        
        // Connection effect (no flash)
        
        return { x, y };
    }
    
    removeSourceCircle(sourceId) {
        const circle = this.sourceCircles.get(sourceId);
        if (circle) {
            if (circle.pulseTimer) {
                circle.pulseTimer.destroy();
            }
            circle.container.destroy();
            this.sourceCircles.delete(sourceId);
        }
    }
    
    updateSourceStats(sourceName) {
        if (!this.sourceStats.has(sourceName)) {
            this.sourceStats.set(sourceName, 0);
        }
        this.sourceStats.set(sourceName, this.sourceStats.get(sourceName) + 1);
        
        // Update circle label with packet count
        this.sourceCircles.forEach((circle) => {
            if (circle.sourceName === sourceName) {
                const count = this.sourceStats.get(sourceName);
                circle.packetCount = count;
                
                // Just show packet count
                circle.label.setText(`Packets: ${count}`);
            }
        });
    }
    
    getSourceColor(sourceName) {
        if (!this.sourceColors.has(sourceName)) {
            const colorIndex = this.sourceColors.size % this.colorPalette.length;
            const color = this.colorPalette[colorIndex];
            this.sourceColors.set(sourceName, `#${color.toString(16).padStart(6, '0')}`);
        }
        return this.sourceColors.get(sourceName);
    }
    
    getSourcePosition(sourceId) {
        const circle = this.sourceCircles.get(sourceId);
        if (circle) {
            // Return current rotated position
            const rotationSpeed = 0.0003;
            const currentRotation = (this.scene.time.now * rotationSpeed) % (Math.PI * 2);
            const angle = circle.baseAngle + currentRotation;
            
            const x = circle.centerX + Math.cos(angle) * circle.radiusX;
            const y = circle.centerY + Math.sin(angle) * circle.radiusY;
            
            return { x, y };
        }
        
        // Try to match by source name if ID doesn't match
        for (const [id, c] of this.sourceCircles.entries()) {
            if (c.sourceName === sourceId || id === sourceId) {
                const rotationSpeed = 0.0003;
                const currentRotation = (this.scene.time.now * rotationSpeed) % (Math.PI * 2);
                const angle = c.baseAngle + currentRotation;
                
                const x = c.centerX + Math.cos(angle) * c.radiusX;
                const y = c.centerY + Math.sin(angle) * c.radiusY;
                
                return { x, y };
            }
        }
        
        return null;
    }
    
    updateRotation() {
        // Update positions of all source circles
        const rotationSpeed = 0.0003;
        const currentRotation = (this.scene.time.now * rotationSpeed) % (Math.PI * 2);
        
        this.sourceCircles.forEach((circle) => {
            const angle = circle.baseAngle + currentRotation;
            const x = circle.centerX + Math.cos(angle) * circle.radiusX;
            const y = circle.centerY + Math.sin(angle) * circle.radiusY;
            
            circle.container.x = x;
            circle.container.y = y;
            circle.x = x;
            circle.y = y;
        });
    }
    
    createBulletSpawnEffect(x, y, color) {
        // No effect - removed the line effect for cleaner visuals
        return;
    }
    
    reset() {
        // Clear all source circles
        this.sourceCircles.forEach((circle) => {
            if (circle.pulseTimer) {
                circle.pulseTimer.destroy();
            }
            circle.container.destroy();
        });
        this.sourceCircles.clear();
        
        // Clear stats
        this.sourceStats.clear();
        this.sourceColors.clear();
        this.activeSources.clear();
    }
    
    getStats() {
        return this.sourceStats;
    }
    
    getColors() {
        return this.sourceColors;
    }
}