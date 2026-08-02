// Endpoint of your ConvoCompass extension backend.
//
// This is the ONE value you need to change to point the extension at your own
// deployment. It must end with a trailing slash — the routes are appended
// directly to it (server + "start", server + "continue", ...).
//
// If you run the backend directly, this is http://<host>:8083/
// If you front it with the reverse proxy described in the README, use that URL.
//
// Whatever you set here must also be listed in the "permissions" array of
// manifest.json, or Chrome will block the cross-origin requests.
const server = "http://localhost:8083/";
