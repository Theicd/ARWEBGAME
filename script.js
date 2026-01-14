window.onload = function() {
    console.log("משחק מציאות רבודה נטען בהצלחה");
    let coins = document.querySelectorAll('a-entity');
    coins.forEach(coin => {
        coin.addEventListener('click', () => {
            console.log("נאסף מטבע!");
            coin.setAttribute('visible', 'false');
        });
    });
    
    // בדיקה אם המשתמש במובייל והצגת ג'ויסטיק
    if (/Mobi|Android/i.test(navigator.userAgent)) {
        document.getElementById('joystick').style.display = 'block';
        let joystick = document.getElementById('joystick');
        let touchStartX, touchStartY;
        window.mobileInput = { moveX: 0, moveY: 0 };
        
        joystick.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });
        
        joystick.addEventListener('touchmove', (e) => {
            let touchX = e.touches[0].clientX;
            let touchY = e.touches[0].clientY;
            let dx = touchX - touchStartX;
            let dy = touchY - touchStartY;
            let maxDist = 50; // מרחק מקסימלי ממרכז הג'ויסטיק
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDist) {
                dx = dx * maxDist / dist;
                dy = dy * maxDist / dist;
            }
            window.mobileInput.moveX = dx / maxDist;
            window.mobileInput.moveY = -dy / maxDist; // הפוך כי למעלה = קדימה
        });
        
        joystick.addEventListener('touchend', () => {
            window.mobileInput.moveX = 0;
            window.mobileInput.moveY = 0;
        });
    }
};
