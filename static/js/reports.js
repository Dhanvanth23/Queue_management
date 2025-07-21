// static/js/reportss.js
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/appointments');
        if (!response.ok) {
            throw new Error('Failed to fetch appointment data');
        }
        const appointments = await response.json();
        
        renderCards(appointments);
        renderStatusChart(appointments);
        renderTrendChart(appointments);

    } catch (error) {
        console.error('Error fetching or rendering reportss:', error);
    }
});

function renderCards(appointments) {
    const totalAppointments = appointments.length;
    const approvedAppointments = appointments.filter(a => a.status === 'approved').length;
    const pendingAppointments = appointments.filter(a => a.status === 'pending').length;
    const cancelledAppointments = appointments.filter(a => a.status === 'cancelled').length;

    document.getElementById('totalAppointments').textContent = totalAppointments;
    document.getElementById('approvedAppointments').textContent = approvedAppointments;
    document.getElementById('pendingAppointments').textContent = pendingAppointments;
    document.getElementById('cancelledAppointments').textContent = cancelledAppointments;
}

function renderStatusChart(appointments) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    const statusCounts = appointments.reduce((acc, curr) => {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
        return acc;
    }, {});

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Approved', 'Pending', 'Cancelled'],
            datasets: [{
                label: 'Appointments by Status',
                data: [
                    statusCounts.approved || 0,
                    statusCounts.pending || 0,
                    statusCounts.cancelled || 0
                ],
                backgroundColor: [
                    'rgba(40, 167, 69, 0.7)',
                    'rgba(255, 193, 7, 0.7)',
                    'rgba(220, 53, 69, 0.7)'
                ],
                borderColor: [
                    'rgba(40, 167, 69, 1)',
                    'rgba(255, 193, 7, 1)',
                    'rgba(220, 53, 69, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true
        }
    });
}

function renderTrendChart(appointments) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    const trendData = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for(let i = 0; i < 30; i++) {
        const date = new Date(thirtyDaysAgo);
        date.setDate(date.getDate() + i);
        const dateString = date.toISOString().split('T')[0];
        trendData[dateString] = { approved: 0, pending: 0 };
    }

    appointments.forEach(apt => {
        const aptDate = new Date(apt.date);
        if (aptDate >= thirtyDaysAgo) {
            const dateString = apt.date;
            if (trendData[dateString]) {
                if (apt.status === 'approved') {
                    trendData[dateString].approved++;
                } else if (apt.status === 'pending') {
                    trendData[dateString].pending++;
                }
            }
        }
    });
    
    const labels = Object.keys(trendData);
    const approvedData = labels.map(label => trendData[label].approved);
    const pendingData = labels.map(label => trendData[label].pending);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Approved Appointments',
                data: approvedData,
                borderColor: 'rgba(40, 167, 69, 1)',
                backgroundColor: 'rgba(40, 167, 69, 0.2)',
                fill: true,
                tension: 0.1
            }, {
                label: 'Pending Appointments',
                data: pendingData,
                borderColor: 'rgba(255, 193, 7, 1)',
                backgroundColor: 'rgba(255, 193, 7, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Appointments'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}