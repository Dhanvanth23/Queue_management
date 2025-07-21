from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta
import os

app = Flask(__name__)
CORS(app)

DATABASE = 'appointments.db'

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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
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
        conn.close()
        
        return jsonify({
            'success': True,
            'appointment_id': appointment_id,
            'message': 'Appointment booked successfully'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments')
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
def update_appointment_status(appointment_id):
    try:
        data = request.json
        status = data.get('status')
        
        if status not in ['pending', 'approved', 'cancelled']:
            return jsonify({'error': 'Invalid status'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE appointments 
            SET status = ? 
            WHERE id = ?
        ''', (status, appointment_id))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Appointment not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': f'Appointment {status} successfully'})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True)