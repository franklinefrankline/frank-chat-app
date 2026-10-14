/**
 * FRANK — Contact Administrator Modal
 * Reusable modal for unauthenticated users facing account-disabled errors
 * or visitors on the landing page footer.
 */

(function () {
    'use strict';

    function getI18nText(key, fallback) {
        if (window.i18n && typeof window.i18n.t === 'function') {
            return window.i18n.t(key, fallback);
        }
        return fallback;
    }

    function createModalDOM() {
        if (document.getElementById('frankContactAdminModal')) return;

        const modalHTML = `
        <div class="modal-backdrop" id="frankContactAdminModal" style="display: none; position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px;">
            <div class="modal-card" style="background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-xl, 16px); width: 100%; max-width: 520px; box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.5)); overflow: hidden; animation: modalSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
                <!-- Modal Header -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(14, 165, 233, 0.12); color: var(--accent-cyan, #0ea5e9); display: flex; align-items: center; justify-content: center;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                        </div>
                        <div>
                            <h2 style="font-size: 17px; font-weight: 700; margin: 0; color: var(--text);" data-i18n="contact.contactAdmin">Contact Administrator</h2>
                            <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0;" data-i18n="contact.contactAdminDesc">Submit your account access or support request</p>
                        </div>
                    </div>
                    <button type="button" id="contactModalCloseX" aria-label="Close" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <!-- Form View -->
                <form id="contactAdminForm" style="padding: 24px;" novalidate>
                    <input type="hidden" id="contactSource" value="disabled_account">

                    <!-- Inline Error Alert -->
                    <div id="contactFormAlert" style="display: none; padding: 12px 14px; margin-bottom: 16px; border-radius: var(--radius-md, 8px); background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); font-size: 13px; color: var(--danger, #ef4444); line-height: 1.4;"></div>

                    <!-- Email Input -->
                    <div style="margin-bottom: 16px;">
                        <label for="contactEmail" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text);" data-i18n="contact.email">Email Address <span style="color: var(--danger, #ef4444);">*</span></label>
                        <input type="email" id="contactEmail" required placeholder="name@example.com" data-i18n-placeholder="contact.emailPlaceholder" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); background: var(--bg-surface, var(--surface)); color: var(--text); font-size: 14px; outline: none; transition: border-color 0.15s ease;">
                        <div id="contactEmailErr" style="display: none; font-size: 12px; color: var(--danger, #ef4444); margin-top: 4px;" data-i18n="contact.errorEmail">Please enter a valid email address.</div>
                    </div>

                    <!-- Subject Input -->
                    <div style="margin-bottom: 16px;">
                        <label for="contactSubject" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text);" data-i18n="contact.subject">Subject <span style="color: var(--danger, #ef4444);">*</span></label>
                        <input type="text" id="contactSubject" required value="Account Access / Reactivation Request" data-i18n-placeholder="contact.subjectDefault" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); background: var(--bg-surface, var(--surface)); color: var(--text); font-size: 14px; outline: none;">
                    </div>

                    <!-- Description Input -->
                    <div style="margin-bottom: 20px;">
                        <label for="contactDescription" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text);" data-i18n="contact.description">Issue Description <span style="color: var(--danger, #ef4444);">*</span></label>
                        <textarea id="contactDescription" rows="4" required placeholder="Explain why you need assistance or request reactivation..." data-i18n-placeholder="contact.descPlaceholder" style="width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); background: var(--bg-surface, var(--surface)); color: var(--text); font-size: 14px; outline: none; resize: vertical; min-height: 90px;"></textarea>
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; gap: 12px; justify-content: flex-end; align-items: center; border-top: 1px solid var(--border); padding-top: 16px;">
                        <button type="button" id="contactCancelBtn" style="padding: 9px 18px; border: 1px solid var(--border); background: transparent; color: var(--text); border-radius: var(--radius-md, 8px); font-size: 14px; font-weight: 600; cursor: pointer;" data-i18n="contact.cancel">Cancel</button>
                        <button type="submit" id="contactSubmitBtn" style="padding: 9px 20px; border: none; background: var(--primary, #0066cc); color: #ffffff; border-radius: var(--radius-md, 8px); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <span id="contactSubmitSpinner" style="display: none; width: 14px; height: 14px; border: 2px solid #ffffff; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
                            <span id="contactSubmitText" data-i18n="contact.submitRequest">Submit Request</span>
                        </button>
                    </div>
                </form>

                <!-- Success Confirmation View -->
                <div id="contactSuccessView" style="display: none; padding: 32px 24px; text-align: center;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(34, 197, 94, 0.15); color: var(--success, #22c55e); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px; color: var(--text);" data-i18n="contact.successTitle">Request Submitted Successfully</h3>
                    <p style="font-size: 13.5px; color: var(--text-muted); margin: 0 0 20px; line-height: 1.5;" data-i18n="contact.successMsg">Your request has been recorded. An administrator will review your submission shortly.</p>
                    
                    <div style="background: var(--bg-hover, rgba(255,255,255,0.04)); border: 1px dashed var(--border); border-radius: var(--radius-lg, 12px); padding: 14px 18px; margin-bottom: 24px;">
                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700; margin-bottom: 4px;" data-i18n="contact.requestRef">Request Reference</div>
                        <div id="contactSuccessRef" style="font-family: monospace; font-size: 17px; font-weight: 800; color: var(--accent-cyan, #0ea5e9); letter-spacing: 0.05em;">REQ-2026-XXXX</div>
                        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;" data-i18n="contact.keepRefNotice">Please save this reference number for your records.</div>
                    </div>

                    <button type="button" id="contactSuccessCloseBtn" style="padding: 10px 28px; border: none; background: var(--primary, #0066cc); color: #ffffff; border-radius: var(--radius-md, 8px); font-size: 14px; font-weight: 600; cursor: pointer;" data-i18n="contact.close">Close</button>
                </div>
            </div>
        </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHTML.trim();
        document.body.appendChild(wrapper.firstChild);

        bindModalEvents();
    }

    function bindModalEvents() {
        const modal = document.getElementById('frankContactAdminModal');
        const closeX = document.getElementById('contactModalCloseX');
        const cancelBtn = document.getElementById('contactCancelBtn');
        const successCloseBtn = document.getElementById('contactSuccessCloseBtn');
        const form = document.getElementById('contactAdminForm');

        function closeModal() {
            if (!modal) return;
            modal.classList.remove('open');
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }

        closeX?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        successCloseBtn?.addEventListener('click', closeModal);

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
                closeModal();
            }
        });

        form?.addEventListener('submit', async (e) => {
            e.preventDefault();

            const emailInput = document.getElementById('contactEmail');
            const subjectInput = document.getElementById('contactSubject');
            const descInput = document.getElementById('contactDescription');
            const sourceInput = document.getElementById('contactSource');
            const alertBox = document.getElementById('contactFormAlert');
            const emailErr = document.getElementById('contactEmailErr');
            const submitBtn = document.getElementById('contactSubmitBtn');
            const submitSpinner = document.getElementById('contactSubmitSpinner');
            const submitText = document.getElementById('contactSubmitText');

            alertBox.style.display = 'none';
            emailErr.style.display = 'none';

            const email = (emailInput?.value || '').trim();
            const subject = (subjectInput?.value || '').trim();
            const description = (descInput?.value || '').trim();
            const source = (sourceInput?.value || 'disabled_account').trim();

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
                emailErr.style.display = 'block';
                emailInput?.focus();
                return;
            }

            if (!subject || subject.length < 3) {
                alertBox.textContent = getI18nText('contact.errorRequired', 'Please fill in all required fields.');
                alertBox.style.display = 'block';
                subjectInput?.focus();
                return;
            }

            if (!description || description.length < 5) {
                alertBox.textContent = getI18nText('contact.errorRequired', 'Please fill in all required fields.');
                alertBox.style.display = 'block';
                descInput?.focus();
                return;
            }

            // Disable while in flight
            submitBtn.disabled = true;
            if (submitSpinner) submitSpinner.style.display = 'inline-block';
            if (submitText) submitText.textContent = getI18nText('contact.submitting', 'Submitting Request...');

            try {
                const apiBase = (typeof window.API_BASE_URL !== 'undefined') ? window.API_BASE_URL : '/api';
                const res = await fetch(`${apiBase}/contact/account-access-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: email,
                        subject: subject,
                        description: description,
                        source: source
                    })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.detail || getI18nText('contact.errorFailed', 'Unable to submit request. Please try again.'));
                }

                // Switch to success view
                form.style.display = 'none';
                const successView = document.getElementById('contactSuccessView');
                const successRef = document.getElementById('contactSuccessRef');
                if (successRef) successRef.textContent = data.request_reference || 'REQ-RECORDED';
                if (successView) successView.style.display = 'block';

                if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
                    window.i18n.applyTranslations();
                }
            } catch (err) {
                alertBox.textContent = err.message || getI18nText('contact.errorFailed', 'Unable to submit request. Please try again.');
                alertBox.style.display = 'block';
            } finally {
                submitBtn.disabled = false;
                if (submitSpinner) submitSpinner.style.display = 'none';
                if (submitText) submitText.textContent = getI18nText('contact.submitRequest', 'Submit Request');
            }
        });
    }

    window.openContactAdminModal = function (opts = {}) {
        createModalDOM();
        const modal = document.getElementById('frankContactAdminModal');
        const form = document.getElementById('contactAdminForm');
        const successView = document.getElementById('contactSuccessView');
        const emailInput = document.getElementById('contactEmail');
        const subjectInput = document.getElementById('contactSubject');
        const descInput = document.getElementById('contactDescription');
        const sourceInput = document.getElementById('contactSource');
        const alertBox = document.getElementById('contactFormAlert');
        const emailErr = document.getElementById('contactEmailErr');

        if (form) form.style.display = 'block';
        if (successView) successView.style.display = 'none';
        if (alertBox) alertBox.style.display = 'none';
        if (emailErr) emailErr.style.display = 'none';

        if (sourceInput) sourceInput.value = opts.source || 'disabled_account';
        if (emailInput && opts.email) emailInput.value = opts.email;
        if (subjectInput && opts.subject) subjectInput.value = opts.subject;
        if (descInput && !opts.keepDescription) descInput.value = '';

        if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
            window.i18n.applyTranslations();
        }

        if (modal) {
            modal.classList.add('open');
            modal.classList.add('active');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                if (emailInput && !opts.email) emailInput.focus();
                else if (descInput) descInput.focus();
            }, 50);
        }
    };

    // Auto-create on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createModalDOM);
    } else {
        createModalDOM();
    }
})();
