window.onload = function() {
    console.log("System Initializing...");
    
    // --- Elements ---
    const bootScreen = document.getElementById('boot-screen');
    const bootProgress = document.getElementById('boot-progress');
    const bootLog = document.getElementById('boot-log');
    const hud = document.getElementById('hud');
    const reticle = document.getElementById('reticle');
    const lockStatus = document.getElementById('lock-status');
    const targetLockText = document.getElementById('target-lock');
    const dataStream = document.getElementById('data-stream');
    
    // --- Joystick Logic (Mobile) ---
    if (/Mobi|Android/i.test(navigator.userAgent)) {
        const joystickEl = document.getElementById('joystick');
        if (joystickEl) {
            joystickEl.style.display = 'block';
            let touchStartX, touchStartY;
            window.mobileInput = { moveX: 0, moveY: 0 };
            
            joystickEl.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            });
            
            joystickEl.addEventListener('touchmove', (e) => {
                let touchX = e.touches[0].clientX;
                let touchY = e.touches[0].clientY;
                let dx = touchX - touchStartX;
                let dy = touchY - touchStartY;
                let maxDist = 50;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxDist) {
                    dx = dx * maxDist / dist;
                    dy = dy * maxDist / dist;
                }
                window.mobileInput.moveX = dx / maxDist;
                window.mobileInput.moveY = -dy / maxDist;
            });
            
            joystickEl.addEventListener('touchend', () => {
                window.mobileInput.moveX = 0;
                window.mobileInput.moveY = 0;
            });
        }
    }

    // --- Boot Sequence ---
    let progress = 0;
    const logs = [
        "LOADING KERNEL...",
        "INITIALIZING NEURAL INTERFACE...",
        "CALIBRATING OPTICS...",
        "ESTABLISHING UPLINK...",
        "CHECKING WEAPON SYSTEMS...",
        "ARMOR INTEGRITY: 100%",
        "TARGETING SYSTEMS: ONLINE",
        "WELCOME BACK, SIR."
    ];
    let logIndex = 0;

    function updateBoot() {
        progress += Math.random() * 2; // Slower, more realistic
        if (progress > 100) progress = 100;
        bootProgress.style.width = progress + '%';
        
        // Add log lines randomly based on progress
        if (Math.random() > 0.8 && logIndex < logs.length) {
            const logLine = document.createElement('div');
            logLine.textContent = "> " + logs[logIndex++];
            bootLog.appendChild(logLine);
            bootLog.scrollTop = bootLog.scrollHeight;
        }

        if (progress < 100) {
            requestAnimationFrame(updateBoot);
        } else {
            setTimeout(() => {
                bootScreen.style.transition = 'opacity 1s ease-out';
                bootScreen.style.opacity = '0';
                setTimeout(() => {
                    bootScreen.style.display = 'none';
                    hud.style.display = 'block';
                    initializeGameSystems();
                }, 1000);
            }, 500);
        }
    }
    
    // Start Boot
    updateBoot();

    // --- Main Game Systems ---
    function initializeGameSystems() {
        console.log("HUD Online");

        // 1. Data Stream Animation
        function updateDataStream() {
            let data = 'DATA: ';
            for (let i = 0; i < 8; i++) {
                data += '0x' + Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0') + ' ';
            }
            if(dataStream) dataStream.textContent = data;
            
            // Randomly update altitude slightly to simulate hovering/movement
            if (Math.random() > 0.5) {
                const alt = Math.floor(Math.random() * 5) + 100;
                const altEl = document.getElementById('altitude');
                if(altEl) altEl.textContent = alt + 'm';
            }
        }
        setInterval(updateDataStream, 100);

        // 2. WebXR Hit Test & Surface Detection
        const scene = document.querySelector('a-scene');
        const reticleTarget = document.getElementById('reticle-target');
        
        if (scene) {
            scene.addEventListener('enter-vr', () => {
                if (scene.is('ar-mode')) {
                    // Show reticle when in AR mode
                    if(reticleTarget) reticleTarget.setAttribute('visible', 'true');
                }
            });

            // WebXR Hit Test Logic
            // When the reticle is visible (surface detected), we can place objects.
            const reticle = document.getElementById('reticle-target');
            
            // Listen for user tap to place object (or auto-place for game flow)
            scene.addEventListener('click', () => {
                if (reticle && reticle.getAttribute('visible')) {
                    const position = reticle.getAttribute('position');
                    console.log("Placing enemy at:", position);
                    
                    // Move existing enemies to this new surface position
                    const enemy1 = document.getElementById('enemy1');
                    const enemy2 = document.getElementById('enemy2');
                    
                    if (enemy1 && !enemy1.getAttribute('visible')) {
                        enemy1.setAttribute('position', position);
                        enemy1.setAttribute('visible', 'true');
                        // Offset enemy 2 slightly
                        if (enemy2) {
                            enemy2.setAttribute('position', {x: position.x + 1, y: position.y, z: position.z - 1});
                            enemy2.setAttribute('visible', 'true');
                        }
                        
                        // Audio feedback
                        const lockStatus = document.getElementById('lock-status');
                        if (lockStatus) lockStatus.innerText = "SURFACE LOCKED";
                        if (navigator.vibrate) navigator.vibrate(100);
                    }
                }
            });

            // Auto-spawn logic if surface is stable for a while
            let surfaceStableCount = 0;
            setInterval(() => {
                if (reticle && reticle.getAttribute('visible')) {
                    surfaceStableCount++;
                    if (surfaceStableCount === 20) { // Approx 2 seconds of stable surface
                        // Hint to user
                        const targetLockText = document.getElementById('target-lock');
                        if (targetLockText) targetLockText.innerText = "SURFACE FOUND. TAP TO PLACE.";
                    }
                } else {
                    surfaceStableCount = 0;
                }
            }, 100);
        }

        // 5. AI Object Detection (TensorFlow.js)
        let aiModel = null;
        const hudOverlay = document.createElement('div');
        hudOverlay.id = 'ai-overlay';
        hudOverlay.style.position = 'fixed';
        hudOverlay.style.top = '0';
        hudOverlay.style.left = '0';
        hudOverlay.style.width = '100%';
        hudOverlay.style.height = '100%';
        hudOverlay.style.pointerEvents = 'none';
        hudOverlay.style.zIndex = '90'; // Below HUD, above video
        document.body.appendChild(hudOverlay);

        async function loadAI() {
            try {
                console.log("Loading Neural Network...");
                if (typeof cocoSsd !== 'undefined') {
                    aiModel = await cocoSsd.load();
                    console.log("Neural Network Online");
                    detectFrame();
                } else {
                    console.warn("COCO-SSD not loaded");
                }
            } catch (e) {
                console.error("AI Load Failed:", e);
            }
        }

        async function detectFrame() {
            const video = document.querySelector('video');
            if (video && aiModel && video.readyState === 4) {
                try {
                    const predictions = await aiModel.detect(video);
                    renderPredictions(predictions);
                } catch (e) {
                    // console.warn("Detection error:", e);
                }
            }
            requestAnimationFrame(detectFrame);
        }

        function renderPredictions(predictions) {
            hudOverlay.innerHTML = ''; // Clear previous
            
            predictions.forEach(pred => {
                if (pred.score < 0.6) return;

                const p = document.createElement('div');
                p.className = 'hud-target-box';
                
                const video = document.querySelector('video');
                if (!video || !video.videoWidth) return;

                const scaleX = window.innerWidth / video.videoWidth;
                const scaleY = window.innerHeight / video.videoHeight;
                const scale = Math.max(scaleX, scaleY);
                
                const offsetX = (window.innerWidth - video.videoWidth * scale) / 2;
                const offsetY = (window.innerHeight - video.videoHeight * scale) / 2;

                p.style.position = 'absolute';
                p.style.left = (pred.bbox[0] * scale + offsetX) + 'px';
                p.style.top = (pred.bbox[1] * scale + offsetY) + 'px';
                p.style.width = (pred.bbox[2] * scale) + 'px';
                p.style.height = (pred.bbox[3] * scale) + 'px';
                p.style.border = '1px solid';
                
                let type = 'NEUTRAL';
                let color = '#00ffff'; 
                
                if (pred.class === 'person') {
                    type = 'HUMAN';
                    color = '#00ff00'; 
                } else if (['cell phone', 'laptop', 'tv', 'keyboard'].includes(pred.class)) {
                    type = 'TECH';
                    color = '#ffff00';
                } else if (['cup', 'bottle', 'chair', 'book'].includes(pred.class)) {
                    type = 'OBJECT';
                    color = '#ffaa00';
                }

                // Distance Estimation
                const heightPercent = (pred.bbox[3] * scale) / window.innerHeight;
                const distanceMeters = (1.5 / heightPercent).toFixed(1);

                p.style.borderColor = color;
                p.innerHTML = `<div style="background:${color}; color:black; font-size:10px; padding:2px; display:inline-block;">${type}: ${pred.class.toUpperCase()} <br> DIST: ${distanceMeters}m <br> CONF: ${(pred.score*100).toFixed(0)}%</div>`;
                
                hudOverlay.appendChild(p);
            });
        }

        loadAI();

        // 6. Ambient Light Sensor (Night Vision)
        if ('AmbientLightSensor' in window) {
            try {
                // @ts-ignore
                const sensor = new AmbientLightSensor();
                sensor.addEventListener('reading', () => {
                    const lux = sensor.illuminance;
                    const hudElement = document.getElementById('hud');
                    if (lux < 10) {
                        hudElement.style.filter = 'sepia(1) hue-rotate(50deg) saturate(5) brightness(1.5) contrast(1.2)';
                    } else {
                        hudElement.style.filter = 'none';
                    }
                });
                sensor.start();
            } catch (err) {
                console.log("Light Sensor error:", err);
            }
        }

        // 7. Accelerometer (Impact/Shake Detection)
        let lastX = 0, lastY = 0, lastZ = 0;
        window.addEventListener('devicemotion', (event) => {
            if (!event.accelerationIncludingGravity) return;
            
            const { x, y, z } = event.accelerationIncludingGravity;
            const deltaX = Math.abs(x - lastX);
            const deltaY = Math.abs(y - lastY);
            const deltaZ = Math.abs(z - lastZ);
            
            if (deltaX + deltaY + deltaZ > 25) { // Threshold for shake
                const hud = document.getElementById('hud');
                hud.style.transform = `translate(${Math.random()*20-10}px, ${Math.random()*20-10}px)`;
                hud.style.color = '#ff0000'; // Flash red
                
                if (navigator.vibrate) navigator.vibrate(200);

                setTimeout(() => {
                    hud.style.transform = 'none';
                    hud.style.color = '#00ffff';
                }, 100);
            }
            
            lastX = x;
            lastY = y;
            lastZ = z;
        });

        // 8. Audio/Voice Command Trigger (Sonic Fire)
        async function setupAudioCommand() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const analyser = audioContext.createAnalyser();
                const microphone = audioContext.createMediaStreamSource(stream);
                const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

                analyser.smoothingTimeConstant = 0.8;
                analyser.fftSize = 1024;

                microphone.connect(analyser);
                analyser.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);
                
                scriptProcessor.onaudioprocess = function() {
                    const array = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(array);
                    let values = 0;
                    const length = array.length;
                    for (let i = 0; i < length; i++) {
                        values += array[i];
                    }
                    const average = values / length;

                    if (average > 100) { 
                        console.log("Audio Trigger Detected: " + average);
                        const hud = document.getElementById('hud');
                        hud.style.boxShadow = "inset 0 0 50px rgba(255, 0, 0, 0.5)";
                        setTimeout(() => hud.style.boxShadow = "inset 0 0 50px rgba(0, 255, 255, 0.2)", 200);
                        
                        if (typeof fireWeapon === 'function') {
                            fireWeapon(); 
                        }
                    }
                };
            } catch (e) {
                console.warn("Microphone access:", e);
            }
        }
        setupAudioCommand();

        // 9. Digital Compass (Magnetometer/Orientation)
        window.addEventListener('deviceorientation', (event) => {
            if (event.alpha) {
                const heading = Math.round(event.alpha);
                let compass = document.getElementById('hud-compass');
                if (!compass) {
                    compass = document.createElement('div');
                    compass.id = 'hud-compass';
                    compass.style.position = 'absolute';
                    compass.style.top = '60px';
                    compass.style.left = '50%';
                    compass.style.transform = 'translateX(-50%)';
                    compass.style.color = '#00ffff';
                    compass.style.fontSize = '12px';
                    compass.style.background = 'rgba(0,0,0,0.5)';
                    compass.style.padding = '2px 5px';
                    compass.style.borderRadius = '3px';
                    document.getElementById('hud').appendChild(compass);
                }
                compass.innerText = `HDG: ${heading}°`;

                // Parallax
                const tiltX = (event.gamma || 0) / 4; 
                const tiltY = (event.beta || 0) / 4;
                const panels = document.querySelectorAll('.hud-panel');
                panels.forEach(panel => {
                    panel.style.transform = `translate(${tiltX}px, ${tiltY}px)`;
                });
                const reticle = document.getElementById('reticle');
                if(reticle) reticle.style.transform = `translate(calc(-50% + ${tiltX/2}px), calc(-50% + ${tiltY/2}px))`;
            }
        });

        // 10. Voice Command (Web Speech API) - Jarvis Style
        if ('webkitSpeechRecognition' in window) {
            // @ts-ignore
            const recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = function(event) {
                const last = event.results.length - 1;
                const command = event.results[last][0].transcript.trim().toLowerCase();
                console.log("Voice Command:", command);

                const targetLockText = document.getElementById('target-lock');
                
                if (command.includes('fire') || command.includes('shoot')) {
                    fireWeapon();
                } else if (command.includes('scan') || command.includes('target')) {
                    targetLockText.innerText = "VOICE: SCANNING...";
                    targetLockText.style.color = '#ffff00';
                    setTimeout(() => targetLockText.innerText = "SCANNING...", 2000);
                } else if (command.includes('status') || command.includes('report')) {
                     const hud = document.getElementById('hud');
                     hud.style.opacity = '0.5';
                     setTimeout(() => hud.style.opacity = '1', 200);
                     targetLockText.innerText = "SYSTEMS: OPTIMAL";
                     setTimeout(() => targetLockText.innerText = "SCANNING...", 2000);
                }
            };
            
            recognition.onend = function() {
                try { recognition.start(); } catch(e) {}
            };

            try { recognition.start(); } catch(e) {}
        }

        // 4. Advanced Target Locking & Auto-Fire
        const enemies = [document.getElementById('enemy1'), document.getElementById('enemy2')];
        let currentTarget = null;
        let lockTimer = null;
        let isLocked = false;

        function checkTargetLock() {
            let foundTarget = null;
            
            enemies.forEach(enemy => {
                if (enemy && enemy.getAttribute('visible') !== false) {
                    // Simple check if visible
                    foundTarget = enemy; 
                }
            });

            if (foundTarget) {
                if (currentTarget !== foundTarget) {
                    currentTarget = foundTarget;
                    startLockSequence();
                }
            } else {
                if (currentTarget) {
                    lostTarget();
                }
            }
        }

        function startLockSequence() {
            if (isLocked) return;
            
            reticle.classList.add('locking');
            lockStatus.textContent = "ACQUIRING...";
            lockStatus.style.color = "#ff0000"; 
            targetLockText.textContent = "TRACKING SUBJ...";
            
            if (navigator.vibrate) navigator.vibrate(50);

            clearTimeout(lockTimer);
            lockTimer = setTimeout(() => {
                lockStatus.textContent = "LOCKED";
                targetLockText.textContent = "LOCK CONFIRMED";
                
                setTimeout(() => {
                    fireWeapon();
                }, 500);
                
            }, 1000); 
        }

        function fireWeapon() {
            const isManualFire = !currentTarget; 
            if (!currentTarget && typeof fireWeapon.caller === 'function') {
                 // Check if called from internal logic
            }
            
            console.log("FIRING!");
            
            lockStatus.textContent = isManualFire ? "SONIC FIRE" : "TARGET DESTROYED";
            lockStatus.style.color = "#00ff00"; 
            targetLockText.textContent = isManualFire ? "WEAPON DISCHARGED" : "THREAT NEUTRALIZED";
            
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

            if (currentTarget) {
                currentTarget.setAttribute('visible', 'false');
            }
            
            setTimeout(() => {
                if(currentTarget) lostTarget();
                else {
                    lockStatus.textContent = "NO TARGET";
                    lockStatus.style.color = "#00ffff";
                    targetLockText.textContent = "SCANNING...";
                }
            }, 1500);
        }

        function lostTarget() {
            currentTarget = null;
            isLocked = false;
            clearTimeout(lockTimer);
            
            reticle.classList.remove('locking');
            lockStatus.textContent = "NO TARGET";
            lockStatus.style.color = "#00ffff";
            targetLockText.textContent = "SCANNING...";
        }

        setInterval(checkTargetLock, 500);
    }

    // Ensure Audio Context & Sensors resume/start on user interaction (Browser policy)
    document.body.addEventListener('click', () => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
             // Resume if needed
        }

        // iOS 13+ Sensor Permission
        // @ts-ignore
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            // @ts-ignore
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response == 'granted') {
                        console.log("Sensor permission granted");
                    }
                })
                .catch(console.error);
        }
    }, { once: true });
};
