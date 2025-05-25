<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MapRest Multiplayer</title>
    <link rel="stylesheet" href="boardStyle.css">
    
    <!-- Firebase Scripts -->
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
</head>
<body>
    <!-- Schermata di selezione ruoli (ora nascosta, gestita da preparation.html) -->
    <div id="role-selection" style="display: none;">
        <h1>Selezione Ruoli</h1>
        <div id="player-choice-screen" style="display:none;">
            <h2>Giocatore <span id="current-player-choosing">1</span>, scegli il tuo ruolo:</h2>
            <div class="role-options-container">
                <div class="role-option" data-role="constructor">
                    <h3>Costruttore</h3>
                    <p>Puoi costruire muri e difese</p>
                </div>
                <div class="role-option" data-role="bomber">
                    <h3>Bombardiere</h3>
                    <p>Puoi piazzare bombe e attaccare</p>
                </div>
            </div>
        </div>
        <div id="role-selection-complete" style="display:none;">
            <h2>Tutti i ruoli sono stati assegnati!</h2>
            <button id="start-game">Inizia Gioco</button>
        </div>
    </div>

    <!-- Contenuto principale del gioco -->
    <div id="contentbox" style="display:none;">    
        <div id="mapcontent"></div>
        <div id="turn-indicator">
            <h3>Turno del Giocatore <span id="current-player">1</span></h3>
        </div>
        <div id="control-box">
            <div id="construction-controls" style="display:none;">
                <button id="build-wall-btn">🧱</button>
            </div>
            <div id="bomb-controls" style="display:none;">
                <button id="place-bomb-btn">💣</button>
            </div>
            <div id="knife-controls">
                <button id="use-knife-btn">🔪</button>
            </div>
        </div>
    </div>

    <!-- Schermata vittoria -->
    <div id="victory-screen" style="display:none;">
        <h1>VITTORIA!</h1>
        <p id="victory-message">Il Team <span id="winning-team"></span> ha vinto!</p>
        <button onclick="goBackToLobby()">Torna alla Lobby</button>
    </div>

    <!-- Loading screen per quando si inizializza Firebase -->
    <div id="loading-screen" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(45, 24, 16, 0.95); flex-direction: column; justify-content: center; align-items: center; z-index: 1000;">
        <div style="color: #daa520; font-size: 2rem; text-align: center; margin-bottom: 30px; font-family: Georgia, serif;">
            🎮 Caricamento Battaglia...
        </div>
        <div style="color: #f5deb3; font-size: 1.2rem; text-align: center; animation: pulse 2s infinite;">
            Connessione ai server del Saloon...
        </div>
    </div>

    <script src="boardScript.js"></script>
    
    <script>
        // Funzione per tornare alla lobby
        function goBackToLobby() {
            if (confirm('Sei sicuro di voler tornare alla lobby?')) {
                window.location.href = '../index.html';
            }
        }

        // Nascondi loading screen quando il gioco è inizializzato
        function hideLoadingScreen() {
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
        }

        // Mostra errore se necessario
        function showError(message) {
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.innerHTML = `
                    <div style="color: #ff6b6b; font-size: 2rem; text-align: center; margin-bottom: 30px; font-family: Georgia, serif;">
                        ❌ Errore di Connessione
                    </div>
                    <div style="color: #f5deb3; font-size: 1.2rem; text-align: center; margin-bottom: 30px;">
                        ${message}
                    </div>
                    <button onclick="goBackToLobby()" style="padding: 15px 30px; font-size: 1.1rem; background: linear-gradient(145deg, #8b4513 0%, #daa520 100%); color: #f5deb3; border: 3px solid #654321; border-radius: 8px; cursor: pointer;">
                        🚪 Torna alla Lobby
                    </button>
                `;
            }
        }

        // Verifica parametri all'avvio
        window.addEventListener('DOMContentLoaded', function() {
            const params = new URLSearchParams(window.location.search);
            const roomCode = params.get('roomCode');
            const playerId = params.get('playerId');
            const username = params.get('username');

            if (!roomCode || !playerId || !username) {
                showError('Parametri mancanti. La sessione potrebbe essere scaduta.');
                return;
            }

            console.log(`🎯 Inizializzando battaglia per ${username} in stanza ${roomCode}`);
            
            // Il resto della logica è gestito da boardScript.js
            setTimeout(() => {
                // Se dopo 10 secondi il loading è ancora visibile, mostra errore
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen && loadingScreen.style.display !== 'none') {
                    showError('Timeout di connessione. Riprova più tardi.');
                }
            }, 10000);
        });
    </script>
</body>
</html>