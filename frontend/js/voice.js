/* -------------------------------------------------------------------------
   FRANK - DEDICATED VOICE MESSAGE & MICROPHONE MODULE
   Native MediaRecorder recording, real microphone permission flow,
   live timer ticker, in-composer audio preview, upload progress,
   and authenticated voice message playback.
   ------------------------------------------------------------------------- */

class VoiceRecorderController {
    constructor() {
        this.mediaRecorder = null;
        this.audioStream = null;
        this.audioChunks = [];
        this.recordingTimer = null;
        this.recordedSeconds = 0;
        this.recordedBlob = null;
        this.recordedUrl = null;
        this.previewAudio = null;
        this.isPlayingPreview = false;

        this.dom = {
            mainComposer: document.getElementById('mainComposerBar'),
            recordingBar: document.getElementById('composerRecordingBar'),
            recordingTimerText: document.getElementById('recordingTimerText'),
            cancelRecordingBtn: document.getElementById('cancelRecordingBtn'),
            stopRecordingBtn: document.getElementById('stopRecordingBtn'),
            voicePreviewBar: document.getElementById('composerVoicePreviewBar'),
            voicePreviewPlayBtn: document.getElementById('voicePreviewPlayBtn'),
            voicePreviewWaveform: document.getElementById('voicePreviewWaveform'),
            voicePreviewFill: document.getElementById('voicePreviewFill'),
            voicePreviewTimerText: document.getElementById('voicePreviewTimerText'),
            deleteVoicePreviewBtn: document.getElementById('deleteVoicePreviewBtn'),
            sendVoicePreviewBtn: document.getElementById('sendVoicePreviewBtn'),
            composerActionBtn: document.getElementById('composerSendBtn')
        };

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Stop & Cancel buttons during active recording
        this.dom.cancelRecordingBtn?.addEventListener('click', () => this.cancelRecording());
        this.dom.stopRecordingBtn?.addEventListener('click', () => this.stopRecording());

        // Audio preview buttons
        this.dom.voicePreviewPlayBtn?.addEventListener('click', () => this.togglePlayPreview());
        this.dom.deleteVoicePreviewBtn?.addEventListener('click', () => this.discardPreview());
        this.dom.sendVoicePreviewBtn?.addEventListener('click', () => this.sendVoiceMessage());

        // Seek in preview waveform
        this.dom.voicePreviewWaveform?.addEventListener('click', (e) => {
            if (!this.previewAudio || !this.previewAudio.duration) return;
            const rect = this.dom.voicePreviewWaveform.getBoundingClientRect();
            const clickPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.previewAudio.currentTime = clickPos * this.previewAudio.duration;
            if (this.dom.voicePreviewFill) {
                this.dom.voicePreviewFill.style.width = `${clickPos * 100}%`;
            }
        });
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    isRecordingSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }

    // ---------------- START RECORDING ----------------
    async startRecording() {
        if (!this.isRecordingSupported()) {
            showToast('Voice recording is not supported by this browser.', 'error');
            return;
        }

        const chat = window.chatController;
        if (!chat || !chat.activeId) {
            showToast('Please select a conversation first.', 'error');
            return;
        }

        try {
            // Request microphone permission on user interaction
            this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.warn('Microphone permission error:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                showToast('Microphone permission is required to record a voice message.', 'error');
            } else {
                showToast('Could not access microphone: ' + (err.message || 'Device error'), 'error');
            }
            return;
        }

        // Determine best supported audio format
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
            else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
            else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
            else mimeType = ''; // Let browser choose default
        }

        try {
            this.mediaRecorder = mimeType ? new MediaRecorder(this.audioStream, { mimeType }) : new MediaRecorder(this.audioStream);
        } catch (e) {
            this.mediaRecorder = new MediaRecorder(this.audioStream);
        }

