// Global variables
let availableSlots = [];

// DOM elements
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');
const loadingDiv = document.getElementById('loading');
const bookingForm = document.getElementById('bookingForm');
const submitBtn = document.getElementById('submitBtn');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeDateInput();
    setupEventListeners();
});

// Set minimum date to tomorrow
function initializeDateInput() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    dateInput.min = tomorrow.toISOString().split('T')[0];
    
    // Set max date to 3 months from now
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 3);
    dateInput.max = maxDate.toISOString().split('T')[0];
}

// Setup event listeners
function setupEventListeners() {
    dateInput.addEventListener('change', handleDateChange);
    bookingForm.addEventListener('submit', handleFormSubmit);
}

// Handle date selection change
async function handleDateChange() {
    const selectedDate = dateInput.value;
    
    if (!selectedDate) {
        resetTimeSelect();
        return;
    }
    
    // Check if selected date is a weekend
    const date = new Date(selectedDate);
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0) { // Sunday
        alert('We are closed on Sundays. Please select a different date.');
        dateInput.value = '';
        resetTimeSelect();
        return;
    }
    
    await loadAvailableSlots(selectedDate);
}

// Reset time select dropdown
function resetTimeSelect() {
    timeSelect.innerHTML = '<option value="">Select a date first</option>';
    timeSelect.disabled = true;
}

// Load available time slots for selected date
async function loadAvailableSlots(date) {
    showLoading(true);
    timeSelect.disabled = true;
    
    try {
        const response = await fetch(`/api/available-slots/${date}`);
        
        if (!response.ok) {
            throw new Error('Failed to load available slots');
        }
        
        const slots = await response.json();
        availableSlots = slots;
        
        populateTimeSlots(slots);
        
    } catch (error) {
        console.error('Error loading slots:', error);
        showError('Failed to load available time slots. Please try again.');
        resetTimeSelect();
    } finally {
        showLoading(false);
    }
}

// Populate time slots dropdown
function populateTimeSlots(slots) {
    timeSelect.innerHTML = '';
    
    if (slots.length === 0) {
        timeSelect.innerHTML = '<option value="">No slots available for this date</option>';
        timeSelect.disabled = true;
        return;
    }
    
    timeSelect.innerHTML = '<option value="">Select a time slot</option>';
    
    slots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot.time;
        option.textContent = `${formatTime(slot.time)} (${slot.available} available)`;
        timeSelect.appendChild(option);
    });
    
    timeSelect.disabled = false;
}

// Format time from 24hr to 12hr format
function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
}

// Show/hide loading indicator
function showLoading(show) {
    if (show) {
        loadingDiv.classList.remove('hidden');
    } else {
        loadingDiv.classList.add('hidden');
    }
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(bookingForm);
    const appointmentData = {
        name: formData.get('name').trim(),
        email: formData.get('email').trim(),
        phone: formData.get('phone').trim(),
        date: formData.get('date'),
        time: formData.get('time')
    };
    
    // Validate form data
    if (!validateFormData(appointmentData)) {
        return;
    }
    
    await submitAppointment(appointmentData);
}

// Validate form data
function validateFormData(data) {
    if (!data.name || data.name.length < 2) {
        showError('Please enter a valid name (at least 2 characters).');
        return false;
    }
    
    if (!data.email || !isValidEmail(data.email)) {
        showError('Please enter a valid email address.');
        return false;
    }
    
    if (!data.phone || data.phone.length < 10) {
        showError('Please enter a valid phone number (at least 10 digits).');
        return false;
    }
    
    if (!data.date) {
        showError('Please select a date for your appointment.');
        return false;
    }
    
    if (!data.time) {
        showError('Please select a time slot for your appointment.');
        return false;
    }
    
    return true;
}

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Submit appointment booking
async function submitAppointment(appointmentData) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Booking...';
    
    try {
        const response = await fetch('/api/book-appointment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(appointmentData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showSuccessModal(result.appointment_id);
            bookingForm.reset();
            resetTimeSelect();
            dateInput.value = '';
        } else {
            throw new Error(result.error || 'Failed to book appointment');
        }
        
    } catch (error) {
        console.error('Error booking appointment:', error);
        showError(error.message || 'Failed to book appointment. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Book Appointment';
    }
}

// Show success modal
function showSuccessModal(appointmentId) {
    document.getElementById('appointmentId').textContent = appointmentId;
    document.getElementById('successModal').classList.remove('hidden');
}

// Show error modal
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorModal').classList.remove('hidden');
}

// Close success modal
function closeModal() {
    document.getElementById('successModal').classList.add('hidden');
}

// Close error modal
function closeErrorModal() {
    document.getElementById('errorModal').classList.add('hidden');
}

// Close modals when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        closeModal();
        closeErrorModal();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
        closeErrorModal();
    }
});