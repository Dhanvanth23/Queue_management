document.addEventListener('DOMContentLoaded', () => {
    const currentMonthYearEl = document.getElementById('currentMonthYear');
    const calendarEl = document.getElementById('calendar');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const loadingEl = document.getElementById('loading');
    const dayDetailsModal = document.getElementById('dayDetailsModal');
    const modalDayTitle = document.getElementById('modalDayTitle');
    const dayAppointmentsList = document.getElementById('dayAppointmentsList');

    let currentDate = new Date();

    // Show loading indicator
    const showLoading = () => loadingEl.classList.remove('hidden');
    const hideLoading = () => loadingEl.classList.add('hidden');

    // Modal functions
    const showDayDetailsModal = () => dayDetailsModal.classList.remove('hidden');
    const closeDayDetailsModal = () => dayDetailsModal.classList.add('hidden');
    window.closeDayDetailsModal = closeDayDetailsModal;

    // Fetch appointments for a specific date
    const fetchDayAppointments = async (date) => {
        try {
            showLoading();
            const response = await fetch(`/api/appointments?date=${date}`);
            if (!response.ok) throw new Error('Failed to fetch appointments');
            return await response.json();
        } catch (error) {
            console.error('Error fetching day appointments:', error);
            return [];
        } finally {
            hideLoading();
        }
    };

    // Render day details modal
    const renderDayDetails = async (date, day) => {
        modalDayTitle.textContent = `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`;
        
        const dateStr = formatDate(date);
        const appointments = await fetchDayAppointments(dateStr);
        
        if (appointments.length === 0) {
            dayAppointmentsList.innerHTML = '<p>No bookings for this day.</p>';
        } else {
            dayAppointmentsList.innerHTML = appointments.map(apt => `
                <div class="appointment-item ${apt.status}">
                    <div class="apt-time">${apt.time} (${apt.duration} mins)</div>
                    <div class="apt-customer">${apt.name}</div>
                    <div class="apt-contact">${apt.phone} | ${apt.email}</div>
                    <div class="apt-status">Status: ${apt.status}</div>
                    <div class="apt-actions">
                        ${apt.status === 'pending' ? `
                            <button class="btn-approve" onclick="updateAppointmentStatus(${apt.id}, 'approved')">Approve</button>
                            <button class="btn-cancel" onclick="updateAppointmentStatus(${apt.id}, 'cancelled')">Cancel</button>
                        ` : ''}
                        ${apt.status === 'approved' ? `
                            <button class="btn-cancel" onclick="updateAppointmentStatus(${apt.id}, 'cancelled')">Cancel</button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        }
        
        showDayDetailsModal();
    };

    // Format date as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Update appointment status
    window.updateAppointmentStatus = async (id, status) => {
        try {
            showLoading();
            const response = await fetch(`/api/appointments/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status })
            });
            
            if (!response.ok) throw new Error('Failed to update status');
            
            const result = await response.json();
            if (result.success) {
                // Refresh the day details
                const currentDate = new Date(modalDayTitle.textContent);
                renderDayDetails(currentDate);
            }
        } catch (error) {
            console.error('Error updating appointment:', error);
            alert('Failed to update appointment status');
        } finally {
            hideLoading();
        }
    };

    // Fetch and render calendar
    const fetchAndRenderCalendar = async () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;

        currentMonthYearEl.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;

        try {
            showLoading();
            const response = await fetch(`/api/appointments?month=${month}&year=${year}`);
            if (!response.ok) throw new Error('Failed to fetch appointments');
            
            const appointments = await response.json();
            renderCalendar(year, month, appointments);
        } catch (error) {
            console.error('Error fetching calendar data:', error);
            calendarEl.innerHTML = '<p class="error-message">Error loading calendar data.</p>';
        } finally {
            hideLoading();
        }
    };

    // Render calendar grid
    const renderCalendar = (year, month, appointments) => {
        // Clear previous calendar days (keep day names)
        const dayElements = calendarEl.querySelectorAll('.day:not(.day-name)');
        dayElements.forEach(day => day.remove());

        const firstDay = new Date(year, month - 1, 1).getDay();
        const daysInMonth = new Date(year, month, 0).getDate();
        const today = new Date();

        // Add empty cells for days of previous month
        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.classList.add('day', 'other-month');
            calendarEl.appendChild(emptyDiv);
        }

        // Add cells for current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = formatDate(date);
            
            const dayEl = document.createElement('div');
            dayEl.classList.add('day');
            
            // Highlight today
            if (date.toDateString() === today.toDateString()) {
                dayEl.classList.add('today');
            }

            const dayNumber = document.createElement('div');
            dayNumber.classList.add('day-number');
            dayNumber.textContent = day;
            dayEl.appendChild(dayNumber);

            // Count appointments by status for this day
            const dayAppointments = appointments.filter(apt => apt.date === dateStr);
            const stats = {
                approved: dayAppointments.filter(apt => apt.status === 'approved').length,
                pending: dayAppointments.filter(apt => apt.status === 'pending').length,
                cancelled: dayAppointments.filter(apt => apt.status === 'cancelled').length
            };

            if (dayAppointments.length > 0) {
                const statsEl = document.createElement('div');
                statsEl.classList.add('day-stats');
                
                if (stats.approved > 0) {
                    const approvedEl = document.createElement('div');
                    approvedEl.classList.add('status-approved');
                    approvedEl.innerHTML = `<span class="status-icon">✓</span> ${stats.approved}`;
                    statsEl.appendChild(approvedEl);
                }
                
                if (stats.pending > 0) {
                    const pendingEl = document.createElement('div');
                    pendingEl.classList.add('status-pending');
                    pendingEl.innerHTML = `<span class="status-icon">?</span> ${stats.pending}`;
                    statsEl.appendChild(pendingEl);
                }
                
                if (stats.cancelled > 0) {
                    const cancelledEl = document.createElement('div');
                    cancelledEl.classList.add('status-cancelled');
                    cancelledEl.innerHTML = `<span class="status-icon">✗</span> ${stats.cancelled}`;
                    statsEl.appendChild(cancelledEl);
                }
                
                dayEl.appendChild(statsEl);
            }

            // Add click handler to show day details
            dayEl.addEventListener('click', () => renderDayDetails(date, day));
            calendarEl.appendChild(dayEl);
        }
    };

    // Event listeners for month navigation
    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        fetchAndRenderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        fetchAndRenderCalendar();
    });

    // Initial load
    fetchAndRenderCalendar();
});