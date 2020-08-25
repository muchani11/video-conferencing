var OV;
var session;

var sessionName;	// Name of the video session the user will connect to
var token;			// Token retrieved from OpenVidu Server
var videoEnabled;
var audioEnabled;
var currPublisher;
var user;
var nick;
var mainVideoLocked;
var mediaRecorder;

/* OPENVIDU METHODS */

function joinSession() {
	getToken((token) => {

		// --- 1) Get an OpenVidu object ---

		OV = new OpenVidu();

		// --- 2) Init a session ---

		session = OV.initSession();

		// --- 3) Specify the actions when events take place in the session ---

		// On every new Stream received...
		session.on('streamCreated', (event) => {
			// Subscribe to the Stream to receive it
			// HTML video will be appended to element with 'video-container' id
			var subscriber = session.subscribe(event.stream, 'video-container');

			// When the HTML video has been appended to DOM...
			subscriber.on('videoElementCreated', (event) => {

				// Add a new HTML element for the user's name and nickname over its video
				appendUserData(event.element, subscriber.stream.connection);
				if (subscriber.stream.connection.nickName)
					addParticipant(subscriber.stream.connection.nickName);
				else {
					clientData = JSON.parse(subscriber.stream.connection.data.split('%/%')[0]).clientData;
					addParticipant(clientData);
				}

			});
		});

		session.on('publisherStartSpeaking', (event) => {
			if (!mainVideoLocked)
				displaySpeaker(event.connection.connectionId);
		});

		session.on('signal', (event) => {
			var clientData = JSON.parse(event.from.data.split('%/%')[0]).clientData;
			if (event.type === "signal:screen-sharing") {
				mainVideoLocked = true;
				if (clientData !== nick){
					displaySpeaker(event.from.connectionId);
				}
			}
			else if (event.type === "signal:stop-screen-sharing") {
				mainVideoLocked = false;
			}
			else {
				if (clientData !== nick){
					displayTime();
					if (event.type === "signal:my-private-chat") {
						displayChat(clientData + " (privately)", event.data, true);
					}
					else {
						displayChat(clientData, event.data, false);
					}

				}
			}
		});
		
		// On every Stream destroyed...
		session.on('streamDestroyed', (event) => {
			// Delete the HTML element with the user's name and nickname
			removeUserData(event.stream.connection);
		});

		// --- 4) Connect to the session passing the retrieved token and some more data from
		//        the client (in this case a JSON with the nickname chosen by the user) ---
		
		var nickName = $("#nickName").val();
		nick = nickName;
		session.connect(token, { clientData: nickName })
			.then(() => {

				// --- 5) Set page layout for active call ---

				var userName = $("#user").val();
				user = userName;
				$('#session-title').text(sessionName);
				$('#join').hide();
				$("#chat-popup").hide();
				$('#session').show();

				// Here we check somehow if the user has 'PUBLISHER' role before
				// trying to publish its stream. Even if someone modified the client's code and
				// published the stream, it wouldn't work if the token sent in Session.connect
				// method is not recognized as 'PUBLIHSER' role by OpenVidu Server
				if (isPublisher(userName)) {

					// --- 6) Get your own camera stream ---

					var publisher = OV.initPublisher('video-container', {
						audioSource: undefined, // The source of audio. If undefined default microphone
						videoSource: undefined, // The source of video. If undefined default webcam
						publishAudio: true,  	// Whether you want to start publishing with your audio unmuted or not
						publishVideo: true,  	// Whether you want to start publishing with your video enabled or not
						resolution: '1920x1080',  // The resolution of your video
						frameRate: 30,			// The frame rate of your video
						insertMode: 'APPEND',	// How the video is inserted in the target element 'video-container'
						mirror: false       	// Whether to mirror your local video or not
					});
					audioEnabled = true;
					videoEnabled = true;
					// --- 7) Specify the actions when events take place in our publisher ---

					// When our HTML video has been added to DOM...
					publisher.on('videoElementCreated', (event) => {
						// Init the main video with ours and append our data
						var userData = {
							nickName: nickName,
							userName: userName
						};

						initMainVideo(event.element, userData);
						appendUserData(event.element, userData);
						addParticipant(nickName);
						$(event.element).prop('muted', true); // Mute local video
						$("#video-container").draggable({
							containment: "#main-video"
						});
					});

					// --- 8) Publish your stream ---
					currPublisher = publisher;
					session.publish(publisher);

				} else {
					console.warn('You don\'t have permissions to publish');
					initMainVideoThumbnail(); // Show SUBSCRIBER message in main video
				}
			})
			.catch(error => {
				console.warn('There was an error connecting to the session:', error.code, error.message);
			});
	});

	return false;
}

