// `server` is defined in config.js, which the manifest loads before this file.

$(document).ready(function () {
    var token = $("#token");
    var username = $("#username");
    var submit = $("#done");
    var result = $("#result");

    chrome.storage.sync.get(['token', 'username'], function (v) {
        token.val(v['token'].toString());
        username.val(v['username']);
    })

    $(submit).on('click', function (e) {
        // console.log(token.val());
        chrome.storage.sync.get(['token'], function (v) {
            chrome.storage.sync.set({
                'token': token.val(),
                'username': username.val()
            });
        })
        $.ajax({
            url: server + "claim_token",
            method: "POST",
            data: JSON.stringify({
                token: token.val(),
                username: username.val()
            }),
            contentType: 'application/json',
        }).done(function (response) {
            // console.log('got response:');
            // console.log(response);
            response = JSON.parse(response);
            if (response['valid']) {
                result.text('Token succesfully processed!');
            } else {
                result.text('Invalid token; make sure you entered the right token.');
            }
        }).fail(function (response) {
            console.log("Error reaching CRAFT server:/token")
            console.log(response);
            result.text('Error connecting to CRAFT server. Please check your internet connection and try again.');
        });
    });
});
