<?php
    // CONTROLLO SICUREZZA: Verifica che sia stato passato il codice stanza
    // Se manca, reindirizza alla homepage
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
        
        <!-- INTERFACCIA UTENTE: Insegna del Saloon tema western -->
        <div class="saloon-sign">
            <div class="saloon-banner">🤠 SCEGLI LA TUA FAZIONE 🤠</div>
        </div>

        <!-- DISPLAY STANZA: Mostra il codice della stanza corrente -->
        <div class="status success">
            Stanza: <span id="room-code-display"></span>
        </div>

        <!-- SELEZIONE SQUADRE: Due colonne per Team Nord e Team Sud -->
        <div class="teams-selection">
            <!-- TEAM NORD (Blu) - Massimo 2 giocatori -->
            <div class="team-column team-top">
                <div class="team-header">
                    <h3>🔵 Team Nord</h3>
                    <div class="team-count">
                        <span id="team-top-count">0</span>/2 Giocatori
                    </div>
                </div>
                <div class="team-players" id="team-top-players">
                    <!-- Contenitore dinamico per i giocatori del team superiore -->
                </div>
                <button class="join-team-btn" id="join-top-btn" onclick="joinTeam('top')">
                    Unisciti al Team Nord
                </button>
            </div>

            <!-- TEAM SUD (Rosso) - Massimo 2 giocatori -->
            <div class="team-column team-bottom">
                <div class="team-header">
                    <h3>🔴 Team Sud</h3>
                    <div class="team-count">
                        <span id="team-bottom-count">0</span>/2 Giocatori
                    </div>
                </div>
                <div class="team-players" id="team-bottom-players">
                    <!-- Contenitore dinamico per i giocatori del team inferiore -->
                </div>
                <button class="join-team-btn" id="join-bottom-btn" onclick="joinTeam('bottom')">
                    Unisciti al Team Sud
                </button>
            </div>
        </div>

        <!-- SEZIONE READY: Mostra stato di preparazione e controlli di avvio -->
        <div class="ready-section">
            <h2>Stato Preparazione</h2>
            <div class="ready-status" id="ready-status">
                <!-- Status dinamico per ogni giocatore -->
            </div>
            
            <div id="waiting-area">
                <div class="waiting-message" id="waiting-message">
                    Aspettando che tutti i giocatori scelgano team e ruolo...
                </div>
                
                <!-- PULSANTE AVVIO: Visibile solo all'host quando tutti sono pronti -->
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
        // ============================================================================
        // IMPORTAZIONI FIREBASE: Moduli necessari per database real-time
        // ============================================================================
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
        import { getDatabase, ref, set, onValue, update, onDisconnect, serverTimestamp, get } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

        // ============================================================================
        // CONFIGURAZIONE FIREBASE: Credenziali per connessione al database
        // ============================================================================
        const firebaseConfig = {
            apiKey: "AIzaSyAaFw4nAcPcFrrZACMcLoVc-0rPybpwyYU",
            authDomain: "maprace-68ba8.firebaseapp.com",
            databaseURL: "https://maprace-68ba8-default-rtdb.europe-west1.firebasedatabase.app/",
            projectId: "maprace-68ba8",
            storageBucket: "maprace-68ba8.firebasestorage.app",
            messagingSenderId: "554782611402",
            appId: "1:554782611402:web:d70f20cfe3d2cff640e133"
        };

        // ============================================================================
        // VARIABILI GLOBALI: Stato dell'applicazione e riferimenti Firebase
        // ============================================================================
        let app, database;                    // Istanze Firebase
        let currentRoom = null;               // Codice stanza corrente
        let myPlayerId = null;               // ID univoco del giocatore
        let myUsername = '';                 // Nome utente del giocatore
        let myTeam = null;                   // Team assegnato ('top' o 'bottom')
        let myRole = null;                   // Ruolo assegnato ('constructor' o 'bomber')
        let presenceRef = null;              // Riferimento Firebase per presenza
        let heartbeatInterval = null;        // Intervallo per heartbeat di connessione
        let isPageVisible = true;            // Flag visibilità pagina (per ottimizzazione)

        // ============================================================================
        // INIZIALIZZAZIONE FIREBASE: Setup connessione database
        // ============================================================================
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

        // ============================================================================
        // PARSING URL: Estrae parametri dalla query string
        // ============================================================================
        function getUrlParams() {
            const urlParams = new URLSearchParams(window.location.search);
            return {
                roomCode: urlParams.get('roomCode'),    // Codice stanza
                playerId: urlParams.get('playerId'),    // ID giocatore
                username: urlParams.get('username')     // Nome utente
            };
        }

        // ============================================================================
        // SISTEMA DI PRESENZA: Gestisce connessioni/disconnessioni giocatori
        // ============================================================================
        function setupPresenceSystem() {
            if (!database || !currentRoom || !myPlayerId) {
                console.error('❌ Parametri mancanti per il sistema di presenza');
                return;
            }

            try {
                // SETUP PRESENZA: Riferimento Firebase per questo giocatore
                presenceRef = ref(database, `games/${currentRoom}/players/${myPlayerId}/presence`);

                // MARCATURA ONLINE: Imposta stato online con timestamp
                set(presenceRef, {
                    online: true,
                    lastSeen: Date.now()
                });

                // AUTO-CLEANUP: Firebase rimuove automaticamente il player alla disconnessione
                const playerRef = ref(database, `games/${currentRoom}/players/${myPlayerId}`);
                onDisconnect(playerRef).remove();

                // HEARTBEAT: Aggiorna presenza ogni 30 secondi per confermare connessione
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

                // MONITOR DISCONNESSIONI: Avvia controllo giocatori inattivi
                startDisconnectionMonitor();

                console.log('✅ Sistema di presenza configurato');
            } catch (error) {
                console.error('❌ Errore setup presenza:', error);
            }
        }

        // ============================================================================
        // MONITOR DISCONNESSIONI: Rileva e rimuove giocatori inattivi
        // ============================================================================
        function startDisconnectionMonitor() {
            const playersRef = ref(database, `games/${currentRoom}/players`);
            
            // CONTROLLO PERIODICO: Ogni minuto verifica heartbeat dei giocatori
            setInterval(async () => {
                try {
                    const snapshot = await get(playersRef);
                    if (!snapshot.exists()) return;

                    const players = snapshot.val();
                    const now = Date.now();
                    const disconnectionThreshold = 120000; // 2 minuti di inattività

                    // VERIFICA OGNI GIOCATORE: Controlla timestamp ultimo heartbeat
                    for (const [playerId, player] of Object.entries(players)) {
                        if (playerId === myPlayerId) continue; // Non controllare se stesso

                        const lastSeen = player.presence?.lastSeen || 0;
                        const isInactive = (now - lastSeen) > disconnectionThreshold;

                        // RIMOZIONE AUTOMATICA: Se inattivo da troppo tempo
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

        // ============================================================================
        // EVENTI BROWSER: Gestisce chiusura pagina e cambio visibilità
        // ============================================================================
        function setupBrowserEvents() {
            // EVENTI CHIUSURA: Diversi trigger per intercettare l'uscita dell'utente
            window.addEventListener('beforeunload', handlePageExit);      // Prima della chiusura
            document.addEventListener('visibilitychange', handleVisibilityChange); // Cambio tab
            window.addEventListener('pagehide', handlePageExit);          // Nascondere pagina
            window.addEventListener('unload', handlePageExit);            // Scaricamento pagina

            console.log('✅ Eventi browser configurati');
        }

        // ============================================================================
        // GESTIONE VISIBILITÀ: Ottimizza heartbeat quando pagina nascosta
        // ============================================================================
        function handleVisibilityChange() {
            isPageVisible = !document.hidden;
            
            if (isPageVisible) {
                // PAGINA VISIBILE: Riprende heartbeat normale
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

        // ============================================================================
        // GESTIONE USCITA: Pulizia quando utente lascia la pagina
        // ============================================================================
        function handlePageExit(event) {
            console.log('🚪 Utente sta lasciando la pagina');
            
            // PULIZIA IMMEDIATA: Rimuove giocatore dal database
            if (database && currentRoom && myPlayerId) {
                try {
                    const playerRef = ref(database, `games/${currentRoom}/players/${myPlayerId}`);
                    
                    // RIMOZIONE SINCRONA: Usa remove per pulizia immediata
                    remove(playerRef).catch(error => {
                        console.error('❌ Errore rimozione immediata:', error);
                    });
                    
                } catch (error) {
                    console.error('❌ Errore cleanup uscita:', error);
                }
            }
        }

        // ============================================================================
        // RIMOZIONE PLAYER DISCONNESSO: Cleanup database per utenti inattivi
        // ============================================================================
        async function removeDisconnectedPlayer(playerId, username) {
            try {
                const playerRef = ref(database, `games/${currentRoom}/players/${playerId}`);
                await remove(playerRef);
                
                console.log(`✅ Player rimosso: ${username} (${playerId})`);
                showNotification(`👋 ${username} ha lasciato la stanza`, 'info');
                
                // CONTROLLO STANZA VUOTA: Verifica se rimangono giocatori
                await checkEmptyRoom();
                
            } catch (error) {
                console.error('❌ Errore rimozione player:', error);
            }
        }

        // ============================================================================
        // CONTROLLO STANZA VUOTA: Rimuove stanze senza giocatori dal database
        // ============================================================================
        async function checkEmptyRoom() {
            try {
                const playersSnapshot = await get(ref(database, `games/${currentRoom}/players`));
                
                // STANZA VUOTA: Nessun giocatore rimasto
                if (!playersSnapshot.exists() || Object.keys(playersSnapshot.val()).length === 0) {
                    console.log('🧹 Stanza vuota - pulizia in corso...');
                    
                    // PULIZIA COMPLETA: Rimuove intera stanza dal database
                    await remove(ref(database, `games/${currentRoom}`));
                    console.log('✅ Stanza vuota rimossa dal database');
                }
            } catch (error) {
                console.error('❌ Errore controllo stanza vuota:', error);
            }
        }

        // ============================================================================
        // PULIZIA VOLONTARIA: Cleanup quando utente lascia intenzionalmente
        // ============================================================================
        async function cleanupOnExit() {
            try {
                // STOP HEARTBEAT: Ferma l'intervallo di presenza
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }

                // RIMOZIONE GIOCATORE: Elimina dal database
                if (database && currentRoom && myPlayerId) {
                    const playerRef = ref(database, `games/${currentRoom}/players/${myPlayerId}`);
                    await remove(playerRef);
                    console.log('✅ Cleanup volontario completato');
                }
            } catch (error) {
                console.error('❌ Errore cleanup volontario:', error);
            }
        }

        // ============================================================================
        // INIZIALIZZAZIONE PAGINA: Setup iniziale dell'applicazione
        // ============================================================================
        async function initPage() {
            // VALIDAZIONE PARAMETRI: Controlla che tutti i dati necessari siano presenti
            const params = getUrlParams();
            
            if (!params.roomCode || !params.playerId || !params.username) {
                alert('Parametri mancanti. Tornando alla lobby...');
                window.location.href = '../index.html';
                return;
            }

            // SETUP VARIABILI GLOBALI: Assegna parametri estratti dall'URL
            currentRoom = params.roomCode;
            myPlayerId = params.playerId;
            myUsername = params.username;

            // AGGIORNAMENTO UI: Mostra codice stanza nell'interfaccia
            document.getElementById('room-code-display').textContent = currentRoom;

            // INIZIALIZZAZIONE SISTEMI: Avvia Firebase e listener
            if (await initFirebase()) {
                setupRealtimeListeners();    // Listener per aggiornamenti real-time
                setupPresenceSystem();       // Sistema di presenza/heartbeat
                setupBrowserEvents();        // Gestione eventi browser
            }
        }

        // ============================================================================
        // LISTENER REAL-TIME: Ascolta cambiamenti nel database Firebase
        // ============================================================================
        function setupRealtimeListeners() {
            const roomRef = ref(database, `games/${currentRoom}`);
            
            // LISTENER PRINCIPALE: Reagisce a tutti i cambiamenti nella stanza
            onValue(roomRef, (snapshot) => {
                const data = snapshot.val();
                
                // STANZA ELIMINATA: Reindirizza se la stanza non esiste più
                if (!data) {
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
                
                // GIOCO AVVIATO: Controlla se si deve passare alla fase di gioco
                if (data.gamePhase === 'playing' && data.gameStartedFinal) {
                    console.log('🎮 Gioco avviato! Reindirizzamento in corso...');
                    
                    // VALIDAZIONE DATI: Verifica che i dati del giocatore esistano
                    if (!data.players || !data.players[myPlayerId]) {
                        console.error('❌ Dati player mancanti durante il reindirizzamento');
                        console.log('Available players:', Object.keys(data.players || {}));
                        
                        // RETRY MECHANISM: Riprova dopo un breve delay
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
                
                // AGGIORNAMENTO UI NORMALE: Se non stiamo reindirizzando
                updateUI(data);
            }, (error) => {
                console.error('❌ Errore listener Firebase:', error);
                showNotification('❌ Errore di connessione. Ricarica la pagina se il problema persiste.', 'error');
            });
        }

        // ============================================================================
        // GESTIONE AVVIO GIOCO: Reindirizza alla pagina di gioco quando inizia
        // ============================================================================
        function handleGameStartRedirect(gameData) {
            const players = gameData.players || {};
            const currentPlayer = players[myPlayerId];
            
            // VALIDAZIONE GIOCATORE: Verifica che il giocatore corrente esista
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
            
            // VALIDAZIONE SETUP: Verifica che il giocatore abbia team e ruolo
            if (!currentPlayer.team || !currentPlayer.role) {
                console.error('❌ Player non ha team o ruolo assegnato');
                alert('Errore: team o ruolo mancante. Tornando alla lobby...');
                window.location.href = '../index.html';
                return;
            }
            
            // UI LOADING: Mostra schermata di caricamento
            showGameStartingNotification();
            
            // PULIZIA PRESENZA: Ferma heartbeat prima del reindirizzamento
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            // COSTRUZIONE URL: Prepara tutti i parametri per la pagina di gioco
            const gameUrl = new URL('../game/board.php', window.location.href);
            gameUrl.searchParams.set('roomCode', currentRoom);
            gameUrl.searchParams.set('playerId', myPlayerId);
            gameUrl.searchParams.set('username', myUsername);
            gameUrl.searchParams.set('team', currentPlayer.team);
            gameUrl.searchParams.set('role', currentPlayer.role);
            gameUrl.searchParams.set('gameStarted', gameData.gameStartedFinal);
            
            console.log(`🚀 Reindirizzamento a: ${gameUrl.toString()}`);
            
            // REINDIRIZZAMENTO IMMEDIATO: Per evitare race conditions
            window.location.href = gameUrl.toString();
        }

        // ============================================================================
        // NOTIFICA AVVIO GIOCO: Overlay di caricamento per il passaggio al gioco
        // ============================================================================
        function showGameStartingNotification() {
            // RIMOZIONE NOTIFICHE: Pulisce notifiche esistenti
            const existingNotifications = document.querySelectorAll('.notification, .game-starting-overlay');
            existingNotifications.forEach(notif => notif.remove());
            
            // CREAZIONE OVERLAY: Schermata di caricamento a schermo intero
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
            
            // CONTENUTO OVERLAY: Messaggio e spinner di caricamento
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
            
            // STILI ANIMAZIONE: Aggiunge CSS per le animazioni se non esistono
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
            
            // TIMEOUT SICUREZZA: Fallback se il reindirizzamento non avviene
            setTimeout(() => {
                if (overlay.parentNode) {
                    console.warn('⚠️ Reindirizzamento non avvenuto in tempo, forzando...');
                    // FALLBACK: Prova a ricaricare i dati e reindirizzare forzatamente
                    get(ref(database, `games/${currentRoom}`)).then(snapshot => {
                        const data = snapshot.val();
                        if (data && data.gamePhase === 'playing') {
                            // REINDIRIZZAMENTO FORZATO: Costruisce nuovamente l'URL
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

        // ============================================================================
        // AGGIORNAMENTO UI: Aggiorna l'interfaccia utente con i dati Firebase
        // ============================================================================
        function updateUI(roomData) {
            const players = roomData.players || {};
            
            console.log('Debug - updateUI chiamata');
            console.log('Debug - My Player ID:', myPlayerId);
            console.log('Debug - All players:', players);
            
            // RESET CONTAINERS: Pulisce le liste dei giocatori
            document.getElementById('team-top-players').innerHTML = '';
            document.getElementById('team-bottom-players').innerHTML = '';
            
            // CONTATORI: Inizializza contatori per team e stato
            let teamTopCount = 0;
            let teamBottomCount = 0;
            let allReady = true;
            let totalPlayers = 0;

            // ORGANIZZAZIONE GIOCATORI: Distribuisce giocatori per team
            Object.entries(players).forEach(([playerId, player]) => {
                totalPlayers++;
                console.log(`Debug - Processing player: ${player.name}, Firebase Key: ${playerId}`);
                
                // IDENTIFICATORE FIREBASE: Aggiunge ID per confronti
                player.firebaseId = playerId;
                
                // CREAZIONE CARD: Genera elemento UI per il giocatore
                const playerCard = createPlayerCard(player);
                
                // ASSEGNAZIONE TEAM: Posiziona il giocatore nel team corretto
                if (player.team === 'top') {
                    document.getElementById('team-top-players').appendChild(playerCard);
                    teamTopCount++;
                } else if (player.team === 'bottom') {
                    document.getElementById('team-bottom-players').appendChild(playerCard);
                    teamBottomCount++;
                }

                // CONTROLLO READY: Verifica se tutti i giocatori sono pronti
                if (!player.team || !player.role) {
                    allReady = false;
                }
            });

            // AGGIORNAMENTO CONTATORI: Mostra numero giocatori per team
            document.getElementById('team-top-count').textContent = teamTopCount;
            document.getElementById('team-bottom-count').textContent = teamBottomCount;

            // GESTIONE PULSANTI JOIN: Mostra/nasconde pulsanti unione team
            const joinTopBtn = document.getElementById('join-top-btn');
            const joinBottomBtn = document.getElementById('join-bottom-btn');
            const currentPlayer = players[myPlayerId];
            
            console.log('Debug - Current player from Firebase:', currentPlayer);
            
            // LOGICA PULSANTI: Se già in un team, nasconde pulsanti
            if (currentPlayer && currentPlayer.team) {
                joinTopBtn.style.display = 'none';
                joinBottomBtn.style.display = 'none';
            } else {
                // CONTROLLO LIMITI: Disabilita se team pieno (max 2 giocatori)
                joinTopBtn.disabled = teamTopCount >= 2;
                joinBottomBtn.disabled = teamBottomCount >= 2;
                joinTopBtn.style.display = teamTopCount >= 2 ? 'none' : 'block';
                joinBottomBtn.style.display = teamBottomCount >= 2 ? 'none' : 'block';
            }

            // AGGIORNAMENTO STATUS: Mostra stato di preparazione di ogni giocatore
            updateReadyStatus(players);

            // CONTROLLO AVVIO: Determina se mostrare il pulsante di avvio
            const isHost = currentPlayer && currentPlayer.isHost;
            const startBtn = document.getElementById('start-game-final');
            
            // LOGICA AVVIO: Tutti pronti + minimo 2 giocatori + utente è host
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

        // ============================================================================
        // CREAZIONE CARD GIOCATORE: Genera elemento UI per ogni giocatore
        // ============================================================================
        function createPlayerCard(player) {
            const card = document.createElement('div');
            card.className = 'player-card';
            
            // IDENTIFICAZIONE UTENTE CORRENTE: Confronta con l'ID Firebase
            const isCurrentUser = player.firebaseId === myPlayerId;
            
            if (isCurrentUser) {
                card.classList.add('current-user');
            }
            
            // INDICATORE CONNESSIONE: Verifica se il giocatore è online
            const isOnline = player.presence?.online && (Date.now() - (player.presence?.lastSeen || 0)) < 120000;
            
            console.log(`Debug - Player: ${player.name}, Firebase ID: ${player.firebaseId}, My ID: ${myPlayerId}, Is Current: ${isCurrentUser}`);
            
            // GENERAZIONE HTML: Struttura completa della card giocatore
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
                            <!-- DROPDOWN RUOLO: Solo per l'utente corrente -->
                            <select class="role-dropdown-inline ${player.role ? 'has-selection' : ''} ${player.role === 'constructor' ? 'constructor-selected' : ''} ${player.role === 'bomber' ? 'bomber-selected' : ''}" 
                                    onchange="selectRole(this.value)" 
                                    id="role-select-${player.firebaseId}">
                                <option value="" ${!player.role ? 'selected' : ''}>🎭 Scegli ruolo...</option>
                                <option value="constructor" ${player.role === 'constructor' ? 'selected' : ''}>🧱 Costruttore</option>
                                <option value="bomber" ${player.role === 'bomber' ? 'selected' : ''}>💣 Bombardiere</option>
                            </select>
                        ` : `
                            <!-- DISPLAY RUOLO: Per altri giocatori, solo visualizzazione -->
                            <div class="role-display ${player.role ? 'role-set' : 'role-empty'}">
                                ${player.role ? (player.role === 'constructor' ? '🧱 Costruttore' : '💣 Bombardiere') : '⏳ In attesa...'}
                            </div>
                        `}
                    </div>
                </div>
                ${player.role ? `
                    <!-- DESCRIZIONE RUOLO: Spiega le capacità del ruolo selezionato -->
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

        // ============================================================================
        // AGGIORNAMENTO STATUS READY: Mostra stato preparazione di ogni giocatore
        // ============================================================================
        function updateReadyStatus(players) {
            const container = document.getElementById('ready-status');
            container.innerHTML = '';

            // ORDINAMENTO GIOCATORI: Per ordine di ingresso nella stanza
            Object.values(players)
                .sort((a, b) => a.joinedAt - b.joinedAt)
                .forEach(player => {
                    const statusDiv = document.createElement('div');
                    const isReady = player.team && player.role;  // Pronto = ha team E ruolo
                    const isOnline = player.presence?.online && (Date.now() - (player.presence?.lastSeen || 0)) < 120000;
                    
                    // STILI STATUS: Colori e classi per stato giocatore
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

        // ============================================================================
        // UNIONE TEAM: Gestisce l'assegnazione di un giocatore a un team
        // ============================================================================
        window.joinTeam = async function(team) {
            if (!database || !currentRoom || !myPlayerId) return;

            try {
                // CONTROLLO HOST: Verifica se l'utente è l'host della stanza
                const isHostResult = await isHostCheck();

                // AGGIORNAMENTO DATABASE: Salva dati giocatore con team assegnato
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
                
                // AGGIORNAMENTO LOCALE: Salva team nella variabile locale
                myTeam = team;
                
                // FEEDBACK UTENTE: Effetti visivi e sonori per conferma
                playSound('success');
                const teamName = team === 'top' ? '🔵 Team Nord' : '🔴 Team Sud';
                showNotification(`⚔️ Ti sei unito al ${teamName}!`, 'success');
                
                console.log(`✅ Unito al team: ${team}, isHost: ${isHostResult}`);
            } catch (error) {
                console.error('❌ Errore unione team:', error);
                showNotification('❌ Errore durante l\'unione al team', 'error');
            }
        }

        // ============================================================================
        // CONTROLLO HOST: Verifica se il giocatore corrente è l'host della stanza
        // ============================================================================
        async function isHostCheck() {
            try {
                const room = await get(ref(database, `games/${currentRoom}`));
                
                if (!room.exists()) {
                    console.log('❌ Dati della stanza non esistono');
                    return false;
                }
                
                const gameData = room.val();
                
                // VERIFICA CAMPO: Controlla che startedBy esista nei dati
                if (!gameData.startedBy) {
                    console.log('❌ startedBy non trovato nei dati della stanza');
                    return false;
                }
                
                // CONFRONTO ID: Confronta ID giocatore con quello che ha creato la stanza
                const isHost = myPlayerId === gameData.startedBy;
                console.log(`🔍 Check host: ${myPlayerId} === ${gameData.startedBy} = ${isHost}`);
                
                return isHost;
                
            } catch (error) {
                console.error('❌ Errore nel controllo host:', error);
                return false;
            }
        }

        // ============================================================================
        // SELEZIONE RUOLO: Gestisce la scelta del ruolo da parte del giocatore
        // ============================================================================
        window.selectRole = async function(role) {
            if (!database || !currentRoom || !myPlayerId) return;

            // VALIDAZIONE: Se nessun ruolo selezionato, non fare nulla
            if (!role) return;

            try {
                // AGGIORNAMENTO DATABASE: Salva ruolo selezionato
                await update(ref(database, `games/${currentRoom}/players/${myPlayerId}`), {
                    role: role,
                    presence: {
                        online: true,
                        lastSeen: Date.now()
                    }
                });
                
                // AGGIORNAMENTO LOCALE: Salva ruolo nella variabile locale
                myRole = role;
                
                // AGGIORNAMENTO UI IMMEDIATO: Modifica stili dropdown senza aspettare Firebase
                const dropdown = document.getElementById(`role-select-${myPlayerId}`);
                if (dropdown) {
                    // RESET CLASSI: Pulisce classi precedenti
                    dropdown.classList.remove('constructor-selected', 'bomber-selected');
                    dropdown.classList.add('has-selection');
                    
                    // CLASSE SPECIFICA: Aggiunge classe per il ruolo selezionato
                    if (role === 'constructor') {
                        dropdown.classList.add('constructor-selected');
                    } else if (role === 'bomber') {
                        dropdown.classList.add('bomber-selected');
                    }
                    
                    // ANIMAZIONE CONFERMA: Breve effetto di scala per feedback
                    dropdown.style.transform = 'scale(1.02)';
                    setTimeout(() => {
                        dropdown.style.transform = 'scale(1)';
                    }, 150);
                }
                
                console.log(`✅ Ruolo selezionato: ${role}`);
                
                // FEEDBACK UTENTE: Suono e notifica di conferma
                playSound('success');
                showNotification(`🎭 Ruolo ${role === 'constructor' ? '🧱 Costruttore' : '💣 Bombardiere'} selezionato!`, 'success');
                
            } catch (error) {
                console.error('❌ Errore selezione ruolo:', error);
                alert('Errore durante la selezione del ruolo');
                
                // ROLLBACK UI: Ripristina dropdown in caso di errore
                const dropdown = document.getElementById(`role-select-${myPlayerId}`);
                if (dropdown) {
                    dropdown.value = myRole || '';
                }
            }
        }

        // ============================================================================
        // AVVIO GIOCO FINALE: Gestisce l'avvio della battaglia (solo host)
        // ============================================================================
        window.startFinalGame = async function() {
            if (!database || !currentRoom) return;

            console.log('🎮 Avvio del gioco finale...');
            
            // VERIFICA HOST: Solo l'host può avviare il gioco
            const isHost = await isHostCheck();
            if (!isHost) {
                console.log('❌ Solo l\'host può avviare il gioco');
                showNotification('❌ Solo l\'host può avviare il gioco', 'error');
                return;
            }

            // VERIFICA CONDIZIONI: Controlla che tutti i giocatori siano pronti
            const roomSnapshot = await get(ref(database, `games/${currentRoom}`));
            if (!roomSnapshot.exists()) {
                showNotification('❌ Errore: stanza non trovata', 'error');
                return;
            }

            const roomData = roomSnapshot.val();
            const players = roomData.players || {};
            const playersList = Object.values(players);
            
            // CONTROLLO MINIMO GIOCATORI: Almeno 2 giocatori necessari
            if (playersList.length < 2) {
                showNotification('❌ Servono almeno 2 giocatori per iniziare', 'error');
                return;
            }
            
            // CONTROLLO PREPARAZIONE: Tutti devono avere team e ruolo
            const allReady = playersList.every(player => player.team && player.role);
            if (!allReady) {
                showNotification('❌ Non tutti i giocatori sono pronti', 'error');
                return;
            }

            // UI FEEDBACK: Mostra stato di avvio sul pulsante
            const startBtn = document.getElementById('start-game-final');
            const originalText = startBtn.textContent;
            startBtn.disabled = true;
            startBtn.textContent = '🚀 Avviando battaglia...';
            startBtn.style.background = 'linear-gradient(145deg, #228b22, #32cd32)';

            try {
                // TIMESTAMP AVVIO: Marca temporale per sincronizzazione
                const gameStartTime = Date.now();
                
                // AGGIORNAMENTO STATO GIOCO: Cambia fase a 'playing'
                await update(ref(database, `games/${currentRoom}`), {
                    gamePhase: 'playing',
                    gameStartedFinal: gameStartTime,
                    gameStatus: 'active',
                    startedBy: myPlayerId,
                    // METADATI DEBUG: Informazioni utili per troubleshooting
                    startedAt: new Date(gameStartTime).toISOString(),
                    playerCount: playersList.length
                });

                console.log('✅ Stato gioco aggiornato con successo');
                console.log('🔄 Tutti i giocatori verranno reindirizzati automaticamente...');
                
                // NOTIFICA SUCCESSO: Conferma avvio riuscito
                showNotification('🎮 Battaglia avviata! Reindirizzamento in corso...', 'success');
                
                // REINDIRIZZAMENTO AUTOMATICO: Il listener Firebase gestirà il redirect
                
            } catch (error) {
                console.error('❌ Errore avvio gioco:', error);
                
                // RIPRISTINO PULSANTE: In caso di errore, torna allo stato normale
                startBtn.disabled = false;
                startBtn.textContent = originalText;
                startBtn.style.background = '';
                
                showNotification('❌ Errore durante l\'avvio del gioco. Riprova.', 'error');
            }
        }

        // ============================================================================
        // RITORNO LOBBY: Gestisce l'uscita volontaria dalla stanza
        // ============================================================================
        window.goBackToLobby = async function() {
            if (confirm('Sei sicuro di voler tornare alla lobby?')) {
                await cleanupOnExit();                    // Pulizia database
                window.location.href = '../index.html';  // Reindirizzamento
            }
        }

        // ============================================================================
        // SISTEMA NOTIFICHE: Mostra messaggi temporanei all'utente
        // ============================================================================
        function showNotification(message, type = 'info') {
            // RIMOZIONE PRECEDENTI: Evita sovrapposizione notifiche
            const existingNotification = document.querySelector('.notification');
            if (existingNotification) {
                existingNotification.remove();
            }

            // CREAZIONE NOTIFICA: Elemento floating con stili personalizzati
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

            // STILI SPECIFICI: Colori diversi per tipo di notifica
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

            // ANIMAZIONE ENTRATA: Slide da destra
            requestAnimationFrame(() => {
                notification.style.transform = 'translateX(0)';
            });

            // AUTO-RIMOZIONE: Scompare dopo 3 secondi
            setTimeout(() => {
                notification.style.transform = 'translateX(400px)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 400);
            }, 3000);
        }

        // ============================================================================
        // EFFETTI SONORI: Genera suoni semplici per feedback utente
        // ============================================================================
        function playSound(type) {
            // AUDIO SINTETICO: Usa Web Audio API per suoni basilari
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // TIPI DI SUONO: Frequenze diverse per azioni diverse
                if (type === 'success') {
                    // SUONO CONFERMA: Due note crescenti
                    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
                    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
                } else if (type === 'select') {
                    // SUONO CLICK: Nota singola acuta
                    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                }

                // VOLUME E DURATA: Suono breve e non invasivo
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
            } catch (error) {
                // GESTIONE ERRORI: Ignora se audio non supportato
                console.log('Audio non supportato');
            }
        }

        // ============================================================================
        // INIZIALIZZAZIONE AUTOMATICA: Avvia app quando DOM è pronto
        // ============================================================================
        window.addEventListener('DOMContentLoaded', initPage);
    </script>

    <style>
        /* ============================================================================
           STILI INDICATORI CONNESSIONE: Feedback visivo per stato online/offline
           ============================================================================ */
        .connection-indicator {
            margin-left: 8px;
            font-size: 0.8rem;
        }

        /* ANIMAZIONE ONLINE: Pulsazione verde per giocatori connessi */
        .connection-indicator.online {
            animation: pulse-green 2s infinite;
        }

        /* ANIMAZIONE OFFLINE: Pulsazione rossa per giocatori disconnessi */
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

        /* STILE GIOCATORI DISCONNESSI: Aspetto opaco con bordo rosso */
        .player-ready-status.disconnected {
            opacity: 0.7;
            border-left: 4px solid #dc143c;
            background: linear-gradient(90deg, rgba(220, 20, 60, 0.1) 0%, transparent 100%);
        }

        /* ============================================================================
           EFFETTI INTERATTIVI: Animazioni hover per migliorare UX
           ============================================================================ */
        .player-card {
            position: relative;
            transition: all 0.3s ease;
        }

        /* HOVER CARD: Solleva leggermente la card al passaggio del mouse */
        .player-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        }
    </style>
</body>
</html>