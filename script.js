var ROWS = 16;
var COLS = 27;
var tbl;
var ROCK_PROBABILITY = 0.1;
var players = [
    { id: 1, row: 0, col: 12, role: '', team: 'top', hasFlag: false, active: false },    // Sinistra bandiera sopra
    { id: 2, row: 0, col: 14, role: '', team: 'top', hasFlag: false, active: false },    // Destra bandiera sopra
    { id: 3, row: 15, col: 12, role: '', team: 'bottom', hasFlag: false, active: false }, // Sinistra bandiera sotto
    { id: 4, row: 15, col: 14, role: '', team: 'bottom', hasFlag: false, active: false }  // Destra bandiera sotto
];
var currentPlayerChoosing = 0;
var roleSelectionDone = false;
var currentPlayerIndex = 0;
var gameStarted = false;
var currentMovesMade = 0;

document.querySelectorAll('.role-option').forEach(option => {
    option.addEventListener('click', function() {
        if (roleSelectionDone) return;
        
        const role = this.dataset.role;
        players[currentPlayerChoosing].role = role;
        
        // Evidenzia la scelta
        document.querySelectorAll('.role-option').forEach(opt => {
            opt.style.opacity = '0.5';
            opt.style.transform = 'scale(0.95)';
        });
        this.style.opacity = '1';
        this.style.transform = 'scale(1.1)';
        
        // Passa al prossimo giocatore dopo un breve ritardo
        setTimeout(() => {
            currentPlayerChoosing++;
            showNextPlayerChoice();
            
            // Resetta gli stili delle opzioni
            document.querySelectorAll('.role-option').forEach(opt => {
                opt.style.opacity = '1';
                opt.style.transform = 'scale(1)';
            });
        }, 500);
    });
});

function checkAllRolesSelected() {
    const allSelected = players.every(player => player.role !== '');
    document.getElementById('start-game').disabled = !allSelected;
}

document.getElementById('start-game').addEventListener('click', function() {
    if (!roleSelectionDone) return;
    
    document.getElementById('role-selection').style.display = 'none';
    document.getElementById('contentbox').style.display = 'flex';
    makeMap("mapcontent", ROWS, COLS);
    gameStarted = true;
    players[currentPlayerIndex].active = true;
    updatePlayerPositions();
    updateTurnIndicator();
});

function makeMap(placeholder, rows, cols) {
    tbl = document.createElement("table");
    for (let i = 0; i < rows; i++) {
        let tr = document.createElement("tr");
        for (let j = 0; j < cols; j++) {
            let td = document.createElement("td");
            td.setAttribute("class", "cella");

            // Bandiere (in alto per team sotto, in basso per team sopra)
            if (i === 0 && j === 13) {
                td.className += " flag-cell";
                td.dataset.flagType = "top"; // Bandiera team sopra
            } else if (i === rows-1 && j === 13) {
                td.className += " flag-cell";
                td.dataset.flagType = "bottom"; // Bandiera team sotto
            }
            
            // Rocce (evitando le posizioni dei giocatori e delle bandiere)
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

function updatePlayerPositions() {
    // Rimuovi tutti i giocatori dalla mappa
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            let cell = tbl.rows[i].cells[j];
            cell.classList.remove("player1-cell", "player2-cell", "player3-cell", "player4-cell", 
                                "player-with-flag", "bomber", "constructor", "active-player");
        }
    }
    
    // Aggiungi i giocatori alle loro posizioni
    players.forEach(player => {
        let cell = tbl.rows[player.row].cells[player.col];
        cell.classList.add(`player${player.id}-cell`);
        cell.dataset.player = player.id; // Aggiungi questo
        
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

function handleKeyPress(e) {
    if (!gameStarted) return;
    
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer.active) return;
    
    // Gestione SKIP con barra spaziatrice
    if (e.key.toLowerCase() === ' ') {
        endTurn();
        return;
    }
    
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
    if (targetCell.classList.contains("rock-cell")) {
        return;
    }
    
    const cellHasPlayer = players.some(p => p.row === newRow && p.col === newCol);
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
    
    // Incrementa e controlla i movimenti
    currentMovesMade++;
    if (currentMovesMade >= 2) {
        endTurn();
    }
}

// Modifica la funzione endTurn
function endTurn() {
    players[currentPlayerIndex].active = false;
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    players[currentPlayerIndex].active = true;
    currentMovesMade = 0; // Resetta il contatore
    updatePlayerPositions();
    updateTurnIndicator();
}

function updateTurnIndicator() {
    document.getElementById('current-player').textContent = players[currentPlayerIndex].id;
}

function showVictoryScreen(winningTeam) {
    document.getElementById('contentbox').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'flex';
    document.getElementById('winning-team').textContent = winningTeam === 'top' ? 'Sopra' : 'Sotto';
}

function startRoleSelection() {
    document.getElementById('player-choice-screen').style.display = 'block';
    showNextPlayerChoice();
}

function completeRoleSelection() {
    document.getElementById('player-choice-screen').style.display = 'none';
    document.getElementById('role-selection-complete').style.display = 'block';
    roleSelectionDone = true;
}

window.addEventListener('DOMContentLoaded', startRoleSelection);

function showNextPlayerChoice() {
    if (currentPlayerChoosing >= players.length) {
        completeRoleSelection();
        return;
    }
    
    document.getElementById('current-player-choosing').textContent = players[currentPlayerChoosing].id;
    
    // Resetta gli stili delle opzioni
    document.querySelectorAll('.role-option').forEach(opt => {
        opt.style.opacity = '1';
        opt.style.transform = 'scale(1)';
        opt.style.border = 'none';
    });
}