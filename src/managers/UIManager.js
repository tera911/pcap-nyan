import Phaser from 'phaser';

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        
        // UI elements
        this.scoreText = null;
        this.timeText = null;
        this.grazeText = null;
        this.difficultyText = null;  // Shows player level
        this.packetInfoText = null;
        this.gameOverText = null;
        this.startScreenText = null;
        this.startInstructionText = null;
        this.godModeText = null;
        this.pauseScreenText = null;
        this.livesText = null;  // Lives display
        
        // Packet logs
        this.packetLogs = [];
        this.maxLogs = 12;
        this.logTexts = [];
        this.logContainer = null;
        
        // Source stats
        this.sourceStatsContainer = null;
        this.sourceStatsTitle = null;
        this.sourceStatTexts = [];
        
        // Packet classification stats
        this.packetStatsContainer = null;
        this.packetStatTexts = {};
    }
    
    create() {
        this.createGameUI();
        this.createPacketStatsDisplay();
        this.createStartScreen();
        this.createGameOverScreen();
        this.createPauseScreen();
        this.createPacketLogDisplay();
        this.createSourceStatsPanel();
        this.createGodModeIndicator();
        this.createBulletTypeLegend();
    }
    
    createGameUI() {
        // Score (dodged bullets) - moved down and semi-transparent
        this.scoreText = this.scene.add.text(16, 90, 'Dodged: 0', {
            fontSize: '18px',
            color: '#FFFFFF',
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: { x: 8, y: 4 }
        });
        this.scoreText.setAlpha(0.8);
        
        // Survival time - moved down and semi-transparent
        this.timeText = this.scene.add.text(16, 120, 'Time: 0s', {
            fontSize: '18px',
            color: '#00FF00',
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: { x: 8, y: 4 }
        });
        this.timeText.setAlpha(0.8);
        
        // Graze counter - moved down and semi-transparent
        this.grazeText = this.scene.add.text(16, 150, 'Graze: 0', {
            fontSize: '18px',
            color: '#FFD700',
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: { x: 8, y: 4 }
        });
        this.grazeText.setAlpha(0.8);
        
        // Lives display
        this.livesText = this.scene.add.text(16, 180, 'Lives: ❤️❤️❤️', {
            fontSize: '20px',
            color: '#FF6666',
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: { x: 8, y: 4 }
        });
        this.livesText.setAlpha(0.9);
        
        // Player Level display - moved down and semi-transparent
        this.difficultyText = this.scene.add.text(400, 100, 'Lv.1', {
            fontSize: '24px',
            color: '#FFD700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.difficultyText.setOrigin(0.5, 0);
        this.difficultyText.setAlpha(0.8);
        
        // Removed level progress bar - using player level system instead
        
        // Packet info - moved down and semi-transparent
        this.packetInfoText = this.scene.add.text(790, 90, 'Packets: 0', {
            fontSize: '14px',
            color: '#00FF00',
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: { x: 8, y: 4 }
        });
        this.packetInfoText.setOrigin(1, 0);
        this.packetInfoText.setAlpha(0.8);
    }
    
    createStartScreen() {
        // Start screen
        this.startScreenText = this.scene.add.text(400, 250, 'PCAP NYAN', {
            fontSize: '64px',
            color: '#FF69B4',
            fontStyle: 'bold',
            stroke: '#FFFFFF',
            strokeThickness: 6
        });
        this.startScreenText.setOrigin(0.5);
        this.startScreenText.setVisible(false);
        
        this.startInstructionText = this.scene.add.text(400, 350, 'Press SPACE to Start\n\n← → ↑ ↓: Move | Shift: Slow | P: Pause | G: God | H: Help', {
            fontSize: '20px',
            color: '#FFFFFF',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: { x: 20, y: 10 },
            align: 'center'
        });
        this.startInstructionText.setOrigin(0.5);
        this.startInstructionText.setVisible(false);
    }
    
    createGameOverScreen() {
        // Game over text
        this.gameOverText = this.scene.add.text(400, 300, 'GAME OVER\nPress R to restart', {
            fontSize: '48px',
            color: '#FF0000',
            align: 'center',
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: { x: 20, y: 10 }
        });
        this.gameOverText.setOrigin(0.5);
        this.gameOverText.setVisible(false);
    }
    
    createPauseScreen() {
        // Pause screen
        this.pauseScreenText = this.scene.add.text(400, 250, 'PAUSED', {
            fontSize: '48px',
            color: '#FFFF00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: { x: 20, y: 10 }
        });
        this.pauseScreenText.setOrigin(0.5);
        this.pauseScreenText.setVisible(false);
    }
    
    createPacketLogDisplay() {
        // Packet log container
        this.logContainer = this.scene.add.container(16, 400);
        
        // Create log text objects
        for (let i = 0; i < this.maxLogs; i++) {
            const logText = this.scene.add.text(0, i * 16, '', {
                fontSize: '10px',
                color: '#FFFFFF',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(0,0,0,0.4)',
                padding: { x: 4, y: 2 }
            });
            this.logTexts.push(logText);
            this.logContainer.add(logText);
        }
    }
    
    createPacketStatsDisplay() {
        // Packet classification statistics at top
        this.packetStatsContainer = this.scene.add.container(400, 16);
        
        // Background panel
        const statsBg = this.scene.add.rectangle(0, 0, 700, 60, 0x000000, 0.4);
        statsBg.setStrokeStyle(1, 0xFFFFFF, 0.3);
        this.packetStatsContainer.add(statsBg);
        
        // Title
        const title = this.scene.add.text(0, -20, '=== Packet Flow Statistics ===', {
            fontSize: '12px',
            color: '#FFD700',
            fontStyle: 'bold'
        });
        title.setOrigin(0.5);
        this.packetStatsContainer.add(title);
        
        // Create stat categories (3 rows x 4 columns)
        const categories = [
            // Row 1 - Protocols
            { key: 'tcp', label: 'TCP', color: '#FF6666', x: -300, y: -5 },
            { key: 'udp', label: 'UDP', color: '#6666FF', x: -200, y: -5 },
            { key: 'icmp', label: 'ICMP', color: '#66FF66', x: -100, y: -5 },
            { key: 'total', label: 'Total', color: '#FFFFFF', x: 0, y: -5 },
            
            // Row 2 - Services
            { key: 'http', label: 'HTTP/S', color: '#00AAFF', x: 100, y: -5 },
            { key: 'ssh', label: 'SSH', color: '#FF00FF', x: 200, y: -5 },
            { key: 'dns', label: 'DNS', color: '#AAFF00', x: 300, y: -5 },
            
            // Row 3 - Special types
            { key: 'wellknown', label: 'Well-Known', color: '#FFD700', x: -300, y: 10 },
            { key: 'ephemeral', label: 'Ephemeral', color: '#888888', x: -150, y: 10 },
            { key: 'private', label: 'Private IP', color: '#808080', x: 0, y: 10 },
            { key: 'broadcast', label: 'Broadcast', color: '#00FFFF', x: 150, y: 10 },
            { key: 'loopback', label: 'Loopback', color: '#FF00FF', x: 300, y: 10 }
        ];
        
        categories.forEach(cat => {
            const statText = this.scene.add.text(cat.x, cat.y, `${cat.label}: 0`, {
                fontSize: '10px',
                color: cat.color,
                backgroundColor: 'rgba(0,0,0,0.5)',
                padding: { x: 3, y: 1 }
            });
            statText.setOrigin(0.5);
            this.packetStatsContainer.add(statText);
            this.packetStatTexts[cat.key] = statText;
        });
        
        this.packetStatsContainer.setAlpha(0.9);
    }
    
    createSourceStatsPanel() {
        // Source statistics panel - moved down and semi-transparent
        this.sourceStatsContainer = this.scene.add.container(790, 120);
        this.sourceStatsTitle = this.scene.add.text(0, 0, '=== Sources ===', {
            fontSize: '11px',
            color: '#FFD700',
            backgroundColor: 'rgba(0,0,0,0.4)',
            padding: { x: 4, y: 2 }
        });
        this.sourceStatsTitle.setOrigin(1, 0);
        this.sourceStatsTitle.setAlpha(0.8);
        this.sourceStatsContainer.add(this.sourceStatsTitle);
        
        // Create source stat entries
        for (let i = 0; i < 8; i++) {
            const statText = this.scene.add.text(0, 16 + (i * 14), '', {
                fontSize: '10px',
                color: '#FFFFFF',
                backgroundColor: 'rgba(0,0,0,0.3)',
                padding: { x: 3, y: 1 }
            });
            statText.setOrigin(1, 0);
            statText.setAlpha(0.8);
            this.sourceStatTexts.push(statText);
            this.sourceStatsContainer.add(statText);
        }
        this.sourceStatsContainer.setAlpha(0.8);
    }
    
    createGodModeIndicator() {
        // God mode indicator - moved down to avoid host circles
        this.godModeText = this.scene.add.text(400, 130, '⚡ GOD MODE ⚡', {
            fontSize: '18px',
            color: '#FFD700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.godModeText.setOrigin(0.5);
        this.godModeText.setAlpha(0.9);
        this.godModeText.setVisible(false);
    }
    
    showStartScreen() {
        this.startScreenText.setVisible(true);
        this.startInstructionText.setVisible(true);
        
        // Pulsing effect
        this.scene.tweens.add({
            targets: this.startInstructionText,
            scale: { from: 1, to: 1.1 },
            duration: 1000,
            yoyo: true,
            repeat: -1
        });
    }
    
    hideStartScreen() {
        this.startScreenText.setVisible(false);
        this.startInstructionText.setVisible(false);
        this.scene.tweens.killTweensOf(this.startInstructionText);
    }
    
    showGameOver(finalScore) {
        this.gameOverText.setText(`GAME OVER\nScore: ${finalScore}\nPress R to restart`);
        this.gameOverText.setVisible(true);
    }
    
    hideGameOver() {
        this.gameOverText.setVisible(false);
    }
    
    showPauseScreen() {
        this.pauseScreenText.setVisible(true);
    }
    
    hidePauseScreen() {
        this.pauseScreenText.setVisible(false);
    }
    
    updateScore(dodged) {
        this.scoreText.setText(`Dodged: ${dodged}`);
    }
    
    updateTime(seconds) {
        this.timeText.setText(`Time: ${seconds}s`);
    }
    
    updateGraze(count) {
        this.grazeText.setText(`Graze: ${count}`);
    }
    
    updateLives(lives) {
        if (this.livesText) {
            let hearts = '';
            for (let i = 0; i < lives; i++) {
                hearts += '❤️';
            }
            // Just show "Lives:" when no lives remain
            if (lives <= 0) {
                this.livesText.setText('Lives:');
            } else {
                this.livesText.setText(`Lives: ${hearts}`);
            }
            
            // Flash effect when lives change
            this.scene.tweens.add({
                targets: this.livesText,
                alpha: 0.3,
                duration: 100,
                yoyo: true,
                repeat: 2
            });
        }
    }
    
    updateDifficulty(level) {
        this.difficultyText.setText(`Lv.${level}`);
    }
    
    updateProgress(current, max) {
        // No longer needed - using player level system
    }
    
    updatePacketInfo(count) {
        this.packetInfoText.setText(`Packets: ${count}`);
    }
    
    setGodModeVisible(visible) {
        this.godModeText.setVisible(visible);
    }
    
    createBulletTypeLegend() {
        // Create collapsible legend container
        this.legendContainer = this.scene.add.container(400, 450);
        
        // Background for legend
        const legendBg = this.scene.add.rectangle(0, 0, 350, 140, 0x000000, 0.7);
        legendBg.setStrokeStyle(2, 0xFFFFFF, 0.5);
        this.legendContainer.add(legendBg);
        
        // Title
        const legendTitle = this.scene.add.text(0, -60, '=== 弾幕タイプ ===', {
            fontSize: '12px',
            color: '#FFD700',
            fontStyle: 'bold'
        });
        legendTitle.setOrigin(0.5);
        this.legendContainer.add(legendTitle);
        
        // Legend entries (2 columns)
        const legendData = [
            // Column 1 - Well-known ports
            { text: 'HTTP(80): 直進', color: '#00AAFF', x: -160, y: -40 },
            { text: 'HTTPS(443): ジグザグ暗号', color: '#FFAA00', x: -160, y: -25 },
            { text: 'SSH(22): 高速直進', color: '#FF00FF', x: -160, y: -10 },
            { text: 'DNS(53): プレイヤー追尾', color: '#AAFF00', x: -160, y: 5 },
            { text: 'POP3(110): 中心に吸引', color: '#FFFFFF', x: -160, y: 20 },
            { text: 'DHCP(67/68): ランダム拡散', color: '#00FFFF', x: -160, y: 35 },
            
            // Column 2 - Special types
            { text: 'ループバック: Uターン', color: '#FF00FF', x: 10, y: -40 },
            { text: 'ブロードキャスト: 横拡散', color: '#00FFFF', x: 10, y: -25 },
            { text: 'TCP: 遅め・安定', color: '#FF6666', x: 10, y: -10 },
            { text: 'UDP: 速い・横広がり', color: '#6666FF', x: 10, y: 5 },
            { text: 'ICMP: 最速・直進', color: '#66FF66', x: 10, y: 20 },
            { text: 'MTU超過(>1500B): 分裂', color: '#FF0000', x: 10, y: 35 }
        ];
        
        legendData.forEach(entry => {
            const text = this.scene.add.text(entry.x, entry.y, entry.text, {
                fontSize: '9px',
                color: entry.color
            });
            text.setOrigin(0, 0.5);
            this.legendContainer.add(text);
        });
        
        // Toggle button
        const toggleBtn = this.scene.add.text(0, 60, '[H] ヘルプの表示/非表示', {
            fontSize: '10px',
            color: '#FFFF00',
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: { x: 5, y: 2 }
        });
        toggleBtn.setOrigin(0.5);
        toggleBtn.setInteractive();
        this.legendContainer.add(toggleBtn);
        
        // Initially hidden
        this.legendContainer.setVisible(false);
        
        // Add H key to toggle
        this.scene.input.keyboard.on('keydown-H', () => {
            this.legendContainer.setVisible(!this.legendContainer.visible);
        });
    }
    
    addPacketLog(protocol, srcIp, srcPort, dstIp, dstPort, size, sourceName = null) {
        const timestamp = new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        let logEntry;
        let color = '#FFFFFF';
        
        const sourcePrefix = sourceName ? `[${sourceName.substring(0, 8)}] ` : '';
        
        switch(protocol) {
            case 'TCP':
                color = '#FF6666';
                logEntry = `[${timestamp}] ${sourcePrefix}TCP ${srcIp}:${srcPort} → ${dstIp}:${dstPort} (${size}B)`;
                break;
            case 'UDP':
                color = '#6666FF';
                logEntry = `[${timestamp}] ${sourcePrefix}UDP ${srcIp}:${srcPort} → ${dstIp}:${dstPort} (${size}B)`;
                break;
            case 'ICMP':
                color = '#66FF66';
                logEntry = `[${timestamp}] ${sourcePrefix}ICMP ${srcIp} → ${dstIp} (${size}B)`;
                break;
            default:
                logEntry = `[${timestamp}] ${sourcePrefix}${protocol} ${srcIp} → ${dstIp} (${size}B)`;
                break;
        }
        
        this.packetLogs.unshift({ text: logEntry, color: color });
        
        if (this.packetLogs.length > this.maxLogs) {
            this.packetLogs.pop();
        }
        
        this.updateLogDisplay();
    }
    
    addSystemLog(message) {
        const timestamp = new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const logEntry = `[${timestamp}] *** ${message} ***`;
        
        this.packetLogs.unshift({ text: logEntry, color: '#FFD700' });
        
        if (this.packetLogs.length > this.maxLogs) {
            this.packetLogs.pop();
        }
        
        this.updateLogDisplay();
    }
    
    updateLogDisplay() {
        this.packetLogs.forEach((log, index) => {
            if (index < this.logTexts.length) {
                this.logTexts[index].setText(log.text);
                this.logTexts[index].setColor(log.color);
                
                const alpha = 1 - (index * 0.08);
                this.logTexts[index].setAlpha(Math.max(0.3, alpha));
            }
        });
        
        for (let i = this.packetLogs.length; i < this.logTexts.length; i++) {
            this.logTexts[i].setText('');
        }
    }
    
    updateSourceStats(sourceStats, sourceColors) {
        const sortedSources = Array.from(sourceStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
        
        sortedSources.forEach(([source, count], index) => {
            if (index < this.sourceStatTexts.length) {
                const color = sourceColors.get(source) || '#FFFFFF';
                const totalBullets = Array.from(sourceStats.values()).reduce((a, b) => a + b, 0);
                const percentage = Math.round((count / totalBullets) * 100) || 0;
                const displayName = source.length > 12 ? source.substring(0, 12) + '...' : source;
                
                this.sourceStatTexts[index].setText(`${displayName}: ${count} (${percentage}%)`);
                this.sourceStatTexts[index].setColor(color);
                this.sourceStatTexts[index].setAlpha(1);
            }
        });
        
        for (let i = sortedSources.length; i < this.sourceStatTexts.length; i++) {
            this.sourceStatTexts[i].setText('');
        }
    }
    
    updatePacketStats(stats) {
        // Update packet classification statistics
        if (this.packetStatTexts.tcp) {
            this.packetStatTexts.tcp.setText(`TCP: ${stats.tcp || 0}`);
        }
        if (this.packetStatTexts.udp) {
            this.packetStatTexts.udp.setText(`UDP: ${stats.udp || 0}`);
        }
        if (this.packetStatTexts.icmp) {
            this.packetStatTexts.icmp.setText(`ICMP: ${stats.icmp || 0}`);
        }
        if (this.packetStatTexts.total) {
            this.packetStatTexts.total.setText(`Total: ${stats.total || 0}`);
        }
        if (this.packetStatTexts.http) {
            this.packetStatTexts.http.setText(`HTTP/S: ${stats.http || 0}`);
        }
        if (this.packetStatTexts.ssh) {
            this.packetStatTexts.ssh.setText(`SSH: ${stats.ssh || 0}`);
        }
        if (this.packetStatTexts.dns) {
            this.packetStatTexts.dns.setText(`DNS: ${stats.dns || 0}`);
        }
        if (this.packetStatTexts.wellknown) {
            this.packetStatTexts.wellknown.setText(`Well-Known: ${stats.wellknown || 0}`);
        }
        if (this.packetStatTexts.ephemeral) {
            this.packetStatTexts.ephemeral.setText(`Ephemeral: ${stats.ephemeral || 0}`);
        }
        if (this.packetStatTexts.private) {
            this.packetStatTexts.private.setText(`Private IP: ${stats.private || 0}`);
        }
        if (this.packetStatTexts.broadcast) {
            this.packetStatTexts.broadcast.setText(`Broadcast: ${stats.broadcast || 0}`);
        }
        if (this.packetStatTexts.loopback) {
            this.packetStatTexts.loopback.setText(`Loopback: ${stats.loopback || 0}`);
        }
    }
    
    reset() {
        // Reset UI texts
        this.updateScore(0);
        this.updateTime(0);
        this.updateGraze(0);
        this.updateLives(3);
        this.updateDifficulty(1);
        this.updatePacketInfo(0);
        
        // Clear logs
        this.packetLogs = [];
        this.updateLogDisplay();
        
        // Clear source stats
        this.sourceStatTexts.forEach(text => text.setText(''));
        
        // Reset packet stats
        Object.keys(this.packetStatTexts).forEach(key => {
            const label = this.packetStatTexts[key].text.split(':')[0];
            this.packetStatTexts[key].setText(`${label}: 0`);
        });
        
        // Hide overlays
        this.hideGameOver();
        this.setGodModeVisible(false);
    }
}