# ConvoWizard Installation Instructions

> **⚠️ NOTICE: This is currently set up for TEST Wikipedia only**  
> All instructions and links in this document point to **test.wikipedia.org**, which is Wikipedia's testing environment. This is not the main Wikipedia site.

## Step 1: Create or Login to Your Wikipedia Test Account

- **Login**: If you already have a Wikipedia test account, [click here to login](https://test.wikipedia.org/w/index.php?title=Special:UserLogin)
- **Create Account**: If you don't have a Wikipedia test account yet, [click here to create one](https://test.wikipedia.org/w/index.php?title=Special:CreateAccount)

## Step 2: Access Your common.js File

Once logged in, replace `USERNAME` in the link below with your Wikipedia test account's username and open it in your browser:

```
https://test.wikipedia.org/wiki/User:Leojqian/common.js
```

## Step 3: Edit or Create the File

- If you **don't have** a common.js file yet, click on **"Create source"**
- If you **already have** a common.js file with existing script, click on **"Edit source"**, and add the line below to the end of your script.

## Step 4: Add the ConvoWizard Code

A code editor will open. Paste the following code into the editor:

**⚠️ Important: Do NOT change the username in this code**

```javascript
mw.loader.load('//test.wikipedia.org/w/index.php?title=User:Iamhamidrezaee/ConvoWizard.js&action=raw&ctype=text/javascript');
```

## Step 5: Save Your Changes

Scroll down and click **"Publish changes"**

## Step 6: Test ConvoWizard

1. Go to the sandbox testing page: [Natural Language Processing is an unnecessary field of science](https://test.wikipedia.org/wiki/User:Iamhamidrezaee/sandbox)
2. Pick any comment on the page and click **"reply"**
3. You should now see ConvoWizard's context and reply scorer
4. Begin testing!

---

## Uninstalling ConvoWizard

If you want to completely remove ConvoWizard from your Wikipedia test account:

1. Go back to your common.js file: `https://test.wikipedia.org/wiki/User:USERNAME/common.js` (replace `USERNAME` with your username)
2. Click **"Edit source"**
3. Delete the ConvoWizard-specific script in the editor you added earlier
4. Click **"Publish changes"**

ConvoWizard will now be completely removed from your account.

---

## Need Help?

If you run into any issues during this process, please contact:

- **Email**: hr328@cornell.edu
- **Phone**: (607) 663-1415