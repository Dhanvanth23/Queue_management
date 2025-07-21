// admin.js
// Global variables
let allAppointments = [];
let filteredAppointments = [];
let currentAction = null;
let currentAppointmentId = null;

// DOM elements
const appointmentsTable = document.getElementById('appointmentsTable');
const appointmentsBody = document.getElementById('appointmentsBody');
const loadingDiv = document.getElementById('loading');
const noAppointmentsDiv = document.getElementById('noAppointments');
const statusFilter = document.getElementById('statusFilter');
const dateFilter = document.getElementById('dateFilter');
const searchInput = document.getElementById('searchInput');

// Stats elements
const totalAppointmentsEl = document.getElementById('totalAppointments');
const pendingAppointmentsEl = document.getElementById('pendingAppointments');
const approvedAppointmentsEl = document.getElementById('approvedAppointments');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Admin Panel Loaded]');
    setupEventListeners();
    loadAppointments();
});

// Setup event listeners
function setupEventListeners() {
    statusFilter.addEventListener('change', applyFilters);
    dateFilter.addEventListener('change', applyFilters);
    searchInput.addEventListener('input', debounce(applyFilters, 300));
}

// Debounce function for search input
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Load appointments from server
async function loadAppointments() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/appointments');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const appointments = await response.json();
        allAppointments = appointments;
        filteredAppointments = [...allAppointments];

        updateStats();
        applyFilters();
        renderAppointments();

        console.log(`Loaded ${allAppointments.length} appointments`);
    } catch (error) {
        console.error('Error loading appointments:', error);
        showError('Failed to load appointments. Please try again.');
        allAppointments = [];
        filteredAppointments = [];
        showNoAppointments();
    } finally {
        showLoading(false);
    }
}

// Update statistics
function updateStats() {
    totalAppointmentsEl.textContent = allAppointments.length;
    pendingAppointmentsEl.textContent = allAppointments.filter(a => a.status === 'pending').length;
    approvedAppointmentsEl.textContent = allAppointments.filter(a => a.status === 'approved').length;
}

// Apply filters to appointments
function applyFilters() {
    const statusValue = statusFilter.value.toLowerCase();
    const dateValue = dateFilter.value;
    const searchValue = searchInput.value.toLowerCase().trim();

    filteredAppointments = allAppointments.filter(appointment => {
        if (statusValue && appointment.status !== statusValue) return false;
        if (dateValue && appointment.date !== dateValue) return false;

        if (searchValue) {
            const matchesName = appointment.name.toLowerCase().includes(searchValue);
            const matchesEmail = appointment.email.toLowerCase().includes(searchValue);
            if (!matchesName && !matchesEmail) return false;
        }
        return true;
    });

    renderAppointments();
}

// Render appointments table
function renderAppointments() {
    if (filteredAppointments.length === 0) {
        showNoAppointments();
        return;
    }

    hideNoAppointments();
    appointmentsBody.innerHTML = '';

    filteredAppointments.forEach(appointment => {
        const row = createAppointmentRow(appointment);
        appointmentsBody.appendChild(row);
    });
}

// Create appointment row
function createAppointmentRow(appointment) {
    const row = document.createElement('tr');

    row.innerHTML = `
        <td>${appointment.id}</td>
        <td>${escapeHtml(appointment.name)}</td>
        <td>${escapeHtml(appointment.email)}</td>
        <td>${escapeHtml(appointment.phone)}</td>
        <td>${formatDate(appointment.date)}</td>
        <td>${formatTime(appointment.time)}</td>
        <td><span class="status ${appointment.status}">${appointment.status.toUpperCase()}</span></td>
        <td>${formatDateTime(appointment.created_at)}</td>
        <td>${createActionButtons(appointment)}</td>
    `;

    return row;
}

// Action buttons
function createActionButtons(appointment) {
    let buttons = '';
    if (appointment.status === 'pending') {
        buttons += `
            <button class="action-btn approve" onclick="showConfirmModal(${appointment.id}, 'approved')">Approve</button>
            <button class="action-btn cancel" onclick="showConfirmModal(${appointment.id}, 'cancelled')">Cancel</button>
        `;
    } else if (appointment.status === 'approved') {
        buttons += `
            <button class="action-btn cancel" onclick="showConfirmModal(${appointment.id}, 'cancelled')">Cancel</button>
        `;
    } else {
        buttons = '<span style="color: #6c757d; font-style: italic;">No actions available</span>';
    }
    return buttons;
}

// Confirmation Modal
function showConfirmModal(appointmentId, action) {
    currentAppointmentId = appointmentId;
    currentAction = action;

    const appointment = allAppointments.find(apt => apt.id === appointmentId);
    if (!appointment) {
        showError('Appointment not found');
        return;
    }

    const actionText = action === 'approved' ? 'approve' : 'cancel';

    document.getElementById('confirmMessage').textContent =
        `Are you sure you want to ${actionText} the appointment for ${appointment.name}?`;

    const confirmBtn = document.getElementById('confirmBtn');
    confirmBtn.textContent = actionText.charAt(0).toUpperCase() + actionText.slice(1);
    confirmBtn.className = `modal-btn ${action === 'cancelled' ? 'cancel' : 'primary'}`;

    console.log('[Modal Opened] ID:', currentAppointmentId, '| Action:', currentAction);

    setTimeout(() => {
        document.getElementById('confirmModal').classList.remove('hidden');
    }, 100);
}

// Confirm action
async function confirmAction() {
    if (!currentAppointmentId || !currentAction) {
        showError('Invalid action parameters');
        return;
    }

    const confirmBtn = document.getElementById('confirmBtn');
    const originalText = confirmBtn.textContent;

    try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';

        const response = await fetch(`/api/appointments/${currentAppointmentId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: currentAction
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        closeConfirmModal();
        showSuccessToast(`Appointment successfully ${currentAction}!`);
        await loadAppointments();  // Full refresh
    } catch (error) {
        console.error('Error updating appointment:', error);
        showError(`Failed to update appointment: ${error.message}`);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
        currentAppointmentId = null;
        currentAction = null;
    }
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
}

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// UI control functions
function showLoading(show) {
    if (show) {
        loadingDiv.classList.remove('hidden');
        appointmentsTable.classList.add('hidden');
        noAppointmentsDiv.classList.add('hidden');
    } else {
        loadingDiv.classList.add('hidden');
    }
}

function showNoAppointments() {
    appointmentsTable.classList.add('hidden');
    noAppointmentsDiv.classList.remove('hidden');
}

function hideNoAppointments() {
    appointmentsTable.classList.remove('hidden');
    noAppointmentsDiv.classList.add('hidden');
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-toast';
    errorDiv.innerHTML = `<div class="error-content"><span class="error-message">${message}</span><button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button></div>`;
    document.body.appendChild(errorDiv);
    setTimeout(() => { if (errorDiv.parentNode) errorDiv.remove(); }, 5000);
}

function showSuccessToast(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-toast';
    successDiv.innerHTML = `<div class="success-content"><span class="success-message">${message}</span><button class="success-close" onclick="this.parentElement.parentElement.remove()">×</button></div>`;
    document.body.appendChild(successDiv);
    setTimeout(() => { if (successDiv.parentNode) successDiv.remove(); }, 5000);
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    currentAppointmentId = null;
    currentAction = null;
}

function closeSuccessModal() {
    document.getElementById('successModal').classList.add('hidden');
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        closeConfirmModal();
        closeSuccessModal();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeConfirmModal();
        closeSuccessModal();
    }
});