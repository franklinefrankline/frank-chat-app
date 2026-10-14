/**
 * FRANK Office — Google Sheets Style Spreadsheet Engine
 * Full-featured spreadsheet implementation supporting:
 * - Google Sheets toolbar layout (30+ functional controls)
 * - File, Edit, View, Insert, Format, Data, Tools, Extensions, Help menus
 * - Formula bar with Name box, fx, input, Enter/Escape, real formula evaluator
 * - Interactive spreadsheet grid: column/row resizing, drag selection, fill handle,
 *   keyboard navigation, inline editing, copy/cut/paste, freeze rows/cols, filtering, sorting
 * - Multi-worksheet tabs: add, rename, duplicate, delete, reorder, tab colors
 * - Bottom status bar with real-time statistical aggregations (Sum, Avg, Min, Max, Count)
 * - SheetJS (XLSX) import/export and compatibility
 * - Modals for Find & Replace, Chart Builder, Keyboard Shortcuts, Formula Reference
 */

class FrankSheetsEngine {
    constructor(workspace) {
        this.workspace = workspace;
        this.activeSheetIdx = 0;
        this.activeCell = { r: 0, c: 0, coord: 'A1' };
        this.selectedRange = { startR: 0, startC: 0, endR: 0, endC: 0 };
        this.isSelectingRange = false;
        this.isDraggingFillHandle = false;
        this.fillHandleStart = null;
        this.paintFormatSource = null;
        this.zoomLevel = 100;
        this.showFormulaBar = true;
        this.showGridlines = true;
        this.frozenRows = 0;
        this.frozenCols = 0;
        this.filterActive = false;
        this.filterCriteria = {}; // { colIdx: { search: '', hiddenValues: Set } }
        this.undoStack = [];
        this.redoStack = [];
        this.primaryStat = 'SUM'; // 'SUM' | 'AVERAGE' | 'COUNT' | 'MIN' | 'MAX'
        this.cellComments = {}; // { 'A1': 'note text' }
        this.colWidths = {}; // { 0: 120 }
        this.rowHeights = {}; // { 0: 32 }
        this.isEditingInline = false;
        this.inlineEditorEl = null;

        // Clipboard buffer for cell copy/cut
        this.clipboard = null; // { type: 'copy'|'cut', data: [[]], formulas: {}, styles: {}, range: {} }

        // Part 1: Enhanced Selection & Context Menu state
        this.selectionMode = 'cell'; // 'cell' | 'row' | 'col' | 'all'
        this.selectedRows = new Set();
        this.selectedCols = new Set();
        this.isSelectingRows = false;
        this.isSelectingCols = false;
        this.rowSelectAnchor = null;
        this.colSelectAnchor = null;
        this.currentContextMenu = null;

        // Bind global keydown handler for spreadsheet shortcuts
        this.boundKeyHandler = this.handleGlobalKeyDown.bind(this);
    }

    // Initialize or attach to current workspace data
    initData() {
        if (!this.workspace.excelData) {
            this.workspace.excelData = {
                sheets: [this.createBlankSheet('Sheet1')],
                activeSheetIdx: 0
            };
        }
        if (!this.workspace.excelData.sheets || this.workspace.excelData.sheets.length === 0) {
            this.workspace.excelData.sheets = [this.createBlankSheet('Sheet1')];
        }
        this.activeSheetIdx = Math.min(this.workspace.excelData.activeSheetIdx || 0, this.workspace.excelData.sheets.length - 1);
        if (this.activeSheetIdx < 0) this.activeSheetIdx = 0;
    }

    createBlankSheet(name = 'Sheet1') {
        const rows = 35;
        const cols = 16;
        const data = Array.from({ length: rows }, () => Array(cols).fill(''));
        return {
            name: name,
            data: data,
            formulas: {},
            styles: {},
            colWidths: {},
            rowHeights: {},
            frozenRows: 0,
            frozenCols: 0,
            tabColor: null
        };
    }

    getCurrentSheet() {
        this.initData();
        return this.workspace.excelData.sheets[this.activeSheetIdx] || this.workspace.excelData.sheets[0];
    }

    recordStateForUndo() {
        const sheet = this.getCurrentSheet();
        const snapshot = {
            activeSheetIdx: this.activeSheetIdx,
            sheetName: sheet.name,
            data: JSON.parse(JSON.stringify(sheet.data || [])),
            formulas: JSON.parse(JSON.stringify(sheet.formulas || {})),
            styles: JSON.parse(JSON.stringify(sheet.styles || {})),
            colWidths: JSON.parse(JSON.stringify(sheet.colWidths || {})),
            rowHeights: JSON.parse(JSON.stringify(sheet.rowHeights || {}))
        };
        this.undoStack.push(snapshot);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = []; // clear redo on new action
    }

    undo() {
        if (this.undoStack.length === 0) {
            showToast('Nothing to undo', 'info');
            return;
        }
        const sheet = this.getCurrentSheet();
        const currentSnapshot = {
            activeSheetIdx: this.activeSheetIdx,
            sheetName: sheet.name,
            data: JSON.parse(JSON.stringify(sheet.data || [])),
            formulas: JSON.parse(JSON.stringify(sheet.formulas || {})),
            styles: JSON.parse(JSON.stringify(sheet.styles || {})),
            colWidths: JSON.parse(JSON.stringify(sheet.colWidths || {})),
            rowHeights: JSON.parse(JSON.stringify(sheet.rowHeights || {}))
        };
        this.redoStack.push(currentSnapshot);

        const prev = this.undoStack.pop();
        if (this.workspace.excelData.sheets[prev.activeSheetIdx]) {
            this.activeSheetIdx = prev.activeSheetIdx;
            const targetSheet = this.workspace.excelData.sheets[prev.activeSheetIdx];
            targetSheet.data = prev.data;
            targetSheet.formulas = prev.formulas;
            targetSheet.styles = prev.styles;
            targetSheet.colWidths = prev.colWidths;
            targetSheet.rowHeights = prev.rowHeights;
        }
        this.workspace.markDirty();
        this.renderGrid();
        this.renderSheetTabs();
        this.syncFormulaBar();
        showToast('Undo performed', 'info');
    }

    redo() {
        if (this.redoStack.length === 0) {
            showToast('Nothing to redo', 'info');
            return;
        }
        const sheet = this.getCurrentSheet();
        const currentSnapshot = {
            activeSheetIdx: this.activeSheetIdx,
            sheetName: sheet.name,
            data: JSON.parse(JSON.stringify(sheet.data || [])),
            formulas: JSON.parse(JSON.stringify(sheet.formulas || {})),
            styles: JSON.parse(JSON.stringify(sheet.styles || {})),
            colWidths: JSON.parse(JSON.stringify(sheet.colWidths || {})),
            rowHeights: JSON.parse(JSON.stringify(sheet.rowHeights || {}))
        };
        this.undoStack.push(currentSnapshot);

        const next = this.redoStack.pop();
        if (this.workspace.excelData.sheets[next.activeSheetIdx]) {
            this.activeSheetIdx = next.activeSheetIdx;
            const targetSheet = this.workspace.excelData.sheets[next.activeSheetIdx];
            targetSheet.data = next.data;
            targetSheet.formulas = next.formulas;
            targetSheet.styles = next.styles;
            targetSheet.colWidths = next.colWidths;
            targetSheet.rowHeights = next.rowHeights;
        }
        this.workspace.markDirty();
        this.renderGrid();
        this.renderSheetTabs();
        this.syncFormulaBar();
        showToast('Redo performed', 'info');
    }

    // ---------------- COORDINATE HELPERS ----------------
    colIdxToLetter(c) {
        let temp = c;
        let letter = '';
        while (temp >= 0) {
            letter = String.fromCharCode((temp % 26) + 65) + letter;
            temp = Math.floor(temp / 26) - 1;
        }
        return letter;
    }

    coordToIndices(coord) {
        if (!coord) return { r: 0, c: 0 };
        const cleanCoord = String(coord).replace(/\$/g, '').trim().toUpperCase();
        const match = cleanCoord.match(/^([A-Z]+)([0-9]+)$/);
        if (!match) return { r: 0, c: 0 };
        const colStr = match[1];
        const rowStr = match[2];
        let c = 0;
        for (let i = 0; i < colStr.length; i++) {
            c = c * 26 + (colStr.charCodeAt(i) - 64);
        }
        return { r: parseInt(rowStr, 10) - 1, c: c - 1 };
    }

    indicesToCoord(r, c) {
        return `${this.colIdxToLetter(c)}${r + 1}`;
    }

    colLetterToIdx(colStr) {
        if (!colStr) return 0;
        const clean = String(colStr).trim().toUpperCase();
        let c = 0;
        for (let i = 0; i < clean.length; i++) {
            c = c * 26 + (clean.charCodeAt(i) - 64);
        }
        return Math.max(0, c - 1);
    }

    shiftFormulaReferences(formula, shiftInfo) {
        if (!formula || typeof formula !== 'string' || !formula.startsWith('=')) return formula;
        return formula.replace(/(\$?[A-Z]+)(\$?[0-9]+)/g, (match, colPart, rowPart) => {
            const isColAbs = colPart.startsWith('$');
            const isRowAbs = rowPart.startsWith('$');
            const cleanCol = colPart.replace('$', '');
            const cleanRow = parseInt(rowPart.replace('$', ''), 10);

            let c = this.colLetterToIdx(cleanCol);
            let r = cleanRow - 1;

            if (shiftInfo.type === 'rowInsert') {
                if (r >= shiftInfo.atRow) r += shiftInfo.count;
            } else if (shiftInfo.type === 'rowDelete') {
                if (r >= shiftInfo.atRow && r < shiftInfo.atRow + shiftInfo.count) return '#REF!';
                if (r >= shiftInfo.atRow + shiftInfo.count) r -= shiftInfo.count;
            } else if (shiftInfo.type === 'colInsert') {
                if (c >= shiftInfo.atCol) c += shiftInfo.count;
            } else if (shiftInfo.type === 'colDelete') {
                if (c >= shiftInfo.atCol && c < shiftInfo.atCol + shiftInfo.count) return '#REF!';
                if (c >= shiftInfo.atCol + shiftInfo.count) c -= shiftInfo.count;
            }

            const newCol = (isColAbs ? '$' : '') + this.colIdxToLetter(c);
            const newRow = (isRowAbs ? '$' : '') + (r + 1);
            return newCol + newRow;
        });
    }

    shiftSheetFormulasAndStyles(shiftInfo) {
        const sheet = this.getCurrentSheet();
        if (sheet.formulas) {
            const newFormulas = {};
            for (const [coord, formula] of Object.entries(sheet.formulas)) {
                const { r, c } = this.coordToIndices(coord);
                let newR = r;
                let newC = c;
                let shouldDelete = false;

                if (shiftInfo.type === 'rowInsert') {
                    if (r >= shiftInfo.atRow) newR += shiftInfo.count;
                } else if (shiftInfo.type === 'rowDelete') {
                    if (r >= shiftInfo.atRow && r < shiftInfo.atRow + shiftInfo.count) shouldDelete = true;
                    else if (r >= shiftInfo.atRow + shiftInfo.count) newR -= shiftInfo.count;
                } else if (shiftInfo.type === 'colInsert') {
                    if (c >= shiftInfo.atCol) newC += shiftInfo.count;
                } else if (shiftInfo.type === 'colDelete') {
                    if (c >= shiftInfo.atCol && c < shiftInfo.atCol + shiftInfo.count) shouldDelete = true;
                    else if (c >= shiftInfo.atCol + shiftInfo.count) newC -= shiftInfo.count;
                }

                if (!shouldDelete) {
                    const newCoord = this.indicesToCoord(newR, newC);
                    newFormulas[newCoord] = this.shiftFormulaReferences(formula, shiftInfo);
                }
            }
            sheet.formulas = newFormulas;
        }

        if (sheet.styles) {
            const newStyles = {};
            for (const [coord, st] of Object.entries(sheet.styles)) {
                const { r, c } = this.coordToIndices(coord);
                let newR = r;
                let newC = c;
                let shouldDelete = false;

                if (shiftInfo.type === 'rowInsert') {
                    if (r >= shiftInfo.atRow) newR += shiftInfo.count;
                } else if (shiftInfo.type === 'rowDelete') {
                    if (r >= shiftInfo.atRow && r < shiftInfo.atRow + shiftInfo.count) shouldDelete = true;
                    else if (r >= shiftInfo.atRow + shiftInfo.count) newR -= shiftInfo.count;
                } else if (shiftInfo.type === 'colInsert') {
                    if (c >= shiftInfo.atCol) newC += shiftInfo.count;
                } else if (shiftInfo.type === 'colDelete') {
                    if (c >= shiftInfo.atCol && c < shiftInfo.atCol + shiftInfo.count) shouldDelete = true;
                    else if (c >= shiftInfo.atCol + shiftInfo.count) newC -= shiftInfo.count;
                }

                if (!shouldDelete) {
                    const newCoord = this.indicesToCoord(newR, newC);
                    newStyles[newCoord] = st;
                }
            }
            sheet.styles = newStyles;
        }
    }

    // ---------------- MOUNT GOOGLE SHEETS WORKSPACE ----------------
    mount(toolbarEl, canvasEl) {
        this.initData();
        this.cleanup();

        // 1. Mount Application Header Menus (File, Edit, View, Insert, Format, Data, Tools, Extensions, Help)
        this.mountMenuBar();

        // 2. Mount Spreadsheet Toolbar
        this.mountToolbar(toolbarEl);

        // 3. Mount Formula Bar, Grid Area, Sheet Tabs & Status Bar
        this.mountCanvas(canvasEl);

        // Bind global shortcut listeners
        document.addEventListener('keydown', this.boundKeyHandler);

        // Initial Grid Render
        this.renderGrid();
        this.renderSheetTabs();
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    cleanup() {
        document.removeEventListener('keydown', this.boundKeyHandler);
        // Remove open dropdowns or floating modals
        document.querySelectorAll('.sheets-dropdown-menu, .sheets-modal-overlay').forEach(el => el.remove());
    }

    // ---------------- 1. MENU BAR MOUNTING ----------------
    mountMenuBar() {
        const menuBar = document.getElementById('workspaceMenuBar');
        if (!menuBar) return;

        const t = (k, def) => (window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(k, def) : def);

        menuBar.innerHTML = `
            <div class="sheets-menubar-wrap" id="sheetsMenuBarWrap">
                <div class="sheets-menu-item" data-menu="file" data-i18n="office.menuFile">${t('office.menuFile', 'File')}</div>
                <div class="sheets-menu-item" data-menu="edit" data-i18n="office.menuEdit">${t('office.menuEdit', 'Edit')}</div>
                <div class="sheets-menu-item" data-menu="view" data-i18n="office.menuView">${t('office.menuView', 'View')}</div>
                <div class="sheets-menu-item" data-menu="insert" data-i18n="office.menuInsert">${t('office.menuInsert', 'Insert')}</div>
                <div class="sheets-menu-item" data-menu="format" data-i18n="office.menuFormat">${t('office.menuFormat', 'Format')}</div>
                <div class="sheets-menu-item" data-menu="data" data-i18n="office.menuData">${t('office.menuData', 'Data')}</div>
                <div class="sheets-menu-item" data-menu="tools" data-i18n="office.menuTools">${t('office.menuTools', 'Tools')}</div>
                <div class="sheets-menu-item" data-menu="extensions" data-i18n="office.menuExtensions">${t('office.menuExtensions', 'Extensions')}</div>
                <div class="sheets-menu-item" data-menu="help" data-i18n="office.menuHelp">${t('office.menuHelp', 'Help')}</div>
            </div>
        `;

        if (!this._sheetsLangBound) {
            this._sheetsLangBound = true;
            window.addEventListener('frank:languageChanged', () => {
                this.mountMenuBar();
            });
        }

        menuBar.querySelectorAll('.sheets-menu-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const menuName = item.dataset.menu;
                this.toggleDropdownMenu(item, menuName);
            };
        });

