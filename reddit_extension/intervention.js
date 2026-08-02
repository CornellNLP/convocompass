// `server` is defined in config.js, which the manifest loads before this file.

// Minimum text length (in characters) for which we think the reply is "real" content that can be scored
const min_length = 2;
// Maximum allowed text length (matches database schema)
const max_length = 2000;

// Threshold above which an absolute change in CRAFT score is considered significant enough to intervene
const score_change_thresh = 0.1;
// Threshold marking the boundary between "somewhat tense" and "tense"
const mid_tension_thresh = 0.71;
// Threshold marking the boundary between "tense" and "very tense"
const high_tension_thresh = 0.89;

// Intervention texts
const context_low = "ConvoCompass will notify you here if it detects anything in the preceding conversation."
const context_mid = "ConvoCompass thinks this discussion is getting somewhat tense - some other discussions that started like this one ended up with comments getting removed.<br/>Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach."
const context_high = "ConvoCompass thinks this discussion is getting tense - some other discussions that started like this one ended up with comments getting removed.<br/>Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach."
const context_very_high = "ConvoCompass thinks this discussion is getting very tense - some other discussions that started like this one ended up with comments getting removed.<br/>Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach."
const reply_change_low = "ConvoCompass thinks this comment might decrease tension in this discussion."
const reply_change_mid = "ConvoCompass will notify you here if it detects anything in your comment draft."
const reply_change_high = "ConvoCompass thinks this comment might increase the tension in this discussion.<br/>Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach."


// Some global book keeping variables to allow multiple simultaneous interactions
// (i.e., drafting multiple comments at once and keeping the interactions correctly seperated)
window.interval = null;
window.last_target = null;
window.craft = {} // reply_id -> {target, interaction_id}

// Global variable to set the name the extension calls itself as displayed to users.
var name = 'ConvoCompass'

$(document).ready(function () {

    // Define what the extension should do when a user submits their comment.
    $(document).on("click", ".save", function (event) {

        // Get the id's and text of the comments in the context
        var parents = $(event.target).parents(".comment").toArray().reverse();
        var bodies = parents.map(function (parent) {
            return {
                id: $(parent).data("fullname"),
                text: $(parent).children(".entry").find(".usertext-body")[0].innerText
            };
        });

        // Get the right info = {target, interaction_id} for this interaction.
        // target is the DOM element for the textarea; must keep track of it manually
        // since it is not what the user clicks on to trigger this event.
        var reply_id = bodies[bodies.length - 1]['id'];
        var info = window.craft[reply_id]
        if (info.target != null && info.interaction_id != null) {
            var content = $(info.target).val();
            var text_target = info.target;
            info.target = null;

            // Wait 2 seconds for the DOM to update with the posted comment, call find_id.
            setTimeout(function () { find_id(bodies, content, event, reply_id, text_target, info); }, 2000);
        }
    });

    // Defnie what the extension should do when a user clicks into a textarea to start drafting their comment.
    $(document).on("focus", "textarea", function (event) {
        if (String($(this).attr('id')).includes('craft-feedback-text'))
            return false;

        var bodies;
        var parents;
        var content;
        var last_content;
        var last_continue_time;
        var is_first_loop = true;

        if (window.last_target != event.target) {
            window.last_target = event.target;
            // Find & build the representation for the context.
            parents = $(event.target).parents(".comment").toArray().reverse();
            bodies = parents.map(function (parent) {
                return {
                    id: $(parent).data("fullname") ? $(parent).data("fullname") : 'removed',
                    text: $(parent).children(".entry").find(".usertext-body")[0].innerText
                };
            });
            // // console.log('bodies is',bodies);
            if (bodies.length == 0) {
                return;
            }

            // Reset the last interval (associated with a different interction) because that interaction
            // can pause being monitored for now. 
            clearInterval(window.interval);
            content = $(event.target).val();
            last_content = content;

            // Keep track of this interaction in the window.craft global.
            var reply_id = bodies[bodies.length - 1].id;
            var info;
            if (reply_id in window.craft) {
                info = window.craft[reply_id];
                continue_(bodies, content, event, info);
            } else {
                info = { target: event.target, interaction_id: null };
                window.craft[reply_id] = info;
                start(bodies, event, reply_id, info);
            }
            last_continue_time = Date.now();

            // Twice per second, check if the content of the draft has changed, thus requiring a score update via continue_,
            // but only call continue a max of once every five seconds
            var loop = function () {
                // If the comment has already been submitted, stop.
                // Slightly hacky fix: there may be a brief moment in the beginning of this interaction where
                // the info object has not been updated with the interaction id. We do not want to confuse this with
                // the comment being submitted, as that could cause an improper early stop. So we will initially
                // use the is_first_loop flag to check if we should overlook a missing interaction id temporarily.
                // The moment we see a valid interaction id while the flag is still enabled, we unset the flag
                // and from that point forward null interaction id's are treated as the comment having been submitted.
                if (info.interaction_id == null && is_first_loop) {
                    return;
                }
                else if (info.interaction_id != null && is_first_loop) {
                    is_first_loop = false;
                }
                else if (info.interaction_id == null) {
                    clearInterval(window.interval);
                    return;
                }
                content = $(event.target).val();
                // Check if a score update is needed
                if (content !== last_content && info.target != null) {
                    // Only run the score update if the draft content is within length constraints and enough time has elapsed
                    if (content.length >= min_length && content.length < max_length) {
                        cur_time = Date.now();
                        if (cur_time - last_continue_time >= 4600) {
                            continue_(bodies, content, event, info);
                            last_content = content;
                            last_continue_time = cur_time;
                        }
                        // If not enough time has elapsed, don't hit the server but let the user know something is happening
                        else {
                            if ($('#reply' + info.interaction_id + '_h').length != 0) {
                                $('#reply' + info.interaction_id + '_h').html(name + ": Reply Summary [<i>Processing...</i>]");
                            }
                        }
                    }
                    // If only the length part of the check failed, make sure we reset the intervention header
                    else {
                        if ($('#reply' + info.interaction_id + '_h').length != 0) {
                            $('#reply' + info.interaction_id + '_h').html(name + ": Reply Summary");
                        }
                    }
                }
                else {
                    // if (content.length < min_length)
                    //	console.log("reply length is too short");
                    // console.log("no action on", info.interaction_id);
                }
            }
            window.interval = setInterval(loop, 500);
        }
    });
});

