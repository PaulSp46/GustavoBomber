// ==========================================
// CONFIGURAZIONE E VARIABILI GLOBALI
// ==========================================

// Dimensioni della griglia di gioco
var ROWS = 16;
var COLS = 27;

// Modalità di gioco - controllano quale azione può fare il giocatore
var constructionMode = false; // True quando il giocatore sta costruendo muri
var bombMode = false;         // True quando il giocatore sta piazzando bombe
var knifeMode = false;        // True quando il giocatore sta usando il coltello

// Range di azione per le diverse abilità
var constructionRange = 6; // Distanza massima per costruire muri
var bombRange = 5;         // Distanza massima per piazzare bombe
var knifeRange = 1;        // Distanza massima per usare il coltello (raggio 1)

// Stato del sistema di costruzione
var isBuilding = false;

// Riferimento alla tabella HTML che rappresenta la griglia
var tbl;

// Probabilità di generare rocce casuali sulla mappa (30%)
var ROCK_PROBABILITY = 0.3;

// ==========================================
// FIREBASE E MULTIPLAYER
// ==========================================

// Import Firebase modules (inseriti come script esterni)
let database;
let currentRoom = null;
let myPlayerId = null;
let myUsername = '';
let firebasePlayersData = {};

// ==========================================
// CONFIGURAZIONE GIOCATORI
// ==========================================

/**
 * Array dei giocatori del gioco
 * Ora sarà popolato dinamicamente da Firebase
 */
var players = [];

// ==========================================
// STATO DEL GIOCO
// ==========================================

// Indice del giocatore che sta scegliendo il ruolo
var currentPlayerChoosing = 0;

// Flag per indicare se la selezione dei ruoli è completata
var roleSelectionDone = true; // Ora sempre true perché viene da Firebase

// Indice del giocatore corrente nel turno
var currentPlayerIndex = 0;

// Flag per indicare se il gioco è iniziato
var gameStarted = false;

// Contatore delle mosse fatte nel turno corrente (max 2 per turno)
var currentMovesMade = 0;

// Array delle bombe attive sulla mappa
var bombs = [];

// Contatore delle bombe piazzate nel turno corrente (max 1 per turno)
var bombsPlacedThisTurn = 0;

// ==========================================
// INIZIALIZZAZIONE FIREBASE
// ==========================================

/**
 * Ottiene parametri dall'URL
 */
function getUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        roomCode: urlParams.get('roomCode'),
        playerId: urlParams.get('playerId'),
        username: urlParams.get('username')
    };
}

/**
 * Inizializza connessione Firebase
 */
async function initFirebase() {
    try {
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

        // Inizializza Firebase (assumendo che gli script siano già caricati)
        if (typeof firebase !== 'undefined') {
            const app = firebase.initializeApp(firebaseConfig);
            database = firebase.database();
        } else {
            console.error('Firebase non caricato');
            return false;
        }

        console.log('✅ Firebase inizializzato per il gioco');
        return true;
    } catch (error) {
        console.error('❌ Errore inizializzazione Firebase:', error);
        return false;
    }
}

/**
 * Carica dati giocatori da Firebase
 */
async function loadPlayersFromFirebase() {
    if (!database || !currentRoom) {
        console.error('Firebase o stanza non inizializzati');
        return false;
    }

    try {
        const playersRef = database.ref(`games/${currentRoom}/players`);
        
        // Ascolta cambiamenti in tempo reale
        playersRef.on('value', (snapshot) => {
            const playersData = snapshot.val();
            if (playersData) {
                firebasePlayersData = playersData;
                setupPlayersFromFirebaseData(playersData);
                console.log('🔄 Dati giocatori aggiornati da Firebase');
            }
        });

        return true;
    } catch (error) {
        console.error('❌ Errore caricamento giocatori:', error);
        return false;
    }
}

/**
 * Configura array players basandosi sui dati Firebase
 */
