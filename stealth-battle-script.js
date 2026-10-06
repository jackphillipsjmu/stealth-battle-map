// SETTINGS AND STATE
let ROWS = 7;
let COLS = 7;
const CELL_SIZE = 65;
let selectedTool = "barrier";
let nextCharacterId = 1;
// Each square is stored as:
// { type: "player", name: "...", id: 1 }
// or null for an empty square.
let board = [];
// Tracks existing enemy/player LOS pairs.
let previousLOSPairs = new Set();
// Drag Pieces
let draggedPiece = null;
let dragStartRow = null;
let dragStartCol = null;
let isDragging = false;
let pointerStartX = 0;
let pointerStartY = 0;
let currentDragTarget = null;
let enemyVisionEnabled = true;
// Painting pieces
let isPaintingCover = false;
let lastPaintedRow = null;
let lastPaintedCol = null;

const DRAG_DISTANCE = 6;
const grid = document.getElementById("grid");
const statusDisplay = document.getElementById("status");
const rowsInput = document.getElementById("rowsInput");
const colsInput = document.getElementById("colsInput");
// SAVE / LOAD BATTLE GRID
const SAVE_KEY = "dndBattleGridSave";


function initializeBoard() {
  board = Array.from(
    { length: ROWS },
    () => Array(COLS).fill(null)
  );

}


function isCoverTool() {
  return (
    selectedTool === "barrier" ||
    selectedTool === "half-cover"
  );
}


function startDrag(
  event,
  row,
  col
) {
  // Left mouse button only.
  if (
    event.button !== 0
  ) {
    return;
  }

  const piece =
    board[row][col];

  // ERASER
  if (
    selectedTool === "erase"
  ) {

    /*
      FIRST:
      Check for Darkness.

      Darkness gets priority because it is
      visually above Players, Enemies,
      and terrain.
    */

    const darkness =
      getDarknessAt(
        row,
        col
      );


    if (darkness) {
      /*
        Remove the entire Darkness area.
      */
      darknessAreas =
        darknessAreas.filter(
          area =>
            area.id !== darkness.id
        );

      clearDarknessPreview();
      renderBoard();
      checkAllLineOfSight();
      saveBattleGrid();
      event.preventDefault();

      return;

    }
    /*
      No Darkness here.

      Erase the normal board piece.
    */
    board[row][col] =
      null;

    renderBoard();
    checkAllLineOfSight();
    saveBattleGrid();
    event.preventDefault();

    return;
  }


  // EXISTING PIECE
  // Existing pieces still use your normal
  // drag-to-move behavior. This check MUST happen before cover painting
  // so clicking an existing barrier lets you move it.
  if (piece) {
    draggedPiece = piece;
    dragStartRow = row;
    dragStartCol = col;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    isDragging = false;

    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );
    return;
  }

  // COVER PAINTING
  if (
    isCoverTool()
  ) {

    isPaintingCover = true;
    lastPaintedRow = null;
    lastPaintedCol = null;

    // Paint the first square immediately.
    paintCoverCell(
      row,
      col
    );

    // Keep receiving pointer events even when leaving the original square.
    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );

    document.body.classList.add(
      "painting-cover"
    );

    event.preventDefault();

    return;
  }

  // NORMAL CLICK
  dragStartRow = row;
  dragStartCol = col;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  isDragging = false;
  draggedPiece = null;
}


function continueDrag(event) {
  // COVER PAINTING
  if (
    isPaintingCover
  ) {
    const elementUnderMouse =
      document.elementFromPoint(
        event.clientX,
        event.clientY
      );

    const targetCell =
      elementUnderMouse
        ? elementUnderMouse.closest(
            ".cell"
          )
        : null;

    if (!targetCell) {
      return;
    }

    const targetRow =
      Number(
        targetCell.dataset.row
      );

    const targetCol =
      Number(
        targetCell.dataset.col
      );

    paintCoverCell(
      targetRow,
      targetCol
    );

    event.preventDefault();

    return;
  }

  // NORMAL PIECE DRAGGING
  if (
    dragStartRow === null ||
    dragStartCol === null
  ) {
    return;
  }

  const dx =
    event.clientX -
    pointerStartX;

  const dy =
    event.clientY -
    pointerStartY;

  const distance =
    Math.sqrt(
      dx * dx +
      dy * dy
    );

  if (
    !isDragging &&
    distance >= DRAG_DISTANCE
  ) {

    isDragging =
      true;

    document.body.classList.add(
      "dragging-piece"
    );

  }

  if (
    !isDragging ||
    !draggedPiece
  ) {
    return;
  }

  const elementUnderMouse =
    document.elementFromPoint(
      event.clientX,
      event.clientY
    );

  const targetCell =
    elementUnderMouse
      ? elementUnderMouse.closest(
          ".cell"
        )
      : null;

  clearDragHighlight();

  if (!targetCell) {
    return;
  }

  currentDragTarget =
    targetCell;

  const targetRow =
    Number(
      targetCell.dataset.row
    );

  const targetCol =
    Number(
      targetCell.dataset.col
    );

  const sameSquare =
    targetRow === dragStartRow &&
    targetCol === dragStartCol;

  if (sameSquare) {
    targetCell.classList.add(
      "drag-target-invalid"
    );
    return;
  }

  if (
    board[targetRow][targetCol] === null
  ) {
    targetCell.classList.add(
      "drag-target-valid"
    );
  } else {
    targetCell.classList.add(
      "drag-target-invalid"
    );
  }
}


