/* -------------------------------------------------------------------------
   FRANK - GROUPS MANAGEMENT MODULE
   Group channel creation (Private default / Public), member selection,
   FRANK ID member addition, role hierarchy (OWNER > ADMIN > MEMBER),
   role promotion/demotion, member removal, leaving, and group deletion
   ------------------------------------------------------------------------- */

const groupsModule = {
    addedUsersFromFrankId: new Map(), // userId -> User object

    init() {
        const createGroupForm = document.getElementById('createGroupForm');

        createGroupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCreateGroup();
        });

        // Setup add by FRANK ID in create group modal
        this.setupFrankIdMemberAdder();

        // Populate members checklist when opening modal
        document.querySelectorAll('[data-open-modal="createGroupModal"], #navCreateGroupBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.resetCreateGroupModal();
                this.populateMembersChecklist();
            });
        });
    },

    setupFrankIdMemberAdder() {
        const input = document.getElementById('groupAddFrankIdInput');
        const btn = document.getElementById('groupAddFrankIdBtn');

        input?.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addMemberByFrankId();
            }
        });

        btn?.addEventListener('click', () => {
            this.addMemberByFrankId();
        });
    },

    resetCreateGroupModal() {
        const input = document.getElementById('groupAddFrankIdInput');
        const chipsContainer = document.getElementById('groupAddedChipsContainer');
        if (input) input.value = '';
        if (chipsContainer) chipsContainer.innerHTML = '';
        this.addedUsersFromFrankId.clear();
    },

    async addMemberByFrankId() {
        const input = document.getElementById('groupAddFrankIdInput');
        const btn = document.getElementById('groupAddFrankIdBtn');
        const chipsContainer = document.getElementById('groupAddedChipsContainer');

        const frankId = (input?.value || '').trim().toUpperCase();
        if (frankId.length !== 6) {
            showToast('Please enter a 6-character FRANK ID', 'warning');
            return;
        }

        const currentUser = auth.getUser();
        if (currentUser && currentUser.frank_id === frankId) {
            showToast('You are already the group owner!', 'info');
            return;
        }

        if (btn) btn.disabled = true;

        try {
            const user = await api.getUserByFrankId(frankId);

            if (this.addedUsersFromFrankId.has(user.id)) {
                showToast(`${user.full_name} is already added.`, 'info');
                return;
            }

            this.addedUsersFromFrankId.set(user.id, user);

            // Also check the checkbox if present in the checklist
            const existingCb = document.querySelector(`input[name="groupMember"][value="${user.id}"]`);
            if (existingCb) existingCb.checked = true;

            // Render chip
            if (chipsContainer) {
                const chip = document.createElement('span');
                chip.className = 'badge-member';
                chip.id = `groupChip_${user.id}`;
                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 11px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md);';
                chip.innerHTML = `
                    <strong style="color: var(--text);">${messagesModule.escapeHTML(user.full_name)}</strong>
                    <span style="color: var(--text-muted);">(${user.frank_id})</span>
                    <button type="button" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 0 2px; font-size: 12px;" title="Remove">✕</button>
                `;

                chip.querySelector('button').onclick = () => {
                    this.addedUsersFromFrankId.delete(user.id);
                    chip.remove();
                    if (existingCb) existingCb.checked = false;
                };

                chipsContainer.appendChild(chip);
            }

            if (input) input.value = '';
            showToast(`Added ${user.full_name} to group list`, 'success');
        } catch (err) {
            showToast(`No user found with FRANK ID "${frankId}"`, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    async populateMembersChecklist() {
        const container = document.getElementById('groupMembersChecklist');
        if (!container) return;

        container.innerHTML = '<div class="spinner" style="margin: 15px auto;"></div>';

        try {
            const users = await api.getUsers();
            container.innerHTML = '';

            if (!users || users.length === 0) {
                container.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px;">No other contacts found.</div>';
                return;
            }

            users.forEach(user => {
                const label = document.createElement('label');
                label.className = 'group-member-checkbox-row';
                const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const isPreselected = this.addedUsersFromFrankId.has(user.id);

                label.innerHTML = `
                    <input type="checkbox" name="groupMember" value="${user.id}" ${isPreselected ? 'checked' : ''}>
                    <div class="avatar avatar-sm">
                        <span>${initials}</span>
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: var(--text);">${messagesModule.escapeHTML(user.full_name)}</div>
                        <div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                            <span>@${messagesModule.escapeHTML(user.username)}</span>
                            ${user.frank_id ? `<span style="font-family: monospace; font-size: 10px; color: var(--primary);">${user.frank_id}</span>` : ''}
                        </div>
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
        const is_private = privacyRadio ? privacyRadio.value === 'private' : true;

        if (!name) {
            showToast('Please enter a group name', 'error');
            return;
        }

        const checkedBoxes = document.querySelectorAll('input[name="groupMember"]:checked');
        const memberIdsSet = new Set(Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10)));

        // Include any added from the FRANK ID chip adder
        for (const userId of this.addedUsersFromFrankId.keys()) {
            memberIdsSet.add(userId);
        }

        const member_ids = Array.from(memberIdsSet);

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
            const group = await api.createGroup({
                name,
                description,
                is_private,
                member_ids
            });

            closeModal('createGroupModal');
            showToast(`Group "${group.name}" created!`, 'success');
            nameInput.value = '';
            if (descInput) descInput.value = '';
            this.resetCreateGroupModal();

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

    // ---------------- ADD MEMBERS MODAL (WITH FRANK ID & CONTACTS) ----------------
    async openAddMembersModal(groupId) {
        let modal = document.getElementById('addMembersModal');
        if (!modal) {
            const modalHtml = `
                <div class="modal-backdrop show" id="addMembersModal" role="dialog" aria-modal="true">
                    <div class="modal-card" style="max-width: 480px;">
                        <div class="modal-header">
                            <h2 class="modal-title">Add Members to Group</h2>
                            <button type="button" class="modal-close" id="closeAddMembersModalBtn">✕</button>
                        </div>
                        <div class="modal-body">
                            <!-- Quick add by FRANK ID -->
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label class="form-label" style="font-size: 12px;">Add Member by FRANK ID</label>
                                <div style="display: flex; gap: 8px;">
                                    <input type="text" class="form-input" id="drawerAddMemberFrankIdInput" placeholder="Enter 6-char FRANK ID" maxlength="6" style="text-transform: uppercase; font-family: monospace; font-weight: 700; letter-spacing: 1px;">
                                    <button type="button" class="btn btn-secondary btn-sm" id="drawerAddMemberFrankIdBtn">Add</button>
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label" style="font-size: 12px;">Select from Contacts</label>
                                <div id="addMembersChecklist" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px;">
                                    <div class="spinner" style="margin: 15px auto;"></div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="cancelAddMembersBtn">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmAddMembersBtn">Add Selected</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.getElementById('closeAddMembersModalBtn')?.addEventListener('click', () => {
                document.getElementById('addMembersModal')?.remove();
            });
            document.getElementById('cancelAddMembersBtn')?.addEventListener('click', () => {
                document.getElementById('addMembersModal')?.remove();
            });
        }

        const checklist = document.getElementById('addMembersChecklist');
        checklist.innerHTML = '<div class="spinner" style="margin: 15px auto;"></div>';

        const frankIdInput = document.getElementById('drawerAddMemberFrankIdInput');
        const frankIdBtn = document.getElementById('drawerAddMemberFrankIdBtn');

        frankIdInput?.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        });

        frankIdBtn?.addEventListener('click', async () => {
            const fid = (frankIdInput?.value || '').trim().toUpperCase();
            if (fid.length !== 6) {
                showToast('Please enter a 6-character FRANK ID', 'warning');
                return;
            }
            try {
                const user = await api.getUserByFrankId(fid);
                await api.addGroupMembers(groupId, [user.id]);
                showToast(`Added ${user.full_name} to group!`, 'success');
                document.getElementById('addMembersModal')?.remove();
                if (window.chatController && window.chatController.activeId === groupId) {
                    window.chatController.updateDetailsDrawer(window.chatController.activePartner);
                }
            } catch (err) {
                showToast(err.message || 'User not found or already in group', 'error');
            }
        });

        try {
            const [allUsers, currentMembers] = await Promise.all([
                api.getUsers(),
                api.getGroupMembers(groupId)
            ]);

            const existingMemberIds = new Set((currentMembers || []).map(m => m.user_id));
            const availableUsers = (allUsers || []).filter(u => !existingMemberIds.has(u.id));

            checklist.innerHTML = '';
            if (availableUsers.length === 0) {
                checklist.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px;">All available contacts are already in this group.</div>';
                return;
            }

            availableUsers.forEach(user => {
                const label = document.createElement('label');
                label.className = 'group-member-checkbox-row';
                const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                label.innerHTML = `
                    <input type="checkbox" name="addMemberUser" value="${user.id}">
                    <div class="avatar avatar-sm">
                        <span>${initials}</span>
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: var(--text);">${messagesModule.escapeHTML(user.full_name)}</div>
                        <div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                            <span>@${messagesModule.escapeHTML(user.username)}</span>
                            ${user.frank_id ? `<span style="font-family: monospace; font-size: 10px; color: var(--primary);">${user.frank_id}</span>` : ''}
                        </div>
                    </div>
                `;
                checklist.appendChild(label);
            });

            // Action listener for confirmation
            const confirmBtn = document.getElementById('confirmAddMembersBtn');
            confirmBtn.onclick = async () => {
                const checked = document.querySelectorAll('input[name="addMemberUser"]:checked');
                const userIds = Array.from(checked).map(c => parseInt(c.value, 10));
                if (userIds.length === 0) {
                    showToast('Please select at least one contact to add.', 'info');
                    return;
                }

                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Adding...';

                try {
                    await api.addGroupMembers(groupId, userIds);
                    showToast('Members added successfully!', 'success');
                    document.getElementById('addMembersModal')?.remove();

                    // Refresh group info and members
                    if (window.chatController && window.chatController.activeId === groupId) {
                        window.chatController.loadGroupMessages(groupId);
                        window.chatController.updateDetailsDrawer(window.chatController.activePartner);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to add members', 'error');
                } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Add Selected';
                }
            };

        } catch (err) {
            checklist.innerHTML = '<div style="font-size: 13px; color: var(--danger); text-align: center; padding: 8px;">Failed to load contacts.</div>';
        }
    },

    // ---------------- UPDATE MEMBER ROLE (OWNER ONLY) ----------------
    async changeMemberRole(groupId, userId, newRole, memberName) {
        try {
            await api.updateGroupMemberRole(groupId, userId, newRole);
            showToast(`${memberName}'s role updated to ${newRole.toUpperCase()}`, 'success');
            if (window.chatController && window.chatController.activeId === groupId) {
                window.chatController.loadGroupMembersList(groupId);
            }
        } catch (err) {
            showToast(err.message || 'Failed to change role', 'error');
            if (window.chatController && window.chatController.activeId === groupId) {
                window.chatController.loadGroupMembersList(groupId);
            }
        }
    },

    // ---------------- KICK MEMBER ----------------
    async removeMember(groupId, userId, memberName) {
        createConfirmModal(
            'Remove Member',
            `Are you sure you want to remove "${memberName}" from this group?`,
            async () => {
                try {
                    await api.removeGroupMember(groupId, userId);
                    showToast(`Removed ${memberName} from group`, 'info');
                    if (window.chatController && window.chatController.activeId === groupId) {
                        window.chatController.loadGroupMembersList(groupId);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to remove member', 'error');
                }
            }
        );
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

                    if (window.chatController && window.chatController.activeId === groupId) {
                        window.chatController.closeActiveChat();
                    }
                    if (window.appController) {
                        window.appController.loadConversations(true);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to leave group', 'error');
                }
            }
        );
    },

    // ---------------- DELETE GROUP (OWNER ONLY) ----------------
    confirmDeleteGroup(groupId, groupName = 'this group') {
        createConfirmModal(
            'Delete Group Channel',
            `Are you sure you want to permanently delete "${groupName}"? All messages and attachments in this group channel will be deleted permanently. This action CANNOT be undone.`,
            async () => {
                try {
                    await api.deleteGroup(groupId);
                    showToast(`Group "${groupName}" has been deleted.`, 'success');

                    if (window.chatController && window.chatController.activeId === groupId) {
                        window.chatController.closeActiveChat();
                    }
                    if (window.appController) {
                        window.appController.loadConversations(true);
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to delete group', 'error');
                }
            }
        );
    }
};

document.addEventListener('DOMContentLoaded', () => {
    groupsModule.init();
});

window.groupsModule = groupsModule;
