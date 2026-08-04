# ConvoWizard Wikipedia Talk Page Integration - Complete Documentation

**Project Period:** August 20, 2025 - December 18, 2025  
**Branch:** `feature/wiki-talk-integration`  
**Developer:** Hamid Rezaee (hr328@cornell.edu)

---

## TL;DR

This project successfully integrated ConvoWizard, an AI-powered conversation moderation tool, into Wikipedia Talk Pages. The implementation includes:

- **Core Script**: A fully functional userscript that integrates with Wikipedia's DiscussionTools to provide real-time feedback on conversation tension and reply quality
- **Authentication System**: Automatic token provisioning and secure storage using Wikipedia's user options (notepad)
- **User Interface**: Seamless integration with Wikipedia's reply interface, providing context-aware warnings and feedback
- **Testing Infrastructure**: Comprehensive end-to-end testing framework for validation
- **Installation Website**: Interactive web-based installation guide (convowiz.com)
- **Documentation**: Complete user instructions and technical documentation

The tool was successfully demonstrated at a Wikipedia workshop in October 2025 and is ready for broader deployment.

---

## Project Trajectory & Milestones

### Phase 1: Initial Implementation (September 2, 2025)

**Milestone: Core Script Development**

The foundation of the Wikipedia Talk Page integration was established with the creation of the main userscript (`wiki-talk-page-script.js`). This initial implementation included:

- **Wikipedia Integration**: Script designed to run on Wikipedia Talk pages using MediaWiki's ResourceLoader
- **DiscussionTools Integration**: Hooked into Wikipedia's DiscussionTools reply widgets to intercept user replies
- **API Communication**: Established connection to the CRAFT backend server (`https://craft.infosci.cornell.edu/wiki_extension/`)
- **Basic UI Elements**: Initial implementation of feedback containers for context and reply scoring
- **Tension Detection**: Basic implementation of conversation tension scoring with threshold-based warnings

**Key Files Created:**
- `wiki-talk-page/wiki-talk-page-script.js` (439 lines initial)

**Technical Details:**
- Used MediaWiki's `mw.loader` for dependency management
- Integrated with Wikipedia's DiscussionTools API
- Implemented real-time feedback on reply composition

---

### Phase 2: Context Management & Frontend Improvements (September 2, 2025)

**Milestone: Context Building from Reply Lineage**

A critical feature was implemented to build conversation context from the current reply's lineage, mirroring the approach used in the Reddit integration:

- **Context Lineage Building**: Script now traverses the reply tree to build complete conversation context
- **Parent-Child Relationship Tracking**: Properly identifies and follows reply chains in Wikipedia's threaded discussion format
- **Context Aggregation**: Combines all parent comments and replies to create comprehensive context for tension scoring

**Frontend Enhancements:**
- Improved UI styling and positioning of feedback containers
- Better integration with Wikipedia's native styling
- Enhanced visual feedback for different tension levels
- Improved user experience with clearer messaging

**Key Changes:**
- Added 61 lines for context management logic
- Enhanced frontend with 163 additional lines of UI improvements

---

### Phase 3: Testing Infrastructure & Threshold Calibration (September 25, 2025)

**Milestone: Comprehensive Testing Framework**

A complete end-to-end testing framework was developed to validate the script's functionality:

- **E2E Test Suite**: Created `convowizard-e2e.test.mjs` with 344 lines of comprehensive tests
- **Threshold Calibration**: Adjusted tension thresholds based on isolated testing results
  - Maximum achieved tension: 0.8 (extremely tense context)
  - Adjusted highly toxic threshold to 0.75 (from 0.9) based on testing
- **Realistic Test Scenarios**: Created multiple conversation flows based on actual Wikipedia talk page patterns
- **Common.js Loader**: Created `common.js` template for easy script installation

**Key Files Created:**
- `wiki-talk-page/convowizard-e2e.test.mjs` (344 lines)
- `wiki-talk-page/common.js` (8 lines)

