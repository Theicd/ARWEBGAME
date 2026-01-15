window.onload = function() {
    console.log("Iron Man HUD Mk.X (Combat System) Initializing...");

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

    // === WEBXR AR MODE ===
    let xrSession = null;
    let xrHitTestSource = null;
    let xrRefSpace = null;
    let arReticle = null;
    let lastHitPose = null;
    let isInAR = false;
    
    const enterARBtn = document.getElementById('enter-ar-btn');
    const scene = document.querySelector('a-scene');
    const enemyContainer = document.getElementById('enemy-container');
    
    // Enter AR button
    if(enterARBtn) {
        enterARBtn.addEventListener('click', async () => {
            if(!navigator.xr) {
                alert('WebXR לא נתמך בדפדפן זה. נסה Chrome על אנדרואיד או Safari על iOS.');
                return;
            }
            
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if(!supported) {
                alert('AR לא נתמך במכשיר זה. נדרש ARCore (אנדרואיד) או ARKit (iOS).');
                return;
            }
            
            try {
                xrSession = await navigator.xr.requestSession('immersive-ar', {
                    requiredFeatures: ['hit-test'],
                    optionalFeatures: ['dom-overlay', 'local-floor'],
                    domOverlay: { root: document.getElementById('hud') }
                });
                
                enterARBtn.style.display = 'none';
                isInAR = true;
                
                // Setup hit test
                const viewerSpace = await xrSession.requestReferenceSpace('viewer');
                xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
                xrRefSpace = await xrSession.requestReferenceSpace('local-floor');
                
                // Show AR reticle
                arReticle = document.getElementById('ar-reticle');
                if(arReticle) arReticle.setAttribute('visible', 'true');
                
                // Start AR render loop
                scene.renderer.xr.enabled = true;
                scene.renderer.xr.setReferenceSpaceType('local-floor');
                await scene.renderer.xr.setSession(xrSession);
                
                // Spawn first enemy after 3 seconds
                setTimeout(() => spawnEnemy3D(), 3000);
                
                // Spawn enemies periodically
                setInterval(() => {
                    if(isInAR && enemies.length < MAX_ENEMIES) {
                        spawnEnemy3D();
                    }
                }, ENEMY_SPAWN_INTERVAL);
                
                console.log('AR Session started!');
                
                xrSession.addEventListener('end', () => {
                    isInAR = false;
                    enterARBtn.style.display = 'block';
                    console.log('AR Session ended');
                });
                
            } catch(e) {
                console.error('AR Error:', e);
                alert('שגיאה בהפעלת AR: ' + e.message);
            }
        });
    }
    
    // Spawn 3D enemy at a position in front of camera
    function spawnEnemy3D() {
        if(!enemyContainer) return;
        
        // Random position in front of camera
        const angle = (Math.random() - 0.5) * 1.5; // -0.75 to 0.75 radians (~45 degrees each side)
        const distance = 2 + Math.random() * 3; // 2-5 meters away
        const x = Math.sin(angle) * distance;
        const z = -Math.cos(angle) * distance;
        const y = 0.5 + Math.random() * 1; // 0.5-1.5m above ground
        
        const enemy = document.createElement('a-entity');
        enemy.setAttribute('id', 'enemy-' + Date.now());
        enemy.setAttribute('class', 'ar-enemy');
        enemy.setAttribute('position', `${x} ${y} ${z}`);
        
        // DRONE enemy - sphere with rotating ring
        enemy.innerHTML = `
            <a-sphere radius="0.25" color="#222" metalness="0.9" roughness="0.1"></a-sphere>
            <a-ring rotation="90 0 0" radius-inner="0.35" radius-outer="0.45" color="#ff0000" opacity="0.8"
                    animation="property: rotation; from: 90 0 0; to: 90 360 0; dur: 2000; loop: true; easing: linear"></a-ring>
            <a-light type="point" color="#ff3300" intensity="0.8" distance="2"></a-light>
        `;
        
        enemy.dataset.health = '100';
        enemy.dataset.type = 'DRONE';
        
        enemyContainer.appendChild(enemy);
        enemies.push(enemy);
        
        console.log('3D Enemy spawned at:', x.toFixed(2), y.toFixed(2), z.toFixed(2));
    }
    
    // Tap to spawn enemy (for testing without full AR)
    document.addEventListener('click', (e) => {
        if(e.target.id === 'enter-ar-btn') return;
        if(isInAR && lastHitPose && enemies.length < MAX_ENEMIES) {
            // Spawn at hit test location
            const pos = lastHitPose.transform.position;
            spawnEnemyAt3D(pos.x, pos.y + 0.5, pos.z);
        }
    });

    // === COMBAT SYSTEM - LOCK & FIRE ===
    function checkEnemyLock() {
        const camera = document.querySelector('[camera]');
        if(!camera || !camera.object3D) return null;
        
        const camPos = new THREE.Vector3();
        const camDir = new THREE.Vector3();
        camera.object3D.getWorldPosition(camPos);
        camera.object3D.getWorldDirection(camDir);
        
        for(let enemy of enemies) {
            if(!enemy.parentNode || !enemy.object3D) continue;
            
            const enemyPos = new THREE.Vector3();
            enemy.object3D.getWorldPosition(enemyPos);
            
            const toEnemy = new THREE.Vector3().subVectors(enemyPos, camPos);
            const distance = toEnemy.length();
            
            // Normalize
            toEnemy.normalize();
            
            // Dot product - how aligned are we? (1 = perfect, 0 = perpendicular)
            const dot = camDir.dot(toEnemy);
            
            // If dot > 0.95, we're looking at it (within ~18 degrees)
            if(dot > 0.92 && distance < 15) {
                return { enemy, distance };
            }
        }
        return null;
    }
    
    function fireAtEnemy(enemy, distance) {
        console.log('FIRING AT:', enemy.id);
        
        // Vibrate
        if(navigator.vibrate) navigator.vibrate([50, 30, 50]);
        
        // Screen flash effect
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,50,0,0.3);pointer-events:none;z-index:99999;';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 100);
        
        // Damage enemy
        let health = parseInt(enemy.dataset.health) || 100;
        health -= 50;
        enemy.dataset.health = health;
        
        if(health <= 0) {
            destroyEnemy(enemy);
        } else {
            // Hit effect - flash enemy color
            const sphere = enemy.querySelector('a-sphere');
            if(sphere) {
                sphere.setAttribute('color', '#ff6600');
                setTimeout(() => sphere.setAttribute('color', '#222'), 200);
            }
        }
    }
    
    function destroyEnemy(enemy) {
        console.log('ENEMY DESTROYED:', enemy.id);
        kills++;
        
        // Create explosion at enemy position
        if(enemy.object3D) {
            const pos = enemy.object3D.position;
            const explosion = document.createElement('a-entity');
            explosion.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
            explosion.innerHTML = `
                <a-sphere radius="0.1" color="#ffff00" material="emissive: #ff6600; emissiveIntensity: 3"
                          animation="property: scale; from: 1 1 1; to: 5 5 5; dur: 300"
                          animation__fade="property: material.opacity; from: 1; to: 0; dur: 300"></a-sphere>
                <a-light type="point" color="#ff6600" intensity="3" distance="5"
                         animation="property: intensity; from: 3; to: 0; dur: 300"></a-light>
            `;
            if(enemyContainer) {
                enemyContainer.appendChild(explosion);
                setTimeout(() => explosion.remove(), 400);
            }
        }
        
        // Remove from array
        enemies = enemies.filter(e => e !== enemy);
        enemy.remove();
        
        // Vibrate success
        if(navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
        
        // Update HUD
        if(targetNameEl) {
            targetNameEl.textContent = 'KILL CONFIRMED';
            targetNameEl.style.color = '#00ff00';
        }
    }

    // === AI OBJECT DETECTION & RANGEFINDER ===
    let aiModel = null;
    
    if(typeof cocoSsd !== 'undefined') {
        cocoSsd.load().then(model => {
            aiModel = model;
            console.log("AI Model loaded");
        }).catch(e => console.log("AI load error:", e));
    }

    // Main detection loop
    function combatLoop() {
        // Check for enemy lock
        const lock = checkEnemyLock();
        
        if(lock) {
            // ENEMY IN SIGHTS
            if(reticleBox) reticleBox.classList.add('locked');
            
            if(targetNameEl) {
                targetNameEl.textContent = '⚠ HOSTILE ' + (lock.enemy.dataset.type || 'UNKNOWN');
                targetNameEl.style.color = '#ff3300';
            }
            
            if(rangeValueEl) {
                rangeValueEl.textContent = lock.distance.toFixed(1);
                rangeValueEl.style.color = '#ff3300';
            }
            
            // Update AI box with HOSTILE + real world objects
            updateAIDetectionBox(lastPredictions, lock);
            
            // Start lock timer
            if(currentTarget !== lock.enemy) {
                currentTarget = lock.enemy;
                lockStartTime = Date.now();
            } else if(lockStartTime && Date.now() - lockStartTime >= LOCK_TIME_TO_FIRE) {
                // FIRE!
                fireAtEnemy(lock.enemy, lock.distance);
                lockStartTime = Date.now(); // Reset for next shot
            }
        } else {
            // No enemy - check real world objects
            currentTarget = null;
            lockStartTime = null;
            
            if(reticleBox) reticleBox.classList.remove('locked');
            
            // Fallback to AI detection for info
            detectRealWorld();
        }
        
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
    
    function aiScanLoop() {
        const video = document.querySelector('video');
        if(video && aiModel && video.readyState === 4) {
            aiModel.detect(video).then(predictions => {
                lastPredictions = predictions.filter(p => p.score >= 0.35);
            }).catch(e => {});
        }
        setTimeout(aiScanLoop, AI_SCAN_INTERVAL); // Optimized scan interval
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
            if(rangeValueEl) {
                rangeValueEl.textContent = (1.5 / heightPercent).toFixed(1);
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