function setupPlayersFromFirebaseData(playersData) {
    const playersArray = Object.values(playersData);
    
    // Ordina giocatori: prima team top, poi team bottom
    playersArray.sort((a, b) => {
        if (a.team === 'top' && b.team === 'bottom') return -1;
        if (a.team === 'bottom' && b.team === 'top') return 1;
        return a.joinedAt - b.joinedAt;
    });

    // Reset array players
    players = [];

    let playerIdCounter = 1;
    let topCount = 0;
    let bottomCount = 0;

    playersArray.forEach((firebasePlayer) => {
        if (firebasePlayer.team && firebasePlayer.role) {
            let position = { row: 0, col: 0 };
            
            // Assegna posizioni spawn basandosi su team
            if (firebasePlayer.team === 'top') {
                if (topCount === 0) {
                    position = { row: 0, col: 12 };
                } else {
                    position = { row: 0, col: 14 };
                }
                topCount++;
            } else if (firebasePlayer.team === 'bottom') {
                if (bottomCount === 0) {
                    position = { row: 15, col: 12 };
                } else {
                    position = { row: 15, col: 14 };
                }
                bottomCount++;
            }

            players.push({
                id: playerIdCounter,
                firebaseId: firebasePlayer.id,
                name: firebasePlayer.name,
                row: position.row,
                col: position.col,
                role: firebasePlayer.role,
                team: firebasePlayer.team,
                hasFlag: false,
                active: playerIdCounter === 1, // Primo giocatore inizia
                isAlive: true
            });

            playerIdCounter++;
        }
    });

    console.log('👥 Giocatori configurati:', players);

    // Se questo è il primo setup e il gioco non è ancora iniziato
    if (!gameStarted && players.length > 0) {
        initializeGameFromFirebase();
    }
}

/**
 * Inizializza il gioco con i dati da Firebase
 */
function initializeGameFromFirebase() {
    console.log('🎮 Inizializzando gioco da Firebase...');
    
    // Nasconde selezione ruoli e mostra il gioco
    document.getElementById('role-selection').style.display = 'none';
    document.getElementById('contentbox').style.display = 'flex';
    
    // Crea la mappa
    makeMap("mapcontent", ROWS, COLS);
    
    // Avvia il gioco
    gameStarted = true;
    roleSelectionDone = true;
    
    // Imposta il primo giocatore come attivo
    if (players.length > 0) {
        currentPlayerIndex = 0;
        players[currentPlayerIndex].active = true;
    }
    
    // Aggiorna interfaccia
    updatePlayerPositions();
    updateTurnIndicator();
    
    // Configura i controlli per il primo giocatore
    setupPlayerControls();
    
    console.log('✅ Gioco inizializzato con successo');
}

// ==========================================
// INIZIALIZZAZIONE DOM AGGIORNATA
// ==========================================

/**
 * Event listener che si attiva quando il DOM è completamente caricato
 */
window.addEventListener('DOMContentLoaded', async function() {
    console.log("DOM caricato, inizializzo gioco multiplayer...");
    
    // Ottieni parametri URL
    const params = getUrlParams();
    
    if (!params.roomCode || !params.playerId || !params.username) {
        console.error('Parametri URL mancanti');
        alert('Parametri mancanti. Tornando alla lobby...');
        window.location.href = '../index.html';
        return;
    }

    currentRoom = params.roomCode;
    myPlayerId = params.playerId;
    myUsername = params.username;

    console.log(`🎯 Stanza: ${currentRoom}`);
    console.log(`👤 Giocatore: ${myUsername} (${myPlayerId})`);

    // Nascondi la selezione ruoli (ora viene gestita in preparazione)
    document.getElementById('role-selection').style.display = 'none';
    
    // Carica script Firebase dinamicamente se non già presente
    if (typeof firebase === 'undefined') {
        await loadFirebaseScripts();
    }

    // Inizializza Firebase e carica giocatori
    if (await initFirebase()) {
        await loadPlayersFromFirebase();
    } else {
        alert('Errore connessione Firebase');
        window.location.href = '../index.html';
    }
});

