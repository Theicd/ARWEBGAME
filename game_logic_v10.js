window.onload = function() {
    console.log("Iron Man HUD Mk.X (Combat System) Initializing...");

    // === COMBAT SYSTEM CONFIG ===
    const LOCK_TIME_TO_FIRE = 1500; // 1.5 שניות נעילה לפני ירי
    const ENEMY_SPAWN_INTERVAL = 8000; // כל 8 שניות אויב חדש
    const MAX_ENEMIES = 3; // מקסימום אויבים במסך
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

    // === GYROSCOPE-BASED ENEMIES ===
    // Enemies have a WORLD position. When phone rotates, enemies move OPPOSITE direction.
    // This creates the illusion that enemies are fixed in the real world.
    
    let initialAlpha = null;
    let initialBeta = null;
    let currentAlpha = 0;
    let currentBeta = 0;
    
    // Listen to device orientation FIRST
    window.addEventListener('deviceorientation', (e) => {
        if(e.alpha === null) return;
        
        // Set initial orientation on first reading
        if(initialAlpha === null) {
            initialAlpha = e.alpha;
            initialBeta = e.beta || 0;
        }
        
        // Calculate delta from initial position
        let deltaAlpha = e.alpha - initialAlpha;
        if(deltaAlpha > 180) deltaAlpha -= 360;
        if(deltaAlpha < -180) deltaAlpha += 360;
        
        let deltaBeta = (e.beta || 0) - initialBeta;
        
        currentAlpha = deltaAlpha;
        currentBeta = deltaBeta;
        
        // Move ALL enemies opposite to camera movement
        for(let enemy of enemies) {
            if(!enemy.parentNode) continue;
            
            const baseX = parseFloat(enemy.dataset.baseX) || 50;
            const baseY = parseFloat(enemy.dataset.baseY) || 50;
            
            // Move OPPOSITE to camera rotation
            // Camera goes right (alpha increases) -> enemy goes left on screen
            const screenX = baseX - (deltaAlpha * 2);
            const screenY = baseY + (deltaBeta * 1.5);
            
            // Check if in view
            if(screenX < -10 || screenX > 110 || screenY < -10 || screenY > 110) {
                enemy.style.display = 'none';
            } else {
                enemy.style.display = 'flex';
                enemy.style.left = screenX + '%';
                enemy.style.top = screenY + '%';
            }
        }
    }, true);
    
    function createEnemyOverlay() {
        if(enemies.length >= MAX_ENEMIES) return;
        
        const container = document.body;
        
        // Base position (where enemy "is" in the world relative to initial view)
        const side = Math.random() > 0.5 ? 'left' : 'right';
        const baseX = side === 'left' ? (10 + Math.random() * 25) : (65 + Math.random() * 25);
        const baseY = 20 + Math.random() * 45;
        
        const enemy = document.createElement('div');
        enemy.className = 'enemy-overlay';
        enemy.id = 'enemy-' + Date.now();
        enemy.style.cssText = `
            position: fixed !important;
            left: ${baseX}% !important;
            top: ${baseY}% !important;
            transform: translate(-50%, -50%);
            z-index: 50 !important;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            align-items: center;
        `;
        enemy.innerHTML = `
            <div class="enemy-marker">
                <div class="enemy-ring"></div>
                <div class="enemy-core">◆</div>
            </div>
            <div class="enemy-label">DRONE</div>
        `;
        
        // Store BASE position (world position)
        enemy.dataset.baseX = baseX;
        enemy.dataset.baseY = baseY;
        enemy.dataset.health = 100;
        enemy.dataset.type = 'DRONE';
        enemy.dataset.distance = (2 + Math.random() * 5).toFixed(1);
        
        container.appendChild(enemy);
        enemies.push(enemy);
        
        console.log('Enemy spawned at world position:', baseX.toFixed(0), baseY.toFixed(0));
    }
    
    // Spawn enemies periodically
    setInterval(createEnemyOverlay, ENEMY_SPAWN_INTERVAL);
    setTimeout(createEnemyOverlay, 2000);

    // === COMBAT SYSTEM - LOCK & FIRE ===
    function checkEnemyLock() {
        // Screen center (where reticle is)
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const tolerance = 60; // px
        
        for(let enemy of enemies) {
            if(!enemy.parentNode) continue;
            
            const rect = enemy.getBoundingClientRect();
            const enemyCx = rect.left + rect.width / 2;
            const enemyCy = rect.top + rect.height / 2;
            
            // Check if reticle is over enemy
            const dx = Math.abs(cx - enemyCx);
            const dy = Math.abs(cy - enemyCy);
            
            if(dx < tolerance && dy < tolerance) {
                const distance = parseFloat(enemy.dataset.distance) || 3;
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
            // Hit effect - flash enemy
            enemy.classList.add('hit');
            setTimeout(() => enemy.classList.remove('hit'), 200);
        }
    }
    
    function destroyEnemy(enemy) {
        console.log('ENEMY DESTROYED:', enemy.id);
        kills++;
        
        // Explosion effect on enemy position
        enemy.classList.add('exploding');
        
        // Remove from array
        enemies = enemies.filter(e => e !== enemy);
        
        // Remove after animation
        setTimeout(() => enemy.remove(), 400);
        
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
        setTimeout(aiScanLoop, 200); // Scan every 200ms
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

    // === TAP TO SPAWN ENEMY ===
    document.addEventListener('click', () => {
        // Spawn enemy on tap (if less than max)
        if(enemies.length < MAX_ENEMIES) {
            createEnemyOverlay();
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
