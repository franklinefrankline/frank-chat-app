/* -------------------------------------------------------------------------
   FRANK - GROUPS MANAGEMENT MODULE
   Group channel creation, member selection, adding members, member roles,
   group settings, shared documents and discussions
   ------------------------------------------------------------------------- */

const groupsModule = {
    addedFrankIdUsers: new Map(),

    init() {
        const createGroupForm = document.getElementById('createGroupForm');
        const frankIdInput = document.getElementById('groupFrankIdInput');
        const frankIdAddBtn = document.getElementById('groupFrankIdAddBtn');

        createGroupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCreateGroup();
        });

        // Add member via FRANK ID in group creation
        frankIdInput?.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        });

        frankIdInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addMemberByFrankId();
            }
        });

        frankIdAddBtn?.addEventListener('click', () => {
            this.addMemberByFrankId();
        });

        // Populate members checklist when opening modal
        document.querySelectorAll('[data-open-modal="createGroupModal"], #navCreateGroupBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.addedFrankIdUsers.clear();
                this.renderSelectedPills();
                this.populateMembersChecklist();
            });
        });

        this.setupGroupActionListeners();
    },

    async addMemberByFrankId() {
        const input = document.getElementById('groupFrankIdInput');
        const fid = (input?.value || '').trim().toUpperCase();
        if (!fid || fid.length !== 6) {
            showToast('Enter a valid 6-character FRANK ID', 'warning');
            return;
        }

        const currentUser = auth.getUser();
        if (currentUser && (currentUser.frank_id || '').toUpperCase() === fid) {
            showToast('You are already the creator of this group!', 'info');
            return;
        }

        try {
            const user = await api.getUserByFrankId(fid);
            if (this.addedFrankIdUsers.has(user.id)) {
                showToast(`${user.full_name} is already added.`, 'info');
                return;
            }

            this.addedFrankIdUsers.set(user.id, user);
            this.renderSelectedPills();
            if (input) input.value = '';
            showToast(`Added ${user.full_name} to group list!`, 'success');
        } catch (err) {
            showToast(err.message || `User with FRANK ID "${fid}" not found`, 'error');
        }
    },

    renderSelectedPills() {
        const container = document.getElementById('groupSelectedPills');
        if (!container) return;
        container.innerHTML = '';

        this.addedFrankIdUsers.forEach(user => {
            const pill = document.createElement('div');
            pill.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(6, 182, 212, 0.12); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 16px; font-size: 12px; font-weight: 600; color: var(--text);';
            pill.innerHTML = `
                <span>${messagesModule.escapeHTML(user.full_name)} (${messagesModule.escapeHTML(user.frank_id || '')})</span>
                <button type="button" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px;">✕</button>
            `;
            pill.querySelector('button').addEventListener('click', () => {
                this.addedFrankIdUsers.delete(user.id);
                this.renderSelectedPills();
            });
            container.appendChild(pill);
        });
    },

    async populateMembersChecklist() {
        const container = document.getElementById('groupMembersChecklist');
        if (!container) return;

        container.innerHTML = '<div class="spinner" style="margin: 15px auto;"></div>';

        try {
            const users = await api.getUsers();
            container.innerHTML = '';

            if (!users || users.length === 0) {
                container.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px;">No other users found.</div>';
                return;
            }

            users.forEach(user => {
                const label = document.createElement('label');
                label.className = 'group-member-checkbox-row';
                const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const frankBadge = user.frank_id ? `<span style="font-family: monospace; font-size: 10px; color: var(--accent-cyan); margin-left: 4px;">[${user.frank_id}]</span>` : '';

                label.innerHTML = `
                    <input type="checkbox" name="groupMember" value="${user.id}">
                    <div class="avatar avatar-sm">
                        <span>${initials}</span>
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: var(--text);">${messagesModule.escapeHTML(user.full_name)}${frankBadge}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">@${messagesModule.escapeHTML(user.username)}</div>
                    </div>
                `;
                container.appendChild(label);
            });
        } catch {
            container.innerHTML = '<div style="font-size: 13px; color: var(--danger); text-align: center; padding: 8px;">Failed to load contacts.</div>';
        }
    },

    async handleCreateGroup() {
        const nameInput = document.getElementById('groupNameInput');
        const descInput = document.getElementById('groupDescInput');
        const submitBtn = document.getElementById('createGroupSubmitBtn');
        const privacyRadio = document.querySelector('input[name="groupPrivacy"]:checked');

        const name = nameInput.value.trim();
        const description = (descInput?.value || '').trim();
        const privacy = privacyRadio ? privacyRadio.value : 'private';

        if (!name) {
            showToast('Please enter a group name', 'error');
            return;
        }

        const checkedBoxes = document.querySelectorAll('input[name="groupMember"]:checked');
        const member_ids_set = new Set(Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10)));
        this.addedFrankIdUsers.forEach(u => member_ids_set.add(u.id));
        const member_ids = Array.from(member_ids_set);

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
            const group = await api.createGroup({
                name,
                description,
                privacy,
                member_ids
            });

            closeModal('createGroupModal');
            showToast(`Group "${group.name}" created!`, 'success');
            nameInput.value = '';
            if (descInput) descInput.value = '';
            this.addedFrankIdUsers.clear();
            this.renderSelectedPills();

            // Refresh conversations and open newly created group
            if (window.appController) {
                await window.appController.loadConversations(false);
            }

            if (window.chatController) {
                group.type = 'group';
                window.chatController.openGroupChat(group);
            }
        } catch (err) {
            showToast(err.message || 'Failed to create group', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Group';
        }
    },


    // ---------------- ADD MEMBERS MODAL ----------------
    async openAddMembersModal(groupId) {
        if (!groupId) {
            groupId = window.chatController?.activeId;
        }
        if (!groupId) {
            showToast('No active group selected.', 'warning');
            return;
        }

        const currentUser = auth.getUser();
        if (!currentUser) return;

        // First verify group membership and permissions
        let currentMembers = [];
        try {
            currentMembers = await api.getGroupMembers(groupId);
        } catch (err) {
            showToast(err.message || 'Failed to verify group membership.', 'error');
            return;
        }

        const myMembership = (currentMembers || []).find(m => Number(m.user_id) === Number(currentUser.id));
        const groupObj = (window.chatController && window.chatController.groups) ? window.chatController.groups.find(g => Number(g.id) === Number(groupId)) : null;
        const isCreator = groupObj && Number(groupObj.created_by) === Number(currentUser.id);
        const isPlatformAdmin = currentUser.role === 'admin';
        const myRole = myMembership ? myMembership.role : (isCreator ? 'owner' : (isPlatformAdmin ? 'admin' : null));
        if (myRole !== 'owner' && myRole !== 'admin' && !isCreator && !isPlatformAdmin) {
            showToast('Only group owners and administrators can add members.', 'warning');
            return;
        }

        // Clean up any existing modal instance to avoid stale handlers
        document.getElementById('addMembersModal')?.remove();

        const modalHtml = `
            <div class="modal-backdrop open show" id="addMembersModal" role="dialog" aria-modal="true" style="z-index: 1050;">
                <div class="modal-card" style="max-width: 480px; width: 92vw; max-height: 85vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <h2 class="modal-title" style="font-size: 17px; font-weight: 700; margin: 0; color: var(--text);">Add Group Members</h2>
                            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Search and select contacts to add to this group</div>
                        </div>
                        <button type="button" class="btn btn-ghost btn-icon modal-close" id="closeAddMembersModalBtn" aria-label="Close">✕</button>
                    </div>
                    <div class="modal-body" style="padding: 16px 20px; flex: 1; overflow-y: auto;">
                        <div class="form-group" style="margin-bottom: 12px;">
                            <div style="position: relative;">
                                <input type="text" id="addMembersSearchInput" class="form-input" placeholder="Search by name, @username, or FRANK ID..." autocomplete="off" style="padding-left: 36px; width: 100%; box-sizing: border-box;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none;">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                            </div>
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: var(--text-muted);">
                            <span id="addMembersAvailableCount">Loading available contacts...</span>
                            <span id="addMembersSelectedCount" style="font-weight: 700; color: var(--primary);">0 selected</span>
                        </div>

                        <div id="addMembersChecklist" class="add-members-checklist" style="max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 4px; background: var(--surface);">
                            <div class="spinner" style="margin: 30px auto;"></div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px;">
                        <button type="button" class="btn btn-secondary" id="cancelAddMembersBtn">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirmAddMembersBtn" disabled>Add Members</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById('addMembersModal');
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') closeModal();
        };
        document.addEventListener('keydown', handleKeyDown);

        const closeModal = () => {
            document.removeEventListener('keydown', handleKeyDown);
            modal?.remove();
        };
        document.getElementById('closeAddMembersModalBtn')?.addEventListener('click', closeModal);
        document.getElementById('cancelAddMembersBtn')?.addEventListener('click', closeModal);
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const checklist = document.getElementById('addMembersChecklist');
        const searchInput = document.getElementById('addMembersSearchInput');
        setTimeout(() => searchInput?.focus(), 60);
        const countLabel = document.getElementById('addMembersAvailableCount');
        const selectedCountLabel = document.getElementById('addMembersSelectedCount');
        const confirmBtn = document.getElementById('confirmAddMembersBtn');

        const selectedUserIds = new Set();
        let eligibleUsers = [];

        try {
            const allUsers = await api.getUsers();
            const existingMemberIds = new Set((currentMembers || []).map(m => Number(m.user_id)));
            // Exclude already existing members and current user
            eligibleUsers = (allUsers || []).filter(u => !existingMemberIds.has(Number(u.id)) && Number(u.id) !== Number(currentUser.id));

            const renderUserList = (filterText = '') => {
                const query = filterText.trim().toLowerCase();
                const filtered = eligibleUsers.filter(u => {
                    if (!query) return true;
                    const name = (u.full_name || '').toLowerCase();
                    const username = (u.username || '').toLowerCase();
                    const fid = (u.frank_id || '').toLowerCase();
                    return name.includes(query) || username.includes(query) || fid.includes(query);
                });

                if (countLabel) {
                    countLabel.textContent = `${filtered.length} contact${filtered.length === 1 ? '' : 's'} available`;
                }

                if (filtered.length === 0) {
                    checklist.innerHTML = query
                        ? '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px;">No contacts match your search.</div>'
                        : '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px;">All registered contacts are already members of this group.</div>';
                    return;
                }

                checklist.innerHTML = '';
                filtered.forEach(user => {
                    const isChecked = selectedUserIds.has(Number(user.id));
                    const label = document.createElement('label');
                    label.className = 'group-member-checkbox-row add-member-picker-row';
                    label.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; transition: background 0.15s ease; border-bottom: 1px solid var(--border);';

                    const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    const avatarContent = user.avatar_url
                        ? `<img src="${user.avatar_url}" alt="${initials}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
                        : `<span>${initials}</span>`;

                    const fidPill = user.frank_id
                        ? `<span class="drawer-member-fid-pill" style="font-family: monospace; font-size: 10px; padding: 1px 5px; background: rgba(168,162,158,0.15); border: 1px solid var(--border); border-radius: 4px; color: var(--text-secondary); font-weight: 700;">${messagesModule.escapeHTML(user.frank_id)}</span>`
                        : '';

                    label.innerHTML = `
                        <input type="checkbox" name="addMemberUser" value="${user.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--primary);">
                        <div class="avatar avatar-sm" style="width: 32px; height: 32px; flex-shrink: 0;">
                            ${avatarContent}
                            <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                        </div>
                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                                <span style="font-weight: 700; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${messagesModule.escapeHTML(user.full_name || user.username)}</span>
                                ${fidPill}
                            </div>
                            <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">@${messagesModule.escapeHTML(user.username || 'user')}</div>
                        </div>
                    `;

                    const checkbox = label.querySelector('input[type="checkbox"]');
                    checkbox.addEventListener('change', (e) => {
                        const uid = Number(e.target.value);
                        if (e.target.checked) {
                            selectedUserIds.add(uid);
                            label.style.background = 'rgba(6, 182, 212, 0.08)';
                        } else {
                            selectedUserIds.delete(uid);
                            label.style.background = '';
                        }
                        updateSelectionUI();
                    });

                    if (isChecked) {
                        label.style.background = 'rgba(6, 182, 212, 0.08)';
                    }

                    checklist.appendChild(label);
                });
            };

            const updateSelectionUI = () => {
                const count = selectedUserIds.size;
                if (selectedCountLabel) {
                    selectedCountLabel.textContent = `${count} selected`;
                }
                if (confirmBtn) {
                    confirmBtn.disabled = count === 0;
                    confirmBtn.textContent = count > 0 ? `Add Selected (${count})` : 'Add Members';
                }
            };

            renderUserList();

            // Search filter with debounce
            let searchTimeout;
            searchInput?.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    renderUserList(e.target.value);
                }, 150);
            });

            // Confirm submission to existing backend API
            confirmBtn.onclick = async () => {
                const userIds = Array.from(selectedUserIds);
                if (userIds.length === 0) {
                    showToast('Please select at least one contact to add.', 'info');
                    return;
                }

                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Adding...';

                try {
                    await api.addGroupMembers(groupId, userIds);
                    showToast(`Added ${userIds.length} member${userIds.length > 1 ? 's' : ''} to the group!`, 'success');
                    closeModal();

                    // Refresh group info, member list, and messages
                    if (window.chatController && window.chatController.activeId === groupId) {
                        await window.chatController.loadGroupMembersList(groupId);
                        await window.chatController.loadGroupMessages(groupId);
                        if (typeof window.chatController.loadGroupDetails === 'function') {
                            window.chatController.loadGroupDetails(groupId);
                        }
                    }
                    if (window.appController) {
                        window.appController.loadConversations(false);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to add members', 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `Add Selected (${userIds.length})`;
                }
            };

        } catch (err) {
            checklist.innerHTML = `<div style="font-size: 13px; color: var(--danger); text-align: center; padding: 20px;">Failed to load contacts: ${messagesModule.escapeHTML(err.message || 'Network error')}</div>`;
            if (countLabel) countLabel.textContent = 'Error';
        }
    },

    // ---------------- LEAVE GROUP ----------------
    leaveGroup(groupId, groupName = 'this group') {
        const currentUser = auth.getUser();
        if (!currentUser) return;

        createConfirmModal(
            'Leave Group',
            `Are you sure you want to leave "${groupName}"? You will no longer receive new messages from this group.`,
            async () => {
                try {
                    await api.removeGroupMember(groupId, currentUser.id);
                    showToast(`You left "${groupName}".`, 'info');

                    // Close chat and refresh list
                    if (window.chatController && Number(window.chatController.activeId) === Number(groupId)) {
                        window.chatController.closeActiveChat();
                    }
                    if (window.appController) {
                        window.appController.loadConversations(false);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to leave group', 'error');
                }
            }
        );
    },

    // ---------------- UPDATE MEMBER ROLE (MAKE ADMIN / DEMOTE) ----------------
    updateMemberRole(groupId, userId, newRole, userName = 'member') {
        const isPromote = newRole === 'admin';
        const title = isPromote ? 'Promote to Admin' : 'Demote to Member';
        const message = isPromote
            ? `Are you sure you want to promote ${userName} to Group Administrator? They will be able to manage group settings, add members, and remove members.`
            : `Are you sure you want to demote ${userName} to a regular member? They will no longer have administrative permissions.`;

        createConfirmModal(
            title,
            message,
            async () => {
                try {
                    await api.updateMemberRole(groupId, userId, newRole);
                    showToast(isPromote ? `${userName} is now an Admin.` : `${userName} is now a regular member.`, 'success');
                    if (window.chatController) {
                        await window.chatController.loadGroupMembersList(groupId);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to update member role', 'error');
                }
            }
        );
    },

    // ---------------- REMOVE MEMBER ----------------
    removeMember(groupId, userId, userName = 'member') {
        createConfirmModal(
            'Remove Member',
            `Are you sure you want to remove ${userName} from this group? They will no longer have access to group chats and shared files.`,
            async () => {
                try {
                    await api.removeGroupMember(groupId, userId);
                    showToast(`Removed ${userName} from the group.`, 'info');
                    if (window.chatController) {
                        await window.chatController.loadGroupMembersList(groupId);
                        await window.chatController.loadGroupMessages(groupId);
                        if (typeof window.chatController.loadGroupDetails === 'function') {
                            window.chatController.loadGroupDetails(groupId);
                        }
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to remove member', 'error');
                }
            }
        );
    },

    // ---------------- DELETE GROUP ----------------
    deleteGroup(groupId, groupName = 'this group') {
        createConfirmModal(
            'Delete Group',
            `Are you sure you want to permanently delete "${groupName}"? All messages, shared documents, and member records in this group will be deleted. This action cannot be undone.`,
            async () => {
                try {
                    await api.deleteGroup(groupId);
                    showToast(`Group "${groupName}" deleted.`, 'info');
                    if (window.chatController && Number(window.chatController.activeId) === Number(groupId)) {
                        window.chatController.closeActiveChat();
                    }
                    if (window.appController) {
                        window.appController.loadConversations(false);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to delete group', 'error');
                }
            }
        );
    },

    setupGroupActionListeners() {
        // Additional UI listeners can be wired here
    }

};

document.addEventListener('DOMContentLoaded', () => {
    groupsModule.init();
});

window.groupsModule = groupsModule;
