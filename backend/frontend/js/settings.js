/* -------------------------------------------------------------------------
   SETTINGS MANAGEMENT MODULE
   Theme selection, Appearance live preview, profile preview & persistence
   ------------------------------------------------------------------------- */

const settingsModule = {
    init() {
        this.setupTabs();
        this.setupThemeCards();
        this.setupLanguageCards();
        this.setupToggles();
        this.loadProfileData();
        this.setupPrivacyDashboard();

        const logoutBtn = document.getElementById('settingsLogoutBtn');
        logoutBtn?.addEventListener('click', () => {
            if (typeof auth !== 'undefined' && auth.logout) {
                auth.logout();
            } else {
                localStorage.clear();
                window.location.href = 'login.html';
            }
        });

        // Listen for global theme changes (e.g. from header toggle button)
        window.addEventListener('chatapp_theme_change', (e) => {
            this.highlightThemeCard(e.detail.theme);
            this.updateLivePreview(e.detail.theme);
        });
    },

    setupLanguageCards() {
        const updateLangCards = (currentLang) => {
            document.querySelectorAll('[data-lang-choice]').forEach(card => {
                const choice = card.dataset.langChoice;
                const isSelected = choice === currentLang;
                card.classList.toggle('active', isSelected);
                card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
                const check = card.querySelector('.theme-card-check');
                if (check) {
                    check.style.display = isSelected ? 'inline-flex' : 'none';
                }
            });
        };

        const activeLang = (typeof i18n !== 'undefined') ? i18n.currentLang : 'en';
        updateLangCards(activeLang);

        document.querySelectorAll('[data-lang-choice]').forEach(card => {
            const handleSelect = () => {
                const choice = card.dataset.langChoice;
                if (typeof i18n !== 'undefined') {
                    i18n.setLanguage(choice);
                }
                updateLangCards(choice);
            };
            card.addEventListener('click', handleSelect);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect();
                }
            });
        });

        window.addEventListener('frank:languageChanged', (e) => {
            updateLangCards(e.detail.lang);
        });
    },

    setupTabs() {
        const navBtns = document.querySelectorAll('.settings-nav-btn');
        const sections = {
            appearance: document.getElementById('tabAppearance'),
            profile: document.getElementById('tabProfile'),
            notifications: document.getElementById('tabNotifications'),
            privacy: document.getElementById('tabPrivacy'),
            security: document.getElementById('tabSecurity'),
            chat: document.getElementById('tabChat'),
            storage: document.getElementById('tabStorage'),
            account: document.getElementById('tabAccount')
        };

        const activateTab = (tabName) => {
            navBtns.forEach(b => {
                const isActive = b.dataset.tab === tabName;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            Object.keys(sections).forEach(key => {
                if (sections[key]) {
                    sections[key].style.display = key === tabName ? 'block' : 'none';
                }
            });

            if (tabName === 'privacy') {
                this.loadPrivacyDashboard();
            }
        };
        this.activateTab = activateTab;

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                activateTab(tab);
                const url = new URL(window.location);
                url.searchParams.set('tab', tab);
                window.history.replaceState({}, '', url);
            });
        });

        // Check URL parameter on load
        const params = new URLSearchParams(window.location.search);
        const requestedTab = params.get('tab') || 'appearance';
        if (sections[requestedTab]) {
            activateTab(requestedTab);
        } else {
            activateTab('appearance');
        }
    },

    setupThemeCards() {
        const currentTheme = localStorage.getItem('chatapp_theme') || 'monochrome';
        this.highlightThemeCard(currentTheme);
        this.updateLivePreview(currentTheme);

        const cards = document.querySelectorAll('.theme-card');
        cards.forEach(card => {
            const handleSelect = () => {
                const choice = card.dataset.themeChoice;
                if (typeof window.theme !== 'undefined') {
                    window.theme.apply(choice, true);
                } else {
                    document.documentElement.setAttribute('data-theme', choice);
                    localStorage.setItem('chatapp_theme', choice);
                }
                this.highlightThemeCard(choice);
                this.updateLivePreview(choice);
            };

            card.addEventListener('click', handleSelect);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect();
                }
            });
        });
    },

    highlightThemeCard(activeTheme) {
        const cards = document.querySelectorAll('.theme-card');
        cards.forEach(card => {
            const choice = card.dataset.themeChoice;
            const isSelected = choice === activeTheme;
            card.classList.toggle('active', isSelected);
            card.setAttribute('aria-checked', isSelected ? 'true' : 'false');

            const check = card.querySelector('.theme-card-check');
            if (check) {
                check.style.display = isSelected ? 'inline-flex' : 'none';
            }
        });
    },

    updateLivePreview(activeTheme) {
        const indicator = document.getElementById('activeThemeIndicatorBadge');
        if (indicator) {
            indicator.textContent = activeTheme === 'sandstone' ? 'Sandstone' : 'Monochrome';
        }
    },

    loadProfileData() {
        let user = null;
        if (typeof auth !== 'undefined' && auth.getUser) {
            user = auth.getUser();
        }

        const nameEl = document.getElementById('settingsProfileName');
        const userEl = document.getElementById('settingsProfileUsername');
        const initialsEl = document.getElementById('settingsAvatarInitials');
        const frankIdEl = document.getElementById('settingsFrankIdValue');

        if (user) {
            if (nameEl) nameEl.textContent = user.full_name || 'FRANK User';
            if (userEl) userEl.textContent = `@${user.username || 'user'}`;
            if (initialsEl) initialsEl.textContent = (user.full_name || 'U').substring(0, 2).toUpperCase();
            if (frankIdEl) frankIdEl.textContent = user.frank_id || 'F4M8Q1';
        } else {
            if (nameEl) nameEl.textContent = 'Alex Morgan';
            if (userEl) userEl.textContent = '@alex';
            if (initialsEl) initialsEl.textContent = 'AM';
            if (frankIdEl) frankIdEl.textContent = 'F4M8Q1';
        }

        // Copy FRANK ID Button
        const copyBtn = document.getElementById('settingsCopyFrankIdBtn');
        copyBtn?.addEventListener('click', async () => {
            const frankId = frankIdEl ? frankIdEl.textContent.trim() : 'F4M8Q1';
            try {
                await navigator.clipboard.writeText(frankId);
                if (typeof window.showToast === 'function') {
                    window.showToast('FRANK ID copied', 'success', 2000);
                }
            } catch {
                if (typeof window.showToast === 'function') {
                    window.showToast('FRANK ID copied', 'success', 2000);
                }
            }
        });

        // Clear Cache Button
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        clearCacheBtn?.addEventListener('click', () => {
            const preservedTheme = localStorage.getItem('chatapp_theme');
            const preservedToken = localStorage.getItem('frank_token');
            const preservedUser = localStorage.getItem('chatapp_user');
            const preservedLang = localStorage.getItem('frank_lang');
            const preservedAutoTrans = localStorage.getItem('pref_settingAutoTranslate');
            const preservedDefView = localStorage.getItem('pref_settingDefaultViewTranslation');
            localStorage.clear();
            if (preservedTheme) localStorage.setItem('chatapp_theme', preservedTheme);
            if (preservedToken) localStorage.setItem('frank_token', preservedToken);
            if (preservedUser) localStorage.setItem('chatapp_user', preservedUser);
            if (preservedLang) localStorage.setItem('frank_lang', preservedLang);
            if (preservedAutoTrans) localStorage.setItem('pref_settingAutoTranslate', preservedAutoTrans);
            if (preservedDefView) localStorage.setItem('pref_settingDefaultViewTranslation', preservedDefView);
            if (typeof window.showToast === 'function') {
                window.showToast('Local cache cleared successfully', 'success', 2000);
            }
        });
    },

    setupToggles() {
        const toggleIds = [
            'settingAnimations',
            'settingHighContrastBorders',
            'settingDesktopNotifs',
            'settingSound',
            'settingGroupNotifs',
            'settingReadReceipts',
            'settingTyping',
            'settingOnlinePresence',
            'settingEnterToSend',
            'settingAutoTranslate',
            'settingDefaultViewTranslation'
        ];

        toggleIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            const saved = localStorage.getItem(`pref_${id}`);
            if (saved !== null) {
                el.checked = saved === 'true';
            } else if (id === 'settingAutoTranslate' || id === 'settingDefaultViewTranslation') {
                el.checked = true; // default true
            }

            el.addEventListener('change', async () => {
                localStorage.setItem(`pref_${id}`, el.checked);
                // Also sync with backend if token exists and relevant
                if (id === 'settingAutoTranslate' || id === 'settingDefaultViewTranslation') {
                    const token = localStorage.getItem('frank_token');
                    if (token) {
                        try {
                            const payload = {};
                            if (id === 'settingAutoTranslate') payload.auto_translate = el.checked;
                            if (id === 'settingDefaultViewTranslation') payload.default_view_translation = el.checked;
                            await fetch('/api/users/profile', {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify(payload)
                            });
                        } catch (e) {
                            console.warn('Failed to sync translation pref to backend', e);
                        }
                    }
                }
                if (typeof window.showToast === 'function') {
                    window.showToast('Preference updated', 'info', 1500);
                }
            });
        });
    },

    setupPrivacyDashboard() {
        // 1. Consent Toggles
        const consentMap = [
            { id: 'consentToggleAi', purpose: 'ai_processing' },
            { id: 'consentTogglePresence', purpose: 'online_presence' },
            { id: 'consentToggleReceipts', purpose: 'read_receipts' },
            { id: 'consentToggleComms', purpose: 'service_updates' }
        ];

        consentMap.forEach(item => {
            const el = document.getElementById(item.id);
            if (!el) return;
            el.addEventListener('change', async () => {
                try {
                    if (window.api && window.api.privacy) {
                        await window.api.privacy.updateConsents({
                            consents: [{ purpose_code: item.purpose, granted: el.checked }]
                        });
                        const action = el.checked ? 'granted' : 'withdrawn';
                        if (typeof window.showToast === 'function') {
                            window.showToast(`Consent ${action} successfully`, 'success', 2000);
                        }
                        this.refreshConsentCountBadge();
                    }
                } catch (err) {
                    console.error('Failed to update consent:', err);
                    el.checked = !el.checked; // revert
                    if (typeof window.showToast === 'function') {
                        window.showToast('Failed to update consent preference', 'error', 3000);
                    }
                }
            });
        });

        // 2. Data Export Button
        const exportBtn = document.getElementById('privacyExportDataBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    exportBtn.disabled = true;
                    exportBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        <span>Generating Export...</span>
                    `;
                    if (window.api && window.api.privacy) {
                        const exportData = await window.api.privacy.exportData();
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        const dateStr = new Date().toISOString().slice(0, 10);
                        a.download = `frank_privacy_export_${exportData.profile?.frank_id || 'user'}_${dateStr}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        if (typeof window.showToast === 'function') {
                            window.showToast('Personal data archive downloaded successfully', 'success', 3000);
                        }
                    }
                } catch (err) {
                    console.error('Failed to export data:', err);
                    if (typeof window.showToast === 'function') {
                        window.showToast('Error generating personal data export', 'error', 3000);
                    }
                } finally {
                    exportBtn.disabled = false;
                    exportBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Download Data Archive (JSON)</span>
                    `;
                }
            });
        }

        // 3. Refresh Dashboard Button
        const refreshBtn = document.getElementById('btnRefreshPrivacySummary');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await this.loadPrivacyDashboard();
                if (typeof window.showToast === 'function') {
                    window.showToast('Privacy Dashboard updated', 'info', 2000);
                }
            });
        }

        const refreshSchedBtn = document.getElementById('btnRefreshRetentionSchedule');
        if (refreshSchedBtn) {
            refreshSchedBtn.addEventListener('click', async () => {
                await this.loadRetentionSchedule();
                if (typeof window.showToast === 'function') {
                    window.showToast('Retention schedule updated', 'info', 2000);
                }
            });
        }

        // 4. Quick Link to Profile Settings
        const goToProfileBtn = document.getElementById('privacyGoToProfileBtn');
        if (goToProfileBtn) {
            goToProfileBtn.addEventListener('click', () => {
                if (typeof this.activateTab === 'function') {
                    this.activateTab('profile');
                    const url = new URL(window.location);
                    url.searchParams.set('tab', 'profile');
                    window.history.replaceState({}, '', url);
                }
            });
        }

        // 5. Privacy Request Modal Setup & Action Buttons
        const reqModal = document.getElementById('privacyRequestModal');
        const reqForm = document.getElementById('privacyRequestForm');
        const reqTypeSelect = document.getElementById('privacyRequestType');
        const reqTitle = document.getElementById('privacyRequestModalTitle');
        const reqSubject = document.getElementById('privacyRequestSubject');
        const corrWrap = document.getElementById('privacyCorrectionFieldsWrap');
        const erasureWrap = document.getElementById('privacyErasureNoticeWrap');
        const erasureConfirmCheck = document.getElementById('privacyErasureReviewConfirm');

        const openReqBtn = document.getElementById('privacyNewRequestBtn');
        const requestAccessBtn = document.getElementById('privacyRequestAccessBtn');
        const requestCorrectionBtn = document.getElementById('privacyRequestCorrectionBtn');
        const requestErasureBtn = document.getElementById('privacyRequestErasureBtn');

        const closeReqBtn = document.getElementById('privacyCloseRequestModalBtn');
        const cancelReqBtn = document.getElementById('privacyCancelRequestBtn');

        const updateDynamicFields = (type) => {
            if (corrWrap) corrWrap.style.display = (type === 'correct_data') ? 'block' : 'none';
            if (erasureWrap) erasureWrap.style.display = (type === 'erase_data') ? 'block' : 'none';
        };

        const openReqModalWithConfig = (type, title, defaultSubject = '') => {
            if (!reqModal) return;
            if (reqForm) reqForm.reset();
            if (reqTypeSelect) reqTypeSelect.value = type;
            if (reqTitle) reqTitle.textContent = title;
            if (reqSubject && defaultSubject) reqSubject.value = defaultSubject;
            if (erasureConfirmCheck) erasureConfirmCheck.checked = false;
            updateDynamicFields(type);
            reqModal.style.display = 'flex';
        };

        const closeReqModal = () => {
            if (reqModal) reqModal.style.display = 'none';
        };

        if (openReqBtn) openReqBtn.addEventListener('click', () => openReqModalWithConfig('access_data', 'Submit Privacy Request'));
        if (requestAccessBtn) requestAccessBtn.addEventListener('click', () => openReqModalWithConfig('access_data', 'Submit Personal Data Access Request', 'Request for Personal Data Summary & Records'));
        if (requestCorrectionBtn) requestCorrectionBtn.addEventListener('click', () => openReqModalWithConfig('correct_data', 'Submit Information Correction Request', 'Correction of Inaccurate Account Information'));
        if (requestErasureBtn) requestErasureBtn.addEventListener('click', () => openReqModalWithConfig('erase_data', 'Submit Data Erasure Request (Review)', 'Request for Personal Data Erasure under DPDP Section 12'));

        if (closeReqBtn) closeReqBtn.addEventListener('click', closeReqModal);
        if (cancelReqBtn) cancelReqBtn.addEventListener('click', closeReqModal);

        if (reqTypeSelect) {
            reqTypeSelect.addEventListener('change', () => {
                updateDynamicFields(reqTypeSelect.value);
            });
        }

        if (reqForm) {
            reqForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('privacySubmitRequestBtn');
                try {
                    const reqType = reqTypeSelect ? reqTypeSelect.value : 'access_data';
                    const subject = document.getElementById('privacyRequestSubject')?.value.trim() || '';
                    const details = document.getElementById('privacyRequestDetails')?.value.trim() || '';
                    const corrName = document.getElementById('privacyCorrName')?.value.trim() || '';
                    const corrEmail = document.getElementById('privacyCorrEmail')?.value.trim() || '';
                    const corrCat = document.getElementById('privacyCorrCategory')?.value || 'Profile Identity';

                    if (reqType === 'erase_data' && erasureConfirmCheck && !erasureConfirmCheck.checked) {
                        if (typeof window.showToast === 'function') {
                            window.showToast('Please check the confirmation box acknowledging that erasure requests undergo legal review.', 'warning', 4000);
                        } else {
                            alert('Please check the confirmation box acknowledging that erasure requests undergo legal review.');
                        }
                        return;
                    }

                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Submitting...';
                    }

                    let correctedValue = null;
                    let fieldToCorrect = null;
                    if (reqType === 'correct_data') {
                        const corrPayload = { category: corrCat };
                        if (corrName) corrPayload.full_name = corrName;
                        if (corrEmail) corrPayload.email = corrEmail;
                        fieldToCorrect = Object.keys(corrPayload).join(', ');
                        correctedValue = JSON.stringify(corrPayload);
                    }

                    const payload = {
                        request_type: reqType,
                        subject: subject,
                        details: details,
                        field_to_correct: fieldToCorrect,
                        corrected_value: correctedValue
                    };

                    if (window.api && window.api.privacy) {
                        const result = await window.api.privacy.createRequest(payload);
                        closeReqModal();
                        if (typeof window.showToast === 'function') {
                            window.showToast(`Privacy request submitted! Ref: ${result.reference_code}`, 'success', 5000);
                        }
                        await this.loadPrivacyRequests();
                        this.refreshConsentCountBadge();
                    }
                } catch (err) {
                    console.error('Failed to submit privacy request:', err);
                    if (typeof window.showToast === 'function') {
                        window.showToast(err.message || 'Error submitting privacy request', 'error', 4000);
                    }
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Submit Request';
                    }
                }
            });
        }

        // 6. Privacy Grievance Form Handler
        const grievanceForm = document.getElementById('privacyGrievanceForm');
        if (grievanceForm) {
            grievanceForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('privacySubmitGrievanceBtn');
                const catEl = document.getElementById('privacyGrievanceCategory');
                const refEl = document.getElementById('privacyGrievanceRef');
                const subEl = document.getElementById('privacyGrievanceSubject');
                const detEl = document.getElementById('privacyGrievanceDetails');

                const category = catEl ? catEl.value : 'Other Data Protection Concern';
                const relatedRef = refEl ? refEl.value.trim() : '';
                const subject = subEl ? subEl.value.trim() : '';
                const details = detEl ? detEl.value.trim() : '';

                if (!subject || !details) {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Please provide both subject and detailed description for your grievance', 'warning', 3000);
                    }
                    return;
                }

                try {
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Registering Complaint...';
                    }

                    if (window.api && window.api.privacy) {
                        const result = await window.api.privacy.createRequest({
                            request_type: 'grievance',
                            subject: subject,
                            details: details,
                            category: category,
                            related_reference: relatedRef
                        });

                        const banner = document.getElementById('privacyGrievanceSuccessBanner');
                        const refCodeSpan = document.getElementById('privacyGrievanceRefCode');
                        if (banner && refCodeSpan) {
                            refCodeSpan.textContent = result.reference_code || 'GR-SUBMITTED';
                            banner.style.display = 'block';
                            banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }

                        if (typeof window.showToast === 'function') {
                            window.showToast(`Privacy complaint registered! Ref: ${result.reference_code}`, 'success', 5000);
                        }

                        grievanceForm.reset();
                        await this.loadPrivacyRequests();
                        this.refreshConsentCountBadge();
                    }
                } catch (err) {
                    console.error('Failed to submit grievance:', err);
                    if (typeof window.showToast === 'function') {
                        window.showToast(err.message || 'Error submitting privacy grievance', 'error', 4000);
                    }
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            <span>Submit Privacy Complaint</span>
                        `;
                    }
                }
            });
        }

        // 7. Request Details Modal Setup
        const detailsModal = document.getElementById('privacyRequestDetailsModal');
        const closeDetailsBtn = document.getElementById('privacyCloseDetailsModalBtn');
        const dismissDetailsBtn = document.getElementById('privacyDismissDetailsModalBtn');

        const closeDetailsModal = () => {
            if (detailsModal) detailsModal.style.display = 'none';
        };

        if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', closeDetailsModal);
        if (dismissDetailsBtn) dismissDetailsBtn.addEventListener('click', closeDetailsModal);

        // 8. Requests Status Filter & Search Handlers
        this.currentPrivacyFilter = 'all';
        const filterGroup = document.getElementById('privacyStatusFilterGroup');
        if (filterGroup) {
            filterGroup.querySelectorAll('button[data-filter]').forEach(btn => {
                btn.addEventListener('click', () => {
                    filterGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentPrivacyFilter = btn.dataset.filter || 'all';
                    this.renderPrivacyRequestsTable();
                });
            });
        }

        const searchInput = document.getElementById('privacyRequestSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.renderPrivacyRequestsTable();
            });
        }

        // 9. Account Erasure Modal Setup (Self-Service)
        const eraseModal = document.getElementById('privacyEraseModal');
        const openEraseBtn = document.getElementById('privacyEraseAccountBtn');
        const closeEraseBtn = document.getElementById('privacyCloseEraseModalBtn');
        const cancelEraseBtn = document.getElementById('privacyCancelEraseBtn');
        const eraseForm = document.getElementById('privacyEraseForm');

        const openEraseModal = () => {
            if (eraseModal) {
                eraseModal.style.display = 'flex';
                if (eraseForm) eraseForm.reset();
            }
        };

        const closeEraseModal = () => {
            if (eraseModal) eraseModal.style.display = 'none';
        };

        if (openEraseBtn) openEraseBtn.addEventListener('click', openEraseModal);
        if (closeEraseBtn) closeEraseBtn.addEventListener('click', closeEraseModal);
        if (cancelEraseBtn) cancelEraseBtn.addEventListener('click', closeEraseModal);

        if (eraseForm) {
            eraseForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const pwdInput = document.getElementById('privacyErasePassword');
                const confirmInput = document.getElementById('privacyEraseConfirmText');
                const submitBtn = document.getElementById('privacyConfirmEraseSubmitBtn');

                const password = pwdInput ? pwdInput.value : '';
                const confirmText = confirmInput ? confirmInput.value.trim() : '';

                if (confirmText !== 'DELETE') {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Please type DELETE to confirm', 'warning', 3000);
                    }
                    return;
                }

                if (!password) {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Password is required to verify identity', 'warning', 3000);
                    }
                    return;
                }

                try {
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Anonymizing...';
                    }

                    if (window.api && window.api.privacy) {
                        await window.api.privacy.eraseAccount({
                            password: password,
                            confirm_text: confirmText,
                            reason: 'Data principal self-service erasure request under DPDP Section 12'
                        });

                        closeEraseModal();
                        alert('Your account has been deleted and anonymized. All active sessions have ended. Thank you for using FRANK Think.');
                        localStorage.clear();
                        window.location.href = 'login.html';
                    }
                } catch (err) {
                    console.error('Account erasure failed:', err);
                    if (typeof window.showToast === 'function') {
                        window.showToast(err.message || 'Verification failed. Please check your password.', 'error', 4000);
                    }
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Permanently Delete Account';
                    }
                }
            });
        }

        // Close modals on escape key or backdrop click
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeReqModal();
                closeDetailsModal();
                closeEraseModal();
            }
        });

        [reqModal, detailsModal, eraseModal].forEach(m => {
            if (m) {
                m.addEventListener('click', (e) => {
                    if (e.target === m) {
                        m.style.display = 'none';
                    }
                });
            }
        });
    },

    async loadPrivacyDashboard() {
        if (!window.api || !window.api.privacy) return;

        try {
            // 1. Fetch Summary
            const summary = await window.api.privacy.getSummary();
            if (summary) {
                // Populate Identity Grid
                const fullNameEl = document.getElementById('privacyInfoFullName');
                const usernameEl = document.getElementById('privacyInfoUsername');
                const emailEl = document.getElementById('privacyInfoEmail');
                const frankIdEl = document.getElementById('privacyInfoFrankId');
                const createdEl = document.getElementById('privacyInfoCreatedDate');
                const roleEl = document.getElementById('privacyInfoRole');

                if (fullNameEl) fullNameEl.textContent = summary.full_name || summary.username || '---';
                if (usernameEl) usernameEl.textContent = `@${summary.username || '---'}`;
                if (emailEl) emailEl.textContent = summary.email || '---';
                if (frankIdEl) frankIdEl.textContent = summary.frank_id || '------';
                if (createdEl && summary.created_at) {
                    const d = new Date(summary.created_at);
                    createdEl.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                }
                if (roleEl) {
                    const roleTitle = summary.role ? summary.role.charAt(0).toUpperCase() + summary.role.slice(1) : 'Member';
                    const statusTitle = summary.account_status ? summary.account_status.charAt(0).toUpperCase() + summary.account_status.slice(1) : 'Active';
                    roleEl.textContent = `${roleTitle} (${statusTitle})`;
                }

                // Populate Processing Metrics Counters
                const sentMsgEl = document.getElementById('privacySummarySentMsgs');
                const docsEl = document.getElementById('privacySummaryDocs');
                const consentsEl = document.getElementById('privacySummaryConsents');
                const requestsEl = document.getElementById('privacySummaryRequests');

                if (sentMsgEl) sentMsgEl.textContent = (summary.sent_messages_count ?? summary.messages_count ?? 0).toLocaleString();
                if (docsEl) docsEl.textContent = (summary.uploaded_documents_count ?? summary.documents_count ?? 0).toLocaleString();
                if (consentsEl) consentsEl.textContent = (summary.active_consents_count ?? 0).toString();
                if (requestsEl) requestsEl.textContent = (summary.open_privacy_requests_count ?? 0).toString();
            }

            // 2. Fetch Consents
            const consentRes = await window.api.privacy.getConsents();
            if (consentRes && consentRes.items) {
                consentRes.items.forEach(c => {
                    if (c.purpose_code === 'ai_processing') {
                        const el = document.getElementById('consentToggleAi');
                        if (el) el.checked = !!c.granted;
                    } else if (c.purpose_code === 'online_presence') {
                        const el = document.getElementById('consentTogglePresence');
                        if (el) el.checked = !!c.granted;
                    } else if (c.purpose_code === 'read_receipts') {
                        const el = document.getElementById('consentToggleReceipts');
                        if (el) el.checked = !!c.granted;
                    } else if (c.purpose_code === 'service_updates') {
                        const el = document.getElementById('consentToggleComms');
                        if (el) el.checked = !!c.granted;
                    }
                });
            }

            // 3. Load Requests
            await this.loadPrivacyRequests();

            // 4. Load Retention & Lifecycle Schedule (Part 3)
            await this.loadRetentionSchedule();
        } catch (err) {
            console.warn('Could not load privacy dashboard data:', err);
        }
    },

    async loadRetentionSchedule() {
        const tbody = document.getElementById('privacyRetentionScheduleTableBody');
        if (!tbody || !window.api || !window.api.privacy) return;

        try {
            const res = await window.api.privacy.getRetentionSchedule();
            const categories = res?.categories || [];
            if (!categories.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">No retention rules configured.</td></tr>';
                return;
            }

            tbody.innerHTML = categories.map(c => `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 10px; font-weight: 600; color: var(--text);">
                        ${escapeHTML(c.category_label || c.data_category)}
                    </td>
                    <td style="padding: 10px;">
                        <span class="badge" style="background: rgba(37,99,235,0.1); color: var(--accent); font-weight: 600; font-size: 11px; padding: 2px 7px;">
                            ${escapeHTML(c.retention_period_display || `${c.retention_period_days} Days`)}
                        </span>
                    </td>
                    <td style="padding: 10px; color: var(--text-secondary); text-transform: capitalize;">
                        ${escapeHTML(c.deletion_method || 'anonymize')}
                    </td>
                    <td style="padding: 10px; color: var(--text-secondary); font-size: 11.5px;">
                        ${escapeHTML(c.responsible_workflow || 'DPO Staged Review')}
                    </td>
                    <td style="padding: 10px; color: var(--text-muted); font-size: 11px;">
                        ${escapeHTML(c.legal_exception || 'None')}
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.warn('Failed to load retention schedule:', err);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--danger);">Error loading retention schedule.</td></tr>';
        }
    },

    async refreshConsentCountBadge() {
        try {
            if (!window.api || !window.api.privacy) return;
            const summary = await window.api.privacy.getSummary();
            const conEl = document.getElementById('privacySummaryConsents');
            const reqEl = document.getElementById('privacySummaryRequests');
            if (conEl && summary) conEl.textContent = (summary.active_consents_count ?? 0).toString();
            if (reqEl && summary) reqEl.textContent = (summary.open_privacy_requests_count ?? 0).toString();
        } catch (e) {
            console.warn('Failed to refresh consent count badge:', e);
        }
    },

    async loadPrivacyRequests() {
        const tbody = document.getElementById('privacyRequestsTableBody');
        if (!tbody || !window.api || !window.api.privacy) return;

        try {
            const requests = await window.api.privacy.getMyRequests();
            this.cachedPrivacyRequests = requests || [];
            this.renderPrivacyRequestsTable();
        } catch (err) {
            console.warn('Failed to load privacy requests:', err);
        }
    },

    renderPrivacyRequestsTable() {
        const tbody = document.getElementById('privacyRequestsTableBody');
        if (!tbody) return;

        const requests = this.cachedPrivacyRequests || [];
        const filter = this.currentPrivacyFilter || 'all';
        const searchInput = document.getElementById('privacyRequestSearchInput');
        const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

        const filtered = requests.filter(r => {
            const statusMatch = (filter === 'all') || (r.status === filter) || (filter === 'action_required' && r.status === 'awaiting_information');
            if (!statusMatch) return false;
            if (!q) return true;
            const ref = (r.reference_code || '').toLowerCase();
            const subj = (r.subject || '').toLowerCase();
            const det = (r.details || '').toLowerCase();
            return ref.includes(q) || subj.includes(q) || det.includes(q);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);" id="privacyRequestsEmptyState">
                        ${q || filter !== 'all' ? 'No privacy requests match your filters.' : 'No privacy requests filed yet. Use the buttons above to submit a request.'}
                    </td>
                </tr>
            `;
            return;
        }

        const getStatusBadge = (status) => {
            const map = {
                submitted: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', label: 'Submitted' },
                in_review: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: 'Under Review' },
                under_review: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: 'Under Review' },
                action_required: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', label: 'Action Required' },
                awaiting_information: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', label: 'Awaiting Info' },
                approved: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Approved' },
                approved_for_processing: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Approved for Processing' },
                processing: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: 'Processing' },
                completed: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: 'Completed' },
                rejected: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Rejected' },
                failed: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Failed' }
            };
            const s = map[status] || { bg: 'var(--surface-muted)', text: 'var(--text-muted)', label: status };
            return `<span style="display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${s.bg}; color: ${s.text};">${s.label}</span>`;
        };

        const getTypeLabel = (type) => {
            const map = {
                access_data: 'Data Access',
                correct_data: 'Correction',
                erase_data: 'Erasure',
                withdraw_consent: 'Consent Revocation',
                grievance: 'Grievance / Complaint'
            };
            return map[type] || type;
        };

        const rowsHtml = filtered.map(r => {
            const deadline = r.deadline_at ? new Date(r.deadline_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '30 days';
            const created = new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 10px 14px; font-family: monospace; font-size: 12px; font-weight: 700; color: var(--accent);">${r.reference_code}</td>
                    <td style="padding: 10px 14px; font-weight: 600; color: var(--text);">${getTypeLabel(r.request_type)}</td>
                    <td style="padding: 10px 14px; color: var(--text-secondary); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(r.subject || '')}">
                        ${escapeHTML(r.subject || '—')}
                        ${r.decision_notes ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Note: ${escapeHTML(r.decision_notes)}</div>` : ''}
                    </td>
                    <td style="padding: 10px 14px;">${getStatusBadge(r.status)}</td>
                    <td style="padding: 10px 14px; font-size: 12px; color: var(--text-muted);">
                        ${deadline}
                        <div style="font-size: 10.5px; color: var(--text-muted);">Filed ${created}</div>
                    </td>
                    <td style="padding: 10px 14px; text-align: right;">
                        <button type="button" class="btn btn-secondary btn-sm btn-view-request" data-ref="${escapeHTML(r.reference_code)}" style="font-size: 11.5px; padding: 4px 8px;">
                            View Details
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;

        // Attach View Details Click Listeners
        tbody.querySelectorAll('.btn-view-request').forEach(btn => {
            btn.addEventListener('click', () => {
                const ref = btn.dataset.ref;
                const req = requests.find(item => item.reference_code === ref);
                if (req) {
                    this.showRequestDetailsModal(req);
                }
            });
        });
    },

    showRequestDetailsModal(req) {
        const modal = document.getElementById('privacyRequestDetailsModal');
        if (!modal) return;

        const refEl = document.getElementById('detailsRefCode');
        const typeEl = document.getElementById('detailsReqType');
        const statusEl = document.getElementById('detailsReqStatus');
        const dateEl = document.getElementById('detailsReqDate');
        const deadlineEl = document.getElementById('detailsReqDeadline');
        const subjectEl = document.getElementById('detailsReqSubject');
        const bodyEl = document.getElementById('detailsReqBody');
        const corrWrap = document.getElementById('detailsCorrectionWrap');
        const corrEl = document.getElementById('detailsReqCorrection');
        const decisionWrap = document.getElementById('detailsDecisionWrap');
        const decisionEl = document.getElementById('detailsReqDecision');

        const getTypeLabel = (type) => {
            const map = {
                access_data: 'Data Access (DPDP Sec 11)',
                correct_data: 'Information Correction (DPDP Sec 12)',
                erase_data: 'Data Erasure (DPDP Sec 12)',
                withdraw_consent: 'Consent Revocation (DPDP Sec 6)',
                grievance: 'Privacy Grievance (DPDP Sec 13)'
            };
            return map[type] || type;
        };

        const getStatusBadge = (status) => {
            const map = {
                submitted: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', label: 'Submitted' },
                in_review: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: 'Under Review' },
                under_review: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: 'Under Review' },
                action_required: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', label: 'Action Required' },
                awaiting_information: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', label: 'Awaiting Info' },
                approved: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Approved' },
                approved_for_processing: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Approved for Processing' },
                processing: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: 'Processing' },
                completed: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: 'Completed' },
                rejected: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Rejected' },
                failed: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Failed' }
            };
            const s = map[status] || { bg: 'var(--surface-muted)', text: 'var(--text-muted)', label: status };
            return `<span style="display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${s.bg}; color: ${s.text};">${s.label}</span>`;
        };

        if (refEl) refEl.textContent = req.reference_code;
        if (typeEl) typeEl.textContent = getTypeLabel(req.request_type);
        if (statusEl) statusEl.innerHTML = getStatusBadge(req.status);
        if (dateEl) dateEl.textContent = req.created_at ? new Date(req.created_at).toLocaleString() : '---';
        if (deadlineEl) deadlineEl.textContent = req.deadline_at ? new Date(req.deadline_at).toLocaleDateString() : '30 Days';
        if (subjectEl) subjectEl.textContent = req.subject || '---';
        if (bodyEl) bodyEl.textContent = req.details || '---';

        if (corrWrap && corrEl) {
            if (req.correction_payload) {
                corrWrap.style.display = 'block';
                corrEl.textContent = req.correction_payload;
            } else {
                corrWrap.style.display = 'none';
            }
        }

        if (decisionWrap && decisionEl) {
            if (req.decision_notes) {
                decisionWrap.style.display = 'block';
                decisionEl.textContent = req.decision_notes;
            } else {
                decisionWrap.style.display = 'none';
            }
        }

        modal.style.display = 'flex';
    }
};

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

document.addEventListener('DOMContentLoaded', () => {
    settingsModule.init();
});

window.settingsModule = settingsModule;
