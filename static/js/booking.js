// Global variables
let availableSlots = [];

// DOM elements
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');
const durationSelect = document.getElementById('duration');
const loadingDiv = document.getElementById('loading');
const bookingForm = document.getElementById('bookingForm');
const submitBtn = document.getElementById('submitBtn');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeDateInput();
    setupEventListeners();
});

// Set minimum date to today
function initializeDateInput() {
    const today = new Date();
    dateInput.min = today.toISOString().split('T')[0];
    
    // Set max date to 3 months from now
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 3);
    dateInput.max = maxDate.toISOString().split('T')[0];
}

// Setup event listeners
function setupEventListeners() {
    dateInput.addEventListener('change', handleDateChange);
    timeSelect.addEventListener('change', handleTimeChange);
    bookingForm.addEventListener('submit', handleFormSubmit);
}

// Handle date selection change
async function handleDateChange() {
    const selectedDate = dateInput.value;
    
    if (!selectedDate) {
        resetTimeSelect();
        return;
    }
    
    await loadAvailableSlots(selectedDate);
}

// Handle time selection change
function handleTimeChange() {
    const selectedTime = timeSelect.value;
    
    if (!selectedTime) {
        durationSelect.value = '';
        durationSelect.disabled = true;
        return;
    }
    
    durationSelect.disabled = false;
    
    // Check if next slot is available for 1-hour option
    const nextSlotTime = add30Minutes(selectedTime);
    const nextSlotAvailable = availableSlots.some(slot => 
        slot.time === nextSlotTime && slot.available > 0
    );
    
    const hourOption = durationSelect.querySelector('option[value="60"]');
    if (nextSlotAvailable) {
        hourOption.disabled = false;
        hourOption.textContent = '1 hour';
    } else {
        hourOption.disabled = true;
        hourOption.textContent = '1 hour (not available)';
    }
}

// Reset time select dropdown
function resetTimeSelect() {
    timeSelect.innerHTML = '<option value="">Select a date first</option>';
    timeSelect.disabled = true;
    durationSelect.innerHTML = '<option value="">Select time slot first</option>';
    durationSelect.disabled = true;
}

// Load available time slots for selected date
async function loadAvailableSlots(date) {
    showLoading(true);
    timeSelect.disabled = true;
    durationSelect.disabled = true;
    
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
        durationSelect.disabled = true;
        return;
    }
    
    timeSelect.innerHTML = '<option value="">Select a time slot</option>';
    
    slots.forEach(slot => {
        // Skip slots that would extend past 3 AM
        const [hours, minutes] = slot.time.split(':').map(Number);
        if (hours >= 3 && hours < 6) return;
        
        const option = document.createElement('option');
        option.value = slot.time;
        option.textContent = `${formatTime(slot.time)} (${slot.available} available)`;
        option.dataset.available = slot.available;
        timeSelect.appendChild(option);
    });
    
    timeSelect.disabled = false;
}

// Helper function to add 30 minutes to a time string
function add30Minutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    let newHours = hours;
    let newMinutes = minutes + 30;
    
    if (newMinutes >= 60) {
        newHours += 1;
        newMinutes -= 60;
    }
    
    // Handle overnight (24-hour format)
    newHours = newHours % 24;
    
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

// Format time from 24hr to 12hr format
function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
}

// Calculate end time
function calculateEndTime(startTime, duration) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + duration;
    
    let newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
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
        time: formData.get('time'),
        duration: parseInt(formData.get('duration'))
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
        showError('Please select a date for your booking.');
        return false;
    }
    
    if (!data.time) {
        showError('Please select a time slot for your booking.');
        return false;
    }
    
    if (!data.duration || (data.duration !== 30 && data.duration !== 60)) {
        showError('Please select a valid duration (30 or 60 minutes).');
        return false;
    }
    
    // Check if booking goes past 3 AM
    const [hours, minutes] = data.time.split(':').map(Number);
    const endHour = hours + Math.floor((minutes + data.duration) / 60);
    if (endHour > 3 && endHour < 6) {
        showError('Bookings cannot extend past 3 AM. Please choose an earlier time.');
        return false;
    }
    
    // Additional check for 1-hour slots availability
    if (data.duration === 60) {
        const nextSlotTime = add30Minutes(data.time);
        const nextSlotAvailable = availableSlots.some(slot => 
            slot.time === nextSlotTime && slot.available > 0
        );
        
        if (!nextSlotAvailable) {
            showError('The next 30-minute slot is not available for a 1-hour booking.');
            return false;
        }
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
            const endTime = calculateEndTime(appointmentData.time, appointmentData.duration);
            const timeSlot = `${formatTime(appointmentData.time)} - ${formatTime(endTime)}`;
            showSuccessModal(result.appointment_id, timeSlot);
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
        submitBtn.textContent = 'Book Turf Slot';
    }
}

// Show success modal
function showSuccessModal(appointmentId, timeSlot) {
    document.getElementById('appointmentId').textContent = appointmentId;
    document.getElementById('bookingSlot').textContent = timeSlot;
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