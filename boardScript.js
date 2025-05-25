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
// CONFIGURAZIONE GIOCATORI
// ==========================================

/**
 * Array dei giocatori del gioco
 * - Player 1,2: Team "top" (partono dalle righe superiori)
 * - Player 3,4: Team "bottom" (partono dalle righe inferiori)
 * - Ogni giocatore può essere 'bomber' o 'constructor'
 */
var players = [
    { id: 1, row: 0, col: 12, role: '', team: 'top', hasFlag: false, active: false, isAlive: true },
    { id: 2, row: 0, col: 14, role: '', team: 'top', hasFlag: false, active: false, isAlive: true },
    { id: 3, row: 15, col: 12, role: '', team: 'bottom', hasFlag: false, active: false, isAlive: true },
    { id: 4, row: 15, col: 14, role: '', team: 'bottom', hasFlag: false, active: false, isAlive: true }
];

// ==========================================
// STATO DEL GIOCO
// ==========================================

// Indice del giocatore che sta scegliendo il ruolo
var currentPlayerChoosing = 0;

// Flag per indicare se la selezione dei ruoli è completata
var roleSelectionDone = false;

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
// INIZIALIZZAZIONE DOM
// ==========================================

/**
 * Event listener che si attiva quando il DOM è completamente caricato
 * Verifica la presenza degli elementi HTML essenziali e avvia la selezione ruoli
 */
window.addEventListener('DOMContentLoaded', function() {
    console.log("DOM caricato, verifico elementi essenziali...");
    
    // Verifica presenza elementi critici dell'interfaccia
    if (!document.getElementById('role-selection')) {
        console.error("Elemento role-selection non trovato!");
        return;
    }
    
    if (!document.getElementById('start-game')) {
        console.error("Pulsante start-game non trovato!");
        return;
    }
    
    console.log("Tutti gli elementi essenziali trovati, avvio selezione ruoli");
    startRoleSelection();
});

// ==========================================
// GESTIONE TURNI E GIOCATORI
// ==========================================

/**
 * Trova il prossimo giocatore vivo dopo l'indice specificato
 * @param {number} startIndex - Indice da cui iniziare la ricerca
 * @returns {number} Indice del prossimo giocatore vivo, -1 se non ce ne sono
 */
