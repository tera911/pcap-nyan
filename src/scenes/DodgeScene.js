import Phaser from 'phaser';
import PlayerManager from '../managers/PlayerManager';
import BulletManager from '../managers/BulletManager';
import UIManager from '../managers/UIManager';
import SourceManager from '../managers/SourceManager';
import EffectsManager from '../managers/EffectsManager';

export default class DodgeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'DodgeScene' });
        
        // Game state
        this.wsManager = null;
        this.score = 0;
        this.gameOver = false;
        this.gameStarted = false;
        this.survivalTime = 0;
        this.startTime = 0;
        this.isPaused = false;  // Pause state
        // Removed separate difficulty - using playerLevel instead
        this.lastPacketTime = 0;
        this.packetInterval = 160;  // Initial packet processing interval (ms)
        
        // Managers
        this.playerManager = null;
        this.bulletManager = null;
        this.uiManager = null;
        this.sourceManager = null;
        this.effectsManager = null;
    }
    
    init(data) {
        this.wsManager = data.wsManager;
    }
    
    preload() {
        // Load nyancat SVG
        this.load.svg('nyancat', '/nyancat.svg', { width: 48, height: 32 });
    }
    
    create() {
        // Dark space background
        this.cameras.main.setBackgroundColor('#0a0a2e');
        
        // Initialize managers
        this.effectsManager = new EffectsManager(this);
        this.playerManager = new PlayerManager(this);
        this.bulletManager = new BulletManager(this);
        this.uiManager = new UIManager(this);
        this.sourceManager = new SourceManager(this);
        
        // Create game elements
        this.effectsManager.createStarfield();
        this.playerManager.create();
        this.bulletManager.create();
        this.uiManager.create();
        
        // Setup physics and collisions
        this.setupPhysics();
        
        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.gKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
        this.pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);  // Pause key
        
        // WebSocket callbacks
        if (this.wsManager) {
            this.wsManager.setCallbacks({
                onMapUpdate: (packets) => this.createPacketBullets(packets),
                onGameState: (state) => this.sourceManager.updateCaptureSources(state),
                onConnectionStatusChange: (connected) => this.uiManager.updateConnectionStatus(connected),
                onCaptureStatusChange: (capturing) => this.uiManager.updateCaptureStatus(capturing)
            });
            this.wsManager.requestMap();
            
            // Check initial connection status
            if (this.wsManager.ws && this.wsManager.ws.readyState === WebSocket.OPEN) {
                this.uiManager.updateConnectionStatus(true);
            }
        }
        
        // Timers
        this.setupTimers();
        
        // Start in waiting state
        this.showStartScreen();
    }
    
    setupPhysics() {
        // Collision detection between player and bullets
        this.physics.add.overlap(
            this.playerManager.nyancat,
            this.bulletManager.bulletGroup,
            (player, bullet) => {
                if (this.gameStarted && !this.gameOver && !this.playerManager.isInvincible()) {
                    this.hitPlayer();
                }
            },
            null,
            this
        );
        
        // Graze detection
        this.physics.add.overlap(
            this.playerManager.grazeArea,
            this.bulletManager.bulletGroup,
            (area, bullet) => {
                if (this.gameStarted && !this.gameOver && !bullet.grazed) {
                    bullet.grazed = true;
                    this.graze();
                }
            },
            null,
            this
        );
    }
    
    setupTimers() {
        // Star scrolling timer
        this.time.addEvent({
            delay: 30,
            callback: () => this.effectsManager.updateStarfield(),
            callbackScope: this,
            loop: true
        });
        
        // Source stats update timer
        this.time.addEvent({
            delay: 1000,
            callback: () => {
                this.uiManager.updateSourceStats(
                    this.sourceManager.getStats(),
                    this.sourceManager.getColors()
                );
            },
            callbackScope: this,
            loop: true
        });
        
        // Packet classification stats update timer
        this.time.addEvent({
            delay: 500,  // Update twice per second
            callback: () => {
                this.uiManager.updatePacketStats(
                    this.bulletManager.getPacketStats()
                );
            },
            callbackScope: this,
            loop: true
        });
    }
    
    update() {
        // Update source rotation
        this.sourceManager.updateRotation();
        
        // Check for pause toggle (works during game)
        if (this.gameStarted && !this.gameOver && Phaser.Input.Keyboard.JustDown(this.pKey)) {
            this.togglePause();
        }
        
        // Check for God mode toggle
        if (!this.gameOver && Phaser.Input.Keyboard.JustDown(this.gKey)) {
            this.toggleGodMode();
        }
        
        // Check for start input
        if (!this.gameStarted && !this.gameOver) {
            if (this.input.keyboard.addKey('SPACE').isDown) {
                this.startGame();
            }
            // Update bullets even in start state (visual only, no collision)
            this.updateBullets();
            return;
        }
        
        if (this.gameOver) {
            if (this.input.keyboard.addKey('R').isDown) {
                this.restartGame();
            }
            return;
        }
        
        // If paused, skip most updates
        if (this.isPaused) {
            return;
        }
        
        // Update survival time
        if (this.gameStarted) {
            this.survivalTime = Math.floor((this.time.now - this.startTime) / 1000);
            this.uiManager.updateTime(this.survivalTime);
        }
        
        // Handle player movement (only if game is started and not over)
        if (this.gameStarted && !this.gameOver) {
            this.playerManager.updateMovement(this.cursors, this.shiftKey);
        }
        
        // Check combo timeout
        this.playerManager.checkComboTimeout();
        
        // Update bullets
        this.updateBullets();
    }
    
    updateBullets() {
        const bulletsDodged = this.bulletManager.updateBullets(
            this.gameStarted, 
            this.gameOver
        );
        
        if (bulletsDodged > 0) {
            this.score += bulletsDodged;
            
            // Update UI
            this.uiManager.updateScore(this.score);
            // No longer tracking separate level progress
        }
        
        // Update UI with current stats
        const stats = this.bulletManager.getStats();
        this.uiManager.updateGraze(stats.grazeCount);
    }
    
    createPacketBullets(packetData) {
        if (this.gameOver || !packetData || !Array.isArray(packetData)) return;
        
        const currentTime = this.time.now;
        
        // Dynamic packet interval based on player level (shorter interval = more packets)
        const playerLevel = this.playerManager.playerLevel;
        const levelInterval = Math.max(200, 1000 - (playerLevel * 100)); // 1000ms at level 1, down to 200ms at higher levels
        
        // Check if enough time has passed since last packet processing
        if (currentTime - this.lastPacketTime < levelInterval) return;
        
        // Limit packets based on level (more packets at higher levels)
        const maxPackets = Math.min(5 + Math.floor(playerLevel * 1.5), 20); // Start with 5, max 20 for intense gameplay
        const packetsToProcess = packetData.slice(0, maxPackets);
        
        // Process each packet
        packetsToProcess.forEach((packet, index) => {
            // Get source position if available
            let sourcePos = null;
            if (packet.source_id) {
                sourcePos = this.sourceManager.getSourcePosition(packet.source_id);
                if (sourcePos) {
                    // Create subtle spawn effect at source
                    const color = this.sourceManager.getSourceColor(packet.src_name || 'Unknown');
                    this.sourceManager.createBulletSpawnEffect(sourcePos.x, sourcePos.y, color);
                }
            } else {
                // If no source_id, try to match by source_name
                if (packet.src_name) {
                    // Find source circle by name
                    this.sourceManager.sourceCircles.forEach((circle, id) => {
                        if (circle.sourceName === packet.src_name) {
                            sourcePos = { x: circle.x, y: circle.y };
                        }
                    });
                    
                    if (sourcePos) {
                        const color = this.sourceManager.getSourceColor(packet.src_name);
                        this.sourceManager.createBulletSpawnEffect(sourcePos.x, sourcePos.y, color);
                    }
                }
            }
            
            // Pass source position to bullet manager
            if (sourcePos) {
                packet.spawn_x = sourcePos.x;
                packet.spawn_y = sourcePos.y;
            }
            
            // Create bullet without speed scaling (difficulty = 1)
            this.bulletManager.createPacketBullet(packet, 1, null);
            
            // Update source stats
            if (packet.src_name) {
                this.sourceManager.updateSourceStats(packet.src_name);
            }
            
            // Add to packet log
            this.uiManager.addPacketLog(
                packet.protocol,
                packet.src_ip,
                packet.src_port,
                packet.dst_ip,
                packet.dst_port,
                packet.size,
                packet.src_name
            );
        });
        
        this.lastPacketTime = currentTime;
        this.uiManager.updatePacketInfo(packetsToProcess.length);
    }
    
    graze() {
        this.bulletManager.grazeCount++;
        this.uiManager.updateGraze(this.bulletManager.grazeCount);
        
        // Update combo
        const combo = this.playerManager.updateCombo();
        
        // Gain experience for grazing (main source of XP) with combo bonus
        const baseExp = 10 + (this.playerManager.playerLevel * 3);
        const comboMultiplier = 1 + (Math.min(combo, 50) * 0.02);  // Up to 2x at 50 combo
        const expGain = Math.floor(baseExp * comboMultiplier);
        this.playerManager.gainExperience(expGain);
        
        // Visual effect
        const pos = this.playerManager.getPosition();
        this.effectsManager.createGrazeEffect(pos.x, pos.y);
    }
    
    hitPlayer() {
        if (this.gameOver) return;
        
        const isDead = this.playerManager.takeDamage();
        
        if (isDead) {
            this.gameOver = true;
            
            // Stop player movement immediately
            this.playerManager.nyancat.body.setVelocity(0, 0);
            
            // Update lives display to 0
            this.uiManager.updateLives(0);
            
            // Death effect
            const pos = this.playerManager.getPosition();
            this.effectsManager.createDeathEffect(pos.x, pos.y);
            
            // Calculate final score
            const survivalBonus = this.survivalTime * 100;
            const grazeBonus = this.bulletManager.grazeCount * 50;
            const comboBonus = this.playerManager.maxCombo * 100;
            const finalScore = this.score + survivalBonus + grazeBonus + comboBonus;
            
            // Show game over
            this.uiManager.showGameOver(finalScore);
            
            // Log game over
            this.uiManager.addSystemLog(
                `GAME OVER! Score: ${finalScore} (Dodged: ${this.score} + Time: ${survivalBonus} + Graze: ${grazeBonus} + Combo: ${comboBonus})`
            );
        } else {
            // Player was hit but still has lives
            const livesLeft = this.playerManager.getLives();
            this.uiManager.updateLives(livesLeft);
            this.uiManager.addSystemLog(`HIT! ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} remaining`);
        }
    }
    
    toggleGodMode() {
        const godMode = this.playerManager.toggleGodMode();
        this.uiManager.setGodModeVisible(godMode);
        
        if (godMode) {
            this.uiManager.addSystemLog('GOD MODE ACTIVATED - Invincible!');
        } else {
            this.uiManager.addSystemLog('GOD MODE DEACTIVATED');
        }
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            // Pause physics
            this.physics.pause();
            
            // Show pause indicator
            this.uiManager.showPauseScreen();
            this.uiManager.addSystemLog('GAME PAUSED - Press P to resume | Click bullets for details');
            
            // Show bullet labels and enable interactive mode when paused
            this.bulletManager.setLabelsVisible(true);
            this.bulletManager.enableInteractiveMode(true);
            
            // Stop time counting
            if (this.gameStarted) {
                this.pauseStartTime = this.time.now;
            }
        } else {
            // Resume physics
            this.physics.resume();
            
            // Hide pause indicator
            this.uiManager.hidePauseScreen();
            this.uiManager.addSystemLog('GAME RESUMED');
            
            // Hide bullet labels and disable interactive mode when resumed
            this.bulletManager.setLabelsVisible(false);
            this.bulletManager.enableInteractiveMode(false);
            
            // Adjust start time to account for pause duration
            if (this.gameStarted && this.pauseStartTime) {
                const pauseDuration = this.time.now - this.pauseStartTime;
                this.startTime += pauseDuration;
            }
        }
    }
    
    // This function is no longer needed - levelUp is handled by PlayerManager
    
    showStartScreen() {
        this.uiManager.showStartScreen();
    }
    
    startGame() {
        this.gameStarted = true;
        this.startTime = this.time.now;
        
        // Hide start screen
        this.uiManager.hideStartScreen();
        
        // Initialize lives display
        this.uiManager.updateLives(3);
        
        // Start effect
        this.effectsManager.createGameStartEffect();
        
        // Log game start
        this.uiManager.addSystemLog('GAME STARTED! GOOD LUCK!');
    }
    
    restartGame() {
        // Clear all bullets
        this.bulletManager.reset();
        
        // Reset game state
        this.gameOver = false;
        this.gameStarted = false;
        this.score = 0;
        this.survivalTime = 0;
        this.packetInterval = 160;  // Reset packet interval
        
        // Reset managers
        this.playerManager.reset();
        this.sourceManager.reset();
        this.uiManager.reset();
        
        // Show start screen again
        this.showStartScreen();
    }
}