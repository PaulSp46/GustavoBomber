// ==========================================
// CONFIGURAZIONE E VARIABILI GLOBALI
// ==========================================

// Configurazione gioco
const GAME_CONFIG = {
    ROWS: 16,
    COLS: 27,
    ROCK_PROBABILITY: 0.3,
    MAX_MOVES_PER_TURN: 3,
    MAX_BOMBS_PER_TURN: 2,
    CONSTRUCTION_RANGE: 6,
    BOMB_RANGE: 5,
    KNIFE_RANGE: 1,
    BOMB_TIMER: 3,
    HEARTBEAT_INTERVAL: 30000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    INITIALIZATION_TIMEOUT: 10000, // 10 secondi
    PLAYER_SYNC_TIMEOUT: 5000 // 5 secondi
};

// Configurazione Firebase (da spostare in variabili d'ambiente in produzione)
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

class MultiplayerGame {
    constructor() {
        // Stati del gioco
        this.gameState = {
            constructionMode: false,
            bombMode: false,
            knifeMode: false,
            isBuilding: false,
            gameStarted: false,
            gameEnded: false,
            currentPlayerIndex: 0,
            currentMovesMade: 0,
            bombsPlacedThisTurn: 0,
            updatingFromFirebase: false
        };

        // Dati del giocatore
        this.playerData = {
            currentRoom: null,
            myPlayerId: null,
            myUsername: '',
            myTeam: '',
            myRole: ''
        };

        // Dati del gioco
        this.gameData = {
            players: [],
            bombs: [],
            firebaseGameData: {}
        };

        // Firebase e networking
        this.network = {
            database: null,
            presenceRef: null,
            gameListener: null,
            heartbeatInterval: null,
            isPageVisible: true,
            retryCount: 0
        };

        // UI
        this.ui = {
            tbl: null
        };

        // Bind methods
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handlePageExit = this.handlePageExit.bind(this);
        this.syncGameState = this.syncGameState.bind(this);
    }

    // ==========================================
    // INIZIALIZZAZIONE
    // ==========================================

    async initialize() {
        try {
            console.log("🎮 Inizializzando gioco multiplayer...");
            
            // 1. Estrai e valida parametri URL
            const params = this.getAndValidateUrlParams();
            if (!params) return false;

            this.setPlayerData(params);

            // 2. Inizializza Firebase
            if (!await this.initFirebase()) {
                this.showError('Impossibile connettersi ai server di gioco');
                return false;
            }

            // 3. Setup sistemi
            this.setupPresenceSystem();
            this.setupBrowserEvents();
            
            // 4. Inizializza il gioco
            await this.initializeGame();
            
            return true;
        } catch (error) {
            console.error('❌ Errore inizializzazione:', error);
            this.showError('Errore durante l\'inizializzazione del gioco');
            return false;
        }
    }

    getAndValidateUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {
            roomCode: urlParams.get('roomCode'),
            playerId: urlParams.get('playerId'),
            username: urlParams.get('username'),
            team: urlParams.get('team'),
            role: urlParams.get('role'),
            gameStarted: urlParams.get('gameStarted')
        };

        console.log('🔍 Parametri URL ricevuti:', params);

        // Validazione parametri essenziali
        if (!params.roomCode || !params.playerId || !params.username) {
            console.error('❌ Parametri URL mancanti:', {
                hasRoomCode: !!params.roomCode,
                hasPlayerId: !!params.playerId,
                hasUsername: !!params.username
            });
            this.showError('Parametri mancanti. La sessione potrebbe essere scaduta.');
            return null;
        }

        // Validazione formato
        if (params.roomCode.length < 4 || params.roomCode.length > 10) {
            console.error('❌ Codice stanza non valido:', params.roomCode);
            this.showError('Codice stanza non valido');
            return null;
        }

        if (params.username.length < 2 || params.username.length > 20) {
            console.error('❌ Nome utente non valido:', params.username);
            this.showError('Nome utente non valido');
            return null;
        }

        // Verifica parametri opzionali ma importanti
        if (!params.team || !params.role) {
            console.warn('⚠️ Team o ruolo mancanti dai parametri URL:', {
                team: params.team,
                role: params.role
            });
            // Non bloccare, potrebbero essere recuperati dal database
        }