        this.audioChunks = [];
        this.recordedSeconds = 0;

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.audioChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            this.handleRecordingComplete();
        };

        // Start recorder & timer
        this.mediaRecorder.start(200);
        this.startTimer();

        // Switch composer view to recording bar
        if (this.dom.mainComposer) this.dom.mainComposer.style.display = 'none';
        if (this.dom.voicePreviewBar) this.dom.voicePreviewBar.style.display = 'none';
        if (this.dom.recordingBar) this.dom.recordingBar.style.display = 'flex';
    }

    startTimer() {
        if (this.dom.recordingTimerText) this.dom.recordingTimerText.textContent = '00:00';
        this.recordingTimer = setInterval(() => {
            this.recordedSeconds++;
            if (this.dom.recordingTimerText) {
                this.dom.recordingTimerText.textContent = this.formatTime(this.recordedSeconds);
            }
            // Cap at 10 minutes
            if (this.recordedSeconds >= 600) {
                this.stopRecording();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    // ---------------- CANCEL RECORDING ----------------
    cancelRecording() {
        this.stopTimer();

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.onstop = null; // Don't process chunks
            this.mediaRecorder.stop();
        }

        this.releaseMicrophone();
        this.audioChunks = [];
        this.recordedBlob = null;

        this.resetToNormalComposer();
    }

    // ---------------- STOP RECORDING & PREVIEW ----------------
    stopRecording() {
        this.stopTimer();

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.releaseMicrophone();
    }

    releaseMicrophone() {
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
    }

    handleRecordingComplete() {
        if (this.audioChunks.length === 0 || this.recordedSeconds < 1) {
            showToast('Voice message too short.', 'info');
            this.resetToNormalComposer();
            return;
        }

        const mimeType = (this.mediaRecorder && this.mediaRecorder.mimeType) || 'audio/webm';
        this.recordedBlob = new Blob(this.audioChunks, { type: mimeType });
        this.recordedUrl = URL.createObjectURL(this.recordedBlob);

        // Setup audio element for preview
        if (this.previewAudio) {
            this.previewAudio.pause();
            this.previewAudio = null;
        }

        this.previewAudio = new Audio(this.recordedUrl);
        this.previewAudio.addEventListener('timeupdate', () => {
            if (!this.previewAudio) return;
            const current = this.previewAudio.currentTime;
            const duration = this.previewAudio.duration || this.recordedSeconds;
            const pct = duration > 0 ? (current / duration) * 100 : 0;
            if (this.dom.voicePreviewFill) this.dom.voicePreviewFill.style.width = `${pct}%`;
            if (this.dom.voicePreviewTimerText) this.dom.voicePreviewTimerText.textContent = this.formatTime(current);
        });

        this.previewAudio.addEventListener('ended', () => {
            this.setPreviewPlayingState(false);
            if (this.dom.voicePreviewFill) this.dom.voicePreviewFill.style.width = '0%';
            if (this.dom.voicePreviewTimerText) {
                this.dom.voicePreviewTimerText.textContent = this.formatTime(this.recordedSeconds);
            }
        });

        if (this.dom.voicePreviewTimerText) {
            this.dom.voicePreviewTimerText.textContent = this.formatTime(this.recordedSeconds);
        }
        if (this.dom.voicePreviewFill) {
            this.dom.voicePreviewFill.style.width = '0%';
        }
        this.setPreviewPlayingState(false);

        // Show voice preview bar
        if (this.dom.recordingBar) this.dom.recordingBar.style.display = 'none';
        if (this.dom.mainComposer) this.dom.mainComposer.style.display = 'none';
        if (this.dom.voicePreviewBar) this.dom.voicePreviewBar.style.display = 'flex';
    }

    togglePlayPreview() {
        if (!this.previewAudio) return;

        if (this.isPlayingPreview) {
            this.previewAudio.pause();
            this.setPreviewPlayingState(false);
        } else {
            this.previewAudio.play().then(() => {
                this.setPreviewPlayingState(true);
            }).catch(e => {
                console.warn('Playback error:', e);
            });
        }
    }

    setPreviewPlayingState(isPlaying) {
        this.isPlayingPreview = isPlaying;
        const playSvg = this.dom.voicePreviewPlayBtn?.querySelector('.play-svg');
        const pauseSvg = this.dom.voicePreviewPlayBtn?.querySelector('.pause-svg');
        if (playSvg) playSvg.style.display = isPlaying ? 'none' : 'block';
        if (pauseSvg) pauseSvg.style.display = isPlaying ? 'block' : 'none';
    }

    discardPreview() {
        if (this.previewAudio) {
            this.previewAudio.pause();
            this.previewAudio = null;
        }
        if (this.recordedUrl) {
            URL.revokeObjectURL(this.recordedUrl);
            this.recordedUrl = null;
        }
        this.recordedBlob = null;
        this.resetToNormalComposer();
    }

    resetToNormalComposer() {
        if (this.dom.recordingBar) this.dom.recordingBar.style.display = 'none';
        if (this.dom.voicePreviewBar) this.dom.voicePreviewBar.style.display = 'none';
        if (this.dom.mainComposer) this.dom.mainComposer.style.display = 'flex';

        // Refresh dynamic action button
        if (window.chatController) {
            window.chatController.updateComposerActionButton();
        }
    }

    // ---------------- SEND VOICE MESSAGE ----------------
    async sendVoiceMessage() {
        if (!this.recordedBlob) return;

        const chat = window.chatController;
        if (!chat || !chat.activeId) {
            showToast('Please select a conversation first.', 'error');
            this.discardPreview();
            return;
        }

        const sendBtn = this.dom.sendVoicePreviewBtn;
        const origBtnHtml = sendBtn ? sendBtn.innerHTML : '';
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="spinner-sm"></span> Sending...';
        }

        // Determine filename & ext
        const ext = this.recordedBlob.type.includes('mp4') ? '.m4a' : (this.recordedBlob.type.includes('ogg') ? '.ogg' : '.webm');
        const filename = `voice-message-${Date.now()}${ext}`;
        const durationSecs = Math.max(1, this.recordedSeconds);

        const formData = new FormData();
        formData.append('file', this.recordedBlob, filename);
        formData.append('duration', durationSecs);

        if (chat.activeType === 'direct') {
            formData.append('partner_id', chat.activeId);
        } else if (chat.activeType === 'group') {
            formData.append('group_id', chat.activeId);
        }

        try {
            const uploadedDoc = await api.uploadFile(formData);

            const replyId = chat.replyTo ? chat.replyTo.id : null;
            chat.clearReplying();

            if (window.wsClient && window.wsClient.isConnected) {
                window.wsClient.send({
                    type: 'message',
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
                    content: 'Voice message',
                    message_type: 'audio',
                    file_id: uploadedDoc.id,
                    filename: uploadedDoc.original_filename,
                    duration: durationSecs,
                    reply_to_id: replyId
                });
            } else {
                // REST Fallback
                const newMsg = await api.sendMessage({
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
                    content: 'Voice message',
                    message_type: 'audio',
                    file_id: uploadedDoc.id,
                    reply_to_id: replyId
                });

                const currentUser = auth.getUser();
                chat.appendMessage(newMsg, currentUser ? currentUser.id : null);
            }

            showToast('Voice message sent!', 'success');
            this.discardPreview();

        } catch (err) {
            console.error('Voice send error:', err);
            showToast(err.message || 'Failed to send voice message.', 'error');
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = origBtnHtml;
            }
        }
    }

    get audioBlob() {
        return this.recordedBlob;
    }

    uploadAndSendVoiceNote() {
        return this.sendVoiceMessage();
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('mainComposerBar')) {
        window.voiceRecorder = new VoiceRecorderController();
    }
});