// Find the id of the comment with text closest (in edit distance) to content,
// then log a /submit.
// We must search for the comment in the DOM because the comment id (which needs to 
// be logged) is not generated until after the comment is posted and the DOM updates. 
// Uses edit distance to because content is markdown text, and the text of the comments
// it is being compared to is *rendered* markdown text so it won't be exactly the same.
function find_id(bodies, content, event, reply_id, text_target, info) {
    var id = null;
    var min_dist = null;
    if ($.contains(document, $(text_target)[0])) {
        // console.log('text still on screen, submitting with id=null');
    }
    else {
        // search all child comments of the parent to my reply to see which is actually our reply
        $('div[id*=' + reply_id + ']').find('div[id*=thing_t1]').each(function () {
            var tmp_id = $(this).attr('id');
            $(this).find('p').each(function () {
                var text = $(this).text();
                if (text != undefined && text != null && text.length > 0) {
                    var dist = get_edit_distance(text, content);
                    if (min_dist == null || dist < min_dist) {
                        id = tmp_id;
                        min_dist = dist;
                    }
                }
            });
        });
    }
    if (id == null)
        info.target = text_target;

    submit(bodies, content, event, id, info);
}

// Score -> color weighting function
function score_color(weight) {
    const g = Math.round(255 - 255 * weight ** 4);
    const b = Math.round(255 - 255 * weight ** 2);
    return `rgb(255, ${g}, ${b})`;
}

// Score change -> color weighting function
function score_change_color(weight) {
    const o = Math.round(255 - 255 * Math.abs(weight));
    if (weight > score_change_thresh)
        return `rgb(255, ${o}, ${o})`;
    else if (weight < -score_change_thresh)
        return `rgb(${o}, 255, ${o})`;
    else
        return 'rgb(255, 255, 255)';
}

// Function to rescale score change based on max potential change from context
function scale_score_change(score_change, context_score) {
    max_change = score_change > 0 ? 1 - context_score : context_score;
    return score_change / max_change;
}

