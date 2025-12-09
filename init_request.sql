CREATE TABLE IF NOT EXISTS question_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    question_type INTEGER,
    test_id INTEGER,
    
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (question_type) REFERENCES question_types(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_free_answers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    question_id INTEGER,
    answer TEXT NOT NULL,
    user_test_result_id INT,
    answered_at timestamptz DEFAULT NOW(),

    FOREIGN KEY (user_test_result_id) REFERENCES user_test_result(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    answer TEXT NOT NULL,
    question_id INTEGER,
    
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_answers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    question_id INTEGER,
    answer_id INTEGER,
    user_test_result_id INT,
    answered_at timestamptz DEFAULT NOW(),
    
    --FOREIGN KEY (user_test_result_id) REFERENCES user_test_result(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS correct_answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER,
    answer_id INTEGER,

    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (answer_id) REFERENCES answers(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_test_result (
    id SERIAL PRIMARY KEY,
    test_id INTEGER,
    user_id INTEGER,
    result INT,
    created_at timestamptz DEFAULT NOW(),

    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE OR REPLACE FUNCTION record_user_test_result(
    p_test_id INTEGER,
    p_user_id INTEGER,
    p_result INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    test_result_id INTEGER;
BEGIN
    -- Проверяем, есть ли несвязанные ответы (в user_answers ИЛИ user_free_answers) на вопросы из этого теста
    IF EXISTS (
        SELECT 1 FROM user_answers ua
        JOIN questions q ON ua.question_id = q.id
        WHERE q.test_id = p_test_id AND ua.user_test_result_id IS NULL
    ) OR EXISTS (
        SELECT 1 FROM user_free_answers ufa
        JOIN questions q ON ufa.question_id = q.id
        WHERE q.test_id = p_test_id AND ufa.user_test_result_id IS NULL
    ) THEN

        -- Вставляем запись результата теста
        INSERT INTO user_test_result (test_id, user_id, result)
        VALUES (p_test_id, p_user_id, p_result)
        RETURNING id INTO test_result_id;

        -- Обновляем user_answers
        UPDATE user_answers
        SET user_test_result_id = test_result_id
        FROM questions
        WHERE user_answers.question_id = questions.id
          AND questions.test_id = p_test_id
          AND user_answers.user_id = p_user_id
          AND user_answers.user_test_result_id IS NULL;

        -- Обновляем user_free_answers
        UPDATE user_free_answers
        SET user_test_result_id = test_result_id
        FROM questions
        WHERE user_free_answers.question_id = questions.id
          AND questions.test_id = p_test_id
          AND user_free_answers.user_id = p_user_id
          AND user_free_answers.user_test_result_id IS NULL;

    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_best_answer_by_user_answers(
    p_question_id INTEGER
)
RETURNS TABLE(
    answer_id INTEGER,
    answer_text TEXT,
    answered_at TIMESTAMPTZ,
    best_user_id INTEGER,
    best_result INTEGER
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_question_type INTEGER;
BEGIN
    SELECT question_type INTO v_question_type
    FROM questions
    WHERE id = p_question_id;

    IF v_question_type = 3 OR v_question_type = 4 THEN
        RETURN QUERY
        WITH ranked_answers AS (
            SELECT 
                ufa.id AS answer_id,
                ufa.answer AS answer_text,
                ufa.answered_at,
                utr.user_id AS best_user_id,
                utr.result AS best_result,
                DENSE_RANK() OVER (ORDER BY utr.result DESC, ufa.answered_at DESC) as rnk
            FROM user_free_answers ufa
            JOIN user_test_result utr ON ufa.user_test_result_id = utr.id
            WHERE ufa.question_id = p_question_id
        )
        SELECT 
            ra.answer_id,
            ra.answer_text,
            ra.answered_at,
            ra.best_user_id,
            ra.best_result
        FROM ranked_answers ra
        WHERE ra.rnk = 1;
    ELSE
        RETURN QUERY
        WITH ranked_answers AS (
            SELECT 
                a.id AS answer_id,
                a.answer AS answer_text,
                ua.answered_at,
                utr.user_id AS best_user_id,
                utr.result AS best_result,
                DENSE_RANK() OVER (ORDER BY utr.result DESC, ua.answered_at DESC) as rnk
            FROM answers a
            JOIN user_answers ua ON a.id = ua.answer_id
            JOIN user_test_result utr ON ua.user_test_result_id = utr.id
            WHERE ua.question_id = p_question_id
        )
        SELECT 
            ra.answer_id,
            ra.answer_text,
            ra.answered_at,
            ra.best_user_id,
            ra.best_result
        FROM ranked_answers ra
        WHERE ra.rnk = 1;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM question_types) THEN
        INSERT INTO question_types (name) VALUES (
        'Один выбор'
    ), (
        'Множественный выбор'
    ), (
        'Текстовый ответ'
    ), (
        'Слайдер'
    ), (
        'Сопоставление'
    ), (
        'Пропуски'
    ), (
        'Правильная последовательность'
    );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION record_user_answer(
    p_user_id INTEGER,
    p_question_id INTEGER,
    p_answer_text TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_id INTEGER;
BEGIN
    -- Ищем существующую непривязанную запись (user_test_result_id IS NULL)
    SELECT id
    INTO v_existing_id
    FROM user_free_answers
    WHERE user_id = p_user_id
      AND question_id = p_question_id
      AND user_test_result_id IS NULL
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Обновляем существующую "свободную" запись
        UPDATE user_free_answers
        SET answer = p_answer_text,
            answered_at = NOW()
        WHERE id = v_existing_id;
    ELSE
        -- Вставляем новую запись (может быть привязана позже)
        INSERT INTO user_free_answers (user_id, question_id, answer)
        VALUES (p_user_id, p_question_id, p_answer_text);
    END IF;
END;
$$;


CREATE OR REPLACE FUNCTION record_user_answer(
    p_user_id INTEGER,
    p_question_id INTEGER,
    p_answer_ids INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    current_answers INTEGER[];
BEGIN
    SELECT array_agg(answer_id ORDER BY answer_id)
    INTO current_answers
    FROM user_answers
    WHERE user_id = p_user_id
      AND question_id = p_question_id
      AND user_test_result_id IS NULL;

    IF (SELECT array_agg(elem ORDER BY elem) FROM unnest(current_answers) AS elem) IS NOT DISTINCT FROM
       (SELECT array_agg(elem ORDER BY elem) FROM unnest(p_answer_ids) AS elem) THEN
        RETURN;
    END IF;

    DELETE FROM user_answers
    WHERE user_id = p_user_id AND question_id = p_question_id AND
    user_test_result_id IS NULL;

    INSERT INTO user_answers (user_id, question_id, answer_id)
    SELECT p_user_id, p_question_id, unnest(p_answer_ids);
END;
$$;

CREATE OR REPLACE FUNCTION get_or_create_user(p_user_id bigint)
RETURNS SETOF public.users
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.users WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN QUERY
        INSERT INTO public.users
        DEFAULT VALUES
        RETURNING *;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_or_create_user()
RETURNS SETOF public.users
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO public.users
    DEFAULT VALUES
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION get_question_with_answers(
    p_test_id INTEGER,
    p_question_text TEXT, -- формулировка вопроса
    p_question_type INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    result JSONB;
    new_question_data questions;
BEGIN
    SELECT jsonb_build_object(
        'question', row_to_json(q),
        'created_something', false
    ) INTO result
    FROM questions q
    WHERE q.question = p_question_text;
    
    IF result IS NOT NULL THEN
        RETURN COALESCE(result, '{"question": null, "answers": []}'::JSONB);
    END IF;

    
    INSERT INTO questions (question, question_type, test_id)
    VALUES (p_question_text, p_question_type, p_test_id)
    RETURNING * INTO new_question_data;

    RETURN jsonb_build_object(
        'question', row_to_json(new_question_data),
        'created_something', true
    );
END;
$$;


CREATE OR REPLACE FUNCTION get_question_with_answers(
    p_test_id INTEGER,
    p_question_text TEXT, -- формулировка вопроса
    p_question_type INTEGER,
    p_answers TEXT[] -- массив из строк ответов
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    result JSONB;
    new_question_data questions;

    single_answer answers;
    new_answers_data answers[] := '{}';
	answer_text TEXT;
BEGIN
    SELECT jsonb_build_object(
        'question', row_to_json(q),
        'answers', (
            SELECT jsonb_agg(row_to_json(a))
            FROM answers a
            WHERE a.question_id = q.id
        ),
        'created_something', false
    ) INTO result
    FROM questions q
    WHERE q.question = p_question_text AND (
        SELECT ARRAY_AGG(a.answer ORDER BY a.answer)
        FROM answers a
        WHERE a.question_id = q.id
    ) = (
        SELECT ARRAY_AGG(answer ORDER BY answer)
        FROM unnest(p_answers) AS answer
    );
    
    IF result IS NOT NULL THEN
        RETURN COALESCE(result, '{"question": null, "answers": []}'::JSONB);
    END IF;

    
    INSERT INTO questions (question, question_type, test_id)
    VALUES (p_question_text, p_question_type, p_test_id)
    RETURNING * INTO new_question_data;

    FOREACH answer_text IN ARRAY p_answers
    LOOP
        INSERT INTO answers (answer, question_id)
        VALUES (answer_text, new_question_data.id)
        RETURNING * INTO single_answer;
        
        new_answers_data := array_append(new_answers_data, single_answer);
    END LOOP;

    RETURN jsonb_build_object(
        'question', row_to_json(new_question_data),
        'answers', (
            SELECT jsonb_agg(row_to_json(a))
            FROM unnest(new_answers_data) a
        ),
        'created_something', true
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_answers_count(
    p_question_id INTEGER
)
RETURNS TABLE(
    answer_id INTEGER,
    answer_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id, 
        COUNT(ua.answer_id) AS answer_count
    FROM answers a
    JOIN questions q ON a.question_id = q.id
    LEFT JOIN user_answers ua ON a.id = ua.answer_id
    WHERE q.id = p_question_id
    GROUP BY a.id;
END;
$$;

CREATE OR REPLACE FUNCTION get_free_answers_count(
    p_question_id INTEGER
)
RETURNS TABLE(
    answer_text TEXT,
    answer_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ufa.answer AS "answer_text", 
        COUNT(ufa.answer) AS "answer_count"
    FROM user_free_answers ufa
    JOIN questions q ON ufa.question_id = q.id
    WHERE q.id = p_question_id
    GROUP BY ufa.answer;
END;
$$;

CREATE OR REPLACE FUNCTION get_test(p_test_name TEXT)
RETURNS SETOF tests
LANGUAGE plpgsql
AS $$
DECLARE
    existing_id INTEGER;
BEGIN
    SELECT t.id INTO existing_id
    FROM tests t
    WHERE t.name = p_test_name;
    
    IF existing_id IS NULL THEN
        RETURN QUERY
        INSERT INTO tests (name)
        VALUES (p_test_name)
        RETURNING *;
    ELSE
        RETURN QUERY
        SELECT *
        FROM tests t
        WHERE t.id = existing_id;
    END IF;
END;
$$;