/**
 * Carica script Firebase dinamicamente
 */
async function loadFirebaseScripts() {
    return new Promise((resolve, reject) => {
        const script1 = document.createElement('script');
        script1.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
        
        const script2 = document.createElement('script');
        script2.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js';
        
        let loadCount = 0;
        const onLoad = () => {
            loadCount++;
            if (loadCount === 2) {
                console.log('📦 Script Firebase caricati');
                resolve();
            }
        };
        
        script1.onload = onLoad;
        script2.onload = onLoad;
        script1.onerror = script2.onerror = reject;
        
        document.head.appendChild(script1);
        document.head.appendChild(script2);
    });
}

// ==========================================
// GESTIONE TURNI E GIOCATORI (INVARIATA)
// ==========================================

/**
 * Trova il prossimo giocatore vivo dopo l'indice specificato
 */
function findNextAlivePlayer(startIndex) {
    let index = startIndex;
    let attempts = 0;
    
    do {
        index = (index + 1) % players.length;
        attempts++;
        
        if (attempts > players.length) {
            return -1;
        }
        
        if (players[index].isAlive) {
            return index;
        }
    } while (index !== startIndex);
    
    return -1;
}

/**
 * Controlla se il giocatore corrente è vivo e gestisce il cambio turno se necessario
 */
function checkCurrentPlayerAlive() {
    if (!players[currentPlayerIndex].isAlive) {
        const nextPlayerIndex = findNextAlivePlayer(currentPlayerIndex);
        
        if (nextPlayerIndex === -1) {
            showVictoryScreen('draw');
            return false;
        }
        
        players[currentPlayerIndex].active = false;
        currentPlayerIndex = nextPlayerIndex;
        players[currentPlayerIndex].active = true;
        currentMovesMade = 0;
        bombsPlacedThisTurn = 0;
        
        updatePlayerPositions();
        updateTurnIndicator();
        setupPlayerControls();
    }
    return true;
}

// ========== RESTO DEL CODICE INVARIATO ==========
// (Mantieni tutto il resto del codice esistente per gestione bombe, movimento, ecc.)

// ==========================================
// GESTIONE BOMBE ED ESPLOSIONI
// ==========================================

function explodeBombs() {
    const explodingBombs = bombs.filter(bomba => bomba.timer < 1); 

    let playersKilled = 0;

    bombs.forEach(bomb => {
            for (let i = Math.max(0, bomb.row - 1); i <= Math.min(ROWS - 1, bomb.row + 1); i++) {
                for (let j = Math.max(0, bomb.col - 1); j <= Math.min(COLS - 1, bomb.col + 1); j++) {
                    const targetCell = tbl.rows[i].cells[j];
                    targetCell.classList.add("explosion-warning");
                }
            }
        });
    
    explodingBombs.forEach(bomb => {
        const cell = tbl.rows[bomb.row].cells[bomb.col];
        cell.classList.remove("bomb-cell", "explosion-warning");
        
        for (let i = Math.max(0, bomb.row - 1); i <= Math.min(ROWS - 1, bomb.row + 1); i++) {
            for (let j = Math.max(0, bomb.col - 1); j <= Math.min(COLS - 1, bomb.col + 1); j++) {
                const targetCell = tbl.rows[i].cells[j];
                targetCell.classList.remove("explosion-warning");
                
                if (targetCell.classList.contains("rock-cell")) {
                    targetCell.classList.remove("rock-cell");
                }
                
                const playerInCell = players.find(p => p.row === i && p.col === j);
                if (playerInCell && playerInCell.isAlive) {
                    handlePlayerHitByExplosion(playerInCell);
                    playersKilled++;
                }
            }
        }
    });
    
    bombs = bombs.filter(bomba => bomba.timer >= 1);

    updatePlayerPositions();
    checkGameEnd();
    
    if (!players[currentPlayerIndex].isAlive) {
        endTurn();
    }
}