// Start tracking this interaction and get initial craft/toxicity info.
function start(bodies, event, reply_id, info) {
    // console.log('start');
    // try to retrieve the post ID; if this fails, it implies somehow we are not
    // running on Reddit, or the Reddit URL schema is nonstandard for some reason
    url_components = window.location.href.split("comments/");
    if (url_components.length < 2) {
        console.log("Error: URL did not match the expected format! Got URL:" + window.location.href);
        return;
    }
    post_id = url_components[1].substring(0, 6);
    console.log(post_id);
    chrome.storage.sync.get(['token', 'username'], function (v) {
        $.ajax({
            url: server + "start",
            method: "POST",
            data: JSON.stringify({
                existing: bodies,
                url: window.location.href,
                reply_id: reply_id,
                token: v['token'],
                username: v['username']
            }),
            contentType: 'application/json',
        }).done(function (response) {
            // console.log('got response:');
            // console.log(response);
            response = JSON.parse(response);
            info.interaction_id = response['interaction_id'];
            intervention(response, event);
        }).fail(function (response) {
            console.log("Error reaching CRAFT server:/start")
            console.log(response);
        });
    });

}

// Continue tracking this interaction and get initial craft/toxicity info.
function continue_(bodies, content, event, info) {
    // console.log('continue_');
    chrome.storage.sync.get(['token', 'username'], function (v) {
        $.ajax({
            url: server + "continue",
            method: "POST",
            data: JSON.stringify({
                existing: bodies,
                new: content,
                interaction_id: info.interaction_id,
                token: v['token'],
                username: v['username']
            }),
            contentType: 'application/json',
        }).done(function (response) {
            // console.log('got response:');
            // console.log(response);
            response = JSON.parse(response);
            intervention(response, event);
        }).fail(function (response) {
            console.log("Error reaching CRAFT server:/continue")
            console.log(response);
        });
    });
}

// Finish tracking this interaction because the comment was submitted. 
function submit(bodies, content, event, submitted_id, info) {
    // console.log('submit')
    chrome.storage.sync.get(['token', 'username'], function (v) {
        $.ajax({
            url: server + "submit",
            method: "POST",
            data: JSON.stringify({
                existing: bodies,
                new: content,
                interaction_id: info.interaction_id,
                submitted_id: submitted_id,
                token: v['token'],
                username: v['username']
            }),
            contentType: 'application/json',
        }).done(function (response) {
            // console.log('got response:');
            // console.log(response);
        }).fail(function (response) {
            console.log("Error reaching CRAFT server:")
            console.log(response);
        });
        info.interaction_id = null;
    });
}

// Submit user feedback to be logged.
function submit_feedback(interaction_id, text) {
    // console.log('submit_feedback')
    // console.log(text);
    chrome.storage.sync.get(['token', 'username'], function (v) {
        $.ajax({
            url: server + "submit_feedback",
            method: "POST",
            data: JSON.stringify({
                interaction_id: interaction_id,
                token: v['token'],
                username: v['username'],
                text: text
            }),
            contentType: 'application/json',
        }).done(function (response) {
            // console.log('got response:');
            // console.log(response);
        }).fail(function (response) {
            console.log("Error reaching CRAFT server:")
            console.log(response);
        });
    });
}

// Show an information message in the message div associated with id mes_id
function show_message(message, event, mes_id) {
    // console.log('show_message',message)
    if ($('#' + mes_id + '_d').length == 0)
        $('<div id="' + mes_id + '_d" class="craftDisplay"><h4>' + name + ': Notice</h4><p id="' + mes_id + '_p">' + message + '</p></div>').css("height", "100pt").css("width", "100%").css('border', '5px solid blue').insertBefore($(event.target));
    else
        $('#' + mes_id + '_p').html(message);
}

