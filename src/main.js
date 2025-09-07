import Phaser from 'phaser';
import DodgeScene from './scenes/DodgeScene';
import WebSocketManager from './utils/WebSocketManager';

// Initialize WebSocket manager
const wsManager = new WebSocketManager();

// Phaser game configuration
const config = {
    type: Phaser.AUTO,
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
        mode: Phaser.Scale.FIT,  // Fit to container
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720
    }
};

// Create game
const game = new Phaser.Game(config);

// Pass WebSocket manager to the scene
game.scene.start('DodgeScene', { wsManager: wsManager });