function bombTurnReduction (){
    bombs.forEach(b =>{
        b.timer -= 1;
    });
}

function checkGameEnd() {
    const aliveTeams = new Set();
    const alivePlayers = players.filter(p => p.isAlive);
    
    alivePlayers.forEach(player => {
        aliveTeams.add(player.team);
    });
    
    if (aliveTeams.size === 1) {
        showVictoryScreen(aliveTeams.values().next().value);
    } 
    else if (aliveTeams.size === 0) {
        showVictoryScreen('draw');
    }
    
    if (alivePlayers.length === 1) {
        showVictoryScreen(alivePlayers[0].team);
    }
}

function endTurn() {
    if (players[currentPlayerIndex].role === 'constructor') {
        constructionMode = false;
        clearBuildableHighlights();
        document.getElementById('construction-controls').style.display = 'none';
    }
    
    if (players[currentPlayerIndex].role === 'bomber') {
        bombMode = false;
        clearBombTargets();
        document.getElementById('bomb-controls').style.display = 'none';
    }
    
    if (knifeMode) {
        knifeMode = false;
        clearKnifeTargets();
        const knifeBtn = document.getElementById('use-knife-btn');
        const currentPlayerCell = tbl.rows[players[currentPlayerIndex].row].cells[players[currentPlayerIndex].col];
        knifeBtn.classList.remove('active-mode');
        currentPlayerCell.classList.remove('knife-mode-active');
        document.body.classList.remove('knife-mode');
    }
    document.getElementById('knife-controls').style.display = 'none';
    
    currentMovesMade = 0;
    bombsPlacedThisTurn = 0;
    
    players[currentPlayerIndex].active = false;
    
    const nextPlayerIndex = findNextAlivePlayer(currentPlayerIndex);
    
    if (nextPlayerIndex === -1) {
        showVictoryScreen('draw');
        return;
    }
    
    currentPlayerIndex = nextPlayerIndex;
    players[currentPlayerIndex].active = true;

    if (bombs.length > 0 && currentMovesMade > 1) {
        endTurn();
    }

    currentMovesMade = 0;
    bombsPlacedThisTurn = 0;
    
    updatePlayerPositions();
    updateTurnIndicator();
    setupPlayerControls();

    explodeBombs();
    bombTurnReduction();
}

function handlePlayerHitByExplosion(player) {
    player.isAlive = false;
    
    if (player.hasFlag) {
        player.hasFlag = false;
        const flagCell = player.team === 'top' 
            ? tbl.rows[0].cells[13]
            : tbl.rows[ROWS-1].cells[13];
        flagCell.classList.add("flag-cell");
        flagCell.dataset.flagType = player.team;
    }
    
    switch(player.id) {
        case 1: player.row = 0; player.col = 12; break;
        case 2: player.row = 0; player.col = 14; break;
        case 3: player.row = 15; player.col = 12; break;
        case 4: player.row = 15; player.col = 14; break;
    }
}

// ==========================================
// AGGIORNAMENTO INTERFACCIA
// ==========================================

function updatePlayerPositions() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            let cell = tbl.rows[i].cells[j];
            cell.classList.remove(
                "player1-cell", "player2-cell", "player3-cell", "player4-cell", 
                "player-with-flag", "bomber", "constructor", "active-player", "dead-player",
                "knife-mode-active"
            );
        }
    }
    
    players.forEach(player => {
        let cell = tbl.rows[player.row].cells[player.col];
        cell.classList.add(`player${player.id}-cell`);
        cell.dataset.player = player.id;
        
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
            
            if (knifeMode && players[currentPlayerIndex].id === player.id) {
                cell.classList.add("knife-mode-active");
            }
        }
    });
}

