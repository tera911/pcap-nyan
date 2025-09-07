import Phaser from 'phaser';

export default class EffectsManager {
    constructor(scene) {
        this.scene = scene;
        this.stars = [];
    }
    
    createStarfield() {
        this.stars = [];
        for (let i = 0; i < 50; i++) {
            const star = this.scene.add.circle(
                Phaser.Math.Between(0, 800),
                Phaser.Math.Between(0, 600),
                Phaser.Math.Between(1, 3),
                0xFFFFFF,
                Phaser.Math.FloatBetween(0.3, 1)
            );
            star.speed = Phaser.Math.FloatBetween(1, 3);
            this.stars.push(star);
        }
    }
    
    updateStarfield() {
        this.stars.forEach(star => {
            star.y += star.speed;
            if (star.y > 610) {
                star.y = -10;
                star.x = Phaser.Math.Between(0, 800);
            }
        });
    }
    
    createLevelUpEffect(x, y, level) {
        // 1. Expanding ring effect
        const ring = this.scene.add.circle(x, y, 20, 0x00FFFF, 0);
        ring.setStrokeStyle(4, 0x00FFFF, 1);
        ring.setDepth(10);
        
        this.scene.tweens.add({
            targets: ring,
            radius: 400,
            strokeAlpha: 0,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => ring.destroy()
        });
        
        // 2. Particle burst
        const particleColors = [0xFF00FF, 0x00FFFF, 0xFFFF00, 0x00FF00];
        for (let i = 0; i < 8; i++) {
            const particle = this.scene.add.circle(x, y, 3, 
                particleColors[i % particleColors.length]);
            
            const angle = (Math.PI * 2 / 8) * i;
            const targetX = x + Math.cos(angle) * 200;
            const targetY = y + Math.sin(angle) * 200;
            
            this.scene.tweens.add({
                targets: particle,
                x: targetX,
                y: targetY,
                alpha: 0,
                scale: 0,
                duration: 800,
                ease: 'Power2',
                onComplete: () => particle.destroy()
            });
        }
        
        // 3. Screen shake (reduced)
        this.scene.cameras.main.shake(100, 0.002);
        
        // 4. Level text popup
        const levelText = this.scene.add.text(x, y - 50, `LEVEL ${level}!`, {
            fontSize: '32px',
            color: '#00FFFF',
            fontStyle: 'bold',
            stroke: '#FFFFFF',
            strokeThickness: 4
        });
        levelText.setOrigin(0.5);
        
        this.scene.tweens.add({
            targets: levelText,
            y: y - 100,
            scale: 1.5,
            alpha: 0,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => levelText.destroy()
        });
    }
    
    createGrazeEffect(x, y) {
        // Small flash at graze point
        const flash = this.scene.add.circle(x, y, 10, 0xFFD700, 0.8);
        
        this.scene.tweens.add({
            targets: flash,
            scale: 2,
            alpha: 0,
            duration: 300,
            ease: 'Power2',
            onComplete: () => flash.destroy()
        });
        
        // Camera shake
        this.scene.cameras.main.shake(50, 0.002);
    }
    
    createDeathEffect(x, y) {
        // No red flash, just particles
        
        // Explosion particles
        for (let i = 0; i < 12; i++) {
            const particle = this.scene.add.circle(x, y, 5, 0xFF0000);
            const angle = (Math.PI * 2 / 12) * i;
            const speed = 300;
            
            const targetX = x + Math.cos(angle) * 150;
            const targetY = y + Math.sin(angle) * 150;
            
            this.scene.tweens.add({
                targets: particle,
                x: targetX,
                y: targetY,
                alpha: 0,
                scale: 0,
                duration: 600,
                ease: 'Power2',
                onComplete: () => particle.destroy()
            });
        }
        
        // Shockwave
        const shockwave = this.scene.add.circle(x, y, 10, 0xFFFFFF, 0);
        shockwave.setStrokeStyle(3, 0xFFFFFF, 1);
        
        this.scene.tweens.add({
            targets: shockwave,
            radius: 200,
            strokeAlpha: 0,
            duration: 500,
            ease: 'Power2',
            onComplete: () => shockwave.destroy()
        });
    }
    
    createGameStartEffect() {
        // Simple start effect without flash
        // Could add a subtle effect here if needed
    }
    
    createRainbowEffect(target, duration = 600) {
        const colors = [0xFF0000, 0xFFA500, 0xFFFF00, 0x00FF00, 0x0000FF, 0x8B00FF];
        let colorIndex = 0;
        
        const rainbowTimer = this.scene.time.addEvent({
            delay: 100,
            repeat: 5,
            callback: () => {
                target.setTint(colors[colorIndex % colors.length]);
                colorIndex++;
            }
        });
        
        this.scene.time.delayedCall(duration, () => {
            target.clearTint();
        });
        
        return rainbowTimer;
    }
    
    createScorePopup(x, y, points, color = '#FFFF00') {
        const popup = this.scene.add.text(x, y, `+${points}`, {
            fontSize: '20px',
            color: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        });
        popup.setOrigin(0.5);
        
        this.scene.tweens.add({
            targets: popup,
            y: y - 30,
            alpha: 0,
            scale: 1.5,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => popup.destroy()
        });
    }
    
    createPulseEffect(target) {
        return this.scene.tweens.add({
            targets: target,
            scaleX: { from: 1, to: 1.1 },
            scaleY: { from: 1, to: 1.3 },
            duration: 200,
            yoyo: true,
            repeat: 2,
            ease: 'Power2'
        });
    }
    
    reset() {
        // Stars persist across resets
    }
}