function findNextAlivePlayer(startIndex) {
    let index = startIndex;
    let attempts = 0;
    
    do {
        index = (index + 1) % players.length;
        attempts++;
        
        // Evita loop infiniti se tutti i giocatori sono morti
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
 * @returns {boolean} True se il giocatore corrente è vivo, false altrimenti
 */
function checkCurrentPlayerAlive() {
    if (!players[currentPlayerIndex].isAlive) {
        const nextPlayerIndex = findNextAlivePlayer(currentPlayerIndex);
        
        // Se non ci sono più giocatori vivi, è pareggio
        if (nextPlayerIndex === -1) {
            showVictoryScreen('draw');
            return false;
        }
        
        // Passa al prossimo giocatore vivo
        players[currentPlayerIndex].active = false;
        currentPlayerIndex = nextPlayerIndex;
        players[currentPlayerIndex].active = true;
        currentMovesMade = 0;
        bombsPlacedThisTurn = 0;
        
        // Aggiorna interfaccia
        updatePlayerPositions();
        updateTurnIndicator();
        
        // Configura i controlli in base al ruolo del nuovo giocatore
        setupPlayerControls();
    }
    return true;
}

// ==========================================
// GESTIONE BOMBE ED ESPLOSIONI
// ==========================================

/**
 * Gestisce l'esplosione di tutte le bombe attive
 * Prima mostra un avviso visivo, poi dopo 1 secondo esegue l'esplosione
 */
function explodeBombs() {
    const explodingBombs = bombs.filter(bomba => bomba.timer < 1); 

    let playersKilled = 0;

    bombs.forEach(bomb => {
            // Le bombe esplodono in un'area 3x3 centrata sulla bomba
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
        
        // Applica effetti esplosione all'area 3x3
        for (let i = Math.max(0, bomb.row - 1); i <= Math.min(ROWS - 1, bomb.row + 1); i++) {
            for (let j = Math.max(0, bomb.col - 1); j <= Math.min(COLS - 1, bomb.col + 1); j++) {
                const targetCell = tbl.rows[i].cells[j];
                targetCell.classList.remove("explosion-warning");
                
                // Le rocce vengono distrutte dall'esplosione
                if (targetCell.classList.contains("rock-cell")) {
                    targetCell.classList.remove("rock-cell");
                }
                
                // Controlla se c'è un giocatore nella cella colpita
                const playerInCell = players.find(p => p.row === i && p.col === j);
                if (playerInCell && playerInCell.isAlive) {
                    handlePlayerHitByExplosion(playerInCell);
                    playersKilled++;
                }
            }
        }
    });
    
    // Rimuove le bombe esplose
    bombs = bombs.filter(bomba => bomba.timer >= 1);

    updatePlayerPositions();
    
    // Controlla se il gioco è finito
    checkGameEnd();
    
    // Se il giocatore corrente è morto, passa al prossimo turno
    if (!players[currentPlayerIndex].isAlive) {
        endTurn();
    }
}

// Riduzione turni bombe
function bombTurnReduction (){
    bombs.forEach(b =>{
        b.timer -= 1;
    });
}

/**
 * Controlla se il gioco è finito (un solo team rimasto o tutti morti)
 */
function checkGameEnd() {
    const aliveTeams = new Set();
    const alivePlayers = players.filter(p => p.isAlive);
    
    // Raccoglie tutti i team con giocatori ancora vivi
    alivePlayers.forEach(player => {
        aliveTeams.add(player.team);
    });
    
    // Vittoria se rimane un solo team
    if (aliveTeams.size === 1) {
        showVictoryScreen(aliveTeams.values().next().value);
    } 
    // Pareggio se non ci sono team vivi
    else if (aliveTeams.size === 0) {
        showVictoryScreen('draw');
    }
    
    // Caso speciale: se rimane un solo giocatore, vince il suo team
    if (alivePlayers.length === 1) {
        showVictoryScreen(alivePlayers[0].team);
    }
}

/**
 * Termina il turno del giocatore corrente e passa al prossimo
 */
function endTurn() {
    // Disattiva tutte le modalità attive e rimuove indicatori
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
    
    // Disattiva modalità coltello e rimuove tutti gli indicatori
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
    
    // Reset contatori turno
    currentMovesMade = 0;
    bombsPlacedThisTurn = 0;
    
    // IMPORTANTE: Il turno deve SEMPRE finire, indipendentemente dalle bombe
    players[currentPlayerIndex].active = false;
    
    // Trova il prossimo giocatore vivo
    const nextPlayerIndex = findNextAlivePlayer(currentPlayerIndex);
    
    if (nextPlayerIndex === -1) {
        showVictoryScreen('draw');
        return;
    }
    
    // Cambia giocatore attivo
    currentPlayerIndex = nextPlayerIndex;
    players[currentPlayerIndex].active = true;

    // Controllo ridondante - può essere rimosso
    if (bombs.length > 0 && currentMovesMade > 1) {
        endTurn();
    }

    // Reset contatori per il nuovo giocatore
    currentMovesMade = 0;
    bombsPlacedThisTurn = 0;
    
    // Aggiorna interfaccia
    updatePlayerPositions();
    updateTurnIndicator();
    
    // Configura controlli per il nuovo giocatore
    setupPlayerControls();

    explodeBombs();
    bombTurnReduction();
}

/**
 * Gestisce quando un giocatore viene colpito da un'esplosione
 * @param {Object} player - Il giocatore colpito
 */
function handlePlayerHitByExplosion(player) {
    player.isAlive = false;
    
    // Se il giocatore aveva la bandiera, la rimette nella base
    if (player.hasFlag) {
        player.hasFlag = false;
        const flagCell = player.team === 'top' 
            ? tbl.rows[0].cells[13]        // Bandiera team superiore
            : tbl.rows[ROWS-1].cells[13];  // Bandiera team inferiore
        flagCell.classList.add("flag-cell");
        flagCell.dataset.flagType = player.team;
    }
    
    // Riporta il giocatore alla posizione di spawn
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

/**
 * Aggiorna la visualizzazione di tutti i giocatori sulla griglia
 * Rimuove le vecchie classi CSS e applica quelle nuove
 */
function updatePlayerPositions() {
    // Prima rimuove tutte le classi giocatore da ogni cella
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
    
    // Poi applica le classi appropriate per ogni giocatore
    players.forEach(player => {
        let cell = tbl.rows[player.row].cells[player.col];
        cell.classList.add(`player${player.id}-cell`);
        cell.dataset.player = player.id;
        
        // Se il giocatore è morto, mostra solo l'indicatore di morte
        if (!player.isAlive) {
            cell.classList.add("dead-player");
            return;
        }
        
        // Aggiunge classe per il ruolo
        if (player.role === 'bomber') {
            cell.classList.add("bomber");
        } else {
            cell.classList.add("constructor");
        }
        
        // Aggiunge classe se ha la bandiera
        if (player.hasFlag) {
            cell.classList.add("player-with-flag");
        }
        
        // Aggiunge classe se è il giocatore attivo
        if (player.active) {
            cell.classList.add("active-player");
            
            // Se è in modalità coltello, riapplica l'indicatore
            if (knifeMode && players[currentPlayerIndex].id === player.id) {
                cell.classList.add("knife-mode-active");
            }
        }
    });
}

/**
 * Aggiorna l'indicatore del turno corrente nell'interfaccia
 */
function updateTurnIndicator() {
    const currentPlayer = players[currentPlayerIndex];
    const indicator = document.getElementById('current-player');
    
    if (!currentPlayer.isAlive) {
        indicator.textContent = `${currentPlayer.id} (Morto)`;
        indicator.style.color = 'red';
    } else {
        indicator.textContent = currentPlayer.id;
        indicator.style.color = 'inherit';
    }
}

// ==========================================
// GESTIONE INPUT E MOVIMENTO
// ==========================================

/**
 * Gestisce i tasti premuti per il movimento e le azioni
 * @param {KeyboardEvent} e - L'evento tastiera
 */
function handleKeyPress(e) {
    // Non accetta input se il gioco non è iniziato o si è in modalità speciale
    if (!gameStarted || constructionMode || bombMode || knifeMode || !players[currentPlayerIndex].isAlive) return;
    
    // Controlla che il giocatore corrente sia vivo
    if (!checkCurrentPlayerAlive()) {
        return;
    }
    
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer.active) return;

    // Barra spaziatrice: termina il turno
    if (e.key.toLowerCase() === ' ') {
        endTurn();
        return;
    }

    // Non può muoversi se ha già fatto 2 mosse
    if (currentMovesMade >= 2) return;

    // Calcola nuova posizione in base al tasto premuto
    let newRow = currentPlayer.row;
    let newCol = currentPlayer.col;
    
    switch(e.key.toLowerCase()) {
        case 'w': newRow--; break; // Su
        case 'a': newCol--; break; // Sinistra
        case 's': newRow++; break; // Giù
        case 'd': newCol++; break; // Destra
        default: return; // Tasto non riconosciuto
    }
    
    // Controlla che la nuova posizione sia dentro i limiti della griglia
    if (newRow < 0 || newRow >= ROWS || newCol < 0 || newCol >= COLS) {
        return;
    }
    
    // Controlla che la cella di destinazione sia libera
    let targetCell = tbl.rows[newRow].cells[newCol];
    if (targetCell.classList.contains("rock-cell") || targetCell.classList.contains("bomb-cell")) {
        return;
    }
    
    // Controlla che non ci sia un altro giocatore vivo nella cella
    const cellHasPlayer = players.some(p => p.row === newRow && p.col === newCol && p.isAlive);
    if (cellHasPlayer) {
        return;
    }
    
    // Movimento valido: aggiorna posizione
    currentPlayer.row = newRow;
    currentPlayer.col = newCol;
    
    // ==========================================
    // LOGICA CATTURA BANDIERA
    // ==========================================
    
    // Se non ha ancora la bandiera, controlla se può prenderla
    if (!currentPlayer.hasFlag) {
        if (currentPlayer.team === 'bottom' && targetCell.dataset.flagType === 'top') {
            // Team bottom prende bandiera del team top
            currentPlayer.hasFlag = true;
            targetCell.classList.remove("flag-cell");
            targetCell.dataset.flagType = "";
        }
        else if (currentPlayer.team === 'top' && targetCell.dataset.flagType === 'bottom') {
            // Team top prende bandiera del team bottom
            currentPlayer.hasFlag = true;
            targetCell.classList.remove("flag-cell");
            targetCell.dataset.flagType = "";
        }
    } else {
        // Se ha la bandiera, controlla se può vincere portandola alla base
        if ((currentPlayer.team === 'bottom' && targetCell.dataset.flagType === 'bottom') || 
            (currentPlayer.team === 'top' && targetCell.dataset.flagType === 'top')) {
            showVictoryScreen(currentPlayer.team);
            return;
        }
    }
    
    // Aggiorna visualizzazione
    updatePlayerPositions();
    
    // Incrementa contatore mosse
    currentMovesMade++;
    if (currentMovesMade >= 2) {
        endTurn();
    }
}

// ==========================================
// CREAZIONE MAPPA
// ==========================================

/**
 * Crea la griglia di gioco HTML
 * @param {string} placeholder - ID dell'elemento HTML che conterrà la mappa
 * @param {number} rows - Numero di righe
 * @param {number} cols - Numero di colonne
 */
function makeMap(placeholder, rows, cols) {
    const container = document.getElementById(placeholder);
    if (!container) {
        console.error("Container non trovato:", placeholder);
        return;
    }
    
    container.innerHTML = '';
    
    // Crea la tabella
    tbl = document.createElement("table");
    for (let i = 0; i < rows; i++) {
        let tr = document.createElement("tr");
        for (let j = 0; j < cols; j++) {
            let td = document.createElement("td");
            td.setAttribute("class", "cella");

            // Posiziona le bandiere nelle basi
            if (i === 0 && j === 13) {
                // Bandiera team superiore
                td.className += " flag-cell";
                td.dataset.flagType = "top";
            } else if (i === rows-1 && j === 13) {
                // Bandiera team inferiore
                td.className += " flag-cell";
                td.dataset.flagType = "bottom";
            }
            
            // Genera rocce casuali (evitando le aree di spawn)
            if (i > 0 && i < rows-1 && Math.random() < ROCK_PROBABILITY && 
                !(i === 1 && (j === 13 || j === 15)) && 
                !(i === 14 && (j === 13 || j === 15))) {
                td.className += " rock-cell";
            }

            tr.appendChild(td);
        }
        tbl.appendChild(tr);
    }

    // Aggiunge la tabella al DOM
    let d = document.getElementById(placeholder);
    d.appendChild(tbl);
    
    // Aggiunge l'event listener per i controlli tastiera
    document.addEventListener('keydown', handleKeyPress);
}

// ==========================================
// SCHERMATA VITTORIA
// ==========================================

/**
 * Mostra la schermata di vittoria
 * @param {string} winningTeam - Il team vincitore ('top', 'bottom', o 'draw')
 */
function showVictoryScreen(winningTeam) {
    document.getElementById('contentbox').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'flex';
    
    if (winningTeam === 'draw') {
        document.getElementById('winning-team').textContent = 'Pareggio! Tutti i giocatori sono morti';
    } else {
        document.getElementById('winning-team').textContent = winningTeam === 'top' ? 'Team Sopra' : 'Team Sotto';
    }
}

// ==========================================
// SELEZIONE RUOLI
// ==========================================

/**
 * Avvia il processo di selezione dei ruoli
 */
function startRoleSelection() {
    document.getElementById('player-choice-screen').style.display = 'block';
    showNextPlayerChoice();
}

/**
 * Mostra l'interfaccia per la scelta del ruolo del prossimo giocatore
 */
function showNextPlayerChoice() {
    if (currentPlayerChoosing >= players.length) {
        completeRoleSelection();
        return;
    }
    
    // Aggiorna l'indicatore del giocatore corrente
    document.getElementById('current-player-choosing').textContent = players[currentPlayerChoosing].id;
    
    // Reset visual delle opzioni
    document.querySelectorAll('.role-option').forEach(opt => {
        opt.style.opacity = '1';
        opt.style.transform = 'scale(1)';
        opt.style.border = 'none';
    });
}

/**
 * Completa il processo di selezione ruoli
 */
function completeRoleSelection() {
    document.getElementById('player-choice-screen').style.display = 'none';
    document.getElementById('role-selection-complete').style.display = 'block';
    roleSelectionDone = true;
    checkAllRolesSelected();
}

/**
 * Controlla se tutti i giocatori hanno scelto un ruolo
 */
function checkAllRolesSelected() {
    const allSelected = players.every(player => player.role !== '');
    document.getElementById('start-game').disabled = !allSelected;
}

// ==========================================
// MODALITÀ COSTRUZIONE
// ==========================================

/**
 * Evidenzia le celle dove il giocatore corrente può costruire
 */
function highlightBuildableCells() {
    const currentPlayer = players[currentPlayerIndex];
    
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            // Usa distanza Manhattan per calcolare il range
            const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
            
            // Può costruire se:
            // - È nel range di costruzione
            // - Non c'è già una roccia
            // - Non c'è una bandiera
            // - Non c'è una bomba
            // - Non c'è un giocatore vivo
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

/**
 * Rimuove l'evidenziazione delle celle costruibili
 */
function clearBuildableHighlights() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            cell.classList.remove("buildable");
            cell.removeEventListener('click', handleCellClick);
        }
    }
}