function finishDrag(event) {
  // FINISH COVER PAINTING
  if (
    isPaintingCover
  ) {
    isPaintingCover = false;
    lastPaintedRow = null;
    lastPaintedCol = null;

    document.body.classList.remove(
      "painting-cover"
    );

    // Now perform the more expensive work once after painting finishes.
    renderBoard();
    checkAllLineOfSight();
    saveBattleGrid();
    resetDrag();

    return;
  }

  // ERASER
  if (
    selectedTool === "erase"
  ) {
    resetDrag();
    return;
  }

  if (
    dragStartRow === null ||
    dragStartCol === null
  ) {
    return;
  }

  const elementUnderMouse =
    document.elementFromPoint(
      event.clientX,
      event.clientY
    );

  const targetCell =
    elementUnderMouse
      ? elementUnderMouse.closest(
          ".cell"
        )
      : null;

  //  MOVE EXISTING PIECE
  if (
    isDragging &&
    draggedPiece
  ) {

    if (targetCell) {
      const targetRow =
        Number(
          targetCell.dataset.row
        );

      const targetCol =
        Number(
          targetCell.dataset.col
        );

      const sameSquare =
        targetRow === dragStartRow &&
        targetCol === dragStartCol;

      if (
        !sameSquare &&
        board[targetRow][targetCol] === null
      ) {
        board[targetRow][targetCol] =
          draggedPiece;

        board[dragStartRow][dragStartCol] =
          null;
      }
    }

    renderBoard();
    checkAllLineOfSight();
    saveBattleGrid();
  } else if (
    !isDragging
  ) {
    // NORMAL CLICK
    // Only empty squares get normal placement. Cover tools won't normally
    // reach herebecause they use painting mode.
    if (!draggedPiece) {

      placeObject(
        dragStartRow,
        dragStartCol
      );
    }
  }
  resetDrag();
}


function cancelDrag(event) {

  if (
    isPaintingCover
  ) {
    isPaintingCover = false;
    lastPaintedRow = null;
    lastPaintedCol = null;

    document.body.classList.remove(
      "painting-cover"
    );

    renderBoard();
    checkAllLineOfSight();
    saveBattleGrid();
  }
  resetDrag();
}


function clearDragHighlight() {
  if (currentDragTarget) {
    currentDragTarget.classList.remove(
      "drag-target-valid",
      "drag-target-invalid"
    );

  }
  currentDragTarget = null;
}


function resetDrag() {
  clearDragHighlight();

  draggedPiece = null;
  dragStartRow = null;
  dragStartCol = null;
  pointerStartX = 0;
  pointerStartY = 0;
  isDragging = false;
  isPaintingCover = false;
  lastPaintedRow = null;
  lastPaintedCol = null;

  document.body.classList.remove(
    "dragging-piece",
    "painting-cover"
  );
}


function createGrid() {
  grid.innerHTML = "";

  grid.style.gridTemplateColumns =
    `repeat(${COLS}, ${CELL_SIZE}px)`;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement("div");

      cell.classList.add("cell");

      cell.dataset.row = row;
      cell.dataset.col = col;

      cell.addEventListener(
        "pointerdown",
        function(event) {
          startDrag(event, row, col);
        }
      );

      cell.addEventListener(
        "pointermove",
        function(event) {
          continueDrag(event);
        }
      );

      cell.addEventListener(
        "pointerup",
        function(event) {
          finishDrag(event);
        }
      );

      cell.addEventListener(
        "pointercancel",
        function(event) {
          cancelDrag(event);
        }
      );

      cell.addEventListener(
        "dblclick",
        function() {
          renameCharacter(row, col);
        }
      );

      cell.addEventListener(
        "pointerenter",
        function() {

          if (
            selectedTool === "darkness"
          ) {

            showDarknessPreview(
              row,
              col
            );

          }
          else if (
            selectedTool === "erase"
          ) {

            showDarknessErasePreview(
              row,
              col
            );

          }
        }
      );


      cell.addEventListener(
        "pointerleave",
        function(event) {

          /*
            Don't clear when moving directly
            from one grid cell to another.

            The next cell's pointerenter will
            replace the preview.
          */

          const nextElement =
            event.relatedTarget;


          if (
            nextElement &&
            nextElement.closest &&
            nextElement.closest(".cell")
          ) {
            return;
          }


          clearDarknessPreview();

        }
      );

      grid.appendChild(cell);
    }
  }
  renderBoard();
}


function fitTextToContainer(textElement, containerElement) {
  // Start with a reasonably large max size or pull from current styling
  let minSize = 10;
  let maxSize = 100;
  let currentSize = maxSize;

  // Set the initial font size to the max limit
  textElement.style.fontSize = currentSize + 'px';

  // Binary search loop or downward loop to shrink text until it fits completely
  // Checks both horizontal (scrollWidth) and vertical (scrollHeight) overflow
  while (
    (textElement.scrollWidth > containerElement.clientWidth ||
     textElement.scrollHeight > containerElement.clientHeight) &&
    currentSize > minSize
  ) {
    currentSize--;
    textElement.style.fontSize = currentSize + 'px';
  }
}


function renderBoard() {
  const cells =
    grid.querySelectorAll(
      ".cell"
    );


  cells.forEach(cell => {
    const row =
      Number(
        cell.dataset.row
      );

    const col =
      Number(
        cell.dataset.col
      );

    const piece =
      board[row][col];

    cell.className =
      "cell";

    cell.textContent =
      "";

    cell.title =
      `Row ${row + 1}, ` +
      `Column ${col + 1}`;

    if (!piece) {
      return;
    }

    cell.classList.add(
      piece.type
    );

    if (
      piece.type === "barrier"
    ) {
      cell.textContent =
        "🧱";

      cell.title =
        "Full Cover: Blocks Line of Sight";
    } else if (
      piece.type ===
      "half-cover"
    ) {
      cell.textContent =
        "🛡️";

      cell.title =
        "Half Cover: +2 AC and " +
        "+2 Dexterity Saving Throws";

    } else {
      cell.textContent =
        piece.name;

      cell.title =
        `${piece.name} ` +
        `(${piece.type}) - ` +
        `Row ${row + 1}, ` +
        `Column ${col + 1}`;
    }
  });

  // Darnkess
  renderDarkness();
}


// AUTOMATIC GRID RESIZING
rowsInput.addEventListener("input", updateGridSize);
colsInput.addEventListener("input", updateGridSize);


