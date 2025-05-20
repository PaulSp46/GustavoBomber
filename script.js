
var ROWS = 16;
var COLS = 29;
var tbl;
makeMap("mapcontent", ROWS, COLS);
placeAvatar(10, 20, "SG");

function makeMap(placeholder, rows, cols) {
    tbl = document.createElement("table");
    for (let i = 0; i < rows; i++) {
        let tr = document.createElement("tr");
        for (let j = 0; j < cols; j++) {
            let td = document.createElement("td");
            td.setAttribute("class", "cella");
            tr.appendChild(td);
        }
        tbl.appendChild(tr);
    }


    let d = document.getElementById(placeholder);
    d.appendChild(tbl);
}

function placeAvatar(row, col, val) {
    let cell = tbl.rows[row].cells[col];
    if (cell.hasChildNodes()) {
        cell.removeChild(cell.firstChild);
        //todo: color cell
    }
    tbl.rows[row].cells[col].appendChild(document.createTextNode(val));
}
