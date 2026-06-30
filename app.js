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

function matchApp() {
    return {
        view: 'landing', 
        role: localStorage.getItem('userRole') || null,
        
        loginType: '', 
        loginUsername: '',
        loginPassword: '',
        
        history: [], 
        hasActiveMatch: false, 
        currentReport: null,
        
        matchId: localStorage.getItem('activeMatchId') || null,
        liveMatches: [], 
        firebaseLiveMatch: null, 
        currentLiveMatchId: null,

        isListening: false,
        recognition: null,
        listeningTarget: null, 
        
        isScanning: false,
        scanProgress: '',
        scanMode: null, // 'file' or 'camera'
        cameraStream: null,

        setup: { 
            activeTab: 'home', homeName: '', awayName: '', homePlayers: [], awayPlayers: [], 
            playerStatus: 'starting', playerNum: '', playerName: '',
            homeCoach: '', awayCoach: '',
            referees: { main: '', assistant1: '', assistant2: '', fourth: '', var: '', avar: '' }
        },
        match: { 
            homeName: '', awayName: '', scoreHome: 0, scoreAway: 0, 
            homePlayers: [], awayPlayers: [], events: [], timer: 0, displayTimer: 0, isPaused: true, lastTick: null, timerInterval: null,
            homeCoach: '', awayCoach: '', referees: {}
        },
        
        modal: { open: false, type: '', team: 'home', playerOut: null, playerIn: null },
        timeModal: { open: false, min: 0, sec: 0, editEventIndex: -1 },
        scoreModal: { open: false, team: '', val: 0 },
        editModal: { open: false, index: -1, type: '', team: '', playerNum: '', min: 0, sec: 0 },
        livePlayerEditModal: { open: false, team: '', id: null, num: '', name: '' },
        setupPlayerEditModal: { open: false, team: '', id: null, num: '', name: '' },
        
        // FIX #2: refereeSetupModal state preserved
        refereeSetupModal: { open: false },
        lineupModal: { open: false },
        cameraModal: { open: false },

        init() {
            if (this.role === 'manager') this.view = 'home';
            else if (this.role === 'referee') this.view = 'referee_home';
            else if (this.role === 'superadmin') this.view = 'home'; 
            else if (this.role === 'guest') this.view = 'history';
            else this.view = 'landing';

            this.hasActiveMatch = !!localStorage.getItem('activeMatch');
            
            db.collection("matches").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
                this.history = [];
                snapshot.forEach((doc) => { this.history.push({ id: doc.id, ...doc.data() }); });
                console.log('[history listener] role:', this.role, '| docs received:', snapshot.size, '| history.length:', this.history.length);
            }, (error) => {
                console.error('[history listener] ERROR:', error.code, error.message);
            });

            db.collection("live_matches").onSnapshot((snapshot) => {
                this.liveMatches = [];
                snapshot.forEach((doc) => {
                    let data = doc.data();
                    data.id = doc.id;
                    if (!data.isPaused && data.lastTick) {
                        let diff = Math.floor((Date.now() - data.lastTick) / 1000);
                        data.displayTimer = data.timer + diff;
                    } else {
                        data.displayTimer = data.timer;
                    }
                    this.liveMatches.push(data);
                });
                
                if (this.view === 'live' && this.matchId) {
                    const found = this.liveMatches.find(m => m.id === this.matchId);
                    if (found) {
                        this.match.scoreHome = found.scoreHome;
                        this.match.scoreAway = found.scoreAway;
                        this.match.events = found.events;
                        this.match.homePlayers = found.homePlayers;
                        this.match.awayPlayers = found.awayPlayers;
                        this.match.homeCoach = found.homeCoach;
                        this.match.awayCoach = found.awayCoach;
                        this.match.referees = found.referees;
                        
                        if (this.match.isPaused !== found.isPaused || Math.abs(this.match.timer - found.timer) > 2) {
                            this.match.isPaused = found.isPaused;
                            this.match.timer = found.timer;
                            this.match.lastTick = found.lastTick;
                        }
                    } else if (this.hasActiveMatch) {
                        alert("მატჩი დასრულდა ან წაიშალა სხვა მომხმარებლის მიერ!");
                        localStorage.removeItem('activeMatch');
                        localStorage.removeItem('activeMatchId');
                        this.matchId = null;
                        this.hasActiveMatch = false;
                        this.view = 'history';
                    }
                }
                
                // FIX #5: guest_live - always sync firebaseLiveMatch from liveMatches
                if (this.view === 'guest_live' && this.currentLiveMatchId) {
                    const found = this.liveMatches.find(m => m.id === this.currentLiveMatchId);
                    if (found) { 
                        this.firebaseLiveMatch = JSON.parse(JSON.stringify(found));
                    } 
                    else { alert("მატჩი დასრულდა მენეჯერის მიერ!"); this.view = 'history'; }
                }
            });

            setInterval(() => {
                this.liveMatches.forEach(m => {
                    if (!m.isPaused && m.lastTick) {
                        let diff = Math.floor((Date.now() - m.lastTick) / 1000);
                        m.displayTimer = m.timer + diff;
                    } else { m.displayTimer = m.timer; }
                });
                
                // FIX #5: update firebaseLiveMatch timer every second so guest sees live timer
                if (this.view === 'guest_live' && this.firebaseLiveMatch) {
                    if (!this.firebaseLiveMatch.isPaused && this.firebaseLiveMatch.lastTick) {
                        let diff = Math.floor((Date.now() - this.firebaseLiveMatch.lastTick) / 1000);
                        this.firebaseLiveMatch.displayTimer = this.firebaseLiveMatch.timer + diff;
                    } else {
                        this.firebaseLiveMatch.displayTimer = this.firebaseLiveMatch.timer || 0;
                    }
                }
                
                if (this.view === 'live' && this.match && !this.match.isPaused && this.match.lastTick) {
                    let diff = Math.floor((Date.now() - this.match.lastTick) / 1000);
                    let currentTimer = this.match.timer + diff;
                    if (currentTimer >= 2700 && this.match.timer < 2700) {
                        currentTimer = 2700; this.match.isPaused = true; this.match.timer = 2700; this.match.lastTick = null; this.saveState();
                    } else if (currentTimer >= 5400 && this.match.timer < 5400) {
                        currentTimer = 5400; this.match.isPaused = true; this.match.timer = 5400; this.match.lastTick = null; this.saveState();
                    }
                    this.match.displayTimer = currentTimer;
                } else if (this.match) {
                    this.match.displayTimer = this.match.timer;
                }
            }, 1000);

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();
                this.recognition.lang = 'ka-GE'; 
                this.recognition.continuous = false; 
                this.recognition.interimResults = false;
                
                this.recognition.onresult = (event) => {
                    let transcript = event.results[0][0].transcript;
                    const digraphs = {
                        'sh': 'შ', 'ch': 'ჩ', 'zh': 'ჟ', 'dz': 'ძ', 'ts': 'ც', 'gh': 'ღ', 'kh': 'ხ',
                        'Sh': 'შ', 'Ch': 'ჩ', 'Zh': 'ჟ', 'Dz': 'ძ', 'Ts': 'ც', 'Gh': 'ღ', 'Kh': 'ხ',
                        'SH': 'შ', 'CH': 'ჩ', 'ZH': 'ჟ', 'DZ': 'ძ', 'TS': 'ც', 'GH': 'ღ', 'KH': 'ხ'
                    };
                    const chars = {
                        'a': 'ა', 'b': 'ბ', 'c': 'ც', 'd': 'დ', 'e': 'ე', 'f': 'ფ', 'g': 'გ', 'h': 'ჰ', 'i': 'ი', 'j': 'ჯ', 'k': 'კ', 'l': 'ლ', 'm': 'მ', 'n': 'ნ', 'o': 'ო', 'p': 'პ', 'q': 'ქ', 'r': 'რ', 's': 'ს', 't': 'ტ', 'u': 'უ', 'v': 'ვ', 'w': 'ვ', 'x': 'ხ', 'y': 'ი', 'z': 'ზ',
                        'A': 'ა', 'B': 'ბ', 'C': 'ც', 'D': 'დ', 'E': 'ე', 'F': 'ფ', 'G': 'გ', 'H': 'ჰ', 'I': 'ი', 'J': 'ჯ', 'K': 'კ', 'L': 'ლ', 'M': 'მ', 'N': 'ნ', 'O': 'ო', 'P': 'პ', 'Q': 'ქ', 'R': 'რ', 'S': 'ს', 'T': 'ტ', 'U': 'უ', 'V': 'ვ', 'W': 'ვ', 'X': 'ხ', 'Y': 'ი', 'Z': 'ზ'
                    };
                    for (let key in digraphs) { transcript = transcript.split(key).join(digraphs[key]); }
                    for (let key in chars) { transcript = transcript.split(key).join(chars[key]); }

                    if (this.listeningTarget === 'playerName') this.setup.playerName = transcript;
                    else if (this.listeningTarget === 'homeCoach') this.setup.homeCoach = transcript;
                    else if (this.listeningTarget === 'awayCoach') this.setup.awayCoach = transcript;
                    else if (this.listeningTarget === 'main') this.setup.referees.main = transcript;
                    else if (this.listeningTarget === 'assistant1') this.setup.referees.assistant1 = transcript;
                    else if (this.listeningTarget === 'assistant2') this.setup.referees.assistant2 = transcript;
                    else if (this.listeningTarget === 'fourth') this.setup.referees.fourth = transcript;
                    else if (this.listeningTarget === 'var') this.setup.referees.var = transcript;
                    else if (this.listeningTarget === 'avar') this.setup.referees.avar = transcript;
                };
                
                this.recognition.onerror = () => { this.isListening = false; this.listeningTarget = null; };
                this.recognition.onend = () => { this.isListening = false; this.listeningTarget = null; };
            }
        },

        toggleListening(target) {
            if (!this.recognition) { alert("თქვენი ბრაუზერი არ უჭერს მხარს ხმოვან შეყვანას."); return; }
            if (this.isListening && this.listeningTarget === target) {
                this.recognition.stop(); this.isListening = false; this.listeningTarget = null;
            } else {
                if (this.isListening) this.recognition.stop(); 
                this.listeningTarget = target;
                try { this.recognition.start(); this.isListening = true; } catch(e) { console.log(e); }
            }
        },

        // ============================================================
        // FIX #1 (v2): გაუმჯობესებული OCR - წინასწარი დამუშავება + სიზუსტე
        // ============================================================

        // სურათის წინასწარი დამუშავება Canvas-ით: აუმჯობესებს ცუდი ხარისხის
        // ფოტოს ამოცნობას - გადააქცევს შავ-თეთრად, ზრდის კონტრასტს, ზრდის ზომას
        async preprocessImage(imageSource) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        // საჭიროების შემთხვევაში ვზრდით ზომას (პატარა სურათები უარესად იცნობა)
                        const MIN_WIDTH = 1600;
                        let scale = img.width < MIN_WIDTH ? (MIN_WIDTH / img.width) : 1;
                        // ძალიან დიდი სურათები (კამერიდან) ცოტა შევამციროთ წარმადობისთვის
                        if (img.width * scale > 3000) scale = 3000 / img.width;

                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        const ctx = canvas.getContext('2d');
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        // პიქსელების დამუშავება: გრეისქეილი + კონტრასტის გაძლიერება
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const data = imageData.data;

                        // 1) გრეისქეილში გადაყვანა (luminance ფორმულით)
                        const gray = new Uint8ClampedArray(canvas.width * canvas.height);
                        for (let i = 0; i < data.length; i += 4) {
                            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                            gray[i / 4] = lum;
                        }

                        // 2) საშუალო სიკაშკაშის გამოთვლა ადაპტური threshold-ისთვის
                        let sum = 0;
                        for (let i = 0; i < gray.length; i++) sum += gray[i];
                        const mean = sum / gray.length;

                        // 3) კონტრასტის გაძლიერება + ადაპტური threshold (Otsu-ს მსგავსი მარტივი ვერსია)
                        const contrastFactor = 1.6;
                        for (let i = 0; i < data.length; i += 4) {
                            let v = gray[i / 4];
                            // კონტრასტის გაძლიერება საშუალოს გარშემო
                            v = mean + (v - mean) * contrastFactor;
                            v = Math.max(0, Math.min(255, v));
                            data[i] = data[i + 1] = data[i + 2] = v;
                        }

                        ctx.putImageData(imageData, 0, 0);
                        canvas.toBlob((blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error('სურათის დამუშავება ვერ მოხერხდა'));
                        }, 'image/png', 1.0);

                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = () => reject(new Error('სურათის ჩატვირთვა ვერ მოხერხდა'));

                if (imageSource instanceof Blob) {
                    img.src = URL.createObjectURL(imageSource);
                } else {
                    img.src = imageSource;
                }
            });
        },

        // OCR core: image-ს იღებს (File ან Blob), ამუშავებს და სცადავს რამდენიმე
        // რეჟიმით საუკეთესო შედეგის მისაღებად
        async runOCR(imageSource) {
            this.isScanning = true;
            this.scanProgress = 'სურათი მზადდება...';

            // Timeout დაცვა - თუ 60 წამში არ დასრულდა, ვწყვეტთ და ვატყობინებთ
            let timeoutId = setTimeout(() => {
                this.isScanning = false;
                alert("სკანირებამ მეტისმეტად დიდხანს გასტანა. გთხოვთ შეამოწმოთ ინტერნეტ კავშირი და სცადოთ ისევ.\n\n(პირველი სკანირება ნელია, რადგან საჭიროებს ენის მონაცემების ჩამოტვირთვას — სცადეთ მეორედ, უფრო სწრაფი იქნება)");
            }, 60000);

            let worker = null;

            try {
                // 1. წინასწარი დამუშავება - აუმჯობესებს ცუდი ხარისხის ფოტოს ამოცნობას
                this.scanProgress = 'სურათი მუშავდება...';
                let processedImage;
                try {
                    processedImage = await this.preprocessImage(imageSource);
                } catch (e) {
                    console.warn('Preprocessing failed, using original image:', e);
                    processedImage = imageSource;
                }

                // 2. Worker-ის შექმნა - ქართული ენა (Tesseract-ის კოდი: 'kat', არა 'geo')
                this.scanProgress = 'ენის მონაცემები იტვირთება...';
                worker = await Tesseract.createWorker('kat', 1, {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            this.scanProgress = `მუშავდება... ${Math.round((m.progress || 0) * 100)}%`;
                        } else if (m.status === 'loading language traineddata') {
                            this.scanProgress = 'ენის მონაცემები იტვირთება...';
                        } else if (m.status === 'initializing tesseract') {
                            this.scanProgress = 'ინიციალიზაცია...';
                        }
                    }
                });

                // 3. რამდენიმე PSM (Page Segmentation Mode) რეჟიმის ცდა - საუკეთესოს ავარჩევთ
                // PSM 6 = ერთგვაროვანი ბლოკი (სია), PSM 4 = სვეტი ცვლადი ზომის ტექსტით, PSM 11 = მიმოფანტული ტექსტი
                const psmModes = ['6', '4', '11'];
                let bestText = '';
                let bestScore = -1;

                for (let psm of psmModes) {
                    await worker.setParameters({
                        tessedit_pageseg_mode: psm,
                        preserve_interword_spaces: '1'
                    });

                    const ret = await worker.recognize(processedImage);
                    const text = ret.data.text || '';
                    
                    // შედეგის შეფასება: რამდენი ვალიდური "ნომერი + სახელი" სტრიქონი ამოვიცანით
                    const candidateLines = this.extractPlayerCandidates(text);
                    const score = candidateLines.length;

                    if (score > bestScore) {
                        bestScore = score;
                        bestText = text;
                    }

                    // თუ კარგი შედეგი მივიღეთ, აღარ ვცდით დანარჩენ რეჟიმებს (დროის დასაზოგად)
                    if (score >= 5) break;
                }

                await worker.terminate();
                worker = null;
                clearTimeout(timeoutId);

                if (!bestText || bestText.trim().length === 0) {
                    alert("ტექსტი ვერ ამოვიცანი სურათზე. სცადეთ უფრო ნათელი ფოტო ან გადადით ხელით შეყვანაზე.");
                    return;
                }

                this.parseOCRText(bestText);

            } catch (error) {
                clearTimeout(timeoutId);
                if (worker) { try { await worker.terminate(); } catch (e) {} }
                console.error('OCR Error:', error);
                alert("სკანირებისას დაფიქსირდა შეცდომა: " + (error.message || 'უცნობი შეცდომა') + "\n\nსცადეთ ისევ, ან გადადით ხელით შეყვანაზე.");
            } finally {
                clearTimeout(timeoutId);
                this.isScanning = false;
                this.scanProgress = '';
            }
        },

        // ხედავს ტექსტში რამდენი ვალიდური "ნომერი + სახელი" სტრიქონია (შეფასებისთვის)
        extractPlayerCandidates(text) {
            const lines = text.split('\n');
            let count = 0;
            for (let line of lines) {
                line = line.trim();
                if (/^№?#?\s*(\d{1,2})[.\s)]+[^\d\n]{2,}/.test(line)) count++;
            }
            return new Array(count);
        },

        // OCR ტექსტის დამუშავება - გამოყოფს ნომერს და სახელ-გვარს
        // (იმავე ფორმატით ინახავს, როგორც ხელით შეყვანისას: num ცალკე, name = "სახელი გვარი")
        parseOCRText(text) {
            const lines = text.split('\n');
            let parsedPlayers = [];

            for (let rawLine of lines) {
                let line = rawLine.trim();
                if (!line || line.length < 2) continue;

                // ვასუფთავებთ ხშირ "ნაგავ" სიმბოლოებს, რაც სკანირებაში ჩნდება
                line = line.replace(/[|‘’"'`]/g, ' ').replace(/\s{2,}/g, ' ').trim();

                // ნომერი + სახელი/გვარი ამოღების pattern-ები (პრიორიტეტის მიხედვით)
                const patterns = [
                    /^№\s*(\d{1,2})[.\s)]+([^\d\n]+)/,    // "№10 გიორგი ქობულია"
                    /^#\s*(\d{1,2})[.\s)]+([^\d\n]+)/,     // "#10 გიორგი ქობულია"
                    /^(\d{1,2})[.\s)]+([^\d\n]+)/,          // "10. გიორგი ქობულია" ან "10 გიორგი ქობულია"
                ];

                let matched = false;
                for (let pattern of patterns) {
                    const m = line.match(pattern);
                    if (m) {
                        let num = m[1].trim();
                        // სახელი + გვარი ერთად ვინახავთ (ისევე, როგორც ხელით შევსების ველში)
                        let name = m[2]
                            .replace(/[^\wა-ჰA-Za-z\s\-\.]/g, ' ')  // ვტოვებთ ასოებს (ქართულს და ლათინურს), ჰიფენს, წერტილს
                            .replace(/\s{2,}/g, ' ')
                            .trim();

                        // ვშლით სიტყვის ბოლოს/თავში დარჩენილ ცალკეულ სიმბოლოებს (ხშირი OCR ხმაური)
                        name = name.replace(/^[.\-]+|[.\-]+$/g, '').trim();

                        const numVal = parseInt(num);
                        if (num && numVal >= 1 && numVal <= 99 && name.length >= 2) {
                            parsedPlayers.push({ num, name });
                            matched = true;
                            break;
                        }
                    }
                }

                // თუ ნომერი მარტო დგას ცალკე სტრიქონზე (სახელი შემდეგ სტრიქონზეა)
                if (!matched) {
                    const numOnly = line.match(/^№?#?\s*(\d{1,2})\s*$/);
                    if (numOnly) {
                        parsedPlayers.push({ num: numOnly[1], name: '', _pendingName: true });
                    } else if (parsedPlayers.length > 0 && parsedPlayers[parsedPlayers.length - 1]._pendingName) {
                        // წინა ნომერს ჯერ სახელი არ აქვს - ეს სტრიქონი შეიძლება იყოს მისი სახელი
                        let possibleName = line.replace(/[^\wა-ჰA-Za-z\s\-\.]/g, ' ').replace(/\s{2,}/g, ' ').trim();
                        if (possibleName.length >= 2 && !/^\d+$/.test(possibleName)) {
                            parsedPlayers[parsedPlayers.length - 1].name = possibleName;
                            delete parsedPlayers[parsedPlayers.length - 1]._pendingName;
                        }
                    }
                }
            }

            // ვასუფთავებთ დროებით დროშებს და ვშლით დუბლიკატ ნომრებს იმავე სიაში
            parsedPlayers = parsedPlayers.map(p => ({ num: p.num, name: p.name || '' }));

            if (parsedPlayers.length === 0) {
                alert("მოთამაშეების ნომრები ვერ ამოვიცანი.\nსცადეთ: უფრო ნათელი სურათი, ან კამერა უფრო ახლოს მიიტანეთ სიასთან.");
                return;
            }

            // სიაში დამატება - იმავე ლოგიკით, რაც ხელით დამატებისას მუშაობს
            parsedPlayers.forEach((p) => {
                let currentList = this.setup.activeTab === 'home' ? this.setup.homePlayers : this.setup.awayPlayers;
                let hasGKWithStatus = currentList.some(pl => pl.status === this.setup.playerStatus && pl.isGK);
                
                const newPlayer = {
                    id: Date.now() + Math.random(),
                    num: p.num.toString(),
                    name: p.name.toString().trim(),
                    status: this.setup.playerStatus,
                    isGK: !hasGKWithStatus,
                    isCaptain: false
                };
                
                if (this.setup.activeTab === 'home') this.setup.homePlayers.push(newPlayer);
                else this.setup.awayPlayers.push(newPlayer);
                
                let startersCount = (this.setup.activeTab === 'home' ? this.setup.homePlayers : this.setup.awayPlayers)
                    .filter(x => x.status === 'starting').length;
                if (this.setup.playerStatus === 'starting' && startersCount >= 11) { 
                    this.setup.playerStatus = 'sub'; 
                }
            });

            // Alpine reactivity trigger
            if (this.setup.activeTab === 'home') this.setup.homePlayers = [...this.setup.homePlayers];
            else this.setup.awayPlayers = [...this.setup.awayPlayers];

            alert(`✓ ${parsedPlayers.length} მოთამაშე წარმატებით დაემატა!\nშეამოწმეთ და საჭიროებისამებრ ჩაასწორეთ ✏️ ღილაკით.`);
        },

        // ფაილიდან სკანირება
        async processOCR(event) {
            const file = event.target.files[0];
            if (!file) return;
            await this.runOCR(file);
            event.target.value = '';
        },

        // კამერის გახსნა
        async openCamera() {
            this.cameraModal.open = true;
            this.$nextTick(async () => {
                try {
                    const video = document.getElementById('camera-video');
                    this.cameraStream = await navigator.mediaDevices.getUserMedia({ 
                        video: { 
                            facingMode: 'environment', // უკანა კამერა
                            width: { ideal: 1920 },
                            height: { ideal: 1080 }
                        } 
                    });
                    video.srcObject = this.cameraStream;
                } catch (err) {
                    console.error('Camera error:', err);
                    this.cameraModal.open = false;
                    alert("კამერაზე წვდომა ვერ მოხერხდა. შეამოწმეთ ნებართვები.");
                }
            });
        },

        // კამერით ფოტოს გადაღება და სკანირება
        async captureAndScan() {
            const video = document.getElementById('camera-video');
            const canvas = document.getElementById('camera-canvas');
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            
            this.closeCamera();
            
            canvas.toBlob(async (blob) => {
                await this.runOCR(blob);
            }, 'image/jpeg', 0.95);
        },

        // კამერის დახურვა
        closeCamera() {
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(t => t.stop());
                this.cameraStream = null;
            }
            this.cameraModal.open = false;
        },

        // ============================================================

        goBack() {
            if (this.cameraModal.open) { this.closeCamera(); return; }
            if (this.modal.open) { this.modal.open = false; return; }
            if (this.timeModal.open) { this.timeModal.open = false; return; }
            if (this.scoreModal.open) { this.scoreModal.open = false; return; }
            if (this.editModal.open) { this.editModal.open = false; return; }
            if (this.refereeSetupModal.open) { this.refereeSetupModal.open = false; return; }
            if (this.lineupModal.open) { this.lineupModal.open = false; return; }
            if (this.livePlayerEditModal.open) { this.livePlayerEditModal.open = false; return; }
            if (this.setupPlayerEditModal.open) { this.setupPlayerEditModal.open = false; return; }

            if (this.view === 'setup') this.view = 'home';
            else if (this.view === 'history') {
                if (this.role === 'guest') this.logout();
                else this.view = 'home';
            }
            else if (this.view === 'report') this.view = 'history';
            else if (this.view === 'guest_live') this.view = 'history';
            else if (this.view === 'login') this.view = 'landing';
            else if (this.view === 'live') {
                this.view = (this.role === 'superadmin') ? 'history' : 'home';
            } 
        },

        submitLogin() {
            let u = this.loginUsername.trim().toLowerCase();
            let p = this.loginPassword.trim();
            if (u === 'manager' && p === 'eliga2026') { this.role = 'manager'; localStorage.setItem('userRole', 'manager'); this.view = 'home'; }
            else if (u === 'referee' && p === 'referee2026') { this.role = 'referee'; localStorage.setItem('userRole', 'referee'); this.view = 'referee_home'; }
            else if (u === 'superadmin' && p === 'super2026') { this.role = 'superadmin'; localStorage.setItem('userRole', 'superadmin'); this.view = 'home'; }
            else { alert("არასწორი მომხმარებელი ან პაროლი!"); }
            this.loginUsername = ''; this.loginPassword = '';
        },

        loginAsGuest() { this.role = 'guest'; localStorage.setItem('userRole', 'guest'); this.view = 'history'; },
        logout() { this.role = null; localStorage.removeItem('userRole'); this.view = 'landing'; },

        watchLiveMatch(liveMatchId) {
            const found = this.liveMatches.find(m => m.id === liveMatchId);
            if (!found) return;

            if (this.role === 'superadmin') {
                if (confirm('გსურთ ამ მატჩის მართვაში ჩართვა? (Cancel-ზე დაჭერით მხოლოდ სტუმრის რეჟიმში ნახავთ)')) {
                    this.matchId = liveMatchId;
                    this.match = JSON.parse(JSON.stringify(found));
                    this.saveState(); 
                    this.view = 'live';
                } else {
                    this.currentLiveMatchId = liveMatchId;
                    this.firebaseLiveMatch = JSON.parse(JSON.stringify(found));
                    this.view = 'guest_live';
                }
            } else {
                this.currentLiveMatchId = liveMatchId;
                this.firebaseLiveMatch = JSON.parse(JSON.stringify(found));
                this.view = 'guest_live';
            }
        },

        deleteLiveMatch(id) {
            if(confirm('წავშალოთ გაჭედილი ლაივ მატჩი? (მონაცემები ისტორიაში არ შეინახება)')) {
                db.collection("live_matches").doc(id).delete();
                if(this.matchId === id) {
                    localStorage.removeItem('activeMatch'); localStorage.removeItem('activeMatchId');
                    this.matchId = null; this.hasActiveMatch = false;
                }
            }
        },

        saveState() {
            let matchToSave = { ...this.match, timerInterval: null };
            localStorage.setItem('activeMatch', JSON.stringify(matchToSave));
            this.hasActiveMatch = true;
            if (this.matchId) {
                db.collection("live_matches").doc(this.matchId).set(matchToSave).catch(err => console.log(err));
            }
        },

        resumeMatch() {
            this.matchId = localStorage.getItem('activeMatchId');
            let saved = JSON.parse(localStorage.getItem('activeMatch'));
            if (saved) { this.match = saved; this.view = 'live'; }
        },

        getSortedPlayers(players, status) {
            if (!players || !Array.isArray(players)) return [];
            return players.filter(x => x.status === status).sort((a, b) => {
                if (a.isGK && !b.isGK) return -1;
                if (!a.isGK && b.isGK) return 1;
                return parseInt(a.num) - parseInt(b.num);
            });
        },

        addPlayerToSetup() {
            if (this.isListening && this.listeningTarget === 'playerName') {
                this.recognition.stop(); this.isListening = false; this.listeningTarget = null;
            }
            if (!this.setup.playerNum || this.setup.playerNum.toString().trim() === '') return; 
            
            let currentList = this.setup.activeTab === 'home' ? this.setup.homePlayers : this.setup.awayPlayers;
            let hasGKWithStatus = currentList.some(p => p.status === this.setup.playerStatus && p.isGK);

            const newPlayer = { 
                id: Date.now(), 
                num: this.setup.playerNum.toString(), 
                name: this.setup.playerName ? this.setup.playerName.toString().trim() : '', 
                status: this.setup.playerStatus,
                isGK: !hasGKWithStatus,
                isCaptain: false
            };
            
            if (this.setup.activeTab === 'home') this.setup.homePlayers = [...this.setup.homePlayers, newPlayer];
            else this.setup.awayPlayers = [...this.setup.awayPlayers, newPlayer];
            
            let startersCount = (this.setup.activeTab === 'home' ? this.setup.homePlayers : this.setup.awayPlayers).filter(x => x.status === 'starting').length;
            if (this.setup.playerStatus === 'starting' && startersCount >= 11) { this.setup.playerStatus = 'sub'; }
            this.setup.playerNum = ''; this.setup.playerName = '';
        },

        setCaptain(player) {
            let currentList = this.setup.activeTab === 'home' ? this.setup.homePlayers : this.setup.awayPlayers;
            currentList.forEach(p => { p.isCaptain = (p.id === player.id); });
        },

        removePlayerFromSetup(id) {
            if (this.setup.activeTab === 'home') this.setup.homePlayers = this.setup.homePlayers.filter(x => x.id !== id);
            else this.setup.awayPlayers = this.setup.awayPlayers.filter(x => x.id !== id);
        },

        // FIX #3 (v2): Setup მოთამაშის რედაქტირება - გამყარებული ვერსია
        openSetupPlayerEdit(team, p) {
            // ჯერ ვხურავთ სხვა შესაძლო ღია მოდალებს კონფლიქტის თავიდან ასაცილებლად
            this.setupPlayerEditModal.open = false;
            this.$nextTick(() => {
                this.setupPlayerEditModal.team = team;
                this.setupPlayerEditModal.id = p.id;
                this.setupPlayerEditModal.num = p.num;
                this.setupPlayerEditModal.name = p.name;
                this.setupPlayerEditModal.open = true;
            });
        },
        saveSetupPlayerEdit() {
            let list = this.setupPlayerEditModal.team === 'home' ? this.setup.homePlayers : this.setup.awayPlayers;
            let p = list.find(x => x.id === this.setupPlayerEditModal.id);
            if (p) {
                p.num = this.setupPlayerEditModal.num.toString().trim();
                p.name = this.setupPlayerEditModal.name.toString().trim();
            }
            // Alpine reactivity trigger - სრულიად ახალი array reference
            if (this.setupPlayerEditModal.team === 'home') {
                this.setup.homePlayers = this.setup.homePlayers.map(x => x.id === p.id ? { ...p } : x);
            } else {
                this.setup.awayPlayers = this.setup.awayPlayers.map(x => x.id === p.id ? { ...p } : x);
            }
            this.setupPlayerEditModal.open = false;
        },

        startMatch() {
            this.matchId = 'match_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            localStorage.setItem('activeMatchId', this.matchId);
            
            this.match.homeName = this.setup.homeName || 'Home'; 
            this.match.awayName = this.setup.awayName || 'Away';
            this.match.homePlayers = JSON.parse(JSON.stringify(this.setup.homePlayers));
            this.match.awayPlayers = JSON.parse(JSON.stringify(this.setup.awayPlayers));
            this.match.homeCoach = this.setup.homeCoach;
            this.match.awayCoach = this.setup.awayCoach;
            this.match.referees = JSON.parse(JSON.stringify(this.setup.referees));

            this.match.scoreHome = 0; this.match.scoreAway = 0; this.match.events = []; 
            this.match.timer = 0; this.match.displayTimer = 0; this.match.isPaused = true; this.match.lastTick = null;
            this.view = 'live'; this.saveState();
        },

        toggleTimer() {
            this.match.isPaused = !this.match.isPaused;
            if (!this.match.isPaused) {
                this.match.lastTick = Date.now();
            } else {
                if (this.match.lastTick) {
                    let diff = Math.floor((Date.now() - this.match.lastTick) / 1000);
                    this.match.timer += diff;
                }
                this.match.lastTick = null;
            }
            this.saveState();
        },

        formatTime(s) { 
            if (!s || isNaN(s)) return '00:00';
            return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; 
        },

        sortEvents() {
            if (!this.match || !this.match.events) return;
            this.match.events.sort((a, b) => {
                let timeA = a.time.split(':').reduce((m, s) => parseInt(m) * 60 + parseInt(s));
                let timeB = b.time.split(':').reduce((m, s) => parseInt(m) * 60 + parseInt(s));
                return timeB - timeA;
            });
        },

        // FIX #4 & #5: getLiveStat - მუშაობს guest_live-შიც სწორად
        getLiveStat(teamStr, typeStr) {
            let evs;
            if (this.view === 'guest_live') {
                evs = this.firebaseLiveMatch?.events;
            } else {
                evs = this.match?.events;
            }
            if (!evs) return 0;
            return evs.filter(e => e.team === teamStr && e.type === typeStr).length;
        },

        isSubbedIn(p, teamStr) {
            let evs = this.match?.events || this.firebaseLiveMatch?.events;
            if(!evs) return false;
            return evs.some(e => e.team === teamStr && e.type === 'sub' && e.playerIn && e.playerIn.num == p.num);
        },
        isSubbedOut(p, teamStr) {
            let evs = this.match?.events || this.firebaseLiveMatch?.events;
            if(!evs) return false;
            return evs.some(e => e.team === teamStr && e.type === 'sub' && e.playerOut && e.playerOut.num == p.num);
        },

        getCurrentFieldPlayers(teamStr) {
            if (!this.match || !this.match.events) return [];
            let players = teamStr === 'home' ? this.match.homePlayers : this.match.awayPlayers;
            if (!players || !Array.isArray(players)) return [];
            let filtered = players.filter(p => {
                let subbedOut = this.match.events.some(e => e.team === teamStr && e.type === 'sub' && e.playerOut && e.playerOut.num == p.num);
                let subbedIn = this.match.events.some(e => e.team === teamStr && e.type === 'sub' && e.playerIn && e.playerIn.num == p.num);
                return (p.status === 'starting' && !subbedOut) || (p.status === 'sub' && subbedIn);
            });
            return filtered.sort((a, b) => {
                if (a.isGK && !b.isGK) return -1;
                if (!a.isGK && b.isGK) return 1;
                return parseInt(a.num) - parseInt(b.num);
            });
        },

        getCurrentBenchPlayers(teamStr) {
            if (!this.match || !this.match.events) return [];
            let players = teamStr === 'home' ? this.match.homePlayers : this.match.awayPlayers;
            if (!players || !Array.isArray(players)) return [];
            let filtered = players.filter(p => {
                let subbedOut = this.match.events.some(e => e.team === teamStr && e.type === 'sub' && e.playerOut && e.playerOut.num == p.num);
                let subbedIn = this.match.events.some(e => e.team === teamStr && e.type === 'sub' && e.playerIn && e.playerIn.num == p.num);
                return (p.status === 'starting' && subbedOut) || (p.status === 'sub' && !subbedIn);
            });
            return filtered.sort((a, b) => {
                if (a.isGK && !b.isGK) return -1;
                if (!a.isGK && b.isGK) return 1;
                return parseInt(a.num) - parseInt(b.num);
            });
        },

        getPlayerState(teamStr, num) {
            if (!this.match || !this.match.events) return 'active';
            let hasRed = this.match.events.some(e => e.team === teamStr && e.type === 'red' && e.playerNum == num);
            if (hasRed) return 'red_carded';
            let isSubbedOut = this.match.events.some(e => e.team === teamStr && e.type === 'sub' && e.playerOut && e.playerOut.num == num);
            if (isSubbedOut) return 'subbed_out';
            return 'active';
        },

        openEventModal(type) { this.modal.type = type; this.modal.open = true; this.modal.playerOut = null; this.modal.playerIn = null; },
        
        recordStandardEvent(p) {
            if (this.modal.type === 'yellow') {
                let hasYellow = this.match.events.some(e => e.type === 'yellow' && e.team === this.modal.team && e.playerNum === p.num);
                if (hasYellow) { alert('ამ მოთამაშეს უკვე აქვს 1 ყვითელი ბარათი. ავტომატურად ეძლევა წითელი ბარათი!'); this.modal.type = 'red'; }
            }
            this.match.events.unshift({ id: Date.now() + Math.random(), type: this.modal.type, team: this.modal.team, playerNum: p.num, playerName: p.name, time: this.formatTime(this.match.displayTimer || this.match.timer) });
            if (this.modal.type === 'goal' || this.modal.type === 'penalty') {
                if (this.modal.team === 'home') this.match.scoreHome++; else this.match.scoreAway++;
            } else if (this.modal.type === 'own_goal') {
                if (this.modal.team === 'home') this.match.scoreAway++; else this.match.scoreHome++;
            }
            this.sortEvents(); this.modal.open = false; this.saveState();
        },

        recordTeamEvent() {
            this.match.events.unshift({ id: Date.now() + Math.random(), type: this.modal.type, team: this.modal.team, playerNum: null, playerName: null, time: this.formatTime(this.match.displayTimer || this.match.timer) });
            this.sortEvents(); this.modal.open = false; this.saveState();
        },

        recordSubstitution() {
            const list = this.modal.team === 'home' ? this.match.homePlayers : this.match.awayPlayers;
            const pOut = list.find(x => x.id === this.modal.playerOut.id);
            const pIn = list.find(x => x.id === this.modal.playerIn.id);
            this.match.events.unshift({ id: Date.now() + Math.random(), type: 'sub', team: this.modal.team, playerOut: pOut, playerIn: pIn, time: this.formatTime(this.match.displayTimer || this.match.timer) });
            this.sortEvents(); this.modal.open = false; this.saveState();
        },
        
        openTimeEdit() { this.timeModal.editEventIndex = -1; this.timeModal.min = Math.floor((this.match.displayTimer || this.match.timer) / 60); this.timeModal.sec = (this.match.displayTimer || this.match.timer) % 60; this.timeModal.open = true; },
        openTimeEditOnly(index) {
            let ev = this.match.events[index]; let tParts = ev.time.split(':');
            this.timeModal.editEventIndex = index; this.timeModal.min = parseInt(tParts[0]); this.timeModal.sec = parseInt(tParts[1]); this.timeModal.open = true;
        },
        saveTimeEdit() {
            let newTime = parseInt(this.timeModal.min) * 60 + parseInt(this.timeModal.sec);
            if (this.timeModal.editEventIndex === -1) {
                this.match.timer = newTime;
                if (!this.match.isPaused) this.match.lastTick = Date.now();
            } else {
                this.match.events[this.timeModal.editEventIndex].time = this.formatTime(newTime);
                this.sortEvents();
            }
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
            if(!['sub', 'corner', 'offside'].includes(ev.type)) this.editModal.playerNum = ev.playerNum;
            this.editModal.open = true;
        },
        saveEventEdit() {
            let ev = this.match.events[this.editModal.index];
            ev.team = this.editModal.team; ev.time = this.formatTime(parseInt(this.editModal.min) * 60 + parseInt(this.editModal.sec));
            if(!['sub', 'corner', 'offside'].includes(ev.type)) {
                let list = ev.team === 'home' ? this.match.homePlayers : this.match.awayPlayers;
                let p = list.find(x => x.num == this.editModal.playerNum);
                if(p) { ev.playerNum = p.num; ev.playerName = p.name; }
            }
            this.sortEvents(); this.editModal.open = false; this.saveState();
        },

        // FIX #3: Live მოთამაშის რედაქტირება - ივენთების სინქრონიზაციით (გამყარებული)
        openLivePlayerEdit(team, p) {
            this.livePlayerEditModal.open = false;
            this.$nextTick(() => {
                this.livePlayerEditModal.team = team;
                this.livePlayerEditModal.id = p.id;
                this.livePlayerEditModal.num = p.num;
                this.livePlayerEditModal.name = p.name;
                this.livePlayerEditModal.open = true;
            });
        },
        saveLivePlayerEdit() {
            let list = this.livePlayerEditModal.team === 'home' ? this.match.homePlayers : this.match.awayPlayers;
            let p = list.find(x => x.id === this.livePlayerEditModal.id);
            if (p) {
                p.num = this.livePlayerEditModal.num.toString();
                p.name = this.livePlayerEditModal.name.toString().trim();
            }
            
            // ივენთებშიც სახელი განახლდეს
            this.match.events.forEach(ev => {
                if (ev.team === this.livePlayerEditModal.team) {
                    if (ev.playerNum == p.num) { ev.playerName = p.name; }
                    if (ev.type === 'sub') {
                        if (ev.playerOut && ev.playerOut.id === p.id) { ev.playerOut.num = p.num; ev.playerOut.name = p.name; }
                        if (ev.playerIn && ev.playerIn.id === p.id) { ev.playerIn.num = p.num; ev.playerIn.name = p.name; }
                    }
                }
            });

            // Alpine reactivity trigger
            if (this.livePlayerEditModal.team === 'home') {
                this.match.homePlayers = [...this.match.homePlayers];
            } else {
                this.match.awayPlayers = [...this.match.awayPlayers];
            }

            this.livePlayerEditModal.open = false; 
            this.saveState();
        },

        finishMatch() {
            if (!confirm('ნამდვილად გსურთ მატჩის დასრულება?')) return;
            if (this.match.timerInterval) clearInterval(this.match.timerInterval);
            let dateStr = new Date().toLocaleString('ka-GE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' });
            
            let finalTimer = this.match.timer;
            if (!this.match.isPaused && this.match.lastTick) finalTimer += Math.floor((Date.now() - this.match.lastTick) / 1000);

            let reportData = {
                timestamp: Date.now(), date: dateStr, homeName: this.match.homeName, awayName: this.match.awayName, 
                scoreHome: this.match.scoreHome, scoreAway: this.match.scoreAway,
                homePlayers: JSON.parse(JSON.stringify(this.match.homePlayers)),
                awayPlayers: JSON.parse(JSON.stringify(this.match.awayPlayers)),
                events: JSON.parse(JSON.stringify(this.match.events)),
                homeCoach: this.match.homeCoach, awayCoach: this.match.awayCoach,
                referees: JSON.parse(JSON.stringify(this.match.referees))
            };

            db.collection("matches").add(reportData).then(() => {
                if (this.matchId) db.collection("live_matches").doc(this.matchId).delete().catch(err => console.log(err));
                localStorage.removeItem('activeMatch'); localStorage.removeItem('activeMatchId');
                this.matchId = null; this.hasActiveMatch = false; this.view = 'history';
            }).catch(() => { alert("შეცდომა! შეამოწმეთ ინტერნეტი."); });
        },

        revertToLive(reportId) {
            let report = this.history.find(h => h.id === reportId);
            if(!report) return;
            if(confirm('ნამდვილად გსურთ მატჩის ლაივ რეჟიმში დაბრუნება? (ეს წაშლის რაპორტს ისტორიიდან)')) {
                let liveData = JSON.parse(JSON.stringify(report));
                delete liveData.id;
                liveData.isPaused = true;
                liveData.lastTick = null;
                liveData.displayTimer = liveData.timer || 0;
                
                this.matchId = 'match_' + Date.now();
                localStorage.setItem('activeMatchId', this.matchId);
                
                db.collection("matches").doc(reportId).delete().then(() => {
                    db.collection("live_matches").doc(this.matchId).set(liveData).then(() => {
                        this.match = liveData;
                        this.hasActiveMatch = true;
                        localStorage.setItem('activeMatch', JSON.stringify(liveData));
                        this.view = 'live';
                    });
                });
            }
        },

        viewReport(index) {
            this.currentReport = this.history[index];
            let stats = { home: { yellow:0, red:0, corner:0, offside:0, goals:[] }, away: { yellow:0, red:0, corner:0, offside:0, goals:[] } };
            
            this.currentReport.events.forEach(e => {
                if(e.type === 'yellow') stats[e.team].yellow++;
                if(e.type === 'red') stats[e.team].red++;
                if(e.type === 'corner') stats[e.team].corner++;
                if(e.type === 'offside') stats[e.team].offside++;
                
                if(e.type === 'goal' || e.type === 'penalty') stats[e.team].goals.push({ num: e.playerNum, player: '#' + e.playerNum + (e.playerName ? ' ' + e.playerName : ''), time: e.time });
                if(e.type === 'own_goal') {
                    let opp = e.team === 'home' ? 'away' : 'home';
                    stats[opp].goals.push({ num: e.playerNum, player: '#' + e.playerNum + (e.playerName ? ' ' + e.playerName : '') + ' (OG)', time: e.time });
                }
            });
            this.currentReport.stats = stats; this.view = 'report';
        },
        deleteReport(index) {
            if(confirm('ნამდვილად გსურთ ამ მატჩის ისტორიიდან წაშლა?')) {
                db.collection("matches").doc(this.history[index].id).delete();
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