/**
 * Gestisce il click su una cella durante la modalità costruzione
 */
function handleCellClick() {
    if (!constructionMode) return;
    
    const row = this.parentNode.rowIndex;
    const col = this.cellIndex;
    
    // Costruisce un muro nella cella cliccata
    this.classList.add("rock-cell");
    this.classList.remove("buildable");
    
    // Incrementa il contatore mosse
    currentMovesMade++;
    if (currentMovesMade >= 5) {
        endTurn();
    }
    
    // Esce dalla modalità costruzione
    constructionMode = false;
    clearBuildableHighlights();
}

/**
 * Configura i controlli per la modalità costruzione
 */
function setupConstructionControls() {
    const buildBtn = document.getElementById('build-wall-btn');
    buildBtn.addEventListener('click', toggleConstructionMode);
    document.getElementById('construction-controls').style.display = 'block';
}

/**
 * Attiva/disattiva la modalità costruzione
 */
function toggleConstructionMode() {
    constructionMode = !constructionMode;
    
    if (constructionMode) {
        highlightBuildableCells();
    } else {
        clearBuildableHighlights();
    }
}

// ==========================================
// MODALITÀ BOMBA
// ==========================================

/**
 * Configura i controlli per la modalità bomba
 */
function setupBombControls() {
    const bombBtn = document.getElementById('place-bomb-btn');
    bombBtn.addEventListener('click', toggleBombMode);
    document.getElementById('bomb-controls').style.display = 'block';
}

