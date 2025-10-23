CREATE TABLE IF NOT EXISTS question_types (
    id SERIAL PRIMARY KEY,
    name TEXT
);
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    question TEXT,
    question_type SERIAL,
    
    FOREIGN KEY (question_type) REFERENCES question_types(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    answer TEXT,
    question_id SERIAL,
    
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    created_at timestamptz DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_answers (
    user_id SERIAL,
    question_id SERIAL,
    answer_id SERIAL,

    PRIMARY KEY (user_id, question_id, answer_id),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE
    
);
CREATE TABLE IF NOT EXISTS correct_answers (
    id SERIAL PRIMARY KEY,
    question_id SERIAL,
    answer_id SERIAL,

    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (answer_id) REFERENCES answers(id)  ON DELETE CASCADE
);


DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM question_types) THEN
        INSERT INTO question_types (name) VALUES (
        'Один выбор'
    ), (
        'Множественный выбор'
    ), (
        'Текстовый ответ'
    );
    END IF;
END $$;




CREATE OR REPLACE FUNCTION record_user_answer(
    p_user_id INTEGER,
    p_question_id INTEGER,
    p_answer_ids INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM user_answers
    WHERE user_id = p_user_id
      AND question_id = p_question_id;

    IF p_answer_ids IS NOT NULL AND array_length(p_answer_ids, 1) > 0 THEN
        INSERT INTO user_answers (user_id, question_id, answer_id)
        SELECT p_user_id, p_question_id, unnest(p_answer_ids);
    END IF;
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
