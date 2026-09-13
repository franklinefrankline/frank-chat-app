/* -------------------------------------------------------------------------
   ACCESSIBLE MODAL SYSTEM
   Focus management, Escape key support, backdrop blur and clean API
   ------------------------------------------------------------------------- */

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus first interactive element
    const focusable = modal.querySelectorAll('input, button:not(.modal-close), textarea');
    if (focusable.length > 0) {
        setTimeout(() => focusable[0].focus(), 50);
    }
}

function closeModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (!modal) return;

    modal.classList.remove('open');
    if (!document.querySelector('.modal-backdrop.open')) {
        document.body.style.overflow = '';
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
}

// Global modal triggers
document.addEventListener('click', (e) => {
    // Open trigger
    const openTrigger = e.target.closest('[data-open-modal]');
    if (openTrigger) {
        const id = openTrigger.dataset.openModal;
        openModal(id);
        return;
    }

    // Close trigger
    const closeTrigger = e.target.closest('[data-close-modal]');
    if (closeTrigger) {
        const id = closeTrigger.dataset.closeModal;
        closeModal(id);
        return;
    }

    // Backdrop click
    if (e.target.classList.contains('modal-backdrop')) {
        closeModal(e.target);
    }
});

// Escape key listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openBackdrops = document.querySelectorAll('.modal-backdrop.open');
        if (openBackdrops.length > 0) {
            closeModal(openBackdrops[openBackdrops.length - 1]);
        }
    }
});

// Reusable confirm modal helper
function createConfirmModal(title, message, onConfirm, isDanger = false) {
    const existing = document.getElementById('dynamicConfirmModal');
    if (existing) existing.remove();

    const isDestructive = isDanger || /leave|delete|clear|remove/i.test(title);
    const confirmBtnClass = isDestructive ? 'btn btn-danger' : 'btn btn-primary';

    const overlay = document.createElement('div');
    overlay.id = 'dynamicConfirmModal';
    overlay.className = 'modal-backdrop open';
    overlay.innerHTML = `
        <div class="modal-card">
            <div class="modal-header">
                <h2 class="modal-title" style="${isDestructive ? 'color: var(--danger);' : ''}">${title}</h2>
                <button type="button" class="modal-close" id="confirmModalClose">✕</button>
            </div>
            <div class="modal-body">
                <p style="color: var(--text-secondary); line-height: 1.5;">${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="confirmModalCancel">Cancel</button>
                <button type="button" class="${confirmBtnClass}" id="confirmModalOk">${isDestructive ? 'Confirm &amp; Proceed' : 'Confirm'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const cleanUp = () => {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
        document.body.style.overflow = '';
    };

    document.getElementById('confirmModalClose').addEventListener('click', cleanUp);
    document.getElementById('confirmModalCancel').addEventListener('click', cleanUp);
    document.getElementById('confirmModalOk').addEventListener('click', () => {
        cleanUp();
        if (typeof onConfirm === 'function') onConfirm();
    });
}

window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.createConfirmModal = createConfirmModal;