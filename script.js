var ROWS = 16;
var COLS = 27;
var tbl;
var ROCK_PROBABILITY = 0.1;
var playerPos = {row: 15, col: 14};
var playerRole = ''; // 'constructor' o 'bomber'
var hasFlag = false;

// Mostra la scelta del ruolo prima di creare la mappa
document.getElementById('constructor').addEventListener('click', function() {
    startGame('constructor');
});

document.getElementById('bomber').addEventListener('click', function() {
    startGame('bomber');
});

function startGame(role) {
    playerRole = role;
    // Imposta la posizione in base al ruolo
    playerPos.col = (role === 'bomber') ? 12 : 14; // 12=sinistra, 14=destra
    
    document.getElementById('selection-screen').style.display = 'none';
    document.getElementById('contentbox').style.display = 'flex';
    makeMap("mapcontent", ROWS, COLS);
}

function makeMap(placeholder, rows, cols) {
    tbl = document.createElement("table");
    for (let i = 0; i < rows; i++) {
        let tr = document.createElement("tr");
        for (let j = 0; j < cols; j++) {
            let td = document.createElement("td");
            td.setAttribute("class", "cella");

            if ((i == 0 || i == 15) && j == 13) {
                td.className += " flag-cell";
                td.dataset.flagType = i === 0 ? "enemy" : "ally";
            }
            
            if (i > 0 && i < rows-1 && Math.random() < ROCK_PROBABILITY && !((i == 0 || i == 15) && j == 13)) {
                td.className += " rock-cell";
            }

            tr.appendChild(td);
        }
        tbl.appendChild(tr);
    }

    let d = document.getElementById(placeholder);
    d.appendChild(tbl);
    
    updatePlayerPosition();
    document.addEventListener('keydown', handleKeyPress);
}

function updatePlayerPosition() {
    // Rimuovi il player da tutte le celle
    for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
            let cell = tbl.rows[i].cells[j];
            cell.classList.remove("player-cell", "player-with-flag");
        }
    }
    
    // Aggiungi il player alla posizione corrente
    let playerCell = tbl.rows[playerPos.row].cells[playerPos.col];
    playerCell.classList.add("player-cell");
    
    if (playerRole === 'bomber') {
        playerCell.classList.add("bomber");
    }
    
    if (hasFlag) {
        playerCell.classList.add("player-with-flag");
    }
}

function handleKeyPress(e) {
    let newRow = playerPos.row;
    let newCol = playerPos.col;
    
    switch(e.key.toLowerCase()) {
        case 'w': newRow--; break;
        case 'a': newCol--; break;
        case 's': newRow++; break;
        case 'd': newCol++; break;
        default: return;
    }
    
    // Controlla i bordi della mappa
    if (newRow < 0 || newRow >= ROWS || newCol < 0 || newCol >= COLS) {
        return;
    }
    
    // Controlla se la nuova posizione è una roccia
    let targetCell = tbl.rows[newRow].cells[newCol];
    if (targetCell.classList.contains("rock-cell")) {
        return;
    }
    
    // Aggiorna la posizione
    playerPos.row = newRow;
    playerPos.col = newCol;
    
    // Controllo bandiera nemica (in alto)
    if (!hasFlag && targetCell.dataset.flagType === "enemy") {
        hasFlag = true;
        targetCell.classList.remove("flag-cell");
        targetCell.dataset.flagType = "";
    }
    
    // Controllo bandiera alleata (in basso) con flag
    if (hasFlag && targetCell.dataset.flagType === "ally") {
        showVictoryScreen();
        return;
    }
    
    updatePlayerPosition();
}

function showVictoryScreen() {
    document.getElementById('contentbox').style.display = 'none';
    
    const victoryScreen = document.createElement('div');
    victoryScreen.id = 'victory-screen';
    victoryScreen.innerHTML = `
        <h1>VITTORIA!</h1>
        <p>Hai portato la bandiera nemica alla tua base!</p>
        <button onclick="location.reload()">Rigioca</button>
    `;
    
    document.body.appendChild(victoryScreen);
}

function placeAvatar(row, col, val) {
    let cell = tbl.rows[row].cells[col];
    if (cell.hasChildNodes()) {
        cell.removeChild(cell.firstChild);
    }
    tbl.rows[row].cells[col].appendChild(document.createTextNode(val));
}