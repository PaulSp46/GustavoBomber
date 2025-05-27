// ==========================================
// CONFIGURAZIONE E VARIABILI GLOBALI
// ==========================================

/**
 * Configurazione principale del gioco
 * Contiene tutti i parametri di gameplay e networking
 */
const GAME_CONFIG = {
    ROWS: 16,                           // Numero di righe della griglia di gioco
    COLS: 27,                           // Numero di colonne della griglia di gioco
    ROCK_PROBABILITY: 0.3,              // Probabilità di generazione rocce casuali (30%)
    MAX_MOVES_PER_TURN: 3,              // Massimo numero di mosse per turno
    MAX_BOMBS_PER_TURN: 2,              // Massimo numero di bombe piazzabili per turno
    CONSTRUCTION_RANGE: 6,              // Raggio di costruzione muri per constructor
    BOMB_RANGE: 5,                      // Raggio di piazzamento bombe per bomber
    KNIFE_RANGE: 1,                     // Raggio di attacco coltello (adiacente)
    BOMB_TIMER: 3,                      // Timer iniziale delle bombe (turni)
    HEARTBEAT_INTERVAL: 30000,          // Intervallo heartbeat presenza (30s)
    RETRY_ATTEMPTS: 3,                  // Numero di tentativi per operazioni Firebase
    RETRY_DELAY: 1000,                  // Ritardo tra tentativi (1s)
    INITIALIZATION_TIMEOUT: 10000,      // Timeout inizializzazione gioco (10s)
    PLAYER_SYNC_TIMEOUT: 5000           // Timeout sincronizzazione giocatori (5s)
};

/**
 * Configurazione Firebase per database real-time
 * NOTA: In produzione spostare in variabili d'ambiente
 */
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAaFw4nAcPcFrrZACMcLoVc-0rPybpwyYU",
    authDomain: "maprace-68ba8.firebaseapp.com",
    databaseURL: "https://maprace-68ba8-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "maprace-68ba8",
    storageBucket: "maprace-68ba8.firebasestorage.app",
    messagingSenderId: "554782611402",
    appId: "1:554782611402:web:d70f20cfe3d2cff640e133"
};

// ==========================================
// CLASSE PRINCIPALE DEL GIOCO
// ==========================================

/**
 * Classe principale che gestisce tutto il gioco multiplayer
 * Include sistema di bandiere, costruzione, combattimento e networking
 */
class MultiplayerGame {
    constructor() {
        // ===== STATI DEL GIOCO =====
        this.gameState = {
            constructionMode: false,        // Modalità costruzione attiva
            bombMode: false,                // Modalità piazzamento bombe attiva
            knifeMode: false,              // Modalità attacco coltello attiva
            isBuilding: false,             // Flag per operazioni di costruzione
            gameStarted: false,            // Gioco iniziato
            gameEnded: false,              // Gioco terminato
            currentPlayerIndex: 0,         // Indice giocatore corrente
            currentMovesMade: 0,           // Mosse fatte nel turno corrente
            bombsPlacedThisTurn: 0,        // Bombe piazzate nel turno corrente
            updatingFromFirebase: false,   // Lock per evitare conflitti di sincronizzazione
            
            // ===== SISTEMA BANDIERE =====
            // Sistema principale di vittoria: cattura bandiera nemica e riportala alla base
            flagStatus: {
                top: { captured: false, capturedBy: null },      // Stato bandiera nord
                bottom: { captured: false, capturedBy: null }    // Stato bandiera sud
            }
        };

        // ===== DATI DEL GIOCATORE =====
        this.playerData = {
            currentRoom: null,      // Codice stanza corrente
            myPlayerId: null,       // ID univoco del giocatore
            myUsername: '',         // Nome utente
            myTeam: '',            // Team (top/bottom)
            myRole: ''             // Ruolo (bomber/constructor)
        };

        // ===== DATI DEL GIOCO =====
        this.gameData = {
            players: [],                // Array giocatori sincronizzato
            bombs: [],                  // Array bombe attive
            firebaseGameData: {}        // Dati completi da Firebase
        };

        // ===== NETWORKING E FIREBASE =====
        this.network = {
            database: null,             // Riferimento database Firebase
            presenceRef: null,          // Riferimento per sistema presenza
            gameListener: null,         // Listener per aggiornamenti gioco
            heartbeatInterval: null,    // Intervallo per heartbeat presenza
            isPageVisible: true,        // Stato visibilità pagina
            retryCount: 0              // Contatore tentativi connessione
        };

        // ===== INTERFACCIA UTENTE =====
        this.ui = {
            tbl: null                   // Riferimento tabella di gioco
        };

        // ===== BINDING METODI =====
        // Necessario per mantenere il contesto 'this' negli event handlers
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handlePageExit = this.handlePageExit.bind(this);
        this.syncGameState = this.syncGameState.bind(this);
    }

    // ==========================================
    // INIZIALIZZAZIONE PRINCIPALE
    // ==========================================

    /**
     * Inizializzazione principale del gioco
     * Sequenza: URL params → Firebase → Presenza → Sistema bandiere → Gioco
     */
    async initialize() {
        try {
            console.log("🎮 Inizializzando gioco multiplayer...");
            
            // 1. Estrai e valida parametri URL (roomCode, playerId, etc.)
            const params = this.getAndValidateUrlParams();
            if (!params) return false;

            this.setPlayerData(params);

            // 2. Inizializza connessione Firebase
            if (!await this.initFirebase()) {
                this.showError('Impossibile connettersi ai server di gioco');
                return false;
            }

            // 3. Setup sistemi di base
            this.setupPresenceSystem();        // Sistema presenza online/offline
            this.setupBrowserEvents();         // Gestione eventi browser
            
            // 4. Inizializza componenti di gioco
            this.initializeFlagSystem();       // Sistema bandiere (CORE FEATURE)
            await this.initializeGame();       // Inizializzazione principale
            
            return true;
        } catch (error) {
            console.error('❌ Errore inizializzazione:', error);
            this.showError('Errore durante l\'inizializzazione del gioco');
            return false;
        }
    }

    // ==========================================
    // SISTEMA BANDIERE (FEATURE PRINCIPALE)
    // ==========================================

    /**
     * Inizializza il sistema delle bandiere
     * Le bandiere sono l'obiettivo principale: cattura quella nemica e riportala alla tua base
     */
    initializeFlagSystem() {
        // Stato iniziale: entrambe le bandiere libere
        this.gameState.flagStatus = {
            top: { captured: false, capturedBy: null },      // Bandiera nord (posizione 0,13)
            bottom: { captured: false, capturedBy: null }    // Bandiera sud (posizione 15,13)
        };
        
        console.log('🏁 Sistema bandiere inizializzato');
    }

    /**
     * Estrae e valida parametri URL necessari per il gioco
     * Parametri richiesti: roomCode, playerId, username
     * Parametri opzionali: team, role, gameStarted
     */
    getAndValidateUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {
            roomCode: urlParams.get('roomCode'),        // Codice stanza univoco
            playerId: urlParams.get('playerId'),        // ID giocatore Firebase
            username: urlParams.get('username'),        // Nome visualizzato
            team: urlParams.get('team'),               // top/bottom
            role: urlParams.get('role'),               // bomber/constructor
            gameStarted: urlParams.get('gameStarted')   // Flag partita avviata
        };

        console.log('🔍 Parametri URL ricevuti:', params);

        // ===== VALIDAZIONE PARAMETRI ESSENZIALI =====
        if (!params.roomCode || !params.playerId || !params.username) {
            console.error('❌ Parametri URL mancanti:', {
                hasRoomCode: !!params.roomCode,
                hasPlayerId: !!params.playerId,
                hasUsername: !!params.username
            });
            this.showError('Parametri mancanti. La sessione potrebbe essere scaduta.');
            return null;
        }

        // ===== VALIDAZIONE FORMATO =====
        // Codice stanza deve essere 4-10 caratteri
        if (params.roomCode.length < 4 || params.roomCode.length > 10) {
            console.error('❌ Codice stanza non valido:', params.roomCode);
            this.showError('Codice stanza non valido');
            return null;
        }

        // Username deve essere 2-20 caratteri
        if (params.username.length < 2 || params.username.length > 20) {
            console.error('❌ Nome utente non valido:', params.username);
            this.showError('Nome utente non valido');
            return null;
        }

        // ===== PARAMETRI OPZIONALI =====
        // Team e ruolo potrebbero essere recuperati dal database se mancanti
        if (!params.team || !params.role) {
            console.warn('⚠️ Team o ruolo mancanti dai parametri URL:', {
                team: params.team,
                role: params.role
            });
        }