function updateGridSize() {
  const newRows = Number(rowsInput.value);
  const newCols = Number(colsInput.value);

  if (
    !Number.isInteger(newRows) ||
    !Number.isInteger(newCols) ||
    newRows < 2 ||
    newRows > 30 ||
    newCols < 2 ||
    newCols > 30
  ) {
    return;
  }

  if (newRows === ROWS && newCols === COLS) {
    return;
  }

  // Preserve existing pieces within new boundaries.
  const oldBoard = board;
  const oldRows = ROWS;
  const oldCols = COLS;

  ROWS = newRows;
  COLS = newCols;

  initializeBoard();

  for (
    let row = 0;
    row < Math.min(oldRows, ROWS);
    row++
  ) {

    for (
      let col = 0;
      col < Math.min(oldCols, COLS);
      col++
    ) {
      board[row][col] = oldBoard[row][col];
    }
  }

  createGrid();
  checkAllLineOfSight();
}


function selectTool(
  tool,
  button
) {
  clearDarknessPreview();
  clearDarknessErasePreview();

  selectedTool = tool;

  document
    .querySelectorAll(
      ".tool-row > button, " +
      ".cover-dropdown > button"
    )
    .forEach(btn => {
      btn.classList.remove(
        "selected"
      );

    });

  button.classList.add(
    "selected"
  );

  // Close Cover dropdown if open.
  document
    .getElementById(
      "coverMenu"
    )
    .classList.remove(
      "open"
    );
}


function getCharacterName(type) {
  if (type === "player") {
    return playerNameInput.value.trim() || "Player";
  }
  if (type === "enemy") {
    return enemyNameInput.value.trim() || "Enemy";
  }
  return "";
}


function placeObject(
  row,
  col
) {
  if (
    window.pendingClickTimer
  ) {
    clearTimeout(
      window.pendingClickTimer
    );
  }

  window.pendingClickTimer =
    setTimeout(() => {

      window.pendingClickTimer =
        null;

        if (
          selectedTool === "darkness"
        ) {

          clearDarknessPreview();

          darknessAreas.push({
            id: nextDarknessId++,
            row: row,
            col: col
          });

          renderBoard();

          checkAllLineOfSight();

          saveBattleGrid();

          return;

        }

      if (
        selectedTool === "erase"
      ) {
        board[row][col] =
          null;
      } else if (
        selectedTool === "barrier"
      ) {
        board[row][col] = {
          type: "barrier",
          name: "Full Cover",
          id:
            nextCharacterId++
        };
      } else if (
        selectedTool ===
        "half-cover"
      ) {
        board[row][col] = {
          type: "half-cover",
          name: "Half Cover",
          id:
            nextCharacterId++
        };
      } else if (
        selectedTool === "player"
      ) {
        board[row][col] = {
          type: "player",
          name: "Player",
          id:
            nextCharacterId++
        };
      } else if (
        selectedTool === "enemy"
      ) {
        board[row][col] = {
          type: "enemy",
          name: "Enemy",
          id:
            nextCharacterId++
        };
      }

      renderBoard();
      checkAllLineOfSight();
      saveBattleGrid();
    }, 220);
}


function renameCharacter(row, col) {
  if (window.pendingClickTimer) {
    clearTimeout(window.pendingClickTimer);
    window.pendingClickTimer = null;
  }

  const piece = board[row][col];

  // Nothing in this square.
  if (!piece) {
    return;
  }

  // Barriers cannot be renamed.
  if (
    piece.type !== "player" &&
    piece.type !== "enemy"
  ) {
    return;
  }

  const newName = prompt(
    `Rename ${piece.name}:`,
    piece.name
  );

  // User pressed Cancel.
  if (newName === null) {
    return;
  }

  const trimmedName =
    newName.trim();

  if (!trimmedName) {

    alert(
      "Character name cannot be empty."
    );
    return;
  }

  piece.name =
    trimmedName.slice(0, 40);

  renderBoard();
  checkAllLineOfSight();
}


function getPiece(row, col) {
  if (
    row < 0 ||
    row >= ROWS ||
    col < 0 ||
    col >= COLS
  ) {
    return null;
  }
  return board[row][col];
}


function isBarrier(row, col) {
  const piece =
    getPiece(row, col);

  return (
    piece !== null &&
    piece.type === "barrier"
  );
}


function isHalfCover(row, col) {
  const piece =
    getPiece(row, col);

  return (
    piece !== null &&
    piece.type === "half-cover"
  );
}


function isEnemySurrounded(row, col) {
  //       B
  //     B E B
  //       B
  //
  // Four barriers immediately adjacent
  // to the enemy block all LOS.
  return (
    isBarrier(row - 1, col) &&
    isBarrier(row + 1, col) &&
    isBarrier(row, col - 1) &&
    isBarrier(row, col + 1)
  );
}


