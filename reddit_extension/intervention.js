var name = 'AI Assistant';
var endpointBase = 'https://craft.infosci.cornell.edu/extension/';
// Optional global token hook: set `window.CRAFT_LLM_TOKEN` from the embedding page
var LLM_TOKEN = (window && window.CRAFT_LLM_TOKEN) ? window.CRAFT_LLM_TOKEN : 'placeholder-token';
var ASSISTANT_YAML_KEY = 'assistant_yaml';
var savedYamlText = '';

function hasLocalStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

function loadSavedYaml() {
    return new Promise(function (resolve) {
        if (!hasLocalStorage()) {
            resolve(savedYamlText);
            return;
        }
        chrome.storage.local.get([ASSISTANT_YAML_KEY], function (v) {
            savedYamlText = (v && v[ASSISTANT_YAML_KEY]) ? String(v[ASSISTANT_YAML_KEY]) : '';
            resolve(savedYamlText);
        });
    });
}

function persistYaml(text) {
    savedYamlText = String(text || '');
    if (!hasLocalStorage()) {
        return;
    }
    var toSave = {};
    toSave[ASSISTANT_YAML_KEY] = savedYamlText;
    chrome.storage.local.set(toSave);
}

function updateResponsiveBox($box) {
    if (!$box || !$box.length) {
        return;
    }

    var viewportWidth = $(window).width();
    var computedHeight = Math.max(100, Math.min(220, viewportWidth * 0.12));

    $box.css({
        'width': '100%',
        'max-width': '100%',
        'box-sizing': 'border-box',
        'height': computedHeight + 'px',
        'min-height': '100px'
    });
}

function isThreadMuted(target) {
    return !!(target && target.data && target.data('craft-muted'));
}

function setThreadMuted(target, $box, muted) {
    if (!target || !target.data) {
        return;
    }

    target.data('craft-muted', !!muted);

    if (!$box || !$box.length) {
        return;
    }

    var $body = $box.find('.craft-box-body');
    if (!muted) {
        $body.text('');
        return;
    }

    $body.text('this assistant is muted');
}

function getPostTitle() {
    var title = $('#siteTable .thing.link a.title').first().text();
    return (title && title.trim()) || '';
}

function getPostDescription() {
    var body = $('#siteTable .thing.link .expando .usertext-body .md').first().text();
    return (body && body.trim()) || '';
}

function getParticipantRole() {
    var op = ($('#siteTable .thing.link .author').first().text() || '').trim().toLowerCase();
    var me = ($('#header-bottom-right .user a').first().text() || '').trim().toLowerCase();
    if (op && me && op === me) {
        return 'op';
    }
    return 'commenter';
}

function commentUtterance($comment) {
    var commentText = $comment.children('.entry').find('.usertext-body').first().text();
    if (!commentText || !commentText.trim()) {
        return null;
    }
    var speaker = ($comment.children('.entry').find('.tagline .author').first().text() || '').trim();
    return {
        speaker: speaker || 'commenter',
        text: commentText.trim().slice(0, 1500)
    };
}

function getThreadUtterances(target) {
    var utterances = [];
    if (target && target.parents) {
        target.parents('.comment').toArray().reverse().forEach(function (parent) {
            var utt = commentUtterance($(parent));
            if (utt) {
                utterances.push(utt);
            }
        });
    }
    if (utterances.length) {
        return utterances;
    }
    $('.commentarea .comment').each(function () {
        var utt = commentUtterance($(this));
        if (utt) {
            utterances.push(utt);
        }
    });
    return utterances.slice(0, 3);
}

function withStudyCreds() {
    return new Promise(function (resolve) {
        if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync)) {
            resolve({ token: LLM_TOKEN, username: 'anonymous' });
            return;
        }
        chrome.storage.sync.get(['token', 'username'], function (v) {
            resolve({
                token: (v && v.token) ? String(v.token) : LLM_TOKEN,
                username: (v && v.username) ? String(v.username) : 'anonymous'
            });
        });
    });
}

function buildLlmPayload(yamlText, target, creds) {
    var draft = (target && target.val ? target.val() : '') || '';
    var postTitle = getPostTitle();
    var payload = {
        token: creds && creds.token ? creds.token : LLM_TOKEN,
        username: creds && creds.username ? creds.username : 'anonymous',
        topic_name: postTitle || document.title || 'this discussion',
        existing: getThreadUtterances(target),
        new: draft.trim() || 'No draft yet.',
        post_title: postTitle,
        post_description: getPostDescription(),
        participant_role: getParticipantRole(),
        assistant_yaml: yamlText
    };

    return payload;
}

function attemptLlmRequest(yamlText, target) {
    return withStudyCreds().then(function (creds) {
        var payload = buildLlmPayload(yamlText, target, creds);
        var endpoints = [
            endpointBase + 'llm/start',
            endpointBase + 'llm/continue'
        ];

        var requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        var lastError = null;

        return new Promise(function (resolve, reject) {
            var index = 0;

            function tryNext() {
                if (index >= endpoints.length) {
                    reject(lastError || new Error('No LLM endpoints responded.'));
                    return;
                }

                var url = endpoints[index];
                index += 1;

                fetch(url, requestOptions)
                    .then(function (response) {
                        if (!response.ok) {
                            return response.text().then(function (text) {
                                throw new Error('HTTP ' + response.status + ': ' + text);
                            });
                        }
                        return response.json();
                    })
                    .then(function (result) {
                        resolve(result);
                    })
                    .catch(function (err) {
                        lastError = err;
                        var msg = (err && err.message) ? String(err.message) : '';
                        if (msg.indexOf('HTTP 403') !== -1) {
                            reject(err);
                            return;
                        }
                        tryNext();
                    });
            }

            tryNext();
        });
    });
}

