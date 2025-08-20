from flask import Flask, request, jsonify, render_template, session, flash, redirect, url_for
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta
import uuid
import json
import os
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
import razorpay
import threading


app = Flask(__name__)
CORS(app)
app.secret_key = os.environ.get('SECRET_KEY')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE = 'turf_booking.db'

# Create a global lock to prevent race conditions during booking
booking_lock = threading.Lock()

# Configuration for SMTP (Email)
SMTP_CONFIG = {
    'server': 'smtp.gmail.com',
    'port': 465,
    'email': 'ABC@gmail.com',
    'password': 'pass',
    'use_tls': False,  # set this to False since we’ll use SSL
    'use_ssl': True     # custom field we will use in send_email
}


# Configuration for Razorpay Payment Gateway
RAZORPAY_CONFIG = {
    'key_id': os.environ.get('RAZORPAY_KEY_ID'),
    'key_secret': os.environ.get('RAZORPAY_KEY_SECRET')
}
razorpay_client = razorpay.Client(auth=(RAZORPAY_CONFIG['key_id'], RAZORPAY_CONFIG['key_secret']))

# Database helper functions
def get_db():
    """Establishes a connection to the SQLite database and sets row_factory for dict-like access."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row # This allows accessing columns by name
    return conn

def init_db():
    """Initializes the database by creating necessary tables and a default admin user if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            booking_id TEXT PRIMARY KEY,
            user_name TEXT NOT NULL,
            user_email TEXT NOT NULL,
            user_phone TEXT NOT NULL,
            turf_type TEXT NOT NULL,
            booking_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            total_price REAL NOT NULL,
            status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'completed', 'cancelled'
            payment_status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'failed'
            payment_id TEXT,
            order_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add a default admin user if not exists for easy testing
    cursor.execute("SELECT * FROM users WHERE username = 'admin'")
    if not cursor.fetchone():
        # IMPORTANT: In a production application, passwords should ALWAYS be hashed (e.g., using bcrypt).
        # This is kept simple for demonstration purposes.
        cursor.execute("INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)",
                       ('admin', 'adminpass', 1))
    conn.commit()
    conn.close()

# Initialize database on app startup
with app.app_context():
    init_db()