function updateTurnIndicator() {
    const currentPlayer = players[currentPlayerIndex];
    const indicator = document.getElementById('current-player');
    
    if (!currentPlayer.isAlive) {
        indicator.textContent = `${currentPlayer.id} (Morto)`;
        indicator.style.color = 'red';
    } else {
        indicator.textContent = `${currentPlayer.id} (${currentPlayer.name})`;
        indicator.style.color = 'inherit';
    }
}

// ==========================================
// GESTIONE INPUT E MOVIMENTO
// ==========================================

function handleKeyPress(e) {
    if (!gameStarted || constructionMode || bombMode || knifeMode || !players[currentPlayerIndex].isAlive) return;
    
    if (!checkCurrentPlayerAlive()) {
        return;
    }
    
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer.active) return;

    if (e.key.toLowerCase() === ' ') {
        endTurn();
        return;
    }

    if (currentMovesMade >= 2) return;

    let newRow = currentPlayer.row;
    let newCol = currentPlayer.col;
    
    switch(e.key.toLowerCase()) {
        case 'w': newRow--; break;
        case 'a': newCol--; break;
        case 's': newRow++; break;
        case 'd': newCol++; break;
        default: return;
    }
    
    if (newRow < 0 || newRow >= ROWS || newCol < 0 || newCol >= COLS) {
        return;
    }
    
    let targetCell = tbl.rows[newRow].cells[newCol];
    if (targetCell.classList.contains("rock-cell") || targetCell.classList.contains("bomb-cell")) {
        return;
    }
    
    const cellHasPlayer = players.some(p => p.row === newRow && p.col === newCol && p.isAlive);
    if (cellHasPlayer) {
        return;
    }
    
    currentPlayer.row = newRow;
    currentPlayer.col = newCol;
    
    if (!currentPlayer.hasFlag) {
        if (currentPlayer.team === 'bottom' && targetCell.dataset.flagType === 'top') {
            currentPlayer.hasFlag = true;
            targetCell.classList.remove("flag-cell");
            targetCell.dataset.flagType = "";
        }
        else if (currentPlayer.team === 'top' && targetCell.dataset.flagType === 'bottom') {
            currentPlayer.hasFlag = true;
            targetCell.classList.remove("flag-cell");
            targetCell.dataset.flagType = "";
        }
    } else {
        if ((currentPlayer.team === 'bottom' && targetCell.dataset.flagType === 'bottom') || 
            (currentPlayer.team === 'top' && targetCell.dataset.flagType === 'top')) {
            showVictoryScreen(currentPlayer.team);
            return;
        }
    }
    
    updatePlayerPositions();
    
    currentMovesMade++;
    if (currentMovesMade >= 2) {
        endTurn();
    }
}

// ==========================================
// CREAZIONE MAPPA
// ==========================================

function makeMap(placeholder, rows, cols) {
    const container = document.getElementById(placeholder);
    if (!container) {
        console.error("Container non trovato:", placeholder);
        return;
    }
    
    container.innerHTML = '';
    
    tbl = document.createElement("table");
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
            
            if (i > 0 && i < rows-1 && Math.random() < ROCK_PROBABILITY && 
                !(i === 1 && (j === 13 || j === 15)) && 
                !(i === 14 && (j === 13 || j === 15))) {
                td.className += " rock-cell";
            }

            tr.appendChild(td);
        }
        tbl.appendChild(tr);
    }

    let d = document.getElementById(placeholder);
    d.appendChild(tbl);
    
    document.addEventListener('keydown', handleKeyPress);
}

// ==========================================
// SCHERMATA VITTORIA
// ==========================================

function showVictoryScreen(winningTeam) {
    document.getElementById('contentbox').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'flex';
    
    if (winningTeam === 'draw') {
        document.getElementById('winning-team').textContent = 'Pareggio! Tutti i giocatori sono morti';
    } else {
        document.getElementById('winning-team').textContent = winningTeam === 'top' ? 'Team Nord' : 'Team Sud';
    }
}