/**
 * Attiva/disattiva la modalità bomba
 */
function toggleBombMode() {
    // Massimo 1 bomba per turno
    if (bombsPlacedThisTurn >= 1) return;
    
    bombMode = !bombMode;
    
    if (bombMode) {
        highlightBombTargets();
    } else {
        clearBombTargets();
    }
}

/**
 * Evidenzia le celle dove il giocatore corrente può piazzare bombe
 */
function highlightBombTargets() {
    const currentPlayer = players[currentPlayerIndex];
    
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            // Usa distanza Manhattan per calcolare il range
            const distance = Math.abs(i - currentPlayer.row) + Math.abs(j - currentPlayer.col);
            
            // Può piazzare bomba se:
            // - È nel range di bombardamento
            // - Non c'è già una roccia
            // - Non c'è una bandiera
            // - Non c'è già una bomba
            // - Non c'è un giocatore vivo
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

/**
 * Rimuove l'evidenziazione dei bersagli bomba
 */
function clearBombTargets() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            cell.classList.remove("bomb-target");
            cell.removeEventListener('click', handleBombPlacement);
        }
    }
}

/**
 * Gestisce il piazzamento di una bomba
 */
function handleBombPlacement() {
    if (!bombMode || bombsPlacedThisTurn >= 1) return;
    
    const row = this.parentNode.rowIndex;
    const col = this.cellIndex;
    
    // Piazza la bomba visivamente
    this.classList.add("bomb-cell");
    this.classList.remove("bomb-target");
    
    // Aggiunge la bomba all'array delle bombe attive
    bombs.push({
        row: row,
        col: col,
        timer: 3 // Le bombe esplodono dopo 3 turni
    });
    
    // Aggiorna contatori
    bombsPlacedThisTurn++;
    currentMovesMade++;
    
    // Se ha fatto 2 mosse, termina il turno
    if (currentMovesMade >= 2) {
        endTurn();
    }
    
    // Esce dalla modalità bomba
    bombMode = false;
    clearBombTargets();
}

