from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///local.db').replace("postgres://", "postgresql://")

db = SQLAlchemy(app)

@app.route('/dbcontrol/<table_name>')
def db_control(table_name):
    
    data = request.args

    if data:
        where_clause = " AND ".join([f"{col} = :{col}" for col in data.keys()])
        sql = f"SELECT * FROM {table_name} WHERE {where_clause}"
    else:
        sql = f"SELECT * FROM {table_name}"

    try:
        result = db.session.execute(text(sql), data)
        result_columns = result.keys()
        rows = [dict(zip(result_columns, row)) for row in result.fetchall()]
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)