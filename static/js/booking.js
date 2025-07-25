class TurfBookingSystem {
    constructor() {
        this.currentStep = 1;
        this.bookingData = {};
        this.availableSlots = [];
        this.razorpayKey = window.RAZORPAY_KEY || 'rzp_test_3ng5TbF767f5tS';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeDateInput();
        this.updateProgressSteps();
        this.monitorConnection();
        this.updateLiveAvailabilityChart();
        this.exposeGlobalMethods();
    }

    exposeGlobalMethods() {
        // Expose methods to global scope for HTML onclick handlers
        window.nextStep = () => this.nextStep();
        window.previousStep = () => this.previousStep();
        window.confirmFreeBooking = () => this.confirmFreeBooking();
        window.proceedToPayment = () => this.proceedToPayment();
        window.processPayment = () => this.processPayment();
        window.closeModal = () => this.closeModal();
        window.printBooking = () => this.printBooking();
        window.refreshAvailability = () => this.refreshAvailability();
    }

    setupEventListeners() {
        // Date change listener
        const dateInput = document.getElementById('date');
        if (dateInput) {
            dateInput.addEventListener('change', (e) => this.handleDateChange(e));
        }

        // Duration selection listeners
        document.querySelectorAll('.duration-card').forEach(card => {
            card.addEventListener('click', () => this.selectDuration(card));
        });

        // Form validation listeners
        document.querySelectorAll('input[required], select[required]').forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });

        // Time select listener
        const timeSelect = document.getElementById('time');
        if (timeSelect) {
            timeSelect.addEventListener('change', () => this.clearFieldError(timeSelect));
        }
    }

    initializeDateInput() {
        const dateInput = document.getElementById('date');
        if (dateInput) {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            dateInput.value = todayStr;
            dateInput.min = todayStr;
            
            // Set max date to 3 months from now
            const maxDate = new Date(today);
            maxDate.setMonth(maxDate.getMonth() + 3);
            dateInput.max = maxDate.toISOString().split('T')[0];
            
            // Load today's slots initially
            this.handleDateChange({ target: dateInput });
        }
    }

    async handleDateChange(event) {
        const selectedDate = event.target.value;
        const timeSelect = document.getElementById('time');
        const loadingDiv = document.getElementById('slotsLoading');
        
        if (!selectedDate) {
            timeSelect.innerHTML = '<option value="">Select a date first</option>';
            timeSelect.disabled = true;
            return;
        }

        // Show loading
        if (loadingDiv) {
            loadingDiv.classList.remove('hidden');
        }
        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option value="">Loading slots...</option>';

        try {
            // Fixed API endpoint to match backend
            const response = await fetch(`/api/slots/available?turf_type=Standard&date=${selectedDate}`);
            const data = await response.json();

            if (data.success && data.slots) {
                this.availableSlots = data.slots;
                this.populateTimeSlots(data.slots);
                this.updateLiveAvailabilityChart();
            } else {
                timeSelect.innerHTML = '<option value="">No slots available</option>';
                timeSelect.disabled = true;
                this.showError(data.message || 'No slots available for this date');
            }
        } catch (error) {
            console.error('Error loading slots:', error);
            timeSelect.innerHTML = '<option value="">Error loading slots</option>';
            timeSelect.disabled = true;
            this.showError('Failed to load available slots. Please check your connection.');
        } finally {
            if (loadingDiv) {
                loadingDiv.classList.add('hidden');
            }
        }
    }

 // NOTE: Only the updated populateTimeSlots() method is shown below
// Insert this updated function into your TurfBookingSystem class