// Perform an intervention on event based on the data in response
function intervention(response, event) {
    // quit immediately if the token has become invalid
    if (response["error"] == "Invalid Token")
        return;

    var i_id = response['interaction_id'];

    // Setting up the feedback button
    var buttons_div = $(event.target).parent().parent().find('.usertext-buttons');
    if (buttons_div.children('#craft-feedback-button_' + i_id).length == 0) {
        var craft_button = $('<button id="craft-feedback-button_' + i_id + '" type="submit">' + name + ': Report Problem</button>').css('float', 'right');
        var feedback_div = $('<div id="craft-feedback-div_' + i_id + '"></div>').append(
            $('<textarea id="craft-feedback-text_' + i_id + '" placeholder="What do you think ' + name + ' is doing wrong?"></textarea>')).append(
                $('<button id="craft-feedback-submit_' + i_id + '" type="submit">Send Feedback</button>').on('click', function (event) {
                    var text = $('#craft-feedback-text_' + i_id + '').val();
                    submit_feedback(i_id, text);
                    $('#craft-feedback-div_' + i_id + '').hide();
                    $('#craft-feedback-button_' + i_id).text('' + name + ': Problem Reported').css('background-color', 'green');
                    return false;
                })).hide();
        craft_button.on('click', function (event) {
            $('#craft-feedback-div_' + i_id).toggle();
            return false;
        });

        buttons_div.append(craft_button);
        buttons_div.append(feedback_div);

    }

    // Setting up the intervention displays
    var rd_id = 'reply' + i_id; // reply display id
    var cd_id = 'context' + i_id; // context display id

    // Add the div for this context intevention if it doesn't exist yet.
    if ($('#' + cd_id + '_d').length == 0 && response['which'] != "control")
        $('<div id="' + cd_id + '_d" class="craftDisplay"><h4>' + name + ': Context Summary</h4><p id="' + cd_id + '_p">When you type a reply ' + name + ' will give you some feedback on your comment.</p></div>').css("height", "100pt").css("width", "100%").css('border', '5px solid blue').insertBefore($(event.target));

    // Add the div for this reply intevention if it doesn't exist yet.
    if ($('#' + rd_id + '_d').length == 0 && response['which'] != "control")
        $('<div id="' + rd_id + '_d" class="craftDisplay"><h4 id="' + rd_id + '_h">' + name + ': Reply Summary</h4><p id="' + rd_id + '_p">When you type a reply ' + name + ' will give you some feedback on your comment.</p></div>').css("height", "100pt").css("width", "100%").css('border', '5px solid blue').insertAfter($(event.target));

    // This will be true if an 'admin' is running the extension in the mode to show numerical scores, for development.
    var show_scores = 'show_scores' in response;

    // Display an additional message to the user if the response has one to show. 
    if ('message' in response)
        show_message(response['message'], event, 'message' + i_id);


    // Deciding which intervention to execute
    var intervention_type = response['which'].substring(0, 5);
    switch (intervention_type) {
        case 'craft':
            if (response['craft_ctx_score'] != null)
                craft_context_intervention(response['craft_ctx_score'], show_scores, event, cd_id);
            if (response['craft_reply_change'] != null && response['craft_reply_score'] != null)
                craft_reply_change_intervention(response['craft_reply_change'], response['craft_reply_score'], show_scores, event, rd_id);
            break;
        case 'toxic':
            if (response['toxic_ctx_score'] != null)
                toxic_context_intervention(response['toxic_ctx_score'], show_scores, event, cd_id);
            if (response['toxic_reply_score'] != null)
                toxic_reply_intervention(response['toxic_reply_score'], show_scores, event, rd_id);
            break;
        default:
            // If we got here without displaying a message, that means we're in passive mode. We will insert a small notice to let the user know.
            if (!('message' in response) && $('#passivenote' + i_id + '_d').length == 0) {
                $('<div id="passivenote' + i_id + '_d" class="passiveModeDisplay"><p id="passivenote' + i_id + '_p">ConvoCompass is currently not active on this thread.</p></div>').css("height", "30pt").css("width", "100%").css("border", "2px solid blue").insertBefore($(event.target));
            }
            break;
    }

}

