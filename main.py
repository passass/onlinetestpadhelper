from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.engine.row import Row
from sqlalchemy import text
from sqlalchemy.sql import quoted_name
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

def is_valid_identifier(name):
    return re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name) is not None

@app.route('/dbcontrol/rpc/<proc_name>', methods=['GET', 'POST'])
def call_procedure(proc_name):
    if not is_valid_identifier(proc_name):
        return jsonify({"error": "Invalid table name"}), 400

    args = request.get_json() if request.method == "POST" else request.args

    if isinstance(args, list):
        placeholders = ', '.join([f':arg{i}' for i in range(len(args))])
        params = {f'arg{i}': val for i, val in enumerate(args)}
    elif isinstance(args, dict):
        placeholders_list = []
        params = {}
        for i, (argname, value) in enumerate(args.items()):
            if not is_valid_identifier(argname):
                return jsonify({"error": "Invalid table name"}), 400
            placeholders_list.append(f'{argname} => :arg{i}')
            params[f"arg{i}"] = value
    
        placeholders = ', '.join(placeholders_list)
    else:
        return jsonify({"error": "Invalid data"}), 400

    sql = f"SELECT * FROM {proc_name}({placeholders})"


    try:
        sql_request = db.session.execute(text(sql), params)
        db.session.commit()
        #columns = result.keys()
        #rows = sql_result.fetchall()#[dict(zip(result.keys(), row)) for row in result.fetchall()]

        sql_result = sql_request.fetchall()

        result = None

        #sql_result_scalar = sql_request.first()
        #if isinstance(sql_result_scalar, dict):
        #    result = sql_result_scalar
        if isinstance(sql_result, Row):
            result = [sql_result._asdict()]
        elif isinstance(sql_result, list) and len(sql_result) > 0 and isinstance(sql_result[0]._tuple()[0], dict):
            result = [row[0] if isinstance(row, Row) else row for row in sql_result]
        else:
            result = [row._asdict() for row in sql_result]

        if result:
            return jsonify(result)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    return jsonify([]), 200

def insert_data(table_name):
    if not is_valid_identifier(table_name):
        return jsonify({"error": "Invalid table name"}), 400
    data = request.get_json()

    if isinstance(data, dict):
        records = [data]
    elif isinstance(data, list):
        records = data
        if not records:
            return jsonify({"error": "Empty list provided"}), 400
    else:
        return jsonify({"error": "Expected JSON object or array of objects"}), 400

    columns = list(records[0].keys())
    columns_sql = ", ".join(columns)
    placeholders = []
    params = {}

    for i, record in enumerate(records):
        param_names = [f"{col}_{i}" for col in columns]
        placeholders.append(f"({', '.join(f':{p}' for p in param_names)})")
        params.update({p: record[col] for p, col in zip(param_names, columns)})

    values_clause = ", ".join(placeholders)
    sql = f"INSERT INTO {table_name} ({columns_sql}) VALUES {values_clause} RETURNING *"

    try:
        result = db.session.execute(text(sql), params)
        inserted_rows = result.fetchall()
        db.session.commit()
        return jsonify(inserted_rows), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

def get_table_data(table_name):
    data = request.args
    if not isinstance(data, dict):
        return jsonify({"error": "Incorrect Data"}), 400
    
    if not is_valid_identifier(table_name):
        return jsonify({"error": "Invalid table name"}), 400


    safe_table = quoted_name(table_name, quote=True)
    if data:
        where_clause = " AND ".join([f"{col} = :{col}" for col in data.keys()])
        sql = f"SELECT * FROM {safe_table} WHERE {where_clause}"
    else:
        sql = f"SELECT * FROM {safe_table}"

    try:
        result = db.session.execute(text(sql), data)
        result_columns = result.keys()
        rows = [dict(zip(result_columns, row)) for row in result.fetchall()]
        return jsonify(rows)
    except Exception as e:
        print(str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/dbcontrol/table/<table_name>', methods=["GET", "POST"])
def db_control(table_name):
    if request.method == "GET":
        return get_table_data(table_name)
    elif request.method == "POST":
        return insert_data(table_name)
    return jsonify({"error": "Not allowed method"}), 405


@app.after_request
def after_request(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
    return response


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)