        return params;
    }

    /**
     * Imposta i dati del giocatore corrente dai parametri validati
     */
    setPlayerData(params) {
        this.playerData.currentRoom = params.roomCode;
        this.playerData.myPlayerId = params.playerId;
        this.playerData.myUsername = params.username;
        this.playerData.myTeam = params.team || '';
        this.playerData.myRole = params.role || '';

        // Log informazioni giocatore per debug
        console.log(`🎯 Stanza: ${this.playerData.currentRoom}`);
        console.log(`👤 Giocatore: ${this.playerData.myUsername} (${this.playerData.myPlayerId})`);
        console.log(`🏢 Team: ${this.playerData.myTeam}, Ruolo: ${this.playerData.myRole}`);
    }

    /**
     * Inizializza connessione Firebase
     * Configura database real-time per sincronizzazione multiplayer
     */
    async initFirebase() {
        try {
            // Verifica che Firebase sia caricato
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase non caricato');
            }

            // Inizializza app Firebase con configurazione
            const app = firebase.initializeApp(FIREBASE_CONFIG);
            this.network.database = firebase.database();
            
            console.log('✅ Firebase inizializzato per il gioco');
            return true;
        } catch (error) {
            console.error('❌ Errore inizializzazione Firebase:', error);
            return false;
        }
    }

    // ==========================================
    // SISTEMA DI PRESENZA E NETWORKING
    // ==========================================

    /**
     * Setup sistema di presenza per tracking giocatori online/offline
     * Utilizza heartbeat e detection disconnessione automatica
     */
    setupPresenceSystem() {
        if (!this.network.database || !this.playerData.currentRoom || !this.playerData.myPlayerId) {
            return;
        }

        try {
            // Riferimento presenza specifica per questo giocatore
            this.network.presenceRef = this.network.database.ref(
                `games/${this.playerData.currentRoom}/players/${this.playerData.myPlayerId}/presence`
            );
            
            // Marca come online all'ingresso
            this.network.presenceRef.set({
                online: true,
                lastSeen: Date.now()
            });

            // ===== GESTIONE DISCONNESSIONE =====
            // Quando si disconnette, marca come offline (NON elimina il giocatore)
            this.network.presenceRef.onDisconnect().update({
                online: false,
                lastSeen: Date.now()
            });

            // ===== HEARTBEAT PERIODICO =====
            // Aggiorna presenza ogni 30 secondi se la pagina è visibile
            this.network.heartbeatInterval = setInterval(() => {
                if (this.network.isPageVisible && this.network.database && this.network.presenceRef) {
                    this.network.presenceRef.update({
                        online: true,
                        lastSeen: Date.now()
                    }).catch(error => {
                        console.error('❌ Errore heartbeat:', error);
                    });
                }
            }, GAME_CONFIG.HEARTBEAT_INTERVAL);

            console.log('✅ Sistema di presenza configurato');
        } catch (error) {
            console.error('❌ Errore setup presenza:', error);
        }
    }

    /**
     * Setup listener per cambiamenti di stato del gioco
     * Sincronizza automaticamente tutti i cambiamenti da Firebase
     */
    setupGameStateListener() {
        // Rimuovi listener precedente se esiste
        if (this.network.gameListener) {
            this.network.gameListener.off();
        }

        const gameRef = this.network.database.ref(`games/${this.playerData.currentRoom}`);
        
        // ===== LISTENER PRINCIPALE =====
        // Si attiva ad ogni cambiamento nei dati del gioco
        this.network.gameListener = gameRef.on('value', async (snapshot) => {
            const gameData = snapshot.val();
            
            // Gestione gioco non esistente
            if (!gameData) {
                console.log('⚠️ Gioco non esistente, tornando alla lobby...');
                this.handleGameNotFound();
                return;
            }

            // Sincronizzazione stato completo
            this.gameData.firebaseGameData = gameData;
            await this.syncGameState(gameData);
        });
    }

    /**
     * Gestisce il caso in cui il gioco non esista più
     * Chiede conferma prima di reindirizzare alla lobby
     */
    async handleGameNotFound() {
        const confirmed = await this.showConfirmDialog(
            'La partita è stata chiusa o non esiste più. Tornare alla lobby?',
            'Partita non trovata'
        );
        
        if (confirmed) {
            this.cleanup();
            window.location.href = '../index.html';
        }
    }

    // ==========================================
    // SINCRONIZZAZIONE STATO GIOCO
    // ==========================================

    /**
     * Sincronizza lo stato locale con i dati da Firebase
     * Questa è la funzione CORE per il multiplayer - gestisce tutti gli aggiornamenti
     */
    async syncGameState(gameData) {
        // ===== PREVENZIONE RACE CONDITIONS =====
        if (this.gameState.updatingFromFirebase) return;
        this.gameState.updatingFromFirebase = true;

        try {
            // ===== VALIDAZIONE DATI =====
            if (!this.validateGameData(gameData)) {
                console.warn('⚠️ Dati gioco non validi, richiedendo re-sync...');
                await this.requestGameSync();
                return;
            }

            // ===== CONTROLLO FINE GIOCO =====
            if (gameData.winner && !this.gameState.gameEnded) {
                this.gameState.gameEnded = true;
                this.showVictoryScreen(gameData.winner);
                return;
            }

            // ===== SINCRONIZZAZIONE COMPONENTI =====
            
            // Sincronizza giocatori (posizioni, stato, bandiere)
            if (gameData.players) {
                this.syncPlayers(gameData.players);
            }

            // Sincronizza stato turno corrente
            if (gameData.gameState) {
                this.gameState.currentPlayerIndex = gameData.gameState.currentPlayerIndex || 0;
                this.gameState.currentMovesMade = gameData.gameState.currentMovesMade || 0;
                this.gameState.bombsPlacedThisTurn = gameData.gameState.bombsPlacedThisTurn || 0;
            }

            // Sincronizza bombe attive con timer
            if (gameData.bombs) {
                this.syncBombs(gameData.bombs);
            }

            // Sincronizza rocce (muri distruggibili)
            if (gameData.gameBoard && gameData.gameBoard.rocks) {
                this.syncRocks(gameData.gameBoard.rocks);
            }

            // ===== AGGIORNAMENTO INTERFACCIA =====
            this.updatePlayerPositions();       // Posizioni giocatori sulla griglia
            this.updateTurnIndicator();         // Indicatore turno corrente
            this.setupPlayerControls();        // Controlli basati su ruolo/turno
            this.updateFlagDisplay();          // IMPORTANTE: Display stato bandiere

            console.log('🔄 Stato gioco sincronizzato da Firebase');
        } catch (error) {
            console.error('❌ Errore sincronizzazione:', error);
        } finally {
            // ===== RILASCIO LOCK =====
            this.gameState.updatingFromFirebase = false;
        }
    }

    /**
     * Valida l'integrità dei dati ricevuti da Firebase
     * Previene errori da dati corrotti o incompleti
     */
    validateGameData(gameData) {
        if (!gameData || !gameData.players) {
            return false;
        }

        // Verifica che tutti i giocatori abbiano proprietà essenziali
        const players = Object.values(gameData.players);
        for (const player of players) {
            if (!player.username || player.row === undefined || player.col === undefined) {
                return false;
            }
        }

        return true;
    }

    /**
     * Richiede una nuova sincronizzazione in caso di dati corrotti
     */
    async requestGameSync() {
        try {
            // Attesa prima di ri-sincronizzare
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const gameRef = this.network.database.ref(`games/${this.playerData.currentRoom}`);
            const snapshot = await gameRef.once('value');
            const gameData = snapshot.val();
            
            if (gameData) {
                await this.syncGameState(gameData);
            }
        } catch (error) {
            console.error('❌ Errore re-sync:', error);
        }
    }

    /**
     * Sincronizza array giocatori da Firebase al formato locale
     * Gestisce team, posizioni, bandiere e stato vitale
     */
    syncPlayers(firebasePlayers) {
        // Converte oggetto Firebase in array locale con ID numerici
        const playersArray = Object.entries(firebasePlayers).map(([id, player]) => ({
            id: this.gameData.players.findIndex(p => p.firebaseId === id) + 1 || this.gameData.players.length + 1,
            firebaseId: id,              // ID Firebase originale
            name: player.username,       // Nome visualizzato
            row: player.row || 0,        // Posizione Y
            col: player.col || 0,        // Posizione X
            role: player.role,           // bomber/constructor
            team: player.team,           // top/bottom
            hasFlag: player.hasFlag || false,    // IMPORTANTE: Ha una bandiera
            active: player.active || false,      // È il turno di questo giocatore
            isAlive: player.isAlive !== false    // È vivo (default true)
        }));

        // ===== ORDINAMENTO GIOCATORI =====
        // Prima team top, poi team bottom, poi per ordine di arrivo
        playersArray.sort((a, b) => {
            if (a.team === 'top' && b.team === 'bottom') return -1;
            if (a.team === 'bottom' && b.team === 'top') return 1;
            return a.joinedAt - b.joinedAt;
        });

        this.gameData.players = playersArray;
    }

    /**
     * Sincronizza bombe attive con timer aggiornati
     */
    syncBombs(firebaseBombs) {
        this.gameData.bombs = Array.isArray(firebaseBombs) ? firebaseBombs : [];
        this.updateBombsDisplay();  // Aggiorna visualizzazione con timer
    }

    /**
     * Sincronizza rocce/muri sulla griglia
     */
    syncRocks(firebaseRocks) {
        // ===== PULIZIA ROCCE ESISTENTI =====
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                this.ui.tbl.rows[i].cells[j].classList.remove("rock-cell");
            }
        }

        // ===== APPLICAZIONE NUOVE ROCCE =====
        if (Array.isArray(firebaseRocks)) {
            firebaseRocks.forEach(rock => {
                // Verifica bounds per sicurezza
                if (rock.row >= 0 && rock.row < GAME_CONFIG.ROWS && 
                    rock.col >= 0 && rock.col < GAME_CONFIG.COLS) {
                    this.ui.tbl.rows[rock.row].cells[rock.col].classList.add("rock-cell");
                }
            });
        }
    }

    // ==========================================
    // INIZIALIZZAZIONE GIOCO AVANZATA
    // ==========================================

    /**
     * Inizializzazione completa del gioco
     * Sequenza: Presenza → Attesa giocatori → Inizializzazione stato → UI
     */
    async initializeGame() {
        try {
            // 1. Registra questo giocatore nel database
            await this.registerPlayerPresence();
            
            // 2. Attendi che tutti i giocatori siano pronti
            const gameData = await this.waitForGameReadiness();
            
            // 3. Inizializza stato di gioco (solo un giocatore lo fa)
            await this.safeInitializeGameState(gameData);
            
            // 4. Setup interfaccia e listener
            this.setupGameStateListener();                              // Listener aggiornamenti
            this.makeMap("mapcontent", GAME_CONFIG.ROWS, GAME_CONFIG.COLS); // Griglia di gioco
            
            // 5. Mostra interfaccia e avvia gioco
            document.getElementById('contentbox').style.display = 'flex';
            this.gameState.gameStarted = true;
            this.hideLoadingScreen();

            console.log('✅ Gioco inizializzato con successo');
        } catch (error) {
            console.error('❌ Errore inizializzazione gioco:', error);
            this.showError('Errore durante l\'inizializzazione del gioco');
        }
    }

    /**
     * Registra la presenza del giocatore nel database
     * Preserva dati esistenti se il giocatore era già presente
     */
    async registerPlayerPresence() {
        try {
            console.log('📝 Registrazione presenza giocatore...');
            
            // Riferimento al giocatore nel database
            const playerRef = this.network.database.ref(
                `games/${this.playerData.currentRoom}/players/${this.playerData.myPlayerId}`
            );
            
            // ===== CONTROLLO GIOCATORE ESISTENTE =====
            const existingSnapshot = await playerRef.once('value');
            const existingPlayer = existingSnapshot.val();
            
            // Helper per evitare valori undefined che causano errori Firebase
            const safeValue = (value, defaultValue) => value !== undefined && value !== null ? value : defaultValue;
            
            // ===== PRESERVAZIONE DATI ESISTENTI =====
            const preservedData = {
                username: safeValue(existingPlayer?.username, this.playerData.myUsername),
                team: safeValue(existingPlayer?.team, this.playerData.myTeam),
                role: safeValue(existingPlayer?.role, this.playerData.myRole),
                joinedAt: safeValue(existingPlayer?.joinedAt, Date.now()),
                hasFlag: safeValue(existingPlayer?.hasFlag, false),      // IMPORTANTE: Stato bandiera
                active: safeValue(existingPlayer?.active, false),        // Turno attivo
                isAlive: safeValue(existingPlayer?.isAlive, true),       // Stato vitale
                presence: {
                    online: true,
                    lastSeen: Date.now()
                }
            };

            // ===== PRESERVAZIONE POSIZIONE =====
            // Solo se il giocatore aveva già una posizione valida
            if (existingPlayer && 
                typeof existingPlayer.row === 'number' && 
                typeof existingPlayer.col === 'number') {
                preservedData.row = existingPlayer.row;
                preservedData.col = existingPlayer.col;
            }
            // Altrimenti la posizione sarà impostata durante l'inizializzazione

            console.log('📋 Dati giocatore da salvare:', preservedData);

            // Salvataggio atomico dei dati giocatore
            await playerRef.set(preservedData);

            console.log('✅ Presenza giocatore registrata con successo');
        } catch (error) {
            console.error('❌ Errore registrazione presenza:', error);
            throw error;
        }
    }

    /**
     * Attende che il gioco sia pronto per l'inizializzazione
     * Verifica che tutti i giocatori attesi siano presenti
     */
    async waitForGameReadiness() {
        const timeout = Date.now() + GAME_CONFIG.INITIALIZATION_TIMEOUT;
        
        while (Date.now() < timeout) {
            try {
                const gameRef = this.network.database.ref(`games/${this.playerData.currentRoom}`);
                const snapshot = await gameRef.once('value');
                const gameData = snapshot.val();

                if (!gameData) {
                    throw new Error('Dati gioco non trovati');
                }

                // ===== GIOCO GIÀ INIZIALIZZATO =====
                if (gameData.gameState && gameData.gameState.gameStarted) {
                    console.log('✅ Gioco già inizializzato, usando dati esistenti');
                    return gameData;
                }

                // ===== VERIFICA GIOCATORI PRESENTI =====
                const expectedPlayerCount = gameData.playerCount || Object.keys(gameData.players || {}).length;
                const currentPlayerCount = Object.keys(gameData.players || {}).length;

                console.log(`🔄 Giocatori presenti: ${currentPlayerCount}/${expectedPlayerCount}`);

                // Tutti i giocatori sono presenti
                if (currentPlayerCount >= expectedPlayerCount && expectedPlayerCount >= 2) {
                    console.log('✅ Tutti i giocatori sono presenti, procedendo con l\'inizializzazione');
                    return gameData;
                }

                // ===== TIMEOUT PARZIALE =====
                // Se aspettiamo da troppo con almeno 2 giocatori, procediamo
                const waitingTime = Date.now() - (gameData.gameStartedFinal || Date.now());
                if (waitingTime > 5000 && currentPlayerCount >= 2) {
                    console.log(`⏰ Timeout attesa giocatori (${waitingTime}ms), procedendo con ${currentPlayerCount} giocatori`);
                    return gameData;
                }

                // Attesa prima del prossimo controllo
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn('⚠️ Errore durante attesa:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error('Timeout: Non tutti i giocatori sono stati caricati');
    }

    /**
     * Ottiene il numero di giocatori attesi dal database del gioco
     */
    async getExpectedPlayerCount() {
        try {
            const gameRef = this.network.database.ref(`games/${this.playerData.currentRoom}`);
            const snapshot = await gameRef.once('value');
            const gameData = snapshot.val();
            
            if (gameData && gameData.players) {
                const playerCount = Object.keys(gameData.players).length;
                console.log(`🔍 Trovati ${playerCount} giocatori nel database del gioco`);
                return playerCount;
            }
            
            // Fallback da metadati
            if (gameData && gameData.playerCount) {
                console.log(`🔍 Numero giocatori da metadati: ${gameData.playerCount}`);
                return gameData.playerCount;
            }
            
            // Fallback minimo
            console.warn('⚠️ Non riesco a determinare il numero esatto di giocatori, usando fallback: 2');
            return 2;
        } catch (error) {
            console.warn('⚠️ Errore nel determinare il numero di giocatori attesi:', error);
            return 2;
        }
    }

    /**
     * Inizializzazione sicura dello stato di gioco usando lock distribuito
     * Solo un giocatore alla volta può inizializzare per evitare conflitti
     */
    async safeInitializeGameState(gameData) {
        // ===== CONTROLLO INIZIALIZZAZIONE ESISTENTE =====
        if (gameData.gameState && gameData.gameState.gameStarted) {
            console.log('✅ Gioco già inizializzato');
            return;
        }

        // ===== LOCK DISTRIBUITO =====
        // Usa transazione Firebase per acquisire lock atomico
        const lockRef = this.network.database.ref(
            `games/${this.playerData.currentRoom}/initializationLock`
        );

        try {
            // Tentativo di acquisizione lock
            const lockResult = await lockRef.transaction((currentValue) => {
                if (currentValue === null) {
                    // Lock libero, lo acquisiamo
                    return {
                        playerId: this.playerData.myPlayerId,
                        timestamp: Date.now()
                    };
                }
                // Lock già acquisito, fallisce
                return undefined;
            });

            if (lockResult.committed) {
                // ===== INIZIALIZZAZIONE AUTORIZZATA =====
                console.log('🔒 Lock acquisito, inizializzando gioco...');
                await this.initializeGameState(gameData);
                
                // Rilascio lock
                await lockRef.remove();
                console.log('🔓 Lock rilasciato');
            } else {
                // ===== ATTESA INIZIALIZZAZIONE =====
                console.log('⏳ Un altro giocatore sta inizializzando...');
                await this.waitForInitialization();
            }
        } catch (error) {
            console.error('❌ Errore durante acquisizione lock:', error);
            // Pulizia lock in caso di errore
            await lockRef.remove();
            throw error;
        }
    }

    /**
     * Attende che l'inizializzazione sia completata da un altro giocatore
     */
    async waitForInitialization() {
        const timeout = Date.now() + GAME_CONFIG.INITIALIZATION_TIMEOUT;
        
        while (Date.now() < timeout) {
            try {
                const gameRef = this.network.database.ref(`games/${this.playerData.currentRoom}/gameState`);
                const snapshot = await gameRef.once('value');
                const gameState = snapshot.val();

                if (gameState && gameState.gameStarted) {
                    console.log('✅ Inizializzazione completata da altro giocatore');
                    return;
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn('⚠️ Errore durante attesa inizializzazione:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error('Timeout: Inizializzazione non completata');
    }

    /**
     * Inizializza lo stato completo del gioco
     * Imposta posizioni iniziali, genera rocce, configura bandiere
     */
    async initializeGameState(gameData) {
        try {
            const players = gameData.players || {};
            const playersArray = Object.entries(players);
            
            const updatedPlayers = {};
            let playerIndex = 0;
            let topCount = 0;        // Contatore giocatori team nord
            let bottomCount = 0;     // Contatore giocatori team sud

            // ===== POSIZIONAMENTO INIZIALE GIOCATORI =====
            playersArray.forEach(([id, player]) => {
                let position = { row: 0, col: 0 };
                
                // Posizioni fisse per team
                if (player.team === 'top') {
                    // Team nord: posizioni (0,12) e (0,14)
                    position = topCount === 0 ? { row: 0, col: 12 } : { row: 0, col: 14 };
                    topCount++;
                } else if (player.team === 'bottom') {
                    // Team sud: posizioni (15,12) e (15,14)
                    position = bottomCount === 0 ? { row: 15, col: 12 } : { row: 15, col: 14 };
                    bottomCount++;
                }

                // Configurazione iniziale giocatore
                updatedPlayers[id] = {
                    ...player,
                    row: position.row,
                    col: position.col,
                    hasFlag: false,                    // IMPORTANTE: Nessuno ha bandiere all'inizio
                    active: playerIndex === 0,         // Solo il primo giocatore inizia
                    isAlive: true                      // Tutti vivi all'inizio
                };
                playerIndex++;
            });

            // ===== GENERAZIONE ROCCE CASUALI =====
            const rocks = this.generateRandomRocks();

            // ===== SALVATAGGIO ATOMICO STATO INIZIALE =====
            await this.network.database.ref(`games/${this.playerData.currentRoom}`).update({
                players: updatedPlayers,
                gameState: {
                    currentPlayerIndex: 0,
                    currentMovesMade: 0,
                    bombsPlacedThisTurn: 0,
                    gameStarted: true
                },
                bombs: [],                              // Nessuna bomba iniziale
                gameBoard: {
                    rocks: rocks,
                    // ===== CONFIGURAZIONE BANDIERE =====
                    flags: {
                        top: { row: 0, col: 13, captured: false, capturedBy: null },      // Bandiera nord
                        bottom: { row: 15, col: 13, captured: false, capturedBy: null }   // Bandiera sud
                    }
                },
                winner: null                            // Nessun vincitore iniziale
            });

            console.log('🎮 Stato del gioco inizializzato');
        } catch (error) {
            console.error('❌ Errore inizializzazione stato gioco:', error);
            throw error;
        }
    }

    /**
     * Genera rocce casuali sulla mappa
     * Evita posizioni di spawn e bandiere
     */
    generateRandomRocks() {
        const rocks = [];
        
        // Itera su tutte le posizioni (escluse prima e ultima riga)
        for (let i = 1; i < GAME_CONFIG.ROWS - 1; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                // ===== ZONE PROTETTE =====
                // Evita posizioni di spawn giocatori e bandiere
                if ((i === 1 && (j === 12 || j === 13 || j === 14)) || 
                    (i === 14 && (j === 12 || j === 13 || j === 14))) {
                    continue;
                }
                
                // Generazione casuale basata su probabilità
                if (Math.random() < GAME_CONFIG.ROCK_PROBABILITY) {
                    rocks.push({ row: i, col: j });
                }
            }
        }
        return rocks;
    }

    // ==========================================
    // GESTIONE MOVIMENTO E AZIONI CON BANDIERE
    // ==========================================

    /**
     * Verifica se è il turno del giocatore corrente
     */
    isMyTurn() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        return currentPlayer && currentPlayer.firebaseId === this.playerData.myPlayerId;
    }

    /**
     * Gestisce input da tastiera per movimento e azioni
     * WASD = movimento, Spazio = fine turno
     */
    handleKeyPress(e) {
        // ===== CONTROLLI PRELIMINARI =====
        if (!this.gameState.gameStarted || this.gameState.gameEnded || !this.isMyTurn() || 
            this.gameState.constructionMode || this.gameState.bombMode || this.gameState.knifeMode) {
            return;
        }

        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        if (!currentPlayer || !currentPlayer.isAlive) return;

        // ===== FINE TURNO MANUALE =====
        if (e.key.toLowerCase() === ' ') {
            this.endTurn();
            return;
        }

        // ===== LIMITE MOSSE PER TURNO =====
        if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) return;

        // ===== CALCOLO NUOVA POSIZIONE =====
        let newRow = currentPlayer.row;
        let newCol = currentPlayer.col;
        
        switch(e.key.toLowerCase()) {
            case 'w': newRow--; break;      // Su
            case 'a': newCol--; break;      // Sinistra
            case 's': newRow++; break;      // Giù
            case 'd': newCol++; break;      // Destra
            default: return;                // Tasto non riconosciuto
        }
        
        // ===== VALIDAZIONE E MOVIMENTO =====
        if (!this.isValidMove(newRow, newCol)) return;
        this.updatePlayerPosition(newRow, newCol);
    }

    /**
     * Verifica se una mossa è valida
     * Controlla bounds, ostacoli, altri giocatori
     */
    isValidMove(newRow, newCol) {
        // ===== CONTROLLO BOUNDS =====
        if (newRow < 0 || newRow >= GAME_CONFIG.ROWS || newCol < 0 || newCol >= GAME_CONFIG.COLS) {
            return false;
        }
        
        // ===== CONTROLLO OSTACOLI =====
        let targetCell = this.ui.tbl.rows[newRow].cells[newCol];
        if (targetCell.classList.contains("rock-cell") || targetCell.classList.contains("bomb-cell")) {
            return false;
        }
        
        // ===== CONTROLLO COLLISIONE GIOCATORI =====
        const cellHasPlayer = this.gameData.players.some(p => 
            p.row === newRow && p.col === newCol && p.isAlive
        );
        return !cellHasPlayer;
    }

    /**
     * FUNZIONE CORE: Aggiorna posizione giocatore con logica bandiere
     * Gestisce cattura bandiera nemica e consegna alla base per vittoria
     */
    async updatePlayerPosition(newRow, newCol) {
        try {
            const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
            const targetCell = this.ui.tbl.rows[newRow].cells[newCol];
            
            let hasFlag = currentPlayer.hasFlag;
            let flagUpdate = {};
            
            console.log(`🎯 Giocatore ${currentPlayer.name} (${currentPlayer.team}) si muove a (${newRow}, ${newCol})`);
            
            // ===== LOGICA CATTURA BANDIERA =====
            if (!hasFlag && targetCell.classList.contains('flag-cell')) {
                const flagType = targetCell.dataset.flagType;
                
                // ===== REGOLA: Può catturare solo la bandiera NEMICA =====
                if ((currentPlayer.team === 'bottom' && flagType === 'top') || 
                    (currentPlayer.team === 'top' && flagType === 'bottom')) {
                    
                    // Verifica che la bandiera sia ancora libera
                    const flagData = this.gameData.firebaseGameData?.gameBoard?.flags?.[flagType];
                    if (!flagData?.captured) {
                        hasFlag = true;
                        flagUpdate[`gameBoard/flags/${flagType}/captured`] = true;
                        flagUpdate[`gameBoard/flags/${flagType}/capturedBy`] = this.playerData.myPlayerId;
                        flagUpdate[`gameBoard/flags/${flagType}/capturedAt`] = Date.now();
                        
                        console.log(`🏁 ${currentPlayer.name} ha catturato la bandiera ${flagType}!`);
                        this.showFlagCaptureNotification(flagType, currentPlayer.team);
                    }
                }
            }
            
            // ===== LOGICA CONSEGNA BANDIERA (VITTORIA!) =====
            else if (hasFlag && targetCell.classList.contains('flag-cell')) {
                const flagType = targetCell.dataset.flagType;
                
                // ===== REGOLA: Può consegnare solo alla PROPRIA base =====
                if ((currentPlayer.team === 'bottom' && flagType === 'bottom') || 
                    (currentPlayer.team === 'top' && flagType === 'top')) {
                    
                    console.log(`🏆 ${currentPlayer.name} ha consegnato la bandiera alla base ${flagType}!`);
                    
                    // ===== VITTORIA IMMEDIATA! =====
                    await this.network.database.ref(`games/${this.playerData.currentRoom}/winner`).set(currentPlayer.team);
                    this.showVictoryByFlag(currentPlayer.team, currentPlayer.name);
                    return; // Esci immediatamente per evitare ulteriori aggiornamenti
                }
            }

            // ===== AGGIORNAMENTO POSIZIONE E STATO =====
            const updates = {
                [`players/${this.playerData.myPlayerId}/row`]: newRow,
                [`players/${this.playerData.myPlayerId}/col`]: newCol,
                [`players/${this.playerData.myPlayerId}/hasFlag`]: hasFlag,
                [`gameState/currentMovesMade`]: this.gameState.currentMovesMade + 1,
                ...flagUpdate    // Include aggiornamenti bandiere se presenti
            };

            // Aggiornamento atomico su Firebase
            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

            // Aggiorna interfaccia bandiere
            this.updateFlagDisplay();

            // ===== AUTO-FINE TURNO =====
            // Finisce automaticamente il turno dopo il massimo delle mosse
            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                setTimeout(() => this.endTurn(), 500);
            }

        } catch (error) {
            console.error('❌ Errore aggiornamento posizione:', error);
            this.showError('Errore durante il movimento');
        }
    }

    /**
     * Termina il turno corrente e passa al giocatore successivo
     * Processa esplosioni bombe e trova prossimo giocatore vivo
     */
    async endTurn() {
        if (!this.isMyTurn()) return;

        try {
            // ===== RESET MODALITÀ SPECIALI =====
            this.resetModes();

            // ===== PROCESSAMENTO BOMBE =====
            // Le bombe esplodono/decrementano timer alla fine di ogni turno
            await this.processBombExplosions();

            // ===== RICERCA PROSSIMO GIOCATORE VIVO =====
            const nextPlayerIndex = this.findNextAlivePlayer(this.gameState.currentPlayerIndex);
            
            if (nextPlayerIndex === -1) {
                // Nessun giocatore vivo rimasto = pareggio
                await this.network.database.ref(`games/${this.playerData.currentRoom}/winner`).set('draw');
                return;
            }

            // ===== AGGIORNAMENTO ATOMICO TURNO =====
            const updates = {
                'gameState/currentPlayerIndex': nextPlayerIndex,
                'gameState/currentMovesMade': 0,           // Reset mosse
                'gameState/bombsPlacedThisTurn': 0        // Reset bombe piazzate
            };

            // Aggiorna flag 'active' per tutti i giocatori
            this.gameData.players.forEach((player, index) => {
                updates[`players/${player.firebaseId}/active`] = index === nextPlayerIndex;
            });

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

        } catch (error) {
            console.error('❌ Errore fine turno:', error);
            this.showError('Errore durante il cambio turno');
        }
    }

    /**
     * Reset di tutte le modalità speciali (costruzione, bomba, coltello)
     */
    resetModes() {
        if (this.gameState.constructionMode) {
            this.gameState.constructionMode = false;
            this.clearBuildableHighlights();
        }
        if (this.gameState.bombMode) {
            this.gameState.bombMode = false;
            this.clearBombTargets();
        }
        if (this.gameState.knifeMode) {
            this.gameState.knifeMode = false;
            this.clearKnifeTargets();
        }
    }

    /**
     * Trova il prossimo giocatore vivo per il turno successivo
     */
    findNextAlivePlayer(startIndex) {
        let index = startIndex;
        let attempts = 0;
        
        do {
            index = (index + 1) % this.gameData.players.length;
            attempts++;
            
            // Prevenzione loop infinito
            if (attempts > this.gameData.players.length) {
                return -1;
            }
            
            if (this.gameData.players[index] && this.gameData.players[index].isAlive) {
                return index;
            }
        } while (index !== startIndex);
        
        return -1; // Nessun giocatore vivo trovato
    }

    // ==========================================
    // SISTEMA BOMBE CON GESTIONE BANDIERE
    // ==========================================

    /**
     * Processa esplosioni delle bombe e decrementa timer
     * IMPORTANTE: Gestisce anche perdita bandiere per giocatori colpiti
     */
    async processBombExplosions() {
        // ===== IDENTIFICAZIONE BOMBE CHE ESPLODONO =====
        const explodingBombs = this.gameData.bombs.filter(bomb => bomb.timer <= 1);
        
        // ===== SOLO DECREMENTO TIMER =====
        if (explodingBombs.length === 0) {
            const updatedBombs = this.gameData.bombs
                .map(bomb => ({
                    ...bomb,
                    timer: bomb.timer - 1    // Decrementa timer
                }))
                .filter(bomb => bomb.timer > 0);  // Rimuovi bombe con timer 0
            
            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}/bombs`).set(updatedBombs);
            });
            return;
        }

        try {
            console.log(`💥 ${explodingBombs.length} bombe stanno esplodendo!`);
            
            // ===== PREVIEW ESPLOSIONE =====
            this.showExplosionPreview(explodingBombs);
            await new Promise(resolve => setTimeout(resolve, 800));  // Attesa drammatica
            
            let playerUpdates = {};
            let playersKilled = [];
            let updatedRocks = [...(this.gameData.firebaseGameData.gameBoard?.rocks || [])];
            let explosionCells = new Set();

            // ===== PROCESSAMENTO ESPLOSIONI =====
            for (const bomb of explodingBombs) {
                console.log(`💣 Esplosione bomba a (${bomb.row}, ${bomb.col})`);
                
                // ===== AREA ESPLOSIONE 3x3 =====
                for (let i = Math.max(0, bomb.row - 1); i <= Math.min(GAME_CONFIG.ROWS - 1, bomb.row + 1); i++) {
                    for (let j = Math.max(0, bomb.col - 1); j <= Math.min(GAME_CONFIG.COLS - 1, bomb.col + 1); j++) {
                        
                        explosionCells.add(`${i}-${j}`);
                        
                        // ===== DISTRUZIONE ROCCE =====
                        const rockIndex = updatedRocks.findIndex(rock => rock.row === i && rock.col === j);
                        if (rockIndex !== -1) {
                            updatedRocks.splice(rockIndex, 1);
                            console.log(`🪨 Roccia distrutta a (${i}, ${j})`);
                        }

                        // ===== DANNO AI GIOCATORI =====
                        const playerHit = this.gameData.players.find(p => 
                            p.row === i && p.col === j && p.isAlive
                        );
                        
                        if (playerHit && !playersKilled.includes(playerHit.firebaseId)) {
                            playersKilled.push(playerHit.firebaseId);
                            
                            // Posizione di respawn basata su team
                            let spawnPos = this.getSpawnPosition(playerHit.team, playerHit.firebaseId);
                            
                            // Aggiornamenti giocatore colpito
                            playerUpdates[`players/${playerHit.firebaseId}/isAlive`] = false;
                            playerUpdates[`players/${playerHit.firebaseId}/row`] = spawnPos.row;
                            playerUpdates[`players/${playerHit.firebaseId}/col`] = spawnPos.col;
                            playerUpdates[`players/${playerHit.firebaseId}/hasFlag`] = false;
                            
                            console.log(`💀 Giocatore ${playerHit.name} eliminato dall'esplosione`);
                            
                            // ===== PERDITA BANDIERA PER ESPLOSIONE =====
                            if (playerHit.hasFlag) {
                                const flagType = playerHit.team === 'top' ? 'bottom' : 'top';
                                playerUpdates[`gameBoard/flags/${flagType}/captured`] = false;
                                playerUpdates[`gameBoard/flags/${flagType}/capturedBy`] = null;
                                playerUpdates[`gameBoard/flags/${flagType}/capturedAt`] = null;
                                console.log(`🏁💥 Bandiera ${flagType} liberata dopo esplosione!`);
                            }
                        }
                    }
                }
            }

            // ===== AGGIORNAMENTO BOMBE RIMANENTI =====
            const updatedBombs = this.gameData.bombs
                .filter(bomb => bomb.timer > 1)    // Rimuovi quelle esplose
                .map(bomb => ({
                    ...bomb,
                    timer: bomb.timer - 1           // Decrementa timer rimanenti
                }));

            console.log(`🧨 Bombe rimanenti dopo esplosione: ${updatedBombs.length}`);

            // ===== AGGIORNAMENTO ATOMICO DATABASE =====
            const updates = {
                bombs: updatedBombs,
                'gameBoard/rocks': updatedRocks,
                ...playerUpdates
            };

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

            // ===== EFFETTI VISIVI =====
            this.showExplosionEffect(explosionCells);
            
            setTimeout(() => {
                this.clearExplosionEffects();
            }, 1500);

            // ===== CONTROLLO FINE GIOCO =====
            await this.checkGameEnd();

        } catch (error) {
            console.error('❌ Errore esplosione bombe:', error);
            throw error;
        }
    }

    /**
     * Mostra preview delle celle che verranno colpite dall'esplosione
     */
    showExplosionPreview(explodingBombs) {
        console.log('⚠️ Mostrando preview esplosione...');
        
        // Pulisci preview precedenti
        this.clearExplosionEffects();
        
        explodingBombs.forEach(bomb => {
            // Area esplosione 3x3 attorno alla bomba
            for (let i = Math.max(0, bomb.row - 1); i <= Math.min(GAME_CONFIG.ROWS - 1, bomb.row + 1); i++) {
                for (let j = Math.max(0, bomb.col - 1); j <= Math.min(GAME_CONFIG.COLS - 1, bomb.col + 1); j++) {
                    const cell = this.ui.tbl.rows[i].cells[j];
                    cell.classList.add("explosion-warning");
                }
            }
        });
    }

    /**
     * Mostra effetto esplosione finale con animazioni
     */
    showExplosionEffect(explosionCells) {
        console.log('💥 Mostrando effetto esplosione finale...');
        
        explosionCells.forEach(cellKey => {
            const [row, col] = cellKey.split('-').map(Number);
            const cell = this.ui.tbl.rows[row].cells[col];
            
            // Rimuovi warning e aggiungi effetto esplosione
            cell.classList.remove("explosion-warning");
            cell.classList.add("explosion-effect");
            
            // Animazione di scossa
            cell.style.animation = 'explosionShake 0.5s ease-in-out';
        });
    }

    /**
     * Pulisce tutti gli effetti visivi di esplosione
     */
    clearExplosionEffects() {
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove("explosion-warning", "explosion-effect");
                cell.style.animation = '';
            }
        }
    }

    /**
     * Calcola posizione di spawn in base al team
     */
    getSpawnPosition(team, playerId) {
        if (team === 'top') {
            // Team nord: prima o seconda posizione di spawn
            return this.gameData.players.findIndex(p => p.firebaseId === playerId && p.team === 'top') === 0 
                ? { row: 0, col: 12 } 
                : { row: 0, col: 14 };
        } else {
            // Team sud: prima o seconda posizione di spawn
            return this.gameData.players.findIndex(p => p.firebaseId === playerId && p.team === 'bottom') === 0 
                ? { row: 15, col: 12 } 
                : { row: 15, col: 14 };
        }
    }

    /**
     * Controlla se il gioco è finito (tutti morti o un solo team rimasto)
     */
    async checkGameEnd() {
        const alivePlayers = this.gameData.players.filter(p => p.isAlive);
        const aliveTeams = new Set(alivePlayers.map(p => p.team));
        
        let winner = null;
        
        if (aliveTeams.size === 1) {
            // Solo un team ha giocatori vivi
            winner = aliveTeams.values().next().value;
        } else if (aliveTeams.size === 0) {
            // Tutti morti
            winner = 'draw';
        } else if (alivePlayers.length === 1) {
            // Solo un giocatore vivo
            winner = alivePlayers[0].team;
        }
        
        if (winner) {
            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}/winner`).set(winner);
            });
        }
    }

    // ==========================================
    // ABILITÀ SPECIALI
    // ==========================================

    /**
     * Piazza una bomba nella posizione specificata
     * Solo per giocatori con ruolo 'bomber'
     */
    async placeBomb(row, col) {
        if (!this.isMyTurn() || this.gameState.bombsPlacedThisTurn >= GAME_CONFIG.MAX_BOMBS_PER_TURN) {
            return;
        }

        try {
            const newBomb = {
                row: row,
                col: col,
                timer: GAME_CONFIG.BOMB_TIMER,      // Timer iniziale (3 turni)
                placedBy: this.playerData.myPlayerId,
                placedAt: Date.now()
            };

            const updatedBombs = [...this.gameData.bombs, newBomb];
            
            console.log(`💣 Bomba piazzata a (${row}, ${col}) con timer ${newBomb.timer}`);
            
            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update({
                    bombs: updatedBombs,
                    'gameState/bombsPlacedThisTurn': this.gameState.bombsPlacedThisTurn + 1,
                    'gameState/currentMovesMade': this.gameState.currentMovesMade + 1
                });
            });

            // Reset modalità e cleanup UI
            this.gameState.bombMode = false;
            this.clearBombTargets();

            // Notifica visiva
            this.showBombPlacedNotification();

            // Auto-fine turno se raggiunte max mosse
            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                setTimeout(() => this.endTurn(), 100);
            }

        } catch (error) {
            console.error('❌ Errore piazzamento bomba:', error);
            this.showError('Errore durante il piazzamento della bomba');
        }
    }

    /**
     * Mostra notifica quando viene piazzata una bomba
     */
    showBombPlacedNotification() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(145deg, rgba(220, 20, 60, 0.95) 0%, rgba(139, 0, 0, 0.9) 100%);
            color: #fff;
            padding: 20px 30px;
            border-radius: 12px;
            border: 3px solid #8b0000;
            font-size: 1.5rem;
            font-weight: bold;
            text-align: center;
            z-index: 1000;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8);
            animation: bombPlacedNotif 2s ease-out forwards;
        `;
        notification.innerHTML = '💣 BOMBA PIAZZATA!<br><small>Esploderà tra 3 turni</small>';
        
        document.body.appendChild(notification);
        
        // Auto-rimozione dopo 2 secondi
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 2000);
    }

    /**
     * Costruisce un muro nella posizione specificata
     * Solo per giocatori con ruolo 'constructor'
     */
    async buildWall(row, col) {
        if (!this.isMyTurn()) return;

        try {
            const currentRocks = this.gameData.firebaseGameData.gameBoard?.rocks || [];
            const newRock = { row: row, col: col };
            const updatedRocks = [...currentRocks, newRock];

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update({
                    'gameBoard/rocks': updatedRocks,
                    'gameState/currentMovesMade': this.gameState.currentMovesMade + 1
                });
            });

            // Reset modalità costruzione
            this.gameState.constructionMode = false;
            this.clearBuildableHighlights();

            // Auto-fine turno se raggiunte max mosse
            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                setTimeout(() => this.endTurn(), 100);
            }

        } catch (error) {
            console.error('❌ Errore costruzione muro:', error);
            this.showError('Errore durante la costruzione');
        }
    }

    /**
     * ATTACCO COLTELLO con gestione perdita bandiere
     * Può distruggere rocce o eliminare giocatori nemici adiacenti
     */
    async knifeAttack(row, col) {
        if (!this.isMyTurn()) return;

        try {
            const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
            let updates = {
                'gameState/currentMovesMade': this.gameState.currentMovesMade + 1
            };

            // ===== DISTRUZIONE ROCCE =====
            const currentRocks = this.gameData.firebaseGameData.gameBoard?.rocks || [];
            const rockIndex = currentRocks.findIndex(rock => rock.row === row && rock.col === col);
            
            if (rockIndex !== -1) {
                const updatedRocks = currentRocks.filter((_, index) => index !== rockIndex);
                updates['gameBoard/rocks'] = updatedRocks;
            }

            // ===== ATTACCO GIOCATORE NEMICO =====
            const targetPlayer = this.gameData.players.find(p => 
                p.row === row && p.col === col && p.isAlive && p.team !== currentPlayer.team
            );

            if (targetPlayer) {
                const spawnPos = this.getSpawnPosition(targetPlayer.team, targetPlayer.firebaseId);
                
                // Eliminazione giocatore
                updates[`players/${targetPlayer.firebaseId}/isAlive`] = false;
                updates[`players/${targetPlayer.firebaseId}/row`] = spawnPos.row;
                updates[`players/${targetPlayer.firebaseId}/col`] = spawnPos.col;
                updates[`players/${targetPlayer.firebaseId}/hasFlag`] = false;
                
                // ===== GESTIONE PERDITA BANDIERA =====
                if (targetPlayer.hasFlag) {
                    const flagType = targetPlayer.team === 'top' ? 'bottom' : 'top';
                    updates[`gameBoard/flags/${flagType}/captured`] = false;
                    updates[`gameBoard/flags/${flagType}/capturedBy`] = null;
                    updates[`gameBoard/flags/${flagType}/capturedAt`] = null;
                    
                    console.log(`🏁💀 ${targetPlayer.name} ha perso la bandiera ${flagType} dopo essere stato eliminato!`);
                }
            }

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

            // Reset modalità coltello
            this.gameState.knifeMode = false;
            this.clearKnifeTargets();

            // Controllo fine gioco
            await this.checkGameEnd();

            // Auto-fine turno se raggiunte max mosse
            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                setTimeout(() => this.endTurn(), 100);
            }

        } catch (error) {
            console.error('❌ Errore attacco coltello:', error);
            this.showError('Errore durante l\'attacco');
        }
    }

    // ==========================================
    // SISTEMA BANDIERE - FUNZIONI SPECIALIZZATE
    // ==========================================

    /**
     * Gestisce la perdita di una bandiera quando un giocatore viene eliminato
     */
    async handleFlagLoss(playerId) {
        try {
            const player = this.gameData.players.find(p => p.firebaseId === playerId);
            if (!player || !player.hasFlag) return;

            console.log(`💀 ${player.name} ha perso la bandiera!`);

            // Determina quale bandiera aveva (opposta al suo team)
            const flagType = player.team === 'top' ? 'bottom' : 'top';
            
            const updates = {
                [`players/${playerId}/hasFlag`]: false,
                [`gameBoard/flags/${flagType}/captured`]: false,
                [`gameBoard/flags/${flagType}/capturedBy`]: null,
                [`gameBoard/flags/${flagType}/capturedAt`]: null
            };

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

            this.showFlagLossNotification(flagType, player.team);
            this.updateFlagDisplay();

        } catch (error) {
            console.error('❌ Errore gestione perdita bandiera:', error);
        }
    }

    /**
     * Aggiorna la visualizzazione delle bandiere sulla griglia
     * Mostra stato catturata/disponibile con colori e tooltip
     */
    updateFlagDisplay() {
        // ===== AGGIORNAMENTO CELLE BANDIERE =====
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                
                if (cell.classList.contains('flag-cell')) {
                    const flagType = cell.dataset.flagType;
                    const flagData = this.gameData.firebaseGameData?.gameBoard?.flags?.[flagType];
                    
                    // Rimuovi classi precedenti
                    cell.classList.remove('flag-captured', 'flag-available');
                    
                    if (flagData?.captured) {
                        // ===== BANDIERA CATTURATA =====
                        cell.classList.add('flag-captured');
                        
                        // Trova portatore bandiera per tooltip
                        const bearer = this.gameData.players.find(p => p.firebaseId === flagData.capturedBy);
                        if (bearer) {
                            cell.title = `Bandiera catturata da ${bearer.name} (${bearer.team})`;
                        }
                    } else {
                        // ===== BANDIERA DISPONIBILE =====
                        cell.classList.add('flag-available');
                        cell.title = `Bandiera ${flagType} - Disponibile per cattura`;
                    }
                }
            }
        }

        // Aggiorna informazioni nell'interfaccia
        this.updateFlagInfo();
    }

    /**
     * Aggiorna le informazioni sulle bandiere nell'interfaccia utente
     */
    updateFlagInfo() {
        const gameInfo = document.getElementById('game-info');
        if (!gameInfo) return;

        // Rimuovi info precedenti
        const existingFlagInfo = gameInfo.querySelector('.flag-status');
        if (existingFlagInfo) {
            existingFlagInfo.remove();
        }

        // ===== CREAZIONE NUOVO PANNELLO INFO BANDIERE =====
        const flagInfo = document.createElement('div');
        flagInfo.className = 'flag-status';
        flagInfo.style.cssText = `
            grid-column: 1 / -1;
            display: flex;
            justify-content: space-between;
            padding: 10px;
            background: rgba(139, 69, 19, 0.3);
            border-radius: 6px;
            border: 1px solid rgba(101, 67, 33, 0.5);
            margin-top: 10px;
            font-size: 0.9rem;
        `;

        // ===== STATO BANDIERE =====
        const topFlagData = this.gameData.firebaseGameData?.gameBoard?.flags?.top;
        const bottomFlagData = this.gameData.firebaseGameData?.gameBoard?.flags?.bottom;

        const topStatus = topFlagData?.captured 
            ? `🏁 Nord: CATTURATA`
            : `🏁 Nord: Disponibile`;
        
        const bottomStatus = bottomFlagData?.captured 
            ? `🏁 Sud: CATTURATA`
            : `🏁 Sud: Disponibile`;

        flagInfo.innerHTML = `
            <span class="flag-north ${topFlagData?.captured ? 'captured' : 'available'}">${topStatus}</span>
            <span class="flag-south ${bottomFlagData?.captured ? 'captured' : 'available'}">${bottomStatus}</span>
        `;

        gameInfo.appendChild(flagInfo);
    }

    /**
     * Mostra notifica drammatica per cattura bandiera
     */
    showFlagCaptureNotification(flagType, captureTeam) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(145deg, rgba(34, 139, 34, 0.95) 0%, rgba(0, 100, 0, 0.9) 100%);
            color: #fff;
            padding: 25px 35px;
            border-radius: 15px;
            border: 4px solid #228b22;
            font-size: 1.8rem;
            font-weight: bold;
            text-align: center;
            z-index: 1000;
            box-shadow: 0 12px 25px rgba(0, 0, 0, 0.8);
            animation: flagCaptureNotif 3s ease-out forwards;
            font-family: 'Georgia', serif;
            text-transform: uppercase;
            letter-spacing: 2px;
        `;
        
        const teamName = captureTeam === 'top' ? 'Team Nord' : 'Team Sud';
        const flagName = flagType === 'top' ? 'NORD' : 'SUD';
        
        notification.innerHTML = `
            🏁 BANDIERA CATTURATA!<br>
            <div style="font-size: 1.2rem; margin-top: 10px; color: #90EE90;">
                ${teamName} ha catturato la bandiera ${flagName}!
            </div>
            <div style="font-size: 1rem; margin-top: 8px; color: #F0F8FF; font-style: italic;">
                Riportala alla tua base per vincere!
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    /**
     * Mostra notifica per perdita bandiera
     */
    showFlagLossNotification(flagType, teamThatLost) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(145deg, rgba(220, 20, 60, 0.95) 0%, rgba(139, 0, 0, 0.9) 100%);
            color: #fff;
            padding: 25px 35px;
            border-radius: 15px;
            border: 4px solid #dc143c;
            font-size: 1.6rem;
            font-weight: bold;
            text-align: center;
            z-index: 1000;
            box-shadow: 0 12px 25px rgba(0, 0, 0, 0.8);
            animation: flagLossNotif 2.5s ease-out forwards;
            font-family: 'Georgia', serif;
            text-transform: uppercase;
            letter-spacing: 2px;
        `;
        
        const teamName = teamThatLost === 'top' ? 'Team Nord' : 'Team Sud';
        const flagName = flagType === 'top' ? 'NORD' : 'SUD';
        
        notification.innerHTML = `
            🏁💔 BANDIERA PERSA!<br>
            <div style="font-size: 1.1rem; margin-top: 10px; color: #FFB6C1;">
                ${teamName} ha perso la bandiera ${flagName}!
            </div>
            <div style="font-size: 0.9rem; margin-top: 8px; color: #F0F8FF; font-style: italic;">
                La bandiera è tornata disponibile
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 2500);
    }

    /**
     * Mostra schermata di vittoria specifica per conquista bandiera
     */
    showVictoryByFlag(winningTeam, playerName) {
        this.gameState.gameEnded = true;
        document.getElementById('contentbox').style.display = 'none';
        
        const victoryScreen = document.getElementById('victory-screen');
        if (!victoryScreen) return;
        
        victoryScreen.style.display = 'flex';
        
        // ===== MESSAGGIO VITTORIA PERSONALIZZATO =====
        const winningTeamElement = document.getElementById('winning-team');
        const victoryMessage = document.getElementById('victory-message');
        
        if (winningTeamElement && victoryMessage) {
            const teamName = winningTeam === 'top' ? 'Team Nord' : 'Team Sud';
            winningTeamElement.textContent = teamName;
            
            victoryMessage.innerHTML = `
                <div style="font-size: 1.2em; margin-bottom: 15px;">
                    🏁 <strong>${teamName}</strong> ha conquistato la vittoria! 🏁
                </div>
                <div style="font-size: 1em; color: #daa520;">
                    <strong>${playerName}</strong> ha catturato e consegnato la bandiera nemica!
                </div>
            `;
        }
        
        // Effetti speciali per vittoria con bandiera
        this.addVictoryEffects();
    }

    /**
     * Aggiunge effetti visivi speciali per la vittoria
     */
    addVictoryEffects() {
        const effects = document.createElement('div');
        effects.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999;
        `;
        
        // ===== CORIANDOLI ANIMATI =====
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.style.cssText = `
                position: absolute;
                width: 10px;
                height: 10px;
                background: ${['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24'][Math.floor(Math.random() * 5)]};
                left: ${Math.random() * 100}%;
                animation: confettiFall ${2 + Math.random() * 3}s linear infinite;
                animation-delay: ${Math.random() * 2}s;
            `;
            effects.appendChild(confetti);
        }
        
        document.body.appendChild(effects);
        
        // Auto-rimozione effetti
        setTimeout(() => {
            if (effects.parentNode) {
                effects.remove();
            }
        }, 10000);
    }

    // ==========================================
    // INTERFACCIA UTENTE E VISUALIZZAZIONE
    // ==========================================

    /**
     * Aggiorna le posizioni di tutti i giocatori sulla griglia
     * Gestisce stati vitali, bandiere, ruoli e turno attivo
     */
    updatePlayerPositions() {
        // ===== RESET CELLE =====
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                let cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove(
                    "player1-cell", "player2-cell", "player3-cell", "player4-cell", 
                    "player-with-flag", "bomber", "constructor", "active-player", "dead-player",
                    "knife-mode-active"
                );
            }
        }
        
        // ===== AGGIORNAMENTO GIOCATORI =====
        this.gameData.players.forEach((player, index) => {
            let cell = this.ui.tbl.rows[player.row].cells[player.col];
            cell.classList.add(`player${index + 1}-cell`);
            cell.dataset.player = index + 1;
            
            // ===== GIOCATORI MORTI =====
            if (!player.isAlive) {
                cell.classList.add("dead-player");
                return;
            }
            
            // ===== INDICATORI RUOLO =====
            if (player.role === 'bomber') {
                cell.classList.add("bomber");
            } else {
                cell.classList.add("constructor");
            }
            
            // ===== INDICATORE BANDIERA =====
            if (player.hasFlag) {
                cell.classList.add("player-with-flag");
            }
            
            // ===== GIOCATORE ATTIVO =====
            if (player.active) {
                cell.classList.add("active-player");
                
                // Modalità coltello attiva
                if (this.gameState.knifeMode && this.isMyTurn()) {
                    cell.classList.add("knife-mode-active");
                }
            }
        });
    }

    /**
     * Aggiorna indicatore del turno corrente
     */
    updateTurnIndicator() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        const indicator = document.getElementById('current-player');
        
        if (!currentPlayer || !indicator) return;
        
        if (!currentPlayer.isAlive) {
            indicator.textContent = `${currentPlayer.name} (Morto)`;
            indicator.style.color = 'red';
        } else {
            indicator.textContent = `${currentPlayer.name}`;
            indicator.style.color = this.isMyTurn() ? '#4CAF50' : 'inherit';
        }
        
        // ===== CONTATORE MOSSE =====
        const movesCounter = document.getElementById('moves-counter');
        if (movesCounter) {
            movesCounter.textContent = this.gameState.currentMovesMade;
        }
    }

    /**
     * Setup controlli basati su ruolo e turno del giocatore
     */
    setupPlayerControls() {
        // ===== NASCONDE TUTTI I CONTROLLI =====
        document.getElementById('construction-controls').style.display = 'none';
        document.getElementById('bomb-controls').style.display = 'none';
        document.getElementById('knife-controls').style.display = 'none';
        
        // ===== MOSTRA CONTROLLI PER TURNO CORRENTE =====
        if (this.isMyTurn() && !this.gameState.gameEnded) {
            const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
            
            if (currentPlayer && currentPlayer.isAlive) {
                // Coltello disponibile per tutti
                this.setupKnifeControls();
                
                // Controlli specifici per ruolo
                if (currentPlayer.role === 'constructor') {
                    this.setupConstructionControls();
                } else if (currentPlayer.role === 'bomber') {
                    this.setupBombControls();
                }
            }
        }
    }

    /**
     * Aggiorna visualizzazione bombe con timer visibili
     */
    updateBombsDisplay() {
        // ===== PULIZIA BOMBE ESISTENTI =====
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove("bomb-cell", "bomb-timer-3", "bomb-timer-2", "bomb-timer-1");
                
                // Rimuovi timer text se esiste
                const timerElement = cell.querySelector('.bomb-timer');
                if (timerElement) {
                    timerElement.remove();
                }
            }
        }

        // ===== AGGIUNTA BOMBE ATTUALI =====
        this.gameData.bombs.forEach(bomb => {
            if (bomb.row >= 0 && bomb.row < GAME_CONFIG.ROWS && 
                bomb.col >= 0 && bomb.col < GAME_CONFIG.COLS) {
                
                const cell = this.ui.tbl.rows[bomb.row].cells[bomb.col];
                cell.classList.add("bomb-cell", `bomb-timer-${bomb.timer}`);
                
                // ===== TIMER VISIBILE =====
                const timerElement = document.createElement('div');
                timerElement.className = 'bomb-timer';
                timerElement.textContent = bomb.timer;
                timerElement.style.cssText = `
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    background: rgba(255, 0, 0, 0.8);
                    color: white;
                    border-radius: 50%;
                    width: 16px;
                    height: 16px;
                    font-size: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    z-index: 10;
                `;
                cell.appendChild(timerElement);
            }
        });
    }

    // ==========================================
    // CONTROLLI UTENTE SPECIALIZZATI
    // ==========================================

    /**
     * Setup controlli costruzione per giocatori 'constructor'
     */
    setupConstructionControls() {
        const buildBtn = document.getElementById('build-wall-btn');
        buildBtn.onclick = () => this.toggleConstructionMode();
        document.getElementById('construction-controls').style.display = 'block';
    }

    /**
     * Attiva/disattiva modalità costruzione
     */
    toggleConstructionMode() {
        if (!this.isMyTurn()) return;
        
        this.gameState.constructionMode = !this.gameState.constructionMode;
        
        if (this.gameState.constructionMode) {
            this.highlightBuildableCells();
        } else {
            this.clearBuildableHighlights();
        }
    }

    /**
     * Evidenzia celle dove è possibile costruire
     */
    highlightBuildableCells() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
                
                // ===== CRITERI COSTRUZIONE =====
                if (distance <= GAME_CONFIG.CONSTRUCTION_RANGE && 
                    !cell.classList.contains("rock-cell") &&
                    !cell.classList.contains("flag-cell") &&
                    !cell.classList.contains("bomb-cell") &&
                    !this.gameData.players.some(p => p.row === i && p.col === j && p.isAlive)) {
                    
                    cell.classList.add("buildable");
                    cell.onclick = () => this.buildWall(i, j);
                }
            }
        }
    }

    /**
     * Rimuove evidenziazioni celle costruibili
     */
    clearBuildableHighlights() {
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove("buildable");
                cell.onclick = null;
            }
        }
    }

    /**
     * Setup controlli bombe per giocatori 'bomber'
     */
    setupBombControls() {
        const bombBtn = document.getElementById('place-bomb-btn');
        bombBtn.onclick = () => this.toggleBombMode();
        document.getElementById('bomb-controls').style.display = 'block';
    }

    /**
     * Attiva/disattiva modalità piazzamento bombe
     */
    toggleBombMode() {
        if (!this.isMyTurn() || this.gameState.bombsPlacedThisTurn >= GAME_CONFIG.MAX_BOMBS_PER_TURN) {
            return;
        }
        
        this.gameState.bombMode = !this.gameState.bombMode;
        
        if (this.gameState.bombMode) {
            this.highlightBombTargets();
        } else {
            this.clearBombTargets();
        }
    }

    /**
     * Evidenzia posizioni valide per piazzare bombe
     */
    highlightBombTargets() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
                
                // ===== CRITERI PIAZZAMENTO BOMBA =====
                if (distance <= GAME_CONFIG.BOMB_RANGE && 
                    !cell.classList.contains("rock-cell") &&
                    !cell.classList.contains("flag-cell") &&
                    !cell.classList.contains("bomb-cell") &&
                    !this.gameData.players.some(p => p.row === i && p.col === j && p.isAlive)) {
                    
                    cell.classList.add("bomb-target");
                    cell.onclick = () => this.placeBomb(i, j);
                }
            }
        }
    }

    /**
     * Rimuove evidenziazioni bersagli bomba
     */
    clearBombTargets() {
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove("bomb-target");
                cell.onclick = null;
            }
        }
    }

    /**
     * Setup controlli coltello (disponibili per tutti)
     */
    setupKnifeControls() {
        const knifeBtn = document.getElementById('use-knife-btn');
        knifeBtn.onclick = () => this.toggleKnifeMode();
        document.getElementById('knife-controls').style.display = 'block';
    }

    /**
     * Attiva/disattiva modalità attacco coltello
     */
    toggleKnifeMode() {
        if (!this.isMyTurn()) return;
        
        this.gameState.knifeMode = !this.gameState.knifeMode;
        
        const knifeBtn = document.getElementById('use-knife-btn');
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        const currentPlayerCell = this.ui.tbl.rows[currentPlayer.row].cells[currentPlayer.col];
        
        if (this.gameState.knifeMode) {
            this.highlightKnifeTargets();
            knifeBtn.classList.add('active-mode');
            currentPlayerCell.classList.add('knife-mode-active');
            document.body.classList.add('knife-mode');
        } else {
            this.clearKnifeTargets();
            knifeBtn.classList.remove('active-mode');
            currentPlayerCell.classList.remove('knife-mode-active');
            document.body.classList.remove('knife-mode');
        }
    }

    /**
     * Evidenzia bersagli validi per attacco coltello
     */
    highlightKnifeTargets() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        
        // ===== AREA ATTACCO ADIACENTE =====
        for (let i = Math.max(0, currentPlayer.row - GAME_CONFIG.KNIFE_RANGE); 
             i <= Math.min(GAME_CONFIG.ROWS - 1, currentPlayer.row + GAME_CONFIG.KNIFE_RANGE); i++) {
            for (let j = Math.max(0, currentPlayer.col - GAME_CONFIG.KNIFE_RANGE); 
                 j <= Math.min(GAME_CONFIG.COLS - 1, currentPlayer.col + GAME_CONFIG.KNIFE_RANGE); j++) {
                
                // Esclude posizione corrente
                if (i === currentPlayer.row && j === currentPlayer.col) continue;
                
                const cell = this.ui.tbl.rows[i].cells[j];
                
                // ===== BERSAGLI VALIDI =====
                const hasRock = cell.classList.contains("rock-cell");
                const enemyPlayer = this.gameData.players.find(p => 
                    p.row === i && p.col === j && p.isAlive && p.team !== currentPlayer.team
                );
                
                if (hasRock || enemyPlayer) {
                    cell.classList.add("knife-target");
                    cell.onclick = () => this.knifeAttack(i, j);
                }
            }
        }
    }

    /**
     * Rimuove evidenziazioni bersagli coltello
     */
    clearKnifeTargets() {
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove("knife-target");
                cell.onclick = null;
            }
        }
    }

    // ==========================================
    // CREAZIONE MAPPA E INTERFACCIA
    // ==========================================

    /**
     * Crea la griglia di gioco HTML
     * Imposta posizioni bandiere e event listeners
     */
    makeMap(placeholder, rows, cols) {
        const container = document.getElementById(placeholder);
        if (!container) {
            console.error("Container non trovato:", placeholder);
            return;
        }
        
        container.innerHTML = '';
        
        // ===== CREAZIONE TABELLA =====
        this.ui.tbl = document.createElement("table");
        for (let i = 0; i < rows; i++) {
            let tr = document.createElement("tr");
            for (let j = 0; j < cols; j++) {
                let td = document.createElement("td");
                td.setAttribute("class", "cella");

                // ===== POSIZIONAMENTO BANDIERE =====
                if (i === 0 && j === 13) {
                    // Bandiera nord
                    td.className += " flag-cell";
                    td.dataset.flagType = "top";
                } else if (i === rows-1 && j === 13) {
                    // Bandiera sud
                    td.className += " flag-cell";
                    td.dataset.flagType = "bottom";
                }

                tr.appendChild(td);
            }
            this.ui.tbl.appendChild(tr);
        }

        container.appendChild(this.ui.tbl);
        
        // ===== SETUP EVENT LISTENER TASTIERA =====
        document.addEventListener('keydown', this.handleKeyPress);
    }

    // ==========================================
    // UTILITÀ E GESTIONE ERRORI
    // ==========================================

    /**
     * Esegue operazione con tentativi automatici in caso di errore
     * Fondamentale per la stabilità del networking Firebase
     */
    async executeWithRetry(operation, maxAttempts = GAME_CONFIG.RETRY_ATTEMPTS) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.warn(`⚠️ Tentativo ${attempt}/${maxAttempts} fallito:`, error);
                
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                // Backoff esponenziale
                await new Promise(resolve => 
                    setTimeout(resolve, GAME_CONFIG.RETRY_DELAY * attempt)
                );
            }
        }
    }

    /**
     * Mostra schermata di vittoria standard
     */
    showVictoryScreen(winningTeam) {
        this.gameState.gameEnded = true;
        document.getElementById('contentbox').style.display = 'none';
        document.getElementById('victory-screen').style.display = 'flex';
        
        const winningTeamElement = document.getElementById('winning-team');
        if (winningTeam === 'draw') {
            winningTeamElement.textContent = 'Pareggio! Tutti i giocatori sono morti';
        } else {
            winningTeamElement.textContent = winningTeam === 'top' ? 'Team Nord' : 'Team Sud';
        }
    }

    /**
     * Mostra messaggio di errore con opzione di ritorno alla lobby
     */
    showError(message) {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="loading-container">
                    <div style="color: #ff6b6b; font-size: 2rem; text-align: center; margin-bottom: 30px; font-family: Georgia, serif;">
                        ❌ Errore
                    </div>
                    <div style="color: #f5deb3; font-size: 1.2rem; text-align: center; margin-bottom: 30px;">
                        ${message}
                    </div>
                    <button onclick="gameInstance?.goBackToLobby()" style="padding: 15px 30px; font-size: 1.1rem; background: linear-gradient(145deg, #8b4513 0%, #daa520 100%); color: #f5deb3; border: 3px solid #654321; border-radius: 8px; cursor: pointer;">
                        🚪 Torna alla Lobby
                    </button>
                </div>
            `;
        }
    }

    /**
     * Mostra dialog di conferma personalizzato
     */
    async showConfirmDialog(message, title = 'Conferma') {
        return new Promise((resolve) => {
            const confirmed = confirm(`${title}\n\n${message}`);
            resolve(confirmed);
        });
    }

    /**
     * Nasconde schermata di caricamento
     */
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }

    /**
     * Ritorna alla lobby con conferma
     */
    goBackToLobby() {
        if (confirm('Sei sicuro di voler tornare alla lobby?')) {
            this.cleanup();
            window.location.href = '../index.html';
        }
    }

    // ==========================================
    // GESTIONE EVENTI BROWSER E CLEANUP
    // ==========================================

    /**
     * Setup event listeners per eventi browser
     */
    setupBrowserEvents() {
        window.addEventListener('beforeunload', this.handlePageExit);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('pagehide', this.handlePageExit);
        window.addEventListener('unload', this.handlePageExit);
    }

    /**
     * Gestisce cambio di visibilità della pagina per ottimizzare heartbeat
     */
    handleVisibilityChange() {
        this.network.isPageVisible = !document.hidden;
        
        // Aggiorna presenza quando la pagina torna visibile
        if (this.network.isPageVisible && this.network.database && this.network.presenceRef) {
            this.network.presenceRef.update({
                online: true,
                lastSeen: Date.now()
            }).catch(error => {
                console.error('❌ Errore aggiornamento presenza:', error);
            });
        }
    }

    /**
     * Gestisce uscita dalla pagina
     */
    handlePageExit() {
        this.cleanup();
    }

    /**
     * CLEANUP COMPLETO - Chiamato alla chiusura della pagina
     * Rimuove listener, ferma heartbeat, aggiorna presenza
     */
    cleanup() {
        try {
            // ===== RIMOZIONE LISTENER FIREBASE =====
            if (this.network.gameListener) {
                this.network.gameListener.off();
                this.network.gameListener = null;
            }

            // ===== STOP HEARTBEAT =====
            if (this.network.heartbeatInterval) {
                clearInterval(this.network.heartbeatInterval);
                this.network.heartbeatInterval = null;
            }

            // ===== AGGIORNAMENTO PRESENZA =====
            // IMPORTANTE: Non rimuove il giocatore, solo marca come offline
            if (this.network.database && this.playerData.currentRoom && this.playerData.myPlayerId) {
                this.network.database.ref(
                    `games/${this.playerData.currentRoom}/players/${this.playerData.myPlayerId}/presence`
                ).update({
                    online: false,
                    lastSeen: Date.now()
                }).catch(error => {
                    console.error('❌ Errore aggiornamento presenza durante cleanup:', error);
                });
            }

            // ===== RIMOZIONE EVENT LISTENERS =====
            document.removeEventListener('keydown', this.handleKeyPress);
            window.removeEventListener('beforeunload', this.handlePageExit);
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
            window.removeEventListener('pagehide', this.handlePageExit);
            window.removeEventListener('unload', this.handlePageExit);

            console.log('✅ Cleanup completato');
        } catch (error) {
            console.error('❌ Errore durante cleanup:', error);
        }
    }
}

// ==========================================
// INIZIALIZZAZIONE GLOBALE E BOOTSTRAP
// ==========================================

/**
 * Istanza globale del gioco per accesso da altre funzioni
 */
let gameInstance = null;

/**
 * BOOTSTRAP PRINCIPALE - Si attiva al caricamento della pagina
 * Punto di ingresso dell'intera applicazione
 */
window.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('🚀 Avvio applicazione gioco multiplayer...');
        
        // Creazione istanza principale del gioco
        gameInstance = new MultiplayerGame();
        
        // Inizializzazione completa
        const success = await gameInstance.initialize();
        
        if (!success) {
            console.error('❌ Inizializzazione fallita');
        } else {
            console.log('✅ Gioco inizializzato con successo!');
        }
    } catch (error) {
        console.error('❌ Errore critico durante bootstrap:', error);
        if (gameInstance) {
            gameInstance.showError('Errore critico durante l\'inizializzazione');
        }
    }
});

/**
 * Funzione globale per compatibilità con HTML
 * Permette di tornare alla lobby da elementi HTML
 */
function goBackToLobby() {
    if (gameInstance) {
        gameInstance.goBackToLobby();
    } else {
        // Fallback se l'istanza non esiste
        window.location.href = '../index.html';
    }
}