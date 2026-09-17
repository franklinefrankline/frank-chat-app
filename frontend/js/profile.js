/* -------------------------------------------------------------------------
   USER PROFILE MODULE
   Profile rendering, live metadata display, and profile editing
   ------------------------------------------------------------------------- */

const profileModule = {
    async init() {
        if (!document.getElementById('profileDisplayName')) return;

        const logoutBtn = document.getElementById('profileLogoutBtn');
        logoutBtn?.addEventListener('click', () => auth.logout());

        const toggleBtn = document.getElementById('toggleEditProfileBtn');
        const cancelBtn = document.getElementById('cancelEditProfileBtn');
        const editSection = document.getElementById('editProfileSection');
        const editForm = document.getElementById('editProfileForm');

        toggleBtn?.addEventListener('click', () => {
            const isHidden = editSection.style.display === 'none';
            editSection.style.display = isHidden ? 'block' : 'none';
        });

        cancelBtn?.addEventListener('click', () => {
            editSection.style.display = 'none';
        });

        editForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleProfileSave();
        });

        await this.loadProfileData();
    },

    async loadProfileData() {
        try {
            const user = await api.getCurrentUser();
            let bioText = user.bio || 'Hey there! I am using FRANK.';
            if (bioText.includes('ChatApp') || bioText.includes('QENVO')) {
                bioText = bioText.replace(/ChatApp|QENVO/gi, 'FRANK');
                user.bio = bioText;
            }
            auth.setUser(user);

            const nameEl = document.getElementById('profileDisplayName');
            const usernameEl = document.getElementById('profileUsername');
            const frankIdEl = document.getElementById('profileFrankId');
            const bioEl = document.getElementById('profileBioText');
            const emailEl = document.getElementById('profileEmail');
            const joinedEl = document.getElementById('profileJoined');
            const avatarEl = document.getElementById('profileAvatar');

            if (nameEl) nameEl.textContent = user.full_name;
            if (usernameEl) usernameEl.textContent = `@${user.username}`;
            if (frankIdEl) frankIdEl.textContent = user.frank_id || '------';
            if (bioEl) bioEl.textContent = bioText;
            if (emailEl) emailEl.textContent = user.email;

            // Wire Copy & Share buttons
            const copyBtn = document.getElementById('copyFrankIdBtn');
            if (copyBtn && !copyBtn.dataset.wired) {
                copyBtn.dataset.wired = 'true';
                copyBtn.addEventListener('click', async () => {
                    const fid = user.frank_id;
                    if (fid) {
                        try {
                            await navigator.clipboard.writeText(fid);
                            showToast(`FRANK ID ${fid} copied to clipboard!`, 'success');
                        } catch (_) {
                            showToast(`FRANK ID: ${fid}`, 'info');
                        }
                    }
                });
            }

            const shareBtn = document.getElementById('shareFrankIdBtn');
            if (shareBtn && !shareBtn.dataset.wired) {
                shareBtn.dataset.wired = 'true';
                shareBtn.addEventListener('click', async () => {
                    const fid = user.frank_id;
                    if (fid) {
                        const shareText = `Connect with me on FRANK! My permanent FRANK ID is: ${fid}`;
                        if (navigator.share) {
                            try {
                                await navigator.share({
                                    title: 'FRANK ID',
                                    text: shareText,
                                    url: window.location.origin
                                });
                            } catch (_) {}
                        } else {
                            try {
                                await navigator.clipboard.writeText(shareText);
                                showToast('Share text & FRANK ID copied to clipboard!', 'success');
                            } catch (_) {
                                showToast(shareText, 'info');
                            }
                        }
                    }
                });
            }

            if (joinedEl && user.created_at) {
                const parsedDate = window.messagesModule ? window.messagesModule.parseDate(user.created_at) : new Date(user.created_at);
                joinedEl.textContent = parsedDate ? parsedDate.toLocaleDateString([], { month: 'long', year: 'numeric' }) : '';
            }

            const frankIdEl = document.getElementById('profileFrankId');
            if (frankIdEl) {
                frankIdEl.textContent = user.frank_id || '------';
            }

            const copyFrankIdBtn = document.getElementById('copyFrankIdBtn');
            if (copyFrankIdBtn) {
                copyFrankIdBtn.onclick = () => {
                    if (user.frank_id) {
                        navigator.clipboard.writeText(user.frank_id).then(() => {
                            showToast(`FRANK ID ${user.frank_id} copied to clipboard!`, 'success');
                        }).catch(() => {
                            showToast(`Your FRANK ID is: ${user.frank_id}`, 'info');
                        });
                    }
                };
            }

            const shareFrankIdBtn = document.getElementById('shareFrankIdBtn');
            if (shareFrankIdBtn) {
                shareFrankIdBtn.onclick = () => {
                    if (user.frank_id) {
                        const shareData = {
                            title: 'Chat with me on FRANK',
                            text: `Add me on FRANK with my unique FRANK ID: ${user.frank_id}`,
                            url: window.location.origin
                        };
                        if (navigator.share) {
                            navigator.share(shareData).catch(() => {});
                        } else {
                            navigator.clipboard.writeText(`Add me on FRANK! My unique FRANK ID is: ${user.frank_id}`).then(() => {
                                showToast('Share message copied to clipboard!', 'success');
                            });
                        }
                    }
                };
            }

            if (avatarEl) {
                if (user.avatar_url) {
                    avatarEl.innerHTML = `<img src="${user.avatar_url}" alt="${user.full_name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;"><span class="avatar-status online" id="profileStatusDot"></span>`;
                } else {
                    const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    avatarEl.innerHTML = `<span id="profileInitials">${initials}</span><span class="avatar-status online" id="profileStatusDot"></span>`;
                }
            }

            // Populate form inputs
            const editFullName = document.getElementById('editFullName');
            const editBio = document.getElementById('editBio');
            const editAvatar = document.getElementById('editAvatarUrl');
            if (editFullName) editFullName.value = user.full_name;
            if (editBio) editBio.value = bioText;
            if (editAvatar) editAvatar.value = user.avatar_url || '';

        } catch (err) {
            showToast('Failed to load profile details', 'error');
        }
    },

    async handleProfileSave() {
        const full_name = document.getElementById('editFullName').value.trim();
        const bio = document.getElementById('editBio').value.trim();
        const avatar_url = document.getElementById('editAvatarUrl').value.trim();
        const saveBtn = document.getElementById('saveProfileBtn');

        if (!full_name) {
            showToast('Full name is required', 'warning');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const updated = await api.updateProfile({ full_name, bio, avatar_url });
            auth.setUser(updated);
            showToast('Profile updated successfully!', 'success');
            document.getElementById('editProfileSection').style.display = 'none';
            await this.loadProfileData();
        } catch (err) {
            showToast(err.message || 'Failed to update profile', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    profileModule.init();
});

window.profileModule = profileModule;
