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
        import { getDatabase, ref, set, onValue, update, get } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

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
            }
        }

        // Setup listener Firebase
        function setupRealtimeListeners() {
            const roomRef = ref(database, `games/${currentRoom}`);
            onValue(roomRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    updateUI(data);
                }
            });
        }

        // Aggiorna interfaccia
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
            
            console.log(`Debug - Player: ${player.name}, Firebase ID: ${player.firebaseId}, My ID: ${myPlayerId}, Is Current: ${isCurrentUser}`);
            
            card.innerHTML = `
                <div class="player-header">
                    <div class="player-name-section">
                        <div class="player-name">
                            ${player.username} ${isCurrentUser ? '(Tu)' : ''}
                            ${player.isHost ? '👑' : ''}
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
                    
                    statusDiv.className = `player-ready-status ${isReady ? 'ready' : 'not-ready'}`;
                    statusDiv.innerHTML = `
                        <strong>${player.username}</strong>
                        <div style="margin-top: 8px;">
                            ${player.team ? `Team: ${player.team === 'top' ? '🔵 Nord' : '🔴 Sud'}` : '❌ Nessun team'}
                        </div>
                        <div>
                            ${player.role ? `Ruolo: ${player.role === 'constructor' ? '🧱' : '💣'}` : '❌ Nessun ruolo'}
                        </div>
                        <div style="margin-top: 8px; font-size: 1.2rem;">
                            ${isReady ? '✅ Pronto' : '⏳ In attesa'}
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
                    isHost: isHostResult
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
                    role: role
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

            try {
                await update(ref(database, `games/${currentRoom}`), {
                    gamePhase: 'playing',
                    gameStartedFinal: Date.now()
                });

                console.log('🎮 Avviando gioco finale...');
                // Redirect a board.php con tutti i parametri necessari
                window.location.href = `board.php?roomCode=${currentRoom}&playerId=${myPlayerId}&username=${myUsername}`;
            } catch (error) {
                console.error('❌ Errore avvio gioco:', error);
                alert('Errore durante l\'avvio del gioco');
            }
        }

        // Torna alla lobby
        window.goBackToLobby = function() {
            if (confirm('Sei sicuro di voler tornare alla lobby?')) {
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
</body>
</html>