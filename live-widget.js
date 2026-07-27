/**
 * E-Liga Live Match Widget
 * ========================
 * გამოყენება gafa.ge-ზე (ან სხვა ნებისმიერ საიტზე):
 *
 *   1. HTML-ში სადაც გინდა widget გამოჩნდეს, დაამატე:
 *      <div id="eliga-live-widget"></div>
 *
 *   2. გვერდის ბოლოში (</body>-ის წინ) დაამატე:
 *      <script src="https://buxogff.github.io/E-Liga-Match-Tracer/live-widget.js"></script>
 *
 * Widget ავტომატურად:
 *   - Firebase-ს დაუკავშირდება
 *   - მიმდინარე მატჩებს real-time-ში აჩვენებს
 *   - თუ მატჩი არ არის, "არ არის მიმდინარე თამაში" შეტყობინებას აჩვენებს
 *   - ყოველ წამს ტაიმერს განაახლებს
 */

(function () {
    'use strict';

    // ============================================================
    // კონფიგურაცია
    // ============================================================
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyArZaTt57Z0nAgPsMnv0Bp7aE4YSuUxYWc",
        authDomain: "e-liga.firebaseapp.com",
        projectId: "e-liga",
        storageBucket: "e-liga.firebasestorage.app",
        messagingSenderId: "433431017124",
        appId: "1:433431017124:web:b84dd1a6d60df9bf04d831"
    };

    const WIDGET_ID = 'eliga-live-widget';

    // ============================================================
    // CSS სტილი — inject-დება <head>-ში ავტომატურად
    // ============================================================
    const CSS = `
        #eliga-live-widget * { box-sizing: border-box; margin: 0; padding: 0; }

        #eliga-live-widget {
            font-family: 'Segoe UI', Arial, sans-serif;
            max-width: 700px;
            margin: 0 auto;
            padding: 0;
        }

        .elw-section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #2e3192;
            margin-bottom: 14px;
        }

        .elw-pulse-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #e6007e;
            position: relative;
            flex-shrink: 0;
        }

        .elw-pulse-dot::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 50%;
            background: #e6007e;
            animation: elwPulse 1.5s ease-out infinite;
        }

        @keyframes elwPulse {
            0%   { transform: scale(1);   opacity: 0.8; }
            100% { transform: scale(2.4); opacity: 0; }
        }

        /* მატჩის ბარათი */
        .elw-match-card {
            background: linear-gradient(135deg, #1a1c5b 0%, #2e3192 55%, #e6007e 100%);
            border-radius: 16px;
            padding: 18px 20px;
            margin-bottom: 12px;
            color: #fff;
            cursor: pointer;
            transition: transform 0.15s, box-shadow 0.15s;
            position: relative;
            overflow: hidden;
            text-decoration: none;
            display: block;
        }

        .elw-match-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(46,49,146,0.35);
        }

        .elw-live-badge {
            position: absolute;
            top: 14px;
            right: 14px;
            background: #e6007e;
            color: #fff;
            font-size: 9px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            padding: 3px 8px;
            border-radius: 6px;
            animation: elwBlink 1.5s ease-in-out infinite;
        }

        @keyframes elwBlink {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.55; }
        }

        .elw-match-label {
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #00bce4;
            border-bottom: 1px solid rgba(255,255,255,0.15);
            padding-bottom: 8px;
            margin-bottom: 14px;
        }

        .elw-scoreboard {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .elw-team {
            flex: 1;
            min-width: 0;
            text-align: center;
        }

        .elw-team-name {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: rgba(255,255,255,0.9);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-bottom: 6px;
        }

        .elw-score {
            font-size: 42px;
            font-weight: 900;
            line-height: 1;
            color: #fff;
        }

        .elw-timer-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex-shrink: 0;
            gap: 6px;
        }

        .elw-timer {
            background: rgba(0,0,0,0.25);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 10px;
            padding: 8px 14px;
            font-size: 22px;
            font-weight: 900;
            font-family: 'Courier New', monospace;
            color: #fff;
            letter-spacing: 0.05em;
        }

        .elw-status {
            font-size: 9px;
            font-weight: 700;
            color: rgba(255,255,255,0.55);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        /* სტატისტიკა */
        .elw-stats {
            display: flex;
            justify-content: space-around;
            background: rgba(0,0,0,0.18);
            border-radius: 10px;
            padding: 10px 8px;
            margin-top: 14px;
        }

        .elw-stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            flex: 1;
        }

        .elw-stat-icon {
            font-size: 13px;
        }

        .elw-stat-values {
            font-size: 11px;
            font-weight: 900;
            color: rgba(255,255,255,0.9);
        }

        .elw-stat-home { color: #ff6eb4; }
        .elw-stat-away { color: #7eb8ff; }

        /* ბოლო ივენთი */
        .elw-last-event {
            margin-top: 12px;
            background: rgba(0,0,0,0.2);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 10px;
            color: rgba(255,255,255,0.8);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .elw-last-event-time {
            font-family: monospace;
            font-weight: 900;
            color: rgba(255,255,255,0.5);
            flex-shrink: 0;
        }

        /* ცარიელი მდგომარეობა */
        .elw-empty {
            background: #f8f9ff;
            border: 2px dashed #d0d4ef;
            border-radius: 14px;
            padding: 32px 20px;
            text-align: center;
        }

        .elw-empty-icon {
            font-size: 32px;
            margin-bottom: 10px;
            opacity: 0.35;
        }

        .elw-empty-text {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #9098c0;
        }

        /* Loader */
        .elw-loader {
            text-align: center;
            padding: 28px;
            color: #9098c0;
            font-size: 11px;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }
    `;

    // ============================================================
    // Helper ფუნქციები
    // ============================================================
    function formatTime(s) {
        if (!s || isNaN(s)) return '00:00';
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
    }

    function getLiveStat(events, team, type) {
        if (!events || !Array.isArray(events)) return 0;
        return events.filter(e => e.team === team && e.type === type).length;
    }

    function getLastEvent(events) {
        if (!events || events.length === 0) return null;
        // events დალაგებულია კლებადობით (ბოლო ყველაზე ზემოთ)
        const ev = events[0];
        const icons = {
            goal: '⚽', own_goal: '⚽', penalty: '🎯',
            yellow: '🟨', red: '🟥', corner: '🚩',
            offside: '🚩', sub: '🔄'
        };
        const labels = {
            goal: 'გოლი', own_goal: 'საკუთარი გოლი', penalty: 'პენალტი',
            yellow: 'ყვითელი ბარათი', red: 'წითელი ბარათი',
            corner: 'კუთხური', offside: 'თამაშგარე', sub: 'შეცვლა'
        };
        const icon = icons[ev.type] || '•';
        const label = labels[ev.type] || ev.type;
        let desc = label;
        if (ev.playerName) desc += ' — ' + ev.playerName;
        else if (ev.playerNum) desc += ' — #' + ev.playerNum;
        return { time: ev.time, icon, desc };
    }

    function getDisplayTimer(match) {
        if (!match.isPaused && match.lastTick) {
            const diff = Math.floor((Date.now() - match.lastTick) / 1000);
            return (match.timer || 0) + diff;
        }
        return match.displayTimer || match.timer || 0;
    }

    // ============================================================
    // Widget render
    // ============================================================
    function renderWidget(container, matches) {
        if (matches.length === 0) {
            container.innerHTML = `
                <div class="elw-section-title">
                    <span class="elw-pulse-dot" style="background:#ccc;"></span>
                    <span>მიმდინარე მატჩები</span>
                </div>
                <div class="elw-empty">
                    <div class="elw-empty-icon">⚽</div>
                    <div class="elw-empty-text">არ არის მიმდინარე თამაში</div>
                </div>
            `;
            return;
        }

        const cardsHTML = matches.map(match => {
            const timer = getDisplayTimer(match);
            const isPaused = match.isPaused;
            const lastEv = getLastEvent(match.events);

            const statItems = [
                { icon: '🟨', home: getLiveStat(match.events, 'home', 'yellow'), away: getLiveStat(match.events, 'away', 'yellow') },
                { icon: '🟥', home: getLiveStat(match.events, 'home', 'red'),    away: getLiveStat(match.events, 'away', 'red') },
                { icon: '🚩', home: getLiveStat(match.events, 'home', 'corner'), away: getLiveStat(match.events, 'away', 'corner') },
                { icon: '🔄', home: getLiveStat(match.events, 'home', 'sub'),    away: getLiveStat(match.events, 'away', 'sub') },
                { icon: '⛳', home: getLiveStat(match.events, 'home', 'offside'),away: getLiveStat(match.events, 'away', 'offside') },
            ];

            const statsHTML = statItems.map(s => `
                <div class="elw-stat-item">
                    <span class="elw-stat-icon">${s.icon}</span>
                    <span class="elw-stat-values">
                        <span class="elw-stat-home">${s.home}</span>
                        <span style="color:rgba(255,255,255,0.4)"> - </span>
                        <span class="elw-stat-away">${s.away}</span>
                    </span>
                </div>
            `).join('');

            const lastEvHTML = lastEv ? `
                <div class="elw-last-event">
                    <span class="elw-last-event-time">${lastEv.time}</span>
                    <span>${lastEv.icon}</span>
                    <span>${lastEv.desc}</span>
                </div>
            ` : '';

            return `
                <div class="elw-match-card" data-id="${match.id}">
                    <span class="elw-live-badge">● LIVE</span>
                    <div class="elw-match-label">მიმდინარე თამაში</div>
                    <div class="elw-scoreboard">
                        <div class="elw-team">
                            <div class="elw-team-name">${match.homeName || 'Home'}</div>
                            <div class="elw-score">${match.scoreHome ?? 0}</div>
                        </div>
                        <div class="elw-timer-wrap">
                            <div class="elw-timer" data-id="${match.id}" data-timer="${match.timer || 0}" data-tick="${match.lastTick || ''}" data-paused="${isPaused ? '1' : '0'}">${formatTime(timer)}</div>
                            <div class="elw-status">${isPaused ? 'შეჩერებულია' : 'მიმდინარეობს'}</div>
                        </div>
                        <div class="elw-team">
                            <div class="elw-team-name">${match.awayName || 'Away'}</div>
                            <div class="elw-score">${match.scoreAway ?? 0}</div>
                        </div>
                    </div>
                    <div class="elw-stats">${statsHTML}</div>
                    ${lastEvHTML}
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="elw-section-title">
                <span class="elw-pulse-dot"></span>
                <span>მიმდინარე მატჩები</span>
            </div>
            ${cardsHTML}
        `;
    }

    // ============================================================
    // ტაიმერის განახლება ყოველ წამს (Firebase-ის გარეშე, locally)
    // ============================================================
    function startLocalTimers() {
        setInterval(() => {
            document.querySelectorAll('.elw-timer').forEach(el => {
                const paused = el.dataset.paused === '1';
                const baseTimer = parseInt(el.dataset.timer) || 0;
                const lastTick = parseInt(el.dataset.tick) || 0;
                let current = baseTimer;
                if (!paused && lastTick) {
                    current = baseTimer + Math.floor((Date.now() - lastTick) / 1000);
                }
                el.textContent = formatTime(current);
            });
        }, 1000);
    }

    // ============================================================
    // Firebase-ის ჩატვირთვა და widget-ის ინიციალიზაცია
    // ============================================================
    function initWidget() {
        const container = document.getElementById(WIDGET_ID);
        if (!container) {
            console.warn('[E-Liga Widget] <div id="eliga-live-widget"></div> ვერ ვიპოვე გვერდზე.');
            return;
        }

        // Loader
        container.innerHTML = `<div class="elw-loader">იტვირთება...</div>`;

        // CSS inject
        if (!document.getElementById('eliga-widget-css')) {
            const style = document.createElement('style');
            style.id = 'eliga-widget-css';
            style.textContent = CSS;
            document.head.appendChild(style);
        }

        // Firebase SDK-ს ჩატვირთვა (თუ უკვე ჩატვირთული არ არის)
        function loadFirebase(callback) {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                callback();
                return;
            }

            const sdks = [
                'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
            ];

            let loaded = 0;
            sdks.forEach(src => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => { if (++loaded === sdks.length) callback(); };
                s.onerror = () => {
                    container.innerHTML = `<div class="elw-loader">⚠️ ჩატვირთვის შეცდომა</div>`;
                };
                document.head.appendChild(s);
            });
        }

        loadFirebase(() => {
            // Firebase-ს ვაინიციალიზებთ (თუ ამ widget-ის მიერ ჯერ არ ყოფილა)
            let db;
            try {
                if (!firebase.apps.find(a => a.name === '[eliga-widget]')) {
                    const app = firebase.initializeApp(FIREBASE_CONFIG, '[eliga-widget]');
                    db = app.firestore();
                } else {
                    db = firebase.app('[eliga-widget]').firestore();
                }
            } catch (e) {
                // სხვა Firebase app უკვე ინიციალიზებულია — გამოვიყენოთ ის
                try {
                    db = firebase.firestore();
                } catch (e2) {
                    container.innerHTML = `<div class="elw-loader">⚠️ Firebase-ის შეცდომა</div>`;
                    return;
                }
            }

            // Real-time listener
            let liveMatches = [];
            db.collection('live_matches').onSnapshot(snapshot => {
                liveMatches = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    data.id = doc.id;
                    liveMatches.push(data);
                });
                renderWidget(container, liveMatches);
            }, err => {
                console.error('[E-Liga Widget] Firestore error:', err);
                container.innerHTML = `<div class="elw-empty"><div class="elw-empty-icon">⚠️</div><div class="elw-empty-text">მონაცემების ჩატვირთვა ვერ მოხერხდა</div></div>`;
            });

            startLocalTimers();
        });
    }

    // ============================================================
    // ავტომატური გაშვება DOM-ის მზადყოფნის შემდეგ
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }

})();
