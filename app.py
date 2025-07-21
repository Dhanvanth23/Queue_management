# app.py
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
import hashlib

app = Flask(__name__)
CORS(app)
app.secret_key = 'coko pssl wmix rlep'  # Change this to a secure secret key

DATABASE = 'appointments.db'

# SMTP Configuration - Update these with your email settings
SMTP_CONFIG = {
    'server': 'smtp.gmail.com',  # Change to your SMTP server
    'port': 587,
    'email': 'dhanvanth.2301@gmail.com',  # Your email
    'password': 'coko pssl wmix rlep',  # Your app password (not regular password)
    'use_tls': True
}

# Admin credentials - In production, store these securely
ADMIN_CREDENTIALS = {
    'admin': 'admin123',  # username: password,
     'brindha': 'brindha123' # You can add more users
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
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create time slots table with predefined slots
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time TEXT UNIQUE NOT NULL,
            max_bookings INTEGER DEFAULT 1
        )
    ''')
    
    # Insert default time slots if not exists
    default_slots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
    for slot in default_slots:
        cursor.execute('INSERT OR IGNORE INTO time_slots (time) VALUES (?)', (slot,))
    
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def send_email(to_email, subject, body, is_html=False):
    """Send email using SMTP"""
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

# This function is no longer called immediately on booking
# It will only be called when an admin explicitly approves or cancels
def send_appointment_confirmation_email(appointment_data):
    """Send confirmation email to customer (for initial booking, but now managed by admin approval)"""
    subject = "Appointment Confirmation - Your Booking Request"
    
    body = f"""
Dear {appointment_data['name']},

Thank you for booking an appointment with us!

Your Appointment Details:
━━━━━━━━━━━━━━━━━━━━━━━━
📅 Date: {appointment_data['date']}
⏰ Time: {appointment_data['time']}
📞 Phone: {appointment_data['phone']}
🆔 Appointment ID: #{appointment_data['id']}

Status: PENDING APPROVAL
━━━━━━━━━━━━━━━━━━━━━━━━

Your appointment is currently pending approval. We will review your request and send you a confirmation email once it's approved.

What's Next?
• We will review your appointment request within 24 hours
• You'll receive an email notification when your appointment is approved
• Please arrive 10 minutes early for your appointment

Important Notes:
• If you need to reschedule or cancel, please contact us at least 24 hours in advance
• Bring a valid ID and any relevant documents
• Our office is closed on Sundays

Thank you for choosing our services!

Best regards,
The Appointment Team

---
This is an automated message. Please do not reply to this email.
If you have any questions, please contact us at {SMTP_CONFIG['email']}
    """
    
    return send_email(appointment_data['email'], subject, body)

def send_status_update_email(appointment_data, old_status):
    """Send status update email to customer"""
    status = appointment_data['status']
    
    if status == 'approved':
        subject = "✅ Appointment Approved - Confirmation Details"
        body = f"""
Dear {appointment_data['name']},

Great news! Your appointment has been APPROVED.

Confirmed Appointment Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Date: {appointment_data['date']}
⏰ Time: {appointment_data['time']}
📞 Phone: {appointment_data['phone']}
🆔 Appointment ID: #{appointment_data['id']}

Status: APPROVED ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your appointment is now confirmed! Please save this email for your records.

Important Reminders:
• Arrive 10 minutes early
• Bring a valid ID
• Bring any relevant documents
• Contact us if you need to reschedule (at least 24 hours notice)

We look forward to seeing you!

Best regards,
The Appointment Team

---
Need to reschedule? Contact us at {SMTP_CONFIG['email']}
        """
    elif status == 'cancelled':
        subject = "❌ Appointment Cancelled - Booking Update"
        body = f"""
Dear {appointment_data['name']},

We regret to inform you that your appointment has been cancelled.

Cancelled Appointment Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Date: {appointment_data['date']}
⏰ Time: {appointment_data['time']}
🆔 Appointment ID: #{appointment_data['id']}

Status: CANCELLED ❌
━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you would like to reschedule, please visit our booking page and select a new date and time.

We apologize for any inconvenience caused.

Best regards,
The Appointment Team

---
Book a new appointment: [Your booking URL]
Questions? Contact us at {SMTP_CONFIG['email']}
        """
    else:
        # For 'pending' status or any other, no email is sent from this function
        return True  
    
    return send_email(appointment_data['email'], subject, body)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin/login')
def admin_login():
    return render_template('login.html')

@app.route('/admin/login', methods=['POST'])
def admin_login_post():
    username = request.form.get('username')
    password = request.form.get('password')
    
    if username in ADMIN_CREDENTIALS and ADMIN_CREDENTIALS[username] == password:
        session['admin_logged_in'] = True
        session['admin_username'] = username
        return redirect(url_for('admin'))
    else:
        return render_template('login.html', error='Invalid username or password')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    return redirect(url_for('admin_login'))

@app.route('/admin')
@login_required
def admin():
    return render_template('admin.html')

@app.route('/api/available-slots/<date>')
def get_available_slots(date):
    try:
        conn = get_db_connection()
        
        # Get all time slots
        slots_query = conn.execute('SELECT * FROM time_slots ORDER BY time').fetchall()
        
        # Get booked appointments for the date
        booked_query = conn.execute('''
            SELECT time, COUNT(*) as count 
            FROM appointments 
            WHERE date = ? AND status != 'cancelled'
            GROUP BY time
        ''', (date,)).fetchall()
        
        # Create a dictionary for quick lookup
        booked_counts = {row['time']: row['count'] for row in booked_query}
        
        # Calculate available slots
        available_slots = []
        for slot in slots_query:
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
        name = data.get('name')
        email = data.get('email')
        phone = data.get('phone')
        date = data.get('date')
        time = data.get('time')
        
        if not all([name, email, phone, date, time]):
            return jsonify({'error': 'All fields are required'}), 400
        
        conn = get_db_connection()
        
        # Check if slot is still available
        booked_count = conn.execute('''
            SELECT COUNT(*) as count 
            FROM appointments 
            WHERE date = ? AND time = ? AND status != 'cancelled'
        ''', (date, time)).fetchone()['count']
        
        slot_info = conn.execute('''
            SELECT max_bookings FROM time_slots WHERE time = ?
        ''', (time,)).fetchone()
        
        if not slot_info:
            conn.close()
            return jsonify({'error': 'Invalid time slot'}), 400
        
        if booked_count >= slot_info['max_bookings']:
            conn.close()
            return jsonify({'error': 'Time slot is fully booked'}), 400
        
        # Book the appointment
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO appointments (name, email, phone, date, time)
            VALUES (?, ?, ?, ?, ?)
        ''', (name, email, phone, date, time))
        
        appointment_id = cursor.lastrowid
        conn.commit()
        
        # Get the created appointment data
        appointment = conn.execute('''
            SELECT * FROM appointments WHERE id = ?
        ''', (appointment_id,)).fetchone()
        
        conn.close()
        
        # Removed the immediate email sending here.
        # The email will now be sent when the admin updates the status.
        
        return jsonify({
            'success': True,
            'appointment_id': appointment_id,
            'message': 'Appointment booked successfully. Awaiting admin approval.'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments')
@login_required
def get_appointments():
    try:
        conn = get_db_connection()
        appointments = conn.execute('''
            SELECT * FROM appointments 
            ORDER BY date, time
        ''').fetchall()
        
        result = []
        for apt in appointments:
            result.append({
                'id': apt['id'],
                'name': apt['name'],
                'email': apt['email'],
                'phone': apt['phone'],
                'date': apt['date'],
                'time': apt['time'],
                'status': apt['status'],
                'created_at': apt['created_at']
            })
        
        conn.close()
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments/<int:appointment_id>/status', methods=['PUT'])
@login_required
def update_appointment_status(appointment_id):
    try:
        data = request.json
        status = data.get('status')
        
        if status not in ['pending', 'approved', 'cancelled']:
            return jsonify({'error': 'Invalid status'}), 400
        
        conn = get_db_connection()
        
        # Get current appointment data
        current_appointment = conn.execute('''
            SELECT * FROM appointments WHERE id = ?
        ''', (appointment_id,)).fetchone()
        
        if not current_appointment:
            conn.close()
            return jsonify({'error': 'Appointment not found'}), 404
        
        old_status = current_appointment['status']
        
        # Update the appointment
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE appointments 
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (status, appointment_id))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Failed to update appointment'}), 400
        
        conn.commit()
        
        # Get updated appointment data
        updated_appointment = conn.execute('''
            SELECT * FROM appointments WHERE id = ?
        ''', (appointment_id,)).fetchone()
        
        conn.close()
        
        # Send status update email only if the status actually changed
        # and it's 'approved' or 'cancelled'
        email_sent = False
        if old_status != status:
            appointment_data = {
                'id': updated_appointment['id'],
                'name': updated_appointment['name'],
                'email': updated_appointment['email'],
                'phone': updated_appointment['phone'],
                'date': updated_appointment['date'],
                'time': updated_appointment['time'],
                'status': updated_appointment['status']
            }
            email_sent = send_status_update_email(appointment_data, old_status)
        
        return jsonify({
            'success': True, 
            'message': f'Appointment {status} successfully',
            'email_sent': email_sent
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db() # Ensure database is initialized before running the app
    app.run(debug=True)