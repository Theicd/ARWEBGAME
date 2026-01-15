window.onload = function() {
    // === LOGGING SYSTEM ===
    const L = window.IronLogger || { 
        log: () => {}, ai: () => {}, ar: () => {}, combat: () => {}, 
        sensor: () => {}, perf: () => {}, error: () => {},
        perfStart: () => {}, perfEnd: () => {}
    };
    
    L.log('SYSTEM', 'GAME_INIT', { page: 'game.html', timestamp: new Date().toISOString() });
    console.log("Iron Man HUD Mk.X (Combat System) Initializing...");

    // === GAME MODE ===
    let gameMode = '2D'; // '2D' or 'AR'
    let cameraStream = null;
    const modeIndicator = document.getElementById('mode-indicator');
    const cameraVideo = document.getElementById('camera-video');
    const btn2D = document.getElementById('btn-2d');
    const btnAR = document.getElementById('btn-ar');
    
    // Check AR support
    async function checkARSupport() {
        if(navigator.xr) {
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-ar');
                if(supported && btnAR) {
                    btnAR.style.display = 'block';
                    L.log('SYSTEM', 'AR_SUPPORTED', { available: true });
                }
            } catch(e) {}
        }
    }
    checkARSupport();
    
    // Start camera for 2D mode
    async function startCamera() {
        try {
            // Stop any existing stream
            if(cameraStream) {
                cameraStream.getTracks().forEach(t => t.stop());
            }
            
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });
            
            if(cameraVideo) {
                cameraVideo.srcObject = cameraStream;
                cameraVideo.style.display = 'block';
                L.log('SYSTEM', 'CAMERA_STARTED', { mode: '2D' });
                console.log("Camera started in 2D mode");
            }
        } catch(e) {
            L.error('CAMERA', e);
            console.log("Camera error:", e);
        }
    }
    
    // Stop camera
    function stopCamera() {
        if(cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
        if(cameraVideo) {
            cameraVideo.srcObject = null;
            cameraVideo.style.display = 'none';
        }
    }
    
    // Set game mode (called from HTML buttons)
    window.setMode = function(mode) {
        if(mode === gameMode) return;
        
        L.log('SYSTEM', 'MODE_CHANGE', { from: gameMode, to: mode });
        console.log("Switching to", mode, "mode");
        
        if(mode === '2D') {
            gameMode = '2D';
            btn2D.classList.add('active');
            btnAR.classList.remove('active');
            if(modeIndicator) {
                modeIndicator.textContent = '2D MODE';
                modeIndicator.classList.remove('ar-mode');
            }
            
            // Start camera
            startCamera();
            
        } else if(mode === 'AR') {
            // AR mode - will be implemented with WebXR
            alert('מצב AR יהיה זמין בקרוב!\nכרגע השתמש במצב 2D.');
        }
    };
    
    // Start 2D mode immediately
    startCamera();
    
    // Start spawning enemies after delay
    setTimeout(() => {
        L.log('SYSTEM', '2D_GAME_START', {});
        console.log("Starting 2D mode with overlay enemies...");
        createOverlayEnemy();
        
        setInterval(() => {
            if(gameMode === '2D' && overlayEnemies.length < MAX_ENEMIES) {
                createOverlayEnemy();
            }
        }, ENEMY_SPAWN_INTERVAL);
    }, 2000);

    // === ROOM CALIBRATION DATA ===
    let roomData = null;
    if(typeof RoomCalibration !== 'undefined') {
        roomData = RoomCalibration.loadStatic();
        if(roomData && roomData.calibrated) {
            L.log('SYSTEM', 'ROOM_DATA_LOADED', { 
                avgDistance: roomData.avgDistance,
                roomSize: roomData.roomSize
            });
            console.log("Room calibration loaded:", roomData.roomSize, "room, avg:", roomData.avgDistance.toFixed(1) + "m");
        }
    }

    // === COMBAT SYSTEM CONFIG ===
    const LOCK_TIME_TO_FIRE = 1200; // 1.2 שניות נעילה לפני ירי
    const ENEMY_SPAWN_INTERVAL = 6000; // כל 6 שניות אויב חדש
    const MAX_ENEMIES = 3; // מקסימום אויבים במסך
    const AI_SCAN_INTERVAL = 500; // סריקה כל 500ms (במקום 200ms)
    let lockStartTime = null;
    let currentTarget = null;
    let enemies = [];
    let kills = 0;

    // === DOM ELEMENTS ===
    // Top HUD
    const headingEl = document.getElementById('heading-num');
    const altEl = document.getElementById('val-alt');
    const spdTopEl = document.getElementById('val-spd');
    
    // Center HUD (Rangefinder)
    const rangeValueEl = document.getElementById('range-value');
    const targetNameEl = document.getElementById('target-name');
    const reticleBox = document.getElementById('reticle-box');
    
    // AI Detection Box
    const aiObjectList = document.getElementById('ai-object-list');
    
    // Bottom HUD
    const pwrEl = document.getElementById('val-pwr');
    const gEl = document.getElementById('val-g');
    const luxEl = document.getElementById('val-lux');
    const magEl = document.getElementById('val-mag');
    const radFill = document.getElementById('rad-fill');
    const motionDot = document.getElementById('motion-dot');
    const motionStatus = document.getElementById('motion-status');
    const voiceBars = document.querySelectorAll('.v-bar');
    
    // PWA
    const hudInstallBtn = document.getElementById('hud-install');
    const installModal = document.getElementById('install-modal');
    const modalInstallBtn = document.getElementById('modal-install');
    const modalCloseBtn = document.getElementById('modal-close');

    // === SENSOR DATA ===
    let currentLux = 50;
    let currentMag = 40;
    let motionHistory = [];
    let lastGpsSpeed = 0;
    let isMoving = false;

    // === PWA INSTALL ===
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if(hudInstallBtn) hudInstallBtn.style.display = 'inline-block';
        if(installModal) installModal.style.display = 'flex';
    });

    if(modalInstallBtn) {
        modalInstallBtn.addEventListener('click', () => {
            if(installModal) installModal.style.display = 'none';
            if(deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((res) => {
                    if(res.outcome === 'accepted' && hudInstallBtn) {
                        hudInstallBtn.style.display = 'none';
                    }
                    deferredPrompt = null;
                });
            }
        });
    }
    
    if(modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            if(installModal) installModal.style.display = 'none';
        });
    }
    
    if(hudInstallBtn) {
        hudInstallBtn.addEventListener('click', () => {
            if(installModal) installModal.style.display = 'flex';
        });
    }

    // === COMPASS (DeviceOrientation) ===
    window.addEventListener('deviceorientation', (e) => {
        if(e.alpha !== null && headingEl) {
            const heading = Math.round(e.alpha);
            headingEl.textContent = heading.toString().padStart(3, '0') + '°';
        }
    });

    // === MOTION DETECTION (Accelerometer) ===
    window.addEventListener('devicemotion', (e) => {
        if(e.accelerationIncludingGravity) {
            const {x, y, z} = e.accelerationIncludingGravity;
            const magnitude = Math.sqrt(x*x + y*y + z*z);
            
            // G-Force display
            if(gEl) gEl.textContent = (magnitude / 9.8).toFixed(1);
            
            // Motion detection
            motionHistory.push(magnitude);
            if(motionHistory.length > 25) motionHistory.shift();
            
            if(motionHistory.length >= 25) {
                const avg = motionHistory.reduce((a,b) => a+b) / motionHistory.length;
                const variance = motionHistory.reduce((a,b) => a + Math.pow(b-avg, 2), 0) / motionHistory.length;
                
                isMoving = variance > 0.8;
                
                if(motionDot) {
                    motionDot.classList.toggle('moving', isMoving);
                }
                if(motionStatus) {
                    motionStatus.textContent = isMoving ? 'MOVING' : 'IDLE';
                    motionStatus.style.color = isMoving ? '#00ff00' : '#888';
                }
            }
        }
    });

    // === GPS (Speed & Altitude) ===
    if('geolocation' in navigator) {
        navigator.geolocation.watchPosition((pos) => {
            // Speed
            const spd = pos.coords.speed;
            lastGpsSpeed = spd ? (spd * 3.6) : 0;
            if(spdTopEl) {
                spdTopEl.textContent = lastGpsSpeed >= 1 ? lastGpsSpeed.toFixed(0) : '0';
            }
            
            // Altitude
            if(altEl && pos.coords.altitude !== null) {
                altEl.textContent = Math.round(pos.coords.altitude);
            }
        }, null, { enableHighAccuracy: true });
    }

    // === BATTERY ===
    if(navigator.getBattery) {
        navigator.getBattery().then(battery => {
            const updateBattery = () => {
                if(pwrEl) pwrEl.textContent = Math.round(battery.level * 100) + '%';
            };
            updateBattery();
            battery.addEventListener('levelchange', updateBattery);
        });
    }

    // === AMBIENT LIGHT SENSOR ===
    if('AmbientLightSensor' in window) {
        try {
            const lightSensor = new AmbientLightSensor();
            lightSensor.addEventListener('reading', () => {
                currentLux = Math.round(lightSensor.illuminance);
                if(luxEl) luxEl.textContent = currentLux;
                updateRadiation();
            });
            lightSensor.start();
        } catch(e) { console.log("Light sensor error:", e); }
    }

    // === MAGNETOMETER (Simulated for radiation) ===
    if('Magnetometer' in window) {
        try {
            const magSensor = new Magnetometer({frequency: 10});
            magSensor.addEventListener('reading', () => {
                const {x, y, z} = magSensor;
                currentMag = Math.round(Math.sqrt(x*x + y*y + z*z));
                if(magEl) magEl.textContent = currentMag + 'μT';
                updateRadiation();
            });
            magSensor.start();
        } catch(e) { 
            console.log("Magnetometer error:", e);
            // Simulate magnetometer
            setInterval(() => {
                currentMag = 40 + Math.round(Math.random() * 20);
                if(magEl) magEl.textContent = currentMag + 'μT';
                updateRadiation();
            }, 500);
        }
    } else {
        // Simulate magnetometer
        setInterval(() => {
            currentMag = 40 + Math.round(Math.random() * 20);
            if(magEl) magEl.textContent = currentMag + 'μT';
            updateRadiation();
        }, 500);
    }

    // === RADIATION METER (Lux + Mag combined) ===
    function updateRadiation() {
        // Combine light and magnetic readings for "radiation" effect
        const luxScore = Math.min(100, currentLux / 10);
        const magScore = Math.min(100, (currentMag - 30) * 2);
        const radiation = Math.min(100, Math.max(0, (luxScore + magScore) / 2));
        
        if(radFill) {
            radFill.style.width = radiation + '%';
        }
    }

    // === VOICE VISUALIZER ===
    async function initAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 32;
            src.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            
            // Resume on user interaction
            const resume = () => { if(ctx.state === 'suspended') ctx.resume(); };
            document.addEventListener('touchstart', resume);
            document.addEventListener('click', resume);

            function loop() {
                requestAnimationFrame(loop);
                analyser.getByteFrequencyData(data);
                
                for(let i = 0; i < voiceBars.length && i < data.length; i++) {
                    const h = Math.max(3, (data[i] / 255) * 25);
                    voiceBars[i].style.height = h + 'px';
                    voiceBars[i].style.background = data[i] > 150 ? '#ffff00' : '#00ffff';
                }
            }
            loop();
        } catch(e) { console.log("Mic error:", e); }
    }
    initAudio();

    // === AR MODE (DISABLED - 2D ONLY FOR NOW) ===
    // AR mode will be added in future version with proper WebXR support

    // === COMBAT SYSTEM (2D MODE) ===
    // Combat handled through overlay enemy system below

    // === AI OBJECT DETECTION & RANGEFINDER ===
    let aiModel = null;
    
    if(typeof cocoSsd !== 'undefined') {
        L.ai('MODEL_LOADING', { status: 'starting' });
        L.perfStart('ai_model_load');
        cocoSsd.load().then(model => {
            aiModel = model;
            const loadTime = L.perfEnd('ai_model_load');
            L.ai('MODEL_LOADED', { loadTime: loadTime });
            console.log("AI Model loaded");
        }).catch(e => {
            L.error('AI_MODEL', e);
            console.log("AI load error:", e);
        });
    } else {
        L.ai('MODEL_UNAVAILABLE', { reason: 'cocoSsd not defined' });
    }

    // Main detection loop (2D mode - AI detection only)
    function combatLoop() {
        // In 2D mode, just do AI detection for info display
        detectRealWorld();
        requestAnimationFrame(combatLoop);
    }
    
    // Update AI Detection Box with all detected objects
    function updateAIDetectionBox(predictions, currentLock) {
        if(!aiObjectList) return;
        
        let html = '';
        
        // If there's an enemy lock, show it first as HOSTILE
        if(currentLock) {
            html += `<div class="ai-item hostile">
                <span>⚠ HOSTILE ${currentLock.enemy.dataset.type || 'UNKNOWN'}</span>
                <span class="conf">${currentLock.distance.toFixed(1)}m</span>
            </div>`;
        }
        
        // Add all AI-detected real world objects
        if(predictions && predictions.length > 0) {
            for(let pred of predictions) {
                if(pred.score < 0.35) continue;
                const confidence = Math.round(pred.score * 100);
                html += `<div class="ai-item">
                    <span>${pred.class.toUpperCase()}</span>
                    <span class="conf">${confidence}%</span>
                </div>`;
            }
        }
        
        // If nothing detected
        if(html === '') {
            html = '<div class="ai-item scanning">SCANNING...</div>';
        }
        
        aiObjectList.innerHTML = html;
    }
    
    // Continuous AI scanning (runs always)
    let lastPredictions = [];
    
    let aiScanCount = 0;
    let lastAiScanTime = 0;
    
    function aiScanLoop() {
        const video = document.querySelector('video');
        const now = Date.now();
        
        if(video && aiModel && video.readyState === 4) {
            L.perfStart('ai_detect');
            aiModel.detect(video).then(predictions => {
                const detectTime = L.perfEnd('ai_detect');
                lastPredictions = predictions.filter(p => p.score >= 0.35);
                aiScanCount++;
                
                // Log every 10th scan to avoid spam
                if(aiScanCount % 10 === 0) {
                    L.ai('SCAN_RESULT', { 
                        scanNum: aiScanCount,
                        detectTime: detectTime,
                        objectsFound: lastPredictions.length,
                        objects: lastPredictions.map(p => ({ class: p.class, score: Math.round(p.score * 100) }))
                    });
                }
            }).catch(e => {
                L.error('AI_DETECT', e);
            });
        } else {
            // Log why scan didn't run
            if(aiScanCount === 0 && now - lastAiScanTime > 5000) {
                L.ai('SCAN_BLOCKED', {
                    hasVideo: !!video,
                    hasModel: !!aiModel,
                    videoReady: video ? video.readyState : 'N/A'
                });
                lastAiScanTime = now;
            }
        }
        setTimeout(aiScanLoop, AI_SCAN_INTERVAL);
    }
    
    function detectRealWorld() {
        const video = document.querySelector('video');
        if(!video || !aiModel || video.readyState !== 4) {
            if(rangeValueEl) rangeValueEl.textContent = '--.-';
            if(targetNameEl) {
                targetNameEl.textContent = 'SCANNING...';
                targetNameEl.style.color = '#888';
            }
            updateAIDetectionBox([], null);
            return;
        }
        
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const scaleX = window.innerWidth / video.videoWidth;
        const scaleY = window.innerHeight / video.videoHeight;
        const scale = Math.max(scaleX, scaleY);
        const offsetX = (window.innerWidth - video.videoWidth * scale) / 2;
        const offsetY = (window.innerHeight - video.videoHeight * scale) / 2;
        
        // Update AI box with all predictions
        updateAIDetectionBox(lastPredictions, null);
        
        // Find object in crosshair
        let found = null;
        for(let pred of lastPredictions) {
            const x = pred.bbox[0] * scale + offsetX;
            const y = pred.bbox[1] * scale + offsetY;
            const w = pred.bbox[2] * scale;
            const h = pred.bbox[3] * scale;
            
            if(cx >= x - 100 && cx <= x + w + 100 && cy >= y - 100 && cy <= y + h + 100) {
                found = pred;
                break;
            }
        }
        
        if(found) {
            if(targetNameEl) {
                targetNameEl.textContent = found.class.toUpperCase();
                targetNameEl.style.color = '#00ffff';
            }
            const heightPercent = (found.bbox[3] * scale) / window.innerHeight;
            
            // Calculate distance - use room calibration if available
            let distance = 1.5 / heightPercent; // Basic calculation
            
            if(roomData && roomData.calibrated && roomData.avgDistance > 0) {
                // Adjust based on room calibration
                const maxDist = roomData.avgDistance * 1.2;
                distance = Math.min(distance, maxDist);
                
                // Known object sizes for better accuracy
                const knownSizes = {
                    'person': 1.7, 'chair': 0.9, 'tv': 0.6, 
                    'laptop': 0.3, 'bottle': 0.25, 'cell phone': 0.15
                };
                
                if(knownSizes[found.class]) {
                    const realHeight = knownSizes[found.class];
                    distance = realHeight / heightPercent;
                }
            }
            
            if(rangeValueEl) {
                rangeValueEl.textContent = distance.toFixed(1);
                rangeValueEl.style.color = '#00ffff';
            }
        } else {
            if(targetNameEl) {
                targetNameEl.textContent = 'NO TARGET';
                targetNameEl.style.color = '#888';
            }
            if(rangeValueEl) rangeValueEl.textContent = '--.-';
        }
    }
    
    // Start combat loop and AI scan
    combatLoop();
    aiScanLoop();
    
    // === OVERLAY ENEMIES (Fallback for non-WebXR) ===
    let overlayEnemies = [];
    
    function createOverlayEnemy() {
        const enemy = document.createElement('div');
        enemy.className = 'overlay-enemy';
        enemy.dataset.health = '100';
        enemy.dataset.type = 'DRONE';
        
        // Random position on screen
        const x = 15 + Math.random() * 70; // 15%-85% from left
        const y = 15 + Math.random() * 50; // 15%-65% from top
        const size = 60 + Math.random() * 40; // 60-100px
        
        enemy.style.cssText = `
            position: fixed;
            left: ${x}%;
            top: ${y}%;
            width: ${size}px;
            height: ${size}px;
            transform: translate(-50%, -50%);
            z-index: 5000;
            pointer-events: none;
        `;
        
        // Impressive floating enemy visual
        enemy.innerHTML = `
            <div class="enemy-core" style="
                position: relative;
                width: 100%;
                height: 100%;
            ">
                <!-- Outer pulsing ring -->
                <div style="
                    position: absolute;
                    inset: -10px;
                    border: 2px solid rgba(255,0,0,0.5);
                    border-radius: 50%;
                    animation: enemyRingPulse 2s ease-in-out infinite;
                "></div>
                <!-- Middle ring -->
                <div style="
                    position: absolute;
                    inset: 0;
                    border: 3px solid #ff0000;
                    border-radius: 50%;
                    animation: enemySpin 4s linear infinite;
                    box-shadow: 0 0 20px rgba(255,0,0,0.6), inset 0 0 20px rgba(255,0,0,0.3);
                "></div>
                <!-- Inner glow core -->
                <div style="
                    position: absolute;
                    inset: 25%;
                    background: radial-gradient(circle, #ff3300 0%, #aa0000 50%, transparent 70%);
                    border-radius: 50%;
                    animation: enemyCorePulse 1s ease-in-out infinite;
                    box-shadow: 0 0 30px #ff0000;
                "></div>
                <!-- Crosshair lines -->
                <div style="
                    position: absolute;
                    top: 50%; left: 0; right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, transparent 0%, #ff0000 30%, #ff0000 70%, transparent 100%);
                    transform: translateY(-50%);
                "></div>
                <div style="
                    position: absolute;
                    left: 50%; top: 0; bottom: 0;
                    width: 1px;
                    background: linear-gradient(180deg, transparent 0%, #ff0000 30%, #ff0000 70%, transparent 100%);
                    transform: translateX(-50%);
                "></div>
            </div>
            <!-- Label -->
            <div style="
                position: absolute;
                bottom: -22px;
                left: 50%;
                transform: translateX(-50%);
                color: #ff0000;
                font-size: 9px;
                font-weight: bold;
                text-shadow: 0 0 8px #ff0000;
                letter-spacing: 2px;
                white-space: nowrap;
            ">⚠ HOSTILE</div>
        `;
        
        document.body.appendChild(enemy);
        overlayEnemies.push(enemy);
        
        // Random movement
        let moveX = (Math.random() - 0.5) * 2;
        let moveY = (Math.random() - 0.5) * 1;
        
        enemy._moveInterval = setInterval(() => {
            let currentX = parseFloat(enemy.style.left);
            let currentY = parseFloat(enemy.style.top);
            
            currentX += moveX;
            currentY += moveY;
            
            // Bounce off edges
            if(currentX < 15 || currentX > 85) moveX *= -1;
            if(currentY < 15 || currentY > 65) moveY *= -1;
            
            enemy.style.left = currentX + '%';
            enemy.style.top = currentY + '%';
        }, 50);
        
        console.log('Overlay enemy created');
        return enemy;
    }
    
    function checkOverlayEnemyLock() {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        
        for(let enemy of overlayEnemies) {
            const rect = enemy.getBoundingClientRect();
            const enemyCX = rect.left + rect.width / 2;
            const enemyCY = rect.top + rect.height / 2;
            
            const dist = Math.sqrt(Math.pow(cx - enemyCX, 2) + Math.pow(cy - enemyCY, 2));
            
            // If crosshair is within 100px of enemy center
            if(dist < 100) {
                // Calculate fake distance based on enemy size
                const fakeDistance = Math.max(2, 15 - (rect.width / 10));
                return { enemy, distance: fakeDistance };
            }
        }
        return null;
    }
    
    function fireAtOverlayEnemy(enemy) {
        console.log('FIRING at overlay enemy!');
        
        // Flash effect
        enemy.style.filter = 'brightness(3)';
        setTimeout(() => enemy.style.filter = '', 100);
        
        // Damage
        let health = parseInt(enemy.dataset.health) || 100;
        health -= 50;
        enemy.dataset.health = health;
        
        if(navigator.vibrate) navigator.vibrate([50, 30, 100]);
        
        if(health <= 0) {
            destroyOverlayEnemy(enemy);
        }
    }
    
    function destroyOverlayEnemy(enemy) {
        console.log('ENEMY DESTROYED!');
        kills++;
        
        clearInterval(enemy._moveInterval);
        
        // Explosion effect
        enemy.innerHTML = `
            <div style="
                width: 120px;
                height: 120px;
                background: radial-gradient(circle, #ffff00 0%, #ff6600 50%, transparent 70%);
                border-radius: 50%;
                animation: explode 0.3s ease-out forwards;
            "></div>
        `;
        
        setTimeout(() => {
            enemy.remove();
            overlayEnemies = overlayEnemies.filter(e => e !== enemy);
        }, 300);
        
        if(targetNameEl) {
            targetNameEl.textContent = 'KILL CONFIRMED';
            targetNameEl.style.color = '#00ff00';
        }
        
        if(navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    }
    
    // Override combat loop to also check overlay enemies
    function overlayLoop() {
        // Check overlay enemies if not in WebXR
        if(!isInAR && overlayEnemies.length > 0) {
            const lock = checkOverlayEnemyLock();
            
            if(lock) {
                if(reticleBox) reticleBox.classList.add('locked');
                
                if(targetNameEl) {
                    targetNameEl.textContent = '⚠ HOSTILE DRONE';
                    targetNameEl.style.color = '#ff3300';
                }
                
                if(rangeValueEl) {
                    rangeValueEl.textContent = lock.distance.toFixed(1);
                    rangeValueEl.style.color = '#ff3300';
                }
                
                // Lock timer
                if(currentTarget !== lock.enemy) {
                    currentTarget = lock.enemy;
                    lockStartTime = Date.now();
                } else if(lockStartTime && Date.now() - lockStartTime >= LOCK_TIME_TO_FIRE) {
                    fireAtOverlayEnemy(lock.enemy);
                    lockStartTime = Date.now();
                }
            } else {
                currentTarget = null;
                lockStartTime = null;
                if(reticleBox) reticleBox.classList.remove('locked');
            }
        }
        
        requestAnimationFrame(overlayLoop);
    }
    overlayLoop();
    
    // Spawn overlay enemies periodically if not in AR
    setInterval(() => {
        if(!isInAR && overlayEnemies.length < MAX_ENEMIES) {
            createOverlayEnemy();
        }
    }, ENEMY_SPAWN_INTERVAL);
    
    // Spawn first enemy after 3 seconds
    setTimeout(() => {
        if(!isInAR) createOverlayEnemy();
    }, 3000);

    // === TAP TO SPAWN ENEMY ===
    document.addEventListener('click', (e) => {
        if(e.target.id === 'enter-ar-btn') return;
        // Spawn enemy on tap (if less than max)
        if(!isInAR && overlayEnemies.length < MAX_ENEMIES) {
            createOverlayEnemy();
            if(navigator.vibrate) navigator.vibrate(30);
        }
    });

    // === CAMERA KICKER ===
    function kickCamera() {
        const video = document.querySelector('video');
        if(video) {
            if(!video.hasAttribute('playsinline')) video.setAttribute('playsinline', '');
            if(!video.hasAttribute('webkit-playsinline')) video.setAttribute('webkit-playsinline', '');
            if(!video.muted) video.muted = true;
            if(video.paused) video.play().catch(e => {});
        }
    }
    setInterval(kickCamera, 1000);
    document.addEventListener('click', kickCamera);
    document.addEventListener('touchstart', kickCamera);

    console.log("Iron Man HUD Mk.X Combat System Ready!");
    console.log("- Enemies spawn automatically");
    console.log("- Aim at enemy for 1.5s to auto-fire");
    console.log("- Tap screen to spawn enemy on surface");
};