// ==========================================
// FUNZIONI ABILITÀ (INVARIATE)
// ==========================================

// Modalità costruzione
function highlightBuildableCells() {
    const currentPlayer = players[currentPlayerIndex];
    
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
            
            if (distance <= constructionRange && 
                !cell.classList.contains("rock-cell") &&
                !cell.classList.contains("flag-cell") &&
                !cell.classList.contains("bomb-cell") &&
                !players.some(p => p.row === i && p.col === j && p.isAlive)) {
                cell.classList.add("buildable");
                cell.addEventListener('click', handleCellClick);
            }
        }
    }
}

function clearBuildableHighlights() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            cell.classList.remove("buildable");
            cell.removeEventListener('click', handleCellClick);
        }
    }
}

function handleCellClick() {
    if (!constructionMode) return;
    
    const row = this.parentNode.rowIndex;
    const col = this.cellIndex;
    
    this.classList.add("rock-cell");
    this.classList.remove("buildable");
    
    currentMovesMade++;
    if (currentMovesMade >= 5) {
        endTurn();
    }
    
    constructionMode = false;
    clearBuildableHighlights();
}

function setupConstructionControls() {
    const buildBtn = document.getElementById('build-wall-btn');
    buildBtn.addEventListener('click', toggleConstructionMode);
    document.getElementById('construction-controls').style.display = 'block';
}

function toggleConstructionMode() {
    constructionMode = !constructionMode;
    
    if (constructionMode) {
        highlightBuildableCells();
    } else {
        clearBuildableHighlights();
    }
}

// Modalità bomba
function setupBombControls() {
    const bombBtn = document.getElementById('place-bomb-btn');
    bombBtn.addEventListener('click', toggleBombMode);
    document.getElementById('bomb-controls').style.display = 'block';
}

function toggleBombMode() {
    if (bombsPlacedThisTurn >= 1) return;
    
    bombMode = !bombMode;
    
    if (bombMode) {
        highlightBombTargets();
    } else {
        clearBombTargets();
    }
}

function highlightBombTargets() {
    const currentPlayer = players[currentPlayerIndex];
    
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
            
            if (distance <= bombRange && 
                !cell.classList.contains("rock-cell") &&
                !cell.classList.contains("flag-cell") &&
                !cell.classList.contains("bomb-cell") &&
                !players.some(p => p.row === i && p.col === j && p.isAlive)) {
                cell.classList.add("bomb-target");
                cell.addEventListener('click', handleBombPlacement);
            }
        }
    }
}

function clearBombTargets() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            cell.classList.remove("bomb-target");
            cell.removeEventListener('click', handleBombPlacement);
        }
    }
}

function handleBombPlacement() {
    if (!bombMode || bombsPlacedThisTurn >= 1) return;
    
    const row = this.parentNode.rowIndex;
    const col = this.cellIndex;
    
    this.classList.add("bomb-cell");
    this.classList.remove("bomb-target");
    
    bombs.push({
        row: row,
        col: col,
        timer: 3
    });
    
    bombsPlacedThisTurn++;
    currentMovesMade++;
    
    if (currentMovesMade >= 2) {
        endTurn();
    }
    
    bombMode = false;
    clearBombTargets();
}

// Modalità coltello
function setupKnifeControls() {
    const knifeBtn = document.getElementById('use-knife-btn');
    knifeBtn.addEventListener('click', toggleKnifeMode);
    document.getElementById('knife-controls').style.display = 'block';
}