// ==========================================
// MODALITÀ COLTELLO (NUOVA FUNZIONALITÀ)
// ==========================================

/**
 * Configura i controlli per la modalità coltello (disponibile per tutti i giocatori)
 */
function setupKnifeControls() {
    const knifeBtn = document.getElementById('use-knife-btn');
    knifeBtn.addEventListener('click', toggleKnifeMode);
    document.getElementById('knife-controls').style.display = 'block';
}

/**
 * Attiva/disattiva la modalità coltello
 */
function toggleKnifeMode() {
    knifeMode = !knifeMode;
    
    const knifeBtn = document.getElementById('use-knife-btn');
    const currentPlayerCell = tbl.rows[players[currentPlayerIndex].row].cells[players[currentPlayerIndex].col];
    
    if (knifeMode) {
        // Attiva modalità coltello
        highlightKnifeTargets();
        knifeBtn.classList.add('active-mode');
        currentPlayerCell.classList.add('knife-mode-active');
        document.body.classList.add('knife-mode');
        console.log(`Giocatore ${players[currentPlayerIndex].id} ha attivato la modalità coltello`);
    } else {
        // Disattiva modalità coltello
        clearKnifeTargets();
        knifeBtn.classList.remove('active-mode');
        currentPlayerCell.classList.remove('knife-mode-active');
        document.body.classList.remove('knife-mode');
        console.log(`Giocatore ${players[currentPlayerIndex].id} ha disattivato la modalità coltello`);
    }
}

