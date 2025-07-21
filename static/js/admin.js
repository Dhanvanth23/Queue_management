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

// Load all appointments from the server
async function loadAppointments() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/appointments');
        
        if (!response.ok) {
            throw new Error('Failed to load appointments');
        }
        
        allAppointments = await response.json();
        filteredAppointments = [...allAppointments];
        
        updateStats();
        applyFilters();
        renderAppointments();
        
    } catch (error) {
        console.error('Error loading appointments:', error);
        showError('Failed to load appointments. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Update statistics
function updateStats() {
    const total = allAppointments.length;
    const pending = allAppointments.filter(apt => apt.status === 'pending').length;
    const approved = allAppointments.filter(apt => apt.status === 'approved').length;
    
    totalAppointmentsEl.textContent = total;
    pendingAppointmentsEl.textContent = pending;
    approvedAppointmentsEl.textContent = approved;
}

// Apply filters to appointments
function applyFilters() {
    const statusValue = statusFilter.value.toLowerCase();
    const dateValue = dateFilter.value;
    const searchValue = searchInput.value.toLowerCase().trim();
    
    filteredAppointments = allAppointments.filter(appointment => {
        // Status filter
        if (statusValue && appointment.status !== statusValue) {
            return false;
        }
        
        // Date filter
        if (dateValue && appointment.date !== dateValue) {
            return false;
        }
        
        // Search filter (name or email)
        if (searchValue) {
            const matchesName = appointment.name.toLowerCase().includes(searchValue);
            const matchesEmail = appointment.email.toLowerCase().includes(searchValue);
            if (!matchesName && !matchesEmail) {
                return false;
            }
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

// Create a table row for an appointment
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
        <td>
            ${createActionButtons(appointment)}
        </td>
    `;
    
    return row;
}

// Create action buttons based on appointment status
function createActionButtons(appointment) {
    let buttons = '';
    
    if (appointment.status === 'pending') {
        buttons += `
            <button class="action-btn approve" onclick="showConfirmModal(${appointment.id}, 'approved')">
                Approve
            </button>
            <button class="action-btn cancel" onclick="showConfirmModal(${appointment.id}, 'cancelled')">
                Cancel
            </button>
        `;
    } else if (appointment.status === 'approved') {
        buttons += `
            <button class="action-btn cancel" onclick="showConfirmModal(${appointment.id}, 'cancelled')">
                Cancel
            </button>
        `;
    } else {
        buttons = '<span style="color: #6c757d; font-style: italic;">No actions available</span>';
    }
    
    return buttons;
}

// Show confirmation modal
function showConfirmModal(appointmentId, action) {
    currentAppointmentId = appointmentId;
    currentAction = action;
    
    const appointment = allAppointments.find(apt => apt.id === appointmentId);
    const actionText = action === 'approved' ? 'approve' : 'cancel';
    
    document.getElementById('confirmMessage').textContent = 
        `Are you sure you want to ${actionText} the appointment for ${appointment.name}?`;
    
    const confirmBtn = document.getElementById('confirmBtn');
    confirmBtn.textContent = actionText.charAt(0).toUpperCase() + actionText.slice(1);
    confirmBtn.className = `modal-btn ${action === 'cancelled' ? 'cancel' : ''}`;
    
    document.getElementById('confirmModal').classList.remove('hidden');
}

// Confirm action
async function confirmAction() {
    if (!currentAppointmentId || !currentAction) return;
    
    try {
        const response = await fetch(`/api/appointments/${currentAppointmentId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: currentAction })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            closeConfirmModal();
            showSuccessModal(result.message);
            await loadAppointments(); // Reload to get updated data
        } else {
            throw new Error(result.error || 'Failed to update appointment');
        }
        
    } catch (error) {
        console.error('Error updating appointment:', error);
        showError(error.message || 'Failed to update appointment. Please try again.');
    }
    
    currentAppointmentId = null;
    currentAction = null;
}

// Refresh appointments
async function refreshAppointments() {
    await loadAppointments();
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
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
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show/hide functions
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
    alert(message); // Simple alert for now, can be enhanced with a modal
}

// Modal functions
function showSuccessModal(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    currentAppointmentId = null;
    currentAction = null;
}

function closeSuccessModal() {
    document.getElementById('successModal').classList.add('hidden');
}

// Close modals when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        closeConfirmModal();
        closeSuccessModal();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeConfirmModal();
        closeSuccessModal();
    }
});