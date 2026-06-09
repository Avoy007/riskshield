from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from datetime import datetime, date
import decimal

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from frontend

# ──────────────────────────────────────────────
#  Database Configuration
#  Update HOST / USER / PASSWORD to match yours
# ──────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "user": "root",          # ← change if needed
    "password": "avoysql",          # ← change if needed
    "database": "riskmanagementdb",
    "port": 3306
}


def get_connection():
    """Create and return a fresh MySQL connection."""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"[DB ERROR] {e}")
        return None


def serialize(obj):
    """Convert non-JSON-serializable types (Decimal, date) to Python natives."""
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def rows_to_json(cursor):
    """Fetch all rows and return as list of dicts."""
    columns = [col[0] for col in cursor.description]
    rows = cursor.fetchall()
    result = []
    for row in rows:
        record = {}
        for col, val in zip(columns, row):
            if isinstance(val, decimal.Decimal):
                val = float(val)
            elif isinstance(val, (datetime, date)):
                val = val.isoformat()
            record[col] = val
        result.append(record)
    return result


# ══════════════════════════════════════════════
#  PAGE ROUTES  (serve HTML templates)
# ══════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/customers")
def customers_page():
    return render_template("customers.html")


@app.route("/accounts")
def accounts_page():
    return render_template("accounts.html")

@app.route("/transactions")
def transactions_page():
    return render_template("transactions.html")


@app.route("/risks")
def risks_page():
    return render_template("risks.html")


@app.route("/add-data")
def add_data_page():
    return render_template("add_data.html")


# ══════════════════════════════════════════════
#  API — DASHBOARD STATS
# ══════════════════════════════════════════════

@app.route("/api/dashboard", methods=["GET"])
def dashboard_stats():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500

    try:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM customer")
        total_customers = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM account")
        total_accounts = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM transaction")
        total_transactions = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM risk")
        total_risks = cursor.fetchone()[0]

        # High-risk alerts
        cursor.execute("""
            SELECT r.risk_id, r.risk_type, r.description,
                   ra.risk_level, ra.probability,
                   c.customer_name, a.account_type
            FROM risk r
            JOIN risk_assessment ra ON r.risk_id = ra.risk_id
            JOIN transaction t      ON r.transaction_id = t.transaction_id
            JOIN account a          ON t.account_id = a.account_id
            JOIN customer c         ON a.customer_id = c.customer_id
            WHERE ra.risk_level = 'High'
            ORDER BY ra.probability DESC
            LIMIT 5
        """)
        high_risk_alerts = rows_to_json(cursor)

        # Recent transactions
        cursor.execute("""
            SELECT t.transaction_id, t.amount, t.transaction_date,
                   c.customer_name, a.account_type
            FROM transaction t
            JOIN account a   ON t.account_id = a.account_id
            JOIN customer c  ON a.customer_id = c.customer_id
            ORDER BY t.transaction_date DESC
            LIMIT 5
        """)
        recent_transactions = rows_to_json(cursor)

        # Risk level distribution
        cursor.execute("""
            SELECT risk_level, COUNT(*) as count
            FROM risk_assessment
            GROUP BY risk_level
        """)
        risk_dist = rows_to_json(cursor)

        return jsonify({
            "total_customers": total_customers,
            "total_accounts": total_accounts,
            "total_transactions": total_transactions,
            "total_risks": total_risks,
            "high_risk_alerts": high_risk_alerts,
            "recent_transactions": recent_transactions,
            "risk_distribution": risk_dist
        })

    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# ══════════════════════════════════════════════
#  API — CUSTOMERS
# ══════════════════════════════════════════════