function traceGridRay(
  startRow,
  startCol,
  targetRow,
  targetCol
) {

  const result = {
    blocked: false,
    halfCoverCount: 0,
    halfCoverCells: new Set()
  };


  /* =========================================
     SAME SQUARE
     ========================================= */
  if (
    startRow === targetRow &&
    startCol === targetCol
  ) {
    return result;
  }


  /* =========================================
     START / END POINTS
     ========================================= */
  const startX =
    startCol + 0.5;

  const startY =
    startRow + 0.5;

  const endX =
    targetCol + 0.5;

  const endY =
    targetRow + 0.5;

  const dx =
    endX - startX;

  const dy =
    endY - startY;

  let currentRow =
    startRow;

  let currentCol =
    startCol;

  const stepX =
    Math.sign(dx);

  const stepY =
    Math.sign(dy);


  const tDeltaX =
    dx === 0
      ? Infinity
      : Math.abs(1 / dx);


  const tDeltaY =
    dy === 0
      ? Infinity
      : Math.abs(1 / dy);


  let tMaxX =
    dx === 0
      ? Infinity
      : 0.5 / Math.abs(dx);


  let tMaxY =
    dy === 0
      ? Infinity
      : 0.5 / Math.abs(dy);


  const EPSILON =
    1e-10;


  /* =========================================
     HALF COVER HELPER
     ========================================= */
  function recordHalfCover(
    row,
    col
  ) {

    /*
      Ignore outside board.
    */
    if (
      row < 0 ||
      row >= ROWS ||
      col < 0 ||
      col >= COLS
    ) {
      return;
    }


    /*
      Don't count start square.
    */
    if (
      row === startRow &&
      col === startCol
    ) {
      return;
    }


    /*
      Don't count target square.
    */
    if (
      row === targetRow &&
      col === targetCol
    ) {
      return;
    }


    if (
      isHalfCover(
        row,
        col
      )
    ) {

      result.halfCoverCells.add(
        `${row},${col}`
      );
    }
  }

  /* =========================================
     TRACE GRID
     ========================================= */
  while (
    currentRow !== targetRow ||
    currentCol !== targetCol
  ) {
    /* =======================================
       VERTICAL EDGE
       ======================================= */
    if (
      tMaxX <
      tMaxY - EPSILON
    ) {
      currentCol +=
        stepX;

      tMaxX +=
        tDeltaX;

      /*
        Outside board.
      */
      if (
        currentRow < 0 ||
        currentRow >= ROWS ||
        currentCol < 0 ||
        currentCol >= COLS
      ) {
        result.blocked =
          true;
        break;
      }


      /*
        Target cell itself is visible.
      */
      if (
        currentRow === targetRow &&
        currentCol === targetCol
      ) {
        break;
      }

      /*
        Full Cover.
      */
      if (
        isBarrier(
          currentRow,
          currentCol
        )
      ) {

        result.blocked =
          true;

        break;

      }

      /*
        Half Cover.
      */
      recordHalfCover(
        currentRow,
        currentCol
      );

    }
    /* =======================================
       HORIZONTAL EDGE
       ======================================= */
    else if (
      tMaxY <
      tMaxX - EPSILON
    ) {
      currentRow +=
        stepY;


      tMaxY +=
        tDeltaY;

      /*
        Outside board.
      */
      if (
        currentRow < 0 ||
        currentRow >= ROWS ||
        currentCol < 0 ||
        currentCol >= COLS
      ) {
        result.blocked =
          true;
        break;

      }

      /*
        Target cell itself is visible.
      */
      if (
        currentRow === targetRow &&
        currentCol === targetCol
      ) {
        break;
      }

      /*
        Full Cover.
      */
      if (
        isBarrier(
          currentRow,
          currentCol
        )
      ) {
        result.blocked =
          true;
        break;
      }

      /*
        Half Cover.
      */
      recordHalfCover(
        currentRow,
        currentCol
      );

    }

    /* =======================================
       EXACT GRID CORNER
       ======================================= */
    else {
      const nextRow =
        currentRow +
        stepY;

      const nextCol =
        currentCol +
        stepX;

      /*
        Side cells touching the corner.
      */
      const horizontalRow =
        currentRow;

      const horizontalCol =
        nextCol;

      const verticalRow =
        nextRow;

      const verticalCol =
        currentCol;

      const horizontalBarrier =
        isBarrier(
          horizontalRow,
          horizontalCol
        );

      const verticalBarrier =
        isBarrier(
          verticalRow,
          verticalCol
        );

      /*
        Two Full Cover blocks touching
        diagonally block LOS through
        their shared corner.
      */
      if (
        horizontalBarrier &&
        verticalBarrier
      ) {
        result.blocked =
          true;
        break;
      }

      /*
        Check Half Cover touching
        the corner.
      */
      recordHalfCover(
        horizontalRow,
        horizontalCol
      );

      recordHalfCover(
        verticalRow,
        verticalCol
      );

      /*
        Move diagonally.
      */
      currentRow =
        nextRow;

      currentCol =
        nextCol;

      tMaxX +=
        tDeltaX;

      tMaxY +=
        tDeltaY;

      /*
        Outside board.
      */
      if (
        currentRow < 0 ||
        currentRow >= ROWS ||
        currentCol < 0 ||
        currentCol >= COLS
      ) {
        result.blocked =
          true;
        break;
      }

      /*
        Target square itself remains visible.
      */
      if (
        currentRow === targetRow &&
        currentCol === targetCol
      ) {
        break;
      }

      /*
        Full Cover in diagonal square.
      */
      if (
        isBarrier(
          currentRow,
          currentCol
        )
      ) {
        result.blocked =
          true;
        break;
      }

      /*
        Half Cover in diagonal square.
      */
      recordHalfCover(
        currentRow,
        currentCol
      );
    }
  }

  /* =========================================
     FINAL HALF COVER COUNT
     ========================================= */
  result.halfCoverCount =
    result.halfCoverCells.size;

  return result;
}


function getCoverBetween(
  enemyRow,
  enemyCol,
  targetRow,
  targetCol
) {
  const ray =
    traceGridRay(
      enemyRow,
      enemyCol,
      targetRow,
      targetCol
    );

  // Full Cover barrier.
  if (ray.blocked) {
    return {
      type: "full",
      halfCoverCount:
        ray.halfCoverCount
    };
  }

  // TWO OR MORE HALF COVER PIECES = FULL COVER
  if (
    ray.halfCoverCount >= 2
  ) {
    return {
      type: "full",
      halfCoverCount:
        ray.halfCoverCount
    };

  }

  // ONLY HALF COVER
  if (
    ray.halfCoverCount === 1
  ) {
    return {
      type: "half",
      halfCoverCount: 1
    };

  }

  // NO COVER
  return {
    type: "none",
    halfCoverCount: 0
  };

}


function hasLineOfSight(
  enemyRow,
  enemyCol,
  playerRow,
  playerCol
) {

  /* =========================================
     PLAYER INSIDE DARKNESS
     ========================================= */

  /*
    A Player standing inside Darkness
    cannot be seen using normal vision.
  */

  if (
    isDarknessAt(
      playerRow,
      playerCol
    )
  ) {

    return false;

  }


  /* =========================================
     ENEMY INSIDE DARKNESS
     ========================================= */

  /*
    An Enemy standing inside Darkness
    also cannot use normal vision outward.
  */
  if (
    isDarknessAt(
      enemyRow,
      enemyCol
    )
  ) {
    return false;
  }

  /* =========================================
     SURROUNDED ENEMY
     ========================================= */
  if (
    isEnemySurrounded(
      enemyRow,
      enemyCol
    )
  ) {
    return false;
  }

  /* =========================================
     NORMAL GRID RAY
     ========================================= */
  const ray =
    traceGridRay(
      enemyRow,
      enemyCol,
      playerRow,
      playerCol
    );

  /*
    Full Cover.
  */
  if (
    ray.blocked
  ) {
    return false;
  }

  /*
    Two Half Cover squares
    count as Full Cover.
  */
  if (
    ray.halfCoverCount >= 2
  ) {
    return false;
  }

  /* =========================================
     DARKNESS BETWEEN ENEMY AND PLAYER
     ========================================= */
  if (
    doesRayCrossDarkness(
      enemyRow,
      enemyCol,
      playerRow,
      playerCol
    )
  ) {
    return false;
  }
  return true;
}