function displaySpeaker(event) {
	var relSpeaker = event;
	var arr = $(".data-node");
	for (let i = 0; i < arr.length; i++) {
		if (arr[i].getAttribute('id').substring(5) === relSpeaker) {
			var nickName = arr[i].firstChild.innerHTML;
			var userName = arr[i].childNodes[1].innerHTML;
			var userData = {
				nickName: nickName,
				userName: userName
			}
			var videoList = document.getElementsByTagName('video');
			for (let j = 0; j < videoList.length; j++) {
				var thisId = videoList[j].getAttribute('id');
				if (thisId && (thisId.search(relSpeaker) !== -1)) {
					initMainVideo(videoList[j], userData);
					break;
				}
			}
			break;
		}
	}
}

function toggleAudio() {
	audioEnabled = !audioEnabled;
	currPublisher.publishAudio(audioEnabled);
	if ($('#buttonMuteAudio').attr('title') === "Mute Audio"){
		$('#buttonMuteAudio').attr('title', "Unmute Audio");
		$('#buttonMuteAudio').attr('src', "images/mute.png");
	}
	else {
		$('#buttonMuteAudio').attr('title', "Mute Audio");
		$('#buttonMuteAudio').attr('src', "images/unmute.png");
	}
}

function toggleVideo() {
	videoEnabled = !videoEnabled;
	currPublisher.publishVideo(videoEnabled);
	if ($('#buttonMuteVideo').attr('title') === "Turn Off Video"){
		$('#buttonMuteVideo').attr('title', "Turn On Video");
		$('#buttonMuteVideo').attr('src', "images/unvideo.png");
	}
	else {
		$('#buttonMuteVideo').attr('title', "Turn Off Video");
		$('#buttonMuteVideo').attr('src', "images/video.png");
	}
}

function screenShare() {

	currPublisher.once('accessAllowed', (event) => {
		OV.getUserMedia({audioSource: false, videoSource: 'screen'})
		.then(function (media) {
			var track = media.getVideoTracks()[0];
			currPublisher.replaceTrack(track);
			$('#main-video video').get(0).srcObject = media;
			mainVideoLocked = true;
			session.signal({
				data: "",
				to: [],
				type: "screen-sharing"
			});

			media.getVideoTracks()[0].addEventListener('ended', () => {
				mainVideoLocked = false;
				OV.getUserMedia({audioSource: undefined, videoSource: undefined})
				.then(function(media) {
					var track = media.getVideoTracks()[0];
					currPublisher.replaceTrack(track);
					$('#main-video video').get(0).srcObject = media;
					session.signal({
						data: "",
						to: [],
						type: "stop-screen-sharing"
					});
				});
			});
		});
	});
	
}

function handleRecording() {
	if ($('#buttonStartRecording').attr('value') === "Start Recording"){
		$('#buttonStartRecording').attr('value', "Stop Recording");
		// OV.startRecording(session.sessionId, {
		// 	hasAudio: true,
		// 	hasVideo: false
		// })
		// .then(response => recording = response)
		// .catch(error => console.error(error));
		var platform = $('#main-video video').get(0).srcObject;
		var options = { mimeType: "video/webm; codecs=vp9" };
		mediaRecorder = new MediaRecorder(platform, options);
		var recordedChunks = [];
		console.log(mediaRecorder.state + " for " + '2' + " seconds...");
		mediaRecorder.start();
		mediaRecorder.ondataavailable = function(event) {
			handleDataAvailable(event, recordedChunks);
		}
	}
	else {
		$('#buttonStartRecording').attr('value', "Start Recording");
		console.log("Stopping");
		mediaRecorder.stop();
	}
}


function handleDataAvailable(event, recordedChunks) {
	console.log("data-available");
	if (event.data.size > 0) {
	  recordedChunks.push(event.data);
	  console.log(recordedChunks);
	  download(recordedChunks);
	} else {
	  // ...
	}
}

function download(recordedChunks) {
	var blob = new Blob(recordedChunks, {
	  type: "video/webm"
	});
	var url = URL.createObjectURL(blob);
	var a = document.createElement("a");
	document.body.appendChild(a);
	a.style = "display: none";
	a.href = url;
	a.download = "test.webm";
	a.click();
	window.URL.revokeObjectURL(url);
  }

function leaveSession() {
	// --- 9) Leave the session by calling 'disconnect' method over the Session object ---

	session.disconnect();
	session = null;

	// Removing all HTML elements with the user's nicknames
	cleanSessionView();

	$('#join').show();
	$('#session').hide();
}

/* OPENVIDU METHODS */



/* APPLICATION REST METHODS */

