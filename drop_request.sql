DROP FUNCTION IF EXISTS record_user_answer(
    p_user_id INTEGER,
    p_question_id INTEGER,
    p_answer_ids INTEGER[]
);
DROP FUNCTION IF EXISTS get_or_create_user(p_user_id bigint);
DROP FUNCTION IF EXISTS get_or_create_user();

DROP TABLE IF EXISTS correct_answers;
DROP TABLE IF EXISTS user_answers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS question_types;