function checkAllLineOfSight() {
  const enemies = [];
  const players = [];

  // FIND PIECES
  for (
    let row = 0;
    row < ROWS;
    row++
  ) {
    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      const piece =
        board[row][col];

      if (!piece) {
        continue;
      }

      const entry = {
        ...piece,
        row,
        col
      };

      if (
        piece.type === "enemy"
      ) {
        enemies.push(entry);
      }

      if (
        piece.type === "player"
      ) {
        players.push(entry);
      }
    }
  }

  // REMOVE OLD HIGHLIGHTS
  document
    .querySelectorAll(
      ".has-los, .has-half-cover"
    )
    .forEach(cell => {
      cell.classList.remove(
        "has-los",
        "has-half-cover"
      );
    });

  const currentLOSPairs =
    new Set();

  const newAlerts = [];

  let totalLOS = 0;

  // CHECK ENEMIES
  for (const enemy of enemies) {


    if (
      isEnemySurrounded(
        enemy.row,
        enemy.col
      )
    ) {
      continue;
    }


    /* ===================================
       CHECK PLAYERS
       =================================== */

    for (
      const player of players
    ) {


      const canSeePlayer =
        hasLineOfSight(
          enemy.row,
          enemy.col,
          player.row,
          player.col
        );


      if (!canSeePlayer) {
        continue;
      }


      /* =================================
         COVER
         ================================= */

      const cover =
        getCoverBetween(
          enemy.row,
          enemy.col,
          player.row,
          player.col
        );


      const playerHasHalfCover =
        cover.type === "half";


      /* =================================
         LOS PAIR
         ================================= */

      const pairID =
        `${enemy.id}-${player.id}`;


      currentLOSPairs.add(
        pairID
      );


      totalLOS++;


      /* =================================
         CELLS
         ================================= */

      const enemyCell =
        grid.querySelector(
          `.cell[data-row="${enemy.row}"]` +
          `[data-col="${enemy.col}"]`
        );


      const playerCell =
        grid.querySelector(
          `.cell[data-row="${player.row}"]` +
          `[data-col="${player.col}"]`
        );


      /* =================================
         HIGHLIGHT ENEMY
         ================================= */

      if (enemyCell) {

        enemyCell.classList.add(
          "has-los"
        );

      }


      /* =================================
         HIGHLIGHT PLAYER
         ================================= */

      if (playerCell) {

        playerCell.classList.add(
          "has-los"
        );


        if (
          playerHasHalfCover
        ) {

          playerCell.classList.add(
            "has-half-cover"
          );

        }

      }


      /* =================================
         ALERT
         ================================= */

      if (
        !previousLOSPairs.has(
          pairID
        )
      ) {

        let message =
          `${enemy.name} ` +
          `(Row ${enemy.row + 1}, ` +
          `Column ${enemy.col + 1}) ` +
          `can see ${player.name} ` +
          `(Row ${player.row + 1}, ` +
          `Column ${player.col + 1})`;


        if (
          playerHasHalfCover
        ) {

          message +=
            "\n🛡️ HALF COVER: " +
            "+2 AC and " +
            "+2 Dexterity saves";

        }


        newAlerts.push(
          message
        );

      }

    }

  }
  // STATUS
  if (
    totalLOS > 0
  ) {
    statusDisplay.textContent =
      `⚠ ${totalLOS} enemy/player ` +
      `line-of-sight connection(s) detected!`;

    statusDisplay.className =
      "danger";
  }
  else {
    updateSafeStatus();
  }

  // REMEMBER LOS
  previousLOSPairs =
    currentLOSPairs;
  // VISION DISPAY
  updateEnemyVisionOverlay();
  // SAVE
  saveBattleGrid();

  // ALERT USER IN POPUP. UNCOMMENT TO ADD IN FUNCTIONALITY
  // if (
  //   newAlerts.length > 0
  // ) {
  //   alert(
  //     "⚠ NEW LINE OF SIGHT!\n\n" +
  //     newAlerts.join(
  //       "\n\n"
  //     )
  //   );
  // }

  // UPDATE STATUS DISPLAY
  if (totalLOS > 0) {
    statusDisplay.textContent =
      `⚠ ${totalLOS} enemy/player ` +
      `line-of-sight connection(s) detected!`;

    statusDisplay.className =
      "danger";
  } else {
    updateSafeStatus();
  }

  // REMEMBER CURRENT LOS
  // On the next LOS check, these become the
  // "previous" relationships.
  // This prevents repeated browser alerts
  // every time the board redraws.
  previousLOSPairs =
    currentLOSPairs;

   // UPDATE ENEMY VISION OVERLAY
   // This respects enemyVisionEnabled.
   // If vision is OFF, the overlay remains
   // hidden.
  updateEnemyVisionOverlay();

  // SAVE CURRENT BOARD
  // Saves positions, names, grid dimensions,
  // cover pieces, and vision settings.
  saveBattleGrid();

  // SHOW NEW LOS ALERTS. UNCOMMENT TO ACTIVATE POPUP ALERT
  // if (newAlerts.length > 0) {
  //
  //   alert(
  //     "⚠ NEW LINE OF SIGHT!\n\n" +
  //     newAlerts.join(
  //       "\n\n"
  //     )
  //   );
  //
  // }

}


function updateSafeStatus() {
  statusDisplay.textContent =
    "✓ No enemy currently has line of sight.";
  statusDisplay.className = "safe";
}


