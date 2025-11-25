import sys
import psycopg2

def get_connection():
    try:
        
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass
        
        conn = psycopg2.connect("postgresql://postgres.drlwwujcacqiwxvyeaqe:Iwue8yxdIBexVkey@aws-1-us-east-1.pooler.supabase.com:5432/postgres")
        
        """conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            port=os.getenv('DB_PORT', '5432'),
            database=os.getenv('DB_NAME', 'postgres'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', 'postgres')
        )"""
        print("✅ Подключено к PostgreSQL")
        return conn
    except Exception as e:
        print(f"❌ Ошибка подключения: {e}", file=sys.stderr)
        sys.exit(1)

def execute_sql(cursor, conn, query):
    """Выполняет SQL-запрос и выводит результат"""
    try:
        cursor.execute(query)
        if cursor.description:  
            rows = cursor.fetchall()
            if rows:
                col_names = [desc[0] for desc in cursor.description]
                print(" | ".join(col_names))
                print("-" * (len(" | ".join(col_names)) or 20))
                for row in rows:
                    print(" | ".join(str(v) if v is not None else "NULL" for v in row))
                print(f"({len(rows)} rows)")
            else:
                print("(0 rows)")
        else:  
            conn.commit()
            print(f"✅ Запрос выполнен. Изменено строк: {cursor.rowcount}")
    except psycopg2.Error as e:
        print(f"❌ Ошибка PostgreSQL: {e}", file=sys.stderr)
        conn.rollback()

def execute_file(cursor, conn, filename):
    """Выполняет SQL-скрипт из файла"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        
        
        
        execute_sql(cursor, conn, sql_content.replace("\n", ""))
        
        print(f"✅ Файл '{filename}' выполнен.")
    except FileNotFoundError:
        print(f"❌ Файл не найден: {filename}")
    except UnicodeDecodeError as e:
        print(f"❌ Ошибка кодировки в файле '{filename}': {e}")
        print("💡 Убедитесь, что файл сохранён в UTF-8 без BOM.")
    except Exception as e:
        print(f"❌ Ошибка при выполнении файла: {e}")

def main():
    conn = get_connection()
    cursor = conn.cursor()

    print("PostgreSQL Shell")
    print("Команды:")
    print("  \\q или exit     — выйти")
    print("  \\h              — помощь")
    print("  \\i <файл>       — выполнить SQL-скрипт из файла")
    print("  Любой SQL-запрос, завершённый ';'")
    print("-" * 50)

    while True:
        try:
            query = ""
            while True:
                line = input("sql> " if not query else "... ")
                query += line + "\n"
                if line.strip().endswith(';') or line.strip() == '':
                    break

            query = query.strip()
            if not query:
                continue

            
            if query.lower() in ('exit', '\\q'):
                break
            if query.lower() == '\\h':
                print("Команды:")
                print("  \\q или exit     — выйти")
                print("  \\h              — эта помощь")
                print("  \\i <файл>       — выполнить SQL-скрипт из файла (например: \\i init.sql)")
                print("  Любой SQL-запрос, завершённый ';'")
                continue

            
            if query.lower().startswith('\\i '):
                parts = query.split(maxsplit=1)
                if len(parts) < 2:
                    print("❌ Укажите имя файла: \\i script.sql")
                else:
                    filename = parts[1].strip()
                    execute_file(cursor, conn, filename)
                continue

            
            execute_sql(cursor, conn, query)

        except KeyboardInterrupt:
            print("\nВыход по Ctrl+C")
            break
        except Exception as e:
            print(f"❌ Ошибка: {e}", file=sys.stderr)

    cursor.close()
    conn.close()
    print("Соединение закрыто.")

if __name__ == '__main__':
    main()