function toggleKnifeMode() {
    knifeMode = !knifeMode;
    
    const knifeBtn = document.getElementById('use-knife-btn');
    const currentPlayerCell = tbl.rows[players[currentPlayerIndex].row].cells[players[currentPlayerIndex].col];
    
    if (knifeMode) {
        highlightKnifeTargets();
        knifeBtn.classList.add('active-mode');
        currentPlayerCell.classList.add('knife-mode-active');
        document.body.classList.add('knife-mode');
    } else {
        clearKnifeTargets();
        knifeBtn.classList.remove('active-mode');
        currentPlayerCell.classList.remove('knife-mode-active');
        document.body.classList.remove('knife-mode');
    }
}

function highlightKnifeTargets() {
    const currentPlayer = players[currentPlayerIndex];
    
    for (let i = Math.max(0, currentPlayer.row - knifeRange); 
         i <= Math.min(ROWS - 1, currentPlayer.row + knifeRange); i++) {
        for (let j = Math.max(0, currentPlayer.col - knifeRange); 
             j <= Math.min(COLS - 1, currentPlayer.col + knifeRange); j++) {
            
            if (i === currentPlayer.row && j === currentPlayer.col) continue;
            
            const cell = tbl.rows[i].cells[j];
            
            const hasRock = cell.classList.contains("rock-cell");
            const enemyPlayer = players.find(p => 
                p.row === i && p.col === j && p.isAlive && p.team !== currentPlayer.team
            );
            
            if (hasRock || enemyPlayer) {
                cell.classList.add("knife-target");
                cell.addEventListener('click', handleKnifeAttack);
            }
        }
    }
}

function clearKnifeTargets() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            cell.classList.remove("knife-target");
            cell.removeEventListener('click', handleKnifeAttack);
        }
    }
}

function handleKnifeAttack() {
    if (!knifeMode) return;
    
    const row = this.parentNode.rowIndex;
    const col = this.cellIndex;
    const currentPlayer = players[currentPlayerIndex];
    
    if (this.classList.contains("rock-cell")) {
        this.classList.remove("rock-cell");
    }
    
    const targetPlayer = players.find(p => 
        p.row === row && p.col === col && p.isAlive && p.team !== currentPlayer.team
    );
    
    if (targetPlayer) {
        handlePlayerKilledByKnife(targetPlayer);
    }
    
    this.classList.remove("knife-target");
    
    currentMovesMade++;
    
    updatePlayerPositions();
    checkGameEnd();
    
    knifeMode = false;
    clearKnifeTargets();
    const knifeBtn = document.getElementById('use-knife-btn');
    const currentPlayerCell = tbl.rows[currentPlayer.row].cells[currentPlayer.col];
    knifeBtn.classList.remove('active-mode');
    currentPlayerCell.classList.remove('knife-mode-active'); 
    document.body.classList.remove('knife-mode');
    
    if (currentMovesMade >= 2) {
        endTurn();
    }
}

function handlePlayerKilledByKnife(player) {
    player.isAlive = false;
    
    if (player.hasFlag) {
        player.hasFlag = false;
        const flagCell = player.team === 'top' 
            ? tbl.rows[0].cells[13]
            : tbl.rows[ROWS-1].cells[13];
        flagCell.classList.add("flag-cell");
        flagCell.dataset.flagType = player.team;
    }
    
    switch(player.id) {
        case 1: player.row = 0; player.col = 12; break;
        case 2: player.row = 0; player.col = 14; break;
        case 3: player.row = 15; player.col = 12; break;
        case 4: player.row = 15; player.col = 14; break;
    }
}

// ==========================================
// CONFIGURAZIONE CONTROLLI GIOCATORE
// ==========================================

function setupPlayerControls() {
    document.getElementById('construction-controls').style.display = 'none';
    document.getElementById('bomb-controls').style.display = 'none';
    document.getElementById('knife-controls').style.display = 'none';
    
    setupKnifeControls();
    
    if (players[currentPlayerIndex].role === 'constructor') {
        setupConstructionControls();
    } else if (players[currentPlayerIndex].role === 'bomber') {
        setupBombControls();
    }
}