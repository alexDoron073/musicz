const socket = io();
const rpc = io('http://127.0.0.1:1289', {
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    timeout: 5000
})

rpc.on('connect', () => {
    console.log('connected to rpc')
})

var userdata = {}
var mouseontimeline = false
var lastsearchtimer = -1

const coverObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target

            if (img.dataset.src) {
                img.src = img.dataset.src
                delete img.dataset.src
            }

            obs.unobserve(img)
        }
    })
}, {
    rootMargin: '200px'
})

function tracklist(tracks, count = 0, listname = null, randombtn = false) {
    fragment = document.createDocumentFragment()

    if (listname != null) {
        label = document.createElement('div')
        label.style.marginTop = '10px'
        label.style.marginLeft = '10px'
        label.style.fontSize = '30px'
        label.textContent = listname
        fragment.appendChild(label)
    }
    if (tracks.length > 0) {
        if (randombtn && tracks.length > 1) {
            div = document.createElement('div')
            div.className = 'morebtn'
            div.addEventListener('click', (e) => {
                random(tracks)
            })

            icon = document.createElement('img')
            icon.classList.add('morebtnicon')
            icon.src = 'static/imgs/random.png'
            div.appendChild(icon)

            more = document.createElement('div')
            more.textContent = 'Shuffle'
            div.appendChild(more)


            fragment.appendChild(div)
        }

        len = tracks.length
        if (count && count <= len - 1) len = count
        for (let i = 0; i < len; i++) {
            const element = tracks[i];

            div = document.createElement('div')
            div.className = 'track'
            if (userdata.current_playing && userdata.current_playing.playlist.length > 0 && element.id == userdata.current_playing.playlist[userdata.current_playing.track_index].id) div.classList.add('active-track')
            div.id = element.id.toString()
            div.dataset.id = 'track' + element.id
            div.addEventListener('click', (e) => {
                if (e.srcElement.classList.contains('track-toprev')) opentrackmenu(element)
                else play(tracks, i)
            })

            const img = document.createElement('img')
            img.className = 'track-cover lazy-cover'

            // if (element.track_cover) img.dataset.src = '/trackcover/' + element.id
            img.dataset.src = '/trackcover/' + element.id

            img.src = '/static/imgs/placeholder.png'

            coverObserver.observe(img)

            div.appendChild(img)

            info = document.createElement('div')
            info.className = 'track-info'

            title = document.createElement('div')
            title.className = 'track-title'
            title.textContent = element.title
            info.appendChild(title)

            artist = document.createElement('div')
            artist.className = 'track-artist'
            artist.textContent = element.artist
            info.appendChild(artist)

            div.appendChild(info)

            dur = document.createElement('div')
            dur.className = 'track-dur'
            min = Math.floor(element.duration / 60)
            sec = Math.floor(element.duration % 60).toString().padStart(2, '0')
            dur.textContent = `${min}:${sec}`
            div.appendChild(dur)

            trackmenubtn = document.createElement('div')
            trackmenubtn.className = 'track-toprev'
            div.appendChild(trackmenubtn)

            fragment.appendChild(div)
        }

        if (count > 0) {
            div = document.createElement('div')
            div.className = 'morebtn'
            div.addEventListener('click', (e) => {
                accmenu.classList.add('hide')
                tracklistdiv.innerHTML = ''
                tracklistdiv.appendChild(tracklist(tracks, 0, listname, randombtn))
                tracklistdiv.classList.remove('hide')
                right.classList.add('visible')
                mainpagebtn.style.backgroundImage = "url('/static/imgs/arrow-left.png')"
            })

            icon = document.createElement('img')
            icon.classList.add('morebtnicon')
            icon.src = 'static/imgs/toprev.png'
            div.appendChild(icon)

            more = document.createElement('div')
            more.textContent = 'More'
            div.appendChild(more)

            fragment.appendChild(div)
        }


    } else {
        div = document.createElement('div')
        div.textContent = 'no data('
        fragment.appendChild(div)
    }
    return fragment
}

function togglemaxi() {
    if (playerwindow.classList.toggle('maxi')) {
        document.body.style.overflow = 'hidden'
    }
    else {
        document.body.style.overflow = ''
    }
}

