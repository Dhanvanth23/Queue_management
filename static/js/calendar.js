// static/js/calendar.js
document.addEventListener('DOMContentLoaded', () => {
    const currentMonthYearEl = document.getElementById('currentMonthYear');
    const calendarEl = document.getElementById('calendar');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');

    let currentDate = new Date();

    const fetchAndRenderCalendar = async () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;

        currentMonthYearEl.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;

        try {
            const response = await fetch(`/api/calendar-appointments/${year}/${month}`);
            if (!response.ok) {
                throw new Error('Failed to fetch appointments');
            }
            const appointments = await response.json();
            renderCalendar(year, month, appointments);
        } catch (error) {
            console.error('Error fetching calendar data:', error);
            calendarEl.innerHTML = '<p>Error loading calendar data.</p>';
        }
    };

    const renderCalendar = (year, month, appointments) => {
        // Clear previous calendar days
        const dayElements = calendarEl.querySelectorAll('.day');
        dayElements.forEach(day => day.remove());

        const firstDay = new Date(year, month - 1, 1).getDay();
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.classList.add('day', 'other-month');
            calendarEl.appendChild(emptyDiv);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEl = document.createElement('div');
            dayEl.classList.add('day');
            
            const dayNumber = document.createElement('div');
            dayNumber.classList.add('day-number');
            dayNumber.textContent = day;
            dayEl.appendChild(dayNumber);

            if (appointments[dateStr]) {
                const stats = appointments[dateStr];
                const statsEl = document.createElement('div');
                statsEl.classList.add('day-stats');
                if(stats.approved > 0) statsEl.innerHTML += `<div class="status-approved">✓ ${stats.approved} Approved</div>`;
                if(stats.pending > 0) statsEl.innerHTML += `<div class="status-pending">? ${stats.pending} Pending</div>`;
                if(stats.cancelled > 0) statsEl.innerHTML += `<div class="status-cancelled">✗ ${stats.cancelled} Cancelled</div>`;
                dayEl.appendChild(statsEl);
            }
            calendarEl.appendChild(dayEl);
        }
    };

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        fetchAndRenderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        fetchAndRenderCalendar();
    });

    fetchAndRenderCalendar();
});