
/// <reference path="../references.ts" />

import MIDIMessageEvent = WebMidi.MIDIMessageEvent;
var Ns: any = Ns || {};
Ns.Compose = Ns.Compose || {};

// this function bounds some events: midi/mouse/keyboard to the
// SheetMusicPainter in other words, it allows to write the sheet music

Ns.Compose.Handler = function(painter: IPainter, configCont: HTMLDivElement)
{
    var lastChordOn = 0;
    var synth = Ns.Synths.Fluid(new AudioContext(), 'http://shmidusic.lv/out/sf2parsed/fluid/');
    var player = Util.Player($(''));

    var control = painter.getControl();
    var playback = false;
    var playbackFinished = function()
    {
        player.stop();
        painter.setIsPlaying(false);
        playback = false;
    };

    player.addNoteHandler({
        handleNoteOn: (n: IShNote, i: number) => [
            synth.playNote(n.tune, n.channel),
            painter.handleNoteOn(n, i),
        ].reduce((offs,off) => () => { offs(); off(); })
    });

    // well... i suppose something is wrong
    var oneShotPlayer = Util.Player($(''));
    oneShotPlayer.addNoteHandler({
        handleNoteOn: (n: IShNote, i: number) => synth.playNote(n.tune, n.channel)
    });

    var playNotes = (noteList: IShNote[]) => {
        oneShotPlayer.stop();
        oneShotPlayer.playChord({ noteList: noteList });
    };

    var tabActive = true;
    window.onfocus = () => tabActive = true;
    window.onblur = () => tabActive = false;

    var handleNoteOn = function(semitone: number, receivedTime: number)
    {
        if (!tabActive) {
            return;
        }

        var note = {
            tune: semitone,
            channel: 0,
            length: 0.25
        };

        if (!playback) {
            if (receivedTime - lastChordOn < 100) {
                painter.getControl().addNote(note, false);
            } else {
                painter.getControl().addNote(note, true);
                lastChordOn = receivedTime;
            }
        } else {
            playbackFinished();
        }
    };

    var makeChannelSpan = function(chan: IChannel): HTMLSpanElement
    {
        var $select = $('<select></select>');

        Kl.instrumentNames.forEach((d,i) =>
            $select.append($('<option></option>').val(i).html(i + ': ' + d)));
        $select.val(chan.instrument);

        var onchange = () => synth.consumeConfig({[chan.channelNumber]: $select.val()});
        onchange();

        return $('<span></span>').attr('data-channel', chan.channelNumber)
            .append(chan.channelNumber + '')
            .append($select.change(onchange))
            [0];
    };

    var collectChannelList = () => $(configCont).find('.channelListTable span').toArray()
        .map(c => 1 && {
            channelNumber: +$(c).attr('data-channel'),
            instrument: +$(c).find('select').val() || 0
        });

    var collectConfig = () => 1 && {
        tempo: $(configCont).find('.holder.tempo').val(),
        channelList: collectChannelList(),
        loopStart: $(configCont).find('.holder.loopStart').val(),
        loopTimes: $(configCont).find('.holder.loopTimes').val(),
    };

    var collectSong = (chords: IShmidusicChord[]): IShmidusicStructure => 1 && {
        staffList: [{
            staffConfig: collectConfig(),
            chordList: chords
        }]
    };

    var play = function(): void
    {
        playback = true;

        var shmidusic = collectSong(painter.getChordList());
        var adapted = Shmidusicator.generalizeShmidusic(shmidusic);

        var index = Math.max(0, painter.getControl().getFocusIndex());
        player.playSheetMusic(adapted, {}, playbackFinished, index);
        painter.setIsPlaying(true);
    };

    // TODO reset to default before opening. some legacy songs do not have loopTimes/Start
    var openSong = function(base64Song: string): void
    {
        var jsonSong = atob(base64Song);
        try {
            var parsed = JSON.parse(jsonSong);
        } catch (err) {
            alert('Your file is not JSON! ' + err.message);
            return;
        }

        var song: IShmidusicStructure;
        if (song = Ns.Reflect().validateShmidusic(parsed)) {

            painter.getControl().clear();

            song.staffList
                .forEach(s => {
                    var config: {[k: string]: any} = s.staffConfig;
                    Kl.for(config, (k, v) =>
                        $(configCont).find('> .holder.' + k).val(v));

                    var $channelCont = $(configCont).find('.channelListTable').empty();
                    s.staffConfig.channelList
                        .map(makeChannelSpan)
                        .forEach(el => $channelCont.append(el));

                    s.chordList
                        .forEach(painter.getControl().addChord)
                });
        } else {
            alert('Your file is valid josn, but not valid Shmidusic!');
        }
    };

    // separating to focused and global to
    // prevent conflicts with inputs, etc...
    var globalHandlers: { [code: number]: { (e?: KeyboardEvent): void } } = {
        // "o"
        79: (e: KeyboardEvent) => e.ctrlKey && Ns.selectFileFromDisc(openSong),
        // "s"
        83: (e: KeyboardEvent) => e.ctrlKey && Ns.saveToDisc(JSON.stringify(collectSong(painter.getChordList()))),
    };

    var focusedHandlers: { [code: number]: { (e?: KeyboardEvent): void } } = {
        // space
        32: play,
        // left arrow
        37: () => {
            control.moveChordFocus(-1);
            playNotes(painter.getFocusedNotes());
        },
        // right arrow
        39: () => {
            control.moveChordFocus(+1);
            playNotes(painter.getFocusedNotes());
        },
        // down arrow
        40: () => {
            control.moveChordFocusRow(+1);
            playNotes(painter.getFocusedNotes());
        },
        // up arrow
        38: () => {
            control.moveChordFocusRow(-1);
            playNotes(painter.getFocusedNotes());
        },
        // home
        36: () => control.setChordFocus(-1),
        // end
        35: () => control.setChordFocus(99999999999), // backoffice style!
        // shift
        16: () => playNotes(control.pointNextNote()),
        // opening square bracket
        219: () => control.multiplyLength(0.5),
        // closing square bracket
        221: () => control.multiplyLength(2),
        // dot
        190: () => control.multiplyLength(1.5),
        // comma
        188: () => control.multiplyLength(2/3),
        // enter
        13: () => playNotes(painter.getFocusedNotes()),
        // pause
        19: () => painter.getControl().addNote({tune: 0, channel: 9, length: 0.25}, true),
        // delete
        46: () => control.deleteFocused(false),
        // backspace
        8: (e: KeyboardEvent) => {
            e.preventDefault();
            control.deleteFocused(true);
        },
    };

    var hangKeyboardHandlers = (el: HTMLElement) => el.onkeydown = function(keyEvent: KeyboardEvent)
    {
        if (keyEvent.keyCode in focusedHandlers) {
            if (playback) {
                playbackFinished();
            } else {
                focusedHandlers[keyEvent.keyCode](keyEvent);
            }
        } else {
            console.log('Unknown Key Event: ', keyEvent);
        }
    };

    var hangGlobalKeyboardHandlers = () => $('body')[0].onkeydown = function(keyEvent: KeyboardEvent)
    {
        if (keyEvent.keyCode in globalHandlers) {
            keyEvent.preventDefault();
            if (playback) {
                playbackFinished();
            } else {
                globalHandlers[keyEvent.keyCode](keyEvent);
            }
        }
    };

    var handleMidiEvent = function (message: MIDIMessageEvent) {
        var eventType = // bit mask: "100X YYYY" -> x => noteOn: yes/no | YYYY => channelNumber
            (message.data[0] === 144) ? 'noteOn' :
                (message.data[0] === 128) ? 'noteOff' :
                'unknown' + message.data[0];

        var tune = message.data[1];
        var velocity = message.data[2];
        console.log('midi event tune: ' + tune + '; velocity: ' + velocity + '; type: ' + eventType, message);

        if (eventType === 'noteOn' && velocity > 0) {
            handleNoteOn(tune, message.receivedTime);
        }
    };

    var hangMidiHandlers = function(): void
    {
        var gotMidi = function (midiInfo: WebMidi.MIDIAccess)
        {
            var compose = Util.Compose($('#composeDiv')[0]);

            console.log("Midi Access Success!", midiInfo);

            var inputs = midiInfo.inputs.values();
            for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
                input.value.onmidimessage = handleMidiEvent;
            }
        };

        // request MIDI access
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess()
                .then(gotMidi, (e: any) => console.log("Failed To Access Midi, Even Though Your Browser Has The Method...", e));
        } else {
            console.log("No MIDI support in your browser.");
        }

    };

    hangMidiHandlers();

    return {
        hangKeyboardHandlers: hangKeyboardHandlers,
        hangGlobalKeyboardHandlers: hangGlobalKeyboardHandlers,
    };
};