function clearGrid() {
  if (window.pendingClickTimer) {
    clearTimeout(window.pendingClickTimer);
    window.pendingClickTimer = null;
  }

  // Clear and reset everything to base default
  resetDrag();
  initializeBoard();
  previousLOSPairs.clear();
  renderBoard();
  updateSafeStatus();
  updateEnemyVisionOverlay();
  // Save the now-empty grid.
  saveBattleGrid();
  // Darkness
  removeAllDarkness();
}


function canEnemySeeCell(
  enemyRow,
  enemyCol,
  targetRow,
  targetCol
) {
  // Enemy sees its own square.
  if (
    enemyRow === targetRow &&
    enemyCol === targetCol
  ) {
    return true;
  }

  // Completely surrounded by Full Cover.
  if (
    isEnemySurrounded(
      enemyRow,
      enemyCol
    )
  ) {
    return false;
  }

  const ray =
    traceGridRay(
      enemyRow,
      enemyCol,
      targetRow,
      targetCol
    );
  return !ray.blocked;
}


function clearEnemyVisionOverlay() {
  document
    .querySelectorAll(
      ".enemy-visible"
    )
    .forEach(cell => {
      cell.classList.remove(
        "enemy-visible"
      );
    });
}


function updateEnemyVisionOverlay() {
  // CLEAR OVERLAY TO REFRESH
  clearEnemyVisionOverlay();

  if (
    !enemyVisionEnabled
  ) {
    return;
  }

  // CHECK EVERY ENEMY
  for (
    let enemyRow = 0;
    enemyRow < ROWS;
    enemyRow++
  ) {
    for (
      let enemyCol = 0;
      enemyCol < COLS;
      enemyCol++
    ) {
      const enemy =
        board[enemyRow][enemyCol];

      if (
        !enemy ||
        enemy.type !== "enemy"
      ) {
        continue;
      }

      // CHECK EVERY CELL
      for (
        let targetRow = 0;
        targetRow < ROWS;
        targetRow++
      ) {
        for (
          let targetCol = 0;
          targetCol < COLS;
          targetCol++
        ) {
          // Enemy's own cell.
          if (
            enemyRow === targetRow &&
            enemyCol === targetCol
          ) {

            const enemyCell =
              grid.querySelector(
                `.cell[data-row="${targetRow}"]` +
                `[data-col="${targetCol}"]`
              );

            if (enemyCell) {
              enemyCell.classList.add(
                "enemy-visible"
              );
            }
            continue;
          }

          // Surrounded enemy cannot project vision outward.
          if (
            isEnemySurrounded(
              enemyRow,
              enemyCol
            )
          ) {
            continue;
          }

          const ray =
            traceGridRay(
              enemyRow,
              enemyCol,
              targetRow,
              targetCol
            );

          // Full Cover blocks vision.
          if (
            ray.blocked
          ) {
            continue;
          }

          // Two Half Covers block vision.
          if (
            ray.halfCoverCount >= 2
          ) {
            continue;
          }

          /*
            Target itself is inside Darkness.
          */

          if (
            isDarknessAt(
              targetRow,
              targetCol
            )
          ) {
            continue;
          }


          /*
            Vision passes through Darkness.
          */

          if (
            doesRayCrossDarkness(
              enemyRow,
              enemyCol,
              targetRow,
              targetCol
            )
          ) {
            continue;
          }


          const cell =
            grid.querySelector(
              `.cell[data-row="${targetRow}"]` +
              `[data-col="${targetCol}"]`
            );


          if (cell) {
            cell.classList.add(
              "enemy-visible"
            );
          }
        }
      }
    }
  }
}


function saveBattleGrid() {
  const saveData = {
    rows: ROWS,
    cols: COLS,
    board: board,
    nextCharacterId: nextCharacterId,
    enemyVisionEnabled: enemyVisionEnabled,
    darknessAreas: darknessAreas,
    nextDarknessId: nextDarknessId
  };

  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(saveData)
    );
  } catch (error) {
    console.error(
      "Unable to save battle grid:",
      error
    );
  }
}


function loadBattleGrid() {
  try {
    const savedData =
      localStorage.getItem(SAVE_KEY);

    if (!savedData) {
      return false;
    }

    const data = JSON.parse(savedData);
      if (
        Array.isArray(
          data.darknessAreas
        )
      ) {
        darknessAreas =
          data.darknessAreas;
      }

      if (
        Number.isInteger(
          data.nextDarknessId
        )
      ) {
        nextDarknessId = data.nextDarknessId;
      }

    // Restore grid dimensions
    if (
      Number.isInteger(data.rows) &&
      Number.isInteger(data.cols)
    ) {
      ROWS = data.rows;
      COLS = data.cols;

      rowsInput.value = ROWS;
      colsInput.value = COLS;
    }

    // Restore board
    if (Array.isArray(data.board)) {
      board = data.board;
    } else {
      initializeBoard();
    }

    // Restore character IDs
    if (
      Number.isInteger(
        data.nextCharacterId
      )
    ) {
      nextCharacterId =
        data.nextCharacterId;
    }

    // Restore vision toggle
    // NOTE: Not in use
    if (
      typeof data.enemyVisionEnabled ===
      "boolean"
    ) {
      enemyVisionEnabled =
        data.enemyVisionEnabled;
    }
    return true;
  }

  catch (error) {
    console.error(
      "Unable to load battle grid:",
      error
    );
    return false;
  }
}


function toggleCoverMenu(event) {
  event.stopPropagation();

  const menu =
    document.getElementById(
      "coverMenu"
    );

  menu.classList.toggle(
    "open"
  );
}


function selectCoverType(
  type,
  event
) {
  clearDarknessPreview();

  event.stopPropagation();

  selectedTool = type;

  const coverButton =
    document.getElementById(
      "coverButton"
    );

  // Update button appearance
  if (type === "barrier") {
    coverButton.textContent =
      "🧱 Full Cover ▼";

  } else {
    coverButton.textContent =
      "🛡️ Half Cover ▼";
  }

  // Mark cover as selected
  document
    .querySelectorAll(
      ".tool-row > button, " +
      ".cover-dropdown > button"
    )
    .forEach(button => {
      button.classList.remove(
        "selected"
      );
    });

  coverButton.classList.add(
    "selected"
  );

  // Close dropdown
  document
    .getElementById(
      "coverMenu"
    )
    .classList.remove(
      "open"
    );
}