// Finish a craft reply intervention in display box indexed with display_id
function craft_reply_intervention(score, show_scores, event, display_id) {
    var text = show_scores ? "Craft score after your comment: " + score.toFixed(4) + "<br>" : "";
    var bg_color = 'rgb(255, 255, 255)';
    if (score > .55) {
        text += "It seems like this conversation is getting tense, and some other conversations that started like this one ended up with some comments getting removed. You will be most likely to have a productive conversation with a civil, respectful, and open approach.";
    }
    else {
        text += 'Nothing to report on this conversation.';
        bg_color = score_color(score);
    }

    $(event.target)[0].style.setProperty("background-image", "none");
    $(event.target)[0].style.setProperty("background-color", bg_color, "important");

    $('#' + display_id + '_d').css("background-image", "none");
    $('#' + display_id + '_d').css("background-color", bg_color, "important");
    $('#' + display_id + '_p').html(text);
}

// Finish a craft reply change intervention in display box indexed with display_id
function craft_reply_change_intervention(score_change, raw_score, show_scores, event, display_id) {
    var text = show_scores ? "Change in craft score after your comment: " + score_change.toFixed(4) + "<br>" : "";
    var bg_color = 'rgb(255, 255, 255)';
    if (score_change > score_change_thresh || (raw_score > .55 && score_change > 0)) {
        text += reply_change_high;
        bg_color = score_color(raw_score);
    }
    else if (raw_score - score_change > .55 && score_change < -score_change_thresh) {
        text += reply_change_low;
        bg_color = score_change_color(score_change);
    }
    else {
        text += reply_change_mid;
    }

    $(event.target)[0].style.setProperty("background-image", "none");
    $(event.target)[0].style.setProperty("background-color", bg_color, "important");

    $('#' + display_id + '_d').css("background-image", "none");
    $('#' + display_id + '_d').css("background-color", bg_color, "important");
    $('#' + display_id + '_p').html(text);
    $('#' + display_id + '_h').html(name + ": Reply Summary");
}

// Finish a craft context intervention in display box indexed with display_id
function craft_context_intervention(score, show_scores, event, display_id) {
    var text = show_scores ? "Context craft score: " + score.toFixed(4) + "<br>" : "";
    var bg_color = 'rgb(255, 255, 255)';
    if (score > .55) {
        if (score > high_tension_thresh)
            text += context_very_high;
        else if (score > mid_tension_thresh)
            text += context_high;
        else
            text += context_mid;
        bg_color = score_color(score);
    }
    else {
        text += context_low;
    }
    $('#' + display_id + '_d').css("background-image", "none");
    $('#' + display_id + '_d').css("background-color", bg_color, "important");
    $('#' + display_id + '_p').html(text);
}

// Finish a toxicity reply intervention in display box indexed with display_id
function toxic_reply_intervention(score, show_scores, event, display_id) {
    var text = show_scores ? "Toxicity of your comment: " + score.toFixed(4) + "<br>" : "";
    if (score > .55) {
        text += "It seems like this comment is increasing the tension in this conversation. Remember that you will be most likely to have a productive conversation with a civil, respectful, and open approach.";
    }
    else {
        text += 'Nothing to report on this conversation.';
    }

    $(event.target)[0].style.setProperty("background-image", "none");
    $(event.target)[0].style.setProperty("background-color", score_color(score), "important");


    $('#' + display_id + '_d').css("background-image", "none");
    $('#' + display_id + '_d').css("background-color", score_color(score), "important");
    $('#' + display_id + '_p').html(text);
}

// Finish a toxicity context intervention in display box indexed with display_id
function toxic_context_intervention(score, show_scores, event, display_id) {
    var text = show_scores ? "Toxicity of comment you're replying to: " + score.toFixed(4) + "<br>" : "";

    if (score > .5) {
        text += context_high;
    }
    else {
        text += context_low;
    }

    $('#' + display_id + '_d').css("background-image", "none");
    $('#' + display_id + '_d').css("background-color", score_color(score), "important");
    $('#' + display_id + '_p').html(text);

}

/*
  Copyright (c) 2011 Andrei Mackenzie
  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Compute the edit distance between the two given strings
function get_edit_distance(a, b) {
    if (a.length == 0) return b.length;
    if (b.length == 0) return a.length;

    var matrix = [];
    // increment along the first column of each row
    var i;
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    // increment each column in the first row
    var j;
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    // Fill in the rest of the matrix
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1)); // deletion
            }
        }
    }

    return matrix[b.length][a.length];
};
