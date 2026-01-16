window.onload = function() {
    console.log("Iron Man HUD Mk.III Initializing...");

    // --- HUD Elements ---
    const luxEl = document.getElementById('lux-level');
    const emfEl = document.getElementById('emf-level');
    const hazardLevelEl = document.getElementById('hazard-level');
    const hazardBar = document.getElementById('hazard-bar');
    
    const compassStrip = document.getElementById('compass-ticks');
    const headingVal = document.getElementById('heading-val');
    const altEl = document.getElementById('altitude-val');
    const speedEl = document.getElementById('speed-val');
    const gForceEl = document.getElementById('g-force');
    const batteryEl = document.getElementById('battery-level');
    
    const targetData = document.getElementById('target-data');
    const targetName = document.getElementById('target-name');
    const targetDist = document.getElementById('target-dist');
    const targetConf = document.getElementById('target-conf');
    
    const voiceBars = document.querySelectorAll('#voice-viz .eq-bar');

    // --- 1. Boot Sequence ---
    const bootScreen = document.getElementById('boot-screen');
    const bootProgress = document.getElementById('boot-progress');
    const bootLog = document.getElementById('boot-log');
    
    const bootMessages = [
        "Loading sensor modules...",
        "Initializing magnetometer...",
        "Calibrating GPS...",
        "Connecting to camera...",
        "Loading AI model...",
        "System ready."
    ];
    
    let bootStep = 0;
    const bootInterval = setInterval(() => {
        if (bootStep < bootMessages.length) {
            if (bootLog) {
                bootLog.innerHTML += bootMessages[bootStep] + "<br>";
                bootLog.scrollTop = bootLog.scrollHeight;
            }
            if (bootProgress) {
                bootProgress.style.width = ((bootStep + 1) / bootMessages.length * 100) + '%';
            }
            bootStep++;
        } else {
            clearInterval(bootInterval);
            setTimeout(() => {
                if (bootScreen) {
                    bootScreen.style.opacity = '0';
                    bootScreen.style.transition = 'opacity 0.5s';
                    setTimeout(() => bootScreen.style.display = 'none', 500);
                }
            }, 500);
        }
    }, 400);

    // --- 2. System Status (Battery) ---
    function updateSystemInfo() {
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const level = Math.round(battery.level * 100);
                if(batteryEl) {
                    batteryEl.textContent = `${level}%`;
                    if (level < 20) batteryEl.style.color = '#ff0000';
                    else if (level < 50) batteryEl.style.color = '#ffff00';
                    else batteryEl.style.color = '#00ffff';
                }
            });
        } else {
            if(batteryEl) batteryEl.textContent = "100%";
        }
    }
    setInterval(updateSystemInfo, 2000);
    updateSystemInfo();

    // --- 3. Sensors: Compass, G-Force & Rangefinder ---
    let deviceBeta = 90; // Tilt angle for distance estimation
    
    window.addEventListener('deviceorientation', (event) => {
        if (event.alpha !== null) {
            const heading = Math.round(event.alpha);
            const pixelsPerDegree = 4; 
            const offset = heading * pixelsPerDegree;
            if(compassStrip) compassStrip.style.transform = `translateX(calc(-50% - ${offset}px))`;
            if(headingVal) headingVal.textContent = heading.toString().padStart(3, '0');
        }
        // Save beta (tilt) for distance calculation
        if (event.beta !== null) {
            deviceBeta = event.beta;
        }
    });
    
    // Export deviceBeta for rangefinder
    window.getDeviceBeta = () => deviceBeta;

    window.addEventListener('devicemotion', (event) => {
        if(event.accelerationIncludingGravity) {
            const { x, y, z } = event.accelerationIncludingGravity;
            const magnitude = Math.sqrt(x*x + y*y + z*z);
            const g = (magnitude / 9.8).toFixed(1);
            if(gForceEl) gForceEl.textContent = g;
            
            if(g > 2.5) {
                if(gForceEl) gForceEl.style.color = "red";
            } else {
                if(gForceEl) gForceEl.style.color = "#00ffff";
            }
        }
    });

    // --- 4. Sensors: GPS (Speed & Altitude) ---
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition((position) => {
            const alt = position.coords.altitude;
            const spd = position.coords.speed;
            if(altEl) altEl.textContent = alt !== null ? Math.round(alt) : '--';
            if(speedEl) {
                const kmh = spd !== null ? (spd * 3.6).toFixed(0) : '0';
                speedEl.textContent = kmh;
            }
        }, (err) => { console.warn("GPS Error:", err); }, { enableHighAccuracy: true });
    }

    // --- 5. Environment Sensors (Lux, EMF, Hazard) ---
    let currentLux = 0;
    let currentEMF = 45;

    // A. Ambient Light
    if ('AmbientLightSensor' in window) {
        try {
            const sensor = new AmbientLightSensor();
            sensor.addEventListener('reading', () => {
                currentLux = Math.round(sensor.illuminance);
                if(luxEl) luxEl.textContent = currentLux;
                updateHazardLevel();
            });
            sensor.start();
        } catch (err) { 
            console.warn("Light Sensor error:", err);
            simulateLux();
        }
    } else {
        simulateLux();
    }

    function simulateLux() {
        setInterval(() => {
            currentLux = Math.round(200 + Math.random() * 100);
            if(luxEl) luxEl.textContent = currentLux;
            updateHazardLevel();
        }, 2000);
    }

    // B. Magnetometer (EMF)
    if ('Magnetometer' in window) {
        try {
            const magSensor = new Magnetometer({frequency: 10});
            magSensor.addEventListener('reading', () => {
                const x = magSensor.x;
                const y = magSensor.y;
                const z = magSensor.z;
                const totalField = Math.sqrt(x*x + y*y + z*z);
                currentEMF = Math.round(totalField);
                if(emfEl) emfEl.textContent = currentEMF;
                updateHazardLevel();
            });
            magSensor.start();
        } catch (err) {
            console.warn("Magnetometer error:", err);
            simulateEMF();
        }
    } else {
        simulateEMF();
    }

    function simulateEMF() {
        setInterval(() => {
            currentEMF = Math.round(40 + Math.random() * 15);
            if(emfEl) emfEl.textContent = currentEMF;
            updateHazardLevel();
        }, 1500);
    }

    // C. Hazard Calculation
    function updateHazardLevel() {
        const emfFactor = Math.min(100, Math.max(0, (currentEMF - 30) * 1.5));
        const lightFactor = Math.min(100, currentLux / 100);
        const hazardScore = Math.min(100, (emfFactor * 0.7) + (lightFactor * 0.3));
        
        if(hazardBar) hazardBar.style.width = `${hazardScore}%`;
        
        if(hazardLevelEl) {
            if(hazardScore < 30) {
                hazardLevelEl.textContent = "SAFE";
                hazardLevelEl.style.color = "#00ff00";
            } else if (hazardScore < 70) {
                hazardLevelEl.textContent = "CAUTION";
                hazardLevelEl.style.color = "#ffff00";
            } else {
                hazardLevelEl.textContent = "DANGER";
                hazardLevelEl.style.color = "#ff0000";
            }
        }
    }

    // --- 6. Voice Visualizer ---
    async function setupAudioVisualizer() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 64; 
            analyser.smoothingTimeConstant = 0.5;
            microphone.connect(analyser);
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            function draw() {
                requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                
                for (let i = 0; i < voiceBars.length; i++) {
                    const binIndex = Math.floor(i * (bufferLength / voiceBars.length));
                    const val = dataArray[binIndex]; 
                    const normalized = val / 255;
                    
                    let height = (normalized * 10) + (Math.pow(normalized, 1.5) * 20);
                    height = Math.max(2, Math.min(30, height));
                    
                    voiceBars[i].style.height = `${height}px`;
                    
                    if (val > 150) {
                        voiceBars[i].style.backgroundColor = '#ff3300';
                    } else if (val > 80) { 
                        voiceBars[i].style.backgroundColor = '#ffff00';
                    } else {
                        voiceBars[i].style.backgroundColor = '#00ffff'; 
                    }
                }
            }
            draw();
            
        } catch (e) {
            console.warn("Audio Access Failed:", e);
        }
    }
    
    document.body.addEventListener('click', setupAudioVisualizer, { once: true });

    // --- 7. AI Detection with Stable Tracking & Sound ---
    let aiModel = null;
    let trackedObjects = new Map(); // Stable tracking
    let currentLockedId = null;
    let isScanning = false;
    let scanComplete = false;
    let lastScanTime = 0;
    
    const detectionCanvas = document.getElementById('detection-canvas');
    const ctx = detectionCanvas ? detectionCanvas.getContext('2d') : null;

    // Audio Context for sounds
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    
    function playSound(type) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        switch(type) {
            case 'detect': // New object detected - short blip
                osc.frequency.value = 800;
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialDecayTo && gain.gain.exponentialDecayTo(0.01, audioCtx.currentTime + 0.1);
                osc.start(); osc.stop(audioCtx.currentTime + 0.1);
                break;
            case 'lock': // Reticle locked - rising tone
                osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.2);
                gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
                osc.start(); osc.stop(audioCtx.currentTime + 0.3);
                break;
            case 'scan': // Scanning - pulsing beep
                osc.frequency.value = 600;
                osc.type = 'square';
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
                osc.start(); osc.stop(audioCtx.currentTime + 0.15);
                break;
            case 'identified': // Object identified - success chord
                osc.frequency.setValueAtTime(523, audioCtx.currentTime); // C5
                osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.1); // E5
                osc.frequency.setValueAtTime(784, audioCtx.currentTime + 0.2); // G5
                gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
                osc.start(); osc.stop(audioCtx.currentTime + 0.4);
                break;
        }
    }

    function resizeCanvas() {
        if (detectionCanvas) {
            detectionCanvas.width = window.innerWidth;
            detectionCanvas.height = window.innerHeight;
        }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Initialize audio on first click
    document.body.addEventListener('click', initAudio, { once: true });

    async function loadAI() {
        if (typeof cocoSsd !== 'undefined') {
            try {
                aiModel = await cocoSsd.load();
                console.log("AI Model Loaded");
                detectLoop();
            } catch(e) {
                console.warn("AI Load Error:", e);
            }
        }
    }

    // Generate unique ID for tracking
    function getObjectId(obj, scale, offsetX, offsetY) {
        const cx = Math.round((obj.bbox[0] + obj.bbox[2]/2) * scale + offsetX);
        const cy = Math.round((obj.bbox[1] + obj.bbox[3]/2) * scale + offsetY);
        return `${obj.class}_${Math.round(cx/50)}_${Math.round(cy/50)}`;
    }

    async function detectLoop() {
        const video = document.querySelector('video');
        if (video && aiModel && video.readyState === 4) {
            try {
                const predictions = await aiModel.detect(video);
                const filtered = predictions.filter(p => p.score > 0.4);
                
                const scaleX = window.innerWidth / video.videoWidth;
                const scaleY = window.innerHeight / video.videoHeight;
                const scale = Math.max(scaleX, scaleY);
                const offsetX = (window.innerWidth - video.videoWidth * scale) / 2;
                const offsetY = (window.innerHeight - video.videoHeight * scale) / 2;
                
                updateTrackedObjects(filtered, scale, offsetX, offsetY);
                drawDetectionBoxes(scale, offsetX, offsetY);
                checkReticleFocus(scale, offsetX, offsetY);
            } catch(e) {}
        }
        requestAnimationFrame(detectLoop);
    }

    function updateTrackedObjects(newDetections, scale, offsetX, offsetY) {
        const currentTime = Date.now();
        const newIds = new Set();
        
        for (let obj of newDetections) {
            const id = getObjectId(obj, scale, offsetX, offsetY);
            newIds.add(id);
            
            if (trackedObjects.has(id)) {
                // Update existing - smooth interpolation
                const tracked = trackedObjects.get(id);
                const smoothing = 0.3;
                tracked.x = tracked.x + (obj.bbox[0] * scale + offsetX - tracked.x) * smoothing;
                tracked.y = tracked.y + (obj.bbox[1] * scale + offsetY - tracked.y) * smoothing;
                tracked.w = tracked.w + (obj.bbox[2] * scale - tracked.w) * smoothing;
                tracked.h = tracked.h + (obj.bbox[3] * scale - tracked.h) * smoothing;
                tracked.score = obj.score;
                tracked.class = obj.class;
                tracked.lastSeen = currentTime;
            } else {
                // New object detected!
                trackedObjects.set(id, {
                    id: id,
                    x: obj.bbox[0] * scale + offsetX,
                    y: obj.bbox[1] * scale + offsetY,
                    w: obj.bbox[2] * scale,
                    h: obj.bbox[3] * scale,
                    score: obj.score,
                    class: obj.class,
                    lastSeen: currentTime,
                    scanned: false
                });
                playSound('detect');
            }
        }
        
        // Remove old objects (not seen for 500ms)
        for (let [id, obj] of trackedObjects) {
            if (currentTime - obj.lastSeen > 500) {
                trackedObjects.delete(id);
                if (currentLockedId === id) {
                    currentLockedId = null;
                    isScanning = false;
                    if(targetData) targetData.style.display = 'none';
                }
            }
        }
    }

    function drawDetectionBoxes(scale, offsetX, offsetY) {
        if (!ctx) return;
        ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);

        for (let [id, obj] of trackedObjects) {
            const x = obj.x, y = obj.y, w = obj.w, h = obj.h;
            const isLocked = currentLockedId === id;
            const isScanned = obj.scanned;
            
            // Color based on state
            if (isLocked) {
                ctx.strokeStyle = isScanned ? '#00ff00' : '#ff0000';
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
            } else if (isScanned) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
            } else {
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 4]);
            }
            
            // Draw tactical corners
            const cornerLen = Math.min(w, h) * 0.25;
            ctx.beginPath();
            ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
            ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
            ctx.moveTo(x + w, y + h - cornerLen); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cornerLen, y + h);
            ctx.moveTo(x + cornerLen, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cornerLen);
            ctx.stroke();
            
            // Draw info on the box itself
            ctx.setLineDash([]);
            
            if (isScanned) {
                // Scanned object - show full info ON the box
                ctx.fillStyle = '#00ff00';
                ctx.font = 'bold 14px Consolas';
                ctx.fillText(obj.class.toUpperCase(), x + 5, y - 25);
                
                ctx.font = '12px Consolas';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`${obj.scanDist}m`, x + 5, y - 10);
                
                ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
                ctx.font = '10px Consolas';
                ctx.fillText(`${obj.scanConf}%`, x + w - 30, y - 10);
            } else if (isLocked) {
                // Currently scanning - show scanning indicator
                ctx.fillStyle = '#ff0000';
                ctx.font = 'bold 14px Consolas';
                ctx.fillText('SCANNING...', x + 5, y - 10);
            } else {
                // Unscanned - show ?
                ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
                ctx.font = 'bold 14px Consolas';
                ctx.fillText('[ ? ]', x + 5, y - 10);
            }
        }
        
        // Always draw center distance (even to walls)
        drawCenterRangefinder();
    }
    
    const liveDistanceEl = document.getElementById('live-distance');
    
    function drawCenterRangefinder() {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        
        // Check if pointing at any object
        let distText = '--';
        let isOnObject = false;
        let distColor = '#ffffff';
        
        for (let [id, obj] of trackedObjects) {
            if (cx > obj.x && cx < obj.x + obj.w && cy > obj.y && cy < obj.y + obj.h) {
                const heightPercent = obj.h / window.innerHeight;
                const dist = (1.5 / heightPercent).toFixed(1);
                distText = dist + 'm';
                isOnObject = true;
                distColor = obj.scanned ? '#00ff00' : '#ff0000';
                break;
            }
        }
        
        // If not on object - estimate distance using device tilt (beta)
        if (!isOnObject) {
            const beta = window.getDeviceBeta ? window.getDeviceBeta() : 90;
            // beta: 0=flat face up, 90=vertical, 180=flat face down
            // Convert tilt to estimated distance (looking down = closer, looking up = farther)
            // When phone is vertical (beta ~90), looking straight ahead
            // When tilting down (beta > 90), looking at floor = closer
            // When tilting up (beta < 90), looking at ceiling/far = farther
            
            let estimatedDist;
            if (beta > 120) {
                // Looking at floor - very close
                estimatedDist = (0.5 + (180 - beta) * 0.03).toFixed(1);
            } else if (beta > 90) {
                // Looking slightly down - medium distance
                estimatedDist = (1.0 + (120 - beta) * 0.1).toFixed(1);
            } else if (beta > 60) {
                // Looking straight or slightly up - far
                estimatedDist = (4.0 + (90 - beta) * 0.15).toFixed(1);
            } else {
                // Looking up at ceiling - very far
                estimatedDist = (8.0 + (60 - beta) * 0.2).toFixed(1);
            }
            
            distText = estimatedDist + 'm';
            distColor = '#00ffff';
        }
        
        // Update the always-visible rangefinder
        if (liveDistanceEl) {
            liveDistanceEl.textContent = distText;
            liveDistanceEl.style.color = distColor;
        }
    }

    function checkReticleFocus(scale, offsetX, offsetY) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        let newLockedId = null;

        for (let [id, obj] of trackedObjects) {
            if (cx > obj.x && cx < obj.x + obj.w && cy > obj.y && cy < obj.y + obj.h) {
                newLockedId = id;
                break;
            }
        }

        // Check if still on the SAME object (even if ID changed due to movement)
        let stillOnSameObject = false;
        if (currentLockedId && newLockedId) {
            const currentObj = trackedObjects.get(currentLockedId);
            const newObj = trackedObjects.get(newLockedId);
            if (currentObj && newObj && currentObj.class === newObj.class) {
                // Same class and reticle is still inside - consider it the same object
                stillOnSameObject = true;
                // Update the locked ID to the new one but don't reset scan
                currentLockedId = newLockedId;
            }
        }

        if (!stillOnSameObject && newLockedId !== currentLockedId) {
            currentLockedId = newLockedId;
            isScanning = false;
            scanComplete = false;
            
            if (newLockedId) {
                startScan(newLockedId);
            } else {
                if(targetData) targetData.style.display = 'none';
            }
        }
    }

    let scanInterval = null;
    function startScan(objId) {
        const obj = trackedObjects.get(objId);
        if (!obj) return;
        
        isScanning = true;
        if(targetData) targetData.style.display = 'flex';
        if(targetName) {
            targetName.textContent = 'SCANNING...';
            targetName.style.color = '#ffff00';
        }
        if(targetDist) targetDist.textContent = '--';
        if(targetConf) targetConf.textContent = '--';
        
        playSound('lock');
        if (navigator.vibrate) navigator.vibrate(50);
        
        // Pulsing scan sound
        let scanCount = 0;
        if (scanInterval) clearInterval(scanInterval);
        scanInterval = setInterval(() => {
            if (currentLockedId !== objId || scanCount >= 4) {
                clearInterval(scanInterval);
                return;
            }
            playSound('scan');
            scanCount++;
        }, 350);
        
        // Reveal after 1.5s
        setTimeout(() => {
            if (currentLockedId === objId) {
                clearInterval(scanInterval);
                scanComplete = true;
                obj.scanned = true;
                revealObjectInfo(obj);
            }
        }, 1500);
    }

    function revealObjectInfo(obj) {
        playSound('identified');
        if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
        
        // Calculate and SAVE distance/confidence on the object
        const heightPercent = obj.h / window.innerHeight;
        const dist = (1.5 / heightPercent).toFixed(1);
        const conf = Math.round(obj.score * 100);
        
        // Store on object so it persists
        obj.scanDist = dist;
        obj.scanConf = conf;
        
        if(targetName) {
            targetName.textContent = obj.class.toUpperCase();
            targetName.style.color = '#00ff00';
        }
        if(targetDist) targetDist.textContent = dist;
        if(targetConf) targetConf.textContent = conf;
    }

    loadAI();

    // --- 8. Voice Commands ---
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        
        recognition.onresult = (event) => {
            const cmd = event.results[event.results.length-1][0].transcript.trim().toLowerCase();
            console.log("Voice:", cmd);
            if (cmd.includes('fire') || cmd.includes('shoot')) {
                if (navigator.vibrate) navigator.vibrate(200);
            }
        };
        recognition.onend = () => { try { recognition.start(); } catch(e){} };
        try { recognition.start(); } catch(e){}
    }
};