**Testing Results:**
- Successfully validated context building from reply lineage
- Confirmed tension scoring accuracy with various conversation patterns
- Verified API integration and token handling

**Threshold Configuration:**
```javascript
const MID_TENSION_THRESH = 0.50;
const HIGH_TENSION_THRESH = 0.75;  // Adjusted from 0.9 based on testing
const SCORE_CHANGE_THRESH = 0.08;
```

---

### Phase 4: Critical Bug Fixes & Enable/Disable Functionality (October 6, 2025)

**Milestone: Context Fix & User Controls**

A critical bug in context retrieval was identified and fixed, along with the addition of user control features:

**Context Fix:**
- **Problem**: Context was not being properly retrieved and displayed to users
- **Solution**: Fixed context building logic to properly traverse Wikipedia's discussion structure
- **Impact**: Users could now see accurate feedback about conversation tension before replying

**Enable/Disable Functionality:**
- Added toggle button to enable/disable ConvoWizard on-the-fly
- Allows users to temporarily disable the tool without uninstalling
- Integrated with backend A/B testing framework for experimental control

**User Instructions:**
- Created comprehensive installation instructions (`ConvoWizard_Instructions.md`)
- Step-by-step guide for Wikipedia users to install the script
- Included troubleshooting and uninstallation instructions

**Key Changes:**
- Fixed context retrieval logic (1356 lines modified)
- Added 84 lines for enable/disable functionality
- Created 64-line instruction document

**Email Context:**
> "Fixed the issue! Now we get the proper feedback for the context, and can see if our reply can decrease tension." - Oct 6, 2025

---

### Phase 5: Production Readiness & Backend Integration (October 14, 2025)

**Milestone: Pre-Workshop Finalization**

Final preparations for the Wikipedia workshop demonstration:

**Backend Integration:**
- Removed manual "Disable for this page" button (replaced with backend-controlled A/B testing)
- Removed ConvoWizard notice banner (reserved for full experiment phase)
- Integrated with backend's automatic disable functionality for experimental control

**Test Wikipedia Migration:**
- Migrated all links and instructions to `test.wikipedia.org` instead of production
- Prevents accidental deployment and reduces risk of admin blocks
- Created sandbox testing environment

**Instruction Refinement:**
- Updated instructions to handle multiple scenarios (new users, existing users, empty files)
- Added test-specific guidance
- Improved clarity and grammar throughout

**Key Changes:**
- Removed 126 lines of manual disable code
- Updated all Wikipedia links to test.wikipedia.org
- Enhanced instruction document with edge case handling

**Email Context:**
> "Okay, everything should be fully functioning and fixed now:
> 1. The ConvoWizard notice is removed.
> 2. The button-based 'Disable for this page' is replaced with the already implemented, A/B testing focused feature." - Oct 14, 2025

---

### Phase 6: Token Storage in User Options (October 29, 2025)

**Milestone: Secure Token Persistence**

Implemented secure token storage using Wikipedia's user options (notepad) system:

**Token Storage Implementation:**
- **Primary Storage**: Wikipedia's `mw.user.options` (notepad) - persists across sessions
- **Fallback Storage**: localStorage for immediate access
- **Auto-provisioning**: Tokens are automatically created and stored on first use
- **Token Validation**: Server-side validation ensures tokens match usernames

**Technical Implementation:**
- Used `mw.user.options.set()` and `mw.user.options.get()` for persistence
- Integrated with MediaWiki API's `saveOption()` for server-side storage
- Added error handling for storage failures

**Key Changes:**
- Added 62 lines for token storage functionality
- Implemented dual-storage strategy (user options + localStorage)

**Email Context:**
> "Just finished the storing of the token in the user options (notepad) per your instructions, and tested it on my own token, which was retrieved successfully" - Oct 29, 2025

