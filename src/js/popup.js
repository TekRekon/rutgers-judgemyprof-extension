console.log("popup.js loaded");


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

function showStatusMessage(message, messageClass) {
    let statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.classList.add(messageClass);
    statusDiv.style.display = "block";
}
