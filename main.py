from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
import os
import re

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///local.db').replace("postgres://", "postgresql://")

db = SQLAlchemy(app)

@app.route('/dbcontrol/rpc/<proc_name>', methods=['POST'])
def call_procedure(proc_name):

    args = request.get_json()

    placeholders = ', '.join([f':arg{i}' for i in range(len(args))])

    sql = f"SELECT * FROM {proc_name}({placeholders})"

    params = {f'arg{i}': val for i, val in enumerate(args)}

    try:
        result = db.session.execute(text(sql), params)
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/dbcontrol/table/<table_name>')
def db_control(table_name):
    data = request.args
    if not isinstance(data, dict):
        return jsonify({"error": "Incorrect Data"}), 400

    if data:
        where_clause = " AND ".join([f"{col} = :{col}" for col in data.keys()])
        sql = f"SELECT * FROM :table_name WHERE {where_clause}"
    else:
        sql = f"SELECT * FROM :table_name"

    try:
        result = db.session.execute(text(sql), data | {"table_name": table_name})
        result_columns = result.keys()
        rows = [dict(zip(result_columns, row)) for row in result.fetchall()]
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)