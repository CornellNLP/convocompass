// ConvoWizard Installation Script
// Handles one-click installation with clipboard + redirect

const CONVOWIZARD_CODE = `mw.loader.load('//test.wikipedia.org/w/index.php?title=User:Iamhamidrezaee/ConvoWizard.js&action=raw&ctype=text/javascript');`;
const EDIT_PAGE_URL = 'https://test.wikipedia.org/wiki/Special:MyPage/common.js?action=edit';
const UNINSTALL_URL = 'https://test.wikipedia.org/wiki/Special:MyPage/common.js?action=edit';

// Robust clipboard copy function - works on Windows, Mac, and all major browsers
async function copyToClipboard(text) {
    // Method 1: Modern Clipboard API (preferred, but requires HTTPS)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('Clipboard API failed, trying fallback:', err);
        }
    }
    
    // Method 2: execCommand fallback (works in older browsers and some contexts where Clipboard API fails)
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        
        // Prevent scrolling to bottom of page in some browsers
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        textarea.style.opacity = '0';
        textarea.style.zIndex = '-1';
        
        document.body.appendChild(textarea);
        
        // Select the text
        textarea.focus();
        textarea.select();
        
        // For iOS Safari
        textarea.setSelectionRange(0, text.length);
        
        // Execute copy command
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (successful) {
            return true;
        }
    } catch (err) {
        console.warn('execCommand fallback failed:', err);
    }
    
    // Method 3: Last resort - prompt user to copy manually
    try {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const shortcut = isMac ? 'Cmd+C' : 'Ctrl+C';
        window.prompt(`Copy this code (${shortcut}):`, text);
        return true; // User may have copied
    } catch (err) {
        console.error('All clipboard methods failed:', err);
    }
    
    return false;
}

// Toast notification system
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '→';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
    });
    
    // Auto-remove
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Main install handler
async function handleInstall() {
    const button = document.getElementById('install-button');
    const originalContent = button.innerHTML;
    
    // Copy to clipboard using robust method
    const copySuccess = await copyToClipboard(CONVOWIZARD_CODE);
    
    if (copySuccess) {
        // Update button state
        button.classList.add('install-btn-success');
        button.innerHTML = `
            <span class="install-btn-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </span>
            <span class="install-btn-text">Code Copied!</span>
        `;
        
        // Show toast
        showToast('Code copied to clipboard! Opening Wikipedia...', 'success');
        
        // Mark step 2 as complete
        markStepComplete(2);
        
        // Small delay before opening new tab for better UX
        setTimeout(() => {
            window.open(EDIT_PAGE_URL, '_blank');
            
            // Reset button after a moment
            setTimeout(() => {
                button.classList.remove('install-btn-success');
                button.innerHTML = originalContent;
            }, 3000);
        }, 500);
    } else {
        console.error('All clipboard methods failed');
        
        // Fallback: show manual copy instructions
        button.classList.add('install-btn-error');
        showToast('Could not copy automatically. Please copy the code manually.', 'error', 5000);
        
        // Open the code preview
        const details = document.querySelector('.code-preview');
        if (details) {
            details.open = true;
        }
        
        // Still open the edit page
        setTimeout(() => {
            window.open(EDIT_PAGE_URL, '_blank');
            button.classList.remove('install-btn-error');
        }, 1500);
    }
}

// Copy code only (from the preview section)
async function copyCodeOnly(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const button = event.currentTarget;
    const originalText = button.textContent;
    
    const copySuccess = await copyToClipboard(CONVOWIZARD_CODE);
    
    if (copySuccess) {
        button.textContent = 'Copied!';
        button.classList.add('copied');
        showToast('Code copied to clipboard!', 'success', 2000);
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    } else {
        showToast('Failed to copy. Please select and copy manually.', 'error');
    }
}

// Uninstall handler
function handleUninstall() {
    showToast('Opening your settings page...', 'info', 2000);
    window.open(UNINSTALL_URL, '_blank');
}

// Progress tracking
function markStepComplete(stepNumber) {
    const steps = document.querySelectorAll('.progress-step');
    
    steps.forEach((step, index) => {
        const stepNum = index + 1;
        if (stepNum <= stepNumber) {
            step.classList.add('completed');
            step.classList.remove('active');
        }
        if (stepNum === stepNumber + 1) {
            step.classList.add('active');
        }
    });
    
    // Update progress lines
    const lines = document.querySelectorAll('.progress-line');
    lines.forEach((line, index) => {
        if (index < stepNumber) {
            line.classList.add('completed');
        }
    });
    
    // Show success message when all steps complete
    if (stepNumber >= 3) {
        const successMsg = document.getElementById('success-message');
        if (successMsg) {
            successMsg.classList.add('visible');
        }
    }
    
    // Save progress to localStorage
    localStorage.setItem('convowizard-install-step', stepNumber);
}

// Restore progress on page load
function restoreProgress() {
    const savedStep = localStorage.getItem('convowizard-install-step');
    if (savedStep) {
        const step = parseInt(savedStep, 10);
        if (step > 0) {
            markStepComplete(step);
        }
    }
}

// Reset progress (Start Over)
function resetProgress() {
    if (confirm('Start over? This will reset your installation progress.')) {
        localStorage.removeItem('convowizard-install-step');
        window.location.reload();
    }
}

