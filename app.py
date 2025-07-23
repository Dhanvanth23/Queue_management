from flask import Flask, request, jsonify, render_template, redirect, url_for, session, flash
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from collections import defaultdict

app = Flask(__name__)
CORS(app)
app.secret_key = 'hash fnqr bzuc fprm'

DATABASE = 'appointments.db'

# SMTP Configuration
SMTP_CONFIG = {
    'server': 'smtp.gmail.com',
    'port': 587,
    'email': 'Brindha9005@gmail.com',
    'password': 'hash fnqr bzuc fprm',
    'use_tls': True
}

# Admin credentials
ADMIN_CREDENTIALS = {
    'admin': 'admin123'
}

def init_db():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Create appointments table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            duration INTEGER DEFAULT 30,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create time slots table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time TEXT UNIQUE NOT NULL,
            max_bookings INTEGER DEFAULT 2
        )
    ''')
    
    # Insert time slots from 6 AM to 3 AM (next day)
    default_slots = []
    for hour in range(6, 24):
        default_slots.append((f"{hour:02d}:00", 2))
        default_slots.append((f"{hour:02d}:30", 2))
    for hour in range(0, 4):
        default_slots.append((f"{hour:02d}:00", 2))
        if hour < 3:
            default_slots.append((f"{hour:02d}:30", 2))
    
    for slot in default_slots:
        cursor.execute('INSERT OR IGNORE INTO time_slots (time, max_bookings) VALUES (?, ?)', slot)
    
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if admin is logged in
        if 'admin_logged_in' not in session or not session.get('admin_logged_in'):
            # Clear any invalid session data
            session.pop('admin_logged_in', None)
            session.pop('admin_username', None)
            flash('Please log in to access the admin panel.', 'warning')
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def send_email(to_email, subject, body, is_html=False):
    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = SMTP_CONFIG['email']
        msg['To'] = to_email
        msg['Subject'] = subject
        
        if is_html:
            msg.attach(MIMEText(body, 'html'))
        else:
            msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_CONFIG['server'], SMTP_CONFIG['port'])
        if SMTP_CONFIG['use_tls']:
            server.starttls()
        server.login(SMTP_CONFIG['email'], SMTP_CONFIG['password'])
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def send_status_update_email(appointment_data, old_status):
    status = appointment_data['status']
    
    # Calculate end time
    start_time = datetime.strptime(appointment_data['time'], '%H:%M')
    end_time = (start_time + timedelta(minutes=appointment_data['duration'])).strftime('%H:%M')
    
    if status == 'approved':
        subject = "✅ Turf Booking Approved"
        body = f"""
Dear {appointment_data['name']},

Your turf booking has been APPROVED.

Booking Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Date: {appointment_data['date']}
⏰ Time: {appointment_data['time']} to {end_time}
⏳ Duration: {appointment_data['duration']} minutes
📞 Phone: {appointment_data['phone']}
🆔 Booking ID: #{appointment_data['id']}

Status: APPROVED ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can view your booking details at any time by visiting our website.

Best regards,
The Turf Management Team
        """
    elif status == 'cancelled':
        subject = "❌ Turf Booking Cancelled"
        body = f"""
Dear {appointment_data['name']},

Your turf booking has been CANCELLED.

Cancelled Booking:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Date: {appointment_data['date']}
⏰ Time: {appointment_data['time']} to {end_time}
🆔 Booking ID: #{appointment_data['id']}

Status: CANCELLED ❌
━━━━━━━━━━━━━━━━━━━━━━━━━━━

If this was a mistake or you'd like to reschedule, please contact us.

Best regards,
The Turf Management Team
        """
    else:
        return True
    
    return send_email(appointment_data['email'], subject, body)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
def admin_redirect():
    """Redirect /admin to /admin/login if not logged in, otherwise to admin dashboard"""
    if 'admin_logged_in' in session and session.get('admin_logged_in'):
        return redirect(url_for('admin_dashboard'))
    else:
        return redirect(url_for('admin_login'))

@app.route('/admin/login')
def admin_login():
    # If already logged in, redirect to admin dashboard
    if 'admin_logged_in' in session and session.get('admin_logged_in'):
        return redirect(url_for('admin_dashboard'))
    return render_template('login.html')

@app.route('/admin/login', methods=['POST'])
def admin_login_post():
    username = request.form.get('username')
    password = request.form.get('password')
    
    # Clear any existing session data first
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    
    if username in ADMIN_CREDENTIALS and ADMIN_CREDENTIALS[username] == password:
        session['admin_logged_in'] = True
        session['admin_username'] = username
        session.permanent = True  # Make session permanent
        flash('Login successful!', 'success')
        return redirect(url_for('admin_dashboard'))
    else:
        flash('Invalid username or password. Please try again.', 'error')
        return render_template('login.html', error='Invalid username or password')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    flash('You have been logged out successfully.', 'info')
    return redirect(url_for('admin_login'))

@app.route('/admin/dashboard')
@login_required
def admin_dashboard():
    return render_template('admin.html')

# Update all admin routes to use the new naming
@app.route('/admin/calendar')
@login_required
def admin_calendar():
    return render_template('calendar.html')

@app.route('/admin/reports')
@login_required
def admin_reports():
    return render_template('reports.html')

# Keep the old route for backward compatibility but redirect
@app.route('/admin')
@login_required  
def admin():
    return redirect(url_for('admin_dashboard'))

@app.route('/api/available-slots/<date>')
def get_available_slots(date):
    try:
        # Validate date format
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    try:
        conn = get_db_connection()
        
        # Get all time slots (ordered by time)
        slots_query = conn.execute('SELECT * FROM time_slots ORDER BY time').fetchall()
        
        # Get booked appointments for the date
        booked_query = conn.execute('''
            SELECT time, COUNT(*) as count 
            FROM appointments 
            WHERE date = ? AND status != 'cancelled' AND status != 'linked'
            GROUP BY time
        ''', (date,)).fetchall()
        
        booked_counts = {row['time']: row['count'] for row in booked_query}
        
        available_slots = []
        for slot in slots_query:
            # Skip slots between 3 AM - 6 AM
            hour = int(slot['time'].split(':')[0])
            if hour >= 3 and hour < 6:
                continue
                
            booked_count = booked_counts.get(slot['time'], 0)
            available_count = slot['max_bookings'] - booked_count
            if available_count > 0:
                available_slots.append({
                    'time': slot['time'],
                    'available': available_count
                })
        
        conn.close()
        return jsonify(available_slots)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/book-appointment', methods=['POST'])
def book_appointment():
    try:
        data = request.json
        required_fields = ['name', 'email', 'phone', 'date', 'time', 'duration']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'All fields are required'}), 400
        
        # Validate duration
        if data['duration'] not in [30, 60]:
            return jsonify({'error': 'Invalid duration'}), 400
        
        conn = get_db_connection()
        
        # Check slot availability
        booked_count = conn.execute('''
            SELECT COUNT(*) as count 
            FROM appointments 
            WHERE date = ? AND time = ? AND status != 'cancelled' AND status != 'linked'
        ''', (data['date'], data['time'])).fetchone()['count']
        
        slot_info = conn.execute('SELECT max_bookings FROM time_slots WHERE time = ?', (data['time'],)).fetchone()
        
        if not slot_info or booked_count >= slot_info['max_bookings']:
            conn.close()
            return jsonify({'error': 'Time slot is fully booked'}), 400
        
        # For 1-hour bookings, check next slot
        if data['duration'] == 60:
            start_time = datetime.strptime(data['time'], '%H:%M')
            next_slot_time = (start_time + timedelta(minutes=30)).strftime('%H:%M')
            
            next_slot_booked = conn.execute('''
                SELECT COUNT(*) as count 
                FROM appointments 
                WHERE date = ? AND time = ? AND status != 'cancelled' AND status != 'linked'
            ''', (data['date'], next_slot_time)).fetchone()['count']
            
            next_slot_info = conn.execute('SELECT max_bookings FROM time_slots WHERE time = ?', (next_slot_time,)).fetchone()
            
            if not next_slot_info or next_slot_booked >= next_slot_info['max_bookings']:
                conn.close()
                return jsonify({'error': 'Next 30-minute slot not available for 1-hour booking'}), 400
            
            # Book both slots
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO appointments (name, email, phone, date, time, duration)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data['name'], data['email'], data['phone'], data['date'], data['time'], data['duration']))
            
            # Mark next slot as linked
            cursor.execute('''
                INSERT INTO appointments (name, email, phone, date, time, duration, status)
                VALUES (?, ?, ?, ?, ?, ?, 'linked')
            ''', (data['name'], data['email'], data['phone'], data['date'], next_slot_time, data['duration']))
            
            appointment_id = cursor.lastrowid
        else:
            # Book single 30-minute slot
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO appointments (name, email, phone, date, time, duration)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data['name'], data['email'], data['phone'], data['date'], data['time'], data['duration']))
            
            appointment_id = cursor.lastrowid
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'appointment_id': appointment_id,
            'message': 'Turf booked successfully. Awaiting admin approval.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments')
@login_required
def get_appointments():
    try:
        month = request.args.get('month')
        year = request.args.get('year')
        date = request.args.get('date')
        
        conn = get_db_connection()
        query = 'SELECT * FROM appointments WHERE status != "linked"'
        params = []
        
        # Filter by month and year if provided
        if month and year:
            query += ' AND strftime("%m", date) = ? AND strftime("%Y", date) = ?'
            params.extend([f"{int(month):02d}", year])
        
        # Filter by specific date if provided
        if date:
            query += ' AND date = ?'
            params.append(date)
        
        query += ' ORDER BY date, time'
        
        appointments = conn.execute(query, params).fetchall()
        
        result = []
        for apt in appointments:
            result.append({
                'id': apt['id'],
                'name': apt['name'],
                'email': apt['email'],
                'phone': apt['phone'],
                'date': apt['date'],
                'time': apt['time'],
                'duration': apt['duration'],
                'status': apt['status'],
                'created_at': apt['created_at']
            })
        
        conn.close()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/calendar-appointments/<int:year>/<int:month>')
@login_required
def get_calendar_appointments(year, month):
    try:
        conn = get_db_connection()
        
        # Get all appointments for the month
        appointments = conn.execute('''
            SELECT date, status 
            FROM appointments 
            WHERE strftime("%Y", date) = ? 
            AND strftime("%m", date) = ?
            AND status != 'linked'
        ''', (str(year), f"{month:02d}")).fetchall()
        
        # Format data for calendar
        calendar_data = defaultdict(lambda: {
            'approved': 0,
            'pending': 0,
            'cancelled': 0
        })
        
        for apt in appointments:
            calendar_data[apt['date']][apt['status']] += 1
        
        conn.close()
        return jsonify(calendar_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reports/stats')
@login_required
def get_reports_stats():
    try:
        conn = get_db_connection()
        
        # Get overall statistics
        stats = {}
        
        # Total appointments
        stats['total'] = conn.execute('SELECT COUNT(*) as count FROM appointments WHERE status != "linked"').fetchone()['count']
        
        # Status breakdown
        status_data = conn.execute('''
            SELECT status, COUNT(*) as count 
            FROM appointments 
            WHERE status != 'linked'
            GROUP BY status
        ''').fetchall()
        
        for row in status_data:
            stats[row['status']] = row['count']
        
        # Trend data (last 30 days)
        trend_data = conn.execute('''
            SELECT date, COUNT(*) as count 
            FROM appointments 
            WHERE status != 'linked' 
            AND date >= date('now', '-30 days')
            GROUP BY date
            ORDER BY date
        ''').fetchall()
        
        stats['trend'] = [{'date': row['date'], 'count': row['count']} for row in trend_data]
        
        conn.close()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments/<int:appointment_id>/status', methods=['PUT'])
@login_required
def update_appointment_status(appointment_id):
    try:
        data = request.json
        if 'status' not in data or data['status'] not in ['pending', 'approved', 'cancelled']:
            return jsonify({'error': 'Invalid status'}), 400
        
        conn = get_db_connection()
        
        # Get current appointment
        current_appointment = conn.execute('SELECT * FROM appointments WHERE id = ?', (appointment_id,)).fetchone()
        if not current_appointment:
            conn.close()
            return jsonify({'error': 'Appointment not found'}), 404
        
        old_status = current_appointment['status']
        
        # Update appointment
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE appointments 
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (data['status'], appointment_id))
        
        # Update linked slot if 1-hour booking
        if current_appointment['duration'] == 60:
            start_time = datetime.strptime(current_appointment['time'], '%H:%M')
            next_slot_time = (start_time + timedelta(minutes=30)).strftime('%H:%M')
            
            cursor.execute('''
                UPDATE appointments 
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE date = ? AND time = ? AND status = 'linked'
            ''', (data['status'], current_appointment['date'], next_slot_time))
        
        conn.commit()
        
        # Get updated appointment
        updated_appointment = conn.execute('SELECT * FROM appointments WHERE id = ?', (appointment_id,)).fetchone()
        conn.close()
        
        # Send email if status changed
        email_sent = False
        if old_status != data['status']:
            appointment_data = {
                'id': updated_appointment['id'],
                'name': updated_appointment['name'],
                'email': updated_appointment['email'],
                'phone': updated_appointment['phone'],
                'date': updated_appointment['date'],
                'time': updated_appointment['time'],
                'duration': updated_appointment['duration'],
                'status': updated_appointment['status']
            }
            email_sent = send_status_update_email(appointment_data, old_status)
        
        return jsonify({
            'success': True, 
            'message': f'Appointment {data["status"]} successfully',
            'email_sent': email_sent
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True)