/* -------------------------------------------------------------------------
   USER PROFILE MODULE
   Profile rendering, live metadata display, profile photo upload & editing
   ------------------------------------------------------------------------- */

const profileModule = {
    stagedPhotoFile: null,
    stagedPhotoUrl: null,
    stagedRemovePhoto: false,
    previewBlobUrl: null,

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
            if (isHidden) {
                editSection.style.display = 'block';
                this.resetStagedPhotoState();
            } else {
                editSection.style.display = 'none';
            }
        });

        cancelBtn?.addEventListener('click', () => {
            this.resetStagedPhotoState();
            editSection.style.display = 'none';
        });

        // Photo controls
        const uploadTriggerBtn = document.getElementById('uploadPhotoTriggerBtn');
        const photoFileInput = document.getElementById('profilePhotoFileInput');
        const removePhotoBtn = document.getElementById('removePhotoBtn');
        const applyUrlBtn = document.getElementById('applyAvatarUrlBtn');
        const editAvatarUrl = document.getElementById('editAvatarUrl');

        uploadTriggerBtn?.addEventListener('click', () => {
            photoFileInput?.click();
        });

        photoFileInput?.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            // Validate format
            const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
            const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
            const ext = (file.name.substring(file.name.lastIndexOf('.')) || '').toLowerCase();
            if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
                showToast('Please select a JPG, PNG, or WebP photo.', 'warning');
                e.target.value = '';
                return;
            }

            // Validate size <= 5 MB
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                showToast('Image size exceeds 5 MB. Please select a smaller photo.', 'warning');
                e.target.value = '';
                return;
            }

            if (this.previewBlobUrl) {
                try { URL.revokeObjectURL(this.previewBlobUrl); } catch (_) {}
            }

            this.stagedPhotoFile = file;
            this.stagedPhotoUrl = null;
            this.stagedRemovePhoto = false;
            this.previewBlobUrl = URL.createObjectURL(file);

            if (editAvatarUrl) editAvatarUrl.value = '';
            this.updatePreviewDisplay(this.previewBlobUrl);
            showToast('Photo selected. Click "Save Changes" to apply.', 'info');
        });

        applyUrlBtn?.addEventListener('click', () => {
            const urlVal = (editAvatarUrl?.value || '').trim();
            if (!urlVal) {
                showToast('Please enter an image URL', 'warning');
                return;
            }
            try {
                const parsed = new URL(urlVal);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    showToast('URL must begin with http:// or https://', 'warning');
                    return;
                }
            } catch (_) {
                showToast('Please enter a valid image URL', 'warning');
                return;
            }

            this.stagedPhotoFile = null;
            this.stagedPhotoUrl = urlVal;
            this.stagedRemovePhoto = false;
            if (photoFileInput) photoFileInput.value = '';

            this.updatePreviewDisplay(urlVal);
            showToast('Previewing image URL', 'info');
        });

        removePhotoBtn?.addEventListener('click', () => {
            this.stagedPhotoFile = null;
            this.stagedPhotoUrl = null;
            this.stagedRemovePhoto = true;
            if (photoFileInput) photoFileInput.value = '';
            if (editAvatarUrl) editAvatarUrl.value = '';

            const user = auth.getUser() || {};
            const initials = (user.full_name || user.username || 'CU').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CU';
            const inner = document.getElementById('profilePhotoPreviewInner');
            if (inner) inner.innerHTML = `<span id="previewInitials">${initials}</span>`;
            showToast('Photo removed for preview. Click "Save Changes" to confirm.', 'info');
        });

        editForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleProfileSave();
        });

        await this.loadProfileData();
    },

    updatePreviewDisplay(imgSrc) {
        const inner = document.getElementById('profilePhotoPreviewInner');
        if (!inner) return;
        const user = auth.getUser() || {};
        const initials = (user.full_name || user.username || 'CU').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CU';

        inner.innerHTML = `
            <img src="${imgSrc}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" onerror="this.onerror=null; this.parentElement.innerHTML='<span id=\\'previewInitials\\'>${initials}</span>'; showToast('Unable to load image from URL', 'error');">
        `;
    },

    resetStagedPhotoState() {
        if (this.previewBlobUrl) {
            try { URL.revokeObjectURL(this.previewBlobUrl); } catch (_) {}
            this.previewBlobUrl = null;
        }
        this.stagedPhotoFile = null;
        this.stagedPhotoUrl = null;
        this.stagedRemovePhoto = false;

        const fileInput = document.getElementById('profilePhotoFileInput');
        if (fileInput) fileInput.value = '';

        const user = auth.getUser() || {};
        const editAvatar = document.getElementById('editAvatarUrl');
        if (editAvatar) editAvatar.value = user.avatar_url || '';

        const inner = document.getElementById('profilePhotoPreviewInner');
        if (inner) {
            if (user.avatar_url) {
                inner.innerHTML = `<img src="${user.avatar_url}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;">`;
            } else {
                const initials = (user.full_name || user.username || 'CU').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CU';
                inner.innerHTML = `<span id="previewInitials">${initials}</span>`;
            }
        }
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
                if (user.frank_id) copyBtn.dataset.frankId = user.frank_id;
                copyBtn.addEventListener('click', async () => {
                    const fid = user.frank_id || (auth.getUser() && auth.getUser().frank_id);
                    if (typeof window.copyFrankId === 'function') {
                        window.copyFrankId(fid, copyBtn);
                    } else if (fid) {
                        try {
                            await navigator.clipboard.writeText(fid);
                            showToast('FRANK ID copied', 'success');
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

            const initials = (user.full_name || user.username || '??').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

            if (avatarEl) {
                if (user.avatar_url) {
                    avatarEl.innerHTML = `<img src="${user.avatar_url}" alt="${user.full_name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<span id=\\'profileInitials\\'>${initials}</span><span class=\\'avatar-status online\\' id=\\'profileStatusDot\\'></span>';"><span class="avatar-status online" id="profileStatusDot"></span>`;
                } else {
                    avatarEl.innerHTML = `<span id="profileInitials">${initials}</span><span class="avatar-status online" id="profileStatusDot"></span>`;
                }
            }

            // Populate form inputs and preview
            const editFullName = document.getElementById('editFullName');
            const editBio = document.getElementById('editBio');
            const editAvatar = document.getElementById('editAvatarUrl');
            if (editFullName) editFullName.value = user.full_name;
            if (editBio) editBio.value = bioText;
            if (editAvatar) editAvatar.value = user.avatar_url || '';

            const previewInner = document.getElementById('profilePhotoPreviewInner');
            if (previewInner) {
                if (user.avatar_url) {
                    previewInner.innerHTML = `<img src="${user.avatar_url}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" onerror="this.onerror=null; this.parentElement.innerHTML='<span id=\\'previewInitials\\'>${initials}</span>';">`;
                } else {
                    previewInner.innerHTML = `<span id="previewInitials">${initials}</span>`;
                }
            }

        } catch (err) {
            showToast('Failed to load profile details', 'error');
        }
    },

    async handleProfileSave() {
        const full_name = (document.getElementById('editFullName')?.value || '').trim();
        const bio = (document.getElementById('editBio')?.value || '').trim();
        const saveBtn = document.getElementById('saveProfileBtn');

        if (!full_name) {
            showToast('Full name is required', 'warning');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            let updatedUser = null;

            // 1. Handle Photo Upload / Removal / URL
            if (this.stagedRemovePhoto) {
                updatedUser = await api.removeAvatar();
            } else if (this.stagedPhotoFile instanceof File) {
                updatedUser = await api.uploadAvatar(this.stagedPhotoFile);
            }

            // 2. Update Name, Bio, and Avatar URL if applicable
            const updatePayload = { full_name, bio };
            if (this.stagedPhotoUrl !== null && !this.stagedRemovePhoto && !this.stagedPhotoFile) {
                updatePayload.avatar_url = this.stagedPhotoUrl;
            }

            updatedUser = await api.updateProfile(updatePayload);
            auth.setUser(updatedUser);

            showToast('Profile updated successfully!', 'success');
            document.getElementById('editProfileSection').style.display = 'none';
            this.resetStagedPhotoState();
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

