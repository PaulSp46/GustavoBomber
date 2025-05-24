// Variabili globali
var ROWS = 16;
var COLS = 27;
var constructionMode = false;
var bombMode = false;
var constructionRange = 5;
var bombRange = 3;
var isBuilding = false;
var tbl;
var ROCK_PROBABILITY = 0.1;
var players = [
    { id: 1, row: 0, col: 12, role: '', team: 'top', hasFlag: false, active: false, isAlive: true },
    { id: 2, row: 0, col: 14, role: '', team: 'top', hasFlag: false, active: false, isAlive: true },
    { id: 3, row: 15, col: 12, role: '', team: 'bottom', hasFlag: false, active: false, isAlive: true },
    { id: 4, row: 15, col: 14, role: '', team: 'bottom', hasFlag: false, active: false, isAlive: true }
];
var currentPlayerChoosing = 0;
var roleSelectionDone = false;
var currentPlayerIndex = 0;
var gameStarted = false;
var currentMovesMade = 0;
var bombs = [];
var bombsPlacedThisTurn = 0;

window.addEventListener('DOMContentLoaded', function() {
    console.log("DOM caricato, verifico elementi essenziali...");
    
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
        
        if (players[currentPlayerIndex].role === 'constructor') {
            setupConstructionControls();
        } else if (players[currentPlayerIndex].role === 'bomber') {
            setupBombControls();
        }
    }
    return true;
}

function explodeBombs() {
    bombs.forEach(bomb => {
        for (let i = Math.max(0, bomb.row - 1); i <= Math.min(ROWS - 1, bomb.row + 1); i++) {
            for (let j = Math.max(0, bomb.col - 1); j <= Math.min(COLS - 1, bomb.col + 1); j++) {
                const targetCell = tbl.rows[i].cells[j];
                targetCell.classList.add("explosion-warning");
            }
        }
    });

    setTimeout(() => {
        let playersKilled = 0;
        
        bombs.forEach(bomb => {
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
        
        bombs = [];
        updatePlayerPositions();
        
        checkGameEnd();
        
        if (!players[currentPlayerIndex].isAlive) {
            endTurn();
        }
    }, 1000);
}

function checkGameEnd() {
    const aliveTeams = new Set();
    const alivePlayers = players.filter(p => p.isAlive);
    
    alivePlayers.forEach(player => {
        aliveTeams.add(player.team);
    });
    
    if (aliveTeams.size === 1) {
        showVictoryScreen(aliveTeams.values().next().value);
    } else if (aliveTeams.size === 0) {
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
    
    currentMovesMade = 0;
    bombsPlacedThisTurn = 0;
    
    explodeBombs();
    
    if (bombs.length === 0) {
        players[currentPlayerIndex].active = false;
        
        const nextPlayerIndex = findNextAlivePlayer(currentPlayerIndex);
        
        if (nextPlayerIndex === -1) {
            showVictoryScreen('draw');
            return;
        }
        
        currentPlayerIndex = nextPlayerIndex;
        players[currentPlayerIndex].active = true;
        currentMovesMade = 0;
        bombsPlacedThisTurn = 0;
        
        updatePlayerPositions();
        updateTurnIndicator();
        
        if (players[currentPlayerIndex].role === 'constructor') {
            setupConstructionControls();
        } else if (players[currentPlayerIndex].role === 'bomber') {
            setupBombControls();
        }
    }
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

function updatePlayerPositions() {
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            let cell = tbl.rows[i].cells[j];
            cell.classList.remove(
                "player1-cell", "player2-cell", "player3-cell", "player4-cell", 
                "player-with-flag", "bomber", "constructor", "active-player", "dead-player"
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
        indicator.textContent = currentPlayer.id;
        indicator.style.color = 'inherit';
    }
}

function handleKeyPress(e) {
    if (!gameStarted || constructionMode || bombMode || !players[currentPlayerIndex].isAlive) return;
    
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

function showVictoryScreen(winningTeam) {
    document.getElementById('contentbox').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'flex';
    
    if (winningTeam === 'draw') {
        document.getElementById('winning-team').textContent = 'Pareggio! Tutti i giocatori sono morti';
    } else {
        document.getElementById('winning-team').textContent = winningTeam === 'top' ? 'Team Sopra' : 'Team Sotto';
    }
}

function startRoleSelection() {
    document.getElementById('player-choice-screen').style.display = 'block';
    showNextPlayerChoice();
}

function showNextPlayerChoice() {
    if (currentPlayerChoosing >= players.length) {
        completeRoleSelection();
        return;
    }
    
    document.getElementById('current-player-choosing').textContent = players[currentPlayerChoosing].id;
    
    document.querySelectorAll('.role-option').forEach(opt => {
        opt.style.opacity = '1';
        opt.style.transform = 'scale(1)';
        opt.style.border = 'none';
    });
}

function completeRoleSelection() {
    document.getElementById('player-choice-screen').style.display = 'none';
    document.getElementById('role-selection-complete').style.display = 'block';
    roleSelectionDone = true;
    checkAllRolesSelected();
}

function checkAllRolesSelected() {
    const allSelected = players.every(player => player.role !== '');
    document.getElementById('start-game').disabled = !allSelected;
}

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
    if (currentMovesMade >= 2) {
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
        timer: 1
    });
    
    bombsPlacedThisTurn++;
    currentMovesMade++;
    
    if (currentMovesMade >= 2) {
        endTurn();
    }
    
    bombMode = false;
    clearBombTargets();
}

document.querySelectorAll('.role-option').forEach(option => {
    option.addEventListener('click', function() {
        if (roleSelectionDone) return;
        
        const role = this.dataset.role;
        players[currentPlayerChoosing].role = role;
        
        document.querySelectorAll('.role-option').forEach(opt => {
            opt.style.opacity = '0.5';
            opt.style.transform = 'scale(0.95)';
        });
        this.style.opacity = '1';
        this.style.transform = 'scale(1.1)';
        
        setTimeout(() => {
            currentPlayerChoosing++;
            showNextPlayerChoice();
            checkAllRolesSelected();
            
            document.querySelectorAll('.role-option').forEach(opt => {
                opt.style.opacity = '1';
                opt.style.transform = 'scale(1)';
            });
        }, 500);
    });
});

document.getElementById('start-game').addEventListener('click', function() {
    try {
        if (!roleSelectionDone) {
            console.error("Selezione ruoli non completata");
            return;
        }
        
        console.log("Avvio del gioco...");
        
        const mapContainer = document.getElementById('mapcontent');
        if (mapContainer) mapContainer.innerHTML = '';
        
        document.getElementById('role-selection').style.display = 'none';
        document.getElementById('contentbox').style.display = 'flex';
        
        makeMap("mapcontent", ROWS, COLS);
        gameStarted = true;
        players[currentPlayerIndex].active = true;
        updatePlayerPositions();
        updateTurnIndicator();
        
        if (players[currentPlayerIndex].role === 'constructor') {
            setupConstructionControls();
        } else if (players[currentPlayerIndex].role === 'bomber') {
            setupBombControls();
        }
        
        console.log("Gioco avviato con successo");
    } catch (error) {
        console.error("Errore durante l'avvio del gioco:", error);
        alert("Errore durante l'avvio! Controlla la console.");
    }
});

window.addEventListener('DOMContentLoaded', startRoleSelection);