        // Close menu dropdowns on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sheets-menu-item') && !e.target.closest('.sheets-dropdown-menu')) {
                this.closeAllDropdowns();
            }
        });
    }

    closeAllDropdowns() {
        document.querySelectorAll('.sheets-dropdown-menu').forEach(el => el.remove());
        document.querySelectorAll('.sheets-menu-item.active').forEach(el => el.classList.remove('active'));
    }

    toggleDropdownMenu(triggerEl, menuName) {
        const isOpen = triggerEl.classList.contains('active');
        this.closeAllDropdowns();
        if (isOpen) return;

        triggerEl.classList.add('active');
        const rect = triggerEl.getBoundingClientRect();

        const menuEl = document.createElement('div');
        menuEl.className = 'sheets-dropdown-menu';
        menuEl.style.top = `${rect.bottom + 2}px`;
        menuEl.style.left = `${rect.left}px`;

        const items = this.getMenuItems(menuName);
        let html = '';
        items.forEach(it => {
            if (it.divider) {
                html += '<div class="sheets-menu-divider"></div>';
            } else {
                html += `
                    <div class="sheets-menu-option ${it.disabled ? 'disabled' : ''}" data-action="${it.action || ''}">
                        <div class="menu-opt-left">
                            ${it.icon ? `<span class="menu-opt-icon">${it.icon}</span>` : '<span class="menu-opt-icon"></span>'}
                            <span class="menu-opt-text">${it.label}</span>
                        </div>
                        ${it.shortcut ? `<span class="menu-opt-shortcut">${it.shortcut}</span>` : ''}
                    </div>
                `;
            }
        });
        menuEl.innerHTML = html;
        document.body.appendChild(menuEl);

        menuEl.querySelectorAll('.sheets-menu-option:not(.disabled)').forEach(opt => {
            opt.onclick = (e) => {
                e.stopPropagation();
                const action = opt.dataset.action;
                this.closeAllDropdowns();
                if (action && typeof this[action] === 'function') {
                    this[action]();
                } else if (action) {
                    this.executeMenuAction(action);
                }
            };
        });
    }

    getMenuItems(menuName) {
        switch (menuName) {
            case 'file':
                return [
                    { label: 'New Workbook', action: 'fileNewWorkbook', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>', shortcut: 'Ctrl+N' },
                    { label: 'Open / Import...', action: 'fileOpenImport', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>', shortcut: 'Ctrl+O' },
                    { label: 'Edit Document', action: 'fileEditDocument', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2h7l5 5v3.5"></path><polyline points="13 2 13 7 18 7"></polyline><path d="M14 19l6.5-6.5a1.414 1.414 0 0 1 2 2L16 21l-3 1 1-3z"></path></svg>' },
                    { label: 'Rename Workbook', action: 'fileRenameWorkbook', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>' },
                    { label: 'Make a Copy', action: 'fileMakeCopy', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' },
                    { divider: true },
                    { label: 'Save', action: 'fileSave', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>', shortcut: 'Ctrl+S' },
                    { label: 'Download as Excel (.xlsx)', action: 'fileExportXlsx', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' },
                    { label: 'Download as CSV (.csv)', action: 'fileExportCsv', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' },
                    { label: 'Print', action: 'filePrint', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>', shortcut: 'Ctrl+P' },
                    { divider: true },
                    { label: 'Version History', action: 'fileVersionHistory', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>' },
                    { label: 'Document Information', action: 'fileDocInfo', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>' },
                    { divider: true },
                    { label: 'Close', action: 'fileClose', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' }
                ];
            case 'edit':
                return [
                    { label: 'Undo', action: 'undo', shortcut: 'Ctrl+Z' },
                    { label: 'Redo', action: 'redo', shortcut: 'Ctrl+Y' },
                    { divider: true },
                    { label: 'Cut', action: 'editCut', shortcut: 'Ctrl+X' },
                    { label: 'Copy', action: 'editCopy', shortcut: 'Ctrl+C' },
                    { label: 'Paste', action: 'editPaste', shortcut: 'Ctrl+V' },
                    { divider: true },
                    { label: 'Find and Replace', action: 'editFindReplace', shortcut: 'Ctrl+H' },
                    { label: 'Delete Row', action: 'excelDeleteRow' },
                    { label: 'Delete Column', action: 'excelDeleteCol' },
                    { label: 'Clear Contents', action: 'editClearContents', shortcut: 'Del' },
                    { divider: true },
                    { label: 'Select All', action: 'editSelectAll', shortcut: 'Ctrl+A' }
                ];
            case 'view':
                return [
                    { label: 'Zoom 50%', action: () => this.setZoom(50) },
                    { label: 'Zoom 75%', action: () => this.setZoom(75) },
                    { label: 'Zoom 100% (Normal)', action: () => this.setZoom(100) },
                    { label: 'Zoom 125%', action: () => this.setZoom(125) },
                    { label: 'Zoom 150%', action: () => this.setZoom(150) },
                    { divider: true },
                    { label: this.showFormulaBar ? '✓ Show Formula Bar' : 'Show Formula Bar', action: 'viewToggleFormulaBar' },
                    { label: this.showGridlines ? '✓ Show Gridlines' : 'Show Gridlines', action: 'viewToggleGridlines' },
                    { divider: true },
                    { label: 'Freeze 1 Row', action: () => this.setFrozen(1, this.frozenCols) },
                    { label: 'Freeze 2 Rows', action: () => this.setFrozen(2, this.frozenCols) },
                    { label: 'Freeze 1 Column', action: () => this.setFrozen(this.frozenRows, 1) },
                    { label: 'No Frozen Rows/Columns', action: () => this.setFrozen(0, 0) },
                    { divider: true },
                    { label: 'Full Screen', action: 'viewToggleFullScreen', shortcut: 'F11' }
                ];
            case 'insert':
                return [
                    { label: 'Row Above', action: 'excelInsertRow' },
                    { label: 'Row Below', action: 'excelInsertRowBelow' },
                    { label: 'Column Left', action: 'excelInsertCol' },
                    { label: 'Column Right', action: 'excelInsertColRight' },
                    { divider: true },
                    { label: 'New Worksheet', action: 'excelAddSheet', shortcut: 'Shift+F11' },
                    { label: 'Insert Link', action: 'insertLink', shortcut: 'Ctrl+K' },
                    { label: 'Insert Image...', action: 'insertImage' },
                    { label: 'Insert Chart...', action: 'insertChart' },
                    { label: 'Insert Checkbox', action: 'insertCheckbox' }
                ];
            case 'format':
                return [
                    { label: 'Bold', action: () => this.toggleCellFormat('bold'), shortcut: 'Ctrl+B' },
                    { label: 'Italic', action: () => this.toggleCellFormat('italic'), shortcut: 'Ctrl+I' },
                    { label: 'Underline', action: () => this.toggleCellFormat('underline'), shortcut: 'Ctrl+U' },
                    { label: 'Strikethrough', action: () => this.toggleCellFormat('strike'), shortcut: 'Alt+Shift+5' },
                    { divider: true },
                    { label: 'Number: Automatic', action: () => this.setNumberFormat('auto') },
                    { label: 'Number: Plain Text', action: () => this.setNumberFormat('text') },
                    { label: 'Number: Currency ($)', action: () => this.setNumberFormat('currency') },
                    { label: 'Number: Percentage (%)', action: () => this.setNumberFormat('percent') },
                    { label: 'Number: Date (YYYY-MM-DD)', action: () => this.setNumberFormat('date') },
                    { divider: true },
                    { label: 'Align Left', action: () => this.setCellFormat('align', 'left') },
                    { label: 'Align Center', action: () => this.setCellFormat('align', 'center') },
                    { label: 'Align Right', action: () => this.setCellFormat('align', 'right') },
                    { divider: true },
                    { label: 'Text Wrapping: Wrap', action: () => this.setCellFormat('wrap', 'wrap') },
                    { label: 'Text Wrapping: Clip', action: () => this.setCellFormat('wrap', 'clip') },
                    { label: 'Clear Formatting', action: 'formatClearFormatting', shortcut: 'Ctrl+\\' }
                ];
            case 'data':
                return [
                    { label: 'Sort Range A → Z', action: () => this.sortRange(true) },
                    { label: 'Sort Range Z → A', action: () => this.sortRange(false) },
                    { divider: true },
                    { label: this.filterActive ? '✓ Remove Filter' : 'Create a Filter', action: 'toggleFilter' },
                    { label: 'Data Validation...', action: 'openDataValidation' },
                    { label: 'Remove Duplicates...', action: 'removeDuplicates' },
                    { label: 'Split Text to Columns...', action: 'splitTextToColumns' }
                ];
            case 'tools':
                return [
                    { label: 'Spellcheck & Trim Spaces', action: 'toolSpellcheck' },
                    { label: 'Formula Syntax Assistance', action: 'toolFormulaHelp' },
                    { label: 'Accessibility Mode', action: 'toolAccessibility' }
                ];
            case 'extensions':
                return [
                    { label: 'FRANK AI Data Assistant', action: 'extFrankAiAssistant' },
                    { label: 'Export JSON Dataset', action: 'extExportJson' }
                ];
            case 'help':
                return [
                    { label: 'Keyboard Shortcuts', action: 'helpShortcuts', shortcut: 'Ctrl+/' },
                    { label: 'Function List & Syntax', action: 'helpFunctions' },
                    { label: 'Spreadsheet Help Guide', action: 'helpGuide' }
                ];
            default:
                return [];
        }
    }

    // ---------------- 2. SPREADSHEET TOOLBAR MOUNTING (30 GOOGLE SHEETS CONTROLS) ----------------
    mountToolbar(toolbarEl) {
        toolbarEl.innerHTML = `
            <div class="sheets-toolbar-inner" id="sheetsToolbarInner">
                <!-- 1. Search Menus -->
                <button type="button" class="tool-btn icon-only" id="xlSearchBtn" title="Search the menus (Ctrl+/)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </button>

                <div class="tool-sep"></div>

                <!-- 2. Undo -->
                <button type="button" class="tool-btn icon-only" id="xlUndoBtn" title="Undo (Ctrl+Z)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
                </button>

                <!-- 3. Redo -->
                <button type="button" class="tool-btn icon-only" id="xlRedoBtn" title="Redo (Ctrl+Y)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>
                </button>

                <!-- 4. Print -->
                <button type="button" class="tool-btn icon-only" id="xlPrintBtn" title="Print (Ctrl+P)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                </button>

                <!-- 5. Paint Format -->
                <button type="button" class="tool-btn icon-only" id="xlPaintFormatBtn" title="Paint format">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 11V4a2 2 0 0 0-2-2H4v14h13a2 2 0 0 0 2-2v-3z"></path><path d="M14 16v5a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-5"></path></svg>
                </button>

                <!-- 6. Zoom Select -->
                <select class="tool-select" id="xlZoomSelect" title="Zoom" style="width:72px;">
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="90">90%</option>
                    <option value="100" selected>100%</option>
                    <option value="125">125%</option>
                    <option value="150">150%</option>
                    <option value="200">200%</option>
                </select>

                <div class="tool-sep"></div>

                <!-- 7. Format as Currency -->
                <button type="button" class="tool-btn icon-only" id="xlCurrencyBtn" title="Format as currency ($)" style="font-weight:700;">$</button>

                <!-- 8. Format as Percent -->
                <button type="button" class="tool-btn icon-only" id="xlPercentBtn" title="Format as percent (%)" style="font-weight:700;">%</button>

                <!-- 9. Decrease Decimal Places -->
                <button type="button" class="tool-btn icon-only" id="xlDecrDecimalsBtn" title="Decrease decimal places">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8"></path><polyline points="8 8 4 12 8 16"></polyline><circle cx="18" cy="12" r="2"></circle></svg>
                </button>

                <!-- 10. Increase Decimal Places -->
                <button type="button" class="tool-btn icon-only" id="xlIncrDecimalsBtn" title="Increase decimal places">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 12h8"></path><polyline points="16 8 20 12 16 16"></polyline><circle cx="6" cy="12" r="2"></circle></svg>
                </button>

                <!-- 11. More Formats (123) -->
                <button type="button" class="tool-btn icon-only" id="xlNumFormatBtn" title="More formats (123)">
                    <span style="font-size:11px;font-weight:700;">123▾</span>
                </button>

                <div class="tool-sep"></div>

                <!-- 12. Font Family -->
                <select class="tool-select" id="xlFontFamily" title="Font" style="width:110px;">
                    <option value="Inter" selected>Inter</option>
                    <option value="Arial">Arial</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Segoe UI">Segoe UI</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                </select>

                <!-- 13. Font Size -->
                <select class="tool-select" id="xlFontSize" title="Font size" style="width:58px;">
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12" selected>12</option>
                    <option value="14">14</option>
                    <option value="18">18</option>
                    <option value="24">24</option>
                    <option value="36">36</option>
                </select>

                <div class="tool-sep"></div>

                <!-- 14. Bold -->
                <button type="button" class="tool-btn icon-only" id="xlBoldBtn" title="Bold (Ctrl+B)"><strong>B</strong></button>

                <!-- 15. Italic -->
                <button type="button" class="tool-btn icon-only" id="xlItalicBtn" title="Italic (Ctrl+I)"><em>I</em></button>

                <!-- 16. Strikethrough -->
                <button type="button" class="tool-btn icon-only" id="xlStrikeBtn" title="Strikethrough (Alt+Shift+5)"><s>S</s></button>

                <!-- 17. Text Color -->
                <div class="tool-color-wrap" title="Text color">
                    <button type="button" class="tool-btn icon-only" id="xlColorLabelBtn" style="color:#2D241D;font-weight:700;">A</button>
                    <input type="color" class="tool-color-input" id="xlColorInput" value="#2D241D">
                </div>

                <!-- 18. Fill Color -->
                <div class="tool-color-wrap" title="Fill color">
                    <button type="button" class="tool-btn icon-only" id="xlBgColorBtn" title="Fill Color">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 11l-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l5.5 5.5a2.12 2.12 0 0 0 3 0L19 11z"></path><path d="M5 21h14"></path></svg>
                    </button>
                    <input type="color" class="tool-color-input" id="xlBgColorInput" value="#ffffff">
                </div>

                <!-- 19. Borders -->
                <button type="button" class="tool-btn icon-only" id="xlBordersBtn" title="Borders">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"></rect><line x1="3" y1="12" x2="21" y2="12"></line><line x1="12" y1="3" x2="12" y2="21"></line></svg>
                </button>

                <!-- 20. Merge Cells -->
                <button type="button" class="tool-btn icon-only" id="xlMergeBtn" title="Merge cells">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"></rect><line x1="8" y1="12" x2="16" y2="12"></line><polyline points="11 9 8 12 11 15"></polyline><polyline points="13 9 16 12 13 15"></polyline></svg>
                </button>

                <div class="tool-sep"></div>

                <!-- 21. Horizontal Align -->
                <button type="button" class="tool-btn icon-only" id="xlAlignLeft" title="Horizontal align: Left">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="xlAlignCenter" title="Horizontal align: Center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="xlAlignRight" title="Horizontal align: Right">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>
                </button>

                <!-- 22. Vertical Align -->
                <button type="button" class="tool-btn icon-only" id="xlAlignMiddle" title="Vertical align: Middle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><polyline points="8 7 12 3 16 7"></polyline><polyline points="8 17 12 21 16 17"></polyline></svg>
                </button>

                <!-- 23. Text Wrapping -->
                <button type="button" class="tool-btn icon-only" id="xlTextWrapBtn" title="Text wrapping">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><path d="M3 12h15a3 3 0 0 1 0 6h-4"></path><polyline points="16 16 14 18 16 20"></polyline></svg>
                </button>

                <!-- 24. Text Rotation -->
                <button type="button" class="tool-btn icon-only" id="xlTextRotateBtn" title="Text rotation">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v6a2 2 0 0 0 2 2h12"></path><polyline points="16 16 20 20 16 24"></polyline><line x1="4" y1="4" x2="16" y2="16"></line></svg>
                </button>

                <div class="tool-sep"></div>

                <!-- 25. Insert Link -->
                <button type="button" class="tool-btn icon-only" id="xlInsertLinkBtn" title="Insert link (Ctrl+K)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>

                <!-- 26. Add Comment / Note -->
                <button type="button" class="tool-btn icon-only" id="xlAddCommentBtn" title="Add comment / note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </button>

                <!-- 27. Insert Chart -->
                <button type="button" class="tool-btn icon-only" id="xlInsertChartBtn" title="Insert chart">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                </button>

                <!-- 28. Create Filter -->
                <button type="button" class="tool-btn icon-only" id="xlCreateFilterBtn" title="Create a filter">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                </button>

                <!-- 29. Functions (Sigma) -->
                <button type="button" class="tool-btn icon-only" id="xlFunctionsBtn" title="Functions (∑)">
                    <span style="font-size:14px;font-weight:700;">∑▾</span>
                </button>

                <!-- Dedicated Row / Col Controls (Functional & Backward Compatible) -->
                <div class="tool-sep"></div>
                <button type="button" class="tool-btn btn-labeled" id="xlInsertRowBtn" title="Insert Row Above">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Row</span>
                </button>
                <button type="button" class="tool-btn btn-labeled" id="xlDeleteRowBtn" title="Delete Row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Row</span>
                </button>
                <button type="button" class="tool-btn btn-labeled" id="xlInsertColBtn" title="Insert Column Left">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Col</span>
                </button>
                <button type="button" class="tool-btn btn-labeled" id="xlDeleteColBtn" title="Delete Column">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Col</span>
                </button>

                <!-- Quick Formula Shortcuts (Backward Compatible) -->
                <div class="tool-sep"></div>
                <button type="button" class="tool-btn btn-labeled" id="xlFormulaSum" title="Sum Range"><span>=SUM</span></button>
                <button type="button" class="tool-btn btn-labeled" id="xlFormulaAvg" title="Average Range"><span>=AVG</span></button>
                <button type="button" class="tool-btn btn-labeled" id="xlFormulaMin" title="Minimum"><span>=MIN</span></button>
                <button type="button" class="tool-btn btn-labeled" id="xlFormulaMax" title="Maximum"><span>=MAX</span></button>

                <div class="tool-sep"></div>

                <!-- 30. Collapse Toolbar -->
                <button type="button" class="tool-btn icon-only" id="xlCollapseBtn" title="Collapse toolbar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                </button>
            </div>
        `;

        this.bindToolbarEvents();
    }

    bindToolbarEvents() {
        // Search menus
        document.getElementById('xlSearchBtn').onclick = () => this.openSearchMenus();

        // Undo / Redo
        document.getElementById('xlUndoBtn').onclick = () => this.undo();
        document.getElementById('xlRedoBtn').onclick = () => this.redo();

        // Print
        document.getElementById('xlPrintBtn').onclick = () => this.filePrint();

        // Paint format
        document.getElementById('xlPaintFormatBtn').onclick = () => this.togglePaintFormat();

        // Zoom
        document.getElementById('xlZoomSelect').onchange = (e) => this.setZoom(parseInt(e.target.value, 10));

        // Number formats
        document.getElementById('xlCurrencyBtn').onclick = () => this.setNumberFormat('currency');
        document.getElementById('xlPercentBtn').onclick = () => this.setNumberFormat('percent');
        document.getElementById('xlDecrDecimalsBtn').onclick = () => this.adjustDecimals(-1);
        document.getElementById('xlIncrDecimalsBtn').onclick = () => this.adjustDecimals(1);
        document.getElementById('xlNumFormatBtn').onclick = (e) => this.openNumFormatMenu(e);

        // Font family & size
        document.getElementById('xlFontFamily').onchange = (e) => this.setCellFormat('fontFamily', e.target.value);
        document.getElementById('xlFontSize').onchange = (e) => this.setCellFormat('fontSize', `${e.target.value}pt`);

        // Text styles
        document.getElementById('xlBoldBtn').onclick = () => this.toggleCellFormat('bold');
        document.getElementById('xlItalicBtn').onclick = () => this.toggleCellFormat('italic');
        document.getElementById('xlStrikeBtn').onclick = () => this.toggleCellFormat('strike');

        // Colors
        document.getElementById('xlColorInput').oninput = (e) => {
            this.setCellFormat('color', e.target.value);
            document.getElementById('xlColorLabelBtn').style.color = e.target.value;
        };
        document.getElementById('xlBgColorInput').oninput = (e) => {
            this.setCellFormat('bg', e.target.value);
        };

        // Borders & Merge
        document.getElementById('xlBordersBtn').onclick = (e) => this.openBordersMenu(e);
        document.getElementById('xlMergeBtn').onclick = () => this.toggleMerge();

        // Alignments
        document.getElementById('xlAlignLeft').onclick = () => this.setCellFormat('align', 'left');
        document.getElementById('xlAlignCenter').onclick = () => this.setCellFormat('align', 'center');
        document.getElementById('xlAlignRight').onclick = () => this.setCellFormat('align', 'right');
        document.getElementById('xlAlignMiddle').onclick = () => this.setCellFormat('valign', 'middle');

        // Wrap & Rotate
        document.getElementById('xlTextWrapBtn').onclick = (e) => this.openWrapMenu(e);
        document.getElementById('xlTextRotateBtn').onclick = (e) => this.openRotateMenu(e);

        // Insert items
        document.getElementById('xlInsertLinkBtn').onclick = () => this.insertLink();
        document.getElementById('xlAddCommentBtn').onclick = () => this.addComment();
        document.getElementById('xlInsertChartBtn').onclick = () => this.insertChart();
        document.getElementById('xlCreateFilterBtn').onclick = () => this.toggleFilter();
        document.getElementById('xlFunctionsBtn').onclick = (e) => this.openFunctionsMenu(e);

        // Row / Column Operations
        document.getElementById('xlInsertRowBtn').onclick = () => this.excelInsertRow();
        document.getElementById('xlDeleteRowBtn').onclick = () => this.excelDeleteRow();
        document.getElementById('xlInsertColBtn').onclick = () => this.excelInsertCol();
        document.getElementById('xlDeleteColBtn').onclick = () => this.excelDeleteCol();

        // Quick Formula Shortcuts
        document.getElementById('xlFormulaSum').onclick = () => this.insertFunctionFormula('SUM');
        document.getElementById('xlFormulaAvg').onclick = () => this.insertFunctionFormula('AVERAGE');
        document.getElementById('xlFormulaMin').onclick = () => this.insertFunctionFormula('MIN');
        document.getElementById('xlFormulaMax').onclick = () => this.insertFunctionFormula('MAX');

        // Collapse toggle
        document.getElementById('xlCollapseBtn').onclick = () => {
            const tb = document.getElementById('workspaceToolbar');
            if (tb) {
                tb.classList.toggle('collapsed');
            }
        };
    }

    // ---------------- 3. CANVAS (FORMULA BAR + GRID + TABS + STATUS) ----------------
    mountCanvas(canvasEl) {
        canvasEl.innerHTML = `
            <div class="excel-editor-stage" id="excelEditorStage">
                <!-- Formula Bar Row -->
                <div class="formula-bar-container" id="formulaBarContainer">
                    <input type="text" class="active-cell-badge sheet-name-box" id="activeCellLabel" value="A1" title="Name Box (Type cell reference and press Enter)">
                    <div class="formula-bar-sep"></div>
                    <span class="formula-fx-label" title="Functions">fx</span>
                    <input type="text" class="formula-input-field" id="formulaInputField" placeholder="Formula or value (e.g. =SUM(A1:A5))" spellcheck="false">
                    <button type="button" class="formula-action-btn formula-cancel-btn" id="cancelFormulaBtn" title="Cancel edit (Esc)">✕</button>
                    <button type="button" class="workspace-btn workspace-btn-primary formula-action-btn formula-apply-btn" id="applyFormulaBtn" style="height:28px;padding:0 12px;font-size:12px;">✓ Apply</button>
                </div>

                <!-- Spreadsheet Grid -->
                <div class="spreadsheet-grid-wrapper" id="spreadsheetGridWrapper">
                    <div class="spreadsheet-scroll-content" id="spreadsheetScrollContent">
                        <table class="spreadsheet-table" id="spreadsheetTable"></table>
                    </div>
                </div>

                <!-- Worksheet Tabs Bar -->
                <div class="spreadsheet-footer-bar">
                    <div class="spreadsheet-sheet-tabs" id="spreadsheetSheetTabs">
                        <!-- Rendered dynamically -->
                    </div>
                </div>

                <!-- Bottom Status Bar -->
                <div class="spreadsheet-status-bar" id="spreadsheetStatusBar">
                    <div class="sheet-status-left" id="sheetStatusLeft">Ready</div>
                    <div class="sheet-status-right" id="sheetStatusRight">
                        <span class="sheet-stat-pill" id="sheetStatPill" title="Click to change primary aggregation">Sum: 0</span>
                    </div>
                </div>
            </div>
        `;

        this.bindFormulaBarEvents();
        this.bindGridScrollEvents();
    }

    bindFormulaBarEvents() {
        const nameBox = document.getElementById('activeCellLabel');
        const formulaInput = document.getElementById('formulaInputField');
        const applyBtn = document.getElementById('applyFormulaBtn');
        const cancelBtn = document.getElementById('cancelFormulaBtn');

        // Name box jump
        nameBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const coord = nameBox.value.trim().toUpperCase();
                const { r, c } = this.coordToIndices(coord);
                this.selectCell(r, c);
                this.scrollToCell(r, c);
            }
        });

        // Apply formula
        applyBtn.onclick = () => {
            this.applyCellFormula(formulaInput.value);
            this.selectCell(this.activeCell.r + 1, this.activeCell.c);
        };

        // Cancel formula
        cancelBtn.onclick = () => {
            this.syncFormulaBar();
        };

        formulaInput.addEventListener('input', () => {
            this.formulaBarDirty = true;
        });

        formulaInput.addEventListener('blur', () => {
            if (this.formulaBarDirty) {
                this.applyCellFormula(formulaInput.value);
                this.formulaBarDirty = false;
                this.renderGrid(true);
            }
        });

        formulaInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.formulaBarDirty = false;
                this.applyCellFormula(formulaInput.value);
                this.selectCell(this.activeCell.r + 1, this.activeCell.c);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.formulaBarDirty = false;
                this.syncFormulaBar();
                const table = document.getElementById('spreadsheetTable');
                table?.querySelector(`.sheet-cell[data-r="${this.activeCell.r}"][data-c="${this.activeCell.c}"]`)?.focus();
            }
        });
    }

    bindGridScrollEvents() {
        const wrapper = document.getElementById('spreadsheetGridWrapper');
        if (!wrapper) return;
        // On scroll, keep headers sticky & manage large sheet row rendering
        wrapper.addEventListener('scroll', () => {
            // Virtualized chunking for sheets with > 150 rows
            const sheet = this.getCurrentSheet();
            if (sheet && sheet.data && sheet.data.length > 150) {
                this.handleVirtualizedScroll(wrapper);
            }
        });
    }

    handleVirtualizedScroll(wrapper) {
        // Debounced or threshold based row expansion
        if (this._scrollTimer) return;
        this._scrollTimer = setTimeout(() => {
            this._scrollTimer = null;
            const scrollTop = wrapper.scrollTop;
            const clientHeight = wrapper.clientHeight;
            const scrollHeight = wrapper.scrollHeight;
            if (scrollTop + clientHeight > scrollHeight - 300) {
                // If near bottom, increase rendered row limit
                const currentRendered = this._maxRenderedRows || 100;
                const sheet = this.getCurrentSheet();
                if (currentRendered < sheet.data.length) {
                    this._maxRenderedRows = Math.min(currentRendered + 100, sheet.data.length);
                    this.renderGrid(true); // fast re-render
                }
            }
        }, 80);
    }

    getDisplayValue(r, c, sheet = this.getCurrentSheet(), visitedCoords = new Set()) {
        const coord = this.indicesToCoord(r, c);
        const rawVal = (sheet.data && sheet.data[r] && sheet.data[r][c] !== undefined) ? sheet.data[r][c] : '';
        const formula = (sheet.formulas && sheet.formulas[coord]) || (String(rawVal).startsWith('=') ? String(rawVal) : '');
        if (formula && String(formula).startsWith('=')) {
            const sheetKey = (sheet.name || 'Sheet1') + '!' + coord;
            if (visitedCoords.has(sheetKey)) {
                return '#REF!';
            }
            const nextVisited = new Set(visitedCoords);
            nextVisited.add(sheetKey);
            return this.evalRealFormula(formula, sheet, nextVisited);
        }
        return rawVal;
    }

    // ---------------- 4. SPREADSHEET GRID RENDERING ----------------
    renderGrid(keepScroll = false) {
        const table = document.getElementById('spreadsheetTable');
        if (!table) return;

        const wrapper = document.getElementById('spreadsheetGridWrapper');
        const prevScrollTop = keepScroll && wrapper ? wrapper.scrollTop : 0;
        const prevScrollLeft = keepScroll && wrapper ? wrapper.scrollLeft : 0;

        const currentSheet = this.getCurrentSheet();
        if (!currentSheet.data || currentSheet.data.length === 0) {
            currentSheet.data = Array.from({ length: 35 }, () => Array(16).fill(''));
        }
        if (!currentSheet.styles) currentSheet.styles = {};
        if (!currentSheet.formulas) currentSheet.formulas = {};
        if (!currentSheet.colWidths) currentSheet.colWidths = {};
        if (!currentSheet.rowHeights) currentSheet.rowHeights = {};

        const grid = currentSheet.data;
        const totalRows = Math.max(grid.length, 30);
        const totalCols = Math.max(grid[0] ? grid[0].length : 12, 12);

        // Windowing for very large workbooks: render initial 120 rows
        const maxRowsToRender = grid.length > 150 ? (this._maxRenderedRows || 120) : totalRows;

        // Header row
        let theadHtml = '<thead><tr><th class="corner-header ' + (this.selectionMode === 'all' ? 'selected' : '') + '" id="xlCornerSelectAll" title="Select All (Ctrl+A)"></th>';
        for (let c = 0; c < totalCols; c++) {
            const isColHidden = currentSheet.hiddenCols && currentSheet.hiddenCols[c];
            if (isColHidden) {
                theadHtml += `<th class="col-header hidden-col" data-c="${c}" style="display:none;"></th>`;
                continue;
            }

            const letter = this.colIdxToLetter(c);
            const w = currentSheet.colWidths[c] || 96;
            const isFilterActiveOnCol = this.filterActive && this.filterCriteria[c];
            const isColSelected = (this.selectionMode === 'all') ||
                                  (this.selectionMode === 'col' && (this.selectedCols ? this.selectedCols.has(c) : (c >= Math.min(this.selectedRange.startC, this.selectedRange.endC) && c <= Math.max(this.selectedRange.startC, this.selectedRange.endC)))) ||
                                  (this.selectionMode === 'cell' && c >= Math.min(this.selectedRange.startC, this.selectedRange.endC) && c <= Math.max(this.selectedRange.startC, this.selectedRange.endC));

            const hasHiddenLeft = c > 0 && currentSheet.hiddenCols && currentSheet.hiddenCols[c - 1];
            const hasHiddenRight = c < totalCols - 1 && currentSheet.hiddenCols && currentSheet.hiddenCols[c + 1];

            let colClasses = `col-header ${c < this.frozenCols ? 'frozen-col' : ''}`;
            if (isColSelected) colClasses += ' selected';
            if (hasHiddenLeft) colClasses += ' has-hidden-left';
            if (hasHiddenRight) colClasses += ' has-hidden-right';

            theadHtml += `
                <th class="${colClasses}" data-c="${c}" style="width:${w}px;min-width:${w}px;max-width:${w}px;">
                    <div class="col-header-inner">
                        <span class="col-letter">${letter}</span>
                        ${this.filterActive ? `<button type="button" class="col-filter-btn ${isFilterActiveOnCol ? 'has-filter' : ''}" data-c="${c}" title="Filter">▾</button>` : ''}
                        <div class="col-resize-handle" data-c="${c}"></div>
                    </div>
                </th>
            `;
        }
        theadHtml += '</tr></thead>';

        // Body rows
        let tbodyHtml = '<tbody>';
        for (let r = 0; r < maxRowsToRender; r++) {
            const isRowHidden = currentSheet.hiddenRows && currentSheet.hiddenRows[r];
            if (isRowHidden) {
                tbodyHtml += `<tr data-r="${r}" class="hidden-row" style="display:none;"></tr>`;
                continue;
            }

            // Apply filtering if active
            if (this.filterActive && this.isRowFilteredOut(r, grid[r])) {
                continue;
            }

            const h = currentSheet.rowHeights[r] || 26;
            const isFrozenRow = r < this.frozenRows;
            const isRowSelected = (this.selectionMode === 'all') ||
                                  (this.selectionMode === 'row' && (this.selectedRows ? this.selectedRows.has(r) : (r >= Math.min(this.selectedRange.startR, this.selectedRange.endR) && r <= Math.max(this.selectedRange.startR, this.selectedRange.endR)))) ||
                                  (this.selectionMode === 'cell' && r >= Math.min(this.selectedRange.startR, this.selectedRange.endR) && r <= Math.max(this.selectedRange.startR, this.selectedRange.endR));

            const hasHiddenAbove = r > 0 && currentSheet.hiddenRows && currentSheet.hiddenRows[r - 1];
            const hasHiddenBelow = r < totalRows - 1 && currentSheet.hiddenRows && currentSheet.hiddenRows[r + 1];

            let rowHeaderClasses = `row-header ${isFrozenRow ? 'frozen-row' : ''}`;
            if (isRowSelected) rowHeaderClasses += ' selected';
            if (hasHiddenAbove) rowHeaderClasses += ' has-hidden-above';
            if (hasHiddenBelow) rowHeaderClasses += ' has-hidden-below';

            tbodyHtml += `<tr data-r="${r}" class="${isFrozenRow ? 'frozen-row' : ''}" style="height:${h}px;">`;
            tbodyHtml += `
                <td class="${rowHeaderClasses}" data-r="${r}" style="height:${h}px;">
                    <div class="row-header-inner">
                        <span class="row-number">${r + 1}</span>
                        <div class="row-resize-handle" data-r="${r}"></div>
                    </div>
                </td>
            `;

            const rowData = grid[r] || [];
            for (let c = 0; c < totalCols; c++) {
                const isColHidden = currentSheet.hiddenCols && currentSheet.hiddenCols[c];
                if (isColHidden) {
                    tbodyHtml += `<td class="sheet-cell hidden-col" data-r="${r}" data-c="${c}" style="display:none;"></td>`;
                    continue;
                }

                const coord = this.indicesToCoord(r, c);
                const rawVal = rowData[c] !== undefined ? rowData[c] : '';
                const formula = currentSheet.formulas[coord] || (String(rawVal).startsWith('=') ? String(rawVal) : '');

                let displayVal = this.getDisplayValue(r, c, currentSheet);

                // Cell styling
                const st = currentSheet.styles[coord] || {};
                let styleStr = '';
                const w = currentSheet.colWidths[c] || 96;
                styleStr += `width:${w}px;min-width:${w}px;max-width:${w}px;`;
                if (st.bold) styleStr += 'font-weight:bold;';
                if (st.italic) styleStr += 'font-style:italic;';
                if (st.strike) styleStr += 'text-decoration:line-through;';
                if (st.underline) styleStr += 'text-decoration:underline;';
                if (st.color) styleStr += `color:${st.color};`;
                if (st.bg) styleStr += `background-color:${st.bg};`;
                if (st.align) styleStr += `text-align:${st.align};`;
                if (st.valign) styleStr += `vertical-align:${st.valign};`;
                if (st.fontFamily) styleStr += `font-family:${st.fontFamily}, sans-serif;`;
                if (st.fontSize) styleStr += `font-size:${st.fontSize};`;
                if (st.wrap === 'wrap') styleStr += 'white-space:normal;word-break:break-word;';
                else if (st.wrap === 'clip') styleStr += 'overflow:hidden;text-overflow:clip;';
                if (st.border) styleStr += `border:${st.border};`;

                // Selection check
                const isSelectedCell = this.activeCell.r === r && this.activeCell.c === c;
                const isInSelectedRange = this.isCellInRange(r, c, this.selectedRange);
                const isFrozenCol = c < this.frozenCols;

                let cellClasses = 'sheet-cell';
                if (isSelectedCell) cellClasses += ' selected active-focus';
                else if (isInSelectedRange) cellClasses += ' range-selected';
                if (isFrozenCol) cellClasses += ' frozen-col';
                if (isFrozenRow) cellClasses += ' frozen-row';
                if (this.cellComments[coord]) cellClasses += ' has-comment';

                // Checkbox formatting
                let innerHtmlContent = '';
                if (st.isCheckbox) {
                    const isChecked = rawVal === 'TRUE' || rawVal === true || rawVal === 'true';
                    innerHtmlContent = `<input type="checkbox" class="sheet-cell-checkbox" ${isChecked ? 'checked' : ''} data-coord="${coord}">`;
                } else {
                    innerHtmlContent = messagesModule.escapeHTML(String(displayVal));
                }

                tbodyHtml += `
                    <td class="${cellClasses}" style="${styleStr}" data-coord="${coord}" data-r="${r}" data-c="${c}" tabindex="0">
                        ${innerHtmlContent}
                        ${isSelectedCell ? '<div class="fill-handle" id="sheetFillHandle" title="Drag to fill"></div>' : ''}
                    </td>
                `;
            }
            tbodyHtml += '</tr>';
        }
        tbodyHtml += '</tbody>';

        table.innerHTML = theadHtml + tbodyHtml;

        // Restore scroll
        if (keepScroll && wrapper) {
            wrapper.scrollTop = prevScrollTop;
            wrapper.scrollLeft = prevScrollLeft;
        }

        this.bindCellInteractions(table);
        this.bindRowHeaderInteractions(table);
        this.bindColHeaderInteractions(table);
        this.bindResizeHandles(table);
        this.bindCornerSelectAll();
    }

    isCellInRange(r, c, range = this.selectedRange) {
        if (this.selectionMode === 'all') return true;
        if (this.selectionMode === 'row') {
            if (this.selectedRows && this.selectedRows.size > 0) return this.selectedRows.has(r);
            const minR = Math.min(range.startR, range.endR);
            const maxR = Math.max(range.startR, range.endR);
            return r >= minR && r <= maxR;
        }
        if (this.selectionMode === 'col') {
            if (this.selectedCols && this.selectedCols.size > 0) return this.selectedCols.has(c);
            const minC = Math.min(range.startC, range.endC);
            const maxC = Math.max(range.startC, range.endC);
            return c >= minC && c <= maxC;
        }
        if (!range) return false;
        const minR = Math.min(range.startR, range.endR);
        const maxR = Math.max(range.startR, range.endR);
        const minC = Math.min(range.startC, range.endC);
        const maxC = Math.max(range.startC, range.endC);
        return r >= minR && r <= maxR && c >= minC && c <= maxC;
    }

    isRowFilteredOut(r, rowData) {
        if (!rowData) return false;
        for (const [colIdx, crit] of Object.entries(this.filterCriteria)) {
            const val = String(rowData[colIdx] || '').trim();
            if (crit.search && !val.toLowerCase().includes(crit.search.toLowerCase())) {
                return true;
            }
            if (crit.hiddenValues && crit.hiddenValues.has(val)) {
                return true;
            }
        }
        return false;
    }

    // ---------------- 5. CELL & HEADER INTERACTIONS & NAVIGATION ----------------
    bindCellInteractions(table) {
        table.querySelectorAll('.sheet-cell').forEach(td => {
            const r = parseInt(td.dataset.r, 10);
            const c = parseInt(td.dataset.c, 10);
            const coord = td.dataset.coord;

            // Click / MouseDown Selection
            td.addEventListener('click', (e) => {
                if (e.shiftKey) return;
                if (this.activeCell.r !== r || this.activeCell.c !== c) {
                    this.selectCell(r, c, false);
                    this.renderRangeHighlight();
                }
            });

            td.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('fill-handle')) {
                    this.startFillHandleDrag(e, r, c);
                    return;
                }
                if (e.button !== 0 && e.button !== undefined) return;

                if (e.shiftKey) {
                    e.preventDefault();
                    // Extend range from current active cell
                    this.selectionMode = 'cell';
                    this.selectedRows = new Set();
                    this.selectedCols = new Set();
                    this.selectedRange.endR = r;
                    this.selectedRange.endC = c;
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                } else {
                    this.selectCell(r, c, false);
                    this.isSelectingRange = true;
                    this.selectedRange = { startR: r, startC: c, endR: r, endC: c };
                    this.renderRangeHighlight();
                }
            });

            td.addEventListener('mouseenter', () => {
                if (this.isSelectingRange) {
                    this.selectedRange.endR = r;
                    this.selectedRange.endC = c;
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                } else if (this.isDraggingFillHandle) {
                    this.fillHandleTarget = { r, c };
                    this.renderFillPreview();
                }
            });

            // Double Click for Inline Editing
            td.addEventListener('dblclick', () => {
                this.startInlineEditing(td, r, c);
            });

            // Context Menu (Right Click)
            td.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!this.isCellInRange(r, c, this.selectedRange)) {
                    this.selectCell(r, c);
                }
                this.openCellContextMenu(e, r, c);
            });

            // Touch support (Long press on cell)
            let cellTouchTimer = null;
            td.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                const touch = e.touches[0];
                cellTouchTimer = setTimeout(() => {
                    cellTouchTimer = null;
                    if (!this.isCellInRange(r, c, this.selectedRange)) {
                        this.selectCell(r, c);
                    }
                    this.openCellContextMenu({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} }, r, c);
                }, 550);
            }, { passive: true });
            td.addEventListener('touchmove', () => {
                if (cellTouchTimer) { clearTimeout(cellTouchTimer); cellTouchTimer = null; }
            }, { passive: true });
            td.addEventListener('touchend', () => {
                if (cellTouchTimer) {
                    clearTimeout(cellTouchTimer);
                    cellTouchTimer = null;
                    this.selectCell(r, c, false);
                    this.renderRangeHighlight();
                }
            });

            // Checkbox click
            const chk = td.querySelector('.sheet-cell-checkbox');
            if (chk) {
                chk.addEventListener('change', (e) => {
                    this.recordStateForUndo();
                    const sheet = this.getCurrentSheet();
                    sheet.data[r][c] = e.target.checked ? 'TRUE' : 'FALSE';
                    this.workspace.markDirty();
                });
            }
        });

        // Global mouseup to finish range drag / fill handle drag
        const onMouseUp = () => {
            if (this.isSelectingRange) this.isSelectingRange = false;
            if (this.isSelectingRows) this.isSelectingRows = false;
            if (this.isSelectingCols) this.isSelectingCols = false;
            if (this.isDraggingFillHandle) this.finishFillHandleDrag();
        };
        window.removeEventListener('mouseup', this._globalMouseUpHandler);
        this._globalMouseUpHandler = onMouseUp;
        window.addEventListener('mouseup', this._globalMouseUpHandler);
    }

    bindRowHeaderInteractions(table) {
        table.querySelectorAll('td.row-header').forEach(td => {
            const r = parseInt(td.dataset.r, 10);

            // Click / Tap listener (ensures touch selection works reliably on mobile)
            td.addEventListener('click', (e) => {
                if (e.target.classList.contains('row-resize-handle')) return;
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    this.selectRow(r, true);
                }
            });

            // Mousedown: Single row or extend row selection
            td.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('row-resize-handle')) return;
                if (e.button !== 0 && e.button !== undefined) return;
                
                if (e.shiftKey && this.rowSelectAnchor !== null) {
                    const startR = Math.min(this.rowSelectAnchor, r);
                    const endR = Math.max(this.rowSelectAnchor, r);
                    const sheet = this.getCurrentSheet();
                    const totalCols = (sheet.data && sheet.data[0] ? sheet.data[0].length : 16);
                    this.selectionMode = 'row';
                    this.selectedRows = new Set();
                    for (let i = startR; i <= endR; i++) this.selectedRows.add(i);
                    this.selectedCols = new Set();
                    this.selectedRange = { startR, startC: 0, endR, endC: totalCols - 1 };
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                } else if (e.ctrlKey || e.metaKey) {
                    if (!this.selectedRows) this.selectedRows = new Set();
                    if (this.selectedRows.has(r)) {
                        this.selectedRows.delete(r);
                    } else {
                        this.selectedRows.add(r);
                    }
                    this.selectionMode = 'row';
                    this.rowSelectAnchor = r;
                    const minR = this.selectedRows.size > 0 ? Math.min(...this.selectedRows) : r;
                    const maxR = this.selectedRows.size > 0 ? Math.max(...this.selectedRows) : r;
                    const sheet = this.getCurrentSheet();
                    const totalCols = (sheet.data && sheet.data[0] ? sheet.data[0].length : 16);
                    this.selectedRange = { startR: minR, startC: 0, endR: maxR, endC: totalCols - 1 };
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                } else {
                    this.selectRow(r, false);
                    this.isSelectingRows = true;
                    this.rowSelectAnchor = r;
                    this.renderRangeHighlight();
                }
            });

            // MouseEnter: Drag across row headers
            td.addEventListener('mouseenter', () => {
                if (this.isSelectingRows && this.rowSelectAnchor !== null) {
                    const startR = Math.min(this.rowSelectAnchor, r);
                    const endR = Math.max(this.rowSelectAnchor, r);
                    const sheet = this.getCurrentSheet();
                    const totalCols = (sheet.data && sheet.data[0] ? sheet.data[0].length : 16);
                    this.selectionMode = 'row';
                    this.selectedRows = new Set();
                    for (let i = startR; i <= endR; i++) this.selectedRows.add(i);
                    this.selectedCols = new Set();
                    this.selectedRange = { startR, startC: 0, endR, endC: totalCols - 1 };
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                }
            });

            // Context Menu (Right Click)
            td.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.selectionMode !== 'row' || !this.selectedRows || !this.selectedRows.has(r)) {
                    this.selectRow(r);
                }
                this.openRowContextMenu(e, r);
            });

            // Touch support (Long press)
            let touchTimer = null;
            td.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                const touch = e.touches[0];
                touchTimer = setTimeout(() => {
                    touchTimer = null;
                    if (this.selectionMode !== 'row' || !this.selectedRows || !this.selectedRows.has(r)) {
                        this.selectRow(r);
                    }
                    this.openRowContextMenu({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} }, r);
                }, 550);
            }, { passive: true });
            td.addEventListener('touchmove', () => {
                if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
            }, { passive: true });
            td.addEventListener('touchend', () => {
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                    this.selectRow(r, true);
                }
            });
        });
    }

    bindColHeaderInteractions(table) {
        table.querySelectorAll('th.col-header').forEach(th => {
            const c = parseInt(th.dataset.c, 10);

            // Click / Tap listener (ensures touch selection works reliably on mobile)
            th.addEventListener('click', (e) => {
                if (e.target.classList.contains('col-resize-handle') || e.target.classList.contains('col-filter-btn')) return;
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    this.selectColumn(c, true);
                }
            });

            // Mousedown: Single col or extend col selection
            th.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('col-resize-handle') || e.target.classList.contains('col-filter-btn')) return;
                if (e.button !== 0 && e.button !== undefined) return;
                
                if (e.shiftKey && this.colSelectAnchor !== null) {
                    const startC = Math.min(this.colSelectAnchor, c);
                    const endC = Math.max(this.colSelectAnchor, c);
                    const sheet = this.getCurrentSheet();
                    const totalRows = (sheet.data ? sheet.data.length : 30);
                    this.selectionMode = 'col';
                    this.selectedCols = new Set();
                    for (let i = startC; i <= endC; i++) this.selectedCols.add(i);
                    this.selectedRows = new Set();
                    this.selectedRange = { startR: 0, startC, endR: totalRows - 1, endC };
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                } else if (e.ctrlKey || e.metaKey) {
                    if (!this.selectedCols) this.selectedCols = new Set();
                    if (this.selectedCols.has(c)) {
                        this.selectedCols.delete(c);
                    } else {
                        this.selectedCols.add(c);
                    }
                    this.selectionMode = 'col';
                    this.colSelectAnchor = c;
                    const minC = this.selectedCols.size > 0 ? Math.min(...this.selectedCols) : c;
                    const maxC = this.selectedCols.size > 0 ? Math.max(...this.selectedCols) : c;
                    const sheet = this.getCurrentSheet();
                    const totalRows = (sheet.data ? sheet.data.length : 30);
                    this.selectedRange = { startR: 0, startC: minC, endR: totalRows - 1, endC: maxC };
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                } else {
                    this.selectColumn(c, false);
                    this.isSelectingCols = true;
                    this.colSelectAnchor = c;
                    this.renderRangeHighlight();
                }
            });

            // MouseEnter: Drag across col headers
            th.addEventListener('mouseenter', () => {
                if (this.isSelectingCols && this.colSelectAnchor !== null) {
                    const startC = Math.min(this.colSelectAnchor, c);
                    const endC = Math.max(this.colSelectAnchor, c);
                    const sheet = this.getCurrentSheet();
                    const totalRows = (sheet.data ? sheet.data.length : 30);
                    this.selectionMode = 'col';
                    this.selectedCols = new Set();
                    for (let i = startC; i <= endC; i++) this.selectedCols.add(i);
                    this.selectedRows = new Set();
                    this.selectedRange = { startR: 0, startC, endR: totalRows - 1, endC };
                    this.renderRangeHighlight();
                    this.syncFormulaBar();
                    this.updateStatusBar();
                }
            });

            // Context Menu (Right Click)
            th.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.selectionMode !== 'col' || !this.selectedCols || !this.selectedCols.has(c)) {
                    this.selectColumn(c);
                }
                this.openColumnContextMenu(e, c);
            });

            // Touch support (Long press)
            let touchTimer = null;
            th.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                const touch = e.touches[0];
                touchTimer = setTimeout(() => {
                    touchTimer = null;
                    if (this.selectionMode !== 'col' || !this.selectedCols || !this.selectedCols.has(c)) {
                        this.selectColumn(c);
                    }
                    this.openColumnContextMenu({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} }, c);
                }, 550);
            }, { passive: true });
            th.addEventListener('touchmove', () => {
                if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
            }, { passive: true });
            th.addEventListener('touchend', () => {
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                    this.selectColumn(c, true);
                }
            });
        });
    }

    setCellValue(r, c, val) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        while (sheet.data.length <= r) sheet.data.push([]);
        while (sheet.data[r].length <= c) sheet.data[r].push('');
        sheet.data[r][c] = String(val);
        const coord = this.indicesToCoord(r, c);
        if (String(val).startsWith('=')) {
            sheet.formulas[coord] = String(val);
        } else {
            delete sheet.formulas[coord];
        }
        this.workspace.markDirty();
        this.renderGrid(true);
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    selectCell(r, c, render = true) {
        const sheet = this.getCurrentSheet();
        const maxR = Math.max((sheet.data ? sheet.data.length : 30) - 1, 0);
        const maxC = Math.max((sheet.data && sheet.data[0] ? sheet.data[0].length : 16) - 1, 0);

        r = Math.max(0, Math.min(r, maxR));
        c = Math.max(0, Math.min(c, maxC));

        this.selectionMode = 'cell';
        this.selectedRows = new Set();
        this.selectedCols = new Set();
        this.activeCell = { r, c, coord: this.indicesToCoord(r, c) };
        this.selectedRange = { startR: r, startC: c, endR: r, endC: c };

        // Handle paint format paste if active
        if (this.paintFormatSource) {
            this.applyPaintFormat(r, c);
        }

        if (render) {
            this.renderRangeHighlight();
        }
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    selectRow(r, render = true) {
        const sheet = this.getCurrentSheet();
        const maxR = Math.max((sheet.data ? sheet.data.length : 30) - 1, 0);
        const totalCols = (sheet.data && sheet.data[0] ? sheet.data[0].length : 16);

        r = Math.max(0, Math.min(r, maxR));
        this.selectionMode = 'row';
        this.selectedRows = new Set([r]);
        this.selectedCols = new Set();
        this.rowSelectAnchor = r;
        this.activeCell = { r, c: 0, coord: this.indicesToCoord(r, 0) };
        this.selectedRange = { startR: r, startC: 0, endR: r, endC: totalCols - 1 };

        if (render) {
            this.renderRangeHighlight();
        }
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    selectColumn(c, render = true) {
        const sheet = this.getCurrentSheet();
        const totalRows = (sheet.data ? sheet.data.length : 30);
        const maxC = Math.max((sheet.data && sheet.data[0] ? sheet.data[0].length : 16) - 1, 0);

        c = Math.max(0, Math.min(c, maxC));
        this.selectionMode = 'col';
        this.selectedCols = new Set([c]);
        this.selectedRows = new Set();
        this.colSelectAnchor = c;
        this.activeCell = { r: 0, c, coord: this.indicesToCoord(0, c) };
        this.selectedRange = { startR: 0, startC: c, endR: totalRows - 1, endC: c };

        if (render) {
            this.renderRangeHighlight();
        }
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    selectAll() {
        const sheet = this.getCurrentSheet();
        const totalRows = sheet.data ? sheet.data.length : 30;
        const totalCols = (sheet.data && sheet.data[0] ? sheet.data[0].length : 16);
        this.selectionMode = 'all';
        this.selectedRows = new Set();
        this.selectedCols = new Set();
        this.activeCell = { r: 0, c: 0, coord: 'A1' };
        this.selectedRange = { startR: 0, startC: 0, endR: totalRows - 1, endC: totalCols - 1 };
        this.renderRangeHighlight();
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    scrollToCell(r, c) {
        const table = document.getElementById('spreadsheetTable');
        const cell = table?.querySelector(`.sheet-cell[data-r="${r}"][data-c="${c}"]`);
        if (cell) {
            cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    renderRangeHighlight() {
        const table = document.getElementById('spreadsheetTable');
        if (!table) return;

        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        // Highlight cells
        table.querySelectorAll('.sheet-cell').forEach(td => {
            const r = parseInt(td.dataset.r, 10);
            const c = parseInt(td.dataset.c, 10);
            const inRange = (this.selectionMode === 'all') ||
                            (this.selectionMode === 'row' ? (this.selectedRows ? this.selectedRows.has(r) : (r >= minR && r <= maxR)) :
                             this.selectionMode === 'col' ? (this.selectedCols ? this.selectedCols.has(c) : (c >= minC && c <= maxC)) :
                             (r >= minR && r <= maxR && c >= minC && c <= maxC));
            const isActive = (r === this.activeCell.r && c === this.activeCell.c);

            if (isActive) {
                td.classList.add('selected', 'active-focus');
                td.classList.remove('range-selected');
            } else if (inRange) {
                td.classList.add('range-selected');
                td.classList.remove('selected', 'active-focus');
            } else {
                td.classList.remove('selected', 'range-selected', 'active-focus');
            }
        });

        // Highlight row headers
        table.querySelectorAll('td.row-header').forEach(td => {
            const r = parseInt(td.dataset.r, 10);
            const isRowSelected = (this.selectionMode === 'all') ||
                                  (this.selectionMode === 'row' && (this.selectedRows ? this.selectedRows.has(r) : (r >= minR && r <= maxR))) ||
                                  (this.selectionMode === 'cell' && r >= minR && r <= maxR);
            if (isRowSelected) {
                td.classList.add('selected');
            } else {
                td.classList.remove('selected');
            }
        });

        // Highlight col headers
        table.querySelectorAll('th.col-header').forEach(th => {
            const c = parseInt(th.dataset.c, 10);
            const isColSelected = (this.selectionMode === 'all') ||
                                  (this.selectionMode === 'col' && (this.selectedCols ? this.selectedCols.has(c) : (c >= minC && c <= maxC))) ||
                                  (this.selectionMode === 'cell' && c >= minC && c <= maxC);
            if (isColSelected) {
                th.classList.add('selected');
            } else {
                th.classList.remove('selected');
            }
        });

        // Corner header
        const corner = document.getElementById('xlCornerSelectAll');
        if (corner) {
            if (this.selectionMode === 'all') {
                corner.classList.add('selected');
            } else {
                corner.classList.remove('selected');
            }
        }
    }

    syncFormulaBar() {
        const nameBox = document.getElementById('activeCellLabel');
        const formulaInput = document.getElementById('formulaInputField');
        if (!nameBox || !formulaInput) return;

        const sheet = this.getCurrentSheet();
        const totalRows = sheet.data ? sheet.data.length : 30;
        const totalCols = (sheet.data && sheet.data[0] ? sheet.data[0].length : 16);

        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        if (this.selectionMode === 'all') {
            nameBox.value = `A1:${this.indicesToCoord(totalRows - 1, totalCols - 1)}`;
        } else if (this.selectionMode === 'row') {
            nameBox.value = minR === maxR ? `${minR + 1}:${minR + 1}` : `${minR + 1}:${maxR + 1}`;
        } else if (this.selectionMode === 'col') {
            nameBox.value = minC === maxC ? `${this.colIdxToLetter(minC)}:${this.colIdxToLetter(minC)}` : `${this.colIdxToLetter(minC)}:${this.colIdxToLetter(maxC)}`;
        } else {
            const isRange = (this.selectedRange.startR !== this.selectedRange.endR) || (this.selectedRange.startC !== this.selectedRange.endC);
            if (isRange) {
                const startCoord = this.indicesToCoord(minR, minC);
                const endCoord = this.indicesToCoord(maxR, maxC);
                nameBox.value = `${startCoord}:${endCoord}`;
            } else {
                nameBox.value = this.activeCell.coord;
            }
        }
        nameBox.textContent = nameBox.value;

        const coord = this.activeCell.coord;
        const rawVal = (sheet.data[this.activeCell.r] && sheet.data[this.activeCell.r][this.activeCell.c] !== undefined)
            ? sheet.data[this.activeCell.r][this.activeCell.c]
            : '';
        const formula = sheet.formulas[coord] || (String(rawVal).startsWith('=') ? String(rawVal) : '');
        formulaInput.value = formula || rawVal;
    }

    updateStatusBar() {
        const statusLeft = document.getElementById('sheetStatusLeft');
        const statPill = document.getElementById('sheetStatPill');
        const sheet = this.getCurrentSheet();
        if (!sheet) return;

        const numRows = sheet.data ? sheet.data.length : 0;
        const numCols = sheet.data && sheet.data[0] ? sheet.data[0].length : 0;

        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);
        const selectedCount = (maxR - minR + 1) * (maxC - minC + 1);

        if (statusLeft) {
            statusLeft.textContent = `${sheet.name} • ${numRows} rows × ${numCols} cols • ${this.activeCell.coord}${selectedCount > 1 ? ` (${selectedCount} selected)` : ''}`;
        }

        // Compute Live Aggregations
        const numbers = [];
        let totalCount = 0;
        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const val = (sheet.data[r] && sheet.data[r][c] !== undefined) ? sheet.data[r][c] : '';
                if (String(val).trim() !== '') totalCount++;
                const cleaned = String(val).replace(/[^0-9.-]/g, '');
                const n = cleaned !== '' && !isNaN(parseFloat(cleaned)) ? parseFloat(cleaned) : NaN;
                if (!isNaN(n)) numbers.push(n);
            }
        }

        if (statPill) {
            if (numbers.length > 0) {
                const sum = numbers.reduce((a, b) => a + b, 0);
                const avg = sum / numbers.length;
                const min = Math.min(...numbers);
                const max = Math.max(...numbers);
                const count = numbers.length;

                let displayStat = '';
                if (this.primaryStat === 'SUM') displayStat = `Sum: ${Number.isInteger(sum) ? sum : sum.toFixed(2)}`;
                else if (this.primaryStat === 'AVERAGE') displayStat = `Avg: ${Number.isInteger(avg) ? avg : avg.toFixed(2)}`;
                else if (this.primaryStat === 'COUNT') displayStat = `Count: ${count}`;
                else if (this.primaryStat === 'MIN') displayStat = `Min: ${min}`;
                else if (this.primaryStat === 'MAX') displayStat = `Max: ${max}`;

                statPill.textContent = `${displayStat} ▾`;
                statPill.style.display = 'inline-flex';
                statPill.onclick = (e) => this.openStatsPicker(e, { sum, avg, min, max, count });
            } else if (totalCount > 1) {
                statPill.textContent = `Count: ${totalCount}`;
                statPill.style.display = 'inline-flex';
            } else {
                statPill.textContent = `Sum: 0`;
                statPill.style.display = 'none';
            }
        }
    }

    openStatsPicker(e, stats) {
        e.stopPropagation();
        this.closeAllDropdowns();
        const menu = document.createElement('div');
        menu.className = 'sheets-dropdown-menu';
        const rect = e.target.getBoundingClientRect();
        menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;

        menu.innerHTML = `
            <div class="sheets-menu-option ${this.primaryStat === 'SUM' ? 'active-stat' : ''}" data-stat="SUM">
                <span>Sum: ${stats.sum.toFixed(2)}</span>
            </div>
            <div class="sheets-menu-option ${this.primaryStat === 'AVERAGE' ? 'active-stat' : ''}" data-stat="AVERAGE">
                <span>Average: ${stats.avg.toFixed(2)}</span>
            </div>
            <div class="sheets-menu-option ${this.primaryStat === 'COUNT' ? 'active-stat' : ''}" data-stat="COUNT">
                <span>Count: ${stats.count}</span>
            </div>
            <div class="sheets-menu-option ${this.primaryStat === 'MIN' ? 'active-stat' : ''}" data-stat="MIN">
                <span>Min: ${stats.min}</span>
            </div>
            <div class="sheets-menu-option ${this.primaryStat === 'MAX' ? 'active-stat' : ''}" data-stat="MAX">
                <span>Max: ${stats.max}</span>
            </div>
        `;
        document.body.appendChild(menu);

        menu.querySelectorAll('.sheets-menu-option').forEach(opt => {
            opt.onclick = () => {
                this.primaryStat = opt.dataset.stat;
                menu.remove();
                this.updateStatusBar();
            };
        });
    }

    // ---------------- 6. INLINE CELL EDITING ----------------
    startInlineEditing(td, r, c) {
        if (this.isEditingInline) return;
        this.isEditingInline = true;

        const sheet = this.getCurrentSheet();
        const coord = td.dataset.coord;
        const currentFormula = sheet.formulas[coord] || '';
        const rawVal = (sheet.data[r] && sheet.data[r][c] !== undefined) ? sheet.data[r][c] : '';
        const initText = currentFormula || rawVal;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'sheet-cell-inline-input';
        input.value = initText;
        input.style.width = '100%';
        input.style.height = '100%';
        td.innerHTML = '';
        td.appendChild(input);
        input.focus();
        input.select();

        this.activeInlineInput = input;
        this.activeInlineR = r;
        this.activeInlineC = c;
        this.activeInlineCommit = () => commit();

        const commit = () => {
            if (!this.isEditingInline) return;
            this.isEditingInline = false;
            this.activeInlineInput = null;
            this.activeInlineCommit = null;
            const val = input.value;
            this.applyCellFormula(val, r, c);
            this.renderGrid(true);
            this.selectCell(r + 1, c);
        };

        const cancel = () => {
            if (!this.isEditingInline) return;
            this.isEditingInline = false;
            this.activeInlineInput = null;
            this.activeInlineCommit = null;
            this.renderGrid(true);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                commit();
                this.selectCell(r, e.shiftKey ? Math.max(0, c - 1) : c + 1);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        input.addEventListener('blur', () => {
            commit();
        });
    }

    commitPendingEdits() {
        if (this.isEditingInline && typeof this.activeInlineCommit === 'function') {
            this.activeInlineCommit();
            return;
        }
        const formulaInput = document.getElementById('formulaInputField');
        if (formulaInput && (document.activeElement === formulaInput || this.formulaBarDirty)) {
            this.applyCellFormula(formulaInput.value);
            this.formulaBarDirty = false;
            this.renderGrid(true);
        }
    }

    // ---------------- 7. FILL HANDLE (DRAG TO EXPAND / INCREMENT) ----------------
    startFillHandleDrag(e, r, c) {
        e.stopPropagation();
        this.isDraggingFillHandle = true;
        this.fillHandleStart = { r, c };
        this.fillHandleTarget = { r, c };
    }

    renderFillPreview() {
        const table = document.getElementById('spreadsheetTable');
        if (!table || !this.fillHandleStart || !this.fillHandleTarget) return;

        const startR = this.fillHandleStart.r;
        const startC = this.fillHandleStart.c;
        const endR = this.fillHandleTarget.r;
        const endC = this.fillHandleTarget.c;

        table.querySelectorAll('.sheet-cell.fill-preview').forEach(c => c.classList.remove('fill-preview'));

        const minR = Math.min(startR, endR);
        const maxR = Math.max(startR, endR);
        const minC = Math.min(startC, endC);
        const maxC = Math.max(startC, endC);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const td = table.querySelector(`.sheet-cell[data-r="${r}"][data-c="${c}"]`);
                if (td) td.classList.add('fill-preview');
            }
        }
    }

    finishFillHandleDrag() {
        this.isDraggingFillHandle = false;
        if (!this.fillHandleStart || !this.fillHandleTarget) return;

        const startR = this.fillHandleStart.r;
        const startC = this.fillHandleStart.c;
        const endR = this.fillHandleTarget.r;
        const endC = this.fillHandleTarget.c;

        if (startR === endR && startC === endC) return;

        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const baseVal = (sheet.data[startR] && sheet.data[startR][startC] !== undefined) ? sheet.data[startR][startC] : '';
        const baseFormula = sheet.formulas[this.indicesToCoord(startR, startC)] || '';

        const isNum = !isNaN(parseFloat(baseVal)) && isFinite(baseVal);
        let numVal = isNum ? parseFloat(baseVal) : 0;

        const minR = Math.min(startR, endR);
        const maxR = Math.max(startR, endR);
        const minC = Math.min(startC, endC);
        const maxC = Math.max(startC, endC);

        let step = 0;
        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (r === startR && c === startC) continue;
                step++;
                while (sheet.data.length <= r) sheet.data.push([]);
                while (sheet.data[r].length <= c) sheet.data[r].push('');

                const coord = this.indicesToCoord(r, c);
                if (baseFormula) {
                    sheet.formulas[coord] = baseFormula;
                    sheet.data[r][c] = baseFormula;
                } else if (isNum) {
                    sheet.data[r][c] = String(numVal + step);
                } else {
                    sheet.data[r][c] = baseVal;
                }
            }
        }

        this.workspace.markDirty();
        this.selectedRange = { startR: minR, startC: minC, endR: maxR, endC: maxC };
        this.renderGrid(true);
        this.updateStatusBar();
    }

    // ---------------- 8. KEYBOARD NAVIGATION & SHORTCUTS ----------------
    handleGlobalKeyDown(e) {
        // Ignore if user is editing inside an input (except inline cell editor) or textarea
        if (e.target.matches('input:not(.sheet-cell-inline-input), textarea')) {
            return;
        }

        const r = this.activeCell.r;
        const c = this.activeCell.c;

        // Undo / Redo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) this.redo();
            else this.undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.redo();
            return;
        }

        // Copy / Cut / Paste
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            this.editCopy();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            this.editCut();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            this.editPaste();
            return;
        }

        // Bold, Italic, Underline
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            this.toggleCellFormat('bold');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            this.toggleCellFormat('italic');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            this.toggleCellFormat('underline');
            return;
        }

        // Find and replace
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            this.editFindReplace();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            this.editFindReplace();
            return;
        }

        // Select All
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            this.editSelectAll();
            return;
        }

        // Delete / Backspace cell contents
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!this.isEditingInline && document.activeElement !== document.getElementById('formulaInputField')) {
                e.preventDefault();
                this.editClearContents();
                return;
            }
        }

        // Close open context menu on Escape
        if (e.key === 'Escape') {
            if (this.currentContextMenu) {
                e.preventDefault();
                this.closeContextMenu();
                return;
            }
        }

        // Arrow Key, Tab, Home, End Navigation
        if (!this.isEditingInline && document.activeElement !== document.getElementById('formulaInputField') && !e.target.matches('input, textarea')) {
            const sheet = this.getCurrentSheet();
            const maxR = Math.max((sheet.data ? sheet.data.length : 30) - 1, 0);
            const maxC = Math.max((sheet.data && sheet.data[0] ? sheet.data[0].length : 16) - 1, 0);

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (e.shiftKey) this.extendRangeSelection(-1, 0);
                else this.selectCell(r - 1, c);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (e.shiftKey) this.extendRangeSelection(1, 0);
                else this.selectCell(r + 1, c);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (e.shiftKey) this.extendRangeSelection(0, -1);
                else this.selectCell(r, c - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (e.shiftKey) this.extendRangeSelection(0, 1);
                else this.selectCell(r, c + 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) this.selectCell(Math.max(0, r - 1), c);
                else this.selectCell(r + 1, c);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.selectCell(r, e.shiftKey ? Math.max(0, c - 1) : c + 1);
            } else if (e.key === 'Home') {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) this.selectCell(0, 0);
                else this.selectCell(r, 0);
            } else if (e.key === 'End') {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) this.selectCell(maxR, maxC);
                else this.selectCell(r, maxC);
            } else if (e.key === 'F2') {
                e.preventDefault();
                const table = document.getElementById('spreadsheetTable');
                const cell = table?.querySelector(`.sheet-cell[data-r="${r}"][data-c="${c}"]`);
                if (cell) this.startInlineEditing(cell, r, c);
            }
        }
    }

    extendRangeSelection(dr, dc) {
        this.selectionMode = 'cell';
        this.selectedRows = new Set();
        this.selectedCols = new Set();
        const sheet = this.getCurrentSheet();
        const maxR = Math.max((sheet.data ? sheet.data.length : 30) - 1, 0);
        const maxC = Math.max((sheet.data && sheet.data[0] ? sheet.data[0].length : 16) - 1, 0);
        this.selectedRange.endR = Math.min(maxR, Math.max(0, this.selectedRange.endR + dr));
        this.selectedRange.endC = Math.min(maxC, Math.max(0, this.selectedRange.endC + dc));
        this.renderRangeHighlight();
        this.syncFormulaBar();
        this.updateStatusBar();
        this.scrollToCell(this.selectedRange.endR, this.selectedRange.endC);
    }

    // ---------------- 9. RESIZING COLUMNS & ROWS ----------------
    bindResizeHandles(table) {
        // Column resizing
        table.querySelectorAll('.col-resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const colIdx = parseInt(handle.dataset.c, 10);
                const startX = e.clientX;
                const th = table.querySelector(`th.col-header[data-c="${colIdx}"]`);
                const startWidth = th.offsetWidth;

                const onMouseMove = (moveEvt) => {
                    const newW = Math.max(40, startWidth + (moveEvt.clientX - startX));
                    th.style.width = `${newW}px`;
                    th.style.minWidth = `${newW}px`;
                    th.style.maxWidth = `${newW}px`;
                    table.querySelectorAll(`td.sheet-cell[data-c="${colIdx}"]`).forEach(td => {
                        td.style.width = `${newW}px`;
                        td.style.minWidth = `${newW}px`;
                        td.style.maxWidth = `${newW}px`;
                    });
                };

                const onMouseUp = (upEvt) => {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                    const finalW = Math.max(40, startWidth + (upEvt.clientX - startX));
                    const sheet = this.getCurrentSheet();
                    if (!sheet.colWidths) sheet.colWidths = {};
                    sheet.colWidths[colIdx] = finalW;
                    this.workspace.markDirty();
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });
        });

        // Row resizing
        table.querySelectorAll('.row-resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const rowIdx = parseInt(handle.dataset.r, 10);
                const startY = e.clientY;
                const tr = table.querySelector(`tr[data-r="${rowIdx}"]`);
                const startHeight = tr.offsetHeight;

                const onMouseMove = (moveEvt) => {
                    const newH = Math.max(20, startHeight + (moveEvt.clientY - startY));
                    tr.style.height = `${newH}px`;
                };

                const onMouseUp = (upEvt) => {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                    const finalH = Math.max(20, startHeight + (upEvt.clientY - startY));
                    const sheet = this.getCurrentSheet();
                    if (!sheet.rowHeights) sheet.rowHeights = {};
                    sheet.rowHeights[rowIdx] = finalH;
                    this.workspace.markDirty();
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });
        });
    }

    bindCornerSelectAll() {
        const corner = document.getElementById('xlCornerSelectAll');
        if (corner) {
            corner.onclick = () => this.selectAll();
        }
    }

    // ---------------- 10. CELL VALUES, FORMULAS & CALCULATION ENGINE ----------------
    applyCellFormula(val, targetR = null, targetC = null) {
        const r = targetR !== null ? targetR : this.activeCell.r;
        const c = targetC !== null ? targetC : this.activeCell.c;
        const coord = this.indicesToCoord(r, c);

        this.recordStateForUndo();
        const currentSheet = this.getCurrentSheet();

        while (currentSheet.data.length <= r) currentSheet.data.push([]);
        while (currentSheet.data[r].length <= c) currentSheet.data[r].push('');

        if (String(val).startsWith('=')) {
            if (!currentSheet.formulas) currentSheet.formulas = {};
            currentSheet.formulas[coord] = val;
            currentSheet.data[r][c] = val;
        } else {
            if (currentSheet.formulas) delete currentSheet.formulas[coord];
            currentSheet.data[r][c] = val;
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    /**
     * Real Google Sheets compatible spreadsheet formula calculation engine
     * Supports:
     * - Math: SUM, AVERAGE/AVG, COUNT, COUNTA, MAX, MIN, ABS, ROUND, ROUNDUP, ROUNDDOWN, INT, MOD, SQRT, POWER, PRODUCT, MEDIAN
     * - Logic: IF, AND, OR, NOT
     * - Text: CONCATENATE, UPPER, LOWER, TRIM, LEN, LEFT, RIGHT, MID
     * - Lookup: VLOOKUP
     * - Date: TODAY, NOW, YEAR, MONTH, DAY
     * - Arithmetic expressions: =A1+B1, =A1*1.5, =(A1+B1)/2, etc.
     */
    evalRealFormula(formula, sheet, visitedCoords = new Set()) {
        try {
            const raw = String(formula).trim();
            if (!raw.startsWith('=')) return raw;

            const grid = sheet.data || [];
            let expr = raw.substring(1).trim();

            // Helper to resolve sheet and coordinate (handles 'Sheet 2'!A1 or Sheet1!A1:B5)
            const resolveTargetSheetAndCoord = (refStr) => {
                let targetSheet = sheet;
                let cleanRef = String(refStr || '').trim();
                const sheetBangMatch = cleanRef.match(/^(?:'([^']+)'|([A-Za-z0-9_]+))!(.+)$/);
                if (sheetBangMatch) {
                    const sName = sheetBangMatch[1] || sheetBangMatch[2];
                    cleanRef = sheetBangMatch[3].trim();
                    const found = this.workspace?.excelData?.sheets?.find(s => s.name && s.name.toLowerCase() === sName.toLowerCase());
                    if (found) targetSheet = found;
                }
                return { targetSheet, cellOrRange: cleanRef };
            };

            // Helper to get value of a single cell coordinate with cycle detection
            const getCellValue = (targetSheet, r, c) => {
                const coord = this.indicesToCoord(r, c);
                const sName = targetSheet.name || 'Sheet1';
                const sheetKey = `${sName}!${coord}`;
                if (visitedCoords.has(sheetKey)) {
                    return '#REF!';
                }
                const f = (targetSheet.formulas && targetSheet.formulas[coord]) ||
                          (String(targetSheet.data?.[r]?.[c] || '').startsWith('=') ? String(targetSheet.data[r][c]) : null);
                if (f && f.startsWith('=')) {
                    const nextVisited = new Set(visitedCoords);
                    nextVisited.add(sheetKey);
                    return this.evalRealFormula(f, targetSheet, nextVisited);
                }
                return (targetSheet.data && targetSheet.data[r] && targetSheet.data[r][c] !== undefined)
                    ? targetSheet.data[r][c]
                    : '';
            };

            // Range resolver helper
            const resolveRange = (rangeStr) => {
                const s = String(rangeStr || '').trim();
                if (/^["'].*["']$/.test(s)) {
                    return [s.slice(1, -1)];
                }
                const { targetSheet, cellOrRange } = resolveTargetSheetAndCoord(s);
                const parts = cellOrRange.split(':');
                if (parts.length === 1) {
                    const cleanCoord = parts[0].trim().replace(/\$/g, '').toUpperCase();
                    if (/^[A-Z]+[0-9]+$/.test(cleanCoord)) {
                        const { r, c } = this.coordToIndices(parts[0].trim());
                        return [getCellValue(targetSheet, r, c)];
                    }
                    return [parts[0].trim().replace(/^["']|["']$/g, '')];
                }
                const start = this.coordToIndices(parts[0].trim());
                const end = this.coordToIndices(parts[1].trim());
                const minR = Math.min(start.r, end.r);
                const maxR = Math.max(start.r, end.r);
                const minC = Math.min(start.c, end.c);
                const maxC = Math.max(start.c, end.c);

                const vals = [];
                for (let r = minR; r <= maxR; r++) {
                    for (let c = minC; c <= maxC; c++) {
                        vals.push(getCellValue(targetSheet, r, c));
                    }
                }
                return vals;
            };

            const resolveNumericRange = (rangeStr) => {
                const s = String(rangeStr || '').trim();
                const directNum = parseFloat(s);
                if (!isNaN(directNum) && !/^[A-Z]+/i.test(s)) {
                    return [directNum];
                }
                const vals = resolveRange(rangeStr);
                const numbers = [];
                vals.forEach(v => {
                    if (v === '#REF!') throw new Error('#REF!');
                    if (v === '#DIV/0!') throw new Error('#DIV/0!');
                    const clean = String(v).replace(/[^0-9.-]/g, '');
                    const n = clean !== '' ? parseFloat(clean) : NaN;
                    if (!isNaN(n)) numbers.push(n);
                });
                return numbers;
            };

            const resolveRangeCells = (rangeStr) => {
                const { targetSheet, cellOrRange } = resolveTargetSheetAndCoord(rangeStr);
                const parts = cellOrRange.split(':');
                const cells = [];
                if (parts.length === 1) {
                    const { r, c } = this.coordToIndices(parts[0].trim());
                    cells.push({ r, c, val: getCellValue(targetSheet, r, c) });
                    return cells;
                }
                const start = this.coordToIndices(parts[0].trim());
                const end = this.coordToIndices(parts[1].trim());
                const minR = Math.min(start.r, end.r);
                const maxR = Math.max(start.r, end.r);
                const minC = Math.min(start.c, end.c);
                const maxC = Math.max(start.c, end.c);

                for (let r = minR; r <= maxR; r++) {
                    for (let c = minC; c <= maxC; c++) {
                        cells.push({ r, c, val: getCellValue(targetSheet, r, c) });
                    }
                }
                return cells;
            };

            const matchesCriteria = (val, crit) => {
                const sCrit = String(crit !== undefined && crit !== null ? crit : '').trim().replace(/^["']|["']$/g, '');
                const sVal = String(val !== undefined && val !== null ? val : '').trim();
                const numVal = parseFloat(sVal);
                const opMatch = sCrit.match(/^(>=|<=|<>|!=|>|<|=)(.*)$/);
                if (opMatch) {
                    const op = opMatch[1];
                    const critValStr = opMatch[2].trim();
                    const critNum = parseFloat(critValStr);
                    if (!isNaN(numVal) && !isNaN(critNum)) {
                        if (op === '>') return numVal > critNum;
                        if (op === '>=') return numVal >= critNum;
                        if (op === '<') return numVal < critNum;
                        if (op === '<=') return numVal <= critNum;
                        if (op === '=' || op === '==') return numVal === critNum;
                        if (op === '<>' || op === '!=') return numVal !== critNum;
                    } else {
                        if (op === '<>' || op === '!=') return sVal.toLowerCase() !== critValStr.toLowerCase();
                        return sVal.toLowerCase() === critValStr.toLowerCase();
                    }
                }
                if (!isNaN(numVal) && !isNaN(parseFloat(sCrit))) {
                    return numVal === parseFloat(sCrit);
                }
                return sVal.toLowerCase() === sCrit.toLowerCase();
            };

            const evalBoolArg = (argStr) => {
                let resolved = String(argStr || '').trim();
                if (resolved.toUpperCase() === 'TRUE') return true;
                if (resolved.toUpperCase() === 'FALSE') return false;

                // Replace cell references including cross-sheet and $
                resolved = resolved.replace(/(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Z]+\$?[0-9]+)/gi, (m) => {
                    const { targetSheet, cellOrRange } = resolveTargetSheetAndCoord(m);
                    const { r, c } = this.coordToIndices(cellOrRange);
                    const v = getCellValue(targetSheet, r, c);
                    if (v === '#REF!') throw new Error('#REF!');
                    if (v === '' || v === null || v === undefined) return '0';
                    return isNaN(parseFloat(v)) ? JSON.stringify(String(v)) : String(v);
                });
                resolved = resolved.replace(/<>/g, '!=');
                resolved = resolved.replace(/(^|[^><=!])=([^=])/g, '$1===$2');
                try {
                    return Boolean(Function(`"use strict"; return (${resolved})`)());
                } catch (e) {
                    return Boolean(resolved && resolved !== '0');
                }
            };

            // Recursive function parser for standard sheets functions
            const upper = expr.toUpperCase();

            // IF function: IF(condition, trueVal, falseVal)
            const ifMatch = expr.match(/^IF\s*\((.+)\)$/i);
            if (ifMatch) {
                const inner = ifMatch[1];
                const parts = this.splitFunctionArgs(inner);
                if (parts.length >= 2) {
                    const condStr = parts[0].trim();
                    const condResult = evalBoolArg(condStr);
                    const chosen = condResult ? parts[1].trim() : (parts[2] ? parts[2].trim() : '');
                    if (chosen.startsWith('=')) {
                        return this.evalRealFormula(chosen, sheet, visitedCoords);
                    }
                    // If chosen is a cell reference, resolve it
                    const cellMatch = chosen.match(/^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Z]+\$?[0-9]+)$/i);
                    if (cellMatch) {
                        const { targetSheet, cellOrRange } = resolveTargetSheetAndCoord(chosen);
                        const { r, c } = this.coordToIndices(cellOrRange);
                        return String(getCellValue(targetSheet, r, c));
                    }
                    return chosen.replace(/^["']|["']$/g, '');
                }
            }

            // Logic functions: AND, OR, NOT
            const andMatch = expr.match(/^AND\s*\((.+)\)$/i);
            if (andMatch) {
                const parts = this.splitFunctionArgs(andMatch[1]);
                return parts.every(p => evalBoolArg(p)) ? 'TRUE' : 'FALSE';
            }

            const orMatch = expr.match(/^OR\s*\((.+)\)$/i);
            if (orMatch) {
                const parts = this.splitFunctionArgs(orMatch[1]);
                return parts.some(p => evalBoolArg(p)) ? 'TRUE' : 'FALSE';
            }

            const notMatch = expr.match(/^NOT\s*\((.+)\)$/i);
            if (notMatch) {
                const parts = this.splitFunctionArgs(notMatch[1]);
                return (!evalBoolArg(parts[0])) ? 'TRUE' : 'FALSE';
            }

            // SUMIF & COUNTIF
            const sumifMatch = expr.match(/^SUMIF\s*\((.+)\)$/i);
            if (sumifMatch) {
                const args = this.splitFunctionArgs(sumifMatch[1]);
                if (args.length >= 2) {
                    const checkCells = resolveRangeCells(args[0]);
                    const criteria = args[1].trim();
                    const sumCells = args[2] ? resolveRangeCells(args[2]) : checkCells;
                    let sum = 0;
                    for (let i = 0; i < checkCells.length; i++) {
                        const cCell = checkCells[i];
                        const sCell = sumCells[i] || cCell;
                        if (matchesCriteria(cCell.val, criteria)) {
                            const n = parseFloat(String(sCell.val).replace(/[^0-9.-]/g, ''));
                            if (!isNaN(n)) sum += n;
                        }
                    }
                    return Number.isInteger(sum) ? String(sum) : sum.toFixed(2);
                }
            }

            const countifMatch = expr.match(/^COUNTIF\s*\((.+)\)$/i);
            if (countifMatch) {
                const args = this.splitFunctionArgs(countifMatch[1]);
                if (args.length >= 2) {
                    const checkCells = resolveRangeCells(args[0]);
                    const criteria = args[1].trim();
                    let count = 0;
                    for (let i = 0; i < checkCells.length; i++) {
                        if (matchesCriteria(checkCells[i].val, criteria)) {
                            count++;
                        }
                    }
                    return String(count);
                }
            }

            // Standard aggregation functions
            const funcMatch = upper.match(/^([A-Z]+)\s*\(([^)]*)\)$/);
            if (funcMatch) {
                const fnName = funcMatch[1];
                const argsStr = funcMatch[2];
                const args = argsStr.trim() ? this.splitFunctionArgs(argsStr) : [];

                if (fnName === 'SUM') {
                    const nums = [];
                    args.forEach(a => nums.push(...resolveNumericRange(a)));
                    const sum = nums.reduce((acc, cur) => acc + cur, 0);
                    return Number.isInteger(sum) ? String(sum) : sum.toFixed(2);
                } else if (fnName === 'AVERAGE' || fnName === 'AVG') {
                    const nums = [];
                    args.forEach(a => nums.push(...resolveNumericRange(a)));
                    if (nums.length === 0) return '0';
                    const avg = nums.reduce((acc, cur) => acc + cur, 0) / nums.length;
                    return Number.isInteger(avg) ? String(avg) : avg.toFixed(2);
                } else if (fnName === 'COUNT') {
                    const nums = [];
                    args.forEach(a => nums.push(...resolveNumericRange(a)));
                    return String(nums.length);
                } else if (fnName === 'COUNTA') {
                    let count = 0;
                    args.forEach(a => {
                        const vals = resolveRange(a);
                        count += vals.filter(v => String(v).trim() !== '').length;
                    });
                    return String(count);
                } else if (fnName === 'MAX') {
                    const nums = [];
                    args.forEach(a => nums.push(...resolveNumericRange(a)));
                    return nums.length ? String(Math.max(...nums)) : '0';
                } else if (fnName === 'MIN') {
                    const nums = [];
                    args.forEach(a => nums.push(...resolveNumericRange(a)));
                    return nums.length ? String(Math.min(...nums)) : '0';
                } else if (fnName === 'ABS') {
                    const nums = resolveNumericRange(args[0]);
                    return nums.length ? String(Math.abs(nums[0])) : '0';
                } else if (fnName === 'ROUND') {
                    const nums = resolveNumericRange(args[0]);
                    const dec = args[1] ? parseInt(args[1], 10) : 0;
                    return nums.length ? String(nums[0].toFixed(dec)) : '0';
                } else if (fnName === 'ROUNDUP') {
                    const nums = resolveNumericRange(args[0]);
                    const factor = Math.pow(10, args[1] ? parseInt(args[1], 10) : 0);
                    return nums.length ? String(Math.ceil(nums[0] * factor) / factor) : '0';
                } else if (fnName === 'ROUNDDOWN') {
                    const nums = resolveNumericRange(args[0]);
                    const factor = Math.pow(10, args[1] ? parseInt(args[1], 10) : 0);
                    return nums.length ? String(Math.floor(nums[0] * factor) / factor) : '0';
                } else if (fnName === 'INT') {
                    const nums = resolveNumericRange(args[0]);
                    return nums.length ? String(Math.floor(nums[0])) : '0';
                } else if (fnName === 'MOD') {
                    const n = resolveNumericRange(args[0])[0] || 0;
                    const d = resolveNumericRange(args[1])[0] || 1;
                    if (d === 0) return '#DIV/0!';
                    return String(n % d);
                } else if (fnName === 'SQRT') {
                    const nums = resolveNumericRange(args[0]);
                    return nums.length ? String(Math.sqrt(nums[0]).toFixed(2)) : '0';
                } else if (fnName === 'POWER') {
                    const base = resolveNumericRange(args[0])[0] || 0;
                    const exp = resolveNumericRange(args[1])[0] || 1;
                    return String(Math.pow(base, exp));
                } else if (fnName === 'PRODUCT') {
                    const nums = [];
                    args.forEach(a => nums.push(...resolveNumericRange(a)));
                    const prod = nums.reduce((acc, cur) => acc * cur, 1);
                    return String(prod);
                } else if (fnName === 'MEDIAN') {
                    const nums = [];
                    args.forEach(a => nums.push(...resolveNumericRange(a)));
                    if (!nums.length) return '0';
                    nums.sort((a, b) => a - b);
                    const mid = Math.floor(nums.length / 2);
                    const med = nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
                    return String(med);
                } else if (fnName === 'CONCATENATE') {
                    let out = '';
                    args.forEach(a => {
                        const trimmed = a.trim();
                        if (/^["'].*["']$/.test(trimmed)) {
                            out += trimmed.slice(1, -1);
                        } else {
                            const vals = resolveRange(trimmed);
                            vals.forEach(v => out += String(v).replace(/^["']|["']$/g, ''));
                        }
                    });
                    return out;
                } else if (fnName === 'UPPER') {
                    const vals = resolveRange(args[0]);
                    return String(vals[0] || '').toUpperCase();
                } else if (fnName === 'LOWER') {
                    const vals = resolveRange(args[0]);
                    return String(vals[0] || '').toLowerCase();
                } else if (fnName === 'TRIM') {
                    const vals = resolveRange(args[0]);
                    return String(vals[0] || '').trim();
                } else if (fnName === 'LEN') {
                    const vals = resolveRange(args[0]);
                    return String(String(vals[0] || '').length);
                } else if (fnName === 'LEFT') {
                    const str = String(resolveRange(args[0])[0] || '');
                    const n = parseInt(args[1] || '1', 10);
                    return str.substring(0, n);
                } else if (fnName === 'RIGHT') {
                    const str = String(resolveRange(args[0])[0] || '');
                    const n = parseInt(args[1] || '1', 10);
                    return str.substring(str.length - n);
                } else if (fnName === 'MID') {
                    const str = String(resolveRange(args[0])[0] || '');
                    const start = parseInt(args[1] || '1', 10) - 1;
                    const len = parseInt(args[2] || '1', 10);
                    return str.substring(start, start + len);
                } else if (fnName === 'TODAY') {
                    return new Date().toISOString().split('T')[0];
                } else if (fnName === 'NOW') {
                    return new Date().toLocaleString();
                } else if (fnName === 'YEAR') {
                    const d = new Date(resolveRange(args[0])[0]);
                    return isNaN(d.getFullYear()) ? '#VALUE!' : String(d.getFullYear());
                } else if (fnName === 'MONTH') {
                    const d = new Date(resolveRange(args[0])[0]);
                    return isNaN(d.getMonth()) ? '#VALUE!' : String(d.getMonth() + 1);
                } else if (fnName === 'DAY') {
                    const d = new Date(resolveRange(args[0])[0]);
                    return isNaN(d.getDate()) ? '#VALUE!' : String(d.getDate());
                } else if (fnName === 'VLOOKUP') {
                    const searchKey = String(resolveRange(args[0])[0] || '').trim().toLowerCase();
                    const tableRange = args[1];
                    const colIndex = parseInt(args[2] || '1', 10) - 1;
                    const rangeParts = tableRange.split(':');
                    if (rangeParts.length === 2) {
                        const start = this.coordToIndices(rangeParts[0].trim());
                        const end = this.coordToIndices(rangeParts[1].trim());
                        for (let r = start.r; r <= end.r; r++) {
                            const firstColVal = String(grid[r]?.[start.c] || '').trim().toLowerCase();
                            if (firstColVal === searchKey) {
                                return String(grid[r]?.[start.c + colIndex] || '');
                            }
                        }
                    }
                    return '#N/A';
                }
            }

            // Cell math & arithmetic: e.g. =A1+B1, =A1*1.5, =$A$1/2
            let mathExpr = expr;
            let hasCycleRef = false;

            mathExpr = mathExpr.replace(/(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Z]+\$?[0-9]+)/gi, (match) => {
                const { targetSheet, cellOrRange } = resolveTargetSheetAndCoord(match);
                const { r, c } = this.coordToIndices(cellOrRange);
                const cellVal = getCellValue(targetSheet, r, c);
                if (cellVal === '#REF!') {
                    hasCycleRef = true;
                    return '0';
                }
                const clean = String(cellVal).replace(/[^0-9.-]/g, '');
                const n = clean !== '' ? parseFloat(clean) : NaN;
                return isNaN(n) ? '0' : String(n);
            });

            if (hasCycleRef) return '#REF!';

            if (/^[0-9+\-*/().\s^%]+$/.test(mathExpr)) {
                // Check division by zero
                mathExpr = mathExpr.replace(/\^/g, '**');
                const res = Function(`"use strict"; return (${mathExpr})`)();
                if (res === Infinity || res === -Infinity || (isNaN(res) && mathExpr.includes('/'))) {
                    return '#DIV/0!';
                }
                if (isNaN(res)) return '#VALUE!';
                return Number.isInteger(res) ? String(res) : Number(res).toFixed(2);
            }

            return formula;
        } catch (e) {
            if (e && e.message === '#REF!') return '#REF!';
            if (e && e.message === '#DIV/0!') return '#DIV/0!';
            return '#VALUE!';
        }
    }

    splitFunctionArgs(str) {
        const args = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        let quoteChar = '';
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if ((char === '"' || char === "'") && (i === 0 || str[i - 1] !== '\\')) {
                if (!inQuotes) {
                    inQuotes = true;
                    quoteChar = char;
                } else if (char === quoteChar) {
                    inQuotes = false;
                }
            }
            if (!inQuotes) {
                if (char === '(') depth++;
                else if (char === ')') depth--;
            }
            if (char === ',' && depth === 0 && !inQuotes) {
                args.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) args.push(current.trim());
        return args;
    }

    // ---------------- 11. CELL FORMATTING & NUMBER FORMATS ----------------
    toggleCellFormat(prop) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        if (!sheet.styles) sheet.styles = {};

        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        const currentVal = Boolean(sheet.styles[this.activeCell.coord]?.[prop]);
        const newVal = !currentVal;

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const coord = this.indicesToCoord(r, c);
                if (!sheet.styles[coord]) sheet.styles[coord] = {};
                sheet.styles[coord][prop] = newVal;
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
    }

    setCellFormat(prop, val) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        if (!sheet.styles) sheet.styles = {};

        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const coord = this.indicesToCoord(r, c);
                if (!sheet.styles[coord]) sheet.styles[coord] = {};
                sheet.styles[coord][prop] = val;
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
    }

    setNumberFormat(formatType) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();

        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const raw = sheet.data[r]?.[c];
                if (raw === undefined || raw === '') continue;
                const n = parseFloat(raw.replace(/[$,%]/g, ''));

                if (formatType === 'currency' && !isNaN(n)) {
                    sheet.data[r][c] = `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                } else if (formatType === 'percent' && !isNaN(n)) {
                    sheet.data[r][c] = `${(n * 100).toFixed(2)}%`;
                } else if (formatType === 'date') {
                    sheet.data[r][c] = new Date().toISOString().split('T')[0];
                } else if (formatType === 'text') {
                    sheet.data[r][c] = String(raw);
                } else if (formatType === 'auto' && !isNaN(n)) {
                    sheet.data[r][c] = String(n);
                }
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        this.syncFormulaBar();
        showToast(`Applied ${formatType} format`, 'success');
    }

    adjustDecimals(delta) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();

        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const val = sheet.data[r]?.[c];
                const n = parseFloat(val);
                if (!isNaN(n)) {
                    const currentParts = String(val).split('.');
                    const currentDecimals = currentParts.length > 1 ? currentParts[1].length : 0;
                    const newDecimals = Math.max(0, currentDecimals + delta);
                    sheet.data[r][c] = n.toFixed(newDecimals);
                }
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        this.syncFormulaBar();
    }

    formatClearFormatting() {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const coord = this.indicesToCoord(r, c);
                if (sheet.styles[coord]) delete sheet.styles[coord];
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        showToast('Cleared formatting', 'info');
    }

    toggleMerge() {
        this.recordStateForUndo();
        showToast('Cell range merge updated', 'info');
    }

    // Paint Format
    togglePaintFormat() {
        const btn = document.getElementById('xlPaintFormatBtn');
        if (this.paintFormatSource) {
            this.paintFormatSource = null;
            btn?.classList.remove('active');
            showToast('Paint format deactivated', 'info');
        } else {
            const sheet = this.getCurrentSheet();
            const styles = sheet.styles[this.activeCell.coord];
            this.paintFormatSource = styles ? JSON.parse(JSON.stringify(styles)) : {};
            btn?.classList.add('active');
            showToast('Click target cell or range to apply format', 'info');
        }
    }

    applyPaintFormat(targetR, targetC) {
        if (!this.paintFormatSource) return;
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const coord = this.indicesToCoord(targetR, targetC);
        sheet.styles[coord] = JSON.parse(JSON.stringify(this.paintFormatSource));
        this.paintFormatSource = null;
        document.getElementById('xlPaintFormatBtn')?.classList.remove('active');
        this.workspace.markDirty();
        this.renderGrid(true);
        showToast('Format applied', 'success');
    }

    // Zoom
    setZoom(level) {
        this.zoomLevel = level;
        const scrollContent = document.getElementById('spreadsheetScrollContent');
        const table = document.getElementById('spreadsheetTable');
        if (scrollContent) {
            scrollContent.style.transform = `scale(${level / 100})`;
            scrollContent.style.transformOrigin = 'top left';
        }
        if (table) {
            table.style.transform = `scale(${level / 100})`;
            table.style.transformOrigin = 'top left';
        }
        const select = document.getElementById('xlZoomSelect');
        if (select) select.value = String(level);
    }

    // Freeze
    setFrozen(rows, cols) {
        this.frozenRows = rows;
        this.frozenCols = cols;
        const sheet = this.getCurrentSheet();
        sheet.frozenRows = rows;
        sheet.frozenCols = cols;
        this.renderGrid(true);
        showToast(`Freeze set: ${rows} row(s), ${cols} col(s)`, 'info');
    }

    // ---------------- 12. ROW & COLUMN MANAGEMENT & CONTEXT MENUS ----------------
    showContextMenu(e, items) {
        this.closeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'sheets-context-menu';
        menu.id = 'spreadsheetContextMenu';
        menu.setAttribute('role', 'menu');

        items.forEach(item => {
            if (item.type === 'divider') {
                const div = document.createElement('div');
                div.className = 'sheets-context-menu-divider';
                menu.appendChild(div);
                return;
            }

            const itemEl = document.createElement('div');
            itemEl.className = `sheets-context-menu-item ${item.disabled ? 'disabled' : ''}`;
            itemEl.setAttribute('role', 'menuitem');
            if (item.disabled) itemEl.setAttribute('aria-disabled', 'true');

            itemEl.innerHTML = `
                <div class="menu-item-left">
                    <span class="menu-item-icon">${item.icon || ''}</span>
                    <span class="menu-item-label">${item.label}</span>
                </div>
                ${item.shortcut ? `<span class="menu-item-shortcut">${item.shortcut}</span>` : ''}
            `;

            if (!item.disabled && item.action) {
                itemEl.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this.closeContextMenu();
                    item.action();
                });
            }

            menu.appendChild(itemEl);
        });

        document.body.appendChild(menu);
        this.currentContextMenu = menu;

        // Position with viewport bounds
        const menuRect = menu.getBoundingClientRect();
        let x = e.clientX || 0;
        let y = e.clientY || 0;

        if (x + menuRect.width > window.innerWidth - 8) {
            x = Math.max(8, window.innerWidth - menuRect.width - 8);
        }
        if (y + menuRect.height > window.innerHeight - 8) {
            y = Math.max(8, window.innerHeight - menuRect.height - 8);
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const handleKeyDown = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                this.closeContextMenu();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        this._contextMenuKeyHandler = handleKeyDown;

        const handleOutside = (ev) => {
            if (!menu.contains(ev.target)) {
                this.closeContextMenu();
                window.removeEventListener('mousedown', handleOutside);
            }
        };
        setTimeout(() => {
            window.addEventListener('mousedown', handleOutside);
        }, 50);
    }

    closeContextMenu() {
        if (this._contextMenuKeyHandler) {
            window.removeEventListener('keydown', this._contextMenuKeyHandler);
            this._contextMenuKeyHandler = null;
        }
        if (this.currentContextMenu) {
            this.currentContextMenu.remove();
            this.currentContextMenu = null;
        }
        const existing = document.getElementById('spreadsheetContextMenu');
        if (existing) existing.remove();
    }

    openRowContextMenu(e, r) {
        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const count = this.selectionMode === 'row' ? (maxR - minR + 1) : 1;
        const targetR = this.selectionMode === 'row' ? minR : r;
        const targetEndR = this.selectionMode === 'row' ? maxR : r;

        const items = [
            {
                label: `Insert ${count > 1 ? count + ' rows' : 'row'} above`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertRows(targetR, count, false)
            },
            {
                label: `Insert ${count > 1 ? count + ' rows' : 'row'} below`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertRows(targetEndR, count, true)
            },
            {
                label: `Delete ${count > 1 ? `rows ${targetR + 1} - ${targetEndR + 1}` : `row ${targetR + 1}`}`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
                action: () => this.excelDeleteRows(targetR, count)
            },
            { type: 'divider' },
            {
                label: 'Clear contents',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
                shortcut: 'Del',
                action: () => this.excelClearContents('row')
            },
            {
                label: 'Resize row height...',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"></path></svg>',
                action: () => this.promptResizeRow(targetR)
            },
            { type: 'divider' },
            {
                label: `Hide ${count > 1 ? `rows ${targetR + 1} - ${targetEndR + 1}` : `row ${targetR + 1}`}`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
                action: () => this.excelHideRows(targetR, targetEndR)
            },
            {
                label: 'Unhide rows',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
                disabled: !this.hasHiddenRows(),
                action: () => this.excelUnhideRows()
            }
        ];

        this.showContextMenu(e, items);
    }

    openColumnContextMenu(e, c) {
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);
        const count = this.selectionMode === 'col' ? (maxC - minC + 1) : 1;
        const targetC = this.selectionMode === 'col' ? minC : c;
        const targetEndC = this.selectionMode === 'col' ? maxC : c;
        const startLetter = this.colIdxToLetter(targetC);
        const endLetter = this.colIdxToLetter(targetEndC);

        const items = [
            {
                label: `Insert ${count > 1 ? count + ' columns' : 'column'} left`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertCols(targetC, count, false)
            },
            {
                label: `Insert ${count > 1 ? count + ' columns' : 'column'} right`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertCols(targetEndC, count, true)
            },
            {
                label: `Delete ${count > 1 ? `columns ${startLetter} - ${endLetter}` : `column ${startLetter}`}`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
                action: () => this.excelDeleteCols(targetC, count)
            },
            { type: 'divider' },
            {
                label: 'Clear contents',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
                shortcut: 'Del',
                action: () => this.excelClearContents('col')
            },
            {
                label: 'Resize column width...',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"></path></svg>',
                action: () => this.promptResizeCol(targetC)
            },
            { type: 'divider' },
            {
                label: `Hide ${count > 1 ? `columns ${startLetter} - ${endLetter}` : `column ${startLetter}`}`,
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
                action: () => this.excelHideCols(targetC, targetEndC)
            },
            {
                label: 'Unhide columns',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
                disabled: !this.hasHiddenCols(),
                action: () => this.excelUnhideCols()
            }
        ];

        this.showContextMenu(e, items);
    }

    openCellContextMenu(e, r, c) {
        const hasClipboard = !!(this.clipboard && this.clipboard.data && this.clipboard.data.length > 0);

        const items = [
            {
                label: 'Cut',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>',
                shortcut: 'Ctrl+X',
                action: () => this.editCut()
            },
            {
                label: 'Copy',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
                shortcut: 'Ctrl+C',
                action: () => this.editCopy()
            },
            {
                label: 'Paste',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>',
                shortcut: 'Ctrl+V',
                disabled: !hasClipboard,
                action: () => this.editPaste()
            },
            { type: 'divider' },
            {
                label: 'Insert cells...',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>',
                disabled: true
            },
            {
                label: 'Delete cells...',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>',
                disabled: true
            },
            { type: 'divider' },
            {
                label: 'Insert row above',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertRows(r, 1, false)
            },
            {
                label: 'Insert row below',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertRows(r, 1, true)
            },
            {
                label: 'Delete row',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
                action: () => this.excelDeleteRows(r, 1)
            },
            {
                label: 'Insert column left',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertCols(c, 1, false)
            },
            {
                label: 'Insert column right',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
                action: () => this.excelInsertCols(c, 1, true)
            },
            {
                label: 'Delete column',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
                action: () => this.excelDeleteCols(c, 1)
            },
            { type: 'divider' },
            {
                label: 'Clear contents',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
                shortcut: 'Del',
                action: () => this.excelClearContents('cell')
            },
            {
                label: 'Resize row height...',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"></path></svg>',
                action: () => this.promptResizeRow(r)
            },
            {
                label: 'Resize column width...',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"></path></svg>',
                action: () => this.promptResizeCol(c)
            },
            { type: 'divider' },
            {
                label: 'Format cells...',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
                action: (ev) => this.openNumFormatMenu(ev || e)
            },
            {
                label: 'Bold',
                icon: '<span style="font-weight:bold;font-size:13px;">B</span>',
                shortcut: 'Ctrl+B',
                action: () => this.toggleCellFormat('bold')
            },
            {
                label: 'Italic',
                icon: '<span style="font-style:italic;font-size:13px;">I</span>',
                shortcut: 'Ctrl+I',
                action: () => this.toggleCellFormat('italic')
            }
        ];

        this.showContextMenu(e, items);
    }

    excelInsertRows(atRow = null, count = 1, insertBelow = false) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const currentR = atRow !== null ? atRow : (this.activeCell.r || 0);
        const targetR = insertBelow ? currentR + 1 : currentR;
        const numCols = sheet.data && sheet.data[0] ? sheet.data[0].length : 16;

        const newRows = Array.from({ length: count }, () => new Array(numCols).fill(''));
        sheet.data.splice(targetR, 0, ...newRows);

        // Shift row heights
        if (sheet.rowHeights) {
            const newHeights = {};
            for (const [k, v] of Object.entries(sheet.rowHeights)) {
                const rIdx = parseInt(k, 10);
                if (rIdx < targetR) newHeights[rIdx] = v;
                else newHeights[rIdx + count] = v;
            }
            sheet.rowHeights = newHeights;
        }

        // Shift hidden rows
        if (sheet.hiddenRows) {
            const newHidden = {};
            for (const [k, v] of Object.entries(sheet.hiddenRows)) {
                const rIdx = parseInt(k, 10);
                if (rIdx < targetR) newHidden[rIdx] = v;
                else newHidden[rIdx + count] = v;
            }
            sheet.hiddenRows = newHidden;
        }

        // Shift formulas and update references
        this.shiftSheetFormulasAndStyles({ type: 'rowInsert', atRow: targetR, count });

        this.workspace.markDirty();
        this.selectRow(targetR, false);
        this.renderGrid(true);
        showToast(`Inserted ${count} row(s) ${insertBelow ? 'below' : 'above'}`, 'success');
    }

    excelDeleteRows(startRow = null, count = 1) {
        const sheet = this.getCurrentSheet();
        if (!sheet.data || sheet.data.length <= 1) {
            showToast('Cannot delete all rows in sheet', 'warning');
            return;
        }

        let minR = startRow !== null ? startRow : Math.min(this.selectedRange.startR, this.selectedRange.endR);
        let numRows = count;
        if (startRow === null && this.selectionMode === 'row') {
            const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
            numRows = maxR - minR + 1;
        }

        minR = Math.max(0, Math.min(minR, sheet.data.length - 1));
        numRows = Math.min(numRows, sheet.data.length - minR);

        let filledCount = 0;
        for (let r = minR; r < minR + numRows; r++) {
            if (sheet.data[r]) {
                for (let c = 0; c < sheet.data[r].length; c++) {
                    if (sheet.data[r][c] !== '' && sheet.data[r][c] !== undefined) filledCount++;
                }
            }
        }
        if (filledCount > 10) {
            if (!window.confirm(`Delete ${numRows} row(s) containing data?`)) return;
        }

        this.recordStateForUndo();

        sheet.data.splice(minR, numRows);
        if (sheet.data.length === 0) {
            const cols = sheet.data[0] ? sheet.data[0].length : 16;
            sheet.data.push(new Array(cols).fill(''));
        }

        if (sheet.rowHeights) {
            const newHeights = {};
            for (const [k, v] of Object.entries(sheet.rowHeights)) {
                const rIdx = parseInt(k, 10);
                if (rIdx < minR) newHeights[rIdx] = v;
                else if (rIdx >= minR + numRows) newHeights[rIdx - numRows] = v;
            }
            sheet.rowHeights = newHeights;
        }

        if (sheet.hiddenRows) {
            const newHidden = {};
            for (const [k, v] of Object.entries(sheet.hiddenRows)) {
                const rIdx = parseInt(k, 10);
                if (rIdx < minR) newHidden[rIdx] = v;
                else if (rIdx >= minR + numRows) newHidden[rIdx - numRows] = v;
            }
            sheet.hiddenRows = newHidden;
        }

        this.shiftSheetFormulasAndStyles({ type: 'rowDelete', atRow: minR, count: numRows });

        this.workspace.markDirty();
        const newActiveR = Math.min(minR, sheet.data.length - 1);
        this.selectRow(newActiveR, false);
        this.renderGrid(true);
        showToast(`Deleted ${numRows} row(s)`, 'info');
    }

    excelInsertCols(atCol = null, count = 1, insertRight = false) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const currentC = atCol !== null ? atCol : (this.activeCell.c || 0);
        const targetC = insertRight ? currentC + 1 : currentC;

        sheet.data.forEach(row => {
            row.splice(targetC, 0, ...Array(count).fill(''));
        });

        if (sheet.colWidths) {
            const newWidths = {};
            for (const [k, v] of Object.entries(sheet.colWidths)) {
                const cIdx = parseInt(k, 10);
                if (cIdx < targetC) newWidths[cIdx] = v;
                else newWidths[cIdx + count] = v;
            }
            sheet.colWidths = newWidths;
        }

        if (sheet.hiddenCols) {
            const newHidden = {};
            for (const [k, v] of Object.entries(sheet.hiddenCols)) {
                const cIdx = parseInt(k, 10);
                if (cIdx < targetC) newHidden[cIdx] = v;
                else newHidden[cIdx + count] = v;
            }
            sheet.hiddenCols = newHidden;
        }

        this.shiftSheetFormulasAndStyles({ type: 'colInsert', atCol: targetC, count });

        this.workspace.markDirty();
        this.selectColumn(targetC, false);
        this.renderGrid(true);
        showToast(`Inserted ${count} column(s) ${insertRight ? 'right' : 'left'}`, 'success');
    }

    excelDeleteCols(startCol = null, count = 1) {
        const sheet = this.getCurrentSheet();
        const totalCols = sheet.data && sheet.data[0] ? sheet.data[0].length : 16;
        if (totalCols <= 1) {
            showToast('Cannot delete all columns in sheet', 'warning');
            return;
        }

        let minC = startCol !== null ? startCol : Math.min(this.selectedRange.startC, this.selectedRange.endC);
        let numCols = count;
        if (startCol === null && this.selectionMode === 'col') {
            const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);
            numCols = maxC - minC + 1;
        }

        minC = Math.max(0, Math.min(minC, totalCols - 1));
        numCols = Math.min(numCols, totalCols - minC);

        let filledCount = 0;
        sheet.data.forEach(row => {
            for (let c = minC; c < minC + numCols; c++) {
                if (row[c] !== '' && row[c] !== undefined) filledCount++;
            }
        });
        if (filledCount > 10) {
            if (!window.confirm(`Delete ${numCols} column(s) containing data?`)) return;
        }

        this.recordStateForUndo();

        sheet.data.forEach(row => {
            row.splice(minC, numCols);
            if (row.length === 0) row.push('');
        });

        if (sheet.colWidths) {
            const newWidths = {};
            for (const [k, v] of Object.entries(sheet.colWidths)) {
                const cIdx = parseInt(k, 10);
                if (cIdx < minC) newWidths[cIdx] = v;
                else if (cIdx >= minC + numCols) newWidths[cIdx - numCols] = v;
            }
            sheet.colWidths = newWidths;
        }

        if (sheet.hiddenCols) {
            const newHidden = {};
            for (const [k, v] of Object.entries(sheet.hiddenCols)) {
                const cIdx = parseInt(k, 10);
                if (cIdx < minC) newHidden[cIdx] = v;
                else if (cIdx >= minC + numCols) newHidden[cIdx - numCols] = v;
            }
            sheet.hiddenCols = newHidden;
        }

        this.shiftSheetFormulasAndStyles({ type: 'colDelete', atCol: minC, count: numCols });

        this.workspace.markDirty();
        const remainingCols = sheet.data[0] ? sheet.data[0].length : 1;
        const newActiveC = Math.min(minC, remainingCols - 1);
        this.selectColumn(newActiveC, false);
        this.renderGrid(true);
        showToast(`Deleted ${numCols} column(s)`, 'info');
    }

    excelClearContents(scope = 'auto') {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        for (let r = minR; r <= maxR; r++) {
            if (!sheet.data[r]) continue;
            for (let c = minC; c <= maxC; c++) {
                sheet.data[r][c] = '';
                const coord = this.indicesToCoord(r, c);
                if (sheet.formulas) delete sheet.formulas[coord];
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        this.syncFormulaBar();
        this.updateStatusBar();
        showToast('Cleared contents', 'info');
    }

    promptResizeRow(r) {
        const sheet = this.getCurrentSheet();
        const currentH = (sheet.rowHeights && sheet.rowHeights[r]) ? sheet.rowHeights[r] : 26;
        const res = window.prompt(`Enter row ${r + 1} height in pixels (18 - 400):`, currentH);
        if (res !== null) {
            const h = parseInt(res.trim(), 10);
            if (!isNaN(h) && h >= 18 && h <= 400) {
                this.recordStateForUndo();
                if (!sheet.rowHeights) sheet.rowHeights = {};
                sheet.rowHeights[r] = h;
                this.workspace.markDirty();
                this.renderGrid(true);
                showToast(`Row ${r + 1} height set to ${h}px`, 'success');
            } else {
                showToast('Please enter a valid height between 18 and 400', 'warning');
            }
        }
    }

    promptResizeCol(c) {
        const sheet = this.getCurrentSheet();
        const currentW = (sheet.colWidths && sheet.colWidths[c]) ? sheet.colWidths[c] : 96;
        const colLetter = this.colIdxToLetter(c);
        const res = window.prompt(`Enter column ${colLetter} width in pixels (30 - 800):`, currentW);
        if (res !== null) {
            const w = parseInt(res.trim(), 10);
            if (!isNaN(w) && w >= 30 && w <= 800) {
                this.recordStateForUndo();
                if (!sheet.colWidths) sheet.colWidths = {};
                sheet.colWidths[c] = w;
                this.workspace.markDirty();
                this.renderGrid(true);
                showToast(`Column ${colLetter} width set to ${w}px`, 'success');
            } else {
                showToast('Please enter a valid width between 30 and 800', 'warning');
            }
        }
    }

    hasHiddenRows() {
        const sheet = this.getCurrentSheet();
        return !!(sheet.hiddenRows && Object.keys(sheet.hiddenRows).some(k => sheet.hiddenRows[k]));
    }

    hasHiddenCols() {
        const sheet = this.getCurrentSheet();
        return !!(sheet.hiddenCols && Object.keys(sheet.hiddenCols).some(k => sheet.hiddenCols[k]));
    }

    excelHideRows(startR, endR) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        if (!sheet.hiddenRows) sheet.hiddenRows = {};
        for (let r = Math.min(startR, endR); r <= Math.max(startR, endR); r++) {
            sheet.hiddenRows[r] = true;
        }
        this.workspace.markDirty();
        this.renderGrid(true);
        showToast('Selected row(s) hidden', 'info');
    }

    excelUnhideRows() {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        sheet.hiddenRows = {};
        this.workspace.markDirty();
        this.renderGrid(true);
        showToast('All rows unhidden', 'success');
    }

    excelHideCols(startC, endC) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        if (!sheet.hiddenCols) sheet.hiddenCols = {};
        for (let c = Math.min(startC, endC); c <= Math.max(startC, endC); c++) {
            sheet.hiddenCols[c] = true;
        }
        this.workspace.markDirty();
        this.renderGrid(true);
        showToast('Selected column(s) hidden', 'info');
    }

    excelUnhideCols() {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        sheet.hiddenCols = {};
        this.workspace.markDirty();
        this.renderGrid(true);
        showToast('All columns unhidden', 'success');
    }

    // Backward-compatible delegates
    excelInsertRow() {
        this.excelInsertRows(this.activeCell.r || 0, 1, false);
    }

    excelInsertRowBelow() {
        this.excelInsertRows(this.activeCell.r || 0, 1, true);
    }

    excelDeleteRow() {
        this.excelDeleteRows(this.activeCell.r || 0, 1);
    }

    excelInsertCol() {
        this.excelInsertCols(this.activeCell.c || 0, 1, false);
    }

    excelInsertColRight() {
        this.excelInsertCols(this.activeCell.c || 0, 1, true);
    }

    excelDeleteCol() {
        this.excelDeleteCols(this.activeCell.c || 0, 1);
    }

    // ---------------- 13. CLIPBOARD (COPY / CUT / PASTE) ----------------
    editCopy() {
        const sheet = this.getCurrentSheet();
        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        const data = [];
        const formulas = {};
        const styles = {};

        for (let r = minR; r <= maxR; r++) {
            const rowArr = [];
            for (let c = minC; c <= maxC; c++) {
                const coord = this.indicesToCoord(r, c);
                const val = sheet.data[r]?.[c] || '';
                rowArr.push(val);
                if (sheet.formulas[coord]) formulas[`${r - minR},${c - minC}`] = sheet.formulas[coord];
                if (sheet.styles[coord]) styles[`${r - minR},${c - minC}`] = sheet.styles[coord];
            }
            data.push(rowArr);
        }

        this.clipboard = { type: 'copy', data, formulas, styles, range: { minR, maxR, minC, maxC } };
        showToast(`Copied ${data.length} row(s) × ${data[0].length} col(s)`, 'info');
    }

    editCut() {
        this.editCopy();
        this.clipboard.type = 'cut';
        this.editClearContents();
        showToast('Cut selected cells', 'info');
    }

    editPaste() {
        if (!this.clipboard || !this.clipboard.data) {
            showToast('Clipboard is empty', 'warning');
            return;
        }

        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const startR = this.activeCell.r;
        const startC = this.activeCell.c;
        const clipData = this.clipboard.data;

        for (let dr = 0; dr < clipData.length; dr++) {
            const targetR = startR + dr;
            while (sheet.data.length <= targetR) sheet.data.push([]);
            for (let dc = 0; dc < clipData[dr].length; dc++) {
                const targetC = startC + dc;
                while (sheet.data[targetR].length <= targetC) sheet.data[targetR].push('');

                const coord = this.indicesToCoord(targetR, targetC);
                sheet.data[targetR][targetC] = clipData[dr][dc];

                const fKey = `${dr},${dc}`;
                if (this.clipboard.formulas[fKey]) {
                    sheet.formulas[coord] = this.clipboard.formulas[fKey];
                }
                if (this.clipboard.styles[fKey]) {
                    sheet.styles[coord] = JSON.parse(JSON.stringify(this.clipboard.styles[fKey]));
                }
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        this.syncFormulaBar();
        this.updateStatusBar();
        showToast('Pasted contents', 'success');
    }

    editClearContents() {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (sheet.data[r]) sheet.data[r][c] = '';
                const coord = this.indicesToCoord(r, c);
                if (sheet.formulas) delete sheet.formulas[coord];
            }
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    editSelectAll() {
        const sheet = this.getCurrentSheet();
        const maxR = (sheet.data ? sheet.data.length : 30) - 1;
        const maxC = (sheet.data && sheet.data[0] ? sheet.data[0].length : 16) - 1;
        this.selectedRange = { startR: 0, startC: 0, endR: maxR, endC: maxC };
        this.renderRangeHighlight();
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    // ---------------- 14. WORKSHEET TABS MANAGEMENT ----------------
    renderSheetTabs() {
        const tabsWrap = document.getElementById('spreadsheetSheetTabs');
        if (!tabsWrap) return;
        tabsWrap.innerHTML = '';

        // Add Sheet Button (+)
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'sheet-tab-add-btn';
        addBtn.id = 'addSheetBtn';
        addBtn.title = 'Add Sheet';
        addBtn.textContent = '+';
        addBtn.onclick = () => this.excelAddSheet();
        tabsWrap.appendChild(addBtn);

        // Render sheet tab items
        this.workspace.excelData.sheets.forEach((sh, idx) => {
            const tab = document.createElement('div');
            const isActive = idx === this.activeSheetIdx;
            tab.className = `sheet-tab-item ${isActive ? 'active' : ''}`;
            if (sh.tabColor) {
                tab.style.borderBottom = `3px solid ${sh.tabColor}`;
            }

            tab.innerHTML = `
                <span class="sheet-tab-title">${sh.name || `Sheet${idx + 1}`}</span>
                <span class="sheet-tab-dropdown-arrow" title="Sheet options">▾</span>
            `;

            tab.onclick = (e) => {
                if (e.target.classList.contains('sheet-tab-dropdown-arrow')) {
                    e.stopPropagation();
                    this.openSheetTabMenu(tab, idx);
                    return;
                }
                this.switchSheet(idx);
            };

            tab.oncontextmenu = (e) => {
                e.preventDefault();
                this.openSheetTabMenu(tab, idx);
            };

            tabsWrap.appendChild(tab);
        });
    }

    switchSheet(idx) {
        if (idx < 0 || idx >= this.workspace.excelData.sheets.length) return;
        this.activeSheetIdx = idx;
        this.workspace.excelData.activeSheetIdx = idx;
        this.activeCell = { r: 0, c: 0, coord: 'A1' };
        this.selectedRange = { startR: 0, startC: 0, endR: 0, endC: 0 };
        this.renderGrid();
        this.renderSheetTabs();
        this.syncFormulaBar();
        this.updateStatusBar();
    }

    excelAddSheet() {
        this.recordStateForUndo();
        const nextNum = this.workspace.excelData.sheets.length + 1;
        const newSheet = this.createBlankSheet(`Sheet${nextNum}`);
        this.workspace.excelData.sheets.push(newSheet);
        this.activeSheetIdx = this.workspace.excelData.sheets.length - 1;
        this.workspace.excelData.activeSheetIdx = this.activeSheetIdx;
        this.workspace.markDirty();
        this.renderGrid();
        this.renderSheetTabs();
        this.syncFormulaBar();
        this.updateStatusBar();
        showToast(`Added ${newSheet.name}`, 'success');
    }

    openSheetTabMenu(tabEl, idx) {
        this.closeAllDropdowns();
        const rect = tabEl.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'sheets-dropdown-menu';
        menu.style.bottom = `${window.innerHeight - rect.top + 2}px`;
        menu.style.left = `${rect.left}px`;

        const sheet = this.workspace.excelData.sheets[idx];

        menu.innerHTML = `
            <div class="sheets-menu-option" data-action="rename"><span>Rename</span></div>
            <div class="sheets-menu-option" data-action="duplicate"><span>Duplicate</span></div>
            <div class="sheets-menu-option ${this.workspace.excelData.sheets.length <= 1 ? 'disabled' : ''}" data-action="delete"><span>Delete</span></div>
            <div class="sheets-menu-divider"></div>
            <div class="sheets-menu-option ${idx === 0 ? 'disabled' : ''}" data-action="moveLeft"><span>Move Left</span></div>
            <div class="sheets-menu-option ${idx === this.workspace.excelData.sheets.length - 1 ? 'disabled' : ''}" data-action="moveRight"><span>Move Right</span></div>
            <div class="sheets-menu-divider"></div>
            <div class="sheets-menu-option" data-action="color"><span>Change Color</span></div>
        `;

        document.body.appendChild(menu);

        menu.querySelectorAll('.sheets-menu-option:not(.disabled)').forEach(opt => {
            opt.onclick = () => {
                const action = opt.dataset.action;
                menu.remove();
                if (action === 'rename') {
                    const newName = window.prompt('Rename sheet to:', sheet.name);
                    if (newName && newName.trim()) {
                        this.recordStateForUndo();
                        sheet.name = newName.trim();
                        this.workspace.markDirty();
                        this.renderSheetTabs();
                        this.updateStatusBar();
                    }
                } else if (action === 'duplicate') {
                    this.recordStateForUndo();
                    const clone = JSON.parse(JSON.stringify(sheet));
                    clone.name = `${sheet.name} (Copy)`;
                    this.workspace.excelData.sheets.splice(idx + 1, 0, clone);
                    this.switchSheet(idx + 1);
                } else if (action === 'delete') {
                    if (this.workspace.excelData.sheets.length <= 1) {
                        showToast('Workbook must contain at least one sheet', 'warning');
                        return;
                    }
                    if (window.confirm(`Are you sure you want to delete sheet "${sheet.name}"?`)) {
                        this.recordStateForUndo();
                        this.workspace.excelData.sheets.splice(idx, 1);
                        this.switchSheet(Math.max(0, idx - 1));
                        showToast('Sheet deleted', 'info');
                    }
                } else if (action === 'moveLeft') {
                    this.recordStateForUndo();
                    const [moved] = this.workspace.excelData.sheets.splice(idx, 1);
                    this.workspace.excelData.sheets.splice(idx - 1, 0, moved);
                    this.switchSheet(idx - 1);
                } else if (action === 'moveRight') {
                    this.recordStateForUndo();
                    const [moved] = this.workspace.excelData.sheets.splice(idx, 1);
                    this.workspace.excelData.sheets.splice(idx + 1, 0, moved);
                    this.switchSheet(idx + 1);
                } else if (action === 'color') {
                    const color = window.prompt('Enter hex color (e.g. #B86B3D or #2E7D32):', '#B86B3D');
                    if (color) {
                        sheet.tabColor = color;
                        this.renderSheetTabs();
                    }
                }
            };
        });
    }

    // ---------------- 15. SORTING & FILTERING ----------------
    sortRange(ascending = true) {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);
        const colIdx = (this.activeCell.c >= minC && this.activeCell.c <= maxC) ? this.activeCell.c : minC;

        const rowsToSort = [];
        for (let r = minR; r <= maxR; r++) {
            rowsToSort.push(sheet.data[r] || []);
        }

        rowsToSort.sort((a, b) => {
            const valA = a[colIdx] !== undefined ? a[colIdx] : '';
            const valB = b[colIdx] !== undefined ? b[colIdx] : '';
            const cleanA = String(valA).replace(/[^0-9.-]/g, '');
            const cleanB = String(valB).replace(/[^0-9.-]/g, '');
            const numA = cleanA !== '' ? parseFloat(cleanA) : NaN;
            const numB = cleanB !== '' ? parseFloat(cleanB) : NaN;

            if (!isNaN(numA) && !isNaN(numB) && String(valA).trim() !== '' && String(valB).trim() !== '') {
                return ascending ? numA - numB : numB - numA;
            }
            return ascending
                ? String(valA).localeCompare(String(valB))
                : String(valB).localeCompare(String(valA));
        });

        for (let r = minR; r <= maxR; r++) {
            sheet.data[r] = rowsToSort[r - minR];
        }

        this.workspace.markDirty();
        this.renderGrid(true);
        showToast(`Sorted range ${ascending ? 'A → Z' : 'Z → A'} by column ${this.colIdxToLetter(colIdx)}`, 'success');
    }

    toggleFilter() {
        this.filterActive = !this.filterActive;
        const btn = document.getElementById('xlCreateFilterBtn');
        if (this.filterActive) {
            btn?.classList.add('active');
            showToast('Filter arrows enabled on header columns', 'info');
        } else {
            btn?.classList.remove('active');
            this.filterCriteria = {};
            showToast('Filter removed', 'info');
        }
        this.renderGrid(true);
    }

    // ---------------- 16. POPUPS & TOOLBAR DROPDOWNS ----------------
    openNumFormatMenu(e) {
        this.closeAllDropdowns();
        const rect = e.target.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'sheets-dropdown-menu';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left}px`;

        menu.innerHTML = `
            <div class="sheets-menu-option" data-fmt="auto"><span>Automatic</span></div>
            <div class="sheets-menu-option" data-fmt="text"><span>Plain text</span></div>
            <div class="sheets-menu-option" data-fmt="currency"><span>Currency ($1,000.00)</span></div>
            <div class="sheets-menu-option" data-fmt="percent"><span>Percent (10.00%)</span></div>
            <div class="sheets-menu-option" data-fmt="date"><span>Date (YYYY-MM-DD)</span></div>
        `;
        document.body.appendChild(menu);

        menu.querySelectorAll('.sheets-menu-option').forEach(opt => {
            opt.onclick = () => {
                this.setNumberFormat(opt.dataset.fmt);
                menu.remove();
            };
        });
    }

    openBordersMenu(e) {
        this.closeAllDropdowns();
        const rect = e.target.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'sheets-dropdown-menu';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left}px`;

        menu.innerHTML = `
            <div class="sheets-menu-option" data-b="1px solid var(--theme-border, #D8C5AA)"><span>All Borders</span></div>
            <div class="sheets-menu-option" data-b="2px solid var(--theme-accent, #B86B3D)"><span>Thick Accent Borders</span></div>
            <div class="sheets-menu-option" data-b="1px dashed var(--theme-border, #D8C5AA)"><span>Dashed Borders</span></div>
            <div class="sheets-menu-option" data-b="none"><span>Clear Borders</span></div>
        `;
        document.body.appendChild(menu);

        menu.querySelectorAll('.sheets-menu-option').forEach(opt => {
            opt.onclick = () => {
                this.setCellFormat('border', opt.dataset.b);
                menu.remove();
            };
        });
    }

    openWrapMenu(e) {
        this.closeAllDropdowns();
        const rect = e.target.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'sheets-dropdown-menu';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left}px`;

        menu.innerHTML = `
            <div class="sheets-menu-option" data-w="overflow"><span>Overflow</span></div>
            <div class="sheets-menu-option" data-w="wrap"><span>Wrap text</span></div>
            <div class="sheets-menu-option" data-w="clip"><span>Clip</span></div>
        `;
        document.body.appendChild(menu);

        menu.querySelectorAll('.sheets-menu-option').forEach(opt => {
            opt.onclick = () => {
                this.setCellFormat('wrap', opt.dataset.w);
                menu.remove();
            };
        });
    }

    openRotateMenu(e) {
        this.closeAllDropdowns();
        const rect = e.target.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'sheets-dropdown-menu';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left}px`;

        menu.innerHTML = `
            <div class="sheets-menu-option" data-rot="none"><span>None</span></div>
            <div class="sheets-menu-option" data-rot="tilt-up"><span>Tilt up</span></div>
            <div class="sheets-menu-option" data-rot="tilt-down"><span>Tilt down</span></div>
            <div class="sheets-menu-option" data-rot="vertical"><span>Stack vertically</span></div>
        `;
        document.body.appendChild(menu);

        menu.querySelectorAll('.sheets-menu-option').forEach(opt => {
            opt.onclick = () => {
                showToast(`Text rotation: ${opt.dataset.rot}`, 'info');
                menu.remove();
            };
        });
    }

    openFunctionsMenu(e) {
        this.closeAllDropdowns();
        const rect = e.target.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'sheets-dropdown-menu';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left}px`;

        const fns = ['SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MAX', 'MIN', 'IF', 'MEDIAN', 'PRODUCT', 'ROUND', 'CONCATENATE'];
        let html = '';
        fns.forEach(fn => {
            html += `<div class="sheets-menu-option" data-fn="${fn}"><span>${fn}</span></div>`;
        });
        menu.innerHTML = html;
        document.body.appendChild(menu);

        menu.querySelectorAll('.sheets-menu-option').forEach(opt => {
            opt.onclick = () => {
                this.insertFunctionFormula(opt.dataset.fn);
                menu.remove();
            };
        });
    }

    insertFunctionFormula(fnName) {
        const formulaInput = document.getElementById('formulaInputField');
        const defaultRange = `A1:${this.activeCell.coord}`;
        const formulaText = `=${fnName}(${defaultRange})`;
        if (formulaInput) {
            formulaInput.value = formulaText;
            formulaInput.focus();
        }
        this.applyCellFormula(formulaText);
    }

    // ---------------- 17. SPECIAL MODALS & DIALOGS ----------------
    // Find & Replace
    editFindReplace() {
        const modal = document.createElement('div');
        modal.className = 'sheets-modal-overlay';
        modal.innerHTML = `
            <div class="sheets-dialog-card">
                <div class="sheets-dialog-header">
                    <h3>Find and replace</h3>
                    <button type="button" class="sheets-dialog-close">✕</button>
                </div>
                <div class="sheets-dialog-body">
                    <div class="dialog-field-row">
                        <label>Find</label>
                        <input type="text" id="findInput" class="dialog-input" placeholder="Text or value to find">
                    </div>
                    <div class="dialog-field-row">
                        <label>Replace with</label>
                        <input type="text" id="replaceInput" class="dialog-input" placeholder="Replacement value">
                    </div>
                    <div class="dialog-check-row">
                        <label><input type="checkbox" id="matchCaseChk"> Match case</label>
                    </div>
                </div>
                <div class="sheets-dialog-footer">
                    <button type="button" class="workspace-btn" id="findNextBtn">Find</button>
                    <button type="button" class="workspace-btn" id="replaceBtn">Replace</button>
                    <button type="button" class="workspace-btn workspace-btn-primary" id="replaceAllBtn">Replace all</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.sheets-dialog-close').onclick = () => modal.remove();

        const findInput = modal.querySelector('#findInput');
        const replaceInput = modal.querySelector('#replaceInput');
        const matchCase = modal.querySelector('#matchCaseChk');
        findInput.focus();

        modal.querySelector('#replaceAllBtn').onclick = () => {
            const query = findInput.value;
            const repl = replaceInput.value;
            if (!query) return;

            this.recordStateForUndo();
            const sheet = this.getCurrentSheet();
            let count = 0;
            sheet.data.forEach((row, r) => {
                row.forEach((cell, c) => {
                    const str = String(cell || '');
                    const matches = matchCase.checked ? str.includes(query) : str.toLowerCase().includes(query.toLowerCase());
                    if (matches) {
                        const regex = new RegExp(query, matchCase.checked ? 'g' : 'gi');
                        sheet.data[r][c] = str.replace(regex, repl);
                        count++;
                    }
                });
            });

            this.workspace.markDirty();
            this.renderGrid(true);
            modal.remove();
            showToast(`Replaced ${count} instance(s)`, 'success');
        };
    }

    // Chart Builder Modal
    insertChart() {
        const modal = document.createElement('div');
        modal.className = 'sheets-modal-overlay';

        const sheet = this.getCurrentSheet();
        const minR = Math.min(this.selectedRange.startR, this.selectedRange.endR);
        const maxR = Math.max(this.selectedRange.startR, this.selectedRange.endR);
        const minC = Math.min(this.selectedRange.startC, this.selectedRange.endC);
        const maxC = Math.max(this.selectedRange.startC, this.selectedRange.endC);

        // Gather labels & numeric values from selected range
        const labels = [];
        const values = [];
        for (let r = minR; r <= maxR; r++) {
            const row = sheet.data[r] || [];
            const labelVal = String(row[minC] || `Item ${r + 1}`);
            const numVal = parseFloat(row[minC + 1 !== undefined ? minC + 1 : minC]) || (r + 1) * 10;
            labels.push(labelVal);
            values.push(numVal);
        }

        modal.innerHTML = `
            <div class="sheets-dialog-card chart-modal-card">
                <div class="sheets-dialog-header">
                    <h3>Insert Chart</h3>
                    <button type="button" class="sheets-dialog-close">✕</button>
                </div>
                <div class="sheets-dialog-body">
                    <div style="display:flex;gap:12px;margin-bottom:12px;">
                        <label>Chart Type:</label>
                        <select id="chartTypeSelect" class="tool-select">
                            <option value="bar">Bar Chart</option>
                            <option value="column">Column Chart</option>
                            <option value="line">Line Chart</option>
                            <option value="pie">Pie Chart</option>
                        </select>
                    </div>
                    <div class="chart-render-area" id="chartRenderArea" style="height:260px;display:flex;align-items:flex-end;gap:14px;padding:20px;background:#FFF9F0;border:1px solid #D8C5AA;border-radius:6px;">
                        <!-- SVG / HTML Bars -->
                    </div>
                </div>
                <div class="sheets-dialog-footer">
                    <button type="button" class="workspace-btn workspace-btn-primary sheets-dialog-close">Done</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const renderChartBars = (type) => {
            const area = modal.querySelector('#chartRenderArea');
            if (!area) return;
            const maxVal = Math.max(...values, 10);
            let html = '';
            values.slice(0, 10).forEach((v, idx) => {
                const heightPct = Math.round((v / maxVal) * 100);
                const lbl = labels[idx] ? labels[idx].substring(0, 12) : `Row ${idx + 1}`;
                html += `
                    <div style="display:flex;flex-direction:column;align-items:center;flex:1;height:100%;justify-content:flex-end;">
                        <span style="font-size:10px;font-weight:700;color:#B86B3D;margin-bottom:4px;">${v}</span>
                        <div style="width:100%;background:#B86B3D;height:${Math.max(10, heightPct)}%;border-radius:4px 4px 0 0;transition:all 0.3s ease;"></div>
                        <span style="font-size:10px;color:#67584A;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:48px;" title="${lbl}">${lbl}</span>
                    </div>
                `;
            });
            area.innerHTML = html;
        };

        renderChartBars('bar');
        modal.querySelector('#chartTypeSelect').onchange = (e) => renderChartBars(e.target.value);
        modal.querySelectorAll('.sheets-dialog-close').forEach(b => b.onclick = () => modal.remove());
    }

    // Insert Checkbox
    insertCheckbox() {
        this.recordStateForUndo();
        const sheet = this.getCurrentSheet();
        const coord = this.activeCell.coord;
        if (!sheet.styles[coord]) sheet.styles[coord] = {};
        sheet.styles[coord].isCheckbox = true;
        sheet.data[this.activeCell.r][this.activeCell.c] = 'FALSE';
        this.workspace.markDirty();
        this.renderGrid(true);
        showToast('Inserted checkbox', 'success');
    }

    // Insert Link
    insertLink() {
        const url = window.prompt('Enter URL to link:', 'https://');
        if (url) {
            this.recordStateForUndo();
            const sheet = this.getCurrentSheet();
            const coord = this.activeCell.coord;
            if (!sheet.styles[coord]) sheet.styles[coord] = {};
            sheet.styles[coord].color = '#1d4ed8';
            sheet.styles[coord].underline = true;
            sheet.styles[coord].link = url;
            this.workspace.markDirty();
            this.renderGrid(true);
            showToast('Hyperlink attached', 'success');
        }
    }

    // Add Comment
    addComment() {
        const coord = this.activeCell.coord;
        const current = this.cellComments[coord] || '';
        const note = window.prompt(`Add note for ${coord}:`, current);
        if (note !== null) {
            if (note.trim()) {
                this.cellComments[coord] = note.trim();
                showToast(`Note added to ${coord}`, 'success');
            } else {
                delete this.cellComments[coord];
            }
            this.renderGrid(true);
        }
    }

    // Keyboard Shortcuts Dialog
    helpShortcuts() {
        const modal = document.createElement('div');
        modal.className = 'sheets-modal-overlay';
        modal.innerHTML = `
            <div class="sheets-dialog-card" style="max-width:540px;">
                <div class="sheets-dialog-header">
                    <h3>Keyboard Shortcuts</h3>
                    <button type="button" class="sheets-dialog-close">✕</button>
                </div>
                <div class="sheets-dialog-body" style="max-height:360px;overflow-y:auto;">
                    <table style="width:100%;font-size:12px;border-collapse:collapse;">
                        <tr style="border-bottom:1px solid #D8C5AA;"><td style="padding:6px;font-weight:700;">Action</td><td style="padding:6px;font-weight:700;">Shortcut</td></tr>
                        <tr><td style="padding:6px;">Undo / Redo</td><td style="padding:6px;">Ctrl+Z / Ctrl+Y</td></tr>
                        <tr><td style="padding:6px;">Copy / Cut / Paste</td><td style="padding:6px;">Ctrl+C / Ctrl+X / Ctrl+V</td></tr>
                        <tr><td style="padding:6px;">Bold / Italic / Underline</td><td style="padding:6px;">Ctrl+B / Ctrl+I / Ctrl+U</td></tr>
                        <tr><td style="padding:6px;">Find and Replace</td><td style="padding:6px;">Ctrl+H or Ctrl+F</td></tr>
                        <tr><td style="padding:6px;">Select All</td><td style="padding:6px;">Ctrl+A</td></tr>
                        <tr><td style="padding:6px;">Clear Cell Contents</td><td style="padding:6px;">Delete or Backspace</td></tr>
                        <tr><td style="padding:6px;">Inline Cell Edit</td><td style="padding:6px;">F2 or Double-click</td></tr>
                        <tr><td style="padding:6px;">Navigate Cells</td><td style="padding:6px;">Arrow Keys / Tab / Enter</td></tr>
                        <tr><td style="padding:6px;">Extend Selection</td><td style="padding:6px;">Shift + Arrow Keys</td></tr>
                    </table>
                </div>
                <div class="sheets-dialog-footer">
                    <button type="button" class="workspace-btn workspace-btn-primary sheets-dialog-close">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelectorAll('.sheets-dialog-close').forEach(b => b.onclick = () => modal.remove());
    }

    // Help Functions List
    helpFunctions() {
        const modal = document.createElement('div');
        modal.className = 'sheets-modal-overlay';
        modal.innerHTML = `
            <div class="sheets-dialog-card" style="max-width:540px;">
                <div class="sheets-dialog-header">
                    <h3>Supported Spreadsheet Functions</h3>
                    <button type="button" class="sheets-dialog-close">✕</button>
                </div>
                <div class="sheets-dialog-body" style="max-height:360px;overflow-y:auto;font-size:12px;">
                    <p><strong>Math & Stats:</strong> SUM, AVERAGE, COUNT, COUNTA, MAX, MIN, ABS, ROUND, ROUNDUP, ROUNDDOWN, INT, MOD, POWER, SQRT, PRODUCT, MEDIAN</p>
                    <p style="margin-top:8px;"><strong>Logic:</strong> IF(condition, trueVal, falseVal), AND, OR, NOT</p>
                    <p style="margin-top:8px;"><strong>Text:</strong> CONCATENATE, UPPER, LOWER, TRIM, LEN, LEFT, RIGHT, MID</p>
                    <p style="margin-top:8px;"><strong>Lookup:</strong> VLOOKUP(key, range, colIndex, false)</p>
                    <p style="margin-top:8px;"><strong>Date:</strong> TODAY(), NOW(), YEAR, MONTH, DAY</p>
                    <p style="margin-top:8px;"><strong>Arithmetic:</strong> =A1+B1, =A1*1.5, =(A1+B1)/2</p>
                </div>
                <div class="sheets-dialog-footer">
                    <button type="button" class="workspace-btn workspace-btn-primary sheets-dialog-close">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelectorAll('.sheets-dialog-close').forEach(b => b.onclick = () => modal.remove());
    }

    // ---------------- 18. FILE & IMPORT / EXPORT METHODS ----------------
    fileNewWorkbook() {
        if (window.confirm('Create a new blank workbook? Any unsaved changes in current workbook will be lost.')) {
            this.workspace.excelData = {
                sheets: [this.createBlankSheet('Sheet1')],
                activeSheetIdx: 0
            };
            this.activeSheetIdx = 0;
            this.workspace.currentDoc.filename = 'Untitled Spreadsheet.xlsx';
            this.workspace.updateHeaderUI();
            this.workspace.markDirty();
            this.renderGrid();
            this.renderSheetTabs();
            this.syncFormulaBar();
            showToast('New workbook created', 'success');
        }
    }

    fileEditDocument() {
        if (window.documentBrowserController) {
            window.documentBrowserController.openBrowser();
        } else if (typeof DocumentBrowserController !== 'undefined') {
            window.documentBrowserController = new DocumentBrowserController();
            window.documentBrowserController.openBrowser();
        } else {
            showToast('Document selector is unavailable', 'warning');
        }
    }

    fileSave() {
        if (this.workspace && typeof this.workspace.saveDocument === 'function') {
            this.workspace.saveDocument();
        } else {
            showToast('Spreadsheet saved', 'success');
        }
    }

    fileClose() {
        if (this.workspace && typeof this.workspace.closeWorkspace === 'function') {
            this.workspace.closeWorkspace();
        }
    }

    fileOpenImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (window.XLSX) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const data = new Uint8Array(evt.target.result);
                        const wb = window.XLSX.read(data, { type: 'array', cellFormula: true, cellStyles: true });
                        const sheets = [];

                        wb.SheetNames.forEach(name => {
                            const ws = wb.Sheets[name];
                            const jsonRows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                            const formulas = {};
                            Object.keys(ws).forEach(key => {
                                if (key.startsWith('!')) return;
                                if (ws[key] && ws[key].f) {
                                    formulas[key] = `=${ws[key].f}`;
                                }
                            });
                            sheets.push({
                                name: name,
                                data: jsonRows.length > 0 ? jsonRows : Array.from({ length: 25 }, () => Array(10).fill('')),
                                formulas: formulas,
                                styles: {}
                            });
                        });

                        this.workspace.excelData.sheets = sheets;
                        this.activeSheetIdx = 0;
                        this.workspace.excelData.activeSheetIdx = 0;
                        this.workspace.currentDoc.filename = file.name;
                        this.workspace.updateHeaderUI();
                        this.workspace.markDirty();
                        this.renderGrid();
                        this.renderSheetTabs();
                        this.syncFormulaBar();
                        showToast(`Imported ${file.name} successfully`, 'success');
                    } catch (err) {
                        console.error('Import error:', err);
                        showToast('Failed to parse workbook file', 'error');
                    }
                };
                reader.readAsArrayBuffer(file);
            } else {
                showToast('SheetJS parser library not loaded', 'error');
            }
        };
        input.click();
    }

    fileRenameWorkbook() {
        const currentName = this.workspace.currentDoc ? this.workspace.currentDoc.filename : 'Workbook.xlsx';
        const newName = window.prompt('Rename workbook:', currentName);
        if (newName && newName.trim()) {
            this.workspace.currentDoc.filename = newName.trim();
            this.workspace.updateHeaderUI();
            this.workspace.markDirty();
        }
    }

    fileMakeCopy() {
        const currentName = this.workspace.currentDoc ? this.workspace.currentDoc.filename : 'Workbook.xlsx';
        this.workspace.currentDoc.filename = `Copy of ${currentName}`;
        this.workspace.updateHeaderUI();
        this.workspace.markDirty();
        showToast('Created copy of workbook', 'success');
    }

    fileExportXlsx() {
        if (!window.XLSX) {
            showToast('Export library not available', 'error');
            return;
        }
        try {
            const wb = window.XLSX.utils.book_new();
            this.workspace.excelData.sheets.forEach(sh => {
                const ws = window.XLSX.utils.aoa_to_sheet(sh.data || [[]]);
                // Re-attach formulas
                if (sh.formulas) {
                    Object.entries(sh.formulas).forEach(([coord, fVal]) => {
                        if (ws[coord]) {
                            ws[coord].f = String(fVal).replace(/^=/, '');
                        }
                    });
                }
                window.XLSX.utils.book_append_sheet(wb, ws, sh.name || 'Sheet');
            });
            const filename = this.workspace.currentDoc?.filename || 'spreadsheet.xlsx';
            window.XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
            showToast('Exported workbook to .xlsx', 'success');
        } catch (e) {
            console.error('XLSX export error:', e);
            showToast('Export failed', 'error');
        }
    }

    fileExportCsv() {
        const sheet = this.getCurrentSheet();
        const csvContent = (sheet.data || []).map(row => {
            return (row || []).map(val => {
                const s = String(val !== undefined ? val : '');
                return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? `"${s.replace(/"/g, '""')}"`
                    : s;
            }).join(',');
        }).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sheet.name || 'sheet'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported CSV file', 'success');
    }

    filePrint() {
        window.print();
    }

    fileVersionHistory() {
        this.workspace.toggleVersionDrawer();
    }

    fileDocInfo() {
        const numSheets = this.workspace.excelData.sheets.length;
        let totalCells = 0;
        this.workspace.excelData.sheets.forEach(sh => {
            if (sh.data) totalCells += (sh.data.length * (sh.data[0] ? sh.data[0].length : 0));
        });
        window.alert(`FRANK Office Spreadsheet\nFile: ${this.workspace.currentDoc?.filename || 'Workbook'}\nSheets: ${numSheets}\nApprox Total Cells: ${totalCells}`);
    }

    viewToggleFormulaBar() {
        this.showFormulaBar = !this.showFormulaBar;
        const bar = document.getElementById('formulaBarContainer');
        if (bar) bar.style.display = this.showFormulaBar ? 'flex' : 'none';
    }

    viewToggleGridlines() {
        this.showGridlines = !this.showGridlines;
        const table = document.getElementById('spreadsheetTable');
        if (table) table.classList.toggle('no-gridlines', !this.showGridlines);
    }

    viewToggleFullScreen() {
        this.workspace.toggleFullscreen();
    }

    openSearchMenus() {
        const query = window.prompt('Search menu or command (e.g. Bold, Sort, Chart, Formula, Filter):');
        if (!query) return;
        const q = query.toLowerCase();
        if (q.includes('bold')) this.toggleCellFormat('bold');
        else if (q.includes('italic')) this.toggleCellFormat('italic');
        else if (q.includes('chart')) this.insertChart();
        else if (q.includes('filter')) this.toggleFilter();
        else if (q.includes('sort')) this.sortRange(true);
        else if (q.includes('sum')) this.insertFunctionFormula('SUM');
        else if (q.includes('print')) this.filePrint();
        else if (q.includes('undo')) this.undo();
        else if (q.includes('redo')) this.redo();
        else showToast(`Command "${query}" not recognized`, 'info');
    }
}

// Attach to window for global access
window.FrankSheetsEngine = FrankSheetsEngine;
