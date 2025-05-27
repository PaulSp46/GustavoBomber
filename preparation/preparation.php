<?php
    if (!isset($_GET["roomCode"])) {
        header("Location: ../index.html");
    }
?>

<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preparazione Squadra - Gustavo Bombing</title>
    <link rel="stylesheet" href="../style.css">
    <link rel="stylesheet" href="preparation.css">
</head>
<body>
    <div class="preparation-container">
        <h1>Preparazione Squadra</h1>
        
        <!-- Insegna del Saloon -->
        <div class="saloon-sign">
            <div class="saloon-banner">🤠 SCEGLI LA TUA FAZIONE 🤠</div>
        </div>

        <!-- Stanza corrente -->
        <div class="status success">
            Stanza: <span id="room-code-display"></span>
        </div>

        <!-- Selezione Team -->
        <div class="teams-selection">
            <div class="team-column team-top">
                <div class="team-header">
                    <h3>🔵 Team Nord</h3>
                    <div class="team-count">
                        <span id="team-top-count">0</span>/2 Giocatori
                    </div>
                </div>
                <div class="team-players" id="team-top-players">
                    <!-- Giocatori del team superiore -->
                </div>
                <button class="join-team-btn" id="join-top-btn" onclick="joinTeam('top')">
                    Unisciti al Team Nord
                </button>
            </div>

            <div class="team-column team-bottom">
                <div class="team-header">
                    <h3>🔴 Team Sud</h3>
                    <div class="team-count">
                        <span id="team-bottom-count">0</span>/2 Giocatori
                    </div>
                </div>
                <div class="team-players" id="team-bottom-players">
                    <!-- Giocatori del team inferiore -->
                </div>
                <button class="join-team-btn" id="join-bottom-btn" onclick="joinTeam('bottom')">
                    Unisciti al Team Sud
                </button>
            </div>
        </div>

        <!-- Sezione Ready -->
        <div class="ready-section">
            <h2>Stato Preparazione</h2>
            <div class="ready-status" id="ready-status">
                <!-- Status giocatori -->
            </div>
            
            <div id="waiting-area">
                <div class="waiting-message" id="waiting-message">
                    Aspettando che tutti i giocatori scelgano team e ruolo...
                </div>
                
                <button id="start-game-final" onclick="startFinalGame()" style="display: none;">
                    🎮 Inizia Battaglia!
                </button>
                
                <button onclick="goBackToLobby()" class="exit-btn" style="margin-top: 20px;">
                    🚪 Torna alla Lobby
                </button>
            </div>
        </div>
    </div>

    <script type="module">
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
        import { getDatabase, ref, set, onValue, update, onDisconnect, serverTimestamp, get } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

        // Configurazione Firebase
        const firebaseConfig = {
            apiKey: "AIzaSyAaFw4nAcPcFrrZACMcLoVc-0rPybpwyYU",
            authDomain: "maprace-68ba8.firebaseapp.com",
            databaseURL: "https://maprace-68ba8-default-rtdb.europe-west1.firebasedatabase.app/",
            projectId: "maprace-68ba8",
            storageBucket: "maprace-68ba8.firebasestorage.app",
            messagingSenderId: "554782611402",
            appId: "1:554782611402:web:d70f20cfe3d2cff640e133"
        };

        let app, database;
        let currentRoom = null;
        let myPlayerId = null;
        let myUsername = '';
        let myTeam = null;
        let myRole = null;
        let presenceRef = null;
        let heartbeatInterval = null;
        let isPageVisible = true;

        // Inizializza Firebase
        async function initFirebase() {
            try {
                app = initializeApp(firebaseConfig);
                database = getDatabase(app);
                console.log('✅ Firebase inizializzato');
                return true;
            } catch (error) {
                console.error('❌ Errore Firebase:', error);
                return false;
            }
        }

        // Ottieni parametri URL
        function getUrlParams() {
            const urlParams = new URLSearchParams(window.location.search);
            return {
                roomCode: urlParams.get('roomCode'),
                playerId: urlParams.get('playerId'),
                username: urlParams.get('username')
            };
        }

        // Setup sistema di presenza e heartbeat
        function setupPresenceSystem() {
            if (!database || !currentRoom || !myPlayerId) {
                console.error('❌ Parametri mancanti per il sistema di presenza');
                return;
            }

            try {
                // Riferimento per la presenza del player
                presenceRef = ref(database, `games/${currentRoom}/players/${myPlayerId}/presence`);

                // Imposta la presenza come online
                set(presenceRef, {
                    online: true,
                    lastSeen: Date.now()
                });

                // Configura Firebase onDisconnect per pulire automaticamente
                const playerRef = ref(database, `games/${currentRoom}/players/${myPlayerId}`);
                onDisconnect(playerRef).remove();

                // Setup heartbeat ogni 30 secondi
                heartbeatInterval = setInterval(() => {
                    if (isPageVisible && database && presenceRef) {
                        set(presenceRef, {
                            online: true,
                            lastSeen: Date.now()
                        }).catch(error => {
                            console.error('❌ Errore heartbeat:', error);
                        });
                    }
                }, 30000);

                // Monitora i player disconnessi (heartbeat più vecchio di 2 minuti)
                startDisconnectionMonitor();

                console.log('✅ Sistema di presenza configurato');
            } catch (error) {
                console.error('❌ Errore setup presenza:', error);
            }
        }

        // Monitora player disconnessi tramite heartbeat
        function startDisconnectionMonitor() {
            const playersRef = ref(database, `games/${currentRoom}/players`);
            
            // Controlla ogni minuto se ci sono player inattivi
            setInterval(async () => {
                try {
                    const snapshot = await get(playersRef);
                    if (!snapshot.exists()) return;

                    const players = snapshot.val();
                    const now = Date.now();
                    const disconnectionThreshold = 120000; // 2 minuti

                    for (const [playerId, player] of Object.entries(players)) {
                        if (playerId === myPlayerId) continue; // Non controllare se stesso

                        const lastSeen = player.presence?.lastSeen || 0;
                        const isInactive = (now - lastSeen) > disconnectionThreshold;

                        if (isInactive && player.presence?.online) {
                            console.log(`🔄 Player inattivo rilevato: ${player.username} (${playerId})`);
                            await removeDisconnectedPlayer(playerId, player.username);
                        }
                    }
                } catch (error) {
                    console.error('❌ Errore monitoraggio disconnessioni:', error);
                }
            }, 60000); // Controlla ogni minuto
        }

        // Setup eventi del browser per rilevare disconnessioni
        function setupBrowserEvents() {
            // Evento quando la pagina sta per essere chiusa
            window.addEventListener('beforeunload', handlePageExit);
            
            // Evento quando la pagina diventa invisibile/visibile
            document.addEventListener('visibilitychange', handleVisibilityChange);
            
            // Evento quando la pagina viene nascosta (più affidabile di beforeunload)
            window.addEventListener('pagehide', handlePageExit);
            
            // Evento quando l'utente naviga via dalla pagina
            window.addEventListener('unload', handlePageExit);

            console.log('✅ Eventi browser configurati');
        }

        // Gestisce il cambio di visibilità della pagina
        function handleVisibilityChange() {
            isPageVisible = !document.hidden;
            
            if (isPageVisible) {
                // Pagina tornata visibile - aggiorna heartbeat
                if (database && presenceRef) {
                    set(presenceRef, {
                        online: true,
                        lastSeen: Date.now()
                    }).catch(error => {
                        console.error('❌ Errore aggiornamento presenza:', error);
                    });
                }
                console.log('👁️ Pagina tornata visibile');
            } else {
                console.log('👁️ Pagina nascosta');
            }
        }

        // Gestisce l'uscita dalla pagina
        function handlePageExit(event) {
            console.log('🚪 Utente sta lasciando la pagina');
            
            // Pulizia immediata (sincrona per beforeunload)
            if (database && currentRoom && myPlayerId) {
                try {
                    // Usa navigator.sendBeacon per invio affidabile durante l'uscita
                    const playerRef = ref(database, `games/${currentRoom}/players/${myPlayerId}`);
                    
                    // Prova a rimuovere immediatamente (può fallire durante beforeunload)
                    remove(playerRef).catch(error => {
                        console.error('❌ Errore rimozione immediata:', error);
                    });
                    
                } catch (error) {
                    console.error('❌ Errore cleanup uscita:', error);
                }
            }
        }

        // Rimuove un player disconnesso dal database
        async function removeDisconnectedPlayer(playerId, username) {
            try {
                const playerRef = ref(database, `games/${currentRoom}/players/${playerId}`);
                await remove(playerRef);
                
                console.log(`✅ Player rimosso: ${username} (${playerId})`);
                showNotification(`👋 ${username} ha lasciato la stanza`, 'info');
                
                // Controlla se la stanza è vuota dopo la rimozione
                await checkEmptyRoom();
                
            } catch (error) {
                console.error('❌ Errore rimozione player:', error);
            }
        }

        // Controlla se la stanza è vuota e la pulisce
        async function checkEmptyRoom() {
            try {
                const playersSnapshot = await get(ref(database, `games/${currentRoom}/players`));
                
                if (!playersSnapshot.exists() || Object.keys(playersSnapshot.val()).length === 0) {
                    console.log('🧹 Stanza vuota - pulizia in corso...');
                    
                    // Rimuovi l'intera stanza se vuota
                    await remove(ref(database, `games/${currentRoom}`));
                    console.log('✅ Stanza vuota rimossa dal database');
                }
            } catch (error) {
                console.error('❌ Errore controllo stanza vuota:', error);
            }
        }

        // Pulizia quando si lascia volontariamente
        async function cleanupOnExit() {
            try {
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }

                if (database && currentRoom && myPlayerId) {
                    const playerRef = ref(database, `games/${currentRoom}/players/${myPlayerId}`);
                    await remove(playerRef);
                    console.log('✅ Cleanup volontario completato');
                }
            } catch (error) {
                console.error('❌ Errore cleanup volontario:', error);
            }
        }

        // Inizializzazione pagina
        async function initPage() {
            const params = getUrlParams();
            
            if (!params.roomCode || !params.playerId || !params.username) {
                alert('Parametri mancanti. Tornando alla lobby...');
                window.location.href = '../index.html';
                return;
            }

            currentRoom = params.roomCode;
            myPlayerId = params.playerId;
            myUsername = params.username;

            document.getElementById('room-code-display').textContent = currentRoom;

            if (await initFirebase()) {
                setupRealtimeListeners();
                setupPresenceSystem();
                setupBrowserEvents();
            }
        }

        // Setup listener Firebase
        function setupRealtimeListeners() {
            const roomRef = ref(database, `games/${currentRoom}`);
            
            onValue(roomRef, (snapshot) => {
                const data = snapshot.val();
                
                if (!data) {
                    // La stanza non esiste più
                    console.log('⚠️ La stanza non esiste più');
                    alert('La stanza è stata chiusa. Tornando alla lobby...');
                    window.location.href = '../index.html';
                    return;
                }

                console.log('🔄 Aggiornamento Firebase ricevuto:', {
                    gamePhase: data.gamePhase,
                    gameStartedFinal: data.gameStartedFinal,
                    hasPlayers: !!data.players,
                    playerCount: data.players ? Object.keys(data.players).length : 0
                });
                
                // Controlla se il gioco è stato avviato
                if (data.gamePhase === 'playing' && data.gameStartedFinal) {
                    console.log('🎮 Gioco avviato! Reindirizzamento in corso...');
                    
                    // Verifica che abbiamo tutti i dati necessari
                    if (!data.players || !data.players[myPlayerId]) {
                        console.error('❌ Dati player mancanti durante il reindirizzamento');
                        console.log('Available players:', Object.keys(data.players || {}));
                        
                        // Riprova dopo un breve delay
                        setTimeout(() => {
                            console.log('🔄 Tentativo di re-fetch dati player...');
                            get(ref(database, `games/${currentRoom}`)).then(retrySnapshot => {
                                const retryData = retrySnapshot.val();
                                if (retryData && retryData.players && retryData.players[myPlayerId]) {
                                    handleGameStartRedirect(retryData);
                                } else {
                                    alert('Errore: dati player non trovati. Tornando alla lobby...');
                                    window.location.href = '../index.html';
                                }
                            });
                        }, 1000);
                        return;
                    }
                    
                    handleGameStartRedirect(data);
                    return; // Non aggiornare UI se stiamo reindirizzando
                }
                
                // Aggiorna UI normale se non stiamo reindirizzando
                updateUI(data);
            }, (error) => {
                console.error('❌ Errore listener Firebase:', error);
                showNotification('❌ Errore di connessione. Ricarica la pagina se il problema persiste.', 'error');
            });
        }

        // Gestisce il reindirizzamento quando il gioco viene avviato
        function handleGameStartRedirect(gameData) {
            const players = gameData.players || {};
            const currentPlayer = players[myPlayerId];
            
            if (!currentPlayer) {
                console.error('❌ Player corrente non trovato nei dati del gioco');
                console.log('Debug - My Player ID:', myPlayerId);
                console.log('Debug - Available players:', Object.keys(players));
                alert('Errore: player non trovato. Tornando alla lobby...');
                window.location.href = '../index.html';
                return;
            }
            
            console.log('🎮 Gioco avviato - preparazione reindirizzamento...');
            console.log('Debug - Current player data:', currentPlayer);
            
            // Verifica che il player abbia team e ruolo
            if (!currentPlayer.team || !currentPlayer.role) {
                console.error('❌ Player non ha team o ruolo assegnato');
                alert('Errore: team o ruolo mancante. Tornando alla lobby...');
                window.location.href = '../index.html';
                return;
            }
            
            // Mostra messaggio di caricamento
            showGameStartingNotification();
            
            // Pulisci il sistema di presenza prima del reindirizzamento
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            // CORREZIONE: Path corretto per board.php (stesso livello di preparation.php)
            const gameUrl = new URL('../game/board.php', window.location.href);
            gameUrl.searchParams.set('roomCode', currentRoom);
            gameUrl.searchParams.set('playerId', myPlayerId);
            gameUrl.searchParams.set('username', myUsername);
            gameUrl.searchParams.set('team', currentPlayer.team);
            gameUrl.searchParams.set('role', currentPlayer.role);
            gameUrl.searchParams.set('gameStarted', gameData.gameStartedFinal);
            
            console.log(`🚀 Reindirizzamento a: ${gameUrl.toString()}`);
            
            // Reindirizzamento immediato per evitare race conditions
            window.location.href = gameUrl.toString();
        }

        // Mostra notifica di avvio gioco
        function showGameStartingNotification() {
            // Rimuovi notifiche esistenti
            const existingNotifications = document.querySelectorAll('.notification, .game-starting-overlay');
            existingNotifications.forEach(notif => notif.remove());
            
            // Crea overlay di caricamento
            const overlay = document.createElement('div');
            overlay.className = 'game-starting-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.95);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                color: #f5deb3;
                font-family: 'Georgia', serif;
                text-align: center;
            `;
            
            overlay.innerHTML = `
                <div class="game-starting-content" style="
                    background: linear-gradient(145deg, rgba(139, 69, 19, 0.95) 0%, rgba(101, 67, 33, 0.9) 100%);
                    padding: 40px;
                    border-radius: 20px;
                    border: 4px solid #654321;
                    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.8);
                    animation: gameStartPulse 1.5s ease-in-out infinite alternate;
                    max-width: 500px;
                ">
                    <h1 style="font-size: 3rem; margin: 0 0 20px 0; text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.8);">
                        🎮 BATTAGLIA INIZIATA! 🎮
                    </h1>
                    <p style="font-size: 1.5rem; margin: 0 0 20px 0;">
                        Preparati al combattimento...
                    </p>
                    <p style="font-size: 1.2rem; margin: 0 0 30px 0; color: #daa520;">
                        Reindirizzamento in corso...
                    </p>
                    <div class="loading-spinner" style="
                        width: 50px;
                        height: 50px;
                        border: 4px solid rgba(245, 222, 179, 0.3);
                        border-top: 4px solid #f5deb3;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 20px auto;
                    "></div>
                    <div style="font-size: 1rem; color: #daa520; opacity: 0.8;">
                        Stanza: ${currentRoom}<br>
                        Player: ${myUsername}
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            // Aggiungi stili di animazione se non esistono già
            if (!document.getElementById('game-start-animations')) {
                const style = document.createElement('style');
                style.id = 'game-start-animations';
                style.textContent = `
                    @keyframes gameStartPulse {
                        0% { transform: scale(1) rotate(0deg); }
                        100% { transform: scale(1.02) rotate(0.5deg); }
                    }
                    
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // Timeout di sicurezza per il reindirizzamento
            setTimeout(() => {
                if (overlay.parentNode) {
                    console.warn('⚠️ Reindirizzamento non avvenuto in tempo, forzando...');
                    // Fallback: prova a ricaricare i dati e reindirizzare
                    get(ref(database, `games/${currentRoom}`)).then(snapshot => {
                        const data = snapshot.val();
                        if (data && data.gamePhase === 'playing') {
                            // Forza il reindirizzamento
                            const gameUrl = new URL('../game/board.php', window.location.href);
                            gameUrl.searchParams.set('roomCode', currentRoom);
                            gameUrl.searchParams.set('playerId', myPlayerId);
                            gameUrl.searchParams.set('username', myUsername);
                            
                            const currentPlayer = data.players[myPlayerId];
                            if (currentPlayer) {
                                gameUrl.searchParams.set('team', currentPlayer.team);
                                gameUrl.searchParams.set('role', currentPlayer.role);
                            }
                            
                            window.location.href = gameUrl.toString();
                        } else {
                            alert('Errore nel reindirizzamento. Tornando alla lobby...');
                            window.location.href = '../index.html';
                        }
                    });
                }
            }, 8000); // 8 secondi di timeout
        }

        function updateUI(roomData) {
            const players = roomData.players || {};
            
            console.log('Debug - updateUI chiamata');
            console.log('Debug - My Player ID:', myPlayerId);
            console.log('Debug - All players:', players);
            
            // Reset team containers
            document.getElementById('team-top-players').innerHTML = '';
            document.getElementById('team-bottom-players').innerHTML = '';
            
            let teamTopCount = 0;
            let teamBottomCount = 0;
            let allReady = true;
            let totalPlayers = 0;

            // Organizza giocatori per team - usa Object.entries per avere accesso alle chiavi
            Object.entries(players).forEach(([playerId, player]) => {
                totalPlayers++;
                console.log(`Debug - Processing player: ${player.name}, Firebase Key: ${playerId}`);
                
                // Aggiungi l'ID Firebase al player object per il confronto
                player.firebaseId = playerId;
                
                const playerCard = createPlayerCard(player);
                
                if (player.team === 'top') {
                    document.getElementById('team-top-players').appendChild(playerCard);
                    teamTopCount++;
                } else if (player.team === 'bottom') {
                    document.getElementById('team-bottom-players').appendChild(playerCard);
                    teamBottomCount++;
                } else {
                    // Giocatore senza team - mostrato in una zona neutra se necessario
                }

                // Controlla se tutti sono pronti (hanno team e ruolo)
                if (!player.team || !player.role) {
                    allReady = false;
                }
            });

            // Aggiorna contatori
            document.getElementById('team-top-count').textContent = teamTopCount;
            document.getElementById('team-bottom-count').textContent = teamBottomCount;

            // Aggiorna pulsanti join team
            const joinTopBtn = document.getElementById('join-top-btn');
            const joinBottomBtn = document.getElementById('join-bottom-btn');
            const currentPlayer = players[myPlayerId];
            
            console.log('Debug - Current player from Firebase:', currentPlayer);
            
            if (currentPlayer && currentPlayer.team) {
                joinTopBtn.style.display = 'none';
                joinBottomBtn.style.display = 'none';
            } else {
                joinTopBtn.disabled = teamTopCount >= 2;
                joinBottomBtn.disabled = teamBottomCount >= 2;
                joinTopBtn.style.display = teamTopCount >= 2 ? 'none' : 'block';
                joinBottomBtn.style.display = teamBottomCount >= 2 ? 'none' : 'block';
            }

            // Aggiorna status ready
            updateReadyStatus(players);

            // Mostra pulsante start se tutti pronti e utente è host
            const isHost = currentPlayer && currentPlayer.isHost;
            const startBtn = document.getElementById('start-game-final');
            
            if (allReady && totalPlayers >= 2 && isHost) {
                startBtn.style.display = 'block';
                document.getElementById('waiting-message').textContent = 'Tutti pronti! Puoi avviare la battaglia!';
            } else if (allReady && totalPlayers >= 2) {
                startBtn.style.display = 'none';
                document.getElementById('waiting-message').textContent = 'Aspettando che l\'host avvii la battaglia...';
            } else {
                startBtn.style.display = 'none';
            }
        }

        // Crea card giocatore
        function createPlayerCard(player) {
            const card = document.createElement('div');
            card.className = 'player-card';
            
            // Fix: usa il Firebase ID per il confronto
            const isCurrentUser = player.firebaseId === myPlayerId;
            
            if (isCurrentUser) {
                card.classList.add('current-user');
            }
            
            // Indicatore di connessione
            const isOnline = player.presence?.online && (Date.now() - (player.presence?.lastSeen || 0)) < 120000;
            
            console.log(`Debug - Player: ${player.name}, Firebase ID: ${player.firebaseId}, My ID: ${myPlayerId}, Is Current: ${isCurrentUser}`);
            
            card.innerHTML = `
                <div class="player-header">
                    <div class="player-name-section">
                        <div class="player-name">
                            ${player.username} ${isCurrentUser ? '(Tu)' : ''}
                            ${player.isHost ? '👑' : ''}
                            <span class="connection-indicator ${isOnline ? 'online' : 'offline'}" title="${isOnline ? 'Online' : 'Disconnesso'}">
                                ${isOnline ? '🟢' : '🔴'}
                            </span>
                        </div>
                        <div class="player-status">
                            ${isCurrentUser ? 'Il tuo personaggio' : 'Compagno di squadra'}
                        </div>
                    </div>
                    <div class="role-section">
                        ${isCurrentUser ? `
                            <select class="role-dropdown-inline ${player.role ? 'has-selection' : ''} ${player.role === 'constructor' ? 'constructor-selected' : ''} ${player.role === 'bomber' ? 'bomber-selected' : ''}" 
                                    onchange="selectRole(this.value)" 
                                    id="role-select-${player.firebaseId}">
                                <option value="" ${!player.role ? 'selected' : ''}>🎭 Scegli ruolo...</option>
                                <option value="constructor" ${player.role === 'constructor' ? 'selected' : ''}>🧱 Costruttore</option>
                                <option value="bomber" ${player.role === 'bomber' ? 'selected' : ''}>💣 Bombardiere</option>
                            </select>
                        ` : `
                            <div class="role-display ${player.role ? 'role-set' : 'role-empty'}">
                                ${player.role ? (player.role === 'constructor' ? '🧱 Costruttore' : '💣 Bombardiere') : '⏳ In attesa...'}
                            </div>
                        `}
                    </div>
                </div>
                ${player.role ? `
                    <div class="role-description">
                        ${player.role === 'constructor' ? 
                            '📝 Può costruire muri e difese per proteggere il team' : 
                            '📝 Può piazzare bombe esplosive per attaccare i nemici'
                        }
                    </div>
                ` : ''}
            `;

            return card;
        }

        // Aggiorna status ready
        function updateReadyStatus(players) {
            const container = document.getElementById('ready-status');
            container.innerHTML = '';

            Object.values(players)
                .sort((a, b) => a.joinedAt - b.joinedAt)
                .forEach(player => {
                    const statusDiv = document.createElement('div');
                    const isReady = player.team && player.role;
                    const isOnline = player.presence?.online && (Date.now() - (player.presence?.lastSeen || 0)) < 120000;
                    
                    statusDiv.className = `player-ready-status ${isReady ? 'ready' : 'not-ready'} ${!isOnline ? 'disconnected' : ''}`;
                    statusDiv.innerHTML = `
                        <strong>${player.username} ${!isOnline ? '🔴' : '🟢'}</strong>
                        <div style="margin-top: 8px;">
                            ${player.team ? `Team: ${player.team === 'top' ? '🔵 Nord' : '🔴 Sud'}` : '❌ Nessun team'}
                        </div>
                        <div>
                            ${player.role ? `Ruolo: ${player.role === 'constructor' ? '🧱' : '💣'}` : '❌ Nessun ruolo'}
                        </div>
                        <div style="margin-top: 8px; font-size: 1.2rem;">
                            ${!isOnline ? '⚠️ Disconnesso' : (isReady ? '✅ Pronto' : '⏳ In attesa')}
                        </div>
                    `;
                    
                    container.appendChild(statusDiv);
                });
        }

        
        // Unisciti a un team
        window.joinTeam = async function(team) {
            if (!database || !currentRoom || !myPlayerId) return;

            try {
                // CORREZIONE: Aggiungi await prima di isHostCheck
                const isHostResult = await isHostCheck();

                await update(ref(database, `games/${currentRoom}/players/${myPlayerId}`), {
                    username: myUsername,
                    team: team,
                    isHost: isHostResult,
                    joinedAt: Date.now(),
                    presence: {
                        online: true,
                        lastSeen: Date.now()
                    }
                });
                myTeam = team;
                
                // Effetti visivi e sonori
                playSound('success');
                const teamName = team === 'top' ? '🔵 Team Nord' : '🔴 Team Sud';
                showNotification(`⚔️ Ti sei unito al ${teamName}!`, 'success');
                
                console.log(`✅ Unito al team: ${team}, isHost: ${isHostResult}`);
            } catch (error) {
                console.error('❌ Errore unione team:', error);
                showNotification('❌ Errore durante l\'unione al team', 'error');
            }
        }

        // Controllo se il player è host della stanza
        async function isHostCheck() {
            try {
                const room = await get(ref(database, `games/${currentRoom}`));
                
                if (!room.exists()) {
                    console.log('❌ Dati della stanza non esistono');
                    return false;
                }
                
                const gameData = room.val();
                
                // Verifica che startedBy esista
                if (!gameData.startedBy) {
                    console.log('❌ startedBy non trovato nei dati della stanza');
                    return false;
                }
                
                // CORREZIONE: usa startedBy (non starterBy)
                const isHost = myPlayerId === gameData.startedBy;
                console.log(`🔍 Check host: ${myPlayerId} === ${gameData.startedBy} = ${isHost}`);
                
                return isHost;
                
            } catch (error) {
                console.error('❌ Errore nel controllo host:', error);
                return false;
            }
        }

        // Seleziona ruolo
        window.selectRole = async function(role) {
            if (!database || !currentRoom || !myPlayerId) return;

            // Se l'utente seleziona l'opzione placeholder, non fare nulla
            if (!role) return;

            try {
                await update(ref(database, `games/${currentRoom}/players/${myPlayerId}`), {
                    role: role,
                    presence: {
                        online: true,
                        lastSeen: Date.now()
                    }
                });
                myRole = role;
                
                // Aggiorna immediatamente gli stili del dropdown
                const dropdown = document.getElementById(`role-select-${myPlayerId}`);
                if (dropdown) {
                    // Reset classi
                    dropdown.classList.remove('constructor-selected', 'bomber-selected');
                    dropdown.classList.add('has-selection');
                    
                    // Aggiungi classe specifica per il ruolo
                    if (role === 'constructor') {
                        dropdown.classList.add('constructor-selected');
                    } else if (role === 'bomber') {
                        dropdown.classList.add('bomber-selected');
                    }
                    
                    // Effetto di conferma visiva più delicato per il dropdown inline
                    dropdown.style.transform = 'scale(1.02)';
                    setTimeout(() => {
                        dropdown.style.transform = 'scale(1)';
                    }, 150);
                }
                
                console.log(`✅ Ruolo selezionato: ${role}`);
                
                // Effetto sonoro e messaggio di conferma
                playSound('success');
                showNotification(`🎭 Ruolo ${role === 'constructor' ? '🧱 Costruttore' : '💣 Bombardiere'} selezionato!`, 'success');
                
            } catch (error) {
                console.error('❌ Errore selezione ruolo:', error);
                alert('Errore durante la selezione del ruolo');
                
                // Reset dropdown in caso di errore
                const dropdown = document.getElementById(`role-select-${myPlayerId}`);
                if (dropdown) {
                    dropdown.value = myRole || '';
                }
            }
        }

        // Avvia gioco finale
        window.startFinalGame = async function() {
            if (!database || !currentRoom) return;

            console.log('🎮 Avvio del gioco finale...');
            
            // Verifica di essere l'host
            const isHost = await isHostCheck();
            if (!isHost) {
                console.log('❌ Solo l\'host può avviare il gioco');
                showNotification('❌ Solo l\'host può avviare il gioco', 'error');
                return;
            }

            // Verifica che tutti i giocatori siano pronti
            const roomSnapshot = await get(ref(database, `games/${currentRoom}`));
            if (!roomSnapshot.exists()) {
                showNotification('❌ Errore: stanza non trovata', 'error');
                return;
            }

            const roomData = roomSnapshot.val();
            const players = roomData.players || {};
            const playersList = Object.values(players);
            
            // Verifica che ci siano almeno 2 giocatori
            if (playersList.length < 2) {
                showNotification('❌ Servono almeno 2 giocatori per iniziare', 'error');
                return;
            }
            
            // Verifica che tutti abbiano team e ruolo
            const allReady = playersList.every(player => player.team && player.role);
            if (!allReady) {
                showNotification('❌ Non tutti i giocatori sono pronti', 'error');
                return;
            }

            // Mostra messaggio di conferma prima dell'avvio
            const startBtn = document.getElementById('start-game-final');
            const originalText = startBtn.textContent;
            startBtn.disabled = true;
            startBtn.textContent = '🚀 Avviando battaglia...';
            startBtn.style.background = 'linear-gradient(145deg, #228b22, #32cd32)';

            try {
                // Aggiorna lo stato del gioco nel database
                const gameStartTime = Date.now();
                
                await update(ref(database, `games/${currentRoom}`), {
                    gamePhase: 'playing',
                    gameStartedFinal: gameStartTime,
                    gameStatus: 'active',
                    startedBy: myPlayerId, // Assicurati che sia registrato chi ha avviato
                    // Aggiungi metadati utili per il debugging
                    startedAt: new Date(gameStartTime).toISOString(),
                    playerCount: playersList.length
                });

                console.log('✅ Stato gioco aggiornato con successo');
                console.log('🔄 Tutti i giocatori verranno reindirizzati automaticamente...');
                
                // Mostra notifica di successo
                showNotification('🎮 Battaglia avviata! Reindirizzamento in corso...', 'success');
                
                // Il reindirizzamento sarà gestito automaticamente dal listener Firebase
                // Il listener si attiverà per tutti i client (incluso l'host)
                
            } catch (error) {
                console.error('❌ Errore avvio gioco:', error);
                
                // Ripristina il pulsante in caso di errore
                startBtn.disabled = false;
                startBtn.textContent = originalText;
                startBtn.style.background = '';
                
                showNotification('❌ Errore durante l\'avvio del gioco. Riprova.', 'error');
            }
        }

        // Torna alla lobby
        window.goBackToLobby = async function() {
            if (confirm('Sei sicuro di voler tornare alla lobby?')) {
                await cleanupOnExit();
                window.location.href = '../index.html';
            }
        }

        // Mostra notifica temporanea
        function showNotification(message, type = 'info') {
            // Rimuovi notifiche esistenti
            const existingNotification = document.querySelector('.notification');
            if (existingNotification) {
                existingNotification.remove();
            }

            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.style.cssText = `
                position: fixed;
                top: 30px;
                right: 30px;
                background: linear-gradient(145deg, rgba(139, 69, 19, 0.95) 0%, rgba(101, 67, 33, 0.9) 100%);
                color: #f5deb3;
                padding: 16px 24px;
                border-radius: 12px;
                border: 3px solid #654321;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8);
                z-index: 1000;
                font-family: 'Georgia', serif;
                font-weight: bold;
                font-size: 1.1rem;
                max-width: 300px;
                transform: translateX(400px);
                transition: all 0.4s ease;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            `;

            if (type === 'success') {
                notification.style.borderColor = '#228b22';
                notification.style.background = 'linear-gradient(145deg, rgba(34, 139, 34, 0.3) 0%, rgba(139, 69, 19, 0.95) 50%, rgba(101, 67, 33, 0.9) 100%)';
                notification.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.8), 0 0 25px rgba(34, 139, 34, 0.4)';
            } else if (type === 'error') {
                notification.style.borderColor = '#dc143c';
                notification.style.background = 'linear-gradient(145deg, rgba(220, 20, 60, 0.3) 0%, rgba(139, 69, 19, 0.95) 50%, rgba(101, 67, 33, 0.9) 100%)';
                notification.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.8), 0 0 25px rgba(220, 20, 60, 0.4)';
            }

            notification.textContent = message;
            document.body.appendChild(notification);

            // Animazione di entrata
            requestAnimationFrame(() => {
                notification.style.transform = 'translateX(0)';
            });

            // Auto rimozione dopo 3 secondi
            setTimeout(() => {
                notification.style.transform = 'translateX(400px)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 400);
            }, 3000);
        }

        // Aggiungi effetti sonori (opzionale)
        function playSound(type) {
            // Crea un suono semplice usando Web Audio API
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                if (type === 'success') {
                    // Suono di conferma (due note crescenti)
                    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
                    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
                } else if (type === 'select') {
                    // Suono di click/selezione
                    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                }

                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
            } catch (error) {
                // Ignora errori audio
                console.log('Audio non supportato');
            }
        }

        // Inizializza quando la pagina è caricata
        window.addEventListener('DOMContentLoaded', initPage);
    </script>

    <style>
        /* Stili per gli indicatori di connessione */
        .connection-indicator {
            margin-left: 8px;
            font-size: 0.8rem;
        }

        .connection-indicator.online {
            animation: pulse-green 2s infinite;
        }

        .connection-indicator.offline {
            animation: pulse-red 1s infinite;
        }

        @keyframes pulse-green {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        @keyframes pulse-red {
            0% { opacity: 1; }
            50% { opacity: 0.3; }
            100% { opacity: 1; }
        }

        .player-ready-status.disconnected {
            opacity: 0.7;
            border-left: 4px solid #dc143c;
            background: linear-gradient(90deg, rgba(220, 20, 60, 0.1) 0%, transparent 100%);
        }

        .player-card {
            position: relative;
            transition: all 0.3s ease;
        }

        .player-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        }
    </style>
</body>
</html>