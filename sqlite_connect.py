from sqlalchemy import event, func
from sqlalchemy.engine import Engine
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

db = SQLAlchemy()

class QuestionType(db.Model):
    __tablename__ = 'question_types'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Text)

class Test(db.Model):
    __tablename__ = 'tests'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Text, unique=True, nullable=False)

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)  # или func.now()

class Question(db.Model):
    __tablename__ = 'questions'
    id = db.Column(db.Integer, primary_key=True)
    question = db.Column(db.Text)
    question_type = db.Column(db.Integer, db.ForeignKey('question_types.id', ondelete='SET NULL'), nullable=True)
    test_id = db.Column(db.Integer, db.ForeignKey('tests.id', ondelete='CASCADE'), nullable=False)

class UserFreeAnswer(db.Model):
    __tablename__ = 'user_free_answers'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id', ondelete='CASCADE'), primary_key=True)
    answer = db.Column(db.Text)

class Answer(db.Model):
    __tablename__ = 'answers'
    id = db.Column(db.Integer, primary_key=True)
    answer = db.Column(db.Text)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id', ondelete='CASCADE'), nullable=False)

class UserAnswer(db.Model):
    __tablename__ = 'user_answers'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id', ondelete='CASCADE'), primary_key=True)
    answer_id = db.Column(db.Integer, db.ForeignKey('answers.id', ondelete='CASCADE'), primary_key=True)

class CorrectAnswer(db.Model):
    __tablename__ = 'correct_answers'
    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id', ondelete='CASCADE'), nullable=False)
    answer_id = db.Column(db.Integer, db.ForeignKey('answers.id', ondelete='CASCADE'), nullable=False)



def connect_to_sqlite(app):
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return db

def record_user_free_answer(user_id: int, question_id: int, answer_text: str):
    existing = UserFreeAnswer.query.filter_by(
        user_id=user_id,
        question_id=question_id
    ).first()

    if existing:
        existing.answer = answer_text
    else:
        new = UserFreeAnswer(user_id=user_id, question_id=question_id, answer=answer_text)
        db.session.add(new)
    
    db.session.commit()

def record_user_selected_answers(user_id: int, question_id: int, answer_ids: list[int]):
    UserAnswer.query.filter_by(user_id=user_id, question_id=question_id).delete()

    if answer_ids:
        for aid in answer_ids:
            db.session.add(UserAnswer(user_id=user_id, question_id=question_id, answer_id=aid))
    
    db.session.commit()

def get_or_create_user(user_id: int | None = None) -> User:
    if user_id is not None:
        user = User.query.get(user_id)
        if user:
            return user
    user = User()
    if user_id is not None:
        user.id = user_id
    db.session.add(user)
    db.session.commit()
    return user

def get_or_create_question_with_answers(test_id: int, question_text: str, question_type: int, answers: list[str]):
    question = Question.query.filter_by(question=question_text).first()
    if question:
        existing_answers = sorted([a.answer for a in Answer.query.filter_by(question_id=question.id).all()])
        if existing_answers == sorted(answers):
            return {
                'question': question.to_dict(),
                'answers': [a.to_dict() for a in Answer.query.filter_by(question_id=question.id).all()],
                'created_something': False
            }

    question = Question(
        question=question_text,
        question_type=question_type,
        test_id=test_id
    )
    db.session.add(question)
    db.session.flush()

    answer_objs = []
    for text in answers:
        ans = Answer(answer=text, question_id=question.id)
        db.session.add(ans)
        answer_objs.append(ans)

    db.session.commit()

    return {
        'question': question.to_dict(),
        'answers': [a.to_dict() for a in answer_objs],
        'created_something': True
    }

from sqlalchemy import func

def get_answers_count(question_id: int):
    result = db.session.query(
        Answer.id,
        func.count(UserAnswer.answer_id).label('answer_count')
    ).join(Answer, Answer.id == UserAnswer.answer_id)\
     .filter(Answer.question_id == question_id)\
     .group_by(Answer.id)\
     .all()
    
    return [{'answer_id': r.id, 'answer_count': r.answer_count} for r in result]

def get_or_create_test(test_name: str) -> Test:
    test = Test.query.filter_by(name=test_name).first()
    if test:
        return test
    test = Test(name=test_name)
    db.session.add(test)
    db.session.commit()
    return test

db_functions = {
    "record_user_free_answer": record_user_free_answer
}