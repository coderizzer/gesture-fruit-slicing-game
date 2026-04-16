# gesture-fruit-slicing-game
Fruit Slash is a real-time, gesture-controlled browser game that I built to explore the intersection of computer vision and interactive web experiences. Instead of traditional input methods, the game uses hand tracking to let players slice fruits using natural finger movements captured via webcam.

The focus of this project was not just gameplay, but building a system that feels responsive, visually satisfying, and technically efficient under real-time constraints.

What I Built
Implemented real-time hand tracking using MediaPipe and mapped fingertip coordinates directly to the game world.
Designed a custom swipe detection system based on velocity, direction sampling, and segment–circle collision detection.
Built the game loop and physics interactions using Phaser 3.
Engineered smooth slash trails using interpolation (Catmull-Rom splines) with fading over time.
Developed a modular system architecture for:
Fruits
Bombs
Power-ups
Effects (slow motion, screen shake)
Key Features
Gesture-Based Interaction

Tracks the index finger in real time and converts motion into slicing gestures with velocity thresholds to avoid false positives.

Physics-Driven Gameplay

Each fruit follows realistic trajectories using gravity and velocity, with increasing difficulty over time.

Combo & Scoring System
Combo chaining based on timing windows
Dynamic multipliers
Floating score feedback rendered in-game
Power-Up System
Freeze: Temporarily neutralizes gravity for fruits
Double Score: Applies a global score multiplier
Bomb Mechanic

Introduces risk and requires precision—collision triggers a full game-over sequence with visual feedback.

Visual Feedback System
Multi-layer particle effects for slicing
Screen shake tied to interaction intensity
Slow-motion triggered by rapid slicing
Neon-style slash trails with glow and fade


Technical Highlights
Custom Collision Detection
Uses line segment vs circle intersection instead of simple point collision for more accurate slicing.
Velocity Smoothing
Applies interpolation to stabilize hand tracking input and reduce jitter.
Performance Optimization
Object cleanup and lifecycle management
Controlled particle spawning
Efficient rendering using Phaser graphics
Time Scaling System
Implements slow-motion by modifying physics and game time scales independently.

Tech Stack
JavaScript (ES6+)
Phaser 3 (game engine)
MediaPipe Hands (real-time hand tracking)
HTML5 Canvas

Future Improvements
Mobile compatibility with touch fallback
Audio system integration
Leaderboard and persistence
Additional game modes and mechanics
Gesture recognition beyond slicing

Author

Priyanka Priyadarshinee

License

MIT License