@app.route("/api/customers", methods=["GET"])
def get_customers():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.customer_id, c.customer_name, c.email, c.phone,
                   COUNT(a.account_id) AS total_accounts,
                   COALESCE(SUM(a.balance), 0) AS total_balance
            FROM customer c
            LEFT JOIN account a ON c.customer_id = a.customer_id
            GROUP BY c.customer_id
            ORDER BY c.customer_id DESC
        """)
        return jsonify(rows_to_json(cursor))
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/add_customer", methods=["POST"])
def add_customer():
    data = request.get_json()
    required = ["customer_name", "email", "phone"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO customer (customer_name, email, phone) VALUES (%s, %s, %s)",
            (data["customer_name"], data["email"], data["phone"])
        )
        conn.commit()
        return jsonify({"message": "Customer added successfully", "id": cursor.lastrowid}), 201
    except Error as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# ══════════════════════════════════════════════
#  API — ACCOUNTS
# ══════════════════════════════════════════════

@app.route("/api/accounts", methods=["GET"])
def get_accounts():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.account_id, a.account_type, a.balance,
                   c.customer_name, c.email,
                   COUNT(t.transaction_id) AS transaction_count
            FROM account a
            JOIN customer c ON a.customer_id = c.customer_id
            LEFT JOIN transaction t ON a.account_id = t.account_id
            GROUP BY a.account_id
            ORDER BY a.account_id DESC
        """)
        return jsonify(rows_to_json(cursor))
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/add_account", methods=["POST"])
def add_account():
    data = request.get_json()
    required = ["customer_id", "account_type", "balance"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO account (customer_id, account_type, balance) VALUES (%s, %s, %s)",
            (data["customer_id"], data["account_type"], data["balance"])
        )
        conn.commit()
        return jsonify({"message": "Account added successfully", "id": cursor.lastrowid}), 201
    except Error as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()
        
        # ══════════════════════════════════════════════
#  API — TRANSACTIONS
# ══════════════════════════════════════════════

@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.transaction_id, t.amount, t.transaction_date,
                   c.customer_name, a.account_type
            FROM transaction t
            JOIN account a ON t.account_id = a.account_id
            JOIN customer c ON a.customer_id = c.customer_id
            ORDER BY t.transaction_date DESC
        """)
        return jsonify(rows_to_json(cursor))
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# ══════════════════════════════════════════════
#  API — RISKS
# ══════════════════════════════════════════════

@app.route("/api/risks", methods=["GET"])
def get_risks():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.risk_id, r.risk_type, r.description,
                   d.department_name,
                   ra.risk_level, ra.probability,
                   
                   t.amount, t.transaction_date,
                   c.customer_name
            FROM risk r
            JOIN department d       ON r.department_id = d.department_id
            JOIN transaction t      ON r.transaction_id = t.transaction_id
            JOIN account a          ON t.account_id = a.account_id
            JOIN customer c         ON a.customer_id = c.customer_id
            LEFT JOIN risk_assessment ra ON r.risk_id = ra.risk_id
            
            ORDER BY
                CASE ra.risk_level
                    WHEN 'High'   THEN 1
                    WHEN 'Medium' THEN 2
                    WHEN 'Low'    THEN 3
                    ELSE 4
                END,
                ra.probability DESC
        """)
        return jsonify(rows_to_json(cursor))
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/add_risk", methods=["POST"])
def add_risk():
    data = request.get_json()
    required = ["transaction_id", "department_id", "risk_type", "description",
                "risk_level", "probability", "action_description"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()

        # Insert into risk
        cursor.execute(
            "INSERT INTO risk (transaction_id, department_id, risk_type, description) VALUES (%s, %s, %s, %s)",
            (data["transaction_id"], data["department_id"], data["risk_type"], data["description"])
        )
        risk_id = cursor.lastrowid

        # Insert risk assessment
        cursor.execute(
            "INSERT INTO risk_assessment (risk_id, risk_level, probability) VALUES (%s, %s, %s)",
            (risk_id, data["risk_level"], data["probability"])
        )

       

        conn.commit()
        return jsonify({"message": "Risk added successfully", "risk_id": risk_id}), 201
    except Error as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# ══════════════════════════════════════════════
#  HELPER APIs — for dropdowns in forms
# ══════════════════════════════════════════════

@app.route("/api/customers/list", methods=["GET"])
def customers_list():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT customer_id, customer_name FROM customer ORDER BY customer_name")
        return jsonify(rows_to_json(cursor))
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/transactions/list", methods=["GET"])
def transactions_list():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT transaction_id, amount, transaction_date FROM transaction ORDER BY transaction_id DESC LIMIT 50")
        return jsonify(rows_to_json(cursor))
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/departments/list", methods=["GET"])
def departments_list():
    conn = get_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT department_id, department_name FROM department ORDER BY department_name")
        return jsonify(rows_to_json(cursor))
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# ══════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════

if __name__ == "__main__":
    app.run(debug=True, port=5000)