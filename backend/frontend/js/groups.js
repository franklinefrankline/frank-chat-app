/* -------------------------------------------------------------------------
   FRANK - GROUPS MANAGEMENT MODULE
   Group channel creation, member selection, adding members, member roles,
   group settings, shared documents and discussions
   ------------------------------------------------------------------------- */

const groupsModule = {
    init() {
        const createGroupForm = document.getElementById('createGroupForm');

        createGroupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCreateGroup();
        });

        // Populate members checklist when opening modal
        document.querySelectorAll('[data-open-modal="createGroupModal"], #navCreateGroupBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.populateMembersChecklist();
            });
        });

        this.setupGroupActionListeners();
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

                label.innerHTML = `
                    <input type="checkbox" name="groupMember" value="${user.id}">
                    <div class="avatar avatar-sm">
                        <span>${initials}</span>
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: var(--text);">${messagesModule.escapeHTML(user.full_name)}</div>
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

        const name = nameInput.value.trim();
        const description = (descInput?.value || '').trim();

        if (!name) {
            showToast('Please enter a group name', 'error');
            return;
        }

        const checkedBoxes = document.querySelectorAll('input[name="groupMember"]:checked');
        const member_ids = Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10));

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
            const group = await api.createGroup({
                name,
                description,
                member_ids
            });

            closeModal('createGroupModal');
            showToast(`Group "${group.name}" created!`, 'success');
            nameInput.value = '';
            if (descInput) descInput.value = '';

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
        let modal = document.getElementById('addMembersModal');
        if (!modal) {
            const modalHtml = `
                <div class="modal-backdrop show" id="addMembersModal" role="dialog" aria-modal="true">
                    <div class="modal-card">
                        <div class="modal-header">
                            <h2 class="modal-title">Add Members to Group</h2>
                            <button type="button" class="modal-close" id="closeAddMembersModalBtn">✕</button>
                        </div>
                        <div class="modal-body">
                            <div class="form-group">
                                <label class="form-label">Select Contacts to Add</label>
                                <div id="addMembersChecklist" style="max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px;">
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

        try {
            const [allUsers, currentMembers] = await Promise.all([
                api.getUsers(),
                api.getGroupMembers(groupId)
            ]);

            const existingMemberIds = new Set((currentMembers || []).map(m => m.user_id));
            const availableUsers = (allUsers || []).filter(u => !existingMemberIds.has(u.id));

            checklist.innerHTML = '';
            if (availableUsers.length === 0) {
                checklist.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px;">All available contacts are already members.</div>';
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
                        <div style="font-size: 11px; color: var(--text-muted);">@${messagesModule.escapeHTML(user.username)}</div>
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
                    showToast('Please select at least one member to add.', 'info');
                    return;
                }

                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Adding...';

                try {
                    await api.addGroupMembers(groupId, userIds);
                    showToast('Members added successfully!', 'success');
                    document.getElementById('addMembersModal')?.remove();

                    // Refresh group info and messages
                    if (window.chatController && window.chatController.activeId === groupId) {
                        window.chatController.loadGroupMessages(groupId);
                        window.chatController.loadGroupDetails(groupId);
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

    setupGroupActionListeners() {
        // Additional UI listeners can be wired here
    }
};

document.addEventListener('DOMContentLoaded', () => {
    groupsModule.init();
});

window.groupsModule = groupsModule;