// Utility: debounce a function
function debounce(fn, wait) {
    var t = null;
    return function () {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
}

function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Wrapper to add retry/backoff for network failures. Does not retry on 403.
function performRequestWithBackoff(yamlText, target, attempts, baseMs) {
    attempts = typeof attempts === 'number' ? attempts : 3;
    baseMs = typeof baseMs === 'number' ? baseMs : 500;

    return new Promise(function (resolve, reject) {
        var attempt = 0;

        function tryOnce() {
            attempt += 1;
            attemptLlmRequest(yamlText, target)
                .then(function (res) { resolve(res); })
                .catch(function (err) {
                    var msg = (err && err.message) ? String(err.message) : String(err || 'unknown');
                    // If unauthorized, don't retry
                    if (msg.indexOf('HTTP 403') !== -1 || msg.indexOf('403') !== -1) {
                        reject(new Error('HTTP 403: unauthorized'));
                        return;
                    }
                    if (attempt >= attempts) {
                        reject(err);
                        return;
                    }
                    var waitMs = baseMs * Math.pow(2, attempt - 1);
                    sleep(waitMs).then(tryOnce);
                });
        }

        tryOnce();
    });
}

function applyLlmResult($body, result) {
    if (!$body || !$body.length) {
        return;
    }
    if (result && result.should_respond === false) {
        $body.text(result.llm_response || 'Nothing further to add at this point in the conversation.');
        return;
    }
    var llmText = result && (result.llm_response || result.llm_summary);
    if (llmText) {
        $body.text(String(llmText));
    }
}

function handleTypingTrigger(target, $box, yamlText) {
    if (isThreadMuted(target)) {
        setThreadMuted(target, $box, true);
        return;
    }

    var $body = $box.find('.craft-box-body');
    if (!yamlText || !String(yamlText).trim()) {
        return;
    }

    attemptLlmRequest(yamlText, target)
        .then(function (result) {
            applyLlmResult($body, result);
        })
        .catch(function (error) {
            console.log('llm request failed while typing:', error);
        });
}

$(document).ready(function () {
    loadSavedYaml();

    $(window).on('resize', function () {
        $('.craftDisplay').each(function () {
            updateResponsiveBox($(this));
        });
    });

    $(document).on("focus", "textarea", function (event) {
        var target = $(event.target);
        if (target.data("craft-box")) {
            return;
        }

        if (target.parents(".comment").length === 0) {
            return;
        }

        var yamlText = savedYamlText;
        var $box = $(
            '<div class="craftDisplay">' +
            '  <div class="craft-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">' +
            '    <h4 style="margin:0;">' + name + '</h4>' +
            '    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-left:auto;">' +
            '      <button type="button" class="craft-change-yaml">change yaml</button>' +
            '      <button type="button" class="craft-toggle-mute">mute thread</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="craft-box-body"></div>' +
            '</div>'
        );
        target.data("craft-box", true);
        target.data("craft-box-element", $box);
        target.data("craft-yaml", yamlText);
        target.data("craft-muted", false);
        $box.insertBefore(target);
        updateResponsiveBox($box);

        loadSavedYaml().then(function (storedYaml) {
            if (!target.data('craft-yaml')) {
                target.data('craft-yaml', storedYaml);
            }
        });

        $box.find('.craft-toggle-mute').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var muted = !isThreadMuted(target);
            var $muteButton = $(this);
            setThreadMuted(target, $box, muted);
            $muteButton.text(muted ? 'unmute thread' : 'mute thread');
        });

        // Debounce typing trigger to avoid excessive requests
        var debouncedTyping = debounce(function () {
            if (isThreadMuted(target)) {
                setThreadMuted(target, $box, true);
                return;
            }

            var currentYaml = target.data('craft-yaml') || '';
            if (!String(currentYaml).trim()) {
                return;
            }
            performRequestWithBackoff(currentYaml, target, 3, 500)
                .then(function (result) {
                    applyLlmResult($box.find('.craft-box-body'), result);
                })
                .catch(function (err) {
                    console.log('llm request failed while typing:', err);
                });
        }, 600);
        target.on('input', debouncedTyping);

        $box.find('.craft-change-yaml').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var fileInput = $('<input type="file" accept=".yaml,.yml" style="display:none;">');
            $('body').append(fileInput);
            fileInput.trigger('click');

            fileInput.on('change', function (event) {
                var file = event.target && event.target.files && event.target.files[0];
                if (!file) {
                    fileInput.remove();
                    return;
                }

                var reader = new FileReader();
                reader.onload = function (loadEvent) {
                    var yamlText = loadEvent.target && loadEvent.target.result ? String(loadEvent.target.result) : '';
                    persistYaml(yamlText);
                    target.data('craft-yaml', yamlText);

                    if (isThreadMuted(target)) {
                        setThreadMuted(target, $box, true);
                        fileInput.remove();
                        return;
                    }

                    handleTypingTrigger(target, $box, yamlText);

                    fileInput.remove();
                };

                reader.readAsText(file);
            });
        });
    });
});