function play(playlist, track_index, autoplay = true, check_same = true) {
    index = track_index
    if (track_index < 0) index = playlist.length - 1
    else if (track_index > playlist.length - 1) index = 0

    track = playlist[index]

    if (check_same && track.id == userdata.current_playing.playlist[userdata.current_playing.track_index].id) {
        togglepause()
        return
    }

    playlist_changed = JSON.stringify(playlist) != JSON.stringify(userdata.current_playing.playlist)

    userdata.current_playing.playlist = JSON.parse(JSON.stringify(playlist))
    userdata.current_playing.track_index = index
    if (userdata.current_playing.playlist.length > 0) playerwindow.classList.remove('hide')

    document.querySelectorAll('.active-track').forEach(div => { div.classList.remove('active-track') })
    document.querySelectorAll('[data-id="track' + track.id + '"]').forEach(div => { div.classList.add('active-track') })

    hls = new Hls()
    hls.loadSource(track.url)
    hls.attachMedia(player)
    timeline.max = track.duration
    if (autoplay) {
        togglepause()
        if (playlist_changed) {
            let current_tracks = []
            userdata.current_playing.playlist.forEach(element => { current_tracks.push(element.id) });
            socket.emit('change_current_playlist', current_tracks)
        }
        socket.emit('change_current_track_index', userdata.current_playing.track_index)
    }

    // cover = track.track_cover
    // if (cover == null) cover = window.location.origin + '/static/imgs/logo.png'
    
    cover = '/trackcover/' + track.id
    songpic.style.backgroundImage = blured.style.backgroundImage = minisongpic.style.backgroundImage = playerwindow.style.backgroundImage = `url(${cover})`

    songname.textContent = minisongname.textContent = track.title
    songartist.textContent = minisongartist.textContent = track.artist

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: "Music Z",
            artwork: [
                { src: cover, sizes: "512x512", type: "image/png" }
            ]
        });

        navigator.mediaSession.setActionHandler('play', togglepause);
        navigator.mediaSession.setActionHandler('pause', togglepause);
        navigator.mediaSession.setActionHandler('previoustrack', playprev);
        navigator.mediaSession.setActionHandler('nexttrack', playnext);
    }

    if (index + 1 < playlist.length && playlist[index + 1].track_cover != null) {
        img = new Image()
        img.src = '/trackcover/' + playlist[index + 1].id
    }
}

function send_tracks() {
    let tracks = []
    userdata.tracks.forEach(element => { tracks.push(element.id) });
    socket.emit('set_tracks', tracks)
    unblack()
}

function opentrackmenu(track, queue = false) {
    black.classList.add('visible')

    trackmenu.innerHTML = ''

    if (queue) {
        q = document.createElement('div')
        q.classList.add('trackmenubtn')
        q.textContent = 'Queue'
        q.addEventListener('click', () => {
            togglemaxi()
            accmenu.classList.add('hide')
            tracklistdiv.innerHTML = ''
            tracklistdiv.appendChild(tracklist(userdata.current_playing.playlist, 0, 'Queue'))
            tracklistdiv.classList.remove('hide')
            right.classList.add('visible')
            mainpagebtn.style.backgroundImage = "url('/static/imgs/arrow-left.png')"
            unblack()
        })
        trackmenu.appendChild(q)
    }

    div = document.createElement('div')
    div.classList.add('trackmenubtn')
    index = userdata.tracks.findIndex(i => i.id === track.id)
    if (index > -1) {
        div.textContent = 'Delete'
        div.addEventListener('click', () => {
            userdata.tracks.splice(index, 1)
            send_tracks()
        })
    } else {
        div.textContent = 'Add'
        div.addEventListener('click', () => {
            userdata.tracks.unshift(track)
            send_tracks()
        })
    }
    trackmenu.appendChild(div)
    document.body.style.overflow = 'hidden'
    trackmenu.classList.add('visible')
}

function openaccmenu() {
    tracklistdiv.classList.add('hide')
    accmenu.classList.remove('hide')

    mainpagebtn.style.backgroundImage = "url('/static/imgs/arrow-left.png')"
    right.classList.add('visible')
}

function unblack() {
    black.classList.remove('visible')
    trackmenu.classList.remove('visible')
    document.body.style.overflow = ''
}


function togglepause() {
    if (player.paused) player.play()
    else player.pause()
}

function playprev() {
    if (player.currentTime < 5) play(userdata.current_playing.playlist, userdata.current_playing.track_index - 1)
    else player.currentTime = 0
}

function playnext() {
    play(userdata.current_playing.playlist, userdata.current_playing.track_index + 1)
}

function setvol(vol) {
    player.volume = volume.value = localStorage.volume = Math.max(0, Math.min(1, vol)).toFixed(2)
}

function mainpage() {
    right.classList.remove('visible')
    mainpagebtn.style.backgroundImage = "url('/static/imgs/placeholder.png')"
}

function random(tracks) {
    if (tracks.length > 0) {
        list = JSON.parse(JSON.stringify(tracks));
        list.sort(() => Math.random() - 0.5);
        play(list, 0)
    }
}

