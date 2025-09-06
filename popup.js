document.getElementById('start').addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'start' });
    document.getElementById('reset').disabled = false; // Enable the "Reset" button
});

document.getElementById('stop').addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'stop' });
    // Optionally decide if the "Reset" button should be enabled or disabled here
});

document.getElementById('reset').addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'reset' });
});

// Listener for messages from the background script to update the timer display
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.timer) {
        document.getElementById('timer').textContent = message.timer;
    }
});