document.addEventListener(
  "click",
  function() {
    document
      .getElementById(
        "coverMenu"
      )
      .classList.remove(
        "open"
      );
  }
);


function paintCoverCell(
  row,
  col
) {
  // Don't repeatedly paint the same cell while the pointer remains over it.
  if (
    row === lastPaintedRow &&
    col === lastPaintedCol
  ) {
    return;
  }

  lastPaintedRow = row;
  lastPaintedCol = col;

  // Only paint empty cells.
  // This prevents dragging across the board from overwriting Players, Enemies,
  // or existing terrain.
  if (
    board[row][col] !== null
  ) {
    return;
  }

  // FULL COVER
  if (
    selectedTool === "barrier"
  ) {

    board[row][col] = {
      type: "barrier",
      name: "Full Cover",
      id: nextCharacterId++
    };
  } else if (
    // HALF COVER
    selectedTool === "half-cover"
  ) {
    board[row][col] = {
      type: "half-cover",
      name: "Half Cover",
      id: nextCharacterId++
    };
  }
  // Redraw immediately so it feels like painting terrain.
  renderBoard();
}

// Darkness
let darknessAreas = [];
let nextDarknessId = 1;
let selectedDarknessId = null;
let darknessPreviewCells = [];
let darknessErasePreviewCells = [];

// IN THE FUTURE THIS WILL BE A TOGGLE FOR THE DARKNESS TEMPLATE
let useSimpleDarkness = true;
const SIMPLE_DARKNESS_SHAPE = [
  [-3,  0],

  [-2, -1],
  [-2,  0],
  [-2,  1],

  [-1, -2],
  [-1, -1],
  [-1,  0],
  [-1,  1],
  [-1,  2],

  [ 0, -3],
  [ 0, -2],
  [ 0, -1],
  [ 0,  0],
  [ 0,  1],
  [ 0,  2],
  [ 0,  3],

  [ 1, -2],
  [ 1, -1],
  [ 1,  0],
  [ 1,  1],
  [ 1,  2],

  [ 2, -1],
  [ 2,  0],
  [ 2,  1],

  [ 3,  0]
];
const CENTER_SQUARD_DARKNESS_SHAPE = [
  [-3,  -1],
  [-3,  0],
  [-3,  1],

  [-2, -2],
  [-2, -1],
  [-2,  0],
  [-2,  1],
  [-2, 2],

  [-1, -3],
  [-1, -2],
  [-1, -1],
  [-1,  0],
  [-1,  1],
  [-1,  2],
  [-1, 3],

  [ 0, -3],
  [ 0, -2],
  [ 0, -1],
  [ 0,  0],
  [ 0,  1],
  [ 0,  2],
  [ 0,  3],

  [ 1,  -3],
  [ 1, -2],
  [ 1, -1],
  [ 1,  0],
  [ 1,  1],
  [ 1,  2],
  [ 1,  3],

  [ 2,  -2],
  [ 2, -1],
  [ 2,  0],
  [ 2,  1],
  [ 2,  2],

  [ 3,  -1],
  [ 3,  0],
  [ 3,  1]
];
const DARKNESS_SHAPE = useSimpleDarkness ? SIMPLE_DARKNESS_SHAPE : CENTER_SQUARD_DARKNESS_SHAPE;


function renderDarkness() {

  /*
    Remove previous Darkness visuals.
  */

  document
    .querySelectorAll(
      ".darkness-overlay"
    )
    .forEach(cell => {

      cell.classList.remove(
        "darkness-overlay"
      );

    });


  /*
    Render every Darkness area.
  */

  for (
    const darkness of darknessAreas
  ) {

    for (
      const [rowOffset, colOffset]
      of DARKNESS_SHAPE
    ) {

      const row =
        darkness.row + rowOffset;

      const col =
        darkness.col + colOffset;


      /*
        Shape can extend beyond the map.
        Only render cells actually on-grid.
      */

      if (
        row < 0 ||
        row >= ROWS ||
        col < 0 ||
        col >= COLS
      ) {
        continue;
      }


      const cell =
        grid.querySelector(
          `.cell[data-row="${row}"]` +
          `[data-col="${col}"]`
        );


      if (cell) {

        cell.classList.add(
          "darkness-overlay"
        );

      }

    }

  }

}


function removeAllDarkness() {

  /*
    Remove Darkness visuals from cells.
  */

  document
    .querySelectorAll(
      ".darkness-overlay"
    )
    .forEach(cell => {

      cell.classList.remove(
        "darkness-overlay"
      );

    });


  /*
    Remove stored Darkness areas
    if the variable still exists.
  */

  if (
    typeof darknessAreas !== "undefined"
  ) {

    darknessAreas.length = 0;

  }


  /*
    Remove Darkness from saved data.
  */

  try {

    const savedData =
      localStorage.getItem(
        SAVE_KEY
      );


    if (savedData) {

      const data =
        JSON.parse(savedData);


      delete data.darknessAreas;
      delete data.nextDarknessId;
      delete data.selectedDarknessId;


      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify(data)
      );

    }

  }
  catch (error) {

    console.error(
      "Unable to remove Darkness:",
      error
    );

  }


  /*
    Redraw grid.
  */

  renderBoard();

  checkAllLineOfSight();

}


function isDarknessAt(
  row,
  col
) {

  for (
    const darkness of darknessAreas
  ) {

    for (
      const [rowOffset, colOffset]
      of DARKNESS_SHAPE
    ) {

      if (
        darkness.row + rowOffset === row &&
        darkness.col + colOffset === col
      ) {

        return true;

      }

    }

  }


  return false;

}


