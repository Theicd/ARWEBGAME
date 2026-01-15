window.onload = function() {
    console.log("Iron Man HUD Mk.V (Final Tactical) Initializing...");

    // --- HUD Elements ---
    const luxEl = document.getElementById('lux-level');
    const emfEl = document.getElementById('emf-level');
    
    const compassTicks = document.getElementById('compass-ticks');
    const headingVal = document.getElementById('heading-val');
    
    const altEl = document.getElementById('altitude-val');
    const speedEl = document.getElementById('speed-val');
    const gForceEl = document.getElementById('g-force');
    const batteryEl = document.getElementById('battery-level');
    
    // Target Elements
    const rfDist = document.getElementById('rf-dist');
    const rfName = document.getElementById('rf-name');
    
    const voiceBars = document.querySelectorAll('#voice-viz .eq-bar');

    // --- 1. Boot Sequence ---
    setTimeout(() => {
        const bootScreen = document.getElementById('boot-screen');
        if (bootScreen) {
            bootScreen.style.opacity = '0';
            setTimeout(() => bootScreen.style.display = 'none', 500);
        }
    }, 1000);

    // --- 2. System Status ---
    function updateSystemInfo() {
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const level = Math.round(battery.level * 100);
                if(batteryEl) batteryEl.textContent = `${level}%`;
            });
        }
    }
    setInterval(updateSystemInfo, 5000);
    updateSystemInfo();

    // --- 3. Sensors ---
    window.addEventListener('deviceorientation', (event) => {
        if (event.alpha !== null) {
            const heading = Math.round(event.alpha);
            // Pixels per degree for the compass tape
            const pixelsPerDegree = 5; 
            const offset = heading * pixelsPerDegree;
            
            if(compassTicks) compassTicks.style.transform = `translateX(${-offset}px)`;
            if(headingVal) headingVal.textContent = heading.toString().padStart(3, '0');
        }
    });

    window.addEventListener('devicemotion', (event) => {
        if(event.accelerationIncludingGravity) {
            const { x, y, z } = event.accelerationIncludingGravity;
            const magnitude = Math.sqrt(x*x + y*y + z*z);
            const g = (magnitude / 9.8).toFixed(1);
            if(gForceEl) gForceEl.textContent = g;
        }
    });

    // --- 4. GPS ---
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition((position) => {
            const alt = position.coords.altitude;
            const spd = position.coords.speed; 
            if(altEl) altEl.textContent = alt !== null ? Math.round(alt) : '--';
            if(speedEl) {
                const kmh = spd !== null ? (spd * 3.6).toFixed(0) : '0';
                speedEl.textContent = kmh;
            }
        }, null, { enableHighAccuracy: true });
    }

    // --- 5. Environment ---
    let currentLux = 0;
    let currentEMF = 0;

    if ('AmbientLightSensor' in window) {
        try {
            // @ts-ignore
            const sensor = new AmbientLightSensor();
            sensor.addEventListener('reading', () => {
                currentLux = Math.round(sensor.illuminance);
                if(luxEl) luxEl.textContent = currentLux;
            });
            sensor.start();
        } catch(e){}
    }

    // Simulate EMF
    setInterval(() => {
        currentEMF = Math.round(40 + Math.random() * 5);
        if(emfEl) emfEl.textContent = currentEMF;
    }, 1000);

    // --- 6. Voice Visualizer ---
    async function setupAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = ctx.createAnalyser();
            const src = ctx.createMediaStreamSource(stream);
            
            analyser.fftSize = 32; 
            src.connect(analyser);
            
            const data = new Uint8Array(analyser.frequencyBinCount);
            
            function draw() {
                requestAnimationFrame(draw);
                analyser.getByteFrequencyData(data);
                
                for(let i=0; i<voiceBars.length; i++) {
                    const val = data[i];
                    // Scale height 4-40px
                    const h = Math.max(4, (val / 255) * 40); 
                    voiceBars[i].style.height = `${h}px`;
                    
                    if(val > 150) voiceBars[i].style.background = '#ffff00';
                    else voiceBars[i].style.background = '#00ffff';
                }
            }
            draw();
        } catch(e) {
            console.log("Mic error", e);
        }
    }
    document.body.addEventListener('click', setupAudio, { once: true });

    // --- 7. AI Logic ---
    let aiModel = null;
    
    async function loadAI() {
        if(typeof cocoSsd !== 'undefined') {
            aiModel = await cocoSsd.load();
            detect();
        }
    }

    async function detect() {
        const video = document.querySelector('video');
        if (video && aiModel && video.readyState === 4) {
            try {
                const preds = await aiModel.detect(video);
                updateRangefinder(preds, video);
            } catch(e){}
        }
        requestAnimationFrame(detect);
    }

    function updateRangefinder(preds, video) {
        // Screen center
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        let target = null;
        
        const scaleX = window.innerWidth / video.videoWidth;
        const scaleY = window.innerHeight / video.videoHeight;
        const scale = Math.max(scaleX, scaleY);
        const offsetX = (window.innerWidth - video.videoWidth * scale) / 2;
        const offsetY = (window.innerHeight - video.videoHeight * scale) / 2;

        for (let obj of preds) {
            if (obj.score < 0.5) continue;
            
            const x = obj.bbox[0] * scale + offsetX;
            const y = obj.bbox[1] * scale + offsetY;
            const w = obj.bbox[2] * scale;
            const h = obj.bbox[3] * scale;
            
            // Check if center is inside box
            if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
                target = obj;
                break;
            }
        }

        if (target) {
            // LOCKED
            if(rfName) {
                rfName.textContent = target.class.toUpperCase();
                rfName.style.color = "#ffff00";
            }
            
            const hPercent = (target.bbox[3] * scale) / window.innerHeight;
            const meters = (1.5 / hPercent).toFixed(1);
            if(rfDist) {
                rfDist.textContent = meters;
                rfDist.style.color = "#fff";
            }
        } else {
            // SCANNING
            if(rfName) {
                rfName.textContent = "SCANNING";
                rfName.style.color = "rgba(0,255,255,0.5)";
            }
            if(rfDist) {
                rfDist.textContent = "----";
                rfDist.style.color = "rgba(0,255,255,0.5)";
            }
        }
    }

    loadAI();
};