function search(str) {
    clearTimeout(lastsearchtimer)
    if (str != '') {
        xbtn.classList.remove('hide')
        global.classList.add('hide')
        main.classList.add('hide')

        localsearch.innerHTML = globalsearch.innerHTML = ''
        found = []
        userdata.tracks.forEach(element => {
            if (element.title.toLowerCase().includes(str.toLowerCase()) || element.artist.toLowerCase().includes(str.toLowerCase())) found.push(element)
        });
        localsearch.appendChild(tracklist(found, 0, 'Found in your music', true))
        if (localsearch.childElementCount > 0) {
            local.classList.remove('hide')
            cursong = document.getElementById(userdata.current_playing.track_index.toString())
            if (cursong) cursong.classList.add('active-track')
        } else local.classList.add('hide')
        lastsearchtimer = setTimeout(global_search_timer, 1000, str)
    }
    else {
        local.classList.add('hide')
        xbtn.classList.add('hide')
        global.classList.add('hide')
        main.classList.remove('hide')
    }
}

function global_search_timer(str) {
    fetch('search?q=' + str).then(response => { return response.json() }).then(data => {
        if (data.length > 0) {
            globalsearch.appendChild(tracklist(data, 0, 'Global serach', true))
            global.classList.remove('hide')
        }
    })
}

document.addEventListener('DOMContentLoaded', (e) => {
    socket.on('set_tracks', (data) => {
        mymusic.innerHTML = ''
        mymusic.appendChild(tracklist(data, 3, 'Your music', true))
    })

    socket.on('current_playing', (data) => {
        if (player.paused) {
            userdata.current_playing = data
            if (userdata.current_playing.playlist.length > 0) {
                play(userdata.current_playing.playlist, userdata.current_playing.track_index, false, false)
                player.currentTime = userdata.current_playing.time
            }
        }
    })

    fetch('get').then(response => { return response.json() }).then(data => {
        userdata.tracks = data

        document.addEventListener('keydown', (e) => {
            if (e.keyCode == 27) {
                if (playerwindow.classList.contains('maxi')) togglemaxi()
                else if (e.target.id == 'searchinput') {
                    searchinput.blur()
                    if (searchinput.value != '') search(searchinput.value = '')
                } else mainpage()
            } else if (e.target.id != 'searchinput') {
                switch (e.keyCode) {
                    case 32:
                        e.preventDefault()
                        togglepause()
                        break
                    case 37:
                        e.preventDefault()
                        player.currentTime -= 5
                        break
                    case 39:
                        e.preventDefault()
                        player.currentTime += 5
                        break
                    case 70:
                        e.preventDefault()
                        togglemaxi()
                        break
                    case 38:
                        e.preventDefault()
                        setvol(player.volume + 0.05)
                        break
                    case 40:
                        e.preventDefault()
                        setvol(player.volume - 0.05)
                        break
                    case 77:
                        e.preventDefault()
                        mute()
                        break
                }
            }
        })

        searchinput.addEventListener('input', (e) => {
            search(e.srcElement.value)
        })

        player.addEventListener('ended', playnext)
        player.addEventListener('timeupdate', (e) => {
            socket.emit('change_current_time', userdata.current_playing.time)
            userdata.current_playing.time = e.srcElement.currentTime
            if (!mouseontimeline) timeline.value = e.srcElement.currentTime
            curMin = Math.floor(e.srcElement.currentTime / 60)
            curSec = Math.floor(e.srcElement.currentTime % 60).toString().padStart(2, '0')
            curtime.textContent = `${curMin}:${curSec}`

            remaining = Math.max(0, userdata.current_playing.playlist[userdata.current_playing.track_index].duration - e.srcElement.currentTime)
            remMin = Math.floor(remaining / 60)
            remSec = Math.floor(remaining % 60).toString().padStart(2, '0')
            remtime.textContent = `-${remMin}:${remSec}`
        })
        player.addEventListener('pause', (e) => {
            rpc.emit('clear')
            pausebtn.style.backgroundImage = minipausebtn.style.backgroundImage = "url('static/imgs/play.png')"
        })
        player.addEventListener('play', (e) => {
            rpc.emit('rpc', {
                'artist': track.artist,
                'title': track.title,
                'duration': track.duration
            })
            pausebtn.style.backgroundImage = minipausebtn.style.backgroundImage = "url('static/imgs/pause.png')"
        })

        playerwindow.addEventListener('click', (e) => { if (!e.srcElement.classList.contains('nomaxi')) togglemaxi() })
        timeline.value = 0
        timeline.addEventListener('mousedown', (e) => { mouseontimeline = true })
        timeline.addEventListener('mouseup', (e) => { mouseontimeline = false })
        timeline.addEventListener('change', (e) => { player.currentTime = e.srcElement.value })
        volume.addEventListener('input', (e) => { setvol(e.srcElement.value) })
        volume.addEventListener('wheel', (e) => { setvol(parseFloat(e.srcElement.value) + e.deltaY / 10000 * -1) })
        if (localStorage.volume == undefined) {
            localStorage.volume = 0.5
        }
        setvol(localStorage.volume)

        mymusic.appendChild(tracklist(userdata.tracks, 3, 'Your music', true))
        fetch('random').then(response => { return response.json() }).then(data => {
            randsel.appendChild(tracklist(data, 3, 'Random selection'))
        })
    })

})