function logIn() {
	var user = $("#user").val(); // Username
	var pass = $("#pass").val(); // Password
	console.log(user, pass);
	httpPostRequest(
		'/api-login/login',
		{user: user, pass: pass},
		'Login WRONG',
		(response) => {
			$("#name-user").text(user);
			$("#not-logged").hide();
			$("#logged").show();
			// Random nickName and session
			$("#sessionName").val("Session " + Math.floor(Math.random() * 10));
			$("#nickName").val("Participant " + Math.floor(Math.random() * 100));
		}
	);
}

function logOut() {
	httpPostRequest(
		'api-login/logout',
		{},
		'Logout WRONG',
		(response) => {
			$("#not-logged").show();
			$("#logged").hide();
		}
	);
}

function getToken(callback) {
	sessionName = $("#sessionName").val(); // Video-call chosen by the user

	httpPostRequest(
		'api-sessions/get-token',
		{sessionName: sessionName},
		'Request of TOKEN gone WRONG:',
		(response) => {
			token = response[0]; // Get token from response
			console.warn('Request of TOKEN gone WELL (TOKEN:' + token + ')');
			callback(token); // Continue the join operation
		}
	);
}

function removeUser() {
	httpPostRequest(
		'api-sessions/remove-user',
		{sessionName: sessionName, token: token},
		'User couldn\'t be removed from session', 
		(response) => {
			console.warn("You have been removed from session " + sessionName);
		}
	);
}

function httpPostRequest(url, body, errorMsg, callback) {
	var http = new XMLHttpRequest();
	http.open('POST', url, true);
	http.setRequestHeader('Content-type', 'application/json');
	http.addEventListener('readystatechange', processRequest, false);
	http.send(JSON.stringify(body));

	function processRequest() {
		if (http.readyState == 4) {
			if (http.status == 200) {
				try {
					callback(JSON.parse(http.responseText));
				} catch (e) {
					callback();
				}
			} else {
				console.warn(errorMsg);
				console.warn(http.responseText);
			}
		}
	}
}

function httpGetRequest(url, body, errorMsg, callback) {
	var http = new XMLHttpRequest();
	http.open('GET', url, true);
	http.setRequestHeader('Content-type', 'application/json');
	http.addEventListener('readystatechange', processRequest, false);
	http.send(JSON.stringify(body));

	function processRequest() {
		if (http.readyState == 4) {
			if (http.status == 200) {
				try {
					callback(JSON.parse(http.responseText));
				} catch (e) {
					callback();
				}
			} else {
				console.warn(errorMsg);
				console.warn(http.responseText);
			}
		}
	}
}

/* APPLICATION REST METHODS */



/* APPLICATION BROWSER METHODS */

window.onbeforeunload = () => { // Gracefully leave session
	if (session) {
		removeUser();
		leaveSession();
	}
	logOut();
}

function appendUserData(videoElement, connection) {
	var clientData;
	var serverData;
	var nodeId;
	if (connection.nickName) { // Appending local video data
		clientData = connection.nickName;
		serverData = connection.userName;
		nodeId = 'main-videodata';
	} else {
		clientData = JSON.parse(connection.data.split('%/%')[0]).clientData;
		serverData = JSON.parse(connection.data.split('%/%')[1]).serverData;
		nodeId = connection.connectionId;
	}
	var dataNode = document.createElement('div');
	dataNode.className = "data-node";
	dataNode.id = "data-" + nodeId;
	dataNode.innerHTML = "<p class='nickName'>" + clientData + "</p><p class='userName'>" + serverData + "</p>";
	videoElement.parentNode.insertBefore(dataNode, videoElement.nextSibling);
	addClickListener(videoElement, clientData, serverData);
}

function removeUserData(connection) {
	removeParticipant(nick);
	var userNameRemoved = $("#data-" + connection.connectionId);
	if ($(userNameRemoved).find('p.userName').html() === $('#main-video p.userName').html()) {
		cleanMainVideo(); // The participant focused in the main video has left
	}
	$("#data-" + connection.connectionId).remove();
}

function removeAllUserData() {
	$(".data-node").remove();
}

function cleanMainVideo() {
	$('#main-video video').get(0).srcObject = null;
	$('#main-video p').each(function () {
		$(this).html('');
	});
}

function addClickListener(videoElement, clientData, serverData) {
	videoElement.addEventListener('dblclick', function () {
		var mainVideo = $('#main-video video').get(0);
		if (mainVideo.srcObject !== videoElement.srcObject) {
			$('#main-video').fadeOut("fast", () => {
				$('#main-video p.nickName').html(clientData);
				$('#main-video p.userName').html(serverData);
				mainVideo.srcObject = videoElement.srcObject;
				$('#main-video').fadeIn("fast");
			});
		}
	});
}

function initMainVideo(videoElement, userData) {
	$('#main-video video').get(0).srcObject = videoElement.srcObject;
	$('#main-video p.nickName').html(userData.nickName);
	$('#main-video p.userName').html(userData.userName);	
	$('#main-video video').prop('muted', true);
}

