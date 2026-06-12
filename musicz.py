from flask import Flask, render_template, request, redirect, url_for, send_file
from flask_login import LoginManager, login_user, login_required, logout_user, UserMixin, current_user
from flask_socketio import SocketIO
import json
import hashlib
import psycopg2
from psycopg2.extras import Json
import os
import requests
import logging

with open('config.json', encoding='utf-8') as file:
    config = json.load(file)

connection = psycopg2.connect(
    host=config['db']['host'],
    port=config['db']['port'],
    database=config['db']['database'],
    user=config['db']['user'],
    password=config['db']['password']
)

def sha1(input_string):
    sha1_hash = hashlib.sha1()
    sha1_hash.update(input_string.encode('utf-8'))
    return sha1_hash.hexdigest()

def same(str1, str2):
    for i in str1.replace('/', ' ').split():
        if i in str2.split():
            return True
    return False

def genius(q):
    q = q.replace('?', ' ').replace('&', ' ')
    url = f'https://api.genius.com/search?access_token=eL5-8uRpIyf7cO1ifJEnLzIl4O4Zn36i2LssftsuiI4ehF0XNeFNa_v0z7jZ69Vh&q={q}'
    req = requests.get(url)
    try:
        for i in req.json()['response']['hits']:
            if same(q, i['result']['full_title']):
                if 'rapgenius' not in i['result']['song_art_image_url']:
                    return [i['result']['song_art_image_url']]
    except Exception as e:
        print(url)
        print(e)
    return []

def db_to_dictslist(db):
    dicts = []
    for i in db:
        dicts.append({
            'id': i[0],
            'title': i[1],
            'artist': i[2],
            'url': i[3],
            'duration': i[4],
            'track_cover': i[5]
        })
    return dicts

def tracksids_to_trackslist(tracksids):
    with connection.cursor() as cursor:
        cursor.execute('''
                        SELECT u.*
                        FROM unnest(%s::int[]) WITH ORDINALITY AS t(id, ord)
                        JOIN tracks u ON u.id = t.id
                        ORDER BY t.ord;
                        ''', (tracksids, ))
        return db_to_dictslist(cursor.fetchall())

def setUserdataByPath(user_id, path, value):
    with connection.cursor() as cursor:
        cursor.execute(f'UPDATE users SET userdata = jsonb_set(userdata, \'{{{path.replace('.', ',')}}}\', %s) WHERE id = %s', (Json(value), user_id))
        connection.commit()

class User(UserMixin):
    def __init__(self, id, username):
        self.id = id
        self.username = username
    
    def get_id(self):
        return self.id

app = Flask('musicz')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
log = logging.getLogger('werkzeug')
log.disabled = not config['logs']
app.secret_key = 'hFeujHNLhbtg'
socketio = SocketIO(app, cors_allowed_origins="*")

login_manager = LoginManager()
login_manager.init_app(app)

@login_manager.user_loader
def load_user(id):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM users WHERE id = %s', (id, ))
            user = cursor.fetchone()
        if user:
            return User(user[0], user[1])
    except Exception as e:
        connection.rollback()
        return None

clients = {}

@app.route('/')
def home():
    if current_user.is_authenticated:
        return render_template('index.html')
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM users WHERE username = %s', (username, ))
            user = cursor.fetchone()
        if user != None and user[2] == sha1(password):
            login_user(User(user[0], user[1]), remember=True)
            return redirect(url_for('home'))
        return 'Неверный логин или пароль'
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/reg', methods=['GET', 'POST'])
def reg():
    if request.method == 'POST':
        username = request.get_json()['username']
        password = request.get_json()['password']
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM users WHERE username = %s', (username, ))
            exists = cursor.fetchone()
            if exists == None and len(username) > 4 and password != '':
                cursor.execute('INSERT INTO users (username, password) VALUES (%s, %s) RETURNING id', (username, sha1(password)))
                id = cursor.fetchone()[0]
                connection.commit()
                login_user(User(id, username), remember=True)
                return {'msg': 'ok'}
            return {'msg': 'not ok'}
    return render_template('reg.html')

@app.route('/search')
@login_required
def search():
    if 'q' in request.args:
        pattern = f'%{request.args['q']}%'

        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM tracks WHERE title ILIKE %s OR artist ILIKE %s ORDER BY id DESC', (pattern, pattern))
            return db_to_dictslist(cursor.fetchall())
    return 'no q('

@app.route('/get')
@login_required
def user():
    if current_user.is_authenticated:
        userid = current_user.id
    elif 'id' in request.args:
        userid = request.args['id']
    else:
        return 'no user('
    with connection.cursor() as cursor:
        cursor.execute('SELECT * FROM users WHERE id = %s', (userid, ))
        user = cursor.fetchone()
    if user != None:
        return tracksids_to_trackslist(user[3]['tracks'])
    return 'user not found', 404

@app.route('/trackcover/<id>')
def trackcover(id):
    file_path = f'trackcovers/{id}.png'

    if os.path.exists(file_path):
        return send_file(file_path)
    else:
        return send_file('static/imgs/logo.png')

@app.route('/random')
@login_required
def random():
    with connection.cursor() as cursor:
        cursor.execute('SELECT * FROM tracks ORDER BY RANDOM() LIMIT 100')
        return db_to_dictslist(cursor.fetchall())

# @app.route('/download')
# @login_required
# def download():
#     filename = request.args.get('filename')
#     if filename:
#         if filename in os.listdir('download'):
#             return send_file('download/' + filename, as_attachment=True)
#         return 'no file('
#     with open('download/files.json', encoding='utf-8') as file:
#         s = json.load(file)
#     html = ''
#     for i in s:
#         html += f'<a href="/download?filename={i}">{i}</a> - {s[i]}<br>\n'

#     return html

@app.route('/favicon.ico')
def fav():
    return send_file('favicon.png')

@socketio.on('connect')
def on_connect():
    if current_user.is_authenticated:
        clients.setdefault(current_user.id, []).append(request.sid)
        with connection.cursor() as cursor:
            cursor.execute('SELECT userdata FROM users WHERE id = %s', (current_user.id, ))
            current_playing = cursor.fetchone()[0]['current_playing']
            current_playing['playlist'] = tracksids_to_trackslist(current_playing['playlist'])
            socketio.emit('current_playing', current_playing)

@socketio.on('disconnect')
def on_disconnect():
    if current_user.is_authenticated:
        clients.setdefault(current_user.id, []).remove(request.sid)

@socketio.on('change_current_playlist')
def changeplaylist(data):
    setUserdataByPath(current_user.id, 'current_playing.playlist', data)

@socketio.on('change_current_track_index')
def changetrackindex(data):
    setUserdataByPath(current_user.id, 'current_playing.track_index', data)

@socketio.on('change_current_time')
def changetime(data):
    setUserdataByPath(current_user.id, 'current_playing.time', data)

@socketio.on('set_tracks')
def changetracks(data):
    setUserdataByPath(current_user.id, 'tracks', data)
    for i in clients[current_user.id]:
        socketio.emit('set_tracks', tracksids_to_trackslist(data), room=i)

socketio.run(app, '0.0.0.0', config['port'], debug=config['debug'])