populateTimeSlots(slots) {
    const timeSelect = document.getElementById('time');
    timeSelect.innerHTML = '';

    if (!slots || slots.length === 0) {
        timeSelect.innerHTML = '<option value="">No slots available</option>';
        timeSelect.disabled = true;
        return;
    }

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a time slot';
    timeSelect.appendChild(defaultOption);

    // Filter and add only available slots using slot.available
    const availableSlots = slots.filter(slot => slot.available === true);

    if (availableSlots.length === 0) {
        timeSelect.innerHTML = '<option value="">No slots available</option>';
        timeSelect.disabled = true;
        return;
    }

    availableSlots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot.start;
        option.textContent = `${this.formatTime(slot.start)} - ${this.formatTime(slot.end)}`;
        timeSelect.appendChild(option);
    });

    timeSelect.disabled = false;
}

    updateLiveAvailabilityChart() {
        const chartContainer = document.querySelector('.availability-chart');
        if (!chartContainer) return;

        chartContainer.innerHTML = '';

        // Use available slots or default demo data
        const sampleSlots = this.availableSlots.length > 0 
            ? this.availableSlots.slice(0, 3).map(slot => ({
                time: slot.time.split('-')[0],
                available: slot.status === 'available' ? 1 : 0
            }))
            : [
                { time: '06:00', available: 1 },
                { time: '07:00', available: 1 },
                { time: '08:00', available: 0 }
            ];

        sampleSlots.forEach(slot => {
            const slotElement = document.createElement('div');
            slotElement.className = 'time-slot';
            
            const timeElement = document.createElement('span');
            timeElement.className = 'time';
            timeElement.textContent = this.formatTime(slot.time);
            
            const barContainer = document.createElement('div');
            barContainer.className = 'availability-bar';
            
            const barElement = document.createElement('div');
            barElement.className = 'available-slots';
            barElement.style.width = `${slot.available * 100}%`;
            
            const countElement = document.createElement('span');
            countElement.className = 'count';
            countElement.textContent = slot.available ? 'Available' : 'Booked';
            
            barContainer.appendChild(barElement);
            slotElement.appendChild(timeElement);
            slotElement.appendChild(barContainer);
            slotElement.appendChild(countElement);
            
            chartContainer.appendChild(slotElement);
        });

        // Update last updated time
        const lastUpdated = document.querySelector('.last-updated');
        if (lastUpdated) {
            const now = new Date();
            lastUpdated.textContent = `Updated: ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        }
    }

    selectDuration(card) {
        // Remove previous selection
        document.querySelectorAll('.duration-card').forEach(c => {
            c.classList.remove('selected');
        });

        // Select current card
        card.classList.add('selected');
        const duration = card.dataset.duration;
        document.getElementById('duration').value = duration;
        
        // Clear any previous error
        this.clearFieldError(document.getElementById('duration'));
    }

    validateField(field) {
        const value = field.value.trim();
        this.clearFieldError(field);

        if (field.hasAttribute('required') && !value) {
            const label = field.labels && field.labels[0] 
                ? field.labels[0].textContent.replace('*', '').trim() 
                : field.name || field.id;
            this.showFieldError(field, `${label} is required`);
            return false;
        }

        if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            this.showFieldError(field, 'Please enter a valid email address');
            return false;
        }

        if (field.type === 'tel' && value && !/^[\+]?[0-9\s\-\(\)]{10,}$/.test(value)) {
            this.showFieldError(field, 'Please enter a valid phone number');
            return false;
        }

        if (field.id === 'date' && value) {
            const selectedDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (selectedDate < today) {
                this.showFieldError(field, 'Please select a future date');
                return false;
            }
        }

        return true;
    }

    showFieldError(field, message) {
        field.classList.add('error');
        const errorDiv = field.parentNode.querySelector('.field-validation');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.add('show');
        }
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const errorDiv = field.parentNode.querySelector('.field-validation');
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.classList.remove('show');
        }
    }

    validateCurrentStep() {
        const currentStepDiv = document.querySelector(`#step${this.currentStep}`);
        if (!currentStepDiv) return false;

        const requiredFields = currentStepDiv.querySelectorAll('input[required], select[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        // Special validation for duration in step 2
        if (this.currentStep === 2) {
            const duration = document.getElementById('duration').value;
            if (!duration) {
                this.showError('Please select a duration (30 minutes or 1 hour)');
                isValid = false;
            }
        }

        return isValid;
    }

    nextStep() {
        console.log('nextStep called, current step:', this.currentStep);
        
        if (!this.validateCurrentStep()) {
            console.log('Validation failed');
            return;
        }

        if (this.currentStep < 4) {
            this.currentStep++;
            this.showStep(this.currentStep);
            
            if (this.currentStep === 3) {
                this.updateBookingSummary();
            }
        }
    }

    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }

    showStep(step) {
        console.log('Showing step:', step);
        
        // Hide all step contents
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });

        // Show current step
        const currentStepElement = document.getElementById(`step${step}`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
            console.log('Step element found and activated');
        } else {
            console.error('Step element not found:', `step${step}`);
        }

        // Update progress indicators
        this.updateProgressSteps();

        // Scroll to top of booking container
        const bookingContainer = document.querySelector('.booking-container');
        if (bookingContainer) {
            bookingContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    updateProgressSteps() {
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNumber = index + 1;
            
            step.classList.remove('active', 'completed');
            
            if (stepNumber < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNumber === this.currentStep) {
                step.classList.add('active');
            }
        });
    }

    updateBookingSummary() {
        const formData = this.collectFormData();
        
        document.getElementById('summaryName').textContent = formData.name || '-';
        document.getElementById('summaryEmail').textContent = formData.email || '-';
        document.getElementById('summaryPhone').textContent = formData.phone || '-';
        document.getElementById('summaryDate').textContent = formData.date ? this.formatDate(formData.date) : '-';
        document.getElementById('summaryTime').textContent = formData.time ? this.formatTime(formData.time) : '-';
        
        const duration = parseInt(formData.duration);
        document.getElementById('summaryDuration').textContent = 
            duration === 30 ? '30 minutes' : duration === 60 ? '1 hour' : '-';

        const baseAmount = duration === 30 ? 500 : duration === 60 ? 1000 : 0;
        document.getElementById('summaryAmount').textContent = `₹${baseAmount}`;

        // Update payment section pricing
        this.updatePaymentPricing(duration);
    }

    updatePaymentPricing(duration) {
        const basePrice = duration === 30 ? 500 : 1000;
        const discount = Math.round(basePrice * 0.05);
        const discountedPrice = basePrice - discount;
        const gst = Math.round(discountedPrice * 0.18);
        const finalAmount = discountedPrice + gst;

        document.getElementById('basePrice').textContent = `₹${basePrice}`;
        document.getElementById('discountAmount').textContent = `-₹${discount}`;
        document.getElementById('gstAmount').textContent = `₹${gst}`;
        document.getElementById('finalAmount').textContent = `₹${finalAmount}`;
    }

    collectFormData() {
        return {
            name: document.getElementById('name')?.value?.trim() || '',
            email: document.getElementById('email')?.value?.trim() || '',
            phone: document.getElementById('phone')?.value?.trim() || '',
            date: document.getElementById('date')?.value || '',
            time: document.getElementById('time')?.value || '',
            duration: document.getElementById('duration')?.value || ''
        };
    }

    async confirmFreeBooking() {
        this.showLoadingOverlay(true, "Confirming your booking...");
        
        const formData = this.collectFormData();
        const duration = parseInt(formData.duration);
        const endTime = this.calculateEndTime(formData.time, duration);
        
        const bookingData = {
            userName: formData.name,
            userEmail: formData.email,
            userPhone: formData.phone,
            turfType: 'Standard',
            bookingDate: formData.date,
            startTime: formData.time,
            endTime: endTime,
            totalPrice: duration === 30 ? 500 : 1000,
            paymentStatus: 'free_booking'
        };

        try {
            const response = await fetch('/api/book', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bookingData),
            });

            const data = await response.json();
            
            if (data.success) {
                this.showLoadingOverlay(false);
                this.showSuccessModal({
                    booking_id: data.bookingId,
                    payment_status: 'Free Booking',
                    slot: `${this.formatDate(formData.date)} at ${this.formatTime(formData.time)}`,
                    amount: bookingData.totalPrice,
                    duration: duration === 30 ? '30 minutes' : '1 hour'
                });
                this.resetForm();
            } else {
                this.showLoadingOverlay(false);
                this.showError(data.message || 'Booking failed');
            }
        } catch (error) {
            this.showLoadingOverlay(false);
            console.error('Error confirming free booking:', error);
            this.showError(`An error occurred during booking: ${error.message}`);
        }
    }

    calculateEndTime(startTime, durationMinutes) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);
        
        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
        
        return `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
    }

    async proceedToPayment() {
        if (!this.validateCurrentStep()) {
            return;
        }

        const formData = this.collectFormData();
        const duration = parseInt(formData.duration);
        const amount = duration === 30 ? 500 : 1000;
        
        this.showLoadingOverlay(true, 'Preparing payment...');

        try {
            const response = await fetch('/api/payment/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount })
            });

            const data = await response.json();

            if (data.success) {
                this.currentStep = 4;
                this.showStep(4);
                this.bookingData = { 
                    ...formData, 
                    order_id: data.order_id,
                    amount: amount * 100 // Convert to paise for Razorpay
                };
                this.showLoadingOverlay(false);
                
                // Auto-trigger payment after a short delay
                setTimeout(() => {
                    this.processPayment();
                }, 1000);
            } else {
                this.showError(data.message || 'Failed to create payment order');
                this.showLoadingOverlay(false);
            }
        } catch (error) {
            console.error('Payment order error:', error);
            this.showError('Failed to prepare payment. Please try again.');
            this.showLoadingOverlay(false);
        }
    }

    processPayment() {
        if (!this.bookingData.order_id) {
            this.showError('Payment order not found. Please try again.');
            return;
        }

        const finalAmountText = document.getElementById('finalAmount')?.textContent || '₹0';
        const finalAmount = parseInt(finalAmountText.replace('₹', ''));
        
        const options = {
            key: this.razorpayKey,
            amount: this.bookingData.amount || (finalAmount * 100),
            currency: 'INR',
            name: 'Green Valley Sports Complex',
            description: 'Turf Booking Payment',
            order_id: this.bookingData.order_id,
            prefill: {
                name: this.bookingData.name,
                email: this.bookingData.email,
                contact: this.bookingData.phone
            },
            theme: {
                color: '#2E8B57'
            },
            handler: (response) => {
                this.handlePaymentSuccess(response);
            },
            modal: {
                ondismiss: () => {
                    this.showError('Payment was cancelled');
                }
            }
        };

        try {
            const rzp = new Razorpay(options);
            rzp.on('payment.failed', (response) => {
                this.handlePaymentFailure(response);
            });
            rzp.open();
        } catch (error) {
            console.error('Razorpay initialization error:', error);
            this.showError('Payment system unavailable. Please try free booking option.');
        }
    }

    async handlePaymentSuccess(response) {
        this.showLoadingOverlay(true, 'Verifying payment...');

        const formData = this.collectFormData();
        const duration = parseInt(formData.duration);
        const endTime = this.calculateEndTime(formData.time, duration);
        
        const bookingData = {
            userName: formData.name,
            userEmail: formData.email,
            userPhone: formData.phone,
            turfType: 'Standard',
            bookingDate: formData.date,
            startTime: formData.time,
            endTime: endTime,
            totalPrice: duration === 30 ? 500 : 1000,
            paymentStatus: 'paid',
            paymentId: response.razorpay_payment_id,
            orderId: response.razorpay_order_id
        };

        try {
            const bookResponse = await fetch('/api/book', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bookingData)
            });

            const data = await bookResponse.json();

            if (data.success) {
                this.showSuccessModal({
                    booking_id: data.bookingId,
                    payment_status: 'Paid Online',
                    slot: `${this.formatDate(formData.date)} at ${this.formatTime(formData.time)}`,
                    amount: bookingData.totalPrice,
                    duration: duration === 30 ? '30 minutes' : '1 hour'
                });
                this.resetForm();
            } else {
                this.showError(data.message || 'Booking failed after payment');
            }
        } catch (error) {
            console.error('Booking creation error:', error);
            this.showError('Booking failed after payment. Please contact support with payment ID: ' + response.razorpay_payment_id);
        } finally {
            this.showLoadingOverlay(false);
        }
    }

    handlePaymentFailure(response) {
        console.error('Payment failed:', response);
        const errorMsg = response.error?.description || response.error?.reason || 'Payment failed';
        this.showError(`Payment failed: ${errorMsg}`);
    }

    showSuccessModal(data) {
        document.getElementById('confirmedBookingId').textContent = data.booking_id;
        document.getElementById('confirmedBookingDetails').textContent = 
            `Your booking for ${data.duration} on ${data.slot} has been confirmed.`;
        document.getElementById('confirmedPaymentInfo').textContent = 
            `Payment: ${data.payment_status} (₹${data.amount})`;
        
        document.getElementById('successModal').classList.remove('hidden');
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('successModal')?.classList.add('hidden');
        document.getElementById('errorModal')?.classList.add('hidden');
    }

    showLoadingOverlay(show, message = 'Processing...') {
        const paymentModal = document.getElementById('paymentModal');
        if (paymentModal) {
            if (show) {
                const messageElement = paymentModal.querySelector('p');
                if (messageElement) {
                    messageElement.textContent = message;
                }
                paymentModal.classList.remove('hidden');
            } else {
                paymentModal.classList.add('hidden');
            }
        }
    }

    resetForm() {
        // Reset to step 1
        this.currentStep = 1;
        this.showStep(1);
        
        // Clear form fields
        const fields = ['name', 'email', 'phone'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });

        // Reset date to today
        const dateInput = document.getElementById('date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }
        
        // Reset time and duration
        const timeSelect = document.getElementById('time');
        if (timeSelect) {
            timeSelect.innerHTML = '<option value="">Loading slots...</option>';
            timeSelect.disabled = true;
        }
        
        const durationInput = document.getElementById('duration');
        if (durationInput) {
            durationInput.value = '';
        }
        
        // Reset duration selection UI
        document.querySelectorAll('.duration-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Clear all field errors
        document.querySelectorAll('.error').forEach(field => {
            this.clearFieldError(field);
        });

        // Reset booking data
        this.bookingData = {};
        
        // Reload today's slots
        setTimeout(() => {
            if (dateInput) {
                this.handleDateChange({ target: dateInput });
            }
        }, 100);
    }

    printBooking() {
        window.print();
    }

    refreshAvailability() {
        const dateInput = document.getElementById('date');
        if (dateInput && dateInput.value) {
            this.handleDateChange({ target: dateInput });
        }
    }

    formatTime(time24) {
        if (!time24) return '';
        try {
            const [hours, minutes] = time24.split(':');
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes || '00'} ${ampm}`;
        } catch (error) {
            return time24;
        }
    }

    formatDate(dateString) {
        if (!dateString) return '';
        try {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', options);
        } catch (error) {
            return dateString;
        }
    }

    monitorConnection() {
        const updateStatus = (isOnline) => {
            const statusElement = document.getElementById('connectionStatus');
            const textElement = document.getElementById('connectionText');
            
            if (!statusElement || !textElement) return;

            statusElement.classList.remove('online', 'offline', 'hidden');
            
            if (isOnline) {
                statusElement.classList.add('online');
                textElement.textContent = 'Online';
                // Hide after 3 seconds
                setTimeout(() => {
                    statusElement.classList.add('hidden');
                }, 3000);
            } else {
                statusElement.classList.add('offline');
                textElement.textContent = 'Offline';
            }
        };

        window.addEventListener('online', () => updateStatus(true));
        window.addEventListener('offline', () => updateStatus(false));
        
        // Initial check
        updateStatus(navigator.onLine);
    }
}

// Initialize the booking system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing booking system...');
    const bookingSystem = new TurfBookingSystem();
    
    // Store instance globally for debugging
    window.bookingSystemInstance = bookingSystem;
    
    console.log('Booking system initialized');
});