**Code Snippet:**
```javascript
async function persistToken(storageKey, token) {
  // Store in localStorage (immediate)
  if (token) {
    localStorage.setItem(storageKey, token);
  } else {
    localStorage.removeItem(storageKey);
  }
  
  // Store in user options (persistent)
  if (mw.user && mw.user.options && typeof mw.user.options.set === 'function') {
    mw.user.options.set(OPTION_KEY, token || '');
    await new mw.Api().saveOption(OPTION_KEY, token || '');
  }
}
```

---

### Phase 7: Interactive Installation Website (December 3, 2025)

**Milestone: User-Friendly Installation Portal**

Created a comprehensive, interactive web-based installation guide to simplify the user onboarding process:

**Website Features:**
- **Interactive Installation Flow**: Step-by-step guide with progress tracking
- **Visual Design**: Modern, clean interface with interactive background (sentiment word visualization)
- **Test Environment Focus**: Clearly marked as test.wikipedia.org environment
- **Copy-Paste Functionality**: Easy code copying for installation
- **Responsive Design**: Works on desktop and mobile devices

**Files Created:**
- `wiki-talk-page/frontend/index.html` (218 lines)
- `wiki-talk-page/frontend/script.js` (462 lines)
- `wiki-talk-page/frontend/styles.css` (1005 lines)
- `wiki-talk-page/frontend/ConvoWizard.user.js` (36 lines)

**Website Deployment:**
- Deployed at `convowiz.com` (with redirects from convowiz.org, convowiz.info)
- Purchased domain bundle for $1/year
- Ready for migration to cornell.edu domain

**Design Highlights:**
- Interactive background with sentiment word reveal on hover (blue for positive, red for negative)
- Progress tracking with visual indicators
- Toast notifications for user feedback
- Clean, professional aesthetic

**Email Context:**
> "This website is up and I bought the URL bundle for like $1 for a year... In this website, I basically:
> 1. Added all the instructions with their specific that we have discussed so far,
> 2. Tested it user agnostic and ensured every step is clear and functional,
> 3. Found out that Wikipedia and embedding it in a page is an absolute pain... so I just went with this route.
> 4. Added a subtle interactivity to the background where positive sentiment words (blue) and negative sentiment words (red) get revealed upon hover" - Dec 3, 2025

---

## Technical Architecture

### Core Components

1. **Main Script** (`wiki-talk-page-script.js`)
   - 960 lines of JavaScript
   - Runs as Wikipedia userscript
   - Integrates with MediaWiki and DiscussionTools APIs
   - Handles token management, API communication, and UI rendering

2. **Installation Website** (`frontend/`)
   - Interactive HTML/CSS/JavaScript application
   - Guides users through installation process
   - Provides visual feedback and progress tracking

3. **Testing Framework** (`convowizard-e2e.test.mjs`)
   - End-to-end test suite
   - Validates API integration
   - Tests various conversation scenarios

4. **Documentation** (`ConvoWizard_Instructions.md`)
   - User-facing installation guide
   - Step-by-step instructions
   - Troubleshooting information

### Key Technical Decisions

1. **Test Wikipedia Usage**: All development and testing moved to test.wikipedia.org to avoid production issues and admin blocks

2. **Token Storage Strategy**: Dual storage (user options + localStorage) ensures persistence and immediate availability

3. **Context Building**: Mirrors Reddit integration approach by building context from reply lineage

4. **Threshold Calibration**: Adjusted thresholds based on real-world testing (0.75 for high tension instead of 0.9)

5. **Backend Integration**: Removed manual controls in favor of backend-controlled A/B testing framework

---

## Features Implemented

### Core Features

✅ **Real-time Reply Feedback**
- Analyzes draft replies before posting
- Provides tension scoring and warnings
- Suggests de-escalation strategies

✅ **Context Awareness**
- Builds conversation context from reply lineage
- Tracks parent-child relationships in threaded discussions
- Provides context-based tension warnings

✅ **Token Management**
- Automatic token provisioning on first use
- Secure storage in Wikipedia user options
- Server-side validation