function initMainVideoThumbnail() {
	$('#main-video video').css("background", "url('images/subscriber-msg.jpg') round");
}

function isPublisher(userName) {
	return userName.includes('publisher');
}

function cleanSessionView() {
	removeAllUserData();
	cleanMainVideo();
	$('#main-video video').css("background", "");
}

/* APPLICATION BROWSER METHODS */

function openForm() {
	document.getElementById("myForm").style.display = "block";
	$("#myForm").draggable().resizable();
  }
  
function closeForm() {
	document.getElementById("myForm").style.display = "none";
  }

function openParticipants() {
	document.getElementById("participant-box").style.display = "block";
	$("#participant-box").draggable().resizable();
}

function closeParticipants() {
	document.getElementById("participant-box").style.display = "none";
}

function addParticipant(name) {
	var participants = document.getElementById("participant-box");
	var newName = document.createElement("p");
	newName.innerHTML = name;
	participants.appendChild(newName);
	var newOption = document.createElement("option");
	newOption.setAttribute("value", name);
	newOption.innerHTML = name;
	document.getElementById("list-participants").appendChild(newOption);
}

function removeParticipant(name) {
	var participants = document.getElementById("participant-box").children;
	for (let i = 0; i < participants.length; i++) {
		if (participants[i].innerHTML === name) {
			document.getElementById("participant-box").removeChild(participants[i]);
			var options = document.getElementById("list-participants").children;
			for (let j = 0; j < options.length; j++) {
				if (options[j].innerHTML === name) {
					document.getElementById("list-participants").removeChild(options[j]);
					return;
				}
			}
		}
	}
}

function sendChat() {
	var message = $("#chat-message").val();
	if (event.keyCode === 13 && message.replace(/\s/g, '').length === 0) {
		event.preventDefault();
		return;
	}
	if (event.keyCode !== 13) {
		return;
	}
	if (event.shiftKey && event.keyCode === 13) {
		return;
	}
	else event.preventDefault();
	displayTime();
	document.getElementById("chat-message").value = "";
	var receiver = document.getElementById("list-participants");
	var option = receiver.options[receiver.selectedIndex].text;
	if (option !== "Everyone") {
		console.log(session);
		httpGetRequest(
			'api/sessions/' + session.sessionId,
			{sessionId: session.sessionId},
			'Couldn\'t find sessions',
			(response) => {
				var relConn;
				for (let i = 0; i < response.length; i++) {
					var name = JSON.parse(response[i].clientData).clientData;
					if (name === option){
						console.log(name);
						relConn = response[i];
						break;
					}
				}
				displayChat("Me (to " + option + ")", message, true);
				session.signal({
					data: message,
					to: [relConn],
					type: "my-private-chat"
				})
				.then(() => {
					console.log('Private message successfully sent');
				})
				.catch(error => {
					console.error(error);
				});
			}
		);
		return;
	}
	displayChat("Me", message, false);
	session.signal({
		data: message,  			// Any string (optional)
		to: [],                     // Array of Connection objects (optional. Broadcast to everyone if empty)
		type: 'my-chat'             // The type of message (optional)
	  })
	  .then(() => {
		  console.log('Message successfully sent');
	  })
	  .catch(error => {
		  console.error(error);
	  });
}

function displayChat(user, message, extraLine) {
	var sender = document.createElement("b");
	sender.innerHTML = user + ": ";
	var newLine = document.createElement('br');
	document.getElementById("chat-box").appendChild(sender);

	if (extraLine){
		document.getElementById("chat-box").appendChild(newLine);
	}

	var display = document.createTextNode(message);
	var anotherLine = document.createElement('br');
	document.getElementById("chat-box").appendChild(display);
	document.getElementById("chat-box").appendChild(anotherLine);
	var objDiv = document.getElementById("chat-box");
	objDiv.scrollTop = objDiv.scrollHeight;
}

function displayTime() {
	var d = new Date();
	var time;
	if (d.getHours() > 12) {
		time = (d.getHours() - 12) + ":";
		if (d.getMinutes() < 10)
			time += "0" + d.getMinutes() + " PM";
		else time += d.getMinutes() + " PM";
	}
	else if (d.getHours() === 0) { 
		time = "12:";
		if (d.getMinutes() < 10)
			time += "0" + d.getMinutes() + " AM";
		else time += d.getMinutes() + " AM";
	}
	else {
		time = d.getHours() + ":";
		if (d.getMinutes() < 10)
			time += "0" + d.getMinutes() + " AM";
		else time += d.getMinutes() + " AM";
	}
	
	var span = document.createElement("span");
	span.innerHTML = time;
	document.getElementById("chat-box").appendChild(span);
}