# Decorators for authentication and authorization
def login_required(f):
    """Decorator to ensure a user is logged in before accessing a route."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access this page.', 'danger')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to ensure the logged-in user has admin privileges."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'is_admin' not in session or not session['is_admin']:
            flash('Access denied: Admins only.', 'danger')
            return redirect(url_for('login')) # Redirect to login instead of index
        return f(*args, **kwargs)
    return decorated_function

# Email sending utility
def send_email(to_email, subject, body):
    msg = MIMEMultipart()
    msg['From'] = SMTP_CONFIG['email']
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'html'))

    try:
        if SMTP_CONFIG.get('use_ssl'):
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_CONFIG['server'], SMTP_CONFIG['port'], context=context, timeout=10) as server:
                server.login(SMTP_CONFIG['email'], SMTP_CONFIG['password'])
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_CONFIG['server'], SMTP_CONFIG['port'], timeout=10) as server:
                server.starttls()
                server.login(SMTP_CONFIG['email'], SMTP_CONFIG['password'])
                server.send_message(msg)

        logger.info(f"✅ Email sent to {to_email} with subject: {subject}")
    except Exception as e:
        logger.error(f"❌ Failed to send email to {to_email}: {e}")

def send_booking_confirmation_email(email, name, booking_id, turf_type, booking_date, start_time, end_time, total_price):
    """Sends a booking confirmation email to the user."""
    subject = f"Turf Booking Confirmation - #{booking_id}"
    body = f"""
    <html>
    <body>
        <p>Dear {name},</p>
        <p>Your booking (ID: <strong>{booking_id}</strong>) for {turf_type} has been confirmed!</p>
        <p><strong>Booking Details:</strong></p>
        <ul>
            <li>Date: {booking_date}</li>
            <li>Time: {start_time} - {end_time}</li>
            <li>Turf Type: {turf_type}</li>
            <li>Total Price: &#8377;{total_price:.2f}</li>
        </ul>
        <p>Thank you for choosing our Premium Turf Booking System.</p>
        <p>Best regards,<br>The Turf Team</p>
    </body>
    </html>
    """
    send_email(email, subject, body)

def send_booking_status_update_email(email, name, booking_id, status, turf_type, booking_date, start_time, end_time):
    """Sends an email notification about a booking status update."""
    subject = f"Turf Booking Status Update - #{booking_id}"
    body = f"""
    <html>
    <body>
        <p>Dear {name},</p>
        <p>The status of your booking (ID: <strong>{booking_id}</strong>) for {turf_type} on {booking_date} from {start_time} to {end_time} has been updated to: <strong>{status.upper()}</strong>.</p>
        <p>If you have any questions, please contact us.</p>
        <p>Best regards,<br>The Turf Team</p>
    </body>
    </html>
    """
    send_email(email, subject, body)

# Routes
@app.route('/')
def index():
    """Renders the main booking page."""
    # Pass the Razorpay key to the frontend for payment processing
    return render_template('index.html', razorpay_key=RAZORPAY_CONFIG['key_id'])

@app.route('/admin')
def admin_redirect():
    """Redirect to admin login or dashboard based on authentication status"""
    # Only redirect to dashboard if user is actually logged in AND is admin
    if 'user_id' in session and 'is_admin' in session and session.get('is_admin') == True:
        return redirect(url_for('admin_dashboard'))
    else:
        # Clear session and force login
        session.clear()
        return redirect(url_for('admin_login'))

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    """Handles admin login specifically."""
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        conn = None
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE username = ? AND password = ? AND is_admin = 1", (username, password))
            user = cursor.fetchone()

            if user:
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['is_admin'] = bool(user['is_admin'])
                flash('Admin logged in successfully!', 'success')
                return redirect(url_for('admin_dashboard'))
            else:
                flash('Invalid admin credentials.', 'danger')
        except Exception as e:
            logger.error(f"Error during admin login: {e}")
            flash(f"An error occurred: {e}", 'danger')
        finally:
            if conn:
                conn.close()
    
    # For GET requests or failed logins, render the login page
    return render_template('login.html')

@app.route('/admin/dashboard')
@login_required
@admin_required
def admin_dashboard():
    """Render the admin dashboard"""
    # Get stats for the dashboard
    conn = get_db()
    cursor = conn.cursor()
    
    # Get booking counts
    cursor.execute("SELECT COUNT(*) FROM bookings")
    total_bookings = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM bookings WHERE status = 'pending'")
    pending_bookings = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM bookings WHERE status = 'approved'")
    approved_bookings = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM bookings WHERE status = 'cancelled'")
    cancelled_bookings = cursor.fetchone()[0]
    
    # Get recent bookings
    cursor.execute("""
        SELECT booking_id as id, user_name as name, user_email as email, 
               user_phone as phone, turf_type, booking_date as date, 
               start_time as time, end_time, total_price, status, 
               payment_status, created_at, 
               CAST((julianday(end_time) - julianday(start_time)) * 24 * 60 AS INTEGER) as duration
        FROM bookings 
        ORDER BY created_at DESC
        LIMIT 10
    """)
    recent_bookings = cursor.fetchall()
    conn.close()
    
    return render_template('admin.html',
                         total_bookings=total_bookings,
                         pending_bookings=pending_bookings,
                         approved_bookings=approved_bookings,
                         cancelled_bookings=cancelled_bookings,
                         recent_bookings=recent_bookings)

@app.route('/admin/calendar')
@login_required
@admin_required
def admin_calendar():
    """Render the admin calendar view."""
    return render_template('calendar.html')

@app.route('/admin/reports')
@login_required
@admin_required
def admin_reports():
    """Render the admin reports page."""
    return render_template('reports.html')

@app.route('/admin/logout')
@login_required
@admin_required
def admin_logout():
    """Logs out the admin user."""
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('is_admin', None)
    flash('You have been logged out.', 'info')
    return redirect(url_for('admin_login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login."""
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        conn = None
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password))
            user = cursor.fetchone()

            if user:
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['is_admin'] = bool(user['is_admin'])
                flash('Logged in successfully!', 'success')
                
                # Redirect to admin dashboard if admin, otherwise to home
                if session['is_admin']:
                    return redirect(url_for('admin_dashboard'))
                return redirect(url_for('index'))
            else:
                flash('Invalid username or password.', 'danger')
        except Exception as e:
            logger.error(f"Error during login: {e}")
            flash(f"An error occurred: {e}", 'danger')
        finally:
            if conn:
                conn.close()
    
    # For GET requests or failed logins, render the login page
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    """Logs out the current user by clearing the session."""
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('is_admin', None)
    flash('You have been logged out.', 'info')
    return redirect(url_for('index'))

