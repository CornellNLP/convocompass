# extension-backend

Flask API on `:8083` that the Wikipedia talk-page gadget calls. It reconstructs a
conversation as a ConvoKit `Corpus`, scores it via the configured model backend, logs the
interaction to MySQL, and returns the scores the client renders feedback from.

| Route              | Purpose                                              |
|--------------------|------------------------------------------------------|
| `/start`           | score a conversation when a reply box is opened      |
| `/continue`        | rescore as the draft reply changes                   |
| `/submit`          | log a submitted comment                              |
| `/submit_feedback` | log participant feedback on an intervention          |
| `/claim_token`     | validate a participant access token                  |
| `/add_user`        | enroll a participant (admin only)                    |
| `/view_users`      | list enrolled participants (admin only)              |
| `/debug_scores`    | return raw scores for a conversation                 |

`utils/model_scorer.py` is the switch between the two scoring backends. See the top-level
README for configuration and deployment.

> The directory was named `reddit-extension-backend` historically; it serves the Wikipedia
> gadget. The Reddit client is not part of this repository.
