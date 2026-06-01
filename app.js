const firebaseConfig = {
    apiKey: "AIzaSyArZaTt57Z0nAgPsMnv0Bp7aE4YSuUxYWc",
    authDomain: "e-liga.firebaseapp.com",
    projectId: "e-liga",
    storageBucket: "e-liga.firebasestorage.app",
    messagingSenderId: "433431017124",
    appId: "1:433431017124:web:b84dd1a6d60df9bf04d831",
    measurementId: "G-M71XD3E749"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

function matchApp() {
    return {
        view: 'login', 
        role: localStorage.getItem('userRole') || null,
        user: null,
        
        history: [], 
        hasActiveMatch: false, 
        currentReport: null,
        firebaseLiveMatch: null, // აქ შეინახება ონლაინ მიმდინარე მატჩი სტუმრებისთვის
        guestLiveInterval: null,

        setup: { activeTab: 'home', homeName: '', awayName: '', homePlayers: [], awayPlayers: [], playerStatus: 'starting', playerNum: '', playerName: '' },
        match: { homeName: '', awayName: '', scoreHome: 0, scoreAway: 0, homePlayers: [], awayPlayers: [], events: [], timer: 0, isPaused: true, lastTick: null, timerInterval: null },
        modal: { open: false, type: '', team: 'home', playerOut: null, playerIn: null },
        timeModal: { open: false, min: 0, sec: 0, editEventIndex: -1 },
        scoreModal: { open: false, team: '', val: 0 },
        editModal: { open: false, index: -1, type: '', team: '', playerNum: '', min: 0, sec: 0 },

        init() {
            auth.onAuthStateChanged((user) => {
                if (user) {
                    this.user = user;
                    if (!this.role) this.role = 'manager'; 
                    if (this.role === 'manager') this.view = 'home';
                    else if (this.role === 'referee') this.view = 'referee_home';
                } else {
                    if (this.role === 'guest') this.view = 'history';
                    else this.view = 'login';
                }
            });

            this.hasActiveMatch = !!localStorage.getItem('activeMatch');
            
            // დასრულებული მატჩების ისტორია
            db.collection("matches").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
                this.history = [];
                snapshot.forEach((doc) => { this.history.push({ id: doc.id, ...doc.data() }); });
            });

            // ონლაინ რეჟიმში მიმდინარე მატჩის მოსმენა (სტუმრებისთვის)
            db.collection("live_match").doc("current").onSnapshot((doc) => {
                if (doc.exists) {
                    this.firebaseLiveMatch = doc.data();
                    this.syncGuestTimer();
                } else {
                    this.firebaseLiveMatch = null;
                    if (this.guestLiveInterval) clearInterval(this.guestLiveInterval);
                }
            });
        },

        // სტუმრის ტაიმერის ავტომატური სინქრონიზაცია მენეჯერთან
        syncGuestTimer() {
            if (this.guestLiveInterval) clearInterval(this.guestLiveInterval);
            if (!this.firebaseLiveMatch || this.firebaseLiveMatch.isPaused) return;

            this.guestLiveInterval = setInterval(() => {
                if (!this.firebaseLiveMatch || this.firebaseLiveMatch.isPaused) return;
                let now = Date.now();
                let diff = Math.floor((now - this.firebaseLiveMatch.lastTick) / 1000);
                let currentTimer = this.firebaseLiveMatch.timer + diff;
                
                if (currentTimer >= 2700 && this.firebaseLiveMatch.timer < 2700) currentTimer = 2700;
                if (currentTimer >= 5400 && this.firebaseLiveMatch.timer < 5400) currentTimer = 5400;
                
                this.firebaseLiveMatch.displayTimer = currentTimer;
            }, 1000);
        },

        getGuestTime() {
            if (!this.firebaseLiveMatch) return '00:00';
            let t = this.firebaseLiveMatch.displayTimer !== undefined ? this.firebaseLiveMatch.displayTimer : this.firebaseLiveMatch.timer;
            return this.formatTime(t);
        },

        loginAsGuest() {
            this.role = 'guest';
            localStorage.setItem('userRole', 'guest');
            this.view = 'history';
        },
        loginWithGoogle(selectedRole) {
            this.role = selectedRole;
            localStorage.setItem('userRole', selectedRole);
            auth.signInWithPopup(provider).catch(error => {
                alert("შეცდომა: " + error.message);
                this.role = null; localStorage.removeItem('userRole');
            });
        },
        logout() {
            if (this.match.timerInterval) clearInterval(this.match.timerInterval);
            if (this.guestLiveInterval) clearInterval(this.guestLiveInterval);
            auth.signOut().then(() => {
                this.user = null; this.role = null;
                localStorage.removeItem('userRole');
                this.view = 'login';
            });
        },

        saveState() {
            let matchToSave = { ...this.match, timerInterval: null };
            localStorage.setItem('activeMatch', JSON.stringify(matchToSave));
            this.hasActiveMatch = true;

            // მატჩის მიმდინარეობისას მონაცემები მომენტალურად იგზავნება ონლაინ ბაზაში სტუმრებისთვის
            db.collection("live_match").doc("current").set(matchToSave).catch(err => console.log(err));
        },

        resumeMatch() {
            let saved = JSON.parse(localStorage.getItem('activeMatch'));
            if (saved) {
                this.match = saved;
                this.view = 'live';
                if (!this.match.isPaused) {
                    let now = Date.now();
                    let diff = Math.floor((now - this.match.lastTick) / 1000);
                    let newTimer = this.match.timer + diff;
                    if (this.match.timer < 2700 && newTimer >= 2700) { this.match.timer = 2700; this.match.isPaused = true; } 
                    else if (this.match.timer < 5400 && newTimer >= 5400) { this.match.timer = 5400; this.match.isPaused = true; } 
                    else { this.match.timer = newTimer; }
                    this.match.lastTick = now;
                    if (!this.match.isPaused) this.startInterval();
                }
            }
        },
        addPlayerToSetup() {
            if (!this.setup.playerNum) return;
            const p = { id: Date.now(), num: this.setup.playerNum, name: this.setup.playerName, status: this.setup.playerStatus };
            if (this.setup.activeTab === 'home') this.setup.homePlayers.push(p);
            else this.setup.awayPlayers.push(p);
            let currentList = this.setup.activeTab === 'home' ? this.setup.homePlayers : this.setup.awayPlayers;
            let startersCount = currentList.filter(x => x.status === 'starting').length;
            if (this.setup.playerStatus === 'starting' && startersCount >= 11) { this.setup.playerStatus = 'sub'; }
            this.setup.playerNum = ''; this.setup.playerName = '';
        },
        removePlayerFromSetup(id) {
            if (this.setup.activeTab === 'home') this.setup.homePlayers = this.setup.homePlayers.filter(x => x.id !== id);
            else this.setup.awayPlayers = this.setup.awayPlayers.filter(x => x.id !== id);
        },
        startMatch() {
            this.match.homeName = this.setup.homeName || 'Home'; 
            this.match.awayName = this.setup.awayName || 'Away';
            this.match.homePlayers = JSON.parse(JSON.stringify(this.setup.homePlayers));
            this.match.awayPlayers = JSON.parse(JSON.stringify(this.setup.awayPlayers));
            this.match.scoreHome = 0; this.match.scoreAway = 0; this.match.events = []; 
            this.match.timer = 0; this.match.isPaused = true; this.match.lastTick = Date.now();
            this.view = 'live'; this.saveState();
        },
        startInterval() {
            if (this.match.timerInterval) clearInterval(this.match.timerInterval);
            this.match.lastTick = Date.now();
            this.match.timerInterval = setInterval(() => {
                let now = Date.now();
                let diff = Math.floor((now - this.match.lastTick) / 1000);
                if (diff > 0) {
                    let newTimer = this.match.timer + diff;
                    let autoPaused = false;
                    if (this.match.timer < 2700 && newTimer >= 2700) { newTimer = 2700; autoPaused = true; } 
                    else if (this.match.timer < 5400 && newTimer >= 5400) { newTimer = 5400; autoPaused = true; }
                    this.match.timer = newTimer;
                    this.match.lastTick = now - ((now - this.match.lastTick) % 1000);
                    if (autoPaused) { this.match.isPaused = true; clearInterval(this.match.timerInterval); this.match.timerInterval = null; }
                    this.saveState();
                }
            }, 1000);
        },
        toggleTimer() {
            this.match.isPaused = !this.match.isPaused;
            if (!this.match.isPaused) { this.startInterval(); } 
            else { if (this.match.timerInterval) { clearInterval(this.match.timerInterval); this.match.timerInterval = null; } }
            this.saveState();
        },
        formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; },
        openEventModal(type) { this.modal.type = type; this.modal.open = true; this.modal.playerOut = null; this.modal.playerIn = null; },
        recordStandardEvent(p) {
            this.match.events.unshift({ id: Date.now() + Math.random(), type: this.modal.type, team: this.modal.team, playerNum: p.num, playerName: p.name, time: this.formatTime(this.match.timer) });
            if (this.modal.type === 'goal' || this.modal.type === 'penalty') {
                if (this.modal.team === 'home') this.match.scoreHome++; else this.match.scoreAway++;
            }
            this.modal.open = false; this.saveState();
        },
        recordSubstitution() {
            const list = this.modal.team === 'home' ? this.match.homePlayers : this.match.awayPlayers;
            const pOut = list.find(x => x.id === this.modal.playerOut.id);
            const pIn = list.find(x => x.id === this.modal.playerIn.id);
            pOut.status = 'sub'; pIn.status = 'starting';
            this.match.events.unshift({ id: Date.now() + Math.random(), type: 'sub', team: this.modal.team, playerOut: pOut, playerIn: pIn, time: this.formatTime(this.match.timer) });
            this.modal.open = false; this.saveState();
        },
        openTimeEdit() { this.timeModal.editEventIndex = -1; this.timeModal.min = Math.floor(this.match.timer / 60); this.timeModal.sec = this.match.timer % 60; this.timeModal.open = true; },
        openTimeEditOnly(index) {
            let ev = this.match.events[index]; let tParts = ev.time.split(':');
            this.timeModal.editEventIndex = index; this.timeModal.min = parseInt(tParts[0]); this.timeModal.sec = parseInt(tParts[1]); this.timeModal.open = true;
        },
        saveTimeEdit() {
            let newTime = parseInt(this.timeModal.min) * 60 + parseInt(this.timeModal.sec);
            if (this.timeModal.editEventIndex === -1) { this.match.timer = newTime; this.match.lastTick = Date.now(); } 
            else { this.match.events[this.timeModal.editEventIndex].time = this.formatTime(newTime); }
            this.timeModal.open = false; this.saveState();
        },
        openScoreEdit(team) { this.scoreModal.team = team; this.scoreModal.val = team === 'home' ? this.match.scoreHome : this.match.scoreAway; this.scoreModal.open = true; },
        saveScoreEdit() { 
            if(this.scoreModal.team === 'home') this.match.scoreHome = parseInt(this.scoreModal.val); 
            else this.match.scoreAway = parseInt(this.scoreModal.val); 
            this.scoreModal.open = false; this.saveState();
        },
        openEventEdit(index) {
            let ev = this.match.events[index]; this.editModal.index = index; this.editModal.type = ev.type; this.editModal.team = ev.team;
            let tParts = ev.time.split(':'); this.editModal.min = parseInt(tParts[0]); this.editModal.sec = parseInt(tParts[1]);
            if(ev.type !== 'sub') this.editModal.playerNum = ev.playerNum;
            this.editModal.open = true;
        },
        saveEventEdit() {
            let ev = this.match.events[this.editModal.index];
            ev.team = this.editModal.team; ev.time = this.formatTime(parseInt(this.editModal.min) * 60 + parseInt(this.editModal.sec));
            if(ev.type !== 'sub') {
                let list = ev.team === 'home' ? this.match.homePlayers : this.match.awayPlayers;
                let p = list.find(x => x.num == this.editModal.playerNum);
                if(p) { ev.playerNum = p.num; ev.playerName = p.name; }
            }
            this.editModal.open = false; this.saveState();
        },
        finishMatch() {
            if (!confirm('ნამდვილად გსურთ მატჩის დასრულება?')) return;
            if (this.match.timerInterval) clearInterval(this.match.timerInterval);
            let dateStr = new Date().toLocaleString('ka-GE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' });
            
            let reportData = {
                timestamp: Date.now(), date: dateStr, homeName: this.match.homeName, awayName: this.match.awayName, 
                scoreHome: this.match.scoreHome, scoreAway: this.match.scoreAway,
                homePlayers: JSON.parse(JSON.stringify(this.match.homePlayers)),
                awayPlayers: JSON.parse(JSON.stringify(this.match.awayPlayers)),
                events: JSON.parse(JSON.stringify(this.match.events))
            };
            db.collection("matches").add(reportData).then(() => {
                // მატჩის დასრულებისას ვშლით მიმდინარე ლაივ რეჟიმს
                db.collection("live_match").doc("current").delete().then(() => {
                    localStorage.removeItem('activeMatch'); this.hasActiveMatch = false; this.view = 'history';
                });
            }).catch(() => { alert("შეცდომა! შეამოწმეთ ინტერნეტი."); });
        },
        viewReport(index) {
            this.currentReport = this.history[index];
            let stats = { home: { yellow:0, red:0, corner:0, goals:[] }, away: { yellow:0, red:0, corner:0, goals:[] } };
            this.currentReport.events.forEach(e => {
                if(e.type === 'yellow') stats[e.team].yellow++;
                if(e.type === 'red') stats[e.team].red++;
                if(e.type === 'corner') stats[e.team].corner++;
                if(e.type === 'goal' || e.type === 'penalty') {
                    stats[e.team].goals.push({ num: e.playerNum, player: '#' + e.playerNum + (e.playerName ? ' ' + e.playerName : ''), time: e.time });
                }
            });
            this.currentReport.stats = stats; this.view = 'report';
        },
        deleteReport(index) {
            if(confirm('ნამდვილად გსურთ ამ მატჩის ისტორიიდან წაშლა?')) {
                db.collection("matches").doc(this.history[index].id).delete();
            }
        },
        clearHistory() { 
            if (confirm('წავშალოთ მთლიანი ისტორია?')) { 
                this.history.forEach(h => db.collection("matches").doc(h.id).delete()); 
            } 
        },
        downloadPDF() {
            const element = document.getElementById('pdf-content');
            const opt = {
                margin: 0.2, filename: `${this.currentReport.homeName}_vs_${this.currentReport.awayName}_Report.pdf`,
                image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().set(opt).from(element).save();
        }
    }
}
