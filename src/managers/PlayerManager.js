import Phaser from 'phaser';

export default class PlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.nyancat = null;
        this.hitboxIndicator = null;
        this.godModeAura = null;
        this.grazeArea = null;
        this.expBarBg = null;
        this.expBar = null;
        this.levelText = null;
        
        // Player stats
        this.experience = 0;
        this.maxExperience = 100;
        this.playerLevel = 1;
        this.godMode = false;
        
        // Health system
        this.maxLives = 3;
        this.currentLives = 3;
        this.invincible = false;
        this.invincibilityTimer = 0;
        this.invincibilityDuration = 2000; // 2 seconds of invincibility after hit
        
        // Combo system
        this.grazeCombo = 0;
        this.maxCombo = 0;
        this.comboTimer = 0;
        this.comboTimeout = 2000; // 2 seconds to maintain combo
        this.comboText = null;
    }
    
    create() {
        this.createNyanCat();
        this.createExperienceBar();
        this.createGodModeAura();
        this.createGrazeArea();
        this.createComboDisplay();
    }
    
    createNyanCat() {
        // Create nyan cat sprite (centered on screen)
        this.nyancat = this.scene.add.image(640, 500, 'nyancat');
        this.nyancat.setScale(0.6);
        
        // Add physics with small hitbox
        this.scene.physics.add.existing(this.nyancat);
        this.nyancat.body.setCollideWorldBounds(true);
        this.nyancat.body.setCircle(4);  // Ultra small hitbox for bullet hell
        
        // Visual hitbox indicator
        this.hitboxIndicator = this.scene.add.circle(640, 500, 4, 0xFF0000, 0.3);
        this.hitboxIndicator.setStrokeStyle(1, 0xFF0000);
    }
    
    createExperienceBar() {
        // Experience bar below Nyan Cat
        const barY = this.nyancat.y + 30;
        const barWidth = 60;
        const barHeight = 4;
        
        // Background bar
        this.expBarBg = this.scene.add.rectangle(this.nyancat.x, barY, barWidth, barHeight, 0x333333);
        this.expBarBg.setStrokeStyle(1, 0x666666);
        
        // Fill bar
        this.expBar = this.scene.add.rectangle(this.nyancat.x - barWidth/2, barY, 0, barHeight - 2, 0xFFD700);
        this.expBar.setOrigin(0, 0.5);
        
        // Level text
        this.levelText = this.scene.add.text(this.nyancat.x, barY - 10, 'Lv.1', {
            fontSize: '10px',
            color: '#FFD700',
            fontStyle: 'bold'
        });
        this.levelText.setOrigin(0.5);
    }
    
    createGodModeAura() {
        // God mode visual effect
        this.godModeAura = this.scene.add.circle(640, 500, 25, 0xFFD700, 0);
        this.godModeAura.setStrokeStyle(3, 0xFFD700, 0.8);
        this.godModeAura.setVisible(false);
    }
    
    createGrazeArea() {
        // Graze detection area (larger than hitbox)
        this.grazeArea = this.scene.add.circle(640, 500, 60);
        this.scene.physics.add.existing(this.grazeArea);
        this.grazeArea.body.setCircle(60);
    }
    
    updateMovement(cursors, shiftKey) {
        const baseSpeed = 200;
        const boostSpeed = 350;  // Boost mode for quick escapes
        const speed = shiftKey.isDown ? boostSpeed : baseSpeed;
        
        // 移動範囲の制限 (弾幕が生成される範囲内)
        const minY = 180;  // 上限を180pxに設定
        const maxY = 520;  // 下限を520pxに設定 (720 - 200)
        const minX = 180;  // 左端を180pxに設定
        const maxX = 1100; // 右端を1100pxに設定
        
        if (cursors.left.isDown) {
            if (this.nyancat.x > minX) {
                this.nyancat.body.setVelocityX(-speed);
            } else {
                this.nyancat.body.setVelocityX(0);
                this.nyancat.x = minX;
            }
        } else if (cursors.right.isDown) {
            if (this.nyancat.x < maxX) {
                this.nyancat.body.setVelocityX(speed);
            } else {
                this.nyancat.body.setVelocityX(0);
                this.nyancat.x = maxX;
            }
        } else {
            this.nyancat.body.setVelocityX(0);
        }
        
        if (cursors.up.isDown) {
            // 上方向の移動を制限
            if (this.nyancat.y > minY) {
                this.nyancat.body.setVelocityY(-speed);
            } else {
                this.nyancat.body.setVelocityY(0);
                this.nyancat.y = minY;  // 境界で停止
            }
        } else if (cursors.down.isDown) {
            // 下方向の移動も制限
            if (this.nyancat.y < maxY) {
                this.nyancat.body.setVelocityY(speed);
            } else {
                this.nyancat.body.setVelocityY(0);
                this.nyancat.y = maxY;  // 境界で停止
            }
        } else {
            this.nyancat.body.setVelocityY(0);
        }
        
        // Update invincibility timer
        if (this.invincible) {
            this.invincibilityTimer -= this.scene.game.loop.delta;
            if (this.invincibilityTimer <= 0) {
                this.invincible = false;
                this.nyancat.clearTint();
                this.nyancat.setAlpha(1);
            } else {
                // Flashing effect during invincibility
                const flash = Math.sin(this.scene.time.now * 0.02) > 0;
                this.nyancat.setAlpha(flash ? 0.5 : 1);
            }
        }
        
        // Update hitbox indicator position
        this.hitboxIndicator.x = this.nyancat.x;
        this.hitboxIndicator.y = this.nyancat.y;
        this.hitboxIndicator.setVisible(shiftKey.isDown || this.godMode);
        
        // Update god mode aura
        if (this.godMode) {
            this.godModeAura.x = this.nyancat.x;
            this.godModeAura.y = this.nyancat.y;
            // Pulsing effect
            const scale = 1 + Math.sin(this.scene.time.now * 0.005) * 0.2;
            this.godModeAura.setScale(scale);
        }
        
        // Update graze area
        this.grazeArea.x = this.nyancat.x;
        this.grazeArea.y = this.nyancat.y;
        
        // Update experience bar position
        this.updateExperienceBar();
    }
    
    toggleGodMode() {
        this.godMode = !this.godMode;
        this.godModeAura.setVisible(this.godMode);
        
        if (this.godMode) {
            // Golden tint without flash
            this.nyancat.setTint(0xFFD700);
        } else {
            // Remove tint without flash
            this.nyancat.clearTint();
        }
        
        return this.godMode;
    }
    
    gainExperience(amount) {
        this.experience += amount;
        
        // Check for player level up
        if (this.experience >= this.maxExperience) {
            this.playerLevelUp();
        }
        
        // Update experience bar
        this.updateExperienceBar();
    }
    
    playerLevelUp() {
        this.playerLevel++;
        this.experience = this.experience - this.maxExperience;
        this.maxExperience = 100 + (this.playerLevel * 50);
        
        // Update level text
        this.levelText.setText(`Lv.${this.playerLevel}`);
        
        // Brief golden glow on Nyan Cat (no screen flash)
        if (!this.godMode) {
            this.nyancat.setTint(0xFFD700);
            this.scene.time.delayedCall(300, () => {
                if (!this.godMode) this.nyancat.clearTint();
            });
        }
        
        // Update packet processing interval based on player level
        this.scene.packetInterval = Math.max(50, 160 - (this.playerLevel * 10) - (Math.floor(this.playerLevel / 3) * 5));
        
        // Level up effects
        this.scene.effectsManager.createLevelUpEffect(this.nyancat.x, this.nyancat.y, this.playerLevel);
        this.scene.effectsManager.createPulseEffect(this.nyancat);
        
        // System log
        const packetsPerSec = Math.floor(1000/this.scene.packetInterval);
        this.scene.uiManager.addSystemLog(
            `PLAYER LEVEL ${this.playerLevel}! Rate: ${packetsPerSec}/sec`
        );
        
        // Update UI to show player level
        this.scene.uiManager.updateDifficulty(this.playerLevel);
        
        return this.playerLevel;
    }
    
    createComboDisplay() {
        // Combo counter display - moved down to avoid host circles
        this.comboText = this.scene.add.text(200, 100, '', {
            fontSize: '22px',
            color: '#FFD700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.comboText.setOrigin(0.5);
        this.comboText.setAlpha(0.9);
        this.comboText.setVisible(false);
    }
    
    updateCombo() {
        this.grazeCombo++;
        if (this.grazeCombo > this.maxCombo) {
            this.maxCombo = this.grazeCombo;
        }
        
        // Reset combo timer
        this.comboTimer = this.scene.time.now;
        
        // Update combo display
        if (this.grazeCombo >= 5) {
            this.comboText.setVisible(true);
            this.comboText.setText(`COMBO x${this.grazeCombo}`);
            
            // Color based on combo size
            let color = '#FFD700';
            if (this.grazeCombo >= 50) {
                color = '#FF00FF';  // Magenta for epic combo
            } else if (this.grazeCombo >= 30) {
                color = '#00FFFF';  // Cyan for great combo
            } else if (this.grazeCombo >= 15) {
                color = '#00FF00';  // Green for good combo
            }
            this.comboText.setColor(color);
            
            // Pulse effect
            this.scene.tweens.add({
                targets: this.comboText,
                scale: 1.3,
                duration: 100,
                yoyo: true,
                ease: 'Power1'
            });
        }
        
        return this.grazeCombo;
    }
    
    checkComboTimeout() {
        if (this.grazeCombo > 0 && this.scene.time.now - this.comboTimer > this.comboTimeout) {
            // Combo broken
            if (this.grazeCombo >= 10) {
                this.scene.uiManager.addSystemLog(`Combo Lost! Max: x${this.grazeCombo}`);
            }
            this.grazeCombo = 0;
            this.comboText.setVisible(false);
        }
    }
    
    updateExperienceBar() {
        const expPercent = this.experience / this.maxExperience;
        const barWidth = 58;
        this.expBar.width = barWidth * Math.min(expPercent, 1);
        
        // Update bar position to follow Nyan Cat
        const barY = this.nyancat.y + 30;
        this.expBarBg.y = barY;
        this.expBar.y = barY;
        this.expBar.x = this.nyancat.x - 30;
        this.expBarBg.x = this.nyancat.x;
        this.levelText.x = this.nyancat.x;
        this.levelText.y = barY - 10;
    }
    
    reset() {
        // Reset position (centered on screen)
        this.nyancat.x = 640;
        this.nyancat.y = 500;
        this.nyancat.body.setVelocity(0, 0);
        
        // Reset stats
        this.experience = 0;
        this.maxExperience = 100;
        this.playerLevel = 1;
        this.godMode = false;
        
        // Reset lives and invincibility
        this.currentLives = 3;
        this.invincible = false;
        this.invincibilityTimer = 0;
        this.nyancat.setAlpha(1);
        
        // Reset combo
        this.grazeCombo = 0;
        this.maxCombo = 0;
        this.comboTimer = 0;
        this.comboText.setVisible(false);
        
        // Reset visuals
        this.nyancat.clearTint();
        this.godModeAura.setVisible(false);
        this.levelText.setText('Lv.1');
        this.expBar.width = 0;
        this.updateExperienceBar();
    }
    
    getPosition() {
        return { x: this.nyancat.x, y: this.nyancat.y };
    }
    
    takeDamage() {
        if (this.invincible || this.godMode) return false;
        
        this.currentLives--;
        
        if (this.currentLives <= 0) {
            // Player is dead
            this.currentLives = 0; // Ensure it doesn't go negative
            return true;
        }
        
        // Still has lives - start invincibility
        this.invincible = true;
        this.invincibilityTimer = this.invincibilityDuration;
        this.nyancat.setTint(0xFF6666); // Red tint when hit
        
        // Create damage effect
        this.scene.effectsManager.createDeathEffect(this.nyancat.x, this.nyancat.y);
        
        return false; // Not dead yet
    }
    
    getLives() {
        return this.currentLives;
    }
    
    isInvincible() {
        return this.invincible || this.godMode;
    }
}