function getDarknessAt(
  row,
  col
) {

  /*
    Check newest Darkness first.

    This matters if multiple Darkness
    areas overlap.
  */

  for (
    let i = darknessAreas.length - 1;
    i >= 0;
    i--
  ) {

    const darkness =
      darknessAreas[i];


    for (
      const [rowOffset, colOffset]
      of DARKNESS_SHAPE
    ) {

      const darknessRow =
        darkness.row +
        rowOffset;

      const darknessCol =
        darkness.col +
        colOffset;


      if (
        darknessRow === row &&
        darknessCol === col
      ) {

        return darkness;

      }

    }

  }


  return null;

}

function removeDarkness(
  darknessId
) {

  darknessAreas =
    darknessAreas.filter(
      darkness =>
        darkness.id !== darknessId
    );


  renderBoard();

  checkAllLineOfSight();

  saveBattleGrid();

}


function doesRayCrossDarkness(
  startRow,
  startCol,
  targetRow,
  targetCol
) {

  const startX =
    startCol + 0.5;

  const startY =
    startRow + 0.5;


  const endX =
    targetCol + 0.5;

  const endY =
    targetRow + 0.5;


  const dx =
    endX - startX;

  const dy =
    endY - startY;


  /*
    Sample densely enough that every
    crossed grid cell is detected.
  */

  const distance =
    Math.max(
      Math.abs(
        targetCol - startCol
      ),
      Math.abs(
        targetRow - startRow
      )
    );


  const steps =
    Math.max(
      distance * 20,
      20
    );


  for (
    let i = 0;
    i <= steps;
    i++
  ) {

    const t =
      i / steps;


    const x =
      startX +
      dx * t;

    const y =
      startY +
      dy * t;


    const col =
      Math.floor(x);

    const row =
      Math.floor(y);


    if (
      isDarknessAt(
        row,
        col
      )
    ) {

      return true;

    }

  }


  return false;

}


function clearDarknessPreview() {

  for (
    const cell of darknessPreviewCells
  ) {

    cell.classList.remove(
      "darkness-preview",
      "darkness-preview-center"
    );

  }

  darknessPreviewCells = [];

}


function showDarknessPreview(
  centerRow,
  centerCol
) {

  /*
    Remove previous preview.
  */

  clearDarknessPreview();


  /*
    Only preview while Darkness
    is the selected tool.
  */

  if (
    selectedTool !== "darkness"
  ) {
    return;
  }


  /*
    Draw the entire Darkness footprint.
  */

  for (
    const [rowOffset, colOffset]
    of DARKNESS_SHAPE
  ) {

    const row =
      centerRow + rowOffset;

    const col =
      centerCol + colOffset;


    /*
      Darkness may extend beyond the map.

      We simply don't preview the portions
      outside the current grid.
    */

    if (
      row < 0 ||
      row >= ROWS ||
      col < 0 ||
      col >= COLS
    ) {
      continue;
    }


    const cell =
      grid.querySelector(
        `.cell[data-row="${row}"]` +
        `[data-col="${col}"]`
      );


    if (!cell) {
      continue;
    }


    cell.classList.add(
      "darkness-preview"
    );


    /*
      Highlight the center/anchor square.
    */

    if (
      row === centerRow &&
      col === centerCol
    ) {

      cell.classList.add(
        "darkness-preview-center"
      );

    }


    darknessPreviewCells.push(
      cell
    );

  }

}


function clearDarknessErasePreview() {

  for (
    const cell of
    darknessErasePreviewCells
  ) {

    cell.classList.remove(
      "darkness-erase-preview"
    );

  }


  darknessErasePreviewCells = [];

}


function showDarknessErasePreview(
  row,
  col
) {

  clearDarknessErasePreview();


  if (
    selectedTool !== "erase"
  ) {
    return;
  }


  const darkness =
    getDarknessAt(
      row,
      col
    );


  if (!darkness) {
    return;
  }


  /*
    Highlight the entire Darkness area
    that will be deleted.
  */

  for (
    const [rowOffset, colOffset]
    of DARKNESS_SHAPE
  ) {

    const darknessRow =
      darkness.row +
      rowOffset;

    const darknessCol =
      darkness.col +
      colOffset;


    if (
      darknessRow < 0 ||
      darknessRow >= ROWS ||
      darknessCol < 0 ||
      darknessCol >= COLS
    ) {
      continue;
    }


    const cell =
      grid.querySelector(
        `.cell[data-row="${darknessRow}"]` +
        `[data-col="${darknessCol}"]`
      );


    if (cell) {

      cell.classList.add(
        "darkness-erase-preview"
      );


      darknessErasePreviewCells.push(
        cell
      );

    }

  }

}


// Debug
let textBoard = [];
let textStr = "";
function printBoard() {
  const cells =
    grid.querySelectorAll(
      ".cell"
    );



  cells.forEach(cell => {
    const row =
      Number(
        cell.dataset.row
      );

    const col =
      Number(
        cell.dataset.col
      );

    const piece =
      board[row][col];

      // If the row doesn't exist yet, initialize it as an empty array
      if (!textBoard[row]) {
        textBoard[row] = [];
      }

    if (!piece) {
      textBoard[row][col] = ".";
      return;
    }

    if (
      piece.type === "barrier"
    ) {
      textBoard[row][col] = "F";
    } else if (
      piece.type ===
      "half-cover"
    ) {
      textBoard[row][col] = "H";
    } else if (
      piece.type ===
      "enemy"
    ) {
      textBoard[row][col] = "E";
    } else {
      textBoard[row][col] = "P";
    }
  });

  for (
    let r = 0;
    r < ROWS;
    r++
  ) {

    for (
      let c = 0;
      c < COLS;
      c++
    ) {
      textStr += textBoard[r][c];
      if (c + 1 === COLS) {
        console.log(`${r} ${c}`);
        textStr += "\n";
      }
    }
  }
}


// INITIALIZE
initializeBoard();
createGrid();
updateEnemyVisionOverlay();

// INITIALIZE APPLICATION
const saveLoaded = loadBattleGrid();

// No saved board exists yet.
if (!saveLoaded) {
  initializeBoard();
}

createGrid();
// updateVisionButton();
checkAllLineOfSight();

// Debug currently rendered board
// printBoard();
// console.log(textBoard);
// console.log(textStr);
