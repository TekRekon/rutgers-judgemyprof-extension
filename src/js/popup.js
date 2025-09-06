document.getElementById('reset-cache').addEventListener('click', async function () {
    this.classList.add('clicked');
    let response = await chrome.runtime.sendMessage({ action: "resetCache" });
    if (response.status === 1) {
        showStatusMessage("Cache reset successful 🎉", "success-message");
    }
    else {
        showStatusMessage("Cache reset failed 😞: " + response.errorMsg, "error-message");
    }
});

// Load and save the hide books links setting
document.addEventListener('DOMContentLoaded', async function() {
    // Load current setting
    const result = await chrome.storage.sync.get(['hideBooksLinks']);
    const toggleButton = document.getElementById('toggle-books-links');
    const isHidden = result.hideBooksLinks || false;
    
    // Set initial button state
    updateToggleButtonState(toggleButton, isHidden);
    
    // Handle toggle button clicks
    toggleButton.addEventListener('click', async function() {
        this.classList.add('clicked');
        
        const currentlyHidden = this.classList.contains('pressed');
        const newState = !currentlyHidden;
        
        // Save new setting
        await chrome.storage.sync.set({ hideBooksLinks: newState });
        
        // Update button appearance
        updateToggleButtonState(this, newState);
        
        // Send message to content script to apply/remove hiding
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'toggleBooksLinks',
                hide: newState
            });
        });
        
        showStatusMessage(
            newState ? "Books links hidden" : "Books links shown", 
            "success-message"
        );
    });
});

function updateToggleButtonState(button, isPressed) {
    if (isPressed) {
        button.classList.add('pressed');
        button.textContent = 'Show Books Links';
    } else {
        button.classList.remove('pressed');
        button.textContent = 'Hide Books Links';
    }
}

function showStatusMessage(message, messageClass) {
    let statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.classList.remove('success-message', 'error-message');
    statusDiv.classList.add(messageClass);
    statusDiv.style.display = "block";
    
    // Hide message after 2 seconds
    setTimeout(() => {
        statusDiv.style.display = "none";
    }, 2000);
}
