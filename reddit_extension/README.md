# reddit_extension

## Installation instructions

1. Open google chrome, and navigate to [chrome://extensions/](chrome://extensions/). In the top right corner, make sure the "Developer Mode" switch is on. 
2. Click "Load Unpacked" (button should appear when you turn "Developer Mode" on), and select `your/path/to/reddit_extension`
3. With the extension new installed, click on the extension icon and then go to "Options". This should open in a new tab.
4. Enter an access token on the options page (explination below)
5. Browse [old.reddit.com](https://old.reddit.com/) and type some comments to test out the extension!

## Access Tokens

Each participant will recieve an access token to validate their identity as a genuine participant in the study, and for tracking purposes. The last character/digit in the access token also determines which intervention each participant recieves. 

Use Access Tokens 0-4 to demo the extension! You can update your token as much as you want on the options page to test out the different interventions (particpants will not be able to do this). 

### Access Token -> Intervention Mapping
- Token "0": **Craft Reply Intervention**. Color conversation summary & trigger warning message based on *change in craft score of converation* after including the in-progress reply, compared to without the in-progress reply.  
- Token "1": **Craft Context Intervention**. Color conversation history summary & trigger warning message based on craft score of converation ending before the in-progress reply.
- Token "2": **Craft Context + Reply Intervention**. Show both the raft Reply Intervention and Craft Context Intervention. 
- Token "3": **Toxicity Reply Intervention**: Color conversation summary  & trigger warning message based on perspective toxicity model score of the in-progress reply.  
- Token "4": **Toxicity Context Intervention**: Color conversation history summary & trigger warning message based on perspective toxicity model score of the previous comment.

## Showing Numerical Scores (for Internal Testing)

To show numerical scores for all interventions for internal testing, enter the username `craft-admin-oW0ow13g` on the options page. 