✅ **User Controls**
- Enable/disable functionality (backend-controlled)
- Seamless integration with Wikipedia UI
- Non-intrusive design

✅ **Installation System**
- Interactive web-based guide
- Step-by-step instructions
- Copy-paste code snippets

### UI/UX Features

✅ **Visual Feedback**
- Color-coded tension indicators
- Contextual warning messages
- Non-blocking UI elements

✅ **Responsive Design**
- Works on desktop and mobile
- Adapts to Wikipedia's styling
- Accessible and user-friendly

---

## Testing & Validation

### Testing Approach

1. **Isolated Testing**: Created test scenarios with extreme tension to validate threshold calibration
2. **E2E Testing**: Comprehensive test suite covering all major functionality
3. **User Testing**: Tested with research team members before workshop
4. **Workshop Validation**: Successfully demonstrated at Wikipedia workshop (October 2025)

### Test Results

- **Maximum Tension Achieved**: 0.8 (extremely tense context)
- **Threshold Calibration**: Adjusted high tension threshold to 0.75
- **API Integration**: Successfully validated with backend server
- **Token Management**: Confirmed persistence across sessions

---

## Challenges & Solutions

### Challenge 1: Wikipedia Admin Blocks
**Problem**: Creating test pages with tense conversations led to admin blocks  
**Solution**: Migrated to test.wikipedia.org and created sandbox pages with appropriate language

### Challenge 2: Context Retrieval Bug
**Problem**: Context was not being properly displayed to users  
**Solution**: Fixed context building logic to properly traverse Wikipedia's discussion structure

### Challenge 3: Token Storage
**Problem**: Needed secure, persistent token storage  
**Solution**: Implemented dual-storage strategy using Wikipedia user options (notepad) + localStorage

### Challenge 4: Installation Complexity
**Problem**: Manual installation process was too complex for users  
**Solution**: Created interactive web-based installation guide with step-by-step instructions

### Challenge 5: Embedding Wikipedia Pages
**Problem**: Wikipedia blocks embedding in third-party pages  
**Solution**: Created standalone installation website with clear links to Wikipedia pages

---

## Future Work & Next Steps

### Immediate Next Steps (Per Email Context)

1. **Consent Form Integration**: Add consent form signing to installation process
2. **Domain Migration**: Move website to cornell.edu domain

### Potential Enhancements

1. **Gadget Integration**: Explore Wikipedia Gadget system for easier installation (requires admin approval)
2. **Pause on specific pages**: Feature to pause the integration for specific pages, whether controlled or on random, for research purposes.

---

## File Structure

```
wiki-talk-page/
├── wiki-talk-page-script.js      # Main userscript (960 lines)
├── ConvoWizard_Instructions.md   # User installation guide
├── common.js                     # Loader script template
├── convowizard-e2e.test.mjs      # E2E test suite (344 lines)
├── DOCUMENTATION.md              # This file
└── frontend/
    ├── index.html                # Installation website (218 lines)
    ├── script.js                 # Website functionality (462 lines)
    ├── styles.css                # Website styling (1005 lines)
    └── ConvoWizard.user.js       # Additional utilities (36 lines)
```

---

## Statistics

- **Total Development Time**: ~4 months (August 20 - December 18, 2025)
- **Total Lines of Code**: ~3,000+ lines across all files
- **Commits**: 14 major commits
- **Files Created/Modified**: 8 files
- **Test Coverage**: Comprehensive E2E test suite
- **Workshop Success**: Successfully demonstrated to 100+ participants

---

## Acknowledgments

This project was developed as part of research collaboration with:
- **Professor Cristian Danescu-Niculescu-Mizil** (Cornell University)
- **Laerdon Kim** (Research Team)

Special thanks to the Wikipedia community for feedback and support during the workshop.

---

## Contact

For questions or issues regarding this implementation:
- **Email**: hr328@cornell.edu
- **Phone**: (607) 663-1415

---

*Documentation compiled: December 18, 2025*

