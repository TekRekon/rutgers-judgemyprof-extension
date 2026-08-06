let statusMessageTimeout = null;


document.getElementById('reset-cache').addEventListener('click', async function () {
    animateButton(this);
    try {
        const response = await chrome.runtime.sendMessage({action: "resetCache"});
        if (response?.status === 1) {
            showStatusMessage("Cache reset successful 🎉", "success-message");
        } else {
            showStatusMessage(`Cache reset failed 😞: ${response?.errorMsg || "Unknown error"}`, "error-message");
        }
    } catch (error) {
        showStatusMessage(`Cache reset failed 😞: ${error.message}`, "error-message");
    }
});


document.addEventListener('DOMContentLoaded', async () => {
    const toggleButton = document.getElementById('toggle-books-links');
    try {
        const result = await chrome.storage.sync.get(['hideBooksLinks']);
        updateToggleButtonState(toggleButton, Boolean(result.hideBooksLinks));
    } catch (error) {
        showStatusMessage(`Could not load setting: ${error.message}`, "error-message");
    }

    toggleButton.addEventListener('click', async function () {
        animateButton(this);
        const newState = !this.classList.contains('pressed');

        try {
            await chrome.storage.sync.set({hideBooksLinks: newState});
            updateToggleButtonState(this, newState);
            await notifyActiveTab(newState);
            showStatusMessage(
                newState ? "Books links hidden" : "Books links shown",
                "success-message"
            );
        } catch (error) {
            showStatusMessage(`Could not save setting: ${error.message}`, "error-message");
        }
    });
});


async function notifyActiveTab(hide) {
    const [activeTab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!activeTab?.id) {
        return;
    }

    try {
        await chrome.tabs.sendMessage(activeTab.id, {
            action: 'toggleBooksLinks',
            hide
        });
    } catch (_error) {
        // The global setting is still saved when the active tab is not a supported Rutgers page.
    }
}


function animateButton(button) {
    button.classList.remove('clicked');
    requestAnimationFrame(() => button.classList.add('clicked'));
    button.addEventListener('animationend', () => button.classList.remove('clicked'), {once: true});
}


function updateToggleButtonState(button, isPressed) {
    button.classList.toggle('pressed', isPressed);
    button.textContent = isPressed ? 'Show Books Links' : 'Hide Books Links';
    button.setAttribute('aria-pressed', String(isPressed));
}


function showStatusMessage(message, messageClass) {
    const statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.classList.remove('success-message', 'error-message');
    statusDiv.classList.add(messageClass);
    statusDiv.style.display = "block";

    if (statusMessageTimeout !== null) {
        clearTimeout(statusMessageTimeout);
    }
    statusMessageTimeout = setTimeout(() => {
        statusDiv.style.display = "none";
        statusMessageTimeout = null;
    }, 2_000);
}