        return params;
    }

    setPlayerData(params) {
        this.playerData.currentRoom = params.roomCode;
        this.playerData.myPlayerId = params.playerId;
        this.playerData.myUsername = params.username;
        this.playerData.myTeam = params.team || '';
        this.playerData.myRole = params.role || '';

        console.log(`🎯 Stanza: ${this.playerData.currentRoom}`);
        console.log(`👤 Giocatore: ${this.playerData.myUsername} (${this.playerData.myPlayerId})`);
        console.log(`🏢 Team: ${this.playerData.myTeam}, Ruolo: ${this.playerData.myRole}`);
    }

    async initFirebase() {
        try {
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase non caricato');
            }

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
    // SISTEMA DI PRESENZA E NETWORKING MIGLIORATO
    // ==========================================

    setupPresenceSystem() {
        if (!this.network.database || !this.playerData.currentRoom || !this.playerData.myPlayerId) {
            return;
        }

        try {
            this.network.presenceRef = this.network.database.ref(
                `games/${this.playerData.currentRoom}/players/${this.playerData.myPlayerId}/presence`
            );
            
            // Aggiorna la presenza
            this.network.presenceRef.set({
                online: true,
                lastSeen: Date.now()
            });

            // Setup disconnection (NON rimuovere tutto il giocatore)
            this.network.presenceRef.onDisconnect().update({
                online: false,
                lastSeen: Date.now()
            });

            // Heartbeat più frequente durante il setup
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

    setupGameStateListener() {
        if (this.network.gameListener) {
            this.network.gameListener.off();
        }

        const gameRef = this.network.database.ref(`games/${this.playerData.currentRoom}`);
        
        this.network.gameListener = gameRef.on('value', async (snapshot) => {
            const gameData = snapshot.val();
            if (!gameData) {
                console.log('⚠️ Gioco non esistente, tornando alla lobby...');
                this.handleGameNotFound();
                return;
            }

            this.gameData.firebaseGameData = gameData;
            await this.syncGameState(gameData);
        });
    }

    async handleGameNotFound() {
        // Più gentile: chiedi conferma prima di reindirizzare
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
    // SINCRONIZZAZIONE STATO GIOCO MIGLIORATA
    // ==========================================

    async syncGameState(gameData) {
        if (this.gameState.updatingFromFirebase) return;
        
        // Lock per prevenire race conditions
        this.gameState.updatingFromFirebase = true;

        try {
            // Verifica integrità dati
            if (!this.validateGameData(gameData)) {
                console.warn('⚠️ Dati gioco non validi, richiedendo re-sync...');
                await this.requestGameSync();
                return;
            }

            // Controlla se il gioco è terminato
            if (gameData.winner && !this.gameState.gameEnded) {
                this.gameState.gameEnded = true;
                this.showVictoryScreen(gameData.winner);
                return;
            }

            // Sincronizza componenti del gioco
            if (gameData.players) {
                this.syncPlayers(gameData.players);
            }

            if (gameData.gameState) {
                this.gameState.currentPlayerIndex = gameData.gameState.currentPlayerIndex || 0;
                this.gameState.currentMovesMade = gameData.gameState.currentMovesMade || 0;
                this.gameState.bombsPlacedThisTurn = gameData.gameState.bombsPlacedThisTurn || 0;
            }

            if (gameData.bombs) {
                this.syncBombs(gameData.bombs);
            }

            if (gameData.gameBoard && gameData.gameBoard.rocks) {
                this.syncRocks(gameData.gameBoard.rocks);
            }

            // Aggiorna UI
            this.updatePlayerPositions();
            this.updateTurnIndicator();
            this.setupPlayerControls();

            console.log('🔄 Stato gioco sincronizzato da Firebase');
        } catch (error) {
            console.error('❌ Errore sincronizzazione:', error);
        } finally {
            this.gameState.updatingFromFirebase = false;
        }
    }

    validateGameData(gameData) {
        if (!gameData || !gameData.players) {
            return false;
        }

        // Verifica che i giocatori abbiano le proprietà necessarie
        const players = Object.values(gameData.players);
        for (const player of players) {
            if (!player.username || player.row === undefined || player.col === undefined) {
                return false;
            }
        }

        return true;
    }

    async requestGameSync() {
        try {
            // Richiedi una nuova sincronizzazione
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

    syncPlayers(firebasePlayers) {
        const playersArray = Object.entries(firebasePlayers).map(([id, player]) => ({
            id: this.gameData.players.findIndex(p => p.firebaseId === id) + 1 || this.gameData.players.length + 1,
            firebaseId: id,
            name: player.username,
            row: player.row || 0,
            col: player.col || 0,
            role: player.role,
            team: player.team,
            hasFlag: player.hasFlag || false,
            active: player.active || false,
            isAlive: player.isAlive !== false
        }));

        playersArray.sort((a, b) => {
            if (a.team === 'top' && b.team === 'bottom') return -1;
            if (a.team === 'bottom' && b.team === 'top') return 1;
            return a.joinedAt - b.joinedAt;
        });

        this.gameData.players = playersArray;
    }

    syncBombs(firebaseBombs) {
        this.gameData.bombs = Array.isArray(firebaseBombs) ? firebaseBombs : [];
        this.updateBombsDisplay();
    }

    syncRocks(firebaseRocks) {
        // Rimuovi rocce esistenti
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                this.ui.tbl.rows[i].cells[j].classList.remove("rock-cell");
            }
        }

        // Aggiungi rocce dal database
        if (Array.isArray(firebaseRocks)) {
            firebaseRocks.forEach(rock => {
                if (rock.row >= 0 && rock.row < GAME_CONFIG.ROWS && 
                    rock.col >= 0 && rock.col < GAME_CONFIG.COLS) {
                    this.ui.tbl.rows[rock.row].cells[rock.col].classList.add("rock-cell");
                }
            });
        }
    }

    // ==========================================
    // INIZIALIZZAZIONE GIOCO MIGLIORATA
    // ==========================================

    async initializeGame() {
        try {
            // 1. Registra la presenza del giocatore PRIMA di tutto
            await this.registerPlayerPresence();
            
            // 2. Attendi che il gioco sia pronto per l'inizializzazione
            const gameData = await this.waitForGameReadiness();
            
            // 3. Inizializza solo se necessario e con meccanismo di lock
            await this.safeInitializeGameState(gameData);
            
            // 4. Setup listener e UI
            this.setupGameStateListener();
            this.makeMap("mapcontent", GAME_CONFIG.ROWS, GAME_CONFIG.COLS);
            
            document.getElementById('contentbox').style.display = 'flex';
            this.gameState.gameStarted = true;
            this.hideLoadingScreen();

            console.log('✅ Gioco inizializzato con successo');
        } catch (error) {
            console.error('❌ Errore inizializzazione gioco:', error);
            this.showError('Errore durante l\'inizializzazione del gioco');
        }
    }

    async registerPlayerPresence() {
        try {
            console.log('📝 Registrazione presenza giocatore...');
            
            // Prima verifica se il giocatore esiste già nel database
            const playerRef = this.network.database.ref(
                `games/${this.playerData.currentRoom}/players/${this.playerData.myPlayerId}`
            );
            
            const existingSnapshot = await playerRef.once('value');
            const existingPlayer = existingSnapshot.val();
            
            // Funzione helper per evitare valori undefined
            const safeValue = (value, defaultValue) => value !== undefined && value !== null ? value : defaultValue;
            
            // Dati da mantenere se il giocatore esiste già
            const preservedData = {
                username: safeValue(existingPlayer?.username, this.playerData.myUsername),
                team: safeValue(existingPlayer?.team, this.playerData.myTeam),
                role: safeValue(existingPlayer?.role, this.playerData.myRole),
                joinedAt: safeValue(existingPlayer?.joinedAt, Date.now()),
                hasFlag: safeValue(existingPlayer?.hasFlag, false),
                active: safeValue(existingPlayer?.active, false),
                isAlive: safeValue(existingPlayer?.isAlive, true),
                presence: {
                    online: true,
                    lastSeen: Date.now()
                }
            };

            // Aggiungi row e col solo se esistono e sono validi
            if (existingPlayer && 
                typeof existingPlayer.row === 'number' && 
                typeof existingPlayer.col === 'number') {
                preservedData.row = existingPlayer.row;
                preservedData.col = existingPlayer.col;
            }
            // Se il giocatore non ha posizione, non aggiungerla ora
            // Sarà impostata durante l'inizializzazione del gioco

            console.log('📋 Dati giocatore da salvare:', preservedData);

            // Aggiorna i dati del giocatore
            await playerRef.set(preservedData);

            console.log('✅ Presenza giocatore registrata con successo');
        } catch (error) {
            console.error('❌ Errore registrazione presenza:', error);
            throw error;
        }
    }

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

                // Se il gioco è già inizializzato, restituisci i dati
                if (gameData.gameState && gameData.gameState.gameStarted) {
                    console.log('✅ Gioco già inizializzato, usando dati esistenti');
                    return gameData;
                }

                // MIGLIORAMENTO: Verifica che tutti i giocatori attesi siano presenti
                // Usa i metadati dal database del gioco invece che dalla lobby
                const expectedPlayerCount = gameData.playerCount || Object.keys(gameData.players || {}).length;
                const currentPlayerCount = Object.keys(gameData.players || {}).length;

                console.log(`🔄 Giocatori presenti: ${currentPlayerCount}/${expectedPlayerCount}`);

                // Se tutti i giocatori attesi sono presenti, procedi
                if (currentPlayerCount >= expectedPlayerCount && expectedPlayerCount >= 2) {
                    console.log('✅ Tutti i giocatori sono presenti, procedendo con l\'inizializzazione');
                    return gameData;
                }

                // Se aspettiamo da troppo tempo con pochi giocatori, procedi comunque
                const waitingTime = Date.now() - (gameData.gameStartedFinal || Date.now());
                if (waitingTime > 5000 && currentPlayerCount >= 2) {
                    console.log(`⏰ Timeout attesa giocatori (${waitingTime}ms), procedendo con ${currentPlayerCount} giocatori`);
                    return gameData;
                }

                // Attendi un po' prima del prossimo controllo
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn('⚠️ Errore durante attesa:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error('Timeout: Non tutti i giocatori sono stati caricati');
    }

    async getExpectedPlayerCount() {
        try {
            // CORREZIONE: Cerca nei dati del gioco, non nella lobby
            const gameRef = this.network.database.ref(`games/${this.playerData.currentRoom}`);
            const snapshot = await gameRef.once('value');
            const gameData = snapshot.val();
            
            if (gameData && gameData.players) {
                const playerCount = Object.keys(gameData.players).length;
                console.log(`🔍 Trovati ${playerCount} giocatori nel database del gioco`);
                return playerCount;
            }
            
            // Se abbiamo metadati sul numero di giocatori
            if (gameData && gameData.playerCount) {
                console.log(`🔍 Numero giocatori da metadati: ${gameData.playerCount}`);
                return gameData.playerCount;
            }
            
            // Fallback: assumi almeno 2 giocatori
            console.warn('⚠️ Non riesco a determinare il numero esatto di giocatori, usando fallback: 2');
            return 2;
        } catch (error) {
            console.warn('⚠️ Errore nel determinare il numero di giocatori attesi:', error);
            return 2; // Fallback
        }
    }

    async safeInitializeGameState(gameData) {
        // Se il gioco è già inizializzato, non fare nulla
        if (gameData.gameState && gameData.gameState.gameStarted) {
            console.log('✅ Gioco già inizializzato');
            return;
        }

        // Usa un lock distribuito per evitare inizializzazioni multiple
        const lockRef = this.network.database.ref(
            `games/${this.playerData.currentRoom}/initializationLock`
        );

        try {
            // Prova ad acquisire il lock
            const lockResult = await lockRef.transaction((currentValue) => {
                if (currentValue === null) {
                    return {
                        playerId: this.playerData.myPlayerId,
                        timestamp: Date.now()
                    };
                }
                // Se il lock è già acquisito da qualcun altro
                return undefined;
            });

            if (lockResult.committed) {
                console.log('🔒 Lock acquisito, inizializzando gioco...');
                await this.initializeGameState(gameData);
                
                // Rilascia il lock
                await lockRef.remove();
                console.log('🔓 Lock rilasciato');
            } else {
                console.log('⏳ Un altro giocatore sta inizializzando...');
                // Attendi che l'inizializzazione sia completata
                await this.waitForInitialization();
            }
        } catch (error) {
            console.error('❌ Errore durante acquisizione lock:', error);
            // Rilascia il lock in caso di errore
            await lockRef.remove();
            throw error;
        }
    }

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

    async initializeGameState(gameData) {
        try {
            const players = gameData.players || {};
            const playersArray = Object.entries(players);
            
            const updatedPlayers = {};
            let playerIndex = 0;
            let topCount = 0;
            let bottomCount = 0;

            playersArray.forEach(([id, player]) => {
                let position = { row: 0, col: 0 };
                
                if (player.team === 'top') {
                    position = topCount === 0 ? { row: 0, col: 12 } : { row: 0, col: 14 };
                    topCount++;
                } else if (player.team === 'bottom') {
                    position = bottomCount === 0 ? { row: 15, col: 12 } : { row: 15, col: 14 };
                    bottomCount++;
                }

                updatedPlayers[id] = {
                    ...player,
                    row: position.row,
                    col: position.col,
                    hasFlag: false,
                    active: playerIndex === 0,
                    isAlive: true
                };
                playerIndex++;
            });

            // Genera rocce casuali
            const rocks = this.generateRandomRocks();

            // Salva stato iniziale atomicamente
            await this.network.database.ref(`games/${this.playerData.currentRoom}`).update({
                players: updatedPlayers,
                gameState: {
                    currentPlayerIndex: 0,
                    currentMovesMade: 0,
                    bombsPlacedThisTurn: 0,
                    gameStarted: true
                },
                bombs: [],
                gameBoard: {
                    rocks: rocks,
                    flags: {
                        top: { row: 0, col: 13 },
                        bottom: { row: 15, col: 13 }
                    }
                },
                winner: null
            });

            console.log('🎮 Stato del gioco inizializzato');
        } catch (error) {
            console.error('❌ Errore inizializzazione stato gioco:', error);
            throw error;
        }
    }

    generateRandomRocks() {
        const rocks = [];
        for (let i = 1; i < GAME_CONFIG.ROWS - 1; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                // Evita posizioni di spawn e bandiere
                if ((i === 1 && (j === 12 || j === 13 || j === 14)) || 
                    (i === 14 && (j === 12 || j === 13 || j === 14))) {
                    continue;
                }
                
                if (Math.random() < GAME_CONFIG.ROCK_PROBABILITY) {
                    rocks.push({ row: i, col: j });
                }
            }
        }
        return rocks;
    }

    // ==========================================
    // GESTIONE MOVIMENTO E AZIONI
    // ==========================================

    isMyTurn() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        return currentPlayer && currentPlayer.firebaseId === this.playerData.myPlayerId;
    }

    handleKeyPress(e) {
        if (!this.gameState.gameStarted || this.gameState.gameEnded || !this.isMyTurn() || 
            this.gameState.constructionMode || this.gameState.bombMode || this.gameState.knifeMode) {
            return;
        }

        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        if (!currentPlayer || !currentPlayer.isAlive) return;

        if (e.key.toLowerCase() === ' ') {
            this.endTurn();
            return;
        }

        if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) return;

        let newRow = currentPlayer.row;
        let newCol = currentPlayer.col;
        
        switch(e.key.toLowerCase()) {
            case 'w': newRow--; break;
            case 'a': newCol--; break;
            case 's': newRow++; break;
            case 'd': newCol++; break;
            default: return;
        }
        
        if (!this.isValidMove(newRow, newCol)) return;

        this.updatePlayerPosition(newRow, newCol);
    }

    isValidMove(newRow, newCol) {
        if (newRow < 0 || newRow >= GAME_CONFIG.ROWS || newCol < 0 || newCol >= GAME_CONFIG.COLS) {
            return false;
        }
        
        let targetCell = this.ui.tbl.rows[newRow].cells[newCol];
        if (targetCell.classList.contains("rock-cell") || targetCell.classList.contains("bomb-cell")) {
            return false;
        }
        
        const cellHasPlayer = this.gameData.players.some(p => 
            p.row === newRow && p.col === newCol && p.isAlive
        );
        return !cellHasPlayer;
    }

    async updatePlayerPosition(newRow, newCol) {
        try {
            const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
            const targetCell = this.ui.tbl.rows[newRow].cells[newCol];
            
            let hasFlag = currentPlayer.hasFlag;
            let flagUpdate = {};
            
            // Logica cattura bandiera
            if (!hasFlag) {
                if (currentPlayer.team === 'bottom' && targetCell.dataset.flagType === 'top') {
                    hasFlag = true;
                    flagUpdate[`gameBoard/flags/top/captured`] = true;
                } else if (currentPlayer.team === 'top' && targetCell.dataset.flagType === 'bottom') {
                    hasFlag = true;
                    flagUpdate[`gameBoard/flags/bottom/captured`] = true;
                }
            } else {
                // Controllo vittoria
                if ((currentPlayer.team === 'bottom' && targetCell.dataset.flagType === 'bottom') || 
                    (currentPlayer.team === 'top' && targetCell.dataset.flagType === 'top')) {
                    await this.network.database.ref(`games/${this.playerData.currentRoom}/winner`).set(currentPlayer.team);
                    return;
                }
            }

            // Aggiornamento atomico con retry
            const updates = {
                [`players/${this.playerData.myPlayerId}/row`]: newRow,
                [`players/${this.playerData.myPlayerId}/col`]: newCol,
                [`players/${this.playerData.myPlayerId}/hasFlag`]: hasFlag,
                [`gameState/currentMovesMade`]: this.gameState.currentMovesMade + 1,
                ...flagUpdate
            };

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

            // Auto-fine turno dopo max mosse
            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                this.endTurn();
            }

        } catch (error) {
            console.error('❌ Errore aggiornamento posizione:', error);
            this.showError('Errore durante il movimento');
        }
    }

    async endTurn() {
        if (!this.isMyTurn()) return;

        try {
            // Reset modalità
            this.resetModes();

            // Processa esplosioni bombe
            await this.processBombExplosions();

            // Trova prossimo giocatore
            const nextPlayerIndex = this.findNextAlivePlayer(this.gameState.currentPlayerIndex);
            
            if (nextPlayerIndex === -1) {
                await this.network.database.ref(`games/${this.playerData.currentRoom}/winner`).set('draw');
                return;
            }

            // Aggiornamento atomico turno
            const updates = {
                'gameState/currentPlayerIndex': nextPlayerIndex,
                'gameState/currentMovesMade': 0,
                'gameState/bombsPlacedThisTurn': 0
            };

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

    findNextAlivePlayer(startIndex) {
        let index = startIndex;
        let attempts = 0;
        
        do {
            index = (index + 1) % this.gameData.players.length;
            attempts++;
            
            if (attempts > this.gameData.players.length) {
                return -1;
            }
            
            if (this.gameData.players[index] && this.gameData.players[index].isAlive) {
                return index;
            }
        } while (index !== startIndex);
        
        return -1;
    }

    // ==========================================
    // GESTIONE BOMBE
    // ==========================================

    async processBombExplosions() {
        const explodingBombs = this.gameData.bombs.filter(bomb => bomb.timer <= 1);
        
        if (explodingBombs.length === 0) {
            const updatedBombs = this.gameData.bombs.map(bomb => ({
                ...bomb,
                timer: bomb.timer - 1
            })).filter(bomb => bomb.timer > 0);
            
            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}/bombs`).set(updatedBombs);
            });
            return;
        }

        try {
            let playerUpdates = {};
            let playersKilled = [];
            let updatedRocks = [...(this.gameData.firebaseGameData.gameBoard?.rocks || [])];

            // Processa esplosioni
            for (const bomb of explodingBombs) {
                for (let i = Math.max(0, bomb.row - 1); i <= Math.min(GAME_CONFIG.ROWS - 1, bomb.row + 1); i++) {
                    for (let j = Math.max(0, bomb.col - 1); j <= Math.min(GAME_CONFIG.COLS - 1, bomb.col + 1); j++) {
                        
                        // Distruggi rocce
                        const rockIndex = updatedRocks.findIndex(rock => rock.row === i && rock.col === j);
                        if (rockIndex !== -1) {
                            updatedRocks.splice(rockIndex, 1);
                        }

                        // Uccidi giocatori
                        const playerHit = this.gameData.players.find(p => 
                            p.row === i && p.col === j && p.isAlive
                        );
                        if (playerHit && !playersKilled.includes(playerHit.firebaseId)) {
                            playersKilled.push(playerHit.firebaseId);
                            
                            let spawnPos = this.getSpawnPosition(playerHit.team, playerHit.firebaseId);
                            
                            playerUpdates[`players/${playerHit.firebaseId}/isAlive`] = false;
                            playerUpdates[`players/${playerHit.firebaseId}/row`] = spawnPos.row;
                            playerUpdates[`players/${playerHit.firebaseId}/col`] = spawnPos.col;
                            playerUpdates[`players/${playerHit.firebaseId}/hasFlag`] = false;
                            
                            if (playerHit.hasFlag) {
                                const flagPos = playerHit.team === 'top' ? 'bottom' : 'top';
                                playerUpdates[`gameBoard/flags/${flagPos}/captured`] = false;
                            }
                        }
                    }
                }
            }

            // Aggiorna bombe
            const updatedBombs = this.gameData.bombs.map(bomb => ({
                ...bomb,
                timer: bomb.timer - 1
            })).filter(bomb => bomb.timer > 0);

            // Aggiornamento atomico
            const updates = {
                bombs: updatedBombs,
                'gameBoard/rocks': updatedRocks,
                ...playerUpdates
            };

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

            await this.checkGameEnd();

        } catch (error) {
            console.error('❌ Errore esplosione bombe:', error);
            throw error;
        }
    }

    getSpawnPosition(team, playerId) {
        if (team === 'top') {
            return this.gameData.players.findIndex(p => p.firebaseId === playerId && p.team === 'top') === 0 
                ? { row: 0, col: 12 } 
                : { row: 0, col: 14 };
        } else {
            return this.gameData.players.findIndex(p => p.firebaseId === playerId && p.team === 'bottom') === 0 
                ? { row: 15, col: 12 } 
                : { row: 15, col: 14 };
        }
    }

    async checkGameEnd() {
        const alivePlayers = this.gameData.players.filter(p => p.isAlive);
        const aliveTeams = new Set(alivePlayers.map(p => p.team));
        
        let winner = null;
        
        if (aliveTeams.size === 1) {
            winner = aliveTeams.values().next().value;
        } else if (aliveTeams.size === 0) {
            winner = 'draw';
        } else if (alivePlayers.length === 1) {
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

    async placeBomb(row, col) {
        if (!this.isMyTurn() || this.gameState.bombsPlacedThisTurn >= GAME_CONFIG.MAX_BOMBS_PER_TURN) {
            return;
        }

        try {
            const newBomb = {
                row: row,
                col: col,
                timer: GAME_CONFIG.BOMB_TIMER
            };

            const updatedBombs = [...this.gameData.bombs, newBomb];
            
            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update({
                    bombs: updatedBombs,
                    'gameState/bombsPlacedThisTurn': this.gameState.bombsPlacedThisTurn + 1,
                    'gameState/currentMovesMade': this.gameState.currentMovesMade + 1
                });
            });

            this.gameState.bombMode = false;
            this.clearBombTargets();

            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                setTimeout(() => this.endTurn(), 100);
            }

        } catch (error) {
            console.error('❌ Errore piazzamento bomba:', error);
            this.showError('Errore durante il piazzamento della bomba');
        }
    }

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

            this.gameState.constructionMode = false;
            this.clearBuildableHighlights();

            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                setTimeout(() => this.endTurn(), 100);
            }

        } catch (error) {
            console.error('❌ Errore costruzione muro:', error);
            this.showError('Errore durante la costruzione');
        }
    }

    async knifeAttack(row, col) {
        if (!this.isMyTurn()) return;

        try {
            const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
            let updates = {
                'gameState/currentMovesMade': this.gameState.currentMovesMade + 1
            };

            // Distruzione rocce
            const currentRocks = this.gameData.firebaseGameData.gameBoard?.rocks || [];
            const rockIndex = currentRocks.findIndex(rock => rock.row === row && rock.col === col);
            
            if (rockIndex !== -1) {
                const updatedRocks = currentRocks.filter((_, index) => index !== rockIndex);
                updates['gameBoard/rocks'] = updatedRocks;
            }

            // Attacco giocatore
            const targetPlayer = this.gameData.players.find(p => 
                p.row === row && p.col === col && p.isAlive && p.team !== currentPlayer.team
            );

            if (targetPlayer) {
                const spawnPos = this.getSpawnPosition(targetPlayer.team, targetPlayer.firebaseId);
                
                updates[`players/${targetPlayer.firebaseId}/isAlive`] = false;
                updates[`players/${targetPlayer.firebaseId}/row`] = spawnPos.row;
                updates[`players/${targetPlayer.firebaseId}/col`] = spawnPos.col;
                updates[`players/${targetPlayer.firebaseId}/hasFlag`] = false;
                
                if (targetPlayer.hasFlag) {
                    const flagPos = targetPlayer.team === 'top' ? 'bottom' : 'top';
                    updates[`gameBoard/flags/${flagPos}/captured`] = false;
                }
            }

            await this.executeWithRetry(async () => {
                await this.network.database.ref(`games/${this.playerData.currentRoom}`).update(updates);
            });

            this.gameState.knifeMode = false;
            this.clearKnifeTargets();

            await this.checkGameEnd();

            if (this.gameState.currentMovesMade >= GAME_CONFIG.MAX_MOVES_PER_TURN) {
                setTimeout(() => this.endTurn(), 100);
            }

        } catch (error) {
            console.error('❌ Errore attacco coltello:', error);
            this.showError('Errore durante l\'attacco');
        }
    }

    // ==========================================
    // INTERFACCIA UTENTE
    // ==========================================

    updatePlayerPositions() {
        // Reset celle
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
        
        // Aggiorna giocatori
        this.gameData.players.forEach((player, index) => {
            let cell = this.ui.tbl.rows[player.row].cells[player.col];
            cell.classList.add(`player${index + 1}-cell`);
            cell.dataset.player = index + 1;
            
            if (!player.isAlive) {
                cell.classList.add("dead-player");
                return;
            }
            
            if (player.role === 'bomber') {
                cell.classList.add("bomber");
            } else {
                cell.classList.add("constructor");
            }
            
            if (player.hasFlag) {
                cell.classList.add("player-with-flag");
            }
            
            if (player.active) {
                cell.classList.add("active-player");
                
                if (this.gameState.knifeMode && this.isMyTurn()) {
                    cell.classList.add("knife-mode-active");
                }
            }
        });
    }

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
        
        const movesCounter = document.getElementById('moves-counter');
        if (movesCounter) {
            movesCounter.textContent = this.gameState.currentMovesMade;
        }
    }

    setupPlayerControls() {
        document.getElementById('construction-controls').style.display = 'none';
        document.getElementById('bomb-controls').style.display = 'none';
        document.getElementById('knife-controls').style.display = 'none';
        
        if (this.isMyTurn() && !this.gameState.gameEnded) {
            const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
            
            if (currentPlayer && currentPlayer.isAlive) {
                this.setupKnifeControls();
                
                if (currentPlayer.role === 'constructor') {
                    this.setupConstructionControls();
                } else if (currentPlayer.role === 'bomber') {
                    this.setupBombControls();
                }
            }
        }
    }

    updateBombsDisplay() {
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                this.ui.tbl.rows[i].cells[j].classList.remove("bomb-cell");
            }
        }

        this.gameData.bombs.forEach(bomb => {
            if (bomb.row >= 0 && bomb.row < GAME_CONFIG.ROWS && 
                bomb.col >= 0 && bomb.col < GAME_CONFIG.COLS) {
                this.ui.tbl.rows[bomb.row].cells[bomb.col].classList.add("bomb-cell");
            }
        });
    }

    // ==========================================
    // CONTROLLI UTENTE
    // ==========================================

    setupConstructionControls() {
        const buildBtn = document.getElementById('build-wall-btn');
        buildBtn.onclick = () => this.toggleConstructionMode();
        document.getElementById('construction-controls').style.display = 'block';
    }

    toggleConstructionMode() {
        if (!this.isMyTurn()) return;
        
        this.gameState.constructionMode = !this.gameState.constructionMode;
        
        if (this.gameState.constructionMode) {
            this.highlightBuildableCells();
        } else {
            this.clearBuildableHighlights();
        }
    }

    highlightBuildableCells() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
                
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

    clearBuildableHighlights() {
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove("buildable");
                cell.onclick = null;
            }
        }
    }

    setupBombControls() {
        const bombBtn = document.getElementById('place-bomb-btn');
        bombBtn.onclick = () => this.toggleBombMode();
        document.getElementById('bomb-controls').style.display = 'block';
    }

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

    highlightBombTargets() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
                
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

    clearBombTargets() {
        for (let i = 0; i < GAME_CONFIG.ROWS; i++) {
            for (let j = 0; j < GAME_CONFIG.COLS; j++) {
                const cell = this.ui.tbl.rows[i].cells[j];
                cell.classList.remove("bomb-target");
                cell.onclick = null;
            }
        }
    }

    setupKnifeControls() {
        const knifeBtn = document.getElementById('use-knife-btn');
        knifeBtn.onclick = () => this.toggleKnifeMode();
        document.getElementById('knife-controls').style.display = 'block';
    }

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

    highlightKnifeTargets() {
        const currentPlayer = this.gameData.players[this.gameState.currentPlayerIndex];
        
        for (let i = Math.max(0, currentPlayer.row - GAME_CONFIG.KNIFE_RANGE); 
             i <= Math.min(GAME_CONFIG.ROWS - 1, currentPlayer.row + GAME_CONFIG.KNIFE_RANGE); i++) {
            for (let j = Math.max(0, currentPlayer.col - GAME_CONFIG.KNIFE_RANGE); 
                 j <= Math.min(GAME_CONFIG.COLS - 1, currentPlayer.col + GAME_CONFIG.KNIFE_RANGE); j++) {
                
                if (i === currentPlayer.row && j === currentPlayer.col) continue;
                
                const cell = this.ui.tbl.rows[i].cells[j];
                
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
    // CREAZIONE MAPPA
    // ==========================================

    makeMap(placeholder, rows, cols) {
        const container = document.getElementById(placeholder);
        if (!container) {
            console.error("Container non trovato:", placeholder);
            return;
        }
        
        container.innerHTML = '';
        
        this.ui.tbl = document.createElement("table");
        for (let i = 0; i < rows; i++) {
            let tr = document.createElement("tr");
            for (let j = 0; j < cols; j++) {
                let td = document.createElement("td");
                td.setAttribute("class", "cella");

                if (i === 0 && j === 13) {
                    td.className += " flag-cell";
                    td.dataset.flagType = "top";
                } else if (i === rows-1 && j === 13) {
                    td.className += " flag-cell";
                    td.dataset.flagType = "bottom";
                }

                tr.appendChild(td);
            }
            this.ui.tbl.appendChild(tr);
        }

        container.appendChild(this.ui.tbl);
        document.addEventListener('keydown', this.handleKeyPress);
    }

    // ==========================================
    // UTILITÀ E GESTIONE ERRORI
    // ==========================================

    async executeWithRetry(operation, maxAttempts = GAME_CONFIG.RETRY_ATTEMPTS) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.warn(`⚠️ Tentativo ${attempt}/${maxAttempts} fallito:`, error);
                
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                await new Promise(resolve => 
                    setTimeout(resolve, GAME_CONFIG.RETRY_DELAY * attempt)
                );
            }
        }
    }

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

    async showConfirmDialog(message, title = 'Conferma') {
        return new Promise((resolve) => {
            const confirmed = confirm(`${title}\n\n${message}`);
            resolve(confirmed);
        });
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }

    goBackToLobby() {
        if (confirm('Sei sicuro di voler tornare alla lobby?')) {
            this.cleanup();
            window.location.href = '../index.html';
        }
    }

    // ==========================================
    // GESTIONE EVENTI BROWSER MIGLIORATA
    // ==========================================

    setupBrowserEvents() {
        window.addEventListener('beforeunload', this.handlePageExit);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('pagehide', this.handlePageExit);
        window.addEventListener('unload', this.handlePageExit);
    }

    handleVisibilityChange() {
        this.network.isPageVisible = !document.hidden;
        
        if (this.network.isPageVisible && this.network.database && this.network.presenceRef) {
            this.network.presenceRef.update({
                online: true,
                lastSeen: Date.now()
            }).catch(error => {
                console.error('❌ Errore aggiornamento presenza:', error);
            });
        }
    }

    handlePageExit() {
        this.cleanup();
    }

    cleanup() {
        try {
            // Rimuovi listener
            if (this.network.gameListener) {
                this.network.gameListener.off();
                this.network.gameListener = null;
            }

            // Ferma heartbeat
            if (this.network.heartbeatInterval) {
                clearInterval(this.network.heartbeatInterval);
                this.network.heartbeatInterval = null;
            }

            // Aggiorna presenza invece di rimuovere tutto
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

            // Rimuovi event listeners
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
// INIZIALIZZAZIONE GLOBALE
// ==========================================

let gameInstance = null;

window.addEventListener('DOMContentLoaded', async function() {
    try {
        gameInstance = new MultiplayerGame();
        const success = await gameInstance.initialize();
        
        if (!success) {
            console.error('❌ Inizializzazione fallita');
        }
    } catch (error) {
        console.error('❌ Errore critico:', error);
        if (gameInstance) {
            gameInstance.showError('Errore critico durante l\'inizializzazione');
        }
    }
});

// Funzioni globali per compatibilità
function goBackToLobby() {
    if (gameInstance) {
        gameInstance.goBackToLobby();
    } else {
        window.location.href = '../index.html';
    }
}