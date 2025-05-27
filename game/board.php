<?php
    // Verifica che i parametri necessari siano presenti
    if (!isset($_GET["roomCode"]) || !isset($_GET["playerId"]) || !isset($_GET["username"])) {
        header("Location: ../index.html");
        exit();
    }
?>

<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Battaglia Multiplayer - Gustavo Bombing</title>
    <link rel="stylesheet" href="boardStyle.css">
</head>
<body>
    <!-- Contenuto principale del gioco -->
    <div id="contentbox" style="display:none;">    
        <div id="mapcontent"></div>
        <div id="turn-indicator">
            <h3>Turno del Giocatore <span id="current-player">-</span></h3>
            <div id="game-info">
                <div class="info-item">
                    <span class="info-label">🏰 Stanza:</span>
                    <span id="room-display"><?php echo htmlspecialchars($_GET["roomCode"]); ?></span>
                </div>
                <div class="info-item">
                    <span class="info-label">👤 Tu:</span>
                    <span id="player-display"><?php echo htmlspecialchars($_GET["username"]); ?></span>
                </div>
                <div class="info-item">
                    <span class="info-label">⚔️ Team:</span>
                    <span id="team-display"><?php echo htmlspecialchars($_GET["team"] ?? 'N/A'); ?></span>
                </div>
                <div class="info-item">
                    <span class="info-label">🎭 Ruolo:</span>
                    <span id="role-display"><?php echo htmlspecialchars($_GET["role"] ?? 'N/A'); ?></span>
                </div>
            </div>
        </div>
        <div id="control-box">
            <div id="construction-controls" style="display:none;">
                <button id="build-wall-btn" class="control-btn constructor-btn">
                    <span class="btn-icon">🧱</span>
                    <span class="btn-text">Costruisci Muro</span>
                </button>
                <div class="control-hint">Costruisci difese per il team</div>
            </div>
            <div id="bomb-controls" style="display:none;">
                <button id="place-bomb-btn" class="control-btn bomber-btn">
                    <span class="btn-icon">💣</span>
                    <span class="btn-text">Piazza Bomba</span>
                </button>
                <div class="control-hint">Piazza esplosivi nemici</div>
            </div>
            <div id="knife-controls" style="display:none;">
                <button id="use-knife-btn" class="control-btn knife-btn">
                    <span class="btn-icon">🔪</span>
                    <span class="btn-text">Usa Coltello</span>
                </button>
                <div class="control-hint">Attacca a distanza ravvicinata</div>
            </div>
            <div id="turn-controls">
                <div class="controls-info">
                    <div class="move-counter">
                        Mosse: <span id="moves-counter">0</span>/2
                    </div>
                    <div class="turn-hint">
                        Usa WASD per muoverti, SPAZIO per finire il turno
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Schermata vittoria -->
    <div id="victory-screen" style="display:none;">
        <div class="victory-container">
            <h1 class="victory-title">🏆 VITTORIA! 🏆</h1>
            <p id="victory-message">
                Il Team <span id="winning-team"></span> ha conquistato la vittoria!
            </p>
            <div class="victory-actions">
                <button onclick="goBackToLobby()" class="victory-btn">
                    🚪 Torna alla Lobby
                </button>
                <button onclick="location.reload()" class="victory-btn secondary">
                    🔄 Rivedi Battaglia
                </button>
            </div>
        </div>
    </div>

    <!-- Loading screen -->
    <div id="loading-screen">
        <div class="loading-container">
            <div class="loading-title">🎮 Inizializzando Battaglia...</div>
            <div class="loading-subtitle">Connessione ai server del Saloon...</div>
            <div class="loading-spinner">
                <div class="spinner"></div>
            </div>
            <div class="loading-info">
                <div class="info-line">🏰 Stanza: <strong><?php echo htmlspecialchars($_GET["roomCode"]); ?></strong></div>
                <div class="info-line">👤 Giocatore: <strong><?php echo htmlspecialchars($_GET["username"]); ?></strong></div>
                <?php if (isset($_GET["team"])): ?>
                <div class="info-line">⚔️ Team: <strong><?php echo htmlspecialchars($_GET["team"]); ?></strong></div>
                <?php endif; ?>
                <?php if (isset($_GET["role"])): ?>
                <div class="info-line">🎭 Ruolo: <strong><?php echo htmlspecialchars($_GET["role"]); ?></strong></div>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <!-- Notifica di disconnessione -->
    <div id="disconnect-notification" style="display:none;">
        <div class="disconnect-container">
            <h2>⚠️ Connessione Persa</h2>
            <p>La connessione al server è stata interrotta.</p>
            <div class="disconnect-actions">
                <button onclick="location.reload()" class="reconnect-btn">
                    🔄 Riconnetti
                </button>
                <button onclick="goBackToLobby()" class="lobby-btn">
                    🚪 Torna alla Lobby
                </button>
            </div>
        </div>
    </div>

    <!-- Firebase Scripts -->
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
    
    <!-- Game Script -->
    <script src="boardScript.js"></script>
    
    <!-- Stili integrati per il loading e le notifiche -->
    <style>
        
    </style>
    
    <script>
        // Funzione per tornare alla lobby
        function goBackToLobby() {
            if (confirm('Sei sicuro di voler tornare alla lobby?')) {
                window.location.href = '../index.html';
            }
        }

        // Gestione timeout di connessione
        window.addEventListener('DOMContentLoaded', function() {
            // Timeout di sicurezza per il loading
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen && loadingScreen.style.display !== 'none') {
                    const loadingContainer = loadingScreen.querySelector('.loading-container');
                    if (loadingContainer) {
                        loadingContainer.innerHTML = `
                            <div style="color: #ff6b6b; font-size: 2rem; margin-bottom: 20px;">
                                ⚠️ Timeout di Connessione
                            </div>
                            <div style="color: #f5deb3; font-size: 1.2rem; margin-bottom: 30px;">
                                Impossibile connettersi al server di gioco.
                            </div>
                            <button onclick="location.reload()" style="padding: 15px 30px; font-size: 1.1rem; background: #228b22; color: #fff; border: 2px solid #006400; border-radius: 8px; cursor: pointer; margin-right: 15px;">
                                🔄 Riprova
                            </button>
                            <button onclick="goBackToLobby()" style="padding: 15px 30px; font-size: 1.1rem; background: #8b4513; color: #f5deb3; border: 2px solid #654321; border-radius: 8px; cursor: pointer;">
                                🚪 Torna alla Lobby
                            </button>
                        `;
                    }
                }
            }, 15000); // 15 secondi timeout
        });
    </script>
</body>
</html>