// Interactive Background - "Word Reveal"
// Scattered, nearly-invisible words that fade into visibility as cursor approaches
// Philosophy: Represents how ConvoWizard helps "surface" the thoughtful communicator within
class WordReveal {
    constructor() {
        this.canvas = document.getElementById('background-canvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.words = [];
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.mouseX = -1000;
        this.mouseY = -1000;
        
        // Positive words (blue) - reflection & constructive dialogue
        this.positiveWords = [
            'pause', 'listen', 'reflect', 'thoughtful', 'consider', 
            'understand', 'constructive', 'curious', 'empathy', 
            'patience', 'clarity', 'respect', 'kindness', 'insight',
            'compassion', 'dialogue', 'collaborate', 'mindful', 'calm',
            'gracious', 'genuine', 'open-minded', 'diplomatic', 'humble',
            'supportive', 'encouraging', 'nuanced', 'balanced', 'fair'
        ];
        
        // Negative words (red) - what ConvoWizard helps avoid
        this.negativeWords = [
            'threat', 'harass', 'attack', 'hostile', 'insult',
            'mock', 'dismiss', 'rage', 'spite', 'contempt',
            'belittle', 'demean', 'provoke', 'aggression', 'vitriol'
        ];
        
        // Configuration
        this.revealRadius = 200;      // How close cursor needs to be to reveal
        this.baseOpacity = 0.06;      // Slightly more visible at rest
        this.revealOpacity = 0.28;    // More visible when cursor is near
        
        // Sizes for variety (small, medium, large)
        this.sizes = [12, 14, 16, 18, 20, 24, 28];
        
        this.init();
        this.animate();
        
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        window.addEventListener('mouseleave', () => {
            this.mouseX = -1000;
            this.mouseY = -1000;
        });
    }

    init() {
        this.resize();
        this.createWords();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    handleResize() {
        this.resize();
        this.createWords();
    }

    createWords() {
        this.words = [];
        const padding = 80;
        const minDistance = 100; // Minimum distance between words
        
        // Combine all words with their type
        const allWords = [
            ...this.positiveWords.map(text => ({ text, type: 'positive' })),
            ...this.negativeWords.map(text => ({ text, type: 'negative' }))
        ];
        
        // Shuffle the array
        for (let i = allWords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allWords[i], allWords[j]] = [allWords[j], allWords[i]];
        }
        
        // Place each word exactly once
        for (let i = 0; i < allWords.length; i++) {
            let attempts = 0;
            let placed = false;
            
            while (!placed && attempts < 50) {
                const x = padding + Math.random() * (this.width - padding * 2);
                const y = padding + Math.random() * (this.height - padding * 2);
                
                // Check distance from other words
                let tooClose = false;
                for (const word of this.words) {
                    const dx = word.x - x;
                    const dy = word.y - y;
                    if (Math.sqrt(dx * dx + dy * dy) < minDistance) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    this.words.push({
                        text: allWords[i].text,
                        type: allWords[i].type,
                        x: x,
                        y: y,
                        size: this.sizes[Math.floor(Math.random() * this.sizes.length)],
                        opacity: this.baseOpacity,
                        targetOpacity: this.baseOpacity
                    });
                    placed = true;
                }
                attempts++;
            }
            
            // Fallback: place anyway if couldn't find good spot
            if (!placed) {
                this.words.push({
                    text: allWords[i].text,
                    type: allWords[i].type,
                    x: padding + Math.random() * (this.width - padding * 2),
                    y: padding + Math.random() * (this.height - padding * 2),
                    size: this.sizes[Math.floor(Math.random() * this.sizes.length)],
                    opacity: this.baseOpacity,
                    targetOpacity: this.baseOpacity
                });
            }
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Set font properties
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        this.words.forEach(word => {
            // Calculate distance from cursor
            const dx = this.mouseX - word.x;
            const dy = this.mouseY - word.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate target opacity based on cursor proximity
            if (dist < this.revealRadius) {
                // Smooth falloff from center
                const proximity = 1 - (dist / this.revealRadius);
                word.targetOpacity = this.baseOpacity + (this.revealOpacity - this.baseOpacity) * proximity;
            } else {
                word.targetOpacity = this.baseOpacity;
            }
            
            // Smoothly interpolate opacity (fade in faster, fade out slower)
            const speed = word.targetOpacity > word.opacity ? 0.08 : 0.03;
            word.opacity += (word.targetOpacity - word.opacity) * speed;
            
            // Draw the word
            this.ctx.save();
            this.ctx.translate(word.x, word.y);
            
            // Color based on word type: blue for positive, red for negative
            if (word.type === 'positive') {
                this.ctx.fillStyle = `rgba(0, 102, 204, ${word.opacity})`; // Blue
            } else {
                this.ctx.fillStyle = `rgba(200, 50, 50, ${word.opacity})`; // Red
            }
            
            this.ctx.font = `500 ${word.size}px 'DM Sans', sans-serif`;
            this.ctx.fillText(word.text, 0, 0);
            
            this.ctx.restore();
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    restoreProgress();
    
    // Initialize background - "Word Reveal" effect
    new WordReveal();
    
    // Add keyboard shortcut hint based on OS
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const kbdElements = document.querySelectorAll('.mini-steps kbd');
    if (isMac && kbdElements.length >= 2) {
        // Already showing both options in HTML, but could customize here
    }
    
    // Smooth scroll for any anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    // Add subtle entrance animations
    const phases = document.querySelectorAll('.phase');
    phases.forEach((phase, index) => {
        phase.style.opacity = '0';
        phase.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            phase.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            phase.style.opacity = '1';
            phase.style.transform = 'translateY(0)';
        }, 100 + (index * 100));
    });
});