/**
 * Evidenzia le celle dove il giocatore corrente può usare il coltello
 * Il coltello ha raggio 1 (area 3x3 centrata sul giocatore)
 */
function highlightKnifeTargets() {
    const currentPlayer = players[currentPlayerIndex];
    
    // Area 3x3 centrata sul giocatore (raggio 1)
    for (let i = Math.max(0, currentPlayer.row - knifeRange); 
         i <= Math.min(ROWS - 1, currentPlayer.row + knifeRange); i++) {
        for (let j = Math.max(0, currentPlayer.col - knifeRange); 
             j <= Math.min(COLS - 1, currentPlayer.col + knifeRange); j++) {
            
            // Non può attaccare se stesso
            if (i === currentPlayer.row && j === currentPlayer.col) continue;
            
            const cell = tbl.rows[i].cells[j];
            
            // Può attaccare se:
            // - C'è una roccia (per distruggerla)
            // - C'è un giocatore nemico vivo
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

/**
 * Rimuove l'evidenziazione dei bersagli del coltello
 */
function clearKnifeTargets() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            const cell = tbl.rows[i].cells[j];
            cell.classList.remove("knife-target");
            cell.removeEventListener('click', handleKnifeAttack);
        }
    }
}

/**
 * Gestisce l'attacco con il coltello
 */
function handleKnifeAttack() {
    if (!knifeMode) return;
    
    const row = this.parentNode.rowIndex;
    const col = this.cellIndex;
    const currentPlayer = players[currentPlayerIndex];
    
    console.log(`Giocatore ${currentPlayer.id} usa il coltello sulla cella [${row}, ${col}]`);
    
    // Se c'è una roccia, la distrugge
    if (this.classList.contains("rock-cell")) {
        this.classList.remove("rock-cell");
        console.log(`Giocatore ${currentPlayer.id} ha distrutto una roccia con il coltello`);
    }
    
    // Se c'è un giocatore nemico, lo uccide
    const targetPlayer = players.find(p => 
        p.row === row && p.col === col && p.isAlive && p.team !== currentPlayer.team
    );
    
    if (targetPlayer) {
        console.log(`Giocatore ${currentPlayer.id} ha ucciso il giocatore ${targetPlayer.id} con il coltello`);
        handlePlayerKilledByKnife(targetPlayer); // Usa una funzione specifica per il coltello
    }
    
    // Rimuove l'evidenziazione del bersaglio
    this.classList.remove("knife-target");
    
    // Incrementa il contatore mosse (come richiesto)
    currentMovesMade++;
    
    // Aggiorna la visualizzazione
    updatePlayerPositions();
    
    // Controlla se il gioco è finito
    checkGameEnd();
    
    // Esce dalla modalità coltello e rimuove tutti gli indicatori
    knifeMode = false;
    clearKnifeTargets();
    const knifeBtn = document.getElementById('use-knife-btn');
    const currentPlayerCell = tbl.rows[currentPlayer.row].cells[currentPlayer.col];
    knifeBtn.classList.remove('active-mode');
    currentPlayerCell.classList.remove('knife-mode-active'); 
    document.body.classList.remove('knife-mode');
    
    // Se ha fatto 2 mosse, termina il turno
    if (currentMovesMade >= 2) {
        endTurn();
    }
}

