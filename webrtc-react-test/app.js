import React from "react";
import ReactDom from "react-dom";
import io from "socket.io-client";
import RTC from "./RTCMultiConnection";

class App extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            socket: io.connect(),
            onMessageCallbacks: {},
            room: ''
        };

        this.handleClick = this.handleClick.bind(this);
        this.initRTCMultiConnection = this.initRTCMultiConnection.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
    }

    componentDidMount(){

    }

    initRTCMultiConnection(userid) {

        let that = this;

        console.log("handleClick fired!");
        let connection = new RTCMultiConnection();
        console.log(connection, "THIS IS THE CONNECTION CREATED FROM A USER CLICK!");
        connection.body = this.refs.videos_container;

        connection.channel = connection.sessionid = connection.userid = userid || connection.userid;

        connection.sdpConstraints.mandatory = {
            OfferToReceiveAudio: false,
            OfferToReceiveVideo: true
        };

        // using socket.io for signaling
        connection.openSignalingChannel = function (config) {
            let channel = config.channel || this.channel;
            that.state.onMessageCallbacks[channel] = config.onmessage;
            if (config.onopen) setTimeout(config.onopen, 1000);
            return {
                send: function (message) {
                    that.state.socket.emit('message', {
                        sender: connection.userid,
                        channel: channel,
                        message: message
                    });
                },
                channel: channel
            };
        };
        connection.onMediaError = function (error) {
            alert(JSON.stringify(error));
        };
        return connection;

    }


    handleClick() {

        let that = this;

        let connection = this.initRTCMultiConnection();
        connection.getExternalIceServers = false;

        this.state.socket.on('message', (data)=> {
            if (data.sender === connection.userid) return;
            if (this.state.onMessageCallbacks[data.channel]) {
                this.state.onMessageCallbacks[data.channel](data.message);
            }
        });

        connection.onstream = function(event) {
            connection.body.appendChild(event.mediaElement);

            if (connection.isInitiator == false && !connection.broadcastingConnection) {
                // "connection.broadcastingConnection" global-level object is used
                // instead of using a closure object, i.e. "privateConnection"
                // because sometimes out of browser-specific bugs, browser
                // can emit "onaddstream" event even if remote user didn't attach any stream.
                // such bugs happen often in chrome.
                // "connection.broadcastingConnection" prevents multiple initializations.

                // if current user is broadcast viewer
                // he should create a separate RTCMultiConnection object as well.
                // because node.js server can allot him other viewers for
                // remote-stream-broadcasting.
                connection.broadcastingConnection = that.initRTCMultiConnection(connection.userid);

                // to fix unexpected chrome/firefox bugs out of sendrecv/sendonly/etc. issues.
                connection.broadcastingConnection.onstream = function() {};

                connection.broadcastingConnection.session = connection.session;
                connection.broadcastingConnection.attachStreams.push(event.stream); // broadcast remote stream
                connection.broadcastingConnection.dontCaptureUserMedia = true;

                // forwarder should always use this!
                connection.broadcastingConnection.sdpConstraints.mandatory = {
                    OfferToReceiveVideo: false,
                    OfferToReceiveAudio: false
                };

                connection.broadcastingConnection.open({
                    dontTransmit: true
                });
            }
        };

        var broadcastid = this.refs.broadcast_id.value;

        if (broadcastid.replace(/^\s+|\s+$/g, '').length <= 0) {
            alert('Please enter broadcast-id');
            this.refs.broadcast_id.focus();
            return;
        }

        connection.session = {
            video: this.refs.broadcast_options.value.indexOf('Video') !== -1,
            screen: this.refs.broadcast_options.value.indexOf('Screen') !== -1,
            audio: this.refs.broadcast_options.value.indexOf('Audio') !== -1,
            oneway: true
        };

        this.state.socket.emit('join-broadcast', {
            broadcastid: broadcastid,
            userid: connection.userid,
            typeOfStreams: connection.session
        });

        this.state.socket.on('join-broadcaster', function(broadcaster, typeOfStreams) {
            connection.session = typeOfStreams;
            connection.channel = connection.sessionid = broadcaster.userid;

            connection.sdpConstraints.mandatory = {
                OfferToReceiveVideo: !!connection.session.video,
                OfferToReceiveAudio: !!connection.session.audio
            };

            connection.join({
                sessionid: broadcaster.userid,
                userid: broadcaster.userid,
                extra: {},
                session: connection.session
            });
        });

// this event is emitted when a broadcast is absent.
        this.state.socket.on('start-broadcasting', function(typeOfStreams) {
            // host i.e. sender should always use this!
            connection.sdpConstraints.mandatory = {
                OfferToReceiveVideo: false,
                OfferToReceiveAudio: false
            };
            connection.session = typeOfStreams;
            connection.open({
                dontTransmit: true
            });

            if (connection.broadcastingConnection) {
                // if new person is given the initiation/host/moderation control
                connection.broadcastingConnection.close();
                connection.broadcastingConnection = null;
            }
        });

    }

    handleInputChange(e){
        this.setState({room: e.target.value})
    }

    render() {
        return (
            <div>
                <div ref="videos_container"></div>


                <input onChange={this.handleInputChange} type="text" ref="broadcast_id" placeholder="broadcast-id" value={this.state.room}/>
                <select ref="broadcast_options">
                    <option>Audio+Video</option>
                    <option title="Works only in Firefox.">Audio+Screen</option>
                    <option>Audio</option>
                    <option>Video</option>
                    <option
                        title="Screen capturing requries HTTPs. Please run this demo on HTTPs to make sure it can capture your screens.">
                        Screen
                    </option>
                </select>
                <button id="open-or-join" onClick={this.handleClick}>Open or Join Broadcast</button>
            </div>
        );
    }
}

ReactDom.render(<App />, document.querySelector("#app"));

