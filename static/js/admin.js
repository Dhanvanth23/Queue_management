// admin.js
// Global variables
let allBookings = [];
let filteredBookings = [];
let currentAction = null;
let currentBookingId = null;

// DOM elements
const appointmentsTable = document.getElementById('appointmentsTable');
const appointmentsBody = document.getElementById('appointmentsBody');
const loadingDiv = document.getElementById('loading');
const noAppointmentsDiv = document.getElementById('noAppointments');
const statusFilter = document.getElementById('statusFilter');
const dateFilter = document.getElementById('dateFilter');
const searchInput = document.getElementById('searchInput');

// Stats elements
const totalBookingsEl = document.getElementById('totalBookings');
const pendingBookingsEl = document.getElementById('pendingBookings');
const approvedBookingsEl = document.getElementById('approvedBookings');
const cancelledBookingsEl = document.getElementById('cancelledBookings');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Turf Admin Panel Loaded]');
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

// Load bookings from server
async function loadAppointments() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/appointments');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const bookings = await response.json();
        allBookings = bookings;
        filteredBookings = [...allBookings];

        updateStats();
        applyFilters();
        renderAppointments();

        console.log(`Loaded ${allBookings.length} turf bookings`);
    } catch (error) {
        console.error('Error loading bookings:', error);
        showError('Failed to load bookings. Please try again.');
        allBookings = [];
        filteredBookings = [];
        showNoAppointments();
    } finally {
        showLoading(false);
    }
}

// Update statistics
function updateStats() {
    totalBookingsEl.textContent = allBookings.length;
    pendingBookingsEl.textContent = allBookings.filter(b => b.status === 'pending').length;
    approvedBookingsEl.textContent = allBookings.filter(b => b.status === 'approved').length;
    cancelledBookingsEl.textContent = allBookings.filter(b => b.status === 'cancelled').length;
}

// Apply filters to bookings
function applyFilters() {
    const statusValue = statusFilter.value.toLowerCase();
    const dateValue = dateFilter.value;
    const searchValue = searchInput.value.toLowerCase().trim();

    filteredBookings = allBookings.filter(booking => {
        if (statusValue && booking.status !== statusValue) return false;
        if (dateValue && booking.date !== dateValue) return false;

        if (searchValue) {
            const matchesName = booking.name.toLowerCase().includes(searchValue);
            const matchesEmail = booking.email.toLowerCase().includes(searchValue);
            const matchesPhone = booking.phone.toLowerCase().includes(searchValue);
            if (!matchesName && !matchesEmail && !matchesPhone) return false;
        }
        return true;
    });

    renderAppointments();
}

// Render bookings table
function renderAppointments() {
    if (filteredBookings.length === 0) {
        showNoAppointments();
        return;
    }

    hideNoAppointments();
    appointmentsBody.innerHTML = '';

    filteredBookings.forEach(booking => {
        const row = createBookingRow(booking);
        appointmentsBody.appendChild(row);
    });
}

// Create booking row
function createBookingRow(booking) {
    const row = document.createElement('tr');
    const endTime = booking.end_time || calculateEndTime(booking.time, booking.duration);

    row.innerHTML = `
        <td>${booking.id}</td>
        <td>
            <div class="customer-info">
                <strong>${escapeHtml(booking.name)}</strong>
                <small>${escapeHtml(booking.email)}</small>
            </div>
        </td>
        <td>${escapeHtml(booking.phone)}</td>
        <td>${escapeHtml(booking.turf_type || 'Premium Grass Turf')}</td>
        <td>${formatDate(booking.date)}</td>
        <td>
            <div class="time-slot">
                <span class="time">${formatTime(booking.time)}</span>
                <span class="separator">to</span>
                <span class="time">${formatTime(endTime)}</span>
            </div>
        </td>
        <td>₹${booking.total_price}</td>
        <td><span class="status ${booking.status}">${booking.status.toUpperCase()}</span></td>
        <td><span class="payment-status ${booking.payment_status || 'pending'}">${(booking.payment_status || 'pending').toUpperCase()}</span></td>
        <td>${formatDateTime(booking.created_at)}</td>
        <td>${createActionButtons(booking)}</td>
    `;

    return row;
}

// Calculate end time
function calculateEndTime(startTime, duration) {
    if (!startTime || !duration) return startTime;
    
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + parseInt(duration);
    
    let newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

// Action buttons
function createActionButtons(booking) {
    let buttons = '';
    if (booking.status === 'pending') {
        buttons += `
            <button class="action-btn approve" onclick="showConfirmModal('${booking.id}', 'approved')">
                <i class="fas fa-check"></i> Approve
            </button>
            <button class="action-btn cancel" onclick="showConfirmModal('${booking.id}', 'cancelled')">
                <i class="fas fa-times"></i> Cancel
            </button>
        `;
    } else if (booking.status === 'approved') {
        buttons += `
            <button class="action-btn cancel" onclick="showConfirmModal('${booking.id}', 'cancelled')">
                <i class="fas fa-times"></i> Cancel
            </button>
        `;
    } else {
        buttons = '<span class="no-actions">No actions</span>';
    }
    return buttons;
}



// Confirmation Modal
function showConfirmModal(bookingId, action) {
    currentBookingId = bookingId;
    currentAction = action;

    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) {
        showError('Booking not found');
        return;
    }

    const actionText = action === 'approved' ? 'approve' : 'cancel';
    const endTime = booking.end_time || calculateEndTime(booking.time, booking.duration);

    document.getElementById('confirmMessage').textContent =
        `Are you sure you want to ${actionText} the turf booking for ${booking.name} (${formatTime(booking.time)} - ${formatTime(endTime)})?`;

    const confirmBtn = document.getElementById('confirmBtn');
    confirmBtn.textContent = actionText.charAt(0).toUpperCase() + actionText.slice(1);
    confirmBtn.className = `modal-btn ${action === 'cancelled' ? 'cancel' : 'primary'}`;

    document.getElementById('confirmModal').classList.remove('hidden');
}

// Confirm action
async function confirmAction() {
    if (!currentBookingId || !currentAction) {
        showError('Invalid action parameters');
        return;
    }

    const confirmBtn = document.getElementById('confirmBtn');
    const originalText = confirmBtn.textContent;

    try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';


        const response = await fetch(`/api/admin/bookings/${currentBookingId}/status`, {

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
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        closeConfirmModal();
        showSuccessToast(`Booking successfully ${currentAction}!`);
        await loadAppointments();
    } catch (error) {
        console.error('Error updating booking:', error);
        showError(`Failed to update booking: ${error.message}`);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
        currentBookingId = null;
        currentAction = null;
    }
}

// Alternative function to load bookings (keeping for compatibility)
async function loadBookings() {
    await loadAppointments();
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
}

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function escapeHtml(text) {
    if (!text) return '';
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
    errorDiv.innerHTML = `
        <div class="error-content">
            <span class="error-message">${message}</span>
            <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    document.body.appendChild(errorDiv);
    setTimeout(() => { if (errorDiv.parentNode) errorDiv.remove(); }, 5000);
}

function showSuccessToast(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-toast';
    successDiv.innerHTML = `
        <div class="success-content">
            <span class="success-message">${message}</span>
            <button class="success-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    document.body.appendChild(successDiv);
    setTimeout(() => { if (successDiv.parentNode) successDiv.remove(); }, 5000);
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    currentBookingId = null;
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