/**
 * Gestisce quando un giocatore viene ucciso dal coltello
 * @param {Object} player - Il giocatore ucciso
 */
function handlePlayerKilledByKnife(player) {
    console.log(`Uccidendo giocatore ${player.id} con il coltello`);
    
    player.isAlive = false;
    
    // Se il giocatore aveva la bandiera, la rimette nella base
    if (player.hasFlag) {
        player.hasFlag = false;
        const flagCell = player.team === 'top' 
            ? tbl.rows[0].cells[13]        // Bandiera team superiore
            : tbl.rows[ROWS-1].cells[13];  // Bandiera team inferiore
        flagCell.classList.add("flag-cell");
        flagCell.dataset.flagType = player.team;
        console.log(`La bandiera del team ${player.team} è stata riportata alla base`);
    }
    
    // Riporta il giocatore alla posizione di spawn
    switch(player.id) {
        case 1: player.row = 0; player.col = 12; break;
        case 2: player.row = 0; player.col = 14; break;
        case 3: player.row = 15; player.col = 12; break;
        case 4: player.row = 15; player.col = 14; break;
    }
    
    console.log(`Giocatore ${player.id} riportato alla posizione di spawn`);
}

// ==========================================
// CONFIGURAZIONE CONTROLLI GIOCATORE
// ==========================================

/**
 * Configura i controlli in base al ruolo del giocatore corrente
 * Il coltello è sempre disponibile per tutti i giocatori
 */
function setupPlayerControls() {
    // Prima nasconde tutti i controlli
    document.getElementById('construction-controls').style.display = 'none';
    document.getElementById('bomb-controls').style.display = 'none';
    document.getElementById('knife-controls').style.display = 'none';
    
    // Il coltello è sempre disponibile per tutti i giocatori
    setupKnifeControls();
    
    // Configura controlli specifici per ruolo
    if (players[currentPlayerIndex].role === 'constructor') {
        setupConstructionControls();
    } else if (players[currentPlayerIndex].role === 'bomber') {
        setupBombControls();
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

/**
 * Event listener per la selezione dei ruoli
 */
document.querySelectorAll('.role-option').forEach(option => {
    option.addEventListener('click', function() {
        if (roleSelectionDone) return;
        
        const role = this.dataset.role;
        players[currentPlayerChoosing].role = role;
        
        // Animazione di selezione
        document.querySelectorAll('.role-option').forEach(opt => {
            opt.style.opacity = '0.5';
            opt.style.transform = 'scale(0.95)';
        });
        this.style.opacity = '1';
        this.style.transform = 'scale(1.1)';
        
        // Passa al prossimo giocatore dopo un breve delay
        setTimeout(() => {
            currentPlayerChoosing++;
            showNextPlayerChoice();
            checkAllRolesSelected();
            
            // Reset animazioni
            document.querySelectorAll('.role-option').forEach(opt => {
                opt.style.opacity = '1';
                opt.style.transform = 'scale(1)';
            });
        }, 500);
    });
});

/**
 * Event listener per il pulsante "Inizia Gioco"
 */
document.getElementById('start-game').addEventListener('click', function() {
    try {
        if (!roleSelectionDone) {
            console.error("Selezione ruoli non completata");
            return;
        }
        
        console.log("Avvio del gioco...");
        
        // Pulisce la mappa esistente
        const mapContainer = document.getElementById('mapcontent');
        if (mapContainer) mapContainer.innerHTML = '';
        
        // Nasconde selezione ruoli e mostra il gioco
        document.getElementById('role-selection').style.display = 'none';
        document.getElementById('contentbox').style.display = 'flex';
        
        // Crea la mappa e inizializza il gioco
        makeMap("mapcontent", ROWS, COLS);
        gameStarted = true;
        players[currentPlayerIndex].active = true;
        updatePlayerPositions();
        updateTurnIndicator();
        
        // Configura i controlli per il primo giocatore
        setupPlayerControls();
        
        console.log("Gioco avviato con successo");
    } catch (error) {
        console.error("Errore durante l'avvio del gioco:", error);
        alert("Errore durante l'avvio! Controlla la console.");
    }
});

// Event listener duplicato - può essere rimosso
window.addEventListener('DOMContentLoaded', startRoleSelection);