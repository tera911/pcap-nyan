import Phaser from 'phaser';
import DodgeScene from './scenes/DodgeScene';
import WebSocketManager from './utils/WebSocketManager';

// Initialize WebSocket manager
const wsManager = new WebSocketManager();

// Phaser game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },  // No gravity for bullet hell
            debug: false
        }
    },
    scene: [DodgeScene],
    render: {
        pixelArt: false,  // Disable pixel art mode for smoother text
        antialias: true,  // Enable antialiasing
        roundPixels: true  // Round pixel positions for crisper rendering
    },
    scale: {
        mode: Phaser.Scale.NONE,  // No automatic scaling
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

// Create game
const game = new Phaser.Game(config);

// Pass WebSocket manager to the scene
game.scene.start('DodgeScene', { wsManager: wsManager });