@app.route('/api/book', methods=['POST'])
def book_turf():
    """Handles the booking of a turf slot."""
    # Acquire a lock to prevent race conditions during booking creation, ensuring data integrity.
    with booking_lock:
        data = request.json
        user_name = data.get('userName')
        user_email = data.get('userEmail')
        user_phone = data.get('userPhone')
        turf_type = data.get('turfType', 'Premium Grass Turf')  # Default turf type
        booking_date = data.get('bookingDate')
        start_time = data.get('startTime')
        duration = data.get('duration')  # Duration in minutes
        total_price = data.get('totalPrice')
        payment_status = data.get('paymentStatus', 'pending') # Default to pending
        payment_id = data.get('paymentId')
        order_id = data.get('orderId')

        # Calculate end time based on start time and duration
        if start_time and duration:
            start_dt = datetime.strptime(start_time, '%H:%M')
            end_dt = start_dt + timedelta(minutes=int(duration))
            end_time = end_dt.strftime('%H:%M')
        else:
            end_time = data.get('endTime')

        # Validate required fields
        if not all([user_name, user_email, user_phone, booking_date, start_time, end_time, total_price is not None]):
            return jsonify({'success': False, 'message': 'Missing required booking data.'}), 400

        # Validate date and time format and logical order (start before end)
        try:
            booking_datetime_start = datetime.strptime(f"{booking_date} {start_time}", '%Y-%m-%d %H:%M')
            booking_datetime_end = datetime.strptime(f"{booking_date} {end_time}", '%Y-%m-%d %H:%M')
            if booking_datetime_start >= booking_datetime_end:
                return jsonify({'success': False, 'message': 'Start time must be before end time.'}), 400
        except ValueError:
            return jsonify({'success': False, 'message': 'Invalid date or time format.'}), 400

        conn = None
        try:
            conn = get_db()
            cursor = conn.cursor()

            # Check for existing overlapping bookings for the selected turf and time.
            # An overlap occurs if (new_start < existing_end) AND (new_end > existing_start)
            cursor.execute("""
                SELECT COUNT(*) FROM bookings
                WHERE turf_type = ? AND booking_date = ? AND
                ((? < end_time AND ? > start_time))
                AND (status = 'approved' OR status = 'pending') -- Only check against confirmed/pending bookings
            """, (turf_type, booking_date, end_time, start_time))

            existing_bookings_count = cursor.fetchone()[0]

            if existing_bookings_count > 0:
                logger.warning(f"Booking conflict detected for {turf_type} on {booking_date} from {start_time}-{end_time}")
                return jsonify({'success': False, 'message': 'Selected slot is already booked or overlaps with an existing booking. Please choose another time.'}), 409

            booking_id = str(uuid.uuid4()) # Generate a unique booking ID

            # Insert the new booking into the database
            cursor.execute("""
                INSERT INTO bookings (booking_id, user_name, user_email, user_phone, turf_type,
                                     booking_date, start_time, end_time, total_price,
                                     status, payment_status, payment_id, order_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (booking_id, user_name, user_email, user_phone, turf_type,
                  booking_date, start_time, end_time, total_price,
                  'pending', payment_status, payment_id, order_id))
            conn.commit()

            # For free bookings, don't send confirmation email immediately - wait for admin approval
            logger.info(f"Booking created successfully: {booking_id}")
            
            return jsonify({
                'success': True, 
                'message': 'Booking placed successfully! Waiting for admin approval.', 
                'bookingId': booking_id
            }), 201

        except Exception as e:
            conn.rollback() # Rollback transaction in case of error
            logger.error(f"Error creating booking: {e}")
            return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
        finally:
            if conn:
                conn.close()

@app.route('/api/book/free', methods=['POST'])
def book_turf_free():
    """Handles free bookings (pay at venue)."""
    data = request.json
    user_name = data.get('userName')
    user_email = data.get('userEmail')
    user_phone = data.get('userPhone')
    turf_type = data.get('turfType', 'Premium Grass Turf')
    booking_date = data.get('bookingDate')
    start_time = data.get('startTime')
    duration = data.get('duration')
    total_price = data.get('totalPrice')

    # Calculate end time
    if start_time and duration:
        start_dt = datetime.strptime(start_time, '%H:%M')
        end_dt = start_dt + timedelta(minutes=int(duration))
        end_time = end_dt.strftime('%H:%M')
    else:
        return jsonify({'success': False, 'message': 'Start time and duration are required.'}), 400

    # Validate required fields
    if not all([user_name, user_email, user_phone, booking_date, start_time, end_time, total_price is not None]):
        return jsonify({'success': False, 'message': 'Missing required booking data.'}), 400

    # Validate date and time
    try:
        booking_datetime_start = datetime.strptime(f"{booking_date} {start_time}", '%Y-%m-%d %H:%M')
        booking_datetime_end = datetime.strptime(f"{booking_date} {end_time}", '%Y-%m-%d %H:%M')
        if booking_datetime_start >= booking_datetime_end:
            return jsonify({'success': False, 'message': 'Start time must be before end time.'}), 400
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid date or time format.'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Check for overlapping bookings
        cursor.execute("""
            SELECT COUNT(*) FROM bookings
            WHERE turf_type = ? AND booking_date = ? AND
            ((? < end_time AND ? > start_time))
            AND (status = 'approved' OR status = 'pending')
        """, (turf_type, booking_date, end_time, start_time))

        if cursor.fetchone()[0] > 0:
            return jsonify({'success': False, 'message': 'Selected slot is already booked. Please choose another time.'}), 409

        booking_id = str(uuid.uuid4())

        # Insert free booking with 'pending' status
        cursor.execute("""
            INSERT INTO bookings (booking_id, user_name, user_email, user_phone, turf_type,
                                 booking_date, start_time, end_time, total_price,
                                 status, payment_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')
        """, (booking_id, user_name, user_email, user_phone, turf_type,
              booking_date, start_time, end_time, total_price))
        conn.commit()

        return jsonify({
            'success': True,
            'message': 'Free booking placed successfully! Your slot will be confirmed after admin approval.',
            'bookingId': booking_id
        }), 201

    except Exception as e:
        conn.rollback()
        logger.error(f"Error creating free booking: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/payment/order', methods=['POST'])
def create_razorpay_order():
    """Creates a Razorpay order for payment."""
    data = request.json
    amount_rupees = data.get('amount')
    currency = 'INR'
    receipt_id = str(uuid.uuid4()) # Generate a unique receipt ID for Razorpay

    if not amount_rupees:
        return jsonify({'success': False, 'message': 'Amount is required.'}), 400

    amount_paise = int(float(amount_rupees) * 100) # Razorpay expects amount in paise

    try:
        order = razorpay_client.order.create({
            'amount': amount_paise,
            'currency': currency,
            'receipt': receipt_id,
            'payment_capture': '1' # Auto capture payment when successful
        })
        return jsonify({'success': True, 'order_id': order['id'], 'amount': amount_rupees, 'currency': currency})
    except Exception as e:
        logger.error(f"Error creating Razorpay order: {e}")
        return jsonify({'success': False, 'message': f'Failed to create order: {str(e)}'}), 500

@app.route('/api/payment/verify', methods=['POST'])
def verify_razorpay_payment():
    """Verifies a successful Razorpay payment and updates the booking status."""
    data = request.json
    razorpay_order_id = data.get('razorpay_order_id')
    razorpay_payment_id = data.get('razorpay_payment_id')
    razorpay_signature = data.get('razorpay_signature')
    booking_id = data.get('booking_id') # Get booking_id from frontend

    if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id]):
        return jsonify({'success': False, 'message': 'Missing payment verification data.'}), 400

    try:
        # Verify the payment signature with Razorpay
        params_dict = {
            'razorpay_order_id': razorpay_order_id,
            'razorpay_payment_id': razorpay_payment_id,
            'razorpay_signature': razorpay_signature
        }
        razorpay_client.utility.verify_payment_signature(params_dict)

        # Update booking status to 'paid' and 'approved' (or pending if admin approval is separate)
        conn = None
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE bookings SET
                payment_status = 'paid',
                payment_id = ?,
                status = 'approved' -- Auto-approve if payment is successful for simplicity
                WHERE booking_id = ?
            """, (razorpay_payment_id, booking_id))
            conn.commit()

            # Fetch booking details to send confirmation email in a non-blocking way
            cursor.execute("SELECT user_email, user_name, turf_type, booking_date, start_time, end_time, total_price FROM bookings WHERE booking_id = ?", (booking_id,))
            booking = cursor.fetchone()
            if booking:
                threading.Thread(target=send_booking_confirmation_email, args=(
                    booking['user_email'], booking['user_name'], booking_id,
                    booking['turf_type'], booking['booking_date'], booking['start_time'],
                    booking['end_time'], booking['total_price']
                )).start()

            return jsonify({'success': True, 'message': 'Payment successful and booking updated!'})
        except Exception as e:
            conn.rollback()
            logger.error(f"Error updating booking status after payment: {e}")
            return jsonify({'success': False, 'message': f'Internal server error during booking update: {str(e)}'}), 500
        finally:
            if conn:
                conn.close()

    except Exception as e:
        logger.error(f"Razorpay signature verification failed for order {razorpay_order_id}, payment {razorpay_payment_id}: {e}")
        return jsonify({'success': False, 'message': f'Payment verification failed: {str(e)}'}), 400

# Admin API endpoints
@app.route('/api/appointments', methods=['GET'])
@login_required
@admin_required
def get_appointments():
    """Admin API to fetch all bookings - matches the endpoint expected by admin.js"""
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT booking_id as id, user_name as name, user_email as email, 
                   user_phone as phone, turf_type, booking_date as date, 
                   start_time as time, end_time, total_price, status, 
                   payment_status, created_at, 
                   CAST((julianday(end_time) - julianday(start_time)) * 24 * 60 AS INTEGER) as duration
            FROM bookings 
            ORDER BY created_at DESC
        """)
        bookings = cursor.fetchall()
        
        # Convert sqlite3.Row objects to dictionaries for JSON serialization
        appointments = []
        for booking in bookings:
            appointment = dict(booking)
            # Calculate duration if not available
            if not appointment.get('duration'):
                try:
                    start_dt = datetime.strptime(appointment['time'], '%H:%M')
                    end_dt = datetime.strptime(appointment['end_time'], '%H:%M')
                    duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
                    appointment['duration'] = duration_minutes
                except:
                    appointment['duration'] = 60  # Default to 60 minutes
            appointments.append(appointment)
            
        return jsonify(appointments)
    except Exception as e:
        logger.error(f"Error fetching appointments: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/appointments/<int:booking_id>/status', methods=['PUT'])
@login_required
@admin_required
def update_appointment_status(booking_id):
    """Admin API to update the status of a specific booking - matches the endpoint expected by admin.js"""
    data = request.json
    new_status = data.get('status')
    if not new_status:
        return jsonify({'success': False, 'message': 'New status is required.'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Fetch current booking details before updating to send notification email
        cursor.execute("SELECT user_email, user_name, turf_type, booking_date, start_time, end_time FROM bookings WHERE rowid = ?", (booking_id,))
        booking = cursor.fetchone()

        if not booking:
            return jsonify({'success': False, 'message': 'Booking not found.'}), 404

        cursor.execute("UPDATE bookings SET status = ? WHERE rowid = ?", (new_status, booking_id))
        conn.commit()

        # Send status update email in a non-blocking way
        threading.Thread(target=send_booking_status_update_email, args=(
           booking['user_email'], booking['user_name'], str(booking_id), new_status,
            booking['turf_type'], booking['booking_date'], booking['start_time'],
            booking['end_time']
        )).start()

        return jsonify({'success': True, 'message': f'Booking {booking_id} status updated to {new_status}'})
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating booking status for {booking_id}: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/bookings', methods=['GET'])
@login_required
@admin_required
def get_bookings():
    """Admin API to fetch all bookings."""
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bookings ORDER BY created_at DESC")
        bookings = cursor.fetchall()
        # Convert sqlite3.Row objects to dictionaries for JSON serialization
        return jsonify({'success': True, 'bookings': [dict(booking) for booking in bookings]})
    except Exception as e:
        logger.error(f"Error fetching bookings: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/admin/bookings/<string:booking_id>/status', methods=['PUT'])
@login_required
@admin_required
def update_booking_status(booking_id):
    """Admin API to update the status of a specific booking."""
    data = request.json
    new_status = data.get('status')
    if not new_status:
        return jsonify({'success': False, 'message': 'New status is required.'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Fetch current booking details before updating to send notification email
        cursor.execute("SELECT user_email, user_name, turf_type, booking_date, start_time, end_time FROM bookings WHERE booking_id = ?", (booking_id,))
        booking = cursor.fetchone()

        if not booking:
            return jsonify({'success': False, 'message': 'Booking not found.'}), 404

        cursor.execute("UPDATE bookings SET status = ? WHERE booking_id = ?", (new_status, booking_id))
        conn.commit()

        # Send status update email in a non-blocking way
        threading.Thread(target=send_booking_status_update_email, args=(
           booking['user_email'], booking['user_name'], booking_id, new_status,
            booking['turf_type'], booking['booking_date'], booking['start_time'],
            booking['end_time']
        )).start()

        return jsonify({'success': True, 'message': f'Booking {booking_id} status updated to {new_status}'})
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating booking status for {booking_id}: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

# Admin API to delete a booking
@app.route('/api/admin/bookings/<booking_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_booking(booking_id):
    """Admin API to delete a specific booking."""
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM bookings WHERE booking_id = ?", (booking_id,))
        conn.commit()
        return jsonify({'success': True, 'message': f'Booking {booking_id} deleted successfully'})
    except Exception as e:
        conn.rollback()
        logger.error(f"Error deleting booking {booking_id}: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/available-slots/<date>', methods=['GET'])
def available_slots(date):
    """
    Returns available 30-minute and 1-hour slots for the given date,
    accepting both MM/DD/YYYY and YYYY-MM-DD formats.
    """
    try:
        # ✅ FIXED: Support both MM/DD/YYYY and YYYY-MM-DD
        try:
            selected_date = datetime.strptime(date, '%Y-%m-%d').date()
        except ValueError:
            selected_date = datetime.strptime(date, '%m/%d/%Y').date()
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid date format. Use MM/DD/YYYY or YYYY-MM-DD.'}), 400

    start_hour = 6
    end_hour = 3  # 3 AM next day
    slot_durations = [30, 60]
    interval_minutes = 30

    all_slots = []
    for duration in slot_durations:
        slots = []
        current_time = datetime.combine(selected_date, datetime.min.time()).replace(hour=start_hour, minute=0)
        last_slot_start = current_time + timedelta(days=1, hours=end_hour - start_hour) - timedelta(minutes=duration)
        while current_time <= last_slot_start:
            slot_start = current_time
            slot_end = slot_start + timedelta(minutes=duration)
            if slot_end.date() > selected_date + timedelta(days=1) or (slot_end.date() == selected_date + timedelta(days=1) and slot_end.hour > end_hour):
                break
            slots.append({'start': slot_start.strftime('%H:%M'), 'end': slot_end.strftime('%H:%M')})
            current_time += timedelta(minutes=interval_minutes)
        all_slots.append({'duration': duration, 'slots': slots})

    # Fetch bookings for the selected date
    conn = get_db()
    cursor = conn.cursor()
    bookings = cursor.execute(
        """
        SELECT start_time, end_time FROM bookings
        WHERE booking_date = ?
        AND status IN ('approved', 'pending')
        """,
        (selected_date.isoformat(),)
    ).fetchall()
    conn.close()

    for duration_group in all_slots:
        for slot in duration_group['slots']:
            slot_start = datetime.strptime(f"{selected_date} {slot['start']}", '%Y-%m-%d %H:%M')
            slot_end = datetime.strptime(f"{selected_date} {slot['end']}", '%Y-%m-%d %H:%M')
            slot['available'] = True
            for booking in bookings:
                booking_start = datetime.strptime(f"{selected_date} {booking['start_time']}", '%Y-%m-%d %H:%M')
                booking_end = datetime.strptime(f"{selected_date} {booking['end_time']}", '%Y-%m-%d %H:%M')
                if slot_start < booking_end and slot_end > booking_start:
                    slot['available'] = False
                    break

    flat_slots = []
    for duration_group in all_slots:
        for slot in duration_group['slots']:
            flat_slots.append({
                'start': slot['start'],
                'end': slot['end'],
                'duration': duration_group['duration'],
                'available': slot['available']
            })
    return jsonify({'success': True, 'slots': flat_slots})

@app.route('/api/slots/available')
def get_available_slots():
    turf_type = request.args.get('turf_type', 'Standard')
    date_str = request.args.get('date')

    if not date_str:
        return jsonify({'success': False, 'message': 'Missing date parameter'}), 400

    try:
        selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400

    start_hour = 6
    end_hour = 3  # next day 3 AM
    max_end_time = datetime.combine(selected_date + timedelta(days=1), datetime.min.time()).replace(hour=end_hour)
    base_time = datetime.combine(selected_date, datetime.min.time()).replace(hour=start_hour)

    slot_durations = [30, 60]
    all_slots = []

    conn = get_db()
    cursor = conn.cursor()

    for duration in slot_durations:
        current_time = base_time

        while current_time + timedelta(minutes=duration) <= max_end_time:
            start_time = current_time.strftime('%H:%M')
            end_time = (current_time + timedelta(minutes=duration)).strftime('%H:%M')

            # Check for overlapping bookings
            cursor.execute("""
                SELECT COUNT(*) FROM bookings
                WHERE turf_type = ? AND booking_date = ? AND
                      ((? < end_time AND ? > start_time)) AND
                      (status = 'approved' OR status = 'pending')
            """, (turf_type, date_str, end_time, start_time))

            existing = cursor.fetchone()[0]
            is_available = existing == 0

            slot = {
                'start': start_time,
                'end': end_time,
                'available': is_available,
                'duration': duration  # 🔥 This helps frontend filter 30 or 60
            }

            all_slots.append(slot)
            current_time += timedelta(minutes=30)  # move in 30-minute steps

    conn.close()

    return jsonify({'success': True, 'slots': all_slots})

@app.route('/api/calendar/bookings/<date>')
@login_required
@admin_required
def get_calendar_bookings(date):
    """API to get bookings for a specific date for calendar view."""
    try:
        # Validate date format
        selected_date = datetime.strptime(date, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT booking_id, user_name, user_email, user_phone, turf_type,
                   start_time, end_time, total_price, status, payment_status, created_at
            FROM bookings 
            WHERE booking_date = ?
            ORDER BY start_time
        """, (date,))
        bookings = cursor.fetchall()
        
        # Convert to dictionaries
        calendar_bookings = [dict(booking) for booking in bookings]
        return jsonify({'success': True, 'bookings': calendar_bookings})
    except Exception as e:
        logger.error(f"Error fetching calendar bookings for {date}: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/calendar/month/<year>/<month>')
@login_required
@admin_required
def get_monthly_bookings(year, month):
    """API to get booking counts for each day in a month for calendar view."""
    try:
        year = int(year)
        month = int(month)
        # Get first and last day of the month
        first_day = datetime(year, month, 1).date()
        if month == 12:
            last_day = datetime(year + 1, 1, 1).date() - timedelta(days=1)
        else:
            last_day = datetime(year, month + 1, 1).date() - timedelta(days=1)
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid year or month'}), 400
    
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT booking_date, COUNT(*) as count,
                   SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                   SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                   SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM bookings 
            WHERE booking_date BETWEEN ? AND ?
            GROUP BY booking_date
            ORDER BY booking_date
        """, (first_day.isoformat(), last_day.isoformat()))
        results = cursor.fetchall()
        
        # Convert to dictionaries
        monthly_data = [dict(row) for row in results]
        return jsonify({'success': True, 'data': monthly_data})
    except Exception as e:
        logger.error(f"Error fetching monthly bookings for {year}-{month}: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/reports/stats')
@login_required
@admin_required
def get_reports_stats():
    """API to get overall statistics for reports dashboard."""
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get overall stats
        cursor.execute("SELECT COUNT(*) FROM bookings")
        total_bookings = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM bookings WHERE status = 'approved'")
        approved_bookings = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM bookings WHERE status = 'pending'")
        pending_bookings = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM bookings WHERE status = 'cancelled'")
        cancelled_bookings = cursor.fetchone()[0]
        
        # Get revenue data
        cursor.execute("SELECT SUM(total_price) FROM bookings WHERE payment_status = 'paid'")
        total_revenue = cursor.fetchone()[0] or 0
        
        stats = {
            'total_bookings': total_bookings,
            'approved_bookings': approved_bookings,
            'pending_bookings': pending_bookings,
            'cancelled_bookings': cancelled_bookings,
            'total_revenue': float(total_revenue)
        }
        
        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        logger.error(f"Error fetching reports stats: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/reports/trend')
@login_required
@admin_required
def get_booking_trend():
    """API to get booking trend data for the last 30 days."""
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get bookings for last 30 days
        thirty_days_ago = (datetime.now() - timedelta(days=30)).date()
        cursor.execute("""
            SELECT booking_date, COUNT(*) as count
            FROM bookings 
            WHERE booking_date >= ?
            GROUP BY booking_date
            ORDER BY booking_date
        """, (thirty_days_ago.isoformat(),))
        results = cursor.fetchall()
        
        # Fill in missing dates with 0 bookings
        trend_data = []
        current_date = thirty_days_ago
        booking_dict = {row['booking_date']: row['count'] for row in results}
        
        for i in range(30):
            date_str = current_date.isoformat()
            trend_data.append({
                'date': date_str,
                'count': booking_dict.get(date_str, 0)
            })
            current_date += timedelta(days=1)
        
        return jsonify({'success': True, 'trend': trend_data})
    except Exception as e:
        logger.error(f"Error fetching booking trend: {e}")
        return jsonify({'success': False, 'message': f'Internal server error: {str(e)}'}), 500
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    app.run(debug='True',port=5000)